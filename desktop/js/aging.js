/**
 * aging.js - Inventory Aging & Fleet Lifecycle Analytics Engine (Phase 3 Step 4 Rework)
 * 
 * Features:
 * - Data-driven EOL calculation based on historical failed items per category.
 * - Accurate recertification calculations per utility specs (Gloves: 1yr shelf / 3mo assigned;
 *   Sleeves: 1yr assigned; Blankets/MACKs/Grounds: 1yr test; HV/Phasing: 10yr calib; Hot Sticks: 2yr; AED: N/A).
 * - Full manual configuration and override modal for Recert, Fresh, Mid-Life, Aging, and EOL thresholds.
 * - Horizontal KPI summary cards layout.
 */

class InventoryAgingEngine {
  constructor(db) {
    this.db = db;
    this.items = [];
    this.categoryEOLStats = {}; // { [catKey]: { avgDays, avgYears, count, hasData } }
    this.rules = this.loadRules();
    this.selectedCategory = 'all';
    this.selectedTier = 'all';
    this.selectedRecert = 'all';
    this.searchTerm = '';
    this.sortBy = 'age_desc';
    this.activeConfigCategory = 'gloves';
  }

  getDefaultRules() {
    return {
      gloves: {
        recertMode: 'GLOVES_DEFAULT', // 1 yr on shelf, 3 mo assigned
        customRecertDays: 90,
        eolMode: 'DATA_DRIVEN', // DATA_DRIVEN or MANUAL
        manualEolYears: 5.0,
        freshRatio: 0.25,
        midLifeRatio: 0.70,
        agingRatio: 1.0,
        manualFreshYears: 1.0,
        manualMidLifeYears: 3.0,
        manualAgingYears: 5.0
      },
      sleeves: {
        recertMode: 'SLEEVES_DEFAULT', // 1 yr past Date Assigned
        customRecertDays: 365,
        eolMode: 'DATA_DRIVEN',
        manualEolYears: 5.0,
        freshRatio: 0.25,
        midLifeRatio: 0.70,
        agingRatio: 1.0,
        manualFreshYears: 1.0,
        manualMidLifeYears: 3.0,
        manualAgingYears: 5.0
      },
      blankets: {
        recertMode: 'TEST_1YR', // 1 yr past Test Date
        customRecertDays: 365,
        eolMode: 'DATA_DRIVEN',
        manualEolYears: 5.0,
        freshRatio: 0.25,
        midLifeRatio: 0.70,
        agingRatio: 1.0,
        manualFreshYears: 1.0,
        manualMidLifeYears: 3.0,
        manualAgingYears: 5.0
      },
      macks: {
        recertMode: 'TEST_1YR', // 1 yr past Test Date
        customRecertDays: 365,
        eolMode: 'DATA_DRIVEN',
        manualEolYears: 5.0,
        freshRatio: 0.25,
        midLifeRatio: 0.70,
        agingRatio: 1.0,
        manualFreshYears: 1.0,
        manualMidLifeYears: 3.0,
        manualAgingYears: 5.0
      },
      grounds: {
        recertMode: 'TEST_1YR', // 1 yr past Test Date
        customRecertDays: 365,
        eolMode: 'DATA_DRIVEN',
        manualEolYears: 5.0,
        freshRatio: 0.25,
        midLifeRatio: 0.70,
        agingRatio: 1.0,
        manualFreshYears: 1.0,
        manualMidLifeYears: 3.0,
        manualAgingYears: 5.0
      },
      hv_testers: {
        recertMode: 'CALIB_10YR', // 10 yrs past Calibration Date
        customRecertDays: 3652,
        eolMode: 'DATA_DRIVEN',
        manualEolYears: 15.0,
        freshRatio: 0.25,
        midLifeRatio: 0.70,
        agingRatio: 1.0,
        manualFreshYears: 3.0,
        manualMidLifeYears: 8.0,
        manualAgingYears: 15.0
      },
      phasing_sets: {
        recertMode: 'CALIB_10YR', // 10 yrs past Calibration Date
        customRecertDays: 3652,
        eolMode: 'DATA_DRIVEN',
        manualEolYears: 15.0,
        freshRatio: 0.25,
        midLifeRatio: 0.70,
        agingRatio: 1.0,
        manualFreshYears: 3.0,
        manualMidLifeYears: 8.0,
        manualAgingYears: 15.0
      },
      hot_sticks: {
        recertMode: 'TEST_2YR', // 2 yrs past Test Date
        customRecertDays: 730,
        eolMode: 'DATA_DRIVEN',
        manualEolYears: 10.0,
        freshRatio: 0.25,
        midLifeRatio: 0.70,
        agingRatio: 1.0,
        manualFreshYears: 2.0,
        manualMidLifeYears: 5.0,
        manualAgingYears: 10.0
      },
      aed: {
        recertMode: 'NA', // AED has no recertification date
        customRecertDays: 0,
        eolMode: 'DATA_DRIVEN',
        manualEolYears: 8.0,
        freshRatio: 0.25,
        midLifeRatio: 0.70,
        agingRatio: 1.0,
        manualFreshYears: 2.0,
        manualMidLifeYears: 5.0,
        manualAgingYears: 8.0
      }
    };
  }

  loadRules() {
    try {
      const saved = localStorage.getItem('sa_aging_rules_config');
      if (saved) {
        const parsed = JSON.parse(saved);
        const defaults = this.getDefaultRules();
        return { ...defaults, ...parsed };
      }
    } catch (e) {
      console.warn('Failed to load aging rules from localStorage:', e);
    }
    return this.getDefaultRules();
  }

  saveRules(newRules) {
    this.rules = newRules;
    try {
      localStorage.setItem('sa_aging_rules_config', JSON.stringify(this.rules));
    } catch (e) {
      console.error('Failed to save aging rules to localStorage:', e);
    }
    this.loadData();
  }

  resetRulesToDefault() {
    this.rules = this.getDefaultRules();
    localStorage.removeItem('sa_aging_rules_config');
    this.loadData();
    this.renderConfigModal();
  }

  init() {
    this.bindEvents();
  }

