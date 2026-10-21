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
    this.activeFailureReasonFilter = null;
    let savedVisualsExp = true;
    try {
      const stored = localStorage.getItem('sa_gloves_sleeves_visuals_expanded');
      if (stored !== null) savedVisualsExp = (stored !== 'false');
    } catch { /* ignore */ }
    this.isVisualsExpanded = savedVisualsExp;
    let savedEmpView = 'cards';
    try {
      const stored = localStorage.getItem('safety_assistant_emp_view_mode');
      if (stored === 'cards' || stored === 'table') savedEmpView = stored;
    } catch { /* ignore */ }
    this.employeeViewMode = savedEmpView;
    this.editingCrewBaseJob = null;
    this.sheetList = [
      { key: 'employees', label: '👥 Employees', icon: '👤', isSwap: false },
      { key: 'job_tracking', label: '📋 Job Tracking', icon: '📋', isSwap: false },
      { key: 'locations', label: '📍 Locations & Approvals', icon: '📍', isSwap: false },
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
      { key: 'drug_test_clinics', label: '🏥 Drug Test Clinics', icon: '🏥', isSwap: false },
      { key: 'retired_equipment', label: '🗄️ Retired Equipment', icon: '🗄️', isSwap: false },
      { key: 'trip_schedule', label: '📅 Trip Schedule', icon: '📅', isSwap: false },
      { key: 'test_batches', label: '🔬 Test Batches', icon: '🔬', isSwap: false },
      { key: 'field_gps_log', label: '📍 Field GPS Log', icon: '📍', isSwap: false },
      { key: 'daily_accomplishments', label: '⏱️ Daily Accomplishments', icon: '⏱️', isSwap: false },
      { key: 'system_config', label: '⚙️ System Config', icon: '⚙️', isSwap: false }
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

  normalizeEquipmentIdentifier(val) {
    if (val === null || val === undefined) return '';
    return String(val)
      .trim()
      .toUpperCase()
      .replace(/[\s\u00A0]+/g, '')
      .replace(/[–—]/g, '-');
  }

  getPrimaryItemCol(sheetKey, headers = []) {
    if (!headers || headers.length === 0) return null;
    if (sheetKey === 'grounds') {
      const serialH = headers.find(h => {
        const hl = String(h || '').trim().toLowerCase();
        return hl === 'serial #' || hl === 'serial' || hl === 'ground #' || hl === 'ground';
      });
      if (serialH) return serialH;
    }
    const candidates = [
      'item #', 'item', 'serial #', 'serial', 'hv tester', 'hvt #', 'hvt',
      'phasing set', 'ps #', 'aed', 'aed #', 'hot stick', 'blanket', 'mack',
      'glove', 'sleeve', 'esl id'
    ];
    for (const c of candidates) {
      const found = headers.find(h => {
        const hl = String(h || '').trim().toLowerCase();
        return hl === c || hl.startsWith(c);
      });
      if (found) return found;
    }
    return headers[0] || null;
  }

  getPendingEmployeesMap() {
    const map = new Map();
    const empTable = (this.db && typeof this.db.getTable === 'function' ? this.db.getTable('employees') : null);
    if (!empTable || !empTable.rows) return map;

    const now = new Date();
    const todayNum = now.getFullYear() * 10000 + (now.getMonth() + 1) * 100 + now.getDate();

    empTable.rows.forEach(r => {
      const name = String(r['Employee Name'] || r['Name'] || Object.values(r)[0] || '').trim();
      if (!name) return;
      const status = String(r['Status'] || '').trim().toLowerCase();
      // Exclude previous, terminated, or inactive records
      if (status === 'previous' || status === 'terminated' || status === 'inactive') return;

      const hireDateStr = String(r['Hire Date'] || r['HireDate'] || '').trim();
      let hireNum = null;

      if (hireDateStr) {
        const parts = hireDateStr.split(/[-/]/);
        if (parts.length === 3) {
          let y, m, d;
          if (parts[0].length === 4) {
            y = parseInt(parts[0], 10);
            m = parseInt(parts[1], 10);
            d = parseInt(parts[2], 10);
          } else {
            m = parseInt(parts[0], 10);
            d = parseInt(parts[1], 10);
            y = parseInt(parts[2], 10);
          }
          if (!isNaN(y) && !isNaN(m) && !isNaN(d)) {
            hireNum = y * 10000 + m * 100 + d;
          }
        }
      }

      // Pre-assigned applies ONLY to pending new hire employees that have a future hire date (strictly tomorrow or later)
      const isFutureHire = hireNum !== null && hireNum > todayNum;
      const isPending = (status === 'pending' && (hireNum === null || hireNum > todayNum));

      if (isFutureHire || isPending) {
        const clean = name.replace(/\s*\([^)]*\)/g, '').toLowerCase().trim();
        const info = {
          name,
          status,
          hireDate: hireDateStr,
          hireNum
        };
        map.set(clean, info);

        // Also register alternate names / aliases
        const altKey = Object.keys(r).find(k => /^(alt(ernat(e|ive))?(\s*names?)?|also\s*known\s*as|aka|aliases?)$/i.test(k.trim()));
        const altVal = String((altKey ? r[altKey] : r['Alternate Names']) || '').trim();
        if (altVal) {
          altVal.split(/[,;\n]/).forEach(alias => {
            const cleanAlias = alias.replace(/\s*\([^)]*\)/g, '').toLowerCase().trim();
            if (cleanAlias) map.set(cleanAlias, info);
          });
        }
      }
    });

    return map;
  }

  async autoActivatePendingEmployees() {
    try {
      if (!this.db || typeof this.db.getTable !== 'function') return;
      const empTable = this.db.getTable('employees');
      if (!empTable || !empTable.rows) return;

      const now = new Date();
      const todayNum = now.getFullYear() * 10000 + (now.getMonth() + 1) * 100 + now.getDate();

      const headers = empTable.headers || [];
      let statusColIdx = headers.findIndex(h => String(h).trim().toLowerCase() === 'status') + 1;
      if (statusColIdx <= 0) return;

      const activatedNames = [];

      for (let i = 0; i < empTable.rows.length; i++) {
        const r = empTable.rows[i];
        const status = String(r['Status'] || '').trim().toLowerCase();
        if (status !== 'pending') continue;

        const hireDateStr = String(r['Hire Date'] || r['HireDate'] || '').trim();
        if (!hireDateStr) continue;

        const parts = hireDateStr.split(/[-/]/);
        if (parts.length !== 3) continue;

        let y, m, d;
        if (parts[0].length === 4) {
          y = parseInt(parts[0], 10);
          m = parseInt(parts[1], 10);
          d = parseInt(parts[2], 10);
        } else {
          m = parseInt(parts[0], 10);
          d = parseInt(parts[1], 10);
          y = parseInt(parts[2], 10);
        }
        if (isNaN(y) || isNaN(m) || isNaN(d)) continue;
        const hireNum = y * 10000 + m * 100 + d;

        // Auto-activate when today reaches or exceeds hire date (todayNum >= hireNum)
        if (todayNum >= hireNum) {
          const empName = String(r['Employee Name'] || r['Name'] || Object.values(r)[0] || '').trim();
          r['Status'] = 'Active';
          const rIdx = r._rowIdx || (i + 2);
          if (empTable.rawGrid && empTable.rawGrid[rIdx - 1]) {
            empTable.rawGrid[rIdx - 1][statusColIdx - 1] = 'Active';
          }
          await this.db.addMutation({
            action: 'UPDATE_CELL',
            sheetName: empTable.name || 'Employees',
            tableKey: 'employees',
            row: rIdx,
            col: statusColIdx,
            header: 'Status',
            itemIdentifier: empName,
            value: 'Active'
          });
          activatedNames.push(empName);
        }
      }

      if (activatedNames.length > 0) {
        await this.db.persistSnapshot(this.db.snapshot);
        console.log(`[AutoActivate] Promoted ${activatedNames.length} pending employee(s) to Active: ${activatedNames.join(', ')}`);
      }
    } catch (err) {
      console.warn('[AutoActivate] Failed to check pending employees:', err);
    }
  }

  init() {
    this.renderTabsBar();
    this.setupSearch();
    this.setupEmployeeViewToggle();
    this.renderCurrentSheet();
    this.runOneTimeVacationRepair();
    this.autoActivatePendingEmployees();
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
    this.activeFailureReasonFilter = null;
    this.searchTerm = '';
    const sInput = document.getElementById('sheet-search-input');
    if (sInput) sInput.value = '';
    this.updateStatusPillUI();
    this.renderCurrentSheet();
  }

  toggleVisualsDashboard() {
    this.isVisualsExpanded = !this.isVisualsExpanded;
    try {
      localStorage.setItem('sa_gloves_sleeves_visuals_expanded', this.isVisualsExpanded);
    } catch { /* ignore */ }
    this.renderInventoryVisuals();
    this.updateVisualsToggleButton();
  }

  filterByFailureReason(reason) {
    if (this.activeFailureReasonFilter && this.activeFailureReasonFilter.toLowerCase() === String(reason).toLowerCase()) {
      this.activeFailureReasonFilter = null;
    } else {
      this.activeFailureReasonFilter = reason;
      if (this.filterStatus !== 'all' && this.filterStatus !== 'failed_rubber') {
        this.filterStatus = 'all';
        this.updateStatusPillUI();
      }
    }
    this.renderCurrentSheet();
  }

  clearFailureReasonFilter() {
    this.activeFailureReasonFilter = null;
    this.renderCurrentSheet();
  }

  updateVisualsToggleButton() {
    const btn = document.getElementById('btn-toggle-sheet-visuals');
    if (!btn) return;
    const isGlovesOrSleeves = this.currentSheetKey === 'gloves' || this.currentSheetKey === 'sleeves';
    if (!isGlovesOrSleeves) {
      btn.style.display = 'none';
      return;
    }
    btn.style.display = 'inline-flex';
    btn.innerHTML = `<span>📊</span> Visual Analytics ${this.isVisualsExpanded ? '▾' : '▸'}`;
    btn.classList.toggle('active', this.isVisualsExpanded);
  }

  renderInventoryVisuals() {
    const panel = document.getElementById('inventory-visuals-panel');
    if (!panel) return;

    const isGlovesOrSleeves = this.currentSheetKey === 'gloves' || this.currentSheetKey === 'sleeves';
    if (!isGlovesOrSleeves) {
      panel.style.display = 'none';
      panel.innerHTML = '';
      return;
    }

    if (!window.itemStatsEngine) {
      panel.style.display = 'none';
      return;
    }

    const metrics = window.itemStatsEngine.computeFleetVisualMetrics(this.currentSheetKey);
    panel.style.display = 'block';
    panel.innerHTML = window.itemStatsEngine.renderFleetVisualsHtml(
      this.currentSheetKey,
      metrics,
      this.isVisualsExpanded,
      this.activeFailureReasonFilter
    );
  }

  renderTabsBar(force = false) {
    const bar = document.getElementById('sheet-tabs-bar');
    if (!bar) return;

    // Fast-path: If buttons are already built, just update active states and badges without destroying DOM
    if (!force && bar.children.length === this.sheetList.length) {
      for (let i = 0; i < bar.children.length; i++) {
        const btn = bar.children[i];
        const sheetKey = btn.dataset.sheetKey;
        btn.classList.toggle('active', sheetKey === this.currentSheetKey);

        // Update badge if historyIssuesEngine is active
        if (window.historyIssuesEngine) {
          const issueCount = window.historyIssuesEngine.getEquipmentItemCount(sheetKey);
          let badge = btn.querySelector('.tab-history-issues-badge');
          if (issueCount > 0) {
            if (!badge) {
              badge = document.createElement('span');
              badge.className = 'tab-history-issues-badge';
              badge.onclick = (e) => {
                e.stopPropagation();
                window.historyIssuesEngine.openHistoryIssuesModal(sheetKey);
              };
              btn.appendChild(badge);
            }
            badge.title = `${issueCount} items with history discrepancies (Click to inspect)`;
            badge.innerHTML = `⚠️ ${issueCount}`;
          } else if (badge) {
            badge.remove();
          }
        }
      }
      return;
    }

    bar.innerHTML = '';

    this.sheetList.forEach(sheet => {
      const btn = document.createElement('button');
      btn.className = 'sheet-tab-btn' + (sheet.key === this.currentSheetKey ? ' active' : '');
      btn.dataset.sheetKey = sheet.key;
      btn.innerHTML = `<span>${sheet.icon}</span> ${sheet.label.replace(/^.*? /, '')}`;

      if (window.historyIssuesEngine) {
        const issueCount = window.historyIssuesEngine.getEquipmentItemCount(sheet.key);
        if (issueCount > 0) {
          const badge = document.createElement('span');
          badge.className = 'tab-history-issues-badge';
          badge.title = `${issueCount} ${sheet.label} with history discrepancies (Click to inspect)`;
          badge.innerHTML = `⚠️ ${issueCount}`;
          badge.onclick = (e) => {
            e.stopPropagation();
            window.historyIssuesEngine.openHistoryIssuesModal(sheet.key);
          };
          btn.appendChild(badge);
        }
      }

      btn.onclick = () => {
        this.currentSheetKey = sheet.key;
        this.filterSize = 'all';
        this.filterClass = 'all';
        this.filterLocation = 'all';
        this.filterStatus = 'all';
        this.searchTerm = '';
        const sInput = document.getElementById('sheet-search-input');
        if (sInput) sInput.value = '';
        const INVENTORY_KEYS = ['gloves', 'sleeves', 'blankets', 'macks', 'hv_testers', 'phasing_sets', 'aed', 'grounds', 'hot_sticks'];
        if (sheet.key === 'employees') {
          this.multiSort = ['Location', 'Job Number'];
          this.sortCol = null;
        } else if (sheet.key === 'job_tracking') {
          this.multiSort = ['Status', 'Job Number'];
          this.sortCol = null;
        } else if (INVENTORY_KEYS.includes(sheet.key)) {
          this.sortCol = null; // Auto-detected in renderStandardTable as primary item column
          this.multiSort = null;
          this.sortDir = 'asc';
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

  setEmployeeViewMode(mode) {
    this.employeeViewMode = mode;
    try {
      localStorage.setItem('safety_assistant_emp_view_mode', mode);
    } catch { /* ignore */ }
    this.updateEmployeeViewToggleUI();
    this.renderCurrentSheet();
  }

  updateEmployeeViewToggleUI() {
    const toggle = document.getElementById('emp-view-toggle');
    const btnCards = document.getElementById('btn-emp-cards-view');
    const btnTable = document.getElementById('btn-emp-table-view');
    if (!toggle) return;

    if (this.currentSheetKey === 'employees') {
      toggle.style.display = 'inline-flex';
      if (btnCards && btnTable) {
        if (this.employeeViewMode === 'cards') {
          btnCards.classList.add('active');
          btnTable.classList.remove('active');
        } else {
          btnTable.classList.add('active');
          btnCards.classList.remove('active');
        }
      }
    } else {
      toggle.style.display = 'none';
    }
  }

  setupEmployeeViewToggle() {
    this.updateEmployeeViewToggleUI();
  }

  async runOneTimeVacationRepair() {
    if (this._hasRunVacationRepair) return;
    this._hasRunVacationRepair = true;
    try {
      if (localStorage.getItem('sa_vacation_repair_done_v2')) return;
      if (window.crewImportEngine && typeof window.crewImportEngine.repairVacationAndLeaveJobNumbers === 'function') {
        const res = await window.crewImportEngine.repairVacationAndLeaveJobNumbers();
        localStorage.setItem('sa_vacation_repair_done_v2', 'true');
        if (res && res.repairedCount > 0) {
          console.log(`[VacationRepair] Repaired ${res.repairedCount} employee record(s). Refreshing sheets.`);
          this.renderCurrentSheet();
        }
      }
    } catch (err) {
      console.warn('Error running vacation repair:', err);
    }
  }

  openCrewImport() {
    const navItem = document.querySelector('.nav-item[data-view="crew-import-view"]');
    if (navItem) {
      navItem.click();
    }
  }

  openDrugTestingWorkspace() {
    const navItem = document.querySelector('.nav-item[data-view="drug-testing-view"]');
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
      const col = this.getPrimaryItemCol(this.currentSheetKey, headers) || findCol([
        'item #', 'item', 'serial #', 'serial', 'hv tester', 'hvt #', 'hvt',
        'phasing set', 'ps #', 'aed', 'aed #', 'hot stick', 'blanket', 'mack',
        'glove', 'sleeve', 'ground #', 'ground', 'esl id'
      ]);
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
      if (this.multiSort && this.multiSort[0] === locCol && this.multiSort[1] === jobCol) {
        this.sortDir = this.sortDir === 'asc' ? 'desc' : 'asc';
      } else {
        this.multiSort = [locCol, jobCol];
        this.sortCol = null;
        this.sortDir = 'asc';
      }
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

    try {
      // Automatically ensure all active employees have their required certification rows
      if (window.certsConfigEngine && typeof window.certsConfigEngine.applyRequirementsToMatrix === 'function') {
        try {
          await window.certsConfigEngine.applyRequirementsToMatrix(false, false);
        } catch (e) {
          console.warn('Could not auto-apply cert requirements:', e);
        }
      }

      // Automatically deduplicate any duplicate certification rows
      try {
        await this.deduplicateExpiringCerts(true);
      } catch (e) {
        console.warn('Could not auto-deduplicate expiring certs:', e);
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

      const tableData = (this.db ? (this.db.getTable(this.currentSheetKey) || this.db.getTable('Expiring Certs')) : null) || { headers: [], rows: [] };
      this.renderStandardTable(container, countBadge, tableData);
    } catch (err) {
      console.error('Error rendering expiring certs:', err);
      container.innerHTML = `
        <div style="padding: 36px 20px; text-align: center; max-width: 580px; margin: 30px auto; background: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: 14px;">
          <div style="font-size: 42px; margin-bottom: 12px;">⚠️</div>
          <h3 style="color: var(--text-primary); font-size: 18px; font-weight: 700; margin-bottom: 8px;">Error Displaying Expiring Certifications</h3>
          <p style="color: var(--text-secondary); font-size: 13.5px; line-height: 1.5; margin-bottom: 22px;">
            ${this.escapeHtml(err.message || String(err))}
          </p>
          <button class="btn btn-primary" onclick="window.sheetNavigator.renderExpiringCerts()" style="padding: 10px 20px; font-size: 13px; font-weight: 700; cursor: pointer;">
            🔄 Retry Loading Certs
          </button>
        </div>
      `;
    }
  }

  /**
   * Deduplicates expiring certs records: for any duplicate (employee, cert) pair,
   * preserves the single best record (preferring newest expiration date, then newest acquired date).
   */
  async deduplicateExpiringCerts(silent = false) {
    const tableData = this.db ? this.db.getTable('expiring_certs') : null;
    if (!tableData || !tableData.rows || tableData.rows.length === 0) return 0;

    const parseTime = (val) => {
      if (!val || val === 'N/A' || val === '' || val === 'No Date Set') return 0;
      const d = new Date(val);
      return (d && !isNaN(d.getTime())) ? d.getTime() : 0;
    };

    const groups = new Map();
    tableData.rows.forEach(r => {
      const emp = String(r['Employee Name'] || r['Name'] || '').trim().toLowerCase();
      const cert = String(r['Item Type'] || r['Cert Type'] || '').trim().toLowerCase();
      const key = `${emp}|${cert}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(r);
    });

    let removedCount = 0;
    const cleanRows = [];

    groups.forEach((group) => {
      if (group.length === 1) {
        cleanRows.push(group[0]);
      } else {
        removedCount += (group.length - 1);
        group.sort((a, b) => {
          const expA = parseTime(a['Expiration Date']);
          const expB = parseTime(b['Expiration Date']);
          if (expA !== expB) return expB - expA; // Newest expiration date first
          const acqA = parseTime(a['Date Acquired']);
          const acqB = parseTime(b['Date Acquired']);
          if (acqA !== acqB) return acqB - acqA; // Newest acquired date first
          const statA = String(a['Status'] || '').trim().toLowerCase();
          const statB = String(b['Status'] || '').trim().toLowerCase();
          const isGoodA = (statA && statA !== 'no date set' && statA !== 'missing');
          const isGoodB = (statB && statB !== 'no date set' && statB !== 'missing');
          if (isGoodA && !isGoodB) return -1;
          if (!isGoodA && isGoodB) return 1;
          return 0;
        });
        cleanRows.push(group[0]);
      }
    });

    if (removedCount > 0) {
      tableData.rows = cleanRows;
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
      } else if (window.desktopAPI && typeof window.desktopAPI.saveLocalSnapshot === 'function') {
        await window.desktopAPI.saveLocalSnapshot(this.db.snapshot);
      }

      if (!silent) {
        if (typeof window.showToast === 'function') {
          window.showToast(`🧹 Removed ${removedCount} duplicate certification records!`, 'success');
        } else {
          alert(`🧹 Cleaned up ${removedCount} duplicate certification records!`);
        }
        this.renderExpiringCerts();
      }
    } else if (!silent) {
      if (typeof window.showToast === 'function') {
        window.showToast('All certification records are unique. No duplicates found.', 'info');
      } else {
        alert('All certification records are unique. No duplicates found.');
      }
    }

    return removedCount;
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
   * Opens the certification date, provider, and notes modal from Expiring Certs table.
   */
  openCertEditModal(sheetRowIdx) {
    const tableData = this.db ? this.db.getTable('expiring_certs') : null;
    if (!tableData || !tableData.rows) return;

    let targetRow = null;
    if (sheetRowIdx) {
      targetRow = tableData.rows.find(r => r._rowIdx === sheetRowIdx);
    }
    if (!targetRow && sheetRowIdx >= 2 && tableData.rows[sheetRowIdx - 2]) {
      targetRow = tableData.rows[sheetRowIdx - 2];
    }
    if (!targetRow) return;

    const empName = String(targetRow['Employee Name'] || targetRow['Name'] || Object.values(targetRow)[0] || '').trim();
    const certType = String(targetRow['Item Type'] || targetRow['Cert Type'] || targetRow['Certification'] || '').trim();
    const acqDate = String(targetRow['Date Acquired'] || targetRow['Acquired Date'] || '').trim();
    const expDate = String(targetRow['Expiration Date'] || targetRow['Expiration'] || '').trim();

    if (empName && certType && window.employeeProfileEngine) {
      window.employeeProfileEngine.openEditCertModal(empName, certType, acqDate || null, expDate || null);
    }
  }

  // ==========================================
  // Cert Photo Vault & Document Proof Methods
  // ==========================================

  /**
   * Opens the Cert Photo Vault modal for a given employee and cert type.
   */
  async openCertPhotoModal(empName, certType, sheetRowIdx = null) {
    if (!empName || !certType) return;
    const modal = document.getElementById('cert-photo-modal');
    const titleEl = document.getElementById('cert-photo-modal-title');
    const subTitleEl = document.getElementById('cert-photo-modal-subtitle');
    if (!modal) return;

    const slots = this.db && typeof this.db.getCertPhotoSlots === 'function' 
      ? this.db.getCertPhotoSlots(certType) 
      : [{ id: 'card', certKey: certType, label: certType, icon: '📄' }];
    const records = this.db && typeof this.db.getCertPhotoRecordsForSlots === 'function' 
      ? this.db.getCertPhotoRecordsForSlots(empName, certType) 
      : [];

    // Prioritize showing an already attached slot, or default to first slot
    let defaultSlot = slots[0];
    const existingSlot = records.find(r => !!(r.record && r.record.fileName));
    if (existingSlot) {
      defaultSlot = existingSlot;
    }

    this.activeCertPhotoContext = {
      empName: String(empName).trim(),
      certType: String(certType).trim(),
      sheetRowIdx,
      activeSlotId: defaultSlot.id,
      activeCertKey: defaultSlot.certKey
    };
    this.stagedCertPhoto = null;
    this.isReplacingCertPhoto = false;

    if (titleEl) titleEl.textContent = `Certification Proof: ${empName}`;
    if (subTitleEl) subTitleEl.textContent = `${certType} — Renewal Proof Vault & HR Email Dispatch`;

    await this.renderCertPhotoModalContent();
    modal.style.display = 'flex';
    modal.classList.add('active');

    if (window.windowManager && typeof window.windowManager.bringToFront === 'function') {
      window.windowManager.bringToFront(modal);
    }

    // Attach clipboard paste handler
    if (this._certPasteHandler) {
      window.removeEventListener('paste', this._certPasteHandler);
    }
    this._certPasteHandler = (e) => this.handleCertPhotoClipboardPaste(e);
    window.addEventListener('paste', this._certPasteHandler);
  }

  /**
   * Switches the active photo sub-tab slot (e.g. Front vs Back of DL, 1st Aid vs CPR).
   */
  switchCertPhotoSlot(slotId) {
    if (!this.activeCertPhotoContext) return;
    const slots = this.db ? this.db.getCertPhotoSlots(this.activeCertPhotoContext.certType) : [];
    const target = slots.find(s => s.id === slotId);
    if (target) {
      this.activeCertPhotoContext.activeSlotId = target.id;
      this.activeCertPhotoContext.activeCertKey = target.certKey;
      this.stagedCertPhoto = null;
      this.isReplacingCertPhoto = false;
      this.renderCertPhotoModalContent();
    }
  }

  /**
   * Closes the Cert Photo Vault modal.
   */
  closeCertPhotoModal() {
    const modal = document.getElementById('cert-photo-modal');
    if (modal) {
      modal.style.display = 'none';
      modal.classList.remove('active');
      if (window.windowManager && typeof window.windowManager.unregisterModal === 'function') {
        window.windowManager.unregisterModal(modal);
      }
    }
    if (this._certPasteHandler) {
      window.removeEventListener('paste', this._certPasteHandler);
      this._certPasteHandler = null;
    }
    this.activeCertPhotoContext = null;
    this.stagedCertPhoto = null;
    this.isReplacingCertPhoto = false;
  }

  /**
   * Renders the dynamic content of the Cert Photo Vault modal.
   */
  async renderCertPhotoModalContent() {
    const body = document.getElementById('cert-photo-modal-body');
    if (!body || !this.activeCertPhotoContext) return;

    const { empName, certType, activeSlotId } = this.activeCertPhotoContext;

    // Look up dates from expiring_certs
    let acqDate = '';
    let expDate = '';
    const tableData = this.db ? this.db.getTable('expiring_certs') : null;
    if (tableData && tableData.rows) {
      const row = tableData.rows.find(r => {
        const rEmp = String(r['Employee Name'] || r['Name'] || '').trim().toLowerCase();
        const rCert = String(r['Item Type'] || r['Cert Type'] || '').trim().toLowerCase();
        return rEmp === empName.toLowerCase() && rCert === certType.toLowerCase();
      });
      if (row) {
        acqDate = String(row['Date Acquired'] || row['Acquired Date'] || '').trim();
        expDate = String(row['Expiration Date'] || row['Expiration'] || '').trim();
      }
    }

    const summary = this.db && typeof this.db.getCertPhotoStatusSummary === 'function'
      ? this.db.getCertPhotoStatusSummary(empName, certType)
      : { total: 1, count: 0, hasAll: false, hasAny: false, isMultiSlot: false, slots: [] };

    const currentSlot = (summary.slots && summary.slots.find(s => s.id === activeSlotId)) || (summary.slots && summary.slots[0]) || {
      id: 'card', label: certType, certKey: certType, record: null
    };

    // Ensure activeCertKey is in sync with currentSlot
    this.activeCertPhotoContext.activeCertKey = currentSlot.certKey;
    this.activeCertPhotoContext.activeSlotId = currentSlot.id;

    const photoRecord = currentSlot.record;
    const hasSavedPhoto = !!(photoRecord && photoRecord.fileName && !this.isReplacingCertPhoto);
    const savedHrEmail = (this.db && this.db.snapshot && this.db.snapshot.configs && this.db.snapshot.configs.hr_email) || '';

    // Multi-slot tab selector HTML
    let tabsHtml = '';
    if (summary.isMultiSlot) {
      tabsHtml = `
        <div style="display: flex; gap: 8px; margin-bottom: 12px; background: rgba(15, 23, 42, 0.6); padding: 5px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.08);">
          ${summary.slots.map(s => {
            const isActive = s.id === currentSlot.id;
            const hasSlotPhoto = !!(s.record && s.record.fileName);
            return `
              <button type="button" 
                onclick="window.sheetNavigator.switchCertPhotoSlot('${s.id}')"
                style="flex: 1; padding: 8px 12px; border-radius: 6px; border: ${isActive ? '1px solid #38bdf8' : '1px solid transparent'}; background: ${isActive ? 'rgba(56, 189, 248, 0.18)' : 'transparent'}; color: ${isActive ? '#f8fafc' : '#94a3b8'}; font-weight: ${isActive ? '700' : '500'}; font-size: 12.5px; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 8px; transition: all 0.15s ease;">
                <span>${s.icon || '📄'}</span>
                <span>${this.escapeHtml(s.label)}</span>
                <span class="badge" style="font-size: 10px; padding: 2px 6px; border-radius: 12px; font-weight: 700; ${hasSlotPhoto ? 'background: rgba(16, 185, 129, 0.25); color: #34d399; border: 1px solid rgba(16, 185, 129, 0.4);' : 'background: rgba(148, 163, 184, 0.15); color: #94a3b8; border: 1px solid rgba(148, 163, 184, 0.25);'}">
                  ${hasSlotPhoto ? '✅ Attached' : '📷 Missing'}
                </span>
              </button>
            `;
          }).join('')}
        </div>
      `;
    }

    // Top Meta Details Card
    const metaCardHtml = `
      <div style="background: rgba(30, 41, 59, 0.7); border: 1px solid rgba(255,255,255,0.1); border-radius: 10px; padding: 12px 16px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px; margin-bottom: 12px;">
        <div>
          <div style="font-size: 15px; font-weight: 800; color: #f8fafc;">
            👤 ${this.escapeHtml(empName)} · <span style="color: #38bdf8;">${this.escapeHtml(certType)}</span>
          </div>
          <div style="font-size: 11.5px; color: #94a3b8; margin-top: 4px; display: flex; gap: 14px; flex-wrap: wrap;">
            <span>📅 Acquired: <strong style="color: #e2e8f0;">${this.escapeHtml(acqDate || '—')}</strong></span>
            <span>⏳ Expires: <strong style="color: #e2e8f0;">${this.escapeHtml(expDate || '—')}</strong></span>
            ${summary.isMultiSlot ? `<span>📑 Attached: <strong style="color: ${summary.hasAll ? '#34d399' : (summary.hasAny ? '#fbbf24' : '#94a3b8')}">${summary.count} of ${summary.total} photos</strong></span>` : ''}
          </div>
        </div>
        <div>
          <span class="badge" style="padding: 4px 10px; border-radius: 20px; font-size: 11.5px; font-weight: 700; ${summary.hasAll ? 'background: rgba(16, 185, 129, 0.2); color: #34d399; border: 1px solid rgba(16, 185, 129, 0.4);' : (summary.hasAny ? 'background: rgba(251, 191, 36, 0.2); color: #fbbf24; border: 1px solid rgba(251, 191, 36, 0.4);' : 'background: rgba(148, 163, 184, 0.15); color: #94a3b8; border: 1px solid rgba(148, 163, 184, 0.3);')}">
            ${summary.hasAll ? '✅ All Proofs Attached' : (summary.hasAny ? `⚠️ Partially Attached (${summary.count}/${summary.total})` : 'No Proof Attached')}
          </span>
        </div>
      </div>
    `;

    // Attached files summary for HR dispatch
    const attachedFileListHtml = summary.attachedSlots && summary.attachedSlots.length > 0
      ? summary.attachedSlots.map(s => `<span style="display: inline-flex; align-items: center; gap: 4px; background: rgba(0,0,0,0.3); padding: 2px 8px; border-radius: 4px; color: #e2e8f0; font-size: 11px;">${s.icon || '📄'} <strong>${this.escapeHtml(s.label)}:</strong> ${this.escapeHtml(s.record.fileName)}</span>`).join(' ')
      : '<span style="color: #64748b; font-size: 11px;">No photos attached yet</span>';

    const hrDispatchSectionHtml = `
      <div style="margin-top: 14px; background: rgba(14, 165, 233, 0.06); border: 1px solid rgba(14, 165, 233, 0.25); border-radius: 10px; padding: 14px 16px; display: flex; flex-direction: column; gap: 10px;">
        <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px;">
          <div style="font-size: 12.5px; font-weight: 800; color: #38bdf8; display: flex; align-items: center; gap: 6px;">
            <span>📧</span> 1-Click HR Email Dispatch
          </div>
          <div style="font-size: 11px; color: var(--text-muted);">Pre-fills email subject, body, and highlights all photos in folder to drag and attach</div>
        </div>

        <div style="font-size: 11px; color: #94a3b8; display: flex; gap: 8px; align-items: center; flex-wrap: wrap;">
          <span>📎 Files to attach:</span>
          ${attachedFileListHtml}
        </div>

        <div style="display: flex; gap: 10px; align-items: center;">
          <input type="email" id="cert-photo-hr-email" value="${this.escapeHtml(savedHrEmail)}" placeholder="HR Email (e.g. hr@company.com)" style="flex: 1; background: var(--bg-primary); border: 1px solid var(--border-color); border-radius: 6px; color: var(--text-primary); padding: 7px 10px; font-size: 12px; outline: none;">
          <button class="btn btn-primary" style="font-size: 12px; font-weight: 700; padding: 7px 14px; background: linear-gradient(135deg, #0284c7 0%, #2563eb 100%); border: none; display: inline-flex; align-items: center; gap: 6px; box-shadow: 0 2px 10px rgba(14, 165, 233, 0.35); cursor: pointer;" onclick="window.sheetNavigator.emailCertPhotoToHR('${this.escapeJs(empName)}', '${this.escapeJs(certType)}')">
            <span>📧</span> Email to HR
          </button>
        </div>
      </div>
    `;

    // 1. If we have a staged photo for the active slot
    if (this.stagedCertPhoto) {
      const isPdf = this.stagedCertPhoto.base64Data && this.stagedCertPhoto.base64Data.startsWith('data:application/pdf');
      body.innerHTML = `
        ${metaCardHtml}
        ${tabsHtml}
        <div style="background: rgba(14, 165, 233, 0.08); border: 1px solid rgba(14, 165, 233, 0.3); border-radius: 10px; padding: 12px 16px; display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px;">
          <div>
            <div style="font-weight: 800; font-size: 14px; color: #f8fafc;">✨ Staged Photo Ready for ${this.escapeHtml(currentSlot.label)}</div>
            <div style="font-size: 11.5px; color: #94a3b8; margin-top: 2px;">
              ${this.escapeHtml(this.stagedCertPhoto.fileName || 'Pasted Image')} · Review preview below and click Save.
            </div>
          </div>
          <span class="badge" style="background: #0284c7; color: white; padding: 4px 10px; border-radius: 4px; font-weight: 700; font-size: 11px;">Staged</span>
        </div>

        <div style="text-align: center; background: #0f172a; border-radius: 10px; border: 1px solid rgba(255,255,255,0.1); padding: 16px; max-height: 400px; display: flex; align-items: center; justify-content: center; overflow: hidden;">
          ${isPdf ? `
            <div style="padding: 30px;">
              <span style="font-size: 48px;">📄</span>
              <div style="font-size: 14px; font-weight: 700; color: #f8fafc; margin-top: 10px;">${this.escapeHtml(this.stagedCertPhoto.fileName || 'PDF Document')}</div>
            </div>
          ` : `
            <img src="${this.stagedCertPhoto.base64Data}" style="max-width: 100%; max-height: 360px; object-fit: contain; border-radius: 6px; box-shadow: 0 4px 20px rgba(0,0,0,0.5);">
          `}
        </div>

        <div style="display: flex; justify-content: flex-end; gap: 10px; padding-top: 12px;">
          <button class="btn btn-secondary" onclick="window.sheetNavigator.cancelStagedCertPhoto()">✕ Cancel</button>
          <button class="btn btn-primary" onclick="window.sheetNavigator.saveStagedCertPhoto()" style="font-weight: 700; display: inline-flex; align-items: center; gap: 6px; background: linear-gradient(135deg, #059669 0%, #10b981 100%); border: none;">
            <span>💾</span> Save & Attach for ${this.escapeHtml(currentSlot.label)}
          </button>
        </div>
      `;
      return;
    }

    // 2. If photo exists on disk for active slot
    if (hasSavedPhoto) {
      let photoDataUrl = '';
      let fileExists = true;
      if (window.desktopAPI && typeof window.desktopAPI.getCertPhoto === 'function') {
        const res = await window.desktopAPI.getCertPhoto({ fileName: photoRecord.fileName, fullPath: photoRecord.fullPath });
        if (res && res.exists) {
          photoDataUrl = res.base64Data;
        } else {
          fileExists = false;
        }
      }

      const isPdf = photoRecord.fileName.toLowerCase().endsWith('.pdf');

      body.innerHTML = `
        ${metaCardHtml}
        ${tabsHtml}

        <div style="background: #0f172a; border-radius: 10px; border: 1px solid rgba(255,255,255,0.1); padding: 14px; text-align: center; position: relative;">
          ${fileExists ? (
            isPdf ? `
              <div style="width: 100%; height: 420px; position: relative;">
                ${photoDataUrl ? `
                  <object data="${photoDataUrl}#toolbar=1&navpanes=0&view=FitH" type="application/pdf" style="width: 100%; height: 100%; border: none; border-radius: 6px; background: #1e293b;">
                    <iframe src="${photoDataUrl}" style="width: 100%; height: 100%; border: none; background: #1e293b;">
                      <div style="padding: 40px 20px; text-align: center;">
                        <span style="font-size: 50px;">📄</span>
                        <div style="font-size: 14.5px; font-weight: 800; color: #f8fafc; margin-top: 8px;">${this.escapeHtml(photoRecord.fileName)}</div>
                        <button class="btn btn-secondary" style="margin-top: 14px; color: #38bdf8; border-color: rgba(56, 189, 248, 0.4);" onclick="window.sheetNavigator.openCertPhotoExternally('${this.escapeJs(photoRecord.fileName)}')">
                          📄 Open PDF in Default Viewer
                        </button>
                      </div>
                    </iframe>
                  </object>
                ` : `
                  <div style="padding: 40px 20px;">
                    <span style="font-size: 50px;">📄</span>
                    <div style="font-size: 14.5px; font-weight: 800; color: #f8fafc; margin-top: 8px;">${this.escapeHtml(photoRecord.fileName)}</div>
                    <button class="btn btn-secondary" style="margin-top: 14px; color: #38bdf8; border-color: rgba(56, 189, 248, 0.4);" onclick="window.sheetNavigator.openCertPhotoExternally('${this.escapeJs(photoRecord.fileName)}')">
                      📄 Open PDF in Default Viewer
                    </button>
                  </div>
                `}
              </div>
              <div style="font-size: 11px; color: #64748b; margin-top: 6px;">💡 Embedded PDF Document · Click below to open in Acrobat or Edge</div>
            ` : `
              <img src="${photoDataUrl}" style="max-width: 100%; max-height: 380px; object-fit: contain; border-radius: 6px; cursor: pointer; transition: transform 0.2s;" onclick="window.sheetNavigator.openCertPhotoExternally('${this.escapeJs(photoRecord.fileName)}')" title="Click to view full image in Windows Photos">
              <div style="font-size: 11px; color: #64748b; margin-top: 6px;">💡 Click photo to view high-resolution image in Windows Photos</div>
            `
          ) : `
            <div style="padding: 30px; color: #f87171;">
              ⚠️ Photo file was not found in the local cert_photos folder (${this.escapeHtml(photoRecord.fileName)}).
            </div>
          `}
        </div>

        ${hrDispatchSectionHtml}

        <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px; padding-top: 12px; border-top: 1px solid rgba(255,255,255,0.08); margin-top: 12px;">
          <div style="display: flex; gap: 8px;">
            <button class="btn btn-secondary" style="font-size: 11.5px; padding: 5px 10px;" onclick="window.sheetNavigator.openCertPhotoExternally('${this.escapeJs(photoRecord.fileName)}')">
              📂 Windows Photos
            </button>
            <button class="btn btn-secondary" style="font-size: 11.5px; padding: 5px 10px;" onclick="window.sheetNavigator.showCertPhotoInFolder('${this.escapeJs(photoRecord.fileName)}')">
              📁 Show in Folder
            </button>
          </div>
          <div style="display: flex; gap: 8px;">
            <button class="btn btn-secondary" style="font-size: 11.5px; padding: 5px 10px; color: #38bdf8; border-color: rgba(56, 189, 248, 0.4);" onclick="window.sheetNavigator.startReplaceCertPhoto()">
              🔄 Replace ${this.escapeHtml(currentSlot.label)}
            </button>
            <button class="btn btn-secondary" style="font-size: 11.5px; padding: 5px 10px; color: #f87171; border-color: rgba(239, 68, 68, 0.4); background: rgba(239, 68, 68, 0.08);" onclick="window.sheetNavigator.handleCertPhotoDelete('${this.escapeJs(empName)}', '${this.escapeJs(currentSlot.certKey)}')">
              🗑️ Remove ${this.escapeHtml(currentSlot.label)}
            </button>
          </div>
        </div>
      `;
      return;
    }

    // 3. Default: Dropzone / Upload state for the active slot
    body.innerHTML = `
      ${metaCardHtml}
      ${tabsHtml}

      <!-- Drag & Drop Zone -->
      <div id="cert-photo-dropzone" 
           ondragover="event.preventDefault(); this.style.borderColor='#38bdf8'; this.style.background='rgba(56,189,248,0.1)';" 
           ondragleave="this.style.borderColor='#0284c7'; this.style.background='rgba(14,165,233,0.05)';" 
           ondrop="window.sheetNavigator.handleCertPhotoDrop(event)"
           onclick="window.sheetNavigator.handleCertPhotoFileBrowse()"
           style="border: 2px dashed #0284c7; background: rgba(14, 165, 233, 0.05); padding: 42px 20px; text-align: center; border-radius: 12px; cursor: pointer; transition: all 0.2s ease;">
        <div style="font-size: 42px; margin-bottom: 10px;">📥</div>
        <div style="font-size: 15px; font-weight: 800; color: #f8fafc;">
          Drag &amp; Drop photo for <span style="color: #38bdf8;">${this.escapeHtml(currentSlot.label)}</span> here
        </div>
        <div style="font-size: 12.5px; color: #38bdf8; margin-top: 6px; font-weight: 600;">
          or click to browse image / PDF from your computer
        </div>
        <div style="margin-top: 16px; display: inline-flex; align-items: center; gap: 8px; background: rgba(250, 204, 21, 0.1); border: 1px solid rgba(250, 204, 21, 0.3); padding: 6px 14px; border-radius: 20px;">
          <span style="font-size: 13px;">💡</span>
          <span style="font-size: 11.5px; color: #fde047; font-weight: 700;">
            Or press <code style="background: rgba(0,0,0,0.3); padding: 2px 6px; border-radius: 4px; color: white;">Ctrl + V</code> anywhere to paste directly from your clipboard!
          </span>
        </div>
        <div style="font-size: 11px; color: #64748b; margin-top: 10px;">
          Supports JPG, PNG, WEBP, Apple HEIC, and PDF documents. Texted photos can be copied and pasted in one click.
        </div>
      </div>

      ${hrDispatchSectionHtml}

      <div style="display: flex; justify-content: flex-end; padding-top: 12px;">
        <button class="btn btn-secondary" onclick="window.sheetNavigator.closeCertPhotoModal()">Close</button>
      </div>
    `;
  }

  startReplaceCertPhoto() {
    this.isReplacingCertPhoto = true;
    this.stagedCertPhoto = null;
    this.renderCertPhotoModalContent();
  }

  cancelStagedCertPhoto() {
    this.stagedCertPhoto = null;
    this.isReplacingCertPhoto = false;
    this.renderCertPhotoModalContent();
  }

  handleCertPhotoClipboardPaste(e) {
    if (!this.activeCertPhotoContext) return;
    const items = e.clipboardData && e.clipboardData.items;
    if (!items || !items.length) return;

    for (const item of items) {
      if (item.type.indexOf('image') !== -1) {
        e.preventDefault();
        const blob = item.getAsFile();
        const reader = new FileReader();
        reader.onload = (event) => {
          this.stagedCertPhoto = {
            base64Data: event.target.result,
            fileName: `Pasted_Photo_${Date.now()}.png`
          };
          this.renderCertPhotoModalContent();
          if (typeof window.showToast === 'function') {
            window.showToast('📋 Image pasted from clipboard! Click "Save & Attach Photo" to store.', 'info');
          }
        };
        reader.readAsDataURL(blob);
        break;
      }
    }
  }

  handleCertPhotoDrop(event) {
    event.preventDefault();
    const dropzone = document.getElementById('cert-photo-dropzone');
    if (dropzone) {
      dropzone.style.borderColor = '#0284c7';
      dropzone.style.background = 'rgba(14, 165, 233, 0.05)';
    }

    if (!this.activeCertPhotoContext) return;
    const files = event.dataTransfer && event.dataTransfer.files;
    if (!files || !files.length) return;
    const file = files[0];
    const reader = new FileReader();
    reader.onload = async (e) => {
      let b64 = e.target.result;
      let fName = file.name;
      if (fName.toLowerCase().endsWith('.heic') || fName.toLowerCase().endsWith('.heif') || b64.startsWith('data:image/heic') || b64.startsWith('data:image/heif')) {
        b64 = await this.convertHeicDataUrlToJpeg(b64);
        fName = fName.replace(/\.heic$/i, '.jpg').replace(/\.heif$/i, '.jpg');
      }
      this.stagedCertPhoto = {
        base64Data: b64,
        originalPath: file.path || null,
        fileName: fName
      };
      this.renderCertPhotoModalContent();
    };
    reader.readAsDataURL(file);
  }

  async handleCertPhotoFileBrowse() {
    if (!window.desktopAPI || !window.desktopAPI.selectCertPhotoFile) return;
    const res = await window.desktopAPI.selectCertPhotoFile();
    if (res && res.success) {
      let b64 = res.base64Data;
      let fName = res.fileName;
      if (fName.toLowerCase().endsWith('.heic') || fName.toLowerCase().endsWith('.heif') || b64.startsWith('data:image/heic') || b64.startsWith('data:image/heif')) {
        b64 = await this.convertHeicDataUrlToJpeg(b64);
        fName = fName.replace(/\.heic$/i, '.jpg').replace(/\.heif$/i, '.jpg');
      }
      this.stagedCertPhoto = {
        base64Data: b64,
        originalPath: res.originalPath,
        fileName: fName
      };
      await this.renderCertPhotoModalContent();
    }
  }

  async saveStagedCertPhoto() {
    if (!this.activeCertPhotoContext || !this.stagedCertPhoto) return;
    const { empName, certType } = this.activeCertPhotoContext;
    const certKey = this.activeCertPhotoContext.activeCertKey || certType;

    if (!window.desktopAPI || !window.desktopAPI.saveCertPhoto) {
      alert('Desktop file saving API is not available.');
      return;
    }

    const saveRes = await window.desktopAPI.saveCertPhoto({
      employeeName: empName,
      certType: certKey,
      base64Data: this.stagedCertPhoto.base64Data,
      originalPath: this.stagedCertPhoto.originalPath
    });

    if (saveRes && saveRes.success) {
      const todayStr = new Date().toLocaleDateString('en-US');
      await this.db.saveCertPhotoRecord(empName, certKey, {
        fileName: saveRes.fileName,
        fullPath: saveRes.fullPath,
        dateAdded: todayStr
      });

      this.stagedCertPhoto = null;
      this.isReplacingCertPhoto = false;
      if (typeof window.showToast === 'function') {
        window.showToast(`✅ Renewal proof for ${empName} saved successfully!`, 'success');
      }
      await this.renderCertPhotoModalContent();
      this.renderCurrentSheet();
    } else {
      alert(`Failed to save photo: ${(saveRes && saveRes.error) || 'Unknown error'}`);
    }
  }

  async handleCertPhotoDelete(empName, certKey) {
    if (!empName || !certKey) return;
    if (!confirm(`Are you sure you want to remove the renewal proof photo for ${empName} (${certKey})?`)) {
      return;
    }

    const photoRecord = this.db.getCertPhotoRecord(empName, certKey);
    if (photoRecord && photoRecord.fileName && window.desktopAPI && window.desktopAPI.deleteCertPhoto) {
      await window.desktopAPI.deleteCertPhoto({ fileName: photoRecord.fileName, fullPath: photoRecord.fullPath });
    }

    await this.db.deleteCertPhotoRecord(empName, certKey);
    this.stagedCertPhoto = null;
    this.isReplacingCertPhoto = false;

    if (typeof window.showToast === 'function') {
      window.showToast(`🗑️ Proof photo removed for ${empName} (${certKey}).`, 'info');
    }
    await this.renderCertPhotoModalContent();
    this.renderCurrentSheet();
  }

  async openCertPhotoExternally(fileName) {
    if (!fileName || !window.desktopAPI || !window.desktopAPI.openCertPhotoExternally) return;
    await window.desktopAPI.openCertPhotoExternally({ fileName });
  }

  async showCertPhotoInFolder(fileName) {
    if (!fileName || !window.desktopAPI || !window.desktopAPI.showCertPhotoInFolder) return;
    await window.desktopAPI.showCertPhotoInFolder({ fileName });
  }

  async emailCertPhotoToHR(empName, certType) {
    if (!empName || !certType) return;
    const summary = this.db && typeof this.db.getCertPhotoStatusSummary === 'function'
      ? this.db.getCertPhotoStatusSummary(empName, certType)
      : { attachedSlots: [], isMultiSlot: false, hasAll: false, hasAny: false, count: 0, total: 1 };

    const attachedSlots = summary.attachedSlots || [];

    let acqDate = '';
    let expDate = '';
    const tableData = this.db.getTable('expiring_certs');
    if (tableData && tableData.rows) {
      const row = tableData.rows.find(r => {
        const rEmp = String(r['Employee Name'] || r['Name'] || '').trim().toLowerCase();
        const rCert = String(r['Item Type'] || r['Cert Type'] || '').trim().toLowerCase();
        return rEmp === empName.toLowerCase() && rCert === certType.toLowerCase();
      });
      if (row) {
        acqDate = String(row['Date Acquired'] || row['Acquired Date'] || '').trim();
        expDate = String(row['Expiration Date'] || row['Expiration'] || '').trim();
      }
    }

    const hrEmailInput = document.getElementById('cert-photo-hr-email');
    let hrEmail = hrEmailInput ? hrEmailInput.value.trim() : '';
    if (!hrEmail && this.db.snapshot && this.db.snapshot.configs && this.db.snapshot.configs.hr_email) {
      hrEmail = this.db.snapshot.configs.hr_email;
    }
    if (hrEmail) {
      if (!this.db.snapshot.configs) this.db.snapshot.configs = {};
      this.db.snapshot.configs.hr_email = hrEmail;
      if (typeof this.db.saveLocalSnapshot === 'function') {
        await this.db.saveLocalSnapshot();
      }
    }

    let subSuffix = '';
    if (summary.isMultiSlot && summary.hasAll) {
      subSuffix = ' (Front & Back Attached)';
    } else if (summary.isMultiSlot && summary.hasAny) {
      subSuffix = ` (${attachedSlots.map(s => s.label).join(' & ')} Attached)`;
    }

    const subject = `Certification Renewal Proof: ${empName} - ${certType}${subSuffix}`;
    let body = `Hello HR,\n\nAttached is the renewed certification proof for ${empName}.\n\n• Employee: ${empName}\n• Certification: ${certType}\n• Date Acquired: ${acqDate || 'On file'}\n• Expiration Date: ${expDate || 'Current'}`;
    if (attachedSlots.length > 0) {
      body += `\n\nAttached Proof Cards:\n` + attachedSlots.map(s => `  • ${s.label}: ${s.record.fileName}`).join('\n');
    }
    body += `\n\nPlease update company HR records accordingly.\n\nThank you,\nSafety Department`;

    const mailtoUrl = `mailto:${encodeURIComponent(hrEmail)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

    if (window.desktopAPI && typeof window.desktopAPI.openExternal === 'function') {
      await window.desktopAPI.openExternal(mailtoUrl);
    } else {
      window.open(mailtoUrl, '_blank');
    }

    // Highlight / show file(s) in folder
    if (attachedSlots.length > 0 && window.desktopAPI && typeof window.desktopAPI.showCertPhotoInFolder === 'function') {
      for (const s of attachedSlots) {
        if (s.record && s.record.fileName) {
          await window.desktopAPI.showCertPhotoInFolder({ fileName: s.record.fileName, fullPath: s.record.fullPath });
        }
      }
    }

    if (typeof window.showToast === 'function') {
      window.showToast('📧 Opening email client... Proof files highlighted in folder to drag and attach!', 'info');
    }
  }

  // ==========================================
  // GMAIL CERT RENEWAL SCANNER & CROPPER
  // ==========================================

  /**
   * Opens the Gmail Cert Renewal Scanner modal.
   */
  openCertEmailScannerModal() {
    const modal = document.getElementById('cert-email-scanner-modal');
    if (!modal) return;
    modal.style.display = 'flex';
    modal.classList.add('active');

    if (window.windowManager && typeof window.windowManager.bringToFront === 'function') {
      window.windowManager.bringToFront(modal);
    }

    if (!this.scannedCertItems || this.scannedCertItems.length === 0) {
      this.renderCertScannerInitialState();
    } else {
      this.renderScannedCertItems();
    }
  }

  /**
   * Closes the Gmail Cert Renewal Scanner modal.
   */
  closeCertEmailScannerModal() {
    const modal = document.getElementById('cert-email-scanner-modal');
    if (modal) {
      modal.style.display = 'none';
      modal.classList.remove('active');
      if (window.windowManager && typeof window.windowManager.unregisterModal === 'function') {
        window.windowManager.unregisterModal(modal);
      }
    }
  }

  /**
   * Renders initial state prompting user to start scanning.
   */
  renderCertScannerInitialState() {
    const body = document.getElementById('cert-email-scanner-body');
    const batchActions = document.getElementById('cert-scan-batch-actions');
    if (batchActions) batchActions.style.display = 'none';
    if (!body) return;

    body.innerHTML = `
      <div style="text-align: center; padding: 48px 20px; color: #94a3b8;">
        <div style="font-size: 52px; margin-bottom: 16px;">📧</div>
        <h3 style="color: #f8fafc; font-size: 19px; font-weight: 800; margin-bottom: 8px;">Scan Gmail for Cert Renewal Photos</h3>
        <p style="max-width: 620px; margin: 0 auto 24px; font-size: 13.5px; line-height: 1.6; color: #cbd5e1;">
          Automatically detects renewal proof attachments from sent or received emails titled like 
          <strong style="color: #38bdf8;">"Emery Dewitt DL"</strong>, <strong style="color: #38bdf8;">"Josh Miller MEC"</strong>, 
          <strong style="color: #38bdf8;">"1st Aid CPR"</strong>, or <strong style="color: #38bdf8;">"Crane Evaluation"</strong>.
        </p>
        <button class="btn btn-primary" style="font-size: 14px; font-weight: 700; padding: 9px 24px; background: linear-gradient(135deg, #06b6d4 0%, #0284c7 100%); border: none; box-shadow: 0 4px 14px rgba(6, 182, 212, 0.4); cursor: pointer; border-radius: 8px;" onclick="window.sheetNavigator.runCertEmailScan()">
          <span>🔍</span> Scan Gmail Now
        </button>
      </div>
    `;
  }

  /**
   * Scans Gmail for cert renewals via Apps Script backend.
   */
  async runCertEmailScan() {
    const daysSelect = document.getElementById('cert-scan-days-back');
    const folderSelect = document.getElementById('cert-scan-folder');
    const queryInput = document.getElementById('cert-scan-query');
    const daysBack = daysSelect ? parseInt(daysSelect.value, 10) : 365;
    const folder = folderSelect ? folderSelect.value : 'ALL';
    const query = queryInput ? queryInput.value.trim() : '';

    const spinner = document.getElementById('cert-scan-spinner');
    const icon = document.getElementById('cert-scan-icon');
    const label = document.getElementById('cert-scan-label');
    const triggerBtn = document.getElementById('btn-cert-scan-trigger');

    if (spinner) spinner.style.display = 'inline';
    if (icon) icon.style.display = 'none';
    if (label) label.textContent = 'Scanning Gmail...';
    if (triggerBtn) triggerBtn.disabled = true;

    const body = document.getElementById('cert-email-scanner-body');
    if (body) {
      body.innerHTML = `
        <div style="text-align: center; padding: 60px 20px; color: #94a3b8;">
          <div style="font-size: 44px; margin-bottom: 14px; animation: pulse 1.5s infinite;">⏳</div>
          <h4 style="color: #f8fafc; font-size: 16px; font-weight: 700; margin-bottom: 6px;">Scanning Gmail Inbox &amp; Sent Mail...</h4>
          <p style="font-size: 12.5px; color: #94a3b8;">Searching for attachments with DL, MEC, CPR, 1st Aid, Crane, and other cert titles...</p>
        </div>
      `;
    }

    try {
      const syncUrl = window.syncEngine ? window.syncEngine.getSyncUrl() : '';
      if (!syncUrl) {
        throw new Error('Sync URL is not configured. Please check connection settings.');
      }

      const activeEmps = this.getActiveEmployeeNamesList();
      let maxThreads = 200;
      if (daysBack >= 365 || daysBack === 0) {
        maxThreads = 500;
      } else if (daysBack >= 180) {
        maxThreads = 350;
      }

      const prevEmps = Array.from(this.getPreviousEmployeeNamesSet());
      const payload = {
        action: 'scanCertEmails',
        daysBack: daysBack,
        folder: folder,
        query: query,
        maxThreads: maxThreads,
        maxResults: 150,
        activeEmployees: activeEmps,
        previousEmployees: prevEmps
      };

      let result = null;
      if (window.syncEngine && typeof window.syncEngine.executeNetworkRequest === 'function') {
        result = await window.syncEngine.executeNetworkRequest(syncUrl, 'POST', payload, 60000);
      } else {
        const resp = await fetch(syncUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        result = await resp.json();
      }

      if (result && result.success) {
        const prevSet = this.getPreviousEmployeeNamesSet();
        const rawCerts = result.certs || [];
        this.scannedCertItems = rawCerts.filter(item => {
          const emp = String(item.employeeName || '').toLowerCase().trim();
          if (emp && prevSet.has(emp)) return false;
          const subjEmp = this.matchEmployeeFromText(item.subject, activeEmps);
          if (!subjEmp) {
            // Check if subject is for a previous employee
            for (const prevName of prevSet) {
              const re = new RegExp('\\b' + prevName.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&') + '\\b', 'i');
              if (re.test(item.subject)) return false;
            }
          }
          return true;
        });

        // Pre-match active employee names from candidate name, subject, or filename
        this.scannedCertItems.forEach(item => {
          if (!item.employeeName || !activeEmps.some(n => n.toLowerCase() === item.employeeName.toLowerCase())) {
            const matched = (item.employeeName ? this.matchEmployeeFromText(item.employeeName, activeEmps) : '') ||
                            this.matchEmployeeFromText(item.subject, activeEmps) ||
                            this.matchEmployeeFromText(item.fileName, activeEmps);
            if (matched) {
              item.employeeName = matched;
            }
          }
        });

        if (this.scannedCertItems.length === 0) {
          if (body) {
            const timeDesc = daysBack === 0 ? 'all time' : (daysBack >= 365 ? `the last ${Math.round(daysBack / 365)} year(s)` : `the last ${daysBack} days`);
            body.innerHTML = `
              <div style="text-align: center; padding: 50px 20px; color: #94a3b8;">
                <div style="font-size: 44px; margin-bottom: 12px;">📭</div>
                <h4 style="color: #f8fafc; font-size: 16px; font-weight: 700; margin-bottom: 6px;">No Cert Renewal Attachments Found</h4>
                <p style="font-size: 13px; color: #94a3b8; max-width: 500px; margin: 0 auto 16px;">
                  No emails with matching certification keywords and image/PDF attachments were found in ${timeDesc}${query ? ` matching "${query}"` : ''}.
                </p>
                <div style="font-size: 12px; color: #64748b;">
                  Tip: Try searching by employee name or changing the timeframe.
                </div>
              </div>
            `;
          }
          const batchActions = document.getElementById('cert-scan-batch-actions');
          if (batchActions) batchActions.style.display = 'none';
        } else {
          this.renderScannedCertItems();
          // Kick off background image loading for the cards
          this.loadScannedCertImagesQueue();

          if (typeof window.showToast === 'function') {
            window.showToast(`Found ${this.scannedCertItems.length} cert renewal attachments in Gmail!`, 'success');
          }
        }
      } else {
        throw new Error((result && result.error) || 'Failed to scan Gmail');
      }
    } catch (err) {
      console.error('Cert email scan error:', err);
      if (body) {
        body.innerHTML = `
          <div style="text-align: center; padding: 40px 20px; color: #ef4444;">
            <div style="font-size: 40px; margin-bottom: 10px;">⚠️</div>
            <h4 style="font-size: 15px; font-weight: 700; margin-bottom: 6px;">Gmail Scan Error</h4>
            <p style="font-size: 12.5px; color: #f87171; max-width: 520px; margin: 0 auto 14px;">${err.message || err}</p>
            <button class="btn btn-secondary" onclick="window.sheetNavigator.runCertEmailScan()">Try Again</button>
          </div>
        `;
      }
    } finally {
      if (spinner) spinner.style.display = 'none';
      if (icon) icon.style.display = 'inline';
      if (label) label.textContent = 'Scan Gmail';
      if (triggerBtn) triggerBtn.disabled = false;
    }
  }

  /**
   * Updates or inserts a certification record's expiration date & date acquired in expiring_certs table.
   */
  async updateCertDatesInTable(empName, certType, expDate, acqDate = '') {
    if (!empName || !certType || !expDate) return false;
    const tableData = this.db ? this.db.getTable('expiring_certs') : null;
    if (!tableData || !tableData.rows) return false;

    const headers = tableData.headers || ['Employee Name', 'Item Type', 'Date Acquired', 'Expiration Date', 'Status', 'Days Until Expiration'];
    const normEmp = empName.toLowerCase().trim();
    const normCert = certType.toLowerCase().trim();

    // Find matching row in expiring_certs
    let row = tableData.rows.find(r => {
      const rEmp = String(r['Employee Name'] || r['Name'] || '').toLowerCase().trim();
      const rCert = String(r['Item Type'] || r['Cert Type'] || '').toLowerCase().trim();
      return rEmp === normEmp && (rCert === normCert || (normCert.startsWith('dl') && rCert.startsWith('dl')));
    });

    // Calculate days left and status
    let daysLeft = null;
    let status = 'Valid';
    try {
      const parts = expDate.split('/');
      if (parts.length === 3) {
        const exp = new Date(parseInt(parts[2], 10), parseInt(parts[0], 10) - 1, parseInt(parts[1], 10));
        const now = new Date();
        now.setHours(0, 0, 0, 0);
        const diffMs = exp.getTime() - now.getTime();
        daysLeft = Math.round(diffMs / (1000 * 60 * 60 * 24));
        if (daysLeft < 0) status = 'Expired';
        else if (daysLeft <= 30) status = 'Expiring Soon';
        else status = 'Valid';
      }
    } catch (e) {}

    if (row) {
      const rowIdx = row._rowIdx;
      const colExp = headers.findIndex(h => /expir/i.test(h)) + 1;
      const colAcq = headers.findIndex(h => /acquir/i.test(h)) + 1;

      const oldExp = row['Expiration Date'] || row['Expiration'] || '';
      row['Expiration Date'] = expDate;
      if (acqDate) row['Date Acquired'] = acqDate;
      row['Status'] = status;
      if (daysLeft !== null) row['Days Until Expiration'] = String(daysLeft);

      if (rowIdx && this.db && typeof this.db.addMutation === 'function') {
        if (colExp > 0) {
          await this.db.addMutation({
            action: 'UPDATE_CELL',
            sheetName: 'Expiring Certs',
            tableKey: 'expiring_certs',
            row: rowIdx,
            col: colExp,
            header: headers[colExp - 1],
            oldValue: oldExp,
            value: expDate
          });
        }
        if (acqDate && colAcq > 0) {
          await this.db.addMutation({
            action: 'UPDATE_CELL',
            sheetName: 'Expiring Certs',
            tableKey: 'expiring_certs',
            row: rowIdx,
            col: colAcq,
            header: headers[colAcq - 1],
            oldValue: row['Date Acquired'] || '',
            value: acqDate
          });
        }
      }
    } else {
      // Create new record in expiring_certs
      const newRow = {
        'Employee Name': empName,
        'Name': empName,
        'Item Type': certType,
        'Cert Type': certType,
        'Date Acquired': acqDate || '',
        'Expiration Date': expDate,
        'Status': status,
        'Days Until Expiration': daysLeft !== null ? String(daysLeft) : ''
      };
      newRow._rowIdx = tableData.rows.length + 2;
      tableData.rows.push(newRow);
      tableData.rowCount = tableData.rows.length;
      if (tableData.rawGrid) {
        tableData.rawGrid.push(headers.map(h => newRow[h] !== undefined ? newRow[h] : ''));
        tableData.maxRows = tableData.rawGrid.length;
      }
      if (this.db && typeof this.db.addMutation === 'function') {
        await this.db.addMutation({
          action: 'ADD_ROW',
          sheetName: 'Expiring Certs',
          tableKey: 'expiring_certs',
          rowData: newRow
        });
      }
    }

    if (typeof this.db.setSnapshot === 'function') {
      await this.db.setSnapshot(this.db.snapshot);
    } else if (window.desktopAPI && typeof window.desktopAPI.saveLocalSnapshot === 'function') {
      await window.desktopAPI.saveLocalSnapshot(this.db.snapshot);
    }
    return true;
  }

  /**
   * Helper to parse dates in MM/DD/YYYY, YYYY-MM-DD, or ISO format into timestamps.
   */
  parseDateToTime(str) {
    if (!str) return null;
    if (typeof str === 'number') return str;
    if (str instanceof Date) return str.getTime();
    const s = String(str).trim();
    if (!s) return null;
    const mdy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (mdy) {
      return new Date(parseInt(mdy[3], 10), parseInt(mdy[1], 10) - 1, parseInt(mdy[2], 10), 12, 0, 0).getTime();
    }
    const ymd = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (ymd) {
      return new Date(parseInt(ymd[1], 10), parseInt(ymd[2], 10) - 1, parseInt(ymd[3], 10), 12, 0, 0).getTime();
    }
    const parsed = Date.parse(s);
    return isNaN(parsed) ? null : parsed;
  }

  /**
   * Determines if a scanned cert item is already attached to the employee in the Cert Photo Vault.
   * If a newer renewal email exists (email date > existing email date / recorded date), returns false.
   */
  isScannedCertAlreadyAdded(item) {
    if (!item || !item.certType) return false;
    if (!this.db || !this.db.snapshot) return false;

    let empName = String(item.employeeName || '').trim();
    const certType = String(item.certType).trim();
    if (!certType) return false;

    // Resolve employee name if missing or not an exact match against active workers
    const activeEmps = this.getActiveEmployeeNamesList ? this.getActiveEmployeeNamesList() : [];
    if (!empName || (activeEmps.length > 0 && !activeEmps.some(n => n.toLowerCase() === empName.toLowerCase()))) {
      const resolved = (empName ? this.matchEmployeeFromText(empName, activeEmps) : '') ||
                       this.matchEmployeeFromText(item.subject, activeEmps) ||
                       this.matchEmployeeFromText(item.fileName, activeEmps);
      if (resolved) {
        empName = resolved;
        item.employeeName = resolved;
      }
    }
    if (!empName) return false;

    // Check cert_photos vault
    const existing = this.db.getCertPhotoRecord ? this.db.getCertPhotoRecord(empName, certType) : null;
    if (!existing || !existing.fileName) {
      return false;
    }

    // Exact email message ID match -> definitely the same email attachment already saved
    if (existing.emailMessageId && item.messageId && String(existing.emailMessageId).trim() === String(item.messageId).trim()) {
      return true;
    }

    // If expiration date matches existing vault record or expiring_certs row, it's definitely the same cert!
    if (item.expDate) {
      const itemExpTime = this.parseDateToTime(item.expDate);
      if (itemExpTime) {
        if (existing.expDate && this.parseDateToTime(existing.expDate) === itemExpTime) {
          return true;
        }
        const tableData = this.db.getTable('expiring_certs');
        if (tableData && tableData.rows) {
          const normEmp = empName.toLowerCase();
          const normCert = certType.toLowerCase();
          const row = tableData.rows.find(r => {
            const rEmp = String(r['Employee Name'] || r['Name'] || '').toLowerCase().trim();
            const rCert = String(r['Item Type'] || r['Cert Type'] || '').toLowerCase().trim();
            return rEmp === normEmp && (rCert === normCert || (normCert.startsWith('dl') && rCert.startsWith('dl')));
          });
          if (row && row['Expiration Date']) {
            const rowExpTime = this.parseDateToTime(row['Expiration Date']);
            if (rowExpTime === itemExpTime) {
              return true;
            }
          }
        }
      }
    }

    // Check email dates
    const itemTime = this.parseDateToTime(item.date);
    const existingEmailTime = existing.emailDate ? this.parseDateToTime(existing.emailDate) : null;

    if (itemTime && existingEmailTime) {
      // If scanned item is on or before the email of the vaulted cert, it's already added or older
      if (itemTime <= existingEmailTime) {
        return true;
      }
      // If itemTime > existingEmailTime, this is a newer email with an updated renewal proof!
      return false;
    }

    // Cross-reference expiring_certs table
    const tableData = this.db.getTable('expiring_certs');
    if (tableData && tableData.rows && itemTime) {
      const normEmp = empName.toLowerCase();
      const normCert = certType.toLowerCase();
      const row = tableData.rows.find(r => {
        const rEmp = String(r['Employee Name'] || r['Name'] || '').toLowerCase().trim();
        const rCert = String(r['Item Type'] || r['Cert Type'] || '').toLowerCase().trim();
        return rEmp === normEmp && (rCert === normCert || (normCert.startsWith('dl') && rCert.startsWith('dl')));
      });

      if (row) {
        const acqTime = row['Date Acquired'] ? this.parseDateToTime(row['Date Acquired']) : null;
        if (acqTime && itemTime <= acqTime) {
          return true;
        }
      }
    }

    // If existing photo exists and was added after or around the item's email date
    const addedTime = existing.dateAdded ? this.parseDateToTime(existing.dateAdded) : null;
    if (itemTime && addedTime && itemTime <= addedTime) {
      return true;
    }

    // Default: photo exists in vault for this employee and cert type
    return true;
  }

  /**
   * Toggles hiding/showing certs that are already attached in the vault.
   */
  toggleHideVaultedCerts() {
    this.renderScannedCertItems();
  }

  /**
   * Dynamically handles employee dropdown change on a scanned card.
   */
  handleScannedCardEmployeeChange(itemId, empName) {
    const item = this.scannedCertItems ? this.scannedCertItems.find(x => x.id === itemId) : null;
    if (!item) return;
    item.employeeName = (empName || '').trim();
    item.alreadyInVault = this.isScannedCertAlreadyAdded(item);
    const badge = document.getElementById(`scanned-vault-badge-${itemId}`);
    if (badge) {
      badge.style.display = item.alreadyInVault ? 'inline-block' : 'none';
    }
    this.updateScannedVaultCountBadges();
  }

  /**
   * Dynamically handles cert type dropdown change on a scanned card.
   */
  handleScannedCardCertTypeChange(itemId, certType) {
    const item = this.scannedCertItems ? this.scannedCertItems.find(x => x.id === itemId) : null;
    if (!item) return;
    item.certType = (certType || '').trim();
    item.alreadyInVault = this.isScannedCertAlreadyAdded(item);
    const badge = document.getElementById(`scanned-vault-badge-${itemId}`);
    if (badge) {
      badge.style.display = item.alreadyInVault ? 'inline-block' : 'none';
    }
    this.updateScannedVaultCountBadges();
  }

  /**
   * Renders cards for all scanned cert items for user review, cropping, and import.
   * Bound by unique item.id to prevent index-shift and reloading bugs.
   */
  renderScannedCertItems() {
    const body = document.getElementById('cert-email-scanner-body');
    const batchActions = document.getElementById('cert-scan-batch-actions');
    const countBadge = document.getElementById('cert-scan-count-badge');
    if (!body) return;

    if (!this.scannedCertItems || this.scannedCertItems.length === 0) {
      this.renderCertScannerInitialState();
      return;
    }

    const hideVaultedCheckbox = document.getElementById('cert-scan-hide-vaulted');
    const hideVaulted = hideVaultedCheckbox ? hideVaultedCheckbox.checked : true;

    // Fetch employee names for dropdown (strictly currently employed workers)
    const employeeOptions = this.getActiveEmployeeNamesList();

    // Evaluate vault status for each item
    let vaultedCount = 0;
    this.scannedCertItems.forEach(item => {
      // Auto-preselect employee if missing or not in active employees list
      if (!item.employeeName || !employeeOptions.some(n => n.toLowerCase() === item.employeeName.toLowerCase())) {
        const matched = (item.employeeName ? this.matchEmployeeFromText(item.employeeName, employeeOptions) : '') ||
                        this.matchEmployeeFromText(item.subject, employeeOptions) ||
                        this.matchEmployeeFromText(item.fileName, employeeOptions);
        if (matched) {
          item.employeeName = matched;
        }
      }
      item.alreadyInVault = this.isScannedCertAlreadyAdded(item);
      if (item.alreadyInVault) vaultedCount++;
    });

    const prevNamesSet = this.getPreviousEmployeeNamesSet();
    const displayItems = (hideVaulted
      ? this.scannedCertItems.filter(item => !item.alreadyInVault)
      : this.scannedCertItems).filter(item => {
        const emp = String(item.employeeName || '').toLowerCase().trim();
        return !prevNamesSet.has(emp);
      });

    if (batchActions) batchActions.style.display = displayItems.length > 0 ? 'flex' : 'none';
    if (countBadge) {
      if (vaultedCount > 0) {
        countBadge.textContent = hideVaulted
          ? `${displayItems.length} new cert ${displayItems.length === 1 ? 'photo' : 'photos'} (${vaultedCount} in vault hidden)`
          : `${displayItems.length} cert photos (${vaultedCount} already in vault)`;
      } else {
        countBadge.textContent = `${displayItems.length} cert ${displayItems.length === 1 ? 'photo' : 'photos'} found`;
      }
    }

    if (displayItems.length === 0) {
      if (vaultedCount > 0) {
        body.innerHTML = `
          <div style="text-align: center; padding: 50px 20px; color: #94a3b8;">
            <div style="font-size: 50px; margin-bottom: 14px;">🎉</div>
            <h3 style="color: #f8fafc; font-size: 18px; font-weight: 800; margin-bottom: 8px;">All Scanned Certs Are Already in Vault!</h3>
            <p style="max-width: 520px; margin: 0 auto 20px; font-size: 13px; line-height: 1.6; color: #cbd5e1;">
              Found ${vaultedCount} cert photos in Gmail, and all ${vaultedCount} have already been reviewed and attached to employee profiles. No new renewal updates were found.
            </p>
            <button class="btn btn-secondary" onclick="document.getElementById('cert-scan-hide-vaulted').checked = false; window.sheetNavigator.renderScannedCertItems();" style="font-size: 12.5px; font-weight: 600; padding: 7px 18px; border-color: rgba(56, 189, 248, 0.5); color: #38bdf8; border-radius: 8px; cursor: pointer; background: rgba(56, 189, 248, 0.08);">
              👁️ Show All ${vaultedCount} Vaulted Photos
            </button>
          </div>
        `;
        return;
      } else {
        this.renderCertScannerInitialState();
        return;
      }
    }

    const certTypes = [
      'DL',
      'DL (Front)',
      'DL (Back)',
      'MEC Expiration',
      '1st Aid & CPR',
      '1st Aid',
      'CPR',
      'Crane Evaluation',
      'Crane Cert',
      'Rigging & Signaling/Signalperson & Spotter Cert',
      'Forklift',
      'Pole Top Rescue',
      'OSHA 1910',
      'MSHA',
      'BNSF',
      'OSHA Trench Comp Person',
      'Dig Safe',
      'Other Cert'
    ];

    let html = `
      <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(330px, 1fr)); gap: 16px;">
    `;

    displayItems.forEach(item => {
      // Auto-preselect employee if missing or not in active employees list
      if (!item.employeeName || !employeeOptions.some(n => n.toLowerCase() === item.employeeName.toLowerCase())) {
        const matched = (item.employeeName ? this.matchEmployeeFromText(item.employeeName, employeeOptions) : '') ||
                        this.matchEmployeeFromText(item.subject, employeeOptions) ||
                        this.matchEmployeeFromText(item.fileName, employeeOptions);
        if (matched) {
          item.employeeName = matched;
        }
      }

      const isPdf = (item.contentType && item.contentType.includes('pdf')) || (item.fileName && item.fileName.toLowerCase().endsWith('.pdf'));
      const subLower = String(item.subject || '').toLowerCase();
      const isMultiOrGroup = subLower.includes('new hire') || subLower.includes('ape') || subLower.includes('group') || subLower.includes('butte') || subLower.includes('helena') || (item.attIdx && item.attIdx > 0);

      // Create blobUrl for PDF if base64Data is already loaded
      if (isPdf && item.base64Data && !item.blobUrl) {
        try {
          const rawB64 = item.base64Data.includes('base64,') ? item.base64Data.split('base64,')[1] : item.base64Data;
          const byteChars = atob(rawB64);
          const byteNumbers = new Uint8Array(byteChars.length);
          for (let i = 0; i < byteChars.length; i++) {
            byteNumbers[i] = byteChars.charCodeAt(i);
          }
          const blob = new Blob([byteNumbers], { type: 'application/pdf' });
          item.blobUrl = URL.createObjectURL(blob);
        } catch (bErr) {
          console.warn('PDF blob creation error:', bErr);
        }
      }

      html += `
        <div class="scanned-cert-card" id="scanned-cert-card-${item.id}" style="background: rgba(15, 23, 42, 0.85); border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 12px; overflow: hidden; display: flex; flex-direction: column; transition: transform 0.15s, border-color 0.15s; box-shadow: 0 4px 12px rgba(0,0,0,0.3);">
          
          <!-- Image / PDF Preview Container -->
          <div style="height: 180px; background: #090d16; display: flex; align-items: center; justify-content: center; position: relative; overflow: hidden; border-bottom: 1px solid rgba(255,255,255,0.06);">
            ${isPdf ? `
              <div id="scanned-card-preview-container-${item.id}" style="width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; position: relative;">
                ${(item.blobUrl || item.base64Data) ? `
                  <div style="width: 100%; height: 100%; position: relative; cursor: pointer;" onclick="window.sheetNavigator.openPdfViewerModal('${this.escapeJs(item.id)}')" title="Click to view full PDF">
                    <object data="${item.blobUrl || item.base64Data}#toolbar=0&navpanes=0&scrollbar=0&view=FitH" type="application/pdf" style="width: 100%; height: 100%; pointer-events: none; border: none; background: #090d16;"></object>
                    <div style="position: absolute; inset: 0; background: rgba(0,0,0,0.02); pointer-events: none;"></div>
                  </div>
                ` : `
                  <div id="scanned-card-loading-${item.id}" style="display: flex; flex-direction: column; align-items: center; justify-content: center; color: #94a3b8; font-size: 12px; gap: 8px;">
                    <div class="cert-scan-card-spinner" style="width: 24px; height: 24px; border: 2.5px solid rgba(248, 113, 113, 0.2); border-top-color: #f87171; border-radius: 50%; animation: spin 0.8s linear infinite;"></div>
                    <span style="font-size: 11px; color: #cbd5e1;">Loading PDF...</span>
                  </div>
                `}
              </div>
            ` : (item.base64Data ? `
              <img id="scanned-card-preview-${item.id}" src="${item.base64Data}" alt="Cert Preview" style="max-height: 100%; max-width: 100%; object-fit: contain; cursor: pointer;" onclick="window.sheetNavigator.openPhotoCropperModal('${this.escapeJs(item.id)}')" title="Click to open Crop &amp; Rotate tool">
            ` : `
              <div id="scanned-card-loading-${item.id}" style="display: flex; flex-direction: column; align-items: center; justify-content: center; color: #94a3b8; font-size: 12px; gap: 8px;">
                <div class="cert-scan-card-spinner" style="width: 24px; height: 24px; border: 2.5px solid rgba(56, 189, 248, 0.2); border-top-color: #38bdf8; border-radius: 50%; animation: spin 0.8s linear infinite;"></div>
                <span style="font-size: 11px; color: #cbd5e1;">Loading photo...</span>
              </div>
              <img id="scanned-card-preview-${item.id}" src="" alt="Cert Preview" style="display: none; max-height: 100%; max-width: 100%; object-fit: contain; cursor: pointer;" onclick="window.sheetNavigator.openPhotoCropperModal('${this.escapeJs(item.id)}')" title="Click to open Crop &amp; Rotate tool">
            `)}
            
            <!-- Top Action Controls -->
            <div style="position: absolute; top: 8px; right: 8px; display: flex; gap: 6px; z-index: 2;">
              <button type="button" class="btn btn-secondary" style="font-size: 11px; padding: 3px 8px; background: rgba(15, 23, 42, 0.88); border: 1px solid rgba(168, 85, 247, 0.55); color: #c084fc; border-radius: 6px; cursor: pointer; display: flex; align-items: center; gap: 3px;" onclick="window.sheetNavigator.duplicateScannedCertCard('${this.escapeJs(item.id)}')" title="Split / Duplicate card (useful for 1st Aid &amp; CPR in one photo or Front &amp; Back of DL)">
                <span>📋</span> Split
              </button>
              ${isPdf ? `
                <button type="button" class="btn btn-secondary" style="font-size: 11px; padding: 3px 8px; background: rgba(15, 23, 42, 0.88); border: 1px solid rgba(248, 113, 113, 0.6); color: #fca5a5; border-radius: 6px; cursor: pointer; display: flex; align-items: center; gap: 3px;" onclick="window.sheetNavigator.openPdfViewerModal('${this.escapeJs(item.id)}')" title="View full PDF document">
                  <span>👁️</span> View
                </button>
              ` : `
                <button type="button" class="btn btn-secondary" id="btn-scan-ocr-${item.id}" style="font-size: 11px; padding: 3px 8px; background: rgba(15, 23, 42, 0.88); border: 1px solid rgba(14, 165, 233, 0.55); color: #38bdf8; border-radius: 6px; cursor: pointer; display: flex; align-items: center; gap: 3px;" onclick="window.sheetNavigator.extractCertInfoFromImage('${this.escapeJs(item.id)}', true)" title="Scan document photo with OCR to pull name, expiration date, and cert type directly off the picture">
                  <span>✨</span> Scan Photo
                </button>
                <button type="button" class="btn btn-secondary" style="font-size: 11px; padding: 3px 8px; background: rgba(15, 23, 42, 0.88); border: 1px solid rgba(56, 189, 248, 0.55); color: #38bdf8; border-radius: 6px; cursor: pointer; display: flex; align-items: center; gap: 3px;" onclick="window.sheetNavigator.openPhotoCropperModal('${this.escapeJs(item.id)}')" title="Crop and rotate this photo">
                  <span>✂️</span> Crop
                </button>
              `}
              <button type="button" class="btn btn-secondary" style="font-size: 11px; padding: 3px 7px; background: rgba(15, 23, 42, 0.88); border: 1px solid rgba(239, 68, 68, 0.45); color: #f87171; border-radius: 6px; cursor: pointer;" onclick="window.sheetNavigator.dismissScannedCert('${this.escapeJs(item.id)}')" title="Dismiss this item">
                ✕
              </button>
            </div>

            <!-- Bottom Left Metadata Badges -->
            <div style="position: absolute; bottom: 6px; left: 8px; display: flex; gap: 6px; align-items: center; z-index: 2;">
              <div style="background: rgba(0,0,0,0.72); padding: 2px 7px; border-radius: 4px; font-size: 10px; color: #94a3b8;">
                ${item.date || 'Recent'}
              </div>
              <span id="scanned-vault-badge-${item.id}" style="${item.alreadyInVault ? 'display: inline-block;' : 'display: none;'} background: rgba(16, 185, 129, 0.25); border: 1px solid rgba(16, 185, 129, 0.55); color: #34d399; padding: 1px 6px; border-radius: 4px; font-size: 9.5px; font-weight: 700;" title="Already attached in Cert Photo Vault">
                ✓ In Vault
              </span>
              <span id="scanned-ocr-badge-${item.id}" style="display: none; background: rgba(56, 189, 248, 0.22); border: 1px solid rgba(56, 189, 248, 0.5); color: #38bdf8; padding: 1px 6px; border-radius: 4px; font-size: 9.5px; font-weight: 700;" title="Extracted from photo text">
                ✨ Auto-detected
              </span>
              ${isMultiOrGroup ? `
                <div style="background: rgba(245, 158, 11, 0.22); border: 1px solid rgba(245, 158, 11, 0.4); padding: 1px 6px; border-radius: 4px; font-size: 9.5px; color: #fbbf24; font-weight: 600;" title="${this.escapeHtml(item.fileName || 'Multi-attachment email')}">
                  📎 ${this.escapeHtml(item.fileName || 'Multi-file')}
                </div>
              ` : ''}
            </div>
          </div>

          <!-- Card Controls -->
          <div style="padding: 13px; flex: 1; display: flex; flex-direction: column; gap: 9px;">
            <div style="font-size: 11.5px; color: #cbd5e1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${item.subject}">
              📧 <strong style="color: #e2e8f0;">${item.subject || 'Cert Attachment'}</strong>
            </div>

            <div>
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 3px;">
                <label style="font-size: 11px; color: #94a3b8; font-weight: 600;">Assigned Employee</label>
                ${isMultiOrGroup ? `<span style="font-size: 10px; color: #f59e0b; font-weight: 600;">⚠️ Check Name</span>` : ''}
              </div>
              <select id="scanned-emp-select-${item.id}" onchange="window.sheetNavigator.handleScannedCardEmployeeChange('${this.escapeJs(item.id)}', this.value)" style="width: 100%; background: #0f172a; color: #f8fafc; border: 1px solid rgba(255,255,255,0.15); border-radius: 6px; padding: 5px 8px; font-size: 12px; font-weight: 600;">
                <option value="">-- Select Employee --</option>
                ${employeeOptions.map(name => `
                  <option value="${name}" ${item.employeeName && item.employeeName.toLowerCase() === name.toLowerCase() ? 'selected' : ''}>
                    ${name}
                  </option>
                `).join('')}
              </select>
            </div>

            <div>
              <label style="display: block; font-size: 11px; color: #94a3b8; font-weight: 600; margin-bottom: 3px;">Certification Type</label>
              <select id="scanned-cert-select-${item.id}" onchange="window.sheetNavigator.handleScannedCardCertTypeChange('${this.escapeJs(item.id)}', this.value)" style="width: 100%; background: #0f172a; color: #f8fafc; border: 1px solid rgba(255,255,255,0.15); border-radius: 6px; padding: 5px 8px; font-size: 12px; font-weight: 600;">
                ${certTypes.map(ct => `
                  <option value="${ct}" ${item.certType === ct ? 'selected' : ''}>${ct}</option>
                `).join('')}
              </select>
            </div>

            <!-- Expiration Date & Acquired Date Inputs -->
            <div style="display: flex; gap: 8px;">
              <div style="flex: 1;">
                <label style="display: block; font-size: 11px; color: #38bdf8; font-weight: 700; margin-bottom: 3px;">⏳ Expiration Date</label>
                <input type="text" id="scanned-exp-date-${item.id}" placeholder="MM/DD/YYYY" value="${this.escapeHtml(item.expDate || '')}" style="width: 100%; background: #090d16; color: #f8fafc; border: 1px solid rgba(56, 189, 248, 0.4); border-radius: 6px; padding: 5px 8px; font-size: 11.5px; font-weight: 600;">
              </div>
              <div style="flex: 1;">
                <label style="display: block; font-size: 11px; color: #94a3b8; font-weight: 600; margin-bottom: 3px;">📅 Date Acquired</label>
                <input type="text" id="scanned-acq-date-${item.id}" placeholder="MM/DD/YYYY" value="${this.escapeHtml(item.acqDate || '')}" style="width: 100%; background: #0f172a; color: #cbd5e1; border: 1px solid rgba(255,255,255,0.12); border-radius: 6px; padding: 5px 8px; font-size: 11.5px;">
              </div>
            </div>

            <div style="margin-top: auto; padding-top: 6px; display: flex; gap: 8px;">
              <button type="button" class="btn btn-primary" style="flex: 1; font-size: 12px; font-weight: 700; background: linear-gradient(135deg, #059669 0%, #10b981 100%); border: none; padding: 7px 10px; border-radius: 6px; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 5px; box-shadow: 0 2px 8px rgba(16, 185, 129, 0.35);" onclick="window.sheetNavigator.importSingleScannedCert('${this.escapeJs(item.id)}')">
                <span>📥</span> Save to Vault
              </button>
            </div>
          </div>

        </div>
      `;
    });

    html += `</div>`;
    body.innerHTML = html;
  }

  /**
   * Updates count badges and batch action visibility based on current scanned items and hideVaulted toggle.
   */
  updateScannedVaultCountBadges() {
    const body = document.getElementById('cert-email-scanner-body');
    const batchActions = document.getElementById('cert-scan-batch-actions');
    const countBadge = document.getElementById('cert-scan-count-badge');
    const hideVaultedCheckbox = document.getElementById('cert-scan-hide-vaulted');
    const hideVaulted = hideVaultedCheckbox ? hideVaultedCheckbox.checked : true;

    if (!this.scannedCertItems || this.scannedCertItems.length === 0) return;

    let vaultedCount = 0;
    this.scannedCertItems.forEach(item => {
      item.alreadyInVault = this.isScannedCertAlreadyAdded(item);
      if (item.alreadyInVault) vaultedCount++;
    });

    const prevNamesSet = this.getPreviousEmployeeNamesSet();
    const displayItems = (hideVaulted
      ? this.scannedCertItems.filter(item => !item.alreadyInVault)
      : this.scannedCertItems).filter(item => {
        const emp = String(item.employeeName || '').toLowerCase().trim();
        return !prevNamesSet.has(emp);
      });

    if (batchActions) batchActions.style.display = displayItems.length > 0 ? 'flex' : 'none';
    if (countBadge) {
      if (vaultedCount > 0) {
        countBadge.textContent = hideVaulted
          ? `${displayItems.length} new cert ${displayItems.length === 1 ? 'photo' : 'photos'} (${vaultedCount} in vault hidden)`
          : `${displayItems.length} cert photos (${vaultedCount} already in vault)`;
      } else {
        countBadge.textContent = `${displayItems.length} cert ${displayItems.length === 1 ? 'photo' : 'photos'} found`;
      }
    }

    if (displayItems.length === 0 && vaultedCount > 0 && body) {
      this.renderScannedCertItems();
    }
  }

  /**
   * Duplicates a scanned cert card so combo photos (e.g. 1st Aid & CPR or Front & Back) can be split.
   */
  duplicateScannedCertCard(itemId) {
    if (!this.scannedCertItems) return;
    const itemIndex = this.scannedCertItems.findIndex(x => x.id === itemId);
    if (itemIndex === -1) return;
    const original = this.scannedCertItems[itemIndex];

    const currentEmpSelect = document.getElementById(`scanned-emp-select-${itemId}`);
    const currentCertSelect = document.getElementById(`scanned-cert-select-${itemId}`);
    const currentExpInput = document.getElementById(`scanned-exp-date-${itemId}`);
    const currentAcqInput = document.getElementById(`scanned-acq-date-${itemId}`);

    const activeEmp = currentEmpSelect ? currentEmpSelect.value : original.employeeName;
    const activeCert = currentCertSelect ? currentCertSelect.value : original.certType;
    const activeExp = currentExpInput ? currentExpInput.value : (original.expDate || '');
    const activeAcq = currentAcqInput ? currentAcqInput.value : (original.acqDate || '');

    original.employeeName = activeEmp;
    original.expDate = activeExp;
    original.acqDate = activeAcq;

    // Determine default types when splitting
    let origType = activeCert;
    let cloneType = activeCert;
    const certNorm = activeCert.toLowerCase();
    if (certNorm.includes('1st aid') && certNorm.includes('cpr')) {
      origType = '1st Aid';
      cloneType = 'CPR';
    } else if (certNorm === 'dl' || certNorm === "driver's license") {
      origType = 'DL (Front)';
      cloneType = 'DL (Back)';
    }

    original.certType = origType;

    const clone = {
      ...original,
      id: `${original.messageId}_split_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
      certType: cloneType,
      fileName: original.fileName ? original.fileName.replace(/(\.[^.]+)$/, '_split$1') : `cert_split_${Date.now()}.jpg`,
      expDate: '',
      acqDate: original.acqDate || ''
    };

    // Insert clone right after original in memory
    this.scannedCertItems.splice(itemIndex + 1, 0, clone);
    this.renderScannedCertItems();

    if (typeof window.showToast === 'function') {
      window.showToast(`📋 Split into "${origType}" and "${cloneType}"! Crop each slip and set expiration dates.`, 'info');
    }
  }

  /**
   * Retries fetching an attachment that previously failed or timed out.
   */
  async retryLoadScannedCert(itemId) {
    const item = this.scannedCertItems.find(x => x.id === itemId);
    if (!item) return;

    const loadingEl = document.getElementById(`scanned-card-loading-${itemId}`);
    if (loadingEl) {
      loadingEl.innerHTML = `
        <div class="cert-scan-card-spinner" style="width: 24px; height: 24px; border: 2.5px solid rgba(56, 189, 248, 0.2); border-top-color: #38bdf8; border-radius: 50%; animation: spin 0.8s linear infinite;"></div>
        <span style="font-size: 11px; color: #cbd5e1;">Retrying photo...</span>
      `;
    }
    item.isLoading = false;
    await this.loadScannedCertAttachment(itemId);
  }

  /**
   * Dismisses a single scanned cert item from the review grid without re-rendering the whole page.
   */
  dismissScannedCert(itemId) {
    if (!this.scannedCertItems) return;
    const remIdx = this.scannedCertItems.findIndex(x => x.id === itemId);
    if (remIdx !== -1) {
      this.scannedCertItems.splice(remIdx, 1);
    }

    const cardEl = document.getElementById(`scanned-cert-card-${itemId}`);
    if (cardEl) {
      cardEl.style.transition = 'all 0.2s ease';
      cardEl.style.opacity = '0';
      cardEl.style.transform = 'scale(0.92)';
      setTimeout(() => {
        if (cardEl && cardEl.parentNode) cardEl.remove();
        if (!this.scannedCertItems || this.scannedCertItems.length === 0) {
          this.renderScannedCertItems();
        }
      }, 200);
    }

    const countBadge = document.getElementById('cert-scan-count-badge');
    if (countBadge) {
      countBadge.textContent = `${this.scannedCertItems.length} cert ${this.scannedCertItems.length === 1 ? 'photo' : 'photos'} found`;
    }
  }

  /**
   * Asynchronously fetches the full image or document bytes for a single scanned card by unique ID.
   */
  async loadScannedCertAttachment(itemId) {
    if (!this.scannedCertItems) return null;
    const item = this.scannedCertItems.find(x => x.id === itemId);
    if (!item) return null;
    if (item.base64Data) return item.base64Data;
    if (item.isLoading) return null;

    item.isLoading = true;
    try {
      const syncUrl = window.syncEngine ? window.syncEngine.getSyncUrl() : '';
      if (!syncUrl) return null;

      const payload = {
        action: 'getCertEmailAttachment',
        messageId: item.messageId,
        attIdx: item.attIdx
      };

      let res = null;
      let lastErr = null;
      for (let attempt = 1; attempt <= 2; attempt++) {
        try {
          if (window.syncEngine && typeof window.syncEngine.executeNetworkRequest === 'function') {
            res = await window.syncEngine.executeNetworkRequest(syncUrl, 'POST', payload, 35000);
          } else {
            const resp = await fetch(syncUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(payload)
            });
            res = await resp.json();
          }
          if (res && res.success && res.base64Data) break;
          if (res && res.error) lastErr = new Error(res.error);
        } catch (fetchErr) {
          lastErr = fetchErr;
          if (attempt === 2) break;
          await new Promise(r => setTimeout(r, 700));
        }
      }

      if (res && res.success && res.base64Data) {
        let b64 = res.base64Data;
        if (item.isHeic || res.isHeic || (item.fileName && item.fileName.toLowerCase().endsWith('.heic'))) {
          try {
            b64 = await this.convertHeicDataUrlToJpeg(b64);
            item.contentType = 'image/jpeg';
            item.fileName = item.fileName.replace(/\.heic$/i, '.jpg').replace(/\.heif$/i, '.jpg');
          } catch (cErr) {
            console.warn('HEIC preview conversion error:', cErr);
          }
        }
        item.base64Data = b64;

        if (item.isPdf) {
          try {
            const rawB64 = b64.includes('base64,') ? b64.split('base64,')[1] : b64;
            const byteChars = atob(rawB64);
            const byteNumbers = new Uint8Array(byteChars.length);
            for (let i = 0; i < byteChars.length; i++) {
              byteNumbers[i] = byteChars.charCodeAt(i);
            }
            const blob = new Blob([byteNumbers], { type: 'application/pdf' });
            item.blobUrl = URL.createObjectURL(blob);
          } catch (bErr) {
            console.warn('PDF blob creation error:', bErr);
          }

          const containerEl = document.getElementById(`scanned-card-preview-container-${item.id}`);
          if (containerEl) {
            containerEl.style.cursor = 'pointer';
            containerEl.onclick = () => this.openPdfViewerModal(item.id);
            containerEl.title = 'Click to view full PDF';
            containerEl.innerHTML = `
              <object data="${item.blobUrl || b64}#toolbar=0&navpanes=0&scrollbar=0&view=FitH" type="application/pdf" style="width: 100%; height: 100%; pointer-events: none; border: none; background: #090d16;"></object>
              <div style="position: absolute; inset: 0; background: rgba(0,0,0,0.02); pointer-events: none;"></div>
            `;
          }
        } else {
          // Update DOM elements if present
          const loadingEl = document.getElementById(`scanned-card-loading-${item.id}`);
          const imgEl = document.getElementById(`scanned-card-preview-${item.id}`);
          if (loadingEl) loadingEl.style.display = 'none';
          if (imgEl) {
            imgEl.src = b64;
            imgEl.style.display = 'block';
          }

          // If employee name or expiration date is not yet known, auto-pull it off the picture!
          if (!item.isPdf && (!item.employeeName || !item.expDate)) {
            await this.extractCertInfoFromImage(item, false);
          }
        }
        return b64;
      } else {
        throw (lastErr || new Error((res && res.error) || 'Failed to download attachment'));
      }
    } catch (err) {
      console.warn(`Failed to load attachment for card ${item.id}:`, err);
      const loadingEl = document.getElementById(`scanned-card-loading-${item.id}`);
      if (loadingEl) {
        loadingEl.innerHTML = `
          <div style="display: flex; flex-direction: column; align-items: center; gap: 4px;">
            <span style="font-size: 10px; color: #f87171;">⚠️ Failed to load</span>
            <button type="button" class="btn btn-secondary" style="font-size: 10px; padding: 2px 8px; border-color: rgba(56, 189, 248, 0.45); color: #38bdf8; background: rgba(56, 189, 248, 0.1); border-radius: 4px; cursor: pointer;" onclick="window.sheetNavigator.retryLoadScannedCert('${this.escapeJs(item.id)}')">🔄 Retry</button>
          </div>
        `;
      }
    } finally {
      item.isLoading = false;
    }
    return null;
  }

  /**
   * Queues background fetching of card images & PDFs smoothly without flooding Google Apps Script.
   */
  async loadScannedCertImagesQueue() {
    if (!this.scannedCertItems || this.scannedCertItems.length === 0) return;
    const hideVaultedCheckbox = document.getElementById('cert-scan-hide-vaulted');
    const hideVaulted = hideVaultedCheckbox ? hideVaultedCheckbox.checked : true;

    // Only load attachments for cards that are NOT already in the vault when hideVaulted is active
    const targetItems = hideVaulted
      ? this.scannedCertItems.filter(item => !item.alreadyInVault)
      : this.scannedCertItems;

    for (let i = 0; i < targetItems.length; i++) {
      const item = targetItems[i];
      if (!item || item.base64Data || item.isLoading) continue;
      await this.loadScannedCertAttachment(item.id);
      // Clean delay between requests to keep Google Apps Script happy
      await new Promise(r => setTimeout(r, 250));
    }
  }

  /**
   * Imports a single reviewed cert item into the Cert Photo Vault and updates dates.
   */
  async importSingleScannedCert(itemId) {
    if (!this.scannedCertItems) return;
    const item = this.scannedCertItems.find(x => x.id === itemId);
    if (!item) return;

    const empSelect = document.getElementById(`scanned-emp-select-${itemId}`);
    const certSelect = document.getElementById(`scanned-cert-select-${itemId}`);
    const expInput = document.getElementById(`scanned-exp-date-${itemId}`);
    const acqInput = document.getElementById(`scanned-acq-date-${itemId}`);

    const empName = empSelect ? empSelect.value.trim() : item.employeeName;
    const certType = certSelect ? certSelect.value.trim() : item.certType;
    const expDate = expInput ? expInput.value.trim() : (item.expDate || '');
    const acqDate = acqInput ? acqInput.value.trim() : (item.acqDate || '');

    if (!empName) {
      alert('Please select an employee to assign this certification proof to.');
      if (empSelect) empSelect.focus();
      return;
    }

    if (!certType) {
      alert('Please select a certification type.');
      if (certSelect) certSelect.focus();
      return;
    }

    if (!window.desktopAPI || !window.desktopAPI.saveCertPhoto) {
      alert('Desktop file saving API is not available.');
      return;
    }

    // Ensure document payload is loaded before saving
    if (!item.base64Data) {
      const b64 = await this.loadScannedCertAttachment(itemId);
      if (!b64) {
        alert('Could not download certificate proof from Gmail. Please click Retry on the card or check your connection.');
        return;
      }
    }

    try {
      const saveRes = await window.desktopAPI.saveCertPhoto({
        employeeName: empName,
        certType: certType,
        base64Data: item.base64Data,
        fileName: item.fileName
      });

      if (saveRes && saveRes.success) {
        const todayStr = new Date().toLocaleDateString('en-US');
        await this.db.saveCertPhotoRecord(empName, certType, {
          fileName: saveRes.fileName,
          fullPath: saveRes.fullPath,
          dateAdded: todayStr,
          emailMessageId: item.messageId || '',
          emailDate: item.date || todayStr,
          subject: item.subject || '',
          source: 'gmail_scan',
          expDate: expDate || '',
          acqDate: acqDate || ''
        });
        item.alreadyInVault = true;

        // If expiration date was entered, update the expiring_certs table
        if (expDate) {
          await this.updateCertDatesInTable(empName, certType, expDate, acqDate);
        }

        // Remove item from in-memory list
        const remIdx = this.scannedCertItems.findIndex(x => x.id === itemId);
        if (remIdx !== -1) {
          this.scannedCertItems.splice(remIdx, 1);
        }

        // Smoothly animate and remove card from DOM without re-rendering everything
        const cardEl = document.getElementById(`scanned-cert-card-${itemId}`);
        if (cardEl) {
          cardEl.style.transition = 'all 0.25s ease';
          cardEl.style.opacity = '0';
          cardEl.style.transform = 'scale(0.92)';
          setTimeout(() => {
            if (cardEl && cardEl.parentNode) cardEl.remove();
            if (!this.scannedCertItems || this.scannedCertItems.length === 0) {
              this.renderScannedCertItems();
            }
          }, 250);
        }

        const countBadge = document.getElementById('cert-scan-count-badge');
        if (countBadge) {
          countBadge.textContent = `${this.scannedCertItems.length} cert ${this.scannedCertItems.length === 1 ? 'photo' : 'photos'} found`;
        }

        if (typeof window.showToast === 'function') {
          window.showToast(`✅ Saved proof ${expDate ? `& updated exp date (${expDate}) ` : ''}for ${empName} (${certType})!`, 'success');
        }
        this.renderCurrentSheet();
      } else {
        alert(`Failed to save cert photo: ${(saveRes && saveRes.error) || 'Unknown error'}`);
      }
    } catch (err) {
      console.error('importSingleScannedCert error:', err);
      alert(`Error saving cert photo: ${err.message || err}`);
    }
  }

  /**
   * Imports all currently reviewed cert cards in one click.
   */
  async importAllReviewedCertCards() {
    if (!this.scannedCertItems || this.scannedCertItems.length === 0) return;

    if (!window.desktopAPI || !window.desktopAPI.saveCertPhoto) {
      alert('Desktop file saving API is not available.');
      return;
    }

    let successCount = 0;
    const unassignedItems = [];

    for (let i = 0; i < this.scannedCertItems.length; i++) {
      const item = this.scannedCertItems[i];
      const empSelect = document.getElementById(`scanned-emp-select-${item.id}`);
      const certSelect = document.getElementById(`scanned-cert-select-${item.id}`);
      const expInput = document.getElementById(`scanned-exp-date-${item.id}`);
      const acqInput = document.getElementById(`scanned-acq-date-${item.id}`);

      const empName = empSelect ? empSelect.value.trim() : item.employeeName;
      const certType = certSelect ? certSelect.value.trim() : item.certType;
      const expDate = expInput ? expInput.value.trim() : (item.expDate || '');
      const acqDate = acqInput ? acqInput.value.trim() : (item.acqDate || '');

      if (!empName) {
        unassignedItems.push(item);
        continue;
      }

      if (!item.base64Data) {
        await this.loadScannedCertAttachment(item.id);
      }

      try {
        const saveRes = await window.desktopAPI.saveCertPhoto({
          employeeName: empName,
          certType: certType || 'Other Cert',
          base64Data: item.base64Data,
          fileName: item.fileName
        });

        if (saveRes && saveRes.success) {
          const todayStr = new Date().toLocaleDateString('en-US');
          await this.db.saveCertPhotoRecord(empName, certType || 'Other Cert', {
            fileName: saveRes.fileName,
            fullPath: saveRes.fullPath,
            dateAdded: todayStr,
            emailMessageId: item.messageId || '',
            emailDate: item.date || todayStr,
            subject: item.subject || '',
            source: 'gmail_scan',
            expDate: expDate || '',
            acqDate: acqDate || ''
          });
          item.alreadyInVault = true;

          if (expDate) {
            await this.updateCertDatesInTable(empName, certType || 'Other Cert', expDate, acqDate);
          }
          successCount++;
        }
      } catch (err) {
        console.error('Error importing cert item:', err);
      }
    }

    this.scannedCertItems = unassignedItems;
    this.renderScannedCertItems();
    this.renderCurrentSheet();

    if (successCount > 0) {
      if (typeof window.showToast === 'function') {
        window.showToast(`🎉 Successfully imported ${successCount} cert renewal photos into Vault!`, 'success');
      }
      if (this.scannedCertItems.length === 0) {
        this.closeCertEmailScannerModal();
      }
    } else if (unassignedItems.length > 0) {
      alert('Please assign an employee to each card before importing.');
    }
  }

  /**
   * Opens the full PDF viewer modal for a scanned cert item.
   */
  async openPdfViewerModal(itemId) {
    const modal = document.getElementById('cert-pdf-viewer-modal');
    const body = document.getElementById('cert-pdf-modal-body');
    const titleEl = document.getElementById('cert-pdf-modal-title');
    const subtitleEl = document.getElementById('cert-pdf-modal-subtitle');
    const infoEl = document.getElementById('cert-pdf-modal-info');
    if (!modal || !body) return;

    modal.style.display = 'flex';
    modal.classList.add('active');

    let item = this.scannedCertItems ? this.scannedCertItems.find(x => x.id === itemId) : null;
    if (!item) {
      alert('Certificate document not found.');
      this.closePdfViewerModal();
      return;
    }

    this.activePdfItem = item;

    if (titleEl) titleEl.textContent = `${item.certType || 'Certificate'} · ${item.employeeName || 'Unassigned'}`;
    if (subtitleEl) subtitleEl.textContent = `${item.fileName || 'Document.pdf'} | Date: ${item.date || 'Recent'} | Subject: ${item.subject || ''}`;
    if (infoEl) infoEl.textContent = `Attachment: ${item.fileName || 'PDF'} (${item.fileSize ? Math.round(item.fileSize / 1024) + ' KB' : 'PDF'})`;

    // If base64Data is not loaded yet, fetch it
    if (!item.base64Data) {
      body.innerHTML = `
        <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; color: #94a3b8; gap: 12px; padding: 40px;">
          <div class="cert-scan-card-spinner" style="width: 36px; height: 36px; border: 3px solid rgba(56, 189, 248, 0.2); border-top-color: #38bdf8; border-radius: 50%; animation: spin 0.8s linear infinite;"></div>
          <div style="font-size: 13px; color: #f8fafc; font-weight: 600;">Downloading PDF from Gmail...</div>
        </div>
      `;
      const b64 = await this.loadScannedCertAttachment(itemId);
      if (!b64) {
        body.innerHTML = `
          <div style="padding: 30px; text-align: center; color: #f87171;">
            <div style="font-size: 36px; margin-bottom: 8px;">⚠️</div>
            <div style="font-size: 14px; font-weight: 700;">Failed to download PDF attachment</div>
            <button class="btn btn-secondary" style="margin-top: 12px;" onclick="window.sheetNavigator.openPdfViewerModal('${this.escapeJs(itemId)}')">Retry</button>
          </div>
        `;
        return;
      }
    }

    // Prepare Blob URL
    if (!item.blobUrl && item.base64Data) {
      try {
        const rawB64 = item.base64Data.includes('base64,') ? item.base64Data.split('base64,')[1] : item.base64Data;
        const byteChars = atob(rawB64);
        const byteNumbers = new Uint8Array(byteChars.length);
        for (let i = 0; i < byteChars.length; i++) {
          byteNumbers[i] = byteChars.charCodeAt(i);
        }
        const blob = new Blob([byteNumbers], { type: 'application/pdf' });
        item.blobUrl = URL.createObjectURL(blob);
      } catch (e) {
        console.warn('PDF blob creation error:', e);
      }
    }

    const pdfSrc = item.blobUrl || item.base64Data;
    body.innerHTML = `
      <object data="${pdfSrc}#toolbar=1&navpanes=0&view=FitH" type="application/pdf" style="width: 100%; height: 100%; border: none; background: #1e293b;">
        <iframe src="${pdfSrc}#view=FitH" style="width: 100%; height: 100%; border: none; background: #1e293b;">
          <div style="padding: 40px; text-align: center; color: #cbd5e1;">
            <p style="font-size: 14px; margin-bottom: 12px;">Preview cannot be rendered inline in this view.</p>
            <button class="btn btn-primary" onclick="window.sheetNavigator.openCurrentPdfExternally()">
              ↗️ Open in System PDF Viewer (Acrobat / Edge)
            </button>
          </div>
        </iframe>
      </object>
    `;
  }

  /**
   * Closes the PDF viewer modal.
   */
  closePdfViewerModal() {
    const modal = document.getElementById('cert-pdf-viewer-modal');
    if (modal) {
      modal.style.display = 'none';
      modal.classList.remove('active');
    }
  }

  /**
   * Opens the active PDF in the system default viewer (Adobe Acrobat, Edge, etc.).
   */
  async openCurrentPdfExternally() {
    if (!this.activePdfItem || !this.activePdfItem.base64Data) {
      alert('PDF data is not available.');
      return;
    }
    if (window.desktopAPI && typeof window.desktopAPI.openPdfExternally === 'function') {
      const res = await window.desktopAPI.openPdfExternally(
        this.activePdfItem.base64Data,
        this.activePdfItem.fileName || 'Certificate.pdf'
      );
      if (res && !res.success) {
        alert('Could not open PDF in system viewer: ' + (res.error || 'Unknown error'));
      }
    }
  }

  /**
   * Saves the active PDF to a local disk file via Save File dialog.
   */
  async downloadCurrentPdf() {
    if (!this.activePdfItem || !this.activePdfItem.base64Data) {
      alert('PDF data is not available.');
      return;
    }
    if (window.desktopAPI && typeof window.desktopAPI.savePdfToFile === 'function') {
      const rawB64 = this.activePdfItem.base64Data.includes('base64,')
        ? this.activePdfItem.base64Data.split('base64,')[1]
        : this.activePdfItem.base64Data;
      const res = await window.desktopAPI.savePdfToFile(
        rawB64,
        this.activePdfItem.fileName || 'Certificate.pdf'
      );
      if (res && res.success) {
        if (typeof window.showToast === 'function') {
          window.showToast('Saved PDF successfully!', 'success');
        }
      }
    }
  }

  // ==========================================
  // INTERACTIVE PHOTO CROPPER & ROTATOR
  // ==========================================

  /**
   * Opens the photo crop & rotate modal for a specific scanned cert card.
   */
  async openPhotoCropperModal(itemIdOrIdx) {
    if (!this.scannedCertItems) return;
    const item = typeof itemIdOrIdx === 'string'
      ? this.scannedCertItems.find(x => x.id === itemIdOrIdx)
      : this.scannedCertItems[itemIdOrIdx];
    if (!item) return;

    if (item.contentType && item.contentType.includes('pdf')) {
      alert('PDF documents cannot be edited with the photo crop tool.');
      return;
    }

    if (!item.base64Data) {
      const b64 = await this.loadScannedCertAttachment(item.id);
      if (!b64) {
        alert('Image is still loading. Please wait a moment.');
        return;
      }
    }

    this.cropperCurrentItemId = item.id;
    this.cropperCurrentIndex = this.scannedCertItems.findIndex(x => x.id === item.id);
    this.cropperAngle = 0;

    const modal = document.getElementById('cert-photo-cropper-modal');
    if (!modal) return;
    modal.style.display = 'flex';
    modal.classList.add('active');

    if (window.windowManager && typeof window.windowManager.bringToFront === 'function') {
      window.windowManager.bringToFront(modal);
    }

    this._initCropperCanvas(item.base64Data);
  }

  /**
   * Closes the photo cropper modal.
   */
  closePhotoCropperModal() {
    const modal = document.getElementById('cert-photo-cropper-modal');
    if (modal) {
      modal.style.display = 'none';
      modal.classList.remove('active');
      if (window.windowManager && typeof window.windowManager.unregisterModal === 'function') {
        window.windowManager.unregisterModal(modal);
      }
    }
    this.cropperImg = null;
  }

  /**
   * Rotates the cropper image by 90 degrees clockwise or counter-clockwise.
   */
  cropperRotate(deg) {
    this.cropperAngle = (this.cropperAngle + deg + 360) % 360;
    this._drawCropper(true);
  }

  /**
   * Resets the crop box to frame 90% of the image.
   */
  cropperReset() {
    this.cropperBox = null;
    this._drawCropper(true);
  }

  /**
   * Initializes the cropper canvas with the image source.
   */
  _initCropperCanvas(imageSrc) {
    const container = document.getElementById('cropper-canvas-container');
    if (!container) return;
    container.innerHTML = '';

    const canvas = document.createElement('canvas');
    canvas.id = 'cert-cropper-canvas';
    canvas.style.cursor = 'crosshair';
    canvas.style.boxShadow = '0 8px 30px rgba(0,0,0,0.8)';
    canvas.style.borderRadius = '4px';
    container.appendChild(canvas);

    this.cropperCanvas = canvas;
    this.cropperCtx = canvas.getContext('2d');
    this.cropperBox = null;

    const img = new Image();
    img.onload = () => {
      this.cropperImg = img;
      this._setupCropperEvents();
      this._drawCropper(true);
    };
    img.src = imageSrc;
  }

  /**
   * Renders the rotated image and draggable crop box overlay.
   */
  _drawCropper(resetBox) {
    if (!this.cropperCanvas || !this.cropperImg) return;
    const canvas = this.cropperCanvas;
    const ctx = this.cropperCtx;
    const img = this.cropperImg;

    const isRotated90or270 = this.cropperAngle === 90 || this.cropperAngle === 270;
    const naturalWidth = isRotated90or270 ? img.naturalHeight : img.naturalWidth;
    const naturalHeight = isRotated90or270 ? img.naturalWidth : img.naturalHeight;

    // Scale canvas to fit viewport container comfortably
    const maxW = 760;
    const maxH = 460;
    let scale = Math.min(maxW / naturalWidth, maxH / naturalHeight, 1);
    if (scale <= 0) scale = 0.5;

    const displayW = Math.round(naturalWidth * scale);
    const displayH = Math.round(naturalHeight * scale);

    canvas.width = displayW;
    canvas.height = displayH;
    this.cropperDisplayScale = scale;

    ctx.save();
    ctx.translate(displayW / 2, displayH / 2);
    ctx.rotate((this.cropperAngle * Math.PI) / 180);

    const drawW = (this.cropperAngle % 180 === 0) ? displayW : displayH;
    const drawH = (this.cropperAngle % 180 === 0) ? displayH : displayW;
    ctx.drawImage(img, -drawW / 2, -drawH / 2, drawW, drawH);
    ctx.restore();

    // Initialize crop box if needed
    if (!this.cropperBox || resetBox) {
      const marginX = Math.round(displayW * 0.06);
      const marginY = Math.round(displayH * 0.06);
      this.cropperBox = {
        x: marginX,
        y: marginY,
        width: displayW - (marginX * 2),
        height: displayH - (marginY * 2)
      };
    }

    const box = this.cropperBox;

    // Dark tint outside crop box
    ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
    ctx.fillRect(0, 0, displayW, box.y); // Top
    ctx.fillRect(0, box.y + box.height, displayW, displayH - (box.y + box.height)); // Bottom
    ctx.fillRect(0, box.y, box.x, box.height); // Left
    ctx.fillRect(box.x + box.width, box.y, displayW - (box.x + box.width), box.height); // Right

    // Crop box border
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 2;
    ctx.strokeRect(box.x, box.y, box.width, box.height);

    // Grid rule-of-thirds lines inside crop box
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.25)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(box.x + box.width / 3, box.y);
    ctx.lineTo(box.x + box.width / 3, box.y + box.height);
    ctx.moveTo(box.x + (box.width * 2) / 3, box.y);
    ctx.lineTo(box.x + (box.width * 2) / 3, box.y + box.height);
    ctx.moveTo(box.x, box.y + box.height / 3);
    ctx.lineTo(box.x + box.width, box.y + box.height / 3);
    ctx.moveTo(box.x, box.y + (box.height * 2) / 3);
    ctx.lineTo(box.x + box.width, box.y + (box.height * 2) / 3);
    ctx.stroke();

    // Corner handles
    const handleSize = 12;
    ctx.fillStyle = '#0284c7';
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;

    const corners = [
      { x: box.x, y: box.y }, // nw
      { x: box.x + box.width, y: box.y }, // ne
      { x: box.x + box.width, y: box.y + box.height }, // se
      { x: box.x, y: box.y + box.height } // sw
    ];

    corners.forEach(c => {
      ctx.beginPath();
      ctx.arc(c.x, c.y, handleSize / 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    });
  }

  /**
   * Sets up mouse and drag handlers for adjusting the crop box.
   */
  _setupCropperEvents() {
    const canvas = this.cropperCanvas;
    if (!canvas) return;

    let isDragging = false;
    let dragMode = null; // 'nw', 'ne', 'se', 'sw', 'move'
    let startX = 0;
    let startY = 0;
    let initialBox = null;

    const getPos = (e) => {
      const rect = canvas.getBoundingClientRect();
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const clientY = e.touches ? e.touches[0].clientY : e.clientY;
      return {
        x: clientX - rect.left,
        y: clientY - rect.top
      };
    };

    const hitTest = (pos) => {
      if (!this.cropperBox) return null;
      const b = this.cropperBox;
      const handleRadius = 16;

      if (Math.hypot(pos.x - b.x, pos.y - b.y) <= handleRadius) return 'nw';
      if (Math.hypot(pos.x - (b.x + b.width), pos.y - b.y) <= handleRadius) return 'ne';
      if (Math.hypot(pos.x - (b.x + b.width), pos.y - (b.y + b.height)) <= handleRadius) return 'se';
      if (Math.hypot(pos.x - b.x, pos.y - (b.y + b.height)) <= handleRadius) return 'sw';

      if (pos.x >= b.x && pos.x <= b.x + b.width && pos.y >= b.y && pos.y <= b.y + b.height) {
        return 'move';
      }
      return null;
    };

    canvas.onmousedown = (e) => {
      const pos = getPos(e);
      dragMode = hitTest(pos);
      if (dragMode) {
        isDragging = true;
        startX = pos.x;
        startY = pos.y;
        initialBox = { ...this.cropperBox };
      }
    };

    canvas.onmousemove = (e) => {
      const pos = getPos(e);
      if (!isDragging) {
        const mode = hitTest(pos);
        if (mode === 'nw' || mode === 'se') canvas.style.cursor = 'nwse-resize';
        else if (mode === 'ne' || mode === 'sw') canvas.style.cursor = 'nesw-resize';
        else if (mode === 'move') canvas.style.cursor = 'move';
        else canvas.style.cursor = 'default';
        return;
      }

      const dx = pos.x - startX;
      const dy = pos.y - startY;
      const b = { ...initialBox };
      const minSize = 40;

      if (dragMode === 'move') {
        b.x = Math.max(0, Math.min(canvas.width - b.width, b.x + dx));
        b.y = Math.max(0, Math.min(canvas.height - b.height, b.y + dy));
      } else if (dragMode === 'se') {
        b.width = Math.max(minSize, Math.min(canvas.width - b.x, b.width + dx));
        b.height = Math.max(minSize, Math.min(canvas.height - b.y, b.height + dy));
      } else if (dragMode === 'sw') {
        const newX = Math.max(0, Math.min(initialBox.x + initialBox.width - minSize, b.x + dx));
        b.width = initialBox.x + initialBox.width - newX;
        b.x = newX;
        b.height = Math.max(minSize, Math.min(canvas.height - b.y, b.height + dy));
      } else if (dragMode === 'ne') {
        const newY = Math.max(0, Math.min(initialBox.y + initialBox.height - minSize, b.y + dy));
        b.height = initialBox.y + initialBox.height - newY;
        b.y = newY;
        b.width = Math.max(minSize, Math.min(canvas.width - b.x, b.width + dx));
      } else if (dragMode === 'nw') {
        const newX = Math.max(0, Math.min(initialBox.x + initialBox.width - minSize, b.x + dx));
        const newY = Math.max(0, Math.min(initialBox.y + initialBox.height - minSize, b.y + dy));
        b.width = initialBox.x + initialBox.width - newX;
        b.height = initialBox.y + initialBox.height - newY;
        b.x = newX;
        b.y = newY;
      }

      this.cropperBox = b;
      this._drawCropper(false);
    };

    window.addEventListener('mouseup', () => {
      isDragging = false;
      dragMode = null;
    });
  }

  /**
   * Applies the crop & rotate to the active card's photo and updates the review thumbnail.
   */
  applyPhotoCropper() {
    if (!this.cropperImg || !this.cropperBox || !this.scannedCertItems || (!this.cropperCurrentItemId && this.cropperCurrentIndex == null)) {
      console.warn('applyPhotoCropper aborted: missing cropper state', {
        hasImg: !!this.cropperImg,
        hasBox: !!this.cropperBox,
        hasItems: !!this.scannedCertItems,
        itemId: this.cropperCurrentItemId,
        index: this.cropperCurrentIndex
      });
      return;
    }
    const img = this.cropperImg;
    const box = this.cropperBox;
    const scale = this.cropperDisplayScale || 1;

    // Calculate crop coordinates on original unscaled image
    const cropX = Math.round(box.x / scale);
    const cropY = Math.round(box.y / scale);
    const cropW = Math.round(box.width / scale);
    const cropH = Math.round(box.height / scale);

    const isRotated90or270 = this.cropperAngle === 90 || this.cropperAngle === 270;
    const naturalW = isRotated90or270 ? img.naturalHeight : img.naturalWidth;
    const naturalH = isRotated90or270 ? img.naturalWidth : img.naturalHeight;

    // 1. Render full rotated image on an offscreen high-res canvas
    const rotatedCanvas = document.createElement('canvas');
    rotatedCanvas.width = naturalW;
    rotatedCanvas.height = naturalH;
    const rotCtx = rotatedCanvas.getContext('2d');

    rotCtx.translate(naturalW / 2, naturalH / 2);
    rotCtx.rotate((this.cropperAngle * Math.PI) / 180);
    const drawW = (this.cropperAngle % 180 === 0) ? naturalW : naturalH;
    const drawH = (this.cropperAngle % 180 === 0) ? naturalH : naturalW;
    rotCtx.drawImage(img, -drawW / 2, -drawH / 2, drawW, drawH);

    // 2. Extract cropped area onto destination canvas
    const destCanvas = document.createElement('canvas');
    destCanvas.width = Math.max(1, cropW);
    destCanvas.height = Math.max(1, cropH);
    const destCtx = destCanvas.getContext('2d');

    destCtx.drawImage(
      rotatedCanvas,
      cropX, cropY, cropW, cropH,
      0, 0, cropW, cropH
    );

    const croppedDataUrl = destCanvas.toDataURL('image/jpeg', 0.92);

    // Update the item in memory
    const item = this.cropperCurrentItemId
      ? this.scannedCertItems.find(x => x.id === this.cropperCurrentItemId)
      : (this.cropperCurrentIndex != null ? this.scannedCertItems[this.cropperCurrentIndex] : null);
    if (item) {
      item.base64Data = croppedDataUrl;
      const previewImg = document.getElementById(`scanned-card-preview-${item.id}`) || (this.cropperCurrentIndex != null ? document.getElementById(`scanned-card-preview-${this.cropperCurrentIndex}`) : null);
      if (previewImg) {
        previewImg.src = croppedDataUrl;
        previewImg.style.display = 'block';
      }
      const loadingEl = document.getElementById(`scanned-card-loading-${item.id}`) || (this.cropperCurrentIndex != null ? document.getElementById(`scanned-card-loading-${this.cropperCurrentIndex}`) : null);
      if (loadingEl) {
        loadingEl.style.display = 'none';
      }

      // Automatically re-run OCR on the newly cropped & oriented photo!
      this.extractCertInfoFromImage(item, false);
    }

    this.closePhotoCropperModal();
    if (typeof window.showToast === 'function') {
      window.showToast('✂️ Photo cropped and scanned successfully!', 'success');
    }
  }

  /**
   * Returns a Set of lowercase normalized names of all departed / previous employees.
   */
  getPreviousEmployeeNamesSet() {
    const prevEmpNames = new Set();
    const activeNames = new Set();
    const empTable = this.db ? this.db.getTable('employees') : null;
    if (empTable && empTable.rows) {
      empTable.rows.forEach(e => {
        const eName = String(e['Employee Name'] || e['Name'] || Object.values(e)[0] || '').toLowerCase().trim();
        if (!eName) return;
        const eLoc = String(e['Location'] || '').toLowerCase().trim();
        const eStat = String(e['Status'] || '').toLowerCase().trim();
        const eJob = String(e['Job Number'] || e['Job #'] || '').toLowerCase().trim();
        if (eLoc === 'previous employee' || eLoc.includes('previous') ||
            eStat === 'previous employee' || eStat.includes('inactive') || eStat.includes('terminated') ||
            eJob.includes('previous') || eJob.startsWith('002-') || eName.includes('former')) {
          prevEmpNames.add(eName);
        } else {
          activeNames.add(eName);
        }
      });
    }
    const prevTable = this.db ? this.db.getTable('previous_employees') : null;
    if (prevTable && prevTable.rows) {
      prevTable.rows.forEach(p => {
        const pName = String(p['Employee Name'] || p['Name'] || Object.values(p)[0] || '').toLowerCase().trim();
        if (pName && !activeNames.has(pName)) prevEmpNames.add(pName);
      });
    }
    // Ensure no currently active employees are treated as previous employees
    activeNames.forEach(n => prevEmpNames.delete(n));
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
   * Checks whether an employee row represents an active employee (not departed/inactive/previous).
   */
  isEmployeeActive(r, prevEmpNames = null) {
    if (!r) return false;
    if (!prevEmpNames) prevEmpNames = this.getPreviousEmployeeNamesSet();
    return !this.isRowPreviousEmployee(r, prevEmpNames);
  }

  /**
   * Returns a sorted list of names of currently employed workers (excluding previous/terminated).
   */
  getActiveEmployeeNamesList() {
    const prevNames = this.getPreviousEmployeeNamesSet();
    const empTable = this.db ? this.db.getTable('employees') : null;
    const names = [];
    if (empTable && empTable.rows) {
      empTable.rows.forEach(r => {
        if (this.isEmployeeActive(r, prevNames)) {
          const n = String(r['Employee Name'] || r['Name'] || Object.values(r)[0] || '').trim();
          if (n && n !== '—' && !names.includes(n) && !n.toLowerCase().includes('vacant') && !n.toLowerCase().includes('open')) {
            names.push(n);
          }
        }
      });
    }
    return names.sort((a, b) => a.localeCompare(b));
  }

  /**
   * Calculates Levenshtein distance between two strings.
   */
  calcLevenshtein(a, b) {
    if (a === b) return 0;
    if (!a || !a.length) return (b && b.length) || 0;
    if (!b || !b.length) return a.length;
    const matrix = [];
    for (let i = 0; i <= b.length; i++) matrix[i] = [i];
    for (let j = 0; j <= a.length; j++) matrix[0][j] = j;
    for (let i = 1; i <= b.length; i++) {
      for (let j = 1; j <= a.length; j++) {
        if (b.charAt(i - 1) === a.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          );
        }
      }
    }
    return matrix[b.length][a.length];
  }

  /**
   * Matches an active employee from arbitrary text (email subject, attachment filename, or OCR text).
   * Supports full names, alternate names (e.g. John-Michael Baker -> John Baker), and compound parts.
   */
  matchEmployeeFromText(text, employeeList = null) {
    if (!text) return '';
    const clean = String(text)
      .replace(/^(fwd|re|fw):\s*/ig, '')
      .replace(/^(fwd|re|fw):\s*/ig, '')
      .trim();
    if (!clean) return '';

    const activeList = employeeList || this.getActiveEmployeeNamesList();
    const prevSet = this.getPreviousEmployeeNamesSet();

    // 1. Check exact active employee full names first (longer names first)
    const sorted = [...activeList].sort((a, b) => b.length - a.length);
    for (const emp of sorted) {
      if (prevSet && prevSet.has(emp.toLowerCase())) continue;
      const re = new RegExp('\\b' + emp.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&') + '\\b', 'i');
      if (re.test(clean)) {
        return emp;
      }
    }

    // 2. Check Alternate Names from employees table
    const empTable = this.db ? this.db.getTable('employees') : null;
    if (empTable && empTable.rows) {
      for (const row of empTable.rows) {
        if (!this.isEmployeeActive(row, prevSet)) continue;
        const canonicalName = String(row['Employee Name'] || row['Name'] || '').trim();
        if (!canonicalName || (prevSet && prevSet.has(canonicalName.toLowerCase()))) continue;

        const altNames = String(row['Alternate Names'] || '').trim();
        if (altNames) {
          const parts = altNames.split(/[,;\/|]+/);
          for (const p of parts) {
            const altTrim = p.trim();
            if (altTrim.length >= 3) {
              const re = new RegExp('\\b' + altTrim.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&') + '\\b', 'i');
              if (re.test(clean)) {
                return canonicalName;
              }
              // If alternate name has hyphens like "John-Michael Baker", check "John Baker" or "Michael Baker"
              if (altTrim.includes('-')) {
                const hyphenRe = new RegExp('\\b' + altTrim.replace(/-/g, '[-\\s]') + '\\b', 'i');
                if (hyphenRe.test(clean)) {
                  return canonicalName;
                }
              }
            }
          }
        }

        // Also check if canonical name has hyphen like "John-Michael"
        if (canonicalName.includes('-')) {
          const firstAndLast = canonicalName.split(' ');
          if (firstAndLast.length === 2 && firstAndLast[0].includes('-')) {
            const firstParts = firstAndLast[0].split('-');
            for (const fp of firstParts) {
              if (fp.length >= 3) {
                const candidate = `${fp} ${firstAndLast[1]}`;
                const candRe = new RegExp('\\b' + candidate.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&') + '\\b', 'i');
                if (candRe.test(clean)) {
                  return canonicalName;
                }
              }
            }
          }
        }
      }
    }

    // 3. Inverted Full Name: Last, First or Last First or First Middle Last
    for (const emp of sorted) {
      if (prevSet && prevSet.has(emp.toLowerCase())) continue;
      const parts = emp.replace(/\s+(jr|sr|ii|iii|iv)\.?$/i, '').split(/\s+/);
      if (parts.length >= 2) {
        const fn = parts[0].replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');
        const ln = parts[parts.length - 1].replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');
        const invRe1 = new RegExp('\\b' + ln + '\\s*,\\s*' + fn + '\\b', 'i');
        const invRe2 = new RegExp('\\b' + ln + '\\s+' + fn + '\\b', 'i');
        const midRe = new RegExp('\\b' + fn + '\\s+[A-Za-z\'\\.-]+\\s+' + ln + '\\b', 'i');
        if (invRe1.test(clean) || invRe2.test(clean) || midRe.test(clean)) {
          return emp;
        }
      }
    }

    // 4. Unique Last Name + Fuzzy First Name or Cert Keyword (handles typos, e.g. "Rile Cremer" -> "Riley Cremer")
    const lastNameMap = {};
    for (const emp of activeList) {
      if (prevSet && prevSet.has(emp.toLowerCase())) continue;
      const parts = emp.replace(/\s+(jr|sr|ii|iii|iv)\.?$/i, '').split(/\s+/);
      if (parts.length >= 2) {
        const ln = parts[parts.length - 1].toLowerCase();
        if (!lastNameMap[ln]) lastNameMap[ln] = [];
        lastNameMap[ln].push(emp);
      }
    }

    const words = clean.replace(/[^a-zA-Z0-9\s'-]/g, ' ').split(/\s+/).filter(w => w.length >= 2);
    const certKeywordsRe = /\b(1st\s*aid|first\s*aid|cpr|dl|cdl|mec|medical\s*card|med\s*card|dot\s*card|crane|forklift|osha|msha|bnsf|pole\s*top|dig\s*safe|trench|rigging|cert|renewal|card)\b/i;
    const hasCertKeyword = certKeywordsRe.test(clean);

    const calcLevenshtein = (a, b) => {
      if (a === b) return 0;
      if (!a.length) return b.length;
      if (!b.length) return a.length;
      const matrix = [];
      for (let i = 0; i <= b.length; i++) matrix[i] = [i];
      for (let j = 0; j <= a.length; j++) matrix[0][j] = j;
      for (let i = 1; i <= b.length; i++) {
        for (let j = 1; j <= a.length; j++) {
          if (b.charAt(i - 1) === a.charAt(j - 1)) {
            matrix[i][j] = matrix[i - 1][j - 1];
          } else {
            matrix[i][j] = Math.min(
              matrix[i - 1][j - 1] + 1,
              matrix[i][j - 1] + 1,
              matrix[i - 1][j] + 1
            );
          }
        }
      }
      return matrix[b.length][a.length];
    };

    const ignoredWords = new Set([
      'the', 'and', 'for', 'with', 'card', 'cert', 'certs', 'license', 'driver', 'drivers',
      'medical', 'examiner', 'certificate', 'expiration', 'renewal', 'photo', 'image',
      'scan', 'scanned', 'front', 'back', 'temp', 'update', 'proof', 'attachment'
    ]);

    for (const word of words) {
      const wLower = word.toLowerCase();
      if (ignoredWords.has(wLower)) continue;
      const empsWithLn = lastNameMap[wLower];
      if (empsWithLn && empsWithLn.length === 1) {
        const candidateEmp = empsWithLn[0];
        const candidateParts = candidateEmp.replace(/\s+(jr|sr|ii|iii|iv)\.?$/i, '').split(/\s+/);
        const candFn = candidateParts[0].toLowerCase();

        let fnMatched = false;
        for (const otherWord of words) {
          if (otherWord.toLowerCase() === wLower) continue;
          const otherLower = otherWord.toLowerCase();
          if (ignoredWords.has(otherLower)) continue;
          if (
            calcLevenshtein(otherLower, candFn) <= 1 ||
            (otherLower.length >= 3 && candFn.startsWith(otherLower)) ||
            (candFn.length >= 3 && otherLower.startsWith(candFn))
          ) {
            fnMatched = true;
            break;
          }
        }

        if (fnMatched) {
          return candidateEmp;
        }

        if (hasCertKeyword && wLower.length >= 4) {
          return candidateEmp;
        }
      } else if (empsWithLn && empsWithLn.length > 1) {
        for (const candidateEmp of empsWithLn) {
          const candidateParts = candidateEmp.replace(/\s+(jr|sr|ii|iii|iv)\.?$/i, '').split(/\s+/);
          const candFn = candidateParts[0].toLowerCase();
          for (const otherWord of words) {
            if (otherWord.toLowerCase() === wLower) continue;
            const otherLower = otherWord.toLowerCase();
            if (ignoredWords.has(otherLower)) continue;
            if (
              calcLevenshtein(otherLower, candFn) <= 1 ||
              (otherLower.length >= 3 && candFn.startsWith(otherLower))
            ) {
              return candidateEmp;
            }
          }
        }
      }
    }

    return '';
  }

  /**
   * Normalizes arbitrary date formats (e.g. 6-23-2030, 8/4/2026, 2026-08-04) to MM/DD/YYYY.
   */
  normalizeScannedDateStr(raw) {
    if (!raw) return '';
    const clean = String(raw).trim().replace(/[^\d\/\-\.]/g, '');
    const parts = clean.split(/[\/\-\.]/);
    if (parts.length === 3) {
      let [m, d, y] = parts;
      if (m.length === 4) {
        // YYYY-MM-DD
        [y, m, d] = [m, d, y];
      }
      if (y.length === 2) {
        const yNum = parseInt(y, 10);
        y = yNum > 50 ? '19' + y : '20' + y;
      }
      m = String(m).padStart(2, '0');
      d = String(d).padStart(2, '0');
      return `${m}/${d}/${y}`;
    }
    return raw;
  }

  /**
   * Parses cert data (employee name, expiration date, date acquired, and cert type) from recognized OCR text.
   */
  parseCertInfoFromText(text, employeeList = null) {
    const result = {
      employeeName: '',
      certType: '',
      expDate: '',
      acqDate: ''
    };
    if (!text || typeof text !== 'string') return result;

    const activeList = employeeList || this.getActiveEmployeeNamesList();
    const prevSet = this.getPreviousEmployeeNamesSet();
    const filteredActiveList = activeList.filter(emp => !prevSet || !prevSet.has(emp.toLowerCase().trim()));

    // 1. Employee Name extraction
    // A. Explicit form headers (Operator Name, Employee Name, Candidate, Trainee, Cardholder, Name of Employee, etc.)
    const nameFieldRegex = /(?:operator(?:\s*name)?|employee(?:\s*name)?|trainee(?:\s*name)?|student(?:\s*name)?|candidate(?:\s*name)?|cardholder(?:\s*name)?|name\s+of\s+employee|name)\s*[:\-]\s*([A-Za-z\s'\.-]+)/i;
    const nameMatch = text.match(nameFieldRegex);
    if (nameMatch) {
      const rawCandidate = nameMatch[1].trim().split('\n')[0].trim();
      const matchedFromCandidate = this.matchEmployeeFromText(rawCandidate, filteredActiveList);
      if (matchedFromCandidate) {
        result.employeeName = matchedFromCandidate;
      }
    }

    // B. Driver's License Standards (AAMVA Line 1 = Surname, Line 2 = First/Given Name)
    // Common on US/Montana/Idaho/Washington DLs:
    // "1 ORESMAN \n 2 XANDERKIELENE" or "1. ORESMAN \n 2. XANDER" or "LN: ORESMAN \n FN: XANDER"
    if (!result.employeeName) {
      const dlLastMatch = text.match(/(?:^|\n)\s*(?:1[.\-]?\s+|LN:?\s*|Last(?:\s*Name)?[:\-]\s*)([A-Za-z'-]+)/i);
      const dlFirstMatch = text.match(/(?:^|\n)\s*(?:2[.\-]?\s+|FN:?\s*|First(?:\s*Name)?[:\-]\s*)([A-Za-z'-]+)/i);
      if (dlLastMatch && dlFirstMatch) {
        const ln = dlLastMatch[1].trim().toLowerCase();
        const fnToken = dlFirstMatch[1].trim().toLowerCase();
        for (const emp of filteredActiveList) {
          const parts = emp.trim().replace(/\s+(jr|sr|ii|iii|iv)\.?$/i, '').split(/\s+/);
          if (parts.length >= 2) {
            const empFn = parts[0].toLowerCase();
            const empLn = parts[parts.length - 1].toLowerCase();
            if (empLn === ln && (fnToken.startsWith(empFn) || empFn.startsWith(fnToken))) {
              result.employeeName = emp;
              break;
            }
          }
        }
      }
    }

    // C. Contiguous Full Name: "First Last", "First Middle Last", or "Last, First"
    if (!result.employeeName) {
      for (const emp of filteredActiveList) {
        const parts = emp.trim().replace(/\s+(jr|sr|ii|iii|iv)\.?$/i, '').split(/\s+/);
        if (parts.length >= 2) {
          const fn = parts[0].replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');
          const ln = parts[parts.length - 1].replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');
          const firstLastRe = new RegExp(`\\b${fn}(?:\\s+[A-Za-z'\\.-]+)?\\s+${ln}\\b`, 'i');
          const lastCommaFirstRe = new RegExp(`\\b${ln}\\s*,\\s*${fn}\\b`, 'i');
          if (firstLastRe.test(text) || lastCommaFirstRe.test(text)) {
            const evalRe = new RegExp(`(?:evaluator|instructor|trainer|supervisor|proctor)\\s*[:\\-]?[^\\n]*\\b(?:${fn}|${ln})\\b`, 'i');
            if (!evalRe.test(text)) {
              result.employeeName = emp;
              break;
            }
          }
        }
      }
    }

    // D. Split Co-occurrence: First Name + Last Name anywhere in the document (handles DL lines, middle names, etc.)
    if (!result.employeeName) {
      const candidates = [];
      for (const emp of filteredActiveList) {
        const parts = emp.trim().replace(/\s+(jr|sr|ii|iii|iv)\.?$/i, '').split(/\s+/);
        if (parts.length >= 2) {
          const fn = parts[0].toLowerCase();
          const ln = parts[parts.length - 1].toLowerCase();
          if (fn.length < 3 || ln.length < 3) continue;

          const fnEsc = fn.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');
          const lnEsc = ln.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');

          // Check if last name appears as whole word
          const lnRe = new RegExp(`\\b${lnEsc}\\b`, 'i');
          if (!lnRe.test(text)) continue;

          // Check if first name appears as whole word OR word prefix (handles XANDERKIELENE)
          const fnRe = new RegExp(`\\b${fnEsc}`, 'i');
          if (!fnRe.test(text)) continue;

          // Ensure not an evaluator/instructor
          const evalRe = new RegExp(`(?:evaluator|instructor|trainer|supervisor|proctor)\\s*[:\\-]?[^\\n]*\\b${lnEsc}\\b`, 'i');
          if (evalRe.test(text)) continue;

          candidates.push(emp);
        }
      }

      if (candidates.length === 1) {
        result.employeeName = candidates[0];
      } else if (candidates.length > 1) {
        let bestEmp = candidates[0];
        let shortestDist = Infinity;
        for (const emp of candidates) {
          const parts = emp.trim().split(/\s+/);
          const fnPos = text.toLowerCase().indexOf(parts[0].toLowerCase());
          const lnPos = text.toLowerCase().indexOf(parts[parts.length - 1].toLowerCase());
          if (fnPos !== -1 && lnPos !== -1) {
            const dist = Math.abs(fnPos - lnPos);
            if (dist < shortestDist) {
              shortestDist = dist;
              bestEmp = emp;
            }
          }
        }
        result.employeeName = bestEmp;
      }
    }

    // D2. Token-Based Unique Surname + Fuzzy First Name (handles OCR typos, noise chars like "|\RODRIGUEZ" / "AARDN ANTHONY")
    if (!result.employeeName) {
      const cleanTokens = text
        .replace(/[^a-zA-Z0-9\s'-]/g, ' ')
        .split(/\s+/)
        .filter(t => t.length >= 2);

      const lastNameMap = {};
      for (const emp of filteredActiveList) {
        const parts = emp.replace(/\s+(jr|sr|ii|iii|iv)\.?$/i, '').split(/\s+/);
        if (parts.length >= 2) {
          const ln = parts[parts.length - 1].toLowerCase();
          if (!lastNameMap[ln]) lastNameMap[ln] = [];
          lastNameMap[ln].push(emp);
        }
      }

      for (const token of cleanTokens) {
        const tLow = token.toLowerCase();
        const empsWithLn = lastNameMap[tLow];
        if (empsWithLn && empsWithLn.length === 1) {
          const candidateEmp = empsWithLn[0];
          const cParts = candidateEmp.replace(/\s+(jr|sr|ii|iii|iv)\.?$/i, '').split(/\s+/);
          const cFn = cParts[0].toLowerCase();
          for (const otherToken of cleanTokens) {
            if (otherToken.toLowerCase() === tLow) continue;
            const oLow = otherToken.toLowerCase();
            if (
              this.calcLevenshtein(oLow, cFn) <= 1 ||
              (oLow.length >= 3 && cFn.startsWith(oLow)) ||
              (cFn.length >= 3 && oLow.startsWith(cFn))
            ) {
              result.employeeName = candidateEmp;
              break;
            }
          }
          if (result.employeeName) break;
        } else if (empsWithLn && empsWithLn.length > 1) {
          for (const candidateEmp of empsWithLn) {
            const cParts = candidateEmp.replace(/\s+(jr|sr|ii|iii|iv)\.?$/i, '').split(/\s+/);
            const cFn = cParts[0].toLowerCase();
            for (const otherToken of cleanTokens) {
              if (otherToken.toLowerCase() === tLow) continue;
              const oLow = otherToken.toLowerCase();
              if (
                this.calcLevenshtein(oLow, cFn) <= 1 ||
                (oLow.length >= 3 && cFn.startsWith(oLow))
              ) {
                result.employeeName = candidateEmp;
                break;
              }
            }
            if (result.employeeName) break;
          }
          if (result.employeeName) break;
        }
      }
    }

    // 2. Expiration Date extraction
    // Look for patterns like "Crane Cert Exp Date: 6-23-2030", "Expiration Date: 10/12/2028", "Expires: 2028-10-15", "4b Expires: 05/13/2027", "4b: 05/13/2027"
    const expRegex = /(?:(?:crane\s*cert\s*)?exp(?:iration)?\s*(?:date)?|expires?|valid\s*(?:through|thru|until)|end\s*date|\b4b\b(?:\s*expires?)?)\s*[:\-]?\s*([0-1]?\d[\/\-\.][0-3]?\d[\/\-\.]\d{2,4})/i;
    const expMatch = text.match(expRegex);
    if (expMatch) {
      result.expDate = this.normalizeScannedDateStr(expMatch[1]);
    }

    // Fallback: If no explicit expiration label was matched, look for future dates on the document (e.g. DL expiry in future year)
    if (!result.expDate) {
      const allDateMatches = text.match(/\b([0-1]?\d[\/\-\.][0-3]?\d[\/\-\.]\d{2,4})\b/g);
      if (allDateMatches && allDateMatches.length > 0) {
        const currentYear = new Date().getFullYear();
        for (const rawDate of allDateMatches) {
          const norm = this.normalizeScannedDateStr(rawDate);
          const parts = norm.split('/');
          if (parts.length === 3) {
            const y = parseInt(parts[2], 10);
            if (y >= currentYear) {
              result.expDate = norm;
              break;
            }
          }
        }
      }
    }

    // 3. Date Acquired / Test Date / Issue Date
    // Look for patterns like "Date: 8/4/2026", "Issue Date: 05/10/2025", "4a Issued: 04/09/2026", "Date Acquired: 06/01/2026"
    const acqRegex = /(?:(?:issue|issued|eval(?:uation)?|training|course)\s*date|date\s*acquired|date\s*completed|\b4a\b(?:\s*issued?)?|issued|\bdate)\s*[:\-]?\s*([0-1]?\d[\/\-\.][0-3]?\d[\/\-\.]\d{2,4})/i;
    const acqMatch = text.match(acqRegex);
    if (acqMatch) {
      const dStr = this.normalizeScannedDateStr(acqMatch[1]);
      if (dStr !== result.expDate) {
        result.acqDate = dStr;
      }
    }

    // 4. Certification Type
    const lower = text.toLowerCase();
    if (lower.includes('crane operator evaluation') || lower.includes('crane eval')) {
      result.certType = 'Crane Cert';
    } else if (lower.includes('medical examiner') || lower.includes('dot card') || lower.includes('mec') || lower.includes('national registry of certified medical')) {
      result.certType = 'MEC Expiration';
    } else if (lower.includes('cpr') && (lower.includes('first aid') || lower.includes('1st aid'))) {
      result.certType = '1st Aid & CPR';
    } else if (lower.includes('commercial license') || lower.includes('driver license') || lower.includes('driver\'s license') || lower.includes('cdl') || lower.includes('class: a') || lower.includes('class a') || lower.includes('dl#') || lower.includes('intrastate') || lower.includes('interstate')) {
      result.certType = 'DL';
    } else if (lower.includes('forklift')) {
      result.certType = 'Forklift';
    } else if (lower.includes('pole top') || lower.includes('ptr')) {
      result.certType = 'Pole Top Rescue';
    } else if (lower.includes('trench')) {
      result.certType = 'OSHA Trench Comp Person';
    } else if (lower.includes('rigging') || lower.includes('signalperson')) {
      result.certType = 'Rigging & Signaling/Signalperson & Spotter Cert';
    } else if (lower.includes('first aid') || lower.includes('1st aid')) {
      result.certType = '1st Aid';
    } else if (lower.includes('cpr')) {
      result.certType = 'CPR';
    }

    return result;
  }

  /**
   * Performs client-side OCR on an image attachment to pull employee name, expiration date,
   * date acquired, and certification type directly off the document/photo.
   */
  async extractCertInfoFromImage(item, userInitiated = false) {
    if (!item) return;
    if (typeof item === 'string') {
      item = this.scannedCertItems ? this.scannedCertItems.find(x => x.id === item) : null;
      if (!item) return;
    }

    if (!item.base64Data) {
      const b64 = await this.loadScannedCertAttachment(item.id);
      if (!b64) {
        if (userInitiated && typeof window.showToast === 'function') {
          window.showToast('Could not load image for text scanning', 'error');
        }
        return;
      }
    }

    if (!window.desktopAPI || typeof window.desktopAPI.extractTextFromPhoto !== 'function') {
      if (userInitiated) alert('OCR text recognition is not available in this environment.');
      return;
    }

    const badge = document.getElementById(`scanned-ocr-badge-${item.id}`);
    const scanBtn = document.getElementById(`btn-scan-ocr-${item.id}`);
    if (scanBtn) scanBtn.innerHTML = `<span>⏳</span> Scanning...`;

    try {
      const res = await window.desktopAPI.extractTextFromPhoto({ base64Data: item.base64Data });
      if (res && res.success && res.text) {
        const parsed = this.parseCertInfoFromText(res.text);
        let updatedCount = 0;

        if (parsed.employeeName && (!item.employeeName || item.employeeName === '')) {
          item.employeeName = parsed.employeeName;
          const empSelect = document.getElementById(`scanned-emp-select-${item.id}`);
          if (empSelect) empSelect.value = parsed.employeeName;
          updatedCount++;

          // Propagate employee name to sibling cards from the same email message (e.g. DL Back)
          if (item.messageId && this.scannedCertItems) {
            const hideVaultedCheckbox = document.getElementById('cert-scan-hide-vaulted');
            const hideVaulted = hideVaultedCheckbox ? hideVaultedCheckbox.checked : true;
            this.scannedCertItems.forEach(sib => {
              if (sib.id !== item.id && sib.messageId === item.messageId && (!sib.employeeName || sib.employeeName === '')) {
                sib.employeeName = parsed.employeeName;
                const sibSelect = document.getElementById(`scanned-emp-select-${sib.id}`);
                if (sibSelect) sibSelect.value = parsed.employeeName;

                // If item is DL Front and sib is DL Back, specialize cert types
                const sibFile = String(sib.fileName || '').toLowerCase();
                const isSibBack = sibFile.includes('back') || (sib.attIdx !== undefined && item.attIdx !== undefined && sib.attIdx > item.attIdx);
                if (isSibBack && (sib.certType === 'DL' || !sib.certType || sib.certType === 'Other Cert')) {
                  sib.certType = 'DL (Back)';
                  const sibCertSelect = document.getElementById(`scanned-cert-select-${sib.id}`);
                  if (sibCertSelect) sibCertSelect.value = 'DL (Back)';
                  if (item.certType === 'DL') {
                    item.certType = 'DL (Front)';
                    const itemCertSelect = document.getElementById(`scanned-cert-select-${item.id}`);
                    if (itemCertSelect) itemCertSelect.value = 'DL (Front)';
                  }
                }

                sib.alreadyInVault = this.isScannedCertAlreadyAdded(sib);
                const sibVaultBadge = document.getElementById(`scanned-vault-badge-${sib.id}`);
                if (sibVaultBadge) sibVaultBadge.style.display = sib.alreadyInVault ? 'inline-block' : 'none';

                if (sib.alreadyInVault && hideVaulted) {
                  const sibCard = document.getElementById(`scanned-cert-card-${sib.id}`);
                  if (sibCard) {
                    sibCard.style.transition = 'all 0.3s ease';
                    sibCard.style.opacity = '0';
                    sibCard.style.transform = 'scale(0.92)';
                    setTimeout(() => { if (sibCard && sibCard.parentNode) sibCard.remove(); }, 300);
                  }
                }
              }
            });
          }
        }

        if (parsed.expDate && (!item.expDate || item.expDate === '')) {
          item.expDate = parsed.expDate;
          const expInput = document.getElementById(`scanned-exp-date-${item.id}`);
          if (expInput) expInput.value = parsed.expDate;
          updatedCount++;
        }

        if (parsed.acqDate && (!item.acqDate || item.acqDate === '')) {
          item.acqDate = parsed.acqDate;
          const acqInput = document.getElementById(`scanned-acq-date-${item.id}`);
          if (acqInput) acqInput.value = parsed.acqDate;
          updatedCount++;
        }

        if (parsed.certType && (!item.certType || item.certType === 'Other Cert')) {
          item.certType = parsed.certType;
          const certSelect = document.getElementById(`scanned-cert-select-${item.id}`);
          if (certSelect) certSelect.value = parsed.certType;
          updatedCount++;
        }

        if (badge) {
          badge.style.display = 'inline-block';
          badge.textContent = `✨ Auto-detected`;
        }

        // Re-evaluate vault status with newly resolved employee name & cert type & dates
        item.alreadyInVault = this.isScannedCertAlreadyAdded(item);
        const vaultBadge = document.getElementById(`scanned-vault-badge-${item.id}`);
        if (vaultBadge) {
          vaultBadge.style.display = item.alreadyInVault ? 'inline-block' : 'none';
        }

        const hideVaultedCheckbox = document.getElementById('cert-scan-hide-vaulted');
        const hideVaulted = hideVaultedCheckbox ? hideVaultedCheckbox.checked : true;

        if (item.alreadyInVault && hideVaulted) {
          const cardEl = document.getElementById(`scanned-cert-card-${item.id}`);
          if (cardEl) {
            cardEl.style.transition = 'all 0.3s ease';
            cardEl.style.opacity = '0';
            cardEl.style.transform = 'scale(0.92)';
            setTimeout(() => {
              if (cardEl && cardEl.parentNode) cardEl.remove();
              this.updateScannedVaultCountBadges();
            }, 300);
          } else {
            this.updateScannedVaultCountBadges();
          }
        } else {
          this.updateScannedVaultCountBadges();
        }

        if (userInitiated && typeof window.showToast === 'function') {
          if (item.alreadyInVault) {
            window.showToast(`✨ Detected ${item.employeeName} (${item.certType}) — Already in Vault!`, 'info');
          } else if (updatedCount > 0) {
            window.showToast(`✨ Extracted from photo: ${item.employeeName || ''} ${item.expDate ? `(Exp: ${item.expDate})` : ''}`, 'success');
          } else {
            window.showToast('Photo scanned, but no new fields were detected', 'info');
          }
        }
      } else if (userInitiated && typeof window.showToast === 'function') {
        window.showToast('Could not detect readable text in photo', 'info');
      }
    } catch (ocrErr) {
      console.warn('OCR error on cert card:', ocrErr);
    } finally {
      if (scanBtn) scanBtn.innerHTML = `<span>✨</span> Scan Photo`;
    }
  }

  /**
   * Automatically converts an Apple HEIC/HEIF base64 data URL into a standard JPEG Data URL via heic2any.
   */
  async convertHeicDataUrlToJpeg(base64Data) {
    if (!base64Data || typeof base64Data !== 'string') return base64Data;
    const isHeic = base64Data.startsWith('data:image/heic') || base64Data.startsWith('data:image/heif') || base64Data.startsWith('data:application/octet-stream');
    if (!isHeic) return base64Data;

    if (typeof window.heic2any !== 'function') {
      console.warn('heic2any library is not loaded, keeping original data');
      return base64Data;
    }

    try {
      const parts = base64Data.split('base64,');
      const rawB64 = parts.length > 1 ? parts[1] : parts[0];
      const byteCharacters = atob(rawB64);
      const byteNumbers = new Uint8Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const heicBlob = new Blob([byteNumbers], { type: 'image/heic' });
      const convertedBlobOrBlobs = await window.heic2any({
        blob: heicBlob,
        toType: 'image/jpeg',
        quality: 0.92
      });
      const convertedBlob = Array.isArray(convertedBlobOrBlobs) ? convertedBlobOrBlobs[0] : convertedBlobOrBlobs;
      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.onerror = () => resolve(base64Data);
        reader.readAsDataURL(convertedBlob);
      });
    } catch (err) {
      console.warn('HEIC to JPEG conversion note:', err);
      return base64Data;
    }
  }

  /**
   * Checks whether an employee is currently assigned to a temporary non-field status (Vacation, Leave, Light Duty, Medical).
   */
  isStatusEmployee(r) {
    if (!r) return false;
    const loc = String(r['Location'] || '').toLowerCase().trim();
    return loc.includes('(vacation)') || loc === 'vacation' ||
           loc.includes('(leave)') || loc === 'leave' ||
           loc.includes('(light duty)') || loc === 'light duty' ||
           loc.includes('(weeds)') || loc === 'weeds' ||
           loc.includes('(medical)') || loc === 'medical' ||
           loc.includes("worker's comp") || loc.includes('fmla') ||
           loc.includes('military');
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

  promptTrainingDate(td) {
    if (!td || window.currentRoleMode === 'view_only') return;
    const currentText = (td.textContent || '').trim().replace(/^(?:📅|➕|\s)+/gu, '').replace(/^Set Date/i, '').trim();
    let isoVal = '';
    if (/^\d{4}-\d{2}-\d{2}$/.test(currentText)) {
      isoVal = currentText;
    } else if (currentText.includes('/')) {
      const p = currentText.split('/');
      if (p.length === 3) {
        const m = String(parseInt(p[0], 10)).padStart(2, '0');
        const d = String(parseInt(p[1], 10)).padStart(2, '0');
        let y = parseInt(p[2], 10);
        if (y < 100) y = 2000 + y;
        isoVal = `${y}-${m}-${d}`;
      }
    }
    const todayIso = new Date().toISOString().split('T')[0];

    const picker = document.createElement('input');
    picker.type = 'date';
    picker.value = isoVal || todayIso;
    picker.style.position = 'fixed';
    picker.style.zIndex = '99999';
    const rect = td.getBoundingClientRect();
    picker.style.left = `${Math.max(10, rect.left)}px`;
    picker.style.top = `${Math.min(window.innerHeight - 40, rect.bottom + 2)}px`;
    picker.style.opacity = '0';
    document.body.appendChild(picker);

    let resolved = false;
    const cleanup = () => {
      if (picker.parentNode) picker.remove();
    };

    picker.addEventListener('change', async () => {
      if (picker.value && !resolved) {
        resolved = true;
        const p = picker.value.split('-');
        const mdY = `${p[1]}/${p[2]}/${p[0]}`;
        await this.commitTrainingDateEdit(td, mdY);
      }
      cleanup();
    });

    picker.addEventListener('blur', () => {
      setTimeout(cleanup, 250);
    });

    if (typeof picker.showPicker === 'function') {
      try { picker.showPicker(); } catch { picker.click(); }
    } else {
      picker.click();
    }
  }

  async commitTrainingDateEdit(td, newDateStr) {
    if (!td || !this.db) return;
    const rowIdx = parseInt(td.dataset.row, 10);
    const tableData = this.db.getTable('training_tracking');
    if (!tableData || !tableData.rows || !rowIdx) return;

    let tableRow = tableData.rows.find(r => r._rowIdx === rowIdx);
    if (!tableRow && rowIdx >= 2 && tableData.rows[rowIdx - 2]) {
      tableRow = tableData.rows[rowIdx - 2];
    }
    if (!tableRow) return;

    const headers = tableData.headers || [];
    const dateColIdx = headers.findIndex(h => /completion|date completed/i.test(h));
    const statusColIdx = headers.findIndex(h => /^status$|^training status$/i.test(h));
    const dateHeader = dateColIdx !== -1 ? headers[dateColIdx] : 'Completion Date';
    const statusHeader = statusColIdx !== -1 ? headers[statusColIdx] : 'Status';

    const oldDate = tableRow[dateHeader] || '';
    tableRow[dateHeader] = newDateStr;
    if (tableData.rawGrid && tableData.rawGrid[rowIdx - 1] && dateColIdx !== -1) {
      tableData.rawGrid[rowIdx - 1][dateColIdx] = newDateStr;
    }

    const itemIdentifier = `${tableRow['Month'] || ''} | ${tableRow['Crew #'] || tableRow['Crew'] || ''} | ${tableRow['Training Topic'] || ''}`;

    // Queue mutation for Completion Date
    await this.db.addMutation({
      action: 'UPDATE_CELL',
      sheetName: 'Training Tracking',
      row: rowIdx,
      col: dateColIdx !== -1 ? (dateColIdx + 1) : 6,
      header: dateHeader,
      itemIdentifier: itemIdentifier,
      oldValue: oldDate,
      value: newDateStr
    });

    // Update screen UI for Date cell
    td.innerHTML = `
      <div style="display: inline-flex; align-items: center; gap: 6px;">
        <span class="cell-text" style="font-weight: 600; color: #60a5fa; font-family: monospace;">📅 ${this.escapeHtml(newDateStr)}</span>
        <button class="btn btn-secondary btn-pick-training-date" style="padding: 1px 5px; font-size: 10px; border-radius: 3px; cursor: pointer; color: #93c5fd;" title="Pick or change completion date" onclick="event.stopPropagation(); window.sheetNavigator.promptTrainingDate(this.closest('td'));">📅</button>
      </div>
    `;

    // Auto-complete status if currently Scheduled or Pending
    const curStatus = String(tableRow[statusHeader] || '').trim().toLowerCase();
    if (newDateStr && curStatus !== 'complete' && curStatus !== 'completed') {
      const oldStatus = tableRow[statusHeader] || 'Scheduled';
      tableRow[statusHeader] = 'Complete';
      if (tableData.rawGrid && tableData.rawGrid[rowIdx - 1] && statusColIdx !== -1) {
        tableData.rawGrid[rowIdx - 1][statusColIdx] = 'Complete';
      }

      await this.db.addMutation({
        action: 'UPDATE_CELL',
        sheetName: 'Training Tracking',
        row: rowIdx,
        col: statusColIdx !== -1 ? (statusColIdx + 1) : 10,
        header: statusHeader,
        itemIdentifier: itemIdentifier,
        oldValue: oldStatus,
        value: 'Complete'
      });

      const parentTr = td.closest('tr');
      if (parentTr) {
        const sCell = parentTr.querySelector(`td[data-header="${statusHeader}"]`);
        if (sCell) {
          sCell.innerHTML = `<span class="badge badge-training-status-clickable" style="background-color: #15803d; color: #fff; padding: 3px 9px; border-radius: 4px; font-weight: 700; cursor: pointer; display: inline-flex; align-items: center; gap: 4px; user-select: none;" title="Click to change training status"><span>✅ Complete</span> <span style="font-size: 10px; opacity: 0.7;">▾</span></span>`;
        }
      }
    }

    if (typeof this.db.schedulePersistSnapshot === 'function') {
      this.db.schedulePersistSnapshot(this.db.snapshot, 300);
    }

    td.style.transition = 'background-color 0.2s ease';
    td.style.backgroundColor = 'rgba(34, 197, 94, 0.25)';
    setTimeout(() => { td.style.backgroundColor = ''; }, 450);
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
      const json = (window.syncEngine && typeof window.syncEngine.executeNetworkRequest === 'function')
        ? await window.syncEngine.executeNetworkRequest(syncUrl, 'POST', { action: 'syncTrainingAttendees' })
        : await (await fetch(`${syncUrl}?action=syncTrainingAttendees`)).json();
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

    this.updateEmployeeViewToggleUI();

    // Toggle Action Buttons in Toolbar
    const btnNewItem = document.getElementById('btn-new-item');
    const btnNewEmployee = document.getElementById('btn-new-employee');
    const btnGenSwaps = document.getElementById('btn-generate-swaps');
    const btnFixDates = document.getElementById('btn-fix-changeout-dates');
    const btnReconcileHist = document.getElementById('btn-reconcile-history');
    const btnArchiveLost = document.getElementById('btn-archive-lost-failed');
    const btnImportCrews = document.getElementById('btn-import-crews');
    const btnTransferEquip = document.getElementById('btn-transfer-equipment-top');
    const btnManageDrug = document.getElementById('btn-manage-drug-tests');
    const btnPushClean = document.getElementById('btn-push-clean-sheet');
    const btnPpeTracking = document.getElementById('btn-ppe-tracking');
    const btnFiscalYear = document.getElementById('btn-fiscal-year-transition');

    const INVENTORY_KEYS = [
      'gloves', 'sleeves', 'blankets', 'macks',
      'hv_testers', 'phasing_sets', 'aed', 'grounds', 'hot_sticks'
    ];
    const isEmployeeOrJobSheet = this.currentSheetKey === 'employees' || this.currentSheetKey === 'job_tracking';
    const isInventorySheet = INVENTORY_KEYS.includes(this.currentSheetKey);
    const isSwapSheet = Boolean(sheetMeta?.isSwap);
    const isDrugTestSheet = this.currentSheetKey === 'dot_drug_tests' || this.currentSheetKey === 'drug_test_clinics';

    const singularItemNames = {
      gloves: 'Glove',
      sleeves: 'Sleeve',
      blankets: 'Blanket',
      macks: 'MACK',
      hv_testers: 'HV Tester',
      phasing_sets: 'Phasing Set',
      aed: 'AED',
      grounds: 'Ground',
      hot_sticks: 'Hot Stick'
    };

    if (btnPushClean) {
      const hasData = Boolean(tableData && ((tableData.rows && tableData.rows.length > 0) || (tableData.rawGrid && tableData.rawGrid.length > 0)));
      btnPushClean.style.display = hasData ? 'inline-block' : 'none';
      if (sheetMeta) {
        btnPushClean.title = `Push full clean ${sheetMeta.label} table directly to Google Sheets`;
      }
    }

    if (btnImportCrews) {
      btnImportCrews.style.display = isEmployeeOrJobSheet ? 'inline-block' : 'none';
    }

    if (btnNewEmployee) {
      btnNewEmployee.style.display = isEmployeeOrJobSheet ? 'inline-flex' : 'none';
    }

    if (btnFiscalYear) {
      btnFiscalYear.style.display = 'inline-flex';
    }

    if (btnTransferEquip) {
      btnTransferEquip.style.display = (isEmployeeOrJobSheet || isInventorySheet) ? 'inline-flex' : 'none';
    }

    if (btnNewItem) {
      btnNewItem.style.display = isInventorySheet ? 'inline-block' : 'none';
      if (isInventorySheet) {
        const singularName = singularItemNames[this.currentSheetKey] || (sheetMeta ? sheetMeta.label.replace(/^.*? /, '').replace(/s$/, '') : 'Item');
        btnNewItem.innerHTML = `➕ New ${singularName}`;
        btnNewItem.title = `Add a new ${singularName} to active ${sheetMeta?.label || 'inventory'}`;
      }
    }

    if (btnGenSwaps) {
      btnGenSwaps.style.display = (isSwapSheet || isInventorySheet) ? 'inline-block' : 'none';
      if (sheetMeta) {
        btnGenSwaps.title = `Generate upcoming change-out and calibration swap reports`;
      }
    }

    if (btnFixDates) {
      btnFixDates.style.display = isInventorySheet ? 'inline-block' : 'none';
      if (isInventorySheet && sheetMeta) {
        btnFixDates.title = `Recalculate and update change-out dates for ${sheetMeta.label}`;
      }
    }

    if (btnReconcileHist) {
      btnReconcileHist.style.display = (isInventorySheet || isSwapSheet) ? 'inline-block' : 'none';
      if (sheetMeta) {
        btnReconcileHist.title = `Reconcile active inventory with latest History records`;
      }
    }

    if (btnManageDrug) {
      btnManageDrug.style.display = isDrugTestSheet ? 'inline-flex' : 'none';
    }

    if (btnArchiveLost) {
      btnArchiveLost.style.display = isInventorySheet ? 'inline-flex' : 'none';
    }

    if (btnPpeTracking) {
      btnPpeTracking.style.display = (isEmployeeOrJobSheet || isInventorySheet || this.currentSheetKey === 'gloves' || this.currentSheetKey === 'sleeves') ? 'inline-flex' : 'none';
      if (window.ppeTrackingEngine) {
        window.ppeTrackingEngine.updateToolbarBadge();
      }
    }

    // Toggle and render Visual Analytics for Gloves & Sleeves
    this.updateVisualsToggleButton();
    this.renderInventoryVisuals();

    // Update dynamic multi-filter bar for inventory sheets
    this.updateFilterBar(tableData, isInventorySheet);

    // Update Equipment History Issues Toolbar Button & Alert Banner
    if (window.historyIssuesEngine) {
      window.historyIssuesEngine.updateActiveSheetUI(this.currentSheetKey);
    }

    if (!tableData || (!tableData.rows?.length && !tableData.rawGrid?.length)) {
      container.innerHTML = `
        <div class="empty-sheet-container" style="padding: 36px 20px; text-align: center; max-width: 580px; margin: 30px auto; background: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: 14px; box-shadow: 0 10px 30px rgba(0,0,0,0.3);">
          <div style="font-size: 42px; margin-bottom: 12px;">🛡️</div>
          <h3 style="color: var(--text-primary); font-size: 18px; font-weight: 700; margin-bottom: 8px;">No Database Loaded on this Device</h3>
          <p style="color: var(--text-secondary); font-size: 13.5px; line-height: 1.5; margin-bottom: 22px;">
            Your phone or tablet is ready! Download the complete live database directly from Google Sheets over the cloud, or import a snapshot file.
          </p>
          <div style="display: flex; flex-direction: column; gap: 12px; align-items: stretch;">
            <button class="btn btn-primary" onclick="window.syncEngine.downloadLatestSnapshot()" style="padding: 14px 18px; font-size: 14px; font-weight: 700; background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%); border: none; border-radius: 8px; display: flex; align-items: center; justify-content: center; gap: 8px; box-shadow: 0 4px 14px rgba(37, 99, 235, 0.4); cursor: pointer; color: #ffffff;">
              <span style="font-size: 18px;">⬇️</span> Download Database from Google Sheets (1-Click)
            </button>
            <button class="btn btn-secondary" onclick="window.syncEngine.importLocalSnapshotFile()" style="padding: 13px 18px; font-size: 14px; font-weight: 600; background: rgba(255, 255, 255, 0.05); border: 1px solid var(--border-color); border-radius: 8px; color: var(--text-primary); display: flex; align-items: center; justify-content: center; gap: 8px; cursor: pointer;">
              <span style="font-size: 18px;">📁</span> Import Snapshot File (from Google Drive / Local)
            </button>
          </div>
          <div style="margin-top: 18px; font-size: 11.5px; color: var(--text-muted); display: flex; align-items: center; justify-content: center; gap: 6px;">
            <span>💡</span> "Download Database" connects securely to Google Sheets and gets the full system in seconds.
          </div>
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

    // Render Employee Crew Cards View (Default view for Employees sheet)
    if (this.currentSheetKey === 'employees' && this.employeeViewMode === 'cards') {
      this.renderEmployeeCardsView(container, countBadge, tableData);
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
    const isFiltered = (this.filterSize !== 'all' || this.filterClass !== 'all' || this.filterLocation !== 'all' || this.filterStatus !== 'all' || Boolean(this.activeFailureReasonFilter) || Boolean(this.searchTerm));
    if (btnClear) {
      btnClear.style.display = isFiltered ? 'inline-flex' : 'none';
    }
  }

  renderSwapReportGrid(container, countBadge, tableData) {
    const grid = tableData.rawGrid;
    if (!grid || grid.length === 0) return;

    // Find the primary subheader row to identify visible columns and labels (Col A-J max 10 columns)
    let visibleColIndices = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
    let colLabels = (tableData.headers && tableData.headers.length >= 10)
      ? tableData.headers.slice(0, 10)
      : ['Employee', 'Current Item #', 'Size', 'Date Assigned', 'Change Out Date', 'Days Left', 'Pick List Item #', 'Status', 'Picked', 'Date Changed'];

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
      const fLower = firstCell.toLowerCase();
      const isClassHeader = /class\s*\d/i.test(firstCell) && (fLower.includes('swaps') || fLower.includes('sleeves') || fLower.includes('blankets') || fLower.includes('macks') || fLower.includes('gloves'));
      const isPrevEmpHeader = fLower.includes('previous employee');
      const isClassReclaimHeader = fLower.includes('class reclaims') || fLower.includes('class reclaim');
      const isLostHeader = (fLower.includes('lost') && fLower.includes('locate')) || fLower.includes('lost glove') || fLower.includes('lost sleeve') || fLower.includes('lost blanket') || fLower.includes('lost mack');
      const isRetestHeader = fLower.includes('needs retest') || (fLower.includes('on shelf') && (fLower.includes('retest') || fLower.includes('swaps')));

      if (isClassHeader) currentSection = 'class';
      else if (isPrevEmpHeader) currentSection = 'prev_emp';
      else if (isClassReclaimHeader) currentSection = 'class_reclaim';
      else if (isLostHeader) currentSection = 'lost';
      else if (isRetestHeader) currentSection = 'retest';

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
        (!hasItemData && !isClassHeader && !isPrevEmpHeader && !isClassReclaimHeader && !isLostHeader && !isRetestHeader)
      );

      if (this.searchTerm) {
        const rowMatches = visibleColIndices.some(c => 
          String(rowArr[c] || '').toLowerCase().includes(this.searchTerm)
        );
        if (!rowMatches && !isClassHeader && !isPrevEmpHeader && !isClassReclaimHeader && !isLostHeader && !isRetestHeader && !isCityHeader && !isForemanHeader) return;
      }

      visibleRowCount++;
      html += `<tr>`;

      const colSpan = visibleColIndices.length;

      // 1. Level 1: Main Section Headers (Primary Banner - Class Swaps & On Shelf Retest Swaps share identical format)
      if (isClassHeader || isRetestHeader) {
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
        let cleanCity = firstCell.replace(/^[📍🔍\s]+/u, '').trim();
        html += `<td colspan="${colSpan}" style="font-size: 12.5px; font-weight: 700; color: #c7d2fe; background: linear-gradient(90deg, rgba(99, 102, 241, 0.16) 0%, rgba(15, 23, 42, 0.6) 100%); padding: 7px 14px; text-align: left; border-left: 4px solid #6366f1; border-top: 1px solid rgba(99, 102, 241, 0.2); border-bottom: 1px solid rgba(99, 102, 241, 0.2);">
          <span style="font-size: 13px; margin-right: 6px;">📍</span>
          <span style="letter-spacing: 0.3px;">${this.escapeHtml(cleanCity || firstCell)}</span>
        </td></tr>`;
        return;
      }

      // 3. Level 3: Foreman / Crew Lead Header (Subtle & Indented, Subordinate to Location)
      if (isForemanHeader) {
        let cleanForeman = firstCell.replace(/^[👤👷\s]+/u, '').trim();
        html += `<td colspan="${colSpan}" style="font-size: 11.5px; font-weight: 600; color: #f472b6; background-color: rgba(255, 255, 255, 0.02); padding: 5px 12px 5px 32px; text-align: left; border-left: 2px solid rgba(244, 114, 182, 0.4); border-bottom: 1px solid rgba(255, 255, 255, 0.04);">
          <span style="font-size: 12px; margin-right: 5px; opacity: 0.9;">👤</span>
          <span style="color: var(--text-secondary); font-size: 11px; margin-right: 4px;">Foreman:</span>
          <span style="font-weight: 700; color: #f472b6;">${this.escapeHtml(cleanForeman || firstCell)}</span>
        </td></tr>`;
        return;
      }

      // 4. Subheader (Table column names)
      if (isSubHeader) {
        if (rowIdx <= 1) return; // Prevent duplicate header row directly beneath thead
        visibleColIndices.forEach((c) => {
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
            if (currentSection === 'retest' || val === '' || val === undefined) {
              customContent = ''; // No checkbox for shelf retest items
            } else {
              const isChecked = (val === 'TRUE' || val === 'true' || val === true);
              customContent = `<span style="cursor: pointer; font-size: 14px;" data-toggle-checkbox="${rowIdx + 1}" data-col="${c + 1}" data-sheet="${this.escapeHtml(tableData.name)}" data-header="${this.escapeHtml(colLabel)}">${isChecked ? '☑️' : '⬜'}</span>`;
            }
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

            if (vLower === 'ordered' || vLower.includes('ordered') || val.includes('Ordered')) {
              const cleanVal = val.replace(/📦/g, '').trim();
              customContent = `<span class="badge" style="background-color: #7c3aed; color: #fff; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 700;">📦 ${this.escapeHtml(cleanVal || 'Ordered')}</span>`;
            } else if (vLower === 'return to shelf' || vLower.includes('return to shelf') || vLower.includes('return')) {
              customContent = `<span class="badge" style="background-color: #475569; color: #fff; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 600;">↩️ Return to Shelf</span>`;
            } else if (vLower === 'packed for testing' || vLower.includes('packed for testing')) {
              customContent = `<span class="badge" style="background-color: #4f46e5; color: #fff; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 600;">🔬 Packed For Testing</span>`;
            } else if (vLower === 'ready for test' || vLower.includes('ready for test')) {
              customContent = `<span class="badge" style="background-color: #6366f1; color: #fff; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 600;">🔬 Ready For Test</span>`;
            } else if (vLower === 'needs retest' || vLower.includes('retest')) {
              customContent = `<span class="badge" style="background-color: #ea580c; color: #fff; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 700;">🔬 Needs Retest</span>`;
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
            const isPickListCol = colLower.includes('pick list');
            if (isPickListCol) {
              const rowObj = (tableData.rows || [])[rowIdx - 1];
              const empName = String(rowArr[0] || '').trim().toLowerCase();
              const currentItem = String(rowArr[1] || '').trim().toLowerCase();
              const manualPicks = (this.db && typeof this.db.getManualPicks === 'function') ? this.db.getManualPicks(this.currentSheetKey) : {};
              const isManual = (rowObj && (rowObj._manualPick || rowObj.isManualPick)) ||
                               (manualPicks[`${empName}|${currentItem}`] && manualPicks[`${empName}|${currentItem}`].pickListNum === displayVal) ||
                               (manualPicks[empName] && manualPicks[empName].pickListNum === displayVal);
              if (isManual && displayVal && displayVal !== '—' && displayVal !== '-') {
                cellStyle += ' background-color: rgba(59, 130, 246, 0.18); border: 1px solid #60a5fa; font-weight: 700; color: #93c5fd; border-radius: 4px;';
              }
            }

            const isReadOnly = colLower.includes('change out') || colLower.includes('days') || window.currentRoleMode === 'view_only';
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
    if (countBadge) {
      const rowCount = (tableData.rows && tableData.rows.length > 0) ? tableData.rows.length : visibleRowCount;
      countBadge.textContent = `${rowCount} rows`;
    }

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
        const header = e.target.dataset.header || '';
        const hLower = header.toLowerCase();

        // Update in-memory grid
        if (tableData.rawGrid && tableData.rawGrid[row - 1]) {
          tableData.rawGrid[row - 1][col - 1] = newVal;
        }

        const isSwapSheet = String(this.currentSheetKey || '').includes('_swaps') || String(sheetName || '').toLowerCase().includes('swaps');
        const isPickListCol = hLower.includes('pick list');
        let isManualPick = false;

        if (isSwapSheet && isPickListCol) {
          const rowIdx = row - 1;
          const gridRow = tableData.rawGrid ? tableData.rawGrid[rowIdx] : null;
          const empName = gridRow ? String(gridRow[0] || '').trim() : '';
          const currentItemNum = gridRow ? String(gridRow[1] || '').trim() : '';
          const isCleared = (!newVal || newVal === '—' || newVal === '-');
          isManualPick = !isCleared;

          // Find row object in tableData.rows
          const rowObj = (tableData.rows || []).find(r => r._rowIdx === row || (r['Employee'] && r['Employee'] === empName));

          let invKey = this.currentSheetKey.replace('_swaps', '').replace('swaps', '');
          if (!invKey.endsWith('s') && ['glove', 'sleeve', 'blanket', 'mack', 'ground'].includes(invKey)) {
            invKey += 's';
          }
          if (invKey === 'hot_stick' || invKey === 'stick') invKey = 'hot_sticks';
          if (invKey === 'hv_tester' || invKey === 'phasing_set') invKey = 'calibrations';

          const invTable = (this.db && typeof this.db.getTable === 'function') ? this.db.getTable(invKey) : null;
          let matchedItem = null;
          let newStatus = 'In Stock ✅';

          // Rubber Class safety validation for Gloves and Sleeves
          if (!isCleared && (invKey === 'gloves' || invKey === 'sleeves') && invTable && invTable.rows) {
            const parseClass = (c) => {
              if (c === undefined || c === null) return 0;
              const m = String(c).match(/\d+/);
              return m ? parseInt(m[0], 10) : 0;
            };

            const curItem = invTable.rows.find(it => {
              const itNum = String(it['Item #'] || it['Glove'] || it['Sleeve'] || it['ESL ID'] || Object.values(it)[0] || '').trim().toLowerCase();
              return itNum === currentItemNum.toLowerCase();
            });

            matchedItem = invTable.rows.find(it => {
              const itNum = String(it['Item #'] || it['Glove'] || it['Sleeve'] || it['ESL ID'] || Object.values(it)[0] || '').trim().toLowerCase();
              return itNum === newVal.toLowerCase();
            });

            if (curItem && matchedItem) {
              const curClass = parseClass(curItem['Class']);
              const pickClass = parseClass(matchedItem['Class']);
              if (curClass !== pickClass) {
                alert(`⚠️ Safety Violation: Rubber Class Mismatch!\n\nCannot assign Class ${pickClass} item #${newVal} to a Class ${curClass} swap.\nRubber class must match exactly.`);
                if (tableData.rawGrid && tableData.rawGrid[row - 1]) {
                  tableData.rawGrid[row - 1][col - 1] = initialVal;
                }
                e.target.textContent = initialVal;
                return;
              }
            }
          }

          if (rowObj) {
            rowObj._manualPick = isManualPick;
            rowObj.isManualPick = isManualPick;
            rowObj['Pick List Item #'] = newVal;
          }

          // Save to persistent manual picks registry
          if (this.db && typeof this.db.saveManualPick === 'function') {
            if (isCleared) {
              this.db.clearManualPick(this.currentSheetKey, empName, currentItemNum);
            } else {
              this.db.saveManualPick(this.currentSheetKey, empName, currentItemNum, newVal, 'In Stock ✅');
            }
          }

          // Dynamic status detection for the manual pick
          if (!isCleared) {
            if (invTable && invTable.rows) {
              if (!matchedItem) {
                matchedItem = invTable.rows.find(it => {
                  const itNum = String(it['Item #'] || it['Glove'] || it['Sleeve'] || it['Blanket'] || it['MACK'] || it['Serial #'] || it['ESL ID'] || Object.values(it)[0] || '').trim().toLowerCase();
                  return itNum === newVal.toLowerCase();
                });
              }
              if (matchedItem) {
                const iStat = String(matchedItem['Status'] || '').trim().toLowerCase();
                if (iStat === 'ready for delivery') newStatus = 'Ready For Delivery 🚚';
                else if (iStat === 'in testing') newStatus = 'In Testing 🔬';
                else newStatus = 'In Stock ✅';

                if (invKey === 'gloves' && rowObj && rowObj['Size'] && matchedItem['Size']) {
                  const empSize = parseFloat(rowObj['Size']);
                  const itSize = parseFloat(matchedItem['Size']);
                  if (!isNaN(empSize) && !isNaN(itSize) && itSize > empSize) {
                    newStatus = newStatus.replace('✅', '(Size Up) ⚠️').replace('🚚', '(Size Up) ⚠️').replace('🔬', '(Size Up) ⚠️');
                  }
                }
              }
            }

            const statCol = this.currentSheetKey.includes('mack') ? 9 : 7;
            if (gridRow && gridRow.length > statCol) {
              gridRow[statCol] = newStatus;
            }
            if (rowObj) {
              rowObj['Status'] = newStatus;
            }
          }
        }

        await this.db.addMutation({
          action: 'UPDATE_CELL',
          sheetName: sheetName,
          row: row,
          col: col,
          header: header,
          oldValue: initialVal,
          value: newVal,
          isManualPick: isManualPick
        });

        // If this is a Swap sheet and Date Changed was edited, trigger Stage 3
        if (window.swapEngine && this.currentSheetKey.includes('_swaps') && hLower.includes('changed')) {
          await window.swapEngine.handleDateChangedEdit(this.currentSheetKey, row - 1, newVal);
        }

        // Re-render swap grid if Date Changed or Pick List was edited to update status pill immediately
        if (isSwapSheet && (hLower.includes('changed') || hLower.includes('date') || isPickListCol)) {
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
        if (window.currentRoleMode === 'view_only') return;
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

  /**
   * Renders the interactive Employee Crew Cards View:
   * - Dedicated status cards for Vacation, Leave, Light Duty (and Medical) with title only in header.
   * - Active field crew cards matching Crew Import layout (location, job#, foreman, schedule, day pills, member list).
   * - Clicking any employee name opens their Employee Profile modal.
   * - Supports live search filtering by employee name, location, job number, classification, etc.
   */
  renderEmployeeCardsView(container, countBadge, tableData) {
    if (!container) return;
    if (!tableData) {
      tableData = this.db.getTable('employees') || { headers: [], rows: [] };
    }

    const jobTable = this.db ? this.db.getTable('job_tracking') : null;
    const jtRows = (jobTable && jobTable.rows) || [];
    const prevEmpNames = this.getPreviousEmployeeNamesSet();

    // Filter out previous/inactive employees
    let activeRows = (tableData.rows || []).filter(r => this.isEmployeeActive(r, prevEmpNames));

    const totalActiveCount = activeRows.length;

    // Search filter
    const searchTerm = (this.searchTerm || '').toLowerCase().trim();
    if (searchTerm) {
      activeRows = activeRows.filter(r => {
        return Object.values(r).some(val => {
          if (val === null || val === undefined) return false;
          return String(val).toLowerCase().includes(searchTerm);
        });
      });
    }

    // Separate into Status groups vs Active Field crews
    const vacationList = [];
    const leaveList = [];
    const lightDutyList = [];
    const medicalList = [];
    const fieldCrewMembers = [];

    activeRows.forEach(r => {
      const name = String(r['Employee Name'] || r['Name'] || Object.values(r)[0] || '').trim();
      const loc = String(r['Location'] || '').trim();
      const locLower = loc.toLowerCase();
      const job = String(r['Job Number'] || r['Job #'] || '').trim();
      const classification = String(r['Job Classification'] || r['Classification'] || r['Role'] || '').trim();
      const secondaryJob = String(r['Secondary Job Number'] || r['Secondary Job #'] || '').trim();
      const altNames = String(r['Alternate Names'] || '').trim();
      const phone = String(r['Phone Number'] || '').trim();
      const email = String(r['Email Address'] || r['Email'] || '').trim();
      const notes = String(r['Notes'] || '').trim();
      const hireDate = String(r['Hire Date'] || r['HireDate'] || '').trim();
      const status = String(r['Status'] || '').trim();

      let isPending = status.toLowerCase() === 'pending';
      if (!isPending && hireDate) {
        const parts = hireDate.split(/[-/]/);
        if (parts.length === 3) {
          let y, m, d;
          if (parts[0].length === 4) {
            y = parseInt(parts[0], 10);
            m = parseInt(parts[1], 10) - 1;
            d = parseInt(parts[2], 10);
          } else {
            m = parseInt(parts[0], 10) - 1;
            d = parseInt(parts[1], 10);
            y = parseInt(parts[2], 10);
          }
          const hDate = new Date(y, m, d, 12, 0, 0);
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          if (hDate > today) isPending = true;
        }
      }

      const empObj = {
        raw: r,
        name,
        location: loc,
        jobNumber: job,
        classification,
        secondaryJob,
        alternateNames: altNames,
        phone,
        email,
        notes,
        hireDate,
        status,
        isPending
      };

      const statLower = String(status || '').toLowerCase().trim();
      if (statLower === 'vacation' || locLower.includes('(vacation)') || locLower === 'vacation') {
        vacationList.push(empObj);
      } else if (statLower === 'leave' || locLower.includes('(leave)') || locLower === 'leave' || locLower.includes('fmla') || locLower.includes('military')) {
        leaveList.push(empObj);
      } else if (statLower === 'light duty' || locLower.includes('(light duty)') || locLower === 'light duty' || locLower.includes('(weeds)') || locLower === 'weeds') {
        lightDutyList.push(empObj);
      } else if (statLower === 'medical' || locLower.includes('(medical)') || locLower === 'medical' || locLower.includes("worker's comp") || locLower.includes('(injury)')) {
        medicalList.push(empObj);
      } else {
        fieldCrewMembers.push(empObj);
      }
    });

    // Helper for role priority / ranking
    const getRolePriority = (role) => {
      if (window.crewImportEngine && typeof window.crewImportEngine.getRolePriority === 'function') {
        return window.crewImportEngine.getRolePriority(role);
      }
      const r = String(role || '').toUpperCase().trim();
      const map = {
        'SUP': 1, 'SUPERINTENDENT': 1,
        'GF': 2, 'GENERAL FOREMAN': 2,
        'F': 3, 'FOREMAN': 3,
        'GTO F': 4, 'GTO FOREMAN': 4,
        'JL': 5, 'JRY': 5, 'JOURNEYMAN': 5, 'JOURNEYMAN LINEMAN': 5,
        'JRY OP': 6, 'JOURNEYMAN OPERATOR': 6,
        'WT': 7, 'WORKING TECH': 7, 'WORKING TECHNICIAN': 7,
        'GTO': 8, 'GAS TECH OPERATOR': 8,
        'EO 1': 9, 'EO1': 9, 'EQUIPMENT OPERATOR 1': 9,
        'EO 2': 10, 'EO2': 10, 'EQUIPMENT OPERATOR 2': 10,
        'AP 7': 11, 'AP 6': 12, 'AP 5': 13, 'AP 4': 14, 'AP 3': 15, 'AP 2': 16, 'AP 1': 17
      };
      return map[r] !== undefined ? map[r] : 999;
    };

    // Group field crew members by base job number (e.g. 049-26)
    const crewGroups = new Map();
    fieldCrewMembers.forEach(emp => {
      let baseJob = emp.jobNumber.replace(/\.\d+.*$/, '').trim();
      if (!baseJob) baseJob = 'Unassigned';
      if (!crewGroups.has(baseJob)) {
        crewGroups.set(baseJob, []);
      }
      crewGroups.get(baseJob).push(emp);
    });

    // Second pass: also register each employee under their secondary job's base crew group.
    // This populates cards like "040-26 (Fri-Sat)" whose members are primarily on another crew.
    fieldCrewMembers.forEach(emp => {
      if (!emp.secondaryJob) return;
      // Base of secondary job: strip trailing .N suffix but keep parenthesized schedule tag (e.g. "040-26 (Fri-Sat)")
      const secBase = emp.secondaryJob.replace(/\.\d+\s*$/, '').trim();
      if (!secBase || secBase === emp.jobNumber.replace(/\.\d+.*$/, '').trim()) return;
      if (!crewGroups.has(secBase)) {
        crewGroups.set(secBase, []);
      }
      // Don't double-add if already there
      const existing = crewGroups.get(secBase);
      if (!existing.find(m => m.name === emp.name && m.isSecondaryMember)) {
        existing.push({
          ...emp,
          isSecondaryMember: true,
          // On the secondary card, display slot comes from secondary job (e.g. "040-26 (Fri-Sat).3")
          jobNumber: emp.secondaryJob,
          // Stash the original primary slot so the badge can show it instead
          primaryJobNumber: emp.jobNumber
        });
      }
    });

    // Also include any active crews from job_tracking that currently have 0 assigned members (unless filtered out by search)
    if (!searchTerm && jtRows.length > 0) {
      jtRows.forEach(jt => {
        const jn = String(jt['Job Number'] || jt['Job #'] || '').trim();
        const base = jn.replace(/\.\d+.*$/, '').trim();
        const stat = String(jt['Status'] || '').toLowerCase();
        if (base && !crewGroups.has(base) && !base.startsWith('002') && !base.startsWith('005') && stat !== 'completed' && base.toLowerCase() !== 'job number' && base.toLowerCase() !== 'job #') {
          crewGroups.set(base, []);
        }
      });
    }

    // Build crew card view models
    const crewCards = [];
    crewGroups.forEach((members, baseJob) => {
      if (!baseJob || baseJob.toLowerCase() === 'job number' || baseJob.toLowerCase() === 'job #' || baseJob.startsWith('002')) return;

      // Find matching job_tracking row
      const jt = jtRows.find(j => {
        const jn = String(j['Job Number'] || j['Job #'] || '').trim();
        return jn === baseJob || jn.replace(/\.\d+.*$/, '').trim() === baseJob;
      });

      // Crew Location: from job_tracking, or from first member, or Helena
      let loc = (jt && jt['Location']) ? String(jt['Location']).trim() : '';
      if (!loc && members.length > 0) {
        loc = members[0].location.replace(/\s*\([^)]*\)/g, '').trim();
      }
      if (!loc) loc = 'Helena';

      // Foreman
      let foreman = (jt && jt['Foreman']) ? String(jt['Foreman']).trim() : '';
      if (!foreman && members.length > 0) {
        // Find member with highest rank
        const sortedByRank = [...members].sort((a, b) => getRolePriority(a.classification) - getRolePriority(b.classification));
        if (sortedByRank[0] && getRolePriority(sortedByRank[0].classification) <= 4) {
          foreman = sortedByRank[0].name;
        }
      }

      // Status
      let status = (jt && jt['Status']) ? String(jt['Status']).trim() : 'Active';

      // Work Schedule & Skips
      let schedule = (jt && jt['Work Schedule']) ? String(jt['Work Schedule']).trim() : 'Mon-Thu (4 10s)';
      const isSkipSun = jt ? (jt['Skip Sun'] === true || String(jt['Skip Sun']).toLowerCase() === 'true') : true;
      const isSkipMon = jt ? (jt['Skip Mon'] === true || String(jt['Skip Mon']).toLowerCase() === 'true') : false;
      const isSkipTue = jt ? (jt['Skip Tue'] === true || String(jt['Skip Tue']).toLowerCase() === 'true') : false;
      const isSkipWed = jt ? (jt['Skip Wed'] === true || String(jt['Skip Wed']).toLowerCase() === 'true') : false;
      const isSkipThu = jt ? (jt['Skip Thu'] === true || String(jt['Skip Thu']).toLowerCase() === 'true') : false;
      const isSkipFri = jt ? (jt['Skip Fri'] === true || String(jt['Skip Fri']).toLowerCase() === 'true') : true;
      const isSkipSat = jt ? (jt['Skip Sat'] === true || String(jt['Skip Sat']).toLowerCase() === 'true') : true;

      const skipMtg = jt ? (jt['Skip Weekly Meeting'] === true || String(jt['Skip Weekly Meeting']).toLowerCase() === 'true') : false;
      const skipChk = jt ? (jt['Skip Monthly Checklist'] === true || String(jt['Skip Monthly Checklist']).toLowerCase() === 'true') : false;

      // Job Name (Site Name / Description)
      const jobName = (jt && (jt['Job Name'] || jt['Site Name'] || jt['Description']))
        ? String(jt['Job Name'] || jt['Site Name'] || jt['Description']).trim()
        : '';

      // Helper: match foreman name against an employee, including their alternate names.
      // Handles cases where JT stores a nickname (Matt) but the employee row uses the full name (Matthew)
      // or vice versa. alternateNames is a pipe- or comma-separated string.
      const nameMatchesForeman = (emp, foremanName) => {
        if (!foremanName) return false;
        const fl = foremanName.trim().toLowerCase();
        if (emp.name.toLowerCase() === fl) return true;
        if (emp.alternateNames) {
          const alts = emp.alternateNames.split(/[|,;]/).map(s => s.trim().toLowerCase()).filter(Boolean);
          if (alts.includes(fl)) return true;
        }
        return false;
      };

      // Sort crew members: Foreman first, then by suffix numerical order, then alphabetically
      members.sort((a, b) => {
        const isAForm = nameMatchesForeman(a, foreman);
        const isBForm = nameMatchesForeman(b, foreman);
        if (isAForm && !isBForm) return -1;
        if (!isAForm && isBForm) return 1;

        const parseSuffix = (j) => {
          const m = String(j || '').match(/\.(\d+)/);
          return m ? parseInt(m[1], 10) : 999;
        };
        const sA = parseSuffix(a.jobNumber);
        const sB = parseSuffix(b.jobNumber);
        if (sA !== sB) return sA - sB;
        return a.name.localeCompare(b.name);
      });

      // Suffix numbering validation (.1, .2, .3, ...)
      const suffixes = [];
      const suffixCounts = new Map();
      members.forEach(m => {
        const match = String(m.jobNumber || '').match(/\.(\d+)/);
        if (match) {
          const sNum = parseInt(match[1], 10);
          suffixes.push(sNum);
          suffixCounts.set(sNum, (suffixCounts.get(sNum) || 0) + 1);
        }
      });
      const duplicateSuffixes = Array.from(suffixCounts.entries()).filter(([, count]) => count > 1).map(([n]) => n);
      let hasGaps = false;
      if (suffixes.length > 0) {
        const maxSuffix = Math.max(...suffixes);
        if (maxSuffix > suffixes.length || !suffixCounts.has(1)) {
          hasGaps = true;
        }
      }
      const hasNumberingIssue = duplicateSuffixes.length > 0 || hasGaps;

      // Crew Type / Discipline (Electric, Substation, Gas, Office, Mechanic)
      let crewType = (jt && jt['Crew Type']) ? String(jt['Crew Type']).trim() : '';
      if (!crewType) {
        const bn = String(baseJob || '').trim();
        const jnLower = String(jobName || '').toLowerCase();
        const locLower = String(loc || '').toLowerCase();
        if (bn.startsWith('005') || jnLower.includes('office') || jnLower.includes('management') || jnLower.includes('admin') || locLower === 'office') {
          crewType = 'Office';
        } else if (jnLower.includes('substation') || jnLower.includes('sub-station') || jnLower.includes('sub station')) {
          crewType = 'Substation';
        } else if (jnLower.includes('gas')) {
          crewType = 'Gas';
        } else if (jnLower.includes('mechanic') || jnLower.includes('shop') || jnLower.includes('garage') || jnLower.includes('fleet')) {
          crewType = 'Mechanic';
        } else {
          crewType = 'Electric';
        }
      }

      crewCards.push({
        baseJob,
        jobNumber: (jt && jt['Job Number']) ? String(jt['Job Number']).trim() : baseJob,
        location: loc,
        foreman,
        status,
        crewType,
        schedule,
        jobName,
        isSkipSun, isSkipMon, isSkipTue, isSkipWed, isSkipThu, isSkipFri, isSkipSat,
        skipMtg, skipChk,
        members,
        nameMatchesForeman,  // pass helper down so renderFieldCrewCard can use it
        hasNumberingIssue,
        duplicateSuffixes,
        hasGaps
      });
    });

    // Helper to get import order index from saved order, in-memory import engine, or Job Tracking table
    let savedImportOrder = null;
    try {
      const savedStr = localStorage.getItem('CREW_IMPORT_ORDER');
      if (savedStr) savedImportOrder = JSON.parse(savedStr);
    } catch {
      // Ignore parse errors from stale localStorage values
    }
    if (!savedImportOrder && window._crewImportOrder) {
      savedImportOrder = window._crewImportOrder;
    }
    if (!savedImportOrder && window.crewImportEngine && window.crewImportEngine.parsedCrews && window.crewImportEngine.parsedCrews.length > 0) {
      savedImportOrder = window.crewImportEngine.parsedCrews.map(c => String(c.jobNumber || '').replace(/\.\d+.*$/, '').trim()).filter(Boolean);
    }
    if (!savedImportOrder) {
      savedImportOrder = this.db?.snapshot?.configs?.['CREW_IMPORT_ORDER'] ||
                         window.localDB?.snapshot?.configs?.['CREW_IMPORT_ORDER'] ||
                         window.db?.snapshot?.configs?.['CREW_IMPORT_ORDER'];
    }

    const getImportOrderIndex = (baseJob) => {
      if (!baseJob || baseJob === 'Unassigned') return 99999;
      const clean = String(baseJob).replace(/\.\d+.*$/, '').trim().toLowerCase();
      if (clean === 'job number' || clean === 'job #') return 99999;

      // 1. Check saved import order list (exact Excel import sequence)
      if (Array.isArray(savedImportOrder) && savedImportOrder.length > 0) {
        const idx = savedImportOrder.findIndex(j => String(j).replace(/\.\d+.*$/, '').trim().toLowerCase() === clean);
        if (idx !== -1) return idx;
      }

      // 2. Check Job Tracking rows order as fallback (or for secondary/unlisted crews)
      if (jtRows && jtRows.length > 0) {
        const jtIdx = jtRows.findIndex(j => {
          const jn = String(j['Job Number'] || j['Job #'] || '').replace(/\.\d+.*$/, '').trim().toLowerCase();
          return jn && jn !== 'job number' && jn !== 'job #' && jn === clean;
        });
        if (jtIdx !== -1) {
          // If savedImportOrder exists, offset non-import jobs so they appear after the imported Excel crews rather than colliding
          return (Array.isArray(savedImportOrder) && savedImportOrder.length > 0) ? (1000 + jtIdx) : jtIdx;
        }
      }

      return 9999;
    };

    // Sort crew cards: match the exact order from the imported Excel sheet
    crewCards.sort((a, b) => {
      const idxA = getImportOrderIndex(a.baseJob);
      const idxB = getImportOrderIndex(b.baseJob);
      if (idxA !== idxB) return idxA - idxB;

      const statOrder = { 'Active': 1, 'Pending Start': 2, 'On Hold': 3, 'Completed': 4 };
      const sA = statOrder[a.status] || 5;
      const sB = statOrder[b.status] || 5;
      if (sA !== sB) return sA - sB;

      return a.baseJob.localeCompare(b.baseJob, undefined, { numeric: true });
    });

    // Update row count badge in toolbar
    const totalMatching = vacationList.length + leaveList.length + lightDutyList.length + medicalList.length + fieldCrewMembers.length;
    if (countBadge) {
      countBadge.textContent = searchTerm
        ? `${totalMatching} of ${totalActiveCount} employees (${crewCards.length} crews)`
        : `${totalActiveCount} employees (${crewCards.length} field crews)`;
    }

    // List of all active employees for dropdowns (e.g. foreman selection)
    const allActiveEmployees = activeRows.map(r => ({
      name: String(r['Employee Name'] || r['Name'] || Object.values(r)[0] || '').trim(),
      classification: String(r['Job Classification'] || r['Classification'] || r['Role'] || '').trim()
    })).filter(a => a.name);

    // Helper for rendering a single employee row inside a card
    const renderMemberRow = (e, isLead = false, baseJob = '') => {
      let pendingBadge = '';
      if (e.isPending) {
        let shortDate = '';
        if (e.hireDate) {
          const parts = e.hireDate.split(/[-/]/);
          if (parts.length === 3) {
            shortDate = parts[0].length === 4 ? `${parts[1]}/${parts[2]}` : `${parts[0]}/${parts[1]}`;
          }
        }
        const badgeLabel = shortDate ? `⏳ Starts ${shortDate}` : `⏳ Pending`;
        pendingBadge = `<span class="badge" style="background: rgba(245, 158, 11, 0.18); color: #fbbf24; border: 1px solid rgba(245, 158, 11, 0.4); font-size: 9.5px; font-weight: 700; padding: 1px 5px; border-radius: 3px; cursor: pointer; transition: all 0.15s ease;" onclick="event.stopPropagation(); window.sheetNavigator.promptChangeHireDate('${this.escapeJs(e.name)}', '${this.escapeJs(e.hireDate || '')}')" onmouseover="this.style.borderColor='#f59e0b'; this.style.color='#fef3c7';" onmouseout="this.style.borderColor='rgba(245, 158, 11, 0.4)'; this.style.color='#fbbf24';" title="Pending New Hire — Click to change start date or activate today">${badgeLabel}</span>`;
      }

      return `
        <div class="crew-member-row"
             draggable="true"
             data-emp-name="${this.escapeHtml(e.name)}"
             data-job-number="${this.escapeHtml(e.jobNumber || '')}"
             data-base-job="${this.escapeHtml(baseJob)}"
             data-is-secondary="${e.isSecondaryMember ? 'true' : 'false'}"
             data-primary-job="${this.escapeHtml(e.primaryJobNumber || e.jobNumber || '')}"
             data-location="${this.escapeHtml(e.location || '')}"
             style="display: flex; justify-content: space-between; align-items: center; padding: 5px 4px; border-bottom: 1px dashed rgba(255,255,255,0.06); gap: 6px; border-radius: 4px; transition: background 0.15s ease; cursor: grab;"
             onmouseover="this.style.background='rgba(255,255,255,0.04)';"
             onmouseout="this.style.background='transparent';">
          <div style="display: flex; align-items: center; gap: 5px; flex-wrap: wrap; flex: 1; min-width: 0;">
            <span class="drag-handle" style="cursor: grab; color: var(--text-muted); font-size: 13px; user-select: none; padding: 0 2px;" title="Drag to move this employee to another crew">
              ⠿
            </span>
            <span style="color: var(--text-muted); font-size: 11px; font-family: monospace; min-width: 44px; cursor: pointer; padding: 1px 3px; border-radius: 3px;"
                  onclick="window.sheetNavigator.promptChangeMemberSlot('${this.escapeJs(e.name)}', '${this.escapeJs(e.jobNumber || '')}', '${this.escapeJs(baseJob)}')"
                  onmouseover="this.style.color='#60a5fa'; this.style.textDecoration='underline';"
                  onmouseout="this.style.color='var(--text-muted)'; this.style.textDecoration='none';"
                  title="Click to edit slot number">
              ${this.escapeHtml(e.jobNumber || '—')}
            </span>
            <a href="javascript:void(0)" onclick="window.employeeProfileEngine.openProfileModal('${this.escapeJs(e.name)}')"
               style="color: var(--text-primary); font-weight: ${isLead ? '700' : '500'}; font-size: 12.5px; text-decoration: none; cursor: pointer; display: inline-flex; align-items: center; gap: 4px;"
               onmouseover="this.style.color='#60a5fa'; this.style.textDecoration='underline';"
               onmouseout="this.style.color='var(--text-primary)'; this.style.textDecoration='none';"
               title="Open Employee Profile for ${this.escapeHtml(e.name)}">
              ${isLead ? '<span title="Crew Foreman / Lead" style="margin-right: 2px;">👑</span>' : ''}
              <span>${this.escapeHtml(e.name)}</span>
            </a>
            ${pendingBadge}
            ${window.ppeTrackingEngine ? window.ppeTrackingEngine.getMemberRowBadge(e.name, e.classification) : ''}
            ${e.isSecondaryMember && e.primaryJobNumber ? `
              <span class="badge" style="background: rgba(245, 158, 11, 0.15); color: #fbbf24; border: 1px solid rgba(245, 158, 11, 0.3); font-size: 9.5px; font-weight: 700; padding: 1px 5px; border-radius: 3px;" title="Primary Job: ${this.escapeHtml(e.primaryJobNumber)}">
                ⚡ 1st: ${this.escapeHtml(e.primaryJobNumber)}
              </span>
            ` : e.secondaryJob ? `
              <span class="badge" style="background: rgba(245, 158, 11, 0.15); color: #fbbf24; border: 1px solid rgba(245, 158, 11, 0.3); font-size: 9.5px; font-weight: 700; padding: 1px 5px; border-radius: 3px;" title="Secondary Job: ${this.escapeHtml(e.secondaryJob)}">
                ⚡ 2nd: ${this.escapeHtml(e.secondaryJob)}
              </span>
            ` : ''}
            ${e.alternateNames ? `
              <span class="badge" style="background: rgba(147, 197, 253, 0.12); color: #93c5fd; border: 1px solid rgba(147, 197, 253, 0.25); font-size: 9.5px; padding: 1px 4px; border-radius: 3px;" title="AKA: ${this.escapeHtml(e.alternateNames)}">
                AKA
              </span>
            ` : ''}
          </div>
          <div style="display: flex; align-items: center; gap: 4px; flex-shrink: 0;">
            <span class="badge" style="background: var(--bg-tertiary); color: var(--text-muted); font-size: 10px; padding: 1px 6px; border-radius: 3px; font-weight: 700; cursor: pointer;"
                  onclick="window.sheetNavigator.promptChangeMemberClassification('${this.escapeJs(e.name)}', '${this.escapeJs(e.classification || '')}')"
                  onmouseover="this.style.color='#60a5fa';"
                  onmouseout="this.style.color='var(--text-muted)';"
                  title="Click to change classification">
              ${this.escapeHtml(e.classification || '—')}
            </span>
            <button class="btn btn-xs" style="background: transparent; border: none; color: var(--text-muted); cursor: pointer; padding: 1px 4px; font-size: 12px; border-radius: 3px;"
                    onclick="window.sheetNavigator.openMemberRowActions(event, '${this.escapeJs(e.name)}', '${this.escapeJs(baseJob)}', ${isLead}, ${Boolean(e.isSecondaryMember)})"
                    title="Employee options">
              ⋮
            </button>
          </div>
        </div>
      `;
    };

    // Helper for rendering a status card (Vacation, Leave, Light Duty)
    const renderStatusCard = (title, icon, color, borderColor, badgeBg, list, emptyMsg) => {
      return `
        <div class="crew-card status-crew-card"
             data-status-type="${title}"
             style="background: var(--bg-secondary); border: 1px solid ${borderColor}; border-radius: 8px; padding: 14px; box-shadow: 0 1px 3px rgba(0,0,0,0.2); display: flex; flex-direction: column; transition: all 0.2s ease;">
          <!-- Card Header (TITLE ONLY, no Job # or Location) -->
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; border-bottom: 1px solid var(--border-color); padding-bottom: 8px;">
            <div style="font-weight: 800; font-size: 15px; color: ${color}; display: flex; align-items: center; gap: 8px;">
              <span>${icon}</span>
              <span>${title}</span>
            </div>
            <span class="badge" style="background: ${badgeBg}; color: ${color}; font-size: 11px; font-weight: 800; padding: 2px 8px; border-radius: 12px; border: 1px solid ${borderColor};">
              ${list.length} ${list.length === 1 ? 'Employee' : 'Employees'}
            </span>
          </div>
          <!-- Employee List (Status Drop Zone) -->
          <div class="status-drop-zone" style="flex: 1; min-height: 48px;">
            ${list.length > 0 ? list.map(e => `
              <div class="crew-member-row status-member-row"
                   draggable="true"
                   data-emp-name="${this.escapeHtml(e.name)}"
                   data-job-number="${this.escapeHtml(e.jobNumber || '')}"
                   data-base-job="${this.escapeHtml(title)}"
                   data-is-secondary="false"
                   data-primary-job="${this.escapeHtml(e.jobNumber || '')}"
                   data-location="${this.escapeHtml(e.location || '')}"
                   style="display: flex; justify-content: space-between; align-items: center; padding: 6px 4px; border-bottom: 1px dashed rgba(255,255,255,0.06); gap: 6px; cursor: grab;"
                   onmouseover="this.style.background='rgba(255,255,255,0.04)';"
                   onmouseout="this.style.background='transparent';">
                <div style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap; flex: 1; min-width: 0;">
                  <span class="drag-handle" style="cursor: grab; color: var(--text-muted); font-size: 13px; user-select: none; padding: 0 2px;" title="Drag to reassign to a field crew">
                    ⠿
                  </span>
                  <span style="color: #60a5fa; font-weight: 700; font-size: 11px; font-family: monospace; background: var(--bg-primary); border: 1px solid var(--border-color); border-radius: 4px; padding: 1px 5px;">
                    ${this.escapeHtml(e.jobNumber || '—')}
                  </span>
                  <a href="javascript:void(0)" onclick="window.employeeProfileEngine.openProfileModal('${this.escapeJs(e.name)}')"
                     style="color: var(--text-primary); font-weight: 600; font-size: 12.5px; text-decoration: none; cursor: pointer;"
                     onmouseover="this.style.color='#60a5fa'; this.style.textDecoration='underline';"
                     onmouseout="this.style.color='var(--text-primary)'; this.style.textDecoration='none';"
                     title="Open Employee Profile for ${this.escapeHtml(e.name)}">
                    ${this.escapeHtml(e.name)}
                  </a>
                  ${e.isPending ? (() => {
                    const sp = String(e.hireDate || '').split(/[-/]/);
                    const dt = sp.length === 3 ? (sp[0].length === 4 ? `${sp[1]}/${sp[2]}` : `${sp[0]}/${sp[1]}`) : '';
                    return `<span class="badge" style="background: rgba(245, 158, 11, 0.18); color: #fbbf24; border: 1px solid rgba(245, 158, 11, 0.4); font-size: 9.5px; font-weight: 700; padding: 1px 5px; border-radius: 3px; cursor: pointer; transition: all 0.15s ease;" onclick="event.stopPropagation(); window.sheetNavigator.promptChangeHireDate('${this.escapeJs(e.name)}', '${this.escapeJs(e.hireDate || '')}')" onmouseover="this.style.borderColor='#f59e0b'; this.style.color='#fef3c7';" onmouseout="this.style.borderColor='rgba(245, 158, 11, 0.4)'; this.style.color='#fbbf24';" title="Pending New Hire — Click to change start date or activate today">⏳ Starts ${dt || 'Soon'}</span>`;
                  })() : ''}
                  ${window.ppeTrackingEngine ? window.ppeTrackingEngine.getMemberRowBadge(e.name, e.classification) : ''}
                  <span class="badge" style="background: rgba(255,255,255,0.05); color: var(--text-muted); font-size: 10px; padding: 1px 5px; border-radius: 4px;">
                    📍 ${this.escapeHtml(e.location)}
                  </span>
                </div>
                <div style="display: flex; align-items: center; gap: 5px; flex-shrink: 0;">
                  <span class="badge" style="background: var(--bg-tertiary); color: var(--text-muted); font-size: 10px; padding: 1px 6px; border-radius: 3px; font-weight: 700;">
                    ${this.escapeHtml(e.classification || '—')}
                  </span>
                </div>
              </div>
            `).join('') : `
              <div style="color: var(--text-muted); font-size: 12px; font-style: italic; padding: 16px 8px; text-align: center; background: rgba(0,0,0,0.12); border-radius: 6px;">
                ${emptyMsg}
              </div>
            `}
          </div>
        </div>
      `;
    };

    // Helper for rendering an Active Field Crew Card (supports normal and inline-edit modes)
    const renderFieldCrewCard = (crew) => {
      const isEditing = this.editingCrewBaseJob === crew.baseJob;

      const dayPills = [
        { key: 'M', colKey: 'Mon', label: 'M', isWork: !crew.isSkipMon },
        { key: 'Tu', colKey: 'Tue', label: 'T', isWork: !crew.isSkipTue },
        { key: 'W', colKey: 'Wed', label: 'W', isWork: !crew.isSkipWed },
        { key: 'Th', colKey: 'Thu', label: 'Th', isWork: !crew.isSkipThu },
        { key: 'F', colKey: 'Fri', label: 'F', isWork: !crew.isSkipFri },
        { key: 'Sa', colKey: 'Sat', label: 'Sa', isWork: !crew.isSkipSat },
        { key: 'Su', colKey: 'Sun', label: 'Su', isWork: !crew.isSkipSun }
      ];

      const getStatusBadge = (stat) => {
        if (stat === 'Active') {
          return `<span class="badge" style="background: rgba(16, 185, 129, 0.15); color: #10b981; border: 1px solid rgba(16, 185, 129, 0.35); font-size: 10px; font-weight: 700; padding: 2px 6px; border-radius: 4px;">🟢 Active</span>`;
        }
        if (stat === 'Pending Start') {
          return `<span class="badge" style="background: rgba(245, 158, 11, 0.15); color: #fbbf24; border: 1px solid rgba(245, 158, 11, 0.35); font-size: 10px; font-weight: 700; padding: 2px 6px; border-radius: 4px;">🟡 Pending Start</span>`;
        }
        if (stat === 'On Hold') {
          return `<span class="badge" style="background: rgba(100, 116, 139, 0.2); color: #94a3b8; border: 1px solid rgba(100, 116, 139, 0.4); font-size: 10px; font-weight: 700; padding: 2px 6px; border-radius: 4px;">⏸️ On Hold</span>`;
        }
        if (stat === 'Completed') {
          return `<span class="badge" style="background: rgba(59, 130, 246, 0.15); color: #60a5fa; border: 1px solid rgba(59, 130, 246, 0.35); font-size: 10px; font-weight: 700; padding: 2px 6px; border-radius: 4px;">🏁 Completed</span>`;
        }
        return `<span class="badge" style="background: var(--bg-tertiary); color: var(--text-muted); font-size: 10px; padding: 2px 6px; border-radius: 4px;">${this.escapeHtml(stat)}</span>`;
      };

      const getCrewTypeBadge = (type, baseJob) => {
        const t = String(type || 'Electric').trim();
        let bg = 'rgba(14, 165, 233, 0.15)';
        let color = '#38bdf8';
        let border = 'rgba(14, 165, 233, 0.35)';
        let icon = '⚡';
        let title = 'Discipline: Electric (Rubber PPE required)';
        if (t === 'Substation') {
          bg = 'rgba(168, 85, 247, 0.15)';
          color = '#c084fc';
          border = 'rgba(168, 85, 247, 0.35)';
          icon = '🏗️';
          title = 'Discipline: Substation (No Rubber PPE required)';
        } else if (t === 'Gas') {
          bg = 'rgba(245, 158, 11, 0.15)';
          color = '#fbbf24';
          border = 'rgba(245, 158, 11, 0.35)';
          icon = '⛽';
          title = 'Discipline: Gas (No Rubber PPE required)';
        } else if (t === 'Office') {
          bg = 'rgba(16, 185, 129, 0.15)';
          color = '#34d399';
          border = 'rgba(16, 185, 129, 0.35)';
          icon = '🏢';
          title = 'Discipline: Office (Rubber PPE required)';
        } else if (t === 'Mechanic') {
          bg = 'rgba(148, 163, 184, 0.2)';
          color = '#94a3b8';
          border = 'rgba(148, 163, 184, 0.35)';
          icon = '🔧';
          title = 'Discipline: Mechanic (No Rubber PPE required)';
        }

        if (!baseJob || window.currentRoleMode === 'view_only') {
          return `<span class="badge" style="background: ${bg}; color: ${color}; border: 1px solid ${border}; font-size: 10px; font-weight: 700; padding: 2px 6px; border-radius: 4px;" title="${title}">${icon} ${this.escapeHtml(t)}</span>`;
        }

        return `
          <select class="crew-type-select-badge"
                  title="Discipline: Click to assign Electric, Substation, Gas, Office, or Mechanic to Job ${this.escapeHtml(baseJob)}"
                  onclick="event.stopPropagation()"
                  onchange="window.sheetNavigator.quickChangeCrewType('${this.escapeJs(baseJob)}', this.value)"
                  style="background: ${bg}; color: ${color}; border: 1px solid ${border}; font-size: 10.5px; font-weight: 700; padding: 2px 6px; border-radius: 4px; cursor: pointer; outline: none; transition: all 0.2s ease;">
            <option value="Electric" ${t === 'Electric' ? 'selected' : ''}>⚡ Electric</option>
            <option value="Substation" ${t === 'Substation' ? 'selected' : ''}>🏗️ Substation</option>
            <option value="Gas" ${t === 'Gas' ? 'selected' : ''}>⛽ Gas</option>
            <option value="Office" ${t === 'Office' ? 'selected' : ''}>🏢 Office</option>
            <option value="Mechanic" ${t === 'Mechanic' ? 'selected' : ''}>🔧 Mechanic</option>
          </select>
        `;
      };

      if (isEditing) {
        // INLINE EDIT MODE
        return `
          <div class="crew-card field-crew-card editing" data-crew-job="${this.escapeHtml(crew.baseJob)}"
               style="background: var(--bg-secondary); border: 2px solid #3b82f6; border-radius: 8px; padding: 14px; box-shadow: 0 4px 16px rgba(59, 130, 246, 0.2); display: flex; flex-direction: column;">
            <!-- Edit Mode Header -->
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; border-bottom: 1px solid var(--border-color); padding-bottom: 8px;">
              <div style="font-weight: 800; font-size: 14px; color: #60a5fa; display: flex; align-items: center; gap: 6px;">
                <span>✏️</span> Editing Crew ${this.escapeHtml(crew.jobNumber)}
              </div>
              <div style="display: flex; gap: 6px;">
                <button class="btn btn-xs btn-secondary" onclick="window.sheetNavigator.cancelCrewCardEdit()" style="padding: 3px 8px; font-size: 11px;">
                  Cancel
                </button>
                <button class="btn btn-xs btn-primary" onclick="window.sheetNavigator.saveCrewCardEdit('${this.escapeJs(crew.baseJob)}')" style="padding: 3px 10px; font-size: 11px; background: #2563eb; font-weight: 700;">
                  💾 Save
                </button>
              </div>
            </div>

            <!-- Form Fields -->
            <div style="display: flex; flex-direction: column; gap: 10px; margin-bottom: 12px;">
              <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px;">
                <div>
                  <label style="font-size: 10.5px; font-weight: 700; color: var(--text-muted); display: block; margin-bottom: 3px;">📍 Location</label>
                  <input type="text" id="edit-crew-loc-${this.escapeHtml(crew.baseJob)}" value="${this.escapeHtml(crew.location)}" list="dl-crew-locations"
                         style="width: 100%; box-sizing: border-box; padding: 5px 8px; font-size: 12px; background: var(--bg-primary); border: 1px solid var(--border-color); border-radius: 4px; color: var(--text-primary);">
                </div>
                <div>
                  <label style="font-size: 10.5px; font-weight: 700; color: var(--text-muted); display: block; margin-bottom: 3px;">Status</label>
                  <select id="edit-crew-status-${this.escapeHtml(crew.baseJob)}"
                          style="width: 100%; box-sizing: border-box; padding: 5px 8px; font-size: 12px; background: var(--bg-primary); border: 1px solid var(--border-color); border-radius: 4px; color: var(--text-primary);">
                    <option value="Active" ${crew.status === 'Active' ? 'selected' : ''}>🟢 Active</option>
                    <option value="Pending Start" ${crew.status === 'Pending Start' ? 'selected' : ''}>🟡 Pending Start</option>
                    <option value="On Hold" ${crew.status === 'On Hold' ? 'selected' : ''}>⏸️ On Hold</option>
                    <option value="Completed" ${crew.status === 'Completed' ? 'selected' : ''}>🏁 Completed</option>
                  </select>
                </div>
                <div>
                  <label style="font-size: 10.5px; font-weight: 700; color: var(--text-muted); display: block; margin-bottom: 3px;">Discipline / Type</label>
                  <select id="edit-crew-type-${this.escapeHtml(crew.baseJob)}"
                          style="width: 100%; box-sizing: border-box; padding: 5px 8px; font-size: 12px; background: var(--bg-primary); border: 1px solid var(--border-color); border-radius: 4px; color: var(--text-primary);">
                    <option value="Electric" ${crew.crewType === 'Electric' ? 'selected' : ''}>⚡ Electric</option>
                    <option value="Substation" ${crew.crewType === 'Substation' ? 'selected' : ''}>🏗️ Substation</option>
                    <option value="Gas" ${crew.crewType === 'Gas' ? 'selected' : ''}>⛽ Gas</option>
                    <option value="Office" ${crew.crewType === 'Office' ? 'selected' : ''}>🏢 Office</option>
                    <option value="Mechanic" ${crew.crewType === 'Mechanic' ? 'selected' : ''}>🔧 Mechanic</option>
                  </select>
                </div>
              </div>

              <div>
                <label style="font-size: 10.5px; font-weight: 700; color: var(--text-muted); display: block; margin-bottom: 3px;">Job Name / Site Description</label>
                <input type="text" id="edit-crew-jobname-${this.escapeHtml(crew.baseJob)}" value="${this.escapeHtml(crew.jobName)}" placeholder="e.g. Belgrade Dock, Montana Ave Rebuild"
                       style="width: 100%; box-sizing: border-box; padding: 5px 8px; font-size: 12px; background: var(--bg-primary); border: 1px solid var(--border-color); border-radius: 4px; color: var(--text-primary);">
              </div>

              <div>
                <label style="font-size: 10.5px; font-weight: 700; color: var(--text-muted); display: block; margin-bottom: 3px;">👑 Crew Foreman</label>
                <select id="edit-crew-foreman-${this.escapeHtml(crew.baseJob)}"
                        style="width: 100%; box-sizing: border-box; padding: 5px 8px; font-size: 12px; background: var(--bg-primary); border: 1px solid var(--border-color); border-radius: 4px; color: var(--text-primary);">
                  <option value="">(None designated)</option>
                  <optgroup label="Crew Members">
                    ${crew.members.map(m => `<option value="${this.escapeHtml(m.name)}" ${crew.nameMatchesForeman(m, crew.foreman) ? 'selected' : ''}>👑 ${this.escapeHtml(m.name)} (${this.escapeHtml(m.classification || 'Crew')})</option>`).join('')}
                  </optgroup>
                  <optgroup label="Other Active Employees">
                    ${allActiveEmployees.filter(a => !crew.members.some(m => m.name.toLowerCase() === a.name.toLowerCase())).map(a => `<option value="${this.escapeHtml(a.name)}" ${a.name.toLowerCase() === (crew.foreman || '').toLowerCase() ? 'selected' : ''}>${this.escapeHtml(a.name)}</option>`).join('')}
                  </optgroup>
                </select>
              </div>

              <div>
                <label style="font-size: 10.5px; font-weight: 700; color: var(--text-muted); display: block; margin-bottom: 3px;">Work Schedule Preset</label>
                <select id="edit-crew-sched-${this.escapeHtml(crew.baseJob)}" onchange="window.sheetNavigator.handleSchedulePresetChange('${this.escapeJs(crew.baseJob)}', this.value)"
                        style="width: 100%; box-sizing: border-box; padding: 5px 8px; font-size: 12px; background: var(--bg-primary); border: 1px solid var(--border-color); border-radius: 4px; color: var(--text-primary);">
                  <option value="Mon-Thu (4 10s)" ${crew.schedule.includes('Mon-Thu') ? 'selected' : ''}>Mon-Thu (4 10s)</option>
                  <option value="Tue-Fri (4 10s)" ${crew.schedule.includes('Tue-Fri') ? 'selected' : ''}>Tue-Fri (4 10s)</option>
                  <option value="Fri-Sat Weekend" ${crew.schedule.includes('Fri-Sat') ? 'selected' : ''}>Fri-Sat Weekend</option>
                  <option value="Mon-Fri (5 8s)" ${crew.schedule.includes('Mon-Fri') ? 'selected' : ''}>Mon-Fri (5 8s)</option>
                  <option value="Custom" ${!crew.schedule.includes('Mon-Thu') && !crew.schedule.includes('Tue-Fri') && !crew.schedule.includes('Fri-Sat') && !crew.schedule.includes('Mon-Fri') ? 'selected' : ''}>Custom Schedule</option>
                </select>
              </div>

              <div>
                <label style="font-size: 10.5px; font-weight: 700; color: var(--text-muted); display: block; margin-bottom: 3px;">Working Days (checked = working, unchecked = off)</label>
                <div style="display: flex; gap: 8px; flex-wrap: wrap; background: var(--bg-primary); padding: 8px; border-radius: 4px; border: 1px solid var(--border-color);">
                  ${[
                    { key: 'Mon', label: 'Mon', checked: !crew.isSkipMon },
                    { key: 'Tue', label: 'Tue', checked: !crew.isSkipTue },
                    { key: 'Wed', label: 'Wed', checked: !crew.isSkipWed },
                    { key: 'Thu', label: 'Thu', checked: !crew.isSkipThu },
                    { key: 'Fri', label: 'Fri', checked: !crew.isSkipFri },
                    { key: 'Sat', label: 'Sat', checked: !crew.isSkipSat },
                    { key: 'Sun', label: 'Sun', checked: !crew.isSkipSun }
                  ].map(d => `
                    <label style="display: inline-flex; align-items: center; gap: 3px; font-size: 11px; cursor: pointer; color: var(--text-primary);">
                      <input type="checkbox" id="edit-work-${d.key}-${this.escapeHtml(crew.baseJob)}" ${d.checked ? 'checked' : ''}>
                      <span>${d.label}</span>
                    </label>
                  `).join('')}
                </div>
              </div>

              <div style="display: flex; gap: 14px; background: var(--bg-primary); padding: 8px; border-radius: 4px; border: 1px solid var(--border-color); flex-wrap: wrap;">
                <label style="display: inline-flex; align-items: center; gap: 5px; font-size: 11px; cursor: pointer; color: var(--text-primary);">
                  <input type="checkbox" id="edit-skip-mtg-${this.escapeHtml(crew.baseJob)}" ${crew.skipMtg ? 'checked' : ''}>
                  <span>Skip Safety Meeting</span>
                </label>
                <label style="display: inline-flex; align-items: center; gap: 5px; font-size: 11px; cursor: pointer; color: var(--text-primary);">
                  <input type="checkbox" id="edit-skip-chk-${this.escapeHtml(crew.baseJob)}" ${crew.skipChk ? 'checked' : ''}>
                  <span>Skip Monthly Checklist</span>
                </label>
              </div>
            </div>

            <!-- Member List inside edit mode -->
            <div style="border-top: 1px solid var(--border-color); padding-top: 10px;">
              <div style="font-size: 11px; font-weight: 700; color: var(--text-muted); margin-bottom: 6px;">
                Crew Members (${crew.members.length})${(() => {
                  const pCount = crew.members.filter(m => m.isPending).length;
                  return pCount > 0 ? ` <span style="color: #fbbf24; font-weight: 700;">(${pCount} pending)</span>` : '';
                })()}:
              </div>
              ${crew.members.length > 0 ? crew.members.map(e => renderMemberRow(e, crew.nameMatchesForeman(e, crew.foreman), crew.baseJob)).join('') : '<div style="color: var(--text-muted); font-size: 12px; font-style: italic;">No members</div>'}
            </div>
          </div>
        `;
      }

      // STANDARD VIEW MODE
      return `
        <div class="crew-card field-crew-card"
             data-crew-job="${this.escapeHtml(crew.baseJob)}"
             style="background: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: 8px; padding: 14px; box-shadow: 0 1px 3px rgba(0,0,0,0.2); display: flex; flex-direction: column; transition: all 0.2s ease;">
          <!-- Card Header -->
          <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 10px; border-bottom: 1px solid var(--border-color); padding-bottom: 8px; gap: 6px;">
            <div style="flex: 1; min-width: 0;">
              <div style="font-weight: 800; font-size: 14px; color: var(--text-primary); display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                <span title="Crew Base Location">📍 ${this.escapeHtml(crew.location)}</span>
                <span style="font-family: monospace; font-weight: 800; font-size: 13px; color: #60a5fa; background: var(--bg-primary); border: 1px solid var(--border-color); border-radius: 4px; padding: 2px 6px; white-space: nowrap;">
                  ${this.escapeHtml(crew.jobNumber)}
                </span>
                ${getStatusBadge(crew.status)}
                ${getCrewTypeBadge(crew.crewType, crew.baseJob)}
              </div>
              ${crew.jobName ? `
                <div style="font-size: 11px; color: var(--text-muted); margin-top: 3px; font-weight: 500;">
                  ${this.escapeHtml(crew.jobName)}
                </div>
              ` : ''}
            </div>

            <!-- Header Actions -->
            <div style="display: flex; align-items: center; gap: 5px; flex-shrink: 0; flex-wrap: wrap; justify-content: flex-end;">
              ${crew.hasNumberingIssue ? `
                <span class="badge" style="background: rgba(239, 68, 68, 0.15); color: #f87171; border: 1px solid rgba(239, 68, 68, 0.35); font-size: 9.5px; font-weight: 700; padding: 2px 5px; border-radius: 4px;" title="Duplicate suffixes (${crew.duplicateSuffixes.join(', ')}) or sequence gaps detected!">
                  ⚠️ Numbering Issue
                </span>
                <button class="btn btn-xs" style="background: rgba(245, 158, 11, 0.2); color: #fbbf24; border: 1px solid rgba(245, 158, 11, 0.4); font-size: 9.5px; font-weight: 700; padding: 2px 6px; border-radius: 4px; cursor: pointer;"
                        onclick="window.sheetNavigator.fixCrewNumbering('${this.escapeJs(crew.baseJob)}')"
                        title="Automatically fix numbering gaps and assign sequential .1 to .N slots">
                  🔄 Renumber
                </button>
              ` : ''}

              <button class="btn btn-xs btn-secondary" style="font-size: 10.5px; padding: 2px 7px; border-radius: 4px; display: inline-flex; align-items: center; gap: 3px; cursor: pointer;"
                      onclick="window.sheetNavigator.startCrewCardEdit('${this.escapeJs(crew.baseJob)}')"
                      title="Edit crew fields (location, status, foreman, schedule, job name)">
                <span>✏️</span> Edit
              </button>

              <span class="badge" style="background: var(--bg-primary); color: var(--text-muted); font-size: 11px; font-weight: 700; padding: 2px 7px; border-radius: 12px; border: 1px solid var(--border-color); flex-shrink: 0;">
                ${crew.members.length} ${crew.members.length === 1 ? 'member' : 'members'}${(() => {
                  const pCount = crew.members.filter(m => m.isPending).length;
                  return pCount > 0 ? ` <span style="color: #fbbf24; font-weight: 700;">(${pCount} pending)</span>` : '';
                })()}
              </span>
            </div>
          </div>

          <!-- Schedule & Workdays Bar -->
          <div style="background: var(--bg-primary); border-radius: 6px; padding: 8px 10px; margin-bottom: 10px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
              <span style="font-size: 11px; font-weight: 700; color: var(--text-muted);">Schedule:</span>
              <span style="font-size: 11px; font-weight: 700; color: #93c5fd; background: rgba(59, 130, 246, 0.1); padding: 1px 6px; border-radius: 3px; border: 1px solid rgba(59, 130, 246, 0.2);">
                ${this.escapeHtml(crew.schedule)}
              </span>
            </div>
            <div style="display: flex; align-items: center; justify-content: space-between; gap: 4px;">
              <!-- Clickable Day Pills -->
              <div style="display: flex; gap: 3px;">
                ${dayPills.map(dp => `
                  <div style="width: 24px; height: 22px; font-size: 9.5px; font-weight: 700; border-radius: 4px; border: 1px solid ${dp.isWork ? '#10b981' : '#334155'}; background: ${dp.isWork ? '#10b981' : 'var(--bg-secondary)'}; color: ${dp.isWork ? '#ffffff' : 'var(--text-muted)'}; display: flex; align-items: center; justify-content: center; cursor: pointer; transition: transform 0.1s ease;"
                       onclick="window.sheetNavigator.toggleCrewDaySkip('${this.escapeJs(crew.baseJob)}', '${dp.colKey}')"
                       title="${dp.isWork ? 'Working day (Click to toggle skip)' : 'Skip / Off day (Click to toggle work)'}"
                       onmouseover="this.style.transform='scale(1.1)';" onmouseout="this.style.transform='scale(1)';">
                    ${dp.label}
                  </div>
                `).join('')}
              </div>
              <!-- Clickable Mtg & Chk pills -->
              <div style="display: flex; gap: 4px;">
                <span style="padding: 2px 5px; font-size: 9px; font-weight: 700; border-radius: 4px; border: 1px solid ${!crew.skipMtg ? '#3b82f6' : '#334155'}; background: ${!crew.skipMtg ? 'rgba(59, 130, 246, 0.2)' : 'var(--bg-secondary)'}; color: ${!crew.skipMtg ? '#60a5fa' : 'var(--text-muted)'}; cursor: pointer;"
                      onclick="window.sheetNavigator.toggleCrewMeetingSkip('${this.escapeJs(crew.baseJob)}')"
                      title="${!crew.skipMtg ? 'Safety Meeting Tracked (Click to toggle skip)' : 'Skip Safety Meeting (Click to enable tracking)'}">
                  Mtg ${!crew.skipMtg ? '✓' : '✗'}
                </span>
                <span style="padding: 2px 5px; font-size: 9px; font-weight: 700; border-radius: 4px; border: 1px solid ${!crew.skipChk ? '#8b5cf6' : '#334155'}; background: ${!crew.skipChk ? 'rgba(139, 92, 246, 0.2)' : 'var(--bg-secondary)'}; color: ${!crew.skipChk ? '#c084fc' : 'var(--text-muted)'}; cursor: pointer;"
                      onclick="window.sheetNavigator.toggleCrewChecklistSkip('${this.escapeJs(crew.baseJob)}')"
                      title="${!crew.skipChk ? 'Monthly Checklist Tracked (Click to toggle skip)' : 'Skip Monthly Checklist (Click to enable tracking)'}">
                  Chk ${!crew.skipChk ? '✓' : '✗'}
                </span>
              </div>
            </div>
          </div>

          <!-- Foreman Row -->
          <div style="margin-bottom: 8px; display: flex; align-items: center; justify-content: space-between; gap: 6px; font-size: 11.5px; background: rgba(255,255,255,0.02); padding: 4px 8px; border-radius: 4px; border: 1px solid rgba(255,255,255,0.04);">
            <div style="display: flex; align-items: center; gap: 6px;">
              <span style="font-weight: 700; color: var(--text-muted);">Foreman:</span>
              ${crew.foreman ? `
                <a href="javascript:void(0)" onclick="window.employeeProfileEngine.openProfileModal('${this.escapeJs(crew.foreman)}')"
                   style="font-weight: 700; color: #f472b6; text-decoration: none; cursor: pointer; display: inline-flex; align-items: center; gap: 4px;"
                   onmouseover="this.style.textDecoration='underline';" onmouseout="this.style.textDecoration='none';"
                   title="Open Profile for Foreman ${this.escapeHtml(crew.foreman)}">
                  <span>👑</span>
                  <span>${this.escapeHtml(crew.foreman)}</span>
                </a>
              ` : `<span style="color: var(--text-muted); font-style: italic;">(None designated)</span>`}
            </div>
            <button class="btn btn-xs" style="background: transparent; border: 1px solid rgba(255,255,255,0.1); color: var(--text-muted); font-size: 10px; padding: 1px 5px; border-radius: 3px; cursor: pointer;"
                    onclick="window.sheetNavigator.promptChangeForeman('${this.escapeJs(crew.baseJob)}', '${this.escapeJs(crew.foreman || '')}')"
                    title="Designate a foreman for this crew">
              Change
            </button>
          </div>

          <!-- Member List (Drop Zone) -->
          <div class="crew-drop-zone" data-crew-job="${this.escapeHtml(crew.baseJob)}" style="flex: 1; font-size: 12px; min-height: 48px; border-radius: 6px; padding: 2px;">
            ${crew.members.length > 0 ? crew.members.map(e => {
              const isLead = crew.nameMatchesForeman ? crew.nameMatchesForeman(e, crew.foreman) : (crew.foreman && e.name.toLowerCase() === crew.foreman.toLowerCase());
              return renderMemberRow(e, isLead, crew.baseJob, Boolean(e.isSecondaryMember));
            }).join('') : `
              <div style="color: #94a3b8; font-size: 12px; font-style: italic; padding: 16px 6px; text-align: center; background: rgba(0,0,0,0.15); border-radius: 6px; border: 1px dashed rgba(255,255,255,0.1);">
                Drop employees here to assign
              </div>
            `}
          </div>
        </div>
      `;
    };

    // Assemble final container HTML
    container.innerHTML = `
      <div class="employee-cards-wrapper" style="height: 100%; overflow-y: auto; padding: 16px; box-sizing: border-box;">
        
        <!-- Summary Stats Banner -->
        <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 10px; background: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: 8px; padding: 10px 16px; margin-bottom: 18px;">
          <div style="display: flex; align-items: center; gap: 14px; flex-wrap: wrap; font-size: 12.5px; font-weight: 700;">
            <span style="color: var(--text-primary); display: flex; align-items: center; gap: 5px;">
              👥 <strong style="color: #60a5fa;">${totalActiveCount}</strong> Active Employees
            </span>
            <span style="color: var(--text-muted);">|</span>
            <span style="color: var(--text-primary); display: flex; align-items: center; gap: 5px;">
              🚜 <strong style="color: #34d399;">${crewCards.length}</strong> Field Crews
            </span>
            <span style="color: var(--text-muted);">|</span>
            <span style="color: #fbbf24; display: flex; align-items: center; gap: 5px;">
              🏖️ <strong>${vacationList.length}</strong> Vacation
            </span>
            <span style="color: #60a5fa; display: flex; align-items: center; gap: 5px;">
              🌴 <strong>${leaveList.length}</strong> Leave
            </span>
            <span style="color: #34d399; display: flex; align-items: center; gap: 5px;">
              🩺 <strong>${lightDutyList.length}</strong> Light Duty
            </span>
            ${medicalList.length > 0 ? `
              <span style="color: #f472b6; display: flex; align-items: center; gap: 5px;">
                🏥 <strong>${medicalList.length}</strong> Medical
              </span>
            ` : ''}
          </div>
          <div style="font-size: 11px; color: var(--text-muted);">
            💡 <em>Drag employees between crews to reassign • Click ✏️ Edit on any card to update schedule, location, or foreman</em>
          </div>
        </div>

        <!-- Datalist for Location Autocomplete -->
        <datalist id="dl-crew-locations">
          <option value="Helena">
          <option value="Great Falls">
          <option value="Bozeman">
          <option value="Billings">
          <option value="Butte">
          <option value="Missoula">
          <option value="Kalispell">
          <option value="Melville">
          <option value="Three Rivers">
          <option value="Gold Creek">
          <option value="Livingston">
          <option value="Lewistown">
        </datalist>

        <!-- 1. Dedicated Status Cards (Vacation, Leave, Light Duty, Medical) -->
        <div style="margin-bottom: 20px;">
          <div style="font-size: 12px; font-weight: 800; text-transform: uppercase; color: var(--text-muted); letter-spacing: 0.5px; margin-bottom: 10px; display: flex; align-items: center; gap: 6px;">
            <span>📋</span> Status Assignments
          </div>
          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 14px;">
            ${renderStatusCard('Vacation', '🏖️', '#fbbf24', 'rgba(245, 158, 11, 0.4)', 'rgba(245, 158, 11, 0.15)', vacationList, 'No employees currently on Vacation')}
            ${renderStatusCard('Leave', '🌴', '#60a5fa', 'rgba(59, 130, 246, 0.4)', 'rgba(59, 130, 246, 0.15)', leaveList, 'No employees currently on Leave')}
            ${renderStatusCard('Light Duty', '🩺', '#34d399', 'rgba(16, 185, 129, 0.4)', 'rgba(16, 185, 129, 0.15)', lightDutyList, 'No employees currently on Light Duty')}
            ${medicalList.length > 0 ? renderStatusCard('Medical', '🏥', '#f472b6', 'rgba(244, 114, 182, 0.4)', 'rgba(244, 114, 182, 0.15)', medicalList, 'No employees currently on Medical') : ''}
          </div>
        </div>

        <!-- 2. Active Field Crews -->
        <div>
          <div style="font-size: 12px; font-weight: 800; text-transform: uppercase; color: var(--text-muted); letter-spacing: 0.5px; margin-bottom: 10px; display: flex; align-items: center; gap: 6px;">
            <span>🚜</span> Field Crews (${crewCards.length})
          </div>
          ${crewCards.length > 0 ? `
            <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(360px, 1fr)); gap: 16px;">
              ${crewCards.map(c => renderFieldCrewCard(c)).join('')}
            </div>
          ` : `
            <div style="padding: 40px; text-align: center; color: var(--text-muted); background: var(--bg-secondary); border-radius: 8px; border: 1px solid var(--border-color);">
              <div style="font-size: 32px; margin-bottom: 10px;">🔍</div>
              <h4 style="color: var(--text-primary); margin: 0 0 6px 0;">No field crews found</h4>
              <p style="margin: 0; font-size: 13px;">Try clearing your search query to view all active crews.</p>
            </div>
          `}
        </div>

      </div>
    `;

    // Attach interactive drag & drop and card events
    this.attachCrewCardInteractiveHandlers(container);
  }

  /**
   * Attaches drag & drop and interaction handlers across all crew cards and member rows
   */
  attachCrewCardInteractiveHandlers(container) {
    if (!container) return;

    // 1. Drag source setup on all member rows
    container.querySelectorAll('.crew-member-row[draggable="true"]').forEach(row => {
      row.addEventListener('dragstart', (e) => {
        const dragData = {
          empName: row.dataset.empName,
          fromSlot: row.dataset.jobNumber,
          fromBaseJob: row.dataset.baseJob,
          isSecondary: row.dataset.isSecondary === 'true',
          primaryJob: row.dataset.primaryJob,
          sourceLoc: row.dataset.location
        };
        e.dataTransfer.setData('application/json', JSON.stringify(dragData));
        e.dataTransfer.effectAllowed = 'move';
        row.style.opacity = '0.35';
        window._activeCrewDragData = dragData;
      });

      row.addEventListener('dragend', () => {
        row.style.opacity = '1';
        window._activeCrewDragData = null;
        container.querySelectorAll('.field-crew-card, .status-crew-card').forEach(c => {
          c.style.borderColor = '';
          c.style.background = '';
          c.style.boxShadow = '';
        });
      });
    });

    // 2. Drop target setup on Field Crew Cards
    container.querySelectorAll('.field-crew-card').forEach(card => {
      const destBaseJob = card.dataset.crewJob;
      if (!destBaseJob) return;

      card.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        card.style.borderColor = '#3b82f6';
        card.style.background = 'rgba(59, 130, 246, 0.08)';
        card.style.boxShadow = '0 0 12px rgba(59, 130, 246, 0.35)';
      });

      card.addEventListener('dragleave', (e) => {
        if (!card.contains(e.relatedTarget)) {
          card.style.borderColor = '';
          card.style.background = '';
          card.style.boxShadow = '';
        }
      });

      card.addEventListener('drop', async (e) => {
        e.preventDefault();
        card.style.borderColor = '';
        card.style.background = '';
        card.style.boxShadow = '';

        if (window.currentRoleMode === 'view_only') return;

        let data = null;
        try {
          const raw = e.dataTransfer.getData('application/json');
          if (raw) data = JSON.parse(raw);
        } catch {
          // Ignore drag data parse error
        }
        if (!data && window._activeCrewDragData) data = window._activeCrewDragData;

        if (data) {
          await this.handleCrewCardDrop(data, destBaseJob);
        }
      });
    });

    // 3. Drop target setup on Status Cards (Vacation, Leave, Light Duty, Medical)
    container.querySelectorAll('.status-crew-card').forEach(card => {
      const statusType = card.dataset.statusType;
      if (!statusType) return;

      card.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        card.style.borderColor = '#f59e0b';
        card.style.background = 'rgba(245, 158, 11, 0.08)';
      });

      card.addEventListener('dragleave', (e) => {
        if (!card.contains(e.relatedTarget)) {
          card.style.borderColor = '';
          card.style.background = '';
        }
      });

      card.addEventListener('drop', async (e) => {
        e.preventDefault();
        card.style.borderColor = '';
        card.style.background = '';

        if (window.currentRoleMode === 'view_only') return;

        let data = null;
        try {
          const raw = e.dataTransfer.getData('application/json');
          if (raw) data = JSON.parse(raw);
        } catch {
          // Ignore drag data parse error
        }
        if (!data && window._activeCrewDragData) data = window._activeCrewDragData;

        if (data) {
          await this.handleStatusCardDrop(data, statusType);
        }
      });
    });
  }

  /**
   * Handles dropping an employee onto a destination field crew card
   */
  async handleCrewCardDrop(dragData, destBaseJob) {
    if (!dragData || !destBaseJob) return;
    const { empName, fromBaseJob, fromSlot, isSecondary } = dragData;

    if (fromBaseJob === destBaseJob) {
      if (typeof window.showToast === 'function') {
        window.showToast(`${empName} is already on crew ${destBaseJob}.`, 'info');
      }
      return;
    }

    const empTable = this.db.getTable('employees');
    const jtTable = this.db.getTable('job_tracking');
    if (!empTable || !jtTable) return;

    // Find destination Job Tracking row & Location
    const destJt = (jtTable.rows || []).find(j => {
      const jn = String(j['Job Number'] || j['Job #'] || '').trim();
      return jn === destBaseJob || jn.replace(/\.\d+.*$/, '').trim() === destBaseJob;
    });
    const destLoc = (destJt && destJt['Location']) ? String(destJt['Location']).trim() : 'Helena';

    const prevEmpNames = this.getPreviousEmployeeNamesSet();

    // Calculate destination slot (.N + 1 or lowest missing slot starting at .1) for ACTIVE members only
    const destMembers = (empTable.rows || []).filter(e => {
      if (!this.isEmployeeActive(e, prevEmpNames)) return false;
      const jn = String(e['Job Number'] || e['Job #'] || '').trim();
      return jn === destBaseJob || jn.startsWith(destBaseJob + '.');
    });

    const destSuffixes = destMembers.map(e => {
      const m = String(e['Job Number'] || e['Job #'] || '').match(/\.(\d+)/);
      return m ? parseInt(m[1], 10) : 0;
    }).filter(n => n > 0);

    let nextSuffix = 1;
    while (destSuffixes.includes(nextSuffix)) {
      nextSuffix++;
    }
    const newSlot = `${destBaseJob}.${nextSuffix}`;

    // Source crew renumbering candidates among ACTIVE members
    let membersToRenumber = [];
    let oldSourceSize = 0;
    let newSourceSize = 0;

    if (!isSecondary && fromBaseJob && fromBaseJob !== 'Vacation' && fromBaseJob !== 'Leave' && fromBaseJob !== 'Light Duty') {
      const sourceMembers = (empTable.rows || []).filter(e => {
        if (!this.isEmployeeActive(e, prevEmpNames)) return false;
        const jn = String(e['Job Number'] || e['Job #'] || '').trim();
        return jn === fromBaseJob || jn.startsWith(fromBaseJob + '.');
      });
      oldSourceSize = sourceMembers.length;
      newSourceSize = Math.max(0, oldSourceSize - 1);

      const fromMatch = String(fromSlot || '').match(/\.(\d+)/);
      const fromNum = fromMatch ? parseInt(fromMatch[1], 10) : 999;

      sourceMembers.forEach(m => {
        const mName = String(m['Employee Name'] || m['Name'] || '').trim();
        if (mName.toLowerCase() === empName.toLowerCase()) return;
        const sMatch = String(m['Job Number'] || m['Job #'] || '').match(/\.(\d+)/);
        if (sMatch) {
          const sNum = parseInt(sMatch[1], 10);
          if (sNum > fromNum) {
            membersToRenumber.push({
              emp: m,
              oldSlot: String(m['Job Number'] || m['Job #'] || ''),
              newSlot: `${fromBaseJob}.${sNum - 1}`
            });
          }
        }
      });
    }

    // Equipment items affected
    const affectedEquipment = [];
    const categories = ['gloves', 'sleeves', 'blankets', 'macks', 'hv_testers', 'phasing_sets', 'aed', 'grounds', 'hot_sticks'];
    const cleanEmp = empName.toLowerCase().trim();

    categories.forEach(key => {
      const table = this.db.getTable(key);
      if (!table || !table.rows) return;
      table.rows.forEach(r => {
        const assigned = String(r['Assigned To'] || '').toLowerCase().trim();
        if (assigned === cleanEmp) {
          const curItemLoc = String(r['Location'] || '').trim();
          if (curItemLoc.toLowerCase() !== destLoc.toLowerCase()) {
            affectedEquipment.push({
              tableKey: key,
              sheetName: table.name || key,
              row: r,
              oldLoc: curItemLoc,
              newLoc: destLoc,
              itemNum: r['Item #'] || r['Serial #'] || r['Glove'] || r['Sleeve'] || r['Blanket'] || r['ESL ID'] || ''
            });
          }
        }
      });
    });

    // Show Confirmation Modal
    this.showCrewReassignmentModal({
      dragData,
      destBaseJob,
      newSlot,
      destLoc,
      membersToRenumber,
      affectedEquipment,
      oldSourceSize,
      newSourceSize,
      oldDestSize: destMembers.length,
      newDestSize: destMembers.length + 1
    });
  }

  /**
   * Handles dropping an employee onto a dedicated status card (Vacation, Leave, Light Duty, Medical)
   */
  async handleStatusCardDrop(dragData, statusType) {
    if (!dragData || !statusType) return;
    const { empName, sourceLoc } = dragData;
    const empTable = this.db.getTable('employees');
    if (!empTable || !empTable.rows) return;

    const emp = empTable.rows.find(e => String(e['Employee Name'] || e['Name'] || '').trim().toLowerCase() === empName.toLowerCase());
    if (!emp) return;

    // Clean physical city
    let city = String(sourceLoc || emp['Location'] || '').replace(/\s*\([^)]*\)/g, '').trim();
    if (!city || city.toLowerCase() === 'unassigned' || city.toLowerCase() === 'previous employee') city = 'Helena';

    if (confirm(`Move ${empName} to ${statusType}?\n\nLocation: "${city}"\nStatus: "${statusType}"`)) {
      emp['Location'] = city;
      emp['Status'] = statusType;
      const locColIdx = (empTable.headers || []).findIndex(h => /^location$/i.test(h)) + 1;
      const statusColIdx = (empTable.headers || []).findIndex(h => /^status$/i.test(h)) + 1;
      const rIdx = emp._rowIdx || (empTable.rows.indexOf(emp) + 2);
      if (empTable.rawGrid && empTable.rawGrid[rIdx - 1]) {
        if (locColIdx > 0) empTable.rawGrid[rIdx - 1][locColIdx - 1] = city;
        if (statusColIdx > 0) empTable.rawGrid[rIdx - 1][statusColIdx - 1] = statusType;
      }

      await this.db.addMutation({
        action: 'UPDATE_ROW',
        sheetName: empTable.name || 'Employees',
        tableKey: 'employees',
        row: rIdx,
        itemIdentifier: empName,
        updatedFields: {
          'Location': city,
          'Status': statusType
        }
      });

      await this.db.persistSnapshot(this.db.snapshot);
      this.renderCurrentSheet();
      if (typeof window.showToast === 'function') {
        window.showToast(`🏖️ Assigned ${empName} to ${statusType} (${city}).`);
      }
    }
  }

  /**
   * Displays the confirmation modal with detailed cascading updates before committing a move
   */
  showCrewReassignmentModal(params) {
    const { dragData, destBaseJob, newSlot, destLoc, membersToRenumber, affectedEquipment, oldSourceSize, newSourceSize, oldDestSize, newDestSize } = params;
    const empName = dragData.empName;
    const fromBaseJob = dragData.fromBaseJob;
    const fromSlot = dragData.fromSlot;

    const modalId = 'crew-reassign-confirm-modal';
    const oldModal = document.getElementById(modalId);
    if (oldModal) oldModal.remove();

    const modal = document.createElement('div');
    modal.id = modalId;
    modal.className = 'modal active';
    modal.style.cssText = 'position: fixed; inset: 0; background: rgba(0,0,0,0.75); display: flex; align-items: center; justify-content: center; z-index: 1060; padding: 20px;';

    modal.innerHTML = `
      <div style="background: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: 10px; max-width: 540px; width: 100%; box-shadow: 0 15px 35px rgba(0,0,0,0.6); overflow: hidden; display: flex; flex-direction: column; max-height: 90vh;">
        <!-- Header -->
        <div style="padding: 16px 20px; border-bottom: 1px solid var(--border-color); background: var(--bg-primary); display: flex; justify-content: space-between; align-items: center;">
          <div style="font-weight: 800; font-size: 16px; color: var(--text-primary); display: flex; align-items: center; gap: 8px;">
            <span>🔄</span> Reassign Crew Member
          </div>
          <button class="btn btn-xs btn-secondary" onclick="document.getElementById('${modalId}').remove()" style="cursor: pointer;">✖</button>
        </div>

        <!-- Body -->
        <div style="padding: 20px; overflow-y: auto; flex: 1;">
          <!-- Move Summary Card -->
          <div style="background: var(--bg-primary); border: 1px solid #3b82f6; border-radius: 8px; padding: 14px; margin-bottom: 16px;">
            <div style="font-size: 14px; font-weight: 800; color: #60a5fa; margin-bottom: 8px;">
              Moving <u>${this.escapeHtml(empName)}</u>
            </div>
            <div style="display: grid; grid-template-columns: 1fr auto 1fr; gap: 8px; align-items: center; text-align: center; font-size: 13px;">
              <div style="background: var(--bg-secondary); padding: 8px; border-radius: 6px; border: 1px solid var(--border-color);">
                <div style="font-size: 10.5px; font-weight: 700; color: var(--text-muted); margin-bottom: 2px;">FROM CREW</div>
                <div style="font-weight: 800; color: #94a3b8; font-family: monospace;">${this.escapeHtml(fromSlot)}</div>
                <div style="font-size: 11px; color: var(--text-muted);">${this.escapeHtml(dragData.sourceLoc || 'Helena')}</div>
              </div>
              <div style="font-size: 18px; color: #60a5fa; font-weight: 800;">➔</div>
              <div style="background: rgba(16, 185, 129, 0.1); padding: 8px; border-radius: 6px; border: 1px solid rgba(16, 185, 129, 0.3);">
                <div style="font-size: 10.5px; font-weight: 700; color: #34d399; margin-bottom: 2px;">TO CREW</div>
                <div style="font-weight: 800; color: #34d399; font-family: monospace;">${this.escapeHtml(newSlot)}</div>
                <div style="font-size: 11px; color: #93c5fd;">📍 ${this.escapeHtml(destLoc)}</div>
              </div>
            </div>
          </div>

          <!-- Cascading Changes List -->
          <div style="font-size: 12px; font-weight: 800; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 8px;">
            Cascading Updates:
          </div>

          <div style="display: flex; flex-direction: column; gap: 10px; font-size: 12.5px;">
            <!-- Employee Table Updates -->
            <div style="background: rgba(255,255,255,0.02); border: 1px solid var(--border-color); border-radius: 6px; padding: 10px 12px;">
              <div style="font-weight: 700; color: var(--text-primary); margin-bottom: 4px;">
                👥 Employees Table:
              </div>
              <div style="color: var(--text-muted); font-size: 12px; margin-left: 12px;">
                • <strong>${this.escapeHtml(empName)}</strong>: Job Number ➔ <code>${this.escapeHtml(newSlot)}</code>, Location ➔ <code>${this.escapeHtml(destLoc)}</code>
              </div>
            </div>

            <!-- Job Tracking Updates -->
            <div style="background: rgba(255,255,255,0.02); border: 1px solid var(--border-color); border-radius: 6px; padding: 10px 12px;">
              <div style="font-weight: 700; color: var(--text-primary); margin-bottom: 4px;">
                📋 Job Tracking Crew Sizes:
              </div>
              <div style="color: var(--text-muted); font-size: 12px; margin-left: 12px;">
                ${fromBaseJob ? `• Crew <strong>${this.escapeHtml(fromBaseJob)}</strong>: Crew Size ${oldSourceSize} ➔ ${newSourceSize}<br>` : ''}
                • Crew <strong>${this.escapeHtml(destBaseJob)}</strong>: Crew Size ${oldDestSize} ➔ ${newDestSize}
              </div>
            </div>

            <!-- Source Crew Renumbering -->
            ${membersToRenumber.length > 0 ? `
              <div style="background: rgba(245, 158, 11, 0.05); border: 1px solid rgba(245, 158, 11, 0.25); border-radius: 6px; padding: 10px 12px;">
                <label style="display: flex; align-items: flex-start; gap: 8px; cursor: pointer;">
                  <input type="checkbox" id="chk-renumber-source" checked style="margin-top: 2px;">
                  <div>
                    <div style="font-weight: 700; color: #fbbf24;">
                      🔄 Renumber remaining members of ${this.escapeHtml(fromBaseJob)} to close gap (${membersToRenumber.length}):
                    </div>
                    <div style="color: var(--text-muted); font-size: 11.5px; margin-top: 4px;">
                      ${membersToRenumber.map(r => `• ${this.escapeHtml(r.emp['Employee Name'] || r.emp['Name'])}: <code>${r.oldSlot}</code> ➔ <code>${r.newSlot}</code>`).join('<br>')}
                    </div>
                  </div>
                </label>
              </div>
            ` : ''}

            <!-- Inventory Updates -->
            ${affectedEquipment.length > 0 ? `
              <div style="background: rgba(14, 165, 233, 0.05); border: 1px solid rgba(14, 165, 233, 0.25); border-radius: 6px; padding: 10px 12px;">
                <label style="display: flex; align-items: flex-start; gap: 8px; cursor: pointer;">
                  <input type="checkbox" id="chk-update-equipment" checked style="margin-top: 2px;">
                  <div>
                    <div style="font-weight: 700; color: #38bdf8;">
                      📦 Update assigned equipment Location to ${this.escapeHtml(destLoc)} (${affectedEquipment.length} item(s)):
                    </div>
                    <div style="color: var(--text-muted); font-size: 11.5px; margin-top: 4px; max-height: 100px; overflow-y: auto;">
                      ${affectedEquipment.map(item => `• ${this.escapeHtml(item.sheetName)} #${this.escapeHtml(item.itemNum)}: ${this.escapeHtml(item.oldLoc || 'Unknown')} ➔ ${this.escapeHtml(destLoc)}`).join('<br>')}
                    </div>
                  </div>
                </label>
              </div>
            ` : `
              <div style="color: var(--text-muted); font-size: 11.5px; font-style: italic;">
                📦 No assigned equipment found requiring a location change.
              </div>
            `}
          </div>
        </div>

        <!-- Footer -->
        <div style="padding: 14px 20px; border-top: 1px solid var(--border-color); background: var(--bg-primary); display: flex; justify-content: space-between; align-items: center;">
          <button class="btn btn-secondary" onclick="document.getElementById('${modalId}').remove()">
            Cancel
          </button>
          <button class="btn btn-primary" id="btn-execute-reassign" style="background: #2563eb; border-color: #2563eb; font-weight: 700; display: inline-flex; align-items: center; gap: 6px;">
            <span>⚡</span> Confirm & Apply Changes
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    document.getElementById('btn-execute-reassign')?.addEventListener('click', async () => {
      const doRenumber = document.getElementById('chk-renumber-source')?.checked ?? true;
      const doUpdateEquip = document.getElementById('chk-update-equipment')?.checked ?? true;
      modal.remove();
      await this.executeCrewReassignment(params, doRenumber, doUpdateEquip);
    });
  }

  /**
   * Executes the full cascading reassignment after user confirmation
   */
  async executeCrewReassignment(params, doRenumber, doUpdateEquip) {
    const { dragData, destBaseJob, newSlot, destLoc, membersToRenumber, affectedEquipment } = params;
    const empName = dragData.empName;
    const fromBaseJob = dragData.fromBaseJob;
    const isSecondary = dragData.isSecondary;

    const empTable = this.db.getTable('employees');
    const jtTable = this.db.getTable('job_tracking');
    if (!empTable || !jtTable) return;

    // 1. Update Moved Employee row
    const emp = empTable.rows.find(e => String(e['Employee Name'] || e['Name'] || '').trim().toLowerCase() === empName.toLowerCase());
    if (emp) {
      if (isSecondary) {
        const isReturningToPrimary = (destBaseJob === String(dragData.primaryJob || '').replace(/\.\d+.*$/, '').trim());
        const finalSec = isReturningToPrimary ? '' : newSlot;
        emp['Secondary Job Number'] = finalSec;
        if (emp['Secondary Job #']) emp['Secondary Job #'] = finalSec;

        const secColIdx = (empTable.headers || []).findIndex(h => /secondary\s*job/i.test(h)) + 1;
        const eRowIdx = emp._rowIdx || (empTable.rows.indexOf(emp) + 2);
        if (empTable.rawGrid && empTable.rawGrid[eRowIdx - 1] && secColIdx > 0) {
          empTable.rawGrid[eRowIdx - 1][secColIdx - 1] = finalSec;
        }

        await this.db.addMutation({
          action: 'UPDATE_CELL',
          sheetName: empTable.name || 'Employees',
          tableKey: 'employees',
          row: eRowIdx,
          col: secColIdx > 0 ? secColIdx : 5,
          header: 'Secondary Job Number',
          itemIdentifier: empName,
          value: finalSec
        });
      } else {
        emp['Job Number'] = newSlot;
        if (emp['Job #']) emp['Job #'] = newSlot;
        emp['Location'] = destLoc;
        emp['Status'] = 'Active';

        const jobColIdx = (empTable.headers || []).findIndex(h => /^(job\s*#|job\s*number)$/i.test(h)) + 1;
        const locColIdx = (empTable.headers || []).findIndex(h => /^location$/i.test(h)) + 1;
        const statusColIdx = (empTable.headers || []).findIndex(h => /^status$/i.test(h)) + 1;
        const eRowIdx = emp._rowIdx || (empTable.rows.indexOf(emp) + 2);

        if (empTable.rawGrid && empTable.rawGrid[eRowIdx - 1]) {
          if (jobColIdx > 0) empTable.rawGrid[eRowIdx - 1][jobColIdx - 1] = newSlot;
          if (locColIdx > 0) empTable.rawGrid[eRowIdx - 1][locColIdx - 1] = destLoc;
          if (statusColIdx > 0) empTable.rawGrid[eRowIdx - 1][statusColIdx - 1] = 'Active';
        }

        await this.db.addMutation({
          action: 'UPDATE_ROW',
          sheetName: empTable.name || 'Employees',
          tableKey: 'employees',
          itemIdentifier: empName,
          row: eRowIdx,
          updatedFields: {
            'Job Number': newSlot,
            'Location': destLoc,
            'Status': 'Active'
          }
        });
      }
    }

    // 2. Renumber remaining source members if selected
    if (doRenumber && membersToRenumber.length > 0) {
      const jobColIdx = (empTable.headers || []).findIndex(h => /^(job\s*#|job\s*number)$/i.test(h)) + 1;
      for (const r of membersToRenumber) {
        r.emp['Job Number'] = r.newSlot;
        if (r.emp['Job #']) r.emp['Job #'] = r.newSlot;
        const rRowIdx = r.emp._rowIdx || (empTable.rows.indexOf(r.emp) + 2);
        if (empTable.rawGrid && empTable.rawGrid[rRowIdx - 1] && jobColIdx > 0) {
          empTable.rawGrid[rRowIdx - 1][jobColIdx - 1] = r.newSlot;
        }

        await this.db.addMutation({
          action: 'UPDATE_CELL',
          sheetName: empTable.name || 'Employees',
          tableKey: 'employees',
          row: rRowIdx,
          col: jobColIdx > 0 ? jobColIdx : 2,
          header: 'Job Number',
          itemIdentifier: String(r.emp['Employee Name'] || r.emp['Name'] || ''),
          oldValue: r.oldSlot,
          value: r.newSlot
        });
      }
    }

    // 3. Update Job Tracking Crew Sizes using actual active member counts
    if (jtTable.rows) {
      const sizeColIdx = (jtTable.headers || []).findIndex(h => /^crew\s*size$/i.test(h)) + 1;
      const prevEmpNames = this.getPreviousEmployeeNamesSet();

      // Source JT
      if (fromBaseJob && !isSecondary) {
        const sourceJt = jtTable.rows.find(j => {
          const jn = String(j['Job Number'] || j['Job #'] || '').trim();
          return jn === fromBaseJob || jn.replace(/\.\d+.*$/, '').trim() === fromBaseJob;
        });
        if (sourceJt) {
          const activeSourceCount = (empTable.rows || []).filter(e => {
            if (!this.isEmployeeActive(e, prevEmpNames)) return false;
            const jn = String(e['Job Number'] || e['Job #'] || '').trim();
            return jn === fromBaseJob || jn.startsWith(fromBaseJob + '.');
          }).length;

          sourceJt['Crew Size'] = activeSourceCount;
          const sRowIdx = sourceJt._rowIdx || (jtTable.rows.indexOf(sourceJt) + 2);
          if (jtTable.rawGrid && jtTable.rawGrid[sRowIdx - 1] && sizeColIdx > 0) {
            jtTable.rawGrid[sRowIdx - 1][sizeColIdx - 1] = activeSourceCount;
          }
          await this.db.addMutation({
            action: 'UPDATE_CELL',
            sheetName: jtTable.name || 'Job Tracking',
            tableKey: 'job_tracking',
            row: sRowIdx,
            col: sizeColIdx > 0 ? sizeColIdx : 4,
            header: 'Crew Size',
            itemIdentifier: fromBaseJob,
            value: activeSourceCount
          });
        }
      }

      // Dest JT
      const destJt = jtTable.rows.find(j => {
        const jn = String(j['Job Number'] || j['Job #'] || '').trim();
        return jn === destBaseJob || jn.replace(/\.\d+.*$/, '').trim() === destBaseJob;
      });
      if (destJt) {
        const activeDestCount = (empTable.rows || []).filter(e => {
          if (!this.isEmployeeActive(e, prevEmpNames)) return false;
          const jn = String(e['Job Number'] || e['Job #'] || '').trim();
          return jn === destBaseJob || jn.startsWith(destBaseJob + '.');
        }).length;

        destJt['Crew Size'] = activeDestCount;
        const dRowIdx = destJt._rowIdx || (jtTable.rows.indexOf(destJt) + 2);
        if (jtTable.rawGrid && jtTable.rawGrid[dRowIdx - 1] && sizeColIdx > 0) {
          jtTable.rawGrid[dRowIdx - 1][sizeColIdx - 1] = activeDestCount;
        }
        await this.db.addMutation({
          action: 'UPDATE_CELL',
          sheetName: jtTable.name || 'Job Tracking',
          tableKey: 'job_tracking',
          row: dRowIdx,
          col: sizeColIdx > 0 ? sizeColIdx : 4,
          header: 'Crew Size',
          itemIdentifier: destBaseJob,
          value: activeDestCount
        });
      }
    }

    // 4. Update Equipment Locations
    if (doUpdateEquip && affectedEquipment.length > 0 && !isSecondary) {
      await this.cascadeLocationToAssignedEquipment(empName, destLoc);
    }

    await this.db.persistSnapshot(this.db.snapshot);
    this.renderCurrentSheet();

    if (typeof window.showToast === 'function') {
      window.showToast(`✅ Successfully moved ${empName} to ${newSlot}! All records updated.`);
    }
  }

  /**
   * Cascades a new location to all equipment items assigned to the employee across all 9 categories
   */
  async cascadeLocationToAssignedEquipment(empName, newLocation) {
    if (!empName || !newLocation) return;
    const cleanEmp = empName.toLowerCase().trim();
    const categories = ['gloves', 'sleeves', 'blankets', 'macks', 'hv_testers', 'phasing_sets', 'aed', 'grounds', 'hot_sticks'];

    for (const key of categories) {
      const table = this.db.getTable(key);
      if (!table || !table.rows) continue;

      const locColIdx = (table.headers || []).findIndex(h => /^location$/i.test(h)) + 1;
      const chgOutColIdx = (table.headers || []).findIndex(h => /change\s*out/i.test(h)) + 1;

      for (let rIdx = 0; rIdx < table.rows.length; rIdx++) {
        const row = table.rows[rIdx];
        const assigned = String(row['Assigned To'] || '').toLowerCase().trim();
        if (assigned === cleanEmp) {
          const currentLoc = String(row['Location'] || '').trim();
          if (currentLoc.toLowerCase() !== newLocation.toLowerCase()) {
            row['Location'] = newLocation;
            const sheetRow = row._rowIdx || (rIdx + 2);
            if (table.rawGrid && table.rawGrid[sheetRow - 1] && locColIdx > 0) {
              table.rawGrid[sheetRow - 1][locColIdx - 1] = newLocation;
            }
            await this.db.addMutation({
              action: 'UPDATE_CELL',
              sheetName: table.name,
              tableKey: key,
              row: sheetRow,
              col: locColIdx,
              header: 'Location',
              itemIdentifier: row['Item #'] || row['Serial #'] || row['Glove'] || row['Sleeve'] || row['Blanket'] || '',
              value: newLocation
            });

            // Recalculate Change Out Date if location affects cycle (e.g. gloves Northern Lights)
            if (window.inventoryManager && typeof window.inventoryManager.calculateChangeOutDate === 'function') {
              const dAssigned = row['Date Assigned'] || row['Test Date'] || '';
              if (dAssigned) {
                const newChg = window.inventoryManager.calculateChangeOutDate(dAssigned, newLocation, empName, key, {
                  testDate: row['Test Date'],
                  calibrationDate: row['Calibration Date']
                });
                if (newChg && newChg !== 'N/A' && newChg !== row['Change Out Date']) {
                  row['Change Out Date'] = newChg;
                  if (table.rawGrid && table.rawGrid[sheetRow - 1] && chgOutColIdx > 0) {
                    table.rawGrid[sheetRow - 1][chgOutColIdx - 1] = newChg;
                  }
                  await this.db.addMutation({
                    action: 'UPDATE_CELL',
                    sheetName: table.name,
                    tableKey: key,
                    row: sheetRow,
                    col: chgOutColIdx,
                    header: 'Change Out Date',
                    itemIdentifier: row['Item #'] || row['Serial #'] || row['Glove'] || row['Sleeve'] || row['Blanket'] || '',
                    value: newChg
                  });
                }
              }
            }
          }
        }
      }
    }
  }

  /**
   * Fixes numbering scheme for a crew: sequentially renumbers members from .1 to .N with no gaps or duplicates
   */
  async fixCrewNumbering(baseJob) {
    const empTable = this.db.getTable('employees');
    if (!empTable || !empTable.rows) return;
    const jtTable = this.db.getTable('job_tracking');
    const jt = jtTable ? jtTable.rows.find(j => {
      const jn = String(j['Job Number'] || j['Job #'] || '').trim();
      return jn === baseJob || jn.replace(/\.\d+.*$/, '').trim() === baseJob;
    }) : null;
    const foreman = jt ? String(jt['Foreman'] || '').trim() : '';
    const prevEmpNames = this.getPreviousEmployeeNamesSet();

    const members = empTable.rows.filter(e => {
      if (!this.isEmployeeActive(e, prevEmpNames)) return false;
      const j = String(e['Job Number'] || e['Job #'] || '').trim();
      return j === baseJob || j.startsWith(baseJob + '.');
    });

    if (members.length === 0) {
      if (typeof window.showToast === 'function') window.showToast(`No members found on ${baseJob}.`, 'info');
      return;
    }

    const nameMatchesForeman = (emp, fName) => {
      if (!fName) return false;
      const fl = fName.trim().toLowerCase();
      const n = String(emp['Employee Name'] || emp['Name'] || '').trim().toLowerCase();
      if (n === fl) return true;
      const alts = String(emp['Alternate Names'] || '').split(/[|,;]/).map(s => s.trim().toLowerCase()).filter(Boolean);
      return alts.includes(fl);
    };

    const getRolePriority = (role) => {
      if (window.crewImportEngine && typeof window.crewImportEngine.getRolePriority === 'function') {
        return window.crewImportEngine.getRolePriority(role);
      }
      const r = String(role || '').toUpperCase().trim();
      const map = { 'SUP': 1, 'GF': 2, 'F': 3, 'GTO F': 4, 'JL': 5, 'JRY': 5, 'WT': 7, 'GTO': 8, 'EO 1': 9, 'EO 2': 10 };
      return map[r] !== undefined ? map[r] : 99;
    };

    members.sort((a, b) => {
      const isAForm = nameMatchesForeman(a, foreman);
      const isBForm = nameMatchesForeman(b, foreman);
      if (isAForm && !isBForm) return -1;
      if (!isAForm && isBForm) return 1;

      // Active field members take precedence over members currently on Vacation/Leave/Light Duty
      const isAStatus = this.isStatusEmployee(a);
      const isBStatus = this.isStatusEmployee(b);
      if (!isAStatus && isBStatus) return -1;
      if (isAStatus && !isBStatus) return 1;

      const pA = getRolePriority(a['Job Classification'] || a['Classification']);
      const pB = getRolePriority(b['Job Classification'] || b['Classification']);
      if (pA !== pB) return pA - pB;

      const parseSuffix = (j) => {
        const m = String(j || '').match(/\.(\d+)/);
        return m ? parseInt(m[1], 10) : 999;
      };
      const sA = parseSuffix(a['Job Number']);
      const sB = parseSuffix(b['Job Number']);
      if (sA !== sB) return sA - sB;

      const nA = String(a['Employee Name'] || a['Name'] || '');
      const nB = String(b['Employee Name'] || b['Name'] || '');
      return nA.localeCompare(nB);
    });

    let updatedCount = 0;
    const colIdx = (empTable.headers || []).findIndex(h => /^(job\s*#|job\s*number)$/i.test(h)) + 1;

    for (let i = 0; i < members.length; i++) {
      const emp = members[i];
      const targetSlot = `${baseJob}.${i + 1}`;
      const currentSlot = String(emp['Job Number'] || emp['Job #'] || '').trim();
      if (currentSlot !== targetSlot) {
        emp['Job Number'] = targetSlot;
        if (emp['Job #']) emp['Job #'] = targetSlot;
        updatedCount++;

        const empName = String(emp['Employee Name'] || emp['Name'] || '').trim();
        const rIdx = emp._rowIdx || (empTable.rows.indexOf(emp) + 2);
        if (empTable.rawGrid && empTable.rawGrid[rIdx - 1] && colIdx > 0) {
          empTable.rawGrid[rIdx - 1][colIdx - 1] = targetSlot;
        }

        await this.db.addMutation({
          action: 'UPDATE_CELL',
          sheetName: empTable.name || 'Employees',
          tableKey: 'employees',
          row: rIdx,
          col: colIdx > 0 ? colIdx : 2,
          header: colIdx > 0 ? empTable.headers[colIdx - 1] : 'Job Number',
          itemIdentifier: empName,
          oldValue: currentSlot,
          value: targetSlot
        });
      }
    }

    // Update Crew Size in Job Tracking if different
    if (jt) {
      const curSize = parseInt(jt['Crew Size'], 10);
      if (curSize !== members.length) {
        jt['Crew Size'] = members.length;
        const jtColIdx = (jtTable.headers || []).findIndex(h => /^crew\s*size$/i.test(h)) + 1;
        const jtRowIdx = jt._rowIdx || (jtTable.rows.indexOf(jt) + 2);
        if (jtTable.rawGrid && jtTable.rawGrid[jtRowIdx - 1] && jtColIdx > 0) {
          jtTable.rawGrid[jtRowIdx - 1][jtColIdx - 1] = members.length;
        }
        await this.db.addMutation({
          action: 'UPDATE_CELL',
          sheetName: jtTable.name || 'Job Tracking',
          tableKey: 'job_tracking',
          row: jtRowIdx,
          col: jtColIdx > 0 ? jtColIdx : 4,
          header: 'Crew Size',
          itemIdentifier: baseJob,
          value: members.length
        });
      }
    }

    await this.db.persistSnapshot(this.db.snapshot);
    this.renderCurrentSheet();
    if (typeof window.showToast === 'function') {
      window.showToast(`✅ Fixed numbering for ${baseJob}: ${updatedCount} member slot(s) updated, now sequentially numbered .1 to .${members.length}`);
    }
  }

  startCrewCardEdit(baseJob) {
    this.editingCrewBaseJob = baseJob;
    this.renderCurrentSheet();
  }

  cancelCrewCardEdit() {
    this.editingCrewBaseJob = null;
    this.renderCurrentSheet();
  }

  handleSchedulePresetChange(baseJob, preset) {
    const isMonThu = preset === 'Mon-Thu (4 10s)';
    const isTueFri = preset === 'Tue-Fri (4 10s)';
    const isFriSat = preset === 'Fri-Sat Weekend';
    const isMonFri = preset === 'Mon-Fri (5 8s)';

    const setCb = (day, val) => {
      const el = document.getElementById(`edit-work-${day}-${baseJob}`);
      if (el) el.checked = val;
    };

    if (isMonThu) {
      setCb('Mon', true); setCb('Tue', true); setCb('Wed', true); setCb('Thu', true);
      setCb('Fri', false); setCb('Sat', false); setCb('Sun', false);
    } else if (isTueFri) {
      setCb('Mon', false); setCb('Tue', true); setCb('Wed', true); setCb('Thu', true);
      setCb('Fri', true); setCb('Sat', false); setCb('Sun', false);
    } else if (isFriSat) {
      setCb('Mon', false); setCb('Tue', false); setCb('Wed', false); setCb('Thu', false);
      setCb('Fri', true); setCb('Sat', true); setCb('Sun', false);
    } else if (isMonFri) {
      setCb('Mon', true); setCb('Tue', true); setCb('Wed', true); setCb('Thu', true);
      setCb('Fri', true); setCb('Sat', false); setCb('Sun', false);
    }
  }

  async saveCrewCardEdit(baseJob) {
    const jtTable = this.db.getTable('job_tracking');
    if (!jtTable || !jtTable.rows) return;
    const jt = jtTable.rows.find(j => {
      const jn = String(j['Job Number'] || j['Job #'] || '').trim();
      return jn === baseJob || jn.replace(/\.\d+.*$/, '').trim() === baseJob;
    });

    const locInput = document.getElementById(`edit-crew-loc-${baseJob}`);
    const statusSelect = document.getElementById(`edit-crew-status-${baseJob}`);
    const typeSelect = document.getElementById(`edit-crew-type-${baseJob}`);
    const jobNameInput = document.getElementById(`edit-crew-jobname-${baseJob}`);
    const foremanSelect = document.getElementById(`edit-crew-foreman-${baseJob}`);
    const schedSelect = document.getElementById(`edit-crew-sched-${baseJob}`);

    const getWorkDay = (day) => {
      const el = document.getElementById(`edit-work-${day}-${baseJob}`);
      return el ? el.checked : true;
    };

    const newLoc = locInput ? locInput.value.trim() : (jt?.Location || 'Helena');
    const newStatus = statusSelect ? statusSelect.value.trim() : (jt?.Status || 'Active');
    const newCrewType = typeSelect ? typeSelect.value.trim() : (jt?.['Crew Type'] || 'Electric');
    const newJobName = jobNameInput ? jobNameInput.value.trim() : (jt?.['Job Name'] || '');
    const newForeman = foremanSelect ? foremanSelect.value.trim() : (jt?.Foreman || '');
    const newSchedule = schedSelect ? schedSelect.value.trim() : (jt?.['Work Schedule'] || 'Mon-Thu (4 10s)');

    const isSkipMon = !getWorkDay('Mon');
    const isSkipTue = !getWorkDay('Tue');
    const isSkipWed = !getWorkDay('Wed');
    const isSkipThu = !getWorkDay('Thu');
    const isSkipFri = !getWorkDay('Fri');
    const isSkipSat = !getWorkDay('Sat');
    const isSkipSun = !getWorkDay('Sun');

    const skipMtg = document.getElementById(`edit-skip-mtg-${baseJob}`)?.checked || false;
    const skipChk = document.getElementById(`edit-skip-chk-${baseJob}`)?.checked || false;
    const todayFormatted = new Date().toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' });

    const oldLoc = jt ? String(jt['Location'] || '').trim() : '';

    if (jt) {
      jt['Location'] = newLoc;
      jt['Status'] = newStatus;
      jt['Crew Type'] = newCrewType;
      jt['Job Name'] = newJobName;
      jt['Foreman'] = newForeman;
      jt['Work Schedule'] = newSchedule;
      jt['Skip Mon'] = isSkipMon;
      jt['Skip Tue'] = isSkipTue;
      jt['Skip Wed'] = isSkipWed;
      jt['Skip Thu'] = isSkipThu;
      jt['Skip Fri'] = isSkipFri;
      jt['Skip Sat'] = isSkipSat;
      jt['Skip Sun'] = isSkipSun;
      jt['Skip Weekly Meeting'] = skipMtg;
      jt['Skip Monthly Checklist'] = skipChk;
      jt['Last Updated'] = todayFormatted;

      const jtRowIdx = jt._rowIdx || (jtTable.rows.indexOf(jt) + 2);
      if (jtTable.rawGrid && jtTable.rawGrid[jtRowIdx - 1]) {
        jtTable.rawGrid[jtRowIdx - 1] = jtTable.headers.map(h => jt[h] !== undefined ? jt[h] : '');
      }

      await this.db.addMutation({
        action: 'UPDATE_ROW',
        sheetName: jtTable.name || 'Job Tracking',
        tableKey: 'job_tracking',
        itemIdentifier: baseJob,
        row: jtRowIdx,
        updatedFields: {
          'Location': newLoc,
          'Status': newStatus,
          'Crew Type': newCrewType,
          'Job Name': newJobName,
          'Foreman': newForeman,
          'Work Schedule': newSchedule,
          'Skip Mon': isSkipMon,
          'Skip Tue': isSkipTue,
          'Skip Wed': isSkipWed,
          'Skip Thu': isSkipThu,
          'Skip Fri': isSkipFri,
          'Skip Sat': isSkipSat,
          'Skip Sun': isSkipSun,
          'Skip Weekly Meeting': skipMtg,
          'Skip Monthly Checklist': skipChk,
          'Last Updated': todayFormatted
        }
      });
    }

    // If Location changed, cascade to primary members and their assigned equipment
    if (oldLoc && newLoc && oldLoc.toLowerCase() !== newLoc.toLowerCase()) {
      const empTable = this.db.getTable('employees');
      if (empTable && empTable.rows) {
        const members = empTable.rows.filter(e => {
          const j = String(e['Job Number'] || e['Job #'] || '').trim();
          return j === baseJob || j.startsWith(baseJob + '.');
        });

        const empLocColIdx = (empTable.headers || []).findIndex(h => /^location$/i.test(h)) + 1;
        for (const emp of members) {
          const empName = String(emp['Employee Name'] || emp['Name'] || '').trim();
          emp['Location'] = newLoc;
          const eRowIdx = emp._rowIdx || (empTable.rows.indexOf(emp) + 2);
          if (empTable.rawGrid && empTable.rawGrid[eRowIdx - 1] && empLocColIdx > 0) {
            empTable.rawGrid[eRowIdx - 1][empLocColIdx - 1] = newLoc;
          }
          await this.db.addMutation({
            action: 'UPDATE_CELL',
            sheetName: empTable.name || 'Employees',
            tableKey: 'employees',
            row: eRowIdx,
            col: empLocColIdx > 0 ? empLocColIdx : 3,
            header: 'Location',
            itemIdentifier: empName,
            value: newLoc
          });

          // Cascade to equipment
          await this.cascadeLocationToAssignedEquipment(empName, newLoc);
        }
      }
    }

    this.editingCrewBaseJob = null;
    await this.db.persistSnapshot(this.db.snapshot);
    this.renderCurrentSheet();
    if (typeof window.showToast === 'function') {
      window.showToast(`✅ Saved changes for Job ${baseJob}`);
    }
  }

  async toggleCrewDaySkip(baseJob, colKey) {
    const jtTable = this.db.getTable('job_tracking');
    if (!jtTable || !jtTable.rows) return;
    const jt = jtTable.rows.find(j => {
      const jn = String(j['Job Number'] || j['Job #'] || '').trim();
      return jn === baseJob || jn.replace(/\.\d+.*$/, '').trim() === baseJob;
    });
    if (!jt) return;

    const colName = `Skip ${colKey}`;
    const curVal = (jt[colName] === true || String(jt[colName]).toLowerCase() === 'true');
    const newVal = !curVal;
    jt[colName] = newVal;

    const colIdx = (jtTable.headers || []).findIndex(h => h.trim().toLowerCase() === colName.toLowerCase()) + 1;
    const rowIdx = jt._rowIdx || (jtTable.rows.indexOf(jt) + 2);
    if (jtTable.rawGrid && jtTable.rawGrid[rowIdx - 1] && colIdx > 0) {
      jtTable.rawGrid[rowIdx - 1][colIdx - 1] = newVal ? 'TRUE' : 'FALSE';
    }

    await this.db.addMutation({
      action: 'UPDATE_CELL',
      sheetName: jtTable.name || 'Job Tracking',
      tableKey: 'job_tracking',
      row: rowIdx,
      col: colIdx > 0 ? colIdx : 12,
      header: colName,
      itemIdentifier: baseJob,
      value: newVal
    });

    await this.db.persistSnapshot(this.db.snapshot);
    this.renderCurrentSheet();
  }

  async toggleCrewMeetingSkip(baseJob) {
    const jtTable = this.db.getTable('job_tracking');
    if (!jtTable || !jtTable.rows) return;
    const jt = jtTable.rows.find(j => {
      const jn = String(j['Job Number'] || j['Job #'] || '').trim();
      return jn === baseJob || jn.replace(/\.\d+.*$/, '').trim() === baseJob;
    });
    if (!jt) return;

    const colName = 'Skip Weekly Meeting';
    const curVal = (jt[colName] === true || String(jt[colName]).toLowerCase() === 'true');
    const newVal = !curVal;
    jt[colName] = newVal;

    const colIdx = (jtTable.headers || []).findIndex(h => h.trim().toLowerCase() === colName.toLowerCase()) + 1;
    const rowIdx = jt._rowIdx || (jtTable.rows.indexOf(jt) + 2);
    if (jtTable.rawGrid && jtTable.rawGrid[rowIdx - 1] && colIdx > 0) {
      jtTable.rawGrid[rowIdx - 1][colIdx - 1] = newVal ? 'TRUE' : 'FALSE';
    }

    await this.db.addMutation({
      action: 'UPDATE_CELL',
      sheetName: jtTable.name || 'Job Tracking',
      tableKey: 'job_tracking',
      row: rowIdx,
      col: colIdx > 0 ? colIdx : 19,
      header: colName,
      itemIdentifier: baseJob,
      value: newVal
    });

    await this.db.persistSnapshot(this.db.snapshot);
    this.renderCurrentSheet();
  }

  async toggleCrewChecklistSkip(baseJob) {
    const jtTable = this.db.getTable('job_tracking');
    if (!jtTable || !jtTable.rows) return;
    const jt = jtTable.rows.find(j => {
      const jn = String(j['Job Number'] || j['Job #'] || '').trim();
      return jn === baseJob || jn.replace(/\.\d+.*$/, '').trim() === baseJob;
    });
    if (!jt) return;

    const colName = 'Skip Monthly Checklist';
    const curVal = (jt[colName] === true || String(jt[colName]).toLowerCase() === 'true');
    const newVal = !curVal;
    jt[colName] = newVal;

    const colIdx = (jtTable.headers || []).findIndex(h => h.trim().toLowerCase() === colName.toLowerCase()) + 1;
    const rowIdx = jt._rowIdx || (jtTable.rows.indexOf(jt) + 2);
    if (jtTable.rawGrid && jtTable.rawGrid[rowIdx - 1] && colIdx > 0) {
      jtTable.rawGrid[rowIdx - 1][colIdx - 1] = newVal ? 'TRUE' : 'FALSE';
    }

    await this.db.addMutation({
      action: 'UPDATE_CELL',
      sheetName: jtTable.name || 'Job Tracking',
      tableKey: 'job_tracking',
      row: rowIdx,
      col: colIdx > 0 ? colIdx : 20,
      header: colName,
      itemIdentifier: baseJob,
      value: newVal
    });

    await this.db.persistSnapshot(this.db.snapshot);
    this.renderCurrentSheet();
  }

  promptChangeForeman(baseJob, currentForeman) {
    const empTable = this.db.getTable('employees');
    const prevEmpNames = this.getPreviousEmployeeNamesSet();

    const members = (empTable?.rows || []).filter(e => {
      if (!this.isEmployeeActive(e, prevEmpNames)) return false;
      const j = String(e['Job Number'] || '').trim();
      return j === baseJob || j.startsWith(baseJob + '.');
    });

    const otherEmps = (empTable?.rows || []).filter(e => {
      if (!this.isEmployeeActive(e, prevEmpNames)) return false;
      const n = String(e['Employee Name'] || e['Name'] || '').trim();
      return !members.some(m => String(m['Employee Name'] || m['Name'] || '').trim().toLowerCase() === n.toLowerCase());
    });

    const modalId = 'change-foreman-picker-modal';
    const oldModal = document.getElementById(modalId);
    if (oldModal) oldModal.remove();

    const modal = document.createElement('div');
    modal.id = modalId;
    modal.className = 'modal active';
    modal.style.cssText = 'position: fixed; inset: 0; background: rgba(0,0,0,0.7); display: flex; align-items: center; justify-content: center; z-index: 1050; padding: 20px;';
    modal.innerHTML = `
      <div style="background: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: 8px; max-width: 440px; width: 100%; box-shadow: 0 10px 30px rgba(0,0,0,0.5); overflow: hidden;">
        <div style="display: flex; justify-content: space-between; align-items: center; padding: 14px 18px; border-bottom: 1px solid var(--border-color);">
          <div style="font-weight: 800; font-size: 15px; color: var(--text-primary); display: flex; align-items: center; gap: 8px;">
            <span>👑</span> Designate Foreman for ${this.escapeHtml(baseJob)}
          </div>
          <button class="btn btn-xs btn-secondary" onclick="document.getElementById('${modalId}').remove()" style="cursor: pointer;">✖</button>
        </div>
        <div style="padding: 16px 18px;">
          <label style="font-size: 12px; font-weight: 700; color: var(--text-muted); display: block; margin-bottom: 6px;">Select Foreman:</label>
          <select id="modal-foreman-select" class="form-control" style="width: 100%; padding: 8px 10px; background: var(--bg-primary); border: 1px solid var(--border-color); border-radius: 6px; color: var(--text-primary); font-size: 13px;">
            <option value="">(None designated)</option>
            <optgroup label="Crew Members">
              ${members.map(m => {
                const n = String(m['Employee Name'] || m['Name'] || '').trim();
                const c = String(m['Job Classification'] || m['Classification'] || '');
                return `<option value="${this.escapeHtml(n)}" ${n.toLowerCase() === currentForeman.toLowerCase() ? 'selected' : ''}>👑 ${this.escapeHtml(n)} (${this.escapeHtml(c)})</option>`;
              }).join('')}
            </optgroup>
            <optgroup label="Other Active Employees">
              ${otherEmps.map(o => {
                const n = String(o['Employee Name'] || o['Name'] || '').trim();
                return `<option value="${this.escapeHtml(n)}" ${n.toLowerCase() === currentForeman.toLowerCase() ? 'selected' : ''}>${this.escapeHtml(n)}</option>`;
              }).join('')}
            </optgroup>
          </select>
        </div>
        <div style="display: flex; justify-content: flex-end; gap: 8px; padding: 12px 18px; border-top: 1px solid var(--border-color); background: var(--bg-primary);">
          <button class="btn btn-secondary" onclick="document.getElementById('${modalId}').remove()">Cancel</button>
          <button class="btn btn-primary" id="btn-save-foreman" style="background: #ec4899; border-color: #ec4899; font-weight: 700;">
            👑 Set as Foreman
          </button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    document.getElementById('btn-save-foreman')?.addEventListener('click', async () => {
      const selected = document.getElementById('modal-foreman-select')?.value.trim() || '';
      modal.remove();
      await this.setCrewForeman(baseJob, selected);
    });
  }

  async setCrewForeman(baseJob, newForeman) {
    const jtTable = this.db.getTable('job_tracking');
    if (!jtTable || !jtTable.rows) return;
    const jt = jtTable.rows.find(j => {
      const jn = String(j['Job Number'] || j['Job #'] || '').trim();
      return jn === baseJob || jn.replace(/\.\d+.*$/, '').trim() === baseJob;
    });
    if (!jt) return;

    jt['Foreman'] = newForeman;
    const colIdx = (jtTable.headers || []).findIndex(h => /^foreman$/i.test(h)) + 1;
    const rowIdx = jt._rowIdx || (jtTable.rows.indexOf(jt) + 2);
    if (jtTable.rawGrid && jtTable.rawGrid[rowIdx - 1] && colIdx > 0) {
      jtTable.rawGrid[rowIdx - 1][colIdx - 1] = newForeman;
    }

    await this.db.addMutation({
      action: 'UPDATE_CELL',
      sheetName: jtTable.name || 'Job Tracking',
      tableKey: 'job_tracking',
      row: rowIdx,
      col: colIdx > 0 ? colIdx : 3,
      header: 'Foreman',
      itemIdentifier: baseJob,
      value: newForeman
    });

    await this.db.persistSnapshot(this.db.snapshot);
    this.renderCurrentSheet();
    if (typeof window.showToast === 'function') {
      window.showToast(`👑 Updated foreman for ${baseJob} to ${newForeman || '(None)'}`);
    }
  }

  async quickChangeCrewType(baseJob, newType) {
    if (!baseJob || !newType) return;
    const cleanJob = String(baseJob || '').trim().replace(/\.\d+.*$/, '');
    const jtTable = this.db.getTable('job_tracking');
    if (!jtTable) return;

    if (!jtTable.rows) jtTable.rows = [];
    if (!jtTable.headers) jtTable.headers = [];
    if (!jtTable.headers.some(h => String(h).trim().toLowerCase() === 'crew type')) {
      jtTable.headers.push('Crew Type');
    }

    let targetRow = jtTable.rows.find(j => {
      const jn = String(j['Job Number'] || j['Job #'] || j['Crew'] || '').trim();
      return jn === cleanJob || jn.replace(/\.\d+.*$/, '').trim() === cleanJob;
    });

    const todayFormatted = new Date().toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' });

    if (!targetRow) {
      targetRow = {
        'Job Number': cleanJob,
        'Location': 'Helena',
        'Status': 'Active',
        'Crew Type': newType,
        'Work Schedule': 'Mon-Thu (4 10s)',
        'Skip Sun': true,
        'Skip Mon': false,
        'Skip Tue': false,
        'Skip Wed': false,
        'Skip Thu': false,
        'Skip Fri': true,
        'Skip Sat': true,
        'Skip Weekly Meeting': false,
        'Skip Monthly Checklist': false,
        'Last Updated': todayFormatted
      };
      targetRow._rowIdx = (jtTable.rows.length || 0) + 2;
      jtTable.rows.push(targetRow);
      if (jtTable.rawGrid) {
        jtTable.rawGrid.push(jtTable.headers.map(h => targetRow[h] !== undefined ? targetRow[h] : ''));
      }
      await this.db.addMutation({
        action: 'ADD_ROW',
        sheetName: jtTable.name || 'Job Tracking',
        tableKey: 'job_tracking',
        rowData: targetRow
      });
    } else {
      const oldType = targetRow['Crew Type'] || 'Electric';
      if (oldType === newType) return;

      targetRow['Crew Type'] = newType;
      targetRow['Last Updated'] = todayFormatted;

      const rowIdx = targetRow._rowIdx || (jtTable.rows.indexOf(targetRow) + 2);
      if (jtTable.rawGrid && jtTable.rawGrid[rowIdx - 1]) {
        jtTable.rawGrid[rowIdx - 1] = jtTable.headers.map(h => targetRow[h] !== undefined ? targetRow[h] : '');
      }

      await this.db.addMutation({
        action: 'UPDATE_ROW',
        sheetName: jtTable.name || 'Job Tracking',
        tableKey: 'job_tracking',
        itemIdentifier: cleanJob,
        row: rowIdx,
        updatedFields: {
          'Crew Type': newType,
          'Last Updated': todayFormatted
        }
      });
    }

    if (typeof this.db.saveLocalSnapshot === 'function') {
      await this.db.saveLocalSnapshot();
    } else if (typeof this.db.persistSnapshot === 'function') {
      await this.db.persistSnapshot(this.db.snapshot);
    }

    // Refresh dependent audit / procurement models
    if (window.ppeTrackingEngine && typeof window.ppeTrackingEngine.compileAuditData === 'function') {
      window.ppeTrackingEngine.compileAuditData();
    }
    if (window.procurementEngine && typeof window.procurementEngine.buildPurchaseNeeds === 'function') {
      window.procurementEngine.buildPurchaseNeeds();
    }

    this.renderCurrentSheet();
    if (typeof window.showToast === 'function') {
      window.showToast(`✅ Updated Crew ${cleanJob} to ${newType}`);
    }
  }

  promptChangeMemberSlot(empName, currentSlot, baseJob) {
    const currentSuffix = (currentSlot.match(/\.(\d+)/) || [])[1] || '1';
    const newSuffix = prompt(`Edit slot suffix for ${empName} on Job ${baseJob}:\n\nEnter position number (e.g. 1, 2, 3...):`, currentSuffix);
    if (newSuffix === null || newSuffix.trim() === '' || newSuffix.trim() === currentSuffix) return;

    const cleanNum = parseInt(newSuffix.trim(), 10);
    if (isNaN(cleanNum) || cleanNum < 1) {
      alert('Please enter a valid positive slot number (e.g. 1, 2, 3).');
      return;
    }

    const newJobNumber = `${baseJob}.${cleanNum}`;
    this.executeMemberSlotChange(empName, newJobNumber);
  }

  async executeMemberSlotChange(empName, newJobNumber) {
    const empTable = this.db.getTable('employees');
    if (!empTable || !empTable.rows) return;
    const emp = empTable.rows.find(e => String(e['Employee Name'] || e['Name'] || '').trim().toLowerCase() === empName.toLowerCase());
    if (!emp) return;

    const oldSlot = emp['Job Number'];
    emp['Job Number'] = newJobNumber;
    if (emp['Job #']) emp['Job #'] = newJobNumber;

    const colIdx = (empTable.headers || []).findIndex(h => /^(job\s*#|job\s*number)$/i.test(h)) + 1;
    const rIdx = emp._rowIdx || (empTable.rows.indexOf(emp) + 2);
    if (empTable.rawGrid && empTable.rawGrid[rIdx - 1] && colIdx > 0) {
      empTable.rawGrid[rIdx - 1][colIdx - 1] = newJobNumber;
    }

    await this.db.addMutation({
      action: 'UPDATE_CELL',
      sheetName: empTable.name || 'Employees',
      tableKey: 'employees',
      row: rIdx,
      col: colIdx > 0 ? colIdx : 2,
      header: 'Job Number',
      itemIdentifier: empName,
      oldValue: oldSlot,
      value: newJobNumber
    });

    await this.db.persistSnapshot(this.db.snapshot);
    this.renderCurrentSheet();
    if (typeof window.showToast === 'function') {
      window.showToast(`✅ Updated slot for ${empName}: ${newJobNumber}`);
    }
  }

  promptChangeMemberClassification(empName, currentClassification) {
    const standardRoles = [
      'SUP', 'GF', 'F', 'GTO F', 'JL', 'JRY', 'JRY OP', 'WT', 'GTO',
      'EO 1', 'EO 2', 'AP 7', 'AP 6', 'AP 5', 'AP 4', 'AP 3', 'AP 2', 'AP 1'
    ];

    const modalId = 'change-classification-modal';
    const oldModal = document.getElementById(modalId);
    if (oldModal) oldModal.remove();

    const modal = document.createElement('div');
    modal.id = modalId;
    modal.className = 'modal active';
    modal.style.cssText = 'position: fixed; inset: 0; background: rgba(0,0,0,0.7); display: flex; align-items: center; justify-content: center; z-index: 1050; padding: 20px;';
    modal.innerHTML = `
      <div style="background: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: 8px; max-width: 400px; width: 100%; box-shadow: 0 10px 30px rgba(0,0,0,0.5); overflow: hidden;">
        <div style="display: flex; justify-content: space-between; align-items: center; padding: 14px 18px; border-bottom: 1px solid var(--border-color);">
          <div style="font-weight: 800; font-size: 15px; color: var(--text-primary); display: flex; align-items: center; gap: 8px;">
            <span>🏷️</span> Classification for ${this.escapeHtml(empName)}
          </div>
          <button class="btn btn-xs btn-secondary" onclick="document.getElementById('${modalId}').remove()" style="cursor: pointer;">✖</button>
        </div>
        <div style="padding: 16px 18px;">
          <label style="font-size: 12px; font-weight: 700; color: var(--text-muted); display: block; margin-bottom: 6px;">Select Job Classification:</label>
          <select id="modal-role-select" class="form-control" style="width: 100%; padding: 8px 10px; background: var(--bg-primary); border: 1px solid var(--border-color); border-radius: 6px; color: var(--text-primary); font-size: 13px;">
            ${standardRoles.map(r => `<option value="${r}" ${r.toUpperCase() === currentClassification.toUpperCase() ? 'selected' : ''}>${r}</option>`).join('')}
          </select>
        </div>
        <div style="display: flex; justify-content: flex-end; gap: 8px; padding: 12px 18px; border-top: 1px solid var(--border-color); background: var(--bg-primary);">
          <button class="btn btn-secondary" onclick="document.getElementById('${modalId}').remove()">Cancel</button>
          <button class="btn btn-primary" id="btn-save-role" style="background: #2563eb; border-color: #2563eb; font-weight: 700;">
            💾 Save Classification
          </button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    document.getElementById('btn-save-role')?.addEventListener('click', async () => {
      const selected = document.getElementById('modal-role-select')?.value.trim() || '';
      modal.remove();
      if (selected) {
        await this.executeMemberClassificationChange(empName, selected);
      }
    });
  }

  async executeMemberClassificationChange(empName, newRole) {
    const empTable = this.db.getTable('employees');
    if (!empTable || !empTable.rows) return;
    const emp = empTable.rows.find(e => String(e['Employee Name'] || e['Name'] || '').trim().toLowerCase() === empName.toLowerCase());
    if (!emp) return;

    emp['Job Classification'] = newRole;
    if (emp['Classification']) emp['Classification'] = newRole;
    if (emp['Role']) emp['Role'] = newRole;

    const colIdx = (empTable.headers || []).findIndex(h => /^(job\s*classification|classification|role)$/i.test(h)) + 1;
    const rIdx = emp._rowIdx || (empTable.rows.indexOf(emp) + 2);
    if (empTable.rawGrid && empTable.rawGrid[rIdx - 1] && colIdx > 0) {
      empTable.rawGrid[rIdx - 1][colIdx - 1] = newRole;
    }

    await this.db.addMutation({
      action: 'UPDATE_CELL',
      sheetName: empTable.name || 'Employees',
      tableKey: 'employees',
      row: rIdx,
      col: colIdx > 0 ? colIdx : 4,
      header: 'Job Classification',
      itemIdentifier: empName,
      value: newRole
    });

    await this.db.persistSnapshot(this.db.snapshot);
    this.renderCurrentSheet();
    if (typeof window.showToast === 'function') {
      window.showToast(`✅ Updated classification for ${empName}: ${newRole}`);
    }
  }

  promptChangeHireDate(empName, currentHireDate) {
    const modalId = 'change-hire-date-modal';
    const oldModal = document.getElementById(modalId);
    if (oldModal) oldModal.remove();

    let defaultIso = '';
    const parsed = this.parseDate(currentHireDate);
    if (parsed) {
      const yyyy = parsed.getFullYear();
      const mm = String(parsed.getMonth() + 1).padStart(2, '0');
      const dd = String(parsed.getDate()).padStart(2, '0');
      defaultIso = `${yyyy}-${mm}-${dd}`;
    } else {
      const today = new Date();
      const yyyy = today.getFullYear();
      const mm = String(today.getMonth() + 1).padStart(2, '0');
      const dd = String(today.getDate()).padStart(2, '0');
      defaultIso = `${yyyy}-${mm}-${dd}`;
    }

    const todayIso = (() => {
      const today = new Date();
      const yyyy = today.getFullYear();
      const mm = String(today.getMonth() + 1).padStart(2, '0');
      const dd = String(today.getDate()).padStart(2, '0');
      return `${yyyy}-${mm}-${dd}`;
    })();

    const modal = document.createElement('div');
    modal.id = modalId;
    modal.className = 'modal active';
    modal.style.cssText = 'position: fixed; inset: 0; background: rgba(0,0,0,0.7); display: flex; align-items: center; justify-content: center; z-index: 1050; padding: 20px;';
    modal.innerHTML = `
      <div style="background: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: 8px; max-width: 440px; width: 100%; box-shadow: 0 10px 30px rgba(0,0,0,0.5); overflow: hidden;">
        <div style="display: flex; justify-content: space-between; align-items: center; padding: 14px 18px; border-bottom: 1px solid var(--border-color);">
          <div style="font-weight: 800; font-size: 15px; color: var(--text-primary); display: flex; align-items: center; gap: 8px;">
            <span>📅</span> Hire Date / Start Date: <span style="color: #60a5fa;">${this.escapeHtml(empName)}</span>
          </div>
          <button class="btn btn-xs btn-secondary" onclick="document.getElementById('${modalId}').remove()" style="cursor: pointer;">✖</button>
        </div>
        <div style="padding: 16px 18px; display: flex; flex-direction: column; gap: 14px;">
          <div>
            <label style="font-size: 12px; font-weight: 700; color: var(--text-muted); display: block; margin-bottom: 6px;">New Hire / Start Date:</label>
            <div style="display: flex; gap: 8px; align-items: center;">
              <input type="date" id="modal-hire-date-input" class="form-control" value="${defaultIso}" style="flex: 1; padding: 8px 10px; background: var(--bg-primary); border: 1px solid var(--border-color); border-radius: 6px; color: var(--text-primary); font-size: 13px;">
              <button type="button" id="btn-set-today" class="btn btn-xs" style="background: rgba(16, 185, 129, 0.2); color: #10b981; border: 1px solid rgba(16, 185, 129, 0.4); font-weight: 700; padding: 8px 10px; border-radius: 6px; cursor: pointer; white-space: nowrap;" title="Set date to today">
                ⚡ Today
              </button>
            </div>
          </div>
          <div style="font-size: 11.5px; color: var(--text-secondary); background: rgba(0,0,0,0.18); border-radius: 6px; padding: 10px 12px; border-left: 3px solid #3b82f6; line-height: 1.4;">
            💡 <strong>Automatic Status Update:</strong><br>
            • If the date is <strong>today or in the past</strong>, status is automatically set to <span style="color: #10b981; font-weight: 700;">🟢 Active</span>.<br>
            • If the date is in the <strong>future</strong>, status is set to <span style="color: #fbbf24; font-weight: 700;">⏳ Pending New Hire</span>.
          </div>
        </div>
        <div style="display: flex; justify-content: space-between; align-items: center; gap: 8px; padding: 12px 18px; border-top: 1px solid var(--border-color); background: var(--bg-primary);">
          <button type="button" id="btn-quick-activate" class="btn btn-sm" style="background: rgba(16, 185, 129, 0.15); color: #10b981; border: 1px solid rgba(16, 185, 129, 0.35); font-weight: 700; padding: 6px 12px; border-radius: 4px; cursor: pointer;">
            🚀 Activate Today
          </button>
          <div style="display: flex; gap: 8px;">
            <button type="button" class="btn btn-secondary" onclick="document.getElementById('${modalId}').remove()">Cancel</button>
            <button type="button" class="btn btn-primary" id="btn-save-hire-date" style="background: #2563eb; border-color: #2563eb; font-weight: 700;">
              💾 Save Date
            </button>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    document.getElementById('btn-set-today')?.addEventListener('click', () => {
      const inp = document.getElementById('modal-hire-date-input');
      if (inp) inp.value = todayIso;
    });

    document.getElementById('btn-quick-activate')?.addEventListener('click', async () => {
      modal.remove();
      await this.setEmployeeHireDate(empName, todayIso, true);
    });

    document.getElementById('btn-save-hire-date')?.addEventListener('click', async () => {
      const selected = document.getElementById('modal-hire-date-input')?.value.trim() || '';
      modal.remove();
      if (selected) {
        await this.setEmployeeHireDate(empName, selected);
      }
    });
  }

  async setEmployeeHireDate(empName, rawDateStr, forceActive = false) {
    const empTable = this.db.getTable('employees');
    if (!empTable || !empTable.rows) return;
    const emp = empTable.rows.find(e => String(e['Employee Name'] || e['Name'] || '').trim().toLowerCase() === empName.toLowerCase());
    if (!emp) {
      alert(`Could not find employee record for ${empName}`);
      return;
    }

    const parsedDate = this.parseDate(rawDateStr);
    if (!parsedDate) {
      alert('Invalid date format provided.');
      return;
    }

    const formattedHireDate = this.formatDate(parsedDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const checkDate = new Date(parsedDate.getTime());
    checkDate.setHours(0, 0, 0, 0);

    let newStatus = 'Active';
    if (!forceActive && checkDate > today) {
      newStatus = 'Pending';
    }

    const oldHireDate = emp['Hire Date'] || '';
    const oldStatus = emp['Status'] || '';

    emp['Hire Date'] = formattedHireDate;
    emp['Status'] = newStatus;

    // Headers & column positions in Employees table
    const headers = empTable.headers || [];
    const hireColIdx = headers.findIndex(h => /^(hire\s*date|hire)$/i.test(h)) + 1;
    const statusColIdx = headers.findIndex(h => /^status$/i.test(h)) + 1;
    const rIdx = emp._rowIdx || (empTable.rows.indexOf(emp) + 2);

    if (empTable.rawGrid && empTable.rawGrid[rIdx - 1]) {
      if (hireColIdx > 0) empTable.rawGrid[rIdx - 1][hireColIdx - 1] = formattedHireDate;
      if (statusColIdx > 0) empTable.rawGrid[rIdx - 1][statusColIdx - 1] = newStatus;
    }

    // Queue mutations for Hire Date and Status
    if (hireColIdx > 0) {
      await this.db.addMutation({
        action: 'UPDATE_CELL',
        sheetName: empTable.name || 'Employees',
        tableKey: 'employees',
        row: rIdx,
        col: hireColIdx,
        header: 'Hire Date',
        itemIdentifier: empName,
        oldValue: oldHireDate,
        value: formattedHireDate
      });
    }

    if (statusColIdx > 0) {
      await this.db.addMutation({
        action: 'UPDATE_CELL',
        sheetName: empTable.name || 'Employees',
        tableKey: 'employees',
        row: rIdx,
        col: statusColIdx,
        header: 'Status',
        itemIdentifier: empName,
        oldValue: oldStatus,
        value: newStatus
      });
    }

    // Also record event in employee_history if table exists
    const histTable = this.db.getTable('employee_history');
    if (histTable && Array.isArray(histTable.rows)) {
      const todayFormatted = this.formatDate(new Date());
      const eventNote = newStatus === 'Active'
        ? `Activated as Active employee with hire date ${formattedHireDate}`
        : `Start date updated to ${formattedHireDate} (Pending New Hire)`;
      const newHistRow = {
        'Date': todayFormatted,
        'Employee Name': empName,
        'Event Type': newStatus === 'Active' ? 'Activated' : 'Date Changed',
        'Location': emp['Location'] || '',
        'Job Number': emp['Job Number'] || emp['Job #'] || '',
        'Notes': eventNote
      };
      histTable.rows.unshift(newHistRow);
      await this.db.addMutation({
        action: 'ADD_ROW',
        sheetName: histTable.name || 'Employee History',
        tableKey: 'employee_history',
        employeeName: empName,
        itemIdentifier: empName,
        rowValues: newHistRow
      });
    }

    // If active, also check if glove_swaps has a PREV EMP reclaim row for this employee and clean it up
    const gSwaps = this.db.getTable('glove_swaps');
    if (gSwaps && Array.isArray(gSwaps.rows)) {
      const rogueIdx = gSwaps.rows.findIndex(r => {
        const empField = String(r['Employee'] || r['Assigned To'] || '').trim().toLowerCase();
        const daysLeft = String(r['Days Left'] || '').trim().toUpperCase();
        return empField === empName.toLowerCase() && daysLeft.includes('PREV EMP');
      });
      if (rogueIdx !== -1) {
        const removedRow = gSwaps.rows.splice(rogueIdx, 1)[0];
        if (gSwaps.rawGrid && removedRow && removedRow._rowIdx) {
          const gridIdx = gSwaps.rawGrid.findIndex((r, idx) => idx + 1 === removedRow._rowIdx);
          if (gridIdx !== -1) {
            gSwaps.rawGrid.splice(gridIdx, 1);
          }
        }
      }
    }

    await this.db.persistSnapshot(this.db.snapshot);
    this.renderCurrentSheet();

    if (window.employeeProfileEngine && window.employeeProfileEngine.currentEmployeeData?.displayName?.toLowerCase() === empName.toLowerCase()) {
      window.employeeProfileEngine.openProfileModal(empName, window.employeeProfileEngine.currentActiveTab || 'details');
    }

    if (typeof window.showToast === 'function') {
      window.showToast(`✅ Updated start date for ${empName}: ${formattedHireDate} (${newStatus})`);
    }
  }

  openMemberRowActions(event, empName, baseJob, isLead, isSecondary) {
    event.stopPropagation();
    const existing = document.getElementById('crew-member-actions-menu');
    if (existing) existing.remove();

    const menu = document.createElement('div');
    menu.id = 'crew-member-actions-menu';
    menu.style.cssText = `
      position: fixed;
      top: ${event.clientY + 5}px;
      left: ${Math.min(event.clientX, window.innerWidth - 220)}px;
      background: var(--bg-secondary);
      border: 1px solid var(--border-color);
      border-radius: 6px;
      box-shadow: 0 8px 24px rgba(0,0,0,0.5);
      z-index: 1070;
      min-width: 200px;
      padding: 6px 0;
      font-size: 12px;
      display: flex;
      flex-direction: column;
    `;

    const makeItem = (icon, label, onClick) => {
      const btn = document.createElement('button');
      btn.style.cssText = 'background: transparent; border: none; padding: 7px 14px; text-align: left; color: var(--text-primary); cursor: pointer; display: flex; align-items: center; gap: 8px; font-size: 12px; width: 100%;';
      btn.innerHTML = `<span>${icon}</span> <span>${this.escapeHtml(label)}</span>`;
      btn.onmouseover = () => { btn.style.background = 'rgba(255,255,255,0.06)'; };
      btn.onmouseout = () => { btn.style.background = 'transparent'; };
      btn.onclick = () => {
        menu.remove();
        onClick();
      };
      return btn;
    };

    const empTable = this.db.getTable('employees');
    const emp = (empTable?.rows || []).find(e => String(e['Employee Name'] || e['Name'] || '').trim().toLowerCase() === empName.toLowerCase());
    const isPending = emp && (String(emp['Status'] || '').toLowerCase().includes('pending') || (emp['Hire Date'] && new Date(emp['Hire Date']) > new Date()));

    if (isPending) {
      menu.appendChild(makeItem('🚀', 'Activate Employee Today', () => {
        const todayIso = new Date().toISOString().split('T')[0];
        this.setEmployeeHireDate(empName, todayIso, true);
      }));
    }

    menu.appendChild(makeItem('📅', isPending ? 'Change Start Date' : 'Edit Hire Date', () => {
      this.promptChangeHireDate(empName, emp?.['Hire Date'] || '');
    }));

    if (!isLead) {
      menu.appendChild(makeItem('👑', `Make Foreman for ${baseJob}`, () => {
        this.setCrewForeman(baseJob, empName);
      }));
    }

    menu.appendChild(makeItem('✏️', 'Edit Slot Number', () => {
      this.promptChangeMemberSlot(empName, emp?.['Job Number'] || '', baseJob);
    }));

    menu.appendChild(makeItem('🏷️', 'Change Classification', () => {
      const empTable = this.db.getTable('employees');
      const emp = (empTable?.rows || []).find(e => String(e['Employee Name'] || e['Name'] || '').trim().toLowerCase() === empName.toLowerCase());
      this.promptChangeMemberClassification(empName, emp?.['Job Classification'] || '');
    }));

    menu.appendChild(makeItem('⚡', 'Assign Secondary Job', () => {
      this.promptAssignSecondaryJob(empName);
    }));

    menu.appendChild(makeItem('👤', 'Open Employee Profile', () => {
      if (window.employeeProfileEngine) {
        window.employeeProfileEngine.openProfileModal(empName);
      }
    }));

    const divider = document.createElement('div');
    divider.style.cssText = 'height: 1px; background: var(--border-color); margin: 4px 0;';
    menu.appendChild(divider);

    menu.appendChild(makeItem('🚪', 'Remove from Crew', () => {
      this.promptRemoveMemberFromCrew(empName, baseJob, isSecondary);
    }));

    document.body.appendChild(menu);

    const closeHandler = (e) => {
      if (!menu.contains(e.target)) {
        menu.remove();
        document.removeEventListener('click', closeHandler);
      }
    };
    setTimeout(() => document.addEventListener('click', closeHandler), 10);
  }

  promptAssignSecondaryJob(empName) {
    const empTable = this.db.getTable('employees');
    const emp = (empTable?.rows || []).find(e => String(e['Employee Name'] || e['Name'] || '').trim().toLowerCase() === empName.toLowerCase());
    const curSec = emp?.['Secondary Job Number'] || emp?.['Secondary Job #'] || '';
    const newSec = prompt(`Assign or edit secondary job for ${empName}:\n(e.g. 040-26 (Fri-Sat).1 — or leave blank to clear)`, curSec);
    if (newSec === null) return;
    this.executeSecondaryJobChange(empName, newSec.trim());
  }

  async executeSecondaryJobChange(empName, newSecJob) {
    const empTable = this.db.getTable('employees');
    if (!empTable || !empTable.rows) return;
    const emp = empTable.rows.find(e => String(e['Employee Name'] || e['Name'] || '').trim().toLowerCase() === empName.toLowerCase());
    if (!emp) return;

    emp['Secondary Job Number'] = newSecJob;
    if (emp['Secondary Job #']) emp['Secondary Job #'] = newSecJob;

    const colIdx = (empTable.headers || []).findIndex(h => /secondary\s*job/i.test(h)) + 1;
    const rIdx = emp._rowIdx || (empTable.rows.indexOf(emp) + 2);
    if (empTable.rawGrid && empTable.rawGrid[rIdx - 1] && colIdx > 0) {
      empTable.rawGrid[rIdx - 1][colIdx - 1] = newSecJob;
    }

    await this.db.addMutation({
      action: 'UPDATE_CELL',
      sheetName: empTable.name || 'Employees',
      tableKey: 'employees',
      row: rIdx,
      col: colIdx > 0 ? colIdx : 5,
      header: 'Secondary Job Number',
      itemIdentifier: empName,
      value: newSecJob
    });

    await this.db.persistSnapshot(this.db.snapshot);
    this.renderCurrentSheet();
    if (typeof window.showToast === 'function') {
      window.showToast(`⚡ Updated secondary job for ${empName}: ${newSecJob || '(Cleared)'}`);
    }
  }

  async promptRemoveMemberFromCrew(empName, baseJob, isSecondary = false) {
    if (!confirm(`Are you sure you want to remove ${empName} from ${baseJob}?`)) return;

    const empTable = this.db.getTable('employees');
    if (!empTable || !empTable.rows) return;
    const emp = empTable.rows.find(e => String(e['Employee Name'] || e['Name'] || '').trim().toLowerCase() === empName.toLowerCase());
    if (!emp) return;

    if (isSecondary) {
      await this.executeSecondaryJobChange(empName, '');
      return;
    }

    const oldSlot = emp['Job Number'];
    emp['Job Number'] = 'Unassigned';
    if (emp['Job #']) emp['Job #'] = 'Unassigned';

    const colIdx = (empTable.headers || []).findIndex(h => /^(job\s*#|job\s*number)$/i.test(h)) + 1;
    const rIdx = emp._rowIdx || (empTable.rows.indexOf(emp) + 2);
    if (empTable.rawGrid && empTable.rawGrid[rIdx - 1] && colIdx > 0) {
      empTable.rawGrid[rIdx - 1][colIdx - 1] = 'Unassigned';
    }

    await this.db.addMutation({
      action: 'UPDATE_CELL',
      sheetName: empTable.name || 'Employees',
      tableKey: 'employees',
      row: rIdx,
      col: colIdx > 0 ? colIdx : 2,
      header: 'Job Number',
      itemIdentifier: empName,
      oldValue: oldSlot,
      value: 'Unassigned'
    });

    // Update JT Crew Size
    const jtTable = this.db.getTable('job_tracking');
    if (jtTable && jtTable.rows) {
      const jt = jtTable.rows.find(j => {
        const jn = String(j['Job Number'] || j['Job #'] || '').trim();
        return jn === baseJob || jn.replace(/\.\d+.*$/, '').trim() === baseJob;
      });
      if (jt) {
        const curSize = parseInt(jt['Crew Size'], 10) || 1;
        jt['Crew Size'] = Math.max(0, curSize - 1);
        const jtColIdx = (jtTable.headers || []).findIndex(h => /^crew\s*size$/i.test(h)) + 1;
        const jtRowIdx = jt._rowIdx || (jtTable.rows.indexOf(jt) + 2);
        if (jtTable.rawGrid && jtTable.rawGrid[jtRowIdx - 1] && jtColIdx > 0) {
          jtTable.rawGrid[jtRowIdx - 1][jtColIdx - 1] = jt['Crew Size'];
        }
        await this.db.addMutation({
          action: 'UPDATE_CELL',
          sheetName: jtTable.name || 'Job Tracking',
          tableKey: 'job_tracking',
          row: jtRowIdx,
          col: jtColIdx > 0 ? jtColIdx : 4,
          header: 'Crew Size',
          itemIdentifier: baseJob,
          value: jt['Crew Size']
        });
      }
    }

    await this.db.persistSnapshot(this.db.snapshot);
    this.renderCurrentSheet();
    if (typeof window.showToast === 'function') {
      window.showToast(`🚪 Removed ${empName} from ${baseJob}. Status set to Unassigned.`);
    }
  }

  renderStandardTable(container, countBadge, tableData) {
    if (!tableData) {
      tableData = this.db.getTable(this.currentSheetKey) || { headers: [], rows: [] };
    }
    const isEquipmentSheet = ['gloves', 'sleeves', 'blankets', 'macks', 'hv_testers', 'phasing_sets', 'aed', 'grounds', 'hot_sticks'].includes(this.currentSheetKey);
    const isInventorySheet = isEquipmentSheet;
    const isJobTracking = this.currentSheetKey === 'job_tracking';
    if (isJobTracking && tableData.headers && !tableData.headers.some(h => String(h).trim().toLowerCase() === 'crew type')) {
      tableData.headers.push('Crew Type');
    }
    const headers = tableData.headers || [];
    let rows = [...(tableData.rows || [])];
    const pendingEmps = isEquipmentSheet ? this.getPendingEmployeesMap() : null;

    if (!headers.length && !rows.length) {
      const sheetName = tableData.name || (this.currentSheetKey === 'safety_compliance' ? 'Safety Compliance' : (this.currentSheetKey === 'expiring_certs' ? 'Expiring Certs' : (this.currentSheetKey === 'training_tracking' ? 'Training Tracking' : 'this sheet')));
      container.innerHTML = `
        <div class="empty-sheet-container" style="padding: 36px 20px; text-align: center; max-width: 580px; margin: 30px auto; background: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: 14px; box-shadow: 0 10px 30px rgba(0,0,0,0.3);">
          <div style="font-size: 42px; margin-bottom: 12px;">🛡️</div>
          <h3 style="color: var(--text-primary); font-size: 18px; font-weight: 700; margin-bottom: 8px;">No records loaded for ${this.escapeHtml(sheetName)}</h3>
          <p style="color: var(--text-secondary); font-size: 13.5px; line-height: 1.5; margin-bottom: 22px;">
            Download the live database from Google Sheets or import a snapshot file to view your data.
          </p>
          <div style="display: flex; flex-direction: column; gap: 12px; align-items: stretch;">
            <button class="btn btn-primary" onclick="window.syncEngine.downloadLatestSnapshot()" style="padding: 14px 18px; font-size: 14px; font-weight: 700; background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%); border: none; border-radius: 8px; display: flex; align-items: center; justify-content: center; gap: 8px; box-shadow: 0 4px 14px rgba(37, 99, 235, 0.4); cursor: pointer; color: #ffffff;">
              <span style="font-size: 18px;">⬇️</span> Download Database from Google Sheets (1-Click)
            </button>
            <button class="btn btn-secondary" onclick="window.syncEngine.importLocalSnapshotFile()" style="padding: 13px 18px; font-size: 14px; font-weight: 600; background: rgba(255, 255, 255, 0.05); border: 1px solid var(--border-color); border-radius: 8px; color: var(--text-primary); display: flex; align-items: center; justify-content: center; gap: 8px; cursor: pointer;">
              <span style="font-size: 18px;">📁</span> Import Snapshot File (from Google Drive / Local)
            </button>
          </div>
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

    // Filter Locations & Approvals sheet: Only locations from the Job Tracking page need to show here
    if (this.currentSheetKey === 'locations') {
      const jtTable = (this.db && typeof this.db.getTable === 'function' ? this.db.getTable('job_tracking') : null) || this.db?.snapshot?.tables?.['job_tracking'];
      const statusLocations = new Set([
        'vacation', 'light duty', 'weeds', 'leave', 'previous employee', 'medical',
        "worker's comp", 'unknown', 'in testing', 'location', 'lost', 'destroyed',
        "cody's truck", 'arnett / jm test', 'arnett', 'office', 'base'
      ]);

      const validJtLocations = new Map();
      if (jtTable && jtTable.rows) {
        jtTable.rows.forEach(j => {
          let loc = String(j['Location'] || j['City'] || '').trim();
          if (!loc) return;
          const parenMatch = loc.match(/^([^(]+)\s*\([^)]+\)$/);
          if (parenMatch) loc = parenMatch[1].trim();
          const lower = loc.toLowerCase();
          if (!statusLocations.has(lower) && loc) {
            if (!validJtLocations.has(lower)) {
              const formatted = loc.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
              validJtLocations.set(lower, formatted);
            }
          }
        });
      }

      if (validJtLocations.size > 0) {
        const seenLocs = new Map();
        const matchedRows = [];

        // 1. Match existing location rows, filter out status/non-JT locations, and deduplicate
        rows.forEach(r => {
          const rawName = String(r['Location'] || Object.values(r)[0] || '').trim();
          const parenMatch = rawName.match(/^([^(]+)\s*\([^)]+\)$/);
          const cleanName = parenMatch ? parenMatch[1].trim() : rawName;
          const lower = cleanName.toLowerCase();

          if (validJtLocations.has(lower)) {
            if (seenLocs.has(lower)) {
              // Deduplicate: If multiple (e.g. Helena), prefer canonical 0 drive time / Home direction
              const prev = seenLocs.get(lower);
              const curDt = Number(r['Drive Time (min)'] !== undefined ? r['Drive Time (min)'] : (r['Drive Time'] || 0));
              const curDir = String(r['Direction'] || '').toLowerCase();
              if (lower === 'helena' && (curDt === 0 || curDir === 'home')) {
                const idx = matchedRows.indexOf(prev);
                if (idx !== -1) matchedRows[idx] = r;
                seenLocs.set(lower, r);
              }
            } else {
              seenLocs.set(lower, r);
              matchedRows.push(r);
            }
          }
        });

        // 2. Synthesize missing Job Tracking locations so every JT crew location is present
        validJtLocations.forEach((canonicalName, lower) => {
          if (!seenLocs.has(lower)) {
            let dt = 60;
            let dir = 'Montana';
            if (window.tripPlannerEngine && window.tripPlannerEngine.masterLocations) {
              const mInfo = window.tripPlannerEngine.masterLocations[canonicalName];
              if (mInfo) {
                dt = mInfo.mins;
                dir = mInfo.dir || 'Montana';
              }
            }
            const synthRow = {
              'Location': canonicalName,
              'Drive Time (min)': dt,
              'Direction': dir,
              'Overnight City': '',
              'Base Time (min)': 15,
              'Per Task (min)': 10,
              'Rubber Class Approval': 'CL2'
            };
            matchedRows.push(synthRow);
            seenLocs.set(lower, synthRow);
          }
        });

        // Default sort alphabetically
        matchedRows.sort((a, b) => {
          const nA = String(a['Location'] || Object.values(a)[0] || '').trim();
          const nB = String(b['Location'] || Object.values(b)[0] || '').trim();
          return nA.localeCompare(nB);
        });

        rows = matchedRows;
      }
    }

    // Multi-criteria filtering for inventory sheets
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
          if (this.filterStatus === 'failed_rubber') {
            return stat === 'failed rubber' || assigned === 'failed rubber' || stat === 'failed' || assigned === 'failed';
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

      // 5. Failure Reason Filter (from visual analytics chip clicks)
      if (this.activeFailureReasonFilter && (this.currentSheetKey === 'gloves' || this.currentSheetKey === 'sleeves')) {
        const reason = this.activeFailureReasonFilter.toLowerCase();
        rows = rows.filter(r => {
          const stat = String(r['Status'] || '').trim().toLowerCase();
          const assigned = String(r['Assigned To'] || '').trim().toLowerCase();
          const isFailed = stat === 'failed rubber' || assigned === 'failed rubber' || stat === 'failed' || assigned === 'failed';
          if (!isFailed) return false;

          const nLower = String(r['Notes'] || '').toLowerCase();
          if (reason === 'visual') {
            return nLower.includes('visual') || nLower.includes('cut') || nLower.includes('tear') || nLower.includes('hole') || nLower.includes('puncture') || nLower.includes('ozone');
          }
          if (reason === 'electrical') {
            return nLower.includes('electr') || nLower.includes('dielectric') || nLower.includes('burn');
          }
          if (reason.includes('damage') || reason.includes('field')) {
            return nLower.includes('damag') || nLower.includes('field');
          }
          if (reason.includes('test')) {
            return nLower.includes('test fail') || nLower.includes('failed test');
          }
          if (reason.includes('unspecified')) {
            const isKnown = nLower.includes('visual') || nLower.includes('cut') || nLower.includes('tear') || nLower.includes('hole') || nLower.includes('puncture') || nLower.includes('ozone') ||
                            nLower.includes('electr') || nLower.includes('dielectric') || nLower.includes('burn') ||
                            nLower.includes('damag') || nLower.includes('field') ||
                            nLower.includes('test fail') || nLower.includes('failed test');
            return !isKnown;
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

      // Natural alphanumeric comparison for item numbers with whitespace normalization
      if (isEquipmentSheet && (colLower.includes('item') || colLower.includes('serial') || colLower.includes('tester') || colLower.includes('phasing') || colLower.includes('aed') || colLower.includes('stick') || colLower.includes('blanket') || colLower.includes('mack') || colLower.includes('glove') || colLower.includes('sleeve') || colLower === 'hvt' || colLower === 'hvt #' || colLower === 'ps #' || colLower === 'aed #')) {
        const normA = this.normalizeEquipmentIdentifier(sA);
        const normB = this.normalizeEquipmentIdentifier(sB);
        const isNumA = /^\d+$/.test(normA);
        const isNumB = /^\d+$/.test(normB);
        if (isNumA && isNumB) {
          const diff = parseInt(normA, 10) - parseInt(normB, 10);
          if (diff !== 0) return diff;
        }
        const cmp = normA.localeCompare(normB, undefined, { numeric: true, sensitivity: 'base' });
        if (cmp !== 0) return cmp;
      }

      return sA.localeCompare(sB, undefined, { numeric: true, sensitivity: 'base' });
    };

    const primaryCol = this.getPrimaryItemCol(this.currentSheetKey, headers);

    // Default sort for all equipment sheets: automatically sort by identifying number (ascending natural alphanumeric)
    if (isEquipmentSheet && !this.sortCol && !this.multiSort) {
      this.sortCol = primaryCol;
      this.sortDir = 'asc';
    }

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
      const isPrimaryCol = isEquipmentSheet && (col === primaryCol || col === headers[0]);
      rows.sort((a, b) => {
        let valA = a[col];
        let valB = b[col];
        if (isPrimaryCol) {
          if (!valA || String(valA).trim() === '') {
            valA = a['Item #'] || a['HV Tester'] || a['HVT #'] || a['HVT'] || a['Phasing Set'] || a['PS #'] || a['AED'] || a['Glove'] || a['Sleeve'] || a['Blanket'] || a['MACK'] || a['Serial #'] || a['Hot Stick'] || '';
          }
          if (!valB || String(valB).trim() === '') {
            valB = b['Item #'] || b['HV Tester'] || b['HVT #'] || b['HVT'] || b['Phasing Set'] || b['PS #'] || b['AED'] || b['Glove'] || b['Sleeve'] || b['Blanket'] || b['MACK'] || b['Serial #'] || b['Hot Stick'] || '';
          }
        }
        return dir * compareValues(col, valA, valB);
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
      const primaryCol = this.getPrimaryItemCol(this.currentSheetKey, headers);
      const isItemSorted = this.sortCol && (
        this.sortCol === primaryCol ||
        ['item #', 'item', 'serial #', 'serial', 'hv tester', 'hvt #', 'hvt', 'phasing set', 'ps #', 'aed', 'hot stick'].some(k => this.sortCol.toLowerCase().includes(k))
      );
      const isLocSorted = this.sortCol && this.sortCol.toLowerCase().includes('location');
      const isStatSorted = this.sortCol && this.sortCol.toLowerCase().includes('status');
      const isAssignedSorted = this.sortCol && this.sortCol.toLowerCase().includes('assigned');
      const isChangeOutSorted = this.sortCol && (this.sortCol.toLowerCase().includes('change out') || this.sortCol.toLowerCase().includes('changeout') || this.sortCol.toLowerCase().includes('pad'));

      const itemBtnLabel = this.currentSheetKey === 'hv_testers' ? 'HVT #' : (this.currentSheetKey === 'phasing_sets' ? 'PS #' : (this.currentSheetKey === 'aed' ? 'AED #' : 'Item #'));

      presetBarHtml = `
        <div style="padding: 8px 16px; background-color: var(--bg-secondary); border-bottom: 1px solid var(--border-color); display: flex; align-items: center; gap: 6px; font-size: 12px; overflow-x: auto; flex-wrap: wrap;">
          <span style="color: var(--text-muted); font-weight: 600; white-space: nowrap;">⚡ Quick Sort:</span>
          <button class="btn btn-secondary ${isItemSorted ? 'active' : ''}" style="padding: 3px 8px; font-size: 11px; white-space: nowrap;" onclick="window.sheetNavigator.setPresetSort('itemNum')">🔢 ${itemBtnLabel}${dirArrow(isItemSorted)}</button>
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

      const isNameSorted = this.sortCol && (this.sortCol.toLowerCase().includes('name') || this.sortCol.toLowerCase().includes('employee')) && !this.multiSort;
      const isCertSorted = this.sortCol && (this.sortCol.toLowerCase().includes('type') || this.sortCol.toLowerCase().includes('cert')) && !this.multiSort;
      const isExpSorted = this.sortCol && this.sortCol.toLowerCase().includes('expiration') && !this.multiSort;
      const isDaysSorted = this.sortCol && this.sortCol.toLowerCase().includes('days') && !this.multiSort;
      const isStatSorted = this.sortCol && this.sortCol.toLowerCase().includes('status') && !this.multiSort;
      const isLocSorted = this.sortCol && this.sortCol.toLowerCase().includes('location') && !this.multiSort;
      const isJobSorted = this.sortCol && (this.sortCol.toLowerCase().includes('job') || this.sortCol.toLowerCase().includes('crew')) && !this.multiSort;
      const isLocJobSorted = this.multiSort && this.multiSort.length >= 2 && this.multiSort[0] && this.multiSort[0].toLowerCase().includes('location') && this.multiSort[1] && (this.multiSort[1].toLowerCase().includes('job') || this.multiSort[1].toLowerCase().includes('crew'));

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
            <div style="margin-left: auto; display: flex; gap: 6px; align-items: center;">
              <button class="btn btn-primary" style="font-size: 11px; padding: 4px 10px; background: linear-gradient(135deg, #06b6d4 0%, #0284c7 100%); border: none; font-weight: 700; box-shadow: 0 2px 8px rgba(6,182,212,0.3); display: flex; align-items: center; gap: 5px; cursor: pointer; border-radius: 4px;" onclick="window.sheetNavigator.openCertEmailScannerModal()" title="Scan Gmail inbox and sent mail for cert renewal photos sent from employees">
                <span>📧</span> Scan Gmail for Certs
              </button>
              <button class="btn btn-secondary" style="font-size: 11px; padding: 3px 8px;" onclick="if(window.certsConfigEngine){window.certsConfigEngine.showConfigModal();}">⚙️ Requirements Matrix</button>
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
            <button class="btn btn-secondary ${isLocJobSorted ? 'active' : ''}" style="padding: 2px 7px; font-size: 11px; white-space: nowrap;" onclick="window.sheetNavigator.setPresetSort('locationJob')">📍+🔢 Location then Job #${dirArrow(isLocJobSorted)}</button>
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

    // Pre-calculate duplicate identifiers for equipment sheets so they are flagged visually
    const duplicateIds = new Set();
    if (isEquipmentSheet) {
      const seenIds = new Set();
      (tableData.rows || []).forEach(r => {
        const rawVal = r[primaryCol] || r['Item #'] || r['HV Tester'] || r['HVT #'] || r['Phasing Set'] || r['PS #'] || r['AED'] || r['Glove'] || r['Sleeve'] || r['Blanket'] || r['MACK'] || r['Serial #'] || r['Hot Stick'] || '';
        const idVal = this.normalizeEquipmentIdentifier(rawVal);
        if (idVal) {
          if (seenIds.has(idVal)) {
            duplicateIds.add(idVal);
          } else {
            seenIds.add(idVal);
          }
        }
      });
    }

    let duplicateBannerHtml = '';
    if (isEquipmentSheet && duplicateIds.size > 0) {
      const dupCount = duplicateIds.size;
      const dupList = Array.from(duplicateIds).slice(0, 5).join(', ');
      duplicateBannerHtml = `
        <div style="padding: 8px 16px; background: rgba(239, 68, 68, 0.12); border-bottom: 1px solid rgba(239, 68, 68, 0.35); color: #fca5a5; font-size: 12px; display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-wrap: wrap;">
          <div style="display: flex; align-items: center; gap: 6px;">
            <span style="font-size: 14px;">⚠️</span>
            <span style="font-weight: 700; color: #f87171;">Duplicate Identifying Numbers:</span>
            <span>${dupCount} identifier${dupCount > 1 ? 's' : ''} (#${this.escapeHtml(dupList)}${duplicateIds.size > 5 ? '...' : ''}) ${dupCount > 1 ? 'are' : 'is'} shared by multiple items.</span>
          </div>
          <span style="font-size: 11px; color: #cbd5e1;">Double-click any highlighted item cell to edit or rename.</span>
        </div>
      `;
    }

    let html = presetBarHtml + duplicateBannerHtml + `<table class="data-table"><thead><tr>`;

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
      html += `<th style="width: 140px; text-align: center;">Actions</th>`;
    }
    html += `</tr></thead><tbody>`;

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
        if (this.currentSheetKey === 'expiring_certs') {
          const empVal = String(row['Employee Name'] || row['Name'] || '').trim().toLowerCase();
          const certVal = String(row['Item Type'] || row['Cert Type'] || '').trim().toLowerCase();
          const gIdx = tableData.rawGrid.findIndex((gr, idx) => idx > 0 && String(gr[0] || '').trim().toLowerCase() === empVal && String(gr[1] || '').trim().toLowerCase() === certVal);
          if (gIdx !== -1) sheetRowIdx = gIdx + 1;
        } else {
          const itemVal = String(row['Serial #'] || row['Item #'] || row['Glove'] || row['Sleeve'] || row['Blanket'] || row['MACK'] || row['Name'] || row['Employee Name'] || row['Job Number'] || Object.values(row)[0] || '').trim().toLowerCase();
          if (itemVal) {
            const gIdx = tableData.rawGrid.findIndex((gr, idx) => idx > 0 && String(gr[0] || '').trim().toLowerCase() === itemVal);
            if (gIdx !== -1) sheetRowIdx = gIdx + 1;
          }
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

      // Location Divider Banner for Employees & Expiring Certs (when sorted by Location or Location + Job #)
      const isSortedByLoc = (this.sortCol && this.sortCol.toLowerCase().includes('location')) || (this.multiSort && this.multiSort[0] && this.multiSort[0].toLowerCase().includes('location'));
      if ((isEmployees || this.currentSheetKey === 'expiring_certs') && isSortedByLoc && currentLocVal && currentLocVal !== lastRenderedLoc) {
        lastRenderedLoc = currentLocVal;
        const extraColSpan = (this.currentSheetKey === 'expiring_certs') ? 1 : 0;
        html += `
          <tr style="background: linear-gradient(90deg, #4c1d95 0%, #1e293b 100%);">
            <td colspan="${headers.length + extraColSpan}" style="padding: 8px 16px; font-size: 13px; font-weight: 800; color: #c4b5fd; text-align: left; border-top: 3px solid #8b5cf6; border-bottom: 1px solid #8b5cf6;">
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

      html += `<tr>`;

      headers.forEach((h, colIdx) => {
        let val = row[h] !== undefined ? row[h] : '';
        const hLower = h.toLowerCase();
        let customCellHtml = null;

        // Job Tracking Conditional Formatting
        if (isJobTracking) {
          if (hLower === 'status' || hLower === 'job status') {
            let statusStr = String(val || '').trim();
            if (statusStr.includes('Active')) statusStr = 'Active';
            else if (statusStr.includes('Completed')) statusStr = 'Completed';
            else if (statusStr.includes('Pending Start')) statusStr = 'Pending Start';
            else if (statusStr.includes('On Hold')) statusStr = 'On Hold';

            const jobNum = String(row['Job Number'] || row['Job #'] || row['Crew'] || '').trim();
            let badgeBg = '#15803d';
            let icon = '🟢';
            if (statusStr === 'Active') { badgeBg = '#15803d'; icon = '🟢'; }
            else if (statusStr === 'Pending Start') { badgeBg = '#b45309'; icon = '🟡'; }
            else if (statusStr === 'Completed') { badgeBg = '#0369a1'; icon = '🏁'; }
            else if (statusStr === 'On Hold') { badgeBg = '#64748b'; icon = '⏸️'; }

            customCellHtml = `
              <div style="display: inline-flex; align-items: center; gap: 6px;">
                <span class="badge" style="background-color: ${badgeBg}; color: #fff; padding: 2px 8px; border-radius: 4px; font-weight: 700; cursor: pointer;" title="Click to manage job status / schedule" onclick="window.sheetNavigator.showJobLifecycleModal('${this.escapeHtml(jobNum)}')">${icon} ${this.escapeHtml(statusStr)}</span>
                <button class="btn btn-secondary" style="padding: 1px 5px; font-size: 10px; border-radius: 3px; cursor: pointer;" title="Manage Job Lifecycle / Schedule" onclick="window.sheetNavigator.showJobLifecycleModal('${this.escapeHtml(jobNum)}')">⚙️</button>
                <button class="btn btn-secondary admin-only-control" style="padding: 1px 5px; font-size: 10px; border-radius: 3px; cursor: pointer; color: #f87171; border-color: rgba(239, 68, 68, 0.35); background: rgba(239, 68, 68, 0.08);" title="Delete this Job from Job Tracking" onclick="window.sheetNavigator.deleteJobTrackingRow('${this.escapeHtml(jobNum)}')">🗑️</button>
              </div>
            `;
          } else if (hLower.startsWith('skip ') && hLower !== 'skip days') {
            const isChecked = val === true || val === 'TRUE' || val === 'true';
            customCellHtml = `<span style="cursor: pointer; font-size: 14px;" data-toggle-checkbox="${sheetRowIdx}" data-col="${colIdx + 1}" data-sheet="${this.escapeHtml(tableData.name)}" data-header="${this.escapeHtml(h)}">${isChecked ? '☑️' : '⬜'}</span>`;
          } else if (hLower === 'skip days') {
            const sDays = String(val || '').trim();
            customCellHtml = `<span style="font-size: 11px; color: var(--text-secondary); font-family: monospace;">${this.escapeHtml(sDays || '—')}</span>`;
          } else if (hLower.includes('job number') || hLower === 'job #') {
            customCellHtml = `<span style="font-family: monospace; font-weight: bold; color: #60a5fa;">${this.escapeHtml(val)}</span>`;
          } else if (hLower === 'crew type' || hLower === 'crew discipline' || hLower === 'discipline') {
            let typeStr = String(val || '').trim();
            if (!typeStr) {
              const bn = String(row['Job Number'] || row['Job #'] || row['Crew'] || '').trim();
              const jnLower = String(row['Job Name'] || '').toLowerCase();
              const locLower = String(row['Location'] || row['City'] || '').toLowerCase();
              if (bn.startsWith('005') || jnLower.includes('office') || jnLower.includes('management') || jnLower.includes('admin') || locLower === 'office') {
                typeStr = 'Office';
              } else if (jnLower.includes('substation') || jnLower.includes('sub-station') || jnLower.includes('sub station')) {
                typeStr = 'Substation';
              } else if (jnLower.includes('gas')) {
                typeStr = 'Gas';
              } else if (jnLower.includes('mechanic') || jnLower.includes('shop') || jnLower.includes('garage') || jnLower.includes('fleet')) {
                typeStr = 'Mechanic';
              } else {
                typeStr = 'Electric';
              }
            }
            const jobNum = String(row['Job Number'] || row['Job #'] || row['Crew'] || '').trim();
            let badgeBg = 'rgba(14, 165, 233, 0.15)';
            let textColor = '#38bdf8';
            let borderColor = 'rgba(14, 165, 233, 0.35)';
            if (typeStr === 'Substation') { badgeBg = 'rgba(168, 85, 247, 0.15)'; textColor = '#c084fc'; borderColor = 'rgba(168, 85, 247, 0.35)'; }
            else if (typeStr === 'Gas') { badgeBg = 'rgba(245, 158, 11, 0.15)'; textColor = '#fbbf24'; borderColor = 'rgba(245, 158, 11, 0.35)'; }
            else if (typeStr === 'Office') { badgeBg = 'rgba(16, 185, 129, 0.15)'; textColor = '#34d399'; borderColor = 'rgba(16, 185, 129, 0.35)'; }
            else if (typeStr === 'Mechanic') { badgeBg = 'rgba(148, 163, 184, 0.2)'; textColor = '#94a3b8'; borderColor = 'rgba(148, 163, 184, 0.35)'; }

            if (window.currentRoleMode === 'view_only') {
              customCellHtml = `
                <span class="badge" style="background: ${badgeBg}; color: ${textColor}; border: 1px solid ${borderColor}; padding: 2px 7px; border-radius: 4px; font-weight: 700; font-size: 11px;">
                  ${this.escapeHtml(typeStr)}
                </span>
              `;
            } else {
              customCellHtml = `
                <select class="crew-type-table-select"
                        onclick="event.stopPropagation()"
                        onchange="window.sheetNavigator.quickChangeCrewType('${this.escapeJs(jobNum)}', this.value)"
                        style="background: var(--bg-primary); color: ${textColor}; border: 1px solid ${borderColor}; padding: 3px 8px; border-radius: 6px; font-weight: 700; font-size: 11.5px; cursor: pointer; outline: none;">
                  <option value="Electric" ${typeStr === 'Electric' ? 'selected' : ''}>⚡ Electric</option>
                  <option value="Substation" ${typeStr === 'Substation' ? 'selected' : ''}>🏗️ Substation</option>
                  <option value="Gas" ${typeStr === 'Gas' ? 'selected' : ''}>⛽ Gas</option>
                  <option value="Office" ${typeStr === 'Office' ? 'selected' : ''}>🏢 Office</option>
                  <option value="Mechanic" ${typeStr === 'Mechanic' ? 'selected' : ''}>🔧 Mechanic</option>
                </select>
              `;
            }
          }
        }

        // Safety Compliance Formatting
        if (this.currentSheetKey === 'safety_compliance') {
          const vStr = String(val).trim();
          if (vStr === '✅' || vStr === '✅L' || vStr.startsWith('✅')) {
            const isLate = vStr.includes('L');
            const jobVal = String(row['Job Number'] || row['Job #'] || row['Crew'] || '').trim();
            const weekVal = String(row['Week Start'] || row['Week'] || '').trim();
            customCellHtml = `<span style="font-size: 14px; display: inline-flex; align-items: center; justify-content: center; gap: 2px; cursor: pointer;" title="${isLate ? 'Completed Late (Received after deadline)' : 'Submitted on time'} · Click to view PDF document" onclick="event.stopPropagation(); if (window.safetyComplianceEngine) window.safetyComplianceEngine.openPdfForComplianceCell('${this.escapeJs(jobVal)}', '${this.escapeJs(h)}', '${this.escapeJs(weekVal)}');">✅${isLate ? '<span style="font-size: 9.5px; font-weight: 800; color: #f59e0b;">L</span>' : ''}</span>`;
          } else if (vStr === '❌' || vStr.startsWith('❌')) {
            const letter = vStr.replace('❌', '').trim();
            const badgeColor = letter === 'A' ? '#38bdf8' : (letter === 'W' ? '#fbbf24' : (letter === 'D' ? '#ef4444' : '#c084fc'));
            const desc = letter === 'A' ? 'App / Outbox Stuck' : (letter === 'W' ? 'Weather / Excused' : (letter === 'D' ? 'Did Not Do' : (letter === 'F' ? 'Forgot to Send' : 'Missing Report')));
            customCellHtml = `<span style="font-size: 14px; display: inline-flex; align-items: center; justify-content: center; gap: 2px;" title="${desc}">❌${letter ? `<span style="font-size: 9.5px; font-weight: 800; color: ${badgeColor};">${letter}</span>` : ''}</span>`;
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
            } else if (sUpper === 'NO DATE SET' || sUpper.includes('NO DATE')) {
              customCellHtml = `<span class="badge" style="background-color: #475569; color: #cbd5e1; padding: 2px 8px; border-radius: 4px; font-weight: 600;">⚪ No Date Set</span>`;
            }
          } else if (hLower.includes('days')) {
            if (vStr === 'N/A' || vStr === 'n/a' || vStr === 'No Date Set') {
              customCellHtml = `<span style="color: var(--text-muted); font-size: 11px; font-weight: 600;">${this.escapeHtml(vStr)}</span>`;
            } else {
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
            const ctLower = certType.toLowerCase();
            const isClassCert = ctLower.includes('cpr') || ctLower.includes('1st aid') || ctLower.includes('first aid');

            const hasNotif = vStr.includes('Sent') || vStr.includes('Notified') || vStr.includes('Instruction') || vStr.includes('Registered');

            if (hasNotif) {
              const isInstructionsSent = vStr.toLowerCase().includes('instruction') || vStr.toLowerCase().includes('registered');
              const displayDate = vStr.replace(/^instructions?\s*sent\s*:?\s*/i, '')
                                      .replace(/^sent\s*/i, '')
                                      .replace(/^notified\s*:?\s*/i, '')
                                      .replace(/^registered\s*:?\s*/i, '')
                                      .trim();
              const badgeLabel = isInstructionsSent ? '📋 Instructions' : '✅ Notified';
              const badgeBg = isInstructionsSent ? 'rgba(5, 150, 105, 0.2)' : 'rgba(16, 185, 129, 0.2)';
              const badgeColor = isInstructionsSent ? '#34d399' : '#4ade80';
              const badgeBorder = isInstructionsSent ? 'rgba(5, 150, 105, 0.4)' : 'rgba(16, 185, 129, 0.4)';

              customCellHtml = `
                <div style="display: inline-flex; align-items: center; justify-content: center; gap: 6px; flex-wrap: wrap;">
                  <span class="badge" style="background: ${badgeBg}; color: ${badgeColor}; border: 1px solid ${badgeBorder}; font-size: 11px; padding: 2px 7px; border-radius: 4px; font-weight: 700; display: inline-flex; align-items: center; gap: 4px;" title="Notification logged (${this.escapeHtml(vStr)})">
                    ${badgeLabel}${displayDate ? `: ${this.escapeHtml(displayDate)}` : ''}
                  </span>
                  <button class="btn btn-secondary" style="font-size: 11px; padding: 2px 7px; display: inline-flex; align-items: center; gap: 4px; color: #93c5fd; border-color: rgba(59, 130, 246, 0.4); background: rgba(59, 130, 246, 0.15); cursor: pointer; border-radius: 4px;" title="Resend initial SMS notification to ${this.escapeHtml(rowEmp)}" onclick="if(window.smsDialogEngine){window.smsDialogEngine.openCertSms('${this.escapeJs(rowEmp)}', '${this.escapeJs(certType)}', '${this.escapeJs(expDate)}', ${sheetRowIdx}, ${colIdx + 1});}">
                    💬 Resend
                  </button>
                  ${isClassCert ? `
                    <button class="btn btn-primary" style="font-size: 11px; padding: 2px 7px; background: linear-gradient(135deg, #059669 0%, #047857 100%); border: 1px solid #059669; color: #fff; font-weight: 700; cursor: pointer; border-radius: 4px; display: inline-flex; align-items: center; gap: 4px; box-shadow: 0 1px 3px rgba(0,0,0,0.2);" title="Send class instructions and registration details to ${this.escapeHtml(rowEmp)}" onclick="if(window.smsDialogEngine){window.smsDialogEngine.openClassInstructionsSms('${this.escapeJs(rowEmp)}', '${this.escapeJs(certType)}', '${this.escapeJs(expDate)}', ${sheetRowIdx}, ${colIdx + 1});}">
                      📅 Class Instructions
                    </button>
                  ` : ''}
                </div>
              `;
            } else {
              customCellHtml = `
                <div style="display: inline-flex; align-items: center; justify-content: center; gap: 6px; flex-wrap: wrap;">
                  <button class="btn btn-primary" style="font-size: 11px; padding: 2px 8px; background-color: #f59e0b; border: 1px solid #d97706; color: #fff; font-weight: 700; cursor: pointer; border-radius: 4px; display: inline-flex; align-items: center; gap: 4px; box-shadow: 0 1px 3px rgba(0,0,0,0.2);" title="Send SMS reminder to ${this.escapeHtml(rowEmp)}" onclick="if(window.smsDialogEngine){window.smsDialogEngine.openCertSms('${this.escapeJs(rowEmp)}', '${this.escapeJs(certType)}', '${this.escapeJs(expDate)}', ${sheetRowIdx}, ${colIdx + 1});}">💬 Send SMS</button>
                  ${isClassCert ? `
                    <button class="btn btn-secondary" style="font-size: 11px; padding: 2px 7px; display: inline-flex; align-items: center; gap: 4px; color: #34d399; border-color: rgba(16, 185, 129, 0.4); background: rgba(16, 185, 129, 0.15); cursor: pointer; border-radius: 4px;" title="Send class instructions directly to ${this.escapeHtml(rowEmp)}" onclick="if(window.smsDialogEngine){window.smsDialogEngine.openClassInstructionsSms('${this.escapeJs(rowEmp)}', '${this.escapeJs(certType)}', '${this.escapeJs(expDate)}', ${sheetRowIdx}, ${colIdx + 1});}">📅 Class Instructions</button>
                  ` : ''}
                </div>
              `;
            }
          }
        }

        // Training Tracking Formatting
        if (this.currentSheetKey === 'training_tracking') {
          const vStr = String(val || '').trim();
          const sLower = vStr.toLowerCase();
          if (hLower === 'status' || hLower === 'training status') {
            let bBg = '#d97706';
            let bText = '⏳ Scheduled';
            if (sLower === 'complete' || sLower === 'completed' || sLower === 'done') {
              bBg = '#15803d';
              bText = '✅ Complete';
            } else if (sLower === 'scheduled' || sLower === 'pending') {
              bBg = '#d97706';
              bText = '⏳ Scheduled';
            } else if (sLower === 'on hold' || sLower === 'postponed') {
              bBg = '#7c3aed';
              bText = '⏸️ On Hold';
            } else if (sLower === 'cancelled' || sLower === 'canceled') {
              bBg = '#475569';
              bText = '❌ Cancelled';
            } else if (sLower === 'n/a' || sLower === 'na') {
              bBg = '#334155';
              bText = '🚫 N/A';
            } else if (vStr) {
              bText = vStr;
            }
            customCellHtml = `<span class="badge badge-training-status-clickable" style="background-color: ${bBg}; color: #fff; padding: 3px 9px; border-radius: 4px; font-weight: 700; cursor: pointer; display: inline-flex; align-items: center; gap: 4px; user-select: none;" title="Click to change training status"><span>${this.escapeHtml(bText)}</span> <span style="font-size: 10px; opacity: 0.7;">▾</span></span>`;
          } else if (hLower === 'completion date' || hLower === 'date completed') {
            const dStr = String(val || '').trim();
            if (dStr && dStr !== '—' && dStr !== '-') {
              customCellHtml = `
                <div style="display: inline-flex; align-items: center; gap: 6px;">
                  <span class="cell-text" style="font-weight: 600; color: #60a5fa; font-family: monospace;">📅 ${this.escapeHtml(dStr)}</span>
                  <button class="btn btn-secondary btn-pick-training-date" style="padding: 1px 5px; font-size: 10px; border-radius: 3px; cursor: pointer; color: #93c5fd;" title="Pick or change completion date" onclick="event.stopPropagation(); window.sheetNavigator.promptTrainingDate(this.closest('td'));">📅</button>
                </div>
              `;
            } else {
              customCellHtml = `
                <button class="btn btn-secondary btn-pick-training-date" style="padding: 2px 8px; font-size: 11px; border-radius: 4px; cursor: pointer; color: #94a3b8; border-style: dashed;" title="Set training completion date" onclick="event.stopPropagation(); window.sheetNavigator.promptTrainingDate(this.closest('td'));">
                  ➕ Set Date
                </button>
              `;
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
          const isDup = duplicateIds.has(this.normalizeEquipmentIdentifier(itemKey));
          const dupBadge = isDup ? `<span class="badge" style="background: rgba(239, 68, 68, 0.25); color: #fca5a5; border: 1px solid #ef4444; font-size: 10px; padding: 1px 5px; margin-left: 6px; border-radius: 4px; font-weight: 700; white-space: nowrap; cursor: pointer;" title="Duplicate identifier! Another item in this sheet shares this number. Double-click to edit/rename.">⚠️ Duplicate</span>` : '';
          customCellHtml = `<span style="font-weight: 700; color: #60a5fa; cursor: pointer; text-decoration: underline dotted; display: inline-block; padding: 2px 4px; border-radius: 4px;" title="Click to inspect lifecycle dossier for #${this.escapeHtml(itemKey)}" onclick="if(window.itemStatsEngine){window.itemStatsEngine.openDossierModal('${this.escapeJs(itemKey)}', '${this.escapeJs(histKey)}');}">${this.escapeHtml(val)}</span>${dupBadge}`;
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

        // Equipment Sheet Status Formatting (Assigned, Pre-Assigned, On Shelf, etc.)
        if (isEquipmentSheet && hLower === 'status') {
          const sVal = String(val || '').trim();
          const sLower = sVal.toLowerCase();

          const holderRaw = String(row['Assigned To'] || row['Holder'] || '').trim();
          const cleanHolder = holderRaw.replace(/\s*\([^)]*\)/g, '').toLowerCase().trim();
          const isPendingHolder = Boolean(pendingEmps && pendingEmps.has(cleanHolder));

          // Pre-Assigned applies ONLY to items assigned to pending new hire employees that have a future hire date
          if (sLower === 'assigned' && isPendingHolder) {
            const pendingInfo = pendingEmps.get(cleanHolder);
            const startDateStr = pendingInfo?.hireDate || '';
            let shortDate = '';
            if (startDateStr) {
              const sp = startDateStr.split(/[-/]/);
              if (sp.length === 3) {
                shortDate = sp[0].length === 4 ? `${sp[1]}/${sp[2]}` : `${sp[0]}/${sp[1]}`;
              }
            }
            const label = shortDate ? `⏳ Pre-Assigned (${shortDate})` : `⏳ Pre-Assigned`;
            customCellHtml = `<span class="cell-text" style="display:none;">${this.escapeHtml(val)}</span><span class="badge" style="background: rgba(245, 158, 11, 0.2); color: #fbbf24; border: 1px solid rgba(245, 158, 11, 0.5); padding: 2px 8px; border-radius: 4px; font-weight: 700; white-space: nowrap;" title="Pre-assigned to pending hire starting ${this.escapeHtml(startDateStr || 'in future')}. Underlying database status remains 'Assigned'.">${label}</span>`;
          } else if (sLower === 'assigned') {
            customCellHtml = `<span class="cell-text" style="display:none;">${this.escapeHtml(val)}</span><span class="badge" style="background: rgba(16, 185, 129, 0.15); color: #10b981; border: 1px solid rgba(16, 185, 129, 0.35); padding: 2px 8px; border-radius: 4px; font-weight: 700;">🟢 Assigned</span>`;
          } else if (sLower === 'on shelf') {
            customCellHtml = `<span class="cell-text" style="display:none;">${this.escapeHtml(val)}</span><span class="badge" style="background: rgba(59, 130, 246, 0.15); color: #60a5fa; border: 1px solid rgba(59, 130, 246, 0.35); padding: 2px 8px; border-radius: 4px; font-weight: 700;">📦 On Shelf</span>`;
          } else if (sLower.includes('in testing')) {
            customCellHtml = `<span class="cell-text" style="display:none;">${this.escapeHtml(val)}</span><span class="badge" style="background: rgba(168, 85, 247, 0.15); color: #c084fc; border: 1px solid rgba(168, 85, 247, 0.35); padding: 2px 8px; border-radius: 4px; font-weight: 700;">🔬 In Testing</span>`;
          } else if (sLower.includes('delivery')) {
            customCellHtml = `<span class="cell-text" style="display:none;">${this.escapeHtml(val)}</span><span class="badge" style="background: rgba(245, 158, 11, 0.15); color: #fbbf24; border: 1px solid rgba(245, 158, 11, 0.35); padding: 2px 8px; border-radius: 4px; font-weight: 700;">🚚 ${this.escapeHtml(sVal)}</span>`;
          } else if (sLower.includes('lost')) {
            customCellHtml = `<span class="cell-text" style="display:none;">${this.escapeHtml(val)}</span><span class="badge" style="background: rgba(239, 68, 68, 0.2); color: #f87171; border: 1px solid rgba(239, 68, 68, 0.4); padding: 2px 8px; border-radius: 4px; font-weight: 700;">❌ Lost</span>`;
          } else if (sLower.includes('destroyed')) {
            customCellHtml = `<span class="cell-text" style="display:none;">${this.escapeHtml(val)}</span><span class="badge" style="background: rgba(100, 116, 139, 0.2); color: #94a3b8; border: 1px solid rgba(100, 116, 139, 0.4); padding: 2px 8px; border-radius: 4px; font-weight: 700;">💥 Destroyed</span>`;
          } else if (sLower.includes('failed')) {
            customCellHtml = `<span class="cell-text" style="display:none;">${this.escapeHtml(val)}</span><span class="badge" style="background: rgba(220, 38, 38, 0.2); color: #fca5a5; border: 1px solid rgba(220, 38, 38, 0.4); padding: 2px 8px; border-radius: 4px; font-weight: 700;">⚠️ Failed</span>`;
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

        // Locations & Approvals Formatting
        if (this.currentSheetKey === 'locations') {
          if (colIdx === 0 || hLower === 'location') {
            customCellHtml = `<span style="font-weight: 700; color: #60a5fa;">📍 ${this.escapeHtml(val)}</span>`;
          } else if (hLower.includes('rubber class') || hLower.includes('approval')) {
            const vUpper = String(val || '').trim().toUpperCase();
            let bColor = '#2563eb';
            let bText = '🧤 CL2';
            if (vUpper === 'CL3') {
              bColor = '#7c3aed';
              bText = '⚡ CL3';
            } else if (vUpper === 'CL2') {
              bColor = '#2563eb';
              bText = '🧤 CL2';
            } else if (vUpper === 'CL2 & CL3' || vUpper === 'CL2 & 3' || vUpper.includes('&') || vUpper.includes('BOTH')) {
              bColor = '#059669';
              bText = '🔄 CL2 & CL3';
            } else if (vUpper === 'NONE') {
              bColor = '#475569';
              bText = '🚫 None';
            } else {
              bText = `🧤 ${this.escapeHtml(val || 'CL2')}`;
            }
            customCellHtml = `<span class="badge badge-approval-clickable" style="background-color: ${bColor}; color: #fff; padding: 3px 9px; border-radius: 4px; font-weight: 700; cursor: pointer; display: inline-flex; align-items: center; gap: 4px; user-select: none;" title="Click to change rubber class approval"><span>${bText}</span> <span style="font-size: 10px; opacity: 0.7;">▾</span></span>`;
          } else if (hLower === 'direction') {
            customCellHtml = `<span style="font-weight: 600; color: #cbd5e1;">🧭 ${this.escapeHtml(val)}</span>`;
          }
        }

        const isSmsCol = hLower.includes('sms');
        const isLocationNameCol = (this.currentSheetKey === 'locations' && (colIdx === 0 || hLower === 'location'));
        const isCrewTypeCol = ['crew type', 'crew discipline', 'discipline'].includes(hLower);
        const isBlankPrimary = isPrimaryItemCol && (!val || String(val).trim() === '' || String(val).trim() === '—' || String(val).trim() === '-');
        const isTrainingStatusCol = this.currentSheetKey === 'training_tracking' && (hLower === 'status' || hLower === 'training status');
        const isJobTrackingStatusCol = isJobTracking && (hLower === 'status' || hLower === 'job status');
        const isEditable = (!isPrimaryItemCol || isBlankPrimary) && !isEmployeeNameCol && !isLocationNameCol && !isSmsCol && !isCrewTypeCol && !isJobTrackingStatusCol && !hLower.includes('change out') && !hLower.startsWith('skip ') && window.currentRoleMode !== 'view_only';
        let itemIdentifier = '';
        if (this.currentSheetKey === 'expiring_certs') {
          itemIdentifier = `${row['Employee Name'] || row['Name'] || ''} | ${row['Item Type'] || row['Cert Type'] || ''}`;
        } else if (this.currentSheetKey === 'training_tracking') {
          itemIdentifier = `${row['Month'] || ''} | ${row['Crew #'] || row['Crew'] || ''} | ${row['Training Topic'] || ''}`;
        } else {
          itemIdentifier = String(row['Item #'] || row['HVT #'] || row['Phasing Set #'] || row['AED #'] || row['Glove'] || row['Sleeve'] || row['Blanket'] || row['MACK'] || row['Serial #'] || row['Name'] || row['Employee Name'] || row['Job Number'] || Object.values(row)[0] || '').trim();
        }

        html += `<td class="${isEditable ? 'editable' : ''}" 
                     contenteditable="${isEditable && !isTrainingStatusCol && !isJobTrackingStatusCol}" 
                     data-row="${sheetRowIdx}" 
                     data-col="${colIdx + 1}" 
                     data-header="${this.escapeHtml(h)}"
                     data-primary="${isPrimaryItemCol ? 'true' : 'false'}"
                     data-item="${this.escapeHtml(itemIdentifier)}"
                     data-sheet="${this.escapeHtml(tableData.name)}">${customCellHtml !== null ? customCellHtml : this.escapeHtml(val)}</td>`;
      });
      if (this.currentSheetKey === 'expiring_certs') {
        const empName = String(row['Employee Name'] || row['Name'] || Object.values(row)[0] || '').trim();
        const certType = String(row['Item Type'] || row['Cert Type'] || row['Certification'] || '').trim();
        const photoSummary = this.db && typeof this.db.getCertPhotoStatusSummary === 'function'
          ? this.db.getCertPhotoStatusSummary(empName, certType)
          : { hasAll: false, hasAny: false, isMultiSlot: false, count: 0, total: 1 };

        let proofBtnHtml = '';
        if (photoSummary.hasAll) {
          proofBtnHtml = `<button class="btn btn-secondary" style="padding: 2px 7px; font-size: 11px; color: #34d399; border-color: rgba(52, 211, 153, 0.45); background: rgba(52, 211, 153, 0.12); cursor: pointer; margin-right: 4px; font-weight: 700;" onclick="window.sheetNavigator.openCertPhotoModal('${this.escapeJs(empName)}', '${this.escapeJs(certType)}', ${sheetRowIdx})" title="View attached renewal proof / 1-Click Email to HR">🖼️ Proof${photoSummary.isMultiSlot ? ` (${photoSummary.count}/${photoSummary.total})` : ''}</button>`;
        } else if (photoSummary.hasAny) {
          proofBtnHtml = `<button class="btn btn-secondary" style="padding: 2px 7px; font-size: 11px; color: #fbbf24; border-color: rgba(251, 191, 36, 0.45); background: rgba(251, 191, 36, 0.12); cursor: pointer; margin-right: 4px; font-weight: 700;" onclick="window.sheetNavigator.openCertPhotoModal('${this.escapeJs(empName)}', '${this.escapeJs(certType)}', ${sheetRowIdx})" title="Partial renewal proof (${photoSummary.count}/${photoSummary.total}) - click to complete">📷 ${photoSummary.count}/${photoSummary.total}</button>`;
        } else {
          proofBtnHtml = `<button class="btn btn-secondary" style="padding: 2px 7px; font-size: 11px; color: #94a3b8; border-color: rgba(148, 163, 184, 0.3); background: rgba(148, 163, 184, 0.05); cursor: pointer; margin-right: 4px;" onclick="window.sheetNavigator.openCertPhotoModal('${this.escapeJs(empName)}', '${this.escapeJs(certType)}', ${sheetRowIdx})" title="Attach cert renewal proof photo (texted from employee)">📷 Attach</button>`;
        }

        html += `<td class="admin-only-control" style="text-align: center; width: 140px; white-space: nowrap;">
          ${proofBtnHtml}
          <button class="btn btn-secondary" style="padding: 2px 7px; font-size: 11px; color: #60a5fa; border-color: rgba(96, 165, 250, 0.35); background: rgba(96, 165, 250, 0.08); cursor: pointer; margin-right: 4px;" onclick="window.sheetNavigator.openCertEditModal(${sheetRowIdx})" title="Edit certification dates, provider & notes">✏️</button>
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
      const header = (td.dataset.header || '').toLowerCase();
      const isAssignedCol = (header.includes('assigned') || header === 'holder') && !header.includes('date');
      const isEmpDepartureCol = this.currentSheetKey === 'employees' && (header === 'location' || header === 'last day reason');
      const isLocationApprovalCol = this.currentSheetKey === 'locations' && (header.includes('rubber class') || header.includes('approval') || header === 'direction');
      const isTrainingStatusCol = this.currentSheetKey === 'training_tracking' && (header === 'status' || header === 'training status');
      const hasAutocomplete = isAssignedCol || isEmpDepartureCol || isLocationApprovalCol || isTrainingStatusCol;

      td.addEventListener('focus', () => {
        const targetCell = td;
        const cellTextSpan = targetCell.querySelector('.cell-text');
        if (cellTextSpan) {
          initialVal = cellTextSpan.textContent.trim();
        } else {
          initialVal = targetCell.textContent.trim().replace(/^👤\s*/, '').replace(/^(?:✅|⏳|⏸️?|❌|🚫|\s)+/gu, '').replace(/[▾▲\s]+$/, '').trim();
        }
        if (hasAutocomplete) {
          const currentText = (cellTextSpan ? cellTextSpan.textContent : td.textContent).trim().replace(/^👤\s*/, '').replace(/^(?:✅|⏳|⏸️?|❌|🚫|\s)+/gu, '').replace(/[▾▲\s]+$/, '').trim();
          this.showCellAutocomplete(td, currentText);
        }
      });

      if (isLocationApprovalCol || isTrainingStatusCol) {
        td.addEventListener('click', () => {
          this.showCellAutocomplete(td, '');
        });
      }

      if (hasAutocomplete) {
        td.addEventListener('input', () => {
          const cellTextSpan = td.querySelector('.cell-text');
          const currentText = (cellTextSpan ? cellTextSpan.textContent : td.textContent).trim().replace(/^👤\s*/, '').trim();
          this.showCellAutocomplete(td, currentText);
        });
      }

      // Quick calendar picker on double-click for date cells & Item # rename prompt
      td.addEventListener('dblclick', () => {
        if (window.currentRoleMode === 'view_only') return;

        if (td.dataset.primary === 'true') {
          const currentItemNum = (td.querySelector('.cell-text') ? td.querySelector('.cell-text').textContent : td.textContent).trim().replace(/^👤\s*/, '');
          const targetRow = td.dataset.row ? parseInt(td.dataset.row, 10) : null;
          const promptMsg = currentItemNum ? `Edit Item # (Current: ${currentItemNum}):` : 'Enter Item # / Equipment #:';
          const entered = prompt(promptMsg, currentItemNum);
          if (entered !== null) {
            const newItemNum = entered.trim();
            if (newItemNum && newItemNum !== currentItemNum) {
              const curTable = this.db.getTable(this.currentSheetKey);
              if (curTable && curTable.rows) {
                const dup = curTable.rows.find(r => {
                  const rNum = String(r['Item #'] || r['HV Tester'] || r['Phasing Set'] || r['AED'] || r['Glove'] || r['Sleeve'] || r['Blanket'] || r['MACK'] || r['Serial #'] || Object.values(r)[0] || '').trim().toLowerCase();
                  return rNum === newItemNum.toLowerCase() && r._rowIdx !== targetRow;
                });
                if (dup) {
                  alert(`⛔ Duplicate Error: Item #${newItemNum} already exists in ${curTable.name || this.currentSheetKey}!`);
                  return;
                }
              }
              td.textContent = newItemNum;
              td.focus();
              td.blur();
            }
          }
          return;
        }

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
              targetCell.blur();
            }
            picker.remove();
          });
          if (typeof picker.showPicker === 'function') {
            try { picker.showPicker(); } catch { picker.click(); }
          }
        }
      });

      td.addEventListener('keydown', (e) => {
        const dropdown = document.getElementById('cell-autocomplete-dropdown');
        const isDropdownOpen = dropdown && dropdown.style.display === 'block';

        if (isDropdownOpen) {
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            this.navigateAutocomplete(1);
            return;
          }
          if (e.key === 'ArrowUp') {
            e.preventDefault();
            this.navigateAutocomplete(-1);
            return;
          }
          if (e.key === 'Enter' || e.key === 'Tab') {
            e.preventDefault();
            this.selectActiveAutocomplete(td);
            return;
          }
          if (e.key === 'Escape') {
            e.preventDefault();
            this.closeCellAutocomplete();
            return;
          }
        }

        if (e.key === 'Enter') {
          e.preventDefault();
          this.closeCellAutocomplete();
          td.blur();
        }
      });

      td.addEventListener('blur', async () => {
        setTimeout(() => this.closeCellAutocomplete(), 200);

        try {
          const targetCell = td;
          const cellTextSpan = targetCell.querySelector('.cell-text');
          let newVal = (cellTextSpan ? cellTextSpan.textContent : targetCell.textContent).trim().replace(/^👤\s*/, '').trim();
          const header = targetCell.dataset.header || '';
          const hLower = header.toLowerCase();
          const isDateCol = hLower.includes('date') || hLower.includes('expiration') || hLower.includes('calibration');

          if (this.currentSheetKey === 'training_tracking' && (hLower === 'status' || hLower === 'training status')) {
            newVal = newVal.replace(/^(?:✅|⏳|⏸️?|❌|🚫|\s)+/gu, '').replace(/[▾▲\s]+$/, '').trim();
            if (/^completed?$/i.test(newVal)) newVal = 'Complete';
            else if (/^scheduled?|^pending$/i.test(newVal)) newVal = 'Scheduled';
            else if (/^on\s*hold|^postponed$/i.test(newVal)) newVal = 'On Hold';
            else if (/^cancelled?|^canceled$/i.test(newVal)) newVal = 'Cancelled';
            else if (/^n\/?a$/i.test(newVal)) newVal = 'N/A';
          }

          if (this.currentSheetKey === 'training_tracking' && (hLower === 'completion date' || hLower === 'date completed')) {
            newVal = newVal.replace(/^(?:📅|➕|\s)+/gu, '').replace(/^Set Date/i, '').trim();
          }

          if (isEquipmentSheet && hLower === 'status') {
            newVal = newVal.replace(/^(?:✅|⏳|🟢|📦|🔬|🚚|❌|💥|⚠️|\s)+/gu, '').replace(/[▾▲\s]+$/, '').trim();
            if (/^pre-assigned/i.test(newVal) || /^preassigned/i.test(newVal)) newVal = 'Assigned';
            else if (/^assigned/i.test(newVal)) newVal = 'Assigned';
            else if (/^on\s*shelf/i.test(newVal)) newVal = 'On Shelf';
            else if (/^in\s*testing/i.test(newVal)) newVal = 'In Testing';
            else if (/^packed\s*for\s*delivery|^ready\s*for\s*delivery/i.test(newVal)) newVal = 'Ready For Delivery';
            else if (/^packed\s*for\s*testing/i.test(newVal)) newVal = 'Packed For Testing';
            else if (/^lost/i.test(newVal)) newVal = 'Lost';
            else if (/^destroyed/i.test(newVal)) newVal = 'Destroyed';
            else if (/^failed/i.test(newVal)) newVal = 'Failed';
          }

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

          if (this.currentSheetKey === 'locations' && (hLower.includes('rubber class') || hLower.includes('approval'))) {
            const nUpper = newVal.toUpperCase();
            if (nUpper.includes('CL3') && !nUpper.includes('&') && !nUpper.includes('BOTH') && !nUpper.includes('CL2')) newVal = 'CL3';
            else if (nUpper.includes('CL2') && (nUpper.includes('CL3') || nUpper.includes('&') || nUpper.includes('BOTH'))) newVal = 'CL2 & CL3';
            else if (nUpper.includes('NONE')) newVal = 'None';
            else if (nUpper.includes('CL2')) newVal = 'CL2';
          }

          const sheetName = targetCell.dataset.sheet || (tableData ? tableData.name : this.currentSheetKey);
          const row = parseInt(targetCell.dataset.row, 10);
          const col = parseInt(targetCell.dataset.col, 10);
          const itemIdentifier = targetCell.dataset.item || '';

          const tableData = this.db.getTable(this.currentSheetKey);
          let tableRow = null;
          let actualRowIdx = row;

          if (tableData) {
            // 1. Direct match by exact row index (fastest and most accurate for all sheets)
            if (row && tableData.rows) {
              tableRow = tableData.rows.find(r => r._rowIdx === row);
            }

            // 2. For expiring_certs, if not found by _rowIdx, match by composite "Employee Name | Item Type"
            if (!tableRow && this.currentSheetKey === 'expiring_certs' && tableData.rows && itemIdentifier) {
              const parts = itemIdentifier.split('|').map(s => s.trim().toLowerCase());
              if (parts.length === 2) {
                tableRow = tableData.rows.find(r => {
                  const rEmp = String(r['Employee Name'] || r['Name'] || '').trim().toLowerCase();
                  const rType = String(r['Item Type'] || r['Cert Type'] || '').trim().toLowerCase();
                  return rEmp === parts[0] && rType === parts[1];
                });
                if (tableRow && tableRow._rowIdx) actualRowIdx = tableRow._rowIdx;
              }
            }

            // 3. For single-key sheets (inventory by item#, employees by name), use itemIdentifier fallback
            const isMultiRowSheet = ['expiring_certs', 'training_tracking', 'safety_compliance', 'dot_drug_tests'].includes(this.currentSheetKey);
            if (!tableRow && !isMultiRowSheet) {
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

          // Check for Employee Departure / Archive triggers on Employees sheet
          if (this.currentSheetKey === 'employees' && tableRow) {
            const isLocCol = hLower === 'location';
            const isReasonCol = hLower === 'last day reason';
            const isLastDayCol = hLower === 'last day';

            const isLocationPrevious = isLocCol && (valLower === 'previous employee' || valLower.includes('previous'));
            const isReasonEntered = isReasonCol && newVal && newVal.trim() !== '';
            const isIncompleteDeparture = (isLocCol || isReasonCol || isLastDayCol) && 
              (valLower.includes('previous') || (tableRow['Location'] && String(tableRow['Location']).toLowerCase().includes('previous'))) &&
              (!tableRow['Last Day Reason'] || !tableRow['Last Day']);

            if (isLocationPrevious || isReasonEntered || isIncompleteDeparture) {
              const triggeredReason = isReasonEntered ? newVal : (tableRow['Last Day Reason'] || '');
              await this.openEmployeeDepartureModal(tableRow, targetCell, initialVal, triggeredReason);
              return;
            }
          }

          if (newVal === initialVal && !isUnreconciledShelf) return; // No change made!

          // Strict validation & Auto-resolution for Assigned To column
          let assignedResolved = null;
          if (isAssignedCol && newVal) {
            if (window.employeeResolver) {
              assignedResolved = window.employeeResolver.resolve(newVal, initialVal);
              if (!assignedResolved.match) {
                console.warn(`[Strict Assigned To] Rejected unrecognized employee/status: "${newVal}"`);
                if (window.showToast) {
                  window.showToast(`Unrecognized employee name: "${newVal}". Please select a valid employee from the list.`, 'warning');
                } else {
                  alert(`Unrecognized employee name: "${newVal}".\n\nPlease select an active employee or valid status (e.g. On Shelf).`);
                }

                // Revert to initialVal
                if (initialVal) {
                  const nonEmpHolders = ['on shelf', 'in testing', 'packed for testing', 'packed for delivery', 'failed rubber', 'failed', 'lost', 'destroyed', 'new', 'unassigned', 'n/a', '—', '-'];
                  if (!nonEmpHolders.includes(initialVal.toLowerCase())) {
                    targetCell.innerHTML = `<span class="profile-link-badge" style="color: #60a5fa; cursor: pointer; margin-right: 4px; display: inline-block;" title="Click to view assignments & certs for ${this.escapeHtml(initialVal)}" onclick="event.stopPropagation(); if(window.employeeProfileEngine){window.employeeProfileEngine.openProfileModal('${this.escapeJs(initialVal)}');}">👤</span><span class="cell-text" style="font-weight: 600; color: #93c5fd;">${this.escapeHtml(initialVal)}</span>`;
                  } else {
                    targetCell.textContent = initialVal;
                  }
                } else {
                  targetCell.textContent = '';
                }
                return;
              }

              // Automatically choose the correct spelling / canonical alias
              newVal = assignedResolved.employeeName || newVal;
              targetCell.textContent = newVal;
            }
          }

          const queueCell = async (hName, val, skipHistory = false) => {
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
                value: val,
                skipHistory: skipHistory
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
              } else if (this.currentSheetKey === 'training_tracking' && (hNameLower === 'completion date' || hNameLower === 'date completed')) {
                if (v && v !== '—' && v !== '-') {
                  c.innerHTML = `<div style="display: inline-flex; align-items: center; gap: 6px;"><span class="cell-text" style="font-weight: 600; color: #60a5fa; font-family: monospace;">📅 ${this.escapeHtml(v)}</span><button class="btn btn-secondary btn-pick-training-date" style="padding: 1px 5px; font-size: 10px; border-radius: 3px; cursor: pointer; color: #93c5fd;" title="Pick or change completion date" onclick="event.stopPropagation(); window.sheetNavigator.promptTrainingDate(this.closest('td'));">📅</button></div>`;
                } else {
                  c.innerHTML = `<button class="btn btn-secondary btn-pick-training-date" style="padding: 2px 8px; font-size: 11px; border-radius: 4px; cursor: pointer; color: #94a3b8; border-style: dashed;" title="Set training completion date" onclick="event.stopPropagation(); window.sheetNavigator.promptTrainingDate(this.closest('td'));">➕ Set Date</button>`;
                }
              } else if (this.currentSheetKey === 'training_tracking' && (hNameLower === 'status' || hNameLower === 'training status')) {
                const sLower = String(v || '').toLowerCase();
                let bBg = '#d97706';
                let bText = '⏳ Scheduled';
                if (sLower === 'complete' || sLower === 'completed' || sLower === 'done') {
                  bBg = '#15803d';
                  bText = '✅ Complete';
                } else if (sLower === 'scheduled' || sLower === 'pending') {
                  bBg = '#d97706';
                  bText = '⏳ Scheduled';
                } else if (sLower === 'on hold' || sLower === 'postponed') {
                  bBg = '#7c3aed';
                  bText = '⏸️ On Hold';
                } else if (sLower === 'cancelled' || sLower === 'canceled') {
                  bBg = '#475569';
                  bText = '❌ Cancelled';
                } else if (sLower === 'n/a' || sLower === 'na') {
                  bBg = '#334155';
                  bText = '🚫 N/A';
                } else if (v) {
                  bText = v;
                }
                c.innerHTML = `<span class="badge badge-training-status-clickable" style="background-color: ${bBg}; color: #fff; padding: 3px 9px; border-radius: 4px; font-weight: 700; cursor: pointer; display: inline-flex; align-items: center; gap: 4px; user-select: none;" title="Click to change training status"><span>${this.escapeHtml(bText)}</span> <span style="font-size: 10px; opacity: 0.7;">▾</span></span>`;
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

            if (assignedColName) { await queueCell(assignedColName, 'On Shelf', true); updateRowCell(assignedColName, 'On Shelf'); }
            if (statusColName) { await queueCell(statusColName, 'On Shelf', true); updateRowCell(statusColName, 'On Shelf'); }
            if (locationColName) { await queueCell(locationColName, 'Helena', true); updateRowCell(locationColName, 'Helena'); }
            if (dateAssignedColName) { await queueCell(dateAssignedColName, todayFormatted, true); updateRowCell(dateAssignedColName, todayFormatted); }
            if (testDateColName && shelfDetails.testDate) { await queueCell(testDateColName, shelfDetails.testDate, true); updateRowCell(testDateColName, shelfDetails.testDate); }
            if (eslColName && shelfDetails.eslId) { await queueCell(eslColName, shelfDetails.eslId, true); updateRowCell(eslColName, shelfDetails.eslId); }
            if (pickedColName) { await queueCell(pickedColName, '', true); updateRowCell(pickedColName, ''); }
            if (chgOutColName && calculatedShelfDate) { await queueCell(chgOutColName, calculatedShelfDate, true); updateRowCell(chgOutColName, calculatedShelfDate); }

            await this.db.recordItemHistoryEvent(sheetName, tableRow, `Returned to Shelf (Test Date: ${shelfDetails.testDate || todayFormatted})`);
            flashSuccess();
            return;
          }

          if (isInventorySheet && tableRow && tableData) {
            const assignedColName = (tableData.headers || []).find(h => /assigned\s*to|^assigned$|^holder$/i.test(h));
            const statusColName = (tableData.headers || []).find(h => /^status$|^item\s*status$/i.test(h));
            const locationColName = (tableData.headers || []).find(h => /^location$/i.test(h));
            const pickedColName = (tableData.headers || []).find(h => /^picked\s*for$/i.test(h));
            const dateAssignedColName = (tableData.headers || []).find(h => /date\s*assigned/i.test(h));
            const chgOutColName = (tableData.headers || []).find(h => /change\s*out/i.test(h));
            const testDateColName = (tableData.headers || []).find(h => /test\s*date|calibration/i.test(h));
            const classColName = (tableData.headers || []).find(h => /^class$/i.test(h)) || 'Class';

            const curAssigned = isAssignedCol ? newVal : String(tableRow[assignedColName] || '').trim();
            const curAssignedLower = curAssigned.toLowerCase();
            const nonEmpHolders = ['on shelf', 'in testing', 'packed for testing', 'packed for delivery', 'failed rubber', 'failed', 'lost', 'destroyed', 'new', 'unassigned', 'n/a', '—', '-'];
            const isAssignedToEmp = curAssigned && !nonEmpHolders.includes(curAssignedLower);

            // In Testing (Lab)
            const isInTesting = valLower === 'in testing' || valLower === 'testing' || valLower === 'lab' || valLower === 'arnett' || valLower === 'jm test' || valLower === 'arnett / jm test';
            if ((isAssignedCol || isStatusCol) && isInTesting) {
              const today = new Date();
              const todayFormatted = `${String(today.getMonth() + 1).padStart(2, '0')}/${String(today.getDate()).padStart(2, '0')}/${today.getFullYear()}`;

              const targetAssigned = 'In Testing';
              const targetStatus = 'In Testing';
              const targetLoc = 'Arnett / JM Test';
              const targetDate = todayFormatted;

              newVal = isAssignedCol ? targetAssigned : targetStatus;
              targetCell.textContent = newVal;

              if (tableRow) {
                if (assignedColName) tableRow[assignedColName] = targetAssigned;
                if (statusColName) tableRow[statusColName] = targetStatus;
                if (locationColName) tableRow[locationColName] = targetLoc;
                if (dateAssignedColName) tableRow[dateAssignedColName] = targetDate;
                if (pickedColName) tableRow[pickedColName] = '';
              }

              // Recalculate Change Out Date
              const curTestDate = testDateColName ? (tableRow[testDateColName] || '') : '';
              let calculatedChgOut = '';
              if (window.inventoryManager && typeof window.inventoryManager.calculateChangeOutDate === 'function') {
                calculatedChgOut = window.inventoryManager.calculateChangeOutDate(
                  targetDate || curTestDate,
                  targetLoc,
                  targetAssigned,
                  this.currentSheetKey,
                  { testDate: curTestDate, calibrationDate: curTestDate }
                );
              }
              if (calculatedChgOut && chgOutColName && calculatedChgOut !== 'N/A') {
                tableRow[chgOutColName] = calculatedChgOut;
              }

              syncTableRowToGrid();

              if (assignedColName) { await queueCell(assignedColName, targetAssigned, true); updateRowCell(assignedColName, targetAssigned); }
              if (statusColName) { await queueCell(statusColName, targetStatus, true); updateRowCell(statusColName, targetStatus); }
              if (locationColName) { await queueCell(locationColName, targetLoc, true); updateRowCell(locationColName, targetLoc); }
              if (dateAssignedColName) { await queueCell(dateAssignedColName, targetDate, true); updateRowCell(dateAssignedColName, targetDate); }
              if (pickedColName) { await queueCell(pickedColName, '', true); updateRowCell(pickedColName, ''); }
              if (chgOutColName && calculatedChgOut && calculatedChgOut !== 'N/A') {
                await queueCell(chgOutColName, calculatedChgOut, true);
                updateRowCell(chgOutColName, calculatedChgOut);
              }

              await this.db.recordItemHistoryEvent(sheetName, tableRow, 'In Testing (Arnett / JM Test)');
              flashSuccess();
              return;
            }

            // Packed For Testing (Truck staging for test lab)
            const isPackedTesting = valLower === 'packed for testing' || valLower === 'ready for test';
            if ((isAssignedCol || isStatusCol) && isPackedTesting) {
              const today = new Date();
              const todayFormatted = `${String(today.getMonth() + 1).padStart(2, '0')}/${String(today.getDate()).padStart(2, '0')}/${today.getFullYear()}`;

              const targetAssigned = 'Packed For Testing';
              const targetStatus = 'Ready For Test';
              const targetLoc = "Cody's Truck";
              const targetDate = todayFormatted;

              newVal = isAssignedCol ? targetAssigned : targetStatus;
              targetCell.textContent = newVal;

              if (tableRow) {
                if (assignedColName) tableRow[assignedColName] = targetAssigned;
                if (statusColName) tableRow[statusColName] = targetStatus;
                if (locationColName) tableRow[locationColName] = targetLoc;
                if (dateAssignedColName) tableRow[dateAssignedColName] = targetDate;
                if (pickedColName) tableRow[pickedColName] = '';
              }

              const curTestDate = testDateColName ? (tableRow[testDateColName] || '') : '';
              let calculatedChgOut = '';
              if (window.inventoryManager && typeof window.inventoryManager.calculateChangeOutDate === 'function') {
                calculatedChgOut = window.inventoryManager.calculateChangeOutDate(
                  targetDate || curTestDate,
                  targetLoc,
                  targetAssigned,
                  this.currentSheetKey,
                  { testDate: curTestDate, calibrationDate: curTestDate }
                );
              }
              if (calculatedChgOut && chgOutColName && calculatedChgOut !== 'N/A') {
                tableRow[chgOutColName] = calculatedChgOut;
              }

              syncTableRowToGrid();

              if (assignedColName) { await queueCell(assignedColName, targetAssigned, true); updateRowCell(assignedColName, targetAssigned); }
              if (statusColName) { await queueCell(statusColName, targetStatus, true); updateRowCell(statusColName, targetStatus); }
              if (locationColName) { await queueCell(locationColName, targetLoc, true); updateRowCell(locationColName, targetLoc); }
              if (dateAssignedColName) { await queueCell(dateAssignedColName, targetDate, true); updateRowCell(dateAssignedColName, targetDate); }
              if (pickedColName) { await queueCell(pickedColName, '', true); updateRowCell(pickedColName, ''); }
              if (chgOutColName && calculatedChgOut && calculatedChgOut !== 'N/A') {
                await queueCell(chgOutColName, calculatedChgOut, true);
                updateRowCell(chgOutColName, calculatedChgOut);
              }

              await this.db.recordItemHistoryEvent(sheetName, tableRow, "Packed For Testing (Cody's Truck)");
              flashSuccess();
              return;
            }

            // Packed For Delivery (Truck staging for field delivery)
            const isPackedDelivery = valLower === 'packed for delivery' || valLower === 'ready for delivery';
            if ((isAssignedCol || isStatusCol) && isPackedDelivery) {
              const today = new Date();
              const todayFormatted = `${String(today.getMonth() + 1).padStart(2, '0')}/${String(today.getDate()).padStart(2, '0')}/${today.getFullYear()}`;

              const targetAssigned = 'Packed For Delivery';
              const targetStatus = 'Ready For Delivery';
              const targetLoc = "Cody's Truck";
              const targetDate = todayFormatted;

              newVal = isAssignedCol ? targetAssigned : targetStatus;
              targetCell.textContent = newVal;

              if (tableRow) {
                if (assignedColName) tableRow[assignedColName] = targetAssigned;
                if (statusColName) tableRow[statusColName] = targetStatus;
                if (locationColName) tableRow[locationColName] = targetLoc;
                if (dateAssignedColName) tableRow[dateAssignedColName] = targetDate;
              }

              const curTestDate = testDateColName ? (tableRow[testDateColName] || '') : '';
              let calculatedChgOut = '';
              if (window.inventoryManager && typeof window.inventoryManager.calculateChangeOutDate === 'function') {
                calculatedChgOut = window.inventoryManager.calculateChangeOutDate(
                  targetDate || curTestDate,
                  targetLoc,
                  targetAssigned,
                  this.currentSheetKey,
                  { testDate: curTestDate, calibrationDate: curTestDate }
                );
              }
              if (calculatedChgOut && chgOutColName && calculatedChgOut !== 'N/A') {
                tableRow[chgOutColName] = calculatedChgOut;
              }

              syncTableRowToGrid();

              if (assignedColName) { await queueCell(assignedColName, targetAssigned, true); updateRowCell(assignedColName, targetAssigned); }
              if (statusColName) { await queueCell(statusColName, targetStatus, true); updateRowCell(statusColName, targetStatus); }
              if (locationColName) { await queueCell(locationColName, targetLoc, true); updateRowCell(locationColName, targetLoc); }
              if (dateAssignedColName) { await queueCell(dateAssignedColName, targetDate, true); updateRowCell(dateAssignedColName, targetDate); }
              if (chgOutColName && calculatedChgOut && calculatedChgOut !== 'N/A') {
                await queueCell(chgOutColName, calculatedChgOut, true);
                updateRowCell(chgOutColName, calculatedChgOut);
              }

              await this.db.recordItemHistoryEvent(sheetName, tableRow, "Packed For Delivery (Cody's Truck)");
              flashSuccess();
              return;
            }

            // Lost / Missing
            const isLost = valLower === 'lost' || valLower === 'missing';
            if ((isAssignedCol || isStatusCol) && isLost) {
              const today = new Date();
              const todayFormatted = `${String(today.getMonth() + 1).padStart(2, '0')}/${String(today.getDate()).padStart(2, '0')}/${today.getFullYear()}`;

              const targetAssigned = 'Lost';
              const targetStatus = 'Lost';
              const targetLoc = 'Lost';
              const targetDate = todayFormatted;
              const targetChgOut = 'N/A';

              newVal = isAssignedCol ? targetAssigned : targetStatus;
              targetCell.textContent = newVal;

              if (tableRow) {
                if (assignedColName) tableRow[assignedColName] = targetAssigned;
                if (statusColName) tableRow[statusColName] = targetStatus;
                if (locationColName) tableRow[locationColName] = targetLoc;
                if (dateAssignedColName) tableRow[dateAssignedColName] = targetDate;
                if (chgOutColName) tableRow[chgOutColName] = targetChgOut;
                if (pickedColName) tableRow[pickedColName] = '';
              }

              syncTableRowToGrid();

              if (assignedColName) { await queueCell(assignedColName, targetAssigned, true); updateRowCell(assignedColName, targetAssigned); }
              if (statusColName) { await queueCell(statusColName, targetStatus, true); updateRowCell(statusColName, targetStatus); }
              if (locationColName) { await queueCell(locationColName, targetLoc, true); updateRowCell(locationColName, targetLoc); }
              if (dateAssignedColName) { await queueCell(dateAssignedColName, targetDate, true); updateRowCell(dateAssignedColName, targetDate); }
              if (chgOutColName) { await queueCell(chgOutColName, targetChgOut, true); updateRowCell(chgOutColName, targetChgOut); }
              if (pickedColName) { await queueCell(pickedColName, '', true); updateRowCell(pickedColName, ''); }

              await this.db.recordItemHistoryEvent(sheetName, tableRow, 'Marked Lost / Missing');
              flashSuccess();
              return;
            }

            // When Assigned To is changed to an employee, prompt for Date Assigned and update atomically
            if (isAssignedCol && isAssignedToEmp) {
              const today = new Date();
              const todayFormatted = `${String(today.getMonth() + 1).padStart(2, '0')}/${String(today.getDate()).padStart(2, '0')}/${today.getFullYear()}`;
              const empTable = this.db.getTable('employees');
              let empLoc = (assignedResolved && assignedResolved.location) ? assignedResolved.location : 'Helena';
              if (empTable && empTable.rows && (!assignedResolved || empLoc === 'Helena')) {
                const empMatch = empTable.rows.find(e => {
                  const eName = String(e['Name'] || e['Employee Name'] || Object.values(e)[0] || '').trim().toLowerCase();
                  const altKey = Object.keys(e).find(k => /^(alt(ernat(e|ive))?(\s*names?)?|also\s*known\s*as|aka|aliases?)$/i.test(k.trim()));
                  const eAlt = String((altKey ? e[altKey] : e['Alternate Names']) || '').trim().toLowerCase();
                  return eName === curAssignedLower || eAlt.includes(curAssignedLower);
                });
                if (empMatch) {
                  const rawLoc = String(empMatch['Location'] || '').trim();
                  empLoc = (window.getPhysicalLocation ? window.getPhysicalLocation(rawLoc) : rawLoc) || 'Helena';
                }
              }

              const assignDetails = await this.promptAssignItemDetails(itemIdentifier, curAssigned, empLoc);
              if (!assignDetails) {
                if (initialVal) {
                  const nonEmpHolders = ['on shelf', 'in testing', 'packed for testing', 'packed for delivery', 'failed rubber', 'failed', 'lost', 'destroyed', 'new', 'unassigned', 'n/a', '—', '-'];
                  if (!nonEmpHolders.includes(initialVal.toLowerCase())) {
                    targetCell.innerHTML = `<span class="profile-link-badge" style="color: #60a5fa; cursor: pointer; margin-right: 4px; display: inline-block;" title="Click to view assignments & certs for ${this.escapeHtml(initialVal)}" onclick="event.stopPropagation(); if(window.employeeProfileEngine){window.employeeProfileEngine.openProfileModal('${this.escapeJs(initialVal)}');}">👤</span><span class="cell-text" style="font-weight: 600; color: #93c5fd;">${this.escapeHtml(initialVal)}</span>`;
                  } else {
                    targetCell.textContent = initialVal;
                  }
                } else {
                  targetCell.textContent = '';
                }
                return;
              }

              const chosenDate = assignDetails.dateAssigned || todayFormatted;
              const chosenLoc = assignDetails.location || empLoc;

              // Safety check against location rubber class approval for gloves or sleeves
              if (this.currentSheetKey === 'gloves' || this.currentSheetKey === 'sleeves') {
                const itemClass = tableRow[classColName || 'Class'];
                const locApproval = window.ppeTrackingEngine
                  ? window.ppeTrackingEngine.getLocationRubberClassApproval(chosenLoc)
                  : (window.employeeProfileEngine ? window.employeeProfileEngine.getLocationRubberClassApproval(chosenLoc) : 'CL2');
                const isApproved = window.ppeTrackingEngine
                  ? window.ppeTrackingEngine.isItemClassApprovedForLocation(itemClass, locApproval)
                  : (window.employeeProfileEngine ? window.employeeProfileEngine.isItemClassApprovedForLocation(itemClass, locApproval) : true);

                if (!isApproved) {
                  const confirmMsg = `⚠️ LOCATION COMPLIANCE WARNING:\n\n` +
                    `Location "${chosenLoc}" is approved for ${locApproval} rubber PPE.\n` +
                    `Item #${itemIdentifier} is Class ${itemClass}.\n\n` +
                    `Assigning this item violates location rubber PPE approval standards.\n\n` +
                    `Do you want to override and assign anyway?`;
                  if (!confirm(confirmMsg)) {
                    targetCell.textContent = initialVal || '';
                    return;
                  }
                }
              }

              // Apply in-memory row updates
              if (pickedColName) tableRow[pickedColName] = '';
              if (statusColName) tableRow[statusColName] = 'Assigned';
              if (locationColName) tableRow[locationColName] = chosenLoc;
              if (dateAssignedColName) tableRow[dateAssignedColName] = chosenDate;
              if (assignedColName) tableRow[assignedColName] = curAssigned;

              // Recalculate Change Out Date
              const curTestDate = testDateColName ? (tableRow[testDateColName] || '') : '';
              let calculatedChgOut = '';
              if (window.inventoryManager && typeof window.inventoryManager.calculateChangeOutDate === 'function') {
                calculatedChgOut = window.inventoryManager.calculateChangeOutDate(
                  chosenDate || curTestDate,
                  chosenLoc,
                  curAssigned,
                  this.currentSheetKey,
                  { testDate: curTestDate, calibrationDate: curTestDate }
                );
              }
              if (calculatedChgOut && chgOutColName && calculatedChgOut !== 'N/A') {
                tableRow[chgOutColName] = calculatedChgOut;
              }

              syncTableRowToGrid();

              // Update UI cells
              if (pickedColName) updateRowCell(pickedColName, '');
              if (statusColName) updateRowCell(statusColName, 'Assigned');
              if (locationColName) updateRowCell(locationColName, chosenLoc);
              if (dateAssignedColName) updateRowCell(dateAssignedColName, chosenDate);
              if (assignedColName) updateRowCell(assignedColName, curAssigned);
              if (chgOutColName && calculatedChgOut && calculatedChgOut !== 'N/A') {
                updateRowCell(chgOutColName, calculatedChgOut);
              }

              // Queue cell updates with skipHistory = true to prevent intermediate phantom events
              if (pickedColName) await queueCell(pickedColName, '', true);
              if (statusColName) await queueCell(statusColName, 'Assigned', true);
              if (locationColName) await queueCell(locationColName, chosenLoc, true);
              if (dateAssignedColName) await queueCell(dateAssignedColName, chosenDate, true);
              if (assignedColName) await queueCell(assignedColName, curAssigned, true);
              if (chgOutColName && calculatedChgOut && calculatedChgOut !== 'N/A') {
                await queueCell(chgOutColName, calculatedChgOut, true);
              }

              // Record history event ONCE with fully consistent row
              await this.db.recordItemHistoryEvent(sheetName, tableRow, `Assigned to ${curAssigned}`);

              // If assigning gloves or sleeves, sync to Trip Planner as completed task & Accomplishments
              if (window.ppeTrackingEngine && typeof window.ppeTrackingEngine.recordAssignmentToTripPlanner === 'function' && (this.currentSheetKey === 'gloves' || this.currentSheetKey === 'sleeves')) {
                try {
                  await window.ppeTrackingEngine.recordAssignmentToTripPlanner({
                    empName: curAssigned,
                    sheetKey: this.currentSheetKey,
                    itemIdentifier: itemIdentifier,
                    chosenDate: chosenDate,
                    chosenLoc: chosenLoc,
                    targetRow: tableRow
                  });
                } catch (err) {
                  console.warn('Trip planner recording note from sheet:', err);
                }
              }

              flashSuccess();
              return;
            }

            // When Date Assigned is entered for an assigned item, remove Picked For
            if (isAssignedToEmp && pickedColName && tableRow[pickedColName]) {
              tableRow[pickedColName] = '';
              const pIdx = (tableData.headers || []).indexOf(pickedColName);
              if (pIdx !== -1) {
                if (tableData.rawGrid && tableData.rawGrid[actualRowIdx - 1]) tableData.rawGrid[actualRowIdx - 1][pIdx] = '';
                await queueCell(pickedColName, '', true);
                updateRowCell(pickedColName, '');
              }
            }
          }

          // Validate uniqueness if editing primary equipment item cell
          if (targetCell.dataset.primary === 'true' && newVal) {
            const normNew = this.normalizeEquipmentIdentifier(newVal);
            if (tableData && tableData.rows) {
              const dup = tableData.rows.find(r => {
                if (r._rowIdx === actualRowIdx) return false;
                const rNum = this.normalizeEquipmentIdentifier(r['Item #'] || r['HV Tester'] || r['HVT #'] || r['Phasing Set'] || r['PS #'] || r['AED'] || r['Glove'] || r['Sleeve'] || r['Blanket'] || r['MACK'] || r['Serial #'] || r['Hot Stick'] || Object.values(r)[0] || '');
                return rNum && rNum === normNew;
              });
              if (dup) {
                const assigned = dup['Assigned To'] || dup['Status'] || 'In Inventory';
                alert(`⛔ Duplicate Error: Item #${newVal} already exists in ${tableData.name || this.currentSheetKey} (${assigned})!\n\nEquipment identifying numbers must be unique.`);
                targetCell.textContent = initialVal;
                return;
              }
            }
          }

          // 1. Update in-memory row and grid
          if (tableRow) {
            tableRow[header] = newVal;
            if (targetCell.dataset.primary === 'true') {
              tableRow['Item #'] = newVal;
              if (tableData && tableData.headers && tableData.headers[0]) {
                tableRow[tableData.headers[0]] = newVal;
              }
              if (this.currentSheetKey === 'hv_testers') {
                tableRow['HV Tester'] = newVal;
                tableRow['HVT #'] = newVal;
                tableRow['HVT'] = newVal;
              } else if (this.currentSheetKey === 'phasing_sets') {
                tableRow['Phasing Set'] = newVal;
                tableRow['PS #'] = newVal;
              } else if (this.currentSheetKey === 'aed') {
                tableRow['AED'] = newVal;
                tableRow['AED #'] = newVal;
              } else if (this.currentSheetKey === 'gloves') {
                tableRow['Glove'] = newVal;
              } else if (this.currentSheetKey === 'sleeves') {
                tableRow['Sleeve'] = newVal;
              } else if (this.currentSheetKey === 'blankets') {
                tableRow['Blanket'] = newVal;
              } else if (this.currentSheetKey === 'macks') {
                tableRow['MACK'] = newVal;
              } else if (this.currentSheetKey === 'grounds') {
                tableRow['Serial #'] = newVal;
                tableRow['Ground #'] = newVal;
              } else if (this.currentSheetKey === 'hot_sticks') {
                tableRow['Hot Stick'] = newVal;
                tableRow['Hot Stick #'] = newVal;
              }
            }
          }
          if (tableData && tableData.rawGrid && actualRowIdx && tableData.rawGrid[actualRowIdx - 1]) {
            const cIdx = (typeof col === 'number' && col >= 1) ? (col - 1) : (tableData.headers || []).indexOf(header);
            if (cIdx !== -1) tableData.rawGrid[actualRowIdx - 1][cIdx] = newVal;
          }

          // 2. If Date Assigned, Test Date, Calibration Date, or Location was changed on an inventory sheet, recalculate Change Out Date!
          if (isInventorySheet && tableRow && tableData) {
            const isDateAssigned = hLower.includes('date assigned');
            const isTestDate = hLower.includes('test date') || hLower.includes('calibration');
            const isLocation = hLower === 'location';

            if (isDateAssigned || isTestDate || isLocation) {
              const dateAssignedColName = (tableData.headers || []).find(h => /date\s*assigned/i.test(h));
              const testDateColName = (tableData.headers || []).find(h => /test\s*date|calibration/i.test(h));
              const locationColName = (tableData.headers || []).find(h => /^location$/i.test(h));
              const assignedColName = (tableData.headers || []).find(h => /assigned\s*to|^assigned$|^holder$/i.test(h));
              const chgOutColName = (tableData.headers || []).find(h => /change\s*out/i.test(h));

              const curDateAssigned = dateAssignedColName ? (tableRow[dateAssignedColName] || '') : '';
              const curTestDate = testDateColName ? (tableRow[testDateColName] || '') : '';
              const curLoc = isLocation ? newVal : (locationColName ? (tableRow[locationColName] || '') : '');
              const curAssignedTo = assignedColName ? (tableRow[assignedColName] || '') : '';

              const dateAssignedVal = isDateAssigned ? newVal : curDateAssigned;
              const testDateVal = isTestDate ? newVal : curTestDate;

              let calculatedChgOut = '';
              if (window.inventoryManager && typeof window.inventoryManager.calculateChangeOutDate === 'function') {
                calculatedChgOut = window.inventoryManager.calculateChangeOutDate(
                  dateAssignedVal || testDateVal,
                  curLoc,
                  curAssignedTo,
                  this.currentSheetKey,
                  {
                    testDate: testDateVal,
                    calibrationDate: testDateVal
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

          // 4. If Expiration Date or Date Acquired was edited on Expiring Certs, auto-reconcile Days and Status
          if (this.currentSheetKey === 'expiring_certs' && tableRow && tableData) {
            const isExpDateEdit = hLower.includes('expiration date') || hLower === 'expiration';
            const isAcqDateEdit = hLower.includes('date acquired') || hLower === 'acquired';
            const itemType = String(tableRow['Item Type'] || tableRow['Certification'] || tableRow['Cert Type'] || '').trim();
            const itemTypeLower = itemType.toLowerCase();

            let isNonExpCert = itemTypeLower.includes('trench') || itemTypeLower.includes('crane eval') ||
              itemTypeLower.includes('1910') || itemTypeLower.includes('bnsf') || itemTypeLower.includes('msha') ||
              itemTypeLower.includes('helo') || itemTypeLower.includes('helicopter');

            if (itemTypeLower === 'dl' || itemTypeLower.includes('driver') || itemTypeLower.includes('mec') || itemTypeLower.includes('cpr') || itemTypeLower.includes('1st aid')) {
              isNonExpCert = false;
            } else if (window.certsConfigEngine && typeof window.certsConfigEngine.isNonExpiringCert === 'function') {
              if (window.certsConfigEngine.isNonExpiringCert(itemType)) isNonExpCert = true;
            } else if (window.certsConfig && typeof window.certsConfig.isNonExpiringCert === 'function') {
              if (window.certsConfig.isNonExpiringCert(itemType)) isNonExpCert = true;
            }

            const daysColName = (tableData.headers || []).find(h => /days\s*until\s*expiration|^days$/i.test(h));
            const statusColName = (tableData.headers || []).find(h => /^status$/i.test(h));
            const expColName = (tableData.headers || []).find(h => /expiration\s*date|^expiration$/i.test(h));
            const acqColName = (tableData.headers || []).find(h => /date\s*acquired|^acquired$/i.test(h));

            if (isExpDateEdit) {
              const valTrimmed = String(newVal || '').trim();
              const isValNA = valTrimmed.toUpperCase() === 'N/A' || valTrimmed.toLowerCase() === 'no date set' || !valTrimmed;

              if (isValNA) {
                const targetExp = isNonExpCert ? 'N/A' : '';
                const targetDays = isNonExpCert ? 'N/A' : '';
                const curAcq = String((acqColName ? tableRow[acqColName] : '') || '').trim();
                const hasAcq = curAcq && curAcq !== 'N/A' && curAcq !== 'No Date Set';
                const targetStatus = isNonExpCert ? (hasAcq ? 'OK' : 'No Date Set') : 'No Date Set';

                if (expColName) { tableRow[expColName] = targetExp; newVal = targetExp; }
                if (daysColName) {
                  tableRow[daysColName] = targetDays;
                  await queueCell(daysColName, targetDays);
                  updateRowCell(daysColName, targetDays);
                }
                if (statusColName) {
                  tableRow[statusColName] = targetStatus;
                  await queueCell(statusColName, targetStatus);
                  updateRowCell(statusColName, targetStatus);
                }
              } else {
                const expDateObj = (window.employeeProfileEngine && typeof window.employeeProfileEngine.parseDate === 'function')
                  ? window.employeeProfileEngine.parseDate(valTrimmed)
                  : new Date(valTrimmed);
                if (expDateObj && !isNaN(expDateObj.getTime())) {
                  const todayZero = new Date();
                  todayZero.setHours(0, 0, 0, 0);
                  const expZero = new Date(expDateObj);
                  expZero.setHours(0, 0, 0, 0);
                  const diffDays = Math.ceil((expZero.getTime() - todayZero.getTime()) / (1000 * 60 * 60 * 24));

                  let targetStatus = 'OK';
                  if (diffDays < 0) targetStatus = 'EXPIRED';
                  else if (diffDays <= 30) targetStatus = 'CRITICAL';
                  else if (diffDays <= 60) targetStatus = 'WARNING';
                  else if (diffDays <= 90) targetStatus = 'UPCOMING';

                  if (daysColName) {
                    tableRow[daysColName] = diffDays;
                    await queueCell(daysColName, diffDays);
                    updateRowCell(daysColName, diffDays);
                  }
                  if (statusColName) {
                    tableRow[statusColName] = targetStatus;
                    await queueCell(statusColName, targetStatus);
                    updateRowCell(statusColName, targetStatus);
                  }
                }
              }
            } else if (isAcqDateEdit && isNonExpCert) {
              const curAcq = String(newVal || '').trim();
              const hasAcq = curAcq && curAcq !== 'N/A' && curAcq !== 'No Date Set';
              const targetStatus = hasAcq ? 'OK' : 'No Date Set';

              if (expColName && tableRow[expColName] !== 'N/A') {
                tableRow[expColName] = 'N/A';
                await queueCell(expColName, 'N/A');
                updateRowCell(expColName, 'N/A');
              }
              if (daysColName && tableRow[daysColName] !== 'N/A') {
                tableRow[daysColName] = 'N/A';
                await queueCell(daysColName, 'N/A');
                updateRowCell(daysColName, 'N/A');
              }
              if (statusColName && tableRow[statusColName] !== targetStatus) {
                tableRow[statusColName] = targetStatus;
                await queueCell(statusColName, targetStatus);
                updateRowCell(statusColName, targetStatus);
              }
            } else if (isAcqDateEdit && !isNonExpCert) {
              const valTrimmed = String(newVal || '').trim();
              const empName = String(tableRow['Employee Name'] || tableRow['Name'] || Object.values(tableRow)[0] || '').trim();

              if (valTrimmed && valTrimmed.toUpperCase() !== 'N/A' && valTrimmed.toLowerCase() !== 'no date set') {
                let termMonths = 12;
                if (itemTypeLower.includes('cpr') || itemTypeLower.includes('1st aid') || itemTypeLower.includes('first aid')) {
                  termMonths = 24; // Red Cross 2-year default
                } else if (itemTypeLower.includes('forklift') || itemTypeLower.includes('rigging')) {
                  termMonths = 36;
                } else if (itemTypeLower.includes('crane')) {
                  termMonths = 60;
                } else if (itemTypeLower.includes('dl')) {
                  termMonths = 96;
                } else if (itemTypeLower.includes('mec') || itemTypeLower.includes('medical')) {
                  termMonths = 24;
                }

                if (window.certsConfigEngine && typeof window.certsConfigEngine.getCertCycleInfo === 'function') {
                  const cInfo = window.certsConfigEngine.getCertCycleInfo(itemType);
                  if (cInfo && cInfo.months) termMonths = cInfo.months;
                }

                const acqDateObj = (window.employeeProfileEngine && typeof window.employeeProfileEngine.parseDate === 'function')
                  ? window.employeeProfileEngine.parseDate(valTrimmed)
                  : new Date(valTrimmed);

                if (acqDateObj && !isNaN(acqDateObj.getTime())) {
                  const expDateObj = new Date(acqDateObj.getTime());
                  expDateObj.setMonth(expDateObj.getMonth() + termMonths);
                  const expM = String(expDateObj.getMonth() + 1).padStart(2, '0');
                  const expD = String(expDateObj.getDate()).padStart(2, '0');
                  const expY = expDateObj.getFullYear();
                  const calcExpStr = `${expM}/${expD}/${expY}`;

                  const todayZero = new Date();
                  todayZero.setHours(0, 0, 0, 0);
                  const expZero = new Date(expDateObj);
                  expZero.setHours(0, 0, 0, 0);
                  const diffDays = Math.ceil((expZero.getTime() - todayZero.getTime()) / (1000 * 60 * 60 * 24));

                  let targetStatus = 'OK';
                  if (diffDays < 0) targetStatus = 'EXPIRED';
                  else if (diffDays <= 30) targetStatus = 'CRITICAL';
                  else if (diffDays <= 60) targetStatus = 'WARNING';
                  else if (diffDays <= 90) targetStatus = 'UPCOMING';

                  if (expColName) {
                    tableRow[expColName] = calcExpStr;
                    await queueCell(expColName, calcExpStr);
                    updateRowCell(expColName, calcExpStr);
                  }
                  if (daysColName) {
                    tableRow[daysColName] = diffDays;
                    await queueCell(daysColName, diffDays);
                    updateRowCell(daysColName, diffDays);
                  }
                  if (statusColName) {
                    tableRow[statusColName] = targetStatus;
                    await queueCell(statusColName, targetStatus);
                    updateRowCell(statusColName, targetStatus);
                  }
                }

                // Immediately popup the modal for provider selection, companion sync & notes
                if (window.employeeProfileEngine && empName && itemType) {
                  setTimeout(() => {
                    window.employeeProfileEngine.openEditCertModal(empName, itemType, valTrimmed);
                  }, 60);
                }
              }
            }
          }

          // 5. If Location, Job Number, or Names was edited on Employees sheet, auto-sync and refresh resolver
          if (this.currentSheetKey === 'employees' && tableRow) {
            // Immediately rebuild employee index so name and alias changes take effect live
            if (window.employeeResolver && typeof window.employeeResolver.rebuildIndex === 'function') {
              window.employeeResolver.rebuildIndex();
            }

            const isLocEdit = hLower === 'location';
            const isJobEdit = hLower === 'job number' || hLower === 'job #' || hLower === 'job';
            if (isLocEdit || isJobEdit) {
              const empName = String(tableRow['Employee Name'] || tableRow['Name'] || Object.values(tableRow)[0] || '').trim();
              if (empName) {
                const certsTable = this.db.getTable('expiring_certs');
                if (certsTable && certsTable.rows) {
                  let matched = 0;
                  const empNameLower = empName.toLowerCase();
                  certsTable.rows.forEach(cr => {
                    const cName = String(cr['Employee Name'] || cr['Name'] || Object.values(cr)[0] || '').trim().toLowerCase();
                    if (cName === empNameLower) {
                      if (isLocEdit) cr['Location'] = newVal;
                      if (isJobEdit) cr['Job #'] = newVal;
                      matched++;
                    }
                  });
                  if (matched > 0) {
                    if (certsTable.headers && certsTable.rawGrid) {
                      const locIdx = certsTable.headers.indexOf('Location');
                      const jobIdx = certsTable.headers.indexOf('Job #');
                      certsTable.rows.forEach((cr, rIdx) => {
                        if (certsTable.rawGrid[rIdx + 1]) {
                          if (isLocEdit && locIdx !== -1) certsTable.rawGrid[rIdx + 1][locIdx] = cr['Location'];
                          if (isJobEdit && jobIdx !== -1) certsTable.rawGrid[rIdx + 1][jobIdx] = cr['Job #'];
                        }
                      });
                    }
                    if (typeof this.db.saveLocalSnapshot === 'function') {
                      await this.db.saveLocalSnapshot();
                    }
                    if (typeof this.db.addMutation === 'function') {
                      this.db.addMutation({
                        action: 'REPLACE_TABLE_DATA',
                        sheetName: 'Expiring Certs',
                        tableKey: 'expiring_certs',
                        headers: certsTable.headers,
                        rows: certsTable.rows,
                        rawGrid: certsTable.rawGrid
                      }).catch(e => console.warn('Mutation error updating certs:', e));
                    }
                  }
                }
              }

              // Auto-sync inventory item locations if an employee's location was changed
              if (isLocEdit && window.inventoryManager && typeof window.inventoryManager.syncInventoryLocations === 'function') {
                window.inventoryManager.syncInventoryLocations(true).catch(e => console.warn('Auto syncInventoryLocations error:', e));
              }
            }
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
          } else if (this.currentSheetKey === 'locations' && (hLower.includes('rubber class') || hLower.includes('approval'))) {
            const vUpper = String(newVal || '').trim().toUpperCase();
            let bColor = '#2563eb';
            let bText = '🧤 CL2';
            if (vUpper === 'CL3') {
              bColor = '#7c3aed';
              bText = '⚡ CL3';
            } else if (vUpper === 'CL2') {
              bColor = '#2563eb';
              bText = '🧤 CL2';
            } else if (vUpper === 'CL2 & CL3' || vUpper === 'CL2 & 3' || vUpper.includes('&') || vUpper.includes('BOTH')) {
              bColor = '#059669';
              bText = '🔄 CL2 & CL3';
            } else if (vUpper === 'NONE') {
              bColor = '#475569';
              bText = '🚫 None';
            } else {
              bText = `🧤 ${newVal}`;
            }
            targetCell.innerHTML = `<span class="badge badge-approval-clickable" style="background-color: ${bColor}; color: #fff; padding: 3px 9px; border-radius: 4px; font-weight: 700; cursor: pointer; display: inline-flex; align-items: center; gap: 4px; user-select: none;" title="Click to change rubber class approval"><span>${bText}</span> <span style="font-size: 10px; opacity: 0.7;">▾</span></span>`;

            if (window.procurementEngine && typeof window.procurementEngine.buildPurchaseNeeds === 'function') {
              window.procurementEngine.buildPurchaseNeeds();
            }
          } else if (this.currentSheetKey === 'training_tracking' && (hLower === 'status' || hLower === 'training status')) {
            const sLower = newVal.toLowerCase();
            let bBg = '#d97706';
            let bText = '⏳ Scheduled';
            if (sLower === 'complete' || sLower === 'completed' || sLower === 'done') {
              bBg = '#15803d';
              bText = '✅ Complete';
            } else if (sLower === 'scheduled' || sLower === 'pending') {
              bBg = '#d97706';
              bText = '⏳ Scheduled';
            } else if (sLower === 'on hold' || sLower === 'postponed') {
              bBg = '#7c3aed';
              bText = '⏸️ On Hold';
            } else if (sLower === 'cancelled' || sLower === 'canceled') {
              bBg = '#475569';
              bText = '❌ Cancelled';
            } else if (sLower === 'n/a' || sLower === 'na') {
              bBg = '#334155';
              bText = '🚫 N/A';
            } else {
              bText = newVal;
            }
            targetCell.innerHTML = `<span class="badge badge-training-status-clickable" style="background-color: ${bBg}; color: #fff; padding: 3px 9px; border-radius: 4px; font-weight: 700; cursor: pointer; display: inline-flex; align-items: center; gap: 4px; user-select: none;" title="Click to change training status"><span>${this.escapeHtml(bText)}</span> <span style="font-size: 10px; opacity: 0.7;">▾</span></span>`;

            // Auto-populate Completion Date if marked Complete and Date is empty!
            if ((sLower === 'complete' || sLower === 'completed') && tableRow) {
              const curDate = String(tableRow['Completion Date'] || tableRow['Date Completed'] || '').trim();
              if (!curDate || curDate === '—' || curDate === '-') {
                const today = new Date();
                const todayFormatted = `${String(today.getMonth() + 1).padStart(2, '0')}/${String(today.getDate()).padStart(2, '0')}/${today.getFullYear()}`;
                tableRow['Completion Date'] = todayFormatted;
                const cIdx = (tableData.headers || []).findIndex(h => /completion|date completed/i.test(h));
                if (cIdx !== -1) {
                  if (tableData.rawGrid && actualRowIdx && tableData.rawGrid[actualRowIdx - 1]) {
                    tableData.rawGrid[actualRowIdx - 1][cIdx] = todayFormatted;
                  }
                  await queueCell(tableData.headers[cIdx], todayFormatted);
                  updateRowCell(tableData.headers[cIdx], todayFormatted);
                }
              }
            } else if ((sLower === 'scheduled' || sLower === 'pending') && tableRow) {
              const curDate = String(tableRow['Completion Date'] || tableRow['Date Completed'] || '').trim();
              if (curDate) {
                tableRow['Completion Date'] = '';
                const cIdx = (tableData.headers || []).findIndex(h => /completion|date completed/i.test(h));
                if (cIdx !== -1) {
                  if (tableData.rawGrid && actualRowIdx && tableData.rawGrid[actualRowIdx - 1]) {
                    tableData.rawGrid[actualRowIdx - 1][cIdx] = '';
                  }
                  await queueCell(tableData.headers[cIdx], '');
                  updateRowCell(tableData.headers[cIdx], '');
                }
              }
            }
          } else if (this.currentSheetKey === 'training_tracking' && (hLower === 'completion date' || hLower === 'date completed')) {
            const dStr = String(newVal || '').trim();
            if (dStr && dStr !== '—' && dStr !== '-') {
              targetCell.innerHTML = `
                <div style="display: inline-flex; align-items: center; gap: 6px;">
                  <span class="cell-text" style="font-weight: 600; color: #60a5fa; font-family: monospace;">📅 ${this.escapeHtml(dStr)}</span>
                  <button class="btn btn-secondary btn-pick-training-date" style="padding: 1px 5px; font-size: 10px; border-radius: 3px; cursor: pointer; color: #93c5fd;" title="Pick or change completion date" onclick="event.stopPropagation(); window.sheetNavigator.promptTrainingDate(this.closest('td'));">📅</button>
                </div>
              `;
              if (tableRow) {
                const curStat = String(tableRow['Status'] || '').toLowerCase().trim();
                if (curStat !== 'complete' && curStat !== 'completed') {
                  tableRow['Status'] = 'Complete';
                  const sIdx = (tableData.headers || []).findIndex(h => /status/i.test(h));
                  if (sIdx !== -1) {
                    if (tableData.rawGrid && actualRowIdx && tableData.rawGrid[actualRowIdx - 1]) {
                      tableData.rawGrid[actualRowIdx - 1][sIdx] = 'Complete';
                    }
                    await queueCell(tableData.headers[sIdx], 'Complete');
                    updateRowCell(tableData.headers[sIdx], 'Complete');
                  }
                }
              }
            } else {
              targetCell.innerHTML = `
                <button class="btn btn-secondary btn-pick-training-date" style="padding: 2px 8px; font-size: 11px; border-radius: 4px; cursor: pointer; color: #94a3b8; border-style: dashed;" title="Set training completion date" onclick="event.stopPropagation(); window.sheetNavigator.promptTrainingDate(this.closest('td'));">
                  ➕ Set Date
                </button>
              `;
            }
          } else if (targetCell.dataset.primary === 'true' && newVal) {
            const itemKey = String(newVal).trim();
            const histKey = this.currentSheetKey.endsWith('_history') ? this.currentSheetKey : (this.currentSheetKey + '_history');
            targetCell.innerHTML = `<span style="font-weight: 700; color: #60a5fa; cursor: pointer; text-decoration: underline dotted; display: inline-block; padding: 2px 4px; border-radius: 4px;" title="Click to inspect lifecycle dossier for #${this.escapeHtml(itemKey)}" onclick="if(window.itemStatsEngine){window.itemStatsEngine.openDossierModal('${this.escapeJs(itemKey)}', '${this.escapeJs(histKey)}');}">${this.escapeHtml(newVal)}</span>`;
            targetCell.dataset.item = newVal;
          } else if (!targetCell.querySelector('.cell-text')) {
            targetCell.textContent = newVal;
          }

          flashSuccess();
        } catch (err) {
          console.error('Error committing inline edit:', err);
        }
      });
    });

    // Attach double-click rename handlers to all non-editable primary equipment cells
    container.querySelectorAll('td[data-primary="true"]:not(.editable)').forEach(td => {
      td.addEventListener('dblclick', () => {
        if (window.currentRoleMode === 'view_only') return;
        const currentItemNum = (td.querySelector('.cell-text') ? td.querySelector('.cell-text').textContent : td.textContent).trim().replace(/^👤\s*/, '');
        const targetRow = td.dataset.row ? parseInt(td.dataset.row, 10) : null;
        const promptMsg = currentItemNum ? `Edit Item # (Current: ${currentItemNum}):` : 'Enter Item # / Equipment #:';
        const entered = prompt(promptMsg, currentItemNum);
        if (entered !== null) {
          const newItemNum = entered.trim();
          if (newItemNum && newItemNum !== currentItemNum) {
            const curTable = this.db.getTable(this.currentSheetKey);
            if (curTable && curTable.rows) {
              const normNew = this.normalizeEquipmentIdentifier(newItemNum);
              const dup = curTable.rows.find(r => {
                if (r._rowIdx === targetRow) return false;
                const rNum = this.normalizeEquipmentIdentifier(r['Item #'] || r['HV Tester'] || r['HVT #'] || r['Phasing Set'] || r['PS #'] || r['AED'] || r['Glove'] || r['Sleeve'] || r['Blanket'] || r['MACK'] || r['Serial #'] || r['Hot Stick'] || Object.values(r)[0] || '');
                return rNum && rNum === normNew;
              });
              if (dup) {
                const assigned = dup['Assigned To'] || dup['Status'] || 'In Inventory';
                alert(`⛔ Duplicate Error: Item #${newItemNum} already exists in ${curTable.name || this.currentSheetKey} (${assigned})!\n\nEquipment identifying numbers must be unique.`);
                return;
              }
            }
            td.classList.add('editable');
            td.contentEditable = 'true';
            td.textContent = newItemNum;
            td.focus();
            td.blur();
          }
        }
      });
    });

    // Close autocomplete dropdown when clicking outside
    if (!this._hasAutocompleteDocListener) {
      this._hasAutocompleteDocListener = true;
      document.addEventListener('click', (e) => {
        const dropdown = document.getElementById('cell-autocomplete-dropdown');
        if (dropdown && dropdown.style.display === 'block') {
          if (!dropdown.contains(e.target) && !e.target.closest('td.editable')) {
            this.closeCellAutocomplete();
          }
        }
      });
    }

    // Attach checkbox toggle handlers
    container.querySelectorAll('[data-toggle-checkbox]').forEach(cb => {
      cb.addEventListener('click', async (e) => {
        if (window.currentRoleMode === 'view_only') return;
        const span = e.currentTarget;
        const sheetName = span.dataset.sheet;
        const row = parseInt(span.dataset.toggleCheckbox, 10);
        const col = parseInt(span.dataset.col, 10);
        const header = span.dataset.header;
        const isCurrentlyChecked = span.textContent === '☑️';
        const newBool = !isCurrentlyChecked;

        span.textContent = newBool ? '☑️' : '⬜';

        // Update in-memory row
        const table = this.db.getTable(this.currentSheetKey) || (this.db.snapshot && this.db.snapshot.tables ? this.db.snapshot.tables[this.currentSheetKey] : null);
        if (table && table.rows) {
          const rowObj = table.rows.find(r => r._rowIdx === row);
          if (rowObj) {
            rowObj[header] = newBool;
            if (this.currentSheetKey === 'job_tracking' && header.toLowerCase().startsWith('skip ')) {
              const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
              const skipped = days.filter(d => {
                const k = 'Skip ' + d;
                return rowObj[k] === true || String(rowObj[k]).toLowerCase() === 'true';
              });
              rowObj['Skip Days'] = skipped.join(',');
              const todayFormatted = new Date().toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' });
              rowObj['Last Updated'] = todayFormatted;
            }
          }
        }

        await this.db.addMutation({
          action: 'UPDATE_CELL',
          sheetName: sheetName,
          row: row,
          col: col,
          header: header,
          value: newBool
        });

        if (typeof this.db.saveLocalSnapshot === 'function') {
          await this.db.saveLocalSnapshot();
        } else if (typeof this.db.persistSnapshot === 'function') {
          await this.db.persistSnapshot(this.db.snapshot);
        }

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

  promptAssignItemDetails(itemIdentifier, employeeName, defaultLocation = 'Helena') {
    return new Promise((resolve) => {
      const modal = document.getElementById('assign-item-modal');
      const today = new Date();
      const todayFormatted = `${String(today.getMonth() + 1).padStart(2, '0')}/${String(today.getDate()).padStart(2, '0')}/${today.getFullYear()}`;
      const todayIso = today.toISOString().split('T')[0];

      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayFormatted = `${String(yesterday.getMonth() + 1).padStart(2, '0')}/${String(yesterday.getDate()).padStart(2, '0')}/${yesterday.getFullYear()}`;
      const yesterdayIso = yesterday.toISOString().split('T')[0];

      if (!modal) {
        const dPrompt = prompt(`Assign Item #${itemIdentifier || ''} to ${employeeName}.\nEnter Date Assigned (MM/DD/YYYY):`, todayFormatted);
        if (!dPrompt) return resolve(null);
        return resolve({ dateAssigned: dPrompt.trim(), location: defaultLocation });
      }

      const titleEl = document.getElementById('assign-modal-title');
      if (titleEl) {
        titleEl.textContent = itemIdentifier ? `Assign Item #${itemIdentifier}` : `Assign Item`;
      }

      const subtitleEl = document.getElementById('assign-item-subtitle');
      if (subtitleEl) {
        subtitleEl.textContent = `Assigning to ${employeeName}`;
      }

      const empNameEl = document.getElementById('assign-modal-emp-name');
      if (empNameEl) {
        empNameEl.textContent = employeeName;
      }

      const dateInput = document.getElementById('assign-modal-date');
      const datePicker = document.getElementById('assign-modal-date-picker');
      const locInput = document.getElementById('assign-modal-location');
      const quickToday = document.getElementById('assign-quick-today');
      const quickYesterday = document.getElementById('assign-quick-yesterday');

      const cleanLoc = (window.getPhysicalLocation ? window.getPhysicalLocation(defaultLocation) : defaultLocation) || 'Helena';

      if (dateInput) dateInput.value = todayFormatted;
      if (datePicker) datePicker.value = todayIso;
      if (locInput) locInput.value = cleanLoc;

      if (datePicker && dateInput) {
        datePicker.onchange = () => {
          if (datePicker.value) {
            const p = datePicker.value.split('-');
            dateInput.value = `${p[1]}/${p[2]}/${p[0]}`;
          }
        };
      }

      if (dateInput && datePicker) {
        dateInput.oninput = () => {
          const val = dateInput.value.trim();
          if (/^\d{2}\/\d{2}\/\d{4}$/.test(val)) {
            const p = val.split('/');
            datePicker.value = `${p[2]}-${p[0]}-${p[1]}`;
          }
        };
      }

      if (quickToday && dateInput && datePicker) {
        quickToday.onclick = (e) => {
          e.preventDefault();
          dateInput.value = todayFormatted;
          datePicker.value = todayIso;
        };
      }

      if (quickYesterday && dateInput && datePicker) {
        quickYesterday.onclick = (e) => {
          e.preventDefault();
          dateInput.value = yesterdayFormatted;
          datePicker.value = yesterdayIso;
        };
      }

      const closeBtn = document.getElementById('assign-modal-close');
      const cancelBtn = document.getElementById('assign-modal-cancel');
      const confirmBtn = document.getElementById('assign-modal-confirm');

      const cleanup = () => {
        modal.classList.remove('active');
        modal.style.display = 'none';
        modal.onclick = null;
        if (closeBtn) closeBtn.onclick = null;
        if (cancelBtn) cancelBtn.onclick = null;
        if (confirmBtn) confirmBtn.onclick = null;
        if (datePicker) datePicker.onchange = null;
        if (dateInput) dateInput.oninput = null;
        if (quickToday) quickToday.onclick = null;
        if (quickYesterday) quickYesterday.onclick = null;
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
        let dVal = dateInput ? dateInput.value.trim() : '';
        if (!dVal) dVal = todayFormatted;

        if (dVal.includes('-')) {
          const p = dVal.split('-');
          if (p.length === 3) dVal = `${p[1]}/${p[2]}/${p[0]}`;
        }

        const lVal = locInput ? locInput.value.trim() : defaultLocation;
        const cleanL = (window.getPhysicalLocation ? window.getPhysicalLocation(lVal) : lVal) || 'Helena';

        cleanup();
        resolve({ dateAssigned: dVal, location: cleanL });
      };

      modal.onclick = (e) => {
        if (e.target === modal) handleCancel();
      };
      if (closeBtn) closeBtn.onclick = handleCancel;
      if (cancelBtn) cancelBtn.onclick = handleCancel;
      if (confirmBtn) confirmBtn.onclick = handleConfirm;

      document.addEventListener('keydown', handleEsc);

      modal.style.display = 'flex';
      modal.classList.add('active');
      setTimeout(() => {
        if (dateInput) {
          dateInput.focus();
          dateInput.select();
        }
      }, 50);
    });
  }

  /**
   * Interactive modal to depart / archive an employee.
   * Prompts for Last Working Day, Reason, Notes, and reviews unreturned equipment.
   */
  openEmployeeDepartureModal(empOrRow, targetCell = null, initialVal = '', triggeredReason = '') {
    return new Promise((resolve) => {
      const empTable = this.db.getTable('employees');
      if (!empTable) return resolve(null);

      let tableRow = null;
      let actualRowIdx = -1;
      let empName = '';

      if (typeof empOrRow === 'string') {
        empName = empOrRow.trim();
        if (empTable.rows) {
          const rIdx = empTable.rows.findIndex(r => {
            const n = String(r['Name'] || r['Employee Name'] || Object.values(r)[0] || '').trim();
            return n.toLowerCase() === empName.toLowerCase() || (window.employeeProfileEngine && window.employeeProfileEngine.isNameMatch(n, empName));
          });
          if (rIdx !== -1) {
            tableRow = empTable.rows[rIdx];
            actualRowIdx = rIdx + 2;
          }
        }
      } else if (typeof empOrRow === 'object' && empOrRow) {
        tableRow = empOrRow;
        empName = String(tableRow['Employee Name'] || tableRow['Name'] || Object.values(tableRow)[0] || '').trim();
        if (empTable.rows) {
          const rIdx = empTable.rows.indexOf(tableRow);
          if (rIdx !== -1) {
            actualRowIdx = rIdx + 2;
          } else {
            const rIdx2 = empTable.rows.findIndex(r => {
              const n = String(r['Name'] || r['Employee Name'] || Object.values(r)[0] || '').trim();
              return n.toLowerCase() === empName.toLowerCase();
            });
            if (rIdx2 !== -1) actualRowIdx = rIdx2 + 2;
          }
        }
      }

      if (!tableRow || !empName) {
        if (window.showToast) window.showToast('Could not find employee record to archive.', 'warning');
        else alert('Could not find employee record to archive.');
        if (targetCell && initialVal !== undefined) targetCell.textContent = initialVal;
        return resolve(null);
      }

      const modal = document.getElementById('employee-departure-modal');
      const today = new Date();
      const todayFormatted = `${String(today.getMonth() + 1).padStart(2, '0')}/${String(today.getDate()).padStart(2, '0')}/${today.getFullYear()}`;
      const todayIso = today.toISOString().split('T')[0];

      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayFormatted = `${String(yesterday.getMonth() + 1).padStart(2, '0')}/${String(yesterday.getDate()).padStart(2, '0')}/${yesterday.getFullYear()}`;
      const yesterdayIso = yesterday.toISOString().split('T')[0];

      // Scan all active equipment sheets for items currently assigned to this worker
      const eqTypes = [
        { key: 'gloves', title: 'Gloves', icon: '🧤' },
        { key: 'sleeves', title: 'Sleeves', icon: '🦾' },
        { key: 'blankets', title: 'Blankets', icon: '🔲' },
        { key: 'macks', title: 'MACKs', icon: '🧱' },
        { key: 'hv_testers', title: 'HV Testers', icon: '⚡' },
        { key: 'phasing_sets', title: 'Phasing Sets', icon: '⚡' },
        { key: 'aed', title: 'AED', icon: '🏥' },
        { key: 'grounds', title: 'Grounds', icon: '⚡' },
        { key: 'hot_sticks', title: 'Hot Sticks', icon: '🔴' }
      ];

      const assignedGear = [];
      eqTypes.forEach(eq => {
        const t = this.db.getTable(eq.key);
        if (t && t.rows) {
          t.rows.forEach(item => {
            const holder = String(item['Assigned To'] || item['Assigned'] || item['Holder'] || '').trim();
            if (holder) {
              const matches = holder.toLowerCase() === empName.toLowerCase() || 
                (window.employeeProfileEngine && window.employeeProfileEngine.isNameMatch(holder, empName));
              if (matches) {
                const id = item['Item #'] || item['Serial #'] || item['HVT #'] || item['Phasing Set #'] || item['AED #'] || item['Glove'] || item['Sleeve'] || item['Blanket'] || item['MACK'] || Object.values(item)[0] || '';
                assignedGear.push({
                  type: eq.title,
                  icon: eq.icon,
                  id: String(id).trim()
                });
              }
            }
          });
        }
      });

      if (!modal) {
        // Resilient fallback prompt if modal markup is not present
        const reasonInput = prompt(`🚪 Depart Employee: ${empName}\n\nEnter Departure Reason (Quit, Resigned, Layoff, Terminated, Fired, Medical):`, triggeredReason || 'Quit');
        if (!reasonInput) {
          if (targetCell && initialVal !== undefined) targetCell.textContent = initialVal;
          return resolve(null);
        }
        const lastDayInput = prompt(`Enter Last Working Day for ${empName} (MM/DD/YYYY):`, todayFormatted);
        if (!lastDayInput) {
          if (targetCell && initialVal !== undefined) targetCell.textContent = initialVal;
          return resolve(null);
        }
        this._commitEmployeeDeparture(tableRow, actualRowIdx, empName, lastDayInput.trim(), reasonInput.trim(), '', initialVal)
          .then(() => resolve({ confirmed: true, lastDay: lastDayInput.trim(), reason: reasonInput.trim() }))
          .catch((err) => {
            console.error('Error archiving employee fallback:', err);
            resolve(null);
          });
        return;
      }

      // Populate Modal Fields
      const titleEl = document.getElementById('emp-depart-modal-title');
      const nameEl = document.getElementById('emp-depart-name');
      const crewEl = document.getElementById('emp-depart-crew');
      const locEl = document.getElementById('emp-depart-location');
      const roleEl = document.getElementById('emp-depart-role');
      const equipAlert = document.getElementById('emp-depart-equip-alert');
      const equipCount = document.getElementById('emp-depart-equip-count');
      const equipList = document.getElementById('emp-depart-equip-list');
      const noEquip = document.getElementById('emp-depart-no-equip');
      const dateInput = document.getElementById('emp-depart-date');
      const datePicker = document.getElementById('emp-depart-date-picker');
      const quickToday = document.getElementById('emp-depart-quick-today');
      const quickYesterday = document.getElementById('emp-depart-quick-yesterday');
      const reasonSelect = document.getElementById('emp-depart-reason');
      const notesInput = document.getElementById('emp-depart-notes');
      const closeBtn = document.getElementById('emp-depart-modal-close');
      const cancelBtn = document.getElementById('emp-depart-modal-cancel');
      const confirmBtn = document.getElementById('emp-depart-modal-confirm');

      if (titleEl) titleEl.textContent = `Depart & Archive: ${empName}`;
      if (nameEl) nameEl.textContent = empName;
      if (crewEl) crewEl.textContent = tableRow['Job Number'] || tableRow['Job #'] || 'N/A';
      
      const priorLocation = (initialVal && !initialVal.toLowerCase().includes('previous')) 
        ? initialVal 
        : (tableRow['Location'] && !tableRow['Location'].toLowerCase().includes('previous') ? tableRow['Location'] : 'Unknown');
      if (locEl) locEl.textContent = priorLocation;
      if (roleEl) roleEl.textContent = tableRow['Job Classification'] || tableRow['Classification'] || 'Lineman';

      // Equipment alert display
      if (assignedGear.length > 0) {
        if (equipAlert) equipAlert.style.display = 'block';
        if (equipCount) equipCount.textContent = assignedGear.length;
        if (equipList) {
          equipList.innerHTML = assignedGear.map(g => `
            <span class="badge" style="background: rgba(239, 68, 68, 0.25); border: 1px solid rgba(239, 68, 68, 0.45); color: #fca5a5; font-size: 11px; padding: 3px 7px; border-radius: 4px; display: inline-flex; align-items: center; gap: 4px;">
              <span>${g.icon}</span> <strong>${this.escapeHtml(g.type)} #${this.escapeHtml(g.id)}</strong>
            </span>
          `).join('');
        }
        if (noEquip) noEquip.style.display = 'none';
      } else {
        if (equipAlert) equipAlert.style.display = 'none';
        if (noEquip) noEquip.style.display = 'flex';
      }

      // Pre-fill Date
      let initialDate = tableRow['Last Day'] || todayFormatted;
      if (initialDate.includes('-')) {
        const p = initialDate.split('-');
        if (p.length === 3) initialDate = `${p[1]}/${p[2]}/${p[0]}`;
      }
      if (dateInput) dateInput.value = initialDate;
      if (datePicker) {
        if (/^\d{2}\/\d{2}\/\d{4}$/.test(initialDate)) {
          const p = initialDate.split('/');
          datePicker.value = `${p[2]}-${p[0]}-${p[1]}`;
        } else {
          datePicker.value = todayIso;
        }
      }

      // Pre-select Reason
      if (reasonSelect) {
        let matchedReason = 'Quit';
        const rLower = (triggeredReason || tableRow['Last Day Reason'] || '').toLowerCase();
        if (rLower.includes('resign')) matchedReason = 'Resigned';
        else if (rLower.includes('layoff') || rLower.includes('laid')) matchedReason = 'Layoff';
        else if (rLower.includes('term')) matchedReason = 'Terminated';
        else if (rLower.includes('fire')) matchedReason = 'Fired';
        else if (rLower.includes('med')) matchedReason = 'Medical';
        else if (rLower.includes('other')) matchedReason = 'Other';
        else if (rLower.includes('quit')) matchedReason = 'Quit';
        reasonSelect.value = matchedReason;
      }

      if (notesInput) notesInput.value = '';

      // Bind Date pickers & quick buttons
      if (datePicker && dateInput) {
        datePicker.onchange = () => {
          if (datePicker.value) {
            const p = datePicker.value.split('-');
            dateInput.value = `${p[1]}/${p[2]}/${p[0]}`;
          }
        };
      }

      if (dateInput && datePicker) {
        dateInput.oninput = () => {
          const val = dateInput.value.trim();
          if (/^\d{2}\/\d{2}\/\d{4}$/.test(val)) {
            const p = val.split('/');
            datePicker.value = `${p[2]}-${p[0]}-${p[1]}`;
          }
        };
      }

      if (quickToday && dateInput && datePicker) {
        quickToday.onclick = (e) => {
          e.preventDefault();
          dateInput.value = todayFormatted;
          datePicker.value = todayIso;
        };
      }

      if (quickYesterday && dateInput && datePicker) {
        quickYesterday.onclick = (e) => {
          e.preventDefault();
          dateInput.value = yesterdayFormatted;
          datePicker.value = yesterdayIso;
        };
      }

      const cleanup = () => {
        modal.classList.remove('active');
        modal.style.display = 'none';
        modal.onclick = null;
        if (closeBtn) closeBtn.onclick = null;
        if (cancelBtn) cancelBtn.onclick = null;
        if (confirmBtn) confirmBtn.onclick = null;
        if (datePicker) datePicker.onchange = null;
        if (dateInput) dateInput.oninput = null;
        if (quickToday) quickToday.onclick = null;
        if (quickYesterday) quickYesterday.onclick = null;
        document.removeEventListener('keydown', handleEsc);
      };

      const handleEsc = (e) => {
        if (e.key === 'Escape') {
          handleCancel();
        }
      };

      const handleCancel = () => {
        cleanup();
        if (targetCell) {
          targetCell.textContent = initialVal;
        }
        if (window.showToast) {
          window.showToast(`Departure cancelled. Location reverted to "${initialVal}".`, 'info');
        }
        resolve(null);
      };

      const handleConfirm = async () => {
        let dVal = dateInput ? dateInput.value.trim() : '';
        if (!dVal) dVal = todayFormatted;
        if (dVal.includes('-')) {
          const p = dVal.split('-');
          if (p.length === 3) dVal = `${p[1]}/${p[2]}/${p[0]}`;
        }

        const reasonVal = reasonSelect ? reasonSelect.value : 'Quit';
        const notesVal = notesInput ? notesInput.value.trim() : '';

        if (confirmBtn) {
          confirmBtn.disabled = true;
          confirmBtn.innerHTML = '<span>⏳</span> Archiving...';
        }

        try {
          await this._commitEmployeeDeparture(
            tableRow,
            actualRowIdx,
            empName,
            dVal,
            reasonVal,
            notesVal,
            priorLocation
          );
          cleanup();
          resolve({ confirmed: true, lastDay: dVal, reason: reasonVal, notes: notesVal });
        } catch (err) {
          console.error('Error in handleConfirm departure:', err);
          alert(`Error archiving employee: ${err.message}`);
          if (confirmBtn) {
            confirmBtn.disabled = false;
            confirmBtn.innerHTML = '🚪 Confirm Departure & Archive';
          }
        }
      };

      modal.onclick = (e) => {
        if (e.target === modal) handleCancel();
      };
      if (closeBtn) closeBtn.onclick = handleCancel;
      if (cancelBtn) cancelBtn.onclick = handleCancel;
      if (confirmBtn) confirmBtn.onclick = handleConfirm;

      document.addEventListener('keydown', handleEsc);

      modal.style.display = 'flex';
      modal.classList.add('active');
      setTimeout(() => {
        if (dateInput) {
          dateInput.focus();
          dateInput.select();
        }
      }, 50);
    });
  }

  async _commitEmployeeDeparture(tableRow, actualRowIdx, empName, lastDay, reason, notes, priorLocation = 'Helena') {
    const empTable = this.db.getTable('employees');
    const histTable = this.db.getTable('employee_history');
    const priorJob = tableRow['Job Number'] || tableRow['Job #'] || 'N/A';
    const hireDate = tableRow['Hire Date'] || '';

    // 1. Update In-Memory Row for Employees
    tableRow['Location'] = 'Previous Employee';
    tableRow['Last Day'] = lastDay;
    tableRow['Last Day Reason'] = reason;
    if (tableRow['Status'] !== undefined) {
      tableRow['Status'] = 'Previous Employee';
    }

    // 2. Sync to Employees rawGrid
    if (empTable && empTable.rawGrid && actualRowIdx > 0 && empTable.rawGrid[actualRowIdx - 1]) {
      const gRow = empTable.rawGrid[actualRowIdx - 1];
      const headers = empTable.headers || [];
      const locIdx = headers.findIndex(h => h.toLowerCase() === 'location');
      const ldIdx = headers.findIndex(h => h.toLowerCase() === 'last day');
      const ldrIdx = headers.findIndex(h => h.toLowerCase() === 'last day reason');
      const statIdx = headers.findIndex(h => h.toLowerCase() === 'status');

      if (locIdx !== -1) gRow[locIdx] = 'Previous Employee';
      if (ldIdx !== -1) gRow[ldIdx] = lastDay;
      if (ldrIdx !== -1) gRow[ldrIdx] = reason;
      if (statIdx !== -1) gRow[statIdx] = 'Previous Employee';
    }

    // 3. Append to Employee History
    const eventType = (reason === 'Quit' || reason === 'Resigned') ? 'Quit' : 'Terminated';
    const historyNotes = `Departed (${reason}) · Prior Location: ${priorLocation}, Prior Crew: ${priorJob}.${notes ? ' ' + notes : ''}`.trim();

    const histRow = {
      'Date': lastDay,
      'Employee Name': empName,
      'Name': empName,
      'Event Type': eventType,
      'Location': 'Previous Employee',
      'Job Number': '',
      'Hire Date': hireDate,
      'Last Day': lastDay,
      'Last Day Reason': reason,
      'Rehire Date': '',
      'Notes': historyNotes,
      'Phone Number': tableRow['Phone Number'] || '',
      'Email Address': tableRow['Email Address'] || '',
      'Glove Size': tableRow['Glove Size'] || '',
      'Sleeve Size': tableRow['Sleeve Size'] || ''
    };

    if (histTable) {
      if (!histTable.rows) histTable.rows = [];
      histTable.rows.push(histRow);
      if (histTable.rawGrid) {
        const hHeaders = histTable.headers || Object.keys(histRow);
        histTable.rawGrid.push(hHeaders.map(h => histRow[h] !== undefined ? histRow[h] : ''));
      }
    }

    // 4. Update Expiring Certs Location to 'Previous Employee'
    const certsTable = this.db.getTable('expiring_certs');
    if (certsTable && certsTable.rows) {
      const empNameLower = empName.toLowerCase();
      certsTable.rows.forEach((cr, rIdx) => {
        const cName = String(cr['Employee Name'] || cr['Name'] || Object.values(cr)[0] || '').trim().toLowerCase();
        if (cName === empNameLower) {
          cr['Location'] = 'Previous Employee';
          if (certsTable.rawGrid && certsTable.headers && certsTable.rawGrid[rIdx + 1]) {
            const cLocIdx = certsTable.headers.indexOf('Location');
            if (cLocIdx !== -1) certsTable.rawGrid[rIdx + 1][cLocIdx] = 'Previous Employee';
          }
        }
      });
    }

    // 5. Queue Outbox Mutations
    await this.db.addMutation({
      action: 'UPDATE_ROW',
      sheetName: 'Employees',
      tableKey: 'employees',
      itemIdentifier: empName,
      row: actualRowIdx,
      updatedFields: {
        'Location': 'Previous Employee',
        'Last Day': lastDay,
        'Last Day Reason': reason,
        'Status': 'Previous Employee'
      }
    });

    await this.db.addMutation({
      action: 'ADD_ROW',
      sheetName: 'Employee History',
      tableKey: 'employee_history',
      rowData: histRow
    });

    // 6. Persist Local Snapshot
    if (typeof this.db.saveLocalSnapshot === 'function') {
      await this.db.saveLocalSnapshot();
    } else if (typeof this.db.persistSnapshot === 'function') {
      await this.db.persistSnapshot(this.db.snapshot);
    }

    // 7. Rebuild Employee Resolver Index
    if (window.employeeResolver && typeof window.employeeResolver.rebuildIndex === 'function') {
      window.employeeResolver.rebuildIndex();
    }

    // 8. Close Employee Profile modal if open
    if (window.employeeProfileEngine && typeof window.employeeProfileEngine.closeProfileModal === 'function') {
      window.employeeProfileEngine.closeProfileModal();
    }

    // 9. Re-render Current Sheet
    this.renderCurrentSheet();

    // 10. Re-render Previous Employees Workspace if active
    if (window.previousEmployeesWorkspace && typeof window.previousEmployeesWorkspace.renderWorkspace === 'function') {
      window.previousEmployeesWorkspace.renderWorkspace();
    }

    // 11. Success Notification
    if (window.showToast) {
      window.showToast(`🚪 ${empName} archived as Previous Employee (${reason}, Last Day: ${lastDay}).`, 'success');
    } else {
      alert(`🚪 ${empName} has been archived as a Previous Employee.\n\nReason: ${reason}\nLast Day: ${lastDay}`);
    }
  }

  showCellAutocomplete(td, query) {
    if (!td) return;
    const h = (td.dataset.header || '').toLowerCase();
    let results = [];

    if (this.currentSheetKey === 'employees' && h === 'last day reason') {
      const allReasons = [
        { name: 'Quit', subText: 'Voluntary separation', icon: '🚪' },
        { name: 'Resigned', subText: 'Voluntary resignation', icon: '👋' },
        { name: 'Layoff', subText: 'Reduction in force / seasonal end', icon: '📦' },
        { name: 'Terminated', subText: 'Involuntary termination', icon: '🛑' },
        { name: 'Fired', subText: 'Involuntary discharge', icon: '⚠️' },
        { name: 'Medical', subText: 'Medical leave / disability', icon: '🏥' },
        { name: 'Other', subText: 'Other departure reason', icon: '📝' }
      ];
      const qLower = String(query || '').toLowerCase().trim();
      results = qLower ? allReasons.filter(r => r.name.toLowerCase().includes(qLower) || r.subText.toLowerCase().includes(qLower)) : allReasons;
    } else if (this.currentSheetKey === 'employees' && h === 'location') {
      const qLower = String(query || '').toLowerCase().trim();
      const standardLocs = [
        { name: 'Helena', subText: 'Shop / Central Yard', icon: '📍' },
        { name: 'Bozeman', subText: 'Montana Operations', icon: '📍' },
        { name: 'Great Falls', subText: 'Montana Operations', icon: '📍' },
        { name: 'Butte', subText: 'Montana Operations', icon: '📍' },
        { name: 'Billings', subText: 'Montana Operations', icon: '📍' },
        { name: 'Missoula', subText: 'Montana Operations', icon: '📍' },
        { name: 'Three Rivers', subText: 'Montana Operations', icon: '📍' },
        { name: 'Previous Employee', subText: '🚪 Depart & Archive to History', icon: '🚪' }
      ];
      const empTable = this.db.getTable('employees');
      if (empTable && empTable.rows) {
        const seen = new Set(standardLocs.map(l => l.name.toLowerCase()));
        empTable.rows.forEach(r => {
          const l = String(r['Location'] || '').trim();
          if (l && !seen.has(l.toLowerCase()) && !l.toLowerCase().includes('previous')) {
            seen.add(l.toLowerCase());
            standardLocs.splice(standardLocs.length - 1, 0, { name: l, subText: 'Field Location', icon: '📍' });
          }
        });
      }
      results = qLower ? standardLocs.filter(l => l.name.toLowerCase().includes(qLower) || l.subText.toLowerCase().includes(qLower)) : standardLocs;
    } else if (this.currentSheetKey === 'locations' && (h.includes('rubber class') || h.includes('approval'))) {
      const approvalOptions = [
        { name: 'CL2', subText: 'Class 2 Rubber', icon: '🧤' },
        { name: 'CL3', subText: 'Class 3 Rubber - e.g. Big Sky', icon: '⚡' },
        { name: 'CL2 & CL3', subText: 'Both Class 2 and Class 3 Approved', icon: '🔄' },
        { name: 'None', subText: 'No High Voltage Rubber Work / Office', icon: '🚫' }
      ];
      const qClean = String(query || '').replace(/[^\w\s&]/g, '').trim().toLowerCase();
      if (!qClean || qClean.includes('17kv') || qClean.includes('26') || qClean.includes('cl2') || qClean.includes('cl3') || qClean.includes('none') || qClean.includes('both')) {
        results = approvalOptions;
      } else {
        results = approvalOptions.filter(o => o.name.toLowerCase().includes(qClean) || o.subText.toLowerCase().includes(qClean));
        if (results.length === 0) results = approvalOptions;
      }
    } else if (this.currentSheetKey === 'locations' && h === 'direction') {
      const qLower = String(query || '').toLowerCase().trim();
      const directions = [
        { name: 'Home', subText: 'Helena Base', icon: '🏠' },
        { name: 'North', subText: 'North towards Great Falls', icon: '⬆️' },
        { name: 'East', subText: 'East towards Bozeman / Billings', icon: '➡️' },
        { name: 'Southwest', subText: 'Southwest towards Butte', icon: '↙️' },
        { name: 'West', subText: 'West towards Missoula', icon: '⬅️' },
        { name: 'Northwest', subText: 'Northwest towards Kalispell', icon: '↖️' },
        { name: 'Far', subText: 'Remote / Out of State', icon: '✈️' },
        { name: 'Office', subText: 'Non-field Location', icon: '🏢' }
      ];
      results = qLower ? directions.filter(d => d.name.toLowerCase().includes(qLower) || d.subText.toLowerCase().includes(qLower)) : directions;
    } else if (this.currentSheetKey === 'training_tracking' && (h === 'status' || h === 'training status')) {
      const statusOptions = [
        { name: 'Complete', subText: 'Training completed & verified', icon: '✅' },
        { name: 'Scheduled', subText: 'Upcoming scheduled session', icon: '⏳' },
        { name: 'On Hold', subText: 'Training paused or postponed', icon: '⏸️' },
        { name: 'Cancelled', subText: 'Session cancelled', icon: '❌' },
        { name: 'N/A', subText: 'Not applicable for this crew', icon: '🚫' }
      ];
      const qClean = String(query || '').replace(/[^\w\s&]/g, '').trim().toLowerCase();
      if (!qClean) {
        results = statusOptions;
      } else {
        results = statusOptions.filter(o => o.name.toLowerCase().includes(qClean) || o.subText.toLowerCase().includes(qClean));
        if (results.length === 0) results = statusOptions;
      }
    } else {
      if (!window.employeeResolver) return;
      results = window.employeeResolver.search(query, 10);
    }

    if (!results || results.length === 0) {
      this.closeCellAutocomplete();
      return;
    }

    let dropdown = document.getElementById('cell-autocomplete-dropdown');
    if (!dropdown) {
      dropdown = document.createElement('div');
      dropdown.id = 'cell-autocomplete-dropdown';
      dropdown.className = 'cell-autocomplete-dropdown';
      document.body.appendChild(dropdown);
    }

    this._activeAutocompleteCell = td;
    this._autocompleteResults = results;
    this._autocompleteIndex = 0; // Default highlight first candidate

    // Position relative to cell
    const rect = td.getBoundingClientRect();
    const dropdownHeight = Math.min(results.length * 52 + 10, 320);
    const spaceBelow = window.innerHeight - rect.bottom;

    dropdown.style.left = `${Math.max(10, Math.min(window.innerWidth - 300, rect.left))}px`;
    dropdown.style.width = `${Math.max(260, rect.width)}px`;

    if (spaceBelow < dropdownHeight && rect.top > dropdownHeight) {
      dropdown.style.top = `${rect.top - dropdownHeight - 4}px`;
    } else {
      dropdown.style.top = `${rect.bottom + 4}px`;
    }

    dropdown.innerHTML = results.map((item, idx) => {
      const isAct = idx === 0 ? 'active' : '';
      const aliasHtml = item.aliasMatch ? `<div class="item-alias">${this.escapeHtml(item.aliasMatch)}</div>` : '';
      return `
        <div class="cell-autocomplete-item ${isAct}" data-index="${idx}">
          <div class="item-icon">${item.icon || '👤'}</div>
          <div class="item-details">
            <div class="item-title">${this.escapeHtml(item.name)}</div>
            <div class="item-sub">${this.escapeHtml(item.subText || '')}</div>
            ${aliasHtml}
          </div>
        </div>
      `;
    }).join('');

    dropdown.style.display = 'block';

    // Click handler for suggestion items
    dropdown.querySelectorAll('.cell-autocomplete-item').forEach(el => {
      el.onmousedown = (e) => {
        e.preventDefault(); // Prevent td from blurring before click completes
      };
      el.onclick = (e) => {
        e.stopPropagation();
        const idx = parseInt(el.dataset.index, 10);
        if (!isNaN(idx) && this._autocompleteResults && this._autocompleteResults[idx]) {
          this.selectActiveAutocomplete(td, this._autocompleteResults[idx]);
        }
      };
    });
  }

  navigateAutocomplete(direction) {
    const dropdown = document.getElementById('cell-autocomplete-dropdown');
    if (!dropdown || !this._autocompleteResults || this._autocompleteResults.length === 0) return;

    this._autocompleteIndex = (this._autocompleteIndex + direction + this._autocompleteResults.length) % this._autocompleteResults.length;

    const items = dropdown.querySelectorAll('.cell-autocomplete-item');
    items.forEach((it, idx) => {
      if (idx === this._autocompleteIndex) {
        it.classList.add('active');
        it.scrollIntoView({ block: 'nearest' });
      } else {
        it.classList.remove('active');
      }
    });
  }

  selectActiveAutocomplete(td, selectedItem = null) {
    const item = selectedItem || (this._autocompleteResults && this._autocompleteResults[this._autocompleteIndex]);
    if (!item || !td) {
      this.closeCellAutocomplete();
      return;
    }

    const cellTextSpan = td.querySelector('.cell-text');
    if (cellTextSpan) {
      cellTextSpan.textContent = item.name;
    } else {
      td.textContent = item.name;
    }

    td._autocompleteSelected = item;
    this.closeCellAutocomplete();
    td.blur();
  }

  closeCellAutocomplete() {
    const dropdown = document.getElementById('cell-autocomplete-dropdown');
    if (dropdown) {
      dropdown.style.display = 'none';
      dropdown.innerHTML = '';
    }
    this._activeAutocompleteCell = null;
    this._autocompleteResults = null;
    this._autocompleteIndex = -1;
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
    const currentStatus = String(row['Status'] || 'Active').trim();
    const currentCrewType = String(row['Crew Type'] || 'Electric').trim();
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

          <!-- Crew Discipline / Type Selector -->
          <div style="margin-bottom: 16px;">
            <label style="font-size: 12px; font-weight: 700; color: var(--text-muted); display: block; margin-bottom: 6px;">Crew Discipline / Type:</label>
            <select id="job-modal-crew-type" class="form-control" style="width: 100%; box-sizing: border-box; padding: 7px 10px; background: var(--bg-primary); color: var(--text-primary); border: 1px solid var(--border-color); border-radius: 6px; font-size: 12.5px; font-weight: 700;">
              <option value="Electric" ${currentCrewType === 'Electric' ? 'selected' : ''}>⚡ Electric (Rubber PPE Required)</option>
              <option value="Substation" ${currentCrewType === 'Substation' ? 'selected' : ''}>🏗️ Substation (No Rubber PPE)</option>
              <option value="Gas" ${currentCrewType === 'Gas' ? 'selected' : ''}>⛽ Gas (No Rubber PPE)</option>
              <option value="Office" ${currentCrewType === 'Office' ? 'selected' : ''}>🏢 Office (Rubber PPE Required)</option>
              <option value="Mechanic" ${currentCrewType === 'Mechanic' ? 'selected' : ''}>🔧 Mechanic (No Rubber PPE)</option>
            </select>
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
          <div style="display: flex; justify-content: space-between; align-items: center; gap: 10px;">
            <button class="btn btn-secondary admin-only-control" style="color: #f87171; border-color: rgba(239, 68, 68, 0.4); background: rgba(239, 68, 68, 0.1); cursor: pointer;" onclick="window.sheetNavigator.deleteJobTrackingRow('${this.escapeHtml(jobNum)}')">🗑️ Delete Job</button>
            <div style="display: flex; gap: 10px;">
              <button class="btn btn-secondary" onclick="document.getElementById('job-lifecycle-sheet-modal').remove()">Cancel</button>
              <button class="btn btn-primary" onclick="window.sheetNavigator.saveJobLifecycleModal('${this.escapeHtml(jobNum)}')">💾 Save Changes</button>
            </div>
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
    const targetCrewType = document.getElementById('job-modal-crew-type')?.value || 'Electric';
    const todayFormatted = new Date().toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' });

    row['Status'] = targetStatus;
    row['Crew Type'] = targetCrewType;
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
      row['Actual End Date'] = '';
    } else if (targetStatus === 'Pending Start') {
      row['Start Date'] = document.getElementById('input-start-date').value || '';
      row['Put On Hold Date'] = '';
      row['Estimated Return'] = '';
      row['Actual End Date'] = '';
    } else if (targetStatus === 'Completed') {
      row['Actual End Date'] = document.getElementById('input-end-date').value || todayFormatted;
      row['Put On Hold Date'] = '';
      row['Estimated Return'] = '';
    } else if (targetStatus === 'Active') {
      if (!row['Start Date']) row['Start Date'] = todayFormatted;
      row['Put On Hold Date'] = '';
      row['Estimated Return'] = '';
      row['Actual End Date'] = '';
    }

    // Sync raw grid
    if (jtTable.rawGrid && jtTable.headers) {
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
        'Crew Type': targetCrewType,
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

  async deleteJobTrackingRow(jobNum) {
    if (!jobNum) return;
    const cleanJobNum = String(jobNum).trim();

    const confirmed = confirm(`Are you sure you want to delete Job #${cleanJobNum} from Job Tracking?\n\nThis will remove the job from the active roster and queue the deletion to Google Sheets.`);
    if (!confirmed) return;

    const modal = document.getElementById('job-lifecycle-sheet-modal');
    if (modal) modal.remove();

    if (!this.db || typeof this.db.deleteRow !== 'function') {
      alert('Database deleteRow function is not available.');
      return;
    }

    const success = await this.db.deleteRow('job_tracking', cleanJobNum);
    if (success) {
      if (typeof window.showToast === 'function') {
        window.showToast(`🗑️ Job #${cleanJobNum} deleted successfully.`, 'success');
      } else if (window.inventoryManager && typeof window.inventoryManager.showToast === 'function') {
        window.inventoryManager.showToast(`🗑️ Job #${cleanJobNum} deleted successfully.`);
      }
      this.renderCurrentSheet();
    } else {
      alert(`Could not find Job #${cleanJobNum} in Job Tracking.`);
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

  escapeJs(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/\\/g, '\\\\')
      .replace(/'/g, "\\'")
      .replace(/"/g, '&quot;')
      .replace(/[\n\r]/g, ' ');
  }

  // ==========================================
  // NEW EMPLOYEE MODAL & SUBMISSION WORKFLOW
  // ==========================================

  showNewEmployeeModal() {
    const modal = document.getElementById('new-employee-modal');
    if (!modal) return;

    // Reset form
    const form = document.getElementById('new-employee-form');
    if (form) form.reset();

    // Reset banners
    const rehireBanner = document.getElementById('new-emp-rehire-banner');
    if (rehireBanner) {
      rehireBanner.style.display = 'none';
      rehireBanner.style.background = 'rgba(14, 165, 233, 0.12)';
      rehireBanner.style.borderColor = '#0284c7';
    }
    const dupBanner = document.getElementById('new-emp-dup-banner');
    if (dupBanner) dupBanner.style.display = 'none';
    const inlineLocForm = document.getElementById('new-emp-inline-loc-form');
    if (inlineLocForm) inlineLocForm.style.display = 'none';
    const saveBtn = document.getElementById('btn-save-new-employee');
    if (saveBtn) {
      saveBtn.disabled = false;
      saveBtn.innerHTML = '<span>💾</span> Save Employee';
    }
    this._detectedRehireData = null;

    // Set today as default hire date (local timezone, not UTC)
    const now = new Date();
    const mm = ('0' + (now.getMonth() + 1)).slice(-2);
    const dd = ('0' + now.getDate()).slice(-2);
    const todayIso = `${now.getFullYear()}-${mm}-${dd}`;
    const hireDateInput = document.getElementById('new-emp-hire-date');
    if (hireDateInput) hireDateInput.value = todayIso;

    // Populate Location dropdown
    const locSelect = document.getElementById('new-emp-location');
    if (locSelect) {
      locSelect.innerHTML = '<option value="">Select location...</option>';

      const locSet = new Set();
      const statusLocations = [
        'vacation', 'light duty', 'weeds', 'leave', 'previous employee',
        'medical', "worker's comp", 'unknown', 'on shelf', 'not repairable',
        'in testing', 'packed for testing', 'packed for delivery', 'destroyed',
        'failed rubber', 'reclaimed'
      ];

      const addLoc = (loc) => {
        if (!loc) return;
        const clean = String(loc).replace(/\s*\([^)]*\)/g, '').trim();
        if (clean && !statusLocations.includes(clean.toLowerCase())) {
          locSet.add(clean);
        }
      };

      const empTable = this.db.getTable('employees');
      if (empTable && empTable.rows) {
        empTable.rows.forEach(r => addLoc(r['Location']));
      }

      const jtTable = this.db.getTable('job_tracking');
      if (jtTable && jtTable.rows) {
        jtTable.rows.forEach(r => addLoc(r['Location']));
      }

      const locTable = this.db.getTable('locations');
      if (locTable && locTable.rows) {
        locTable.rows.forEach(r => addLoc(r['Location'] || r['Name']));
      }

      // Default common locations if table is empty
      ['Helena', 'Bozeman', 'Great Falls', 'Billings', 'Missoula', 'Belgrade', 'Butte', 'Big Sky', 'Kalispell'].forEach(l => locSet.add(l));

      const sortedLocs = Array.from(locSet).sort((a, b) => a.localeCompare(b));
      sortedLocs.forEach(loc => {
        const opt = document.createElement('option');
        opt.value = loc;
        opt.textContent = loc;
        locSelect.appendChild(opt);
      });

      // Add Unknown option (for pending new hires)
      const unknownOpt = document.createElement('option');
      unknownOpt.value = 'Unknown';
      unknownOpt.textContent = 'Unknown (Pending Hires only)';
      locSelect.appendChild(unknownOpt);

      // Add "+ Add New Location..."
      const addNewOpt = document.createElement('option');
      addNewOpt.value = '__ADD_NEW__';
      addNewOpt.textContent = '➕ Add New City/Location...';
      addNewOpt.style.color = '#38bdf8';
      addNewOpt.style.fontWeight = 'bold';
      locSelect.appendChild(addNewOpt);
    }

    // Populate Job Numbers datalist
    const jobDatalist = document.getElementById('new-emp-job-datalist');
    if (jobDatalist) {
      jobDatalist.innerHTML = '';
      const jtTable = this.db.getTable('job_tracking');
      if (jtTable && jtTable.rows) {
        const seenJobs = new Set();
        jtTable.rows.forEach(r => {
          const jNum = String(r['Job Number'] || r['Crew'] || '').trim();
          const jLoc = String(r['Location'] || '').trim();
          const jName = String(r['Job Name'] || r['Foreman'] || '').trim();
          if (jNum && !seenJobs.has(jNum)) {
            seenJobs.add(jNum);
            const opt = document.createElement('option');
            opt.value = jNum;
            opt.label = `${jLoc ? jLoc + ' • ' : ''}${jName || ''}`;
            jobDatalist.appendChild(opt);
          }
        });
      }
    }

    this.checkNewEmployeePendingStatus();

    modal.classList.add('active');
    const nameInput = document.getElementById('new-emp-name');
    if (nameInput) setTimeout(() => nameInput.focus(), 50);
  }

  openNewEmployeeModal() {
    this.showNewEmployeeModal();
  }

  closeNewEmployeeModal() {
    const modal = document.getElementById('new-employee-modal');
    if (modal) modal.classList.remove('active');
  }

  checkNewEmployeePendingStatus() {
    const hireDateInput = document.getElementById('new-emp-hire-date');
    const pendingBanner = document.getElementById('new-emp-pending-banner');
    const locHint = document.getElementById('new-emp-location-hint');
    if (!hireDateInput || !pendingBanner) return;

    const hireDateStr = hireDateInput.value;
    let isPending = false;
    let formattedDate = '';
    if (hireDateStr) {
      const parts = hireDateStr.split('-');
      if (parts.length === 3) {
        const hireDate = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10), 12, 0, 0);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        isPending = hireDate > today;
        formattedDate = `${parts[1]}/${parts[2]}/${parts[0]}`;
      }
    }

    pendingBanner.style.display = isPending ? 'block' : 'none';
    if (isPending) {
      pendingBanner.innerHTML = `⏳ <strong>Pending New Hire:</strong> Starts on <strong>${formattedDate}</strong>. Equipment can be pre-assigned without triggering history warnings.`;
    }
    if (locHint) {
      locHint.textContent = isPending
        ? '✓ Future start date: "Unknown" is available if location is TBD'
        : '"Unknown" is only for Pending Hires (future start dates)';
      locHint.style.color = isPending ? '#38bdf8' : 'var(--text-muted)';
    }
  }

  onNewEmpLocationChange() {
    const locSelect = document.getElementById('new-emp-location');
    const inlineForm = document.getElementById('new-emp-inline-loc-form');
    if (!locSelect || !inlineForm) return;

    if (locSelect.value === '__ADD_NEW__') {
      inlineForm.style.display = 'block';
      const nameInput = document.getElementById('new-emp-custom-loc-name');
      if (nameInput) {
        nameInput.value = '';
        nameInput.focus();
      }
      locSelect.value = '';
    } else {
      inlineForm.style.display = 'none';
    }
  }

  saveCustomLocation() {
    const nameInput = document.getElementById('new-emp-custom-loc-name');
    const locSelect = document.getElementById('new-emp-location');
    const inlineForm = document.getElementById('new-emp-inline-loc-form');
    const newLoc = String(nameInput ? nameInput.value : '').trim();
    if (!newLoc) {
      alert('Please enter a location name.');
      return;
    }

    if (locSelect) {
      const opt = document.createElement('option');
      opt.value = newLoc;
      opt.textContent = newLoc;
      const addNewOpt = locSelect.querySelector('option[value="__ADD_NEW__"]');
      if (addNewOpt) {
        locSelect.insertBefore(opt, addNewOpt);
      } else {
        locSelect.appendChild(opt);
      }
      locSelect.value = newLoc;
    }
    if (inlineForm) inlineForm.style.display = 'none';
  }

  cancelCustomLocation() {
    const inlineForm = document.getElementById('new-emp-inline-loc-form');
    const locSelect = document.getElementById('new-emp-location');
    if (inlineForm) inlineForm.style.display = 'none';
    if (locSelect) locSelect.value = '';
  }

  onNewEmpJobNumberChange() {
    const jobInput = document.getElementById('new-emp-job-number');
    const locSelect = document.getElementById('new-emp-location');
    if (!jobInput || !locSelect) return;
    const val = String(jobInput.value || '').trim();
    if (!val) return;

    const jtTable = this.db.getTable('job_tracking');
    if (jtTable && jtTable.rows) {
      const match = jtTable.rows.find(r => {
        const jNum = String(r['Job Number'] || r['Crew'] || '').trim();
        return jNum.toLowerCase() === val.toLowerCase();
      });
      if (match) {
        const crewLoc = String(match['Location'] || '').trim();
        if (crewLoc && (!locSelect.value || locSelect.value === 'Unknown')) {
          for (let i = 0; i < locSelect.options.length; i++) {
            if (locSelect.options[i].value.toLowerCase() === crewLoc.toLowerCase()) {
              locSelect.selectedIndex = i;
              break;
            }
          }
        }
      }
    }
  }

  onNewEmployeeNameInput(rawName) {
    const name = String(rawName || '').trim();
    const rehireBanner = document.getElementById('new-emp-rehire-banner');
    const dupBanner = document.getElementById('new-emp-dup-banner');
    const saveBtn = document.getElementById('btn-save-new-employee');
    this._detectedRehireData = null;

    if (!name || name.length < 2) {
      if (rehireBanner) rehireBanner.style.display = 'none';
      if (dupBanner) dupBanner.style.display = 'none';
      if (saveBtn) saveBtn.innerHTML = '<span>💾</span> Save Employee';
      return;
    }

    const isMatch = (target) => {
      if (!target) return false;
      if (window.employeeProfileEngine && typeof window.employeeProfileEngine.isNameMatch === 'function') {
        return window.employeeProfileEngine.isNameMatch(name, target);
      }
      return name.toLowerCase() === String(target).toLowerCase().trim();
    };

    // 1. Check for duplicate ACTIVE employee
    const empTable = this.db.getTable('employees');
    let activeMatch = null;
    if (empTable && empTable.rows) {
      activeMatch = empTable.rows.find(r => {
        const rName = r['Name'] || r['Employee Name'] || '';
        const lastDay = r['Last Day'] || '';
        return isMatch(rName) && !lastDay;
      });
    }

    if (activeMatch) {
      if (dupBanner) {
        dupBanner.style.display = 'block';
        const msg = document.getElementById('new-emp-dup-msg');
        const crew = activeMatch['Job Number'] || 'No Crew';
        const loc = activeMatch['Location'] || 'No Location';
        if (msg) msg.textContent = `An active employee named "${activeMatch['Name'] || activeMatch['Employee Name']}" already exists on Crew ${crew} (${loc}).`;
      }
    } else {
      if (dupBanner) dupBanner.style.display = 'none';
    }

    // 2. Search for former employee / rehire records in previous_employees, employee_history, or inactive rows in employees
    let prevData = null;
    const prevTable = this.db.getTable('previous_employees');
    if (prevTable && prevTable.rows) {
      const pRow = prevTable.rows.find(r => isMatch(r['Name'] || r['Employee Name']));
      if (pRow) prevData = pRow;
    }

    if (!prevData && empTable && empTable.rows) {
      const inactRow = empTable.rows.find(r => isMatch(r['Name'] || r['Employee Name']) && r['Last Day']);
      if (inactRow) prevData = inactRow;
    }

    const histTable = this.db.getTable('employee_history');
    let histRow = null;
    if (histTable && histTable.rows) {
      for (let i = histTable.rows.length - 1; i >= 0; i--) {
        const r = histTable.rows[i];
        if (isMatch(r['Employee Name'] || r['Name'])) {
          histRow = r;
          break;
        }
      }
    }

    if (prevData || histRow) {
      this._detectedRehireData = {
        name: (prevData && (prevData['Name'] || prevData['Employee Name'])) || (histRow && (histRow['Employee Name'] || histRow['Name'])),
        phone: (prevData && prevData['Phone Number']) || (histRow && histRow['Phone Number']) || '',
        email: (prevData && prevData['Email Address']) || (histRow && histRow['Email Address']) || '',
        mpEmail: (prevData && prevData['MP Email']) || (histRow && histRow['MP Email']) || '',
        notificationEmails: (prevData && prevData['Notification Emails']) || (histRow && histRow['Notification Emails']) || '',
        classification: (prevData && (prevData['Job Classification'] || prevData['Class'])) || (histRow && (histRow['Job Classification'] || histRow['Class'])) || '',
        gloveSize: (prevData && prevData['Glove Size']) || '',
        sleeveSize: (prevData && prevData['Sleeve Size']) || ''
      };

      if (rehireBanner) {
        rehireBanner.style.display = 'block';
        rehireBanner.style.background = 'rgba(14, 165, 233, 0.12)';
        rehireBanner.style.borderColor = '#0284c7';
        rehireBanner.innerHTML = `
          <div style="display: flex; align-items: flex-start; justify-content: space-between; gap: 10px;">
            <div>
              <div style="font-weight: 700; color: #38bdf8; font-size: 13px; display: flex; align-items: center; gap: 6px;">
                <span>🔄</span> Rehire Detected
              </div>
              <div id="new-emp-rehire-msg" style="font-size: 12px; color: #bae6fd; margin-top: 3px;">
                Previous records found for <strong>${this.escapeHtml(this._detectedRehireData.name)}</strong>. Click "Pre-fill Info" to restore contact details, trade rank, and PPE sizes.
              </div>
            </div>
            <button type="button" class="btn" id="btn-prefill-rehire" style="background: #0284c7; color: white; font-size: 11px; padding: 4px 10px; font-weight: 600; white-space: nowrap;" onclick="window.sheetNavigator.prefillFromRehire()">
              ⚡ Pre-fill Info
            </button>
          </div>
        `;
      }
      if (saveBtn) saveBtn.innerHTML = '<span>🔄</span> Save & Rehire Employee';
    } else {
      if (rehireBanner) rehireBanner.style.display = 'none';
      if (saveBtn) saveBtn.innerHTML = '<span>💾</span> Save Employee';
    }
  }

  prefillFromRehire() {
    if (!this._detectedRehireData) return;
    const d = this._detectedRehireData;
    if (d.phone) {
      const phoneInput = document.getElementById('new-emp-phone');
      if (phoneInput) phoneInput.value = d.phone;
    }
    if (d.email) {
      const emailInput = document.getElementById('new-emp-email');
      if (emailInput) emailInput.value = d.email;
    }
    if (d.mpEmail) {
      const mpEmailInput = document.getElementById('new-emp-mp-email');
      if (mpEmailInput) mpEmailInput.value = d.mpEmail;
    }
    if (d.notificationEmails) {
      const notifInput = document.getElementById('new-emp-notifications');
      if (notifInput) notifInput.value = d.notificationEmails;
    }
    if (d.classification) {
      const classSelect = document.getElementById('new-emp-classification');
      if (classSelect) {
        for (let i = 0; i < classSelect.options.length; i++) {
          if (classSelect.options[i].value.toLowerCase() === d.classification.toLowerCase()) {
            classSelect.selectedIndex = i;
            break;
          }
        }
      }
    }
    if (d.gloveSize) {
      const gSelect = document.getElementById('new-emp-glove-size');
      if (gSelect) gSelect.value = d.gloveSize;
    }
    if (d.sleeveSize) {
      const sSelect = document.getElementById('new-emp-sleeve-size');
      if (sSelect) sSelect.value = d.sleeveSize;
    }

    const rehireBanner = document.getElementById('new-emp-rehire-banner');
    if (rehireBanner) {
      rehireBanner.style.background = 'rgba(16, 185, 129, 0.12)';
      rehireBanner.style.borderColor = '#10b981';
      rehireBanner.innerHTML = `<span style="color: #34d399; font-weight: 600; font-size: 12px;">✅ Restored previous contact info and PPE sizes for ${this.escapeHtml(d.name)}!</span>`;
    }
  }

  async submitNewEmployee() {
    const nameInput = document.getElementById('new-emp-name');
    const hireDateInput = document.getElementById('new-emp-hire-date');
    const locSelect = document.getElementById('new-emp-location');
    const jobInput = document.getElementById('new-emp-job-number');
    const classSelect = document.getElementById('new-emp-classification');
    const phoneInput = document.getElementById('new-emp-phone');
    const mpEmailInput = document.getElementById('new-emp-mp-email');
    const emailInput = document.getElementById('new-emp-email');
    const notifInput = document.getElementById('new-emp-notifications');
    const gloveSelect = document.getElementById('new-emp-glove-size');
    const sleeveSelect = document.getElementById('new-emp-sleeve-size');
    const saveBtn = document.getElementById('btn-save-new-employee');

    const fullName = String(nameInput ? nameInput.value : '').trim();
    if (!fullName) {
      alert('Please enter employee full name.');
      if (nameInput) nameInput.focus();
      return;
    }

    const rawHireDate = hireDateInput ? hireDateInput.value : '';
    if (!rawHireDate) {
      alert('Please select a Hire Date.');
      if (hireDateInput) hireDateInput.focus();
      return;
    }

    const location = String(locSelect ? locSelect.value : '').trim();
    if (!location) {
      alert('Please select a Location.');
      if (locSelect) locSelect.focus();
      return;
    }

    const classification = String(classSelect ? classSelect.value : '').trim();
    if (!classification) {
      alert('Please select a Job Classification / Trade Rank.');
      if (classSelect) classSelect.focus();
      return;
    }

    // Format Hire Date to MM/DD/YYYY
    let hireDateFormatted = rawHireDate;
    let isPending = false;
    if (rawHireDate.includes('-')) {
      const parts = rawHireDate.split('-');
      if (parts.length === 3) {
        hireDateFormatted = `${parts[1]}/${parts[2]}/${parts[0]}`;
        const hDate = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10), 12, 0, 0);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        isPending = hDate > today;
      }
    }

    if (location.toLowerCase() === 'unknown' && !isPending) {
      alert('"Unknown" location is only permitted for Pending New Hires with a future start date. Please select a real location.');
      if (locSelect) locSelect.focus();
      return;
    }

    const jobNumber = String(jobInput ? jobInput.value : '').trim();
    const phoneNumber = String(phoneInput ? phoneInput.value : '').trim();
    const mpEmail = String(mpEmailInput ? mpEmailInput.value : '').trim();
    const emailAddress = String(emailInput ? emailInput.value : '').trim();
    const notificationEmails = String(notifInput ? notifInput.value : '').trim();
    const gloveSize = String(gloveSelect ? gloveSelect.value : 'N/A').trim();
    const sleeveSize = String(sleeveSelect ? sleeveSelect.value : 'N/A').trim();

    const isRehire = Boolean(this._detectedRehireData);

    if (saveBtn) {
      saveBtn.disabled = true;
      saveBtn.innerHTML = '<span>⏳</span> Saving...';
    }

    try {
      const newEmpRow = {
        'Name': fullName,
        'Employee Name': fullName,
        'Verify': '',
        'Location': location,
        'Job Number': jobNumber,
        'Job #': jobNumber,
        'Phone Number': phoneNumber,
        'Notification Emails': notificationEmails,
        'MP Email': mpEmail,
        'Email Address': emailAddress,
        'Glove Size': gloveSize,
        'Sleeve Size': sleeveSize,
        'Hire Date': hireDateFormatted,
        'Last Day': '',
        'Last Day Reason': '',
        'Job Classification': classification,
        'Status': isPending ? 'Pending' : 'Active'
      };

      // Add row to Employees table
      await this.db.addRow('employees', newEmpRow, isRehire ? 'Rehire' : 'New Hire');

      // Record in Employee History
      const now = new Date();
      const mm = ('0' + (now.getMonth() + 1)).slice(-2);
      const dd = ('0' + now.getDate()).slice(-2);
      const todayFormatted = `${mm}/${dd}/${now.getFullYear()}`;

      const histRow = {
        'Date': todayFormatted,
        'Employee Name': fullName,
        'Name': fullName,
        'Event Type': isRehire ? 'Rehired' : 'New Hire',
        'Location': location,
        'Job Number': jobNumber,
        'Hire Date': hireDateFormatted,
        'Rehire Date': isRehire ? hireDateFormatted : '',
        'Last Day': '',
        'Last Day Reason': '',
        'Notes': isPending
          ? `Pending New Hire (starts ${hireDateFormatted}) on Crew ${jobNumber || 'TBD'} (${location}) as ${classification}`
          : `${isRehire ? 'Rehired' : 'New hire'} on Crew ${jobNumber || 'TBD'} (${location}) as ${classification}`
      };

      await this.db.addRow('employee_history', histRow);

      // Auto-apply cert requirements to Expiring Certs matrix
      if (window.certsConfigEngine && typeof window.certsConfigEngine.applyRequirementsToMatrix === 'function') {
        try {
          await window.certsConfigEngine.applyRequirementsToMatrix(false);
        } catch (certErr) {
          console.warn('Could not auto-apply certs matrix:', certErr);
        }
      }

      // Persist snapshot
      if (typeof this.db.setSnapshot === 'function') {
        await this.db.setSnapshot(this.db.snapshot);
      }

      this.closeNewEmployeeModal();

      // If user is on Employees sheet, switch/refresh grid
      this.currentSheetKey = 'employees';
      const searchInput = document.getElementById('sheet-search-input');
      if (searchInput) {
        searchInput.value = '';
        this.searchTerm = '';
      }
      this.renderTabsBar();
      this.renderCurrentSheet();

      // Show toast
      const toastMsg = isPending
        ? `⏳ Pending employee "${fullName}" saved! Starts ${hireDateFormatted}.`
        : `✅ Successfully added ${fullName} (${location}${jobNumber ? ' • ' + jobNumber : ''})!`;
      if (window.inventoryManager && typeof window.inventoryManager.showToast === 'function') {
        window.inventoryManager.showToast(toastMsg);
      } else {
        alert(toastMsg);
      }
    } catch (err) {
      console.error('Error saving new employee:', err);
      alert('Error saving employee: ' + (err.message || err));
    } finally {
      if (saveBtn) {
        saveBtn.disabled = false;
        saveBtn.innerHTML = '<span>💾</span> Save Employee';
      }
    }
  }
}

window.sheetNavigator = new SheetNavigator(window.localDB);

// Escape key closes modals
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    const empModal = document.getElementById('new-employee-modal');
    if (empModal && empModal.classList.contains('active')) {
      window.sheetNavigator.closeNewEmployeeModal();
    }
  }
});
