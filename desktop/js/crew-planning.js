/**
 * crew-planning.js - Multi-Week Crew Structure Planning & Historical Roster Archive
 * 
 * Features:
 * - Multi-week lookahead planning (Next Week, +2 Weeks, +3 Weeks)
 * - Collapsible Staging Side Pane (Planning Pool, Scheduled Vacation, Quit/Notice, Weeds, Light Duty, Pending Hires)
 * - Two-way Drag & Drop between Crew Cards and Side Pane sections (with Alt/Ctrl+Drag duplicate support)
 * - Employee duplication (allowing members to exist in multiple locations until planning is finalized)
 * - Dynamic conditional styling:
 *     • Purple: Moved from original crew/position or present in multiple locations
 *     • Reverts to normal if returned to original position (and single location)
 *     • Yellow: Confirmed new position(s) by the planner
 * - Gated Publishing with dedicated Purple Unconfirmed popup blocker
 * - Yellow conditional styling persistence on live crew cards after publish
 * - Historical weekly roster snapshot archive & past week reference view
 * - Automated import of all date tabs from historical Excel workbooks into the archive
 */

class CrewPlanningEngine {
  constructor(db) {
    this._db = db;
    this.selectedWeek = null; // e.g. "11/08/2026"
    this.isSidebarCollapsed = false;
    this.searchTerm = '';
    this.activeSidePaneFilter = 'all';
    this.cachedPlans = null;
    this.cachedHistory = null;
    
    try {
      this.isSidebarCollapsed = localStorage.getItem('safety_assistant_planning_sidebar_collapsed') === 'true';
    } catch {
      this.isSidebarCollapsed = false;
    }

    window.crewPlanningEngine = this;
  }

  get db() {
    return this._db || window.localDB || window.db;
  }

  set db(val) {
    this._db = val;
  }

  // ==========================================================================
  // Date Helpers (Sunday Anchor, matching Safety Compliance)
  // ==========================================================================

  getSundayOfDate(d = new Date()) {
    const copy = new Date(d);
    if (isNaN(copy.getTime())) return new Date();
    const day = copy.getDay(); // 0 is Sunday
    copy.setDate(copy.getDate() - day);
    copy.setHours(12, 0, 0, 0);
    return copy;
  }

  formatDate(d) {
    if (!d || isNaN(d.getTime())) return '';
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const y = d.getFullYear();
    return `${m}/${day}/${y}`;
  }

  formatIso(d) {
    if (!d || isNaN(d.getTime())) return '';
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const y = d.getFullYear();
    return `${y}-${m}-${day}`;
  }

  parseDate(str) {
    if (!str) return null;
    const s = String(str).trim();
    const parts = s.split(/[-/]/);
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
        if (y < 100) y += 2000;
      }
      const dt = new Date(y, m, d, 12, 0, 0);
      return isNaN(dt.getTime()) ? null : dt;
    }
    const parsed = new Date(s);
    return isNaN(parsed.getTime()) ? null : parsed;
  }

  getCurrentWeekSundayStr() {
    return this.formatDate(this.getSundayOfDate(new Date()));
  }

  isWeekPublished(weekStr) {
    if (!weekStr) return false;
    const plans = this.getPlansMap();
    const hist = this.getHistoryMap();
    return Boolean(
      (plans[weekStr] && plans[weekStr].status === 'published') ||
      (hist[weekStr] && hist[weekStr].publishedAt)
    );
  }

  getDefaultPlanningWeekStr() {
    const currentWeekStr = this.getCurrentWeekSundayStr();
    if (!this.isWeekPublished(currentWeekStr)) {
      return currentWeekStr;
    }
    const pWeeks = this.getPlanningWeeks();
    return pWeeks.length > 0 ? pWeeks[0].weekStr : currentWeekStr;
  }

  selectPlanningWeek(weekStr) {
    if (!weekStr) return;
    this.selectedWeek = weekStr;
    if (window.sheetNavigator) {
      window.sheetNavigator.selectedEmployeeWeek = weekStr;
      window.sheetNavigator.employeeViewMode = 'planning';
      window.sheetNavigator.updateEmployeeViewToggleUI();
      window.sheetNavigator.updateEmployeeWeekNavUI();
      window.sheetNavigator.renderCurrentSheet();
    } else {
      this.refreshView();
    }
  }

  getPlanningWeeks() {
    const currentSunday = this.getSundayOfDate(new Date());
    const weeks = [];
    for (let i = 1; i <= 3; i++) {
      const dt = new Date(currentSunday.getTime() + (i * 7 * 86400000));
      weeks.push({
        weekStr: this.formatDate(dt),
        label: i === 1 ? 'Planning +1 (Next Week)' : `Planning +${i} (${i} Weeks Out)`,
        dateObj: dt,
        offset: i
      });
    }
    return weeks;
  }

  getAllHistoricalWeeks() {
    const historyMap = this.getHistoryMap();
    const weekSet = new Set(Object.keys(historyMap));

    // Also collect weeks from safety_compliance table
    const scTable = this.db ? this.db.getTable('safety_compliance') : null;
    if (scTable && scTable.rows) {
      scTable.rows.forEach(r => {
        const w = String(r['Week Start'] || r['Week'] || '').trim();
        if (w) weekSet.add(w);
      });
    }

    const currentWeekStr = this.getCurrentWeekSundayStr();
    const currentWeekDt = this.parseDate(currentWeekStr);

    const sorted = Array.from(weekSet).filter(w => {
      const dt = this.parseDate(w);
      // Historical weeks are strictly prior to the current week
      return dt && currentWeekDt && dt.getTime() < currentWeekDt.getTime();
    }).sort((a, b) => {
      const da = this.parseDate(a)?.getTime() || 0;
      const db = this.parseDate(b)?.getTime() || 0;
      return db - da;
    });

    return sorted;
  }

  getAllNavigableWeeks() {
    const planning = this.getPlanningWeeks().map(p => ({
      weekStr: p.weekStr,
      label: p.offset === 1 ? `Week of ${p.weekStr} (Next Wk)` : `Week of ${p.weekStr} (+${p.offset} Wks)`,
      type: 'planning',
      offset: p.offset
    })).reverse(); // Farther out first, Next Week closest to Current

    const currentStr = this.getCurrentWeekSundayStr();
    const isCurPub = this.isWeekPublished(currentStr);
    const current = [{
      weekStr: currentStr,
      label: isCurPub ? `Week of ${currentStr} (Current Wk — Live)` : `Week of ${currentStr} (Current Wk — Unpublished)`,
      type: 'current',
      offset: 0
    }];

    const historical = this.getAllHistoricalWeeks().map(w => ({
      weekStr: w,
      label: `Week of ${w}`,
      type: 'historical',
      offset: -1
    }));

    return [...planning, ...current, ...historical];
  }

  // ==========================================================================
  // Baseline Original Position & Status Tracking (Purple / Yellow / Normal)
  // ==========================================================================

  /**
   * Checks if a string represents an equipment status / non-employee value
   * (e.g. "In Testing", "Packed for Testing", "Not Repairable", "On Shelf", "Failed Rubber", "Lost").
   */
  isNonEmployeeName(name) {
    if (!name) return true;
    const str = String(name).trim().toLowerCase();
    if (!str || str === 'n/a' || str === 'none' || str === 'unknown' || str === 'null' || str === 'undefined' || str === '-' || str === '—') {
      return true;
    }

    const nonEmpList = [
      'lost',
      'on shelf',
      'not repairable',
      'in testing',
      'packed for testing',
      'packed for delivery',
      'ready for test',
      'ready for testing',
      'ready for delivery',
      'destroyed',
      'failed rubber',
      'reclaimed',
      'previous employee',
      'unassigned',
      'blank',
      'spare',
      'storage',
      'shop stock',
      'in stock',
      'damaged',
      'scrapped',
      'retired',
      'missing',
      'out for repair',
      'calibration',
      'sent to lab',
      'lab testing',
      'testing'
    ];

    if (nonEmpList.includes(str)) return true;
    if (nonEmpList.some(item => str === item || str.startsWith(item + ' ') || str.endsWith(' ' + item))) return true;

    return false;
  }

  /**
   * Resolves the company discipline / crew type for a given job.
   * Standard company disciplines: Electric, Substation, Gas, Office, Mechanic (plus Civil, Telecom).
   */
  detectCrewType(jobNum = '', jobName = '', loc = '', explicitType = '') {
    const t = String(explicitType || '').trim();
    const jn = String(jobNum || '').trim();
    const jnLower = String(jobName || '').toLowerCase();
    const locLower = String(loc || '').toLowerCase();

    // If an explicit type is already provided, ALWAYS respect the explicit choice!
    if (t) {
      return t;
    }

    // 005-XX and office keywords are strictly Office discipline per company standards
    if (jn.startsWith('005') || jnLower.includes('office') || jnLower.includes('management') || jnLower.includes('admin') || locLower === 'office') {
      return 'Office';
    }

    if (jnLower.includes('substation') || jnLower.includes('sub-station') || jnLower.includes('sub station') || jn.startsWith('007')) {
      return 'Substation';
    } else if (jnLower.includes('gas') || jn.startsWith('008')) {
      return 'Gas';
    } else if (jnLower.includes('mechanic') || jnLower.includes('shop') || jnLower.includes('garage') || jnLower.includes('fleet') || jn.startsWith('001')) {
      return 'Mechanic';
    } else if (jnLower.includes('civil')) {
      return 'Civil';
    } else if (jnLower.includes('telecom') || jnLower.includes('ziply')) {
      return 'Telecom';
    }

    return 'Electric';
  }

  /**
   * Returns display info (badge color, icon, styling) for a given crew discipline / crew type.
   */
  getCrewTypeInfo(typeStr) {
    const t = String(typeStr || '').trim();
    if (t === 'Substation') {
      return { icon: '🏗️', name: 'Substation', color: '#c084fc', bg: 'rgba(168, 85, 247, 0.15)', border: 'rgba(168, 85, 247, 0.35)' };
    } else if (t === 'Gas') {
      return { icon: '⛽', name: 'Gas', color: '#fbbf24', bg: 'rgba(245, 158, 11, 0.15)', border: 'rgba(245, 158, 11, 0.35)' };
    } else if (t === 'Office') {
      return { icon: '🏢', name: 'Office', color: '#34d399', bg: 'rgba(16, 185, 129, 0.15)', border: 'rgba(16, 185, 129, 0.35)' };
    } else if (t === 'Mechanic') {
      return { icon: '🔧', name: 'Mechanic', color: '#94a3b8', bg: 'rgba(148, 163, 184, 0.2)', border: 'rgba(148, 163, 184, 0.35)' };
    } else if (t === 'Civil') {
      return { icon: '🚧', name: 'Civil', color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.15)', border: 'rgba(245, 158, 11, 0.35)' };
    } else if (t === 'Telecom') {
      return { icon: '📡', name: 'Telecom', color: '#38bdf8', bg: 'rgba(56, 189, 248, 0.15)', border: 'rgba(56, 189, 248, 0.35)' };
    }
    return { icon: '⚡', name: 'Electric', color: '#60a5fa', bg: 'rgba(59, 130, 246, 0.15)', border: 'rgba(59, 130, 246, 0.35)' };
  }

  /**
   * Reads current active live employees to build a baseline map of original positions.
   * Returns Map: normName -> { name, originalBaseJob, originalSlot, originalCategory, originalLocation, rawRow }
   */
  getOriginalEmployeeLocations() {
    const empTable = this.db ? this.db.getTable('employees') : null;
    const empRows = (empTable && empTable.rows) || [];
    const map = new Map();

    empRows.forEach(r => {
      const name = String(r['Employee Name'] || r['Name'] || Object.values(r)[0] || '').trim();
      if (!name || this.isNonEmployeeName(name)) return;
      const norm = name.toLowerCase();
      const job = String(r['Job Number'] || r['Job #'] || '').trim();
      const baseJob = job.replace(/\.\d+.*$/, '').trim();
      const secJob = String(r['Secondary Job Number'] || r['Secondary Job #'] || '').trim();
      const secBaseJob = secJob.replace(/\.\d+.*$/, '').trim();
      const loc = String(r['Location'] || '').trim();
      const locLower = loc.toLowerCase();
      const statLower = String(r['Status'] || '').toLowerCase().trim();

      const isVacation = statLower === 'vacation' || locLower.includes('(vacation)') || locLower === 'vacation' || job.toLowerCase() === 'vacation';
      const isLeave = !isVacation && (statLower === 'leave' || locLower.includes('(leave)') || locLower === 'leave' || job.toLowerCase() === 'leave');
      const isWeeds = !isVacation && !isLeave && (locLower.includes('(weeds)') || locLower === 'weeds' || statLower === 'weeds' || job.toLowerCase() === 'weeds');
      const isLightDuty = !isVacation && !isLeave && !isWeeds && (locLower.includes('(light duty)') || locLower === 'light duty' || statLower === 'light duty' || job.toLowerCase() === 'light duty');

      let category = null;
      if (isVacation || isLeave) category = 'vacation';
      else if (isWeeds) category = 'weeds';
      else if (isLightDuty) category = 'lightDuty';
      else if (!job || job.toLowerCase() === 'unassigned') category = 'planning';

      map.set(norm, {
        name,
        originalBaseJob: category ? null : (baseJob || null),
        originalSlot: job || null,
        secondaryBaseJob: secBaseJob || null,
        secondarySlot: secJob || null,
        originalCategory: category, // 'vacation', 'weeds', 'lightDuty', 'planning', or null if in active field crew
        originalLocation: loc,
        rawRow: r
      });
    });

    return map;
  }

  /**
   * Scans a plan to index every place an employee appears across all crews and side pane categories.
   * Returns Map: normName -> Array<{ type: 'crew'|'side', baseJob, slot, sideType, memberObj, location }>
   */
  getEmployeeOccurrencesMap(plan) {
    if (!plan) return new Map();
    const occMap = new Map();

    const registerOcc = (empName, occ) => {
      if (!empName || this.isNonEmployeeName(empName)) return;
      const norm = empName.toLowerCase().trim();
      if (!occMap.has(norm)) occMap.set(norm, []);
      occMap.get(norm).push(occ);
    };

    // 1. Crew members
    (plan.crews || []).forEach(crew => {
      (crew.members || []).forEach(m => {
        registerOcc(m.name, {
          type: 'crew',
          baseJob: crew.jobNumber,
          slot: m.slot || crew.jobNumber,
          memberObj: m,
          location: crew.location || 'Helena'
        });
      });
    });

    // 2. Side pane categories
    const sp = plan.sidePane || {};
    const catKeys = ['planning', 'vacation', 'quit', 'weeds', 'lightDuty', 'pendingHires'];
    catKeys.forEach(catKey => {
      (sp[catKey] || []).forEach(item => {
        // Exclude mirror scheduled departure records from counting as an extra/duplicate working location
        if (catKey === 'quit' && item.isScheduledDeparture) {
          return;
        }
        // Exclude mirror future/partial-week vacation records when the employee remains active on their crew
        if (catKey === 'vacation' && (item.isFutureVacation || item.keepOnCrew)) {
          return;
        }
        registerOcc(item.name, {
          type: 'side',
          sideType: catKey,
          memberObj: item,
          location: item.location || ''
        });
      });
    });

    return occMap;
  }

  /**
   * Helper: checks if an employee name matches a crew's designated foreman.
   * Resolves nicknames and alternate names (e.g. Benjamin Lapka <-> Ben Lapka).
   */
  isCrewForeman(crew, empName) {
    if (!crew || !crew.foreman || !empName) return false;
    const f = String(crew.foreman).trim().toLowerCase();
    const n = String(empName).trim().toLowerCase();
    if (f === n) return true;

    // Check alternate names from employees table or baseline
    const empTable = this.db ? this.db.getTable('employees') : null;
    const rows = empTable?.rows || [];

    // 1. Direct match on empName row's Alternate Names
    const empRow = rows.find(r => String(r['Employee Name'] || r['Name'] || '').trim().toLowerCase() === n);
    if (empRow && empRow['Alternate Names']) {
      const alts = String(empRow['Alternate Names']).split(/[|,;]/).map(s => s.trim().toLowerCase()).filter(Boolean);
      if (alts.includes(f)) return true;
    }

    // 2. Direct match on crew.foreman row's Alternate Names
    const fRow = rows.find(r => String(r['Employee Name'] || r['Name'] || '').trim().toLowerCase() === f);
    if (fRow) {
      const canonicalF = String(fRow['Employee Name'] || fRow['Name'] || '').trim().toLowerCase();
      if (canonicalF === n) return true;
      if (fRow['Alternate Names']) {
        const alts = String(fRow['Alternate Names']).split(/[|,;]/).map(s => s.trim().toLowerCase()).filter(Boolean);
        if (alts.includes(n)) return true;
      }
    }

    // 3. Common nickname patterns (e.g. Benjamin <-> Ben, Matthew <-> Matt)
    const nicknames = [
      ['benjamin', 'ben'],
      ['matthew', 'matt'],
      ['michael', 'mike'],
      ['william', 'bill', 'billy', 'will'],
      ['robert', 'bob', 'bobby', 'rob'],
      ['james', 'jim', 'jimmy'],
      ['joseph', 'joe', 'joey'],
      ['christopher', 'chris'],
      ['daniel', 'dan', 'danny'],
      ['alexander', 'alex'],
      ['anthony', 'tony'],
      ['andrew', 'andy', 'drew'],
      ['nicholas', 'nick'],
      ['joshua', 'josh'],
      ['samuel', 'sam', 'sammy'],
      ['timothy', 'tim'],
      ['thomas', 'tom', 'tommy'],
      ['jonathan', 'jon'],
      ['steven', 'stephen', 'steve'],
      ['charles', 'charlie', 'chuck'],
      ['edward', 'ed', 'eddie'],
      ['richard', 'rick', 'rich', 'dick'],
      ['kenneth', 'ken', 'kenny'],
      ['zachary', 'zach', 'zack'],
      ['nathaniel', 'nathan', 'nate']
    ];
    for (const group of nicknames) {
      const fInGroup = group.some(nick => f.startsWith(nick + ' ') || f === nick);
      const nInGroup = group.some(nick => n.startsWith(nick + ' ') || n === nick);
      if (fInGroup && nInGroup) {
        const fParts = f.split(/\s+/);
        const nParts = n.split(/\s+/);
        if (fParts.length > 1 && nParts.length > 1 && fParts[fParts.length - 1] === nParts[nParts.length - 1]) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Computes the conditional status of an employee in a specific position within the plan:
   * - Purple: Moved from original crew/position or present in multiple locations (unconfirmed)
   * - Yellow: Moved or multi-location AND confirmed by user
   * - Normal: Single location matching their original baseline position (no conditional color)
   */
  getEmployeePlanningStatus(empName, currentBaseJob, currentSideType, plan, baselineMap, occMap) {
    if (!empName || this.isNonEmployeeName(empName)) {
      return {
        statusColor: 'normal',
        isMoved: false,
        isMultiLocation: false,
        isConfirmed: false,
        badgeText: '',
        title: '',
        reason: 'non-employee',
        originalLabel: '',
        currentLabel: '',
        occurrencesCount: 0
      };
    }

    if (!baselineMap) baselineMap = this.getOriginalEmployeeLocations();
    if (!occMap) occMap = this.getEmployeeOccurrencesMap(plan);

    const norm = String(empName || '').toLowerCase().trim();
    const occurrences = occMap.get(norm) || [];
    const occurrencesCount = occurrences.length;
    const isMultiLocation = occurrencesCount > 1;

    const base = baselineMap.get(norm);
    let isMoved = false;
    let originalLabel = '';
    let currentLabel = currentBaseJob ? `Crew ${currentBaseJob}` : (currentSideType ? `Staging (${currentSideType})` : 'Staging');

    if (!base) {
      // New employee / pending hire not yet in live database
      isMoved = true;
      originalLabel = 'New Hire / External';
    } else if (currentSideType) {
      // Placed in side pane category
      if (base.originalCategory !== currentSideType) {
        isMoved = true;
        originalLabel = base.originalBaseJob ? `Crew ${base.originalBaseJob}` : (base.originalCategory ? `Staging (${base.originalCategory})` : 'Unassigned');
      } else {
        originalLabel = `Staging (${base.originalCategory})`;
      }
    } else if (currentBaseJob) {
      // Placed in a field crew
      if (base.originalCategory) {
        isMoved = true;
        originalLabel = `Staging (${base.originalCategory})`;
      } else if (!base.originalBaseJob || base.originalBaseJob.toLowerCase() !== currentBaseJob.toLowerCase()) {
        isMoved = true;
        originalLabel = base.originalBaseJob ? `Crew ${base.originalBaseJob}` : 'Unassigned';
      } else if (base.secondaryBaseJob && !occurrences.some(o => o.baseJob && o.baseJob.toLowerCase() === base.secondaryBaseJob.toLowerCase())) {
        // Employee previously had a secondary crew assignment on live that has been removed/dropped in this plan
        isMoved = true;
        originalLabel = `Crew ${base.originalBaseJob} & ${base.secondaryBaseJob}`;
      } else {
        originalLabel = `Crew ${base.originalBaseJob}`;
      }
    }

    // Check confirmation state on the member object or in plan.confirmedPositions
    const currentOcc = occurrences.find(o => {
      if (currentBaseJob && o.baseJob && o.baseJob.toLowerCase() === currentBaseJob.toLowerCase()) return true;
      if (currentSideType && o.sideType && o.sideType.toLowerCase() === currentSideType.toLowerCase()) return true;
      return false;
    });
    const memberObj = currentOcc?.memberObj;

    const confirmKey = currentBaseJob ? `${norm}::${currentBaseJob.toLowerCase()}` : `${norm}::${(currentSideType || '').toLowerCase()}`;
    let explicitConfirmVal = undefined;
    if (plan.confirmedPositions) {
      if (plan.confirmedPositions[confirmKey] !== undefined) {
        explicitConfirmVal = plan.confirmedPositions[confirmKey];
      } else if (plan.confirmedPositions[norm] !== undefined) {
        explicitConfirmVal = plan.confirmedPositions[norm];
      }
    }

    const isConfirmed = explicitConfirmVal !== undefined
      ? Boolean(explicitConfirmVal)
      : Boolean(memberObj?.isConfirmed);

    // Conditional styling evaluation:
    // 1. If not multi-location and not moved: NORMAL (conditional coloring removed)
    // 2. If moved or multi-location:
    //    - If confirmed: YELLOW
    //    - If unconfirmed: PURPLE
    let statusColor = 'normal';
    let badgeText = '';
    let title = '';

    if (isMultiLocation) {
      if (isConfirmed) {
        statusColor = 'yellow';
        badgeText = `Multi (${occurrencesCount})`;
        title = `Confirmed in ${occurrencesCount} locations: ${occurrences.map(o => o.baseJob ? `Crew ${o.baseJob}` : o.sideType).join(', ')}`;
      } else {
        statusColor = 'purple';
        badgeText = `Multi (${occurrencesCount})`;
        title = `Assigned to ${occurrencesCount} locations (${occurrences.map(o => o.baseJob ? `Crew ${o.baseJob}` : o.sideType).join(', ')}). Click to confirm position`;
      }
    } else if (isMoved) {
      if (isConfirmed) {
        statusColor = 'yellow';
        badgeText = 'Confirmed Move';
        title = `Confirmed move from ${originalLabel} to ${currentLabel}`;
      } else {
        statusColor = 'purple';
        badgeText = 'Moved';
        title = `Moved from ${originalLabel} to ${currentLabel}. Click to confirm position`;
      }
    } else if (explicitConfirmVal !== undefined) {
      // User explicitly confirmed or unconfirmed this employee
      if (isConfirmed) {
        statusColor = 'yellow';
        badgeText = 'Confirmed';
        title = `Confirmed position in ${currentLabel}`;
      } else {
        statusColor = 'purple';
        badgeText = 'Unconfirmed';
        title = `Unconfirmed position in ${currentLabel}. Click to confirm position`;
      }
    }

    return {
      name: empName,
      normName: norm,
      occurrencesCount,
      isMultiLocation,
      isMoved,
      isConfirmed,
      statusColor, // 'normal' | 'purple' | 'yellow'
      badgeText,
      title,
      originalLabel,
      currentLabel,
      occurrences,
      memberObj
    };
  }

  // ==========================================================================
  // Plan Draft Data Storage & Management
  // ==========================================================================

  getPlansMap() {
    if (!this.db || !this.db.snapshot) return {};
    if (!this.db.snapshot.configs) this.db.snapshot.configs = {};
    if (!this.db.snapshot.configs.crew_structure_plans) {
      this.db.snapshot.configs.crew_structure_plans = {};
    }
    return this.db.snapshot.configs.crew_structure_plans;
  }

  savePlansMap(map) {
    if (!this.db || !this.db.snapshot) return;
    if (!this.db.snapshot.configs) this.db.snapshot.configs = {};
    this.db.snapshot.configs.crew_structure_plans = map;
    if (typeof this.db.schedulePersistSnapshot === 'function') {
      this.db.schedulePersistSnapshot(this.db.snapshot, 400);
    }
  }

  getPlanForWeek(weekStr) {
    if (!weekStr) weekStr = this.getDefaultPlanningWeekStr();
    const plans = this.getPlansMap();
    if (!plans[weekStr]) {
      const currentWeekStr = this.getCurrentWeekSundayStr();
      const nextWeekStr = this.getPlanningWeeks()[0]?.weekStr;
      // If opening Current Week (e.g. 11/08/2026) before it has been published, and the user already
      // made draft edits on Next Week (e.g. 11/15/2026), carry those draft edits into Current Week automatically!
      if (weekStr === currentWeekStr && nextWeekStr && plans[nextWeekStr] && plans[nextWeekStr].status !== 'published') {
        const cloned = JSON.parse(JSON.stringify(plans[nextWeekStr]));
        cloned.weekDate = weekStr;
        cloned.weekDateFormatted = weekStr;
        plans[weekStr] = cloned;
      } else {
        plans[weekStr] = this.initializePlanFromCurrentRoster(weekStr);
      }
      this.savePlansMap(plans);
    }
    const plan = plans[weekStr];
    if (!plan.confirmedPositions) {
      plan.confirmedPositions = {};
    }
    if (!plan.sidePane) {
      plan.sidePane = { planning: [], vacation: [], quit: [], weeds: [], lightDuty: [], pendingHires: [] };
    }

    // Safety auto-repair: Ensure no active baseline employees are completely missing from the plan
    this.healMissingBaselineEmployees(plan);

    // Sync crew types with Job Tracking and auto-heal if empty
    if (plan.crews && Array.isArray(plan.crews)) {
      const jtTable = this.db ? this.db.getTable('job_tracking') : null;
      const jtRows = jtTable?.rows || [];
      plan.crews.forEach(c => {
        const matchingJt = jtRows.find(j => {
          const jn = String(j['Job Number'] || j['Job #'] || '').trim();
          return jn === c.jobNumber || jn.replace(/\.\d+.*$/, '').trim() === c.jobNumber;
        });
        if (matchingJt && matchingJt['Crew Type']) {
          c.crewType = matchingJt['Crew Type'];
        } else if (!c.crewType) {
          c.crewType = this.detectCrewType(c.jobNumber, c.jobName, c.location, '');
        }
      });
    }

    return plan;
  }

  /**
   * Safety auto-repair: If any active employee from the live roster was deleted or went missing
   * from both the planned crews and side pane categories, restore them to their original crew/position.
   */
  healMissingBaselineEmployees(plan) {
    if (!plan) return;

    let purgedCount = 0;

    // 1. Purge non-employee equipment tracking items from sidePane
    if (plan.sidePane) {
      Object.keys(plan.sidePane).forEach(key => {
        if (Array.isArray(plan.sidePane[key])) {
          const beforeLen = plan.sidePane[key].length;
          plan.sidePane[key] = plan.sidePane[key].filter(item => {
            const name = item?.name || '';
            return name && !this.isNonEmployeeName(name);
          });
          if (plan.sidePane[key].length !== beforeLen) {
            purgedCount += (beforeLen - plan.sidePane[key].length);
          }
        }
      });
    }

    // 2. Purge non-employee members from planned crews
    if (Array.isArray(plan.crews)) {
      plan.crews.forEach(c => {
        if (Array.isArray(c.members)) {
          const beforeLen = c.members.length;
          c.members = c.members.filter(m => {
            const name = m?.name || '';
            return name && !this.isNonEmployeeName(name);
          });
          if (c.members.length !== beforeLen) {
            purgedCount += (beforeLen - c.members.length);
            c.members.forEach((m, idx) => {
              m.slot = `${c.jobNumber}.${idx + 1}`;
            });
          }
        }
      });
    }

    const baselineMap = this.getOriginalEmployeeLocations();
    if (!baselineMap || baselineMap.size === 0) {
      if (purgedCount > 0) this.savePlan(plan);
      return;
    }

    // Collect all employee names currently in the plan (crews + all sidePane buckets)
    const activeNamesInPlan = new Set();
    (plan.crews || []).forEach(c => {
      (c.members || []).forEach(m => {
        if (m.name && !this.isNonEmployeeName(m.name)) activeNamesInPlan.add(m.name.trim().toLowerCase());
      });
    });
    const sp = plan.sidePane || {};
    Object.keys(sp).forEach(k => {
      (sp[k] || []).forEach(item => {
        if (item.name && !this.isNonEmployeeName(item.name)) activeNamesInPlan.add(item.name.trim().toLowerCase());
      });
    });

    let healedCount = 0;
    baselineMap.forEach((base, normName) => {
      if (!base.name || this.isNonEmployeeName(base.name)) return;
      if (activeNamesInPlan.has(normName)) return;

      // Skip inactive / previous employees
      const stat = String(base.rawRow?.['Status'] || '').toLowerCase();
      const loc = String(base.rawRow?.['Location'] || '').toLowerCase();
      if (loc.includes('previous') || stat.includes('previous') || stat === 'inactive') return;

      // This employee is active on the live database but completely missing from the plan (e.g. deleted from quit)!
      // Restore them back to their original crew or staging pool!
      if (base.originalBaseJob) {
        const targetCrew = plan.crews.find(c => c.jobNumber.toLowerCase() === base.originalBaseJob.toLowerCase());
        if (targetCrew) {
          targetCrew.members.push({
            name: base.name,
            slot: `${targetCrew.jobNumber}.${targetCrew.members.length + 1}`,
            originalSlot: base.originalSlot || targetCrew.jobNumber,
            originalBaseJob: targetCrew.jobNumber,
            classification: String(base.rawRow?.['Job Classification'] || base.rawRow?.['Classification'] || 'Journeyman').trim(),
            role: String(base.rawRow?.['Role'] || 'JL').trim(),
            location: targetCrew.location || 'Helena',
            isConfirmed: false
          });
          targetCrew.members.forEach((m, idx) => {
            m.slot = `${targetCrew.jobNumber}.${idx + 1}`;
          });
          activeNamesInPlan.add(normName);
          healedCount++;
          return;
        }
      }

      // If no target crew, restore to original category or planning pool
      const cat = (base.originalCategory && plan.sidePane[base.originalCategory]) ? base.originalCategory : 'planning';
      if (!plan.sidePane[cat]) plan.sidePane[cat] = [];
      plan.sidePane[cat].push({
        name: base.name,
        currentJob: base.originalSlot || '',
        isConfirmed: false
      });
      activeNamesInPlan.add(normName);
      healedCount++;
    });

    if (healedCount > 0 || purgedCount > 0) {
      this.savePlan(plan);
    }
  }

  savePlan(plan) {
    if (!plan || !plan.weekDate) return;
    plan.lastModified = new Date().toISOString();
    const plans = this.getPlansMap();
    plans[plan.weekDate] = plan;
    this.savePlansMap(plans);
  }

  /**
   * Initializes a new planned week by deep-cloning the current live employees & job tracking structure.
   */
  initializePlanFromCurrentRoster(targetWeekStr) {
    const empTable = this.db ? this.db.getTable('employees') : null;
    const jtTable = this.db ? this.db.getTable('job_tracking') : null;
    const empRows = (empTable && empTable.rows) || [];
    const jtRows = (jtTable && jtTable.rows) || [];

    const prevEmpNames = (window.sheetNavigator && typeof window.sheetNavigator.getPreviousEmployeeNamesSet === 'function')
      ? window.sheetNavigator.getPreviousEmployeeNamesSet()
      : new Set();

    const isEmpActive = (r) => {
      if (window.sheetNavigator && typeof window.sheetNavigator.isEmployeeActive === 'function') {
        return window.sheetNavigator.isEmployeeActive(r, prevEmpNames);
      }
      const st = String(r['Status'] || '').toLowerCase().trim();
      return st !== 'previous employee' && st !== 'inactive' && st !== 'terminated';
    };

    const activeRows = empRows.filter(isEmpActive);

    // Group active field members vs status buckets
    const crewsMap = new Map();
    const sidePane = {
      planning: [],
      vacation: [],
      quit: [],
      weeds: [],
      lightDuty: [],
      pendingHires: []
    };

    // Pre-populate crewsMap from active Job Tracking jobs
    jtRows.forEach(j => {
      const jn = String(j['Job Number'] || j['Job #'] || '').trim();
      const baseJob = jn.replace(/\.\d+.*$/, '').trim();
      const status = String(j['Status'] || 'Active').trim();
      if (!baseJob || baseJob.toLowerCase() === 'unassigned' || status.toLowerCase() === 'completed') return;

      if (!crewsMap.has(baseJob)) {
        crewsMap.set(baseJob, {
          jobNumber: baseJob,
          location: String(j['Location'] || 'Helena').trim(),
          foreman: String(j['Foreman'] || j['Crew Lead'] || '').trim(),
          crewType: this.detectCrewType(baseJob, j['Job Name'], j['Location'], j['Crew Type'] || j['Discipline']),
          schedule: String(j['Work Schedule'] || j['Schedule'] || 'Mon-Thu (4 10s)').trim(),
          isSkipSun: j['Skip Sun'] === true || String(j['Skip Sun']).toLowerCase() === 'true',
          isSkipMon: j['Skip Mon'] === true || String(j['Skip Mon']).toLowerCase() === 'true',
          isSkipTue: j['Skip Tue'] === true || String(j['Skip Tue']).toLowerCase() === 'true',
          isSkipWed: j['Skip Wed'] === true || String(j['Skip Wed']).toLowerCase() === 'true',
          isSkipThu: j['Skip Thu'] === true || String(j['Skip Thu']).toLowerCase() === 'true',
          isSkipFri: j['Skip Fri'] === true || String(j['Skip Fri']).toLowerCase() === 'true',
          isSkipSat: j['Skip Sat'] === true || String(j['Skip Sat']).toLowerCase() === 'true',
          skipMtg: j['Skip Weekly Meeting'] === true || String(j['Skip Weekly Meeting']).toLowerCase() === 'true',
          skipChk: j['Skip Monthly Checklist'] === true || String(j['Skip Monthly Checklist']).toLowerCase() === 'true',
          jobName: String(j['Job Name'] || '').trim(),
          members: []
        });
      } else {
        const existing = crewsMap.get(baseJob);
        const curName = String(j['Job Name'] || '').trim();
        const exName = String(existing.jobName || '').trim();
        if (curName && (!exName || (exName.toLowerCase().includes('dock') && !curName.toLowerCase().includes('dock')))) {
          existing.jobName = curName;
        }
        if (!existing.foreman && j['Foreman']) existing.foreman = String(j['Foreman']).trim();
      }
    });

    activeRows.forEach(r => {
      const name = String(r['Employee Name'] || r['Name'] || Object.values(r)[0] || '').trim();
      if (!name || this.isNonEmployeeName(name)) return;
      const job = String(r['Job Number'] || r['Job #'] || '').trim();
      const loc = String(r['Location'] || '').trim();
      const locLower = loc.toLowerCase();
      const statLower = String(r['Status'] || '').toLowerCase().trim();
      const classification = String(r['Job Classification'] || r['Classification'] || r['Role'] || '').trim();
      const secondaryJob = String(r['Secondary Job Number'] || r['Secondary Job #'] || '').trim();
      const hireDate = String(r['Hire Date'] || '').trim();
      const notes = String(r['Notes'] || '').trim();

      const memberObj = {
        name,
        slot: job,
        originalSlot: job,
        originalBaseJob: job ? job.replace(/\.\d+.*$/, '').trim() : null,
        classification,
        role: classification,
        location: loc,
        secondaryJob,
        hireDate,
        notes,
        isConfirmed: false
      };

      const isVacation = statLower === 'vacation' || locLower.includes('(vacation)') || locLower === 'vacation' || job.toLowerCase() === 'vacation';
      const isLeave = !isVacation && (statLower === 'leave' || locLower.includes('(leave)') || locLower === 'leave' || job.toLowerCase() === 'leave');
      const isWeeds = !isVacation && !isLeave && (locLower.includes('(weeds)') || locLower === 'weeds' || statLower === 'weeds' || job.toLowerCase() === 'weeds');
      const isLightDuty = !isVacation && !isLeave && !isWeeds && (locLower.includes('(light duty)') || locLower === 'light duty' || statLower === 'light duty' || job.toLowerCase() === 'light duty');

      if (isVacation || isLeave) {
        sidePane.vacation.push({ ...memberObj, currentJob: job });
      } else if (isWeeds) {
        sidePane.weeds.push({ ...memberObj, currentJob: job });
      } else if (isLightDuty) {
        sidePane.lightDuty.push({ ...memberObj, currentJob: job });
      } else if (job && job.toLowerCase() !== 'unassigned') {
        const baseJob = job.replace(/\.\d+.*$/, '').trim();
        if (!crewsMap.has(baseJob)) {
          const matchingJt = jtRows.find(j => {
            const jn = String(j['Job Number'] || j['Job #'] || '').trim();
            return jn === baseJob || jn.replace(/\.\d+.*$/, '').trim() === baseJob;
          });
          crewsMap.set(baseJob, {
            jobNumber: baseJob,
            location: loc || (matchingJt && matchingJt['Location']) || 'Helena',
            foreman: (matchingJt && matchingJt['Foreman']) || '',
            crewType: this.detectCrewType(baseJob, matchingJt && matchingJt['Job Name'], loc || (matchingJt && matchingJt['Location']), matchingJt && matchingJt['Crew Type']),
            schedule: (matchingJt && (matchingJt['Work Schedule'] || matchingJt['Schedule'])) || 'Mon-Thu (4 10s)',
            isSkipSun: matchingJt ? (matchingJt['Skip Sun'] === true || String(matchingJt['Skip Sun']).toLowerCase() === 'true') : true,
            isSkipMon: matchingJt ? (matchingJt['Skip Mon'] === true || String(matchingJt['Skip Mon']).toLowerCase() === 'true') : false,
            isSkipTue: matchingJt ? (matchingJt['Skip Tue'] === true || String(matchingJt['Skip Tue']).toLowerCase() === 'true') : false,
            isSkipWed: matchingJt ? (matchingJt['Skip Wed'] === true || String(matchingJt['Skip Wed']).toLowerCase() === 'true') : false,
            isSkipThu: matchingJt ? (matchingJt['Skip Thu'] === true || String(matchingJt['Skip Thu']).toLowerCase() === 'true') : false,
            isSkipFri: matchingJt ? (matchingJt['Skip Fri'] === true || String(matchingJt['Skip Fri']).toLowerCase() === 'true') : true,
            isSkipSat: matchingJt ? (matchingJt['Skip Sat'] === true || String(matchingJt['Skip Sat']).toLowerCase() === 'true') : true,
            skipMtg: matchingJt ? (matchingJt['Skip Weekly Meeting'] === true || String(matchingJt['Skip Weekly Meeting']).toLowerCase() === 'true') : false,
            skipChk: matchingJt ? (matchingJt['Skip Monthly Checklist'] === true || String(matchingJt['Skip Monthly Checklist']).toLowerCase() === 'true') : false,
            jobName: (matchingJt && matchingJt['Job Name']) || '',
            members: []
          });
        }
        crewsMap.get(baseJob).members.push(memberObj);
      } else {
        sidePane.planning.push({ ...memberObj, currentJob: job });
      }

      // Populate Secondary Crew Member assignment if secondaryJob exists
      if (secondaryJob && secondaryJob.toLowerCase() !== 'unassigned') {
        const secBase = secondaryJob.replace(/\.\d+.*$/, '').trim();
        if (secBase && !secBase.startsWith('002') && !secBase.startsWith('005')) {
          if (!crewsMap.has(secBase)) {
            const matchingJt = jtRows.find(j => {
              const jn = String(j['Job Number'] || j['Job #'] || '').trim();
              return jn === secBase || jn.replace(/\.\d+.*$/, '').trim() === secBase;
            });
            crewsMap.set(secBase, {
              jobNumber: secBase,
              location: (matchingJt && matchingJt['Location']) || loc || 'Helena',
              foreman: (matchingJt && matchingJt['Foreman']) || '',
              crewType: this.detectCrewType(secBase, matchingJt && matchingJt['Job Name'], (matchingJt && matchingJt['Location']) || loc, matchingJt && matchingJt['Crew Type']),
              schedule: (matchingJt && (matchingJt['Work Schedule'] || matchingJt['Schedule'])) || 'Mon-Thu (4 10s)',
              isSkipSun: matchingJt ? (matchingJt['Skip Sun'] === true || String(matchingJt['Skip Sun']).toLowerCase() === 'true') : true,
              isSkipMon: matchingJt ? (matchingJt['Skip Mon'] === true || String(matchingJt['Skip Mon']).toLowerCase() === 'true') : false,
              isSkipTue: matchingJt ? (matchingJt['Skip Tue'] === true || String(matchingJt['Skip Tue']).toLowerCase() === 'true') : false,
              isSkipWed: matchingJt ? (matchingJt['Skip Wed'] === true || String(matchingJt['Skip Wed']).toLowerCase() === 'true') : false,
              isSkipThu: matchingJt ? (matchingJt['Skip Thu'] === true || String(matchingJt['Skip Thu']).toLowerCase() === 'true') : false,
              isSkipFri: matchingJt ? (matchingJt['Skip Fri'] === true || String(matchingJt['Skip Fri']).toLowerCase() === 'true') : true,
              isSkipSat: matchingJt ? (matchingJt['Skip Sat'] === true || String(matchingJt['Skip Sat']).toLowerCase() === 'true') : true,
              skipMtg: matchingJt ? (matchingJt['Skip Weekly Meeting'] === true || String(matchingJt['Skip Weekly Meeting']).toLowerCase() === 'true') : false,
              skipChk: matchingJt ? (matchingJt['Skip Monthly Checklist'] === true || String(matchingJt['Skip Monthly Checklist']).toLowerCase() === 'true') : false,
              jobName: (matchingJt && matchingJt['Job Name']) || '',
              members: []
            });
          }
          const secCrew = crewsMap.get(secBase);
          if (!secCrew.members.some(m => m.name.toLowerCase() === name.toLowerCase())) {
            secCrew.members.push({
              ...memberObj,
              slot: secondaryJob,
              originalSlot: secondaryJob,
              originalBaseJob: secBase,
              isSecondaryMember: true,
              primaryJobNumber: job
            });
          }
        }
      }
    });

    // Check for pending new hires
    activeRows.forEach(r => {
      const name = String(r['Employee Name'] || r['Name'] || '').trim();
      if (!name || this.isNonEmployeeName(name)) return;
      const hireDate = String(r['Hire Date'] || '').trim();
      const statLower = String(r['Status'] || '').toLowerCase().trim();
      if (statLower === 'pending' || (hireDate && new Date(hireDate) > new Date())) {
        if (!sidePane.pendingHires.some(p => p.name === name)) {
          sidePane.pendingHires.push({
            name,
            hireDate,
            classification: String(r['Job Classification'] || 'Apprentice').trim(),
            location: String(r['Location'] || 'Helena').trim(),
            notes: 'Incoming New Hire',
            isConfirmed: false
          });
        }
      }
    });

    // Sort crew members by suffix number
    for (const crew of crewsMap.values()) {
      crew.members.sort((a, b) => {
        const ma = String(a.slot || '').match(/\.(\d+)/);
        const mb = String(b.slot || '').match(/\.(\d+)/);
        const na = ma ? parseInt(ma[1], 10) : 999;
        const nb = mb ? parseInt(mb[1], 10) : 999;
        return na - nb;
      });

      // Detect foreman if not explicitly set
      if (!crew.foreman && crew.members.length > 0) {
        const lead = crew.members.find(m => /^(foreman|f|sup|gf|lead)/i.test(m.classification)) || crew.members[0];
        crew.foreman = lead ? lead.name : '';
      }
    }

    // Sort crews by saved import order if available
    let orderList = [];
    try {
      const saved = localStorage.getItem('CREW_IMPORT_ORDER');
      if (saved) orderList = JSON.parse(saved) || [];
    } catch { /* ignore */ }

    const crewsArray = Array.from(crewsMap.values());
    if (orderList.length > 0) {
      crewsArray.sort((a, b) => {
        const ia = orderList.indexOf(a.jobNumber);
        const ib = orderList.indexOf(b.jobNumber);
        if (ia !== -1 && ib !== -1) return ia - ib;
        if (ia !== -1) return -1;
        if (ib !== -1) return 1;
        return a.jobNumber.localeCompare(b.jobNumber, undefined, { numeric: true });
      });
    }

    return {
      weekDate: targetWeekStr,
      weekDateFormatted: targetWeekStr,
      status: 'draft',
      createdAt: new Date().toISOString(),
      lastModified: new Date().toISOString(),
      crews: crewsArray,
      sidePane: sidePane,
      confirmedPositions: {}
    };
  }

  // ==========================================================================
  // Historical Roster Archive
  // ==========================================================================

  getHistoryMap() {
    if (!this.db || !this.db.snapshot) return {};
    if (!this.db.snapshot.configs) this.db.snapshot.configs = {};
    if (!this.db.snapshot.configs.crew_roster_history) {
      this.db.snapshot.configs.crew_roster_history = {};
    }
    return this.db.snapshot.configs.crew_roster_history;
  }

  saveHistoryMap(map) {
    if (!this.db || !this.db.snapshot) return;
    if (!this.db.snapshot.configs) this.db.snapshot.configs = {};
    this.db.snapshot.configs.crew_roster_history = map;
    if (typeof this.db.schedulePersistSnapshot === 'function') {
      this.db.schedulePersistSnapshot(this.db.snapshot, 400);
    }
  }

  archiveSnapshot(weekStr, rosterSnapshot) {
    if (!weekStr || !rosterSnapshot) return;
    const hist = this.getHistoryMap();
    hist[weekStr] = {
      weekDate: weekStr,
      archivedAt: new Date().toISOString(),
      ...rosterSnapshot
    };
    this.saveHistoryMap(hist);
  }

  getHistoricalRoster(weekStr) {
    const hist = this.getHistoryMap();
    if (hist[weekStr]) {
      return hist[weekStr];
    }

    // Synthesize reference structure from Safety Compliance
    const scTable = this.db ? this.db.getTable('safety_compliance') : null;
    const jtTable = this.db ? this.db.getTable('job_tracking') : null;

    const weekRows = (scTable && scTable.rows)
      ? scTable.rows.filter(r => String(r['Week Start'] || r['Week'] || '').trim() === weekStr)
      : [];

    const crews = weekRows.map(r => {
      const jn = String(r['Job Number'] || r['Crew'] || '').trim();
      const foreman = String(r['Foreman'] || '').trim();
      const jt = (jtTable?.rows || []).find(j => String(j['Job Number'] || '').trim() === jn);
      return {
        jobNumber: jn,
        location: jt?.['Location'] || 'Helena',
        foreman: foreman,
        crewType: jt?.['Crew Type'] || 'Electric',
        schedule: jt?.['Schedule'] || 'Mon-Thu',
        jobName: jt?.['Job Name'] || '',
        members: foreman ? [{ name: foreman, slot: `${jn}.1`, classification: 'Foreman', role: 'F' }] : []
      };
    });

    return {
      weekDate: weekStr,
      isSynthesized: true,
      crews: crews,
      sidePane: { planning: [], vacation: [], quit: [], weeds: [], lightDuty: [], pendingHires: [] }
    };
  }

  async importHistoricalWorkbookTabs(fileOrBuffer) {
    if (!window.XLSX) {
      throw new Error('SheetJS library (XLSX) is not available.');
    }

    let wb;
    if (fileOrBuffer instanceof ArrayBuffer) {
      wb = window.XLSX.read(fileOrBuffer, { type: 'array' });
    } else if (fileOrBuffer instanceof File) {
      const buffer = await fileOrBuffer.arrayBuffer();
      wb = window.XLSX.read(buffer, { type: 'array' });
    } else {
      throw new Error('Invalid file input.');
    }

    const hist = this.getHistoryMap();
    let importedCount = 0;
    const importedWeeks = [];

    const engine = window.crewImportEngine || new CrewImportEngine(this.db);

    for (const sheetName of wb.SheetNames) {
      const dateStr = engine.parseRosterDate(sheetName);
      if (!dateStr) continue;

      const d = new Date(dateStr + 'T12:00:00');
      if (isNaN(d.getTime())) continue;
      const sundayStr = this.formatDate(this.getSundayOfDate(d));

      try {
        engine.parseSheet(sheetName);
        const parsedCrews = (engine.parsedCrews || []).map(c => ({
          jobNumber: c.jobNumber,
          location: c.location || 'Helena',
          foreman: (c.lead && c.lead.name) || (c.employees && c.employees[0] ? c.employees[0].name : ''),
          crewType: c.crewType || 'Electric',
          schedule: c.schedule || 'Mon-Thu',
          jobName: c.jobName || '',
          members: (c.employees || []).map(e => ({
            name: e.name,
            slot: e.slotNumber || c.jobNumber,
            classification: e.classification || e.role || '',
            role: e.role || '',
            isSecondaryMember: Boolean(e.isSecondaryMember)
          }))
        }));

        const timeOff = engine.specialCircumstances?.filter(s => !s.isQuit) || [];
        const quits = engine.specialCircumstances?.filter(s => s.isQuit) || [];

        hist[sundayStr] = {
          weekDate: sundayStr,
          sourceSheetTab: sheetName,
          archivedAt: new Date().toISOString(),
          isExcelImport: true,
          crews: parsedCrews,
          sidePane: {
            vacation: timeOff.map(t => ({ name: t.name, note: t.note, rawText: t.rawText })),
            quit: quits.map(q => ({ name: q.name, note: q.note, departureDate: q.departureDate || sundayStr })),
            planning: [],
            weeds: [],
            lightDuty: [],
            pendingHires: []
          }
        };

        importedCount++;
        importedWeeks.push(sundayStr);
      } catch (err) {
        console.warn(`Could not parse historical tab "${sheetName}":`, err);
      }
    }

    this.saveHistoryMap(hist);
    return { importedCount, importedWeeks };
  }

  // ==========================================================================
  // Workspace Renderers
  // ==========================================================================

  /**
   * Evaluates whether a crew card matches a search query across job#, location, foreman, job name, crew type, or member details.
   */
  isCrewMatchingSearch(crew, sTerm = '') {
    if (!sTerm) return true;
    const term = sTerm.toLowerCase().trim();
    if (crew.jobNumber && crew.jobNumber.toLowerCase().includes(term)) return true;
    if (crew.location && crew.location.toLowerCase().includes(term)) return true;
    if (crew.foreman && crew.foreman.toLowerCase().includes(term)) return true;
    if (crew.jobName && crew.jobName.toLowerCase().includes(term)) return true;
    if (crew.crewType && crew.crewType.toLowerCase().includes(term)) return true;
    if (crew.schedule && crew.schedule.toLowerCase().includes(term)) return true;
    if (Array.isArray(crew.members)) {
      return crew.members.some(m => {
        if (!m) return false;
        const name = String(m.name || '').toLowerCase();
        const cls = String(m.classification || '').toLowerCase();
        const jn = String(m.jobNumber || m.slot || '').toLowerCase();
        const sec = String(m.secondaryJob || '').toLowerCase();
        return name.includes(term) || cls.includes(term) || jn.includes(term) || sec.includes(term);
      });
    }
    return false;
  }

  renderPlanningWorkspace(container, countBadge, targetWeekStr, incomingSearchTerm) {
    if (!container) return;

    // Run automated check for any employee whose last day has arrived
    this.checkAndArchiveDepartedEmployees();

    if (!targetWeekStr) {
      targetWeekStr = this.selectedWeek || this.getDefaultPlanningWeekStr();
    }
    this.selectedWeek = targetWeekStr;

    const currentWeekStr = this.getCurrentWeekSundayStr();
    const planningWeekOptions = [
      {
        weekStr: currentWeekStr,
        label: `Week of ${currentWeekStr} (Current Week${!this.isWeekPublished(currentWeekStr) ? ' — Unpublished' : ''})`
      },
      ...this.getPlanningWeeks().map(p => ({
        weekStr: p.weekStr,
        label: p.offset === 1 ? `Week of ${p.weekStr} (Next Week)` : `Week of ${p.weekStr} (+${p.offset} Weeks Out)`
      }))
    ];
    if (!planningWeekOptions.some(w => w.weekStr === targetWeekStr)) {
      planningWeekOptions.unshift({
        weekStr: targetWeekStr,
        label: `Week of ${targetWeekStr}`
      });
    }

    if (incomingSearchTerm !== undefined) {
      this.searchTerm = incomingSearchTerm;
    } else if (window.sheetNavigator && window.sheetNavigator.searchTerm !== undefined) {
      this.searchTerm = window.sheetNavigator.searchTerm;
    }

    const plan = this.getPlanForWeek(targetWeekStr);

    // Baseline original locations and occurrence indexing for fast O(1) conditional styling
    const baselineMap = this.getOriginalEmployeeLocations();
    const occMap = this.getEmployeeOccurrencesMap(plan);

    // Calculate metrics & purple unconfirmed count
    let totalAssigned = 0;
    let purpleCount = 0;
    let yellowCount = 0;

    plan.crews.forEach(c => {
      totalAssigned += c.members.length;
      c.members.forEach(m => {
        const st = this.getEmployeePlanningStatus(m.name, c.jobNumber, null, plan, baselineMap, occMap);
        if (st.statusColor === 'purple') purpleCount++;
        else if (st.statusColor === 'yellow') yellowCount++;
      });
    });

    const sp = plan.sidePane;
    ['planning', 'vacation', 'quit', 'weeds', 'lightDuty', 'pendingHires'].forEach(cat => {
      (sp[cat] || []).forEach(item => {
        const st = this.getEmployeePlanningStatus(item.name, null, cat, plan, baselineMap, occMap);
        if (st.statusColor === 'purple') purpleCount++;
        else if (st.statusColor === 'yellow') yellowCount++;
      });
    });

    // Toolbar count badge hidden to remove redundancy as requested
    if (countBadge) {
      countBadge.style.display = 'none';
    }

    const sTerm = (this.searchTerm || '').toLowerCase().trim();

    // Capture scroll positions before replacing innerHTML so edits don't reset the page to the top
    const prevMain = container.querySelector('.planning-main-panel');
    const savedMainY = (prevMain && prevMain.scrollTop > 0) ? prevMain.scrollTop : (this._lastSavedMainY || 0);
    const savedMainX = (prevMain && prevMain.scrollLeft > 0) ? prevMain.scrollLeft : (this._lastSavedMainX || 0);
    const prevSide = container.querySelector('.side-pane-scroll-body');
    const savedSideY = (prevSide && prevSide.scrollTop > 0) ? prevSide.scrollTop : (this._lastSavedSideY || 0);
    const savedContainerY = container.scrollTop;
    const savedContainerX = container.scrollLeft;
    const savedWinY = window.scrollY || document.documentElement?.scrollTop || 0;
    const savedWinX = window.scrollX || document.documentElement?.scrollLeft || 0;

    container.innerHTML = `
      <div class="crew-planning-wrapper" style="display: flex; height: 100%; width: 100%; overflow: hidden; background: var(--bg-primary, #0f172a); color: var(--text-primary, #f8fafc); box-sizing: border-box;">
        
        <!-- Main Left/Center Planning Area -->
        <div class="planning-main-panel" style="flex: 1; display: flex; flex-direction: column; height: 100%; min-width: 0; overflow-y: auto; padding: 14px 18px; box-sizing: border-box;">
          
          <!-- Planning Header Toolbar -->
          <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 10px; background: var(--bg-secondary, #1e293b); border: 1px solid var(--border-color, rgba(255,255,255,0.1)); border-radius: 8px; padding: 10px 14px; margin-bottom: 14px;">
            
            <div style="display: flex; align-items: center; gap: 12px; flex-wrap: wrap;">
              <div style="font-size: 15px; font-weight: 800; color: #60a5fa; display: flex; align-items: center; gap: 6px;">
                <span>🏗️</span>
                <span>Crew Structure Planning</span>
              </div>
              <div style="display: inline-flex; align-items: center; gap: 6px; background: rgba(15, 23, 42, 0.75); border: 1px solid rgba(96, 165, 250, 0.4); border-radius: 6px; padding: 3px 8px;">
                <span style="font-size: 11px; font-weight: 700; color: #93c5fd;">📅 Editing Week:</span>
                <select onchange="window.crewPlanningEngine.selectPlanningWeek(this.value)"
                        style="background: transparent; border: none; color: #f8fafc; font-size: 12px; font-weight: 800; cursor: pointer; outline: none;">
                  ${planningWeekOptions.map(w => `
                    <option value="${this.escapeHtml(w.weekStr)}" ${w.weekStr === targetWeekStr ? 'selected' : ''} style="background: #0f172a; color: #f8fafc;">
                      ${this.escapeHtml(w.label)}
                    </option>
                  `).join('')}
                </select>
              </div>
              <span class="badge" style="background: rgba(245, 158, 11, 0.18); color: #fbbf24; border: 1px solid rgba(245, 158, 11, 0.4); font-size: 11px; font-weight: 700; padding: 2px 8px; border-radius: 4px;">
                ${plan.status === 'published' ? '🟢 Published Plan' : '🟡 Draft Plan (Pre-Publish)'}
              </span>

              <!-- Status Counter Badges -->
              <div style="display: flex; align-items: center; gap: 6px; font-size: 11px; font-weight: 700;">
                ${purpleCount > 0 ? `
                  <span class="badge" style="background: rgba(147, 51, 234, 0.25); color: #d8b4fe; border: 1px solid #a855f7; padding: 2px 8px; border-radius: 4px;" title="Unconfirmed moved or duplicated employees — must be confirmed before publishing">
                    🟣 ${purpleCount} Unconfirmed
                  </span>
                ` : `
                  <span class="badge" style="background: rgba(16, 185, 129, 0.2); color: #34d399; border: 1px solid #10b981; padding: 2px 8px; border-radius: 4px;">
                    ✅ 0 Unconfirmed
                  </span>
                `}
                ${yellowCount > 0 ? `
                  <span class="badge" style="background: rgba(234, 179, 8, 0.2); color: #fde047; border: 1px solid #eab308; padding: 2px 8px; border-radius: 4px;" title="Confirmed positions (will carry through as yellow once published)">
                    🟡 ${yellowCount} Confirmed
                  </span>
                ` : ''}
                ${sTerm ? `
                  <span class="badge" style="background: rgba(56, 189, 248, 0.2); color: #38bdf8; border: 1px solid #38bdf8; padding: 2px 8px; border-radius: 4px; display: inline-flex; align-items: center; gap: 5px;" title="Filtered by search query: '${this.escapeHtml(sTerm)}'">
                    🔍 "${this.escapeHtml(sTerm)}" (${plan.crews.filter(c => this.isCrewMatchingSearch(c, sTerm)).length} of ${plan.crews.length} crews)
                    <button onclick="const si = document.getElementById('sheet-search-input'); if (si) { si.value = ''; si.dispatchEvent(new Event('input')); }" style="background: transparent; border: none; color: #38bdf8; font-size: 11px; font-weight: 800; cursor: pointer; padding: 0 2px; line-height: 1;" title="Clear search">✕</button>
                  </span>
                ` : ''}
              </div>

              <div style="font-size: 11.5px; color: var(--text-muted, #94a3b8); display: flex; align-items: center; gap: 6px;">
                <span>👥 ${totalAssigned} Assigned</span> •
                <span>🚜 ${plan.crews.length} Crews</span> •
                <span>🏖️ ${plan.sidePane.vacation.length} Vacation</span>
              </div>
            </div>

            <!-- Action Controls -->
            <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
              <button class="btn btn-secondary" onclick="window.crewPlanningEngine.cloneFromCurrentRoster()" style="font-size: 11.5px; font-weight: 600; padding: 5px 10px; display: inline-flex; align-items: center; gap: 5px;" title="Reset / Clone this planned week from the live current roster">
                <span>📋</span> Reset from Live
              </button>
              <button class="btn btn-secondary" onclick="window.crewPlanningEngine.promptAddNewPlannedCrew()" style="font-size: 11.5px; font-weight: 600; padding: 5px 10px; display: inline-flex; align-items: center; gap: 5px;" title="Add a new planned field crew for this week">
                <span>➕</span> Add Crew
              </button>
              ${purpleCount > 0 ? `
                <button class="btn btn-secondary" onclick="window.crewPlanningEngine.confirmAllPurpleMembers()" style="font-size: 11px; font-weight: 700; padding: 5px 9px; color: #fde047; border-color: rgba(234, 179, 8, 0.4); background: rgba(234, 179, 8, 0.1);" title="Confirm all unconfirmed purple employees at once">
                  ✅ Confirm All (${purpleCount})
                </button>
              ` : ''}
              <button class="btn btn-primary" onclick="window.crewPlanningEngine.openPublishModal()" style="font-size: 12px; font-weight: 800; padding: 6px 14px; background: linear-gradient(135deg, #10b981 0%, #059669 100%); border: none; box-shadow: 0 2px 8px rgba(16, 185, 129, 0.35); display: inline-flex; align-items: center; gap: 6px; cursor: pointer;" title="Publish this crew structure to live database (all purple must be confirmed first)">
                <span>🚀</span> Publish Crew Structure
              </button>
              <button class="btn btn-secondary" onclick="window.crewPlanningEngine.toggleSidebar()" style="font-size: 11.5px; padding: 5px 10px; display: inline-flex; align-items: center; gap: 5px; border-color: rgba(255,255,255,0.15);" title="Toggle Staging Side Pane">
                <span>${this.isSidebarCollapsed ? '⇤ Show Side Pane' : '⇥ Hide Side Pane'}</span>
              </button>
            </div>
          </div>

          <!-- Planned Crews Grid -->
          <div style="flex: 1;">
            <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px;">
              <div style="font-size: 12px; font-weight: 800; text-transform: uppercase; color: var(--text-muted, #94a3b8); letter-spacing: 0.5px; display: flex; align-items: center; gap: 6px;">
                <span>🚜</span> Planned Field Crews (${plan.crews.length})
              </div>
              <div style="font-size: 11px; color: var(--text-muted, #94a3b8); font-style: italic; display: flex; align-items: center; gap: 8px;">
                <span>💡 Drag ⠿ to reorder crews • Drag members between crews • Hold Alt/Ctrl+Drag to duplicate • Click 🟣/🟡 to confirm</span>
              </div>
            </div>

            <div class="planned-crews-grid" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(360px, 1fr)); gap: 14px;">
              ${(() => {
                const matchingCrews = plan.crews.filter(c => this.isCrewMatchingSearch(c, sTerm));
                if (matchingCrews.length === 0 && sTerm) {
                  return `
                    <div style="grid-column: 1 / -1; padding: 36px 20px; text-align: center; color: var(--text-muted, #94a3b8); background: rgba(30, 41, 59, 0.4); border: 1px dashed rgba(255,255,255,0.12); border-radius: 8px;">
                      <div style="font-size: 28px; margin-bottom: 8px;">🔍</div>
                      <div style="font-size: 14px; font-weight: 700; color: #f8fafc; margin-bottom: 4px;">No planned field crews match "${this.escapeHtml(sTerm)}"</div>
                      <div style="font-size: 12px; color: #94a3b8; margin-bottom: 12px;">Check the Staging Side Pane on the right, or clear the search to view all ${plan.crews.length} crews.</div>
                      <button class="btn btn-secondary" onclick="const si = document.getElementById('sheet-search-input'); if (si) { si.value = ''; si.dispatchEvent(new Event('input')); }" style="font-size: 11.5px; padding: 4px 12px; display: inline-flex; align-items: center; gap: 4px;">
                        <span>✕</span> Clear Search
                      </button>
                    </div>
                  `;
                }
                return matchingCrews.map(crew => this.renderPlannedCrewCard(crew, sTerm, plan, baselineMap, occMap)).join('');
              })()}
            </div>
          </div>
        </div>

        <!-- Collapsible Staging Side Pane -->
        <div class="planning-side-pane" style="width: ${this.isSidebarCollapsed ? '44px' : '360px'}; min-width: ${this.isSidebarCollapsed ? '44px' : '360px'}; background: var(--bg-secondary, #1e293b); border-left: 1px solid var(--border-color, rgba(255,255,255,0.1)); display: flex; flex-direction: column; height: 100%; transition: width 0.2s ease, min-width 0.2s ease; box-sizing: border-box; position: relative;">
          ${this.isSidebarCollapsed ? this.renderCollapsedSidePane() : this.renderExpandedSidePane(plan, baselineMap, occMap, sTerm)}
        </div>

      </div>
    `;

    // Attach interactive drag & drop listeners
    this.attachPlanningDragHandlers(container);

    // Track real-time scroll offsets
    const newMain = container.querySelector('.planning-main-panel');
    if (newMain) {
      newMain.addEventListener('scroll', () => {
        this._lastSavedMainY = newMain.scrollTop;
        this._lastSavedMainX = newMain.scrollLeft;
      }, { passive: true });
    }
    const newSide = container.querySelector('.side-pane-scroll-body');
    if (newSide) {
      newSide.addEventListener('scroll', () => {
        this._lastSavedSideY = newSide.scrollTop;
      }, { passive: true });
    }

    // Restore scroll positions across view refreshes so edits never jump to top
    const restoreScroll = () => {
      const curMain = container.querySelector('.planning-main-panel');
      if (curMain) {
        if (sTerm) {
          curMain.scrollTop = 0;
        } else {
          if (savedMainY > 0) curMain.scrollTop = savedMainY;
          if (savedMainX > 0) curMain.scrollLeft = savedMainX;
        }
      }
      const curSide = container.querySelector('.side-pane-scroll-body');
      if (curSide) {
        if (sTerm) {
          curSide.scrollTop = 0;
        } else if (savedSideY > 0) {
          curSide.scrollTop = savedSideY;
        }
      }
      if (container && !sTerm) {
        if (savedContainerY > 0) container.scrollTop = savedContainerY;
        if (savedContainerX > 0) container.scrollLeft = savedContainerX;
      }
      if (!sTerm && (savedWinY > 0 || savedWinX > 0)) {
        window.scrollTo({ top: savedWinY, left: savedWinX, behavior: 'instant' });
      }
    };
    restoreScroll();
    requestAnimationFrame(restoreScroll);
    setTimeout(restoreScroll, 35);
  }

  /**
   * Renders a single planned crew card with member rows and conditional coloring (Purple / Yellow / Normal).
   */
  renderPlannedCrewCard(crew, sTerm = '', plan, baselineMap, occMap) {
    if (!this.isCrewMatchingSearch(crew, sTerm)) return '';

    const skipDays = this.getCrewSkipDays(crew);
    const dayPillsConfig = [
      { key: 'Mon', label: 'M', isWork: !skipDays.isSkipMon },
      { key: 'Tue', label: 'T', isWork: !skipDays.isSkipTue },
      { key: 'Wed', label: 'W', isWork: !skipDays.isSkipWed },
      { key: 'Thu', label: 'Th', isWork: !skipDays.isSkipThu },
      { key: 'Fri', label: 'F', isWork: !skipDays.isSkipFri },
      { key: 'Sat', label: 'Sa', isWork: !skipDays.isSkipSat },
      { key: 'Sun', label: 'Su', isWork: !skipDays.isSkipSun }
    ];

    const dayPillsHtml = dayPillsConfig.map(d => {
      const bg = d.isWork ? '#10b981' : 'rgba(15, 23, 42, 0.6)';
      const border = d.isWork ? '#059669' : 'rgba(255, 255, 255, 0.12)';
      const color = d.isWork ? '#ffffff' : '#64748b';
      const tooltip = d.isWork
        ? `${d.key}: Working day (Click to set as Off day)`
        : `${d.key}: Off day (Click to set as Working day)`;

      return `
        <div style="width: 22px; height: 20px; font-size: 9.5px; font-weight: 700; border-radius: 4px; border: 1px solid ${border}; background: ${bg}; color: ${color}; display: flex; align-items: center; justify-content: center; cursor: pointer; transition: transform 0.1s ease; user-select: none;"
             onclick="event.stopPropagation(); window.crewPlanningEngine.toggleCrewDayWorking('${this.escapeJs(crew.jobNumber)}', '${d.key}')"
             title="${tooltip}"
             onmouseover="this.style.transform='scale(1.15)';"
             onmouseout="this.style.transform='scale(1)';">
          ${d.label}
        </div>
      `;
    }).join('');

    const term = (sTerm || '').toLowerCase().trim();
    const isCrewHeaderMatch = Boolean(term && (
      (crew.jobNumber && crew.jobNumber.toLowerCase().includes(term)) ||
      (crew.location && crew.location.toLowerCase().includes(term)) ||
      (crew.foreman && crew.foreman.toLowerCase().includes(term)) ||
      (crew.jobName && crew.jobName.toLowerCase().includes(term)) ||
      (crew.crewType && crew.crewType.toLowerCase().includes(term)) ||
      (crew.schedule && crew.schedule.toLowerCase().includes(term))
    ));
    const hasMemberMatch = Boolean(term && Array.isArray(crew.members) && crew.members.some(m => {
      if (!m) return false;
      const n = String(m.name || '').toLowerCase();
      const c = String(m.classification || '').toLowerCase();
      const s = String(m.slot || m.jobNumber || '').toLowerCase();
      const sec = String(m.secondaryJob || '').toLowerCase();
      return n.includes(term) || c.includes(term) || s.includes(term) || sec.includes(term);
    }));

    let cardBorder = 'border: 1px solid rgba(59, 130, 246, 0.35);';
    let cardShadow = 'box-shadow: 0 1px 4px rgba(0,0,0,0.25);';
    if (hasMemberMatch) {
      cardBorder = 'border: 1.5px solid #f59e0b;';
      cardShadow = 'box-shadow: 0 0 12px rgba(245, 158, 11, 0.28);';
    } else if (isCrewHeaderMatch) {
      cardBorder = 'border: 1.5px solid #38bdf8;';
      cardShadow = 'box-shadow: 0 0 12px rgba(56, 189, 248, 0.28);';
    }

    return `
      <div class="field-crew-card planned-crew-card"
           data-crew-job="${this.escapeHtml(crew.jobNumber)}"
           style="background: rgba(30, 41, 59, 0.7); ${cardBorder} border-radius: 8px; padding: 12px; display: flex; flex-direction: column; ${cardShadow} position: relative; transition: transform 0.15s ease, box-shadow 0.15s ease, border-color 0.15s ease;">
        
        <!-- Crew Header (Draggable to Reorder) -->
        <div class="planned-crew-header"
             draggable="true"
             data-crew-job="${this.escapeHtml(crew.jobNumber)}"
             style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 7px; border-bottom: 1px solid rgba(255,255,255,0.08); padding-bottom: 6px; cursor: grab; user-select: none;"
             title="Drag to reorder this crew card on the board">
          <div style="display: flex; align-items: flex-start; gap: 6px;">
            <div class="crew-card-drag-handle"
                 style="cursor: grab; display: flex; align-items: center; justify-content: center; width: 18px; height: 22px; border-radius: 3px; color: #94a3b8; font-size: 14px; user-select: none; margin-top: 1px; transition: background 0.15s, color 0.15s;"
                 title="Drag this crew to reorder it on the board"
                 onmouseover="this.style.color='#60a5fa'; this.style.background='rgba(96,165,250,0.15)';"
                 onmouseout="this.style.color='#94a3b8'; this.style.background='transparent';">
              ⠿
            </div>
            <div>
              <div style="display: flex; align-items: center; gap: 6px; font-weight: 800; font-size: 14px; color: #60a5fa;">
                <span>🚜</span>
                <span>${this.escapeHtml(crew.jobNumber)}</span>
                ${isCrewHeaderMatch ? `
                  <span class="badge" style="background: rgba(56, 189, 248, 0.25); color: #7dd3fc; border: 1px solid #38bdf8; font-size: 9px; font-weight: 700; padding: 1px 5px; border-radius: 3px;">
                    🔍 Match
                  </span>
                ` : ''}
                ${crew.jobName ? `<span style="font-size: 11px; font-weight: 600; color: #94a3b8;">— ${this.escapeHtml(crew.jobName)}</span>` : ''}
              </div>
              <div style="font-size: 11px; color: var(--text-muted, #94a3b8); margin-top: 2px; display: flex; align-items: center; gap: 6px;">
                <span>📍 ${this.escapeHtml(crew.location || 'Helena')}</span>
                <span style="color: rgba(255,255,255,0.25);">•</span>
                <span style="color: ${this.getCrewTypeInfo(crew.crewType).color}; font-weight: 700; display: inline-flex; align-items: center; gap: 3px;">
                  <span>${this.getCrewTypeInfo(crew.crewType).icon}</span>
                  <span>${this.escapeHtml(crew.crewType || 'Electric')}</span>
                </span>
              </div>
            </div>
          </div>
          <div style="display: flex; align-items: center; gap: 5px;">
            <!-- Board Order Quick Arrows -->
            <div style="display: flex; align-items: center; gap: 2px; background: rgba(0,0,0,0.25); border: 1px solid rgba(255,255,255,0.08); border-radius: 4px; padding: 1px 3px;">
              <button class="btn btn-xs" onclick="event.stopPropagation(); window.crewPlanningEngine.moveCrewOrder('${this.escapeJs(crew.jobNumber)}', -1)" style="background: transparent; border: none; color: #94a3b8; font-size: 10px; padding: 1px 4px; cursor: pointer; border-radius: 2px;" title="Move crew earlier (left/up) on board" onmouseover="this.style.color='#60a5fa'" onmouseout="this.style.color='#94a3b8'">◀</button>
              <button class="btn btn-xs" onclick="event.stopPropagation(); window.crewPlanningEngine.moveCrewOrder('${this.escapeJs(crew.jobNumber)}', 1)" style="background: transparent; border: none; color: #94a3b8; font-size: 10px; padding: 1px 4px; cursor: pointer; border-radius: 2px;" title="Move crew later (right/down) on board" onmouseover="this.style.color='#60a5fa'" onmouseout="this.style.color='#94a3b8'">▶</button>
            </div>
            <button class="btn btn-xs" onclick="event.stopPropagation(); window.crewPlanningEngine.promptEditPlannedCrew('${this.escapeJs(crew.jobNumber)}')" style="font-size: 10.5px; font-weight: 700; padding: 2px 7px; background: rgba(59, 130, 246, 0.12); border: 1px solid rgba(59, 130, 246, 0.35); color: #93c5fd; border-radius: 4px; cursor: pointer; display: inline-flex; align-items: center; gap: 4px;" title="Edit planned crew metadata (Location, Job Name, Discipline, Status, Schedule)">
              ✏️ Edit
            </button>
            <span class="badge" style="background: rgba(59, 130, 246, 0.18); color: #93c5fd; font-size: 10.5px; font-weight: 700; padding: 2px 6px; border-radius: 4px;">
              ${crew.members.length} Members
            </span>
          </div>
        </div>

        <!-- Schedule & Working Days Bar -->
        <div style="background: rgba(0, 0, 0, 0.22); border: 1px solid rgba(255, 255, 255, 0.07); border-radius: 5px; padding: 4px 7px; margin-bottom: 7px; display: flex; align-items: center; justify-content: space-between; gap: 6px;">
          <div style="display: flex; align-items: center; gap: 4px; min-width: 0; flex: 1;">
            <span style="font-size: 11px;">🕒</span>
            <span style="font-size: 10.5px; font-weight: 700; color: #93c5fd; background: rgba(59, 130, 246, 0.15); border: 1px solid rgba(59, 130, 246, 0.3); padding: 1px 6px; border-radius: 3px; cursor: pointer; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;"
                  onclick="event.stopPropagation(); window.crewPlanningEngine.openScheduleEditModal('${this.escapeJs(crew.jobNumber)}')"
                  title="Click to adjust schedule preset or hours (${this.escapeHtml(crew.schedule || 'Mon-Thu (4 10s)')})">
              ${this.escapeHtml(crew.schedule || 'Mon-Thu (4 10s)')} ✏️
            </span>
          </div>
          <!-- Clickable Day Pills -->
          <div style="display: flex; gap: 2.5px; align-items: center; flex-shrink: 0;">
            ${dayPillsHtml}
          </div>
        </div>

        <!-- Foreman Row -->
        <div style="display: flex; align-items: center; justify-content: space-between; background: rgba(0,0,0,0.2); padding: 4px 8px; border-radius: 4px; margin-bottom: 8px; font-size: 11.5px;">
          <div style="display: flex; align-items: center; gap: 6px;">
            <span style="font-weight: 700; color: #94a3b8;">Foreman:</span>
            ${crew.foreman ? `
              <span style="color: #f472b6; font-weight: 700; display: inline-flex; align-items: center; gap: 4px; cursor: pointer;"
                    onclick="event.stopPropagation(); if(window.employeeProfileEngine){window.employeeProfileEngine.openProfileModal('${this.escapeJs(crew.foreman)}');}"
                    onmouseover="this.style.color='#60a5fa'; this.style.textDecoration='underline';"
                    onmouseout="this.style.color='#f472b6'; this.style.textDecoration='none';"
                    title="Click to open Employee Profile for ${this.escapeHtml(crew.foreman)}">
                <span>👑</span> ${this.escapeHtml(crew.foreman)}
              </span>
            ` : `<span style="color: #64748b; font-style: italic;">(None designated)</span>`}
          </div>
          <button class="btn btn-xs" onclick="window.crewPlanningEngine.promptChangePlannedForeman('${this.escapeJs(crew.jobNumber)}')" style="font-size: 10px; padding: 1px 6px; background: transparent; border: 1px solid rgba(255,255,255,0.1); color: #94a3b8; border-radius: 3px; cursor: pointer;">
            Change
          </button>
        </div>

        <!-- Member Drop Zone -->
        <div class="crew-drop-zone planned-drop-zone"
             data-crew-job="${this.escapeHtml(crew.jobNumber)}"
             style="flex: 1; min-height: 48px; border-radius: 6px; padding: 2px; display: flex; flex-direction: column; gap: 3px;">
          ${crew.members.length > 0 ? crew.members.map(m => {
            const isForeman = this.isCrewForeman(crew, m.name);
            const statusInfo = this.getEmployeePlanningStatus(m.name, crew.jobNumber, null, plan, baselineMap, occMap);

            const isMemberMatch = Boolean(term && (
              (m.name && m.name.toLowerCase().includes(term)) ||
              (m.classification && m.classification.toLowerCase().includes(term)) ||
              (m.slot && m.slot.toLowerCase().includes(term)) ||
              (m.secondaryJob && m.secondaryJob.toLowerCase().includes(term))
            ));

            // Conditional Row Styles
            let rowBg = 'transparent';
            let rowBorder = 'border-bottom: 1px dashed rgba(255,255,255,0.06);';
            let statusBadge = '';

            if (isMemberMatch) {
              rowBg = 'background: rgba(245, 158, 11, 0.22);';
              rowBorder = 'border: 1.5px solid #f59e0b; border-left: 4px solid #f59e0b; box-shadow: 0 0 8px rgba(245, 158, 11, 0.3);';
            } else if (statusInfo.statusColor === 'purple') {
              rowBg = 'background: rgba(147, 51, 234, 0.16);';
              rowBorder = 'border: 1px solid rgba(168, 85, 247, 0.45); border-left: 3.5px solid #c084fc;';
              statusBadge = `
                <span class="badge"
                      onclick="event.stopPropagation(); window.crewPlanningEngine.toggleConfirmMemberPosition('${this.escapeJs(m.name)}', '${this.escapeJs(crew.jobNumber)}')"
                      style="background: rgba(147, 51, 234, 0.3); color: #d8b4fe; border: 1px solid #c084fc; font-size: 9.5px; font-weight: 700; padding: 1px 6px; border-radius: 3px; cursor: pointer; display: inline-flex; align-items: center; gap: 3px;"
                      title="${this.escapeHtml(statusInfo.title)}">
                  🟣 ${this.escapeHtml(statusInfo.badgeText)} <span style="font-size: 8.5px; opacity: 0.85;">(Confirm)</span>
                </span>
              `;
            } else if (statusInfo.statusColor === 'yellow') {
              rowBg = 'background: rgba(234, 179, 8, 0.16);';
              rowBorder = 'border: 1px solid rgba(234, 179, 8, 0.45); border-left: 3.5px solid #facc15;';
              statusBadge = `
                <span class="badge"
                      onclick="event.stopPropagation(); window.crewPlanningEngine.toggleConfirmMemberPosition('${this.escapeJs(m.name)}', '${this.escapeJs(crew.jobNumber)}')"
                      style="background: rgba(234, 179, 8, 0.28); color: #fde047; border: 1px solid #facc15; font-size: 9.5px; font-weight: 800; padding: 1px 6px; border-radius: 3px; cursor: pointer; display: inline-flex; align-items: center; gap: 3px;"
                      title="${this.escapeHtml(statusInfo.title)} — Click to unconfirm">
                  🟡 ${this.escapeHtml(statusInfo.badgeText || 'Confirmed')}
                </span>
              `;
            }

            const quitEntry = (plan.sidePane?.quit || []).find(q => q.name.trim().toLowerCase() === m.name.trim().toLowerCase());
            const departureDate = m.departureDate || (quitEntry?.isScheduledDeparture ? quitEntry.departureDate : null);
            const departureReason = m.departureReason || quitEntry?.departureReason || 'Quit';

            const vacEntry = (plan.sidePane?.vacation || []).find(v => v.name.trim().toLowerCase() === m.name.trim().toLowerCase());
            const vacDateRange = m.vacationDateRange || vacEntry?.dateRange || vacEntry?.vacationStartDate || null;
            const isFutureVac = Boolean(m.isFutureVacation || vacEntry?.isFutureVacation);
            const vacNotes = m.vacationNotes || vacEntry?.notes || '';

            let secondJobPill = '';
            if (statusInfo.isMultiLocation) {
              const otherOcc = (statusInfo.occurrences || []).find(o => o.baseJob && o.baseJob.toLowerCase() !== crew.jobNumber.toLowerCase());
              if (otherOcc) {
                const jtTable = window.db ? window.db.getTable('job_tracking') : null;
                const getCrewStatus = (bj) => {
                  if (!bj || !jtTable) return '';
                  const jRow = (jtTable.rows || []).find(j => {
                    const jn = String(j['Job Number'] || j['Job #'] || '').trim().replace(/\.\d+.*$/, '');
                    return jn.toLowerCase() === String(bj).trim().toLowerCase();
                  });
                  return String(jRow?.['Status'] || '').trim();
                };
                const isPendingOrHold = (st) => /pending|hold/i.test(st);

                const currentStatus = getCrewStatus(crew.jobNumber);
                const otherStatus = getCrewStatus(otherOcc.baseJob);

                let pillType = '2nd';
                let pillTitle = `Secondary Crew Assignment: ${otherOcc.slot || otherOcc.baseJob}`;
                if (isPendingOrHold(currentStatus) && !isPendingOrHold(otherStatus)) {
                  pillType = '1st';
                  pillTitle = `Primary (Active) Job: Crew ${otherOcc.slot || otherOcc.baseJob}`;
                } else if (!isPendingOrHold(currentStatus) && isPendingOrHold(otherStatus)) {
                  pillType = '2nd';
                  pillTitle = `Secondary (Pending) Job: Crew ${otherOcc.slot || otherOcc.baseJob}`;
                }

                const otherSlotText = otherOcc.slot || otherOcc.baseJob;
                secondJobPill = `
                  <span class="badge second-job-pill"
                        onclick="event.stopPropagation(); window.crewPlanningEngine.promptEditPlannedSecondJob('${this.escapeJs(m.name)}', '${this.escapeJs(crew.jobNumber)}')"
                        style="background: rgba(245, 158, 11, 0.18); color: #fbbf24; border: 1px solid rgba(245, 158, 11, 0.45); font-size: 9.5px; font-weight: 700; padding: 1px 6px; border-radius: 3px; cursor: pointer; transition: all 0.15s ease; display: inline-flex; align-items: center; gap: 3px;"
                        onmouseover="this.style.background='rgba(245, 158, 11, 0.35)'; this.style.borderColor='#f59e0b';"
                        onmouseout="this.style.background='rgba(245, 158, 11, 0.18)'; this.style.borderColor='rgba(245, 158, 11, 0.45)';"
                        title="${this.escapeHtml(pillTitle)} — Click to edit, swap, or remove 1st/2nd job">
                    ⚡ ${pillType}: ${this.escapeHtml(otherSlotText)} <span style="font-size: 8.5px; opacity: 0.85;">✏️</span>
                  </span>
                `;
              }
            }

            return `
              <div class="crew-member-row planned-member-row ${statusInfo.statusColor !== 'normal' ? 'member-row-' + statusInfo.statusColor : ''}"
                   draggable="true"
                   data-emp-name="${this.escapeHtml(m.name)}"
                   data-job-number="${this.escapeHtml(m.slot || crew.jobNumber)}"
                   data-base-job="${this.escapeHtml(crew.jobNumber)}"
                   style="display: flex; justify-content: space-between; align-items: center; padding: 4px 6px; ${rowBorder} ${rowBg} font-size: 12px; border-radius: 4px; cursor: grab; transition: all 0.15s ease;">
                <div style="display: flex; align-items: center; gap: 6px; flex: 1; min-width: 0; flex-wrap: wrap;">
                  <span class="drag-handle" style="color: #64748b; font-size: 13px; user-select: none;" title="Drag up/down to reorder • Drag to other crew • Alt/Ctrl+Drag to duplicate">⠿</span>
                  <span style="font-family: monospace; font-size: 11px; color: #94a3b8;">${this.escapeHtml(m.slot || '—')}</span>
                  <span style="font-weight: ${isForeman ? '700' : '500'}; color: ${isForeman ? '#f472b6' : 'inherit'}; cursor: pointer;"
                        onclick="event.stopPropagation(); if(window.employeeProfileEngine){window.employeeProfileEngine.openProfileModal('${this.escapeJs(m.name)}');}"
                        onmouseover="this.style.color='#60a5fa'; this.style.textDecoration='underline';"
                        onmouseout="this.style.color='${isForeman ? '#f472b6' : 'inherit'}'; this.style.textDecoration='none';"
                        title="Click to open Employee Profile for ${this.escapeHtml(m.name)}">
                    ${isForeman ? '👑 ' : ''}${this.escapeHtml(m.name)}
                  </span>
                  ${isMemberMatch ? `
                    <span class="badge" style="background: #f59e0b; color: #000; font-size: 9px; font-weight: 800; padding: 1px 5px; border-radius: 3px; box-shadow: 0 1px 3px rgba(0,0,0,0.3);">
                      🔍 Match
                    </span>
                  ` : ''}
                  ${secondJobPill}
                  ${departureDate ? `
                    <span class="badge"
                          onclick="event.stopPropagation(); window.crewPlanningEngine.editQuitDeparture('${this.escapeJs(m.name)}')"
                          style="background: rgba(239, 68, 68, 0.22); color: #fca5a5; border: 1px solid rgba(239, 68, 68, 0.4); font-size: 9.5px; font-weight: 700; padding: 1px 6px; border-radius: 3px; cursor: pointer; display: inline-flex; align-items: center; gap: 3px;"
                          title="Scheduled Last Working Day: ${this.escapeHtml(departureDate)} (${this.escapeHtml(departureReason)}) — Click to edit">
                      🚪 Last Day: ${this.escapeHtml(departureDate)}
                    </span>
                  ` : ''}
                  ${(vacDateRange || vacEntry) ? `
                    <span class="badge"
                          onclick="event.stopPropagation(); window.crewPlanningEngine.editVacationSchedule('${this.escapeJs(m.name)}')"
                          style="background: rgba(245, 158, 11, 0.2); color: #fcd34d; border: 1px solid rgba(245, 158, 11, 0.45); font-size: 9.5px; font-weight: 700; padding: 1px 6px; border-radius: 3px; cursor: pointer; display: inline-flex; align-items: center; gap: 3px;"
                          title="${isFutureVac ? 'Future Scheduled Vacation' : 'Scheduled Vacation'}: ${this.escapeHtml(vacDateRange || 'Dates not set')}${vacNotes ? ' (' + this.escapeHtml(vacNotes) + ')' : ''} — Click to edit dates or week scope">
                      🏖️ ${isFutureVac ? 'Future Vac' : 'Vac'}: ${this.escapeHtml(vacDateRange || 'Add Dates')} ✏️
                    </span>
                  ` : ''}
                  ${statusBadge}
                </div>
                <div style="display: flex; align-items: center; gap: 3px; flex-shrink: 0;">
                  <span class="badge"
                        onclick="event.stopPropagation(); if(window.employeeProfileEngine){window.employeeProfileEngine.openProfileModal('${this.escapeJs(m.name)}', 'details');}"
                        style="background: rgba(255,255,255,0.06); color: #94a3b8; font-size: 9.5px; padding: 1px 5px; border-radius: 3px; cursor: pointer;"
                        title="Click to edit classification & profile details for ${this.escapeHtml(m.name)}">
                    ${this.escapeHtml(m.classification || m.role || '—')}
                  </span>
                  <button class="btn btn-xs"
                          onclick="event.stopPropagation(); window.crewPlanningEngine.moveMemberUpInCrew('${this.escapeJs(m.name)}', '${this.escapeJs(crew.jobNumber)}')"
                          style="background: transparent; border: 1px solid rgba(255,255,255,0.08); color: #94a3b8; font-size: 8.5px; padding: 1px 4px; border-radius: 3px; cursor: pointer; line-height: 1;"
                          title="Move Up in Crew">
                    ▲
                  </button>
                  <button class="btn btn-xs"
                          onclick="event.stopPropagation(); window.crewPlanningEngine.moveMemberDownInCrew('${this.escapeJs(m.name)}', '${this.escapeJs(crew.jobNumber)}')"
                          style="background: transparent; border: 1px solid rgba(255,255,255,0.08); color: #94a3b8; font-size: 8.5px; padding: 1px 4px; border-radius: 3px; cursor: pointer; line-height: 1;"
                          title="Move Down in Crew">
                    ▼
                  </button>
                  <button class="btn btn-xs"
                          onclick="window.crewPlanningEngine.promptDuplicateMember('${this.escapeJs(m.name)}', '${this.escapeJs(crew.jobNumber)}')"
                          style="background: transparent; border: 1px solid rgba(168, 85, 247, 0.3); color: #c084fc; font-size: 10px; padding: 1px 5px; border-radius: 3px; cursor: pointer;"
                          title="Duplicate this employee to another crew or category">
                    👯
                  </button>
                  <button class="btn btn-xs"
                          onclick="window.crewPlanningEngine.openPlannedMemberActions(event, '${this.escapeJs(m.name)}', '${this.escapeJs(crew.jobNumber)}')"
                          style="background: transparent; border: none; color: #94a3b8; padding: 1px 4px; font-size: 12px; cursor: pointer;"
                          title="Member options">
                    ⋮
                  </button>
                </div>
              </div>
            `;
          }).join('') : `
            <div style="color: #64748b; font-size: 11.5px; font-style: italic; padding: 14px; text-align: center; border: 1px dashed rgba(255,255,255,0.1); border-radius: 4px;">
              Drop employees here to assign
            </div>
          `}
        </div>

      </div>
    `;
  }

  /**
   * Renders the expanded staging side pane with category drop zones.
   */
  renderExpandedSidePane(plan, baselineMap, occMap, sTerm = '') {
    if (!baselineMap) baselineMap = this.getOriginalEmployeeLocations();
    if (!occMap) occMap = this.getEmployeeOccurrencesMap(plan);

    const sp = plan.sidePane;
    const term = (sTerm || this.searchTerm || '').toLowerCase().trim();

    const renderSideList = (title, icon, color, badgeBg, list, typeKey) => {
      const rawList = list || [];
      const filteredList = term ? rawList.filter(item => {
        if (!item) return false;
        const n = String(item.name || '').toLowerCase();
        const c = String(item.classification || '').toLowerCase();
        const j = String(item.currentJob || '').toLowerCase();
        const ac = String(item.activeCrew || '').toLowerCase();
        const nt = String(item.note || item.dateRange || item.departureReason || item.departureDate || '').toLowerCase();
        return n.includes(term) || c.includes(term) || j.includes(term) || ac.includes(term) || nt.includes(term);
      }) : rawList;

      const badgeText = (term && filteredList.length !== rawList.length)
        ? `${filteredList.length} / ${rawList.length}`
        : `${rawList.length}`;

      return `
        <div class="side-pane-section" data-side-type="${typeKey}" style="margin-bottom: 12px; background: rgba(0,0,0,0.2); border: 1px solid rgba(255,255,255,0.06); border-radius: 6px; overflow: hidden;">
          <div style="display: flex; justify-content: space-between; align-items: center; padding: 6px 10px; background: rgba(255,255,255,0.03); border-bottom: 1px solid rgba(255,255,255,0.06); font-size: 12px; font-weight: 700; color: ${color};">
            <span style="display: flex; align-items: center; gap: 6px;">
              <span>${icon}</span> ${title}
            </span>
            <span class="badge" style="background: ${badgeBg}; color: ${color}; font-size: 10px; padding: 1px 6px; border-radius: 10px;">
              ${badgeText}
            </span>
          </div>
          <!-- Drop Zone -->
          <div class="side-drop-zone" data-side-type="${typeKey}" style="min-height: 38px; padding: 4px; display: flex; flex-direction: column; gap: 4px;">
            ${filteredList.length > 0 ? filteredList.map(item => {
              const statusInfo = this.getEmployeePlanningStatus(item.name, null, typeKey, plan, baselineMap, occMap);
              const isItemMatch = Boolean(term && (
                (item.name && item.name.toLowerCase().includes(term)) ||
                (item.classification && item.classification.toLowerCase().includes(term)) ||
                (item.currentJob && item.currentJob.toLowerCase().includes(term)) ||
                (item.activeCrew && item.activeCrew.toLowerCase().includes(term)) ||
                (item.note && String(item.note).toLowerCase().includes(term))
              ));

              let itemBg = 'background: rgba(255,255,255,0.04);';
              let itemBorder = '';
              let statusBadge = '';

              if (isItemMatch) {
                itemBg = 'background: rgba(245, 158, 11, 0.22);';
                itemBorder = 'border: 1.5px solid #f59e0b; border-left: 3.5px solid #f59e0b;';
              } else if (statusInfo.statusColor === 'purple') {
                itemBg = 'background: rgba(147, 51, 234, 0.16);';
                itemBorder = 'border-left: 3px solid #c084fc;';
                statusBadge = `
                  <span class="badge"
                        onclick="event.stopPropagation(); window.crewPlanningEngine.toggleConfirmMemberPosition('${this.escapeJs(item.name)}', '${typeKey}')"
                        style="background: rgba(147, 51, 234, 0.3); color: #d8b4fe; border: 1px solid #c084fc; font-size: 9px; font-weight: 700; padding: 1px 5px; border-radius: 3px; cursor: pointer;"
                        title="${this.escapeHtml(statusInfo.title)}">
                    🟣 ${this.escapeHtml(statusInfo.badgeText)}
                  </span>
                `;
              } else if (statusInfo.statusColor === 'yellow') {
                itemBg = 'background: rgba(234, 179, 8, 0.16);';
                itemBorder = 'border-left: 3px solid #facc15;';
                statusBadge = `
                  <span class="badge"
                        onclick="event.stopPropagation(); window.crewPlanningEngine.toggleConfirmMemberPosition('${this.escapeJs(item.name)}', '${typeKey}')"
                        style="background: rgba(234, 179, 8, 0.28); color: #fde047; border: 1px solid #facc15; font-size: 9px; font-weight: 800; padding: 1px 5px; border-radius: 3px; cursor: pointer;"
                        title="${this.escapeHtml(statusInfo.title)} — Click to unconfirm">
                    🟡 Confirmed
                  </span>
                `;
              }

              return `
                <div class="side-member-row side-pane-item"
                     draggable="true"
                     data-emp-name="${this.escapeHtml(item.name)}"
                     data-from-side="${typeKey}"
                     style="display: flex; justify-content: space-between; align-items: center; ${itemBg} ${itemBorder} padding: 4px 6px; border-radius: 4px; font-size: 11.5px; cursor: grab; transition: all 0.15s ease;">
                  <div style="display: flex; align-items: center; gap: 5px; flex: 1; min-width: 0; flex-wrap: wrap;">
                    <span class="drag-handle" style="color: #64748b; font-size: 12px; user-select: none;">⠿</span>
                    <span style="font-weight: 600; cursor: pointer;"
                          onclick="event.stopPropagation(); if(window.employeeProfileEngine){window.employeeProfileEngine.openProfileModal('${this.escapeJs(item.name)}');}"
                          onmouseover="this.style.color='#60a5fa'; this.style.textDecoration='underline';"
                          onmouseout="this.style.color='inherit'; this.style.textDecoration='none';"
                          title="Click to open Employee Profile for ${this.escapeHtml(item.name)}">${this.escapeHtml(item.name)}</span>
                    ${isItemMatch ? `
                      <span class="badge" style="background: #f59e0b; color: #000; font-size: 8.5px; font-weight: 800; padding: 1px 4px; border-radius: 2px;">
                        🔍 Match
                      </span>
                    ` : ''}
                    ${typeKey === 'quit' ? `
                      ${item.departureDate ? `
                        <span class="badge" onclick="event.stopPropagation(); window.crewPlanningEngine.editQuitDeparture('${this.escapeJs(item.name)}')" style="background: rgba(239, 68, 68, 0.22); color: #fca5a5; border: 1px solid rgba(239, 68, 68, 0.4); font-size: 9.5px; font-weight: 700; padding: 1px 6px; border-radius: 3px; cursor: pointer; display: inline-flex; align-items: center; gap: 3px;" title="Last Day: ${this.escapeHtml(item.departureDate)} (${this.escapeHtml(item.departureReason || 'Quit')}) — Click to edit">
                          📅 Last Day: ${this.escapeHtml(item.departureDate)}
                        </span>
                        <button class="btn btn-xs" onclick="event.stopPropagation(); window.crewPlanningEngine.editQuitDeparture('${this.escapeJs(item.name)}')" style="background: transparent; border: none; color: #94a3b8; font-size: 9.5px; padding: 0 2px; cursor: pointer;" title="Edit Last Day Date / Details">✏️</button>
                      ` : `
                        <span class="badge" onclick="event.stopPropagation(); window.crewPlanningEngine.editQuitDeparture('${this.escapeJs(item.name)}')" style="background: rgba(239, 68, 68, 0.35); color: #fee2e2; border: 1px dashed #ef4444; font-size: 9.5px; font-weight: 800; padding: 1px 6px; border-radius: 3px; cursor: pointer; display: inline-flex; align-items: center; gap: 3px;" title="Click to add Last Working Day">
                          ⚠️ Add Last Day
                        </span>
                      `}
                      ${item.isScheduledDeparture ? `
                        <span style="color: #60a5fa; font-size: 10px; font-weight: 600;" title="Active on field crew until recorded last day">
                          (Active on Crew ${this.escapeHtml(item.activeCrew || item.currentJob || '—')})
                        </span>
                      ` : ''}
                    ` : typeKey === 'vacation' ? `
                      ${(item.dateRange || item.vacationStartDate) ? `
                        <span class="badge" onclick="event.stopPropagation(); window.crewPlanningEngine.editVacationSchedule('${this.escapeJs(item.name)}')" style="background: rgba(245, 158, 11, 0.22); color: #fcd34d; border: 1px solid rgba(245, 158, 11, 0.45); font-size: 9.5px; font-weight: 700; padding: 1px 6px; border-radius: 3px; cursor: pointer; display: inline-flex; align-items: center; gap: 3px;" title="Vacation Dates: ${this.escapeHtml(item.dateRange || item.vacationStartDate)}${item.notes ? ' — ' + this.escapeHtml(item.notes) : ''} (Click to edit dates or week scope)">
                          📅 ${this.escapeHtml(item.dateRange || item.vacationStartDate)}
                        </span>
                        <button class="btn btn-xs" onclick="event.stopPropagation(); window.crewPlanningEngine.editVacationSchedule('${this.escapeJs(item.name)}')" style="background: transparent; border: none; color: #94a3b8; font-size: 9.5px; padding: 0 2px; cursor: pointer;" title="Edit Vacation Dates & Scope">✏️</button>
                      ` : `
                        <span class="badge" onclick="event.stopPropagation(); window.crewPlanningEngine.editVacationSchedule('${this.escapeJs(item.name)}')" style="background: rgba(245, 158, 11, 0.32); color: #fef3c7; border: 1px dashed #f59e0b; font-size: 9.5px; font-weight: 800; padding: 1px 6px; border-radius: 3px; cursor: pointer; display: inline-flex; align-items: center; gap: 3px;" title="Click to add Vacation Dates and clarify whether this is for this week or a future week">
                          ⚠️ Add Vacation Dates
                        </span>
                      `}
                      ${item.isFutureVacation ? `
                        <span class="badge" onclick="event.stopPropagation(); window.crewPlanningEngine.editVacationSchedule('${this.escapeJs(item.name)}')" style="background: rgba(59, 130, 246, 0.2); color: #93c5fd; border: 1px solid rgba(59, 130, 246, 0.4); font-size: 9px; font-weight: 700; padding: 1px 5px; border-radius: 3px; cursor: pointer;" title="Future Week Vacation — Employee remains active on Crew ${this.escapeHtml(item.activeCrew || item.priorBaseJob || item.currentJob || 'Field')} this week">
                          ⏭️ Future Wk${(item.activeCrew || item.priorBaseJob) ? ' (Active: ' + this.escapeHtml(item.activeCrew || item.priorBaseJob) + ')' : ''}
                        </span>
                      ` : (item.dateRange || item.vacationStartDate || item.isFutureVacation === false) ? `
                        <span class="badge" onclick="event.stopPropagation(); window.crewPlanningEngine.editVacationSchedule('${this.escapeJs(item.name)}')" style="background: rgba(16, 185, 129, 0.16); color: #6ee7b7; border: 1px solid rgba(16, 185, 129, 0.35); font-size: 9px; font-weight: 700; padding: 1px 5px; border-radius: 3px; cursor: pointer;" title="${item.keepOnCrew ? 'Partial-week vacation — Kept on Crew ' + this.escapeHtml(item.activeCrew || item.priorBaseJob || '') : 'Off on vacation during this planned week'}">
                          🗓️ This Wk${item.keepOnCrew ? ' (On Crew)' : ''}
                        </span>
                      ` : ''}
                      ${item.notes ? `<span style="color: #94a3b8; font-size: 10px;">(${this.escapeHtml(item.notes)})</span>` : ''}
                    ` : (item.note || item.dateRange ? `<span style="color: #64748b; font-size: 10px;">(${this.escapeHtml(item.note || item.dateRange)})</span>` : '')}
                    ${statusBadge}
                  </div>
                  <div style="display: flex; align-items: center; gap: 3px;">
                    ${item.currentJob ? `<span style="font-size: 9.5px; color: #94a3b8; font-family: monospace;">${this.escapeHtml(item.currentJob)}</span>` : ''}
                    <button class="btn btn-xs"
                            onclick="window.crewPlanningEngine.promptDuplicateMember('${this.escapeJs(item.name)}', '', '${typeKey}')"
                            style="background: transparent; border: none; color: #c084fc; font-size: 11px; padding: 0 3px; cursor: pointer;"
                            title="Duplicate">👯</button>
                    <button class="btn btn-xs"
                            onclick="window.crewPlanningEngine.removeMemberFromSideCategory('${this.escapeJs(item.name)}', '${typeKey}')"
                            style="background: transparent; border: none; color: #ef4444; font-size: 11px; padding: 0 3px; cursor: pointer;"
                            title="Remove">✕</button>
                  </div>
                </div>
              `;
            }).join('') : (term && rawList.length > 0 ? `
              <div style="color: #64748b; font-size: 10.5px; font-style: italic; padding: 6px; text-align: center;">
                No matches
              </div>
            ` : `
              <div style="color: #64748b; font-size: 10.5px; font-style: italic; padding: 6px; text-align: center;">
                Drop here to stage
              </div>
            `)}
          </div>
        </div>
      `;
    };

    return `
      <!-- Side Pane Header -->
      <div style="display: flex; justify-content: space-between; align-items: center; padding: 10px 12px; border-bottom: 1px solid var(--border-color, rgba(255,255,255,0.1));">
        <div style="font-weight: 800; font-size: 13px; color: #93c5fd; display: flex; align-items: center; gap: 6px;">
          <span>📋</span> Staging Side Pane
        </div>
        <button class="btn btn-xs" onclick="window.crewPlanningEngine.toggleSidebar()" style="background: transparent; border: none; color: #94a3b8; font-size: 12px; cursor: pointer;" title="Collapse side pane">
          ⇥
        </button>
      </div>

      <!-- Side Pane Category Lists -->
      <div class="side-pane-scroll-body" style="flex: 1; overflow-y: auto; padding: 10px;">
        ${renderSideList('Planning Pool (Floaters)', '📌', '#60a5fa', 'rgba(59, 130, 246, 0.2)', sp.planning, 'planning')}
        ${renderSideList('Scheduled Vacation', '🏖️', '#fbbf24', 'rgba(245, 158, 11, 0.2)', sp.vacation, 'vacation')}
        ${renderSideList('Quit / Notice', '🚪', '#f87171', 'rgba(239, 68, 68, 0.2)', sp.quit, 'quit')}
        ${renderSideList('Weeds (Job-Attached)', '🌾', '#a3e635', 'rgba(163, 230, 53, 0.2)', sp.weeds, 'weeds')}
        ${renderSideList('Light Duty / Medical', '🩺', '#34d399', 'rgba(52, 211, 153, 0.2)', sp.lightDuty, 'lightDuty')}
        ${renderSideList('Pending New Hires', '⏳', '#c084fc', 'rgba(192, 132, 252, 0.2)', sp.pendingHires, 'pendingHires')}
      </div>
    `;
  }

  renderCollapsedSidePane() {
    const plan = this.getPlanForWeek(this.selectedWeek);
    const sp = plan?.sidePane || { planning: [], vacation: [], quit: [], weeds: [], lightDuty: [] };

    return `
      <div style="display: flex; flex-direction: column; align-items: center; padding: 10px 4px; gap: 14px; height: 100%; box-sizing: border-box;">
        <button class="btn btn-xs" onclick="window.crewPlanningEngine.toggleSidebar()" style="background: transparent; border: none; color: #93c5fd; font-size: 14px; cursor: pointer;" title="Expand Staging Side Pane">
          ⇤
        </button>
        <div style="writing-mode: vertical-rl; transform: rotate(180deg); font-size: 11px; font-weight: 700; color: #94a3b8; letter-spacing: 1px;">
          STAGING PANE
        </div>
        <div style="display: flex; flex-direction: column; gap: 8px; margin-top: auto;">
          <span title="Planning Pool: ${sp.planning.length}" style="cursor: pointer;" onclick="window.crewPlanningEngine.toggleSidebar()">📌 ${sp.planning.length}</span>
          <span title="Vacation: ${sp.vacation.length}" style="cursor: pointer;" onclick="window.crewPlanningEngine.toggleSidebar()">🏖️ ${sp.vacation.length}</span>
          <span title="Quit: ${sp.quit.length}" style="cursor: pointer;" onclick="window.crewPlanningEngine.toggleSidebar()">🚪 ${sp.quit.length}</span>
          <span title="Weeds: ${sp.weeds.length}" style="cursor: pointer;" onclick="window.crewPlanningEngine.toggleSidebar()">🌾 ${sp.weeds.length}</span>
        </div>
      </div>
    `;
  }

  filterSideSearch(query) {
    const q = String(query || '').trim();
    this.searchTerm = q;
    if (window.sheetNavigator) {
      window.sheetNavigator.searchTerm = q.toLowerCase();
      const topSearch = document.getElementById('sheet-search-input');
      if (topSearch && topSearch.value !== q) {
        topSearch.value = q;
      }
      window.sheetNavigator.renderCurrentSheet();
    } else {
      const items = document.querySelectorAll('.side-pane-item');
      items.forEach(el => {
        if (!q) {
          el.style.display = '';
          return;
        }
        const text = el.textContent.toLowerCase();
        el.style.display = text.includes(q.toLowerCase()) ? '' : 'none';
      });
    }
  }

  /**
   * Renders a read-only historical roster for past reference weeks.
   */
  renderHistoricalWorkspace(container, countBadge, weekStr, incomingSearchTerm) {
    if (!container) return;
    const roster = this.getHistoricalRoster(weekStr);

    if (countBadge) {
      countBadge.style.display = 'none';
    }

    if (incomingSearchTerm !== undefined) {
      this.searchTerm = incomingSearchTerm;
    } else if (window.sheetNavigator && window.sheetNavigator.searchTerm !== undefined) {
      this.searchTerm = window.sheetNavigator.searchTerm;
    }
    const sTerm = (this.searchTerm || '').toLowerCase().trim();

    const matchingCrews = (roster.crews || []).filter(crew => this.isCrewMatchingSearch(crew, sTerm));

    container.innerHTML = `
      <div class="historical-roster-wrapper" style="height: 100%; overflow-y: auto; padding: 14px 18px; box-sizing: border-box;">
        
        <!-- Historical Reference Banner -->
        <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 10px; background: rgba(30, 41, 59, 0.8); border: 1px solid rgba(148, 163, 184, 0.3); border-radius: 8px; padding: 10px 16px; margin-bottom: 16px;">
          <div style="display: flex; align-items: center; gap: 10px;">
            <span style="font-size: 20px;">📜</span>
            <div>
              <div style="font-size: 14px; font-weight: 800; color: #93c5fd;">
                Historical Crew Structure — Week of ${this.escapeHtml(weekStr)}
              </div>
              <div style="font-size: 11.5px; color: #94a3b8;">
                Viewing frozen historical archive for past reference. This record is read-only.
              </div>
            </div>
          </div>
          <div style="display: flex; align-items: center; gap: 8px;">
            <button class="btn btn-secondary" onclick="window.crewPlanningEngine.openHistoricalExcelImportModal()" style="font-size: 11.5px; font-weight: 600; padding: 5px 10px; display: inline-flex; align-items: center; gap: 5px;">
              <span>📁</span> Import Historical Excel Tabs
            </button>
            <button class="btn btn-secondary" onclick="window.sheetNavigator.selectEmployeeWeek(window.crewPlanningEngine.getCurrentWeekSundayStr())" style="font-size: 11.5px; font-weight: 600; padding: 5px 10px; color: #60a5fa;">
              ⚡ Return to Current Week
            </button>
          </div>
        </div>

        <!-- Historical Crew Cards Grid -->
        <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(340px, 1fr)); gap: 14px;">
          ${matchingCrews.length > 0 ? matchingCrews.map(crew => `
            <div style="background: var(--bg-secondary, #1e293b); border: 1px solid var(--border-color, rgba(255,255,255,0.1)); border-radius: 8px; padding: 12px;">
              <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid rgba(255,255,255,0.06); padding-bottom: 6px; margin-bottom: 8px;">
                <div style="font-weight: 800; font-size: 13.5px; color: #93c5fd;">
                  🚜 ${this.escapeHtml(crew.jobNumber)}
                </div>
                <span class="badge" style="background: rgba(255,255,255,0.06); font-size: 10.5px; color: #94a3b8;">
                  📍 ${this.escapeHtml(crew.location || 'Helena')}
                </span>
              </div>
              <div style="font-size: 11.5px; margin-bottom: 6px; color: #f472b6; font-weight: 700;">
                👑 Foreman: ${crew.foreman ? `<span style="cursor: pointer;" onclick="event.stopPropagation(); if(window.employeeProfileEngine){window.employeeProfileEngine.openProfileModal('${this.escapeJs(crew.foreman)}');}" onmouseover="this.style.color='#60a5fa'; this.style.textDecoration='underline';" onmouseout="this.style.color='#f472b6'; this.style.textDecoration='none';" title="Click to open Employee Profile for ${this.escapeHtml(crew.foreman)}">${this.escapeHtml(crew.foreman)}</span>` : '—'}
              </div>
              <div style="display: flex; flex-direction: column; gap: 4px;">
                ${crew.members && crew.members.length > 0 ? crew.members.map(m => `
                  <div style="display: flex; justify-content: space-between; font-size: 12px; padding: 3px 4px; border-bottom: 1px dashed rgba(255,255,255,0.04);">
                    <span style="font-family: monospace; font-size: 11px; color: #94a3b8; min-width: 45px;">${this.escapeHtml(m.slot || '—')}</span>
                    <span style="flex: 1; margin-left: 6px; font-weight: 500; cursor: pointer;" onclick="event.stopPropagation(); if(window.employeeProfileEngine){window.employeeProfileEngine.openProfileModal('${this.escapeJs(m.name)}');}" onmouseover="this.style.color='#60a5fa'; this.style.textDecoration='underline';" onmouseout="this.style.color='inherit'; this.style.textDecoration='none';" title="Click to open Employee Profile for ${this.escapeHtml(m.name)}">${this.escapeHtml(m.name)}</span>
                    <span style="font-size: 10px; color: #64748b;">${this.escapeHtml(m.classification || m.role || '')}</span>
                  </div>
                `).join('') : '<div style="color: #64748b; font-size: 11px; font-style: italic;">No individual member records archived</div>'}
              </div>
            </div>
          `).join('') : `
            <div style="grid-column: 1 / -1; padding: 40px; text-align: center; color: #94a3b8;">
              <div style="font-size: 28px; margin-bottom: 8px;">🔍</div>
              <div>No archived roster found for this week. Use "Import Historical Excel Tabs" to populate.</div>
            </div>
          `}
        </div>

      </div>
    `;
  }

  // ==========================================================================
  // Drag & Drop Handlers for Planning Mode (Move or Alt/Ctrl+Duplicate)
  // ==========================================================================

  attachPlanningDragHandlers(container) {
    if (!container) return;

    // 0. Drag source on Planned Crew Headers / Drag Handles (reordering entire crew cards)
    container.querySelectorAll('.planned-crew-header[draggable="true"]').forEach(header => {
      header.addEventListener('dragstart', (e) => {
        // If user clicked a button or interactive child, don't drag crew card
        if (e.target.closest('button, select, input, a')) {
          e.preventDefault();
          return;
        }

        const crewJob = header.dataset.crewJob;
        if (!crewJob) return;

        const card = header.closest('.planned-crew-card');
        const dragData = {
          type: 'crew',
          jobNumber: crewJob
        };

        e.dataTransfer.setData('application/json', JSON.stringify(dragData));
        e.dataTransfer.effectAllowed = 'move';
        window._activePlanningCrewDrag = crewJob;
        window._activePlanningDragData = null;

        if (card) {
          card.classList.add('is-dragging-crew');
        }
      });

      header.addEventListener('dragend', () => {
        window._activePlanningCrewDrag = null;
        container.querySelectorAll('.planned-crew-card').forEach(c => {
          c.classList.remove('is-dragging-crew', 'crew-drop-before', 'crew-drop-after');
          c.style.borderLeft = '';
          c.style.borderRight = '';
          c.style.borderColor = '';
          c.style.boxShadow = '';
        });
      });
    });

    // 1. Drag source on member rows
    container.querySelectorAll('.planned-member-row[draggable="true"], .side-member-row[draggable="true"]').forEach(row => {
      row.addEventListener('dragstart', (e) => {
        const isCopy = e.altKey || e.ctrlKey;
        const dragData = {
          empName: row.dataset.empName,
          fromJobNumber: row.dataset.jobNumber || '',
          fromBaseJob: row.dataset.baseJob || '',
          fromSideType: row.dataset.fromSide || '',
          isCopy: isCopy
        };
        e.dataTransfer.setData('application/json', JSON.stringify(dragData));
        e.dataTransfer.effectAllowed = isCopy ? 'copy' : 'copyMove';
        row.style.opacity = '0.4';
        window._activePlanningDragData = dragData;
      });

      row.addEventListener('dragend', () => {
        row.style.opacity = '1';
        window._activePlanningDragData = null;
        container.querySelectorAll('.planned-crew-card, .side-pane-section').forEach(el => {
          el.style.borderColor = '';
          el.style.boxShadow = '';
        });
        container.querySelectorAll('.planned-member-row').forEach(el => {
          el.classList.remove('drag-over-top', 'drag-over-bottom', 'drag-over-top-copy', 'drag-over-bottom-copy');
        });
      });
    });

    // 2. Drop target on individual Planned Member Rows (reordering inside crew & targeted insert)
    container.querySelectorAll('.planned-member-row').forEach(targetRow => {
      targetRow.addEventListener('dragover', (e) => {
        // If a whole crew is being dragged, allow the event to bubble up to the crew card!
        if (window._activePlanningCrewDrag) {
          return;
        }

        e.preventDefault();
        e.stopPropagation(); // Prevent bubbling up to the crew card while targeting a row

        const activeData = window._activePlanningDragData;
        const isCopy = Boolean(e.altKey || e.ctrlKey || (activeData && activeData.isCopy));
        e.dataTransfer.dropEffect = isCopy ? 'copy' : 'move';

        // Check if dragging over itself in the same crew
        if (activeData && activeData.empName === targetRow.dataset.empName && activeData.fromBaseJob === targetRow.dataset.baseJob && !isCopy) {
          targetRow.classList.remove('drag-over-top', 'drag-over-bottom', 'drag-over-top-copy', 'drag-over-bottom-copy');
          return;
        }

        const rect = targetRow.getBoundingClientRect();
        const relY = e.clientY - rect.top;
        const isAbove = relY < rect.height / 2;

        if (isAbove) {
          targetRow.classList.add(isCopy ? 'drag-over-top-copy' : 'drag-over-top');
          targetRow.classList.remove('drag-over-bottom', 'drag-over-bottom-copy', isCopy ? 'drag-over-top' : 'drag-over-top-copy');
        } else {
          targetRow.classList.add(isCopy ? 'drag-over-bottom-copy' : 'drag-over-bottom');
          targetRow.classList.remove('drag-over-top', 'drag-over-top-copy', isCopy ? 'drag-over-bottom' : 'drag-over-bottom-copy');
        }
      });

      targetRow.addEventListener('dragleave', (e) => {
        if (!targetRow.contains(e.relatedTarget)) {
          targetRow.classList.remove('drag-over-top', 'drag-over-bottom', 'drag-over-top-copy', 'drag-over-bottom-copy');
        }
      });

      targetRow.addEventListener('drop', (e) => {
        // If a whole crew is being dragged, allow bubbling up to the crew card drop handler!
        if (window._activePlanningCrewDrag) {
          return;
        }

        e.preventDefault();
        e.stopPropagation(); // Do not trigger parent card's drop handler
        targetRow.classList.remove('drag-over-top', 'drag-over-bottom', 'drag-over-top-copy', 'drag-over-bottom-copy');

        let data = null;
        try {
          data = JSON.parse(e.dataTransfer.getData('application/json'));
        } catch { /* ignore */ }
        if (!data && window._activePlanningDragData) data = window._activePlanningDragData;
        if (!data) return;

        const isCopy = Boolean(e.altKey || e.ctrlKey || data.isCopy);
        const destJob = targetRow.dataset.baseJob;
        const targetEmpName = targetRow.dataset.empName;

        // Dropped on self in same crew: no-op
        if (!isCopy && data.empName === targetEmpName && data.fromBaseJob === destJob) return;

        const rect = targetRow.getBoundingClientRect();
        const relY = e.clientY - rect.top;
        const insertPosition = (relY < rect.height / 2) ? 'before' : 'after';

        this.handleReorderOrMoveMember(data, destJob, targetEmpName, insertPosition, isCopy);
      });
    });

    // 3. Drop target on Planned Crew Cards / Drop Zones (crew reordering OR member append)
    container.querySelectorAll('.planned-crew-card').forEach(card => {
      const destJob = card.dataset.crewJob;
      if (!destJob) return;

      card.addEventListener('dragover', (e) => {
        e.preventDefault();

        // CASE A: Whole crew is being dragged to reorder
        if (window._activePlanningCrewDrag) {
          const srcJob = window._activePlanningCrewDrag;
          if (srcJob === destJob) {
            card.classList.remove('crew-drop-before', 'crew-drop-after');
            card.style.borderLeft = '';
            card.style.borderRight = '';
            card.style.boxShadow = '';
            return;
          }
          e.dataTransfer.dropEffect = 'move';
          const rect = card.getBoundingClientRect();
          const relX = e.clientX - rect.left;
          const isBefore = relX < rect.width / 2;

          if (isBefore) {
            card.classList.add('crew-drop-before');
            card.classList.remove('crew-drop-after');
            card.style.borderLeft = '5px solid #38bdf8';
            card.style.borderRight = '';
          } else {
            card.classList.add('crew-drop-after');
            card.classList.remove('crew-drop-before');
            card.style.borderRight = '5px solid #38bdf8';
            card.style.borderLeft = '';
          }
          card.style.boxShadow = '0 0 14px rgba(56, 189, 248, 0.45)';
          return;
        }

        // CASE B: Member is being dragged
        const isCopy = e.altKey || e.ctrlKey || (window._activePlanningDragData && window._activePlanningDragData.isCopy);
        e.dataTransfer.dropEffect = isCopy ? 'copy' : 'move';
        card.style.borderColor = isCopy ? '#c084fc' : '#3b82f6';
        card.style.boxShadow = isCopy ? '0 0 10px rgba(168, 85, 247, 0.4)' : '0 0 10px rgba(59, 130, 246, 0.4)';
      });

      card.addEventListener('dragleave', (e) => {
        if (!card.contains(e.relatedTarget)) {
          card.classList.remove('crew-drop-before', 'crew-drop-after');
          card.style.borderColor = '';
          card.style.borderLeft = '';
          card.style.borderRight = '';
          card.style.boxShadow = '';
        }
      });

      card.addEventListener('drop', (e) => {
        e.preventDefault();
        card.classList.remove('crew-drop-before', 'crew-drop-after');
        card.style.borderColor = '';
        card.style.borderLeft = '';
        card.style.borderRight = '';
        card.style.boxShadow = '';

        let data = null;
        try {
          data = JSON.parse(e.dataTransfer.getData('application/json'));
        } catch { /* ignore */ }

        // CASE A: Crew Reorder Drop
        if ((data && data.type === 'crew') || window._activePlanningCrewDrag) {
          const srcJob = (data && data.jobNumber) || window._activePlanningCrewDrag;
          window._activePlanningCrewDrag = null;
          if (srcJob && srcJob !== destJob) {
            const rect = card.getBoundingClientRect();
            const relX = e.clientX - rect.left;
            const isBefore = relX < rect.width / 2;
            this.reorderCrew(srcJob, destJob, isBefore ? 'before' : 'after');
          }
          return;
        }

        // CASE B: Member Drop
        if (!data && window._activePlanningDragData) data = window._activePlanningDragData;

        if (data) {
          const isCopy = Boolean(e.altKey || e.ctrlKey || data.isCopy);
          this.handleReorderOrMoveMember(data, destJob, null, 'end', isCopy);
        }
      });
    });

    // 3.5 Drop target on planned crews grid background (to move to end)
    const grid = container.querySelector('.planned-crews-grid');
    if (grid) {
      grid.addEventListener('dragover', (e) => {
        if (window._activePlanningCrewDrag) {
          e.preventDefault();
          e.dataTransfer.dropEffect = 'move';
        }
      });

      grid.addEventListener('drop', (e) => {
        if (window._activePlanningCrewDrag && (e.target === grid || (e.target.closest('.planned-crews-grid') === grid && !e.target.closest('.planned-crew-card')))) {
          e.preventDefault();
          const srcJob = window._activePlanningCrewDrag;
          window._activePlanningCrewDrag = null;
          this.reorderCrew(srcJob, null, 'end');
        }
      });
    }

    // 4. Drop target on Side Pane Categories
    container.querySelectorAll('.side-pane-section').forEach(sec => {
      const destSideType = sec.dataset.sideType;
      if (!destSideType) return;

      sec.addEventListener('dragover', (e) => {
        if (window._activePlanningCrewDrag) return;
        e.preventDefault();
        const isCopy = e.altKey || e.ctrlKey || (window._activePlanningDragData && window._activePlanningDragData.isCopy);
        e.dataTransfer.dropEffect = isCopy ? 'copy' : 'move';
        sec.style.borderColor = isCopy ? '#c084fc' : '#f59e0b';
      });

      sec.addEventListener('dragleave', (e) => {
        if (!sec.contains(e.relatedTarget)) {
          sec.style.borderColor = '';
        }
      });

      sec.addEventListener('drop', (e) => {
        if (window._activePlanningCrewDrag) return;
        e.preventDefault();
        sec.style.borderColor = '';

        let data = null;
        try {
          data = JSON.parse(e.dataTransfer.getData('application/json'));
        } catch { /* ignore */ }
        if (!data && window._activePlanningDragData) data = window._activePlanningDragData;

        if (data) {
          const isCopy = Boolean(e.altKey || e.ctrlKey || data.isCopy);
          this.handleMoveToSideCategory(data, destSideType, isCopy);
        }
      });
    });
  }

  /**
   * Reorders a planned crew card to be placed before or after another crew card, or at the end.
   */
  reorderCrew(srcJobNumber, targetJobNumber, position = 'before') {
    const plan = this.getPlanForWeek(this.selectedWeek);
    if (!plan || !Array.isArray(plan.crews)) return;

    const fromIdx = plan.crews.findIndex(c => c.jobNumber.toLowerCase() === String(srcJobNumber || '').toLowerCase());
    if (fromIdx === -1) return;

    const [movedCrew] = plan.crews.splice(fromIdx, 1);

    if (position === 'end' || !targetJobNumber) {
      plan.crews.push(movedCrew);
    } else {
      let toIdx = plan.crews.findIndex(c => c.jobNumber.toLowerCase() === String(targetJobNumber || '').toLowerCase());
      if (toIdx === -1) {
        plan.crews.push(movedCrew);
      } else {
        if (position === 'after') {
          toIdx += 1;
        }
        plan.crews.splice(toIdx, 0, movedCrew);
      }
    }

    this.savePlan(plan);
    this.refreshView();

    if (typeof window.showToast === 'function') {
      if (position === 'end' || !targetJobNumber) {
        window.showToast(`🚜 Moved Crew ${srcJobNumber} to the end of the board.`, 'info');
      } else {
        window.showToast(`🚜 Moved Crew ${srcJobNumber} ${position} Crew ${targetJobNumber}.`, 'info');
      }
    }
  }

  /**
   * Moves a planned crew earlier (-1) or later (+1) in the board display order.
   */
  moveCrewOrder(jobNumber, delta) {
    const plan = this.getPlanForWeek(this.selectedWeek);
    if (!plan || !Array.isArray(plan.crews)) return;

    const idx = plan.crews.findIndex(c => c.jobNumber.toLowerCase() === String(jobNumber || '').toLowerCase());
    if (idx === -1) return;

    const targetIdx = idx + delta;
    if (targetIdx < 0 || targetIdx >= plan.crews.length) {
      if (typeof window.showToast === 'function') {
        window.showToast(`Crew ${jobNumber} is already at the ${delta < 0 ? 'start' : 'end'} of the board.`, 'info');
      }
      return;
    }

    const [movedCrew] = plan.crews.splice(idx, 1);
    plan.crews.splice(targetIdx, 0, movedCrew);

    this.savePlan(plan);
    this.refreshView();

    if (typeof window.showToast === 'function') {
      window.showToast(`🚜 Moved Crew ${jobNumber} ${delta < 0 ? 'earlier' : 'later'} in board order.`, 'info');
    }
  }

  /**
   * Reorders an employee inside a crew, or moves/copies an employee into a crew at a target position.
   * Always renumbers member slots sequentially (.1, .2, .3, ...) so there are never gaps.
   */
  handleReorderOrMoveMember(dragData, destBaseJob, targetEmpName = null, insertPosition = 'end', isCopy = false) {
    const empName = dragData.empName || dragData.name;
    const { fromBaseJob, fromSideType } = dragData;
    const plan = this.getPlanForWeek(this.selectedWeek);
    if (!plan) return;

    const normName = String(empName || '').trim().toLowerCase();
    const destCrew = plan.crews.find(c => c.jobNumber.toLowerCase() === String(destBaseJob || '').toLowerCase());
    if (!destCrew) return;

    // CASE 1: Reordering within the SAME crew (not a copy)
    if (!isCopy && fromBaseJob && destBaseJob && fromBaseJob.toLowerCase() === destBaseJob.toLowerCase()) {
      const fromIdx = destCrew.members.findIndex(m => m.name.trim().toLowerCase() === normName);
      if (fromIdx === -1) return;

      const [memberObj] = destCrew.members.splice(fromIdx, 1);

      if (!targetEmpName || insertPosition === 'end') {
        destCrew.members.push(memberObj);
      } else {
        const normTarget = String(targetEmpName).trim().toLowerCase();
        let targetIdx = destCrew.members.findIndex(m => m.name.trim().toLowerCase() === normTarget);
        if (targetIdx === -1) {
          destCrew.members.push(memberObj);
        } else {
          if (insertPosition === 'after') {
            targetIdx += 1;
          }
          destCrew.members.splice(targetIdx, 0, memberObj);
        }
      }

      // Renumber slots sequentially (destCrew.jobNumber.1, .2, .3, ...)
      destCrew.members.forEach((m, idx) => {
        m.slot = `${destCrew.jobNumber}.${idx + 1}`;
      });

      this.savePlan(plan);
      this.refreshView();

      if (typeof window.showToast === 'function') {
        window.showToast(`↕️ Reordered ${memberObj.name} in Crew ${destCrew.jobNumber}`, 'info');
      }
      return;
    }

    // CASE 2: Moving or copying from another crew or side category
    let memberObj = null;

    if (fromSideType && plan.sidePane[fromSideType]) {
      const idx = plan.sidePane[fromSideType].findIndex(m => m.name.trim().toLowerCase() === normName);
      if (idx !== -1) {
        if (isCopy) {
          memberObj = { ...plan.sidePane[fromSideType][idx], isConfirmed: false, isDuplicate: true };
        } else {
          memberObj = plan.sidePane[fromSideType].splice(idx, 1)[0];
        }
      }
    } else if (fromBaseJob) {
      const srcCrew = plan.crews.find(c => c.jobNumber.toLowerCase() === fromBaseJob.toLowerCase());
      if (srcCrew) {
        const idx = srcCrew.members.findIndex(m => m.name.trim().toLowerCase() === normName);
        if (idx !== -1) {
          if (isCopy) {
            memberObj = { ...srcCrew.members[idx], isConfirmed: false, isDuplicate: true };
          } else {
            memberObj = srcCrew.members.splice(idx, 1)[0];
            // Renumber remaining members of source crew
            srcCrew.members.forEach((m, i) => {
              m.slot = `${srcCrew.jobNumber}.${i + 1}`;
            });
            // If moved member was the foreman of source crew, update/clear source crew foreman
            if (this.isCrewForeman(srcCrew, memberObj.name)) {
              const remaining = srcCrew.members;
              const nextLead = remaining.find(m => /^(foreman|f|sup|gf|lead)/i.test(m.classification || m.role)) || remaining[0];
              srcCrew.foreman = nextLead ? nextLead.name : '';
            }
          }
        }
      }
    }

    // Fallback: search anywhere in plan if not found in specified source
    if (!memberObj) {
      for (const c of plan.crews) {
        const found = c.members.find(m => m.name.trim().toLowerCase() === normName);
        if (found) {
          memberObj = { ...found, isConfirmed: false, isDuplicate: true };
          break;
        }
      }
    }
    if (!memberObj && plan.sidePane) {
      for (const cat of ['planning', 'vacation', 'weeds', 'lightDuty', 'quit', 'pendingHires']) {
        const found = (plan.sidePane[cat] || []).find(m => m.name.trim().toLowerCase() === normName);
        if (found) {
          memberObj = { ...found, isConfirmed: false, isDuplicate: true };
          break;
        }
      }
    }

    if (!memberObj) {
      // Lookup from live employees table to preserve role & classification
      const empTable = this.db ? this.db.getTable('employees') : null;
      const liveRow = (empTable?.rows || []).find(r => String(r['Employee Name'] || r['Name'] || '').trim().toLowerCase() === normName);
      memberObj = {
        name: empName,
        classification: liveRow ? String(liveRow['Job Classification'] || liveRow['Classification'] || 'Journeyman').trim() : 'Journeyman',
        role: liveRow ? String(liveRow['Role'] || 'JL').trim() : 'JL',
        isConfirmed: false,
        isDuplicate: true
      };
    }

    // Mark as unconfirmed on move/copy into different crew so it glows purple
    memberObj.isConfirmed = false;
    if (isCopy) memberObj.isDuplicate = true;

    // Insert into destination crew at target position
    if (insertPosition === 'start') {
      destCrew.members.unshift(memberObj);
    } else if (!targetEmpName || insertPosition === 'end') {
      destCrew.members.push(memberObj);
    } else {
      const normTarget = String(targetEmpName).trim().toLowerCase();
      let targetIdx = destCrew.members.findIndex(m => m.name.trim().toLowerCase() === normTarget);
      if (targetIdx === -1) {
        destCrew.members.push(memberObj);
      } else {
        if (insertPosition === 'after') {
          targetIdx += 1;
        }
        destCrew.members.splice(targetIdx, 0, memberObj);
      }
    }

    // Renumber all members in destination crew sequentially (.1, .2, .3, ...)
    destCrew.members.forEach((m, idx) => {
      m.slot = `${destCrew.jobNumber}.${idx + 1}`;
    });

    // If destination crew had no foreman, or if moving member is a Foreman ('F') and was placed at start:
    const isLeadRank = /^(foreman|f|sup|gf)/i.test(memberObj.classification || memberObj.role);
    if (!destCrew.foreman || (insertPosition === 'start' && isLeadRank)) {
      destCrew.foreman = memberObj.name;
    }

    // If employee has a scheduled departure, keep their active crew updated in Quit / Notice
    if (plan.sidePane && plan.sidePane.quit) {
      const qItem = plan.sidePane.quit.find(q => q.name.trim().toLowerCase() === normName);
      if (qItem && qItem.isScheduledDeparture) {
        qItem.activeCrew = destCrew.jobNumber;
        qItem.currentJob = memberObj.slot;
      }
    }

    this.savePlan(plan);
    this.refreshView();

    if (typeof window.showToast === 'function') {
      const actionVerb = isCopy ? 'Duplicated' : 'Moved';
      window.showToast(`${actionVerb} ${memberObj.name} to Crew ${destCrew.jobNumber}`, 'info');
    }
  }

  handleMoveToCrew(dragData, destBaseJob, isCopy = false) {
    return this.handleReorderOrMoveMember(dragData, destBaseJob, null, 'end', isCopy);
  }

  handleMoveToSideCategory(dragData, destSideType, isCopy = false) {
    const empName = dragData.empName || dragData.name;
    const { fromBaseJob, fromSideType } = dragData;
    const plan = this.getPlanForWeek(this.selectedWeek);
    if (!plan || !plan.sidePane[destSideType]) return;

    if (!isCopy && fromSideType === destSideType) return;

    // RULE: If moving to Quit / Notice, prompt for Last Working Day & departure details first!
    if (destSideType === 'quit') {
      this.promptQuitDeparture(dragData, isCopy);
      return;
    }

    // RULE: If moving to Scheduled Vacation, prompt for Vacation Dates & This Week vs. Future Week scope!
    if (destSideType === 'vacation') {
      this.promptVacationSchedule(dragData, isCopy);
      return;
    }

    const normName = String(empName || '').trim().toLowerCase();
    let memberObj = null;

    if (fromSideType && plan.sidePane[fromSideType]) {
      const idx = plan.sidePane[fromSideType].findIndex(m => m.name.trim().toLowerCase() === normName);
      if (idx !== -1) {
        if (isCopy) {
          memberObj = { ...plan.sidePane[fromSideType][idx], isConfirmed: false, isDuplicate: true };
        } else {
          memberObj = plan.sidePane[fromSideType].splice(idx, 1)[0];
        }
      }
    } else if (fromBaseJob) {
      const srcCrew = plan.crews.find(c => c.jobNumber.toLowerCase() === fromBaseJob.toLowerCase());
      if (srcCrew) {
        const idx = srcCrew.members.findIndex(m => m.name.trim().toLowerCase() === normName);
        if (idx !== -1) {
          if (isCopy) {
            memberObj = { ...srcCrew.members[idx], isConfirmed: false, isDuplicate: true };
          } else {
            memberObj = srcCrew.members.splice(idx, 1)[0];
            // Renumber remaining members of source crew sequentially
            srcCrew.members.forEach((m, i) => {
              m.slot = `${srcCrew.jobNumber}.${i + 1}`;
            });
            // If moved member was the foreman of source crew, update/clear source crew foreman
            if (this.isCrewForeman(srcCrew, memberObj.name)) {
              const remaining = srcCrew.members;
              const nextLead = remaining.find(m => /^(foreman|f|sup|gf|lead)/i.test(m.classification || m.role)) || remaining[0];
              srcCrew.foreman = nextLead ? nextLead.name : '';
            }
          }
        }
      }
    }

    if (!memberObj) {
      for (const c of plan.crews) {
        const found = c.members.find(m => m.name.trim().toLowerCase() === normName);
        if (found) {
          memberObj = { ...found, isConfirmed: false, isDuplicate: true };
          break;
        }
      }
    }

    if (!memberObj) {
      memberObj = { name: empName, isConfirmed: false, isDuplicate: isCopy };
    }

    memberObj.currentJob = fromBaseJob || memberObj.currentJob || '';
    memberObj.priorBaseJob = fromBaseJob || memberObj.priorBaseJob || memberObj.currentJob || memberObj.originalBaseJob || '';
    memberObj.isConfirmed = false;
    if (isCopy) memberObj.isDuplicate = true;
    plan.sidePane[destSideType].push(memberObj);

    this.savePlan(plan);
    this.refreshView();
  }

  /**
   * Prompts the user to enter the Last Working Day, reason, and notes when moving to Quit/Notice.
   */
  promptQuitDeparture(dragData, isCopy = false, existingItem = null) {
    const empName = dragData.empName || dragData.name;
    const { fromBaseJob } = dragData;
    const plan = this.getPlanForWeek(this.selectedWeek);
    if (!plan) return;

    const modalId = 'modal-crew-quit-departure';
    let existing = document.getElementById(modalId);
    if (existing) existing.remove();

    const normName = String(empName || '').trim().toLowerCase();
    let targetCrewNumber = fromBaseJob || existingItem?.activeCrew || existingItem?.currentJob || '';
    if (!targetCrewNumber) {
      const c = plan.crews.find(cr => cr.members.some(m => m.name.trim().toLowerCase() === normName));
      if (c) targetCrewNumber = c.jobNumber;
    }
    const keepOnCrewDefault = Boolean(targetCrewNumber && (!existingItem || existingItem.isScheduledDeparture !== false));

    // Default Last Day calculation
    const computeDefaultDate = () => {
      if (existingItem && existingItem.departureDate) {
        return existingItem.departureDate;
      }
      try {
        const raw = this.selectedWeek || '';
        let sunday = new Date();
        if (raw.includes('-')) {
          const parts = raw.split('-');
          if (parts.length === 3) sunday = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
        } else if (raw.includes('/')) {
          const parts = raw.split('/');
          if (parts.length === 3) sunday = new Date(parseInt(parts[2], 10), parseInt(parts[0], 10) - 1, parseInt(parts[1], 10));
        }
        const friday = new Date(sunday);
        friday.setDate(sunday.getDate() + 5);
        const m = String(friday.getMonth() + 1).padStart(2, '0');
        const d = String(friday.getDate()).padStart(2, '0');
        const y = friday.getFullYear();
        return `${m}/${d}/${y}`;
      } catch {
        const now = new Date();
        return `${String(now.getMonth() + 1).padStart(2, '0')}/${String(now.getDate()).padStart(2, '0')}/${now.getFullYear()}`;
      }
    };

    const defaultDate = computeDefaultDate();
    const now = new Date();
    const todayFormatted = `${String(now.getMonth() + 1).padStart(2, '0')}/${String(now.getDate()).padStart(2, '0')}/${now.getFullYear()}`;
    const todayIso = now.toISOString().split('T')[0];

    const toIsoDate = (dStr) => {
      if (/^\d{2}\/\d{2}\/\d{4}$/.test(dStr)) {
        const p = dStr.split('/');
        return `${p[2]}-${p[0]}-${p[1]}`;
      }
      return todayIso;
    };

    const overlay = document.createElement('div');
    overlay.id = modalId;
    overlay.className = 'modal-overlay active';
    overlay.style.cssText = 'position: fixed; inset: 0; background: rgba(0,0,0,0.8) !important; display: flex; align-items: center; justify-content: center; z-index: 16500 !important; pointer-events: auto !important; padding: 20px;';

    overlay.innerHTML = `
      <div class="modal-box" style="background: #1e293b; border: 1px solid rgba(239, 68, 68, 0.4); border-radius: 10px; max-width: 500px; width: 100%; box-shadow: 0 20px 45px rgba(0,0,0,0.85); overflow: hidden; pointer-events: auto !important; position: relative; z-index: 16501 !important;">
        <!-- Header -->
        <div style="background: linear-gradient(135deg, #7f1d1d 0%, #991b1b 100%); color: white; padding: 14px 20px; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid rgba(239, 68, 68, 0.4);">
          <div style="display: flex; align-items: center; gap: 8px;">
            <span style="font-size: 20px;">🚪</span>
            <div>
              <div style="font-weight: 800; font-size: 15px;">Employee Departure / Notice</div>
              <div style="font-size: 11px; opacity: 0.85;">Record last working day for employee history & archival</div>
            </div>
          </div>
          <button id="btn-quit-close-x" style="background: rgba(0,0,0,0.25); border: none; color: white; font-size: 14px; width: 28px; height: 28px; border-radius: 4px; cursor: pointer;">✕</button>
        </div>

        <!-- Body -->
        <div style="padding: 20px; display: flex; flex-direction: column; gap: 15px;">
          <!-- Employee Info Banner -->
          <div style="background: rgba(15, 23, 42, 0.7); border: 1px solid rgba(148, 163, 184, 0.2); border-radius: 8px; padding: 12px 14px; display: flex; justify-content: space-between; align-items: center;">
            <div>
              <div style="font-size: 11px; color: #f87171; font-weight: 700; text-transform: uppercase;">Employee Departing</div>
              <div style="font-size: 16px; font-weight: 800; color: #ffffff;">${this.escapeHtml(empName)}</div>
            </div>
            <div style="text-align: right; font-size: 12px; color: #94a3b8;">
              <div>Active Crew: <strong style="color: #cbd5e1;">${this.escapeHtml(targetCrewNumber || fromBaseJob || existingItem?.currentJob || 'Staging')}</strong></div>
            </div>
          </div>

          <!-- Date Input -->
          <div>
            <label style="font-size: 12px; font-weight: 700; color: #fca5a5; margin-bottom: 5px; display: flex; align-items: center; justify-content: space-between;">
              <span>📅 Last Working Day <span style="color: #ef4444;">*</span></span>
              <span style="font-size: 11px; font-weight: normal; color: #94a3b8;">(MM/DD/YYYY)</span>
            </label>
            <div style="display: flex; gap: 8px; margin-bottom: 6px;">
              <input type="text" id="quit-depart-date" value="${this.escapeHtml(defaultDate)}" placeholder="MM/DD/YYYY" style="flex: 1; background: #0f172a; border: 1px solid rgba(255,255,255,0.15); border-radius: 6px; color: #ffffff; padding: 8px 12px; font-size: 13px; font-weight: 600;" />
              <input type="date" id="quit-depart-date-picker" value="${toIsoDate(defaultDate)}" style="background: #0f172a; border: 1px solid rgba(255,255,255,0.15); border-radius: 6px; color: #ffffff; padding: 7px 10px; cursor: pointer;" title="Pick from calendar" />
            </div>
            <div style="display: flex; gap: 6px; flex-wrap: wrap;">
              <button type="button" id="quit-quick-today" class="btn btn-xs" style="font-size: 11px; padding: 3px 8px; background: rgba(239, 68, 68, 0.15); border: 1px solid rgba(239, 68, 68, 0.3); color: #fca5a5; cursor: pointer;">📅 Today (${todayFormatted})</button>
              <button type="button" id="quit-quick-planned" class="btn btn-xs" style="font-size: 11px; padding: 3px 8px; background: rgba(148, 163, 184, 0.12); border: 1px solid rgba(148, 163, 184, 0.25); color: #cbd5e1; cursor: pointer;">📅 Planned Week Friday (${defaultDate})</button>
            </div>
          </div>

          <!-- Reason -->
          <div>
            <label for="quit-depart-reason" style="font-size: 12px; font-weight: 700; color: #fca5a5; margin-bottom: 5px; display: block;">
              <span>📋 Departure Reason <span style="color: #ef4444;">*</span></span>
            </label>
            <select id="quit-depart-reason" style="width: 100%; background: #0f172a; border: 1px solid rgba(255,255,255,0.15); border-radius: 6px; color: #ffffff; padding: 8px 12px; font-size: 13px; font-weight: 600;">
              <option value="Quit" ${(existingItem?.departureReason === 'Quit' || !existingItem) ? 'selected' : ''}>Quit (Voluntary)</option>
              <option value="Resigned" ${existingItem?.departureReason === 'Resigned' ? 'selected' : ''}>Resigned (Voluntary)</option>
              <option value="Layoff" ${existingItem?.departureReason === 'Layoff' ? 'selected' : ''}>Layoff (Reduction in Force)</option>
              <option value="Terminated" ${existingItem?.departureReason === 'Terminated' ? 'selected' : ''}>Terminated (Involuntary)</option>
              <option value="Fired" ${existingItem?.departureReason === 'Fired' ? 'selected' : ''}>Fired (Involuntary)</option>
              <option value="Medical" ${existingItem?.departureReason === 'Medical' ? 'selected' : ''}>Medical / Disability Leave</option>
              <option value="Other" ${existingItem?.departureReason === 'Other' ? 'selected' : ''}>Other</option>
            </select>
          </div>

          <!-- Notes -->
          <div>
            <label for="quit-depart-notes" style="font-size: 12px; font-weight: 700; color: #cbd5e1; margin-bottom: 5px; display: block;">
              <span>📝 Departure Notes / Details</span>
            </label>
            <input type="text" id="quit-depart-notes" value="${this.escapeHtml(existingItem?.notes || '')}" placeholder="e.g. 2-week notice given, moving to another company..." style="width: 100%; background: #0f172a; border: 1px solid rgba(255,255,255,0.15); border-radius: 6px; color: #ffffff; padding: 8px 12px; font-size: 13px;" />
          </div>

          <!-- Keep on crew option -->
          <div style="background: rgba(15, 23, 42, 0.7); border: 1px solid rgba(59, 130, 246, 0.25); border-radius: 8px; padding: 10px 14px;">
            <label style="display: flex; align-items: flex-start; gap: 9px; cursor: pointer; font-size: 12px; color: #f1f5f9;">
              <input type="checkbox" id="quit-keep-on-crew" ${keepOnCrewDefault ? 'checked' : ''} style="margin-top: 2px; cursor: pointer; accent-color: #3b82f6; width: 16px; height: 16px;">
              <div>
                <div style="font-weight: 700; color: #93c5fd;">Keep employee active on crew (${this.escapeHtml(targetCrewNumber || 'current crew')}) until Last Day</div>
                <div style="font-size: 11px; color: #94a3b8; line-height: 1.4; margin-top: 2px;">
                  Employee remains on the field crew through their last day. A 🚪 notice badge appears on their crew row, and their scheduled departure is tracked in Quit / Notice. Uncheck for immediate departure.
                </div>
              </div>
            </label>
          </div>

          <!-- Notice banner -->
          <div style="background: rgba(59, 130, 246, 0.08); border: 1px solid rgba(59, 130, 246, 0.2); border-radius: 8px; padding: 10px 14px; font-size: 11.5px; color: #cbd5e1; line-height: 1.5;">
            <div style="font-weight: 700; color: #60a5fa; margin-bottom: 2px;">ℹ️ Milestone & Archival Timing:</div>
            <div>• This last day milestone will be recorded in <strong>Employee History</strong> upon publishing.</div>
            <div>• The employee is automatically moved to <strong>Previous Employees</strong> on their recorded last day.</div>
          </div>
        </div>

        <!-- Footer -->
        <div style="background: rgba(15, 23, 42, 0.6); border-top: 1px solid rgba(255,255,255,0.1); padding: 12px 20px; display: flex; justify-content: space-between; align-items: center;">
          <button id="btn-quit-cancel" class="btn btn-secondary" style="font-size: 12px; padding: 6px 14px; cursor: pointer;">
            Cancel
          </button>
          <button id="btn-quit-confirm" class="btn btn-primary" style="background: #dc2626; border-color: #b91c1c; font-weight: 700; font-size: 12.5px; padding: 7px 18px; cursor: pointer;">
            🚪 Confirm Last Day & Stage
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    const dateInput = overlay.querySelector('#quit-depart-date');
    const datePicker = overlay.querySelector('#quit-depart-date-picker');
    const reasonSelect = overlay.querySelector('#quit-depart-reason');
    const notesInput = overlay.querySelector('#quit-depart-notes');

    datePicker?.addEventListener('change', () => {
      if (datePicker.value) {
        const p = datePicker.value.split('-');
        if (p.length === 3) dateInput.value = `${p[1]}/${p[2]}/${p[0]}`;
      }
    });

    dateInput?.addEventListener('input', () => {
      const val = dateInput.value.trim();
      if (/^\d{2}\/\d{2}\/\d{4}$/.test(val)) {
        const p = val.split('/');
        datePicker.value = `${p[2]}-${p[0]}-${p[1]}`;
      }
    });

    overlay.querySelector('#quit-quick-today')?.addEventListener('click', () => {
      dateInput.value = todayFormatted;
      datePicker.value = todayIso;
    });

    overlay.querySelector('#quit-quick-planned')?.addEventListener('click', () => {
      dateInput.value = defaultDate;
      datePicker.value = toIsoDate(defaultDate);
    });

    const closeModal = () => {
      overlay.remove();
    };

    overlay.querySelector('#btn-quit-close-x')?.addEventListener('click', closeModal);
    overlay.querySelector('#btn-quit-cancel')?.addEventListener('click', closeModal);
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeModal();
    });

    const onKey = (e) => {
      if (e.key === 'Escape') {
        closeModal();
        window.removeEventListener('keydown', onKey);
      }
    };
    window.addEventListener('keydown', onKey);

    overlay.querySelector('#btn-quit-confirm')?.addEventListener('click', () => {
      let dVal = (dateInput?.value || '').trim();
      if (!dVal) dVal = defaultDate;
      if (dVal.includes('-')) {
        const p = dVal.split('-');
        if (p.length === 3) dVal = `${p[1]}/${p[2]}/${p[0]}`;
      }

      const reasonVal = reasonSelect?.value || 'Quit';
      const notesVal = (notesInput?.value || '').trim();
      const keepOnCrew = Boolean(overlay.querySelector('#quit-keep-on-crew')?.checked);

      if (existingItem) {
        existingItem.departureDate = dVal;
        existingItem.departureReason = reasonVal;
        existingItem.notes = notesVal;
        existingItem.dateRange = `Last Day: ${dVal}`;
        existingItem.isScheduledDeparture = keepOnCrew;

        if (keepOnCrew && targetCrewNumber) {
          existingItem.activeCrew = targetCrewNumber;
          const c = plan.crews.find(cr => cr.jobNumber.toLowerCase() === targetCrewNumber.toLowerCase());
          if (c) {
            let mem = c.members.find(m => m.name.toLowerCase() === normName);
            if (!mem) {
              mem = {
                name: existingItem.name,
                classification: existingItem.classification || 'Journeyman',
                role: existingItem.role || 'JL',
                isConfirmed: false,
                slot: `${c.jobNumber}.${c.members.length + 1}`
              };
              c.members.push(mem);
            }
            mem.departureDate = dVal;
            mem.departureReason = reasonVal;
            mem.departureNotes = notesVal;
          }
        } else if (!keepOnCrew) {
          plan.crews.forEach(cr => {
            const had = cr.members.some(m => m.name.toLowerCase() === normName);
            if (had) {
              cr.members = cr.members.filter(m => m.name.toLowerCase() !== normName);
              cr.members.forEach((m, idx) => m.slot = `${cr.jobNumber}.${idx + 1}`);
            }
          });
          existingItem.activeCrew = '';
          existingItem.isScheduledDeparture = false;
        }

        this.savePlan(plan);
        this.refreshView();
        closeModal();
        if (typeof window.showToast === 'function') {
          window.showToast(`Updated ${empName}'s Last Day to ${dVal}.`, 'success');
        }
      } else {
        closeModal();
        this.finalizeMoveToQuit(dragData, dVal, reasonVal, notesVal, isCopy, keepOnCrew, targetCrewNumber);
      }
    });

    setTimeout(() => {
      dateInput?.focus();
      dateInput?.select();
    }, 50);
  }

  finalizeMoveToQuit(dragData, departureDate, departureReason = 'Quit', notes = '', isCopy = false, keepOnCrew = true, targetCrewNumber = '') {
    const { empName, fromBaseJob, fromSideType } = dragData;
    const plan = this.getPlanForWeek(this.selectedWeek);
    if (!plan) return;

    const normName = String(empName || '').trim().toLowerCase();

    // Check if employee is on an active crew
    const crewNum = fromBaseJob || targetCrewNumber;
    let srcCrew = null;
    let memberObj = null;

    if (crewNum) {
      srcCrew = plan.crews.find(c => c.jobNumber.toLowerCase() === crewNum.toLowerCase());
      if (srcCrew) {
        memberObj = srcCrew.members.find(m => m.name.trim().toLowerCase() === normName);
      }
    }
    if (!memberObj) {
      for (const c of plan.crews) {
        const found = c.members.find(m => m.name.trim().toLowerCase() === normName);
        if (found) {
          srcCrew = c;
          memberObj = found;
          break;
        }
      }
    }

    if (keepOnCrew && srcCrew && memberObj) {
      // 1. Keep employee active on their crew!
      memberObj.departureDate = departureDate;
      memberObj.departureReason = departureReason;
      memberObj.departureNotes = notes;

      // 2. Add or update mirror entry in plan.sidePane.quit
      if (!plan.sidePane.quit) plan.sidePane.quit = [];
      const quitIdx = plan.sidePane.quit.findIndex(q => q.name.trim().toLowerCase() === normName);
      const quitItem = {
        name: memberObj.name,
        classification: memberObj.classification || memberObj.role || 'Journeyman',
        role: memberObj.role || 'JL',
        currentJob: memberObj.slot,
        activeCrew: srcCrew.jobNumber,
        departureDate: departureDate,
        departureReason: departureReason,
        notes: notes,
        dateRange: `Last Day: ${departureDate}`,
        isScheduledDeparture: true,
        isConfirmed: true
      };

      if (quitIdx !== -1) {
        plan.sidePane.quit[quitIdx] = quitItem;
      } else {
        plan.sidePane.quit.push(quitItem);
      }

      this.savePlan(plan);
      this.refreshView();

      if (typeof window.showToast === 'function') {
        window.showToast(`🚪 Recorded Last Day (${departureDate}) for ${empName}. Active on Crew ${srcCrew.jobNumber} until departure.`, 'info');
      }
      return;
    }

    // Otherwise: Immediate walkout / removal from crew
    if (fromSideType && plan.sidePane[fromSideType]) {
      const idx = plan.sidePane[fromSideType].findIndex(m => m.name.trim().toLowerCase() === normName);
      if (idx !== -1) {
        if (isCopy) {
          memberObj = { ...plan.sidePane[fromSideType][idx], isConfirmed: false, isDuplicate: true };
        } else {
          memberObj = plan.sidePane[fromSideType].splice(idx, 1)[0];
        }
      }
    } else if (fromBaseJob) {
      const sCrew = plan.crews.find(c => c.jobNumber.toLowerCase() === fromBaseJob.toLowerCase());
      if (sCrew) {
        const idx = sCrew.members.findIndex(m => m.name.trim().toLowerCase() === normName);
        if (idx !== -1) {
          if (isCopy) {
            memberObj = { ...sCrew.members[idx], isConfirmed: false, isDuplicate: true };
          } else {
            memberObj = sCrew.members.splice(idx, 1)[0];
            sCrew.members.forEach((m, i) => {
              m.slot = `${sCrew.jobNumber}.${i + 1}`;
            });
          }
        }
      }
    }

    if (!memberObj) {
      for (const c of plan.crews) {
        const found = c.members.find(m => m.name.trim().toLowerCase() === normName);
        if (found) {
          memberObj = { ...found, isConfirmed: false, isDuplicate: true };
          break;
        }
      }
    }
    if (!memberObj && plan.sidePane) {
      for (const cat of ['planning', 'vacation', 'weeds', 'lightDuty', 'pendingHires']) {
        const found = (plan.sidePane[cat] || []).find(m => m.name.trim().toLowerCase() === normName);
        if (found) {
          memberObj = { ...found, isConfirmed: false, isDuplicate: true };
          break;
        }
      }
    }

    if (!memberObj) {
      memberObj = { name: empName, isConfirmed: false, isDuplicate: isCopy };
    }

    memberObj.currentJob = fromBaseJob || memberObj.currentJob || '';
    memberObj.isConfirmed = false;
    if (isCopy) memberObj.isDuplicate = true;
    memberObj.departureDate = departureDate;
    memberObj.departureReason = departureReason;
    memberObj.notes = notes;
    memberObj.dateRange = `Last Day: ${departureDate}`;
    memberObj.isScheduledDeparture = false;

    plan.sidePane.quit.push(memberObj);

    this.savePlan(plan);
    this.refreshView();

    if (typeof window.showToast === 'function') {
      window.showToast(`🚪 Staged ${empName} under Quit/Notice (Last Day: ${departureDate}).`, 'info');
    }
  }

  editQuitDeparture(empName) {
    const plan = this.getPlanForWeek(this.selectedWeek);
    if (!plan || !plan.sidePane || !plan.sidePane.quit) return;

    const norm = String(empName || '').trim().toLowerCase();
    const item = plan.sidePane.quit.find(q => q.name.trim().toLowerCase() === norm);
    if (!item) return;

    const dragData = {
      empName: item.name,
      fromBaseJob: item.currentJob || '',
      fromSideType: 'quit'
    };
    this.promptQuitDeparture(dragData, false, item);
  }

  /**
   * Prompts the user to enter Vacation Start/End Dates, Notes, and clarify whether the vacation
   * is for This Planned Week or a Future Week when dragging/editing an employee in Scheduled Vacation.
   */
  promptVacationSchedule(dragData, isCopy = false, existingItem = null) {
    const empName = dragData.empName || dragData.name;
    const { fromBaseJob } = dragData;
    const plan = this.getPlanForWeek(this.selectedWeek);
    if (!plan) return;

    const modalId = 'modal-crew-vacation-schedule';
    const existingModal = document.getElementById(modalId);
    if (existingModal) existingModal.remove();

    const normName = String(empName || '').trim().toLowerCase();
    const baselineMap = this.getOriginalEmployeeLocations();
    const baseInfo = baselineMap.get(normName);

    let targetCrewNumber = (
      fromBaseJob ||
      existingItem?.activeCrew ||
      existingItem?.priorBaseJob ||
      (existingItem?.currentJob ? String(existingItem.currentJob).replace(/\.\d+.*$/, '').trim() : '') ||
      baseInfo?.originalBaseJob ||
      ''
    ).replace(/\.\d+.*$/, '').trim();

    if (!targetCrewNumber) {
      const c = plan.crews.find(cr => cr.members.some(m => m.name.trim().toLowerCase() === normName));
      if (c) targetCrewNumber = c.jobNumber;
    }

    // Parse planned week Sunday date
    const parseWeekSunday = () => {
      try {
        const raw = this.selectedWeek || '';
        if (raw.includes('-')) {
          const p = raw.split('-');
          if (p.length === 3) return new Date(parseInt(p[0], 10), parseInt(p[1], 10) - 1, parseInt(p[2], 10));
        } else if (raw.includes('/')) {
          const p = raw.split('/');
          if (p.length === 3) return new Date(parseInt(p[2], 10), parseInt(p[0], 10) - 1, parseInt(p[1], 10));
        }
      } catch {
        // fallback below
      }
      return new Date();
    };

    const fmtDate = (dt) => {
      const m = String(dt.getMonth() + 1).padStart(2, '0');
      const d = String(dt.getDate()).padStart(2, '0');
      const y = dt.getFullYear();
      return `${m}/${d}/${y}`;
    };

    const toIsoDate = (dStr) => {
      if (/^\d{2}\/\d{2}\/\d{4}$/.test(dStr)) {
        const p = dStr.split('/');
        return `${p[2]}-${p[0]}-${p[1]}`;
      }
      return new Date().toISOString().split('T')[0];
    };

    const parseMmDdYyyy = (dStr) => {
      if (!dStr) return null;
      const p = String(dStr).trim().split('/');
      if (p.length === 3) {
        const dt = new Date(parseInt(p[2], 10), parseInt(p[0], 10) - 1, parseInt(p[1], 10));
        if (!isNaN(dt.getTime())) return dt;
      }
      return null;
    };

    const weekSun = parseWeekSunday();
    const weekSat = new Date(weekSun);
    weekSat.setDate(weekSun.getDate() + 6);

    const addDays = (base, offset) => {
      const d = new Date(base);
      d.setDate(base.getDate() + offset);
      return d;
    };

    // Preset ranges (Mon - Thu)
    const thisMon = fmtDate(addDays(weekSun, 1));
    const thisThu = fmtDate(addDays(weekSun, 4));
    const nextMon = fmtDate(addDays(weekSun, 8));
    const nextThu = fmtDate(addDays(weekSun, 11));
    const wk2Mon = fmtDate(addDays(weekSun, 15));
    const wk2Thu = fmtDate(addDays(weekSun, 18));

    // Existing start/end dates
    let defaultStart = existingItem?.vacationStartDate || '';
    let defaultEnd = existingItem?.vacationEndDate || '';
    if (!defaultStart && existingItem?.dateRange) {
      const parts = String(existingItem.dateRange).split(/\s*-\s*/);
      if (/^\d{2}\/\d{2}\/\d{4}$/.test(parts[0] || '')) {
        defaultStart = parts[0];
        defaultEnd = parts[1] && /^\d{2}\/\d{2}\/\d{4}$/.test(parts[1]) ? parts[1] : parts[0];
      }
    }
    if (!defaultStart) defaultStart = thisMon;
    if (!defaultEnd) defaultEnd = thisThu;

    const initialIsFuture = Boolean(existingItem?.isFutureVacation);
    const initialKeepOnCrew = existingItem
      ? Boolean(existingItem.keepOnCrew || existingItem.isFutureVacation)
      : false;

    const overlay = document.createElement('div');
    overlay.id = modalId;
    overlay.className = 'modal-overlay active';
    overlay.style.cssText = 'position: fixed; inset: 0; background: rgba(0,0,0,0.82) !important; display: flex; align-items: center; justify-content: center; z-index: 16500 !important; pointer-events: auto !important; padding: 20px;';

    overlay.innerHTML = `
      <div class="modal-box" style="background: #1e293b; border: 1px solid rgba(245, 158, 11, 0.45); border-radius: 10px; max-width: 540px; width: 100%; box-shadow: 0 20px 45px rgba(0,0,0,0.85); overflow: hidden; pointer-events: auto !important; position: relative; z-index: 16501 !important;">
        <!-- Header -->
        <div style="background: linear-gradient(135deg, #92400e 0%, #b45309 100%); color: white; padding: 14px 20px; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid rgba(245, 158, 11, 0.4);">
          <div style="display: flex; align-items: center; gap: 10px;">
            <span style="font-size: 21px;">🏖️</span>
            <div>
              <div style="font-weight: 800; font-size: 15px;">Scheduled Vacation — Dates & Week Scope</div>
              <div style="font-size: 11px; opacity: 0.9;">Specify vacation dates and clarify if this is for this week or a future week</div>
            </div>
          </div>
          <button id="btn-vac-close-x" style="background: rgba(0,0,0,0.25); border: none; color: white; font-size: 14px; width: 28px; height: 28px; border-radius: 4px; cursor: pointer;">✕</button>
        </div>

        <!-- Body -->
        <div style="padding: 18px 20px; display: flex; flex-direction: column; gap: 14px;">
          <!-- Employee Info Banner -->
          <div style="background: rgba(15, 23, 42, 0.75); border: 1px solid rgba(148, 163, 184, 0.2); border-radius: 8px; padding: 11px 14px; display: flex; justify-content: space-between; align-items: center;">
            <div>
              <div style="font-size: 10.5px; color: #fbbf24; font-weight: 700; text-transform: uppercase;">Employee on Scheduled Vacation</div>
              <div style="font-size: 16px; font-weight: 800; color: #ffffff;">${this.escapeHtml(empName)}</div>
            </div>
            <div style="text-align: right; font-size: 12px; color: #94a3b8;">
              <div>Home / Active Crew: <strong style="color: #fde68a;">${this.escapeHtml(targetCrewNumber || 'Unassigned')}</strong></div>
              <div style="font-size: 10.5px; color: #64748b;">Planned Week: ${this.escapeHtml(this.selectedWeek || '')}</div>
            </div>
          </div>

          <!-- 1. Week Scope Clarification (This Week vs Future Week) -->
          <div>
            <label style="font-size: 12px; font-weight: 700; color: #fde68a; margin-bottom: 6px; display: block;">
              <span>1️⃣ Is this vacation for this planned week or a future week? <span style="color: #f59e0b;">*</span></span>
            </label>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
              <label id="vac-scope-card-this" style="background: ${!initialIsFuture ? 'rgba(16, 185, 129, 0.16)' : 'rgba(15, 23, 42, 0.65)'}; border: 1.5px solid ${!initialIsFuture ? '#10b981' : 'rgba(255,255,255,0.12)'}; border-radius: 8px; padding: 10px 12px; cursor: pointer; display: flex; flex-direction: column; gap: 4px; transition: all 0.15s ease;">
                <div style="display: flex; align-items: center; gap: 7px;">
                  <input type="radio" name="vacation-week-scope" id="vac-scope-this" value="this_week" ${!initialIsFuture ? 'checked' : ''} style="accent-color: #10b981; cursor: pointer;" />
                  <span style="font-size: 12.5px; font-weight: 800; color: #6ee7b7;">🗓️ This Planned Week</span>
                </div>
                <div style="font-size: 10.5px; color: #cbd5e1; line-height: 1.35; padding-left: 20px;">
                  Off during week of <strong>${this.escapeHtml(this.selectedWeek || '')}</strong>. Removes from field crew for this week (unless partial week).
                </div>
              </label>

              <label id="vac-scope-card-future" style="background: ${initialIsFuture ? 'rgba(59, 130, 246, 0.18)' : 'rgba(15, 23, 42, 0.65)'}; border: 1.5px solid ${initialIsFuture ? '#3b82f6' : 'rgba(255,255,255,0.12)'}; border-radius: 8px; padding: 10px 12px; cursor: pointer; display: flex; flex-direction: column; gap: 4px; transition: all 0.15s ease;">
                <div style="display: flex; align-items: center; gap: 7px;">
                  <input type="radio" name="vacation-week-scope" id="vac-scope-future" value="future_week" ${initialIsFuture ? 'checked' : ''} style="accent-color: #3b82f6; cursor: pointer;" />
                  <span style="font-size: 12.5px; font-weight: 800; color: #93c5fd;">⏭️ Future Week</span>
                </div>
                <div style="font-size: 10.5px; color: #cbd5e1; line-height: 1.35; padding-left: 20px;">
                  Upcoming vacation for a future week. <strong>Keeps active on Crew ${this.escapeHtml(targetCrewNumber || 'current crew')}</strong> for this week!
                </div>
              </label>
            </div>
          </div>

          <!-- 2. Vacation Start & End Dates -->
          <div>
            <label style="font-size: 12px; font-weight: 700; color: #fde68a; margin-bottom: 6px; display: flex; align-items: center; justify-content: space-between;">
              <span>2️⃣ Vacation Dates (Start Date — End Date) <span style="color: #f59e0b;">*</span></span>
              <span style="font-size: 11px; font-weight: normal; color: #94a3b8;">(MM/DD/YYYY)</span>
            </label>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 8px;">
              <div>
                <div style="font-size: 10.5px; color: #94a3b8; margin-bottom: 3px;">Start Date (First Day Off)</div>
                <div style="display: flex; gap: 5px;">
                  <input type="text" id="vac-start-date" value="${this.escapeHtml(defaultStart)}" placeholder="MM/DD/YYYY" style="flex: 1; min-width: 0; background: #0f172a; border: 1px solid rgba(255,255,255,0.16); border-radius: 6px; color: #ffffff; padding: 7px 10px; font-size: 12.5px; font-weight: 600;" />
                  <input type="date" id="vac-start-picker" value="${toIsoDate(defaultStart)}" style="width: 38px; background: #0f172a; border: 1px solid rgba(255,255,255,0.16); border-radius: 6px; color: #ffffff; padding: 5px; cursor: pointer;" title="Pick Start Date" />
                </div>
              </div>
              <div>
                <div style="font-size: 10.5px; color: #94a3b8; margin-bottom: 3px;">End Date (Last Day Off)</div>
                <div style="display: flex; gap: 5px;">
                  <input type="text" id="vac-end-date" value="${this.escapeHtml(defaultEnd)}" placeholder="MM/DD/YYYY" style="flex: 1; min-width: 0; background: #0f172a; border: 1px solid rgba(255,255,255,0.16); border-radius: 6px; color: #ffffff; padding: 7px 10px; font-size: 12.5px; font-weight: 600;" />
                  <input type="date" id="vac-end-picker" value="${toIsoDate(defaultEnd)}" style="width: 38px; background: #0f172a; border: 1px solid rgba(255,255,255,0.16); border-radius: 6px; color: #ffffff; padding: 5px; cursor: pointer;" title="Pick End Date" />
                </div>
              </div>
            </div>

            <!-- Quick Preset Buttons -->
            <div style="display: flex; gap: 6px; flex-wrap: wrap;">
              <button type="button" id="vac-preset-this" class="btn btn-xs" style="font-size: 10.5px; padding: 3px 8px; background: rgba(16, 185, 129, 0.15); border: 1px solid rgba(16, 185, 129, 0.35); color: #6ee7b7; cursor: pointer;">
                📅 This Week (${thisMon} - ${thisThu})
              </button>
              <button type="button" id="vac-preset-next" class="btn btn-xs" style="font-size: 10.5px; padding: 3px 8px; background: rgba(59, 130, 246, 0.16); border: 1px solid rgba(59, 130, 246, 0.35); color: #93c5fd; cursor: pointer;">
                ⏭️ Next Week (${nextMon} - ${nextThu})
              </button>
              <button type="button" id="vac-preset-wk2" class="btn btn-xs" style="font-size: 10.5px; padding: 3px 8px; background: rgba(148, 163, 184, 0.12); border: 1px solid rgba(148, 163, 184, 0.28); color: #cbd5e1; cursor: pointer;">
                ⏭️ +2 Weeks (${wk2Mon} - ${wk2Thu})
              </button>
            </div>
          </div>

          <!-- 3. Keep on Active Crew Option -->
          <div style="background: rgba(15, 23, 42, 0.7); border: 1px solid rgba(59, 130, 246, 0.25); border-radius: 8px; padding: 10px 14px;">
            <label style="display: flex; align-items: flex-start; gap: 9px; cursor: pointer; font-size: 12px; color: #f1f5f9;">
              <input type="checkbox" id="vac-keep-on-crew" ${initialKeepOnCrew ? 'checked' : ''} style="margin-top: 2px; cursor: pointer; accent-color: #3b82f6; width: 16px; height: 16px;">
              <div>
                <div style="font-weight: 700; color: #93c5fd;">Keep employee active on Crew ${this.escapeHtml(targetCrewNumber || 'current crew')} during this planned week</div>
                <div style="font-size: 11px; color: #94a3b8; line-height: 1.4; margin-top: 2px;">
                  Automatically checked for <strong>Future Week</strong> vacations (and optional for partial-week vacations). A 🏖️ vacation badge will display on their crew row while tracking their dates in Scheduled Vacation.
                </div>
              </div>
            </label>
          </div>

          <!-- 4. Notes -->
          <div>
            <label for="vac-notes-input" style="font-size: 12px; font-weight: 700; color: #cbd5e1; margin-bottom: 5px; display: block;">
              <span>📝 Vacation Notes (Optional)</span>
            </label>
            <input type="text" id="vac-notes-input" value="${this.escapeHtml(existingItem?.notes || '')}" placeholder="e.g. Hunting trip, family vacation, off Thu only..." style="width: 100%; background: #0f172a; border: 1px solid rgba(255,255,255,0.15); border-radius: 6px; color: #ffffff; padding: 8px 12px; font-size: 13px;" />
          </div>
        </div>

        <!-- Footer -->
        <div style="background: rgba(15, 23, 42, 0.6); border-top: 1px solid rgba(255,255,255,0.1); padding: 12px 20px; display: flex; justify-content: space-between; align-items: center;">
          <button id="btn-vac-cancel" class="btn btn-secondary" style="font-size: 12px; padding: 6px 14px; cursor: pointer;">
            Cancel
          </button>
          <button id="btn-vac-confirm" class="btn btn-primary" style="background: #d97706; border-color: #b45309; font-weight: 700; font-size: 12.5px; padding: 7px 18px; cursor: pointer; color: #fff;">
            🏖️ Save Vacation Schedule
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    const startInput = overlay.querySelector('#vac-start-date');
    const startPicker = overlay.querySelector('#vac-start-picker');
    const endInput = overlay.querySelector('#vac-end-date');
    const endPicker = overlay.querySelector('#vac-end-picker');
    const radioThis = overlay.querySelector('#vac-scope-this');
    const radioFuture = overlay.querySelector('#vac-scope-future');
    const cardThis = overlay.querySelector('#vac-scope-card-this');
    const cardFuture = overlay.querySelector('#vac-scope-card-future');
    const keepOnCrewCb = overlay.querySelector('#vac-keep-on-crew');
    const notesInput = overlay.querySelector('#vac-notes-input');

    const updateScopeVisuals = (scopeVal, autoToggleKeep = true) => {
      const isFut = scopeVal === 'future_week';
      if (radioThis) radioThis.checked = !isFut;
      if (radioFuture) radioFuture.checked = isFut;
      if (cardThis) {
        cardThis.style.background = !isFut ? 'rgba(16, 185, 129, 0.16)' : 'rgba(15, 23, 42, 0.65)';
        cardThis.style.borderColor = !isFut ? '#10b981' : 'rgba(255,255,255,0.12)';
      }
      if (cardFuture) {
        cardFuture.style.background = isFut ? 'rgba(59, 130, 246, 0.18)' : 'rgba(15, 23, 42, 0.65)';
        cardFuture.style.borderColor = isFut ? '#3b82f6' : 'rgba(255,255,255,0.12)';
      }
      if (autoToggleKeep && keepOnCrewCb) {
        keepOnCrewCb.checked = isFut;
      }
    };

    const autoDetectScopeFromStart = (startStr) => {
      const dt = parseMmDdYyyy(startStr);
      if (!dt) return;
      if (dt.getTime() > weekSat.getTime()) {
        updateScopeVisuals('future_week', true);
      } else {
        updateScopeVisuals('this_week', true);
      }
    };

    radioThis?.addEventListener('change', () => {
      if (radioThis.checked) updateScopeVisuals('this_week', true);
    });
    radioFuture?.addEventListener('change', () => {
      if (radioFuture.checked) updateScopeVisuals('future_week', true);
    });

    startPicker?.addEventListener('change', () => {
      if (startPicker.value) {
        const p = startPicker.value.split('-');
        if (p.length === 3) {
          startInput.value = `${p[1]}/${p[2]}/${p[0]}`;
          autoDetectScopeFromStart(startInput.value);
          // If end date is before start date, bump end date to match start date
          const sDt = parseMmDdYyyy(startInput.value);
          const eDt = parseMmDdYyyy(endInput.value);
          if (sDt && (!eDt || eDt.getTime() < sDt.getTime())) {
            endInput.value = startInput.value;
            endPicker.value = startPicker.value;
          }
        }
      }
    });

    endPicker?.addEventListener('change', () => {
      if (endPicker.value) {
        const p = endPicker.value.split('-');
        if (p.length === 3) endInput.value = `${p[1]}/${p[2]}/${p[0]}`;
      }
    });

    startInput?.addEventListener('input', () => {
      const val = startInput.value.trim();
      if (/^\d{2}\/\d{2}\/\d{4}$/.test(val)) {
        startPicker.value = toIsoDate(val);
        autoDetectScopeFromStart(val);
      }
    });

    endInput?.addEventListener('input', () => {
      const val = endInput.value.trim();
      if (/^\d{2}\/\d{2}\/\d{4}$/.test(val)) {
        endPicker.value = toIsoDate(val);
      }
    });

    overlay.querySelector('#vac-preset-this')?.addEventListener('click', () => {
      startInput.value = thisMon;
      startPicker.value = toIsoDate(thisMon);
      endInput.value = thisThu;
      endPicker.value = toIsoDate(thisThu);
      updateScopeVisuals('this_week', true);
    });

    overlay.querySelector('#vac-preset-next')?.addEventListener('click', () => {
      startInput.value = nextMon;
      startPicker.value = toIsoDate(nextMon);
      endInput.value = nextThu;
      endPicker.value = toIsoDate(nextThu);
      updateScopeVisuals('future_week', true);
    });

    overlay.querySelector('#vac-preset-wk2')?.addEventListener('click', () => {
      startInput.value = wk2Mon;
      startPicker.value = toIsoDate(wk2Mon);
      endInput.value = wk2Thu;
      endPicker.value = toIsoDate(wk2Thu);
      updateScopeVisuals('future_week', true);
    });

    const closeModal = () => {
      overlay.remove();
    };

    overlay.querySelector('#btn-vac-close-x')?.addEventListener('click', closeModal);
    overlay.querySelector('#btn-vac-cancel')?.addEventListener('click', closeModal);
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeModal();
    });

    const onKey = (e) => {
      if (e.key === 'Escape') {
        closeModal();
        window.removeEventListener('keydown', onKey);
      }
    };
    window.addEventListener('keydown', onKey);

    overlay.querySelector('#btn-vac-confirm')?.addEventListener('click', () => {
      let sVal = (startInput?.value || '').trim() || thisMon;
      let eVal = (endInput?.value || '').trim() || sVal;

      if (sVal.includes('-')) {
        const p = sVal.split('-');
        if (p.length === 3) sVal = `${p[1]}/${p[2]}/${p[0]}`;
      }
      if (eVal.includes('-')) {
        const p = eVal.split('-');
        if (p.length === 3) eVal = `${p[1]}/${p[2]}/${p[0]}`;
      }

      const isFutureWeek = Boolean(radioFuture?.checked);
      const keepOnCrew = Boolean(keepOnCrewCb?.checked || isFutureWeek);
      const notesVal = (notesInput?.value || '').trim();
      const dateRange = (sVal === eVal || !eVal) ? sVal : `${sVal} - ${eVal}`;

      closeModal();
      this.finalizeMoveToVacation(dragData, {
        vacationStartDate: sVal,
        vacationEndDate: eVal,
        dateRange,
        isFutureVacation: isFutureWeek,
        keepOnCrew,
        notes: notesVal,
        targetCrewNumber,
        isCopy,
        existingItem
      });
    });

    setTimeout(() => {
      startInput?.focus();
      startInput?.select();
    }, 50);
  }

  /**
   * Applies the vacation dates and this-week vs. future-week scope to the current plan
   * (and stages into the target future planning week if applicable).
   */
  finalizeMoveToVacation(dragData, opts = {}) {
    const empName = dragData.empName || dragData.name;
    const { fromBaseJob, fromSideType } = dragData;
    const {
      vacationStartDate = '',
      vacationEndDate = '',
      dateRange = '',
      isFutureVacation = false,
      keepOnCrew = false,
      notes = '',
      targetCrewNumber = '',
      isCopy = false,
      existingItem = null
    } = opts;

    const plan = this.getPlanForWeek(this.selectedWeek);
    if (!plan) return;
    if (!plan.sidePane) plan.sidePane = {};
    if (!plan.sidePane.vacation) plan.sidePane.vacation = [];
    if (!plan.confirmedPositions) plan.confirmedPositions = {};

    const normName = String(empName || '').trim().toLowerCase();
    const crewNum = (fromBaseJob || targetCrewNumber || '').replace(/\.\d+.*$/, '').trim();

    let srcCrew = null;
    let memberObj = null;

    if (crewNum) {
      srcCrew = plan.crews.find(c => c.jobNumber.toLowerCase() === crewNum.toLowerCase());
      if (srcCrew) {
        memberObj = srcCrew.members.find(m => m.name.trim().toLowerCase() === normName);
      }
    }
    if (!memberObj) {
      for (const c of plan.crews) {
        const found = c.members.find(m => m.name.trim().toLowerCase() === normName);
        if (found) {
          srcCrew = c;
          memberObj = found;
          break;
        }
      }
    }

    // Lookup employee profile info if needed when restoring to crew
    const empTable = this.db ? this.db.getTable('employees') : null;
    const liveRow = (empTable?.rows || []).find(r => String(r['Employee Name'] || r['Name'] || '').trim().toLowerCase() === normName);
    const resolvedClass = memberObj?.classification || existingItem?.classification || (liveRow ? String(liveRow['Job Classification'] || liveRow['Classification'] || 'Journeyman') : 'Journeyman');
    const resolvedRole = memberObj?.role || existingItem?.role || resolvedClass;

    if ((keepOnCrew || isFutureVacation) && srcCrew) {
      // Ensure the employee is present on their active field crew for this planned week!
      if (!memberObj) {
        memberObj = {
          name: existingItem?.name || empName,
          classification: resolvedClass,
          role: resolvedRole,
          isConfirmed: true,
          slot: `${srcCrew.jobNumber}.${srcCrew.members.length + 1}`
        };
        srcCrew.members.push(memberObj);
      }
      memberObj.vacationStartDate = vacationStartDate;
      memberObj.vacationEndDate = vacationEndDate;
      memberObj.vacationDateRange = dateRange;
      memberObj.isFutureVacation = Boolean(isFutureVacation);
      memberObj.vacationNotes = notes;
      memberObj.isConfirmed = true;
      plan.confirmedPositions[`${normName}::${srcCrew.jobNumber.toLowerCase()}`] = true;

      // Also update or add entry in plan.sidePane.vacation
      const vacIdx = plan.sidePane.vacation.findIndex(v => v.name.trim().toLowerCase() === normName);
      const vacItem = {
        name: memberObj.name,
        classification: resolvedClass,
        role: resolvedRole,
        currentJob: memberObj.slot || srcCrew.jobNumber,
        priorBaseJob: srcCrew.jobNumber,
        activeCrew: srcCrew.jobNumber,
        vacationStartDate,
        vacationEndDate,
        dateRange,
        isFutureVacation: Boolean(isFutureVacation),
        keepOnCrew: true,
        notes,
        note: `${isFutureVacation ? 'Future: ' : ''}${dateRange}${notes ? ' — ' + notes : ''}`,
        isConfirmed: true
      };

      if (vacIdx !== -1) {
        plan.sidePane.vacation[vacIdx] = vacItem;
      } else {
        plan.sidePane.vacation.push(vacItem);
      }
      plan.confirmedPositions[`${normName}::side:vacation`] = true;

      // If this is a Future Week vacation, check if the start date falls into one of the upcoming planning weeks and stage it there too!
      if (isFutureVacation && vacationStartDate) {
        this.stageFutureVacationInTargetWeek(vacItem, vacationStartDate);
      }

      this.savePlan(plan);
      this.refreshView();

      if (typeof window.showToast === 'function') {
        const msg = isFutureVacation
          ? `🏖️ Scheduled Future Vacation (${dateRange}) for ${empName}. Kept active on Crew ${srcCrew.jobNumber} this week.`
          : `🏖️ Scheduled Vacation (${dateRange}) for ${empName} (active on Crew ${srcCrew.jobNumber}).`;
        window.showToast(msg, 'success');
      }
      return;
    }

    // Otherwise: Employee is OFF on vacation during this planned week (removed from field crew for this week)
    if (fromSideType && fromSideType !== 'vacation' && plan.sidePane[fromSideType]) {
      const idx = plan.sidePane[fromSideType].findIndex(m => m.name.trim().toLowerCase() === normName);
      if (idx !== -1) {
        if (isCopy) {
          memberObj = { ...plan.sidePane[fromSideType][idx], isConfirmed: true, isDuplicate: true };
        } else {
          memberObj = plan.sidePane[fromSideType].splice(idx, 1)[0];
        }
      }
    }

    // Remove from any field crew in this week's plan (unless isCopy)
    if (!isCopy) {
      plan.crews.forEach(cr => {
        const idx = cr.members.findIndex(m => m.name.trim().toLowerCase() === normName);
        if (idx !== -1) {
          const spliced = cr.members.splice(idx, 1)[0];
          if (!memberObj) memberObj = spliced;
          cr.members.forEach((m, i) => {
            m.slot = `${cr.jobNumber}.${i + 1}`;
          });
          if (this.isCrewForeman(cr, spliced.name)) {
            const remaining = cr.members;
            const nextLead = remaining.find(m => /^(foreman|f|sup|gf|lead)/i.test(m.classification || m.role)) || remaining[0];
            cr.foreman = nextLead ? nextLead.name : '';
          }
        }
      });
    }

    const vacIdx = plan.sidePane.vacation.findIndex(v => v.name.trim().toLowerCase() === normName);
    const baseObj = (vacIdx !== -1 ? plan.sidePane.vacation[vacIdx] : null) || existingItem || memberObj || { name: empName };

    const updatedVacItem = {
      ...baseObj,
      name: baseObj.name || empName,
      classification: resolvedClass,
      role: resolvedRole,
      currentJob: crewNum || baseObj.currentJob || '',
      priorBaseJob: crewNum || baseObj.priorBaseJob || baseObj.currentJob || '',
      activeCrew: '',
      vacationStartDate,
      vacationEndDate,
      dateRange,
      isFutureVacation: Boolean(isFutureVacation),
      keepOnCrew: false,
      notes,
      note: `${dateRange}${notes ? ' — ' + notes : ''}`,
      isConfirmed: true
    };

    if (vacIdx !== -1) {
      plan.sidePane.vacation[vacIdx] = updatedVacItem;
    } else {
      plan.sidePane.vacation.push(updatedVacItem);
    }
    plan.confirmedPositions[`${normName}::side:vacation`] = true;

    this.savePlan(plan);
    this.refreshView();

    if (typeof window.showToast === 'function') {
      window.showToast(`🏖️ Scheduled ${empName} for Vacation (${dateRange} — Off This Week).`, 'success');
    }
  }

  /**
   * When an employee's vacation is marked as a Future Week, automatically stages them into
   * the corresponding future week's plan if that week's plan already exists in storage.
   */
  stageFutureVacationInTargetWeek(vacItem, startDateStr) {
    try {
      const p = String(startDateStr || '').trim().split('/');
      if (p.length !== 3) return;
      const dt = new Date(parseInt(p[2], 10), parseInt(p[0], 10) - 1, parseInt(p[1], 10));
      if (isNaN(dt.getTime())) return;

      // Compute the Sunday of that start date
      const sun = new Date(dt);
      sun.setDate(dt.getDate() - dt.getDay());
      const sunStr = `${String(sun.getMonth() + 1).padStart(2, '0')}/${String(sun.getDate()).padStart(2, '0')}/${sun.getFullYear()}`;
      if (sunStr === this.selectedWeek) return;

      if (this.plansMap && this.plansMap[sunStr]) {
        const futurePlan = this.plansMap[sunStr];
        if (!futurePlan.sidePane) futurePlan.sidePane = {};
        if (!futurePlan.sidePane.vacation) futurePlan.sidePane.vacation = [];
        const norm = vacItem.name.trim().toLowerCase();

        // Remove from field crew in that future week since they are on vacation that week
        (futurePlan.crews || []).forEach(cr => {
          const idx = (cr.members || []).findIndex(m => m.name.trim().toLowerCase() === norm);
          if (idx !== -1) {
            cr.members.splice(idx, 1);
            cr.members.forEach((m, i) => { m.slot = `${cr.jobNumber}.${i + 1}`; });
          }
        });

        const fIdx = futurePlan.sidePane.vacation.findIndex(v => v.name.trim().toLowerCase() === norm);
        const fItem = {
          ...vacItem,
          isFutureVacation: false,
          keepOnCrew: false,
          activeCrew: '',
          note: `${vacItem.dateRange}${vacItem.notes ? ' — ' + vacItem.notes : ''}`,
          isConfirmed: true
        };
        if (fIdx !== -1) {
          futurePlan.sidePane.vacation[fIdx] = fItem;
        } else {
          futurePlan.sidePane.vacation.push(fItem);
        }
        if (!futurePlan.confirmedPositions) futurePlan.confirmedPositions = {};
        futurePlan.confirmedPositions[`${norm}::side:vacation`] = true;
        this.savePlan(futurePlan);
      }
    } catch (err) {
      console.warn('[CrewPlanning] stageFutureVacationInTargetWeek warning:', err);
    }
  }

  editVacationSchedule(empName) {
    const plan = this.getPlanForWeek(this.selectedWeek);
    if (!plan) return;

    const norm = String(empName || '').trim().toLowerCase();
    let item = (plan.sidePane?.vacation || []).find(v => v.name.trim().toLowerCase() === norm);
    let crewMatch = null;
    let memberMatch = null;

    for (const c of (plan.crews || [])) {
      const m = (c.members || []).find(x => x.name.trim().toLowerCase() === norm);
      if (m) {
        crewMatch = c;
        memberMatch = m;
        break;
      }
    }

    if (!item && memberMatch) {
      item = {
        name: memberMatch.name,
        classification: memberMatch.classification,
        role: memberMatch.role,
        currentJob: memberMatch.slot || crewMatch.jobNumber,
        priorBaseJob: crewMatch.jobNumber,
        activeCrew: crewMatch.jobNumber,
        vacationStartDate: memberMatch.vacationStartDate || '',
        vacationEndDate: memberMatch.vacationEndDate || '',
        dateRange: memberMatch.vacationDateRange || '',
        isFutureVacation: Boolean(memberMatch.isFutureVacation),
        keepOnCrew: true,
        notes: memberMatch.vacationNotes || ''
      };
    }

    const dragData = {
      empName: item?.name || empName,
      fromBaseJob: crewMatch?.jobNumber || item?.priorBaseJob || item?.activeCrew || item?.currentJob || '',
      fromSideType: 'vacation'
    };
    this.promptVacationSchedule(dragData, false, item || null);
  }

  removeMemberFromSideCategory(name, sideType) {
    const plan = this.getPlanForWeek(this.selectedWeek);
    if (!plan || !plan.sidePane[sideType]) return;

    const norm = String(name || '').trim().toLowerCase();
    const removedItem = plan.sidePane[sideType].find(m => m.name.trim().toLowerCase() === norm);
    plan.sidePane[sideType] = plan.sidePane[sideType].filter(m => m.name.trim().toLowerCase() !== norm);

    // If it's a non-employee item, just remove it cleanly and stop
    if (this.isNonEmployeeName(name)) {
      this.savePlan(plan);
      this.refreshView();
      if (typeof window.showToast === 'function') {
        window.showToast(`Removed ${name}`, 'info');
      }
      return;
    }

    if (sideType === 'quit') {
      // Clear departure info from any crew member in the plan
      plan.crews.forEach(c => {
        c.members.forEach(m => {
          if (m.name.trim().toLowerCase() === norm) {
            delete m.departureDate;
            delete m.departureReason;
            delete m.departureNotes;
          }
        });
      });
    }

    if (sideType === 'vacation') {
      // Clear vacation info from any crew member in the plan
      plan.crews.forEach(c => {
        c.members.forEach(m => {
          if (m.name.trim().toLowerCase() === norm) {
            delete m.vacationStartDate;
            delete m.vacationEndDate;
            delete m.vacationDateRange;
            delete m.isFutureVacation;
            delete m.vacationNotes;
          }
        });
      });
    }

    // CHECK: Is the employee still present on any crew or in another staging bucket?
    const isPresentInCrews = plan.crews.some(c => c.members.some(m => m.name.trim().toLowerCase() === norm));
    const isPresentInOtherSide = Object.keys(plan.sidePane).some(k => k !== sideType && (plan.sidePane[k] || []).some(m => m.name.trim().toLowerCase() === norm));

    if (!isPresentInCrews && !isPresentInOtherSide) {
      // Employee was only in this staging bucket! Return them to their prior / original crew position!
      const baselineMap = this.getOriginalEmployeeLocations();
      const base = baselineMap.get(norm);

      const priorCrewJob = removedItem?.priorBaseJob ||
                           removedItem?.activeCrew ||
                           removedItem?.fromBaseJob ||
                           (removedItem?.currentJob ? String(removedItem.currentJob).replace(/\.\d+.*$/, '').trim() : null) ||
                           removedItem?.originalBaseJob ||
                           base?.originalBaseJob;

      let restored = false;
      if (priorCrewJob) {
        const targetCrew = plan.crews.find(c => c.jobNumber.toLowerCase() === priorCrewJob.toLowerCase());
        if (targetCrew) {
          const empTable = this.db ? this.db.getTable('employees') : null;
          const liveRow = (empTable?.rows || []).find(r => String(r['Employee Name'] || r['Name'] || '').trim().toLowerCase() === norm);

          const memberObj = {
            name: removedItem?.name || name,
            slot: `${targetCrew.jobNumber}.${targetCrew.members.length + 1}`,
            originalSlot: base?.originalSlot || targetCrew.jobNumber,
            originalBaseJob: targetCrew.jobNumber,
            classification: removedItem?.classification || liveRow?.['Job Classification'] || liveRow?.['Classification'] || 'Journeyman',
            role: removedItem?.role || liveRow?.['Role'] || 'JL',
            location: targetCrew.location || 'Helena',
            isConfirmed: false
          };
          targetCrew.members.push(memberObj);
          targetCrew.members.forEach((m, idx) => {
            m.slot = `${targetCrew.jobNumber}.${idx + 1}`;
          });
          restored = true;

          if (typeof window.showToast === 'function') {
            window.showToast(`↩️ Restored ${name} back to Crew ${targetCrew.jobNumber}`, 'success');
          }
        }
      }

      if (!restored) {
        // Fallback: Return to Planning Pool so they are never lost
        if (!plan.sidePane.planning) plan.sidePane.planning = [];
        plan.sidePane.planning.push({
          name: removedItem?.name || name,
          currentJob: base?.originalSlot || '',
          isConfirmed: false
        });
        if (typeof window.showToast === 'function') {
          window.showToast(`↩️ Moved ${name} to Planning Pool`, 'info');
        }
      }
    } else {
      if (typeof window.showToast === 'function') {
        window.showToast(`Removed ${name} from ${sideType === 'quit' ? 'Quit / Notice' : sideType}.`, 'info');
      }
    }

    this.savePlan(plan);
    this.refreshView();
  }

  // ==========================================================================
  // Duplication Modal & Execution (Employee in Multiple Locations)
  // ==========================================================================

  promptDuplicateMember(empName, fromBaseJob, fromSideType = '') {
    const plan = this.getPlanForWeek(this.selectedWeek);
    if (!plan) return;

    const modalId = 'modal-crew-duplicate-member';
    let existing = document.getElementById(modalId);
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = modalId;
    overlay.className = 'modal-overlay active';
    overlay.style.cssText = 'position: fixed; inset: 0; background: rgba(0,0,0,0.75) !important; display: flex; align-items: center; justify-content: center; z-index: 15000 !important; pointer-events: auto !important; padding: 20px;';

    const empTable = this.db ? this.db.getTable('employees') : null;
    const liveRow = (empTable?.rows || []).find(r => String(r['Employee Name'] || r['Name'] || '').trim().toLowerCase() === String(empName || '').trim().toLowerCase());
    const isForemanRole = /^(foreman|f|sup|gf)/i.test(String(liveRow?.['Job Classification'] || liveRow?.['Classification'] || ''));

    const isFromLightDuty = fromSideType === 'lightDuty' || (plan.sidePane?.lightDuty || []).some(m => m.name.toLowerCase() === empName.toLowerCase());

    let firstDifferentValue = '';
    const crewOptions = plan.crews.map(c => {
      const isCurrent = fromBaseJob && c.jobNumber.toLowerCase() === fromBaseJob.toLowerCase();
      const val = `crew::${c.jobNumber}`;
      if (!isCurrent && !firstDifferentValue) firstDifferentValue = val;
      return `
        <option value="${val}" ${isCurrent ? 'disabled style="color: #64748b;"' : ''}>
          🚜 Crew ${this.escapeHtml(c.jobNumber)} (${this.escapeHtml(c.location || 'Helena')}) — ${c.members.length} members ${isCurrent ? '(Current Crew)' : ''}
        </option>
      `;
    }).join('');

    overlay.innerHTML = `
      <div class="modal-box" style="background: var(--bg-secondary, #1e293b); border: 1px solid rgba(168, 85, 247, 0.4); border-radius: 10px; max-width: 480px; width: 100%; box-shadow: 0 10px 30px rgba(0,0,0,0.6); overflow: hidden; color: #fff; pointer-events: auto !important;">
        <div style="padding: 14px 18px; border-bottom: 1px solid rgba(255,255,255,0.1); display: flex; justify-content: space-between; align-items: center;">
          <div style="font-size: 15px; font-weight: 800; color: #c084fc; display: flex; align-items: center; gap: 8px;">
            <span>👯</span> Duplicate Employee in Planner
          </div>
          <button id="btn-duplicate-close-x" style="background: transparent; border: none; color: #94a3b8; font-size: 16px; cursor: pointer; padding: 4px 8px;">✕</button>
        </div>
        <div style="padding: 18px; font-size: 12.5px;">
          <p style="margin: 0 0 12px; color: #cbd5e1;">
            Duplicate <strong>${this.escapeHtml(empName)}</strong> into another crew or category so they can exist in multiple locations while planning.
          </p>
          ${isFromLightDuty ? `
            <div style="background: rgba(16, 185, 129, 0.15); border: 1px solid rgba(16, 185, 129, 0.4); border-radius: 6px; padding: 10px; margin-bottom: 14px; color: #6ee7b7; font-size: 11.5px; line-height: 1.4;">
              🩺 <strong>Light Duty Preservation:</strong> ${this.escapeHtml(empName)} will remain on Light Duty while also assigned as a working/foreman member on the destination crew.
            </div>
          ` : ''}
          <div style="background: rgba(147, 51, 234, 0.12); border: 1px solid rgba(168, 85, 247, 0.3); border-radius: 6px; padding: 10px; margin-bottom: 14px; color: #d8b4fe; font-size: 11.5px;">
            💡 <strong>Note:</strong> Duplicated employees will be highlighted in <strong>Purple</strong> across all locations until you confirm their assignment (turning them yellow).
          </div>
          <label style="display: block; font-weight: 700; margin-bottom: 6px; color: #94a3b8; font-size: 11.5px;">Select Destination Crew or Staging Category:</label>
          <select id="duplicate-dest-select" style="width: 100%; box-sizing: border-box; background: #0f172a; border: 1px solid #3b82f6; border-radius: 6px; padding: 8px 10px; color: #fff; font-size: 12.5px; font-weight: 600; cursor: pointer;">
            <optgroup label="Planned Field Crews">
              ${crewOptions}
            </optgroup>
            <optgroup label="Staging Categories">
              <option value="side::planning">📌 Planning Pool (Floaters)</option>
              <option value="side::vacation">🏖️ Scheduled Vacation</option>
              <option value="side::weeds">🌾 Weeds (Job-Attached)</option>
              <option value="side::lightDuty">🩺 Light Duty / Medical</option>
            </optgroup>
          </select>
          <div id="duplicate-as-foreman-wrap" style="margin-top: 12px; background: rgba(244, 114, 182, 0.12); border: 1px solid rgba(244, 114, 182, 0.35); border-radius: 6px; padding: 10px 12px;">
            <label style="display: flex; align-items: flex-start; gap: 8px; cursor: pointer; font-size: 12px; color: #fbcfe8;">
              <input type="checkbox" id="duplicate-as-foreman" ${isForemanRole ? 'checked' : ''} style="margin-top: 2px; cursor: pointer; accent-color: #ec4899; width: 16px; height: 16px;">
              <div>
                <div style="font-weight: 700; color: #f472b6;">👑 Designate as Crew Foreman on Destination Crew</div>
                <div style="font-size: 11px; color: #cbd5e1; margin-top: 2px;">
                  Places ${this.escapeHtml(empName)} at slot .1 and designates them as the crew lead.
                </div>
              </div>
            </label>
          </div>
        </div>
        <div style="padding: 12px 18px; border-top: 1px solid rgba(255,255,255,0.1); background: rgba(0,0,0,0.25); display: flex; justify-content: space-between; align-items: center; gap: 8px;">
          <button class="btn btn-secondary" id="btn-duplicate-cancel" style="font-size: 12px; padding: 6px 14px; cursor: pointer;">Cancel</button>
          <button class="btn btn-primary" id="btn-duplicate-submit" style="background: linear-gradient(135deg, #a855f7 0%, #7e22ce 100%); border: none; font-size: 12px; font-weight: 700; padding: 6px 16px; cursor: pointer;">
            👯 Duplicate
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    const select = overlay.querySelector('#duplicate-dest-select');
    const fmWrap = overlay.querySelector('#duplicate-as-foreman-wrap');
    if (select && firstDifferentValue) {
      select.value = firstDifferentValue;
    }

    const updateFmVisibility = () => {
      const isCrew = select && select.value.startsWith('crew::');
      if (fmWrap) fmWrap.style.display = isCrew ? 'block' : 'none';
    };
    select?.addEventListener('change', updateFmVisibility);
    updateFmVisibility();

    const closeModal = () => {
      overlay.remove();
    };

    overlay.querySelector('#btn-duplicate-close-x')?.addEventListener('click', closeModal);
    overlay.querySelector('#btn-duplicate-cancel')?.addEventListener('click', closeModal);
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeModal();
    });

    overlay.querySelector('#btn-duplicate-submit')?.addEventListener('click', () => {
      const destVal = select ? select.value : '';
      if (!destVal) {
        alert('Please select a destination crew or category.');
        return;
      }
      const asForeman = overlay.querySelector('#duplicate-as-foreman')?.checked ?? false;
      this.executeDuplicateMember(empName, fromBaseJob, destVal, fromSideType, asForeman);
      closeModal();
    });

    const onKey = (e) => {
      if (e.key === 'Escape') {
        closeModal();
        window.removeEventListener('keydown', onKey);
      }
    };
    window.addEventListener('keydown', onKey);
  }

  executeDuplicateMember(empName, fromBaseJob, destValue, fromSideType = '', asForeman = false) {
    const modalId = 'modal-crew-duplicate-member';
    const m = document.getElementById(modalId);
    if (m) m.remove();

    if (!destValue) return;
    const [destType, destTarget] = destValue.split('::');

    const effectiveFromSide = fromSideType || (fromBaseJob ? '' : 'planning');
    const dragData = {
      empName,
      fromBaseJob: fromBaseJob || '',
      fromSideType: effectiveFromSide,
      isCopy: true
    };

    if (destType === 'crew') {
      const insertPos = asForeman ? 'start' : 'end';
      this.handleReorderOrMoveMember(dragData, destTarget, null, insertPos, true);
      if (asForeman) {
        const plan = this.getPlanForWeek(this.selectedWeek);
        const destCrew = plan?.crews?.find(c => c.jobNumber.toLowerCase() === destTarget.toLowerCase());
        if (destCrew) {
          destCrew.foreman = empName;
          this.savePlan(plan);
          this.refreshView();
        }
      }
    } else if (destType === 'side') {
      this.handleMoveToSideCategory(dragData, destTarget, true);
    }

    if (typeof window.showToast === 'function') {
      window.showToast(`👯 Duplicated ${empName} to ${destTarget}${asForeman ? ' as Foreman' : ''}. Highlighted in purple.`, 'info');
    }
  }

  /**
   * Dialog for viewing, editing slot, swapping, or removing a duplicated employee in the planner
   */
  promptEditPlannedSecondJob(empName, currentBaseJob) {
    const plan = this.getPlanForWeek(this.selectedWeek);
    if (!plan) return;

    const modalId = 'modal-planned-edit-second-job';
    let existing = document.getElementById(modalId);
    if (existing) existing.remove();

    const norm = String(empName || '').toLowerCase().trim();
    const occMap = this.getEmployeeOccurrencesMap(plan);
    const occurrences = occMap.get(norm) || [];

    const currentCrew = plan.crews.find(c => c.jobNumber.toLowerCase() === currentBaseJob.toLowerCase());
    const currentMember = currentCrew?.members.find(m => m.name.toLowerCase() === norm);

    const otherOcc = occurrences.find(o => o.baseJob && o.baseJob.toLowerCase() !== currentBaseJob.toLowerCase());
    const otherCrew = otherOcc ? plan.crews.find(c => c.jobNumber.toLowerCase() === otherOcc.baseJob.toLowerCase()) : null;
    const otherMember = otherCrew?.members.find(m => m.name.toLowerCase() === norm);

    const jtTable = window.db ? window.db.getTable('job_tracking') : null;
    const getCrewInfo = (bj) => {
      if (!bj || !jtTable) return { status: 'Active', loc: 'Helena' };
      const jRow = (jtTable.rows || []).find(j => {
        const jn = String(j['Job Number'] || j['Job #'] || '').trim().replace(/\.\d+.*$/, '');
        return jn.toLowerCase() === String(bj).trim().toLowerCase();
      });
      return {
        status: String(jRow?.['Status'] || 'Active').trim(),
        loc: String(jRow?.['Location'] || 'Helena').trim()
      };
    };

    const currentInfo = getCrewInfo(currentBaseJob);
    const otherInfo = otherCrew ? getCrewInfo(otherCrew.jobNumber) : { status: '', loc: '' };

    const isPendingOrHold = (st) => /pending|hold/i.test(st);
    let currentIsPrimary = true;
    if (isPendingOrHold(currentInfo.status) && !isPendingOrHold(otherInfo.status)) {
      currentIsPrimary = false;
    }

    const currentSlot = currentMember?.slot || currentBaseJob;
    const otherSlot = otherMember?.slot || otherCrew?.jobNumber || '(None)';

    const overlay = document.createElement('div');
    overlay.id = modalId;
    overlay.className = 'modal-overlay active';
    overlay.style.cssText = 'position: fixed; inset: 0; background: rgba(0,0,0,0.78) !important; display: flex; align-items: center; justify-content: center; z-index: 15000 !important; pointer-events: auto !important; padding: 20px;';

    overlay.innerHTML = `
      <div class="modal-box" style="background: var(--bg-secondary, #1e293b); border: 1px solid rgba(245, 158, 11, 0.45); border-radius: 10px; max-width: 520px; width: 100%; box-shadow: 0 16px 40px rgba(0,0,0,0.7); overflow: hidden; color: #fff; pointer-events: auto !important;">
        <div style="padding: 14px 20px; border-bottom: 1px solid rgba(255,255,255,0.1); display: flex; justify-content: space-between; align-items: center; background: rgba(0,0,0,0.25);">
          <div style="font-size: 15px; font-weight: 800; color: #fbbf24; display: flex; align-items: center; gap: 8px;">
            <span>⚡</span> Planned 1st &amp; 2nd Job Assignment for ${this.escapeHtml(empName)}
          </div>
          <button id="btn-edit-plan-sec-close" style="background: transparent; border: none; color: #94a3b8; font-size: 16px; cursor: pointer; padding: 4px 8px;">✕</button>
        </div>

        <div style="padding: 20px; font-size: 12.5px; display: flex; flex-direction: column; gap: 14px;">
          <!-- Dual Job Overview Cards -->
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
            <!-- Current Crew Card -->
            <div style="background: ${currentIsPrimary ? 'rgba(59, 130, 246, 0.1)' : 'rgba(245, 158, 11, 0.1)'}; border: 1px solid ${currentIsPrimary ? 'rgba(59, 130, 246, 0.35)' : 'rgba(245, 158, 11, 0.35)'}; border-radius: 8px; padding: 12px;">
              <div style="font-size: 11px; font-weight: 800; color: ${currentIsPrimary ? '#93c5fd' : '#fde047'}; text-transform: uppercase; margin-bottom: 4px; display: flex; align-items: center; justify-content: space-between;">
                <span>${currentIsPrimary ? '⭐ 1st Job (Active)' : '⚡ 2nd Job (Pending)'}</span>
                <span class="badge" style="background: rgba(255,255,255,0.1); color: inherit; font-size: 9.5px; padding: 1px 5px;">${this.escapeHtml(currentInfo.status)}</span>
              </div>
              <div style="font-family: monospace; font-size: 15px; font-weight: 800; color: #fff; margin-bottom: 2px;">
                ${this.escapeHtml(currentSlot)}
              </div>
              <div style="font-size: 11px; color: var(--text-muted);">
                Crew ${this.escapeHtml(currentBaseJob)} • ${this.escapeHtml(currentInfo.loc)}
              </div>
            </div>

            <!-- Other Crew Card -->
            <div style="background: ${!currentIsPrimary ? 'rgba(59, 130, 246, 0.1)' : 'rgba(245, 158, 11, 0.1)'}; border: 1px solid ${!currentIsPrimary ? 'rgba(59, 130, 246, 0.35)' : 'rgba(245, 158, 11, 0.35)'}; border-radius: 8px; padding: 12px;">
              <div style="font-size: 11px; font-weight: 800; color: ${!currentIsPrimary ? '#93c5fd' : '#fde047'}; text-transform: uppercase; margin-bottom: 4px; display: flex; align-items: center; justify-content: space-between;">
                <span>${!currentIsPrimary ? '⭐ 1st Job (Active)' : '⚡ 2nd Job (Pending)'}</span>
                <span class="badge" style="background: rgba(255,255,255,0.1); color: inherit; font-size: 9.5px; padding: 1px 5px;">${this.escapeHtml(otherInfo.status || 'Active')}</span>
              </div>
              <div style="font-family: monospace; font-size: 15px; font-weight: 800; color: #fff; margin-bottom: 2px;">
                ${this.escapeHtml(otherSlot)}
              </div>
              <div style="font-size: 11px; color: var(--text-muted);">
                ${otherCrew ? `Crew ${this.escapeHtml(otherCrew.jobNumber)} • ${this.escapeHtml(otherInfo.loc)}` : '(No other crew)'}
              </div>
            </div>
          </div>

          <!-- Edit Slot Input for Current Crew -->
          <div>
            <label style="display: block; font-weight: 700; margin-bottom: 6px; color: #cbd5e1; font-size: 11.5px;">
              Edit Slot on Crew ${this.escapeHtml(currentBaseJob)}:
            </label>
            <input type="text" id="edit-planned-slot-input" value="${this.escapeHtml(currentSlot)}" style="width: 100%; box-sizing: border-box; background: #0f172a; border: 1px solid var(--border-color); border-radius: 6px; padding: 8px 12px; color: #fff; font-family: monospace; font-size: 13px; font-weight: 700;">
          </div>
        </div>

        <div style="padding: 12px 20px; border-top: 1px solid rgba(255,255,255,0.1); background: rgba(0,0,0,0.25); display: flex; justify-content: space-between; align-items: center; gap: 8px;">
          <button class="btn btn-secondary" id="btn-remove-planned-second" style="color: #ef4444; border-color: rgba(239, 68, 68, 0.4); font-size: 11.5px; padding: 6px 12px; cursor: pointer;">
            🗑️ Remove from Crew ${this.escapeHtml(currentBaseJob)}
          </button>
          <div style="display: flex; gap: 8px;">
            <button class="btn btn-secondary" id="btn-edit-plan-sec-cancel" style="font-size: 12px; padding: 6px 14px; cursor: pointer;">Cancel</button>
            <button class="btn btn-primary" id="btn-edit-plan-sec-save" style="background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); border: none; font-size: 12px; font-weight: 700; padding: 6px 16px; cursor: pointer;">
              Save Slot
            </button>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    const closeModal = () => overlay.remove();
    overlay.querySelector('#btn-edit-plan-sec-close')?.addEventListener('click', closeModal);
    overlay.querySelector('#btn-edit-plan-sec-cancel')?.addEventListener('click', closeModal);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) closeModal(); });

    // Save slot
    overlay.querySelector('#btn-edit-plan-sec-save')?.addEventListener('click', () => {
      const newSlot = overlay.querySelector('#edit-planned-slot-input')?.value.trim();
      if (newSlot && currentMember) {
        currentMember.slot = newSlot;
        this.savePlan(plan);
        this.refreshView();
        if (typeof window.showToast === 'function') {
          window.showToast(`Updated ${empName} slot to ${newSlot} on Crew ${currentBaseJob}.`, 'success');
        }
      }
      closeModal();
    });

    // Remove from current crew
    overlay.querySelector('#btn-remove-planned-second')?.addEventListener('click', () => {
      if (!confirm(`Remove ${empName} from Crew ${currentBaseJob}?`)) return;
      if (currentCrew) {
        currentCrew.members = currentCrew.members.filter(m => m.name.toLowerCase() !== norm);
        currentCrew.members.forEach((m, idx) => {
          m.slot = `${currentCrew.jobNumber}.${idx + 1}`;
        });
        if (this.isCrewForeman(currentCrew, empName)) {
          currentCrew.foreman = currentCrew.members.length > 0 ? currentCrew.members[0].name : '';
        }
        if (plan.confirmedPositions) {
          delete plan.confirmedPositions[`${norm}::${String(currentBaseJob).toLowerCase()}`];
        }
        // Clean up secondaryJob reference on remaining occurrence if only 1 occurrence remains
        const remainingOccs = (plan.crews || []).flatMap(c => (c.members || []).filter(m => m.name && m.name.toLowerCase() === norm));
        if (remainingOccs.length === 1) {
          remainingOccs[0].secondaryJob = '';
          delete remainingOccs[0].isSecondaryMember;
          delete remainingOccs[0].primaryJobNumber;
        }
        const isStillInCrews = (plan.crews || []).some(c => (c.members || []).some(m => m.name && m.name.toLowerCase() === norm));
        const sp = plan.sidePane || {};
        const isStillInSide = Object.keys(sp).some(k => (sp[k] || []).some(m => m.name && m.name.toLowerCase() === norm));
        if (!isStillInCrews && !isStillInSide) {
          if (!plan.sidePane) plan.sidePane = {};
          if (!plan.sidePane.planning) plan.sidePane.planning = [];
          plan.sidePane.planning.push({
            name: empName,
            slot: '',
            currentJob: `${currentBaseJob} (Unassigned)`,
            isConfirmed: false
          });
        }
        this.savePlan(plan);
        this.refreshView();
        if (typeof window.showToast === 'function') {
          window.showToast(`Removed ${empName} from Crew ${currentBaseJob}.`, 'info');
        }
      }
      closeModal();
    });
  }

  // ==========================================================================
  // Confirmation System (Purple -> Yellow)
  // ==========================================================================

  /**
   * Toggles confirmation state for an employee in a crew or side category.
   */
  toggleConfirmMemberPosition(empName, baseJobOrSideType) {
    const plan = this.getPlanForWeek(this.selectedWeek);
    if (!plan) return;

    const norm = String(empName || '').toLowerCase().trim();
    if (!plan.confirmedPositions) plan.confirmedPositions = {};

    let targetMember = null;
    let matchedCrewJob = null;
    let matchedSideType = null;
    let confirmKey = '';

    const rawLoc = String(baseJobOrSideType || '').trim();
    const locLower = rawLoc.toLowerCase();

    if (rawLoc) {
      const crew = plan.crews.find(c => String(c.jobNumber || '').trim().toLowerCase() === locLower);
      if (crew) {
        targetMember = crew.members.find(m => String(m.name || '').trim().toLowerCase() === norm);
        matchedCrewJob = String(crew.jobNumber || '').trim();
        confirmKey = `${norm}::${matchedCrewJob.toLowerCase()}`;
      } else if (plan.sidePane && plan.sidePane[rawLoc]) {
        targetMember = plan.sidePane[rawLoc].find(m => String(m.name || '').trim().toLowerCase() === norm);
        matchedSideType = rawLoc;
        confirmKey = `${norm}::${locLower}`;
      }
    }

    if (!targetMember) {
      // Find first matching occurrence in plan crews
      for (const crew of plan.crews) {
        const found = crew.members.find(m => String(m.name || '').trim().toLowerCase() === norm);
        if (found) {
          targetMember = found;
          matchedCrewJob = String(crew.jobNumber || '').trim();
          confirmKey = `${norm}::${matchedCrewJob.toLowerCase()}`;
          break;
        }
      }
      // Or in sidePane categories
      if (!targetMember && plan.sidePane) {
        for (const cat of Object.keys(plan.sidePane)) {
          const found = (plan.sidePane[cat] || []).find(m => String(m.name || '').trim().toLowerCase() === norm);
          if (found) {
            targetMember = found;
            matchedSideType = cat;
            confirmKey = `${norm}::${cat.toLowerCase()}`;
            break;
          }
        }
      }
    }

    if (targetMember) {
      const currentSt = this.getEmployeePlanningStatus(empName, matchedCrewJob, matchedSideType, plan);
      const newState = !currentSt.isConfirmed;
      targetMember.isConfirmed = newState;
      if (confirmKey) {
        plan.confirmedPositions[confirmKey] = newState;
      }
      if (!currentSt.isMultiLocation) {
        plan.confirmedPositions[norm] = newState;
      }
      this.savePlan(plan);
      if (typeof window.showToast === 'function') {
        window.showToast(
          newState ? `🟡 Confirmed ${empName}'s position.` : `🟣 Set ${empName} back to unconfirmed.`,
          newState ? 'success' : 'info'
        );
      }
      this.refreshView();
    }
  }

  confirmAllPurpleMembers() {
    const plan = this.getPlanForWeek(this.selectedWeek);
    if (!plan) return;

    const purpleList = this.getPurpleMembers(plan);
    if (purpleList.length === 0) return;

    if (!plan.confirmedPositions) plan.confirmedPositions = {};

    purpleList.forEach(p => {
      if (p.memberObj) p.memberObj.isConfirmed = true;
      const norm = p.name.toLowerCase().trim();
      const locKey = p.baseJob ? p.baseJob.toLowerCase() : (p.sideType ? p.sideType.toLowerCase() : '');
      if (locKey) plan.confirmedPositions[`${norm}::${locKey}`] = true;
      plan.confirmedPositions[norm] = true;
    });

    this.savePlan(plan);
    if (typeof window.showToast === 'function') {
      window.showToast(`🟡 Confirmed all ${purpleList.length} employee position(s)! Now ready to publish.`, 'success');
    }
    this.refreshView();
  }

  // ==========================================================================
  // Publish Gating & Purple Unconfirmed Popup Blocker
  // ==========================================================================

  getPurpleMembers(plan) {
    if (!plan) return [];
    const baselineMap = this.getOriginalEmployeeLocations();
    const occMap = this.getEmployeeOccurrencesMap(plan);
    const purpleList = [];

    (plan.crews || []).forEach(crew => {
      (crew.members || []).forEach(m => {
        if (!m.name || this.isNonEmployeeName(m.name)) return;
        const st = this.getEmployeePlanningStatus(m.name, crew.jobNumber, null, plan, baselineMap, occMap);
        if (st.statusColor === 'purple') {
          purpleList.push({
            name: m.name,
            currentLocation: `🚜 Crew ${crew.jobNumber} (${m.slot || crew.jobNumber})`,
            baseJob: crew.jobNumber,
            sideType: null,
            status: st,
            memberObj: m
          });
        }
      });
    });

    const sp = plan.sidePane || {};
    for (const cat of ['planning', 'vacation', 'weeds', 'lightDuty', 'quit', 'pendingHires']) {
      (sp[cat] || []).forEach(item => {
        if (!item.name || this.isNonEmployeeName(item.name)) return;
        const st = this.getEmployeePlanningStatus(item.name, null, cat, plan, baselineMap, occMap);
        if (st.statusColor === 'purple') {
          purpleList.push({
            name: item.name,
            currentLocation: `📋 Staging: ${cat}`,
            baseJob: null,
            sideType: cat,
            status: st,
            memberObj: item
          });
        }
      });
    }

    return purpleList;
  }

  showUnconfirmedPurpleModal(purpleMembers, plan) {
    const modalId = 'modal-crew-unconfirmed-purple';
    let existing = document.getElementById(modalId);
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = modalId;
    overlay.className = 'modal-overlay active';
    overlay.style.cssText = 'position: fixed; inset: 0; background: rgba(0,0,0,0.8) !important; display: flex; align-items: center; justify-content: center; z-index: 15000 !important; pointer-events: auto !important; padding: 20px;';

    overlay.innerHTML = `
      <div class="modal-box" style="background: var(--bg-secondary, #1e293b); border: 1px solid rgba(168, 85, 247, 0.5); border-radius: 10px; max-width: 660px; width: 100%; max-height: 90vh; display: flex; flex-direction: column; box-shadow: 0 10px 40px rgba(0,0,0,0.6); overflow: hidden; color: #fff; pointer-events: auto !important;">
        
        <!-- Modal Header -->
        <div style="padding: 16px 20px; border-bottom: 1px solid rgba(255,255,255,0.1); background: rgba(147, 51, 234, 0.15); display: flex; justify-content: space-between; align-items: center;">
          <div style="font-size: 16px; font-weight: 800; color: #d8b4fe; display: flex; align-items: center; gap: 8px;">
            <span>⚠️</span> Cannot Publish: Unconfirmed Employee Changes (${purpleMembers.length})
          </div>
          <button id="btn-purple-close-x" style="background: transparent; border: none; color: #94a3b8; font-size: 18px; cursor: pointer; padding: 4px 8px;">✕</button>
        </div>

        <!-- Modal Body -->
        <div style="padding: 20px; overflow-y: auto; flex: 1; font-size: 13px;">
          
          <div style="background: rgba(147, 51, 234, 0.12); border: 1px solid rgba(168, 85, 247, 0.35); border-radius: 6px; padding: 12px; margin-bottom: 16px; color: #cbd5e1; font-size: 12.5px; line-height: 1.5;">
            <strong style="color: #fde047;">Publish is locked until all purple employees are confirmed.</strong><br>
            The employees below were moved between crews or are assigned to multiple locations. Review each position and click <strong>Confirm Position</strong> to turn them yellow, or click <strong>Confirm All Remaining</strong> to approve all planned positions at once.
          </div>

          <div style="font-weight: 700; margin-bottom: 10px; color: #93c5fd; font-size: 12.5px;">
            Unconfirmed Employees Requiring Verification:
          </div>

          <div id="unconfirmed-purple-list-container" style="display: flex; flex-direction: column; gap: 8px;">
            ${purpleMembers.map((p, idx) => `
              <div id="purple-item-row-${idx}" style="display: flex; align-items: center; justify-content: space-between; background: rgba(0,0,0,0.25); border: 1px solid rgba(168, 85, 247, 0.3); border-left: 4px solid #c084fc; border-radius: 6px; padding: 8px 12px; gap: 10px;">
                <div style="flex: 1; min-width: 0;">
                  <div style="font-weight: 700; font-size: 13px; color: #f8fafc; display: flex; align-items: center; gap: 6px;">
                    <span>🟣</span>
                    <span>${this.escapeHtml(p.name)}</span>
                    ${p.status.isMultiLocation ? `<span class="badge" style="background: rgba(147, 51, 234, 0.3); color: #d8b4fe; font-size: 9.5px; padding: 1px 5px; border-radius: 3px;">In Multiple Locations (${p.status.occurrencesCount})</span>` : ''}
                  </div>
                  <div style="font-size: 11.5px; color: #94a3b8; margin-top: 2px;">
                    <span>Original: <strong style="color: #cbd5e1;">${this.escapeHtml(p.status.originalLabel || 'Unassigned')}</strong></span> →
                    <span>Planned: <strong style="color: #60a5fa;">${this.escapeHtml(p.currentLocation)}</strong></span>
                  </div>
                </div>
                <button class="btn btn-xs"
                        id="btn-confirm-purple-${idx}"
                        onclick="window.crewPlanningEngine.confirmSinglePurpleFromModal('${this.escapeJs(p.name)}', '${this.escapeJs(p.baseJob || '')}', '${this.escapeJs(p.sideType || '')}', ${idx})"
                        style="background: rgba(234, 179, 8, 0.2); color: #fde047; border: 1px solid #eab308; font-size: 11px; font-weight: 700; padding: 4px 10px; border-radius: 4px; cursor: pointer; white-space: nowrap;">
                  ✅ Confirm Position
                </button>
              </div>
            `).join('')}
          </div>

        </div>

        <!-- Modal Footer -->
        <div style="padding: 14px 20px; border-top: 1px solid rgba(255,255,255,0.1); background: rgba(0,0,0,0.25); display: flex; justify-content: space-between; align-items: center; gap: 10px; flex-wrap: wrap;">
          <button class="btn btn-secondary" id="btn-purple-cancel" style="font-size: 12px; padding: 6px 14px; cursor: pointer;">
            ✕ Close & Review Planner
          </button>
          <div style="display: flex; gap: 8px;">
            <button class="btn btn-primary" id="btn-purple-confirm-all" style="background: linear-gradient(135deg, #a855f7 0%, #7e22ce 100%); border: none; font-size: 12px; font-weight: 700; padding: 6px 14px; cursor: pointer;">
              ✅ Confirm All (${purpleMembers.length}) & Proceed
            </button>
          </div>
        </div>

      </div>
    `;

    document.body.appendChild(overlay);

    const closeModal = () => {
      overlay.remove();
    };

    overlay.querySelector('#btn-purple-close-x')?.addEventListener('click', closeModal);
    overlay.querySelector('#btn-purple-cancel')?.addEventListener('click', closeModal);
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeModal();
    });

    overlay.querySelector('#btn-purple-confirm-all')?.addEventListener('click', () => {
      closeModal();
      this.confirmAllPurpleMembers();
      this.openPublishModal();
    });

    const onKey = (e) => {
      if (e.key === 'Escape') {
        closeModal();
        window.removeEventListener('keydown', onKey);
      }
    };
    window.addEventListener('keydown', onKey);
  }

  confirmSinglePurpleFromModal(empName, baseJob, sideType, idx) {
    const plan = this.getPlanForWeek(this.selectedWeek);
    if (!plan) return;

    this.toggleConfirmMemberPosition(empName, baseJob || sideType);

    const btn = document.getElementById(`btn-confirm-purple-${idx}`);
    if (btn) {
      btn.innerText = '🟡 Confirmed';
      btn.style.background = 'rgba(234, 179, 8, 0.4)';
      btn.style.borderColor = '#fde047';
      btn.disabled = true;
    }

    // Check if any purple remaining
    const remaining = this.getPurpleMembers(plan);
    if (remaining.length === 0) {
      const modal = document.getElementById('modal-crew-unconfirmed-purple');
      if (modal) modal.remove();
      this.openPublishModal();
    }
  }

  confirmAllPurpleAndProceed() {
    const modal = document.getElementById('modal-crew-unconfirmed-purple');
    if (modal) modal.remove();

    this.confirmAllPurpleMembers();
    this.openPublishModal();
  }

  // ==========================================================================
  // Pre-flight Delta Validator & One-Click Publish Engine
  // ==========================================================================

  computePublishDeltas(plan) {
    const empTable = this.db.getTable('employees');
    const jtTable = this.db.getTable('job_tracking');
    const liveEmps = (empTable && empTable.rows) || [];
    const liveJt = (jtTable && jtTable.rows) || [];
    const baselineMap = this.getOriginalEmployeeLocations();

    const transfers = [];
    const vacations = [];
    const quits = [];
    const weeds = [];
    const foremenChanges = [];
    const scheduleChanges = [];
    const newHires = [];
    const departedOnLive = [];

    // Compare planned members
    plan.crews.forEach(crew => {
      // Check foreman change
      const liveJtCrew = liveJt.find(j => {
        const jn = String(j['Job Number'] || j['Job #'] || '').trim();
        return jn === crew.jobNumber || jn.replace(/\.\d+.*$/, '').trim() === crew.jobNumber;
      });
      const currentForeman = liveJtCrew ? String(liveJtCrew['Foreman'] || '').trim() : '';
      const plannedForeman = String(crew.foreman || '').trim();
      const isSameForeman = plannedForeman.toLowerCase() === currentForeman.toLowerCase() ||
        (plannedForeman && currentForeman && this.isCrewForeman({ foreman: plannedForeman }, currentForeman));
      if (!isSameForeman) {
        foremenChanges.push({
          jobNumber: crew.jobNumber,
          oldForeman: currentForeman || 'None',
          newForeman: plannedForeman || 'None'
        });
      }

      // Check schedule & working days changes
      if (liveJtCrew) {
        const liveSched = String(liveJtCrew['Work Schedule'] || liveJtCrew['Schedule'] || 'Mon-Thu (4 10s)').trim();
        const liveSkipMon = liveJtCrew['Skip Mon'] === true || String(liveJtCrew['Skip Mon']).toLowerCase() === 'true';
        const liveSkipTue = liveJtCrew['Skip Tue'] === true || String(liveJtCrew['Skip Tue']).toLowerCase() === 'true';
        const liveSkipWed = liveJtCrew['Skip Wed'] === true || String(liveJtCrew['Skip Wed']).toLowerCase() === 'true';
        const liveSkipThu = liveJtCrew['Skip Thu'] === true || String(liveJtCrew['Skip Thu']).toLowerCase() === 'true';
        const liveSkipFri = liveJtCrew['Skip Fri'] === true || String(liveJtCrew['Skip Fri']).toLowerCase() === 'true';
        const liveSkipSat = liveJtCrew['Skip Sat'] === true || String(liveJtCrew['Skip Sat']).toLowerCase() === 'true';
        const liveSkipSun = liveJtCrew['Skip Sun'] === true || String(liveJtCrew['Skip Sun']).toLowerCase() === 'true';

        const crewSkips = this.getCrewSkipDays(crew);
        const schedChanged = Boolean(crew.schedule && crew.schedule !== liveSched);
        const daysChanged = (
          crewSkips.isSkipMon !== liveSkipMon ||
          crewSkips.isSkipTue !== liveSkipTue ||
          crewSkips.isSkipWed !== liveSkipWed ||
          crewSkips.isSkipThu !== liveSkipThu ||
          crewSkips.isSkipFri !== liveSkipFri ||
          crewSkips.isSkipSat !== liveSkipSat ||
          crewSkips.isSkipSun !== liveSkipSun
        );

        if (schedChanged || daysChanged) {
          scheduleChanges.push({
            jobNumber: crew.jobNumber,
            oldSchedule: liveSched,
            newSchedule: crew.schedule || liveSched,
            daysChanged
          });
        }
      }

      crew.members.forEach(m => {
        const live = liveEmps.find(e => String(e['Employee Name'] || e['Name'] || '').trim().toLowerCase() === m.name.toLowerCase());
        if (live) {
          const liveLoc = String(live['Location'] || '').trim().toLowerCase();
          const liveStat = String(live['Status'] || '').trim().toLowerCase();

          // 1. RECOGNITION RULE: If employee was already moved to Previous Employee on live, DO NOT resurrect them!
          if (liveLoc === 'previous employee' || liveLoc.includes('previous') || liveStat === 'previous employee') {
            departedOnLive.push({
              name: m.name,
              plannedCrew: crew.jobNumber,
              liveStatus: 'Previous Employee'
            });
            return;
          }

          const liveJob = String(live['Job Number'] || '').trim();
          const base = baselineMap.get(m.name.toLowerCase());
          const originalJob = base ? (base.originalSlot || base.originalBaseJob) : null;
          // Check if the employee was manually modified on the live sheet mid-week after the plan was drafted
          const wasLiveChanged = Boolean(originalJob && liveJob && originalJob.toLowerCase() !== liveJob.toLowerCase());

          const occMap = this.getEmployeeOccurrencesMap(plan);
          const isMulti = (occMap.get(m.name.toLowerCase()) || []).length > 1;
          const inLightDuty = (plan.sidePane?.lightDuty || []).some(ld => ld.name.toLowerCase() === m.name.toLowerCase());
          const curSecondary = String(live['Secondary Job Number'] || live['Secondary Job #'] || '').trim();

          if (inLightDuty || isMulti) {
            // Duplicated/Multi-crew assignment: write to Secondary Job Number, preserving primary & Light Duty
            if (m.slot && m.slot !== curSecondary) {
              transfers.push({
                name: m.name,
                fromJob: curSecondary || 'None',
                toJob: m.slot,
                isSecondaryAssignment: true,
                keepLightDuty: inLightDuty,
                destinationCrew: crew.jobNumber,
                destinationLocation: crew.location || 'Helena',
                targetRow: live,
                wasLiveChanged,
                originalJob
              });
            }
          } else {
            if (curSecondary && !transfers.some(tr => tr.name.toLowerCase() === m.name.toLowerCase() && tr.clearSecondary)) {
              // Employee only has 1 crew assignment now: clear previous Secondary Job Number on live
              transfers.push({
                name: m.name,
                fromJob: curSecondary,
                toJob: '',
                isSecondaryAssignment: true,
                clearSecondary: true,
                keepLightDuty: false,
                destinationCrew: '',
                destinationLocation: '',
                targetRow: live,
                wasLiveChanged,
                originalJob
              });
            }
            if (m.slot && m.slot !== liveJob) {
              transfers.push({
                name: m.name,
                fromJob: liveJob || 'Unassigned',
                toJob: m.slot,
                destinationCrew: crew.jobNumber,
                destinationLocation: crew.location || 'Helena',
                targetRow: live,
                wasLiveChanged,
                originalJob
              });
            }
          }
        } else {
          newHires.push({
            name: m.name,
            assignedJob: m.slot,
            destinationCrew: crew.jobNumber,
            destinationLocation: crew.location || 'Helena',
            classification: m.classification || 'Apprentice'
          });
        }
      });
    });

    // Side pane: Vacation
    plan.sidePane.vacation.forEach(v => {
      const live = liveEmps.find(e => String(e['Employee Name'] || e['Name'] || '').trim().toLowerCase() === v.name.toLowerCase());
      if (live) {
        const liveStat = String(live['Status'] || live['Location'] || '').toLowerCase();
        if (v.isFutureVacation || v.keepOnCrew) {
          vacations.push({
            name: v.name,
            dateRange: v.dateRange || v.vacationStartDate || '',
            notes: v.notes || v.note || '',
            isFutureVacation: Boolean(v.isFutureVacation),
            keepOnCrew: Boolean(v.keepOnCrew),
            activeCrew: v.activeCrew || v.priorBaseJob || '',
            targetRow: live
          });
        } else if (!liveStat.includes('vacation')) {
          vacations.push({
            name: v.name,
            dateRange: v.dateRange || v.vacationStartDate || '',
            notes: v.notes || v.note || '',
            isFutureVacation: false,
            keepOnCrew: false,
            activeCrew: '',
            targetRow: live
          });
        }
      }
    });

    // Side pane: Light Duty
    const lightDuty = [];
    (plan.sidePane?.lightDuty || []).forEach(ld => {
      const live = liveEmps.find(e => String(e['Employee Name'] || e['Name'] || '').trim().toLowerCase() === ld.name.toLowerCase());
      if (live) {
        const liveStat = String(live['Status'] || live['Location'] || '').toLowerCase();
        if (!liveStat.includes('light duty')) {
          lightDuty.push({ name: ld.name, targetRow: live });
        }
      }
    });

    // Side pane: Quits & Scheduled Departures
    plan.sidePane.quit.forEach(q => {
      const live = liveEmps.find(e => String(e['Employee Name'] || e['Name'] || '').trim().toLowerCase() === q.name.toLowerCase());
      const liveLastDay = live ? String(live['Last Day'] || '').trim() : '';
      const alreadyRecorded = Boolean(liveLastDay && q.departureDate && liveLastDay === q.departureDate);

      quits.push({
        name: q.name,
        departureDate: q.departureDate || '',
        reason: q.departureReason || 'Quit',
        notes: q.notes || '',
        isScheduledDeparture: Boolean(q.isScheduledDeparture),
        activeCrew: q.activeCrew || '',
        alreadyRecordedOnLive: alreadyRecorded,
        targetRow: live
      });
    });

    // Side pane: Weeds
    plan.sidePane.weeds.forEach(w => {
      const live = liveEmps.find(e => String(e['Employee Name'] || e['Name'] || '').trim().toLowerCase() === w.name.toLowerCase());
      if (live) {
        weeds.push({ name: w.name, targetRow: live });
      }
    });

    return { transfers, vacations, quits, weeds, lightDuty, foremenChanges, scheduleChanges, newHires, departedOnLive };
  }

  openPublishModal() {
    const plan = this.getPlanForWeek(this.selectedWeek);
    if (!plan) return;

    // RULE: Do not allow publish if any unconfirmed purple employees exist
    const purpleMembers = this.getPurpleMembers(plan);
    if (purpleMembers.length > 0) {
      this.showUnconfirmedPurpleModal(purpleMembers, plan);
      return;
    }

    // RULE: Require Last Working Day for all employees in Quit / Notice before publishing
    const missingDateQuit = (plan.sidePane.quit || []).find(q => !q.departureDate);
    if (missingDateQuit) {
      alert(`⚠️ Employee "${missingDateQuit.name}" in Quit/Notice is missing a Last Working Day.\n\nPlease click "Add Last Day" on their card in the Quit/Notice section before publishing.`);
      return;
    }

    const deltas = this.computePublishDeltas(plan);
    const totalChanges = (deltas.transfers.length +
                          deltas.vacations.length +
                          deltas.quits.length +
                          deltas.weeds.length +
                          (deltas.lightDuty ? deltas.lightDuty.length : 0) +
                          deltas.newHires.length +
                          deltas.foremenChanges.length +
                          (deltas.scheduleChanges ? deltas.scheduleChanges.length : 0));

    const modalId = 'modal-crew-publish-confirm';
    let modal = document.getElementById(modalId);
    if (modal) modal.remove();

    const currentWeekStr = this.getCurrentWeekSundayStr();
    const isCurrentWeekPublished = this.isWeekPublished(currentWeekStr);
    const defaultPublishWeek = !isCurrentWeekPublished ? currentWeekStr : plan.weekDate;

    const publishWeekOptions = [
      {
        weekStr: currentWeekStr,
        label: `Week of ${currentWeekStr} (Current Week${!isCurrentWeekPublished ? ' — Not Yet Published' : ' — Already Published'})`
      },
      ...this.getPlanningWeeks().map(p => ({
        weekStr: p.weekStr,
        label: p.offset === 1 ? `Week of ${p.weekStr} (Next Week)` : `Week of ${p.weekStr} (+${p.offset} Weeks Out)`
      }))
    ];
    if (!publishWeekOptions.some(w => w.weekStr === plan.weekDate)) {
      publishWeekOptions.unshift({
        weekStr: plan.weekDate,
        label: `Week of ${plan.weekDate}`
      });
    }

    const overlay = document.createElement('div');
    overlay.id = modalId;
    overlay.className = 'modal-overlay active';
    overlay.style.cssText = 'position: fixed; inset: 0; background: rgba(0,0,0,0.75) !important; display: flex; align-items: center; justify-content: center; z-index: 15000 !important; pointer-events: auto !important; padding: 20px;';

    overlay.innerHTML = `
      <div class="modal-box" style="background: var(--bg-secondary, #1e293b); border: 1px solid var(--border-color, rgba(255,255,255,0.15)); border-radius: 10px; max-width: 680px; width: 100%; max-height: 90vh; display: flex; flex-direction: column; box-shadow: 0 10px 30px rgba(0,0,0,0.5); overflow: hidden; color: #fff; pointer-events: auto !important;">
        
        <!-- Modal Header -->
        <div style="padding: 16px 20px; border-bottom: 1px solid rgba(255,255,255,0.1); display: flex; justify-content: space-between; align-items: center;">
          <div style="font-size: 16px; font-weight: 800; color: #34d399; display: flex; align-items: center; gap: 8px;">
            <span>🚀</span> Publish Crew Structure — Week of <span id="publish-header-week-span">${this.escapeHtml(defaultPublishWeek)}</span>
          </div>
          <button id="btn-publish-close-x" style="background: transparent; border: none; color: #94a3b8; font-size: 18px; cursor: pointer; padding: 4px 8px;">✕</button>
        </div>

        <!-- Modal Body (Delta Review) -->
        <div style="padding: 20px; overflow-y: auto; flex: 1; font-size: 13px;">
          
          <!-- Target Week to Publish To Selector -->
          <div style="background: rgba(59, 130, 246, 0.14); border: 1.5px solid rgba(59, 130, 246, 0.45); border-radius: 8px; padding: 12px 14px; margin-bottom: 14px;">
            <label for="publish-target-week-select" style="font-size: 12px; font-weight: 800; color: #93c5fd; margin-bottom: 6px; display: flex; align-items: center; justify-content: space-between;">
              <span>📅 Select Week to Publish This Crew Structure To:</span>
              ${!isCurrentWeekPublished ? `<span class="badge" style="background: rgba(245, 158, 11, 0.25); color: #fcd34d; border: 1px solid #f59e0b; font-size: 10px; padding: 1px 6px; border-radius: 4px;">Current Week (${this.escapeHtml(currentWeekStr)}) Unpublished</span>` : ''}
            </label>
            <select id="publish-target-week-select" style="width: 100%; background: #0f172a; border: 1px solid rgba(96, 165, 250, 0.5); border-radius: 6px; color: #ffffff; padding: 9px 12px; font-size: 13.5px; font-weight: 700; cursor: pointer;">
              ${publishWeekOptions.map(w => `
                <option value="${this.escapeHtml(w.weekStr)}" ${w.weekStr === defaultPublishWeek ? 'selected' : ''}>
                  ${this.escapeHtml(w.label)}
                </option>
              `).join('')}
            </select>
            ${!isCurrentWeekPublished && plan.weekDate !== currentWeekStr ? `
              <div style="font-size: 11px; color: #cbd5e1; margin-top: 6px; line-height: 1.4;">
                💡 <strong>Note:</strong> Week of <strong>${this.escapeHtml(currentWeekStr)}</strong> has not been published yet, so it is pre-selected above. Publishing to <strong>${this.escapeHtml(currentWeekStr)}</strong> will apply all of your current planning changes directly to this week's live roster and archive.
              </div>
            ` : ''}
          </div>

          <div style="background: rgba(16, 185, 129, 0.1); border: 1px solid rgba(16, 185, 129, 0.3); border-radius: 6px; padding: 12px; margin-bottom: 16px;">
            <strong>All changes confirmed! Ready to apply to the live database.</strong><br>
            <span style="color: #94a3b8; font-size: 12px;">This action will atomically update the live <strong>Employees</strong>, <strong>Job Tracking</strong>, and <strong>Employee History</strong> tables, and carry confirmed movements through with yellow highlighting.</span>
          </div>

          <!-- Departed on Live Alert (Recognition protection) -->
          ${deltas.departedOnLive && deltas.departedOnLive.length > 0 ? `
            <div style="background: rgba(239, 68, 68, 0.15); border: 1px solid rgba(239, 68, 68, 0.4); border-radius: 6px; padding: 10px; margin-bottom: 14px;">
              <div style="font-weight: 700; color: #fca5a5; margin-bottom: 4px;">⚠️ Departed on Live Database (${deltas.departedOnLive.length} Skipped)</div>
              ${deltas.departedOnLive.map(d => `
                <div style="font-size: 11.5px; color: #e2e8f0; padding: 2px 0;">• <strong>${this.escapeHtml(d.name)}</strong> is already marked as <em>Previous Employee</em> on the live database. Skipped to prevent resurrecting to Crew ${this.escapeHtml(d.plannedCrew)}.</div>
              `).join('')}
            </div>
          ` : ''}

          <div style="font-weight: 700; margin-bottom: 8px; color: #93c5fd;">Summary of Detected Updates (${totalChanges} Changes):</div>
          
          <div style="display: flex; flex-direction: column; gap: 10px;">
            <!-- Transfers -->
            <div style="background: rgba(0,0,0,0.2); padding: 10px; border-radius: 6px; border: 1px solid rgba(255,255,255,0.06);">
              <div style="font-weight: 700; color: #60a5fa; margin-bottom: 4px;">🔄 Crew Reassignments (${deltas.transfers.length})</div>
              ${deltas.transfers.length > 0 ? deltas.transfers.slice(0, 10).map(t => `
                <div style="font-size: 11.5px; color: #cbd5e1; padding: 2px 0;">
                  • <strong>${this.escapeHtml(t.name)}</strong>: ${this.escapeHtml(t.fromJob)} → <span style="color: #60a5fa; font-weight: 700;">${this.escapeHtml(t.toJob)}</span>
                  ${t.wasLiveChanged ? `<span class="badge" style="background: rgba(245, 158, 11, 0.2); color: #fbbf24; border: 1px solid rgba(245, 158, 11, 0.4); font-size: 9.5px; margin-left: 5px;" title="Changed on Live sheet mid-week — will be updated to next week plan">⚠️ Changed on Live</span>` : ''}
                </div>
              `).join('') + (deltas.transfers.length > 10 ? `<div style="font-size: 11px; color: #94a3b8; font-style: italic;">...and ${deltas.transfers.length - 10} more reassignments</div>` : '') : '<span style="font-size: 11.5px; color: #64748b;">Zero crew transfers.</span>'}
            </div>

            <!-- Foremen Changes & Equipment Transfer Toggle -->
            ${deltas.foremenChanges.length > 0 ? `
              <div style="background: rgba(244, 114, 182, 0.1); padding: 10px; border-radius: 6px; border: 1px solid rgba(244, 114, 182, 0.25);">
                <div style="font-weight: 700; color: #f472b6; margin-bottom: 4px;">👑 Foremen Designations (${deltas.foremenChanges.length})</div>
                ${deltas.foremenChanges.map(f => `
                  <div style="font-size: 11.5px; margin-bottom: 4px;">• Crew <strong>${this.escapeHtml(f.jobNumber)}</strong>: ${this.escapeHtml(f.oldForeman)} → <strong>${this.escapeHtml(f.newForeman)}</strong></div>
                `).join('')}
                <label style="display: flex; align-items: center; gap: 8px; margin-top: 8px; font-size: 11.5px; color: #fbbf24; cursor: pointer;">
                  <input type="checkbox" id="publish-transfer-equipment-checkbox" checked style="cursor: pointer;">
                  <span>⚡ Reassign truck equipment (Blankets, MACKs, HV Testers, Phasing Sets, AED) to incoming Foremen</span>
                </label>
              </div>
            ` : ''}

            <!-- Schedule & Working Day Changes -->
            ${deltas.scheduleChanges && deltas.scheduleChanges.length > 0 ? `
              <div style="background: rgba(59, 130, 246, 0.08); padding: 10px; border-radius: 6px; border: 1px solid rgba(59, 130, 246, 0.25);">
                <div style="font-weight: 700; color: #60a5fa; margin-bottom: 4px;">🕒 Schedule & Working Day Updates (${deltas.scheduleChanges.length})</div>
                ${deltas.scheduleChanges.map(s => `
                  <div style="font-size: 11.5px; color: #cbd5e1; padding: 2px 0;">
                    • Crew <strong>${this.escapeHtml(s.jobNumber)}</strong>: ${this.escapeHtml(s.oldSchedule)} → <strong style="color: #93c5fd;">${this.escapeHtml(s.newSchedule)}</strong>
                  </div>
                `).join('')}
              </div>
            ` : ''}

            <!-- Vacation & Status -->
            <div style="background: rgba(0,0,0,0.2); padding: 10px; border-radius: 6px; border: 1px solid rgba(255,255,255,0.06);">
              <div style="font-weight: 700; color: #fbbf24; margin-bottom: 4px;">🏖️ Scheduled Vacation / Status (${deltas.vacations.length + deltas.weeds.length + (deltas.lightDuty ? deltas.lightDuty.length : 0)})</div>
              ${deltas.vacations.map(v => `
                <div style="font-size: 11.5px; color: #cbd5e1; padding: 1px 0;">
                  • 🏖️ <strong>${this.escapeHtml(v.name)}</strong>${v.dateRange ? ` (${this.escapeHtml(v.dateRange)})` : ''}:
                  ${v.isFutureVacation
                    ? `<span style="color: #93c5fd;">⏭️ Future Week Vacation — Keep Active on Crew ${this.escapeHtml(v.activeCrew || 'Field')} this week</span>`
                    : v.keepOnCrew
                      ? `<span style="color: #6ee7b7;">🗓️ Partial Week Vacation — Keep Active on Crew ${this.escapeHtml(v.activeCrew || 'Field')}</span>`
                      : `<span style="color: #fcd34d;">Set Status = Vacation (Off This Week)</span>`
                  }
                </div>
              `).join('')}
              ${deltas.weeds.map(w => `<div style="font-size: 11.5px; color: #cbd5e1;">• 🌾 <strong>${this.escapeHtml(w.name)}</strong>: Set Status = Weeds</div>`).join('')}
              ${(deltas.lightDuty || []).map(ld => `<div style="font-size: 11.5px; color: #cbd5e1;">• 🩺 <strong>${this.escapeHtml(ld.name)}</strong>: Set Status = Light Duty</div>`).join('')}
              ${deltas.vacations.length === 0 && deltas.weeds.length === 0 && (!deltas.lightDuty || deltas.lightDuty.length === 0) ? '<span style="font-size: 11.5px; color: #64748b;">Zero status changes.</span>' : ''}
            </div>

            <!-- Quits / Departures -->
            ${deltas.quits.length > 0 ? `
              <div style="background: rgba(239, 68, 68, 0.1); padding: 10px; border-radius: 6px; border: 1px solid rgba(239, 68, 68, 0.25);">
                <div style="font-weight: 700; color: #f87171; margin-bottom: 4px;">🚪 Quits / Scheduled Departures (${deltas.quits.length})</div>
                ${deltas.quits.map(q => `
                  <div style="font-size: 11.5px; color: #cbd5e1; padding: 2px 0;">
                    • <strong>${this.escapeHtml(q.name)}</strong> (Last Day: ${this.escapeHtml(q.departureDate)} — ${this.escapeHtml(q.reason)})
                    ${q.isScheduledDeparture ? `➔ <span style="color: #60a5fa;">Active on Crew ${this.escapeHtml(q.activeCrew || 'Field')} until last day</span>` : '➔ Move to Previous Employees'}
                    ${q.alreadyRecordedOnLive ? `<span style="color: #94a3b8; font-size: 10px; margin-left: 4px;">(Already recorded on live database)</span>` : ''}
                  </div>
                `).join('')}
              </div>
            ` : ''}
          </div>

        </div>

        <!-- Modal Footer -->
        <div style="padding: 14px 20px; border-top: 1px solid rgba(255,255,255,0.1); background: rgba(0,0,0,0.2); display: flex; justify-content: space-between; align-items: center;">
          <div style="font-size: 11px; color: #94a3b8;">Next week structure takes effect on database</div>
          <div style="display: flex; gap: 10px;">
            <button class="btn btn-secondary" id="btn-publish-cancel" style="font-size: 12px; padding: 6px 14px; cursor: pointer;">
              Cancel
            </button>
            <button class="btn btn-primary" id="btn-publish-submit" style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); border: none; font-weight: 700; padding: 6px 16px; cursor: pointer;">
              🚀 Confirm & Apply to Database
            </button>
          </div>
        </div>

      </div>
    `;

    document.body.appendChild(overlay);

    const closeModal = () => {
      overlay.remove();
    };

    overlay.querySelector('#btn-publish-close-x')?.addEventListener('click', closeModal);
    overlay.querySelector('#btn-publish-cancel')?.addEventListener('click', closeModal);
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeModal();
    });

    const targetWeekSelect = overlay.querySelector('#publish-target-week-select');
    const headerWeekSpan = overlay.querySelector('#publish-header-week-span');
    const submitBtn = overlay.querySelector('#btn-publish-submit');
    if (submitBtn) {
      submitBtn.innerHTML = `🚀 Publish to Week of ${this.escapeHtml(defaultPublishWeek)}`;
    }
    targetWeekSelect?.addEventListener('change', () => {
      const val = targetWeekSelect.value;
      if (headerWeekSpan) headerWeekSpan.textContent = val;
      if (submitBtn) submitBtn.innerHTML = `🚀 Publish to Week of ${this.escapeHtml(val)}`;
    });

    overlay.querySelector('#btn-publish-submit')?.addEventListener('click', () => {
      const selectedTargetWeek = targetWeekSelect?.value || defaultPublishWeek;
      this.executePublish(selectedTargetWeek);
    });

    const onKey = (e) => {
      if (e.key === 'Escape') {
        closeModal();
        window.removeEventListener('keydown', onKey);
      }
    };
    window.addEventListener('keydown', onKey);
  }

  async executePublish(targetPublishWeek = null) {
    const modalId = 'modal-crew-publish-confirm';
    const plan = this.getPlanForWeek(this.selectedWeek);
    if (!plan) return;
    const publishWeek = targetPublishWeek || document.getElementById('publish-target-week-select')?.value || plan.weekDate;

    // Safety re-check for purple members
    const purpleMembers = this.getPurpleMembers(plan);
    if (purpleMembers.length > 0) {
      const m = document.getElementById(modalId);
      if (m) m.remove();
      this.showUnconfirmedPurpleModal(purpleMembers, plan);
      return;
    }

    const deltas = this.computePublishDeltas(plan);
    const transferEquipment = document.getElementById('publish-transfer-equipment-checkbox')?.checked ?? true;

    try {
      const empTable = this.db.getTable('employees');
      const jtTable = this.db.getTable('job_tracking');
      const histTable = this.db.getTable('employee_history');
      const todayFormatted = new Date().toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' });

      // 1. Process Transfers
      for (const t of deltas.transfers) {
        if (t.targetRow) {
          if (t.isSecondaryAssignment) {
            t.targetRow['Secondary Job Number'] = t.toJob;
            if (t.keepLightDuty) {
              t.targetRow['Status'] = 'Light Duty';
              const curLoc = String(t.targetRow['Location'] || 'Helena');
              if (!curLoc.toLowerCase().includes('(light duty)')) {
                t.targetRow['Location'] = `${curLoc.replace(/\s*\([^)]*\)/g, '').trim()} (Light Duty)`;
              }
            }
            await this.db.addMutation({
              action: 'UPDATE_ROW',
              sheetName: empTable.name || 'Employees',
              tableKey: 'employees',
              employeeName: t.name,
              updatedFields: {
                'Secondary Job Number': t.toJob,
                'Status': t.targetRow['Status'],
                'Location': t.targetRow['Location']
              }
            });
          } else {
            t.targetRow['Job Number'] = t.toJob;
            if (t.destinationLocation) {
              t.targetRow['Location'] = t.destinationLocation;
            }
            if (t.targetRow['Status'] === 'Vacation' || t.targetRow['Status'] === 'Weeds') {
              t.targetRow['Status'] = 'Active';
            }
            await this.db.addMutation({
              action: 'UPDATE_ROW',
              sheetName: empTable.name || 'Employees',
              tableKey: 'employees',
              employeeName: t.name,
              updatedFields: {
                'Job Number': t.toJob,
                'Location': t.destinationLocation || t.targetRow['Location'] || 'Helena',
                'Status': t.targetRow['Status'] || 'Active'
              }
            });
          }

          // Log in Employee History
          if (histTable) {
            const histRow = {
              'Date': todayFormatted,
              'Employee Name': t.name,
              'Event Type': t.isSecondaryAssignment ? 'Secondary Assignment' : 'Transfer',
              'Job Number': t.toJob,
              'Location': t.destinationLocation || t.targetRow['Location'] || 'Helena',
              'Notes': t.isSecondaryAssignment
                ? `Crew Planning Publish: Assigned secondary crew ${t.destinationCrew} (${t.toJob})${t.keepLightDuty ? ' while on Light Duty' : ''}`
                : `Crew Planning Publish: Transferred from ${t.fromJob} to ${t.toJob}`
            };
            histTable.rows.unshift(histRow);
            await this.db.addMutation({
              action: 'ADD_ROW',
              sheetName: histTable.name || 'Employee History',
              tableKey: 'employee_history',
              rowData: histRow
            });
          }
        }
      }

      // 2. Process Vacations
      for (const v of deltas.vacations) {
        if (v.targetRow) {
          if (!v.isFutureVacation && !v.keepOnCrew) {
            v.targetRow['Status'] = 'Vacation';
            await this.db.addMutation({
              action: 'UPDATE_ROW',
              sheetName: empTable.name || 'Employees',
              tableKey: 'employees',
              employeeName: v.name,
              updatedFields: { 'Status': 'Vacation' }
            });
          }
        }
      }

      // 3. Process Weeds
      for (const w of deltas.weeds) {
        if (w.targetRow) {
          w.targetRow['Status'] = 'Weeds';
          await this.db.addMutation({
            action: 'UPDATE_ROW',
            sheetName: empTable.name || 'Employees',
            tableKey: 'employees',
            employeeName: w.name,
            updatedFields: { 'Status': 'Weeds' }
          });
        }
      }

      // 3.5 Process Quits & Scheduled Departures
      for (const q of deltas.quits) {
        if (!q.alreadyRecordedOnLive) {
          await this.applyQuitDeparture(q, todayFormatted);
        }
      }

      // 3.6 Process Light Duty
      for (const ld of (deltas.lightDuty || [])) {
        if (ld.targetRow) {
          ld.targetRow['Status'] = 'Light Duty';
          const curLoc = String(ld.targetRow['Location'] || 'Helena').replace(/\s*\([^)]*\)/g, '').trim();
          ld.targetRow['Location'] = `${curLoc} (Light Duty)`;
          await this.db.addMutation({
            action: 'UPDATE_ROW',
            sheetName: empTable.name || 'Employees',
            tableKey: 'employees',
            employeeName: ld.name,
            updatedFields: { 'Status': 'Light Duty', 'Location': ld.targetRow['Location'] }
          });
        }
      }

      // 4. Process Job Tracking Foremen, Schedules & Active Crews
      for (const crew of plan.crews) {
        let jtRow = (jtTable?.rows || []).find(j => {
          const jn = String(j['Job Number'] || j['Job #'] || '').trim();
          return jn === crew.jobNumber || jn.replace(/\.\d+.*$/, '').trim() === crew.jobNumber;
        });
        const crewSkips = this.getCrewSkipDays(crew);
        if (jtRow) {
          const updated = {};
          if (crew.jobName && jtRow['Job Name'] !== crew.jobName) {
            jtRow['Job Name'] = crew.jobName;
            updated['Job Name'] = crew.jobName;
          }
          const finalType = this.detectCrewType(crew.jobNumber, crew.jobName, crew.location, crew.crewType);
          if (finalType && jtRow['Crew Type'] !== finalType) {
            jtRow['Crew Type'] = finalType;
            updated['Crew Type'] = finalType;
          }
          if (crew.status && jtRow['Status'] !== crew.status) {
            jtRow['Status'] = crew.status;
            updated['Status'] = crew.status;
          }
          if (crew.foreman && jtRow['Foreman'] !== crew.foreman) {
            jtRow['Foreman'] = crew.foreman;
            updated['Foreman'] = crew.foreman;
          }
          if (crew.location && jtRow['Location'] !== crew.location) {
            jtRow['Location'] = crew.location;
            updated['Location'] = crew.location;
          }
          if (crew.schedule && jtRow['Work Schedule'] !== crew.schedule) {
            jtRow['Work Schedule'] = crew.schedule;
            updated['Work Schedule'] = crew.schedule;
          }
          ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].forEach(d => {
            const prop = 'isSkip' + d;
            const col = 'Skip ' + d;
            if (crewSkips[prop] !== undefined && jtRow[col] !== crewSkips[prop]) {
              jtRow[col] = crewSkips[prop];
              updated[col] = crewSkips[prop];
            }
          });
          if (crew.skipMtg !== undefined && jtRow['Skip Weekly Meeting'] !== crew.skipMtg) {
            jtRow['Skip Weekly Meeting'] = crew.skipMtg;
            updated['Skip Weekly Meeting'] = crew.skipMtg;
          }
          if (crew.skipChk !== undefined && jtRow['Skip Monthly Checklist'] !== crew.skipChk) {
            jtRow['Skip Monthly Checklist'] = crew.skipChk;
            updated['Skip Monthly Checklist'] = crew.skipChk;
          }
          if (Object.keys(updated).length > 0) {
            await this.db.addMutation({
              action: 'UPDATE_ROW',
              sheetName: jtTable.name || 'Job Tracking',
              tableKey: 'job_tracking',
              itemIdentifier: crew.jobNumber,
              updatedFields: updated
            });
          }

          // Clean up any other duplicate rows in job_tracking matching crew.jobNumber
          const dupJtRows = jtTable.rows.filter(j => {
            if (j === jtRow) return false;
            const jn = String(j['Job Number'] || j['Job #'] || '').trim();
            return jn === crew.jobNumber || jn.replace(/\.\d+.*$/, '').trim() === crew.jobNumber;
          });
          if (dupJtRows.length > 0) {
            jtTable.rows = jtTable.rows.filter(j => !dupJtRows.includes(j));
            jtTable.rowCount = jtTable.rows.length;
            jtTable.rows.forEach((r, idx) => { r._rowIdx = idx + 2; });
            for (const dupRow of dupJtRows) {
              const dIdx = dupRow._rowIdx;
              if (jtTable.rawGrid && dIdx && jtTable.rawGrid[dIdx - 1]) {
                jtTable.rawGrid.splice(dIdx - 1, 1);
              }
              await this.db.addMutation({
                action: 'DELETE_ROW',
                sheetName: jtTable.name || 'Job Tracking',
                tableKey: 'job_tracking',
                itemIdentifier: crew.jobNumber,
                row: dIdx
              });
            }
          }
        } else if (jtTable) {
          // New crew created in Crew Planning not yet in Job Tracking: Add it to Job Tracking!
          const newJtRow = {
            'Job Number': crew.jobNumber,
            'Job Name': crew.jobName || crew.jobNumber,
            'Location': crew.location || 'Helena',
            'Foreman': crew.foreman || '',
            'Crew Type': this.detectCrewType(crew.jobNumber, crew.jobName, crew.location, crew.crewType),
            'Work Schedule': crew.schedule || 'Mon-Thu (4 10s)',
            'Status': 'Active',
            'Skip Sun': crewSkips.isSkipSun !== undefined ? crewSkips.isSkipSun : true,
            'Skip Mon': crewSkips.isSkipMon !== undefined ? crewSkips.isSkipMon : false,
            'Skip Tue': crewSkips.isSkipTue !== undefined ? crewSkips.isSkipTue : false,
            'Skip Wed': crewSkips.isSkipWed !== undefined ? crewSkips.isSkipWed : false,
            'Skip Thu': crewSkips.isSkipThu !== undefined ? crewSkips.isSkipThu : false,
            'Skip Fri': crewSkips.isSkipFri !== undefined ? crewSkips.isSkipFri : true,
            'Skip Sat': crewSkips.isSkipSat !== undefined ? crewSkips.isSkipSat : true,
            'Skip Weekly Meeting': crew.skipMtg !== undefined ? crew.skipMtg : false,
            'Skip Monthly Checklist': crew.skipChk !== undefined ? crew.skipChk : false
          };
          if (!jtTable.rows) jtTable.rows = [];
          jtTable.rows.push(newJtRow);
          await this.db.addMutation({
            action: 'ADD_ROW',
            sheetName: jtTable.name || 'Job Tracking',
            tableKey: 'job_tracking',
            rowData: newJtRow
          });
        }
      }

      // 5. Equipment Transfer for Foremen
      if (transferEquipment && deltas.foremenChanges.length > 0 && window.crewImportEngine && typeof window.crewImportEngine.reassignCrewEquipment === 'function') {
        for (const f of deltas.foremenChanges) {
          if (f.oldForeman && f.newForeman && f.oldForeman !== 'None') {
            await window.crewImportEngine.reassignCrewEquipment(f.oldForeman, f.newForeman, f.jobNumber, todayFormatted);
          }
        }
      }

      // 6. Collect confirmed yellow moved employee names to persist onto live crew cards
      const yellowConfirmedMoves = [];
      const baselineMap = this.getOriginalEmployeeLocations();
      const occMap = this.getEmployeeOccurrencesMap(plan);

      (plan.crews || []).forEach(crew => {
        (crew.members || []).forEach(m => {
          const st = this.getEmployeePlanningStatus(m.name, crew.jobNumber, null, plan, baselineMap, occMap);
          if (st.statusColor === 'yellow' || (st.isMoved && m.isConfirmed)) {
            if (!yellowConfirmedMoves.includes(m.name)) yellowConfirmedMoves.push(m.name);
          }
        });
      });

      if (!this.db.snapshot.configs) this.db.snapshot.configs = {};
      if (!this.db.snapshot.configs.confirmed_yellow_moves) this.db.snapshot.configs.confirmed_yellow_moves = {};
      this.db.snapshot.configs.confirmed_yellow_moves[publishWeek] = yellowConfirmedMoves;
      this.db.snapshot.configs.latest_published_yellow_moves = yellowConfirmedMoves;

      // 7. Archive published plan to crew_roster_history under the selected target publish week
      this.archiveSnapshot(publishWeek, {
        publishedAt: new Date().toISOString(),
        publishedBy: 'Crew Structure Planning',
        crews: plan.crews,
        sidePane: plan.sidePane,
        yellowConfirmedMoves: yellowConfirmedMoves
      });

      const sourceWeek = plan.weekDate;
      const publishedPlanCopy = JSON.parse(JSON.stringify(plan));
      publishedPlanCopy.weekDate = publishWeek;
      publishedPlanCopy.weekDateFormatted = publishWeek;
      publishedPlanCopy.status = 'published';
      this.savePlan(publishedPlanCopy);

      // If the user edited on a future week (e.g. 11/15/2026) and published to Current Week (e.g. 11/08/2026),
      // re-sync the future week draft from the newly updated live roster so it starts clean from the published baseline
      if (sourceWeek && sourceWeek !== publishWeek) {
        const allPlans = this.getPlansMap();
        allPlans[sourceWeek] = this.initializePlanFromCurrentRoster(sourceWeek);
        this.savePlansMap(allPlans);
      }

      this.selectedWeek = publishWeek;

      // Dismiss modal
      const m = document.getElementById(modalId);
      if (m) m.remove();

      if (typeof window.showToast === 'function') {
        window.showToast(`✅ Week of ${publishWeek} published successfully! Yellow moved highlights carried over.`, 'success');
      }

      // 8. Automatically archive any employees whose last day has arrived to Previous Employees
      await this.checkAndArchiveDepartedEmployees();

      // Return to live Crew Cards view on the newly published week
      if (window.sheetNavigator) {
        window.sheetNavigator.selectedEmployeeWeek = publishWeek;
        window.sheetNavigator.setEmployeeViewMode('cards');
        window.sheetNavigator.renderCurrentSheet();
      }
    } catch (err) {
      console.error('Error publishing crew structure:', err);
      alert(`Error publishing crew structure: ${err.message}`);
    }
  }

  /**
   * Applies an employee's quit/departure milestone to Employee History and Employees table.
   */
  async applyQuitDeparture(q, todayFormatted) {
    if (!this.db) return;
    const empTable = this.db.getTable('employees');
    const histTable = this.db.getTable('employee_history');
    if (!empTable) return;

    const empName = q.name;
    const empNameLower = String(empName || '').trim().toLowerCase();
    const targetEmpRow = (empTable.rows || []).find(e => String(e['Employee Name'] || e['Name'] || '').trim().toLowerCase() === empNameLower);
    const actualRowIdx = targetEmpRow ? (targetEmpRow._rowIdx || (empTable.rows.indexOf(targetEmpRow) + 2)) : 0;
    const priorLoc = (targetEmpRow && targetEmpRow['Location'] && !targetEmpRow['Location'].toLowerCase().includes('previous')) 
      ? targetEmpRow['Location'] : 'Helena';
    const priorJob = (targetEmpRow && targetEmpRow['Job Number']) || 'N/A';
    const hireDate = (targetEmpRow && targetEmpRow['Hire Date']) || '';
    const depDate = q.departureDate || todayFormatted;
    const depReason = q.reason || 'Quit';

    // Parse date to check if already arrived or future
    const now = new Date();
    const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
    let isAlreadyDeparted = true;
    if (depDate && /^\d{1,2}[-/]\d{1,2}[-/]\d{2,4}$/.test(depDate)) {
      const p = depDate.split(/[-/]/);
      let dObj = null;
      if (p[0].length === 4) {
        dObj = new Date(parseInt(p[0], 10), parseInt(p[1], 10) - 1, parseInt(p[2], 10), 12, 0, 0);
      } else {
        const y = p[2].length === 2 ? 2000 + parseInt(p[2], 10) : parseInt(p[2], 10);
        dObj = new Date(y, parseInt(p[0], 10) - 1, parseInt(p[1], 10), 12, 0, 0);
      }
      if (dObj && dObj.getTime() > todayEnd.getTime()) {
        isAlreadyDeparted = false;
      }
    }

    // 1. Employee History record
    const eventType = (depReason === 'Quit' || depReason === 'Resigned') ? 'Quit' : 'Terminated';
    const histNotes = `Departed (${depReason}) · Prior Location: ${priorLoc}, Prior Crew: ${priorJob}.${q.notes ? ' ' + q.notes : ''}`.trim();
    const histRow = {
      'Date': depDate,
      'Employee Name': empName,
      'Name': empName,
      'Event Type': isAlreadyDeparted ? eventType : 'Scheduled Departure',
      'Location': isAlreadyDeparted ? 'Previous Employee' : priorLoc,
      'Job Number': isAlreadyDeparted ? '' : priorJob,
      'Hire Date': hireDate,
      'Last Day': depDate,
      'Last Day Reason': depReason,
      'Rehire Date': '',
      'Notes': isAlreadyDeparted ? histNotes : `Scheduled Departure: Last Day ${depDate} (${depReason}). Active on crew ${priorJob} until last day.${q.notes ? ' ' + q.notes : ''}`,
      'Phone Number': targetEmpRow ? (targetEmpRow['Phone Number'] || '') : '',
      'Email Address': targetEmpRow ? (targetEmpRow['Email Address'] || '') : '',
      'Glove Size': targetEmpRow ? (targetEmpRow['Glove Size'] || '') : '',
      'Sleeve Size': targetEmpRow ? (targetEmpRow['Sleeve Size'] || '') : ''
    };

    if (histTable) {
      if (!histTable.rows) histTable.rows = [];
      histTable.rows.unshift(histRow);
      if (histTable.rawGrid) {
        const hHeaders = histTable.headers || Object.keys(histRow);
        histTable.rawGrid.unshift(hHeaders.map(h => histRow[h] !== undefined ? histRow[h] : ''));
      }
      await this.db.addMutation({
        action: 'ADD_ROW',
        sheetName: histTable.name || 'Employee History',
        tableKey: 'employee_history',
        rowData: histRow
      });
    }

    // 2. Employees table update
    if (targetEmpRow) {
      const updatedFields = {
        'Last Day': depDate,
        'Last Day Reason': depReason
      };
      targetEmpRow['Last Day'] = depDate;
      targetEmpRow['Last Day Reason'] = depReason;

      if (isAlreadyDeparted) {
        targetEmpRow['Location'] = 'Previous Employee';
        targetEmpRow['Status'] = 'Previous Employee';
        targetEmpRow['Job Number'] = '';
        updatedFields['Location'] = 'Previous Employee';
        updatedFields['Status'] = 'Previous Employee';
        updatedFields['Job Number'] = '';
      } else {
        const curNote = String(targetEmpRow['Notes'] || '').trim();
        const schedNote = `Scheduled Last Day: ${depDate} (${depReason})`;
        if (!curNote.includes('Scheduled Last Day')) {
          targetEmpRow['Notes'] = curNote ? `${curNote} | ${schedNote}` : schedNote;
          updatedFields['Notes'] = targetEmpRow['Notes'];
        }
      }

      if (empTable.rawGrid && actualRowIdx > 0 && empTable.rawGrid[actualRowIdx - 1]) {
        const gRow = empTable.rawGrid[actualRowIdx - 1];
        const headers = empTable.headers || [];
        const locIdx = headers.findIndex(h => h.toLowerCase() === 'location');
        const statIdx = headers.findIndex(h => h.toLowerCase() === 'status');
        const ldIdx = headers.findIndex(h => h.toLowerCase() === 'last day');
        const ldrIdx = headers.findIndex(h => h.toLowerCase() === 'last day reason');
        const jobIdx = headers.findIndex(h => h.toLowerCase() === 'job number' || h.toLowerCase() === 'job #');

        if (isAlreadyDeparted) {
          if (locIdx !== -1) gRow[locIdx] = 'Previous Employee';
          if (statIdx !== -1) gRow[statIdx] = 'Previous Employee';
          if (jobIdx !== -1) gRow[jobIdx] = '';
        }
        if (ldIdx !== -1) gRow[ldIdx] = depDate;
        if (ldrIdx !== -1) gRow[ldrIdx] = depReason;
      }

      await this.db.addMutation({
        action: 'UPDATE_ROW',
        sheetName: empTable.name || 'Employees',
        tableKey: 'employees',
        employeeName: empName,
        row: actualRowIdx,
        itemIdentifier: empName,
        updatedFields: updatedFields
      });
    }
  }

  /**
   * Automatically scans active employees whose Last Day date has arrived or passed,
   * moves them to 'Previous Employee', and logs the departure milestone in Employee History.
   */
  async checkAndArchiveDepartedEmployees() {
    if (!this.db) return;
    const empTable = this.db.getTable('employees');
    const histTable = this.db.getTable('employee_history');
    if (!empTable || !empTable.rows) return;

    const now = new Date();
    const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
    let archivedCount = 0;

    for (let i = 0; i < empTable.rows.length; i++) {
      const row = empTable.rows[i];
      const eName = String(row['Employee Name'] || row['Name'] || '').trim();
      const loc = String(row['Location'] || '').trim().toLowerCase();
      const lastDayStr = String(row['Last Day'] || '').trim();

      // If already Previous Employee, skip
      if (loc === 'previous employee' || loc.includes('previous')) continue;

      if (lastDayStr && /^\d{1,2}[-/]\d{1,2}[-/]\d{2,4}$/.test(lastDayStr)) {
        const parts = lastDayStr.split(/[-/]/);
        let lastDayDate = null;
        if (parts[0].length === 4) {
          lastDayDate = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10), 12, 0, 0);
        } else {
          const y = parts[2].length === 2 ? 2000 + parseInt(parts[2], 10) : parseInt(parts[2], 10);
          lastDayDate = new Date(y, parseInt(parts[0], 10) - 1, parseInt(parts[1], 10), 12, 0, 0);
        }

        // Has the employee's last day arrived or passed?
        if (lastDayDate && lastDayDate.getTime() <= todayEnd.getTime()) {
          const priorLoc = row['Location'] || 'Helena';
          const priorJob = row['Job Number'] || 'N/A';
          const reason = row['Last Day Reason'] || 'Quit';

          row['Location'] = 'Previous Employee';
          row['Status'] = 'Previous Employee';
          row['Job Number'] = '';

          const actualRowIdx = row._rowIdx || (i + 2);
          if (empTable.rawGrid && empTable.rawGrid[actualRowIdx - 1]) {
            const gRow = empTable.rawGrid[actualRowIdx - 1];
            const headers = empTable.headers || [];
            const locIdx = headers.findIndex(h => h.toLowerCase() === 'location');
            const statIdx = headers.findIndex(h => h.toLowerCase() === 'status');
            const jobIdx = headers.findIndex(h => h.toLowerCase() === 'job number' || h.toLowerCase() === 'job #');
            if (locIdx !== -1) gRow[locIdx] = 'Previous Employee';
            if (statIdx !== -1) gRow[statIdx] = 'Previous Employee';
            if (jobIdx !== -1) gRow[jobIdx] = '';
          }

          await this.db.addMutation({
            action: 'UPDATE_ROW',
            sheetName: empTable.name || 'Employees',
            tableKey: 'employees',
            employeeName: eName,
            row: actualRowIdx,
            itemIdentifier: eName,
            updatedFields: {
              'Location': 'Previous Employee',
              'Status': 'Previous Employee',
              'Job Number': ''
            }
          });

          // Check if milestone already logged in history
          const alreadyLogged = (histTable?.rows || []).some(h => {
            const hName = String(h['Employee Name'] || h['Name'] || '').trim().toLowerCase();
            const hEv = String(h['Event Type'] || '').toLowerCase();
            return hName === eName.toLowerCase() && (hEv.includes('quit') || hEv.includes('terminat'));
          });

          if (!alreadyLogged && histTable) {
            const histRow = {
              'Date': lastDayStr,
              'Employee Name': eName,
              'Name': eName,
              'Event Type': (reason === 'Quit' || reason === 'Resigned') ? 'Quit' : 'Termination',
              'Location': 'Previous Employee',
              'Job Number': '',
              'Last Day': lastDayStr,
              'Last Day Reason': reason,
              'Notes': `Departed (${reason}) · Prior Location: ${priorLoc}, Prior Crew: ${priorJob}. Automatically moved to Previous Employees on last day.`
            };
            histTable.rows.unshift(histRow);
            await this.db.addMutation({
              action: 'ADD_ROW',
              sheetName: histTable.name || 'Employee History',
              tableKey: 'employee_history',
              rowData: histRow
            });
          }

          archivedCount++;
        }
      }
    }

    if (archivedCount > 0 && typeof window.showToast === 'function') {
      window.showToast(`🚪 Automatically transitioned ${archivedCount} employee(s) whose last day arrived to Previous Employees.`, 'info');
    }
  }

  // ==========================================================================
  // Member Actions & Prompts
  // ==========================================================================

  toggleSidebar() {
    this.isSidebarCollapsed = !this.isSidebarCollapsed;
    try {
      localStorage.setItem('safety_assistant_planning_sidebar_collapsed', String(this.isSidebarCollapsed));
    } catch { /* ignore */ }
    this.refreshView();
  }

  refreshView() {
    const container = document.getElementById('sheet-grid-container');
    const countBadge = document.getElementById('sheet-row-count');
    const isPlanningVisible = Boolean(container && container.querySelector('.crew-planning-wrapper'));
    if (window.sheetNavigator && (window.sheetNavigator.currentSheetKey === 'employees' || isPlanningVisible)) {
      window.sheetNavigator.currentSheetKey = 'employees';
      window.sheetNavigator.activeSheetTabKey = 'employees';
      if (this.selectedWeek && isPlanningVisible) {
        window.sheetNavigator.selectedEmployeeWeek = this.selectedWeek;
      }
      window.sheetNavigator.renderCurrentSheet();
      return;
    }
    if (isPlanningVisible && container) {
      this.renderPlanningWorkspace(container, countBadge, this.selectedWeek, this.searchTerm);
    }
  }

  cloneFromCurrentRoster() {
    if (!confirm(`Are you sure you want to re-clone the live active roster into this planned week (${this.selectedWeek})? Any unsaved staging changes for this week will be reset.`)) {
      return;
    }
    const plans = this.getPlansMap();
    plans[this.selectedWeek] = this.initializePlanFromCurrentRoster(this.selectedWeek);
    this.savePlansMap(plans);
    if (typeof window.showToast === 'function') {
      window.showToast(`Week of ${this.selectedWeek} reset from live roster.`, 'info');
    }
    this.refreshView();
  }

  promptAddNewPlannedCrew() {
    this.openAddCrewModal();
  }

  openAddCrewModal() {
    const plan = this.getPlanForWeek(this.selectedWeek);
    if (!plan) return;

    const modalId = 'modal-crew-add-new';
    const existing = document.getElementById(modalId);
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = modalId;
    overlay.className = 'modal-overlay active';
    overlay.style.cssText = `
      position: fixed; inset: 0; background: rgba(0,0,0,0.8) !important;
      z-index: 15000 !important; display: flex; align-items: center; justify-content: center;
      backdrop-filter: blur(5px); padding: 18px; pointer-events: auto !important;
    `;

    // Fetch existing Job Tracking rows to allow quick-picking unassigned/pending jobs
    const jtTable = this.db ? this.db.getTable('job_tracking') : null;
    const jtRows = (jtTable && jtTable.rows) || [];
    const plannedJobNumbers = new Set((plan.crews || []).map(c => c.jobNumber.toLowerCase()));

    // Available jobs in Job Tracking that aren't on the planning board yet
    const availableJtJobs = jtRows.filter(j => {
      const jn = String(j['Job Number'] || j['Job #'] || '').trim();
      const baseJob = jn.replace(/\.\d+.*$/, '').trim();
      if (!baseJob || baseJob.toLowerCase() === 'unassigned') return false;
      return !plannedJobNumbers.has(baseJob.toLowerCase());
    });

    // Available floaters from planning pool
    const floaters = ((plan.sidePane && plan.sidePane.planning) || []).filter(item => {
      return item.name && !this.isNonEmployeeName(item.name);
    });

    // Schedule day flags state
    let isMon = true;
    let isTue = true;
    let isWed = true;
    let isThu = true;
    let isFri = false;
    let isSat = false;
    let isSun = false;
    let activePreset = 'Mon-Thu (4 10s)';

    // Unique standard locations
    const standardLocs = ['Helena', 'Bozeman', 'Belgrade', 'Livingston', 'Great Falls', 'Missoula', 'Ennis', 'Big Sky', 'Lincoln', 'Townsend', 'Whitehall', 'Butte'];
    const existingCrewLocs = Array.from(new Set(
      (plan.crews || []).map(c => String(c.location || '').trim()).filter(Boolean)
    ));
    const allLocations = Array.from(new Set([...standardLocs, ...existingCrewLocs])).sort();

    const presets = [
      { id: '4 10s', label: 'Mon-Thu (4 10s)', days: [true, true, true, true, false, false, false] },
      { id: '5 8s', label: 'Mon-Fri (5 8s)', days: [true, true, true, true, true, false, false] },
      { id: '5 10s', label: 'Mon-Fri (5 10s)', days: [true, true, true, true, true, false, false] },
      { id: '6 10s', label: 'Mon-Sat (6 10s)', days: [true, true, true, true, true, true, false] },
      { id: 'Tue-Fri', label: 'Tue-Fri (4 10s)', days: [false, true, true, true, true, false, false] },
      { id: '7 10s', label: 'Mon-Sun (7 10s)', days: [true, true, true, true, true, true, true] },
    ];

    const card = document.createElement('div');
    card.style.cssText = `
      background: #1e293b; border: 1px solid rgba(255,255,255,0.15); border-radius: 12px;
      box-shadow: 0 20px 40px rgba(0,0,0,0.6); width: 100%; max-width: 580px; max-height: 90vh;
      display: flex; flex-direction: column; overflow: hidden; color: #f8fafc;
    `;

    card.innerHTML = `
      <!-- Modal Header -->
      <div style="display: flex; justify-content: space-between; align-items: center; padding: 14px 18px; background: rgba(255,255,255,0.03); border-bottom: 1px solid rgba(255,255,255,0.08);">
        <div style="display: flex; align-items: center; gap: 10px;">
          <span style="font-size: 22px;">🚜</span>
          <div>
            <div style="font-size: 15px; font-weight: 800; color: #93c5fd;">Add Planned Field Crew</div>
            <div style="font-size: 11.5px; color: #94a3b8;">Week of ${this.escapeHtml(this.selectedWeek)}</div>
          </div>
        </div>
        <button class="btn btn-xs" id="add-crew-close-btn" style="background: transparent; border: none; color: #94a3b8; font-size: 18px; cursor: pointer; padding: 4px 8px;">✕</button>
      </div>

      <!-- Modal Body -->
      <div style="flex: 1; overflow-y: auto; padding: 16px 18px; display: flex; flex-direction: column; gap: 14px;">

        ${availableJtJobs.length > 0 ? `
          <!-- Quick Template / Existing Job Tracking Source -->
          <div style="background: rgba(59, 130, 246, 0.08); border: 1px solid rgba(59, 130, 246, 0.25); border-radius: 8px; padding: 10px 12px;">
            <label style="display: block; font-size: 11px; font-weight: 700; color: #93c5fd; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px;">
              ⚡ Quick-Select from Inactive / Pending Jobs:
            </label>
            <select id="add-crew-jt-preset" style="width: 100%; background: #0f172a; border: 1px solid rgba(255,255,255,0.15); border-radius: 6px; padding: 6px 10px; color: #fff; font-size: 12px; outline: none;">
              <option value="">➕ Create New Custom Crew (Manual Entry)</option>
              ${availableJtJobs.map(j => {
                const jn = String(j['Job Number'] || j['Job #'] || '').trim();
                const baseJob = jn.replace(/\.\d+.*$/, '').trim();
                const jName = String(j['Job Name'] || j['Location'] || '').trim();
                const stat = String(j['Status'] || 'Active').trim();
                const detectedType = this.detectCrewType(baseJob, jName, j['Location'], j['Crew Type']);
                return `<option value="${this.escapeHtml(baseJob)}" data-jobname="${this.escapeHtml(jName)}" data-loc="${this.escapeHtml(j['Location'] || 'Helena')}" data-type="${this.escapeHtml(detectedType)}" data-sched="${this.escapeHtml(j['Work Schedule'] || 'Mon-Thu (4 10s)')}" data-foreman="${this.escapeHtml(j['Foreman'] || '')}" data-skipsun="${j['Skip Sun']}" data-skipmon="${j['Skip Mon']}" data-skiptue="${j['Skip Tue']}" data-skipwed="${j['Skip Wed']}" data-skipthu="${j['Skip Thu']}" data-skipfri="${j['Skip Fri']}" data-skipsat="${j['Skip Sat']}" data-skipmtg="${j['Skip Weekly Meeting']}" data-skipchk="${j['Skip Monthly Checklist']}">📋 ${this.escapeHtml(baseJob)} — ${this.escapeHtml(jName || 'Crew')} (${this.escapeHtml(stat)})</option>`;
              }).join('')}
            </select>
          </div>
        ` : ''}

        <!-- Job Number & Site Name Row -->
        <div style="display: grid; grid-template-columns: 140px 1fr; gap: 10px;">
          <div>
            <label style="display: block; font-size: 11px; font-weight: 700; color: #cbd5e1; margin-bottom: 4px;">
              Job Number <span style="color: #ef4444;">*</span>
            </label>
            <input type="text" id="add-crew-job-num" placeholder="e.g. 035-27"
                   style="width: 100%; box-sizing: border-box; background: rgba(0,0,0,0.3); border: 1px solid rgba(255,255,255,0.15); border-radius: 6px; padding: 7px 10px; color: #fff; font-size: 13px; font-weight: 700; font-family: monospace; outline: none;">
            <div id="add-crew-job-num-err" style="display: none; color: #f87171; font-size: 10px; margin-top: 3px; font-weight: 600;"></div>
          </div>
          <div>
            <label style="display: block; font-size: 11px; font-weight: 700; color: #cbd5e1; margin-bottom: 4px;">
              Job Name / Site Description
            </label>
            <input type="text" id="add-crew-job-name" placeholder="e.g. Lander's Fork (Lincoln), Belgrade Dock"
                   style="width: 100%; box-sizing: border-box; background: rgba(0,0,0,0.3); border: 1px solid rgba(255,255,255,0.15); border-radius: 6px; padding: 7px 10px; color: #fff; font-size: 12.5px; outline: none;">
          </div>
        </div>

        <!-- Location & Discipline Row -->
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
          <div>
            <label style="display: block; font-size: 11px; font-weight: 700; color: #cbd5e1; margin-bottom: 4px;">
              Location / City <span style="color: #ef4444;">*</span>
            </label>
            <input type="text" id="add-crew-location" list="add-crew-loc-list" value="Helena"
                   style="width: 100%; box-sizing: border-box; background: rgba(0,0,0,0.3); border: 1px solid rgba(255,255,255,0.15); border-radius: 6px; padding: 7px 10px; color: #fff; font-size: 12.5px; outline: none;">
            <datalist id="add-crew-loc-list">
              ${allLocations.map(loc => `<option value="${this.escapeHtml(loc)}"></option>`).join('')}
            </datalist>
          </div>
          <div>
            <label style="display: block; font-size: 11px; font-weight: 700; color: #cbd5e1; margin-bottom: 4px;">
              Discipline / Crew Type
            </label>
            <select id="add-crew-type" style="width: 100%; box-sizing: border-box; background: #0f172a; border: 1px solid rgba(255,255,255,0.15); border-radius: 6px; padding: 7px 10px; color: #fff; font-size: 12.5px; outline: none;">
              <option value="Electric" selected>⚡ Electric</option>
              <option value="Substation">🏗️ Substation</option>
              <option value="Gas">⛽ Gas</option>
              <option value="Office">🏢 Office</option>
              <option value="Mechanic">🔧 Mechanic</option>
              <option value="Civil">🚧 Civil</option>
              <option value="Telecom">📡 Telecom</option>
            </select>
          </div>
        </div>

        <!-- Foreman / Crew Lead -->
        <div>
          <label style="display: block; font-size: 11px; font-weight: 700; color: #cbd5e1; margin-bottom: 4px;">
            Foreman / Crew Lead (Optional)
          </label>
          <div style="display: flex; gap: 8px;">
            <input type="text" id="add-crew-foreman" placeholder="Designate crew foreman (e.g. John Doe)"
                   list="add-crew-foreman-list"
                   style="flex: 1; box-sizing: border-box; background: rgba(0,0,0,0.3); border: 1px solid rgba(255,255,255,0.15); border-radius: 6px; padding: 7px 10px; color: #fff; font-size: 12.5px; outline: none;">
            <datalist id="add-crew-foreman-list">
              ${floaters.map(f => `<option value="${this.escapeHtml(f.name)}">Floater: ${this.escapeHtml(f.name)}</option>`).join('')}
            </datalist>
          </div>
          <div style="font-size: 10.5px; color: #94a3b8; margin-top: 2px;">Leave blank if you prefer to assign foreman after adding crew members.</div>
        </div>

        <!-- Schedule Section -->
        <div style="background: rgba(0,0,0,0.2); border: 1px solid rgba(255,255,255,0.08); border-radius: 8px; padding: 12px;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
            <label style="font-size: 11px; font-weight: 700; color: #cbd5e1; text-transform: uppercase; letter-spacing: 0.5px;">
              Work Schedule & Working Days
            </label>
            <span id="add-crew-sched-label" style="font-size: 11.5px; font-weight: 700; color: #60a5fa; font-family: monospace;">
              Mon-Thu (4 10s)
            </span>
          </div>

          <!-- Schedule Presets -->
          <div style="display: flex; flex-wrap: wrap; gap: 5px; margin-bottom: 10px;">
            ${presets.map(p => `
              <button type="button" class="add-crew-preset-btn" data-preset="${p.id}" data-days="${p.days.join(',')}"
                      style="font-size: 10.5px; font-weight: 600; padding: 3px 8px; border-radius: 4px; cursor: pointer; transition: all 0.15s ease;
                             ${p.id === '4 10s' ? 'background: rgba(59, 130, 246, 0.3); color: #93c5fd; border: 1px solid #3b82f6;' : 'background: rgba(255,255,255,0.05); color: #cbd5e1; border: 1px solid rgba(255,255,255,0.1);'}">
                ${p.label}
              </button>
            `).join('')}
          </div>

          <!-- 7 Clickable Day Pills -->
          <div style="display: flex; gap: 6px; justify-content: center; padding: 4px 0;">
            ${[
              { key: 'Mon', label: 'M', active: isMon },
              { key: 'Tue', label: 'T', active: isTue },
              { key: 'Wed', label: 'W', active: isWed },
              { key: 'Thu', label: 'Th', active: isThu },
              { key: 'Fri', label: 'F', active: isFri },
              { key: 'Sat', label: 'Sa', active: isSat },
              { key: 'Sun', label: 'Su', active: isSun },
            ].map(d => `
              <button type="button" class="add-crew-day-pill" data-day="${d.key}"
                      style="width: 38px; height: 32px; border-radius: 6px; font-size: 12px; font-weight: 700; cursor: pointer; transition: all 0.15s ease; display: inline-flex; align-items: center; justify-content: center;
                             ${d.active ? 'background: #10b981; color: #fff; border: 1px solid #059669; box-shadow: 0 0 8px rgba(16, 185, 129, 0.4);' : 'background: #334155; color: #64748b; border: 1px solid rgba(255,255,255,0.06);'}">
                ${d.label}
              </button>
            `).join('')}
          </div>
          <div style="font-size: 10px; color: #94a3b8; text-align: center; margin-top: 6px;">
            Click any day to toggle Working (Green) or Off (Gray).
          </div>
        </div>

        <!-- Compliance Checkboxes -->
        <div style="display: flex; gap: 16px; padding: 4px 2px;">
          <label style="display: inline-flex; align-items: center; gap: 6px; font-size: 11.5px; color: #cbd5e1; cursor: pointer;">
            <input type="checkbox" id="add-crew-skip-mtg" style="accent-color: #3b82f6;">
            Skip Weekly Safety Meeting
          </label>
          <label style="display: inline-flex; align-items: center; gap: 6px; font-size: 11.5px; color: #cbd5e1; cursor: pointer;">
            <input type="checkbox" id="add-crew-skip-chk" style="accent-color: #3b82f6;">
            Skip Monthly Checklist
          </label>
        </div>

        <!-- Optional: Seed with Floaters from Planning Pool -->
        ${floaters.length > 0 ? `
          <div style="background: rgba(0,0,0,0.2); border: 1px solid rgba(255,255,255,0.08); border-radius: 8px; padding: 10px 12px;">
            <div style="font-size: 11px; font-weight: 700; color: #cbd5e1; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 6px;">
              Assign Initial Members from Planning Pool (${floaters.length} available):
            </div>
            <div style="max-height: 110px; overflow-y: auto; display: flex; flex-direction: column; gap: 4px;">
              ${floaters.map(f => `
                <label style="display: flex; align-items: center; justify-content: space-between; font-size: 11.5px; padding: 4px 8px; background: rgba(255,255,255,0.03); border-radius: 4px; cursor: pointer;">
                  <span style="display: flex; align-items: center; gap: 6px;">
                    <input type="checkbox" class="add-crew-floater-check" data-emp-name="${this.escapeHtml(f.name)}" style="accent-color: #3b82f6;">
                    <span style="font-weight: 600;">${this.escapeHtml(f.name)}</span>
                  </span>
                  <span style="color: #94a3b8; font-size: 10px;">${this.escapeHtml(f.currentJob || f.classification || '')}</span>
                </label>
              `).join('')}
            </div>
          </div>
        ` : ''}

      </div>

      <!-- Modal Footer -->
      <div style="display: flex; justify-content: flex-end; align-items: center; gap: 10px; padding: 12px 18px; background: rgba(0,0,0,0.25); border-top: 1px solid rgba(255,255,255,0.08);">
        <button class="btn btn-secondary" id="add-crew-cancel-btn" style="padding: 7px 14px; font-size: 12px; font-weight: 600;">
          Cancel
        </button>
        <button class="btn btn-primary" id="add-crew-submit-btn" style="padding: 7px 18px; font-size: 12px; font-weight: 800; background: linear-gradient(135deg, #10b981 0%, #059669 100%); border: none; box-shadow: 0 2px 8px rgba(16, 185, 129, 0.4); cursor: pointer; display: inline-flex; align-items: center; gap: 6px;">
          <span>➕</span> Create Crew
        </button>
      </div>
    `;

    overlay.appendChild(card);
    document.body.appendChild(overlay);

    // Interactive event bindings
    const closeBtn = card.querySelector('#add-crew-close-btn');
    const cancelBtn = card.querySelector('#add-crew-cancel-btn');
    const submitBtn = card.querySelector('#add-crew-submit-btn');
    const jobNumInput = card.querySelector('#add-crew-job-num');
    const jobNumErr = card.querySelector('#add-crew-job-num-err');
    const jobNameInput = card.querySelector('#add-crew-job-name');
    const locInput = card.querySelector('#add-crew-location');
    const typeSelect = card.querySelector('#add-crew-type');
    const foremanInput = card.querySelector('#add-crew-foreman');
    const schedLabel = card.querySelector('#add-crew-sched-label');
    const skipMtgCheck = card.querySelector('#add-crew-skip-mtg');
    const skipChkCheck = card.querySelector('#add-crew-skip-chk');
    const jtSelect = card.querySelector('#add-crew-jt-preset');

    const closeModal = () => overlay.remove();
    closeBtn.addEventListener('click', closeModal);
    cancelBtn.addEventListener('click', closeModal);
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeModal();
    });

    // Helper: update schedule string based on day buttons
    const updateScheduleDisplay = () => {
      const activeDays = [];
      if (isMon) activeDays.push('Mon');
      if (isTue) activeDays.push('Tue');
      if (isWed) activeDays.push('Wed');
      if (isThu) activeDays.push('Thu');
      if (isFri) activeDays.push('Fri');
      if (isSat) activeDays.push('Sat');
      if (isSun) activeDays.push('Sun');

      let hours = '4 10s';
      if (activeDays.length === 5) hours = activePreset.includes('5 10') ? '5 10s' : '5 8s';
      else if (activeDays.length === 6) hours = '6 10s';
      else if (activeDays.length === 7) hours = '7 10s';
      else if (activeDays.length === 4) hours = '4 10s';
      else hours = `${activeDays.length} days`;

      if (isMon && isTue && isWed && isThu && !isFri && !isSat && !isSun) {
        activePreset = `Mon-Thu (${hours})`;
      } else if (isMon && isTue && isWed && isThu && isFri && !isSat && !isSun) {
        activePreset = `Mon-Fri (${hours})`;
      } else if (isMon && isTue && isWed && isThu && isFri && isSat && !isSun) {
        activePreset = `Mon-Sat (${hours})`;
      } else if (isMon && isTue && isWed && isThu && isFri && isSat && isSun) {
        activePreset = `Mon-Sun (${hours})`;
      } else if (!isMon && isTue && isWed && isThu && isFri && !isSat && !isSun) {
        activePreset = `Tue-Fri (${hours})`;
      } else {
        activePreset = activeDays.length > 0 ? `${activeDays.join('/')} (${hours})` : 'Off';
      }
      if (schedLabel) schedLabel.textContent = activePreset;
    };

    // Day button toggles
    const dayPills = card.querySelectorAll('.add-crew-day-pill');
    dayPills.forEach(btn => {
      btn.addEventListener('click', () => {
        const d = btn.getAttribute('data-day');
        let current = false;
        if (d === 'Mon') { isMon = !isMon; current = isMon; }
        else if (d === 'Tue') { isTue = !isTue; current = isTue; }
        else if (d === 'Wed') { isWed = !isWed; current = isWed; }
        else if (d === 'Thu') { isThu = !isThu; current = isThu; }
        else if (d === 'Fri') { isFri = !isFri; current = isFri; }
        else if (d === 'Sat') { isSat = !isSat; current = isSat; }
        else if (d === 'Sun') { isSun = !isSun; current = isSun; }

        btn.style.background = current ? '#10b981' : '#334155';
        btn.style.color = current ? '#fff' : '#64748b';
        btn.style.borderColor = current ? '#059669' : 'rgba(255,255,255,0.06)';
        btn.style.boxShadow = current ? '0 0 8px rgba(16, 185, 129, 0.4)' : 'none';

        updateScheduleDisplay();
      });
    });

    // Preset button handlers
    const presetBtns = card.querySelectorAll('.add-crew-preset-btn');
    presetBtns.forEach(pbtn => {
      pbtn.addEventListener('click', () => {
        const days = pbtn.getAttribute('data-days').split(',').map(v => v === 'true');
        isMon = days[0]; isTue = days[1]; isWed = days[2]; isThu = days[3];
        isFri = days[4]; isSat = days[5]; isSun = days[6];
        activePreset = pbtn.textContent.trim();

        presetBtns.forEach(b => {
          b.style.background = 'rgba(255,255,255,0.05)';
          b.style.color = '#cbd5e1';
          b.style.borderColor = 'rgba(255,255,255,0.1)';
        });
        pbtn.style.background = 'rgba(59, 130, 246, 0.3)';
        pbtn.style.color = '#93c5fd';
        pbtn.style.borderColor = '#3b82f6';

        dayPills.forEach(pill => {
          const d = pill.getAttribute('data-day');
          let act = false;
          if (d === 'Mon') act = isMon;
          else if (d === 'Tue') act = isTue;
          else if (d === 'Wed') act = isWed;
          else if (d === 'Thu') act = isThu;
          else if (d === 'Fri') act = isFri;
          else if (d === 'Sat') act = isSat;
          else if (d === 'Sun') act = isSun;

          pill.style.background = act ? '#10b981' : '#334155';
          pill.style.color = act ? '#fff' : '#64748b';
          pill.style.borderColor = act ? '#059669' : 'rgba(255,255,255,0.06)';
          pill.style.boxShadow = act ? '0 0 8px rgba(16, 185, 129, 0.4)' : 'none';
        });

        if (schedLabel) schedLabel.textContent = activePreset;
      });
    });

    // Job Tracking template selector
    if (jtSelect) {
      jtSelect.addEventListener('change', () => {
        const opt = jtSelect.selectedOptions[0];
        if (!opt || !opt.value) return;

        jobNumInput.value = opt.value;
        jobNameInput.value = opt.getAttribute('data-jobname') || '';
        locInput.value = opt.getAttribute('data-loc') || 'Helena';
        const detectedType = opt.getAttribute('data-type') || this.detectCrewType(opt.value, jobNameInput.value, locInput.value, 'Electric');
        typeSelect.value = detectedType;
        if (opt.getAttribute('data-foreman')) {
          foremanInput.value = opt.getAttribute('data-foreman');
        }

        const skipSun = opt.getAttribute('data-skipsun') === 'true';
        const skipMon = opt.getAttribute('data-skipmon') === 'true';
        const skipTue = opt.getAttribute('data-skiptue') === 'true';
        const skipWed = opt.getAttribute('data-skipwed') === 'true';
        const skipThu = opt.getAttribute('data-skipthu') === 'true';
        const skipFri = opt.getAttribute('data-skipfri') === 'true';
        const skipSat = opt.getAttribute('data-skipsat') === 'true';

        isMon = !skipMon; isTue = !skipTue; isWed = !skipWed; isThu = !skipThu;
        isFri = !skipFri; isSat = !skipSat; isSun = !skipSun;

        dayPills.forEach(pill => {
          const d = pill.getAttribute('data-day');
          let act = false;
          if (d === 'Mon') act = isMon;
          else if (d === 'Tue') act = isTue;
          else if (d === 'Wed') act = isWed;
          else if (d === 'Thu') act = isThu;
          else if (d === 'Fri') act = isFri;
          else if (d === 'Sat') act = isSat;
          else if (d === 'Sun') act = isSun;

          pill.style.background = act ? '#10b981' : '#334155';
          pill.style.color = act ? '#fff' : '#64748b';
          pill.style.borderColor = act ? '#059669' : 'rgba(255,255,255,0.06)';
          pill.style.boxShadow = act ? '0 0 8px rgba(16, 185, 129, 0.4)' : 'none';
        });

        skipMtgCheck.checked = opt.getAttribute('data-skipmtg') === 'true';
        skipChkCheck.checked = opt.getAttribute('data-skipchk') === 'true';

        activePreset = opt.getAttribute('data-sched') || 'Mon-Thu (4 10s)';
        if (schedLabel) schedLabel.textContent = activePreset;
      });
    }

    // Auto-detect discipline if user manually enters 005 or keywords while on default Electric
    const maybeAutoDetectDiscipline = () => {
      const jn = String(jobNumInput.value || '').trim();
      const jName = String(jobNameInput.value || '').trim();
      const loc = String(locInput.value || '').trim();
      if (typeSelect.value === 'Electric' || !typeSelect.value) {
        const detected = this.detectCrewType(jn, jName, loc, '');
        if (detected && detected !== 'Electric') {
          typeSelect.value = detected;
        }
      }
    };
    jobNumInput.addEventListener('input', maybeAutoDetectDiscipline);
    jobNameInput.addEventListener('input', maybeAutoDetectDiscipline);

    // Submit action
    submitBtn.addEventListener('click', () => {
      const cleanJob = String(jobNumInput.value || '').trim();
      if (!cleanJob) {
        jobNumErr.textContent = 'Please enter a Job Number.';
        jobNumErr.style.display = 'block';
        jobNumInput.focus();
        return;
      }

      if (plan.crews.some(c => c.jobNumber.toLowerCase() === cleanJob.toLowerCase())) {
        jobNumErr.textContent = `Crew ${cleanJob} already exists in this plan.`;
        jobNumErr.style.display = 'block';
        jobNumInput.focus();
        return;
      }
      jobNumErr.style.display = 'none';

      const cleanJobName = String(jobNameInput.value || '').trim();
      const cleanLoc = String(locInput.value || 'Helena').trim() || 'Helena';
      const cleanType = String(typeSelect.value || 'Electric').trim();
      const cleanForeman = String(foremanInput.value || '').trim();

      // Check selected floaters from planning pool
      const checkedFloaters = [];
      const floaterBoxes = card.querySelectorAll('.add-crew-floater-check:checked');
      floaterBoxes.forEach(chk => {
        checkedFloaters.push(chk.getAttribute('data-emp-name'));
      });

      const initialMembers = [];
      if (checkedFloaters.length > 0 && plan.sidePane && plan.sidePane.planning) {
        checkedFloaters.forEach(empName => {
          const norm = empName.toLowerCase().trim();
          const fIdx = plan.sidePane.planning.findIndex(f => f.name.toLowerCase().trim() === norm);
          let fObj = null;
          if (fIdx !== -1) {
            fObj = plan.sidePane.planning.splice(fIdx, 1)[0];
          }
          initialMembers.push({
            name: empName,
            slot: `${cleanJob}.${initialMembers.length + 1}`,
            originalSlot: fObj?.currentJob || fObj?.originalSlot || '',
            originalBaseJob: fObj?.originalBaseJob || (fObj?.currentJob ? String(fObj.currentJob).replace(/\.\d+.*$/, '').trim() : null),
            classification: fObj?.classification || 'Journeyman',
            role: fObj?.role || 'JL',
            location: cleanLoc,
            isConfirmed: false
          });
        });
      }

      // If foreman was specified and matches one of the initial members or an existing floater
      let designatedForeman = cleanForeman;
      if (!designatedForeman && initialMembers.length > 0) {
        const lead = initialMembers.find(m => /^(foreman|f|sup|gf|lead)/i.test(m.classification)) || initialMembers[0];
        designatedForeman = lead ? lead.name : '';
      }

      const newCrew = {
        jobNumber: cleanJob,
        location: cleanLoc,
        foreman: designatedForeman,
        crewType: cleanType,
        schedule: activePreset,
        isSkipSun: !isSun,
        isSkipMon: !isMon,
        isSkipTue: !isTue,
        isSkipWed: !isWed,
        isSkipThu: !isThu,
        isSkipFri: !isFri,
        isSkipSat: !isSat,
        skipMtg: Boolean(skipMtgCheck.checked),
        skipChk: Boolean(skipChkCheck.checked),
        jobName: cleanJobName,
        members: initialMembers
      };

      plan.crews.push(newCrew);
      this.savePlan(plan);
      closeModal();
      this.refreshView();

      if (typeof window.showToast === 'function') {
        window.showToast(`🚜 Created Crew ${cleanJob} (${cleanJobName || cleanLoc})!`, 'success');
      }
    });

    jobNumInput.focus();
  }

  promptChangePlannedForeman(jobNumber) {
    this.openChangeForemanModal(jobNumber);
  }

  openChangeForemanModal(jobNumber) {
    const plan = this.getPlanForWeek(this.selectedWeek);
    const crew = plan?.crews?.find(c => c.jobNumber === jobNumber);
    if (!crew) return;

    const modalId = 'modal-crew-change-foreman';
    const existing = document.getElementById(modalId);
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = modalId;
    overlay.className = 'modal-overlay active';
    overlay.style.cssText = `
      position: fixed; inset: 0; background: rgba(0,0,0,0.75) !important;
      z-index: 15000 !important; display: flex; align-items: center; justify-content: center;
      backdrop-filter: blur(4px); padding: 18px; pointer-events: auto !important;
    `;

    const floaters = ((plan.sidePane && plan.sidePane.planning) || []).filter(item => {
      return item.name && !this.isNonEmployeeName(item.name);
    });

    const lightDutyMembers = ((plan.sidePane && plan.sidePane.lightDuty) || []).filter(item => {
      return item.name && !this.isNonEmployeeName(item.name);
    });

    const card = document.createElement('div');
    card.style.cssText = `
      background: #1e293b; border: 1px solid rgba(255,255,255,0.15); border-radius: 12px;
      box-shadow: 0 20px 40px rgba(0,0,0,0.6); width: 100%; max-width: 480px; max-height: 85vh;
      display: flex; flex-direction: column; overflow: hidden; color: #f8fafc;
    `;

    card.innerHTML = `
      <!-- Header -->
      <div style="display: flex; justify-content: space-between; align-items: center; padding: 12px 16px; background: rgba(255,255,255,0.03); border-bottom: 1px solid rgba(255,255,255,0.08);">
        <div style="display: flex; align-items: center; gap: 8px;">
          <span style="font-size: 20px;">👑</span>
          <div>
            <div style="font-size: 14px; font-weight: 800; color: #f472b6;">Designate Foreman for Crew ${this.escapeHtml(crew.jobNumber)}</div>
            <div style="font-size: 11px; color: #94a3b8;">${this.escapeHtml(crew.jobName || crew.location || '')}</div>
          </div>
        </div>
        <button class="btn btn-xs" id="change-fm-close-btn" style="background: transparent; border: none; color: #94a3b8; font-size: 18px; cursor: pointer;">✕</button>
      </div>

      <!-- Body -->
      <div style="flex: 1; overflow-y: auto; padding: 14px 16px; display: flex; flex-direction: column; gap: 12px;">
        <div style="font-size: 12px; color: #94a3b8;">
          Current Foreman: <strong style="color: #f472b6;">${this.escapeHtml(crew.foreman || 'None')}</strong>
        </div>

        <!-- Custom Input -->
        <div>
          <label style="display: block; font-size: 11px; font-weight: 700; color: #cbd5e1; margin-bottom: 4px;">
            Type Foreman Name:
          </label>
          <div style="display: flex; gap: 8px;">
            <input type="text" id="change-fm-custom-input" placeholder="Enter employee name..." value="${this.escapeHtml(crew.foreman || '')}"
                   style="flex: 1; background: rgba(0,0,0,0.3); border: 1px solid rgba(255,255,255,0.15); border-radius: 6px; padding: 6px 10px; color: #fff; font-size: 12px; outline: none;">
            <button class="btn btn-primary" id="change-fm-custom-btn" style="padding: 6px 12px; font-size: 11.5px; font-weight: 700; background: #ec4899; border: none; cursor: pointer;">
              Set
            </button>
          </div>
        </div>

        <!-- Crew Members List -->
        ${(crew.members || []).length > 0 ? `
          <div style="background: rgba(0,0,0,0.2); border: 1px solid rgba(255,255,255,0.06); border-radius: 6px; padding: 10px;">
            <div style="font-size: 11px; font-weight: 700; color: #cbd5e1; margin-bottom: 6px; text-transform: uppercase; letter-spacing: 0.5px;">
              Current Crew Members:
            </div>
            <div style="display: flex; flex-direction: column; gap: 4px;">
              ${crew.members.map(m => `
                <div style="display: flex; justify-content: space-between; align-items: center; padding: 5px 8px; background: rgba(255,255,255,0.03); border-radius: 4px; font-size: 12px;">
                  <span style="font-weight: 600;">${this.escapeHtml(m.name)} <span style="font-size: 10px; color: #94a3b8;">(${this.escapeHtml(m.classification || '')})</span></span>
                  <button class="btn btn-xs change-fm-select-btn" data-name="${this.escapeHtml(m.name)}"
                          style="font-size: 10.5px; font-weight: 700; padding: 2px 8px; background: rgba(244, 114, 182, 0.2); color: #f472b6; border: 1px solid rgba(244, 114, 182, 0.4); border-radius: 4px; cursor: pointer;">
                    👑 Select
                  </button>
                </div>
              `).join('')}
            </div>
          </div>
        ` : ''}

        <!-- Floaters List -->
        ${floaters.length > 0 ? `
          <div style="background: rgba(0,0,0,0.2); border: 1px solid rgba(255,255,255,0.06); border-radius: 6px; padding: 10px;">
            <div style="font-size: 11px; font-weight: 700; color: #cbd5e1; margin-bottom: 6px; text-transform: uppercase; letter-spacing: 0.5px;">
              Or Select from Planning Pool:
            </div>
            <div style="max-height: 120px; overflow-y: auto; display: flex; flex-direction: column; gap: 4px;">
              ${floaters.map(f => `
                <div style="display: flex; justify-content: space-between; align-items: center; padding: 5px 8px; background: rgba(255,255,255,0.03); border-radius: 4px; font-size: 12px;">
                  <span style="font-weight: 600;">${this.escapeHtml(f.name)} <span style="font-size: 10px; color: #94a3b8;">(${this.escapeHtml(f.classification || 'Floater')})</span></span>
                  <button class="btn btn-xs change-fm-select-btn" data-name="${this.escapeHtml(f.name)}"
                          style="font-size: 10.5px; font-weight: 700; padding: 2px 8px; background: rgba(96, 165, 250, 0.2); color: #93c5fd; border: 1px solid rgba(96, 165, 250, 0.4); border-radius: 4px; cursor: pointer;">
                    👑 Select
                  </button>
                </div>
              `).join('')}
            </div>
          </div>
        ` : ''}

        <!-- Light Duty Employees -->
        ${lightDutyMembers.length > 0 ? `
          <div style="background: rgba(0,0,0,0.2); border: 1px solid rgba(255,255,255,0.06); border-radius: 6px; padding: 10px;">
            <div style="font-size: 11px; font-weight: 700; color: #34d399; margin-bottom: 6px; text-transform: uppercase; letter-spacing: 0.5px;">
              🩺 Select from Light Duty (Keeps on Light Duty):
            </div>
            <div style="max-height: 120px; overflow-y: auto; display: flex; flex-direction: column; gap: 4px;">
              ${lightDutyMembers.map(ld => `
                <div style="display: flex; justify-content: space-between; align-items: center; padding: 5px 8px; background: rgba(255,255,255,0.03); border-radius: 4px; font-size: 12px;">
                  <span style="font-weight: 600;">${this.escapeHtml(ld.name)} <span style="font-size: 10px; color: #94a3b8;">(${this.escapeHtml(ld.classification || 'Light Duty')})</span></span>
                  <button class="btn btn-xs change-fm-select-btn" data-name="${this.escapeHtml(ld.name)}" data-from-ld="true"
                          style="font-size: 10.5px; font-weight: 700; padding: 2px 8px; background: rgba(16, 185, 129, 0.2); color: #34d399; border: 1px solid rgba(16, 185, 129, 0.4); border-radius: 4px; cursor: pointer;">
                    👑 Select & Assign
                  </button>
                </div>
              `).join('')}
            </div>
          </div>
        ` : ''}
      </div>
    `;

    overlay.appendChild(card);
    document.body.appendChild(overlay);

    const closeModal = () => overlay.remove();
    card.querySelector('#change-fm-close-btn').addEventListener('click', closeModal);
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeModal();
    });

    const setForeman = (name, fromLd = false) => {
      const cleanName = String(name || '').trim();
      if (!cleanName) {
        crew.foreman = '';
        this.savePlan(plan);
        closeModal();
        this.refreshView();
        return;
      }
      crew.foreman = cleanName;
      if (fromLd) {
        const norm = cleanName.toLowerCase();
        if (!crew.members.some(m => m.name.toLowerCase() === norm)) {
          closeModal();
          this.executeDuplicateMember(cleanName, '', `crew::${crew.jobNumber}`, 'lightDuty', true);
          return;
        }
      }
      // Reorder designated foreman to index 0 (slot .1) if present in crew
      const fmIdx = crew.members.findIndex(m => m.name.trim().toLowerCase() === cleanName.toLowerCase());
      if (fmIdx > 0) {
        const [fmObj] = crew.members.splice(fmIdx, 1);
        crew.members.unshift(fmObj);
        crew.members.forEach((m, idx) => {
          m.slot = `${crew.jobNumber}.${idx + 1}`;
        });
      }
      this.savePlan(plan);
      closeModal();
      this.refreshView();
      if (typeof window.showToast === 'function') {
        window.showToast(`👑 Crew ${crew.jobNumber} foreman designated as ${crew.foreman || 'None'}.`, 'success');
      }
    };

    card.querySelector('#change-fm-custom-btn').addEventListener('click', () => {
      const customVal = card.querySelector('#change-fm-custom-input').value;
      setForeman(customVal);
    });

    card.querySelectorAll('.change-fm-select-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const fromLd = btn.getAttribute('data-from-ld') === 'true';
        setForeman(btn.getAttribute('data-name'), fromLd);
      });
    });
  }

  // ==========================================================================
  // Crew Schedule & Workdays Management
  // ==========================================================================

  getCrewSkipDays(crew) {
    if (!crew) {
      return { isSkipMon: false, isSkipTue: false, isSkipWed: false, isSkipThu: false, isSkipFri: true, isSkipSat: true, isSkipSun: true };
    }
    if (crew.isSkipMon !== undefined && crew.isSkipFri !== undefined) {
      return {
        isSkipMon: Boolean(crew.isSkipMon),
        isSkipTue: Boolean(crew.isSkipTue),
        isSkipWed: Boolean(crew.isSkipWed),
        isSkipThu: Boolean(crew.isSkipThu),
        isSkipFri: Boolean(crew.isSkipFri),
        isSkipSat: Boolean(crew.isSkipSat),
        isSkipSun: Boolean(crew.isSkipSun)
      };
    }
    // Infer from schedule text if skip flags were not explicitly defined
    const s = String(crew.schedule || '').toLowerCase();
    if (s.includes('fri-sat') || s.includes('weekend')) {
      return { isSkipMon: true, isSkipTue: true, isSkipWed: true, isSkipThu: true, isSkipFri: false, isSkipSat: false, isSkipSun: true };
    }
    if (s.includes('tue-fri')) {
      return { isSkipMon: true, isSkipTue: false, isSkipWed: false, isSkipThu: false, isSkipFri: false, isSkipSat: true, isSkipSun: true };
    }
    if (s.includes('6 10') || s.includes('mon-sat')) {
      return { isSkipMon: false, isSkipTue: false, isSkipWed: false, isSkipThu: false, isSkipFri: false, isSkipSat: false, isSkipSun: true };
    }
    if (s.includes('7 10') || s.includes('mon-sun') || s.includes('7 days')) {
      return { isSkipMon: false, isSkipTue: false, isSkipWed: false, isSkipThu: false, isSkipFri: false, isSkipSat: false, isSkipSun: false };
    }
    if (s.includes('5 8') || s.includes('5 10') || s.includes('mon-fri')) {
      return { isSkipMon: false, isSkipTue: false, isSkipWed: false, isSkipThu: false, isSkipFri: false, isSkipSat: true, isSkipSun: true };
    }
    // Default Mon-Thu (4 10s)
    return { isSkipMon: false, isSkipTue: false, isSkipWed: false, isSkipThu: false, isSkipFri: true, isSkipSat: true, isSkipSun: true };
  }

  toggleCrewDayWorking(jobNumber, dayKey) {
    const plan = this.getPlanForWeek(this.selectedWeek);
    const crew = plan?.crews?.find(c => c.jobNumber === jobNumber);
    if (!crew) return;

    const skipProp = 'isSkip' + dayKey;
    const currentSkips = this.getCrewSkipDays(crew);
    crew[skipProp] = !currentSkips[skipProp];

    // Ensure all 7 properties are explicitly set on the crew object
    const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    days.forEach(d => {
      const p = 'isSkip' + d;
      if (d === dayKey) {
        crew[p] = !currentSkips[p];
      } else if (crew[p] === undefined) {
        crew[p] = currentSkips[p];
      }
    });

    const isMon = !Boolean(crew.isSkipMon);
    const isTue = !Boolean(crew.isSkipTue);
    const isWed = !Boolean(crew.isSkipWed);
    const isThu = !Boolean(crew.isSkipThu);
    const isFri = !Boolean(crew.isSkipFri);
    const isSat = !Boolean(crew.isSkipSat);
    const isSun = !Boolean(crew.isSkipSun);

    // Detect existing hours format (e.g. "4 10s", "5 8s", "5 10s", "6 10s")
    const matchHours = String(crew.schedule || '').match(/(\d+\s*(?:10s|8s|12s|9s))/i);
    const hoursPart = matchHours ? matchHours[1] : null;

    if (isMon && isTue && isWed && isThu && !isFri && !isSat && !isSun) {
      crew.schedule = `Mon-Thu (${hoursPart || '4 10s'})`;
    } else if (isMon && isTue && isWed && isThu && isFri && !isSat && !isSun) {
      crew.schedule = `Mon-Fri (${hoursPart || '5 8s'})`;
    } else if (isMon && isTue && isWed && isThu && isFri && isSat && !isSun) {
      crew.schedule = `Mon-Sat (${hoursPart || '6 10s'})`;
    } else if (isMon && isTue && isWed && isThu && isFri && isSat && isSun) {
      crew.schedule = `Mon-Sun (${hoursPart || '7 10s'})`;
    } else if (!isMon && isTue && isWed && isThu && isFri && !isSat && !isSun) {
      crew.schedule = `Tue-Fri (${hoursPart || '4 10s'})`;
    } else if (!isMon && !isTue && !isWed && !isThu && isFri && isSat && !isSun) {
      crew.schedule = `Fri-Sat Weekend (${hoursPart || '2 10s'})`;
    } else {
      const activeDays = [];
      if (isMon) activeDays.push('Mon');
      if (isTue) activeDays.push('Tue');
      if (isWed) activeDays.push('Wed');
      if (isThu) activeDays.push('Thu');
      if (isFri) activeDays.push('Fri');
      if (isSat) activeDays.push('Sat');
      if (isSun) activeDays.push('Sun');
      crew.schedule = activeDays.length > 0 ? `${activeDays.join('/')}${hoursPart ? ` (${hoursPart})` : ''}` : 'Off';
    }

    this.savePlan(plan);
    this.refreshView();
    if (typeof window.showToast === 'function') {
      const statusWord = !crew[skipProp] ? 'Working' : 'Off';
      window.showToast(`🕒 Crew ${jobNumber} ${dayKey}: ${statusWord} (${crew.schedule})`, 'info');
    }
  }

  promptEditPlannedCrew(jobNumber) {
    const plan = this.getPlanForWeek(this.selectedWeek);
    const crew = plan?.crews?.find(c => c.jobNumber === jobNumber);
    if (!crew) return;

    const modalId = 'modal-crew-planned-edit';
    const existing = document.getElementById(modalId);
    if (existing) existing.remove();

    // Look up existing Job Tracking row if present
    const jtTable = this.db.getTable('job_tracking');
    const jtRow = (jtTable?.rows || []).find(j => {
      const jn = String(j['Job Number'] || j['Job #'] || '').trim();
      return jn === jobNumber || jn.replace(/\.\d+.*$/, '').trim() === jobNumber;
    });

    const currentJobName = crew.jobName || (jtRow && jtRow['Job Name']) || '';
    const currentLocation = crew.location || (jtRow && jtRow['Location']) || 'Helena';
    const currentCrewType = (jtRow && jtRow['Crew Type']) || crew.crewType || 'Electric';
    const currentStatus = crew.status || (jtRow && jtRow['Status']) || 'Active';
    const currentForeman = crew.foreman || (jtRow && jtRow['Foreman']) || '';
    const currentSchedule = crew.schedule || (jtRow && (jtRow['Work Schedule'] || jtRow['Schedule'])) || 'Mon-Thu (4 10s)';

    const skipDays = this.getCrewSkipDays(crew);
    let isMon = !skipDays.isSkipMon;
    let isTue = !skipDays.isSkipTue;
    let isWed = !skipDays.isSkipWed;
    let isThu = !skipDays.isSkipThu;
    let isFri = !skipDays.isSkipFri;
    let isSat = !skipDays.isSkipSat;
    let isSun = !skipDays.isSkipSun;

    const overlay = document.createElement('div');
    overlay.id = modalId;
    overlay.className = 'modal-overlay active';
    overlay.style.cssText = `
      position: fixed; inset: 0; background: rgba(0,0,0,0.78) !important;
      z-index: 15000 !important; display: flex; align-items: center; justify-content: center;
      backdrop-filter: blur(4px); padding: 18px; pointer-events: auto !important;
    `;

    overlay.innerHTML = `
      <div class="modal-box" style="background: var(--bg-secondary, #1e293b); border: 1px solid rgba(59, 130, 246, 0.45); border-radius: 10px; width: 540px; max-width: 95vw; box-shadow: 0 16px 40px rgba(0,0,0,0.7); display: flex; flex-direction: column; overflow: hidden; color: #fff; pointer-events: auto !important; max-height: 90vh;">
        
        <!-- Header -->
        <div style="padding: 14px 18px; border-bottom: 1px solid rgba(255,255,255,0.08); display: flex; justify-content: space-between; align-items: center; background: rgba(0,0,0,0.25);">
          <div style="display: flex; align-items: center; gap: 8px;">
            <span style="font-size: 16px;">✏️</span>
            <div style="font-weight: 800; font-size: 14px; color: #60a5fa;">
              Edit Planned Crew — ${this.escapeHtml(jobNumber)}
            </div>
          </div>
          <button id="btn-edit-planned-close-x" style="background: transparent; border: none; color: #94a3b8; font-size: 18px; cursor: pointer; padding: 2px 6px;">✕</button>
        </div>

        <!-- Body -->
        <div style="padding: 18px; display: flex; flex-direction: column; gap: 14px; font-size: 12px; overflow-y: auto; color: var(--text-primary, #e2e8f0);">
          
          <!-- Job Name -->
          <div>
            <label style="display: block; font-weight: 700; color: #94a3b8; margin-bottom: 5px; font-size: 11px;">
              Job Name / Site Description:
            </label>
            <input type="text" id="planned-edit-job-name" value="${this.escapeHtml(currentJobName)}"
                   placeholder="e.g. G Falls ZIPLY Poles 040-26 Fri &amp; Sat"
                   style="width: 100%; box-sizing: border-box; padding: 8px 10px; background: #0f172a; border: 1px solid rgba(255,255,255,0.15); border-radius: 6px; color: #ffffff; font-size: 12.5px; font-weight: 600;">
          </div>

          <!-- Location & Foreman Row -->
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
            <div>
              <label style="display: block; font-weight: 700; color: #94a3b8; margin-bottom: 5px; font-size: 11px;">
                Physical City / Location:
              </label>
              <input type="text" id="planned-edit-location" value="${this.escapeHtml(currentLocation)}"
                     placeholder="e.g. Great Falls, Helena, Bozeman"
                     style="width: 100%; box-sizing: border-box; padding: 8px 10px; background: #0f172a; border: 1px solid rgba(255,255,255,0.15); border-radius: 6px; color: #ffffff; font-size: 12.5px;">
            </div>
            <div>
              <label style="display: block; font-weight: 700; color: #94a3b8; margin-bottom: 5px; font-size: 11px;">
                Designated Foreman:
              </label>
              <input type="text" id="planned-edit-foreman" value="${this.escapeHtml(currentForeman)}"
                     placeholder="e.g. Corey Allen"
                     style="width: 100%; box-sizing: border-box; padding: 8px 10px; background: #0f172a; border: 1px solid rgba(255,255,255,0.15); border-radius: 6px; color: #ffffff; font-size: 12.5px;">
            </div>
          </div>

          <!-- Discipline & Status Row -->
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
            <div>
              <label style="display: block; font-weight: 700; color: #94a3b8; margin-bottom: 5px; font-size: 11px;">
                Discipline / Crew Type:
              </label>
              <select id="planned-edit-crew-type" style="width: 100%; box-sizing: border-box; padding: 8px 10px; background: #0f172a; border: 1px solid rgba(255,255,255,0.15); border-radius: 6px; color: #ffffff; font-size: 12px; font-weight: 700;">
                <option value="Electric" ${currentCrewType === 'Electric' ? 'selected' : ''}>⚡ Electric</option>
                <option value="Substation" ${currentCrewType === 'Substation' ? 'selected' : ''}>🏗️ Substation</option>
                <option value="Gas" ${currentCrewType === 'Gas' ? 'selected' : ''}>⛽ Gas</option>
                <option value="Office" ${currentCrewType === 'Office' ? 'selected' : ''}>🏢 Office</option>
                <option value="Mechanic" ${currentCrewType === 'Mechanic' ? 'selected' : ''}>🔧 Mechanic</option>
                <option value="Civil" ${currentCrewType === 'Civil' ? 'selected' : ''}>🚧 Civil</option>
                <option value="Telecom" ${currentCrewType === 'Telecom' ? 'selected' : ''}>📡 Telecom</option>
              </select>
            </div>
            <div>
              <label style="display: block; font-weight: 700; color: #94a3b8; margin-bottom: 5px; font-size: 11px;">
                Status:
              </label>
              <select id="planned-edit-status" style="width: 100%; box-sizing: border-box; padding: 8px 10px; background: #0f172a; border: 1px solid rgba(255,255,255,0.15); border-radius: 6px; color: #ffffff; font-size: 12px; font-weight: 700;">
                <option value="Active" ${currentStatus === 'Active' ? 'selected' : ''}>🟢 Active</option>
                <option value="Pending Start" ${currentStatus === 'Pending Start' ? 'selected' : ''}>🟡 Pending Start</option>
                <option value="On Hold" ${currentStatus === 'On Hold' ? 'selected' : ''}>⏸️ On Hold</option>
                <option value="Completed" ${currentStatus === 'Completed' ? 'selected' : ''}>🏁 Completed</option>
              </select>
            </div>
          </div>

          <!-- Schedule Preset & Label -->
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
            <div>
              <label style="display: block; font-weight: 700; color: #94a3b8; margin-bottom: 5px; font-size: 11px;">
                Schedule Preset:
              </label>
              <select id="planned-edit-sched-preset" style="width: 100%; box-sizing: border-box; padding: 8px 10px; background: #0f172a; border: 1px solid rgba(255,255,255,0.15); border-radius: 6px; color: #38bdf8; font-size: 12px; font-weight: 700;">
                <option value="Mon-Thu (4 10s)" ${currentSchedule === 'Mon-Thu (4 10s)' ? 'selected' : ''}>Mon-Thu (4 10s)</option>
                <option value="Mon-Fri (5 8s)" ${currentSchedule === 'Mon-Fri (5 8s)' ? 'selected' : ''}>Mon-Fri (5 8s)</option>
                <option value="Tue-Fri (4 10s)" ${currentSchedule === 'Tue-Fri (4 10s)' ? 'selected' : ''}>Tue-Fri (4 10s)</option>
                <option value="Fri &amp; Sat Weekend" ${currentSchedule.toLowerCase().includes('weekend') || currentSchedule.toLowerCase().includes('fri & sat') ? 'selected' : ''}>Fri &amp; Sat Weekend</option>
                <option value="Custom">Custom Schedule</option>
              </select>
            </div>
            <div>
              <label style="display: block; font-weight: 700; color: #94a3b8; margin-bottom: 5px; font-size: 11px;">
                Schedule Label:
              </label>
              <input type="text" id="planned-edit-sched-label" value="${this.escapeHtml(currentSchedule)}"
                     style="width: 100%; box-sizing: border-box; padding: 8px 10px; background: #0f172a; border: 1px solid rgba(255,255,255,0.15); border-radius: 6px; color: #ffffff; font-size: 12px;">
            </div>
          </div>

          <!-- Working Days Toggle -->
          <div>
            <label style="display: block; font-weight: 700; color: #94a3b8; margin-bottom: 6px; font-size: 11px;">
              Working Days (Green = Working, Gray = Off):
            </label>
            <div style="display: flex; gap: 8px; flex-wrap: wrap;">
              ${[
                { id: 'planned-day-mon', label: 'Mon', checked: isMon },
                { id: 'planned-day-tue', label: 'Tue', checked: isTue },
                { id: 'planned-day-wed', label: 'Wed', checked: isWed },
                { id: 'planned-day-thu', label: 'Thu', checked: isThu },
                { id: 'planned-day-fri', label: 'Fri', checked: isFri },
                { id: 'planned-day-sat', label: 'Sat', checked: isSat },
                { id: 'planned-day-sun', label: 'Sun', checked: isSun }
              ].map(d => `
                <label style="display: flex; align-items: center; gap: 5px; background: rgba(0,0,0,0.25); border: 1px solid rgba(255,255,255,0.1); padding: 5px 9px; border-radius: 5px; cursor: pointer; font-size: 11.5px; font-weight: 700;">
                  <input type="checkbox" id="${d.id}" ${d.checked ? 'checked' : ''}> ${d.label}
                </label>
              `).join('')}
            </div>
          </div>

          <!-- Write Back to Job Tracking Checkbox -->
          <div style="background: rgba(37, 99, 235, 0.12); border: 1px solid rgba(59, 130, 246, 0.35); border-radius: 6px; padding: 10px 14px;">
            <label style="display: flex; align-items: center; gap: 8px; cursor: pointer; font-size: 12px; font-weight: 700; color: #93c5fd;">
              <input type="checkbox" id="planned-edit-write-jt" checked>
              <span>Apply changes to Job Tracking page immediately</span>
            </label>
            <div style="font-size: 11px; color: #94a3b8; margin-top: 4px; margin-left: 24px;">
              Keeps Job Tracking, Training Tracking, and Live Crew Structure in sync with this site info.
            </div>
          </div>

        </div>

        <!-- Footer -->
        <div style="padding: 12px 18px; border-top: 1px solid rgba(255,255,255,0.08); display: flex; justify-content: flex-end; gap: 8px; background: rgba(0,0,0,0.25);">
          <button type="button" id="btn-edit-planned-cancel" class="btn btn-secondary" style="font-size: 12px; padding: 6px 14px; cursor: pointer;">
            Cancel
          </button>
          <button type="button" id="btn-edit-planned-save" class="btn btn-primary" style="font-size: 12px; font-weight: 700; padding: 6px 16px; background: linear-gradient(135deg, #10b981 0%, #059669 100%); border: none; cursor: pointer;">
            💾 Save Crew Changes
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    const presetSelect = overlay.querySelector('#planned-edit-sched-preset');
    const labelInput = overlay.querySelector('#planned-edit-sched-label');
    const chkMon = overlay.querySelector('#planned-day-mon');
    const chkTue = overlay.querySelector('#planned-day-tue');
    const chkWed = overlay.querySelector('#planned-day-wed');
    const chkThu = overlay.querySelector('#planned-day-thu');
    const chkFri = overlay.querySelector('#planned-day-fri');
    const chkSat = overlay.querySelector('#planned-day-sat');
    const chkSun = overlay.querySelector('#planned-day-sun');

    if (presetSelect && labelInput) {
      presetSelect.addEventListener('change', () => {
        const val = presetSelect.value;
        if (val !== 'Custom') labelInput.value = val;
        if (val === 'Mon-Thu (4 10s)') {
          chkMon.checked = true; chkTue.checked = true; chkWed.checked = true; chkThu.checked = true;
          chkFri.checked = false; chkSat.checked = false; chkSun.checked = false;
        } else if (val === 'Mon-Fri (5 8s)') {
          chkMon.checked = true; chkTue.checked = true; chkWed.checked = true; chkThu.checked = true; chkFri.checked = true;
          chkSat.checked = false; chkSun.checked = false;
        } else if (val === 'Tue-Fri (4 10s)') {
          chkMon.checked = false; chkTue.checked = true; chkWed.checked = true; chkThu.checked = true; chkFri.checked = true;
          chkSat.checked = false; chkSun.checked = false;
        } else if (val.toLowerCase().includes('weekend') || val.toLowerCase().includes('fri & sat')) {
          chkMon.checked = false; chkTue.checked = false; chkWed.checked = false; chkThu.checked = false;
          chkFri.checked = true; chkSat.checked = true; chkSun.checked = false;
        }
      });
    }

    const closeModal = () => overlay.remove();
    overlay.querySelector('#btn-edit-planned-close-x')?.addEventListener('click', closeModal);
    overlay.querySelector('#btn-edit-planned-cancel')?.addEventListener('click', closeModal);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) closeModal(); });

    overlay.querySelector('#btn-edit-planned-save')?.addEventListener('click', async () => {
      const newJobName = overlay.querySelector('#planned-edit-job-name')?.value?.trim() || '';
      const newLoc = overlay.querySelector('#planned-edit-location')?.value?.trim() || '';
      const newForeman = overlay.querySelector('#planned-edit-foreman')?.value?.trim() || '';
      const newCrewType = overlay.querySelector('#planned-edit-crew-type')?.value || 'Electric';
      const newStatus = overlay.querySelector('#planned-edit-status')?.value || 'Active';
      const newSchedule = overlay.querySelector('#planned-edit-sched-label')?.value?.trim() || 'Mon-Thu (4 10s)';
      const writeJt = overlay.querySelector('#planned-edit-write-jt')?.checked;

      crew.jobName = newJobName;
      crew.location = newLoc;
      crew.foreman = newForeman;
      crew.crewType = newCrewType;
      crew.status = newStatus;
      crew.schedule = newSchedule;
      crew.isSkipMon = !chkMon?.checked;
      crew.isSkipTue = !chkTue?.checked;
      crew.isSkipWed = !chkWed?.checked;
      crew.isSkipThu = !chkThu?.checked;
      crew.isSkipFri = !chkFri?.checked;
      crew.isSkipSat = !chkSat?.checked;
      crew.isSkipSun = !chkSun?.checked;

      this.savePlan(plan);

      if (writeJt) {
        const jtTbl = this.db.getTable('job_tracking');
        if (jtTbl && jtTbl.rows) {
          let row = jtTbl.rows.find(j => {
            const jn = String(j['Job Number'] || j['Job #'] || '').trim();
            return jn === jobNumber || jn.replace(/\.\d+.*$/, '').trim() === jobNumber;
          });
          const updated = {
            'Job Name': newJobName,
            'Location': newLoc,
            'Foreman': newForeman,
            'Crew Type': newCrewType,
            'Status': newStatus,
            'Work Schedule': newSchedule,
            'Skip Mon': crew.isSkipMon,
            'Skip Tue': crew.isSkipTue,
            'Skip Wed': crew.isSkipWed,
            'Skip Thu': crew.isSkipThu,
            'Skip Fri': crew.isSkipFri,
            'Skip Sat': crew.isSkipSat,
            'Skip Sun': crew.isSkipSun
          };
          if (row) {
            Object.assign(row, updated);
            await this.db.addMutation({
              action: 'UPDATE_ROW',
              sheetName: jtTbl.name || 'Job Tracking',
              tableKey: 'job_tracking',
              itemIdentifier: jobNumber,
              updatedFields: updated
            });

            // Clean up any other duplicate rows in job_tracking matching jobNumber
            const dupJtRows = jtTbl.rows.filter(j => {
              if (j === row) return false;
              const jn = String(j['Job Number'] || j['Job #'] || '').trim();
              return jn === jobNumber || jn.replace(/\.\d+.*$/, '').trim() === jobNumber;
            });
            if (dupJtRows.length > 0) {
              jtTbl.rows = jtTbl.rows.filter(j => !dupJtRows.includes(j));
              jtTbl.rowCount = jtTbl.rows.length;
              jtTbl.rows.forEach((r, idx) => { r._rowIdx = idx + 2; });
              for (const dupRow of dupJtRows) {
                const dIdx = dupRow._rowIdx;
                if (jtTbl.rawGrid && dIdx && jtTbl.rawGrid[dIdx - 1]) {
                  jtTbl.rawGrid.splice(dIdx - 1, 1);
                }
                await this.db.addMutation({
                  action: 'DELETE_ROW',
                  sheetName: jtTbl.name || 'Job Tracking',
                  tableKey: 'job_tracking',
                  itemIdentifier: jobNumber,
                  row: dIdx
                });
              }
            }
          } else {
            const newRow = {
              'Job Number': jobNumber,
              ...updated
            };
            jtTbl.rows.push(newRow);
            await this.db.addMutation({
              action: 'ADD_ROW',
              sheetName: jtTbl.name || 'Job Tracking',
              tableKey: 'job_tracking',
              row: newRow
            });
          }
          if (typeof this.db.schedulePersistSnapshot === 'function') {
            this.db.schedulePersistSnapshot(this.db.snapshot, 300);
          }
        }
      }

      closeModal();
      this.refreshView();
      if (typeof window.showToast === 'function') {
        window.showToast(`✅ Updated Crew ${jobNumber} properties${writeJt ? ' and saved to Job Tracking' : ''}!`, 'success');
      }
    });
  }

  openScheduleEditModal(jobNumber) {
    const plan = this.getPlanForWeek(this.selectedWeek);
    const crew = plan?.crews?.find(c => c.jobNumber === jobNumber);
    if (!crew) return;

    const modalId = 'modal-crew-schedule-edit';
    const existing = document.getElementById(modalId);
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = modalId;
    overlay.className = 'modal-overlay active';
    overlay.style.cssText = `
      position: fixed; inset: 0; background: rgba(0,0,0,0.75) !important;
      z-index: 15000 !important; display: flex; align-items: center; justify-content: center;
      backdrop-filter: blur(4px); padding: 18px; pointer-events: auto !important;
    `;

    const skipDays = this.getCrewSkipDays(crew);
    let isMon = !skipDays.isSkipMon;
    let isTue = !skipDays.isSkipTue;
    let isWed = !skipDays.isSkipWed;
    let isThu = !skipDays.isSkipThu;
    let isFri = !skipDays.isSkipFri;
    let isSat = !skipDays.isSkipSat;
    let isSun = !skipDays.isSkipSun;
    let currentSchedule = crew.schedule || 'Mon-Thu (4 10s)';
    let skipMtg = Boolean(crew.skipMtg);
    let skipChk = Boolean(crew.skipChk);

    overlay.innerHTML = `
      <div class="modal-box" style="background: var(--bg-secondary, #1e293b); border: 1px solid rgba(59, 130, 246, 0.45); border-radius: 10px; width: 460px; max-width: 95vw; box-shadow: 0 16px 36px rgba(0,0,0,0.65); display: flex; flex-direction: column; overflow: hidden; color: #fff; pointer-events: auto !important;">
        
        <!-- Modal Header -->
        <div style="padding: 14px 18px; border-bottom: 1px solid rgba(255,255,255,0.08); display: flex; justify-content: space-between; align-items: center; background: rgba(0,0,0,0.25);">
          <div style="display: flex; align-items: center; gap: 8px;">
            <span style="font-size: 16px;">🕒</span>
            <div style="font-weight: 800; font-size: 14px; color: #60a5fa;">
              Adjust Schedule — Crew ${this.escapeHtml(crew.jobNumber)} ${crew.jobName ? `(${this.escapeHtml(crew.jobName)})` : ''}
            </div>
          </div>
          <button id="btn-sched-close-x" style="background: transparent; border: none; color: #94a3b8; font-size: 18px; cursor: pointer; padding: 2px 6px;">✕</button>
        </div>

        <!-- Modal Body -->
        <div style="padding: 18px; display: flex; flex-direction: column; gap: 14px; font-size: 12px; color: var(--text-primary, #e2e8f0);">
          
          <!-- Schedule Preset Selector -->
          <div>
            <label style="display: block; font-weight: 700; color: #94a3b8; margin-bottom: 5px; font-size: 11px;">
              Schedule Preset:
            </label>
            <select id="sched-preset-select" style="width: 100%; box-sizing: border-box; padding: 8px 10px; background: #0f172a; border: 1px solid rgba(255,255,255,0.15); border-radius: 6px; color: #ffffff; font-size: 12.5px; font-weight: 600;">
              <option value="Mon-Thu (4 10s)">Mon-Thu (4 10s)</option>
              <option value="Mon-Fri (5 8s)">Mon-Fri (5 8s)</option>
              <option value="Mon-Fri (5 10s)">Mon-Fri (5 10s)</option>
              <option value="Mon-Sat (6 10s)">Mon-Sat (6 10s)</option>
              <option value="Mon-Sun (7 10s)">Mon-Sun (7 10s)</option>
              <option value="Tue-Fri (4 10s)">Tue-Fri (4 10s)</option>
              <option value="Fri-Sat Weekend (2 10s)">Fri-Sat Weekend (2 10s)</option>
              <option value="Custom">Custom Schedule</option>
            </select>
          </div>

          <!-- Shift Hours Quick Chips -->
          <div>
            <label style="display: block; font-weight: 700; color: #94a3b8; margin-bottom: 5px; font-size: 11px;">
              Shift Hours (Click to update description):
            </label>
            <div style="display: flex; gap: 6px; flex-wrap: wrap;">
              ${['4 10s', '5 8s', '5 10s', '6 10s', '4 12s', '7 10s', '2 10s'].map(h => `
                <button type="button" class="sched-hours-chip" data-hours="${h}"
                        style="padding: 4px 9px; font-size: 11px; font-weight: 700; background: rgba(59, 130, 246, 0.14); color: #93c5fd; border: 1px solid rgba(59, 130, 246, 0.3); border-radius: 4px; cursor: pointer; transition: all 0.15s ease;">
                  ${h}
                </button>
              `).join('')}
            </div>
          </div>

          <!-- Schedule Description (Editable) -->
          <div>
            <label style="display: block; font-weight: 700; color: #94a3b8; margin-bottom: 5px; font-size: 11px;">
              Schedule Description / Label:
            </label>
            <input type="text" id="sched-label-input" value="${this.escapeHtml(currentSchedule)}"
                   placeholder="e.g. Mon-Fri (5 10s)"
                   style="width: 100%; box-sizing: border-box; padding: 8px 10px; background: #0f172a; border: 1px solid rgba(255,255,255,0.15); border-radius: 6px; color: #ffffff; font-size: 12.5px;">
          </div>

          <!-- Working Days Selector -->
          <div>
            <label style="display: block; font-weight: 700; color: #94a3b8; margin-bottom: 6px; font-size: 11px;">
              Working Days (Click to toggle Working 🟢 vs. Off ⚪):
            </label>
            <div style="display: grid; grid-template-columns: repeat(7, 1fr); gap: 5px;">
              ${[
                { key: 'Mon', label: 'Mon', work: isMon },
                { key: 'Tue', label: 'Tue', work: isTue },
                { key: 'Wed', label: 'Wed', work: isWed },
                { key: 'Thu', label: 'Thu', work: isThu },
                { key: 'Fri', label: 'Fri', work: isFri },
                { key: 'Sat', label: 'Sat', work: isSat },
                { key: 'Sun', label: 'Sun', work: isSun }
              ].map(d => `
                <button type="button" id="modal-day-${d.key}" data-day="${d.key}" data-working="${d.work ? 'true' : 'false'}"
                        style="padding: 8px 0; font-size: 11px; font-weight: 700; border-radius: 6px; border: 1px solid ${d.work ? '#059669' : 'rgba(255,255,255,0.12)'}; background: ${d.work ? '#10b981' : '#0f172a'}; color: ${d.work ? '#ffffff' : '#64748b'}; cursor: pointer; transition: all 0.15s ease;">
                  ${d.label}
                </button>
              `).join('')}
            </div>
            <div id="sched-days-summary" style="margin-top: 6px; font-size: 11px; color: #34d399; font-weight: 600; text-align: right;"></div>
          </div>

          <!-- Safety Compliance Meeting & Checklist Skips -->
          <div style="background: rgba(0,0,0,0.2); border: 1px solid rgba(255,255,255,0.06); border-radius: 6px; padding: 10px; display: flex; gap: 14px; flex-wrap: wrap;">
            <label style="display: inline-flex; align-items: center; gap: 6px; font-size: 11.5px; cursor: pointer; color: #e2e8f0;">
              <input type="checkbox" id="sched-skip-mtg" ${skipMtg ? 'checked' : ''} style="cursor: pointer;">
              <span>Skip Safety Meeting</span>
            </label>
            <label style="display: inline-flex; align-items: center; gap: 6px; font-size: 11.5px; cursor: pointer; color: #e2e8f0;">
              <input type="checkbox" id="sched-skip-chk" ${skipChk ? 'checked' : ''} style="cursor: pointer;">
              <span>Skip Monthly Checklist</span>
            </label>
          </div>

        </div>

        <!-- Modal Footer -->
        <div style="padding: 12px 18px; border-top: 1px solid rgba(255,255,255,0.08); display: flex; justify-content: flex-end; gap: 8px; background: rgba(0,0,0,0.25);">
          <button type="button" id="btn-sched-cancel" class="btn btn-secondary" style="font-size: 12px; padding: 6px 14px; cursor: pointer;">
            Cancel
          </button>
          <button type="button" id="btn-sched-apply" class="btn btn-primary" style="font-size: 12px; font-weight: 700; padding: 6px 16px; background: linear-gradient(135deg, #10b981 0%, #059669 100%); border: none; cursor: pointer;">
            Apply Schedule
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    const presetSelect = overlay.querySelector('#sched-preset-select');
    const labelInput = overlay.querySelector('#sched-label-input');
    const daysSummary = overlay.querySelector('#sched-days-summary');

    const updateDayButton = (key, work) => {
      const btn = overlay.querySelector(`#modal-day-${key}`);
      if (!btn) return;
      btn.dataset.working = work ? 'true' : 'false';
      btn.style.background = work ? '#10b981' : '#0f172a';
      btn.style.borderColor = work ? '#059669' : 'rgba(255,255,255,0.12)';
      btn.style.color = work ? '#ffffff' : '#64748b';
    };

    const getDayWorking = (key) => {
      return overlay.querySelector(`#modal-day-${key}`)?.dataset.working === 'true';
    };

    const refreshSummary = () => {
      const working = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].filter(d => getDayWorking(d));
      daysSummary.textContent = `${working.length} working day(s): ${working.join(', ') || 'None'}`;
    };

    // Initialize preset dropdown
    const sLower = currentSchedule.toLowerCase();
    if (sLower.includes('mon-fri') && sLower.includes('5 10')) {
      presetSelect.value = 'Mon-Fri (5 10s)';
    } else if (sLower.includes('mon-fri')) {
      presetSelect.value = 'Mon-Fri (5 8s)';
    } else if (sLower.includes('6 10') || sLower.includes('mon-sat')) {
      presetSelect.value = 'Mon-Sat (6 10s)';
    } else if (sLower.includes('7 10') || sLower.includes('mon-sun')) {
      presetSelect.value = 'Mon-Sun (7 10s)';
    } else if (sLower.includes('tue-fri')) {
      presetSelect.value = 'Tue-Fri (4 10s)';
    } else if (sLower.includes('fri-sat') || sLower.includes('weekend')) {
      presetSelect.value = 'Fri-Sat Weekend (2 10s)';
    } else if (sLower.includes('mon-thu')) {
      presetSelect.value = 'Mon-Thu (4 10s)';
    } else {
      presetSelect.value = 'Custom';
    }
    refreshSummary();

    // Preset selector change handler
    presetSelect.addEventListener('change', () => {
      const p = presetSelect.value;
      if (p === 'Mon-Thu (4 10s)') {
        updateDayButton('Mon', true); updateDayButton('Tue', true); updateDayButton('Wed', true); updateDayButton('Thu', true);
        updateDayButton('Fri', false); updateDayButton('Sat', false); updateDayButton('Sun', false);
        labelInput.value = 'Mon-Thu (4 10s)';
      } else if (p === 'Mon-Fri (5 8s)') {
        updateDayButton('Mon', true); updateDayButton('Tue', true); updateDayButton('Wed', true); updateDayButton('Thu', true);
        updateDayButton('Fri', true); updateDayButton('Sat', false); updateDayButton('Sun', false);
        labelInput.value = 'Mon-Fri (5 8s)';
      } else if (p === 'Mon-Fri (5 10s)') {
        updateDayButton('Mon', true); updateDayButton('Tue', true); updateDayButton('Wed', true); updateDayButton('Thu', true);
        updateDayButton('Fri', true); updateDayButton('Sat', false); updateDayButton('Sun', false);
        labelInput.value = 'Mon-Fri (5 10s)';
      } else if (p === 'Mon-Sat (6 10s)') {
        updateDayButton('Mon', true); updateDayButton('Tue', true); updateDayButton('Wed', true); updateDayButton('Thu', true);
        updateDayButton('Fri', true); updateDayButton('Sat', true); updateDayButton('Sun', false);
        labelInput.value = 'Mon-Sat (6 10s)';
      } else if (p === 'Mon-Sun (7 10s)') {
        ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].forEach(d => updateDayButton(d, true));
        labelInput.value = 'Mon-Sun (7 10s)';
      } else if (p === 'Tue-Fri (4 10s)') {
        updateDayButton('Mon', false); updateDayButton('Tue', true); updateDayButton('Wed', true); updateDayButton('Thu', true);
        updateDayButton('Fri', true); updateDayButton('Sat', false); updateDayButton('Sun', false);
        labelInput.value = 'Tue-Fri (4 10s)';
      } else if (p === 'Fri-Sat Weekend (2 10s)') {
        updateDayButton('Mon', false); updateDayButton('Tue', false); updateDayButton('Wed', false); updateDayButton('Thu', false);
        updateDayButton('Fri', true); updateDayButton('Sat', true); updateDayButton('Sun', false);
        labelInput.value = 'Fri-Sat Weekend (2 10s)';
      }
      refreshSummary();
    });

    // Shift Hours quick chips
    overlay.querySelectorAll('.sched-hours-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        const h = chip.dataset.hours;
        let cur = labelInput.value.trim();
        if (/\(\s*\d+[^)]*\)/.test(cur)) {
          labelInput.value = cur.replace(/\(\s*\d+[^)]*\)/, `(${h})`);
        } else if (cur) {
          labelInput.value = `${cur} (${h})`;
        } else {
          labelInput.value = h;
        }

        if (h === '5 10s' && getDayWorking('Mon') && getDayWorking('Fri') && !getDayWorking('Sat')) {
          presetSelect.value = 'Mon-Fri (5 10s)';
        } else if (h === '5 8s' && getDayWorking('Mon') && getDayWorking('Fri') && !getDayWorking('Sat')) {
          presetSelect.value = 'Mon-Fri (5 8s)';
        } else if (h === '6 10s' && getDayWorking('Sat')) {
          presetSelect.value = 'Mon-Sat (6 10s)';
        } else if (h === '4 10s' && getDayWorking('Thu') && !getDayWorking('Fri')) {
          presetSelect.value = 'Mon-Thu (4 10s)';
        }
      });
    });

    // Interactive day button clicks
    ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].forEach(k => {
      const btn = overlay.querySelector(`#modal-day-${k}`);
      btn?.addEventListener('click', () => {
        const next = btn.dataset.working !== 'true';
        updateDayButton(k, next);
        refreshSummary();

        const m = getDayWorking('Mon');
        const tu = getDayWorking('Tue');
        const w = getDayWorking('Wed');
        const th = getDayWorking('Thu');
        const f = getDayWorking('Fri');
        const sa = getDayWorking('Sat');
        const su = getDayWorking('Sun');

        const curLabel = labelInput.value;
        const matchHours = curLabel.match(/(\d+\s*(?:10s|8s|12s|9s))/i);
        const hours = matchHours ? matchHours[1] : null;

        if (m && tu && w && th && !f && !sa && !su) {
          presetSelect.value = 'Mon-Thu (4 10s)';
          labelInput.value = `Mon-Thu (${hours || '4 10s'})`;
        } else if (m && tu && w && th && f && !sa && !su) {
          if (hours === '5 10s') {
            presetSelect.value = 'Mon-Fri (5 10s)';
            labelInput.value = 'Mon-Fri (5 10s)';
          } else {
            presetSelect.value = 'Mon-Fri (5 8s)';
            labelInput.value = `Mon-Fri (${hours || '5 8s'})`;
          }
        } else if (m && tu && w && th && f && sa && !su) {
          presetSelect.value = 'Mon-Sat (6 10s)';
          labelInput.value = `Mon-Sat (${hours || '6 10s'})`;
        } else if (m && tu && w && th && f && sa && su) {
          presetSelect.value = 'Mon-Sun (7 10s)';
          labelInput.value = `Mon-Sun (${hours || '7 10s'})`;
        } else if (!m && tu && w && th && f && !sa && !su) {
          presetSelect.value = 'Tue-Fri (4 10s)';
          labelInput.value = `Tue-Fri (${hours || '4 10s'})`;
        } else if (!m && !tu && !w && !th && f && sa && !su) {
          presetSelect.value = 'Fri-Sat Weekend (2 10s)';
          labelInput.value = `Fri-Sat Weekend (${hours || '2 10s'})`;
        } else {
          presetSelect.value = 'Custom';
        }
      });
    });

    const closeModal = () => overlay.remove();
    overlay.querySelector('#btn-sched-close-x')?.addEventListener('click', closeModal);
    overlay.querySelector('#btn-sched-cancel')?.addEventListener('click', closeModal);
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeModal();
    });

    // Apply schedule
    overlay.querySelector('#btn-sched-apply')?.addEventListener('click', () => {
      crew.schedule = labelInput.value.trim() || 'Mon-Thu (4 10s)';
      crew.isSkipMon = !getDayWorking('Mon');
      crew.isSkipTue = !getDayWorking('Tue');
      crew.isSkipWed = !getDayWorking('Wed');
      crew.isSkipThu = !getDayWorking('Thu');
      crew.isSkipFri = !getDayWorking('Fri');
      crew.isSkipSat = !getDayWorking('Sat');
      crew.isSkipSun = !getDayWorking('Sun');
      crew.skipMtg = Boolean(overlay.querySelector('#sched-skip-mtg')?.checked);
      crew.skipChk = Boolean(overlay.querySelector('#sched-skip-chk')?.checked);

      this.savePlan(plan);
      overlay.remove();
      this.refreshView();
      if (typeof window.showToast === 'function') {
        window.showToast(`🕒 Updated schedule for Crew ${jobNumber}: ${crew.schedule}`, 'success');
      }
    });
  }

  moveMemberUpInCrew(empName, baseJob) {
    const plan = this.getPlanForWeek(this.selectedWeek);
    if (!plan) return;
    const crew = plan.crews.find(c => c.jobNumber.toLowerCase() === String(baseJob || '').toLowerCase());
    if (!crew) return;
    const norm = String(empName || '').trim().toLowerCase();
    const idx = crew.members.findIndex(m => m.name.trim().toLowerCase() === norm);
    if (idx <= 0) {
      if (typeof window.showToast === 'function') {
        window.showToast(`${empName} is already at the top of Crew ${baseJob}.`, 'info');
      }
      return;
    }
    // Swap with member above
    const temp = crew.members[idx];
    crew.members[idx] = crew.members[idx - 1];
    crew.members[idx - 1] = temp;

    // Renumber sequentially (.1, .2, .3, ...)
    crew.members.forEach((m, i) => {
      m.slot = `${crew.jobNumber}.${i + 1}`;
    });

    this.savePlan(plan);
    this.refreshView();
    if (typeof window.showToast === 'function') {
      window.showToast(`⬆️ Moved ${empName} up to slot ${crew.members[idx - 1].slot}.`, 'info');
    }
  }

  moveMemberDownInCrew(empName, baseJob) {
    const plan = this.getPlanForWeek(this.selectedWeek);
    if (!plan) return;
    const crew = plan.crews.find(c => c.jobNumber.toLowerCase() === String(baseJob || '').toLowerCase());
    if (!crew) return;
    const norm = String(empName || '').trim().toLowerCase();
    const idx = crew.members.findIndex(m => m.name.trim().toLowerCase() === norm);
    if (idx === -1 || idx >= crew.members.length - 1) {
      if (typeof window.showToast === 'function') {
        window.showToast(`${empName} is already at the bottom of Crew ${baseJob}.`, 'info');
      }
      return;
    }
    // Swap with member below
    const temp = crew.members[idx];
    crew.members[idx] = crew.members[idx + 1];
    crew.members[idx + 1] = temp;

    // Renumber sequentially (.1, .2, .3, ...)
    crew.members.forEach((m, i) => {
      m.slot = `${crew.jobNumber}.${i + 1}`;
    });

    this.savePlan(plan);
    this.refreshView();
    if (typeof window.showToast === 'function') {
      window.showToast(`⬇️ Moved ${empName} down to slot ${crew.members[idx + 1].slot}.`, 'info');
    }
  }

  openPlannedMemberActions(e, empName, baseJob) {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    const plan = this.getPlanForWeek(this.selectedWeek);
    if (!plan) return;

    const existing = document.getElementById('planning-member-actions-menu');
    if (existing) existing.remove();

    const st = this.getEmployeePlanningStatus(empName, baseJob, null, plan);
    const crew = plan.crews.find(c => c.jobNumber.toLowerCase() === String(baseJob || '').toLowerCase());
    const isForeman = crew ? this.isCrewForeman(crew, empName) : false;
    const dragData = { empName, name: empName, fromBaseJob: baseJob };

    // Position menu near click cursor or button
    const clientX = e ? e.clientX : window.innerWidth / 2;
    const clientY = e ? e.clientY : window.innerHeight / 2;

    const menu = document.createElement('div');
    menu.id = 'planning-member-actions-menu';
    menu.style.cssText = `
      position: fixed;
      top: ${Math.min(clientY + 4, window.innerHeight - 420)}px;
      left: ${Math.max(10, Math.min(clientX - 160, window.innerWidth - 270))}px;
      background: #1e293b;
      border: 1px solid rgba(255, 255, 255, 0.15);
      border-radius: 8px;
      box-shadow: 0 12px 32px rgba(0, 0, 0, 0.65), 0 0 0 1px rgba(255, 255, 255, 0.05);
      z-index: 16000;
      min-width: 240px;
      padding: 6px 0;
      font-size: 12px;
      display: flex;
      flex-direction: column;
      animation: fadeIn 0.12s ease;
    `;

    // Header
    const header = document.createElement('div');
    header.style.cssText = 'padding: 6px 14px 8px 14px; border-bottom: 1px solid rgba(255, 255, 255, 0.08); font-size: 11px; color: #94a3b8; display: flex; flex-direction: column; gap: 2px;';
    header.innerHTML = `
      <div style="font-weight: 700; color: #f8fafc; font-size: 12px; display: flex; align-items: center; gap: 5px;">
        ${isForeman ? '👑 ' : ''}<span>${this.escapeHtml(empName)}</span>
      </div>
      <div>Crew ${this.escapeHtml(baseJob)}</div>
    `;
    menu.appendChild(header);

    const makeItem = (icon, label, onClick, color = '#e2e8f0', hoverBg = 'rgba(255,255,255,0.08)') => {
      const btn = document.createElement('button');
      btn.style.cssText = `
        background: transparent;
        border: none;
        padding: 7px 14px;
        text-align: left;
        color: ${color};
        cursor: pointer;
        display: flex;
        align-items: center;
        gap: 9px;
        font-size: 12px;
        width: 100%;
        transition: background 0.1s ease;
      `;
      btn.innerHTML = `<span style="font-size: 13px; width: 18px; text-align: center;">${icon}</span> <span style="flex: 1;">${this.escapeHtml(label)}</span>`;
      btn.onmouseenter = () => { btn.style.background = hoverBg; };
      btn.onmouseleave = () => { btn.style.background = 'transparent'; };
      btn.onclick = (evt) => {
        evt.stopPropagation();
        menu.remove();
        document.removeEventListener('click', closeMenu);
        onClick();
      };
      return btn;
    };

    const makeDivider = () => {
      const div = document.createElement('div');
      div.style.cssText = 'height: 1px; background: rgba(255, 255, 255, 0.08); margin: 4px 0;';
      return div;
    };

    // 0. Open Employee Profile
    menu.appendChild(makeItem('👤', 'Open Employee Profile & Edit Details', () => {
      if (window.employeeProfileEngine) {
        window.employeeProfileEngine.openProfileModal(empName, 'details');
      }
    }, '#60a5fa', 'rgba(96, 165, 250, 0.12)'));
    menu.appendChild(makeDivider());

    // 1. Move Up / Down
    menu.appendChild(makeItem('⬆️', 'Move Up in Crew', () => this.moveMemberUpInCrew(empName, baseJob)));
    menu.appendChild(makeItem('⬇️', 'Move Down in Crew', () => this.moveMemberDownInCrew(empName, baseJob)));

    // 2. Designate Foreman
    if (!isForeman && crew) {
      menu.appendChild(makeItem('👑', `Make Foreman of Crew ${baseJob}`, () => {
        crew.foreman = empName;
        this.savePlan(plan);
        this.refreshView();
        if (typeof window.showToast === 'function') {
          window.showToast(`👑 Designated ${empName} as Foreman of Crew ${baseJob}.`, 'success');
        }
      }, '#f472b6', 'rgba(244, 114, 182, 0.12)'));
    }

    // 3. Duplicate
    menu.appendChild(makeItem('👯', 'Duplicate to Another Crew/Category...', () => {
      this.promptDuplicateMember(empName, baseJob);
    }, '#c084fc', 'rgba(192, 132, 252, 0.12)'));

    if (st.isMultiLocation) {
      menu.appendChild(makeItem('⚡', 'Edit 1st / 2nd Job Assignment...', () => {
        this.promptEditPlannedSecondJob(empName, baseJob);
      }, '#fbbf24', 'rgba(245, 158, 11, 0.12)'));
    }

    // 4. Confirm / Unconfirm
    if (st.isConfirmed) {
      menu.appendChild(makeItem('🟣', 'Unconfirm Position (Return to Purple)', () => {
        this.toggleConfirmMemberPosition(empName, baseJob);
      }, '#c084fc'));
    } else {
      menu.appendChild(makeItem('🟡', 'Confirm Position (Turn Yellow)', () => {
        this.toggleConfirmMemberPosition(empName, baseJob);
      }, '#facc15', 'rgba(250, 204, 21, 0.12)'));
    }

    menu.appendChild(makeDivider());

    // 5. Departure / Notice & Vacation Options
    const memberObjOnCrew = crew?.members.find(x => x.name.toLowerCase() === empName.toLowerCase());
    const quitEntry = (plan.sidePane?.quit || []).find(q => q.name.trim().toLowerCase() === empName.toLowerCase());
    const hasDeparture = Boolean(memberObjOnCrew?.departureDate || quitEntry?.departureDate);
    const depDate = memberObjOnCrew?.departureDate || quitEntry?.departureDate;

    if (hasDeparture) {
      menu.appendChild(makeItem('🚪', `Edit Scheduled Departure (${depDate})`, () => this.editQuitDeparture(empName), '#fca5a5', 'rgba(239, 68, 68, 0.15)'));
      menu.appendChild(makeItem('↩️', 'Cancel Scheduled Departure', () => this.removeMemberFromSideCategory(empName, 'quit'), '#cbd5e1'));
    } else {
      menu.appendChild(makeItem('🚪', 'Schedule Departure / Last Working Day...', () => this.promptQuitDeparture(dragData), '#fca5a5', 'rgba(239, 68, 68, 0.12)'));
    }

    const vacEntry = (plan.sidePane?.vacation || []).find(v => v.name.trim().toLowerCase() === empName.toLowerCase());
    const hasVacation = Boolean(memberObjOnCrew?.vacationDateRange || vacEntry);
    const vacRange = memberObjOnCrew?.vacationDateRange || vacEntry?.dateRange || vacEntry?.vacationStartDate || '';

    if (hasVacation) {
      menu.appendChild(makeItem('🏖️', `Edit Scheduled Vacation (${vacRange || 'Set Dates'})`, () => this.editVacationSchedule(empName), '#fcd34d', 'rgba(245, 158, 11, 0.15)'));
      menu.appendChild(makeItem('↩️', 'Cancel Scheduled Vacation', () => this.removeMemberFromSideCategory(empName, 'vacation'), '#cbd5e1'));
    } else {
      menu.appendChild(makeItem('🏖️', 'Schedule Vacation / Dates...', () => this.promptVacationSchedule(dragData), '#fcd34d', 'rgba(245, 158, 11, 0.12)'));
    }

    menu.appendChild(makeDivider());

    // 6. Move to Staging Categories
    menu.appendChild(makeItem('📋', 'Move to Planning Pool', () => this.handleMoveToSideCategory(dragData, 'planning')));
    menu.appendChild(makeItem('🏖️', 'Move to Scheduled Vacation', () => this.handleMoveToSideCategory(dragData, 'vacation')));
    menu.appendChild(makeItem('🌾', 'Move to Weeds', () => this.handleMoveToSideCategory(dragData, 'weeds')));
    menu.appendChild(makeItem('🩺', 'Move to Light Duty', () => this.handleMoveToSideCategory(dragData, 'lightDuty')));

    menu.appendChild(makeDivider());

    // 7. Remove from Crew
    menu.appendChild(makeItem('✕', 'Remove from this Crew', () => {
      if (confirm(`Remove ${empName} from Crew ${baseJob}?`)) {
        if (crew) {
          const wasFm = this.isCrewForeman(crew, empName);
          crew.members = crew.members.filter(m => m.name.toLowerCase() !== empName.toLowerCase());
          crew.members.forEach((m, idx) => {
            m.slot = `${crew.jobNumber}.${idx + 1}`;
          });
          if (wasFm) {
            crew.foreman = crew.members.length > 0 ? crew.members[0].name : '';
          }
          // Remove confirmation key for this assignment
          const norm = empName.toLowerCase().trim();
          if (plan.confirmedPositions) {
            delete plan.confirmedPositions[`${norm}::${String(baseJob).toLowerCase()}`];
          }
          // Clean up secondaryJob reference on remaining occurrence if only 1 occurrence remains
          const remainingOccs = (plan.crews || []).flatMap(c => (c.members || []).filter(m => m.name && m.name.toLowerCase() === norm));
          if (remainingOccs.length === 1) {
            remainingOccs[0].secondaryJob = '';
            delete remainingOccs[0].isSecondaryMember;
            delete remainingOccs[0].primaryJobNumber;
          }
          // If employee is now in 0 crews and 0 side categories, stage them in Planning Pool
          const isStillInCrews = (plan.crews || []).some(c => (c.members || []).some(m => m.name && m.name.toLowerCase() === norm));
          const sp = plan.sidePane || {};
          const isStillInSide = Object.keys(sp).some(k => (sp[k] || []).some(m => m.name && m.name.toLowerCase() === norm));
          if (!isStillInCrews && !isStillInSide) {
            if (!plan.sidePane) plan.sidePane = {};
            if (!plan.sidePane.planning) plan.sidePane.planning = [];
            plan.sidePane.planning.push({
              name: empName,
              slot: '',
              currentJob: `${baseJob} (Unassigned)`,
              isConfirmed: false
            });
          }
          this.savePlan(plan);
          this.refreshView();
          if (typeof window.showToast === 'function') {
            window.showToast(`Removed ${empName} from Crew ${baseJob}.`, 'info');
          }
        }
      }
    }, '#f87171', 'rgba(248, 113, 113, 0.12)'));

    document.body.appendChild(menu);

    // Auto-close on click outside
    const closeMenu = (evt) => {
      if (!menu.contains(evt.target)) {
        menu.remove();
        document.removeEventListener('click', closeMenu);
      }
    };
    setTimeout(() => {
      document.addEventListener('click', closeMenu);
    }, 10);
  }

  openHistoricalExcelImportModal() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.xlsx, .xls, .csv';
    input.onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      try {
        if (typeof window.showToast === 'function') {
          window.showToast('Reading historical workbook tabs...', 'info');
        }
        const res = await this.importHistoricalWorkbookTabs(file);
        alert(`✅ Successfully imported ${res.importedCount} historical weekly rosters into the archive:\n\n${res.importedWeeks.join(', ')}`);
        this.refreshView();
      } catch (err) {
        alert(`Error importing historical workbook: ${err.message}`);
      }
    };
    input.click();
  }

  // ==========================================================================
  // Utility String Escapers
  // ==========================================================================

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
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/\\/g, '\\\\')
      .replace(/'/g, "\\'")
      .replace(/"/g, '\\"')
      .replace(/\n/g, '\\n')
      .replace(/\r/g, '\\r');
  }
}

// Global instantiation
if (typeof window !== 'undefined') {
  window.CrewPlanningEngine = CrewPlanningEngine;
  if (!window.crewPlanningEngine && window.localDB) {
    window.crewPlanningEngine = new CrewPlanningEngine(window.localDB);
  }
}
