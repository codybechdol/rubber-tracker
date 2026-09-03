/**
 * sheets.js - Interactive Sheet Navigator & Data Grid Renderer
 */

class SheetNavigator {
  constructor(db) {
    this.db = db;
    this.currentSheetKey = 'employees';
    this.searchTerm = '';
    this.sortCol = null;
    this.sortDir = 'asc';
    this.filterSize = 'all';
    this.filterClass = 'all';
    this.filterLocation = 'all';
    this.filterStatus = 'all';
    this.filterCertType = 'all';
    this.filterCertEmployee = 'all';
    this.filterCertStatus = 'all';
    this.filterCertLocation = 'all';
    this.sheetList = [
      { key: 'employees', label: '👥 Employees', icon: '👤', isSwap: false },
      { key: 'job_tracking', label: '📋 Job Tracking', icon: '📋', isSwap: false },
      { key: 'gloves', label: '🧤 Gloves', icon: '🧤', isSwap: false },
      { key: 'glove_swaps', label: '🔄 Glove Swaps', icon: '🔄', isSwap: true },
      { key: 'sleeves', label: '🦺 Sleeves', icon: '🦺', isSwap: false },
      { key: 'sleeve_swaps', label: '🔄 Sleeve Swaps', icon: '🔄', isSwap: true },
      { key: 'blankets', label: '🧱 Blankets', icon: '🧱', isSwap: false },
      { key: 'blanket_swaps', label: '🔄 Blanket Swaps', icon: '🔄', isSwap: true },
      { key: 'macks', label: '🧱 MACKs', icon: '🧱', isSwap: false },
      { key: 'mack_swaps', label: '🔄 MACK Swaps', icon: '🔄', isSwap: true },
      { key: 'hv_testers', label: '⚡ HV Testers', icon: '⚡', isSwap: false },
      { key: 'hv_tester_swaps', label: '🔄 HV Tester Swaps', icon: '🔄', isSwap: true },
      { key: 'phasing_sets', label: '⚡ Phasing Sets', icon: '⚡', isSwap: false },
      { key: 'phasing_set_swaps', label: '🔄 Phasing Set Swaps', icon: '🔄', isSwap: true },
      { key: 'aed', label: '🏥 AED', icon: '🏥', isSwap: false },
      { key: 'aed_swaps', label: '🔄 AED Swaps', icon: '🔄', isSwap: true },
      { key: 'grounds', label: '⚡ Grounds', icon: '⚡', isSwap: false },
      { key: 'ground_swaps', label: '🔄 Ground Swaps', icon: '🔄', isSwap: true },
      { key: 'hot_sticks', label: '🔴 Hot Sticks', icon: '🔴', isSwap: false },
      { key: 'hot_stick_swaps', label: '🔄 Hot Stick Swaps', icon: '🔄', isSwap: true },
      { key: 'dot_drug_tests', label: '🧪 DOT Drug Tests', icon: '🧪', isSwap: false },
      { key: 'drug_test_clinics', label: '🏥 Drug Test Clinics', icon: '🏥', isSwap: false }
    ];
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
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
      const parts = s.split('-');
      const y = parseInt(parts[0], 10);
      const m = parseInt(parts[1], 10) - 1;
      const d = parseInt(parts[2], 10);
      const dt = new Date(y, m, d, 12, 0, 0);
      return isNaN(dt.getTime()) ? null : dt;
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

  init() {
    this.renderTabsBar();
    this.setupSearch();
    this.renderCurrentSheet();
  }

  setSizeFilter(val) {
    this.filterSize = val;
    this.renderCurrentSheet();
  }

  setClassFilter(val) {
    this.filterClass = val;
    this.renderCurrentSheet();
  }

  setLocationFilter(val) {
    this.filterLocation = val;
    this.renderCurrentSheet();
  }

  setStatusFilter(val) {
    this.filterStatus = val;
    this.updateStatusPillUI();
    this.renderCurrentSheet();
  }

  setCertTypeFilter(val) {
    this.filterCertType = val;
    this.renderExpiringCerts();
  }

  setCertEmployeeFilter(val) {
    this.filterCertEmployee = val;
    this.renderExpiringCerts();
  }

  setCertStatusFilter(val) {
    this.filterCertStatus = val;
    this.renderExpiringCerts();
  }

  setCertLocationFilter(val) {
    this.filterCertLocation = val;
    this.renderExpiringCerts();
  }

  resetCertFilters() {
    this.filterCertType = 'all';
    this.filterCertEmployee = 'all';
    this.filterCertStatus = 'all';
    this.filterCertLocation = 'all';
    this.searchTerm = '';
    const sInput = document.getElementById('expiring-certs-search-input');
    if (sInput) sInput.value = '';
    this.renderExpiringCerts();
  }

  updateStatusPillUI() {
    const pills = document.querySelectorAll('#filter-status-pills .filter-pill');
    pills.forEach(p => {
      if (p.dataset.status === this.filterStatus) {
        p.classList.add('active');
      } else {
        p.classList.remove('active');
      }
    });
  }

  resetFilters() {
    this.filterSize = 'all';
    this.filterClass = 'all';
    this.filterLocation = 'all';
    this.filterStatus = 'all';
    this.searchTerm = '';
    const sInput = document.getElementById('sheet-search-input');
    if (sInput) sInput.value = '';
    this.updateStatusPillUI();
    this.renderCurrentSheet();
  }

  renderTabsBar() {
    const bar = document.getElementById('sheet-tabs-bar');
    if (!bar) return;
    bar.innerHTML = '';

    this.sheetList.forEach(sheet => {
      const btn = document.createElement('button');
      btn.className = 'sheet-tab-btn' + (sheet.key === this.currentSheetKey ? ' active' : '');
      btn.innerHTML = `<span>${sheet.icon}</span> ${sheet.label.replace(/^.*? /, '')}`;
      btn.onclick = () => {
        this.currentSheetKey = sheet.key;
        this.filterSize = 'all';
        this.filterClass = 'all';
        this.filterLocation = 'all';
        this.filterStatus = 'all';
        this.searchTerm = '';
        const sInput = document.getElementById('sheet-search-input');
        if (sInput) sInput.value = '';
        if (sheet.key === 'employees') {
          this.multiSort = ['Location', 'Job Number'];
          this.sortCol = null;
        } else if (sheet.key === 'job_tracking') {
          this.multiSort = ['Status', 'Job Number'];
          this.sortCol = null;
        } else if (sheet.key === 'grounds') {
          this.multiSort = ['Type', 'Serial #'];
          this.sortCol = null;
        } else {
          this.sortCol = null;
          this.multiSort = null;
        }
        this.sortDir = 'asc';
        this.renderTabsBar();
        this.renderCurrentSheet();
      };
      bar.appendChild(btn);
    });
  }

  setupSearch() {
    const input = document.getElementById('sheet-search-input');
    if (!input) return;
    input.addEventListener('input', (e) => {
      this.searchTerm = e.target.value.toLowerCase().trim();
      this.renderCurrentSheet();
    });
  }

  openCrewImport() {
    const navItem = document.querySelector('.nav-item[data-view="crew-import-view"]');
    if (navItem) {
      navItem.click();
    }
  }

  renderActiveView() {
    const activeView = document.querySelector('.view-container.active');
    if (activeView) {
      if (activeView.id === 'safety-compliance-view') return this.renderSafetyCompliance();
      if (activeView.id === 'expiring-certs-view') return this.renderExpiringCerts();
      if (activeView.id === 'training-view') return this.renderTraining();
      if (activeView.id === 'previous-employees-view' && window.previousEmployeesEngine) return window.previousEmployeesEngine.renderWorkspace();
      if (activeView.id === 'history-view' && window.historyNavigator) return window.historyNavigator.renderCurrentHistory();
      if (activeView.id === 'trip-planner-view' && window.tripPlanner) return window.tripPlanner.renderPlanner();
      if (activeView.id === 'tasks-view' && window.taskManager) return window.taskManager.renderTasks();
      if (activeView.id === 'lookup-view' && window.lookupApp) return window.lookupApp.init();
    }
    this.renderCurrentSheet();
  }

  setSort(colName) {
    if (this.sortCol === colName) {
      this.sortDir = this.sortDir === 'asc' ? 'desc' : 'asc';
    } else {
      this.sortCol = colName;
      this.sortDir = 'asc';
    }
    this.multiSort = null;
    this.renderActiveView();
  }

  setPresetSort(type) {
    const tableData = this.db.getTable(this.currentSheetKey);
    const headers = tableData ? (tableData.headers || []) : [];

    const findCol = (candidates) => {
      for (const c of candidates) {
        const cLower = c.toLowerCase();
        const found = headers.find(h => {
          const hLower = String(h || '').toLowerCase().trim();
          return hLower === cLower || hLower.startsWith(cLower) || hLower.includes(cLower);
        });
        if (found) return found;
      }
      return candidates[0];
    };

    if (type === 'itemNum') {
      const col = findCol(['glove', 'sleeve', 'blanket', 'mack', 'item #', 'item', 'serial #', 'esl id']);
      if (this.sortCol === col) {
        this.sortDir = this.sortDir === 'asc' ? 'desc' : 'asc';
      } else {
        this.sortCol = col;
        this.sortDir = 'asc';
      }
      this.multiSort = null;
    } else if (type === 'size') {
      const col = findCol(['size']);
      if (this.sortCol === col) {
        this.sortDir = this.sortDir === 'asc' ? 'desc' : 'asc';
      } else {
        this.sortCol = col;
        this.sortDir = 'asc';
      }
      this.multiSort = null;
    } else if (type === 'class') {
      const col = findCol(['class']);
      if (this.sortCol === col) {
        this.sortDir = this.sortDir === 'asc' ? 'desc' : 'asc';
      } else {
        this.sortCol = col;
        this.sortDir = 'asc';
      }
      this.multiSort = null;
    } else if (type === 'classSize') {
      const classCol = findCol(['class']);
      const sizeCol = findCol(['size']);
      if (this.multiSort && this.multiSort[0] === classCol && this.multiSort[1] === sizeCol) {
        this.sortDir = this.sortDir === 'asc' ? 'desc' : 'asc';
      } else {
        this.multiSort = [classCol, sizeCol];
        this.sortCol = null;
        this.sortDir = 'asc';
      }
    } else if (type === 'location') {
      const col = findCol(['location']);
      if (this.sortCol === col) {
        this.sortDir = this.sortDir === 'asc' ? 'desc' : 'asc';
      } else {
        this.sortCol = col;
        this.sortDir = 'asc';
      }
      this.multiSort = null;
    } else if (type === 'status') {
      const col = findCol(['status', 'item status', 'job status', 'training status']);
      if (this.sortCol === col) {
        this.sortDir = this.sortDir === 'asc' ? 'desc' : 'asc';
      } else {
        this.sortCol = col;
        this.sortDir = 'asc';
      }
      this.multiSort = null;
    } else if (type === 'assignedTo') {
      const col = findCol(['assigned to', 'assigned', 'crew lead', 'lead', 'foreman']);
      if (this.sortCol === col) {
        this.sortDir = this.sortDir === 'asc' ? 'desc' : 'asc';
      } else {
        this.sortCol = col;
        this.sortDir = 'asc';
      }
      this.multiSort = null;
    } else if (type === 'changeOutDate') {
      const col = findCol(['change out date', 'change out', 'changeout', 'expiration date', 'expiration', 'exp date']);
      if (this.sortCol === col) {
        this.sortDir = this.sortDir === 'asc' ? 'desc' : 'asc';
      } else {
        this.sortCol = col;
        this.sortDir = 'asc';
      }
      this.multiSort = null;
    } else if (type === 'type' || type === 'typeOHUG') {
      const col = findCol(['type (oh/ug)', 'type(oh/ug)', 'type', 'oh/ug', 'oh / ug', 'ground type', 'item type', 'cert type', 'certification type', 'training topic', 'topic']);
      if (this.sortCol === col) {
        this.sortDir = this.sortDir === 'asc' ? 'desc' : 'asc';
      } else {
        this.sortCol = col;
        this.sortDir = 'asc';
      }
      this.multiSort = null;
    } else if (type === 'typeSerial') {
      const typeCol = findCol(['type (oh/ug)', 'type(oh/ug)', 'type', 'oh/ug', 'oh / ug', 'ground type']);
      const serialCol = findCol(['serial #', 'serial', 'item #', 'item']);
      if (this.multiSort && this.multiSort[0] === typeCol && this.multiSort[1] === serialCol) {
        this.sortDir = this.sortDir === 'asc' ? 'desc' : 'asc';
      } else {
        this.multiSort = [typeCol, serialCol];
        this.sortCol = null;
        this.sortDir = 'asc';
      }
    } else if (type === 'typeSize') {
      const typeCol = findCol(['type (oh/ug)', 'type(oh/ug)', 'type', 'oh/ug', 'oh / ug', 'ground type', 'class']);
      const sizeCol = findCol(['size']);
      if (this.multiSort && this.multiSort[0] === typeCol && this.multiSort[1] === sizeCol) {
        this.sortDir = this.sortDir === 'asc' ? 'desc' : 'asc';
      } else {
        this.multiSort = [typeCol, sizeCol];
        this.sortCol = null;
        this.sortDir = 'asc';
      }
    } else if (type === 'length') {
      const col = findCol(['length', 'len']);
      if (this.sortCol === col) {
        this.sortDir = this.sortDir === 'asc' ? 'desc' : 'asc';
      } else {
        this.sortCol = col;
        this.sortDir = 'asc';
      }
      this.multiSort = null;
    } else if (type === 'testDate') {
      const col = findCol(['test date', 'test', 'cal date', 'calibration date']);
      if (this.sortCol === col) {
        this.sortDir = this.sortDir === 'asc' ? 'desc' : 'asc';
      } else {
        this.sortCol = col;
        this.sortDir = 'asc';
      }
      this.multiSort = null;
    } else if (type === 'month') {
      const col = findCol(['month', 'scheduled month', 'date']);
      if (this.sortCol === col) {
        this.sortDir = this.sortDir === 'asc' ? 'desc' : 'asc';
      } else {
        this.sortCol = col;
        this.sortDir = 'asc';
      }
      this.multiSort = null;
    } else if (type === 'daysLeft') {
      const col = findCol(['days until expiration', 'days until', 'days left', 'days']);
      if (this.sortCol === col) {
        this.sortDir = this.sortDir === 'asc' ? 'desc' : 'asc';
      } else {
        this.sortCol = col;
        this.sortDir = 'asc';
      }
      this.multiSort = null;
    } else if (type === 'kv') {
      const col = findCol(['kv']);
      if (this.sortCol === col) {
        this.sortDir = this.sortDir === 'asc' ? 'desc' : 'asc';
      } else {
        this.sortCol = col;
        this.sortDir = 'asc';
      }
      this.multiSort = null;
    } else if (type === 'jobNumber') {
      const col = findCol(['job number', 'job #', 'crew', 'crew #', 'crew number']);
      if (this.sortCol === col) {
        this.sortDir = this.sortDir === 'asc' ? 'desc' : 'asc';
      } else {
        this.sortCol = col;
        this.sortDir = 'asc';
      }
      this.multiSort = null;
    } else if (type === 'statusJob') {
      const statusCol = findCol(['status', 'job status']);
      const jobCol = findCol(['job number', 'job #']);
      this.multiSort = [statusCol, jobCol];
      this.sortCol = null;
      this.sortDir = 'asc';
    } else if (type === 'locationJob') {
      const locCol = findCol(['location']);
      const jobCol = findCol(['job number', 'job #']);
      this.multiSort = [locCol, jobCol];
      this.sortCol = null;
      this.sortDir = 'asc';
    } else if (type === 'name') {
      const col = findCol(['employee name', 'name', 'employee']);
      if (this.sortCol === col) {
        this.sortDir = this.sortDir === 'asc' ? 'desc' : 'asc';
      } else {
        this.sortCol = col;
        this.sortDir = 'asc';
      }
      this.multiSort = null;
    } else if (type === 'weekStart') {
      const col = findCol(['week start', 'week of', 'week']);
      if (this.sortCol === col) {
        this.sortDir = this.sortDir === 'asc' ? 'desc' : 'asc';
      } else {
        this.sortCol = col;
        this.sortDir = 'desc';
      }
      this.multiSort = null;
    } else if (type === 'foreman') {
      const col = findCol(['foreman', 'crew lead', 'lead']);
      if (this.sortCol === col) {
        this.sortDir = this.sortDir === 'asc' ? 'desc' : 'asc';
      } else {
        this.sortCol = col;
        this.sortDir = 'asc';
      }
      this.multiSort = null;
    }
    this.renderActiveView();
  }

  setComplianceWeek(weekStr) {
    this.selectedComplianceWeek = weekStr;
    this.renderActiveView();
  }

  setComplianceStatus(statusStr) {
    this.selectedComplianceStatus = statusStr;
    this.renderActiveView();
  }

  renderSafetyCompliance() {
    this.currentSheetKey = 'safety_compliance';
    const container = document.getElementById('safety-compliance-grid-container');
    const countBadge = document.getElementById('safety-compliance-row-count');
    const searchInput = document.getElementById('safety-compliance-search-input');
    if (!container) return;

    if (searchInput) {
      this.searchTerm = (searchInput.value || '').toLowerCase().trim();
      if (!searchInput.dataset.bound) {
        searchInput.dataset.bound = 'true';
        searchInput.addEventListener('input', (e) => {
          this.searchTerm = e.target.value.toLowerCase().trim();
          this.renderSafetyCompliance();
        });
      }
    } else {
      this.searchTerm = '';
    }

    const tableData = this.db.getTable(this.currentSheetKey);
    this.renderStandardTable(container, countBadge, tableData);
  }

  async renderExpiringCerts() {
    this.currentSheetKey = 'expiring_certs';
    const container = document.getElementById('expiring-certs-grid-container');
    const countBadge = document.getElementById('expiring-certs-row-count');
    const searchInput = document.getElementById('expiring-certs-search-input');
    if (!container) return;

    // Automatically ensure all active employees have their required certification rows
    if (window.certsConfigEngine && typeof window.certsConfigEngine.applyRequirementsToMatrix === 'function') {
      try {
        await window.certsConfigEngine.applyRequirementsToMatrix(false);
      } catch (e) {
        console.warn('Could not auto-apply cert requirements:', e);
      }
    }

    if (searchInput) {
      this.searchTerm = (searchInput.value || '').toLowerCase().trim();
      if (!searchInput.dataset.bound) {
        searchInput.dataset.bound = 'true';
        searchInput.addEventListener('input', (e) => {
          this.searchTerm = e.target.value.toLowerCase().trim();
          this.renderExpiringCerts();
        });
      }
    } else {
      this.searchTerm = '';
    }

    const tableData = this.db.getTable(this.currentSheetKey);
    this.renderStandardTable(container, countBadge, tableData);
  }

  /**
   * Deletes a specific certification record row from Expiring Certs and syncs change.
   */
  async deleteCertRow(sheetRowIdx) {
    const tableData = this.db.getTable('expiring_certs');
    if (!tableData || !tableData.rows) return;

    let targetIdx = -1;
    if (tableData.rows.some(r => r._rowIdx !== undefined)) {
      targetIdx = tableData.rows.findIndex(r => r._rowIdx === sheetRowIdx);
    }
    if (targetIdx === -1 && sheetRowIdx >= 2) {
      targetIdx = sheetRowIdx - 2;
    }

    const targetRow = tableData.rows[targetIdx];
    if (!targetRow) {
      alert('Could not locate the selected record to delete.');
      return;
    }

    const empName = targetRow['Employee Name'] || targetRow['Name'] || 'this employee';
    const certType = targetRow['Item Type'] || targetRow['Cert Type'] || 'this certification';

    if (!confirm(`Are you sure you want to delete the "${certType}" certification record for ${empName}?`)) {
      return;
    }

    tableData.rows.splice(targetIdx, 1);
    tableData.rows.forEach((r, idx) => {
      r._rowIdx = idx + 2;
    });

    if (tableData.headers) {
      tableData.rawGrid = [tableData.headers];
      tableData.rows.forEach(r => {
        tableData.rawGrid.push(tableData.headers.map(h => r[h] !== undefined ? r[h] : ''));
      });
      tableData.maxRows = tableData.rawGrid.length;
    }
    tableData.rowCount = tableData.rows.length;

    if (this.db && typeof this.db.addMutation === 'function') {
      await this.db.addMutation({
        action: 'REPLACE_TABLE_DATA',
        sheetName: 'Expiring Certs',
        tableKey: 'expiring_certs',
        headers: tableData.headers,
        rows: tableData.rows,
        rawGrid: tableData.rawGrid
      });
    }

    if (typeof this.db.setSnapshot === 'function' && this.db.snapshot) {
      await this.db.setSnapshot(this.db.snapshot);
    }

    this.renderExpiringCerts();
  }

  /**
   * Returns a Set of lowercase normalized names of all departed / previous employees.
   */
  getPreviousEmployeeNamesSet() {
    const prevEmpNames = new Set();
    const empTable = this.db ? this.db.getTable('employees') : null;
    if (empTable && empTable.rows) {
      empTable.rows.forEach(e => {
        const eName = String(e['Employee Name'] || e['Name'] || Object.values(e)[0] || '').toLowerCase().trim();
        const eLoc = String(e['Location'] || '').toLowerCase().trim();
        const eStat = String(e['Status'] || '').toLowerCase().trim();
        const eJob = String(e['Job Number'] || e['Job #'] || '').toLowerCase().trim();
        if (eLoc === 'previous employee' || eLoc.includes('previous') ||
            eStat === 'previous employee' || eStat.includes('inactive') || eStat.includes('terminated') ||
            eJob.includes('previous') || eJob.startsWith('002-') || eName.includes('former')) {
          if (eName) prevEmpNames.add(eName);
        }
      });
    }
    const prevTable = this.db ? this.db.getTable('previous_employees') : null;
    if (prevTable && prevTable.rows) {
      prevTable.rows.forEach(p => {
        const pName = String(p['Employee Name'] || p['Name'] || Object.values(p)[0] || '').toLowerCase().trim();
        if (pName) prevEmpNames.add(pName);
      });
    }
    return prevEmpNames;
  }

  /**
   * Returns true if a table row represents a previous or departed employee.
   */
  isRowPreviousEmployee(r, prevEmpNames) {
    if (!r) return false;
    const eName = String(r['Employee Name'] || r['Name'] || Object.values(r)[0] || '').toLowerCase().trim();
    if (prevEmpNames && prevEmpNames.has(eName)) return true;
    const loc = String(r['Location'] || '').toLowerCase().trim();
    const stat = String(r['Status'] || '').toLowerCase().trim();
    const job = String(r['Job Number'] || r['Job #'] || '').toLowerCase().trim();
    if (loc === 'previous employee' || loc.includes('previous') ||
        stat === 'previous employee' || stat.includes('inactive') || stat.includes('terminated') ||
        job.includes('previous') || job.startsWith('002-') || eName.includes('former')) {
      return true;
    }
    return false;
  }

  /**
   * Initializes all 16 company certification records for all active employees if missing in expiring_certs.
   */
  async ensureAllEmployeeCertsExist(silent = false) {
    if (window.certsConfigEngine && typeof window.certsConfigEngine.applyRequirementsToMatrix === 'function') {
      await window.certsConfigEngine.applyRequirementsToMatrix(!silent);
      this.renderCurrentSheet();
      return;
    }
    if (!this.db) this.db = window.localDB || window.safetyDB;
    if (!this.db) return;

    const empTable = this.db.getTable('employees');
    const certsTable = this.db.getTable('expiring_certs');
    if (!empTable || !certsTable) return;
    const headers = certsTable.headers || ['Employee Name', 'Item Type', 'Date Acquired', 'Expiration Date', 'Location', 'Job #', 'Days Until Expiration', 'Status', 'SMS'];

    const allCertTypes = [
      'DL',
      'MEC Expiration',
      '1st Aid',
      'CPR',
      'Pole Top Rescue',
      'Harassment Training',
      'Crane Cert',
      'Crane Evaluation',
      'OSHA 1910',
      'BNSF',
      'MSHA',
      'OSHA Trench Comp Person',
      'Forklift',
      'Forklift Operator Safety Training',
      'Rigging & Signaling/Signalperson & Spotter Cert',
      'EICA Basic Helicopter Line Construction Safety'
    ];

    const nonExpiringTypes = new Set([
      'Crane Evaluation',
      'OSHA 1910',
      'BNSF',
      'MSHA',
      'OSHA Trench Comp Person',
      'Forklift Operator Safety Training',
      'EICA Basic Helicopter Line Construction Safety'
    ]);

    const normalizeCert = (c) => {
      if (window.certsImportEngine && typeof window.certsImportEngine.normalizeCertKey === 'function') {
        return window.certsImportEngine.normalizeCertKey(c);
      }
      return String(c || '').toLowerCase().trim();
    };

    // Build existing lookup set
    const existingSet = new Set();
    (certsTable.rows || []).forEach(r => {
      const eName = String(r['Employee Name'] || r['Name'] || Object.values(r)[0] || '').toLowerCase().trim();
      const cType = normalizeCert(r['Item Type'] || r['Cert Type'] || r['Type'] || '');
      if (eName && cType) existingSet.add(`${eName}_${cType}`);
    });

    let addedCount = 0;

    for (const emp of (empTable.rows || [])) {
      const empName = String(emp['Employee Name'] || emp['Name'] || Object.values(emp)[0] || '').trim();
      if (!empName) continue;

      const loc = String(emp['Location'] || 'Helena').trim();
      const status = String(emp['Status'] || '').toLowerCase().trim();
      const job = String(emp['Job Number'] || emp['Job #'] || '').trim();
      const locLower = loc.toLowerCase();
      const jobLower = job.toLowerCase();

      // Skip previous/inactive employees
      if (locLower === 'previous employee' || locLower.includes('previous') ||
          status === 'previous employee' || status.includes('inactive') || status.includes('terminated') ||
          jobLower.startsWith('002-') || jobLower.includes('previous')) {
        continue;
      }

      const empLower = empName.toLowerCase().trim();

      for (const cType of allCertTypes) {
        const cTypeNorm = normalizeCert(cType);
        const key = `${empLower}_${cTypeNorm}`;

        if (!existingSet.has(key)) {
          const isNonExp = nonExpiringTypes.has(cType);
          const newRow = {
            'Employee Name': empName,
            'Item Type': cType,
            'Date Acquired': '',
            'Expiration Date': '',
            'Location': loc,
            'Job #': job,
            'Days Until Expiration': '',
            'Status': isNonExp ? 'OK' : 'MISSING',
            'SMS': ''
          };

          certsTable.rows.push(newRow);
          existingSet.add(key);

          if (certsTable.rawGrid) {
            const gridArr = headers.map(h => newRow[h] !== undefined ? newRow[h] : '');
            certsTable.rawGrid.push(gridArr);
            certsTable.maxRows = certsTable.rawGrid.length;
          }

          if (typeof this.db.addMutation === 'function') {
            await this.db.addMutation({
              action: 'ADD_ROW',
              sheetName: 'Expiring Certs',
              tableKey: 'expiring_certs',
              rowData: newRow
            });
          }

          addedCount++;
        }
      }
    }

    if (addedCount > 0) {
      certsTable.rowCount = certsTable.rows.length;
      if (typeof this.db.setSnapshot === 'function' && this.db.snapshot) {
        await this.db.setSnapshot(this.db.snapshot);
      } else if (window.desktopAPI) {
        await window.desktopAPI.saveLocalSnapshot(this.db.snapshot);
      }
      this.renderExpiringCerts();
      if (window.syncEngine && typeof window.syncEngine.renderOutboxBadge === 'function') {
        window.syncEngine.renderOutboxBadge();
      }
      if (!silent) {
        alert(`🎉 Initialized ${addedCount} missing certification record(s) across all active employees!\n\nAll 16 standard certification types are now present and ready to track.`);
      }
    } else {
      if (!silent) {
        alert('✅ All active employees already have all 16 certification types in the system.');
      }
    }
  }

  renderTraining() {
    this.currentSheetKey = 'training_tracking';
    const container = document.getElementById('training-grid-container');
    const countBadge = document.getElementById('training-row-count');
    const searchInput = document.getElementById('training-search-input');
    if (!container) return;

    if (searchInput) {
      this.searchTerm = (searchInput.value || '').toLowerCase().trim();
      if (!searchInput.dataset.bound) {
        searchInput.dataset.bound = 'true';
        searchInput.addEventListener('input', (e) => {
          this.searchTerm = e.target.value.toLowerCase().trim();
          this.renderTraining();
        });
      }
    } else {
      this.searchTerm = '';
    }

    const tableData = this.db.getTable(this.currentSheetKey);
    this.renderStandardTable(container, countBadge, tableData);
  }

  async syncAttendees() {
    if (!confirm('🔄 Synchronize training attendees and crew leads with current active crew rosters?')) return;
    
    const syncUrl = window.syncEngine ? window.syncEngine.getSyncUrl() : '';
    if (!syncUrl) {
      alert('⚠️ Sync URL is not configured in Settings.');
      return;
    }

    const btn = document.getElementById('btn-sync-attendees');
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<span>⏳</span> Syncing...';
    }

    try {
      const res = await fetch(`${syncUrl}?action=syncTrainingAttendees`);
      const json = await res.json();
      if (json && (json.success || json.status === 'ok')) {
        alert('✅ Training attendees and crew leads successfully synchronized with active crew rosters!');
      } else {
        alert('⚠️ Sync response: ' + (json.message || json.error || 'Synced'));
      }
    } catch (err) {
      console.warn('Sync trigger error, performing full sync:', err);
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = '<span>🔄</span> Sync Attendees';
      }
      if (window.syncEngine) {
        await window.syncEngine.syncWithGoogleSheets();
      }
      this.renderTraining();
    }
  }

  renderCurrentSheet() {
    const container = document.getElementById('sheet-grid-container');
    const title = document.getElementById('current-sheet-title');
    const countBadge = document.getElementById('sheet-row-count');
    const searchInput = document.getElementById('sheet-search-input');
    if (!container) return;

    if (searchInput) {
      this.searchTerm = (searchInput.value || '').toLowerCase().trim();
    }

    const tableData = this.db.getTable(this.currentSheetKey);
    const sheetMeta = this.sheetList.find(s => s.key === this.currentSheetKey);
    if (title && sheetMeta) title.textContent = sheetMeta.label;

    // Toggle Action Buttons in Toolbar
    const btnNewItem = document.getElementById('btn-new-item');
    const btnGenSwaps = document.getElementById('btn-generate-swaps');
    const btnFixDates = document.getElementById('btn-fix-changeout-dates');
    const btnReconcileHist = document.getElementById('btn-reconcile-history');
    const btnImportCrews = document.getElementById('btn-import-crews');
    const btnPushClean = document.getElementById('btn-push-clean-sheet');

    const isInventorySheet = !sheetMeta?.isSwap && sheetMeta?.key !== 'employees' && sheetMeta?.key !== 'job_tracking';
    const isSwapSheet = Boolean(sheetMeta?.isSwap);
    const isEmployeeOrJobSheet = sheetMeta?.key === 'employees' || sheetMeta?.key === 'job_tracking';

    if (btnPushClean) {
      btnPushClean.style.display = (tableData && tableData.rows) ? 'inline-block' : 'none';
      if (sheetMeta) {
        btnPushClean.title = `Push full clean ${sheetMeta.label} table directly to Google Sheets`;
      }
    }

    if (btnImportCrews) {
      btnImportCrews.style.display = isEmployeeOrJobSheet ? 'inline-block' : 'none';
    }

    if (btnNewItem) {
      btnNewItem.style.display = isInventorySheet ? 'inline-block' : 'none';
      if (isInventorySheet) {
        btnNewItem.innerHTML = `➕ New ${sheetMeta.label.replace(/^.*? /, '').replace(/s$/, '')}`;
      }
    }

    if (btnGenSwaps) {
      btnGenSwaps.style.display = (isSwapSheet || isInventorySheet) ? 'inline-block' : 'none';
    }

    if (btnFixDates) {
      btnFixDates.style.display = isInventorySheet ? 'inline-block' : 'none';
    }

    if (btnReconcileHist) {
      btnReconcileHist.style.display = (isInventorySheet || isSwapSheet) ? 'inline-block' : 'none';
    }

    // Update dynamic multi-filter bar for inventory sheets
    this.updateFilterBar(tableData, isInventorySheet);

    if (!tableData || (!tableData.rows?.length && !tableData.rawGrid?.length)) {
      container.innerHTML = `
        <div style="padding: 40px; text-align: center; color: var(--text-muted);">
          <div style="font-size: 32px; margin-bottom: 12px;">📂</div>
          <h3 style="color: var(--text-primary); font-size: 16px;">No data loaded for this sheet</h3>
          <p style="margin-top: 8px; font-size: 13px;">Click <strong>"Sync with Google Sheets"</strong> or <strong>"Import Snapshot"</strong> to load your data.</p>
        </div>
      `;
      if (countBadge) countBadge.textContent = '0 rows';
      return;
    }

    // Render swap report sheets
    if (sheetMeta?.isSwap && tableData.rawGrid && tableData.rawGrid.length > 0) {
      this.renderSwapReportGrid(container, countBadge, tableData);
      return;
    }

    // Standard tabular grid renderer (Employees, Gloves, Job Tracking, etc.)
    this.renderStandardTable(container, countBadge, tableData);
  }

  updateFilterBar(tableData, isInventorySheet) {
    const filterBar = document.getElementById('inventory-filter-bar');
    if (!filterBar) return;

    if (!isInventorySheet || !tableData || !tableData.rows || tableData.rows.length === 0) {
      filterBar.style.display = 'none';
      return;
    }

    filterBar.style.display = 'flex';

    // Find columns dynamically
    const headers = tableData.headers || [];
    const sizeCol = headers.find(h => h.toLowerCase() === 'size');
    const classCol = headers.find(h => {
      const hl = h.toLowerCase();
      return hl === 'class' || hl === 'kv' || hl === 'model' || hl === 'type' || hl.includes('type') || hl.includes('oh/ug');
    });
    const locCol = headers.find(h => h.toLowerCase() === 'location');

    // 1. Size Dropdown
    const sizeGroup = document.getElementById('filter-group-size');
    const sizeSelect = document.getElementById('filter-size-select');
    if (sizeGroup && sizeSelect) {
      if (sizeCol) {
        sizeGroup.style.display = 'flex';
        const sizeCounts = {};
        tableData.rows.forEach(r => {
          const s = String(r[sizeCol] || '').trim();
          if (s && s !== 'N/A' && s !== '—' && s !== '-') {
            sizeCounts[s] = (sizeCounts[s] || 0) + 1;
          }
        });
        const sortedSizes = Object.keys(sizeCounts).sort((a, b) => {
          const numA = parseFloat(a);
          const numB = parseFloat(b);
          if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
          return a.localeCompare(b, undefined, { numeric: true });
        });

        let opts = `<option value="all">All Sizes (${tableData.rows.length})</option>`;
        sortedSizes.forEach(s => {
          opts += `<option value="${this.escapeHtml(s)}">${this.escapeHtml(s)} (${sizeCounts[s]})</option>`;
        });
        sizeSelect.innerHTML = opts;
        sizeSelect.value = this.filterSize;
      } else {
        sizeGroup.style.display = 'none';
      }
    }

    // 2. Class / KV / Type Dropdown
    const classGroup = document.getElementById('filter-group-class');
    const classSelect = document.getElementById('filter-class-select');
    const classLabel = document.getElementById('filter-class-label');
    if (classGroup && classSelect) {
      if (classCol) {
        classGroup.style.display = 'flex';
        if (classLabel) {
          const clLower = classCol.toLowerCase();
          if (clLower.includes('oh/ug') || clLower === 'type' || clLower.includes('type')) {
            classLabel.textContent = (this.currentSheetKey === 'grounds' ? 'Type (OH/UG):' : 'Type:');
          } else if (clLower === 'kv') {
            classLabel.textContent = 'KV:';
          } else if (clLower === 'model') {
            classLabel.textContent = 'Model:';
          } else {
            classLabel.textContent = 'Class:';
          }
        }
        const classCounts = {};
        tableData.rows.forEach(r => {
          const c = String(r[classCol] || '').trim();
          if (c && c !== 'N/A' && c !== '—' && c !== '-') {
            classCounts[c] = (classCounts[c] || 0) + 1;
          }
        });
        const sortedClasses = Object.keys(classCounts).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

        let opts = `<option value="all">All (${tableData.rows.length})</option>`;
        sortedClasses.forEach(c => {
          opts += `<option value="${this.escapeHtml(c)}">${this.escapeHtml(c)} (${classCounts[c]})</option>`;
        });
        classSelect.innerHTML = opts;
        classSelect.value = this.filterClass;
      } else {
        classGroup.style.display = 'none';
      }
    }

    // 3. Location Dropdown
    const locGroup = document.getElementById('filter-group-location');
    const locSelect = document.getElementById('filter-location-select');
    if (locGroup && locSelect) {
      if (locCol) {
        locGroup.style.display = 'flex';
        const locCounts = {};
        tableData.rows.forEach(r => {
          const l = String(r[locCol] || '').trim();
          if (l && l !== 'N/A' && l !== '—' && l !== '-') {
            locCounts[l] = (locCounts[l] || 0) + 1;
          }
        });
        const sortedLocs = Object.keys(locCounts).sort((a, b) => a.localeCompare(b));

        let opts = `<option value="all">All Locations (${tableData.rows.length})</option>`;
        sortedLocs.forEach(l => {
          opts += `<option value="${this.escapeHtml(l)}">${this.escapeHtml(l)} (${locCounts[l]})</option>`;
        });
        locSelect.innerHTML = opts;
        locSelect.value = this.filterLocation;
      } else {
        locGroup.style.display = 'none';
      }
    }

    // 4. Update status pills UI
    this.updateStatusPillUI();

    // 5. Clear button visibility
    const btnClear = document.getElementById('btn-clear-filters');
    const isFiltered = (this.filterSize !== 'all' || this.filterClass !== 'all' || this.filterLocation !== 'all' || this.filterStatus !== 'all' || Boolean(this.searchTerm));
    if (btnClear) {
      btnClear.style.display = isFiltered ? 'inline-flex' : 'none';
    }
  }

  renderSwapReportGrid(container, countBadge, tableData) {
    const grid = tableData.rawGrid;
    if (!grid || grid.length === 0) return;

    // Find the primary subheader row to identify visible columns and labels (Col A-J max 10 columns)
    let visibleColIndices = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
    let colLabels = ['Employee', 'Current Item #', 'Size', 'Date Assigned', 'Change Out Date', 'Days Left', 'Pick List Item #', 'Status', 'Picked', 'Date Changed'];

    for (let r = 0; r < Math.min(grid.length, 10); r++) {
      const row = grid[r];
      const r0 = String(row?.[0] || '').trim();
      const r1 = String(row?.[1] || '').trim();
      const r3 = String(row?.[3] || '').trim();
      if (row && (r0 === 'Employee' || r0.includes('Employee') || r1.includes('Current') || r1.includes('Serial') || r3.includes('Current') || r3.includes('Serial') || r3.includes('Date') || r3.includes('KV'))) {
        const detected = [];
        const detectedLabels = [];
        for (let c = 0; c < 15; c++) {
          const val = String(row[c] || '').trim();
          if (val || c === 0) {
            detected.push(c);
            detectedLabels.push(val || (c === 0 ? 'Employee' : `Col ${c+1}`));
            // Stop once Date Changed is reached (hides Stage 1 helper columns at Col K/L)
            if (val.toLowerCase().includes('date changed') || val.toLowerCase().includes('changed')) {
              break;
            }
          }
        }
        if (detected.length >= 5) {
          visibleColIndices = detected;
          colLabels = detectedLabels;
          break;
        }
      }
    }

    let html = `<table class="data-table"><thead><tr>`;

    colLabels.forEach((label) => {
      html += `<th>${this.escapeHtml(label)}</th>`;
    });
    html += `</tr></thead><tbody>`;

    let visibleRowCount = 0;
    let currentSection = 'standard';

    grid.forEach((rowArr, rowIdx) => {
      const hasContent = visibleColIndices.some(c => String(rowArr[c] || '').trim() !== '');
      if (!hasContent) return;

      const firstCell = String(rowArr[0] || '').trim();

      // Suppress stray Stage 1-3 floating subheadings (e.g. Row 2-3 with STAGE 1 / Status Check)
      if (!firstCell && rowArr.some(c => {
        const str = String(c || '').toUpperCase();
        return str.includes('STAGE 1') || str.includes('STAGE 2') || str.includes('STAGE 3') || str.includes('STATUS CHECK');
      })) {
        return;
      }

      const isSubHeader = firstCell === 'Employee' || (rowArr[3] && String(rowArr[3]).includes('Current'));

      // Check if this row is an actual employee data row or a header/banner
      const hasItemData = Boolean(
        String(rowArr[1] || '').trim() ||
        String(rowArr[2] || '').trim() ||
        String(rowArr[3] || '').trim() ||
        String(rowArr[4] || '').trim() ||
        String(rowArr[5] || '').trim() ||
        String(rowArr[6] || '').trim() ||
        String(rowArr[7] || '').trim()
      );

      // Level 1: Main Section Headers
      const isClassHeader = firstCell.includes('Class ') && (firstCell.includes('Swaps') || firstCell.includes('Sleeves') || firstCell.includes('Blankets') || firstCell.includes('MACKs'));
      const isPrevEmpHeader = firstCell.includes('Previous Employee');
      const isClassReclaimHeader = firstCell.includes('Class Reclaims');
      const isLostHeader = (firstCell.includes('Lost ') && firstCell.includes('Locate')) || firstCell.includes('Lost Glove') || firstCell.includes('Lost Sleeve') || firstCell.includes('Lost Blanket') || firstCell.includes('Lost MACK');

      if (isClassHeader) currentSection = 'class';
      else if (isPrevEmpHeader) currentSection = 'prev_emp';
      else if (isClassReclaimHeader) currentSection = 'class_reclaim';
      else if (isLostHeader) currentSection = 'lost';

      // Level 3: Foreman / Crew Lead Header
      const isForemanHeader = !isSubHeader && (
        firstCell.includes('👤') ||
        firstCell.includes('👷') ||
        firstCell.toLowerCase().includes('foreman') ||
        (String(rowArr[0] || '').startsWith('   ') && !hasItemData)
      );

      // Level 2: Location Header
      const isCityHeader = !isSubHeader && !isForemanHeader && (
        firstCell.includes('📍') ||
        firstCell.includes('🔍') ||
        firstCell.toLowerCase().includes('location') ||
        (!hasItemData && !isClassHeader && !isPrevEmpHeader && !isClassReclaimHeader && !isLostHeader)
      );

      if (this.searchTerm) {
        const rowMatches = visibleColIndices.some(c => 
          String(rowArr[c] || '').toLowerCase().includes(this.searchTerm)
        );
        if (!rowMatches && !isClassHeader && !isPrevEmpHeader && !isClassReclaimHeader && !isLostHeader && !isCityHeader && !isForemanHeader) return;
      }

      visibleRowCount++;
      html += `<tr>`;

      const colSpan = visibleColIndices.length;

      // 1. Level 1: Main Section Headers (Primary Banner)
      if (isClassHeader) {
        html += `<td colspan="${colSpan}" style="font-size: 13.5px; font-weight: 800; color: #93c5fd; background: linear-gradient(90deg, #1e3a8a 0%, #0f172a 100%); padding: 9px 14px; text-align: left; border-top: 2px solid #3b82f6; border-bottom: 2px solid #3b82f6; letter-spacing: 0.5px; text-transform: uppercase;">${this.escapeHtml(firstCell)}</td></tr>`;
        return;
      }

      if (isPrevEmpHeader) {
        html += `<td colspan="${colSpan}" style="font-size: 13.5px; font-weight: 800; color: #fca5a5; background: linear-gradient(90deg, #7f1d1d 0%, #0f172a 100%); padding: 9px 14px; text-align: left; border-top: 2px solid #ef4444; border-bottom: 2px solid #ef4444; letter-spacing: 0.5px; text-transform: uppercase;">${this.escapeHtml(firstCell)}</td></tr>`;
        return;
      }

      if (isClassReclaimHeader) {
        html += `<td colspan="${colSpan}" style="font-size: 13.5px; font-weight: 800; color: #fdba74; background: linear-gradient(90deg, #7c2d12 0%, #0f172a 100%); padding: 9px 14px; text-align: left; border-top: 2px solid #f97316; border-bottom: 2px solid #f97316; letter-spacing: 0.5px; text-transform: uppercase;">${this.escapeHtml(firstCell)}</td></tr>`;
        return;
      }

      if (isLostHeader) {
        html += `<td colspan="${colSpan}" style="font-size: 13.5px; font-weight: 800; color: #fde047; background: linear-gradient(90deg, #713f12 0%, #0f172a 100%); padding: 9px 14px; text-align: left; border-top: 2px solid #eab308; border-bottom: 2px solid #eab308; letter-spacing: 0.5px; text-transform: uppercase;">${this.escapeHtml(firstCell)}</td></tr>`;
        return;
      }

      // 2. Level 2: Location Header (Clear & Distinct, Subordinate to Main Class Header)
      if (isCityHeader) {
        let cleanCity = firstCell.replace(/^[📍🔍\s]+/, '').trim();
        html += `<td colspan="${colSpan}" style="font-size: 12.5px; font-weight: 700; color: #c7d2fe; background: linear-gradient(90deg, rgba(99, 102, 241, 0.16) 0%, rgba(15, 23, 42, 0.6) 100%); padding: 7px 14px; text-align: left; border-left: 4px solid #6366f1; border-top: 1px solid rgba(99, 102, 241, 0.2); border-bottom: 1px solid rgba(99, 102, 241, 0.2);">
          <span style="font-size: 13px; margin-right: 6px;">📍</span>
          <span style="letter-spacing: 0.3px;">${this.escapeHtml(cleanCity || firstCell)}</span>
        </td></tr>`;
        return;
      }

      // 3. Level 3: Foreman / Crew Lead Header (Subtle & Indented, Subordinate to Location)
      if (isForemanHeader) {
        let cleanForeman = firstCell.replace(/^[👤👷\s]+/, '').trim();
        html += `<td colspan="${colSpan}" style="font-size: 11.5px; font-weight: 600; color: #f472b6; background-color: rgba(255, 255, 255, 0.02); padding: 5px 12px 5px 32px; text-align: left; border-left: 2px solid rgba(244, 114, 182, 0.4); border-bottom: 1px solid rgba(255, 255, 255, 0.04);">
          <span style="font-size: 12px; margin-right: 5px; opacity: 0.9;">👤</span>
          <span style="color: var(--text-secondary); font-size: 11px; margin-right: 4px;">Foreman:</span>
          <span style="font-weight: 700; color: #f472b6;">${this.escapeHtml(cleanForeman || firstCell)}</span>
        </td></tr>`;
        return;
      }

      // 4. Subheader (Table column names)
      if (isSubHeader) {
        visibleColIndices.forEach((c, idx) => {
          let val = rowArr[c] !== undefined ? String(rowArr[c]).trim() : '';
          html += `<td style="font-weight: 700; color: #93c5fd; background-color: #1e293b; font-size: 12px; text-align: center; border-bottom: 1px solid var(--border-color);">${this.escapeHtml(val)}</td>`;
        });
        html += `</tr>`;
        return;
      }

      // If this row is in the Lost Items section, verify if the item is still lost
      if (currentSection === 'lost') {
        const itemNum = String(rowArr[1] || '').trim();
        if (itemNum && itemNum !== '—' && itemNum !== '-') {
          let invSheetKey = 'gloves';
          const sNameLower = String(tableData.name || '').toLowerCase();
          if (sNameLower.includes('sleeve')) invSheetKey = 'sleeves';
          else if (sNameLower.includes('blanket')) invSheetKey = 'blankets';
          else if (sNameLower.includes('mack')) invSheetKey = 'macks';

          const invTable = this.db.getTable(invSheetKey);
          if (invTable && invTable.rows) {
            const invItem = invTable.rows.find(r => {
              const itemKeys = Object.keys(r);
              const firstKey = itemKeys[0] || 'Item #';
              const iNum = String(r['Item #'] || r['Glove'] || r['Sleeve'] || r['Blanket'] || r['ESL ID'] || r['Serial #'] || r[firstKey] || '').trim();
              const esl = String(r['ESL ID'] || '').trim();
              return iNum === itemNum || esl === itemNum;
            });
            if (invItem) {
              const statLower = String(invItem['Status'] || '').toLowerCase();
              const locLower = String(invItem['Location'] || '').toLowerCase();
              const assignedLower = String(invItem['Assigned To'] || '').toLowerCase();
              const notesUpper = String(invItem['Notes'] || '').toUpperCase();
              const isStillLost = statLower === 'lost' || locLower === 'lost' || assignedLower === 'lost' || notesUpper.includes('LOST-LOCATE') || notesUpper.includes('LOST LOCATE');
              if (!isStillLost) {
                // Item is located! Skip rendering in Lost section
                return;
              }
            }
          }
        }
      }

      visibleColIndices.forEach((c, idx) => {
        let val = rowArr[c] !== undefined ? String(rowArr[c]).trim() : '';
        let cellStyle = 'text-align: center;';
        let customContent = null;
        let isCellEditable = false;
        const colLabel = colLabels[idx] || '';

        if (isSubHeader) {
          cellStyle = 'font-weight: 700; color: #93c5fd; background-color: #1e293b; font-size: 12px; text-align: center;';
          customContent = this.escapeHtml(val);
        } else {
          const colLower = colLabel.toLowerCase().trim();
          const isPickedCol = colLower === 'picked';
          const isStatusCol = colLower === 'status';

          if (isPickedCol) {
            const isChecked = (val === 'TRUE' || val === 'true' || val === true);
            customContent = `<span style="cursor: pointer; font-size: 14px;" data-toggle-checkbox="${rowIdx + 1}" data-col="${c + 1}" data-sheet="${this.escapeHtml(tableData.name)}" data-header="${this.escapeHtml(colLabel)}">${isChecked ? '☑️' : '⬜'}</span>`;
          } else if (isStatusCol) {
            let vLower = val.toLowerCase().trim();

            // Self-healing / section detection for Previous Employee rows:
            const isPrevEmpRow = currentSection === 'prev_emp' || String(rowArr[5] || '').toUpperCase().includes('PREV EMP');
            if (isPrevEmpRow) {
              // Enforce Pick List Item # (column index 6) is ALWAYS '—' for previous employees!
              if (rowArr[6] !== '—') {
                rowArr[6] = '—';
                if (tableData.rawGrid && tableData.rawGrid[rowIdx]) {
                  tableData.rawGrid[rowIdx][6] = '—';
                }
                if (tableData.rows && tableData.rows[rowIdx - 1]) {
                  tableData.rows[rowIdx - 1]['Pick List Item #'] = '—';
                }
              }

              const pVal = String(rowArr[8] || '').trim().toUpperCase();
              const isChecked = (pVal === 'TRUE' || pVal === '1' || rowArr[8] === true);
              const dVal = String(rowArr[9] || '').trim();
              if (dVal && !dVal.includes('Stock') && !dVal.includes('Ready')) {
                val = 'Packed For Testing';
                vLower = 'packed for testing';
              } else if (isChecked) {
                val = 'Ready For Test';
                vLower = 'ready for test';
              } else {
                val = 'Return to Shelf';
                vLower = 'return to shelf';
              }
              if (tableData.rawGrid && tableData.rawGrid[rowIdx]) {
                tableData.rawGrid[rowIdx][c] = val;
              }
            }

            if (vLower === 'return to shelf' || vLower.includes('return to shelf') || vLower.includes('return')) {
              customContent = `<span class="badge" style="background-color: #475569; color: #fff; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 600;">↩️ Return to Shelf</span>`;
            } else if (vLower === 'packed for testing' || vLower.includes('packed for testing')) {
              customContent = `<span class="badge" style="background-color: #4f46e5; color: #fff; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 600;">🔬 Packed For Testing</span>`;
            } else if (vLower === 'ready for test' || vLower.includes('ready for test')) {
              customContent = `<span class="badge" style="background-color: #6366f1; color: #fff; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 600;">🔬 Ready For Test</span>`;
            } else if (vLower === 'ready for delivery' || vLower.includes('ready for delivery') || vLower.includes('delivery') || val.includes('🚚')) {
              customContent = `<span class="badge" style="background-color: #15803d; color: #fff; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 600;">🚚 ${this.escapeHtml(val)}</span>`;
            } else if (vLower === 'assigned' || vLower.includes('assigned') || vLower.includes('delivered') || vLower.includes('complete') || val.includes('✅')) {
              customContent = `<span class="badge" style="background-color: #16a34a; color: #fff; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 700;">✅ ${this.escapeHtml(val)}</span>`;
            } else if (vLower === 'in stock' || vLower.includes('in stock') || val.includes('📦')) {
              customContent = `<span class="badge" style="background-color: #0369a1; color: #fff; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 600;">📦 ${this.escapeHtml(val)}</span>`;
            } else if (vLower === 'overdue' || vLower.includes('overdue')) {
              customContent = `<span class="badge" style="background-color: #b91c1c; color: #fff; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 700;">⚠️ OVERDUE</span>`;
            } else if (vLower === 'need to purchase' || vLower.includes('purchase')) {
              customContent = `<span class="badge" style="background-color: #b45309; color: #fff; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 600;">🛒 ${this.escapeHtml(val)}</span>`;
            } else if (vLower.includes('locate')) {
              customContent = `<span class="badge" style="background-color: #d97706; color: #fff; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 600;">🔍 ${this.escapeHtml(val)}</span>`;
            } else {
              customContent = this.escapeHtml(val);
            }
          } else {
            let displayVal = (val === 'FALSE' || val === 'false') ? '' : val;
            const isDateChangedCol = colLower.includes('changed');
            if (isDateChangedCol && (displayVal.includes('Stock') || displayVal.includes('Ready'))) {
              displayVal = ''; // Clean up any old stray status text in Date Changed
              if (tableData.rawGrid && tableData.rawGrid[rowIdx]) {
                tableData.rawGrid[rowIdx][c] = '';
              }
            }
            const isReadOnly = colLower.includes('change out') || colLower.includes('days');
            isCellEditable = !isReadOnly;
            
            const isEmployeeCol = (c === 0 || colLower === 'employee');
            if (isEmployeeCol && displayVal && !displayVal.includes('STAGE') && !displayVal.includes('Class ') && !displayVal.includes('Previous Employee')) {
              customContent = `<span style="font-weight: 700; color: #60a5fa; cursor: pointer; text-decoration: underline dotted;" title="Click to view full profile, assignments & certs for ${this.escapeHtml(displayVal)}" onclick="if(window.employeeProfileEngine){window.employeeProfileEngine.openProfileModal('${this.escapeJs(displayVal)}');}">👤 ${this.escapeHtml(displayVal)}</span>`;
              isCellEditable = false;
            } else {
              customContent = this.escapeHtml(displayVal);
            }
          }
        }

        html += `<td class="${isCellEditable ? 'editable' : ''}" 
                     contenteditable="${isCellEditable}" 
                     style="${cellStyle}"
                     data-row="${rowIdx + 1}" 
                     data-col="${c + 1}" 
                     data-header="${this.escapeHtml(colLabel)}"
                     data-sheet="${this.escapeHtml(tableData.name)}">${customContent}</td>`;
      });
      html += `</tr>`;
    });

    html += `</tbody></table>`;
    container.innerHTML = html;
    if (countBadge) countBadge.textContent = `${visibleRowCount} rows`;

    // Attach inline edit handlers for swap reports
    container.querySelectorAll('td.editable').forEach(td => {
      let initialVal = '';
      td.addEventListener('focus', (e) => {
        initialVal = e.target.textContent.trim();
      });

      td.addEventListener('blur', async (e) => {
        const newVal = e.target.textContent.trim();
        if (newVal === initialVal) return; // No change made!

        const sheetName = e.target.dataset.sheet;
        const row = parseInt(e.target.dataset.row, 10);
        const col = parseInt(e.target.dataset.col, 10);
        const header = e.target.dataset.header;

        // Update in-memory grid
        if (tableData.rawGrid && tableData.rawGrid[row - 1]) {
          tableData.rawGrid[row - 1][col - 1] = newVal;
        }

        await this.db.addMutation({
          action: 'UPDATE_CELL',
          sheetName: sheetName,
          row: row,
          col: col,
          header: header,
          oldValue: initialVal,
          value: newVal
        });

        // If this is a Swap sheet and Date Changed was edited, trigger Stage 3
        if (window.swapEngine && this.currentSheetKey.includes('_swaps') && header && header.toLowerCase().includes('changed')) {
          await window.swapEngine.handleDateChangedEdit(this.currentSheetKey, row - 1, newVal);
        }

        // Re-render swap grid if Date Changed was edited to update status pill immediately
        if (header && (header.toLowerCase().includes('changed') || header.toLowerCase().includes('date'))) {
          this.renderCurrentSheet();
        }
      });

      td.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          e.target.blur();
        }
      });
    });

    // Attach checkbox toggle handlers for swap reports
    container.querySelectorAll('[data-toggle-checkbox]').forEach(cb => {
      cb.addEventListener('click', async (e) => {
        const span = e.currentTarget;
        const sheetName = span.dataset.sheet;
        const row = parseInt(span.dataset.toggleCheckbox, 10);
        const col = parseInt(span.dataset.col, 10);
        const header = span.dataset.header;
        const isCurrentlyChecked = span.textContent === '☑️';
        const newBool = !isCurrentlyChecked;

        span.textContent = newBool ? '☑️' : '⬜';

        // Update in-memory grid
        if (tableData.rawGrid && tableData.rawGrid[row - 1]) {
          tableData.rawGrid[row - 1][col - 1] = newBool ? 'TRUE' : 'FALSE';
        }

        await this.db.addMutation({
          action: 'UPDATE_CELL',
          sheetName: sheetName,
          row: row,
          col: col,
          header: header,
          value: newBool
        });

        // Trigger Stage 1 / Stage 2 in swapEngine
        if (window.swapEngine && this.currentSheetKey.includes('_swaps')) {
          await window.swapEngine.handlePickCheckboxToggle(this.currentSheetKey, row - 1, newBool);
        }

        // Re-render swap grid to update status pill
        this.renderCurrentSheet();
      });
    });
  }

  renderStandardTable(container, countBadge, tableData) {
    if (!tableData) {
      tableData = this.db.getTable(this.currentSheetKey) || { headers: [], rows: [] };
    }
    const headers = tableData.headers || [];
    let rows = [...(tableData.rows || [])];

    if (!headers.length && !rows.length) {
      const sheetName = tableData.name || (this.currentSheetKey === 'safety_compliance' ? 'Safety Compliance' : (this.currentSheetKey === 'expiring_certs' ? 'Expiring Certs' : (this.currentSheetKey === 'training_tracking' ? 'Training Tracking' : 'this sheet')));
      container.innerHTML = `
        <div style="padding: 40px; text-align: center; color: var(--text-muted);">
          <div style="font-size: 32px; margin-bottom: 12px;">📂</div>
          <h3 style="color: var(--text-primary); font-size: 16px;">No records loaded for ${this.escapeHtml(sheetName)}</h3>
          <p style="margin-top: 8px; font-size: 13px;">Click <strong>"Sync with Google Sheets"</strong> or <strong>"Import Snapshot"</strong> in the top right to download or load your data.</p>
        </div>
      `;
      if (countBadge) countBadge.textContent = '0 rows';
      return;
    }

    // Search filter
    if (this.searchTerm) {
      const term = this.searchTerm;
      const isNumSearch = /^\d+$/.test(term);
      const parsedSearchNum = isNumSearch ? parseInt(term, 10) : null;

      rows = rows.filter(row => {
        return Object.values(row).some(val => {
          if (val === null || val === undefined) return false;
          const strVal = String(val).toLowerCase().trim();
          if (strVal.includes(term)) return true;
          if (isNumSearch && /^\d+$/.test(strVal)) {
            return parseInt(strVal, 10) === parsedSearchNum;
          }
          return false;
        });
      });
    }

    // Filter out previous/inactive employees from active Employees sheet (managed exclusively in Previous Employees workspace)
    if (this.currentSheetKey === 'employees') {
      rows = rows.filter(r => {
        const loc = String(r['Location'] || '').toLowerCase().trim();
        const stat = String(r['Status'] || '').toLowerCase().trim();
        const isPrev = loc === 'previous employee' || loc.includes('previous') ||
                       stat === 'previous employee' || stat.includes('inactive') || stat.includes('terminated');
        return !isPrev;
      });
    }

    // Filter out previous/inactive employees from active Expiring Certs page (archived on profile in Previous Employees workspace)
    if (this.currentSheetKey === 'expiring_certs') {
      const prevEmpNames = this.getPreviousEmployeeNamesSet();
      rows = rows.filter(r => !this.isRowPreviousEmployee(r, prevEmpNames));
    }

    // Multi-criteria filtering for inventory sheets
    const isInventorySheet = ['gloves', 'sleeves', 'blankets', 'macks', 'hv_testers', 'phasing_sets', 'aed', 'grounds', 'hot_sticks'].includes(this.currentSheetKey);

    if (isInventorySheet) {
      // 1. Size Filter
      if (this.filterSize && this.filterSize !== 'all') {
        const targetSize = this.filterSize.toLowerCase();
        rows = rows.filter(r => String(r['Size'] || '').trim().toLowerCase() === targetSize);
      }

      // 2. Class / KV / Model / Type Filter
      if (this.filterClass && this.filterClass !== 'all') {
        const targetClass = this.filterClass.toLowerCase();
        rows = rows.filter(r => {
          const cVal = String(r['Class'] || r['KV'] || r['Model'] || r['Type'] || r['Type (OH/UG)'] || r['Type(OH/UG)'] || '').trim().toLowerCase();
          return cVal === targetClass;
        });
      }

      // 3. Location Filter
      if (this.filterLocation && this.filterLocation !== 'all') {
        const targetLoc = this.filterLocation.toLowerCase();
        rows = rows.filter(r => String(r['Location'] || '').trim().toLowerCase() === targetLoc);
      }

      // 4. Status Filter
      if (this.filterStatus && this.filterStatus !== 'all') {
        const now = new Date().getTime();
        rows = rows.filter(r => {
          const stat = String(r['Status'] || '').trim().toLowerCase();
          const assigned = String(r['Assigned To'] || '').trim().toLowerCase();
          const chgOutStr = String(r['Change Out Date'] || r['Pad Expiration'] || '').trim();

          if (this.filterStatus === 'on_shelf') {
            return stat === 'on shelf' || assigned === 'on shelf';
          }
          if (this.filterStatus === 'assigned') {
            return (stat === 'assigned' || stat === 'in service' || stat === 'active') &&
                   assigned !== 'on shelf' && assigned !== 'in testing' && assigned !== 'failed rubber' &&
                   assigned !== 'lost' && assigned !== 'ready for test';
          }
          if (this.filterStatus === 'in_testing') {
            return stat === 'in testing' || assigned === 'in testing' || stat === 'ready for test' || assigned === 'packed for testing';
          }
          if (this.filterStatus === 'ready_delivery') {
            return stat === 'ready for delivery' || assigned === 'packed for delivery';
          }
          if (this.filterStatus === 'expiring_soon' || this.filterStatus === 'overdue') {
            if (!chgOutStr || chgOutStr === 'N/A') return false;
            let dTime = NaN;
            if (chgOutStr.includes('/')) {
              const p = chgOutStr.split('/');
              if (p.length === 3) dTime = new Date(parseInt(p[2], 10), parseInt(p[0], 10) - 1, parseInt(p[1], 10), 12, 0, 0).getTime();
            } else if (/^\d{4}-\d{2}-\d{2}$/.test(chgOutStr)) {
              const p = chgOutStr.split('-');
              dTime = new Date(parseInt(p[0], 10), parseInt(p[1], 10) - 1, parseInt(p[2], 10), 12, 0, 0).getTime();
            }
            if (isNaN(dTime)) return false;
            const daysLeft = (dTime - now) / (1000 * 60 * 60 * 24);
            if (this.filterStatus === 'expiring_soon') return daysLeft >= 0 && daysLeft <= 30;
            if (this.filterStatus === 'overdue') return daysLeft < 0;
          }
          return true;
        });
      }
    }

    // Multi-criteria filtering for Expiring Certs
    if (this.currentSheetKey === 'expiring_certs') {
      // 1. Employee Filter
      if (this.filterCertEmployee && this.filterCertEmployee !== 'all') {
        const targetEmp = this.filterCertEmployee.toLowerCase().trim();
        rows = rows.filter(r => {
          const eName = String(r['Employee Name'] || r['Name'] || '').toLowerCase().trim();
          return eName === targetEmp;
        });
      }

      // 2. Certification Type Filter
      if (this.filterCertType && this.filterCertType !== 'all') {
        if (this.filterCertType === 'expiring_soon') {
          rows = rows.filter(r => {
            const stat = String(r['Status'] || '').toUpperCase().trim();
            const days = parseFloat(r['Days Until Expiration'] || r['Days Until'] || '');
            return stat === 'CRITICAL' || stat === 'WARNING' || stat === 'UPCOMING' || stat === 'EXPIRED' || (!isNaN(days) && days <= 90);
          });
        } else if (this.filterCertType === 'crane_all') {
          rows = rows.filter(r => String(r['Item Type'] || '').toLowerCase().includes('crane'));
        } else if (this.filterCertType === 'forklift_all') {
          rows = rows.filter(r => String(r['Item Type'] || '').toLowerCase().includes('forklift'));
        } else if (this.filterCertType === 'osha_all') {
          rows = rows.filter(r => {
            const t = String(r['Item Type'] || '').toLowerCase();
            return t.includes('osha') || t.includes('trench') || t.includes('bnsf') || t.includes('msha');
          });
        } else {
          const targetType = this.filterCertType.toLowerCase().trim();
          rows = rows.filter(r => {
            const cType = String(r['Item Type'] || r['Cert Type'] || r['Type'] || '').toLowerCase().trim();
            return cType === targetType || cType.includes(targetType);
          });
        }
      }

      // 3. Status Filter
      if (this.filterCertStatus && this.filterCertStatus !== 'all') {
        const targetStat = this.filterCertStatus.toUpperCase().trim();
        rows = rows.filter(r => {
          const stat = String(r['Status'] || '').toUpperCase().trim();
          if (targetStat === 'EXPIRED') return stat === 'EXPIRED';
          if (targetStat === 'CRITICAL') return stat === 'CRITICAL';
          if (targetStat === 'WARNING') return stat === 'WARNING';
          if (targetStat === 'UPCOMING') return stat === 'UPCOMING';
          if (targetStat === 'OK') return stat === 'OK';
          if (targetStat === 'MISSING') return stat === 'MISSING' || stat === 'NEED COPY' || !r['Expiration Date'];
          return stat.includes(targetStat);
        });
      }

      // 4. Location Filter
      if (this.filterCertLocation && this.filterCertLocation !== 'all') {
        const targetLoc = this.filterCertLocation.toLowerCase().trim();
        rows = rows.filter(r => String(r['Location'] || '').toLowerCase().trim() === targetLoc);
      }
    }

    // Custom status ranking for Job Tracking, Inventory, Expiring Certs, Training
    const statusRank = {
      // Inventory / Jobs
      'in service': 1,
      'assigned': 1,
      'active': 1,
      'ready for delivery': 2,
      'pending start': 2,
      'on shelf': 3,
      'on hold': 3,
      'ready for test': 4,
      'in testing': 5,
      'in calibration': 5,
      'failed rubber': 6,
      'failed': 6,
      'not repairable': 6,
      'lost': 7,
      'out of service': 8,
      'retired': 9,
      'completed': 10,
      'complete': 10,
      'done': 10,
      // Expiring Certs
      'expired': 1,
      'critical': 2,
      'warning': 3,
      'missing': 4,
      'upcoming': 5,
      'ok': 6,
      'declined': 7,
      'not required': 8,
      // Training
      'scheduled': 1,
      'pending': 1,
      'cancelled': 12,
      'canceled': 12
    };

    const compareValues = (col, valA, valB) => {
      const sA = String(valA || '').trim();
      const sB = String(valB || '').trim();
      const colLower = String(col || '').toLowerCase();

      // Empty / N/A values sort to the bottom
      if (!sA && sB) return 1;
      if (sA && !sB) return -1;
      if (!sA && !sB) return 0;
      if (sA.toUpperCase() === 'N/A' && sB.toUpperCase() !== 'N/A') return 1;
      if (sA.toUpperCase() !== 'N/A' && sB.toUpperCase() === 'N/A') return -1;

      // Date comparison (handles MM/DD/YYYY, YYYY-MM-DD, ISO)
      if (colLower.includes('date') || colLower.includes('expiration') || colLower.includes('pad')) {
        const parseDate = (dStr) => {
          if (!dStr || dStr === 'N/A') return NaN;
          if (dStr.includes('/')) {
            const parts = dStr.split('/');
            if (parts.length === 3) {
              const m = parseInt(parts[0], 10) - 1;
              const d = parseInt(parts[1], 10);
              const y = parseInt(parts[2], 10);
              return new Date(y, m, d, 12, 0, 0).getTime();
            }
          }
          const t = new Date(dStr).getTime();
          return isNaN(t) ? NaN : t;
        };

        const dA = parseDate(sA);
        const dB = parseDate(sB);
        if (!isNaN(dA) && !isNaN(dB)) {
          return dA - dB;
        }
      }

      // Numeric comparison (Days Until Expiration, Size, Hours, etc.)
      if (colLower.includes('days') || colLower.includes('size') || colLower.includes('hours') || colLower.includes('count')) {
        const nA = parseFloat(sA.replace(/[^0-9.-]/g, ''));
        const nB = parseFloat(sB.replace(/[^0-9.-]/g, ''));
        if (!isNaN(nA) && !isNaN(nB)) {
          return nA - nB;
        }
      }

      // Custom status ranking
      if (colLower === 'status' || colLower === 'job status' || colLower === 'item status' || colLower === 'training status') {
        const rA = statusRank[sA.toLowerCase()] || 99;
        const rB = statusRank[sB.toLowerCase()] || 99;
        if (rA !== rB) return rA - rB;
      }

      return sA.localeCompare(sB, undefined, { numeric: true, sensitivity: 'base' });
    };

    // Sort logic
    if (this.multiSort && this.multiSort.length > 0) {
      const [colA, colB] = this.multiSort;
      const dir = this.sortDir === 'asc' ? 1 : -1;
      rows.sort((a, b) => {
        const cmp1 = compareValues(colA, a[colA], b[colA]);
        if (cmp1 !== 0) return dir * cmp1;
        return dir * compareValues(colB, a[colB], b[colB]);
      });
    } else if (this.sortCol) {
      const col = this.sortCol;
      const dir = this.sortDir === 'asc' ? 1 : -1;
      rows.sort((a, b) => {
        return dir * compareValues(col, a[col], b[col]);
      });
    } else if (this.currentSheetKey === 'grounds' && !this.sortCol && !this.multiSort) {
      // Default sort for Grounds: Type (OH/UG), then Serial #
      const tCol = headers.find(h => {
        const hl = String(h || '').toLowerCase().trim();
        return hl === 'type' || hl === 'type (oh/ug)' || hl === 'type(oh/ug)';
      }) || 'Type';
      const sCol = headers.find(h => {
        const hl = String(h || '').toLowerCase().trim();
        return hl === 'serial #' || hl === 'serial' || hl === 'item #' || hl === 'item';
      }) || 'Serial #';
      this.multiSort = [tCol, sCol];
      const dir = 1;
      rows.sort((a, b) => {
        const cmp1 = compareValues(tCol, a[tCol], b[tCol]);
        if (cmp1 !== 0) return dir * cmp1;
        return dir * compareValues(sCol, a[sCol], b[sCol]);
      });
    } else if (this.currentSheetKey === 'safety_compliance') {
      // Default sort for Safety Compliance matching Google Sheets: Week Start (descending), then Job Number (ascending)
      rows.sort((a, b) => {
        const wA = String(a['Week Start'] || a['Week'] || '').trim();
        const wB = String(b['Week Start'] || b['Week'] || '').trim();
        const dateA = new Date(wA).getTime() || 0;
        const dateB = new Date(wB).getTime() || 0;
        if (dateA !== dateB) return dateB - dateA; // Most recent week first
        const jA = String(a['Job Number'] || a['Crew'] || a['Job #'] || '').trim();
        const jB = String(b['Job Number'] || b['Crew'] || b['Job #'] || '').trim();
        return jA.localeCompare(jB, undefined, { numeric: true, sensitivity: 'base' });
      });
    }

    if (countBadge) {
      const unitLabel = this.currentSheetKey === 'expiring_certs' ? 'records' : 'rows';
      countBadge.textContent = `${rows.length} ${unitLabel}`;
    }

    // Presets bar for Employees, Job Tracking, Gloves, Sleeves, Blankets, MACKs, Expiring Certs, Training, etc.
    let presetBarHtml = '';
    const dirArrow = (active) => active ? (this.sortDir === 'asc' ? ' ▲' : ' ▼') : '';

    if (this.currentSheetKey === 'gloves' || this.currentSheetKey === 'sleeves') {
      const isItemSorted = this.sortCol && ['glove', 'sleeve', 'item #', 'item'].some(k => this.sortCol.toLowerCase().includes(k));
      const isSizeSorted = this.sortCol && this.sortCol.toLowerCase().includes('size');
      const isClassSorted = this.sortCol && this.sortCol.toLowerCase().includes('class');
      const isClassSizeSorted = this.multiSort && this.multiSort[0]?.toLowerCase().includes('class') && this.multiSort[1]?.toLowerCase().includes('size');
      const isLocSorted = this.sortCol && this.sortCol.toLowerCase().includes('location');
      const isStatSorted = this.sortCol && this.sortCol.toLowerCase().includes('status');
      const isAssignedSorted = this.sortCol && this.sortCol.toLowerCase().includes('assigned');
      const isChangeOutSorted = this.sortCol && (this.sortCol.toLowerCase().includes('change out') || this.sortCol.toLowerCase().includes('changeout'));

      presetBarHtml = `
        <div style="padding: 8px 16px; background-color: var(--bg-secondary); border-bottom: 1px solid var(--border-color); display: flex; align-items: center; gap: 6px; font-size: 12px; overflow-x: auto; flex-wrap: wrap;">
          <span style="color: var(--text-muted); font-weight: 600; white-space: nowrap;">⚡ Quick Sort:</span>
          <button class="btn btn-secondary ${isItemSorted ? 'active' : ''}" style="padding: 3px 8px; font-size: 11px; white-space: nowrap;" onclick="window.sheetNavigator.setPresetSort('itemNum')">🔢 Item #${dirArrow(isItemSorted)}</button>
          <button class="btn btn-secondary ${isSizeSorted ? 'active' : ''}" style="padding: 3px 8px; font-size: 11px; white-space: nowrap;" onclick="window.sheetNavigator.setPresetSort('size')">📏 Size${dirArrow(isSizeSorted)}</button>
          <button class="btn btn-secondary ${isClassSorted ? 'active' : ''}" style="padding: 3px 8px; font-size: 11px; white-space: nowrap;" onclick="window.sheetNavigator.setPresetSort('class')">⚡ Class${dirArrow(isClassSorted)}</button>
          <button class="btn btn-secondary ${isClassSizeSorted ? 'active' : ''}" style="padding: 3px 8px; font-size: 11px; white-space: nowrap;" onclick="window.sheetNavigator.setPresetSort('classSize')">⚡+📏 Class then Size${dirArrow(isClassSizeSorted)}</button>
          <button class="btn btn-secondary ${isLocSorted ? 'active' : ''}" style="padding: 3px 8px; font-size: 11px; white-space: nowrap;" onclick="window.sheetNavigator.setPresetSort('location')">📍 Location${dirArrow(isLocSorted)}</button>
          <button class="btn btn-secondary ${isStatSorted ? 'active' : ''}" style="padding: 3px 8px; font-size: 11px; white-space: nowrap;" onclick="window.sheetNavigator.setPresetSort('status')">🏷️ Status${dirArrow(isStatSorted)}</button>
          <button class="btn btn-secondary ${isAssignedSorted ? 'active' : ''}" style="padding: 3px 8px; font-size: 11px; white-space: nowrap;" onclick="window.sheetNavigator.setPresetSort('assignedTo')">👤 Assigned To${dirArrow(isAssignedSorted)}</button>
          <button class="btn btn-secondary ${isChangeOutSorted ? 'active' : ''}" style="padding: 3px 8px; font-size: 11px; white-space: nowrap;" onclick="window.sheetNavigator.setPresetSort('changeOutDate')">📅 Changeout Date${dirArrow(isChangeOutSorted)}</button>
        </div>
      `;
    } else if (this.currentSheetKey === 'blankets') {
      const isItemSorted = this.sortCol && ['blanket', 'item #', 'item'].some(k => this.sortCol.toLowerCase().includes(k));
      const isTypeSorted = this.sortCol && this.sortCol.toLowerCase().includes('type');
      const isClassSorted = this.sortCol && this.sortCol.toLowerCase().includes('class');
      const isLocSorted = this.sortCol && this.sortCol.toLowerCase().includes('location');
      const isStatSorted = this.sortCol && this.sortCol.toLowerCase().includes('status');
      const isAssignedSorted = this.sortCol && this.sortCol.toLowerCase().includes('assigned');
      const isChangeOutSorted = this.sortCol && (this.sortCol.toLowerCase().includes('change out') || this.sortCol.toLowerCase().includes('changeout'));

      presetBarHtml = `
        <div style="padding: 8px 16px; background-color: var(--bg-secondary); border-bottom: 1px solid var(--border-color); display: flex; align-items: center; gap: 6px; font-size: 12px; overflow-x: auto; flex-wrap: wrap;">
          <span style="color: var(--text-muted); font-weight: 600; white-space: nowrap;">⚡ Quick Sort:</span>
          <button class="btn btn-secondary ${isItemSorted ? 'active' : ''}" style="padding: 3px 8px; font-size: 11px; white-space: nowrap;" onclick="window.sheetNavigator.setPresetSort('itemNum')">🔢 Item #${dirArrow(isItemSorted)}</button>
          <button class="btn btn-secondary ${isTypeSorted ? 'active' : ''}" style="padding: 3px 8px; font-size: 11px; white-space: nowrap;" onclick="window.sheetNavigator.setPresetSort('type')">🔲 Type${dirArrow(isTypeSorted)}</button>
          <button class="btn btn-secondary ${isClassSorted ? 'active' : ''}" style="padding: 3px 8px; font-size: 11px; white-space: nowrap;" onclick="window.sheetNavigator.setPresetSort('class')">⚡ Class${dirArrow(isClassSorted)}</button>
          <button class="btn btn-secondary ${isLocSorted ? 'active' : ''}" style="padding: 3px 8px; font-size: 11px; white-space: nowrap;" onclick="window.sheetNavigator.setPresetSort('location')">📍 Location${dirArrow(isLocSorted)}</button>
          <button class="btn btn-secondary ${isStatSorted ? 'active' : ''}" style="padding: 3px 8px; font-size: 11px; white-space: nowrap;" onclick="window.sheetNavigator.setPresetSort('status')">🏷️ Status${dirArrow(isStatSorted)}</button>
          <button class="btn btn-secondary ${isAssignedSorted ? 'active' : ''}" style="padding: 3px 8px; font-size: 11px; white-space: nowrap;" onclick="window.sheetNavigator.setPresetSort('assignedTo')">👤 Assigned To${dirArrow(isAssignedSorted)}</button>
          <button class="btn btn-secondary ${isChangeOutSorted ? 'active' : ''}" style="padding: 3px 8px; font-size: 11px; white-space: nowrap;" onclick="window.sheetNavigator.setPresetSort('changeOutDate')">📅 Changeout Date${dirArrow(isChangeOutSorted)}</button>
        </div>
      `;
    } else if (this.currentSheetKey === 'macks') {
      const isItemSorted = this.sortCol && ['mack', 'esl id', 'item #', 'item'].some(k => this.sortCol.toLowerCase().includes(k));
      const isKvSorted = this.sortCol && this.sortCol.toLowerCase().includes('kv');
      const isSizeSorted = this.sortCol && this.sortCol.toLowerCase().includes('size');
      const isLocSorted = this.sortCol && this.sortCol.toLowerCase().includes('location');
      const isStatSorted = this.sortCol && this.sortCol.toLowerCase().includes('status');
      const isAssignedSorted = this.sortCol && this.sortCol.toLowerCase().includes('assigned');
      const isChangeOutSorted = this.sortCol && (this.sortCol.toLowerCase().includes('change out') || this.sortCol.toLowerCase().includes('changeout'));

      presetBarHtml = `
        <div style="padding: 8px 16px; background-color: var(--bg-secondary); border-bottom: 1px solid var(--border-color); display: flex; align-items: center; gap: 6px; font-size: 12px; overflow-x: auto; flex-wrap: wrap;">
          <span style="color: var(--text-muted); font-weight: 600; white-space: nowrap;">⚡ Quick Sort:</span>
          <button class="btn btn-secondary ${isItemSorted ? 'active' : ''}" style="padding: 3px 8px; font-size: 11px; white-space: nowrap;" onclick="window.sheetNavigator.setPresetSort('itemNum')">🔢 ESL ID${dirArrow(isItemSorted)}</button>
          <button class="btn btn-secondary ${isKvSorted ? 'active' : ''}" style="padding: 3px 8px; font-size: 11px; white-space: nowrap;" onclick="window.sheetNavigator.setPresetSort('kv')">⚡ KV${dirArrow(isKvSorted)}</button>
          <button class="btn btn-secondary ${isSizeSorted ? 'active' : ''}" style="padding: 3px 8px; font-size: 11px; white-space: nowrap;" onclick="window.sheetNavigator.setPresetSort('size')">📏 Size${dirArrow(isSizeSorted)}</button>
          <button class="btn btn-secondary ${isLocSorted ? 'active' : ''}" style="padding: 3px 8px; font-size: 11px; white-space: nowrap;" onclick="window.sheetNavigator.setPresetSort('location')">📍 Location${dirArrow(isLocSorted)}</button>
          <button class="btn btn-secondary ${isStatSorted ? 'active' : ''}" style="padding: 3px 8px; font-size: 11px; white-space: nowrap;" onclick="window.sheetNavigator.setPresetSort('status')">🏷️ Status${dirArrow(isStatSorted)}</button>
          <button class="btn btn-secondary ${isAssignedSorted ? 'active' : ''}" style="padding: 3px 8px; font-size: 11px; white-space: nowrap;" onclick="window.sheetNavigator.setPresetSort('assignedTo')">👤 Assigned To${dirArrow(isAssignedSorted)}</button>
          <button class="btn btn-secondary ${isChangeOutSorted ? 'active' : ''}" style="padding: 3px 8px; font-size: 11px; white-space: nowrap;" onclick="window.sheetNavigator.setPresetSort('changeOutDate')">📅 Changeout Date${dirArrow(isChangeOutSorted)}</button>
        </div>
      `;
    } else if (this.currentSheetKey === 'grounds') {
      const isTypeSerialSorted = this.multiSort && this.multiSort[0]?.toLowerCase().includes('type') && (this.multiSort[1]?.toLowerCase().includes('serial') || this.multiSort[1]?.toLowerCase().includes('item'));
      const isTypeSorted = !isTypeSerialSorted && this.sortCol && ['type', 'oh', 'ug'].some(k => this.sortCol.toLowerCase().includes(k));
      const isTypeSizeSorted = this.multiSort && this.multiSort[0]?.toLowerCase().includes('type') && this.multiSort[1]?.toLowerCase().includes('size');
      const isItemSorted = this.sortCol && ['item #', 'item', 'serial #', 'serial'].some(k => this.sortCol.toLowerCase().includes(k));
      const isSizeSorted = this.sortCol && this.sortCol.toLowerCase() === 'size';
      const isKvSorted = this.sortCol && this.sortCol.toLowerCase() === 'kv';
      const isLengthSorted = this.sortCol && this.sortCol.toLowerCase().includes('length');
      const isLocSorted = this.sortCol && this.sortCol.toLowerCase().includes('location');
      const isStatSorted = this.sortCol && this.sortCol.toLowerCase().includes('status');
      const isAssignedSorted = this.sortCol && this.sortCol.toLowerCase().includes('assigned');
      const isTestSorted = this.sortCol && (this.sortCol.toLowerCase().includes('test date') || this.sortCol.toLowerCase() === 'test');
      const isChangeOutSorted = this.sortCol && (this.sortCol.toLowerCase().includes('change out') || this.sortCol.toLowerCase().includes('changeout'));

      presetBarHtml = `
        <div style="padding: 8px 16px; background-color: var(--bg-secondary); border-bottom: 1px solid var(--border-color); display: flex; align-items: center; gap: 6px; font-size: 12px; overflow-x: auto; flex-wrap: wrap;">
          <span style="color: var(--text-muted); font-weight: 600; white-space: nowrap;">⚡ Quick Sort:</span>
          <button class="btn btn-secondary ${isTypeSerialSorted ? 'active' : ''}" style="padding: 3px 8px; font-size: 11px; white-space: nowrap;" onclick="window.sheetNavigator.setPresetSort('typeSerial')">⚡+🔢 Type then Serial #${dirArrow(isTypeSerialSorted)}</button>
          <button class="btn btn-secondary ${isTypeSorted ? 'active' : ''}" style="padding: 3px 8px; font-size: 11px; white-space: nowrap;" onclick="window.sheetNavigator.setPresetSort('type')">⚡ Type (OH / UG)${dirArrow(isTypeSorted)}</button>
          <button class="btn btn-secondary ${isTypeSizeSorted ? 'active' : ''}" style="padding: 3px 8px; font-size: 11px; white-space: nowrap;" onclick="window.sheetNavigator.setPresetSort('typeSize')">⚡+📏 Type then Size${dirArrow(isTypeSizeSorted)}</button>
          <button class="btn btn-secondary ${isItemSorted ? 'active' : ''}" style="padding: 3px 8px; font-size: 11px; white-space: nowrap;" onclick="window.sheetNavigator.setPresetSort('itemNum')">🔢 Serial #${dirArrow(isItemSorted)}</button>
          <button class="btn btn-secondary ${isSizeSorted ? 'active' : ''}" style="padding: 3px 8px; font-size: 11px; white-space: nowrap;" onclick="window.sheetNavigator.setPresetSort('size')">📏 Size${dirArrow(isSizeSorted)}</button>
          <button class="btn btn-secondary ${isKvSorted ? 'active' : ''}" style="padding: 3px 8px; font-size: 11px; white-space: nowrap;" onclick="window.sheetNavigator.setPresetSort('kv')">⚡ KV${dirArrow(isKvSorted)}</button>
          <button class="btn btn-secondary ${isLengthSorted ? 'active' : ''}" style="padding: 3px 8px; font-size: 11px; white-space: nowrap;" onclick="window.sheetNavigator.setPresetSort('length')">📐 Length${dirArrow(isLengthSorted)}</button>
          <button class="btn btn-secondary ${isLocSorted ? 'active' : ''}" style="padding: 3px 8px; font-size: 11px; white-space: nowrap;" onclick="window.sheetNavigator.setPresetSort('location')">📍 Location${dirArrow(isLocSorted)}</button>
          <button class="btn btn-secondary ${isStatSorted ? 'active' : ''}" style="padding: 3px 8px; font-size: 11px; white-space: nowrap;" onclick="window.sheetNavigator.setPresetSort('status')">🏷️ Status${dirArrow(isStatSorted)}</button>
          <button class="btn btn-secondary ${isAssignedSorted ? 'active' : ''}" style="padding: 3px 8px; font-size: 11px; white-space: nowrap;" onclick="window.sheetNavigator.setPresetSort('assignedTo')">👤 Assigned To${dirArrow(isAssignedSorted)}</button>
          <button class="btn btn-secondary ${isTestSorted ? 'active' : ''}" style="padding: 3px 8px; font-size: 11px; white-space: nowrap;" onclick="window.sheetNavigator.setPresetSort('testDate')">📅 Test Date${dirArrow(isTestSorted)}</button>
          <button class="btn btn-secondary ${isChangeOutSorted ? 'active' : ''}" style="padding: 3px 8px; font-size: 11px; white-space: nowrap;" onclick="window.sheetNavigator.setPresetSort('changeOutDate')">📅 Changeout Date${dirArrow(isChangeOutSorted)}</button>
        </div>
      `;
    } else if (['hv_testers', 'phasing_sets', 'aed', 'hot_sticks'].includes(this.currentSheetKey)) {
      const isItemSorted = this.sortCol && ['item #', 'item', 'serial #'].some(k => this.sortCol.toLowerCase().includes(k));
      const isLocSorted = this.sortCol && this.sortCol.toLowerCase().includes('location');
      const isStatSorted = this.sortCol && this.sortCol.toLowerCase().includes('status');
      const isAssignedSorted = this.sortCol && this.sortCol.toLowerCase().includes('assigned');
      const isChangeOutSorted = this.sortCol && (this.sortCol.toLowerCase().includes('change out') || this.sortCol.toLowerCase().includes('changeout') || this.sortCol.toLowerCase().includes('pad'));

      presetBarHtml = `
        <div style="padding: 8px 16px; background-color: var(--bg-secondary); border-bottom: 1px solid var(--border-color); display: flex; align-items: center; gap: 6px; font-size: 12px; overflow-x: auto; flex-wrap: wrap;">
          <span style="color: var(--text-muted); font-weight: 600; white-space: nowrap;">⚡ Quick Sort:</span>
          <button class="btn btn-secondary ${isItemSorted ? 'active' : ''}" style="padding: 3px 8px; font-size: 11px; white-space: nowrap;" onclick="window.sheetNavigator.setPresetSort('itemNum')">🔢 Item #${dirArrow(isItemSorted)}</button>
          <button class="btn btn-secondary ${isLocSorted ? 'active' : ''}" style="padding: 3px 8px; font-size: 11px; white-space: nowrap;" onclick="window.sheetNavigator.setPresetSort('location')">📍 Location${dirArrow(isLocSorted)}</button>
          <button class="btn btn-secondary ${isStatSorted ? 'active' : ''}" style="padding: 3px 8px; font-size: 11px; white-space: nowrap;" onclick="window.sheetNavigator.setPresetSort('status')">🏷️ Status${dirArrow(isStatSorted)}</button>
          <button class="btn btn-secondary ${isAssignedSorted ? 'active' : ''}" style="padding: 3px 8px; font-size: 11px; white-space: nowrap;" onclick="window.sheetNavigator.setPresetSort('assignedTo')">👤 Assigned To${dirArrow(isAssignedSorted)}</button>
          <button class="btn btn-secondary ${isChangeOutSorted ? 'active' : ''}" style="padding: 3px 8px; font-size: 11px; white-space: nowrap;" onclick="window.sheetNavigator.setPresetSort('changeOutDate')">📅 Changeout Date${dirArrow(isChangeOutSorted)}</button>
        </div>
      `;
    } else if (this.currentSheetKey === 'employees') {
      const isLocSorted = this.sortCol === 'Location';
      const isJobSorted = this.sortCol === 'Job Number';
      const isLocJobSorted = this.multiSort && this.multiSort[0] === 'Location';
      const isNameSorted = this.sortCol === 'Name';

      presetBarHtml = `
        <div style="padding: 8px 16px; background-color: var(--bg-secondary); border-bottom: 1px solid var(--border-color); display: flex; align-items: center; gap: 8px; font-size: 12px;">
          <span style="color: var(--text-muted); font-weight: 600;">⚡ Quick Sort:</span>
          <button class="btn btn-secondary ${isLocSorted ? 'active' : ''}" style="padding: 3px 8px; font-size: 11px;" onclick="window.sheetNavigator.setPresetSort('location')">📍 Location${dirArrow(isLocSorted)}</button>
          <button class="btn btn-secondary ${isJobSorted ? 'active' : ''}" style="padding: 3px 8px; font-size: 11px;" onclick="window.sheetNavigator.setPresetSort('jobNumber')">🔢 Job #${dirArrow(isJobSorted)}</button>
          <button class="btn btn-secondary ${isLocJobSorted ? 'active' : ''}" style="padding: 3px 8px; font-size: 11px;" onclick="window.sheetNavigator.setPresetSort('locationJob')">📍+🔢 Location then Job #${dirArrow(isLocJobSorted)}</button>
          <button class="btn btn-secondary ${isNameSorted ? 'active' : ''}" style="padding: 3px 8px; font-size: 11px;" onclick="window.sheetNavigator.setPresetSort('name')">👤 Name${dirArrow(isNameSorted)}</button>
        </div>
      `;
    } else if (this.currentSheetKey === 'job_tracking') {
      const isStatSorted = this.sortCol === 'Status';
      const isJobSorted = this.sortCol === 'Job Number';
      const isStatJobSorted = this.multiSort && this.multiSort[0] === 'Status';
      const isLocSorted = this.sortCol === 'Location';

      presetBarHtml = `
        <div style="padding: 8px 16px; background-color: var(--bg-secondary); border-bottom: 1px solid var(--border-color); display: flex; align-items: center; gap: 8px; font-size: 12px;">
          <span style="color: var(--text-muted); font-weight: 600;">⚡ Quick Sort:</span>
          <button class="btn btn-secondary ${isStatSorted ? 'active' : ''}" style="padding: 3px 8px; font-size: 11px;" onclick="window.sheetNavigator.setPresetSort('status')">🏷️ Status${dirArrow(isStatSorted)}</button>
          <button class="btn btn-secondary ${isJobSorted ? 'active' : ''}" style="padding: 3px 8px; font-size: 11px;" onclick="window.sheetNavigator.setPresetSort('jobNumber')">🔢 Job #${dirArrow(isJobSorted)}</button>
          <button class="btn btn-secondary ${isStatJobSorted ? 'active' : ''}" style="padding: 3px 8px; font-size: 11px;" onclick="window.sheetNavigator.setPresetSort('statusJob')">🏷️+🔢 Status then Job #${dirArrow(isStatJobSorted)}</button>
          <button class="btn btn-secondary ${isLocSorted ? 'active' : ''}" style="padding: 3px 8px; font-size: 11px;" onclick="window.sheetNavigator.setPresetSort('location')">📍 Location${dirArrow(isLocSorted)}</button>
        </div>
      `;
    } else if (this.currentSheetKey === 'safety_compliance') {
      // Find all unique weeks and sort descending (most recent first)
      const uniqueWeeks = [];
      (tableData.rows || []).forEach(r => {
        const w = String(r['Week Start'] || r['Week'] || '').trim();
        if (w && !uniqueWeeks.includes(w)) uniqueWeeks.push(w);
      });
      uniqueWeeks.sort((a, b) => {
        const dA = new Date(a).getTime() || 0;
        const dB = new Date(b).getTime() || 0;
        return dB - dA;
      });

      // Default to latest week on open if not explicitly selected
      if (this.selectedComplianceWeek === undefined && uniqueWeeks.length > 0) {
        this.selectedComplianceWeek = uniqueWeeks[0];
      }

      const selectedWeek = this.selectedComplianceWeek || (uniqueWeeks[0] || 'ALL');
      if (selectedWeek !== 'ALL') {
        rows = rows.filter(r => String(r['Week Start'] || r['Week'] || '').trim() === selectedWeek);
      }

      const selectedStatus = this.selectedComplianceStatus || 'ALL';
      if (selectedStatus !== 'ALL') {
        rows = rows.filter(r => String(r['Status'] || '').toLowerCase().includes(selectedStatus.toLowerCase()));
      }

      // Compute KPI summary metrics for active view
      const activeRows = selectedWeek !== 'ALL' 
        ? (tableData.rows || []).filter(r => String(r['Week Start'] || r['Week'] || '').trim() === selectedWeek)
        : (tableData.rows || []);
      const totalAll = activeRows.length;
      const compAll = activeRows.filter(r => String(r['Status'] || '').toLowerCase() === 'complete').length;
      const missingAll = activeRows.filter(r => String(r['Status'] || '').toLowerCase().includes('missing')).length;
      const pendingAll = activeRows.filter(r => String(r['Status'] || '').toLowerCase() === 'pending').length;
      const resolvedAll = activeRows.filter(r => String(r['Status'] || '').toLowerCase() === 'resolved').length;
      const pctAll = totalAll > 0 ? Math.round((compAll / totalAll) * 100) : 0;

      presetBarHtml = `
        <div style="background: var(--bg-secondary); border-bottom: 1px solid var(--border-color);">
          <!-- Top KPI Metrics Banner -->
          <div style="padding: 10px 16px; display: flex; gap: 10px; flex-wrap: wrap; align-items: center; border-bottom: 1px solid rgba(255,255,255,0.05); background: rgba(0,0,0,0.15);">
            <div style="background: var(--bg-primary); border: 1px solid var(--border-color); border-radius: 6px; padding: 4px 10px; display: flex; align-items: center; gap: 8px;">
              <span style="font-size: 14px;">🚚</span>
              <div>
                <div style="font-size: 9.5px; text-transform: uppercase; color: var(--text-muted); font-weight: 700;">Total Rows</div>
                <div style="font-size: 13px; font-weight: 800; color: #fff;">${totalAll}</div>
              </div>
            </div>
            <div style="background: var(--bg-primary); border: 1px solid rgba(34, 197, 94, 0.3); border-radius: 6px; padding: 4px 10px; display: flex; align-items: center; gap: 8px;">
              <span style="font-size: 14px;">✅</span>
              <div>
                <div style="font-size: 9.5px; text-transform: uppercase; color: #4ade80; font-weight: 700;">Compliant</div>
                <div style="font-size: 13px; font-weight: 800; color: #4ade80;">${compAll}</div>
              </div>
            </div>
            <div style="background: var(--bg-primary); border: 1px solid rgba(239, 68, 68, 0.3); border-radius: 6px; padding: 4px 10px; display: flex; align-items: center; gap: 8px;">
              <span style="font-size: 14px;">❌</span>
              <div>
                <div style="font-size: 9.5px; text-transform: uppercase; color: #f87171; font-weight: 700;">Missing</div>
                <div style="font-size: 13px; font-weight: 800; color: #f87171;">${missingAll}</div>
              </div>
            </div>
            <div style="background: var(--bg-primary); border: 1px solid rgba(234, 179, 8, 0.3); border-radius: 6px; padding: 4px 10px; display: flex; align-items: center; gap: 8px;">
              <span style="font-size: 14px;">⏳</span>
              <div>
                <div style="font-size: 9.5px; text-transform: uppercase; color: #facc15; font-weight: 700;">Pending</div>
                <div style="font-size: 13px; font-weight: 800; color: #facc15;">${pendingAll}</div>
              </div>
            </div>
            ${resolvedAll > 0 ? `
              <div style="background: var(--bg-primary); border: 1px solid rgba(59, 130, 246, 0.3); border-radius: 6px; padding: 4px 10px; display: flex; align-items: center; gap: 8px;">
                <span style="font-size: 14px;">🔵</span>
                <div>
                  <div style="font-size: 9.5px; text-transform: uppercase; color: #93c5fd; font-weight: 700;">Resolved</div>
                  <div style="font-size: 13px; font-weight: 800; color: #93c5fd;">${resolvedAll}</div>
                </div>
              </div>
            ` : ''}
            <div style="background: var(--bg-primary); border: 1px solid var(--border-color); border-radius: 6px; padding: 4px 10px; display: flex; align-items: center; gap: 8px;">
              <span style="font-size: 14px;">📈</span>
              <div>
                <div style="font-size: 9.5px; text-transform: uppercase; color: #93c5fd; font-weight: 700;">Rate</div>
                <div style="font-size: 13px; font-weight: 800; color: ${pctAll >= 100 ? '#4ade80' : (pctAll >= 80 ? '#60a5fa' : '#f87171')};">${pctAll}%</div>
              </div>
            </div>
          </div>

          <!-- Week Navigation & Filter Controls -->
          <div style="padding: 8px 16px; display: flex; align-items: center; justify-content: space-between; gap: 10px; font-size: 12px; flex-wrap: wrap;">
            <div style="display: flex; align-items: center; gap: 6px; overflow-x: auto; flex-wrap: wrap;">
              <span style="color: var(--text-muted); font-weight: 600; white-space: nowrap;">📅 Filter Week:</span>
              <button class="btn btn-secondary ${selectedWeek === 'ALL' ? 'active' : ''}" style="padding: 3px 8px; font-size: 11px; white-space: nowrap;" onclick="window.sheetNavigator.setComplianceWeek('ALL')">All Weeks</button>
              ${uniqueWeeks.map((w, idx) => `
                <button class="btn btn-secondary ${selectedWeek === w ? 'active' : ''}" style="padding: 3px 8px; font-size: 11px; white-space: nowrap;" onclick="window.sheetNavigator.setComplianceWeek('${this.escapeHtml(w)}')">
                  ${idx === 0 ? '🟢 ' : ''}Week of ${this.escapeHtml(w)}${idx === 0 ? ' (Latest)' : ''}
                </button>
              `).join('')}
            </div>

            <div style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">
              <span style="color: var(--text-muted); font-weight: 600; white-space: nowrap;">⚡ Status:</span>
              <button class="btn btn-secondary ${selectedStatus === 'ALL' ? 'active' : ''}" style="padding: 3px 8px; font-size: 11px;" onclick="window.sheetNavigator.setComplianceStatus('ALL')">All</button>
              <button class="btn btn-secondary ${selectedStatus === 'Missing' ? 'active' : ''}" style="padding: 3px 8px; font-size: 11px; color: #f87171;" onclick="window.sheetNavigator.setComplianceStatus('Missing')">❌ Missing</button>
              <button class="btn btn-secondary ${selectedStatus === 'Pending' ? 'active' : ''}" style="padding: 3px 8px; font-size: 11px; color: #facc15;" onclick="window.sheetNavigator.setComplianceStatus('Pending')">⏳ Pending</button>
              <button class="btn btn-secondary ${selectedStatus === 'Complete' ? 'active' : ''}" style="padding: 3px 8px; font-size: 11px; color: #4ade80;" onclick="window.sheetNavigator.setComplianceStatus('Complete')">✅ Complete</button>
            </div>
          </div>
        </div>
      `;
    } else if (this.currentSheetKey === 'expiring_certs') {
      const prevEmpNames = this.getPreviousEmployeeNamesSet();
      const allRows = (tableData.rows || []).filter(r => !this.isRowPreviousEmployee(r, prevEmpNames));
      const totalAll = allRows.length;
      const okAll = allRows.filter(r => (String(r['Status'] || '').toUpperCase() === 'OK')).length;
      const upAll = allRows.filter(r => (String(r['Status'] || '').toUpperCase() === 'UPCOMING')).length;
      const warnAll = allRows.filter(r => (String(r['Status'] || '').toUpperCase() === 'WARNING')).length;
      const critAll = allRows.filter(r => (String(r['Status'] || '').toUpperCase() === 'CRITICAL')).length;
      const expAll = allRows.filter(r => (String(r['Status'] || '').toUpperCase() === 'EXPIRED')).length;
      const missAll = allRows.filter(r => {
        const s = String(r['Status'] || '').toUpperCase();
        return s === 'MISSING' || s === 'NEED COPY' || !r['Expiration Date'];
      }).length;

      // Extract unique list of employees, cert types, and locations for interactive selectors
      const empSet = new Set();
      const typeSet = new Set();
      const locSet = new Set();
      allRows.forEach(r => {
        const emp = String(r['Employee Name'] || r['Name'] || '').trim();
        if (emp) empSet.add(emp);
        const typ = String(r['Item Type'] || r['Cert Type'] || r['Type'] || '').trim();
        if (typ) typeSet.add(typ);
        const loc = String(r['Location'] || '').trim();
        if (loc && loc !== 'N/A' && loc !== '—' && loc.toLowerCase() !== 'previous employee') locSet.add(loc);
      });

      const uniqueEmps = Array.from(empSet).sort((a, b) => a.localeCompare(b));
      const uniqueTypes = Array.from(typeSet).sort((a, b) => a.localeCompare(b));
      const uniqueLocs = Array.from(locSet).sort((a, b) => a.localeCompare(b));

      const isFiltered = this.filterCertType !== 'all' || this.filterCertEmployee !== 'all' || this.filterCertStatus !== 'all' || this.filterCertLocation !== 'all' || Boolean(this.searchTerm);

      const isNameSorted = this.sortCol && (this.sortCol.toLowerCase().includes('name') || this.sortCol.toLowerCase().includes('employee'));
      const isCertSorted = this.sortCol && (this.sortCol.toLowerCase().includes('type') || this.sortCol.toLowerCase().includes('cert'));
      const isExpSorted = this.sortCol && this.sortCol.toLowerCase().includes('expiration');
      const isDaysSorted = this.sortCol && this.sortCol.toLowerCase().includes('days');
      const isStatSorted = this.sortCol && this.sortCol.toLowerCase().includes('status');
      const isLocSorted = this.sortCol && this.sortCol.toLowerCase().includes('location');
      const isJobSorted = this.sortCol && (this.sortCol.toLowerCase().includes('job') || this.sortCol.toLowerCase().includes('crew'));

      presetBarHtml = `
        <div style="background: var(--bg-secondary); border-bottom: 1px solid var(--border-color);">
          <!-- Top KPI Metrics Banner -->
          <div style="padding: 8px 16px; display: flex; gap: 8px; flex-wrap: wrap; align-items: center; border-bottom: 1px solid rgba(255,255,255,0.05); background: rgba(0,0,0,0.15);">
            <div style="background: var(--bg-primary); border: 1px solid var(--border-color); border-radius: 6px; padding: 4px 8px; display: flex; align-items: center; gap: 6px; cursor: pointer;" onclick="window.sheetNavigator.setCertStatusFilter('all')" title="Click to show all cert records">
              <span style="font-size: 13px;">📜</span>
              <div>
                <div style="font-size: 9px; text-transform: uppercase; color: var(--text-muted); font-weight: 700;">Total</div>
                <div style="font-size: 12px; font-weight: 800; color: #fff;">${totalAll}</div>
              </div>
            </div>
            <div style="background: var(--bg-primary); border: 1px solid rgba(34, 197, 94, 0.3); border-radius: 6px; padding: 4px 8px; display: flex; align-items: center; gap: 6px; cursor: pointer;" onclick="window.sheetNavigator.setCertStatusFilter('OK')" title="Click to show valid OK certs">
              <span style="font-size: 13px;">🟢</span>
              <div>
                <div style="font-size: 9px; text-transform: uppercase; color: #4ade80; font-weight: 700;">Valid OK</div>
                <div style="font-size: 12px; font-weight: 800; color: #4ade80;">${okAll}</div>
              </div>
            </div>
            <div style="background: var(--bg-primary); border: 1px solid rgba(59, 130, 246, 0.3); border-radius: 6px; padding: 4px 8px; display: flex; align-items: center; gap: 6px; cursor: pointer;" onclick="window.sheetNavigator.setCertStatusFilter('UPCOMING')" title="Click to show certs expiring in &lt;90 days">
              <span style="font-size: 13px;">🔵</span>
              <div>
                <div style="font-size: 9px; text-transform: uppercase; color: #60a5fa; font-weight: 700;">&lt;90 Days</div>
                <div style="font-size: 12px; font-weight: 800; color: #60a5fa;">${upAll}</div>
              </div>
            </div>
            <div style="background: var(--bg-primary); border: 1px solid rgba(234, 179, 8, 0.3); border-radius: 6px; padding: 4px 8px; display: flex; align-items: center; gap: 6px; cursor: pointer;" onclick="window.sheetNavigator.setCertStatusFilter('WARNING')" title="Click to show certs expiring in &lt;60 days">
              <span style="font-size: 13px;">🟡</span>
              <div>
                <div style="font-size: 9px; text-transform: uppercase; color: #facc15; font-weight: 700;">&lt;60 Days</div>
                <div style="font-size: 12px; font-weight: 800; color: #facc15;">${warnAll}</div>
              </div>
            </div>
            <div style="background: var(--bg-primary); border: 1px solid rgba(249, 115, 22, 0.3); border-radius: 6px; padding: 4px 8px; display: flex; align-items: center; gap: 6px; cursor: pointer;" onclick="window.sheetNavigator.setCertStatusFilter('CRITICAL')" title="Click to show certs expiring in &lt;30 days">
              <span style="font-size: 13px;">🟠</span>
              <div>
                <div style="font-size: 9px; text-transform: uppercase; color: #fb923c; font-weight: 700;">&lt;30 Days</div>
                <div style="font-size: 12px; font-weight: 800; color: #fb923c;">${critAll}</div>
              </div>
            </div>
            <div style="background: var(--bg-primary); border: 1px solid rgba(239, 68, 68, 0.3); border-radius: 6px; padding: 4px 8px; display: flex; align-items: center; gap: 6px; cursor: pointer;" onclick="window.sheetNavigator.setCertStatusFilter('EXPIRED')" title="Click to show expired certs">
              <span style="font-size: 13px;">🔴</span>
              <div>
                <div style="font-size: 9px; text-transform: uppercase; color: #f87171; font-weight: 700;">Expired</div>
                <div style="font-size: 12px; font-weight: 800; color: #f87171;">${expAll}</div>
              </div>
            </div>
            <div style="background: var(--bg-primary); border: 1px solid rgba(148, 163, 184, 0.3); border-radius: 6px; padding: 4px 8px; display: flex; align-items: center; gap: 6px; cursor: pointer;" onclick="window.sheetNavigator.setCertStatusFilter('MISSING')" title="Click to show missing/need copy certs">
              <span style="font-size: 13px;">❌</span>
              <div>
                <div style="font-size: 9px; text-transform: uppercase; color: #cbd5e1; font-weight: 700;">Missing</div>
                <div style="font-size: 12px; font-weight: 800; color: #cbd5e1;">${missAll}</div>
              </div>
            </div>
          </div>

          <!-- Interactive Filter Selectors Row -->
          <div style="padding: 8px 16px; display: flex; align-items: center; gap: 10px; font-size: 12px; flex-wrap: wrap; border-bottom: 1px solid rgba(255,255,255,0.05);">
            
            <!-- Cert Type Selector -->
            <div style="display: flex; align-items: center; gap: 4px;">
              <span style="color: var(--text-muted); font-weight: 600; white-space: nowrap;">📜 Cert Type:</span>
              <select style="padding: 4px 8px; font-size: 11px; background: var(--bg-primary); color: var(--text-primary); border: 1px solid var(--border-color); border-radius: 4px;" onchange="window.sheetNavigator.setCertTypeFilter(this.value)">
                <option value="all" ${this.filterCertType === 'all' ? 'selected' : ''}>🌟 All Certifications (${totalAll})</option>
                <option value="expiring_soon" ${this.filterCertType === 'expiring_soon' ? 'selected' : ''}>🔔 Expiring Soon / Expired Only</option>
                <option value="crane_all" ${this.filterCertType === 'crane_all' ? 'selected' : ''}>🏗️ All Crane (Cert & Eval)</option>
                <option value="forklift_all" ${this.filterCertType === 'forklift_all' ? 'selected' : ''}>🚜 All Forklift (Cert & Safety)</option>
                <option value="osha_all" ${this.filterCertType === 'osha_all' ? 'selected' : ''}>🛡️ OSHA & Rail/Mine Safety</option>
                <optgroup label="Individual Certifications">
                  ${uniqueTypes.map(t => `<option value="${this.escapeHtml(t)}" ${this.filterCertType === t ? 'selected' : ''}>${this.escapeHtml(t)}</option>`).join('')}
                </optgroup>
              </select>
            </div>

            <!-- Employee Selector -->
            <div style="display: flex; align-items: center; gap: 4px;">
              <span style="color: var(--text-muted); font-weight: 600; white-space: nowrap;">👤 Employee:</span>
              <select style="padding: 4px 8px; font-size: 11px; background: var(--bg-primary); color: var(--text-primary); border: 1px solid var(--border-color); border-radius: 4px; max-width: 180px;" onchange="window.sheetNavigator.setCertEmployeeFilter(this.value)">
                <option value="all" ${this.filterCertEmployee === 'all' ? 'selected' : ''}>All Employees (${uniqueEmps.length})</option>
                ${uniqueEmps.map(e => `<option value="${this.escapeHtml(e)}" ${this.filterCertEmployee.toLowerCase() === e.toLowerCase() ? 'selected' : ''}>${this.escapeHtml(e)}</option>`).join('')}
              </select>
            </div>

            <!-- Status Selector -->
            <div style="display: flex; align-items: center; gap: 4px;">
              <span style="color: var(--text-muted); font-weight: 600; white-space: nowrap;">🏷️ Status:</span>
              <select style="padding: 4px 8px; font-size: 11px; background: var(--bg-primary); color: var(--text-primary); border: 1px solid var(--border-color); border-radius: 4px;" onchange="window.sheetNavigator.setCertStatusFilter(this.value)">
                <option value="all" ${this.filterCertStatus === 'all' ? 'selected' : ''}>All Statuses</option>
                <option value="OK" ${this.filterCertStatus === 'OK' ? 'selected' : ''}>🟢 OK</option>
                <option value="UPCOMING" ${this.filterCertStatus === 'UPCOMING' ? 'selected' : ''}>🔵 Upcoming (&lt;90d)</option>
                <option value="WARNING" ${this.filterCertStatus === 'WARNING' ? 'selected' : ''}>🟡 Warning (&lt;60d)</option>
                <option value="CRITICAL" ${this.filterCertStatus === 'CRITICAL' ? 'selected' : ''}>🟠 Critical (&lt;30d)</option>
                <option value="EXPIRED" ${this.filterCertStatus === 'EXPIRED' ? 'selected' : ''}>🔴 Expired</option>
                <option value="MISSING" ${this.filterCertStatus === 'MISSING' ? 'selected' : ''}>❌ Missing</option>
              </select>
            </div>

            <!-- Location Selector -->
            ${uniqueLocs.length > 0 ? `
              <div style="display: flex; align-items: center; gap: 4px;">
                <span style="color: var(--text-muted); font-weight: 600; white-space: nowrap;">📍 Location:</span>
                <select style="padding: 4px 8px; font-size: 11px; background: var(--bg-primary); color: var(--text-primary); border: 1px solid var(--border-color); border-radius: 4px;" onchange="window.sheetNavigator.setCertLocationFilter(this.value)">
                  <option value="all" ${this.filterCertLocation === 'all' ? 'selected' : ''}>All Locations (${uniqueLocs.length})</option>
                  ${uniqueLocs.map(l => `<option value="${this.escapeHtml(l)}" ${this.filterCertLocation.toLowerCase() === l.toLowerCase() ? 'selected' : ''}>${this.escapeHtml(l)}</option>`).join('')}
                </select>
              </div>
            ` : ''}

            ${isFiltered ? `
              <button class="btn btn-secondary" style="padding: 3px 8px; font-size: 11px; color: #f87171;" onclick="window.sheetNavigator.resetCertFilters()">❌ Clear Filters</button>
            ` : ''}
          </div>

          <!-- Quick Sort Row -->
          <div style="padding: 6px 16px; display: flex; align-items: center; gap: 6px; font-size: 11px; overflow-x: auto; flex-wrap: wrap;">
            <span style="color: var(--text-muted); font-weight: 600; white-space: nowrap;">⚡ Quick Sort:</span>
            <button class="btn btn-secondary ${isNameSorted ? 'active' : ''}" style="padding: 2px 7px; font-size: 11px; white-space: nowrap;" onclick="window.sheetNavigator.setPresetSort('name')">👤 Employee${dirArrow(isNameSorted)}</button>
            <button class="btn btn-secondary ${isCertSorted ? 'active' : ''}" style="padding: 2px 7px; font-size: 11px; white-space: nowrap;" onclick="window.sheetNavigator.setPresetSort('type')">📜 Cert Type${dirArrow(isCertSorted)}</button>
            <button class="btn btn-secondary ${isExpSorted ? 'active' : ''}" style="padding: 2px 7px; font-size: 11px; white-space: nowrap;" onclick="window.sheetNavigator.setPresetSort('changeOutDate')">📅 Expiration Date${dirArrow(isExpSorted)}</button>
            <button class="btn btn-secondary ${isDaysSorted ? 'active' : ''}" style="padding: 2px 7px; font-size: 11px; white-space: nowrap;" onclick="window.sheetNavigator.setPresetSort('daysLeft')">⏳ Days Left${dirArrow(isDaysSorted)}</button>
            <button class="btn btn-secondary ${isStatSorted ? 'active' : ''}" style="padding: 2px 7px; font-size: 11px; white-space: nowrap;" onclick="window.sheetNavigator.setPresetSort('status')">🏷️ Status${dirArrow(isStatSorted)}</button>
            <button class="btn btn-secondary ${isLocSorted ? 'active' : ''}" style="padding: 2px 7px; font-size: 11px; white-space: nowrap;" onclick="window.sheetNavigator.setPresetSort('location')">📍 Location${dirArrow(isLocSorted)}</button>
            <button class="btn btn-secondary ${isJobSorted ? 'active' : ''}" style="padding: 2px 7px; font-size: 11px; white-space: nowrap;" onclick="window.sheetNavigator.setPresetSort('jobNumber')">🔢 Job #${dirArrow(isJobSorted)}</button>
          </div>
        </div>
      `;
    } else if (this.currentSheetKey === 'training_tracking') {
      const isMonthSorted = this.sortCol && this.sortCol.toLowerCase().includes('month');
      const isJobSorted = this.sortCol && (this.sortCol.toLowerCase().includes('job') || this.sortCol.toLowerCase().includes('crew'));
      const isTopicSorted = this.sortCol && (this.sortCol.toLowerCase().includes('topic') || this.sortCol.toLowerCase().includes('training'));
      const isLeadSorted = this.sortCol && (this.sortCol.toLowerCase().includes('lead') || this.sortCol.toLowerCase().includes('foreman'));
      const isStatSorted = this.sortCol && this.sortCol.toLowerCase().includes('status');

      presetBarHtml = `
        <div style="padding: 8px 16px; background-color: var(--bg-secondary); border-bottom: 1px solid var(--border-color); display: flex; align-items: center; gap: 6px; font-size: 12px; overflow-x: auto; flex-wrap: wrap;">
          <span style="color: var(--text-muted); font-weight: 600; white-space: nowrap;">⚡ Quick Sort:</span>
          <button class="btn btn-secondary ${isMonthSorted ? 'active' : ''}" style="padding: 3px 8px; font-size: 11px; white-space: nowrap;" onclick="window.sheetNavigator.setPresetSort('month')">📅 Month${dirArrow(isMonthSorted)}</button>
          <button class="btn btn-secondary ${isJobSorted ? 'active' : ''}" style="padding: 3px 8px; font-size: 11px; white-space: nowrap;" onclick="window.sheetNavigator.setPresetSort('jobNumber')">🔢 Crew #${dirArrow(isJobSorted)}</button>
          <button class="btn btn-secondary ${isTopicSorted ? 'active' : ''}" style="padding: 3px 8px; font-size: 11px; white-space: nowrap;" onclick="window.sheetNavigator.setPresetSort('type')">🎓 Topic${dirArrow(isTopicSorted)}</button>
          <button class="btn btn-secondary ${isLeadSorted ? 'active' : ''}" style="padding: 3px 8px; font-size: 11px; white-space: nowrap;" onclick="window.sheetNavigator.setPresetSort('assignedTo')">👤 Lead${dirArrow(isLeadSorted)}</button>
          <button class="btn btn-secondary ${isStatSorted ? 'active' : ''}" style="padding: 3px 8px; font-size: 11px; white-space: nowrap;" onclick="window.sheetNavigator.setPresetSort('status')">🏷️ Status${dirArrow(isStatSorted)}</button>
        </div>
      `;
    }

    let html = presetBarHtml + `<table class="data-table"><thead><tr>`;

    headers.forEach((h) => {
      let sortIndicator = '';
      if (this.sortCol === h) {
        sortIndicator = this.sortDir === 'asc' ? ' ▲' : ' ▼';
      } else if (this.multiSort && this.multiSort.includes(h)) {
        sortIndicator = ` [${this.multiSort.indexOf(h) + 1}]`;
      }

      html += `<th style="cursor: pointer; user-select: none;" onclick="window.sheetNavigator.setSort('${this.escapeHtml(h)}')" title="Click to sort by ${this.escapeHtml(h)}">
        ${this.escapeHtml(h)}<span style="color: var(--accent); font-weight: bold;">${sortIndicator}</span>
      </th>`;
    });
    if (this.currentSheetKey === 'expiring_certs') {
      html += `<th style="width: 48px; text-align: center;">Action</th>`;
    }
    html += `</tr></thead><tbody>`;

    const isJobTracking = this.currentSheetKey === 'job_tracking';
    const isCompliance = this.currentSheetKey === 'safety_compliance';
    const isEmployees = this.currentSheetKey === 'employees';
    const isTraining = this.currentSheetKey === 'training_tracking';
    let lastRenderedWeek = null;
    let lastRenderedLoc = null;
    let lastRenderedJob = null;
    let lastRenderedMonth = null;

    rows.forEach((row, rowIdx) => {
      let sheetRowIdx = row._rowIdx;
      if (!sheetRowIdx && tableData.rawGrid) {
        const itemVal = String(row['Serial #'] || row['Item #'] || row['Glove'] || row['Sleeve'] || row['Blanket'] || row['MACK'] || row['Name'] || row['Employee Name'] || row['Job Number'] || Object.values(row)[0] || '').trim().toLowerCase();
        if (itemVal) {
          const gIdx = tableData.rawGrid.findIndex((gr, idx) => idx > 0 && String(gr[0] || '').trim().toLowerCase() === itemVal);
          if (gIdx !== -1) sheetRowIdx = gIdx + 1;
        }
      }
      if (!sheetRowIdx && tableData.rows) {
        const rIdx = tableData.rows.indexOf(row);
        if (rIdx !== -1) sheetRowIdx = rIdx + 2;
      }
      if (!sheetRowIdx) sheetRowIdx = rowIdx + 2;
      row._rowIdx = sheetRowIdx;

      const currentWeekVal = String(row['Week Start'] || row['Week'] || '').trim();
      const currentLocVal = String(row['Location'] || '').trim();
      const currentJobVal = String(row['Job Number'] || row['Crew'] || row['Job #'] || '').trim();
      const currentMonthVal = String(row['Month'] || row['Scheduled Month'] || '').trim();

      // Week Divider Banner for Safety Compliance
      if (isCompliance && currentWeekVal && currentWeekVal !== lastRenderedWeek) {
        lastRenderedWeek = currentWeekVal;
        
        // Calculate stats for this specific week from all raw rows in this week
        const weekRows = (tableData.rows || []).filter(r => String(r['Week Start'] || r['Week'] || '').trim() === currentWeekVal);
        const totalInWeek = weekRows.length;
        const compInWeek = weekRows.filter(r => String(r['Status'] || '').toLowerCase() === 'complete').length;
        const missingInWeek = weekRows.filter(r => String(r['Status'] || '').toLowerCase().includes('missing')).length;
        const pendingInWeek = weekRows.filter(r => String(r['Status'] || '').toLowerCase() === 'pending').length;
        const resolvedInWeek = weekRows.filter(r => String(r['Status'] || '').toLowerCase() === 'resolved').length;
        const pctInWeek = totalInWeek > 0 ? Math.round((compInWeek / totalInWeek) * 100) : 0;

        html += `
          <tr style="background: linear-gradient(90deg, #1e3a8a 0%, #0f172a 100%);">
            <td colspan="${headers.length}" style="padding: 10px 16px; border-top: 3px solid #3b82f6; border-bottom: 2px solid #3b82f6;">
              <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px;">
                <div style="font-size: 13.5px; font-weight: 800; color: #93c5fd; display: flex; align-items: center; gap: 8px;">
                  <span>📅</span> Week of ${this.escapeHtml(currentWeekVal)}
                  <span class="badge" style="background: rgba(59, 130, 246, 0.3); color: #bfdbfe; font-size: 11px; padding: 2px 8px; border-radius: 12px;">
                    ${totalInWeek} Crews
                  </span>
                </div>
                <div style="display: flex; align-items: center; gap: 10px; font-size: 11.5px; flex-wrap: wrap;">
                  <span style="color: #4ade80; font-weight: 700;">✅ ${compInWeek} Compliant</span>
                  ${missingInWeek > 0 ? `<span style="color: #f87171; font-weight: 700;">❌ ${missingInWeek} Missing</span>` : ''}
                  ${pendingInWeek > 0 ? `<span style="color: #facc15; font-weight: 700;">⏳ ${pendingInWeek} Pending</span>` : ''}
                  ${resolvedInWeek > 0 ? `<span style="color: #60a5fa; font-weight: 700;">🔵 ${resolvedInWeek} Resolved</span>` : ''}
                  <span class="badge" style="background: ${pctInWeek >= 100 ? '#15803d' : (pctInWeek >= 80 ? '#0369a1' : '#b91c1c')}; color: #fff; padding: 2px 8px; border-radius: 4px; font-weight: 800;">
                    ${pctInWeek}% Compliant
                  </span>
                </div>
              </div>
            </td>
          </tr>
        `;
      }

      // Month Divider Banner for Training Tracking
      const isSortedByMonth = isTraining && this.sortCol && this.sortCol.toLowerCase().includes('month');
      if (isSortedByMonth && currentMonthVal && currentMonthVal !== lastRenderedMonth) {
        lastRenderedMonth = currentMonthVal;
        html += `
          <tr style="background: linear-gradient(90deg, #312e81 0%, #1e293b 100%);">
            <td colspan="${headers.length}" style="padding: 8px 16px; font-size: 13px; font-weight: 800; color: #a5b4fc; text-align: left; border-top: 3px solid #6366f1; border-bottom: 1px solid #6366f1;">
              📅 Month: ${this.escapeHtml(currentMonthVal)}
            </td>
          </tr>
        `;
      }

      // Location Divider Banner for Employees (when sorted by Location or Location + Job #)
      const isSortedByLoc = this.sortCol === 'Location' || (this.multiSort && this.multiSort[0] === 'Location');
      if (isEmployees && isSortedByLoc && currentLocVal && currentLocVal !== lastRenderedLoc) {
        lastRenderedLoc = currentLocVal;
        html += `
          <tr style="background: linear-gradient(90deg, #4c1d95 0%, #1e293b 100%);">
            <td colspan="${headers.length}" style="padding: 8px 16px; font-size: 13px; font-weight: 800; color: #c4b5fd; text-align: left; border-top: 3px solid #8b5cf6; border-bottom: 1px solid #8b5cf6;">
              📍 Location: ${this.escapeHtml(currentLocVal)}
            </td>
          </tr>
        `;
      }

      // Job Number Divider Banner for Employees (when sorted solely by Job Number)
      const isSortedByJob = this.sortCol === 'Job Number' && !this.multiSort;
      if (isEmployees && isSortedByJob && currentJobVal && currentJobVal !== lastRenderedJob) {
        lastRenderedJob = currentJobVal;
        html += `
          <tr style="background: linear-gradient(90deg, #1e3a8a 0%, #1e293b 100%);">
            <td colspan="${headers.length}" style="padding: 8px 16px; font-size: 13px; font-weight: 800; color: #93c5fd; text-align: left; border-top: 3px solid #3b82f6; border-bottom: 1px solid #3b82f6;">
              🔢 Job #${this.escapeHtml(currentJobVal)}
            </td>
          </tr>
        `;
      }

      const isEquipmentSheet = ['gloves', 'sleeves', 'blankets', 'macks', 'hv_testers', 'phasing_sets', 'aed', 'grounds', 'hot_sticks'].includes(this.currentSheetKey);

      html += `<tr>`;

      headers.forEach((h, colIdx) => {
        let val = row[h] !== undefined ? row[h] : '';
        const hLower = h.toLowerCase();
        let customCellHtml = null;

        // Job Tracking Conditional Formatting
        if (isJobTracking) {
          if (hLower === 'status' || hLower === 'job status') {
            const statusStr = String(val).trim();
            const jobNum = String(row['Job Number'] || row['Job #'] || row['Crew'] || '').trim();
            let badgeBg = '#15803d';
            let icon = '🟢';
            if (statusStr === 'Active') { badgeBg = '#15803d'; icon = '🟢'; }
            else if (statusStr === 'Pending Start') { badgeBg = '#b45309'; icon = '🟡'; }
            else if (statusStr === 'Completed') { badgeBg = '#0369a1'; icon = '🏁'; }
            else if (statusStr === 'On Hold') { badgeBg = '#64748b'; icon = '⏸️'; }

            customCellHtml = `
              <div style="display: inline-flex; align-items: center; gap: 6px;">
                <span class="badge" style="background-color: ${badgeBg}; color: #fff; padding: 2px 8px; border-radius: 4px; font-weight: 700;">${icon} ${this.escapeHtml(statusStr)}</span>
                <button class="btn btn-secondary" style="padding: 1px 5px; font-size: 10px; border-radius: 3px; cursor: pointer;" title="Manage Job Lifecycle / Schedule" onclick="window.sheetNavigator.showJobLifecycleModal('${this.escapeHtml(jobNum)}')">⚙️</button>
              </div>
            `;
          } else if (hLower.startsWith('skip ')) {
            const isChecked = val === true || val === 'TRUE' || val === 'true';
            customCellHtml = `<span style="cursor: pointer; font-size: 14px;" data-toggle-checkbox="${sheetRowIdx}" data-col="${colIdx + 1}" data-sheet="${this.escapeHtml(tableData.name)}" data-header="${this.escapeHtml(h)}">${isChecked ? '☑️' : '⬜'}</span>`;
          } else if (hLower.includes('job number') || hLower === 'job #') {
            customCellHtml = `<span style="font-family: monospace; font-weight: bold; color: #60a5fa;">${this.escapeHtml(val)}</span>`;
          }
        }

        // Safety Compliance Formatting
        if (this.currentSheetKey === 'safety_compliance') {
          const vStr = String(val).trim();
          if (vStr === '✅' || vStr === '✅L' || vStr.startsWith('✅')) {
            const isLate = vStr.includes('L');
            customCellHtml = `<span style="font-size: 14px; display: inline-flex; align-items: center; justify-content: center; gap: 2px;" title="${isLate ? 'Completed Late (Received after deadline)' : 'Submitted on time'}">✅${isLate ? '<span style="font-size: 9.5px; font-weight: 800; color: #f59e0b;">L</span>' : ''}</span>`;
          } else if (vStr === '❌' || vStr === '❌W' || vStr.startsWith('❌')) {
            const isWarning = vStr.includes('W');
            customCellHtml = `<span style="font-size: 14px; display: inline-flex; align-items: center; justify-content: center; gap: 2px;" title="${isWarning ? 'Missing Report Warning' : 'Missing Report'}">❌${isWarning ? '<span style="font-size: 9.5px; font-weight: 800; color: #ef4444;">W</span>' : ''}</span>`;
          } else if (vStr === '⏳' || vStr.includes('⏳')) {
            customCellHtml = `<span style="font-size: 14px;" title="Pending / Not yet submitted">⏳</span>`;
          } else if (vStr === 'N/A' || vStr === 'n/a') {
            customCellHtml = `<span style="color: #64748b; font-size: 11px; font-weight: 600;" title="Not Applicable / Scheduled Off">N/A</span>`;
          } else if (hLower === 'status') {
            if (vStr === 'Complete') {
              customCellHtml = `<span class="badge" style="background-color: #15803d; color: #fff; padding: 2px 8px; border-radius: 4px; font-weight: 700;">✅ Complete</span>`;
            } else if (vStr === 'Missing Reports') {
              customCellHtml = `<span class="badge" style="background-color: #dc2626; color: #fff; padding: 2px 8px; border-radius: 4px; font-weight: 700;">❌ Missing Reports</span>`;
            } else if (vStr === 'Pending') {
              customCellHtml = `<span class="badge" style="background-color: #d97706; color: #fff; padding: 2px 8px; border-radius: 4px; font-weight: 700;">⏳ Pending</span>`;
            } else if (vStr === 'Resolved') {
              customCellHtml = `<span class="badge" style="background-color: #2563eb; color: #fff; padding: 2px 8px; border-radius: 4px; font-weight: 700;">🔵 Resolved</span>`;
            }
          } else if (vStr.endsWith('%')) {
            const pct = parseFloat(vStr);
            const color = pct >= 100 ? '#15803d' : (pct >= 80 ? '#0369a1' : '#b91c1c');
            customCellHtml = `<span class="badge" style="background-color: ${color}; color: #fff; padding: 2px 8px; border-radius: 4px; font-weight: 700;">${this.escapeHtml(vStr)}</span>`;
          } else if (hLower.includes('crew') || hLower.includes('job')) {
            customCellHtml = `<span style="font-family: monospace; font-weight: bold; color: #60a5fa;">${this.escapeHtml(val)}</span>`;
          } else if (hLower.includes('foreman') || hLower.includes('lead')) {
            const foremanStr = String(val).trim();
            if (foremanStr) {
              customCellHtml = `<span style="font-weight: 600; color: #93c5fd; cursor: pointer; text-decoration: underline dotted;" title="Click to view profile for ${this.escapeHtml(foremanStr)}" onclick="if(window.employeeProfileEngine){window.employeeProfileEngine.openProfileModal('${this.escapeJs(foremanStr)}');}">👤 ${this.escapeHtml(val)}</span>`;
            }
          }
        }

        // Expiring Certs Formatting
        if (this.currentSheetKey === 'expiring_certs') {
          const vStr = String(val || '').trim();
          const sUpper = vStr.toUpperCase();
          if (hLower === 'status') {
            if (sUpper === 'OK' || sUpper.includes('OK')) {
              customCellHtml = `<span class="badge" style="background-color: #15803d; color: #fff; padding: 2px 8px; border-radius: 4px; font-weight: 700;">🟢 OK</span>`;
            } else if (sUpper === 'UPCOMING') {
              customCellHtml = `<span class="badge" style="background-color: #0284c7; color: #fff; padding: 2px 8px; border-radius: 4px; font-weight: 700;">🔵 Upcoming</span>`;
            } else if (sUpper === 'WARNING') {
              customCellHtml = `<span class="badge" style="background-color: #d97706; color: #fff; padding: 2px 8px; border-radius: 4px; font-weight: 700;">🟡 Warning</span>`;
            } else if (sUpper === 'CRITICAL') {
              customCellHtml = `<span class="badge" style="background-color: #ea580c; color: #fff; padding: 2px 8px; border-radius: 4px; font-weight: 700;">🟠 Critical</span>`;
            } else if (sUpper === 'EXPIRED') {
              customCellHtml = `<span class="badge" style="background-color: #dc2626; color: #fff; padding: 2px 8px; border-radius: 4px; font-weight: 700;">🔴 Expired</span>`;
            } else if (sUpper === 'MISSING') {
              customCellHtml = `<span class="badge" style="background-color: #991b1b; color: #fff; padding: 2px 8px; border-radius: 4px; font-weight: 700;">❌ Missing</span>`;
            } else if (sUpper === 'DECLINED') {
              customCellHtml = `<span class="badge" style="background-color: #475569; color: #fff; padding: 2px 8px; border-radius: 4px; font-weight: 700;">🚫 Declined</span>`;
            } else if (sUpper === 'NOT REQUIRED' || sUpper.includes('NOT REQ')) {
              customCellHtml = `<span class="badge" style="background-color: #334155; color: #94a3b8; padding: 2px 8px; border-radius: 4px; font-weight: 600;">⚪ Not Required</span>`;
            }
          } else if (hLower.includes('days')) {
            const num = parseFloat(vStr);
            if (!isNaN(num)) {
              if (num <= 0) {
                customCellHtml = `<span style="color: #ef4444; font-weight: 800;">${this.escapeHtml(vStr)}d</span>`;
              } else if (num <= 30) {
                customCellHtml = `<span style="color: #f97316; font-weight: 700;">${this.escapeHtml(vStr)}d</span>`;
              } else if (num <= 60) {
                customCellHtml = `<span style="color: #eab308; font-weight: 600;">${this.escapeHtml(vStr)}d</span>`;
              } else {
                customCellHtml = `<span style="color: #4ade80;">${this.escapeHtml(vStr)}d</span>`;
              }
            }
          } else if (hLower.includes('employee') || hLower === 'name') {
            const empNameStr = String(val).trim();
            if (empNameStr) {
              customCellHtml = `<span style="font-weight: 600; color: #60a5fa; cursor: pointer; text-decoration: underline dotted;" title="Click to view full profile, assignments & certs for ${this.escapeHtml(empNameStr)}" onclick="if(window.employeeProfileEngine){window.employeeProfileEngine.openProfileModal('${this.escapeJs(empNameStr)}');}">👤 ${this.escapeHtml(val)}</span>`;
            } else {
              customCellHtml = `<span style="color: var(--text-muted);">—</span>`;
            }
          } else if (hLower.includes('job') || hLower === 'job #') {
            customCellHtml = `<span style="font-family: monospace; font-weight: bold; color: #60a5fa;">${this.escapeHtml(val)}</span>`;
          } else if (hLower.includes('sms')) {
            const rowEmp = String(row['Employee Name'] || row['Employee'] || row['Name'] || '').trim();
            const certType = String(row['Item Type'] || row['Cert Type'] || row['Type'] || '').trim();
            const expDate = String(row['Expiration Date'] || row['Expiration'] || '').trim();

            if (vStr.includes('Sent') || vStr.includes('Notified')) {
              customCellHtml = `<button class="btn btn-secondary" style="font-size: 11px; padding: 2px 8px; background: rgba(59, 130, 246, 0.2); color: #93c5fd; border: 1px solid rgba(59, 130, 246, 0.4); cursor: pointer; border-radius: 4px;" title="Notification logged (${this.escapeHtml(vStr)}). Click to resend SMS." onclick="if(window.smsDialogEngine){window.smsDialogEngine.openCertSms('${this.escapeJs(rowEmp)}', '${this.escapeJs(certType)}', '${this.escapeJs(expDate)}', ${sheetRowIdx}, ${colIdx + 1});}">📱 ${this.escapeHtml(val)}</button>`;
            } else {
              customCellHtml = `<button class="btn btn-primary" style="font-size: 11px; padding: 2px 8px; background-color: #f59e0b; border: 1px solid #d97706; color: #fff; font-weight: 700; cursor: pointer; border-radius: 4px; display: inline-flex; align-items: center; gap: 4px; box-shadow: 0 1px 3px rgba(0,0,0,0.2);" title="Send SMS reminder to ${this.escapeHtml(rowEmp)}" onclick="if(window.smsDialogEngine){window.smsDialogEngine.openCertSms('${this.escapeJs(rowEmp)}', '${this.escapeJs(certType)}', '${this.escapeJs(expDate)}', ${sheetRowIdx}, ${colIdx + 1});}">💬 Send SMS</button>`;
            }
          }
        }

        // Training Tracking Formatting
        if (this.currentSheetKey === 'training_tracking') {
          const vStr = String(val || '').trim();
          const sLower = vStr.toLowerCase();
          if (hLower === 'status' || hLower === 'training status') {
            if (sLower === 'completed' || sLower === 'complete' || sLower === 'done') {
              customCellHtml = `<span class="badge" style="background-color: #15803d; color: #fff; padding: 2px 8px; border-radius: 4px; font-weight: 700;">✅ Completed</span>`;
            } else if (sLower === 'scheduled' || sLower === 'pending') {
              customCellHtml = `<span class="badge" style="background-color: #d97706; color: #fff; padding: 2px 8px; border-radius: 4px; font-weight: 700;">⏳ Scheduled</span>`;
            } else if (sLower === 'on hold' || sLower === 'postponed') {
              customCellHtml = `<span class="badge" style="background-color: #7c3aed; color: #fff; padding: 2px 8px; border-radius: 4px; font-weight: 600;">⏸️ On Hold</span>`;
            } else if (sLower === 'cancelled' || sLower === 'canceled') {
              customCellHtml = `<span class="badge" style="background-color: #475569; color: #cbd5e1; padding: 2px 8px; border-radius: 4px; font-weight: 600;">❌ Cancelled</span>`;
            }
          } else if (hLower.includes('lead') || hLower.includes('foreman')) {
            const leadName = String(val).trim();
            if (leadName) {
              customCellHtml = `<span style="font-weight: 600; color: #60a5fa; cursor: pointer; text-decoration: underline dotted;" title="Click to view profile & certs for ${this.escapeHtml(leadName)}" onclick="if(window.employeeProfileEngine){window.employeeProfileEngine.openProfileModal('${this.escapeJs(leadName)}');}">👤 ${this.escapeHtml(val)}</span>`;
            }
          } else if (hLower.includes('month')) {
            customCellHtml = `<span style="font-weight: 700; color: #a78bfa;">📅 ${this.escapeHtml(val)}</span>`;
          } else if (hLower.includes('crew') || hLower.includes('job')) {
            customCellHtml = `<span style="font-family: monospace; font-weight: bold; color: #60a5fa;">${this.escapeHtml(val)}</span>`;
          } else if (hLower.includes('size') || hLower.includes('hours')) {
            customCellHtml = `<span style="font-weight: 600; color: #94a3b8;">${this.escapeHtml(val)}</span>`;
          }
        }

        // Equipment Sheet Formatting (Clickable Glove / Sleeve / Item # for Lifecycle Dossier)
        const isEquipmentSheet = ['gloves', 'sleeves', 'blankets', 'macks', 'hv_testers', 'phasing_sets', 'aed', 'grounds', 'hot_sticks'].includes(this.currentSheetKey);
        
        let isPrimaryItemCol = false;
        if (isEquipmentSheet) {
          if (this.currentSheetKey === 'grounds') {
            // For Grounds, Serial # is the primary item key in column 0
            isPrimaryItemCol = (colIdx === 0 || ['serial #', 'serial#', 'serial', 'ground #', 'ground', 'item #', 'item'].includes(hLower));
          } else {
            // For HV Testers, Phasing Sets, AED, Gloves, Sleeves, Blankets, MACKs, Hot Sticks:
            // ONLY Column 0 / Item # / HVT # is the primary key. Secondary "Serial #" or "ESL ID" columns are NOT item keys.
            isPrimaryItemCol = (colIdx === 0 || ['glove', 'gloves', 'glove #', 'glove#', 'sleeve', 'sleeves', 'sleeve #', 'sleeve#', 'blanket', 'blankets', 'blanket #', 'blanket#', 'mack', 'macks', 'mack #', 'mack#', 'hvt', 'hvt #', 'hvt#', 'phasing set', 'phasing set #', 'aed', 'aed #', 'item #', 'item#', 'item', 'items', 'item number', 'item num'].includes(hLower));
          }
        }

        if (isEquipmentSheet && isPrimaryItemCol && val) {
          const itemKey = String(val).trim();
          const histKey = this.currentSheetKey.endsWith('_history') ? this.currentSheetKey : (this.currentSheetKey + '_history');
          customCellHtml = `<span style="font-weight: 700; color: #60a5fa; cursor: pointer; text-decoration: underline dotted; display: inline-block; padding: 2px 4px; border-radius: 4px;" title="Click to inspect lifecycle dossier for #${this.escapeHtml(itemKey)}" onclick="if(window.itemStatsEngine){window.itemStatsEngine.openDossierModal('${this.escapeJs(itemKey)}', '${this.escapeJs(histKey)}');}">${this.escapeHtml(val)}</span>`;
        } else if (isEquipmentSheet && hLower === 'esl id' && val) {
          // ESL ID is an electronic tracking tag barcode (not linked to item lifecycle)
          customCellHtml = `<span class="cell-text" style="font-family: monospace; font-size: 11px; color: #94a3b8; font-weight: 500;">${this.escapeHtml(val)}</span>`;
        } else if (isEquipmentSheet && (hLower === 'serial #' || hLower === 'serial#' || hLower === 'serial') && val) {
          // Secondary Serial # (plain text / monospace)
          customCellHtml = `<span class="cell-text" style="font-family: monospace; font-size: 11.5px; color: #cbd5e1; font-weight: 500;">${this.escapeHtml(val)}</span>`;
        } else if (isEquipmentSheet && (hLower === 'assigned to' || hLower === 'assigned' || hLower === 'holder') && val) {
          const nonEmpHolders = ['on shelf', 'in testing', 'packed for testing', 'packed for delivery', 'failed rubber', 'failed', 'lost', 'destroyed', 'new', 'unassigned', 'n/a', '—', '-'];
          const holderLower = String(val).toLowerCase().trim();
          if (!nonEmpHolders.includes(holderLower)) {
            customCellHtml = `<span class="profile-link-badge" style="color: #60a5fa; cursor: pointer; margin-right: 4px; display: inline-block;" title="Click to view assignments & certs for ${this.escapeHtml(val)}" onclick="event.stopPropagation(); if(window.employeeProfileEngine){window.employeeProfileEngine.openProfileModal('${this.escapeJs(val)}');}">👤</span><span class="cell-text" style="font-weight: 600; color: #93c5fd;">${this.escapeHtml(val)}</span>`;
          }
        }

        // Employee Sheet Formatting
        const isEmployeeNameCol = (this.currentSheetKey === 'employees' && (colIdx === 0 || hLower === 'employee name' || hLower === 'name' || hLower === 'employee'));
        if (this.currentSheetKey === 'employees') {
          if (isEmployeeNameCol) {
            const empNameStr = String(val).trim();
            if (empNameStr) {
              customCellHtml = `<span style="font-weight: 700; color: #60a5fa; cursor: pointer; text-decoration: underline dotted; display: inline-flex; align-items: center; gap: 4px; padding: 2px 4px; border-radius: 4px;" title="Click to view full profile, equipment assignments & certs for ${this.escapeHtml(empNameStr)}" onclick="if(window.employeeProfileEngine){window.employeeProfileEngine.openProfileModal('${this.escapeJs(empNameStr)}');}">👤 ${this.escapeHtml(val)}</span>`;
            }
          } else if (hLower === 'job number' || hLower === 'job #') {
            customCellHtml = `<span style="font-family: monospace; font-weight: bold; color: #60a5fa;">${this.escapeHtml(val)}</span>`;
          } else if (hLower === 'location') {
            customCellHtml = `<span style="font-weight: 600; color: #a78bfa;">📍 ${this.escapeHtml(val)}</span>`;
          }
        }

        const isSmsCol = hLower.includes('sms');
        const isEditable = !isPrimaryItemCol && !isEmployeeNameCol && !isSmsCol && !hLower.includes('change out') && !hLower.startsWith('skip ');
        const itemIdentifier = String(row['Item #'] || row['HVT #'] || row['Phasing Set #'] || row['AED #'] || row['Glove'] || row['Sleeve'] || row['Blanket'] || row['MACK'] || row['Serial #'] || row['Name'] || row['Employee Name'] || row['Job Number'] || Object.values(row)[0] || '').trim();

        html += `<td class="${isEditable ? 'editable' : ''}" 
                     contenteditable="${isEditable}" 
                     data-row="${sheetRowIdx}" 
                     data-col="${colIdx + 1}" 
                     data-header="${this.escapeHtml(h)}"
                     data-item="${this.escapeHtml(itemIdentifier)}"
                     data-sheet="${this.escapeHtml(tableData.name)}">${customCellHtml !== null ? customCellHtml : this.escapeHtml(val)}</td>`;
      });
      if (this.currentSheetKey === 'expiring_certs') {
        html += `<td style="text-align: center; width: 48px;">
          <button class="btn btn-secondary" style="padding: 2px 7px; font-size: 11px; color: #f87171; border-color: rgba(239, 68, 68, 0.35); background: rgba(239, 68, 68, 0.08); cursor: pointer;" onclick="window.sheetNavigator.deleteCertRow(${sheetRowIdx})" title="Delete this certification record">🗑️</button>
        </td>`;
      }
      html += `</tr>`;
    });

    html += `</tbody></table>`;
    container.innerHTML = html;

    // Attach inline edit handlers
    container.querySelectorAll('td.editable').forEach(td => {
      let initialVal = '';
      td.addEventListener('focus', (e) => {
        const targetCell = td;
        const cellTextSpan = targetCell.querySelector('.cell-text');
        if (cellTextSpan) {
          initialVal = cellTextSpan.textContent.trim();
        } else {
          initialVal = targetCell.textContent.trim().replace(/^👤\s*/, '').trim();
        }
      });

      // Quick calendar picker on double-click for date cells
      td.addEventListener('dblclick', (e) => {
        const header = (td.dataset.header || '').toLowerCase();
        if (header.includes('date') || header.includes('expiration') || header.includes('calibration')) {
          const targetCell = td;
          const currentText = targetCell.textContent.trim();
          let isoVal = '';
          if (/^\d{4}-\d{2}-\d{2}$/.test(currentText)) isoVal = currentText;
          else if (currentText.includes('/')) {
            const p = currentText.split('/');
            if (p.length === 3) {
              const m = String(parseInt(p[0], 10)).padStart(2, '0');
              const d = String(parseInt(p[1], 10)).padStart(2, '0');
              let y = parseInt(p[2], 10);
              if (y < 100) y = 2000 + y;
              isoVal = `${y}-${m}-${d}`;
            }
          }
          const picker = document.createElement('input');
          picker.type = 'date';
          picker.value = isoVal || new Date().toISOString().split('T')[0];
          picker.style.position = 'absolute';
          picker.style.opacity = '0';
          picker.style.pointerEvents = 'none';
          document.body.appendChild(picker);
          picker.addEventListener('change', () => {
            if (picker.value) {
              const p = picker.value.split('-');
              const mdY = `${p[1]}/${p[2]}/${p[0]}`;
              targetCell.textContent = mdY;
              targetCell.focus();
              targetCell.blur();
            }
            picker.remove();
          });
          if (typeof picker.showPicker === 'function') {
            try { picker.showPicker(); } catch (_) { picker.click(); }
          }
        }
      });

      td.addEventListener('blur', async (e) => {
        try {
          const targetCell = td;
          const cellTextSpan = targetCell.querySelector('.cell-text');
          let newVal = (cellTextSpan ? cellTextSpan.textContent : targetCell.textContent).trim().replace(/^👤\s*/, '').trim();
          const header = targetCell.dataset.header || '';
          const hLower = header.toLowerCase();
          const isDateCol = hLower.includes('date') || hLower.includes('expiration') || hLower.includes('calibration');

          if (isDateCol && newVal) {
            // Normalize date to MM/DD/YYYY format
            if (newVal.includes('/')) {
              const p = newVal.split('/');
              if (p.length === 3) {
                const m = String(parseInt(p[0], 10)).padStart(2, '0');
                const d = String(parseInt(p[1], 10)).padStart(2, '0');
                let y = parseInt(p[2], 10);
                if (y < 100) y = 2000 + y;
                newVal = `${m}/${d}/${y}`;
              }
            } else if (/^\d{4}-\d{2}-\d{2}$/.test(newVal)) {
              const p = newVal.split('-');
              newVal = `${p[1]}/${p[2]}/${p[0]}`;
            }
            targetCell.textContent = newVal;
          }

          const sheetName = targetCell.dataset.sheet || (tableData ? tableData.name : this.currentSheetKey);
          const row = parseInt(targetCell.dataset.row, 10);
          const col = parseInt(targetCell.dataset.col, 10);
          const itemIdentifier = targetCell.dataset.item || '';

          const tableData = this.db.getTable(this.currentSheetKey);
          let tableRow = null;
          let actualRowIdx = row;

          if (tableData) {
            if (itemIdentifier && tableData.rows) {
              tableRow = tableData.rows.find(r => {
                const id = String(r['Serial #'] || r['Item #'] || r['Glove'] || r['Sleeve'] || r['Blanket'] || r['MACK'] || r['Name'] || r['Employee Name'] || r['Job Number'] || Object.values(r)[0] || '').trim();
                return id.toLowerCase() === itemIdentifier.toLowerCase();
              });
            }
            if (itemIdentifier && tableData.rawGrid) {
              const gIdx = tableData.rawGrid.findIndex((gr, idx) => idx > 0 && String(gr[0] || '').trim().toLowerCase() === itemIdentifier.toLowerCase());
              if (gIdx !== -1) {
                actualRowIdx = gIdx + 1;
              }
            }
            if (!tableRow && tableData.rows && tableData.rows[actualRowIdx - 2]) {
              tableRow = tableData.rows[actualRowIdx - 2];
            }
          }

          const isAssignedCol = (hLower.includes('assigned') || hLower === 'holder') && !hLower.includes('date');
          const isStatusCol = hLower === 'status' || hLower === 'item status';
          const valLower = newVal.toLowerCase();
          const isInventorySheet = ['gloves', 'sleeves', 'blankets', 'macks', 'hv_testers', 'phasing_sets', 'aed', 'grounds', 'hot_sticks'].includes(this.currentSheetKey);
          const isOnShelf = valLower === 'on shelf' || valLower === 'onshelf' || valLower === 'shelf';

          const isUnreconciledShelf = (isAssignedCol || isStatusCol) && isOnShelf && isInventorySheet && tableRow && (tableRow['Status'] !== 'On Shelf' || tableRow['Location'] !== 'Helena');

          if (newVal === initialVal && !isUnreconciledShelf) return; // No change made!

          const queueCell = async (hName, val) => {
            if (!hName || val === undefined || !tableData) return;
            const cIdx = (tableData.headers || []).indexOf(hName);
            if (cIdx !== -1) {
              await this.db.addMutation({
                action: 'UPDATE_CELL',
                sheetName: sheetName,
                row: actualRowIdx,
                col: cIdx + 1,
                header: hName,
                itemIdentifier: itemIdentifier,
                value: val
              });
            }
          };

          const parentTr = targetCell.closest('tr');
          const updateRowCell = (hName, v) => {
            if (!parentTr || !hName) return;
            const c = parentTr.querySelector(`td[data-header="${hName}"]`);
            if (c) {
              const hNameLower = hName.toLowerCase();
              const isHoldCol = (hNameLower.includes('assigned') || hNameLower === 'holder') && !hNameLower.includes('date');
              if (isHoldCol && v && !['on shelf', 'in testing', 'packed for testing', 'packed for delivery', 'failed rubber', 'failed', 'lost', 'destroyed', 'new', 'unassigned', 'n/a', '—', '-'].includes(v.toLowerCase())) {
                c.innerHTML = `<span class="profile-link-badge" style="color: #60a5fa; cursor: pointer; margin-right: 4px; display: inline-block;" title="Click to view assignments & certs for ${this.escapeHtml(v)}" onclick="event.stopPropagation(); if(window.employeeProfileEngine){window.employeeProfileEngine.openProfileModal('${this.escapeJs(v)}');}">👤</span><span class="cell-text" style="font-weight: 600; color: #93c5fd;">${this.escapeHtml(v)}</span>`;
              } else {
                c.textContent = v;
              }
            }
          };

          const flashSuccess = () => {
            targetCell.style.transition = 'background-color 0.2s ease';
            targetCell.style.backgroundColor = 'rgba(34, 197, 94, 0.25)';
            setTimeout(() => {
              targetCell.style.backgroundColor = '';
            }, 450);
          };

          const syncTableRowToGrid = () => {
            if (tableData && tableData.rawGrid && actualRowIdx && tableData.rawGrid[actualRowIdx - 1] && tableRow) {
              const gRow = tableData.rawGrid[actualRowIdx - 1];
              (tableData.headers || []).forEach((h, cIdx) => {
                if (tableRow[h] !== undefined) gRow[cIdx] = tableRow[h];
              });
            }
          };

          const isFailedRubber = valLower === 'failed rubber' || valLower === 'failed' || valLower === 'not repairable';

          if ((isAssignedCol || isStatusCol) && isFailedRubber) {
            const curTestDate = String((tableRow && (tableRow['Test Date'] || tableRow['Calibration Date'])) || '').trim();
            const failResult = await this.promptFailedRubberReason(itemIdentifier, curTestDate);
            if (!failResult) {
              targetCell.textContent = initialVal;
              return;
            }

            const reason = typeof failResult === 'object' ? failResult.reason : failResult;
            const failTestDate = (typeof failResult === 'object' && failResult.testDate) ? failResult.testDate : '';

            const today = new Date();
            const todayFormatted = `${String(today.getMonth() + 1).padStart(2, '0')}/${String(today.getDate()).padStart(2, '0')}/${today.getFullYear()}`;

            newVal = 'Failed Rubber';
            targetCell.textContent = newVal;

            const assignedColName = (tableData.headers || []).find(h => /assigned\s*to|^assigned$|^holder$/i.test(h));
            const statusColName = (tableData.headers || []).find(h => /^status$|^item\s*status$/i.test(h));
            const locationColName = (tableData.headers || []).find(h => /^location$/i.test(h));
            const dateAssignedColName = (tableData.headers || []).find(h => /date\s*assigned/i.test(h));
            const testDateColName = (tableData.headers || []).find(h => /test\s*date|calibration/i.test(h));
            const chgOutColName = (tableData.headers || []).find(h => /change\s*out/i.test(h));
            const pickedColName = (tableData.headers || []).find(h => /picked\s*for/i.test(h));
            const notesColName = (tableData.headers || []).find(h => /^notes$|^note$/i.test(h));

            if (tableRow) {
              if (assignedColName) tableRow[assignedColName] = 'Failed Rubber';
              if (statusColName) tableRow[statusColName] = 'Failed Rubber';
              if (locationColName) tableRow[locationColName] = 'Destroyed';
              if (dateAssignedColName) tableRow[dateAssignedColName] = todayFormatted;
              if (testDateColName && failTestDate) tableRow[testDateColName] = failTestDate;
              if (chgOutColName) tableRow[chgOutColName] = 'N/A';
              if (pickedColName) tableRow[pickedColName] = '';
              if (notesColName) tableRow[notesColName] = reason;
            }

            syncTableRowToGrid();

            if (assignedColName) { await queueCell(assignedColName, 'Failed Rubber'); updateRowCell(assignedColName, 'Failed Rubber'); }
            if (statusColName) { await queueCell(statusColName, 'Failed Rubber'); updateRowCell(statusColName, 'Failed Rubber'); }
            if (locationColName) { await queueCell(locationColName, 'Destroyed'); updateRowCell(locationColName, 'Destroyed'); }
            if (dateAssignedColName) { await queueCell(dateAssignedColName, todayFormatted); updateRowCell(dateAssignedColName, todayFormatted); }
            if (testDateColName && failTestDate) { await queueCell(testDateColName, failTestDate); updateRowCell(testDateColName, failTestDate); }
            if (chgOutColName) { await queueCell(chgOutColName, 'N/A'); updateRowCell(chgOutColName, 'N/A'); }
            if (pickedColName) { await queueCell(pickedColName, ''); updateRowCell(pickedColName, ''); }
            if (notesColName) { await queueCell(notesColName, reason); updateRowCell(notesColName, reason); }

            await this.db.recordItemHistoryEvent(sheetName, tableRow, `Marked Failed Rubber: ${reason}`);
            flashSuccess();
            return;
          }

          if ((isAssignedCol || isStatusCol) && isOnShelf && isInventorySheet) {
            const curTestDate = String((tableRow && (tableRow['Test Date'] || tableRow['Calibration Date'])) || '').trim();
            const curEslId = String((tableRow && tableRow['ESL ID']) || '').trim();
            const hasEsl = (tableData.headers || []).some(h => /^esl\s*id$/i.test(h));

            const shelfDetails = await this.promptOnShelfDetails(itemIdentifier, curTestDate, curEslId, hasEsl);
            if (!shelfDetails) {
              targetCell.textContent = initialVal;
              return;
            }

            const today = new Date();
            const todayFormatted = `${String(today.getMonth() + 1).padStart(2, '0')}/${String(today.getDate()).padStart(2, '0')}/${today.getFullYear()}`;

            newVal = 'On Shelf';
            targetCell.textContent = newVal;

            const assignedColName = (tableData.headers || []).find(h => /assigned\s*to|^assigned$|^holder$/i.test(h));
            const statusColName = (tableData.headers || []).find(h => /^status$|^item\s*status$/i.test(h));
            const locationColName = (tableData.headers || []).find(h => /^location$/i.test(h));
            const dateAssignedColName = (tableData.headers || []).find(h => /date\s*assigned/i.test(h));
            const testDateColName = (tableData.headers || []).find(h => /test\s*date|calibration/i.test(h));
            const eslColName = (tableData.headers || []).find(h => /^esl\s*id$/i.test(h));
            const chgOutColName = (tableData.headers || []).find(h => /change\s*out/i.test(h));
            const pickedColName = (tableData.headers || []).find(h => /^picked\s*for$/i.test(h));

            // Calculate Shelf Change Out Date (1 year from test date, 2 years for Hot Sticks)
            let calculatedShelfDate = '';
            const tDateToUse = shelfDetails.testDate || todayFormatted;
            const parsedTest = this.parseDate(tDateToUse) || today;
            if (parsedTest) {
              const nextChg = new Date(parsedTest);
              const intervalYears = this.currentSheetKey.includes('hot_stick') ? 2 : 1;
              nextChg.setFullYear(nextChg.getFullYear() + intervalYears);
              calculatedShelfDate = this.formatDate(nextChg);
            }

            if (tableRow) {
              if (assignedColName) tableRow[assignedColName] = 'On Shelf';
              if (statusColName) tableRow[statusColName] = 'On Shelf';
              if (locationColName) tableRow[locationColName] = 'Helena';
              if (dateAssignedColName) tableRow[dateAssignedColName] = todayFormatted;
              if (testDateColName && shelfDetails.testDate) tableRow[testDateColName] = shelfDetails.testDate;
              if (eslColName && shelfDetails.eslId) tableRow[eslColName] = shelfDetails.eslId;
              if (pickedColName) tableRow[pickedColName] = '';
              if (chgOutColName && calculatedShelfDate) tableRow[chgOutColName] = calculatedShelfDate;
            }

            syncTableRowToGrid();

            if (assignedColName) { await queueCell(assignedColName, 'On Shelf'); updateRowCell(assignedColName, 'On Shelf'); }
            if (statusColName) { await queueCell(statusColName, 'On Shelf'); updateRowCell(statusColName, 'On Shelf'); }
            if (locationColName) { await queueCell(locationColName, 'Helena'); updateRowCell(locationColName, 'Helena'); }
            if (dateAssignedColName) { await queueCell(dateAssignedColName, todayFormatted); updateRowCell(dateAssignedColName, todayFormatted); }
            if (testDateColName && shelfDetails.testDate) { await queueCell(testDateColName, shelfDetails.testDate); updateRowCell(testDateColName, shelfDetails.testDate); }
            if (eslColName && shelfDetails.eslId) { await queueCell(eslColName, shelfDetails.eslId); updateRowCell(eslColName, shelfDetails.eslId); }
            if (pickedColName) { await queueCell(pickedColName, ''); updateRowCell(pickedColName, ''); }
            if (chgOutColName && calculatedShelfDate) { await queueCell(chgOutColName, calculatedShelfDate); updateRowCell(chgOutColName, calculatedShelfDate); }

            await this.db.recordItemHistoryEvent(sheetName, tableRow, `Returned to Shelf (Test Date: ${shelfDetails.testDate || todayFormatted})`);
            flashSuccess();
            return;
          }

          if (isInventorySheet && tableRow && tableData) {
            const assignedColName = (tableData.headers || []).find(h => /assigned\s*to|^assigned$|^holder$/i.test(h));
            const statusColName = (tableData.headers || []).find(h => /^status$|^item\s*status$/i.test(h));
            const locationColName = (tableData.headers || []).find(h => /^location$/i.test(h));
            const pickedColName = (tableData.headers || []).find(h => /^picked\s*for$/i.test(h));

            const curAssigned = isAssignedCol ? newVal : String(tableRow[assignedColName] || '').trim();
            const curAssignedLower = curAssigned.toLowerCase();
            const nonEmpHolders = ['on shelf', 'in testing', 'packed for testing', 'packed for delivery', 'failed rubber', 'failed', 'lost', 'destroyed', 'new', 'unassigned', 'n/a', '—', '-'];
            const isAssignedToEmp = curAssigned && !nonEmpHolders.includes(curAssignedLower);

            // When Assigned To is set or Date Assigned is entered for an assigned item, remove Picked For
            if (isAssignedToEmp) {
              if (pickedColName && tableRow[pickedColName]) {
                tableRow[pickedColName] = '';
                const pIdx = (tableData.headers || []).indexOf(pickedColName);
                if (pIdx !== -1) {
                  if (tableData.rawGrid && tableData.rawGrid[actualRowIdx - 1]) tableData.rawGrid[actualRowIdx - 1][pIdx] = '';
                  await queueCell(pickedColName, '');
                  updateRowCell(pickedColName, '');
                }
              }

              // Auto-update Status to Assigned and Location to employee location if Assigned To changed
              if (isAssignedCol) {
                if (statusColName && tableRow[statusColName] !== 'Assigned') {
                  tableRow[statusColName] = 'Assigned';
                  const sIdx = (tableData.headers || []).indexOf(statusColName);
                  if (sIdx !== -1) {
                    if (tableData.rawGrid && tableData.rawGrid[actualRowIdx - 1]) tableData.rawGrid[actualRowIdx - 1][sIdx] = 'Assigned';
                    await queueCell(statusColName, 'Assigned');
                    updateRowCell(statusColName, 'Assigned');
                  }
                }
                const empTable = this.db.getTable('employees');
                let empLoc = '';
                if (empTable && empTable.rows) {
                  const empMatch = empTable.rows.find(e => String(e['Name'] || e['Employee Name'] || Object.values(e)[0] || '').trim().toLowerCase() === curAssignedLower);
                  if (empMatch) empLoc = String(empMatch['Location'] || '').trim();
                }
                if (empLoc && locationColName) {
                  tableRow[locationColName] = empLoc;
                  const lIdx = (tableData.headers || []).indexOf(locationColName);
                  if (lIdx !== -1) {
                    if (tableData.rawGrid && tableData.rawGrid[actualRowIdx - 1]) tableData.rawGrid[actualRowIdx - 1][lIdx] = empLoc;
                    await queueCell(locationColName, empLoc);
                    updateRowCell(locationColName, empLoc);
                  }
                }
              }
            }
          }

          // 1. Update in-memory row and grid
          if (tableRow) {
            tableRow[header] = newVal;
          }
          if (tableData && tableData.rawGrid && actualRowIdx && tableData.rawGrid[actualRowIdx - 1]) {
            const cIdx = (typeof col === 'number' && col >= 1) ? (col - 1) : (tableData.headers || []).indexOf(header);
            if (cIdx !== -1) tableData.rawGrid[actualRowIdx - 1][cIdx] = newVal;
          }

          // 2. If Date Assigned, Test Date, or Calibration Date was changed on an inventory sheet, recalculate Change Out Date!
          if (isInventorySheet && tableRow && tableData) {
            const isDateAssigned = hLower.includes('date assigned');
            const isTestDate = hLower.includes('test date') || hLower.includes('calibration');

            if (isDateAssigned || isTestDate) {
              const dateAssignedColName = (tableData.headers || []).find(h => /date\s*assigned/i.test(h));
              const testDateColName = (tableData.headers || []).find(h => /test\s*date|calibration/i.test(h));
              const locationColName = (tableData.headers || []).find(h => /^location$/i.test(h));
              const assignedColName = (tableData.headers || []).find(h => /assigned\s*to|^assigned$|^holder$/i.test(h));
              const chgOutColName = (tableData.headers || []).find(h => /change\s*out/i.test(h));

              const curDateAssigned = dateAssignedColName ? (tableRow[dateAssignedColName] || '') : '';
              const curTestDate = testDateColName ? (tableRow[testDateColName] || '') : '';
              const curLoc = locationColName ? (tableRow[locationColName] || '') : '';
              const curAssignedTo = assignedColName ? (tableRow[assignedColName] || '') : '';

              const dateAssignedVal = isDateAssigned ? newVal : curDateAssigned;
              const testDateVal = isTestDate ? newVal : curTestDate;

              let calculatedChgOut = '';
              if (window.inventoryManager && typeof window.inventoryManager.calculateChangeOutDate === 'function') {
                calculatedChgOut = window.inventoryManager.calculateChangeOutDate(
                  curDateAssigned || curTestDate,
                  curLoc,
                  curAssignedTo,
                  this.currentSheetKey,
                  {
                    testDate: curTestDate,
                    calibrationDate: curTestDate
                  }
                );
              }

              if (calculatedChgOut && chgOutColName && calculatedChgOut !== 'N/A') {
                tableRow[chgOutColName] = calculatedChgOut;
                const chgIdx = (tableData.headers || []).indexOf(chgOutColName);
                if (chgIdx !== -1 && tableData.rawGrid && tableData.rawGrid[actualRowIdx - 1]) {
                  tableData.rawGrid[actualRowIdx - 1][chgIdx] = calculatedChgOut;
                }
                await queueCell(chgOutColName, calculatedChgOut);
                updateRowCell(chgOutColName, calculatedChgOut);
              }
            }
          }

          // 3. If Date Assigned was edited on an inventory sheet, sync date to matching history entry
          if (isInventorySheet && hLower.includes('date assigned') && tableRow) {
            await this.db.recordItemHistoryEvent(sheetName, tableRow, tableRow['Notes'] || '');
          }

          syncTableRowToGrid();

          await this.db.addMutation({
            action: 'UPDATE_CELL',
            sheetName: sheetName,
            row: actualRowIdx,
            col: col,
            header: header,
            itemIdentifier: itemIdentifier,
            oldValue: initialVal,
            value: newVal
          });

          // Update current cell presentation if it's Assigned To
          if (isAssignedCol && newVal) {
            const nonEmpHolders = ['on shelf', 'in testing', 'packed for testing', 'packed for delivery', 'failed rubber', 'failed', 'lost', 'destroyed', 'new', 'unassigned', 'n/a', '—', '-'];
            if (!nonEmpHolders.includes(newVal.toLowerCase())) {
              targetCell.innerHTML = `<span class="profile-link-badge" style="color: #60a5fa; cursor: pointer; margin-right: 4px; display: inline-block;" title="Click to view assignments & certs for ${this.escapeHtml(newVal)}" onclick="event.stopPropagation(); if(window.employeeProfileEngine){window.employeeProfileEngine.openProfileModal('${this.escapeJs(newVal)}');}">👤</span><span class="cell-text" style="font-weight: 600; color: #93c5fd;">${this.escapeHtml(newVal)}</span>`;
            } else {
              targetCell.textContent = newVal;
            }
          } else if (!targetCell.querySelector('.cell-text')) {
            targetCell.textContent = newVal;
          }

          flashSuccess();
        } catch (err) {
          console.error('Error committing inline edit:', err);
        }
      });

      td.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          td.blur();
        }
      });
    });

    // Attach checkbox toggle handlers
    container.querySelectorAll('[data-toggle-checkbox]').forEach(cb => {
      cb.addEventListener('click', async (e) => {
        const span = e.currentTarget;
        const sheetName = span.dataset.sheet;
        const row = parseInt(span.dataset.toggleCheckbox, 10);
        const col = parseInt(span.dataset.col, 10);
        const header = span.dataset.header;
        const isCurrentlyChecked = span.textContent === '☑️';
        const newBool = !isCurrentlyChecked;

        span.textContent = newBool ? '☑️' : '⬜';

        await this.db.addMutation({
          action: 'UPDATE_CELL',
          sheetName: sheetName,
          row: row,
          col: col,
          header: header,
          value: newBool
        });

        this.renderActiveView();
      });
    });
  }

  promptFailedRubberReason(itemIdentifier, currentTestDate = '') {
    return new Promise((resolve) => {
      const modal = document.getElementById('failed-rubber-reason-modal');
      const today = new Date();
      const todayFormatted = `${String(today.getMonth() + 1).padStart(2, '0')}/${String(today.getDate()).padStart(2, '0')}/${today.getFullYear()}`;
      const todayIso = today.toISOString().split('T')[0];

      if (!modal) {
        let defaultTest = currentTestDate || todayFormatted;
        const testPrompt = prompt(`Item ${itemIdentifier || ''} marked as Failed Rubber.\nEnter Fail / Test Date (MM/DD/YYYY):`, defaultTest);
        if (!testPrompt) return resolve(null);
        const choice = prompt(`How did it fail?\n1 - Electrical\n2 - Visual\n3 - Damaged In Field`, 'Visual');
        if (!choice) return resolve(null);
        let finalChoice = choice;
        if (choice === '1' || choice.toLowerCase() === 'electrical') finalChoice = 'Electrical';
        else if (choice === '2' || choice.toLowerCase() === 'visual') finalChoice = 'Visual';
        else if (choice === '3' || choice.toLowerCase().includes('damage') || choice.toLowerCase().includes('field')) finalChoice = 'Damaged In Field';
        return resolve({ reason: finalChoice, testDate: testPrompt.trim() });
      }

      const titleEl = document.getElementById('failed-rubber-item-title');
      if (titleEl) {
        titleEl.textContent = itemIdentifier ? `Item #${itemIdentifier} Marked as Failed Rubber` : `Item Marked as Failed Rubber`;
      }

      const testInput = document.getElementById('failed-rubber-test-date');
      const testPicker = document.getElementById('failed-rubber-test-date-picker');
      const notesInput = document.getElementById('failed-rubber-custom-notes');

      const initialTest = currentTestDate || todayFormatted;
      if (testInput) testInput.value = initialTest;
      if (testPicker) {
        if (/^\d{2}\/\d{2}\/\d{4}$/.test(initialTest)) {
          const p = initialTest.split('/');
          testPicker.value = `${p[2]}-${p[0]}-${p[1]}`;
        } else {
          testPicker.value = todayIso;
        }
      }

      if (testPicker && testInput) {
        testPicker.onchange = () => {
          if (testPicker.value) {
            const p = testPicker.value.split('-');
            testInput.value = `${p[1]}/${p[2]}/${p[0]}`;
          }
        };
        testInput.oninput = () => {
          const val = testInput.value.trim();
          if (/^\d{2}\/\d{2}\/\d{4}$/.test(val)) {
            const p = val.split('/');
            testPicker.value = `${p[2]}-${p[0]}-${p[1]}`;
          }
        };
      }

      if (notesInput) {
        notesInput.value = '';
      }

      const closeBtn = document.getElementById('failed-rubber-modal-close');
      const cancelBtn = document.getElementById('failed-rubber-modal-cancel');
      const optionBtns = modal.querySelectorAll('.failed-rubber-option-btn');

      const cleanup = () => {
        modal.classList.remove('active');
        modal.style.display = 'none';
        modal.onclick = null;
        if (closeBtn) closeBtn.onclick = null;
        if (cancelBtn) cancelBtn.onclick = null;
        if (testPicker) testPicker.onchange = null;
        if (testInput) testInput.oninput = null;
        optionBtns.forEach(b => b.onclick = null);
        document.removeEventListener('keydown', handleEsc);
      };

      const handleEsc = (e) => {
        if (e.key === 'Escape') {
          cleanup();
          resolve(null);
        }
      };

      const handleSelect = (reason) => {
        let tDate = testInput ? testInput.value.trim() : '';
        if (!tDate) tDate = todayFormatted;
        if (tDate.includes('-')) {
          const p = tDate.split('-');
          if (p.length === 3) tDate = `${p[1]}/${p[2]}/${p[0]}`;
        }

        const extraNotes = notesInput ? notesInput.value.trim() : '';
        const finalNote = extraNotes ? `${reason} - ${extraNotes}` : reason;
        cleanup();
        resolve({
          reason: finalNote,
          testDate: tDate
        });
      };

      const handleCancel = () => {
        cleanup();
        resolve(null);
      };

      modal.onclick = (e) => {
        if (e.target === modal) handleCancel();
      };
      if (closeBtn) closeBtn.onclick = handleCancel;
      if (cancelBtn) cancelBtn.onclick = handleCancel;
      document.addEventListener('keydown', handleEsc);

      optionBtns.forEach(btn => {
        btn.onclick = () => {
          const reason = btn.dataset.reason || 'Visual';
          handleSelect(reason);
        };
      });

      modal.classList.add('active');
      modal.style.display = 'flex';
      if (testInput) {
        testInput.focus();
        testInput.select();
      }
    });
  }

  promptOnShelfDetails(itemIdentifier, currentTestDate = '', currentEslId = '', hasEslCol = true) {
    return new Promise((resolve) => {
      const modal = document.getElementById('on-shelf-return-modal');
      const today = new Date();
      const todayFormatted = `${String(today.getMonth() + 1).padStart(2, '0')}/${String(today.getDate()).padStart(2, '0')}/${today.getFullYear()}`;
      const todayIso = today.toISOString().split('T')[0];

      if (!modal) {
        let defaultTest = currentTestDate || todayFormatted;
        const testPrompt = prompt(`Item ${itemIdentifier || ''} returning to On Shelf.\nEnter New Test Date (MM/DD/YYYY):`, defaultTest);
        if (!testPrompt) return resolve(null);
        let eslPrompt = currentEslId;
        if (hasEslCol && (!currentEslId || currentEslId === '—')) {
          eslPrompt = prompt(`Item ${itemIdentifier || ''} has no ESL ID.\nEnter ESL ID:`, '');
        }
        return resolve({ testDate: testPrompt.trim(), eslId: (eslPrompt || '').trim() });
      }

      const titleEl = document.getElementById('on-shelf-item-title');
      if (titleEl) {
        titleEl.textContent = itemIdentifier ? `Item #${itemIdentifier} Returning to Shelf` : `Item Returning to Shelf`;
      }

      const todayPreview = document.getElementById('on-shelf-today-preview');
      if (todayPreview) {
        todayPreview.textContent = todayFormatted;
      }

      const testInput = document.getElementById('on-shelf-test-date');
      const testPicker = document.getElementById('on-shelf-test-date-picker');
      const eslContainer = document.getElementById('on-shelf-esl-container');
      const eslInput = document.getElementById('on-shelf-esl-id');
      const eslBadge = document.getElementById('on-shelf-esl-badge');
      const eslHelp = document.getElementById('on-shelf-esl-help');

      const initialTest = currentTestDate || todayFormatted;
      if (testInput) testInput.value = initialTest;
      if (testPicker) {
        if (/^\d{2}\/\d{2}\/\d{4}$/.test(initialTest)) {
          const p = initialTest.split('/');
          testPicker.value = `${p[2]}-${p[0]}-${p[1]}`;
        } else {
          testPicker.value = todayIso;
        }
      }

      if (testPicker && testInput) {
        testPicker.onchange = () => {
          if (testPicker.value) {
            const p = testPicker.value.split('-');
            testInput.value = `${p[1]}/${p[2]}/${p[0]}`;
          }
        };
      }

      if (eslContainer) {
        if (hasEslCol) {
          eslContainer.style.display = 'block';
          if (eslInput) eslInput.value = (currentEslId && currentEslId !== '—') ? currentEslId : '';
          if (eslBadge && eslHelp) {
            if (currentEslId && currentEslId !== '—') {
              eslBadge.style.display = 'inline-block';
              eslBadge.style.backgroundColor = '#15803d';
              eslBadge.style.color = '#fff';
              eslBadge.textContent = 'Existing Tag';
              eslHelp.style.display = 'none';
            } else {
              eslBadge.style.display = 'inline-block';
              eslBadge.style.backgroundColor = '#d97706';
              eslBadge.style.color = '#fff';
              eslBadge.textContent = 'Tag Required';
              eslHelp.style.display = 'block';
            }
          }
        } else {
          eslContainer.style.display = 'none';
        }
      }

      const closeBtn = document.getElementById('on-shelf-modal-close');
      const cancelBtn = document.getElementById('on-shelf-modal-cancel');
      const confirmBtn = document.getElementById('on-shelf-modal-confirm');

      const cleanup = () => {
        modal.classList.remove('active');
        modal.style.display = 'none';
        modal.onclick = null;
        if (closeBtn) closeBtn.onclick = null;
        if (cancelBtn) cancelBtn.onclick = null;
        if (confirmBtn) confirmBtn.onclick = null;
        if (testPicker) testPicker.onchange = null;
        document.removeEventListener('keydown', handleEsc);
      };

      const handleEsc = (e) => {
        if (e.key === 'Escape') {
          cleanup();
          resolve(null);
        }
      };

      const handleCancel = () => {
        cleanup();
        resolve(null);
      };

      const handleConfirm = () => {
        let tDate = testInput ? testInput.value.trim() : '';
        if (!tDate) tDate = todayFormatted;

        // Normalize test date to MM/DD/YYYY
        if (tDate.includes('-')) {
          const p = tDate.split('-');
          if (p.length === 3) tDate = `${p[1]}/${p[2]}/${p[0]}`;
        }

        const eId = eslInput ? eslInput.value.trim() : '';
        cleanup();
        resolve({
          testDate: tDate,
          eslId: eId
        });
      };

      modal.onclick = (e) => {
        if (e.target === modal) handleCancel();
      };
      if (closeBtn) closeBtn.onclick = handleCancel;
      if (cancelBtn) cancelBtn.onclick = handleCancel;
      if (confirmBtn) confirmBtn.onclick = handleConfirm;
      document.addEventListener('keydown', handleEsc);

      modal.classList.add('active');
      modal.style.display = 'flex';
      if (testInput) {
        testInput.focus();
        testInput.select();
      }
    });
  }

  showJobLifecycleModal(jobNum) {
    const jtTable = this.db.getTable('job_tracking');
    if (!jtTable || !jtTable.rows) return;

    const row = jtTable.rows.find(j => {
      const jn = String(j['Job Number'] || j['Job #'] || Object.values(j)[0] || '').trim();
      return jn === String(jobNum).trim();
    });

    if (!row) {
      alert(`Job ${jobNum} not found in Job Tracking.`);
      return;
    }

    const today = new Date().toISOString().split('T')[0];
    const todayFormatted = new Date().toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' });
    const currentStatus = String(row['Status'] || 'Active').trim();
    const loc = row['Location'] || '';
    const foreman = row['Foreman'] || '';

    const isSkipSun = row['Skip Sun'] === true || row['Skip Sun'] === 'TRUE';
    const isSkipMon = row['Skip Mon'] === true || row['Skip Mon'] === 'TRUE';
    const isSkipTue = row['Skip Tue'] === true || row['Skip Tue'] === 'TRUE';
    const isSkipWed = row['Skip Wed'] === true || row['Skip Wed'] === 'TRUE';
    const isSkipThu = row['Skip Thu'] === true || row['Skip Thu'] === 'TRUE';
    const isSkipFri = row['Skip Fri'] === true || row['Skip Fri'] === 'TRUE';
    const isSkipSat = row['Skip Sat'] === true || row['Skip Sat'] === 'TRUE';
    const isSkipMtg = row['Skip Weekly Meeting'] === true || row['Skip Weekly Meeting'] === 'TRUE';
    const isSkipChk = row['Skip Monthly Checklist'] === true || row['Skip Monthly Checklist'] === 'TRUE';

    const modalHtml = `
      <div id="job-lifecycle-sheet-modal" style="position: fixed; inset: 0; background: rgba(0,0,0,0.75); z-index: 10000; display: flex; align-items: center; justify-content: center;">
        <div style="background: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: 12px; padding: 24px; max-width: 520px; width: 90%; box-shadow: 0 12px 40px rgba(0,0,0,0.6); max-height: 90vh; overflow-y: auto;">
          
          <!-- Header -->
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; border-bottom: 1px solid var(--border-color); padding-bottom: 12px;">
            <div>
              <h3 style="font-size: 17px; font-weight: 800; color: var(--text-primary); margin: 0; display: flex; align-items: center; gap: 8px;">
                <span>⚙️</span> Job ${this.escapeHtml(jobNum)} — ${this.escapeHtml(loc)}
              </h3>
              <div style="font-size: 12px; color: var(--text-muted); margin-top: 2px;">
                Foreman: <strong>${this.escapeHtml(foreman || 'Unassigned')}</strong> | Current Status: <strong>${this.escapeHtml(currentStatus)}</strong>
              </div>
            </div>
            <button onclick="document.getElementById('job-lifecycle-sheet-modal').remove()" style="background: none; border: none; color: var(--text-muted); font-size: 20px; cursor: pointer;">✕</button>
          </div>

          <!-- Status Selector -->
          <div style="margin-bottom: 16px;">
            <label style="font-size: 12px; font-weight: 700; color: var(--text-muted); display: block; margin-bottom: 6px;">Target Status:</label>
            <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px;">
              <label style="display: flex; align-items: center; gap: 8px; padding: 8px 12px; background: var(--bg-primary); border: 1px solid var(--border-color); border-radius: 6px; cursor: pointer;">
                <input type="radio" name="job-target-status" value="Active" ${currentStatus === 'Active' ? 'checked' : ''} onchange="window.sheetNavigator.handleJobStatusRadioChange('Active')">
                <span style="font-size: 13px; font-weight: 700; color: #10b981;">🟢 Active</span>
              </label>
              <label style="display: flex; align-items: center; gap: 8px; padding: 8px 12px; background: var(--bg-primary); border: 1px solid var(--border-color); border-radius: 6px; cursor: pointer;">
                <input type="radio" name="job-target-status" value="Pending Start" ${currentStatus === 'Pending Start' ? 'checked' : ''} onchange="window.sheetNavigator.handleJobStatusRadioChange('Pending Start')">
                <span style="font-size: 13px; font-weight: 700; color: #f59e0b;">🟡 Pending Start</span>
              </label>
              <label style="display: flex; align-items: center; gap: 8px; padding: 8px 12px; background: var(--bg-primary); border: 1px solid var(--border-color); border-radius: 6px; cursor: pointer;">
                <input type="radio" name="job-target-status" value="On Hold" ${currentStatus === 'On Hold' ? 'checked' : ''} onchange="window.sheetNavigator.handleJobStatusRadioChange('On Hold')">
                <span style="font-size: 13px; font-weight: 700; color: #94a3b8;">⏸️ On Hold</span>
              </label>
              <label style="display: flex; align-items: center; gap: 8px; padding: 8px 12px; background: var(--bg-primary); border: 1px solid var(--border-color); border-radius: 6px; cursor: pointer;">
                <input type="radio" name="job-target-status" value="Completed" ${currentStatus === 'Completed' ? 'checked' : ''} onchange="window.sheetNavigator.handleJobStatusRadioChange('Completed')">
                <span style="font-size: 13px; font-weight: 700; color: #60a5fa;">🏁 Completed</span>
              </label>
            </div>
          </div>

          <!-- Dynamic Date Inputs Area -->
          <div id="job-modal-dates-area" style="background: var(--bg-primary); border-radius: 8px; padding: 12px; margin-bottom: 16px; border: 1px solid var(--border-color);">
            <div id="field-on-hold" style="display: ${currentStatus === 'On Hold' ? 'block' : 'none'}; margin-bottom: 10px;">
              <label style="font-size: 11px; font-weight: 700; color: var(--text-muted); display: block; margin-bottom: 4px;">Put On Hold Date:</label>
              <input type="date" id="input-hold-date" class="form-control" value="${row['Put On Hold Date'] || today}" style="width: 100%; padding: 6px 10px; background: var(--bg-secondary); color: var(--text-primary); border: 1px solid var(--border-color); border-radius: 4px;">
              <label style="font-size: 11px; font-weight: 700; color: var(--text-muted); display: block; margin-top: 8px; margin-bottom: 4px;">Estimated Return Date:</label>
              <input type="date" id="input-return-date" class="form-control" value="${row['Estimated Return'] || ''}" style="width: 100%; padding: 6px 10px; background: var(--bg-secondary); color: var(--text-primary); border: 1px solid var(--border-color); border-radius: 4px;">
            </div>

            <div id="field-pending-start" style="display: ${currentStatus === 'Pending Start' ? 'block' : 'none'}; margin-bottom: 10px;">
              <label style="font-size: 11px; font-weight: 700; color: var(--text-muted); display: block; margin-bottom: 4px;">Estimated Start Date:</label>
              <input type="date" id="input-start-date" class="form-control" value="${row['Start Date'] || today}" style="width: 100%; padding: 6px 10px; background: var(--bg-secondary); color: var(--text-primary); border: 1px solid var(--border-color); border-radius: 4px;">
            </div>

            <div id="field-completed" style="display: ${currentStatus === 'Completed' ? 'block' : 'none'}; margin-bottom: 10px;">
              <label style="font-size: 11px; font-weight: 700; color: var(--text-muted); display: block; margin-bottom: 4px;">Actual End Date:</label>
              <input type="date" id="input-end-date" class="form-control" value="${row['Actual End Date'] || today}" style="width: 100%; padding: 6px 10px; background: var(--bg-secondary); color: var(--text-primary); border: 1px solid var(--border-color); border-radius: 4px;">
            </div>

            <div id="field-active-notice" style="display: ${currentStatus === 'Active' ? 'block' : 'none'}; font-size: 12px; color: #10b981;">
              ✓ Crew is active and included in all weekly safety compliance tracking.
            </div>
          </div>

          <!-- Schedule & Skip Days Section -->
          <div style="background: var(--bg-primary); border-radius: 8px; padding: 12px; margin-bottom: 20px; border: 1px solid var(--border-color);">
            <div style="font-size: 12px; font-weight: 700; color: var(--text-muted); margin-bottom: 8px;">Compliance Schedule & Skip Days:</div>
            
            <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; margin-bottom: 8px;">
              <label style="font-size: 11px; display: flex; align-items: center; gap: 4px; color: var(--text-primary);">
                <input type="checkbox" id="skip-sun" ${isSkipSun ? 'checked' : ''}> Skip Sun
              </label>
              <label style="font-size: 11px; display: flex; align-items: center; gap: 4px; color: var(--text-primary);">
                <input type="checkbox" id="skip-mon" ${isSkipMon ? 'checked' : ''}> Skip Mon
              </label>
              <label style="font-size: 11px; display: flex; align-items: center; gap: 4px; color: var(--text-primary);">
                <input type="checkbox" id="skip-tue" ${isSkipTue ? 'checked' : ''}> Skip Tue
              </label>
              <label style="font-size: 11px; display: flex; align-items: center; gap: 4px; color: var(--text-primary);">
                <input type="checkbox" id="skip-wed" ${isSkipWed ? 'checked' : ''}> Skip Wed
              </label>
              <label style="font-size: 11px; display: flex; align-items: center; gap: 4px; color: var(--text-primary);">
                <input type="checkbox" id="skip-thu" ${isSkipThu ? 'checked' : ''}> Skip Thu
              </label>
              <label style="font-size: 11px; display: flex; align-items: center; gap: 4px; color: var(--text-primary);">
                <input type="checkbox" id="skip-fri" ${isSkipFri ? 'checked' : ''}> Skip Fri
              </label>
              <label style="font-size: 11px; display: flex; align-items: center; gap: 4px; color: var(--text-primary);">
                <input type="checkbox" id="skip-sat" ${isSkipSat ? 'checked' : ''}> Skip Sat
              </label>
            </div>

            <div style="display: flex; gap: 16px; border-top: 1px dashed rgba(255,255,255,0.1); padding-top: 8px;">
              <label style="font-size: 11px; display: flex; align-items: center; gap: 4px; color: var(--text-primary);">
                <input type="checkbox" id="skip-meeting" ${isSkipMtg ? 'checked' : ''}> Skip Weekly Mtg
              </label>
              <label style="font-size: 11px; display: flex; align-items: center; gap: 4px; color: var(--text-primary);">
                <input type="checkbox" id="skip-checklist" ${isSkipChk ? 'checked' : ''}> Skip Monthly Chk
              </label>
            </div>
          </div>

          <!-- Bottom Actions -->
          <div style="display: flex; justify-content: flex-end; gap: 10px;">
            <button class="btn btn-secondary" onclick="document.getElementById('job-lifecycle-sheet-modal').remove()">Cancel</button>
            <button class="btn btn-primary" onclick="window.sheetNavigator.saveJobLifecycleModal('${this.escapeHtml(jobNum)}')">💾 Save Changes</button>
          </div>

        </div>
      </div>
    `;

    const oldModal = document.getElementById('job-lifecycle-sheet-modal');
    if (oldModal) oldModal.remove();
    document.body.insertAdjacentHTML('beforeend', modalHtml);
  }

  handleJobStatusRadioChange(status) {
    const onHold = document.getElementById('field-on-hold');
    const pending = document.getElementById('field-pending-start');
    const completed = document.getElementById('field-completed');
    const active = document.getElementById('field-active-notice');

    if (onHold) onHold.style.display = status === 'On Hold' ? 'block' : 'none';
    if (pending) pending.style.display = status === 'Pending Start' ? 'block' : 'none';
    if (completed) completed.style.display = status === 'Completed' ? 'block' : 'none';
    if (active) active.style.display = status === 'Active' ? 'block' : 'none';
  }

  async saveJobLifecycleModal(jobNum) {
    const jtTable = this.db.getTable('job_tracking');
    if (!jtTable || !jtTable.rows) return;

    const row = jtTable.rows.find(j => {
      const jn = String(j['Job Number'] || j['Job #'] || Object.values(j)[0] || '').trim();
      return jn === String(jobNum).trim();
    });
    if (!row) return;

    const selectedRadio = document.querySelector('input[name="job-target-status"]:checked');
    const targetStatus = selectedRadio ? selectedRadio.value : 'Active';
    const todayFormatted = new Date().toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' });

    row['Status'] = targetStatus;
    row['Skip Sun'] = document.getElementById('skip-sun').checked;
    row['Skip Mon'] = document.getElementById('skip-mon').checked;
    row['Skip Tue'] = document.getElementById('skip-tue').checked;
    row['Skip Wed'] = document.getElementById('skip-wed').checked;
    row['Skip Thu'] = document.getElementById('skip-thu').checked;
    row['Skip Fri'] = document.getElementById('skip-fri').checked;
    row['Skip Sat'] = document.getElementById('skip-sat').checked;
    row['Skip Weekly Meeting'] = document.getElementById('skip-meeting').checked;
    row['Skip Monthly Checklist'] = document.getElementById('skip-checklist').checked;
    row['Last Updated'] = todayFormatted;

    if (targetStatus === 'On Hold') {
      row['Put On Hold Date'] = document.getElementById('input-hold-date').value || todayFormatted;
      row['Estimated Return'] = document.getElementById('input-return-date').value || '';
    } else if (targetStatus === 'Pending Start') {
      row['Start Date'] = document.getElementById('input-start-date').value || '';
    } else if (targetStatus === 'Completed') {
      row['Actual End Date'] = document.getElementById('input-end-date').value || todayFormatted;
    } else if (targetStatus === 'Active') {
      if (!row['Start Date']) row['Start Date'] = todayFormatted;
      row['Put On Hold Date'] = '';
      row['Estimated Return'] = '';
    }

    // Sync raw grid
    if (jtTable.rawGrid && jtTable.headers) {
      const idKey = jtTable.headers[0];
      const gridIdx = jtTable.rawGrid.findIndex((gr, idx) => {
        if (idx === 0) return false;
        return String(gr[0] || '').trim() === String(jobNum).trim();
      });
      if (gridIdx > 0) {
        jtTable.rawGrid[gridIdx] = jtTable.headers.map(h => row[h] !== undefined ? row[h] : '');
      }
    }

    // Queue update mutation
    await this.db.addMutation({
      action: 'UPDATE_ROW',
      sheetName: jtTable.name,
      tableKey: 'job_tracking',
      itemIdentifier: jobNum,
      updatedFields: {
        'Status': row['Status'],
        'Skip Sun': row['Skip Sun'],
        'Skip Mon': row['Skip Mon'],
        'Skip Tue': row['Skip Tue'],
        'Skip Wed': row['Skip Wed'],
        'Skip Thu': row['Skip Thu'],
        'Skip Fri': row['Skip Fri'],
        'Skip Sat': row['Skip Sat'],
        'Skip Weekly Meeting': row['Skip Weekly Meeting'],
        'Skip Monthly Checklist': row['Skip Monthly Checklist'],
        'Put On Hold Date': row['Put On Hold Date'] || '',
        'Estimated Return': row['Estimated Return'] || '',
        'Start Date': row['Start Date'] || '',
        'Actual End Date': row['Actual End Date'] || '',
        'Last Updated': todayFormatted
      }
    });

    if (typeof this.db.setSnapshot === 'function') {
      await this.db.setSnapshot(this.db.snapshot);
    }

    const modal = document.getElementById('job-lifecycle-sheet-modal');
    if (modal) modal.remove();

    this.renderCurrentSheet();
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
}

window.sheetNavigator = new SheetNavigator(window.localDB);
