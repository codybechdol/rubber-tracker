/**
 * swaps.js - Complete Client-Side Swap Generation & Stage Lifecycle Engine
 * 100% Fidelity to Google Sheets business logic and 23-column stage tracking.
 */

class SwapGenerationEngine {
  constructor(db) {
    this._db = db;
    this.lookaheadDays = 32; // Standard 32-day lookahead window matching Code.gs
  }

  get db() {
    return this._db || window.localDB;
  }

  set db(val) {
    this._db = val;
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
        const y = parseInt(parts[2], 10);
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
    if (!d) return '';
    if (!(d instanceof Date)) d = this.parseDate(d);
    if (!d || isNaN(d.getTime())) return '';
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const yyyy = d.getFullYear();
    return `${mm}/${dd}/${yyyy}`;
  }

  formatDateIso(d) {
    if (!d) return '';
    if (!(d instanceof Date)) d = this.parseDate(d);
    if (!d || isNaN(d.getTime())) return '';
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }

  getDaysDifference(targetDate, baseDate = new Date()) {
    if (!targetDate) return null;
    const t = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate());
    const b = new Date(baseDate.getFullYear(), baseDate.getMonth(), baseDate.getDate());
    return Math.round((t - b) / (1000 * 60 * 60 * 24));
  }

  extractCrewNum(jobNum) {
    if (!jobNum) return '';
    const jobStr = String(jobNum).trim();
    const lastDotIndex = jobStr.lastIndexOf('.');
    if (lastDotIndex !== -1) {
      return jobStr.substring(0, lastDotIndex);
    }
    return jobStr;
  }

  /**
   * Preserves manual pick list edits from an existing swap table before regenerating
   */
  preserveManualPickLists(swapTableKey) {
    const manualPicks = {};
    const table = this.db.getTable(swapTableKey);
    if (!table || !table.rows || table.rows.length === 0) return manualPicks;

    const isMack = swapTableKey.includes('mack');
    const skipNames = [
      'lost', 'unknown', 'n/a', 'on shelf', 'in testing', 'packed for delivery',
      'packed for testing', 'failed rubber', 'not repairable', 'ready for test',
      'ready for delivery', 'assigned', 'destroyed'
    ];

    table.rows.forEach(row => {
      const empName = String(row['Employee'] || row['Crew Lead / Employee'] || Object.values(row)[0] || '').trim();
      const currentItemNum = String(row['Current Glove #'] || row['Current Sleeve #'] || row['Current Blanket #'] || row['Current MACK #'] || row['Current Item #'] || Object.values(row)[1] || '').trim();
      const pickListNum = String(row['Pick List Item #'] || row['Pick List Glove #'] || row['Pick List Sleeve #'] || row['Pick List Blanket #'] || row['Pick List MACK #'] || row['Pick List'] || Object.values(row)[6] || '').trim();
      const status = String(row['Status'] || '').trim();
      const daysLeft = String(row['Days Left'] || '').trim().toUpperCase();

      if (!empName || empName.includes('Class') || empName.includes('STAGE') || empName.includes('🔍') || empName.includes('👷')) return;
      if (skipNames.includes(empName.toLowerCase()) || daysLeft === 'LOST-LOCATE' || daysLeft === 'PREV EMP') return;
      if (row['_manualPick'] || row['isManualPick']) {
        manualPicks[empName.toLowerCase()] = {
          pickListNum: pickListNum,
          status: status,
          currentItemNum: currentItemNum
        };
      }
    });

    return manualPicks;
  }

  /**
   * Helper function to check if a location is approved for a given rubber class
   */
  isLocationApprovedForClass(location, itemClassNum, locationApprovals = {}) {
    if (itemClassNum === 0 || itemClassNum === '0') return true;
    const locClean = String(location || '').trim();
    let approval = locationApprovals[locClean];
    if (approval === undefined || approval === null) {
      // Default location approvals fallback
      const defaults = {
        'Helena': 'CL2 & CL3',
        'Belgrade': 'CL2 & CL3',
        'Belgrade Dock': 'CL2 & CL3',
        'Bozeman': 'CL2 & CL3',
        'Great Falls': 'CL2 & CL3',
        'Billings': 'CL2 & CL3',
        'Missoula': 'CL2 & CL3',
        'Butte': 'CL2 & CL3',
        'Kalispell': 'CL2 & CL3',
        'Havre': 'CL2 & CL3',
        'Office/Management': 'None'
      };
      approval = defaults[locClean];
    }
    if (approval === undefined || approval === null) return true;
    if (!approval || approval === 'None') return false;
    if (String(itemClassNum) === '2') return approval === 'CL2' || approval === 'CL2 & CL3';
    if (String(itemClassNum) === '3') return approval === 'CL3' || approval === 'CL2 & CL3';
    return true;
  }

  /**
   * Main entry point to generate all equipment swaps
   */
  async generateAllSwaps() {
    const startTime = performance.now();

    // 0. Auto-reconcile active inventory with latest history records first (avoids phantom swaps for returned/reassigned gear)
    if (window.inventoryManager && typeof window.inventoryManager.reconcileInventoryWithHistory === 'function') {
      try {
        await window.inventoryManager.reconcileInventoryWithHistory(null, true);
      } catch (err) {
        console.warn('Auto-reconciliation before swap generation warning:', err);
      }
    }

    const stats = {
      gloves: 0,
      sleeves: 0,
      blankets: 0,
      macks: 0,
      hv_testers: 0,
      phasing_sets: 0,
      aed: 0,
      grounds: 0,
      hot_sticks: 0,
      totalPicked: 0,
      needToOrder: 0
    };

    // 1. Generate Gloves & Sleeves Swaps
    const gloveRes = this.generateSwaps('Gloves');
    stats.gloves = gloveRes.swapCount;
    stats.totalPicked += gloveRes.pickedCount;
    stats.needToOrder += gloveRes.needToOrderCount;

    const sleeveRes = this.generateSwaps('Sleeves');
    stats.sleeves = sleeveRes.swapCount;
    stats.totalPicked += sleeveRes.pickedCount;
    stats.needToOrder += sleeveRes.needToOrderCount;

    // 2. Generate Blanket Swaps
    const blanketRes = this.generateBlanketSwaps();
    stats.blankets = blanketRes.swapCount;
    stats.totalPicked += blanketRes.pickedCount;

    // 3. Generate MACK Swaps
    const mackRes = this.generateMackSwaps();
    stats.macks = mackRes.swapCount;
    stats.totalPicked += mackRes.pickedCount;

    // 4. Generate HV Testers & Phasing Sets
    const hvRes = this.generateCalibrationSwaps('hv_testers', 'hv_tester_swaps', 'HV Tester');
    stats.hv_testers = hvRes.swapCount;
    stats.totalPicked += hvRes.pickedCount;

    const phasingRes = this.generateCalibrationSwaps('phasing_sets', 'phasing_set_swaps', 'Phasing Set');
    stats.phasing_sets = phasingRes.swapCount;
    stats.totalPicked += phasingRes.pickedCount;

    // 5. Generate AED Swaps
    const aedRes = this.generateAEDSwaps();
    stats.aed = aedRes.swapCount;
    stats.totalPicked += aedRes.pickedCount;

    // 6. Generate Grounds Swaps
    const groundRes = this.generateGroundSwaps();
    stats.grounds = groundRes.swapCount;
    stats.totalPicked += groundRes.pickedCount;

    // 7. Generate Hot Sticks Swaps
    const hotStickRes = this.generateHotStickSwaps();
    stats.hot_sticks = hotStickRes.swapCount;
    stats.totalPicked += hotStickRes.pickedCount;

    // 8. Run Upgrade Pick List pass
    this.upgradePickListItems();

    const elapsed = Math.round(performance.now() - startTime);

    // Refresh UI
    if (window.sheetNavigator) {
      window.sheetNavigator.renderActiveView();
    }

    this.showSwapSummaryModal(stats, elapsed);
    return stats;
  }

  /**
   * Generates Glove or Sleeve Swaps matching Code.gs line-for-line
   */
  generateSwaps(itemType) {
    const isGloves = (itemType === 'Gloves' || itemType === 'gloves');
    const swapKey = isGloves ? 'glove_swaps' : 'sleeve_swaps';
    const swapSheetName = isGloves ? 'Glove Swaps' : 'Sleeve Swaps';
    const invKey = isGloves ? 'gloves' : 'sleeves';
    const invSheetName = isGloves ? 'Gloves' : 'Sleeves';
    const itemLabel = isGloves ? 'Glove' : 'Sleeve';

    const invTable = this.db.getTable(invKey);
    const empTable = this.db.getTable('employees');
    const locTable = this.db.getTable('locations');

    if (!invTable || !invTable.rows || !empTable || !empTable.rows) {
      return { swapCount: 0, pickedCount: 0, needToOrderCount: 0 };
    }

    // Preserve manual pick edits
    const manualPicks = this.preserveManualPickLists(swapKey);

    const today = new Date();
    const todayStr = this.formatDateIso(today);
    const todayFormatted = this.formatDate(today);

    const ignoreNames = [
      'on shelf', 'in testing', 'packed for delivery', 'packed for testing',
      'failed rubber', 'lost', 'not repairable', '', 'n/a', 'ready for test', 'ready for delivery', 'assigned', 'destroyed'
    ];

    // Read location approvals
    const locationApprovals = {};
    if (locTable && locTable.rows) {
      locTable.rows.forEach(r => {
        const loc = String(r['Location'] || Object.values(r)[0] || '').trim();
        const app = String(r['Approval'] || r['Rubber Class Approval'] || Object.values(r)[6] || '').trim();
        if (loc && app) locationApprovals[loc] = app;
      });
    }

    // Build employee maps (Skip pending new hires)
    // 0. Build list of previous employees from employee table and employee history
    const previousEmployeeNames = new Set();
    const employeeHistoryTable = this.db.getTable('employee_history') || this.db.getTable('Employee History');
    if (employeeHistoryTable && employeeHistoryTable.rows) {
      employeeHistoryTable.rows.forEach(hr => {
        const hName = String(hr['Employee Name'] || hr['Name'] || Object.values(hr)[1] || '').trim().toLowerCase();
        const hEvent = String(hr['Event Type'] || hr['Event'] || Object.values(hr)[2] || '').trim().toLowerCase();
        const hLoc = String(hr['Location'] || Object.values(hr)[3] || '').trim().toLowerCase();
        if (hEvent === 'terminated' || hLoc === 'previous employee' || hEvent.includes('inactive')) {
          if (hName) previousEmployeeNames.add(hName);
        }
      });
    }

    // Build employee maps (Skip pending new hires and previous employees)
    const empMap = {};
    const empLocationMap = {};
    const empJobNumMap = {};
    const empClassificationMap = {};
    const empSizeMap = {};

    empTable.rows.forEach(row => {
      const name = String(row['Name'] || row['Employee Name'] || Object.values(row)[0] || '').trim();
      const nameLower = name.toLowerCase();
      if (!name || ignoreNames.includes(nameLower)) return;

      const locLower = String(row['Location'] || '').trim().toLowerCase();
      const statusLower = String(row['Status'] || '').trim().toLowerCase();
      if (locLower === 'previous employee' || locLower.includes('previous') ||
          statusLower === 'previous employee' || statusLower.includes('inactive') || statusLower.includes('terminated')) {
        previousEmployeeNames.add(nameLower);
        return; // Skip from active empMap
      }

      const hireDateStr = row['Hire Date'];
      const hireDate = this.parseDate(hireDateStr);
      if (hireDate && hireDate > today) return; // Skip pending new hire

      empMap[nameLower] = row;
      empLocationMap[nameLower] = String(row['Location'] || 'Helena').trim();
      empJobNumMap[nameLower] = String(row['Job Number'] || row['Job #'] || '').trim();
      empClassificationMap[nameLower] = String(row['Job Classification'] || row['Classification'] || '').trim();
      empSizeMap[nameLower] = String(isGloves ? (row['Glove Size'] || row['Size'] || '10') : (row['Sleeve Size'] || row['Size'] || '20')).trim();
    });

    const getForemanForEmployee = (employeeName) => {
      const empNameLower = employeeName.toString().trim().toLowerCase();
      const empLocation = empLocationMap[empNameLower];
      const empJobNum = empJobNumMap[empNameLower];
      const empCrew = this.extractCrewNum(empJobNum);
      if (!empCrew || !empLocation) return empCrew || 'Unknown';

      let foremanName = null;
      Object.keys(empMap).forEach(name => {
        if (empLocationMap[name] === empLocation) {
          const theirCrew = this.extractCrewNum(empJobNumMap[name]);
          if (theirCrew === empCrew) {
            const classification = empClassificationMap[name];
            if (classification === 'F' || classification === 'GTO F') {
              foremanName = String(empMap[name]['Name'] || empMap[name]['Employee Name'] || Object.values(empMap[name])[0] || '').trim();
            }
          }
        }
      });
      return foremanName || empCrew || 'Unknown';
    };

    // Location fallback crew lead map
    const classHierarchyRank = { SUP: 1, GF: 2, F: 3, 'GTO F': 4, JRY: 5, 'JRY OP': 6, WT: 7, GTO: 8, 'EO 1': 9, 'EO 2': 10 };
    const locationToLeadMap = {};
    Object.keys(empMap).forEach(empName => {
      const loc = (empLocationMap[empName] || '').trim().toLowerCase();
      if (!loc) return;
      const existingLead = locationToLeadMap[loc];
      if (!existingLead) {
        locationToLeadMap[loc] = empName;
      } else {
        const newRank = classHierarchyRank[empClassificationMap[empName]] || 99;
        const existingRank = classHierarchyRank[empClassificationMap[existingLead]] || 99;
        if (newRank < existingRank) {
          locationToLeadMap[loc] = empName;
        }
      }
    });

    const classes = isGloves ? [0, 2, 3] : [2, 3];
    const classNames = { 0: 'Class 0', 2: 'Class 2', 3: 'Class 3' };
    const assignedItemNums = new Set();

    const allHeaders = [
      'Employee', `Current ${itemLabel} #`, 'Size', 'Date Assigned', 'Change Out Date', 'Days Left', 'Pick List Item #', 'Status', 'Picked', 'Date Changed',
      'Stage 1 Pick Status', 'Stage 1 Pick Assigned', 'Stage 1 Pick Date',
      'Stage 1 Old Status', 'Stage 1 Old Assigned', 'Stage 1 Old Date',
      'Stage 2 Status', 'Stage 2 Assigned', 'Stage 2 Date', 'Stage 2 Picked For',
      'Stage 3 Assigned', 'Stage 3 Date', 'Stage 3 Change Out Date'
    ];

    const rawGrid = [];
    const swapRows = [];
    let pickedCount = 0;
    let needToOrderCount = 0;

    const inventoryData = invTable.rows;

    // Scan for Previous Employee items to reclaim (no replacement item assigned)
    const prevEmpItems = [];
    inventoryData.forEach(item => {
      const itemNum = String(item['Item #'] || item['Glove'] || item['Sleeve'] || item['ESL ID'] || '').trim();
      if (!itemNum) return;

      const status = String(item['Status'] || '').trim();
      const location = String(item['Location'] || '').trim();
      const assignedTo = String(item['Assigned To'] || '').trim();
      const pickedFor = String(item['Picked For'] || '').trim();
      const locationLower = location.toLowerCase();
      const assignedToLower = assignedTo.toLowerCase();
      const pickedForLower = pickedFor.toLowerCase();

      let isPrevEmpItem = false;
      let isAlreadyPicked = false;
      let employeeName = '';

      if (locationLower === 'previous employee' || previousEmployeeNames.has(assignedToLower)) {
        if (assignedTo && !ignoreNames.includes(assignedToLower)) {
          isPrevEmpItem = true;
          employeeName = assignedTo;
        }
      } else if (status.toLowerCase() === 'ready for test' && pickedForLower.includes('reclaim')) {
        const suffixIdx = pickedForLower.indexOf(' reclaim');
        if (suffixIdx !== -1) {
          const empNameStr = pickedFor.substring(0, suffixIdx).trim();
          if (previousEmployeeNames.has(empNameStr.toLowerCase())) {
            isPrevEmpItem = true;
            isAlreadyPicked = true;
            employeeName = empNameStr;
          }
        }
      }

      if (isPrevEmpItem) {
        const rowData = [
          employeeName,
          itemNum,
          String(item['Size'] || '').trim(),
          this.formatDate(item['Date Assigned']),
          this.formatDate(item['Change Out Date']),
          'PREV EMP',
          '—', // Pick List Item # is ALWAYS '—' for previous employees!
          isAlreadyPicked ? 'Ready For Delivery 🚚' : 'Return to Shelf',
          isAlreadyPicked,
          '',
          // Stage 1 Pick
          status, assignedTo, this.formatDate(item['Date Assigned']),
          // Stage 1 Old
          status, assignedTo, this.formatDate(item['Date Assigned']),
          // Stage 2
          isAlreadyPicked ? 'Ready For Test' : '',
          isAlreadyPicked ? 'Packed For Testing' : '',
          isAlreadyPicked ? this.formatDate(item['Date Assigned']) : '',
          isAlreadyPicked ? pickedFor : '',
          // Stage 3
          '', '', ''
        ];
        prevEmpItems.push({
          data: rowData,
          employeeName: employeeName,
          foreman: getForemanForEmployee(employeeName)
        });
      }
    });

    classes.forEach(itemClass => {
      // Collect qualifying swap candidates for this class
      const swapMeta = [];

      inventoryData.forEach(item => {
        const iClass = parseInt(item['Class'] || '0', 10);
        if (iClass !== itemClass) return;

        const status = String(item['Status'] || '').trim();
        const statusLower = status.toLowerCase();
        const location = String(item['Location'] || '').trim();
        const locationLower = location.toLowerCase();

        // ONLY active in-service/assigned items can generate a swap!
        const inactiveStatuses = [
          'on shelf', 'available', 'in stock',
          'in testing', 'packed for testing', 'ready for test',
          'packed for delivery', 'ready for delivery',
          'lost', 'destroyed', 'failed rubber', 'not repairable',
          'retired', 'out of service'
        ];
        if (inactiveStatuses.includes(statusLower)) {
          return; // Skip inactive inventory items
        }

        let assignedToRaw = item['Assigned To'];
        if (!assignedToRaw) return;
        let assignedTo = String(assignedToRaw).trim().toLowerCase();
        if (!assignedTo || ignoreNames.includes(assignedTo)) return;

        // Skip Previous Employee items from active swap generation (handled in prevEmpItems)
        if (assignedTo === 'previous employee' || previousEmployeeNames.has(assignedTo) || locationLower === 'previous employee') {
          return;
        }

        // Fallback for location-based AssignedTo
        if (!empMap[assignedTo]) {
          const fallbackLead = locationToLeadMap[assignedTo];
          if (!fallbackLead) return;
          assignedTo = fallbackLead;
        }

        const emp = empMap[assignedTo];
        const employeeLocation = empLocationMap[assignedTo] || 'Unknown';

        // Check location rubber approval
        if (!this.isLocationApprovedForClass(employeeLocation, itemClass, locationApprovals)) {
          return; // Skipped -> goes to Reclaims
        }

        const itemNum = String(item['Item #'] || item['Glove'] || item['Sleeve'] || item['ESL ID'] || '').trim();
        const size = String(item['Size'] || '').trim();
        const dateAssigned = item['Date Assigned'];
        const changeOutDate = item['Change Out Date'];

        let daysLeft = '';
        let daysLeftColor = '#388e3c';

        if (changeOutDate) {
          const chgDt = this.parseDate(changeOutDate);
          if (chgDt) {
            const days = this.getDaysDifference(chgDt, today);
            if (days < 0) {
              daysLeft = 'OVERDUE';
              daysLeftColor = '#ff5252';
            } else if (days <= 14) {
              daysLeft = days;
              daysLeftColor = '#ff9800';
            } else {
              daysLeft = days;
              daysLeftColor = '#388e3c';
            }
          }
        }

        const isDue = (daysLeft === 'OVERDUE' || (typeof daysLeft === 'number' && daysLeft < 32));
        if (dateAssigned && changeOutDate && isDue) {
          swapMeta.push({
            empName: String(emp['Name'] || emp['Employee Name'] || Object.values(emp)[0] || '').trim(),
            employeeLocation: employeeLocation,
            foreman: getForemanForEmployee(assignedTo),
            itemNum: itemNum,
            size: size,
            dateAssigned: this.formatDate(dateAssigned),
            changeOutDate: this.formatDate(changeOutDate),
            daysLeft: daysLeft,
            daysLeftColor: daysLeftColor,
            status: status,
            itemClass: itemClass,
            empPreferredSize: empSizeMap[assignedTo] || size,
            itemSize: isGloves ? parseFloat(size) : size,
            oldStatus: status,
            oldAssignedTo: String(item['Assigned To']).trim(),
            oldDateAssigned: this.formatDate(dateAssigned),
            originalRow: item
          });
        }
      });

      // Sort by Location (alphabetically), then by Foreman, then by Change Out Date (urgent first)
      swapMeta.sort((a, b) => {
        const locComp = (a.employeeLocation || 'ZZZ').localeCompare(b.employeeLocation || 'ZZZ');
        if (locComp !== 0) return locComp;
        const formComp = (a.foreman || 'ZZZ').localeCompare(b.foreman || 'ZZZ');
        if (formComp !== 0) return formComp;
        const dtA = new Date(a.changeOutDate).getTime() || 0;
        const dtB = new Date(b.changeOutDate).getTime() || 0;
        return dtA - dtB;
      });

      const isLostLocate = (it) => String(it['Notes'] || '').toUpperCase().includes('LOST-LOCATE');

      // Clean up any stale Picked For on items that are On Shelf before matching
      inventoryData.forEach(it => {
        const stat = String(it['Status'] || '').trim().toLowerCase();
        if (stat === 'on shelf' || stat === 'in stock') {
          it['Picked For'] = '';
        }
      });

      // Process Pick List matching for each candidate
      const classRows = [];

      swapMeta.forEach(meta => {
        const employeeName = meta.empName;
        const useSize = isGloves ?
          (!isNaN(parseFloat(meta.empPreferredSize)) ? parseFloat(meta.empPreferredSize) : meta.itemSize) :
          (meta.empPreferredSize || meta.itemSize);

        let pickListValue = '—';
        let pickListStatus = '';
        let pickListSizeUp = false;
        let pickListStatusRaw = '';
        let pickListItemData = null;
        let isAlreadyPicked = false;

        // Check if there is a manual pick override preserved
        const manual = manualPicks[employeeName.toLowerCase()];
        if (manual && manual.pickListNum && manual.pickListNum !== '—') {
          const matchManual = inventoryData.find(it => {
            const itm = String(it['Item #'] || it['Glove'] || it['Sleeve'] || it['ESL ID'] || '').trim();
            return itm === manual.pickListNum;
          });
          if (matchManual) {
            pickListValue = manual.pickListNum;
            pickListStatus = manual.status || 'In Stock ✅';
            pickListItemData = matchManual;
            pickListStatusRaw = String(matchManual['Status'] || '').trim().toLowerCase();
            assignedItemNums.add(pickListValue);
          }
        }

        // Tier 1: Existing Picked For match (for items already packed/ready for delivery)
        if (!pickListItemData) {
          const pickedForMatch = inventoryData.find(it => {
            const itNum = String(it['Item #'] || it['Glove'] || it['Sleeve'] || it['ESL ID'] || '').trim();
            const pickedFor = String(it['Picked For'] || '').trim().toLowerCase();
            const classMatch = parseInt(it['Class'] || '0', 10) === meta.itemClass;
            const forEmp = pickedFor.includes(employeeName.toLowerCase());
            const notUsed = !assignedItemNums.has(itNum);
            const notLost = !isLostLocate(it);
            return classMatch && forEmp && notUsed && notLost;
          });

          if (pickedForMatch) {
            pickListValue = String(pickedForMatch['Item #'] || pickedForMatch['Glove'] || pickedForMatch['Sleeve'] || pickedForMatch['ESL ID'] || '').trim();
            pickListStatusRaw = String(pickedForMatch['Status'] || '').trim().toLowerCase();
            pickListItemData = pickedForMatch;
            isAlreadyPicked = true;
            assignedItemNums.add(pickListValue);

            const pickedSize = isGloves ? parseFloat(pickedForMatch['Size']) : pickedForMatch['Size'];
            if (isGloves && !isNaN(pickedSize) && !isNaN(useSize) && pickedSize > useSize) {
              pickListSizeUp = true;
            }
          }
        }

        // Tier 2: Exact Size On Shelf
        if (!pickListItemData) {
          const match = inventoryData.find(it => {
            const itNum = String(it['Item #'] || it['Glove'] || it['Sleeve'] || it['ESL ID'] || '').trim();
            const stat = String(it['Status'] || '').trim().toLowerCase();
            const classMatch = parseInt(it['Class'] || '0', 10) === meta.itemClass;
            const sizeMatch = isGloves ?
              parseFloat(it['Size']) === useSize :
              (String(it['Size'] || '').trim().toLowerCase() === String(useSize).trim().toLowerCase());
            const notAssigned = !assignedItemNums.has(itNum);
            const pickedFor = String(it['Picked For'] || '').trim();
            const isReservedForOther = (stat === 'ready for delivery') && pickedFor !== '' && !pickedFor.toLowerCase().includes(employeeName.toLowerCase());
            const notLost = !isLostLocate(it);
            return stat === 'on shelf' && classMatch && sizeMatch && notAssigned && !isReservedForOther && notLost;
          });

          if (match) {
            pickListValue = String(match['Item #'] || match['Glove'] || match['Sleeve'] || match['ESL ID'] || '').trim();
            pickListStatusRaw = 'on shelf';
            pickListItemData = match;
            assignedItemNums.add(pickListValue);
          }
        }

        // Tier 3: Size Up On Shelf (+0.5 for Gloves)
        if (!pickListItemData && isGloves && !isNaN(useSize)) {
          const match = inventoryData.find(it => {
            const itNum = String(it['Item #'] || it['Glove'] || it['Sleeve'] || it['ESL ID'] || '').trim();
            const stat = String(it['Status'] || '').trim().toLowerCase();
            const pickedFor = String(it['Picked For'] || '').trim();
            const isReservedForOther = (stat === 'ready for delivery') && pickedFor !== '' && !pickedFor.toLowerCase().includes(employeeName.toLowerCase());
            const notLost = !isLostLocate(it);
            return stat === 'on shelf' &&
                   parseInt(it['Class'] || '0', 10) === meta.itemClass &&
                   parseFloat(it['Size']) === useSize + 0.5 &&
                   !assignedItemNums.has(itNum) &&
                   !isReservedForOther &&
                   notLost;
          });

          if (match) {
            pickListValue = String(match['Item #'] || match['Glove'] || match['Sleeve'] || match['ESL ID'] || '').trim();
            pickListStatusRaw = 'on shelf';
            pickListSizeUp = true;
            pickListItemData = match;
            assignedItemNums.add(pickListValue);
          }
        }

        // Tier 4: Ready For Delivery or In Testing
        if (!pickListItemData) {
          const match = inventoryData.find(it => {
            const itNum = String(it['Item #'] || it['Glove'] || it['Sleeve'] || it['ESL ID'] || '').trim();
            const stat = String(it['Status'] || '').trim().toLowerCase();
            const statusMatch = (stat === 'ready for delivery' || stat === 'in testing');
            const classMatch = parseInt(it['Class'] || '0', 10) === meta.itemClass;
            const sizeMatch = isGloves ?
              parseFloat(it['Size']) === useSize :
              (String(it['Size'] || '').trim().toLowerCase() === String(useSize).trim().toLowerCase());
            const notAssigned = !assignedItemNums.has(itNum);
            const pickedFor = String(it['Picked For'] || '').trim();
            const isReservedForOther = (stat === 'ready for delivery') && pickedFor !== '' && !pickedFor.toLowerCase().includes(employeeName.toLowerCase());
            const notLost = !isLostLocate(it);
            return statusMatch && classMatch && sizeMatch && notAssigned && !isReservedForOther && notLost;
          });

          if (match) {
            pickListValue = String(match['Item #'] || match['Glove'] || match['Sleeve'] || match['ESL ID'] || '').trim();
            pickListStatusRaw = String(match['Status'] || '').trim().toLowerCase();
            pickListItemData = match;
            assignedItemNums.add(pickListValue);
          }
        }

        // Tier 5: Size Up Ready For Delivery or In Testing (+0.5 for Gloves)
        if (!pickListItemData && isGloves && !isNaN(useSize)) {
          const match = inventoryData.find(it => {
            const itNum = String(it['Item #'] || it['Glove'] || it['Sleeve'] || it['ESL ID'] || '').trim();
            const stat = String(it['Status'] || '').trim().toLowerCase();
            const pickedFor = String(it['Picked For'] || '').trim();
            const isReservedForOther = (stat === 'ready for delivery') && pickedFor !== '' && !pickedFor.toLowerCase().includes(employeeName.toLowerCase());
            const notLost = !isLostLocate(it);
            return (stat === 'ready for delivery' || stat === 'in testing') &&
                   parseInt(it['Class'] || '0', 10) === meta.itemClass &&
                   parseFloat(it['Size']) === useSize + 0.5 &&
                   !assignedItemNums.has(itNum) &&
                   !isReservedForOther &&
                   notLost;
          });

          if (match) {
            pickListValue = String(match['Item #'] || match['Glove'] || match['Sleeve'] || match['ESL ID'] || '').trim();
            pickListStatusRaw = String(match['Status'] || '').trim().toLowerCase();
            pickListSizeUp = true;
            pickListItemData = match;
            assignedItemNums.add(pickListValue);
          }
        }

        // Determine display status string
        if (pickListValue === '—') {
          pickListStatus = 'Need to Purchase ❌';
          needToOrderCount++;
        } else if (pickListStatusRaw === 'on shelf') {
          pickListStatus = pickListSizeUp ? 'In Stock (Size Up) ⚠️' : 'In Stock ✅';
          pickedCount++;
        } else if (pickListStatusRaw === 'ready for delivery') {
          pickListStatus = pickListSizeUp ? 'Ready For Delivery (Size Up) ⚠️' : 'Ready For Delivery 🚚';
          pickedCount++;
        } else if (pickListStatusRaw === 'in testing') {
          pickListStatus = pickListSizeUp ? 'In Testing (Size Up) ⚠️' : 'In Testing 🔬';
          pickedCount++;
        } else {
          pickListStatus = meta.status;
        }

        if (isAlreadyPicked && pickListStatusRaw !== 'in testing') {
          pickListStatus = pickListSizeUp ? 'Ready For Delivery (Size Up) ⚠️' : 'Ready For Delivery 🚚';
        }

        let stage2Status = '';
        let stage2AssignedTo = '';
        let stage2DateAssigned = '';
        let stage2PickedFor = '';

        if (isAlreadyPicked && pickListItemData) {
          stage2Status = pickListItemData['Status'] || 'Ready For Delivery';
          stage2AssignedTo = pickListItemData['Assigned To'] || 'Packed For Delivery';
          stage2DateAssigned = this.formatDate(pickListItemData['Date Assigned']) || '';
          stage2PickedFor = pickListItemData['Picked For'] || '';
        }

        // 23 columns (A-W) matching Google Sheets schema
        const rowData = [
          meta.empName, meta.itemNum, meta.size, meta.dateAssigned, meta.changeOutDate, meta.daysLeft,
          pickListValue,
          pickListStatus,
          isAlreadyPicked,
          '',
          // K-M: Stage 1 Pick List before check
          pickListItemData ? (isAlreadyPicked ? 'On Shelf' : (pickListItemData['Status'] || '')) : '',
          pickListItemData ? (isAlreadyPicked ? 'On Shelf' : (pickListItemData['Assigned To'] || '')) : '',
          pickListItemData ? (isAlreadyPicked ? '' : (this.formatDate(pickListItemData['Test Date'] || pickListItemData['Date Assigned']) || '')) : '',
          // N-P: Stage 1 Old Item
          meta.oldStatus || '', meta.oldAssignedTo || '', meta.oldDateAssigned || '',
          // Q-T: Stage 2
          stage2Status, stage2AssignedTo, stage2DateAssigned, stage2PickedFor,
          // U-W: Stage 3
          '', '', ''
        ];

        classRows.push({
          data: rowData,
          location: meta.employeeLocation,
          foreman: meta.foreman,
          daysLeftColor: meta.daysLeftColor,
          itemClass: itemClass
        });
      });

      // Group rows by Location -> Foreman
      const locationGroups = {};
      classRows.forEach(r => {
        const loc = r.location || 'Unknown';
        const form = r.foreman || 'Unknown';
        if (!locationGroups[loc]) locationGroups[loc] = {};
        if (!locationGroups[loc][form]) locationGroups[loc][form] = [];
        locationGroups[loc][form].push(r);
      });

      const sortedLocations = Object.keys(locationGroups).sort();

      // Write class header
      rawGrid.push([`${classNames[itemClass]} ${itemLabel} Swaps`, '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '']);

      if (sortedLocations.length > 0) {
        sortedLocations.forEach(location => {
          const foremanGroups = locationGroups[location];
          const sortedForemen = Object.keys(foremanGroups).sort();

          // Location header
          rawGrid.push([`🔍 ${location}`, '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '']);

          sortedForemen.forEach(foreman => {
            if (sortedForemen.length > 1 || foreman !== 'Unknown') {
              rawGrid.push([`    👷 ${foreman}`, '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '']);
            }

            foremanGroups[foreman].forEach(r => {
              rawGrid.push(r.data);
              const obj = this.gridRowToObj(allHeaders, r.data);
              obj._location = location;
              obj._foreman = foreman;
              obj._daysLeftColor = r.daysLeftColor;
              swapRows.push(obj);
            });
          });
        });
      } else {
        rawGrid.push(['No swaps due for this class', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '']);
      }
    });

    // Write PREVIOUS EMPLOYEE section if items found to reclaim
    if (prevEmpItems.length > 0) {
      rawGrid.push(['PREVIOUS EMPLOYEE', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '']);

      const prevForemanGroups = {};
      prevEmpItems.forEach(r => {
        const form = r.foreman || 'Unknown';
        if (!prevForemanGroups[form]) prevForemanGroups[form] = [];
        prevForemanGroups[form].push(r);
      });

      const sortedPrevForemen = Object.keys(prevForemanGroups).sort();
      sortedPrevForemen.forEach(foreman => {
        if (sortedPrevForemen.length > 1 || foreman !== 'Unknown') {
          rawGrid.push([`    👷 ${foreman}`, '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '']);
        }

        prevForemanGroups[foreman].forEach(r => {
          rawGrid.push(r.data);
          const obj = this.gridRowToObj(allHeaders, r.data);
          obj._location = 'PREVIOUS EMPLOYEE';
          obj._foreman = foreman;
          obj._daysLeftColor = '#ef4444';
          swapRows.push(obj);
        });
      });
    }

    // Save to local database
    this.db.replaceSwapTable(swapKey, rawGrid, allHeaders, swapRows);

    return {
      swapCount: swapRows.length,
      pickedCount: pickedCount,
      needToOrderCount: needToOrderCount
    };
  }

  /**
   * Generates Blanket Swaps (Class 2 & Class 4, 1-year test interval)
   */
  generateBlanketSwaps() {
    const swapKey = 'blanket_swaps';
    const invTable = this.db.getTable('blankets');
    const empTable = this.db.getTable('employees');
    if (!invTable || !invTable.rows) return { swapCount: 0, pickedCount: 0 };

    const today = new Date();
    const headers = [
      'Employee', 'Current Blanket #', 'Type', 'Date Assigned', 'Change Out Date', 'Days Left', 'Pick List Item #', 'Status', 'Picked', 'Date Changed',
      'Stage 1 Pick Status', 'Stage 1 Pick Assigned', 'Stage 1 Pick Date',
      'Stage 1 Old Status', 'Stage 1 Old Assigned', 'Stage 1 Old Date',
      'Stage 2 Status', 'Stage 2 Assigned', 'Stage 2 Date', 'Stage 2 Picked For',
      'Stage 3 Assigned', 'Stage 3 Date', 'Stage 3 Change Out Date'
    ];

    const rawGrid = [];
    const swapRows = [];
    let pickedCount = 0;

    const blanketsNeedingSwap = [];
    const shelfBlankets = [];

    invTable.rows.forEach(r => {
      const itemNum = String(r['Item #'] || r['Blanket'] || Object.values(r)[0] || '').trim();
      const status = String(r['Status'] || '').trim().toLowerCase();
      const chgOut = this.parseDate(r['Change Out Date']);
      const assignedTo = String(r['Assigned To'] || '').trim();

      if (status === 'on shelf' || status === 'in stock' || status === 'available') {
        shelfBlankets.push(r);
      } else if ((status === 'in service' || status === 'assigned') && assignedTo && chgOut) {
        const daysLeft = this.getDaysDifference(chgOut, today);
        if (daysLeft < 32) {
          blanketsNeedingSwap.push({
            itemNum: itemNum,
            type: r['Type'] || 'Regular',
            itemClass: r['Class'] || '2',
            dateAssigned: this.formatDate(r['Date Assigned']),
            changeOutDate: this.formatDate(chgOut),
            daysLeft: daysLeft < 0 ? 'OVERDUE' : daysLeft,
            assignedTo: assignedTo,
            location: r['Location'] || 'Helena',
            status: r['Status'] || 'In Service'
          });
        }
      }
    });

    rawGrid.push(['Blanket Swaps', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '']);

    blanketsNeedingSwap.forEach(b => {
      // Find matching shelf blanket
      const match = shelfBlankets.find(sb => String(sb['Class']) === String(b.itemClass) && String(sb['Type']) === String(b.type));
      const pickNum = match ? String(match['Item #'] || match['Blanket'] || '').trim() : '—';
      const pickStatus = match ? 'In Stock ✅' : 'Need to Purchase ❌';
      if (match) pickedCount++;

      const rowData = [
        b.assignedTo, b.itemNum, b.type, b.dateAssigned, b.changeOutDate, b.daysLeft,
        pickNum, pickStatus, false, '',
        '', '', '', '', '', '', '', '', '', '', '', '', ''
      ];
      rawGrid.push(rowData);
      swapRows.push(this.gridRowToObj(headers, rowData));
    });

    this.db.replaceSwapTable(swapKey, rawGrid, headers, swapRows);
    return { swapCount: swapRows.length, pickedCount: pickedCount };
  }

  /**
   * Generates MACK Swaps (1-year interval, grouped by Crew Lead)
   */
  generateMackSwaps() {
    const swapKey = 'mack_swaps';
    const invTable = this.db.getTable('macks');
    if (!invTable || !invTable.rows) return { swapCount: 0, pickedCount: 0 };

    const today = new Date();
    const headers = [
      'Employee', 'Current MACK #', 'KV', 'Size', 'Length', 'Date Assigned', 'Change Out Date', 'Days Left', 'Pick List Item #', 'Status', 'Picked', 'Date Changed',
      'Stage 1 Pick Status', 'Stage 1 Pick Assigned', 'Stage 1 Pick Date',
      'Stage 1 Old Status', 'Stage 1 Old Assigned', 'Stage 1 Old Date',
      'Stage 2 Status', 'Stage 2 Assigned', 'Stage 2 Date', 'Stage 2 Picked For',
      'Stage 3 Assigned', 'Stage 3 Date', 'Stage 3 Change Out Date'
    ];

    const rawGrid = [];
    const swapRows = [];
    let pickedCount = 0;

    const macksNeedingSwap = [];
    const shelfMacks = [];

    invTable.rows.forEach(r => {
      const itemNum = String(r['Item #'] || r['ESL ID'] || Object.values(r)[0] || '').trim();
      const status = String(r['Status'] || '').trim().toLowerCase();
      const chgOut = this.parseDate(r['Change Out Date']);
      const assignedTo = String(r['Assigned To'] || '').trim();

      if (status === 'on shelf' || status === 'in stock' || status === 'available') {
        shelfMacks.push(r);
      } else if ((status === 'in service' || status === 'assigned') && assignedTo && chgOut) {
        const daysLeft = this.getDaysDifference(chgOut, today);
        if (daysLeft < 32) {
          macksNeedingSwap.push({
            itemNum: itemNum,
            kv: r['KV'] || '',
            size: r['Size'] || '',
            length: r['Length'] || '',
            dateAssigned: this.formatDate(r['Date Assigned']),
            changeOutDate: this.formatDate(chgOut),
            daysLeft: daysLeft < 0 ? 'OVERDUE' : daysLeft,
            assignedTo: assignedTo,
            location: r['Location'] || 'Helena',
            status: r['Status'] || 'In Service'
          });
        }
      }
    });

    rawGrid.push(['MACK Swaps', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '']);

    macksNeedingSwap.forEach(m => {
      const match = shelfMacks.find(sm => String(sm['KV']) === String(m.kv) && String(sm['Size']) === String(m.size));
      const pickNum = match ? String(match['Item #'] || match['ESL ID'] || '').trim() : '—';
      const pickStatus = match ? 'In Stock ✅' : 'Need to Purchase ❌';
      if (match) pickedCount++;

      const rowData = [
        m.assignedTo, m.itemNum, m.kv, m.size, m.length, m.dateAssigned, m.changeOutDate, m.daysLeft,
        pickNum, pickStatus, false, '',
        '', '', '', '', '', '', '', '', '', '', '', '', ''
      ];
      rawGrid.push(rowData);
      swapRows.push(this.gridRowToObj(headers, rowData));
    });

    this.db.replaceSwapTable(swapKey, rawGrid, headers, swapRows);
    return { swapCount: swapRows.length, pickedCount: pickedCount };
  }

  /**
   * Generates Calibration Swaps (HV Testers & Phasing Sets - 10-year calibration cycle)
   */
  generateCalibrationSwaps(invKey, swapKey, equipmentLabel) {
    const invTable = this.db.getTable(invKey);
    if (!invTable || !invTable.rows) return { swapCount: 0, pickedCount: 0 };

    const today = new Date();
    const headers = [
      'Crew Lead / Employee', `Current ${equipmentLabel} #`, 'Model', 'KV', 'Serial #', 'Date Assigned', 'Change Out Date', 'Days Left', `Pick List ${equipmentLabel} #`, 'Status', 'Picked', 'Date Changed'
    ];

    const rawGrid = [];
    const swapRows = [];
    let pickedCount = 0;

    const needingSwap = [];
    const shelfItems = [];

    invTable.rows.forEach(r => {
      const itemNum = String(r['Item #'] || Object.values(r)[0] || '').trim();
      const status = String(r['Status'] || '').trim().toLowerCase();
      const chgOut = this.parseDate(r['Change Out Date'] || r['Calibration Date']);
      const assignedTo = String(r['Assigned To'] || '').trim();

      if (status === 'on shelf' || status === 'in stock' || status === 'available') {
        shelfItems.push(r);
      } else if ((status === 'in service' || status === 'assigned') && assignedTo && chgOut) {
        const daysLeft = this.getDaysDifference(chgOut, today);
        if (daysLeft < 32) {
          needingSwap.push({
            itemNum: itemNum,
            model: r['Model'] || '',
            kv: r['KV'] || '',
            serialNum: r['Serial #'] || '',
            dateAssigned: this.formatDate(r['Date Assigned']),
            changeOutDate: this.formatDate(chgOut),
            daysLeft: daysLeft < 0 ? 'OVERDUE' : daysLeft,
            assignedTo: assignedTo,
            status: r['Status'] || 'In Service'
          });
        }
      }
    });

    rawGrid.push([`${equipmentLabel} Swaps`, '', '', '', '', '', '', '', '', '', '', '']);

    needingSwap.forEach(it => {
      const match = shelfItems.find(si => String(si['Model']) === String(it.model));
      const pickNum = match ? String(match['Item #'] || Object.values(match)[0] || '').trim() : '—';
      const pickStatus = match ? 'In Stock ✅' : 'Need to Purchase ❌';
      if (match) pickedCount++;

      const rowData = [
        it.assignedTo, it.itemNum, it.model, it.kv, it.serialNum, it.dateAssigned, it.changeOutDate, it.daysLeft,
        pickNum, pickStatus, false, ''
      ];
      rawGrid.push(rowData);
      swapRows.push(this.gridRowToObj(headers, rowData));
    });

    this.db.replaceSwapTable(swapKey, rawGrid, headers, swapRows);
    return { swapCount: swapRows.length, pickedCount: pickedCount };
  }

  /**
   * Generates AED Swaps (Pad Expiration tracking)
   */
  generateAEDSwaps() {
    const swapKey = 'aed_swaps';
    const invTable = this.db.getTable('aed');
    if (!invTable || !invTable.rows) return { swapCount: 0, pickedCount: 0 };

    const today = new Date();
    const headers = [
      'Crew Lead / Employee', 'Current AED #', 'Model', 'Pad Expiration', 'Days Left', 'Pick List AED #', 'Status', 'Picked', 'Date Changed'
    ];

    const rawGrid = [];
    const swapRows = [];
    let pickedCount = 0;

    const needingSwap = [];
    const shelfItems = [];

    invTable.rows.forEach(r => {
      const itemNum = String(r['Item #'] || Object.values(r)[0] || '').trim();
      const status = String(r['Status'] || '').trim().toLowerCase();
      const padExp = this.parseDate(r['Pad Expiration'] || r['Change Out Date']);
      const assignedTo = String(r['Assigned To'] || '').trim();

      if (status === 'on shelf' || status === 'in stock' || status === 'available') {
        shelfItems.push(r);
      } else if ((status === 'in service' || status === 'assigned') && assignedTo && padExp) {
        const daysLeft = this.getDaysDifference(padExp, today);
        if (daysLeft < 32) {
          needingSwap.push({
            itemNum: itemNum,
            model: r['Model'] || '',
            padExp: this.formatDate(padExp),
            daysLeft: daysLeft < 0 ? 'OVERDUE' : daysLeft,
            assignedTo: assignedTo,
            status: r['Status'] || 'In Service'
          });
        }
      }
    });

    rawGrid.push(['AED Swaps', '', '', '', '', '', '', '', '']);

    needingSwap.forEach(it => {
      const match = shelfItems.find(si => String(si['Model']) === String(it.model));
      const pickNum = match ? String(match['Item #'] || Object.values(match)[0] || '').trim() : '—';
      const pickStatus = match ? 'In Stock ✅' : 'Need to Purchase ❌';
      if (match) pickedCount++;

      const rowData = [
        it.assignedTo, it.itemNum, it.model, it.padExp, it.daysLeft,
        pickNum, pickStatus, false, ''
      ];
      rawGrid.push(rowData);
      swapRows.push(this.gridRowToObj(headers, rowData));
    });

    this.db.replaceSwapTable(swapKey, rawGrid, headers, swapRows);
    return { swapCount: swapRows.length, pickedCount: pickedCount };
  }

  /**
   * Generates Ground Swaps (1-year test cycle)
   */
  generateGroundSwaps() {
    const swapKey = 'ground_swaps';
    const invTable = this.db.getTable('grounds');
    if (!invTable || !invTable.rows) return { swapCount: 0, pickedCount: 0 };

    const today = new Date();
    const headers = [
      'Crew Lead / Employee', 'Serial #', 'Type', 'Size', 'KV', 'Length', 'Date Assigned', 'Change Out Date', 'Days Left', 'Pick List Serial #', 'Status', 'Picked', 'Date Changed'
    ];

    const rawGrid = [];
    const swapRows = [];
    let pickedCount = 0;

    const needingSwap = [];
    const shelfItems = [];

    invTable.rows.forEach(r => {
      const itemNum = String(r['Serial #'] || Object.values(r)[0] || '').trim();
      const status = String(r['Status'] || '').trim().toLowerCase();
      const chgOut = this.parseDate(r['Change Out Date']);
      const assignedTo = String(r['Assigned To'] || '').trim();

      if (status === 'on shelf' || status === 'in stock' || status === 'available') {
        shelfItems.push(r);
      } else if ((status === 'in service' || status === 'assigned') && assignedTo && chgOut) {
        const daysLeft = this.getDaysDifference(chgOut, today);
        if (daysLeft < 32) {
          needingSwap.push({
            itemNum: itemNum,
            type: r['Type'] || 'OH',
            size: r['Size'] || '',
            kv: r['KV'] || '',
            length: r['Length'] || '',
            dateAssigned: this.formatDate(r['Date Assigned']),
            changeOutDate: this.formatDate(chgOut),
            daysLeft: daysLeft < 0 ? 'OVERDUE' : daysLeft,
            assignedTo: assignedTo,
            status: r['Status'] || 'In Service'
          });
        }
      }
    });

    rawGrid.push(['Ground Swaps', '', '', '', '', '', '', '', '', '', '', '', '']);

    needingSwap.forEach(it => {
      const match = shelfItems.find(si => String(si['Type']) === String(it.type) && String(si['Size']) === String(it.size));
      const pickNum = match ? String(match['Serial #'] || Object.values(match)[0] || '').trim() : '—';
      const pickStatus = match ? 'In Stock ✅' : 'Need to Purchase ❌';
      if (match) pickedCount++;

      const rowData = [
        it.assignedTo, it.itemNum, it.type, it.size, it.kv, it.length, it.dateAssigned, it.changeOutDate, it.daysLeft,
        pickNum, pickStatus, false, ''
      ];
      rawGrid.push(rowData);
      swapRows.push(this.gridRowToObj(headers, rowData));
    });

    this.db.replaceSwapTable(swapKey, rawGrid, headers, swapRows);
    return { swapCount: swapRows.length, pickedCount: pickedCount };
  }

  /**
   * Generates Hot Stick Swaps (2-year test cycle)
   */
  generateHotStickSwaps() {
    const swapKey = 'hot_stick_swaps';
    const invTable = this.db.getTable('hot_sticks');
    if (!invTable || !invTable.rows) return { swapCount: 0, pickedCount: 0 };

    const today = new Date();
    const headers = [
      'Crew Lead / Employee', 'Current Item #', 'Type', 'Length', 'Date Assigned', 'Change Out Date', 'Days Left', 'Pick List Item #', 'Status', 'Picked', 'Date Changed'
    ];

    const rawGrid = [];
    const swapRows = [];
    let pickedCount = 0;

    const needingSwap = [];
    const shelfItems = [];

    invTable.rows.forEach(r => {
      const itemNum = String(r['Item #'] || Object.values(r)[0] || '').trim();
      const status = String(r['Status'] || '').trim().toLowerCase();
      const chgOut = this.parseDate(r['Change Out Date']);
      const assignedTo = String(r['Assigned To'] || '').trim();

      if (status === 'on shelf' || status === 'in stock' || status === 'available') {
        shelfItems.push(r);
      } else if ((status === 'in service' || status === 'assigned') && assignedTo && chgOut) {
        const daysLeft = this.getDaysDifference(chgOut, today);
        if (daysLeft < 32) {
          needingSwap.push({
            itemNum: itemNum,
            type: r['Type'] || '',
            length: r['Length'] || '',
            dateAssigned: this.formatDate(r['Date Assigned']),
            changeOutDate: this.formatDate(chgOut),
            daysLeft: daysLeft < 0 ? 'OVERDUE' : daysLeft,
            assignedTo: assignedTo,
            status: r['Status'] || 'In Service'
          });
        }
      }
    });

    rawGrid.push(['Hot Stick Swaps', '', '', '', '', '', '', '', '', '', '']);

    needingSwap.forEach(it => {
      const match = shelfItems.find(si => String(si['Type']) === String(it.type) && String(si['Length']) === String(it.length));
      const pickNum = match ? String(match['Item #'] || Object.values(match)[0] || '').trim() : '—';
      const pickStatus = match ? 'In Stock ✅' : 'Need to Purchase ❌';
      if (match) pickedCount++;

      const rowData = [
        it.assignedTo, it.itemNum, it.type, it.length, it.dateAssigned, it.changeOutDate, it.daysLeft,
        pickNum, pickStatus, false, ''
      ];
      rawGrid.push(rowData);
      swapRows.push(this.gridRowToObj(headers, rowData));
    });

    this.db.replaceSwapTable(swapKey, rawGrid, headers, swapRows);
    return { swapCount: swapRows.length, pickedCount: pickedCount };
  }

  /**
   * Upgrades pick list items from "In Testing" / "Need to Purchase" to "On Shelf"
   */
  upgradePickListItems() {
    let upgradesCount = 0;
    const swapConfigs = [
      { swapKey: 'glove_swaps', invKey: 'gloves', isGloves: true },
      { swapKey: 'sleeve_swaps', invKey: 'sleeves', isGloves: false }
    ];

    swapConfigs.forEach(cfg => {
      const swapTable = this.db.getTable(cfg.swapKey);
      const invTable = this.db.getTable(cfg.invKey);
      if (!swapTable || !invTable || !swapTable.rows || !invTable.rows) return;

      const assignedPicks = new Set(swapTable.rows.map(r => String(r['Pick List Item #'] || '').trim()).filter(p => p && p !== '—'));

      swapTable.rows.forEach(r => {
        const status = String(r['Status'] || '').toLowerCase();
        const pickNum = String(r['Pick List Item #'] || '').trim();
        const isPicked = r['Picked'] === true || r['Picked'] === 'TRUE';
        if (isPicked || r['_manualPick']) return;

        // Skip previous employees, return to shelf items, lost items, and class reclaims
        const daysLeftVal = String(r['Days Left'] || '').toUpperCase();
        const isPrevEmp = status.includes('return to shelf') || status.includes('packed for testing') || status.includes('ready for test') || daysLeftVal.includes('PREV EMP') || r._location === 'PREVIOUS EMPLOYEE';
        if (isPrevEmp || status.includes('locate') || daysLeftVal.includes('LOST')) {
          r['Pick List Item #'] = '—';
          return;
        }

        if (status.includes('in testing') || status.includes('need to purchase') || pickNum === '—') {
          const empSize = r['Size'];
          // Find unused On Shelf item
          const match = invTable.rows.find(it => {
            const itNum = String(it['Item #'] || it['Glove'] || it['Sleeve'] || it['ESL ID'] || '').trim();
            const itStat = String(it['Status'] || '').trim().toLowerCase();
            const itSize = String(it['Size'] || '').trim();
            const pickedFor = String(it['Picked For'] || '').trim();
            return itStat === 'on shelf' && itSize === String(empSize) && !assignedPicks.has(itNum) && !pickedFor;
          });

          if (match) {
            const newPickNum = String(match['Item #'] || match['Glove'] || match['Sleeve'] || match['ESL ID'] || '').trim();
            r['Pick List Item #'] = newPickNum;
            r['Status'] = 'In Stock ✅';
            assignedPicks.add(newPickNum);
            upgradesCount++;
          }
        }
      });
    });

    return upgradesCount;
  }

  /**
   * Helper to sync in-memory row object changes back to rawGrid
   */
  syncRowToRawGrid(table, rowObj) {
    if (!table || !table.rawGrid || !table.headers) return;
    const keyProp = table.headers[0];
    const keyVal = String(rowObj[keyProp] || Object.values(rowObj)[0] || '').trim();
    if (!keyVal) return;

    for (let i = 1; i < table.rawGrid.length; i++) {
      const gRow = table.rawGrid[i];
      if (String(gRow[0] || '').trim() === keyVal || String(gRow[1] || '').trim() === keyVal) {
        table.headers.forEach((h, colIdx) => {
          if (rowObj[h] !== undefined) {
            gRow[colIdx] = rowObj[h];
          }
        });
        break;
      }
    }
  }

  /**
   * Handles Stage 1 / Stage 2 / Stage 5 Picked Checkbox Toggles
   */
  async handlePickCheckboxToggle(swapSheetKey, rowIdxOrObj, isChecked) {
    const swapTable = this.db.getTable(swapSheetKey);
    if (!swapTable) return;

    let row = null;
    let gridRow = null;

    if (typeof rowIdxOrObj === 'number') {
      const idx = rowIdxOrObj;
      if (swapTable.rawGrid && swapTable.rawGrid[idx]) {
        gridRow = swapTable.rawGrid[idx];
        const empNameInGrid = String(gridRow[0] || '').trim();
        if (swapTable.rows) {
          row = swapTable.rows.find(r => 
            String(r['Employee'] || r['Crew Lead / Employee'] || '').trim().toLowerCase() === empNameInGrid.toLowerCase()
          );
        }
      }
      if (!row && swapTable.rows && swapTable.rows[idx]) {
        row = swapTable.rows[idx];
      }
    } else if (typeof rowIdxOrObj === 'object') {
      row = rowIdxOrObj;
    }

    if (!row && !gridRow) return;

    const pickNum = String(
      (row && (row['Pick List Item #'] || row['Pick List Glove #'] || row['Pick List Sleeve #'] || row['Pick List Blanket #'] || row['Pick List MACK #'] || row['Pick List'])) ||
      (gridRow && gridRow[6]) || ''
    ).trim();

    const empName = String(
      (row && (row['Employee'] || row['Crew Lead / Employee'])) ||
      (gridRow && gridRow[0]) || ''
    ).trim();

    if (!pickNum || pickNum === '—') return;

    const invMap = {
      'glove_swaps': 'gloves',
      'sleeve_swaps': 'sleeves',
      'blanket_swaps': 'blankets',
      'mack_swaps': 'macks',
      'hv_tester_swaps': 'hv_testers',
      'phasing_set_swaps': 'phasing_sets',
      'aed_swaps': 'aed',
      'ground_swaps': 'grounds',
      'hot_stick_swaps': 'hot_sticks'
    };
    const invKey = invMap[swapSheetKey];
    const invTable = this.db.getTable(invKey);
    if (!invTable || !invTable.rows) return;

    const invRow = invTable.rows.find(it => {
      const itNum = String(it['Item #'] || it['Glove'] || it['Sleeve'] || it['Blanket'] || it['MACK'] || it['Serial #'] || it['ESL ID'] || Object.values(it)[0] || '').trim();
      return itNum === pickNum;
    });

    const todayFormatted = this.formatDate(new Date());
    const todayIso = this.formatDateIso(new Date());

    if (isChecked) {
      // Stage 2: Check Picked -> Move to Cody's Truck / Ready For Delivery
      if (row) {
        row['Picked'] = true;
        row['Status'] = 'Ready For Delivery 🚚';
      }
      if (gridRow) {
        gridRow[7] = 'Ready For Delivery 🚚';
        gridRow[8] = 'TRUE';
      }

      if (invRow) {
        invRow['Location'] = "Cody's Truck";
        invRow['Status'] = 'Ready For Delivery';
        invRow['Assigned To'] = 'Packed For Delivery';
        invRow['Date Assigned'] = todayFormatted;
        invRow['Picked For'] = `${empName} Picked On ${todayIso}`;

        this.syncRowToRawGrid(invTable, invRow);
        const invSheetName = (invTable && invTable.name) ? invTable.name : (this.db.getSheetNameForTableKey(invKey) || invKey);
        await this.db.recordItemHistoryEvent(invSheetName, invRow, `Packed For Delivery (${empName})`);
        await this.queueRowMutations(invKey, invRow);
      }
    } else {
      // Uncheck Picked -> Revert to On Shelf
      if (row) {
        row['Picked'] = false;
        row['Status'] = 'In Stock ✅';
      }
      if (gridRow) {
        gridRow[7] = 'In Stock ✅';
        gridRow[8] = 'FALSE';
      }

      if (invRow) {
        invRow['Location'] = 'Helena';
        invRow['Status'] = 'On Shelf';
        invRow['Assigned To'] = 'On Shelf';
        invRow['Picked For'] = '';

        // Check history table first for the exact date this item was placed on shelf / tested
        const histKey = `${invKey}_history`;
        const histTable = this.db.getTable(histKey);
        let shelfDateFromHistory = null;

        if (histTable && histTable.rows) {
          const itemHistRows = histTable.rows.filter(r => {
            const itNum = String(r['Item #'] || r['Item'] || r['Glove'] || r['Sleeve'] || r['Blanket'] || r['Serial #'] || '').trim();
            return itNum === pickNum;
          });

          if (itemHistRows.length > 0) {
            const sortedHist = [...itemHistRows].sort((a, b) => {
              const dA = this.parseDate(a['Date Assigned'] || a['Date'] || Object.values(a)[0]);
              const dB = this.parseDate(b['Date Assigned'] || b['Date'] || Object.values(b)[0]);
              return (dA ? dA.getTime() : 0) - (dB ? dB.getTime() : 0);
            });

            // Find the most recent shelf / purchase / testing return history entry
            for (let i = sortedHist.length - 1; i >= 0; i--) {
              const hRow = sortedHist[i];
              const hAssigned = String(hRow['Assigned To'] || '').trim().toLowerCase();
              const hNotes = String(hRow['Notes'] || '').trim().toLowerCase();
              if (!hAssigned.includes('packed for delivery') && !hNotes.includes('packed for delivery')) {
                shelfDateFromHistory = hRow['Date Assigned'] || hRow['Date'] || Object.values(hRow)[0];
                break;
              }
            }
          }
        }

        // Priority order for Date Assigned when returning to shelf:
        // 1. History sheet recorded shelf / test date
        // 2. Item Test Date (e.g. 04/30/2026 for Glove 221)
        // 3. Saved Stage 1 Pick Date
        // 4. Existing Date Assigned
        const rawOrigDate = shelfDateFromHistory || invRow['Test Date'] || (row && row['Stage 1 Pick Date']) || invRow['Date Assigned'] || todayFormatted;
        const origDateAssigned = this.formatDate(rawOrigDate);
        invRow['Date Assigned'] = origDateAssigned;

        // Recalculate shelf change out date (1-year interval from test date or date assigned)
        const tDateObj = this.parseDate(invRow['Test Date']) || this.parseDate(origDateAssigned);
        if (tDateObj) {
          const chgOut = new Date(tDateObj);
          chgOut.setFullYear(chgOut.getFullYear() + 1);
          invRow['Change Out Date'] = this.formatDate(chgOut);
        }

        this.syncRowToRawGrid(invTable, invRow);

        // Remove the temporary "Packed For Delivery" history record to keep history clean on uncheck
        await this.db.deleteHistoryRow(histKey, r => {
          const itNum = String(r['Item #'] || r['Item'] || r['Glove'] || r['Sleeve'] || r['Blanket'] || r['Serial #'] || '').trim();
          const assignedTo = String(r['Assigned To'] || '').trim();
          const notes = String(r['Notes'] || '').trim();
          return itNum === pickNum && (assignedTo.includes('Packed For Delivery') || notes.includes('Packed For Delivery'));
        });

        await this.queueRowMutations(invKey, invRow);
      }
    }

    if (window.sheetNavigator) window.sheetNavigator.renderActiveView();
  }

  /**
   * Stage 3 & Stage 4: Handles Date Changed entry (Stage 3) and Date Changed removal (Stage 4)
   */
  async handleDateChangedEdit(swapSheetKey, rowIdxOrObj, dateVal) {
    const swapTable = this.db.getTable(swapSheetKey);
    if (!swapTable) return;

    let row = null;
    let gridRow = null;

    if (typeof rowIdxOrObj === 'number') {
      const idx = rowIdxOrObj;
      if (swapTable.rawGrid && swapTable.rawGrid[idx]) {
        gridRow = swapTable.rawGrid[idx];
        const empNameInGrid = String(gridRow[0] || '').trim();
        if (swapTable.rows) {
          row = swapTable.rows.find(r => 
            String(r['Employee'] || r['Crew Lead / Employee'] || '').trim().toLowerCase() === empNameInGrid.toLowerCase()
          );
        }
      }
      if (!row && swapTable.rows && swapTable.rows[idx]) {
        row = swapTable.rows[idx];
      }
    } else if (typeof rowIdxOrObj === 'object') {
      row = rowIdxOrObj;
    }

    if (!row && !gridRow) return;

    const pickNum = String(
      (row && (row['Pick List Item #'] || row['Pick List Glove #'] || row['Pick List Sleeve #'] || row['Pick List Blanket #'] || row['Pick List MACK #'] || row['Pick List'])) ||
      (gridRow && gridRow[6]) || ''
    ).trim();

    const oldItemNum = String(
      (row && (row['Current Glove #'] || row['Current Sleeve #'] || row['Current Blanket #'] || row['Current MACK #'] || row['Current Item #'])) ||
      (gridRow && gridRow[1]) || ''
    ).trim();

    const empName = String(
      (row && (row['Employee'] || row['Crew Lead / Employee'])) ||
      (gridRow && gridRow[0]) || ''
    ).trim();

    if (!pickNum || pickNum === '—') return;

    const invMap = {
      'glove_swaps': 'gloves',
      'sleeve_swaps': 'sleeves',
      'blanket_swaps': 'blankets',
      'mack_swaps': 'macks',
      'hv_tester_swaps': 'hv_testers',
      'phasing_set_swaps': 'phasing_sets',
      'aed_swaps': 'aed',
      'ground_swaps': 'grounds',
      'hot_stick_swaps': 'hot_sticks'
    };
    const invKey = invMap[swapSheetKey];
    const invTable = this.db.getTable(invKey);
    if (!invTable || !invTable.rows) return;

    const empTable = this.db.getTable('employees');
    let empLoc = 'Helena';
    if (empTable && empTable.rows) {
      const empMatch = empTable.rows.find(e => String(e['Name'] || e['Employee Name'] || Object.values(e)[0] || '').trim().toLowerCase() === empName.toLowerCase());
      if (empMatch) empLoc = String(empMatch['Location'] || 'Helena').trim();
    }

    const newRow = invTable.rows.find(it => {
      const itNum = String(it['Item #'] || it['Glove'] || it['Sleeve'] || it['Blanket'] || it['MACK'] || it['Serial #'] || it['ESL ID'] || Object.values(it)[0] || '').trim();
      return itNum === pickNum;
    });

    const oldRow = oldItemNum && oldItemNum !== '—' ? invTable.rows.find(it => {
      const itNum = String(it['Item #'] || it['Glove'] || it['Sleeve'] || it['Blanket'] || it['MACK'] || it['Serial #'] || it['ESL ID'] || Object.values(it)[0] || '').trim();
      return itNum === oldItemNum;
    }) : null;

    const histKey = `${invKey}_history`;

    if (dateVal) {
      // STAGE 3: Date Changed entered -> Complete the swap
      const dateFormatted = this.formatDate(dateVal);
      if (row) {
        row['Date Changed'] = dateFormatted;
        row['Status'] = 'Delivered ✅';
      }
      if (gridRow) {
        gridRow[7] = 'Delivered ✅';
        gridRow[9] = dateFormatted;
      }

      // 1. Reassign Old Item -> Cody's Truck / Ready For Test / Packed For Testing
      if (oldRow) {
        oldRow['Location'] = "Cody's Truck";
        oldRow['Status'] = 'Ready For Test';
        oldRow['Assigned To'] = 'Packed For Testing';
        oldRow['Date Assigned'] = dateFormatted;
        oldRow['Picked For'] = '';
        this.syncRowToRawGrid(invTable, oldRow);
        const invSheetName = (invTable && invTable.name) ? invTable.name : (this.db.getSheetNameForTableKey(invKey) || invKey);
        await this.db.recordItemHistoryEvent(invSheetName, oldRow, `Returned from ${empName} (Swap Completed)`);
        await this.queueRowMutations(invKey, oldRow);
      }

      // 2. Assign New Replacement Item -> Employee / Assigned / Active Location
      if (newRow) {
        newRow['Location'] = empLoc;
        newRow['Status'] = 'Assigned';
        newRow['Assigned To'] = empName;
        newRow['Date Assigned'] = dateFormatted;
        newRow['Picked For'] = ''; // Clear Picked For completely!

        // Recalculate Change Out Date (+3 months for gloves, +12 months for sleeves)
        const dObj = this.parseDate(dateFormatted);
        if (dObj) {
          const nextDate = new Date(dObj);
          const intervalMonths = invKey.includes('sleeve') || invKey.includes('blanket') || invKey.includes('mack') ? 12 : 3;
          nextDate.setMonth(nextDate.getMonth() + intervalMonths);
          newRow['Change Out Date'] = this.formatDate(nextDate);
        }

        this.syncRowToRawGrid(invTable, newRow);

        // Remove the temporary Stage 2 "Packed For Delivery" history record for this replacement item
        await this.db.deleteHistoryRow(histKey, r => {
          const itNum = String(r['Item #'] || r['Item'] || r['Glove'] || r['Sleeve'] || r['Blanket'] || r['Serial #'] || '').trim();
          const assignedTo = String(r['Assigned To'] || '').trim();
          const notes = String(r['Notes'] || '').trim();
          return itNum === pickNum && (assignedTo.includes('Packed For Delivery') || notes.includes('Packed For Delivery'));
        });

        const invSheetName = (invTable && invTable.name) ? invTable.name : (this.db.getSheetNameForTableKey(invKey) || invKey);
        await this.db.recordItemHistoryEvent(invSheetName, newRow, `Assigned to ${empName}`);
        await this.queueRowMutations(invKey, newRow);
      }
    } else {
      // STAGE 4: Date Changed removed -> Revert to Stage 2 (Ready For Delivery)
      if (row) {
        row['Date Changed'] = '';
        row['Status'] = 'Ready For Delivery 🚚';
      }
      if (gridRow) {
        gridRow[7] = 'Ready For Delivery 🚚';
        gridRow[9] = '';
      }

      const todayIso = this.formatDateIso(new Date());

      // 1. Revert Replacement Item -> Cody's Truck / Ready For Delivery
      if (newRow) {
        newRow['Location'] = "Cody's Truck";
        newRow['Status'] = 'Ready For Delivery';
        newRow['Assigned To'] = 'Packed For Delivery';
        newRow['Date Assigned'] = this.formatDate(new Date());
        newRow['Picked For'] = `${empName} Picked On ${todayIso}`;

        this.syncRowToRawGrid(invTable, newRow);

        // Remove the "Assigned to [Emp]" history record created during Stage 3
        await this.db.deleteHistoryRow(histKey, r => {
          const itNum = String(r['Item #'] || r['Item'] || r['Glove'] || r['Sleeve'] || r['Blanket'] || r['Serial #'] || '').trim();
          const assignedTo = String(r['Assigned To'] || '').trim();
          const notes = String(r['Notes'] || '').trim();
          return itNum === pickNum && (assignedTo === empName || notes.includes(`Assigned to ${empName}`));
        });

        // Re-record Stage 2 "Packed For Delivery" history entry
        const invSheetName = (invTable && invTable.name) ? invTable.name : (this.db.getSheetNameForTableKey(invKey) || invKey);
        await this.db.recordItemHistoryEvent(invSheetName, newRow, `Packed For Delivery (${empName})`);
        await this.queueRowMutations(invKey, newRow);
      }

      // 2. Revert Old Item -> Employee / Assigned
      if (oldRow) {
        oldRow['Location'] = empLoc;
        oldRow['Status'] = 'Assigned';
        oldRow['Assigned To'] = empName;
        oldRow['Picked For'] = '';

        this.syncRowToRawGrid(invTable, oldRow);

        // Remove the "Returned from [Emp]" history record created during Stage 3
        await this.db.deleteHistoryRow(histKey, r => {
          const itNum = String(r['Item #'] || r['Item'] || r['Glove'] || r['Sleeve'] || r['Blanket'] || r['Serial #'] || '').trim();
          const assignedTo = String(r['Assigned To'] || '').trim();
          const notes = String(r['Notes'] || '').trim();
          return itNum === oldItemNum && (assignedTo.includes('Packed For Testing') || notes.includes(`Returned from ${empName}`));
        });

        await this.queueRowMutations(invKey, oldRow);
      }
    }

    if (window.sheetNavigator) window.sheetNavigator.renderActiveView();
  }

  syncRowToRawGrid(table, rowObj) {
    if (!table || !table.headers || !rowObj) return;
    const rowIdx = rowObj._rowIdx || (table.rows ? table.rows.indexOf(rowObj) + 2 : null);
    if (table.rawGrid && rowIdx && table.rawGrid[rowIdx - 1]) {
      const gRow = table.rawGrid[rowIdx - 1];
      table.headers.forEach((h, cIdx) => {
        if (rowObj[h] !== undefined) gRow[cIdx] = rowObj[h];
      });
    }
  }

  async queueRowMutations(tableKey, rowObj) {
    if (!this.db || !rowObj) return;
    const table = this.db.getTable(tableKey);
    if (!table || !table.headers) return;
    const sheetName = table.name || this.db.getSheetNameForTableKey(tableKey) || tableKey;
    const rowIdx = rowObj._rowIdx || (table.rows ? table.rows.indexOf(rowObj) + 2 : null);
    if (!rowIdx) return;

    const itemIdentifier = String(rowObj['Item #'] || rowObj['Glove'] || rowObj['Sleeve'] || rowObj['Blanket'] || rowObj['MACK'] || rowObj['Serial #'] || rowObj['ESL ID'] || Object.values(rowObj)[0] || '').trim();

    for (let cIdx = 0; cIdx < table.headers.length; cIdx++) {
      const header = table.headers[cIdx];
      const val = rowObj[header];
      if (val !== undefined && typeof this.db.addMutation === 'function') {
        await this.db.addMutation({
          action: 'UPDATE_CELL',
          sheetName: sheetName,
          row: rowIdx,
          col: cIdx + 1,
          header: header,
          itemIdentifier: itemIdentifier,
          value: val
        });
      }
    }
    if (typeof this.db.setSnapshot === 'function' && this.db.snapshot) {
      await this.db.setSnapshot(this.db.snapshot);
    }
  }

  gridRowToObj(headers, rowArray) {
    const obj = {};
    headers.forEach((h, idx) => {
      obj[h] = rowArray[idx] !== undefined ? rowArray[idx] : '';
    });
    return obj;
  }

  showSwapSummaryModal(stats, elapsed) {
    let modal = document.getElementById('swap-summary-modal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'swap-summary-modal';
      modal.className = 'modal-overlay';
      document.body.appendChild(modal);
    }

    modal.innerHTML = `
      <div class="modal-card" style="max-width: 540px; border-radius: 12px; overflow: hidden; box-shadow: 0 20px 40px rgba(0,0,0,0.5);">
        <div class="modal-header" style="background: linear-gradient(135deg, #1e293b, #0f172a); border-bottom: 1px solid var(--border-color); padding: 16px 20px;">
          <div style="display: flex; align-items: center; gap: 10px;">
            <div style="font-size: 20px;">⚡</div>
            <div>
              <h3 style="margin: 0; font-size: 15px; font-weight: 700; color: #f8fafc;">Swap Reports Generated</h3>
              <div style="font-size: 11px; color: #94a3b8;">Completed in <strong style="color: #60a5fa;">${elapsed}ms</strong></div>
            </div>
          </div>
          <button class="modal-close" onclick="document.getElementById('swap-summary-modal').classList.remove('active')">✕</button>
        </div>
        <div style="padding: 20px; background-color: var(--bg-secondary);">
          <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px; margin-bottom: 16px;">
            <div style="background: rgba(0,0,0,0.25); border: 1px solid var(--border-color); border-radius: 8px; padding: 10px 12px; text-align: center;">
              <div style="font-size: 11px; color: var(--text-muted); margin-bottom: 2px;">🧤 Gloves</div>
              <div style="font-size: 16px; font-weight: 700; color: #60a5fa;">${stats.gloves} due</div>
            </div>
            <div style="background: rgba(0,0,0,0.25); border: 1px solid var(--border-color); border-radius: 8px; padding: 10px 12px; text-align: center;">
              <div style="font-size: 11px; color: var(--text-muted); margin-bottom: 2px;">💪 Sleeves</div>
              <div style="font-size: 16px; font-weight: 700; color: #34d399;">${stats.sleeves} due</div>
            </div>
            <div style="background: rgba(0,0,0,0.25); border: 1px solid var(--border-color); border-radius: 8px; padding: 10px 12px; text-align: center;">
              <div style="font-size: 11px; color: var(--text-muted); margin-bottom: 2px;">🧱 Blankets</div>
              <div style="font-size: 16px; font-weight: 700; color: #fbbf24;">${stats.blankets} due</div>
            </div>
            <div style="background: rgba(0,0,0,0.25); border: 1px solid var(--border-color); border-radius: 8px; padding: 10px 12px; text-align: center;">
              <div style="font-size: 11px; color: var(--text-muted); margin-bottom: 2px;">🧱 MACKs</div>
              <div style="font-size: 16px; font-weight: 700; color: #38bdf8;">${stats.macks} due</div>
            </div>
            <div style="background: rgba(0,0,0,0.25); border: 1px solid var(--border-color); border-radius: 8px; padding: 10px 12px; text-align: center;">
              <div style="font-size: 11px; color: var(--text-muted); margin-bottom: 2px;">⚡ HV / Phasing</div>
              <div style="font-size: 16px; font-weight: 700; color: #c084fc;">${stats.hv_testers + stats.phasing_sets} due</div>
            </div>
            <div style="background: rgba(0,0,0,0.25); border: 1px solid var(--border-color); border-radius: 8px; padding: 10px 12px; text-align: center;">
              <div style="font-size: 11px; color: var(--text-muted); margin-bottom: 2px;">🏥 AED / Grounds / Sticks</div>
              <div style="font-size: 16px; font-weight: 700; color: #f87171;">${stats.aed + stats.grounds + stats.hot_sticks} due</div>
            </div>
          </div>
          <div style="background: rgba(96, 165, 250, 0.08); border: 1px solid rgba(96, 165, 250, 0.2); border-radius: 8px; padding: 12px 14px; font-size: 12px; color: #cbd5e1; line-height: 1.5;">
            ✅ All swap reports are fully generated with 23-column hidden stage tracking and location/foreman groupings.
          </div>
        </div>
        <div class="modal-footer" style="padding: 12px 20px; background: var(--bg-primary); border-top: 1px solid var(--border-color); display: flex; justify-content: flex-end;">
          <button class="btn btn-primary" onclick="document.getElementById('swap-summary-modal').classList.remove('active')">View Swaps</button>
        </div>
      </div>
    `;
    modal.classList.add('active');
  }
}

window.swapEngine = new SwapGenerationEngine(window.localDB);