  bindEvents() {
    const searchInput = document.getElementById('aging-search-input');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        this.searchTerm = (e.target.value || '').toLowerCase().trim();
        this.render();
      });
    }

    const sortSelect = document.getElementById('aging-sort-select');
    if (sortSelect) {
      sortSelect.addEventListener('change', (e) => {
        this.sortBy = e.target.value;
        this.render();
      });
    }
  }

  loadData() {
    this.calculateAllCategoriesEOL();
    this.scanInventoryAging();
    this.render();
  }

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
    const dt = new Date(s);
    return isNaN(dt.getTime()) ? null : dt;
  }

  isFailedStatusOrNote(status, assignedTo, location, notes) {
    const s = `${status || ''} ${assignedTo || ''} ${location || ''} ${notes || ''}`.toLowerCase();
    return (
      s.includes('failed') ||
      s.includes('fail') ||
      s.includes('destroyed') ||
      s.includes('not repairable') ||
      s.includes('damaged') ||
      s.includes('retired')
    );
  }

  /**
   * Calculates empirical data-driven EOL per category based on historical failed items.
   * Scans 1st entry date and failure date for all failed items of that category.
   */
  calculateAllCategoriesEOL() {
    const categories = [
      { key: 'gloves', histKey: 'gloves_history' },
      { key: 'sleeves', histKey: 'sleeves_history' },
      { key: 'blankets', histKey: 'blankets_history' },
      { key: 'macks', histKey: 'macks_history' },
      { key: 'hv_testers', histKey: 'hv_testers_history' },
      { key: 'phasing_sets', histKey: 'phasing_sets_history' },
      { key: 'grounds', histKey: 'grounds_history' },
      { key: 'hot_sticks', histKey: 'hot_sticks_history' },
      { key: 'aed', histKey: 'aed_history' }
    ];

    const today = new Date();

    categories.forEach(cat => {
      const histTable = this.db.getTable(cat.histKey);
      const rawHist = histTable ? (histTable.rawGrid || histTable.rows || []) : [];

      const currentTable = this.db.getTable(cat.key);
      const rawCurrent = currentTable ? (currentTable.rawGrid || currentTable.rows || []) : [];

      // Group history records by item
      const itemLogs = {};

      rawHist.forEach(hr => {
        let iNum = '';
        let dateVal = null;
        let note = '';
        let assigned = '';
        let loc = '';

        if (Array.isArray(hr)) {
          iNum = String(hr[0] || '').trim();
          dateVal = this.parseDate(hr[1]);
          note = String(hr[hr.length - 1] || '');
          assigned = String(hr[hr.length - 2] || '');
          loc = String(hr[hr.length - 3] || '');
        } else if (typeof hr === 'object' && hr !== null) {
          const keys = Object.keys(hr);
          iNum = String(hr['Item #'] || hr['Serial #'] || hr['ESL ID'] || hr[keys[0]] || '').trim();
          dateVal = this.parseDate(hr['Date'] || hr['Date Assigned'] || hr['Test Date']);
          note = String(hr['Notes'] || hr['Note'] || '');
          assigned = String(hr['Assigned To'] || hr['Assigned'] || '');
          loc = String(hr['Location'] || '');
        }

        if (!iNum || iNum.toLowerCase().includes('item') || iNum.toLowerCase().includes('serial')) return;

        if (!itemLogs[iNum]) {
          itemLogs[iNum] = [];
        }

        if (dateVal) {
          itemLogs[iNum].push({
            date: dateVal,
            note: note,
            assigned: assigned,
            location: loc,
            isFailed: this.isFailedStatusOrNote('', assigned, loc, note)
          });
        }
      });

      // Also check current table rows for currently failed items
      rawCurrent.forEach(row => {
        let iNum = '';
        let testDate = null;
        let assignDate = null;
        let status = '';
        let assigned = '';
        let loc = '';
        let notes = '';

        if (Array.isArray(row)) {
          iNum = String(row[0] || '').trim();
          testDate = this.parseDate(row[4] || row[3]);
          assignDate = this.parseDate(row[5] || row[4]);
          loc = String(row[6] || '');
          status = String(row[7] || '');
          assigned = String(row[8] || '');
          notes = String(row[row.length - 1] || '');
        } else if (typeof row === 'object' && row !== null) {
          const keys = Object.keys(row);
          iNum = String(row['Item #'] || row['Serial #'] || row['ESL ID'] || row[keys[0]] || '').trim();
          testDate = this.parseDate(row['Test Date'] || row['Calibration Date']);
          assignDate = this.parseDate(row['Date Assigned']);
          loc = String(row['Location'] || '');
          status = String(row['Status'] || '');
          assigned = String(row['Assigned To'] || '');
          notes = String(row['Notes'] || '');
        }

        if (!iNum || iNum.toLowerCase().includes('item')) return;

        if (this.isFailedStatusOrNote(status, assigned, loc, notes)) {
          if (!itemLogs[iNum]) itemLogs[iNum] = [];
          const entryDate = testDate || assignDate || today;
          itemLogs[iNum].push({
            date: today,
            note: notes || status,
            assigned: assigned,
            location: loc,
            isFailed: true,
            initialDate: entryDate
          });
        }
      });

      // Compute failure durations for each failed item
      const failureDurations = [];

      Object.keys(itemLogs).forEach(iNum => {
        const logs = itemLogs[iNum].sort((a, b) => a.date - b.date);
        if (!logs.length) return;

        const firstDate = logs[0].initialDate || logs[0].date;
        const failedLog = logs.find(l => l.isFailed);

        if (failedLog && firstDate) {
          const diffDays = Math.floor((failedLog.date - firstDate) / (1000 * 60 * 60 * 24));
          if (diffDays > 30) { // filter out immediate data entry errors
            failureDurations.push(diffDays);
          }
        }
      });

      if (failureDurations.length > 0) {
        const avgDays = Math.round(failureDurations.reduce((sum, d) => sum + d, 0) / failureDurations.length);
        const avgYears = (avgDays / 365.25).toFixed(1);
        this.categoryEOLStats[cat.key] = {
          avgDays: avgDays,
          avgYears: avgYears,
          count: failureDurations.length,
          hasData: true
        };
      } else {
        this.categoryEOLStats[cat.key] = {
          avgDays: null,
          avgYears: null,
          count: 0,
          hasData: false
        };
      }
    });
  }

  scanInventoryAging() {
    const categories = [
      { key: 'gloves', histKey: 'gloves_history', type: 'Gloves', label: '🧤 Gloves', icon: '🧤' },
      { key: 'sleeves', histKey: 'sleeves_history', type: 'Sleeves', label: '🦺 Sleeves', icon: '🦺' },
      { key: 'blankets', histKey: 'blankets_history', type: 'Blankets', label: '🧱 Blankets', icon: '🧱' },
      { key: 'macks', histKey: 'macks_history', type: 'MACKs', label: '🧱 MACKs', icon: '🧱' },
      { key: 'hv_testers', histKey: 'hv_testers_history', type: 'HV Testers', label: '⚡ HV Testers', icon: '⚡' },
      { key: 'phasing_sets', histKey: 'phasing_sets_history', type: 'Phasing Sets', label: '⚡ Phasing Sets', icon: '⚡' },
      { key: 'grounds', histKey: 'grounds_history', type: 'Grounds', label: '⚡ Grounds', icon: '⚡' },
      { key: 'hot_sticks', histKey: 'hot_sticks_history', type: 'Hot Sticks', label: '🔴 Hot Sticks', icon: '🔴' },
      { key: 'aed', histKey: 'aed_history', type: 'AED', label: '🏥 AED Units', icon: '🏥' }
    ];

    const today = new Date();
    today.setHours(12, 0, 0, 0);

    const allItems = [];

    categories.forEach(cat => {
      const table = this.db.getTable(cat.key);
      if (!table) return;

      const rawRows = table.rawGrid || table.rows || [];
      if (!rawRows.length) return;

      const histTable = this.db.getTable(cat.histKey);
      const historyRows = histTable ? (histTable.rawGrid || histTable.rows || []) : [];

      const historyMap = {};
      historyRows.forEach(hr => {
        let iNum = '';
        let dateVal = null;
        if (Array.isArray(hr)) {
          iNum = String(hr[0] || '').trim();
          dateVal = this.parseDate(hr[1]);
        } else if (typeof hr === 'object' && hr !== null) {
          const keys = Object.keys(hr);
          iNum = String(hr['Item #'] || hr['Serial #'] || hr['ESL ID'] || hr[keys[0]] || '').trim();
          dateVal = this.parseDate(hr['Date']);
        }

        if (iNum && !iNum.toLowerCase().includes('item') && !iNum.toLowerCase().includes('serial')) {
          if (!historyMap[iNum]) {
            historyMap[iNum] = { earliestDate: null, count: 0 };
          }
          historyMap[iNum].count++;
          if (dateVal && (!historyMap[iNum].earliestDate || dateVal < historyMap[iNum].earliestDate)) {
            historyMap[iNum].earliestDate = dateVal;
          }
        }
      });

      const rule = this.rules[cat.key] || this.getDefaultRules()[cat.key] || {};
      const catEOL = this.categoryEOLStats[cat.key] || { hasData: false };

      rawRows.forEach((row) => {
        let itemNum = '';
        let size = '—';
        let classVal = '—';
        let testDate = null;
        let dateAssigned = null;
        let changeOutDate = null;
        let location = '—';
        let status = 'On Shelf';
        let assignedTo = '—';
        let notes = '';

        if (Array.isArray(row)) {
          const first = String(row[0] || '').trim();
          if (first.toLowerCase().includes('item') || first.toLowerCase().includes('serial') || !first) return;
          itemNum = first;

          if (cat.key === 'gloves' || cat.key === 'sleeves') {
            // Gloves/Sleeves layout (A-L): Item#, ESL ID, Size, Class, Test Date, Date Assigned, Location, Status, Assigned To, Change Out Date, Picked For, Notes
            size = String(row[2] || '—').trim();
            classVal = String(row[3] || '—').trim();
            testDate = this.parseDate(row[4]);
            dateAssigned = this.parseDate(row[5]);
            location = String(row[6] || '—').trim();
            status = String(row[7] || 'On Shelf').trim();
            assignedTo = String(row[8] || '—').trim();
            changeOutDate = this.parseDate(row[9]);
            notes = String(row[11] || '').trim();
          } else if (cat.key === 'blankets') {
            // Blankets layout (A-K): Item#, Type, Class, Test Date, Date Assigned, Location, Status, Assigned To, Change Out Date, Picked For, Notes
            classVal = String(row[2] || '—').trim();
            size = String(row[1] || '—').trim();
            testDate = this.parseDate(row[3]);
            dateAssigned = this.parseDate(row[4]);
            location = String(row[5] || '—').trim();
            status = String(row[6] || 'On Shelf').trim();
            assignedTo = String(row[7] || '—').trim();
            changeOutDate = this.parseDate(row[8]);
            notes = String(row[10] || '').trim();
          } else if (cat.key === 'macks') {
            // MACKs layout (A-L): Item#, KV, Size, Length, Test Date, Date Assigned, Location, Status, Assigned To, Change Out Date, Picked For, Notes
            classVal = String(row[1] || '—').trim();
            size = String(row[2] || '—').trim();
            testDate = this.parseDate(row[4]);
            dateAssigned = this.parseDate(row[5]);
            location = String(row[6] || '—').trim();
            status = String(row[7] || 'On Shelf').trim();
            assignedTo = String(row[8] || '—').trim();
            changeOutDate = this.parseDate(row[9]);
            notes = String(row[11] || '').trim();
          } else if (cat.key === 'hv_testers' || cat.key === 'phasing_sets') {
            // HV Testers & Phasing Sets layout (A-L): Item#, Model, KV, Serial#, Calibration Date, Date Assigned, Location, Status, Assigned To, Change Out Date, Picked For, Notes
            classVal = String(row[2] || row[1] || '—').trim();
            testDate = this.parseDate(row[4]);
            dateAssigned = this.parseDate(row[5]);
            location = String(row[6] || '—').trim();
            status = String(row[7] || 'On Shelf').trim();
            assignedTo = String(row[8] || '—').trim();
            changeOutDate = this.parseDate(row[9]);
            notes = String(row[11] || '').trim();
          } else if (cat.key === 'grounds') {
            // Grounds layout (A-M): Serial#, Type(OH/UG), Size, KV, Length, Test Date, Date Assigned, Location, Status, Assigned To, Change Out Date, Picked For, Notes
            size = String(row[2] || '—').trim();
            classVal = String(row[3] || row[1] || '—').trim();
            testDate = this.parseDate(row[5]);
            dateAssigned = this.parseDate(row[6]);
            location = String(row[7] || '—').trim();
            status = String(row[8] || 'On Shelf').trim();
            assignedTo = String(row[9] || '—').trim();
            changeOutDate = this.parseDate(row[10]);
            notes = String(row[12] || '').trim();
          } else if (cat.key === 'hot_sticks') {
            // Hot Sticks layout (A-K): Item#, Type, Length, Test Date, Date Assigned, Location, Status, Assigned To, Change Out Date, Picked For, Notes
            classVal = String(row[1] || '—').trim();
            size = String(row[2] || '—').trim();
            testDate = this.parseDate(row[3]);
            dateAssigned = this.parseDate(row[4]);
            location = String(row[5] || '—').trim();
            status = String(row[6] || 'On Shelf').trim();
            assignedTo = String(row[7] || '—').trim();
            changeOutDate = this.parseDate(row[8]);
            notes = String(row[10] || '').trim();
          } else if (cat.key === 'aed') {
            // AED layout (A-K): Item#, Model, Unused, Inspection Date, Date Assigned, Location, Status, Assigned To, Unused, Picked For, Notes
            classVal = String(row[1] || '—').trim();
            testDate = this.parseDate(row[3]);
            dateAssigned = this.parseDate(row[4]);
            location = String(row[5] || '—').trim();
            status = String(row[6] || 'On Shelf').trim();
            assignedTo = String(row[7] || '—').trim();
            changeOutDate = this.parseDate(row[8]);
            notes = String(row[10] || '').trim();
          }
        } else if (typeof row === 'object' && row !== null) {
          const keys = Object.keys(row);
          itemNum = String(row['Item #'] || row['Serial #'] || row['ESL ID'] || row[keys[0]] || '').trim();
          if (!itemNum || itemNum.toLowerCase().includes('item')) return;

          size = String(row['Size'] || row['Type'] || '—').trim();
          classVal = String(row['Class'] || row['KV'] || row['Model'] || row['Type'] || '—').trim();
          testDate = this.parseDate(row['Test Date'] || row['Calibration Date'] || row['Inspection Date'] || row['Pad Expiration']);
          dateAssigned = this.parseDate(row['Date Assigned']);
          location = String(row['Location'] || '—').trim();
          status = String(row['Status'] || 'On Shelf').trim();
          assignedTo = String(row['Assigned To'] || '—').trim();
          changeOutDate = this.parseDate(row['Change Out Date']);
          notes = String(row['Notes'] || '').trim();
        }

        if (!itemNum) return;

        // 1. Calculate Age (from earliest seen date)
        let earliestDate = testDate || dateAssigned || changeOutDate;
        const histInfo = historyMap[itemNum];
        if (histInfo && histInfo.earliestDate && (!earliestDate || histInfo.earliestDate < earliestDate)) {
          earliestDate = histInfo.earliestDate;
        }

        let ageDays = 180;
        if (earliestDate && !isNaN(earliestDate.getTime())) {
          ageDays = Math.max(0, Math.floor((today - earliestDate) / (1000 * 60 * 60 * 24)));
        }
        const ageYears = (ageDays / 365.25).toFixed(1);

        // 2. Calculate Recertification Date based on user-defined specification & overrides
        let calculatedRecertDate = null;
        let recertIsNA = false;

        const isShelf = status.toLowerCase() === 'on shelf' || assignedTo.toLowerCase() === 'on shelf' || assignedTo === '—' || !assignedTo;

        if (rule.recertMode === 'NA' || cat.key === 'aed') {
          recertIsNA = true;
        } else if (rule.recertMode === 'GLOVES_DEFAULT' || (cat.key === 'gloves' && !rule.recertMode)) {
          // Gloves: 1 yr on shelf, 3 months assigned to employee
          if (isShelf) {
            const baseDate = testDate || today;
            calculatedRecertDate = new Date(baseDate.getTime() + 365.25 * 24 * 60 * 60 * 1000);
          } else {
            const baseDate = dateAssigned || testDate || today;
            calculatedRecertDate = new Date(baseDate.getTime() + 91.3 * 24 * 60 * 60 * 1000); // 3 months
          }
        } else if (rule.recertMode === 'SLEEVES_DEFAULT' || (cat.key === 'sleeves' && !rule.recertMode)) {
          // Sleeves: 1 year past Date Assigned all of the time, no matter assigned to value
          const baseDate = dateAssigned || testDate || today;
          calculatedRecertDate = new Date(baseDate.getTime() + 365.25 * 24 * 60 * 60 * 1000);
        } else if (rule.recertMode === 'CALIB_10YR' || ((cat.key === 'hv_testers' || cat.key === 'phasing_sets') && !rule.recertMode)) {
          // HV Testers & Phasing Sets: 10 years past last Calibration Date
          const baseDate = testDate || today;
          calculatedRecertDate = new Date(baseDate.getTime() + 3652.5 * 24 * 60 * 60 * 1000);
        } else if (rule.recertMode === 'TEST_2YR' || (cat.key === 'hot_sticks' && !rule.recertMode)) {
          // Hot Sticks: 2 years past Test Date
          const baseDate = testDate || today;
          calculatedRecertDate = new Date(baseDate.getTime() + 730.5 * 24 * 60 * 60 * 1000);
        } else if (rule.recertMode === 'TEST_1YR' || ((cat.key === 'blankets' || cat.key === 'macks' || cat.key === 'grounds') && !rule.recertMode)) {
          // Blankets, MACKs, Grounds: 1 year past Test Date
          const baseDate = testDate || today;
          calculatedRecertDate = new Date(baseDate.getTime() + 365.25 * 24 * 60 * 60 * 1000);
        } else if (rule.recertMode === 'CUSTOM') {
          const daysToAdd = parseInt(rule.customRecertDays, 10) || 365;
          const baseDate = testDate || dateAssigned || today;
          calculatedRecertDate = new Date(baseDate.getTime() + daysToAdd * 24 * 60 * 60 * 1000);
        }

        // If sheet had explicit Change Out Date and no specific override requested, use calculatedRecertDate
        const finalRecertDate = calculatedRecertDate || changeOutDate;

        let daysUntil = 999;
        let recertStatus = 'CURRENT';
        let recertLabel = '🟢 Current';
        let recertBadgeClass = 'badge-success';

        if (recertIsNA) {
          recertStatus = 'NA';
          recertLabel = 'N/A';
          recertBadgeClass = 'badge-secondary';
        } else if (finalRecertDate && !isNaN(finalRecertDate.getTime())) {
          daysUntil = Math.floor((finalRecertDate - today) / (1000 * 60 * 60 * 24));
          if (daysUntil < 0) {
            recertStatus = 'OVERDUE';
            recertLabel = `🔴 Overdue (${Math.abs(daysUntil)}d)`;
            recertBadgeClass = 'badge-danger';
          } else if (daysUntil <= 30) {
            recertStatus = 'DUE_SOON';
            recertLabel = `🟠 Due in ${daysUntil}d`;
            recertBadgeClass = 'badge-warning';
          } else if (daysUntil <= 60) {
            recertStatus = 'DUE_60D';
            recertLabel = `🟡 Due in ${daysUntil}d`;
            recertBadgeClass = 'badge-secondary';
          }
        }

        // 3. Calculate Lifecycle Tier (Data-Driven from Failed Items vs Manual)
        let effectiveEOLDays = null;
        let isMoreDataNeeded = false;

        if (rule.eolMode === 'MANUAL') {
          effectiveEOLDays = (parseFloat(rule.manualEolYears) || 5.0) * 365.25;
        } else {
          if (catEOL.hasData && catEOL.avgDays) {
            effectiveEOLDays = catEOL.avgDays;
          } else {
            isMoreDataNeeded = true;
          }
        }

        let tier = 'FRESH';
        let tierLabel = '🟢 Fresh';
        let tierColor = '#4ade80';

        if (isMoreDataNeeded) {
          tier = 'MORE_DATA';
          tierLabel = 'ℹ️ More Data Needed';
          tierColor = '#94a3b8';
        } else {
          const freshThreshDays = effectiveEOLDays * (rule.freshRatio || 0.25);
          const midLifeThreshDays = effectiveEOLDays * (rule.midLifeRatio || 0.70);
          const agingThreshDays = effectiveEOLDays * (rule.agingRatio || 1.0);

          if (ageDays >= agingThreshDays) {
            tier = 'CRITICAL';
            tierLabel = `🔴 EOL Candidate (>${(agingThreshDays / 365.25).toFixed(1)}y)`;
            tierColor = '#f87171';
          } else if (ageDays >= midLifeThreshDays) {
            tier = 'AGING';
            tierLabel = `🟠 Aging (${(midLifeThreshDays / 365.25).toFixed(1)}-${(agingThreshDays / 365.25).toFixed(1)}y)`;
            tierColor = '#fb923c';
          } else if (ageDays >= freshThreshDays) {
            tier = 'MID_LIFE';
            tierLabel = `🟡 Mid-Life (${(freshThreshDays / 365.25).toFixed(1)}-${(midLifeThreshDays / 365.25).toFixed(1)}y)`;
            tierColor = '#facc15';
          } else {
            tier = 'FRESH';
            tierLabel = `🟢 Fresh (<${(freshThreshDays / 365.25).toFixed(1)}y)`;
            tierColor = '#4ade80';
          }
        }

        allItems.push({
          itemNum,
          categoryKey: cat.key,
          categoryType: cat.type,
          categoryLabel: cat.label,
          categoryIcon: cat.icon,
          size,
          classVal,
          location,
          status,
          assignedTo,
          testDateStr: testDate ? testDate.toLocaleDateString() : '—',
          dateAssignedStr: dateAssigned ? dateAssigned.toLocaleDateString() : '—',
          recertDateStr: recertIsNA ? 'N/A' : (finalRecertDate ? finalRecertDate.toLocaleDateString() : '—'),
          daysUntil: recertIsNA ? 9999 : daysUntil,
          ageDays,
          ageYears,
          cycleCount: histInfo ? histInfo.count : 1,
          tier,
          tierLabel,
          tierColor,
          recertStatus,
          recertLabel,
          recertBadgeClass,
          notes
        });
      });
    });

    this.items = allItems;
  }

  setCategory(cat) {
    this.selectedCategory = cat;
    document.querySelectorAll('.aging-cat-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.cat === cat);
    });
    this.render();
  }

  setTier(tier) {
    this.selectedTier = tier;
    document.querySelectorAll('.aging-tier-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.tier === tier);
    });
    this.render();
  }

  setRecert(recert) {
    this.selectedRecert = recert;
    document.querySelectorAll('.aging-recert-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.recert === recert);
    });
    this.render();
  }

  getFilteredItems() {
    return this.items.filter(it => {
      if (this.selectedCategory !== 'all' && it.categoryKey !== this.selectedCategory) return false;
      if (this.selectedTier !== 'all' && it.tier !== this.selectedTier) return false;
      if (this.selectedRecert !== 'all' && it.recertStatus !== this.selectedRecert) return false;

      if (this.searchTerm) {
        const str = `${it.itemNum} ${it.categoryType} ${it.size} ${it.classVal} ${it.location} ${it.status} ${it.assignedTo} ${it.notes}`.toLowerCase();
        if (!str.includes(this.searchTerm)) return false;
      }

      return true;
    }).sort((a, b) => {
      if (this.sortBy === 'age_desc') return b.ageDays - a.ageDays;
      if (this.sortBy === 'age_asc') return a.ageDays - b.ageDays;
      if (this.sortBy === 'due_asc') return a.daysUntil - b.daysUntil;
      if (this.sortBy === 'cycles_desc') return b.cycleCount - a.cycleCount;
      if (this.sortBy === 'item_asc') return String(a.itemNum).localeCompare(String(b.itemNum), undefined, { numeric: true });
      return 0;
    });
  }

  render() {
    this.renderStats();
    this.renderTable();
  }

  renderStats() {
    const totalFleet = this.items.length;
    if (totalFleet === 0) return;

    const criticalCount = this.items.filter(i => i.tier === 'CRITICAL').length;
    const overdueCount = this.items.filter(i => i.recertStatus === 'OVERDUE').length;
    const dueSoonCount = this.items.filter(i => i.recertStatus === 'DUE_SOON').length;

    const totalAgeDays = this.items.reduce((sum, i) => sum + i.ageDays, 0);
    const avgAgeYears = (totalAgeDays / totalFleet / 365.25).toFixed(1);

    const setEl = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.textContent = val;
    };

    setEl('aging-stat-total', `${totalFleet} items`);
    setEl('aging-stat-avg-age', `${avgAgeYears} yrs`);
    setEl('aging-stat-critical', `${criticalCount} items`);
    setEl('aging-stat-overdue', `${overdueCount} items`);
    setEl('aging-stat-due-soon', `${dueSoonCount} items`);
  }

  renderTable() {
    const container = document.getElementById('aging-table-container');
    if (!container) return;

    const filtered = this.getFilteredItems();

    const countBadge = document.getElementById('aging-results-count');
    if (countBadge) countBadge.textContent = `${filtered.length} of ${this.items.length} items`;

    if (filtered.length === 0) {
      container.innerHTML = `
        <div style="padding: 40px; text-align: center; color: var(--text-muted);">
          <div style="font-size: 32px; margin-bottom: 8px;">🔍</div>
          <h3 style="color: var(--text-primary); font-size: 15px;">No matching equipment found</h3>
          <p style="margin-top: 6px; font-size: 13px;">Try adjusting your category or aging filters.</p>
        </div>
      `;
      return;
    }

    let html = `
      <table class="table" style="width: 100%; border-collapse: collapse; font-size: 12.5px;">
        <thead>
          <tr style="background: rgba(255,255,255,0.05); border-bottom: 2px solid var(--border-color);">
            <th style="padding: 10px; text-align: left; width: 110px;">Item #</th>
            <th style="padding: 10px; text-align: left; width: 140px;">Category</th>
            <th style="padding: 10px; text-align: center; width: 80px;">Size</th>
            <th style="padding: 10px; text-align: center; width: 90px;">Class / KV</th>
            <th style="padding: 10px; text-align: left; width: 130px;">Location</th>
            <th style="padding: 10px; text-align: left;">Assigned To</th>
            <th style="padding: 10px; text-align: center; width: 110px;">Recert Date</th>
            <th style="padding: 10px; text-align: center; width: 130px;">Recert Urgency</th>
            <th style="padding: 10px; text-align: center; width: 110px;">Est. Fleet Age</th>
            <th style="padding: 10px; text-align: center; width: 170px;">Lifecycle Tier</th>
          </tr>
        </thead>
        <tbody>
    `;

    filtered.forEach(item => {
      html += `
        <tr style="border-bottom: 1px solid var(--border-color); cursor: pointer; transition: background 0.15s;" class="aging-table-row" onclick="window.itemStatsEngine ? window.itemStatsEngine.openDossierModal('${item.itemNum}', '${item.categoryKey}') : null">
          <td style="padding: 8px 10px; font-weight: 700; color: #60a5fa; font-family: monospace; font-size: 13px;">
            ${item.itemNum}
          </td>
          <td style="padding: 8px 10px;">
            <span style="font-weight: 600; color: var(--text-primary);">${item.categoryLabel}</span>
          </td>
          <td style="padding: 8px 10px; text-align: center; font-weight: 600;">${item.size}</td>
          <td style="padding: 8px 10px; text-align: center;">${item.classVal}</td>
          <td style="padding: 8px 10px;">
            <span style="color: var(--text-secondary);">${item.location}</span>
          </td>
          <td style="padding: 8px 10px;">
            <span style="font-weight: ${item.assignedTo !== '—' ? '600' : '400'}; color: ${item.assignedTo !== '—' ? '#f472b6' : 'var(--text-muted)'};">${item.assignedTo}</span>
            <div style="font-size: 11px; color: var(--text-muted);">${item.status}</div>
          </td>
          <td style="padding: 8px 10px; text-align: center; font-family: monospace; font-size: 12px;">
            ${item.recertDateStr}
          </td>
          <td style="padding: 8px 10px; text-align: center;">
            <span class="badge ${item.recertBadgeClass}" style="font-size: 11px; font-weight: 700;">${item.recertLabel}</span>
          </td>
          <td style="padding: 8px 10px; text-align: center;">
            <div style="font-weight: 700; font-family: monospace; color: ${item.tierColor}; font-size: 13px;">${item.ageYears} yrs</div>
            <div style="font-size: 10.5px; color: var(--text-muted);">${item.ageDays} days</div>
          </td>
          <td style="padding: 8px 10px; text-align: center;">
            <span style="display: inline-block; padding: 3px 8px; border-radius: 4px; font-size: 11px; font-weight: 700; background: rgba(255,255,255,0.06); color: ${item.tierColor}; border: 1px solid ${item.tierColor}40;">
              ${item.tierLabel}
            </span>
          </td>
        </tr>
      `;
    });

    html += '</tbody></table>';
    container.innerHTML = html;
  }

  /* ========================================================
   * Rules Configuration Modal
   * ======================================================== */
  openConfigModal() {
    this.renderConfigModal();
    const modal = document.getElementById('aging-config-modal');
    if (modal) modal.style.display = 'flex';
  }

  closeConfigModal() {
    const modal = document.getElementById('aging-config-modal');
    if (modal) modal.style.display = 'none';
  }

  selectConfigCategory(catKey) {
    this.activeConfigCategory = catKey;
    this.renderConfigModal();
  }

  renderConfigModal() {
    const body = document.getElementById('aging-config-modal-body');
    if (!body) return;

    const categories = [
      { key: 'gloves', label: '🧤 Gloves' },
      { key: 'sleeves', label: '🦺 Sleeves' },
      { key: 'blankets', label: '🧱 Blankets' },
      { key: 'macks', label: '🧱 MACKs' },
      { key: 'grounds', label: '⚡ Grounds' },
      { key: 'hv_testers', label: '⚡ HV Testers' },
      { key: 'phasing_sets', label: '⚡ Phasing Sets' },
      { key: 'hot_sticks', label: '🔴 Hot Sticks' },
      { key: 'aed', label: '🏥 AED Units' }
    ];

    const currentCat = this.activeConfigCategory || 'gloves';
    const rule = this.rules[currentCat] || this.getDefaultRules()[currentCat];
    const eolStat = this.categoryEOLStats[currentCat] || { hasData: false };

    let html = `
      <div style="display: grid; grid-template-columns: 240px 1fr; gap: 20px; min-height: 480px;">
        <!-- Left: Category Selector List -->
        <div style="background: rgba(15, 23, 42, 0.6); border: 1px solid var(--border-color); border-radius: 8px; padding: 12px; display: flex; flex-direction: column; gap: 6px;">
          <div style="font-weight: 700; font-size: 13px; color: #93c5fd; margin-bottom: 6px;">Equipment Categories</div>
    `;

    categories.forEach(c => {
      const isActive = c.key === currentCat;
      html += `
        <button class="btn ${isActive ? 'btn-primary' : 'btn-secondary'}" style="text-align: left; padding: 8px 12px; font-size: 12px; font-weight: 600; display: flex; justify-content: space-between; align-items: center;" onclick="window.inventoryAging.selectConfigCategory('${c.key}')">
          <span>${c.label}</span>
          ${this.categoryEOLStats[c.key]?.hasData ? '<span style="font-size: 10px; background: rgba(16,185,129,0.2); color: #4ade80; padding: 1px 4px; border-radius: 3px;">Data</span>' : '<span style="font-size: 10px; color: var(--text-muted);">No fail data</span>'}
        </button>
      `;
    });

    html += `
        </div>

        <!-- Right: Rule Configuration Form for Active Category -->
        <div style="display: flex; flex-direction: column; gap: 16px; overflow-y: auto; max-height: 520px; padding-right: 6px;">
          
          <!-- Recertification Rule Section -->
          <div style="background: rgba(15, 23, 42, 0.6); border: 1px solid var(--border-color); border-radius: 8px; padding: 16px;">
            <div style="font-weight: 700; font-size: 14px; color: #60a5fa; margin-bottom: 6px; display: flex; align-items: center; gap: 6px;">
              <span>⚡</span> Recertification Calculation Rule
            </div>
            <p style="font-size: 12px; color: var(--text-secondary); margin-bottom: 12px;">
              Defines when this equipment is flagged as overdue or due for physical / dielectric recertification.
            </p>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
              <div>
                <label style="font-size: 11.5px; color: var(--text-muted); font-weight: 600; display: block; margin-bottom: 4px;">Recertification Interval:</label>
                <select id="config-recert-mode" style="width: 100%; padding: 8px; background: var(--bg-tertiary); border: 1px solid var(--border-color); border-radius: 6px; color: white; font-size: 12px;" onchange="window.inventoryAging.onRecertModeChange(this.value)">
                  <option value="GLOVES_DEFAULT" ${rule.recertMode === 'GLOVES_DEFAULT' ? 'selected' : ''}>🧤 Gloves Default (1 Yr On Shelf / 3 Mos Assigned)</option>
                  <option value="SLEEVES_DEFAULT" ${rule.recertMode === 'SLEEVES_DEFAULT' ? 'selected' : ''}>🦺 Sleeves Default (1 Yr Past Date Assigned)</option>
                  <option value="TEST_1YR" ${rule.recertMode === 'TEST_1YR' ? 'selected' : ''}>📅 1 Year Past Test Date (Blankets/MACKs/Grounds)</option>
                  <option value="CALIB_10YR" ${rule.recertMode === 'CALIB_10YR' ? 'selected' : ''}>⚡ 10 Years Past Calibration (HV/Phasing)</option>
                  <option value="TEST_2YR" ${rule.recertMode === 'TEST_2YR' ? 'selected' : ''}>🔴 2 Years Past Test Date (Hot Sticks)</option>
                  <option value="CUSTOM" ${rule.recertMode === 'CUSTOM' ? 'selected' : ''}>✏️ Custom Interval (Enter Days)</option>
                  <option value="NA" ${rule.recertMode === 'NA' ? 'selected' : ''}>🚫 N/A (No Recertification - e.g. AEDs)</option>
                </select>
              </div>
              <div id="config-custom-recert-container" style="${rule.recertMode === 'CUSTOM' ? 'display: block;' : 'display: none;'}">
                <label style="font-size: 11.5px; color: var(--text-muted); font-weight: 600; display: block; margin-bottom: 4px;">Custom Interval (Days):</label>
                <input type="number" id="config-custom-recert-days" value="${rule.customRecertDays || 365}" style="width: 100%; padding: 8px; background: var(--bg-tertiary); border: 1px solid var(--border-color); border-radius: 6px; color: white; font-size: 12px;">
              </div>
            </div>
          </div>

          <!-- End-of-Life (EOL) Calculation Section -->
          <div style="background: rgba(15, 23, 42, 0.6); border: 1px solid var(--border-color); border-radius: 8px; padding: 16px;">
            <div style="font-weight: 700; font-size: 14px; color: #f87171; margin-bottom: 6px; display: flex; align-items: center; gap: 6px;">
              <span>⏳</span> End-of-Life (EOL) & Retirement Lifespan
            </div>
            <p style="font-size: 12px; color: var(--text-secondary); margin-bottom: 12px;">
              Determines the fleet useful lifespan before equipment is flagged for replacement.
            </p>

            <div style="background: rgba(0,0,0,0.25); border: 1px solid rgba(255,255,255,0.08); border-radius: 6px; padding: 10px 14px; margin-bottom: 12px; font-size: 12px;">
              <div style="font-weight: 600; color: #93c5fd; margin-bottom: 4px;">📊 Historical Failure Data Analysis:</div>
              ${eolStat.hasData ? `
                <div style="color: #4ade80; font-weight: 700;">✅ Calculated Average EOL: ${eolStat.avgYears} Years (${eolStat.avgDays} days)</div>
                <div style="color: var(--text-muted); font-size: 11px; margin-top: 2px;">Based on ${eolStat.count} failed / destroyed equipment history records.</div>
              ` : `
                <div style="color: #facc15; font-weight: 600;">ℹ️ Status: More Data Needed</div>
                <div style="color: var(--text-muted); font-size: 11px; margin-top: 2px;">No historical failed items recorded yet for this category. You can set a manual lifespan below or wait for historical fail records.</div>
              `}
            </div>

            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 12px;">
              <div>
                <label style="font-size: 11.5px; color: var(--text-muted); font-weight: 600; display: block; margin-bottom: 4px;">EOL Method:</label>
                <select id="config-eol-mode" style="width: 100%; padding: 8px; background: var(--bg-tertiary); border: 1px solid var(--border-color); border-radius: 6px; color: white; font-size: 12px;" onchange="window.inventoryAging.onEolModeChange(this.value)">
                  <option value="DATA_DRIVEN" ${rule.eolMode === 'DATA_DRIVEN' ? 'selected' : ''}>📈 Data-Driven (Average from Failed Items)</option>
                  <option value="MANUAL" ${rule.eolMode === 'MANUAL' ? 'selected' : ''}>✏️ Manual Lifespan Override</option>
                </select>
              </div>
              <div id="config-manual-eol-container" style="${rule.eolMode === 'MANUAL' ? 'display: block;' : 'display: none;'}">
                <label style="font-size: 11.5px; color: var(--text-muted); font-weight: 600; display: block; margin-bottom: 4px;">Manual EOL Lifespan (Years):</label>
                <input type="number" step="0.5" id="config-manual-eol-years" value="${rule.manualEolYears || 5.0}" style="width: 100%; padding: 8px; background: var(--bg-tertiary); border: 1px solid var(--border-color); border-radius: 6px; color: white; font-size: 12px;">
              </div>
            </div>
          </div>

          <!-- Lifecycle Tier Thresholds -->
          <div style="background: rgba(15, 23, 42, 0.6); border: 1px solid var(--border-color); border-radius: 8px; padding: 16px;">
            <div style="font-weight: 700; font-size: 14px; color: #a78bfa; margin-bottom: 6px; display: flex; align-items: center; gap: 6px;">
              <span>🏷️</span> Fresh, Mid-Life & Aging Thresholds (% of EOL)
            </div>
            <p style="font-size: 12px; color: var(--text-secondary); margin-bottom: 12px;">
              Calculates lifecycle progression tiers proportionally from the category EOL lifespan.
            </p>
            <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px;">
              <div>
                <label style="font-size: 11px; color: #4ade80; font-weight: 700; display: block; margin-bottom: 4px;">🟢 Fresh Tier (< % EOL):</label>
                <input type="number" step="5" min="10" max="50" id="config-fresh-ratio" value="${Math.round((rule.freshRatio || 0.25) * 100)}" style="width: 100%; padding: 8px; background: var(--bg-tertiary); border: 1px solid var(--border-color); border-radius: 6px; color: white; font-size: 12px;">
                <span style="font-size: 10.5px; color: var(--text-muted);">Default: 25% of EOL</span>
              </div>
              <div>
                <label style="font-size: 11px; color: #facc15; font-weight: 700; display: block; margin-bottom: 4px;">🟡 Mid-Life Tier (% EOL):</label>
                <input type="number" step="5" min="25" max="85" id="config-mid-ratio" value="${Math.round((rule.midLifeRatio || 0.70) * 100)}" style="width: 100%; padding: 8px; background: var(--bg-tertiary); border: 1px solid var(--border-color); border-radius: 6px; color: white; font-size: 12px;">
                <span style="font-size: 10.5px; color: var(--text-muted);">Default: 70% of EOL</span>
              </div>
              <div>
                <label style="font-size: 11px; color: #fb923c; font-weight: 700; display: block; margin-bottom: 4px;">🟠 Aging Tier (% EOL):</label>
                <input type="number" step="5" min="50" max="100" id="config-aging-ratio" value="${Math.round((rule.agingRatio || 1.0) * 100)}" style="width: 100%; padding: 8px; background: var(--bg-tertiary); border: 1px solid var(--border-color); border-radius: 6px; color: white; font-size: 12px;">
                <span style="font-size: 10.5px; color: var(--text-muted);">Default: 100% of EOL</span>
              </div>
            </div>
          </div>

        </div>
      </div>
    `;

    body.innerHTML = html;
  }

  onRecertModeChange(mode) {
    const customCont = document.getElementById('config-custom-recert-container');
    if (customCont) {
      customCont.style.display = mode === 'CUSTOM' ? 'block' : 'none';
    }
  }

  onEolModeChange(mode) {
    const manualCont = document.getElementById('config-manual-eol-container');
    if (manualCont) {
      manualCont.style.display = mode === 'MANUAL' ? 'block' : 'none';
    }
  }

  saveActiveCategoryRule() {
    const currentCat = this.activeConfigCategory || 'gloves';
    const recertMode = document.getElementById('config-recert-mode')?.value || 'GLOVES_DEFAULT';
    const customDays = parseInt(document.getElementById('config-custom-recert-days')?.value, 10) || 365;
    const eolMode = document.getElementById('config-eol-mode')?.value || 'DATA_DRIVEN';
    const manualYears = parseFloat(document.getElementById('config-manual-eol-years')?.value) || 5.0;

    const freshRatio = (parseFloat(document.getElementById('config-fresh-ratio')?.value) || 25) / 100;
    const midRatio = (parseFloat(document.getElementById('config-mid-ratio')?.value) || 70) / 100;
    const agingRatio = (parseFloat(document.getElementById('config-aging-ratio')?.value) || 100) / 100;

    const newRules = { ...this.rules };
    newRules[currentCat] = {
      recertMode,
      customRecertDays: customDays,
      eolMode,
      manualEolYears: manualYears,
      freshRatio,
      midLifeRatio: midRatio,
      agingRatio
    };

    this.saveRules(newRules);
    this.closeConfigModal();
  }
}

// Attach globally
window.InventoryAgingEngine = InventoryAgingEngine;
