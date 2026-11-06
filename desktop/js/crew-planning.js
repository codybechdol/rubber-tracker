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
    const current = [{
      weekStr: currentStr,
      label: `Week of ${currentStr} (Live)`,
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
    const isConfirmed = Boolean(
      memberObj?.isConfirmed ||
      (plan.confirmedPositions && plan.confirmedPositions[confirmKey]) ||
      (plan.confirmedPositions && plan.confirmedPositions[norm])
    );

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
    if (!weekStr) weekStr = this.getPlanningWeeks()[0].weekStr;
    const plans = this.getPlansMap();
    if (!plans[weekStr]) {
      plans[weekStr] = this.initializePlanFromCurrentRoster(weekStr);
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

    // Secondary Check: Ensure baseline secondary assignments are preserved in their secondary crews
    baselineMap.forEach((base, normName) => {
      if (!base.name || this.isNonEmployeeName(base.name)) return;
      if (!base.secondaryBaseJob) return;

      const targetSecCrew = (plan.crews || []).find(c => c.jobNumber.toLowerCase() === base.secondaryBaseJob.toLowerCase());
      if (targetSecCrew && !targetSecCrew.members.some(m => m.name.toLowerCase() === normName)) {
        targetSecCrew.members.push({
          name: base.name,
          slot: base.secondarySlot || `${targetSecCrew.jobNumber}.${targetSecCrew.members.length + 1}`,
          originalSlot: base.secondarySlot || targetSecCrew.jobNumber,
          originalBaseJob: targetSecCrew.jobNumber,
          classification: String(base.rawRow?.['Job Classification'] || base.rawRow?.['Classification'] || 'Journeyman').trim(),
          role: String(base.rawRow?.['Role'] || 'JL').trim(),
          location: targetSecCrew.location || 'Helena',
          isConfirmed: false,
          isSecondaryMember: true,
          primaryJobNumber: base.originalSlot || base.originalBaseJob
        });
        healedCount++;
      }
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

  renderPlanningWorkspace(container, countBadge, targetWeekStr) {
    if (!container) return;

    // Run automated check for any employee whose last day has arrived
    this.checkAndArchiveDepartedEmployees();

    if (!targetWeekStr) {
      targetWeekStr = this.selectedWeek || this.getPlanningWeeks()[0].weekStr;
    }
    this.selectedWeek = targetWeekStr;

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
              <span class="badge" style="background: rgba(245, 158, 11, 0.18); color: #fbbf24; border: 1px solid rgba(245, 158, 11, 0.4); font-size: 11px; font-weight: 700; padding: 2px 8px; border-radius: 4px;">
                🟡 Draft Plan (Pre-Publish)
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
                <span>💡 Drag to move • Hold Alt/Ctrl+Drag to duplicate • Click 🟣/🟡 to toggle confirmation</span>
              </div>
            </div>

            <div class="planned-crews-grid" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(360px, 1fr)); gap: 14px;">
              ${plan.crews.map(crew => this.renderPlannedCrewCard(crew, sTerm, plan, baselineMap, occMap)).join('')}
            </div>
          </div>
        </div>

        <!-- Collapsible Staging Side Pane -->
        <div class="planning-side-pane" style="width: ${this.isSidebarCollapsed ? '44px' : '360px'}; min-width: ${this.isSidebarCollapsed ? '44px' : '360px'}; background: var(--bg-secondary, #1e293b); border-left: 1px solid var(--border-color, rgba(255,255,255,0.1)); display: flex; flex-direction: column; height: 100%; transition: width 0.2s ease, min-width 0.2s ease; box-sizing: border-box; position: relative;">
          ${this.isSidebarCollapsed ? this.renderCollapsedSidePane() : this.renderExpandedSidePane(plan, baselineMap, occMap)}
        </div>

      </div>
    `;

    // Attach interactive drag & drop listeners
    this.attachPlanningDragHandlers(container);
  }

  /**
   * Renders a single planned crew card with member rows and conditional coloring (Purple / Yellow / Normal).
   */
  renderPlannedCrewCard(crew, sTerm = '', plan, baselineMap, occMap) {
    const isMatching = !sTerm ||
      crew.jobNumber.toLowerCase().includes(sTerm) ||
      (crew.location && crew.location.toLowerCase().includes(sTerm)) ||
      (crew.foreman && crew.foreman.toLowerCase().includes(sTerm)) ||
      crew.members.some(m => m.name.toLowerCase().includes(sTerm));

    if (!isMatching) return '';

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

    return `
      <div class="field-crew-card planned-crew-card"
           data-crew-job="${this.escapeHtml(crew.jobNumber)}"
           style="background: rgba(30, 41, 59, 0.7); border: 1px solid rgba(59, 130, 246, 0.35); border-radius: 8px; padding: 12px; display: flex; flex-direction: column; box-shadow: 0 1px 4px rgba(0,0,0,0.25);">
        
        <!-- Crew Header -->
        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 7px; border-bottom: 1px solid rgba(255,255,255,0.08); padding-bottom: 6px;">
          <div>
            <div style="display: flex; align-items: center; gap: 6px; font-weight: 800; font-size: 14px; color: #60a5fa;">
              <span>🚜</span>
              <span>${this.escapeHtml(crew.jobNumber)}</span>
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
          <div style="display: flex; align-items: center; gap: 6px;">
            <button class="btn btn-xs" onclick="window.crewPlanningEngine.promptEditPlannedCrew('${this.escapeJs(crew.jobNumber)}')" style="font-size: 10.5px; font-weight: 700; padding: 2px 7px; background: rgba(59, 130, 246, 0.12); border: 1px solid rgba(59, 130, 246, 0.35); color: #93c5fd; border-radius: 4px; cursor: pointer; display: inline-flex; align-items: center; gap: 4px;" title="Edit planned crew metadata (Location, Job Name, Discipline, Status, Schedule)">
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
              <span style="color: #f472b6; font-weight: 700; display: inline-flex; align-items: center; gap: 4px;">
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
            const isForeman = crew.foreman && m.name.toLowerCase() === crew.foreman.toLowerCase();
            const statusInfo = this.getEmployeePlanningStatus(m.name, crew.jobNumber, null, plan, baselineMap, occMap);

            // Conditional Row Styles
            let rowBg = 'transparent';
            let rowBorder = 'border-bottom: 1px dashed rgba(255,255,255,0.06);';
            let statusBadge = '';

            if (statusInfo.statusColor === 'purple') {
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
                  <span style="font-weight: ${isForeman ? '700' : '500'}; color: ${isForeman ? '#f472b6' : 'inherit'};">
                    ${isForeman ? '👑 ' : ''}${this.escapeHtml(m.name)}
                  </span>
                  ${secondJobPill}
                  ${departureDate ? `
                    <span class="badge"
                          onclick="event.stopPropagation(); window.crewPlanningEngine.editQuitDeparture('${this.escapeJs(m.name)}')"
                          style="background: rgba(239, 68, 68, 0.22); color: #fca5a5; border: 1px solid rgba(239, 68, 68, 0.4); font-size: 9.5px; font-weight: 700; padding: 1px 6px; border-radius: 3px; cursor: pointer; display: inline-flex; align-items: center; gap: 3px;"
                          title="Scheduled Last Working Day: ${this.escapeHtml(departureDate)} (${this.escapeHtml(departureReason)}) — Click to edit">
                      🚪 Last Day: ${this.escapeHtml(departureDate)}
                    </span>
                  ` : ''}
                  ${statusBadge}
                </div>
                <div style="display: flex; align-items: center; gap: 3px; flex-shrink: 0;">
                  <span class="badge" style="background: rgba(255,255,255,0.06); color: #94a3b8; font-size: 9.5px; padding: 1px 5px; border-radius: 3px;">
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
  renderExpandedSidePane(plan, baselineMap, occMap) {
    if (!baselineMap) baselineMap = this.getOriginalEmployeeLocations();
    if (!occMap) occMap = this.getEmployeeOccurrencesMap(plan);

    const sp = plan.sidePane;

    const renderSideList = (title, icon, color, badgeBg, list, typeKey) => {
      return `
        <div class="side-pane-section" data-side-type="${typeKey}" style="margin-bottom: 12px; background: rgba(0,0,0,0.2); border: 1px solid rgba(255,255,255,0.06); border-radius: 6px; overflow: hidden;">
          <div style="display: flex; justify-content: space-between; align-items: center; padding: 6px 10px; background: rgba(255,255,255,0.03); border-bottom: 1px solid rgba(255,255,255,0.06); font-size: 12px; font-weight: 700; color: ${color};">
            <span style="display: flex; align-items: center; gap: 6px;">
              <span>${icon}</span> ${title}
            </span>
            <span class="badge" style="background: ${badgeBg}; color: ${color}; font-size: 10px; padding: 1px 6px; border-radius: 10px;">
              ${list.length}
            </span>
          </div>
          <!-- Drop Zone -->
          <div class="side-drop-zone" data-side-type="${typeKey}" style="min-height: 38px; padding: 4px; display: flex; flex-direction: column; gap: 4px;">
            ${list.length > 0 ? list.map(item => {
              const statusInfo = this.getEmployeePlanningStatus(item.name, null, typeKey, plan, baselineMap, occMap);

              let itemBg = 'background: rgba(255,255,255,0.04);';
              let itemBorder = '';
              let statusBadge = '';

              if (statusInfo.statusColor === 'purple') {
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
                    <span style="font-weight: 600;">${this.escapeHtml(item.name)}</span>
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
                    ` : (item.note || item.dateRange ? `<span style="color: #64748b; font-size: 10px;">(${this.escapeHtml(item.note || item.dateRange)})</span>` : '')}
                    ${statusBadge}
                  </div>
                  <div style="display: flex; align-items: center; gap: 3px;">
                    ${item.currentJob ? `<span style="font-size: 9.5px; color: #94a3b8; font-family: monospace;">${this.escapeHtml(item.currentJob)}</span>` : ''}
                    <button class="btn btn-xs"
                            onclick="window.crewPlanningEngine.promptDuplicateMember('${this.escapeJs(item.name)}', '')"
                            style="background: transparent; border: none; color: #c084fc; font-size: 11px; padding: 0 3px; cursor: pointer;"
                            title="Duplicate">👯</button>
                    <button class="btn btn-xs"
                            onclick="window.crewPlanningEngine.removeMemberFromSideCategory('${this.escapeJs(item.name)}', '${typeKey}')"
                            style="background: transparent; border: none; color: #ef4444; font-size: 11px; padding: 0 3px; cursor: pointer;"
                            title="Remove">✕</button>
                  </div>
                </div>
              `;
            }).join('') : `
              <div style="color: #64748b; font-size: 10.5px; font-style: italic; padding: 6px; text-align: center;">
                Drop here to stage
              </div>
            `}
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

      <!-- Quick Add to Planning Input -->
      <div style="padding: 8px 10px; border-bottom: 1px solid rgba(255,255,255,0.06);">
        <input type="text"
               id="planning-side-search"
               placeholder="Search or add employee to planning..."
               style="width: 100%; box-sizing: border-box; background: rgba(0,0,0,0.3); border: 1px solid rgba(255,255,255,0.1); border-radius: 4px; padding: 5px 8px; color: #fff; font-size: 11.5px; outline: none;"
               oninput="window.crewPlanningEngine.filterSideSearch(this.value)">
      </div>

      <!-- Side Pane Category Lists -->
      <div style="flex: 1; overflow-y: auto; padding: 10px;">
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
    const q = String(query || '').trim().toLowerCase();
    const items = document.querySelectorAll('.side-pane-item');
    items.forEach(el => {
      if (!q) {
        el.style.display = '';
        return;
      }
      const text = el.textContent.toLowerCase();
      el.style.display = text.includes(q) ? '' : 'none';
    });
  }

  /**
   * Renders a read-only historical roster for past reference weeks.
   */
  renderHistoricalWorkspace(container, countBadge, weekStr) {
    if (!container) return;
    const roster = this.getHistoricalRoster(weekStr);

    if (countBadge) {
      countBadge.style.display = 'none';
    }

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
          ${roster.crews && roster.crews.length > 0 ? roster.crews.map(crew => `
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
                👑 Foreman: ${this.escapeHtml(crew.foreman || '—')}
              </div>
              <div style="display: flex; flex-direction: column; gap: 4px;">
                ${crew.members && crew.members.length > 0 ? crew.members.map(m => `
                  <div style="display: flex; justify-content: space-between; font-size: 12px; padding: 3px 4px; border-bottom: 1px dashed rgba(255,255,255,0.04);">
                    <span style="font-family: monospace; font-size: 11px; color: #94a3b8; min-width: 45px;">${this.escapeHtml(m.slot || '—')}</span>
                    <span style="flex: 1; margin-left: 6px; font-weight: 500;">${this.escapeHtml(m.name)}</span>
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

    // 3. Drop target on Planned Crew Cards / Drop Zones (append to end if dropped on card outside rows)
    container.querySelectorAll('.planned-crew-card').forEach(card => {
      const destJob = card.dataset.crewJob;
      if (!destJob) return;

      card.addEventListener('dragover', (e) => {
        e.preventDefault();
        const isCopy = e.altKey || e.ctrlKey || (window._activePlanningDragData && window._activePlanningDragData.isCopy);
        e.dataTransfer.dropEffect = isCopy ? 'copy' : 'move';
        card.style.borderColor = isCopy ? '#c084fc' : '#3b82f6';
        card.style.boxShadow = isCopy ? '0 0 10px rgba(168, 85, 247, 0.4)' : '0 0 10px rgba(59, 130, 246, 0.4)';
      });

      card.addEventListener('dragleave', (e) => {
        if (!card.contains(e.relatedTarget)) {
          card.style.borderColor = '';
          card.style.boxShadow = '';
        }
      });

      card.addEventListener('drop', (e) => {
        e.preventDefault();
        card.style.borderColor = '';
        card.style.boxShadow = '';

        let data = null;
        try {
          data = JSON.parse(e.dataTransfer.getData('application/json'));
        } catch { /* ignore */ }
        if (!data && window._activePlanningDragData) data = window._activePlanningDragData;

        if (data) {
          const isCopy = Boolean(e.altKey || e.ctrlKey || data.isCopy);
          this.handleReorderOrMoveMember(data, destJob, null, 'end', isCopy);
        }
      });
    });

    // 4. Drop target on Side Pane Categories
    container.querySelectorAll('.side-pane-section').forEach(sec => {
      const destSideType = sec.dataset.sideType;
      if (!destSideType) return;

      sec.addEventListener('dragover', (e) => {
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
   * Reorders an employee inside a crew, or moves/copies an employee into a crew at a target position.
   * Always renumbers member slots sequentially (.1, .2, .3, ...) so there are never gaps.
   */
  handleReorderOrMoveMember(dragData, destBaseJob, targetEmpName = null, insertPosition = 'end', isCopy = false) {
    const { empName, fromBaseJob, fromSideType } = dragData;
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

    // Renumber all members in destination crew sequentially (.1, .2, .3, ...)
    destCrew.members.forEach((m, idx) => {
      m.slot = `${destCrew.jobNumber}.${idx + 1}`;
    });

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
    const { empName, fromBaseJob, fromSideType } = dragData;
    const plan = this.getPlanForWeek(this.selectedWeek);
    if (!plan || !plan.sidePane[destSideType]) return;

    if (!isCopy && fromSideType === destSideType) return;

    // RULE: If moving to Quit / Notice, prompt for Last Working Day & departure details first!
    if (destSideType === 'quit') {
      this.promptQuitDeparture(dragData, isCopy);
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
    const { empName, fromBaseJob } = dragData;
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

  promptDuplicateMember(empName, fromBaseJob) {
    const plan = this.getPlanForWeek(this.selectedWeek);
    if (!plan) return;

    const modalId = 'modal-crew-duplicate-member';
    let existing = document.getElementById(modalId);
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = modalId;
    overlay.className = 'modal-overlay active';
    overlay.style.cssText = 'position: fixed; inset: 0; background: rgba(0,0,0,0.75) !important; display: flex; align-items: center; justify-content: center; z-index: 15000 !important; pointer-events: auto !important; padding: 20px;';

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
        </div>
        <div style="padding: 12px 18px; border-top: 1px solid rgba(255,255,255,0.1); background: rgba(0,0,0,0.25); display: flex; justify-content: flex-end; gap: 8px;">
          <button class="btn btn-secondary" id="btn-duplicate-cancel" style="font-size: 12px; padding: 6px 14px; cursor: pointer;">Cancel</button>
          <button class="btn btn-primary" id="btn-duplicate-submit" style="background: linear-gradient(135deg, #a855f7 0%, #7e22ce 100%); border: none; font-size: 12px; font-weight: 700; padding: 6px 16px; cursor: pointer;">
            👯 Duplicate
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    const select = overlay.querySelector('#duplicate-dest-select');
    if (select && firstDifferentValue) {
      select.value = firstDifferentValue;
    }

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
      this.executeDuplicateMember(empName, fromBaseJob, destVal);
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

  executeDuplicateMember(empName, fromBaseJob, destValue) {
    const modalId = 'modal-crew-duplicate-member';
    const m = document.getElementById(modalId);
    if (m) m.remove();

    if (!destValue) return;
    const [destType, destTarget] = destValue.split('::');

    const dragData = {
      empName,
      fromBaseJob: fromBaseJob || '',
      fromSideType: fromBaseJob ? '' : 'planning',
      isCopy: true
    };

    if (destType === 'crew') {
      this.handleMoveToCrew(dragData, destTarget, true);
    } else if (destType === 'side') {
      this.handleMoveToSideCategory(dragData, destTarget, true);
    }

    if (typeof window.showToast === 'function') {
      window.showToast(`👯 Duplicated ${empName} to ${destTarget}. Highlighted in purple.`, 'info');
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
    let confirmKey = '';

    if (baseJobOrSideType) {
      const crew = plan.crews.find(c => c.jobNumber.toLowerCase() === baseJobOrSideType.toLowerCase());
      if (crew) {
        targetMember = crew.members.find(m => m.name.toLowerCase() === norm);
        confirmKey = `${norm}::${baseJobOrSideType.toLowerCase()}`;
      } else if (plan.sidePane && plan.sidePane[baseJobOrSideType]) {
        targetMember = plan.sidePane[baseJobOrSideType].find(m => m.name.toLowerCase() === norm);
        confirmKey = `${norm}::${baseJobOrSideType.toLowerCase()}`;
      }
    }

    if (!targetMember) {
      // Find first matching occurrence in plan
      for (const crew of plan.crews) {
        const found = crew.members.find(m => m.name.toLowerCase() === norm);
        if (found) {
          targetMember = found;
          confirmKey = `${norm}::${crew.jobNumber.toLowerCase()}`;
          break;
        }
      }
    }

    if (targetMember) {
      const newState = !targetMember.isConfirmed;
      targetMember.isConfirmed = newState;
      if (confirmKey) {
        plan.confirmedPositions[confirmKey] = newState;
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
      if (crew.foreman && crew.foreman.toLowerCase() !== currentForeman.toLowerCase()) {
        foremenChanges.push({
          jobNumber: crew.jobNumber,
          oldForeman: currentForeman || 'None',
          newForeman: crew.foreman
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
        if (!liveStat.includes('vacation')) {
          vacations.push({ name: v.name, note: v.note, targetRow: live });
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

    return { transfers, vacations, quits, weeds, foremenChanges, scheduleChanges, newHires, departedOnLive };
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
                          deltas.newHires.length +
                          deltas.foremenChanges.length +
                          (deltas.scheduleChanges ? deltas.scheduleChanges.length : 0));

    const modalId = 'modal-crew-publish-confirm';
    let modal = document.getElementById(modalId);
    if (modal) modal.remove();

    const overlay = document.createElement('div');
    overlay.id = modalId;
    overlay.className = 'modal-overlay active';
    overlay.style.cssText = 'position: fixed; inset: 0; background: rgba(0,0,0,0.75) !important; display: flex; align-items: center; justify-content: center; z-index: 15000 !important; pointer-events: auto !important; padding: 20px;';

    overlay.innerHTML = `
      <div class="modal-box" style="background: var(--bg-secondary, #1e293b); border: 1px solid var(--border-color, rgba(255,255,255,0.15)); border-radius: 10px; max-width: 680px; width: 100%; max-height: 90vh; display: flex; flex-direction: column; box-shadow: 0 10px 30px rgba(0,0,0,0.5); overflow: hidden; color: #fff; pointer-events: auto !important;">
        
        <!-- Modal Header -->
        <div style="padding: 16px 20px; border-bottom: 1px solid rgba(255,255,255,0.1); display: flex; justify-content: space-between; align-items: center;">
          <div style="font-size: 16px; font-weight: 800; color: #34d399; display: flex; align-items: center; gap: 8px;">
            <span>🚀</span> Publish Crew Structure — Week of ${this.escapeHtml(plan.weekDate)}
          </div>
          <button id="btn-publish-close-x" style="background: transparent; border: none; color: #94a3b8; font-size: 18px; cursor: pointer; padding: 4px 8px;">✕</button>
        </div>

        <!-- Modal Body (Delta Review) -->
        <div style="padding: 20px; overflow-y: auto; flex: 1; font-size: 13px;">
          
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
              <div style="font-weight: 700; color: #fbbf24; margin-bottom: 4px;">🏖️ Scheduled Vacation / Status (${deltas.vacations.length + deltas.weeds.length})</div>
              ${deltas.vacations.map(v => `<div style="font-size: 11.5px; color: #cbd5e1;">• 🏖️ <strong>${this.escapeHtml(v.name)}</strong>: Set Status = Vacation</div>`).join('')}
              ${deltas.weeds.map(w => `<div style="font-size: 11.5px; color: #cbd5e1;">• 🌾 <strong>${this.escapeHtml(w.name)}</strong>: Set Status = Weeds</div>`).join('')}
              ${deltas.vacations.length === 0 && deltas.weeds.length === 0 ? '<span style="font-size: 11.5px; color: #64748b;">Zero status changes.</span>' : ''}
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

    overlay.querySelector('#btn-publish-submit')?.addEventListener('click', () => {
      this.executePublish();
    });

    const onKey = (e) => {
      if (e.key === 'Escape') {
        closeModal();
        window.removeEventListener('keydown', onKey);
      }
    };
    window.addEventListener('keydown', onKey);
  }

  async executePublish() {
    const modalId = 'modal-crew-publish-confirm';
    const plan = this.getPlanForWeek(this.selectedWeek);
    if (!plan) return;

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
              'Status': 'Active'
            }
          });

          // Log in Employee History
          if (histTable) {
            const histRow = {
              'Date': todayFormatted,
              'Employee Name': t.name,
              'Event Type': 'Transfer',
              'Job Number': t.toJob,
              'Location': t.destinationLocation || t.targetRow['Location'] || 'Helena',
              'Notes': `Crew Planning Publish: Transferred from ${t.fromJob} to ${t.toJob}`
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
      this.db.snapshot.configs.confirmed_yellow_moves[plan.weekDate] = yellowConfirmedMoves;
      this.db.snapshot.configs.latest_published_yellow_moves = yellowConfirmedMoves;

      // 7. Archive published plan to crew_roster_history
      this.archiveSnapshot(plan.weekDate, {
        publishedAt: new Date().toISOString(),
        publishedBy: 'Crew Structure Planning',
        crews: plan.crews,
        sidePane: plan.sidePane,
        yellowConfirmedMoves: yellowConfirmedMoves
      });

      plan.status = 'published';
      this.savePlan(plan);

      // Dismiss modal
      const m = document.getElementById(modalId);
      if (m) m.remove();

      if (typeof window.showToast === 'function') {
        window.showToast(`✅ Week of ${plan.weekDate} published successfully! Yellow moved highlights carried over.`, 'success');
      }

      // 8. Automatically archive any employees whose last day has arrived to Previous Employees
      await this.checkAndArchiveDepartedEmployees();

      // Return to live Crew Cards view
      if (window.sheetNavigator) {
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
    if (window.sheetNavigator && window.sheetNavigator.currentSheetKey === 'employees') {
      window.sheetNavigator.renderCurrentSheet();
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
      </div>
    `;

    overlay.appendChild(card);
    document.body.appendChild(overlay);

    const closeModal = () => overlay.remove();
    card.querySelector('#change-fm-close-btn').addEventListener('click', closeModal);
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeModal();
    });

    const setForeman = (name) => {
      crew.foreman = String(name || '').trim();
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
        setForeman(btn.getAttribute('data-name'));
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
    const isForeman = crew && crew.foreman && crew.foreman.toLowerCase() === empName.toLowerCase();

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

    // 5. Departure / Notice Options
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
          crew.members = crew.members.filter(m => m.name.toLowerCase() !== empName.toLowerCase());
          crew.members.forEach((m, idx) => {
            m.slot = `${crew.jobNumber}.${idx + 1}`;
          });
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
