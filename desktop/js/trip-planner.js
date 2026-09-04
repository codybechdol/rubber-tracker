/**
 * trip-planner.js - Multi-Week Offline Trip Planner & Route Scheduler
 */

class TripPlannerApp {
  constructor(db) {
    this.db = db;
    this.currentDate = new Date();
    this.weeksToShow = 8;
    this.activeSchedule = 'Mon-Thu'; // 'Mon-Thu' or 'Tue-Fri'
    this.cityFilter = 'active'; // 'active' or 'all'
    this.searchTerm = '';
    this.activeModalCrewId = null;
    this.activeModalCat = 'All';
    this.plannedTrips = {}; // { 'YYYY-MM-DD': { location: 'Bozeman', crew: '013-26' } }

    // Master list of standard Montana service towns, hubs, and subs with distance & drive times from Helena HQ
    this.masterLocations = {
      'Helena': { mins: 0, time: '0m', desc: 'Base HQ (0 mi)', dir: 'Center' },
      'Elliston': { mins: 25, time: '25m', desc: '25m (22 mi)', dir: 'West' },
      'Deer Lodge': { mins: 50, time: '50m', desc: '50m (45 mi)', dir: 'West' },
      'Butte': { mins: 70, time: '1h 10m', desc: '1h 10m (68 mi)', dir: 'South' },
      'Three Forks': { mins: 75, time: '1h 15m', desc: '1h 15m (72 mi)', dir: 'East' },
      'Three Rivers Sub': { mins: 75, time: '1h 15m', desc: '1h 15m (72 mi)', dir: 'East' },
      'Anaconda': { mins: 75, time: '1h 15m', desc: '1h 15m (75 mi)', dir: 'West' },
      'Anaconda City Sub': { mins: 75, time: '1h 15m', desc: '1h 15m (75 mi)', dir: 'West' },
      'Manhattan': { mins: 80, time: '1h 20m', desc: '1h 20m (80 mi)', dir: 'East' },
      'Great Falls': { mins: 85, time: '1h 25m', desc: '1h 25m (89 mi)', dir: 'North' },
      'Belgrade': { mins: 85, time: '1h 25m', desc: '1h 25m (87 mi)', dir: 'East' },
      'Belgrade Dock': { mins: 85, time: '1h 25m', desc: '1h 25m (87 mi)', dir: 'East' },
      'Bozeman': { mins: 95, time: '1h 35m', desc: '1h 35m (98 mi)', dir: 'East' },
      'Glen': { mins: 105, time: '1h 45m', desc: '1h 45m (110 mi)', dir: 'Southwest' },
      'Raynesford Sub': { mins: 105, time: '1h 45m', desc: '1h 45m (115 mi)', dir: 'North' },
      'Ennis': { mins: 105, time: '1h 45m', desc: '1h 45m (105 mi)', dir: 'South' },
      'Missoula': { mins: 105, time: '1h 45m', desc: '1h 45m (114 mi)', dir: 'West' },
      'Dillon': { mins: 115, time: '1h 55m', desc: '1h 55m (120 mi)', dir: 'Southwest' },
      'Lolo': { mins: 115, time: '1h 55m', desc: '1h 55m (120 mi)', dir: 'West' },
      'Livingston': { mins: 120, time: '2h 00m', desc: '2h 00m (125 mi)', dir: 'East' },
      'Stanford': { mins: 120, time: '2h 00m', desc: '2h 00m (135 mi)', dir: 'North' },
      'Big Sky': { mins: 135, time: '2h 15m', desc: '2h 15m (145 mi)', dir: 'East' },
      'Hamilton': { mins: 135, time: '2h 15m', desc: '2h 15m (145 mi)', dir: 'West' },
      'Melville': { mins: 135, time: '2h 15m', desc: '2h 15m (140 mi)', dir: 'East' },
      'Darby': { mins: 165, time: '2h 45m', desc: '2h 45m (175 mi)', dir: 'West' },
      'Laurel': { mins: 190, time: '3h 10m', desc: '3h 10m (215 mi)', dir: 'East' },
      'Kalispell': { mins: 195, time: '3h 15m', desc: '3h 15m (190 mi)', dir: 'Northwest' },
      'Billings': { mins: 200, time: '3h 20m', desc: '3h 20m (230 mi)', dir: 'East' },
      'Post Falls': { mins: 225, time: '3h 45m', desc: '3h 45m (245 mi)', dir: 'West' },
      'Northern Lights': { mins: 270, time: '4h 30m', desc: '4h 30m (280 mi)', dir: 'North' },
      'Miles City': { mins: 290, time: '4h 50m', desc: '4h 50m (340 mi)', dir: 'East' },
      'Glendive': { mins: 390, time: '6h 30m', desc: '6h 30m (450 mi)', dir: 'East' },
      'Sidney': { mins: 435, time: '7h 15m', desc: '7h 15m (500 mi)', dir: 'East' },
      'South Dakota': { mins: 480, time: '8h 00m', desc: '8h 00m (550 mi)', dir: 'Far' },
      'California': { mins: 840, time: '14h 00m', desc: '14h 00m (900 mi)', dir: 'Far' },
      'California Sub': { mins: 840, time: '14h 00m', desc: '14h 00m (900 mi)', dir: 'Far' }
    };
    this.collapsedSections = this.loadCollapsedSections();
    this.selectedClassCrews = [];
    this.selectedClassCrew = '';
    this.selectedClassAttendees = [];
    this._rosterExpanded = {};
  }

  loadCollapsedSections() {
    try {
      return JSON.parse(localStorage.getItem('TRIP_PLANNER_COLLAPSED_SECTIONS') || '{}');
    } catch (e) {
      return {};
    }
  }

  saveCollapsedSections() {
    try {
      localStorage.setItem('TRIP_PLANNER_COLLAPSED_SECTIONS', JSON.stringify(this.collapsedSections || {}));
    } catch (e) {}
  }

  isSectionCollapsed(dateKey, sectionKey) {
    if (!this.collapsedSections) this.collapsedSections = this.loadCollapsedSections();
    return !!this.collapsedSections[`${dateKey}_${sectionKey}`];
  }

  toggleSectionCollapse(dateKey, sectionKey) {
    if (!this.collapsedSections) this.collapsedSections = this.loadCollapsedSections();
    const key = `${dateKey}_${sectionKey}`;
    const willBeCollapsed = !this.collapsedSections[key];
    this.collapsedSections[key] = willBeCollapsed;
    this.saveCollapsedSections();

    // Fast DOM toggle for smooth response without full redraw
    const bodyEl = document.getElementById(`section-body-${dateKey}-${sectionKey}`);
    const chevronEl = document.getElementById(`section-chevron-${dateKey}-${sectionKey}`);
    if (bodyEl && chevronEl) {
      if (willBeCollapsed) {
        bodyEl.style.display = 'none';
        chevronEl.textContent = '▶';
      } else {
        bodyEl.style.display = 'flex';
        chevronEl.textContent = '▼';
      }
    } else {
      this.renderPlanner();
    }
  }

  init() {
    try {
      const savedWeeks = parseInt(localStorage.getItem('sa_trip_planner_weeks'), 10);
      if (savedWeeks && [1, 2, 4, 6, 8, 12].includes(savedWeeks)) {
        this.weeksToShow = savedWeeks;
      }
    } catch (_) {}

    this.loadSavedTrips();
    this.setupSearchListeners();
    this.populateWeekDropdown();
    this.setWeeksToShow(this.weeksToShow || 8);

    if (this.db && typeof this.db.subscribe === 'function') {
      this.db.subscribe(() => {
        this.loadSavedTrips();
        this.renderPlanner();
      });
    }
  }

  setupSearchListeners() {
    const searchInput = document.getElementById('trip-location-search');
    if (searchInput && !searchInput.dataset.bound) {
      searchInput.dataset.bound = 'true';
      searchInput.addEventListener('input', (e) => {
        this.searchTerm = (e.target.value || '').toLowerCase().trim();
        this.renderAvailableLocations();
      });
    }
  }

  loadSavedTrips() {
    this.plannedTrips = this.db.getPlannedTrips() || {};
    this.holidaysMap = this.loadHolidays();
    this.manualTasks = this.loadManualTasks();
    try {
      const savedSchedule = localStorage.getItem('sa_work_schedule');
      if (savedSchedule) {
        this.activeSchedule = savedSchedule;
      } else {
        const snap = this.db.getSnapshot();
        this.activeSchedule = (snap && snap.configs && snap.configs.workSchedule) || 'Mon-Thu';
      }
    } catch (e) {
      this.activeSchedule = 'Mon-Thu';
    }
  }

  loadHolidays() {
    try {
      const raw = localStorage.getItem('sa_holidays');
      if (raw) return JSON.parse(raw);
    } catch (e) {}

    // Default US / Company holidays
    return {
      '2026-01-01': "New Year's Day",
      '2026-05-25': "Memorial Day",
      '2026-07-03': "Independence Day (Observed)",
      '2026-07-04': "Independence Day",
      '2026-09-07': "Labor Day",
      '2026-11-26': "Thanksgiving Day",
      '2026-11-27': "Day After Thanksgiving",
      '2026-12-24': "Christmas Eve",
      '2026-12-25': "Christmas Day"
    };
  }

  saveHolidays(holidays) {
    this.holidaysMap = holidays;
    try {
      localStorage.setItem('sa_holidays', JSON.stringify(holidays));
      const snap = this.db.getSnapshot();
      if (snap) {
        if (!snap.configs) snap.configs = {};
        snap.configs.holidays = holidays;
      }
      this.db.addMutation({
        action: 'SET_HOLIDAYS',
        holidays: holidays
      });
    } catch (e) {}
  }

  isDayHoliday(dateKey) {
    if (!this.holidaysMap) this.holidaysMap = this.loadHolidays();
    return !!this.holidaysMap[dateKey];
  }

  getHolidayName(dateKey) {
    if (!this.holidaysMap) this.holidaysMap = this.loadHolidays();
    return this.holidaysMap[dateKey] || 'Holiday';
  }

  toggleHoliday(dateKey, name = 'Holiday') {
    if (!this.holidaysMap) this.holidaysMap = this.loadHolidays();
    if (this.holidaysMap[dateKey]) {
      delete this.holidaysMap[dateKey];
    } else {
      this.holidaysMap[dateKey] = name;
    }
    this.saveHolidays(this.holidaysMap);
    this.renderPlanner();
  }

  toggleWorkSchedule() {
    this.activeSchedule = this.activeSchedule === 'Mon-Thu' ? 'Tue-Fri' : 'Mon-Thu';
    try {
      localStorage.setItem('sa_work_schedule', this.activeSchedule);
      const snap = this.db.getSnapshot();
      if (snap) {
        if (!snap.configs) snap.configs = {};
        snap.configs.workSchedule = this.activeSchedule;
      }
      this.db.addMutation({
        action: 'SET_TRIP_SCHEDULE',
        schedule: this.activeSchedule
      });
    } catch (e) {}
    this.renderPlanner();
  }

  loadManualTasks() {
    const tasks = this.db.getManualTasks() || [];
    let modified = false;
    tasks.forEach(t => {
      if (t.certType) {
        const norm = this.normalizeCertClassName(t.certType);
        if (norm !== t.certType) {
          t.certType = norm;
          if (t.title && (t.title.includes('(3-Yr)') || t.title.includes('(2-Yr)') || t.title.includes('(Annual)'))) {
            t.title = norm;
          }
          modified = true;
        }
      }
      if (!t.date && t.dateKey) {
        t.date = t.dateKey;
        modified = true;
      }
      if (!t.dateKey && t.date) {
        t.dateKey = t.date;
        modified = true;
      }
      if (t.time) {
        // Auto-fix start AM typo if end is PM and start hour is 1..6 (e.g. "2:00 am / 4:30 pm" -> "2:00 pm / 4:30 pm")
        const typoFix = t.time.replace(/^([0-9]{1,2}(?::[0-9]{2})?)\s*am(\s*[\/\-–—]\s*[0-9]{1,2}(?::[0-9]{2})?\s*pm)/i, (match, p1, p2) => {
          const h = parseInt(p1.split(':')[0], 10);
          if (h >= 1 && h <= 6) {
            return `${p1} pm${p2}`;
          }
          return match;
        });
        if (typoFix !== t.time) {
          t.time = typoFix;
          modified = true;
        }
      }
    });
    if (modified) {
      this.db.saveManualTasks(tasks);
    }
    return tasks;
  }

  saveManualTasks(tasks) {
    this.manualTasks = tasks || this.manualTasks || [];
    this.db.saveManualTasks(this.manualTasks);
  }

  /**
   * Parses various human-entered time formats (e.g. "8:00 AM", "2:00 pm / 4:30 pm", "8am-10:30am", "Morning")
   * into minutes from midnight (0 - 1439) for accurate chronological sorting.
   */
  parseTimeToMinutes(timeStr) {
    if (!timeStr || typeof timeStr !== 'string') return null;
    const clean = timeStr.trim().toLowerCase();
    if (!clean) return null;

    if (clean === 'morning') return 8 * 60;
    if (clean === 'noon' || clean === 'midday') return 12 * 60;
    if (clean === 'afternoon') return 13 * 60;
    if (clean === 'evening') return 17 * 60;

    const rangeMatch = clean.match(/^([0-9]{1,2}(?::[0-9]{2})?\s*(?:am|pm|a|p)?)\s*(?:[\/\-–—]|to)\s*([0-9]{1,2}(?::[0-9]{2})?\s*(?:am|pm|a|p)?)/i);
    let startPart = clean;
    let endPart = null;

    if (rangeMatch) {
      startPart = rangeMatch[1].trim();
      endPart = rangeMatch[2].trim();
    }

    const parseToken = (token) => {
      if (!token) return null;
      const m = token.match(/^([0-9]{1,2})(?::([0-9]{2}))?\s*(am|pm|a|p)?$/i);
      if (!m) return null;
      let hours = parseInt(m[1], 10);
      const mins = m[2] ? parseInt(m[2], 10) : 0;
      const modifier = m[3] ? m[3].toLowerCase() : null;
      return { hours, mins, modifier };
    };

    let startParsed = parseToken(startPart);
    if (!startParsed) {
      const fallbackM = clean.match(/([0-9]{1,2})(?::([0-9]{2}))?\s*(am|pm|a|p)?/i);
      if (fallbackM) {
        startParsed = {
          hours: parseInt(fallbackM[1], 10),
          mins: fallbackM[2] ? parseInt(fallbackM[2], 10) : 0,
          modifier: fallbackM[3] ? fallbackM[3].toLowerCase() : null
        };
      } else {
        return null;
      }
    }

    const endParsed = endPart ? parseToken(endPart) : null;
    let { hours, mins, modifier } = startParsed;

    const isPmMod = (mod) => mod === 'pm' || mod === 'p';
    const isAmMod = (mod) => mod === 'am' || mod === 'a';

    // Heuristic 1: If start has no AM/PM, but end time has AM/PM
    if (!modifier && endParsed && endParsed.modifier) {
      if (isPmMod(endParsed.modifier)) {
        if (hours <= endParsed.hours || hours === 12) {
          modifier = 'pm';
        } else if (hours >= 7 && hours <= 11) {
          modifier = 'am';
        } else {
          modifier = 'pm';
        }
      } else if (isAmMod(endParsed.modifier)) {
        modifier = 'am';
      }
    }

    // Heuristic 2: Auto-correct start AM typo if end is PM and start hour is 1..6 (e.g. "2:00 am / 4:30 pm" -> 2:00 PM)
    if (modifier && isAmMod(modifier) && endParsed && isPmMod(endParsed.modifier)) {
      if (hours >= 1 && hours <= 6 && endParsed.hours >= hours) {
        modifier = 'pm';
      }
    }

    // Heuristic 3: Workday hours heuristic if no modifier specified
    if (!modifier) {
      if (hours >= 1 && hours <= 6) {
        modifier = 'pm';
      } else if (hours >= 7 && hours <= 11) {
        modifier = 'am';
      } else if (hours === 12) {
        modifier = 'pm';
      }
    }

    // 24-hour normalization
    if (isPmMod(modifier)) {
      if (hours < 12) hours += 12;
    } else if (isAmMod(modifier)) {
      if (hours === 12) hours = 0;
    }

    return hours * 60 + mins;
  }

  /**
   * Compares two human-entered time strings chronologically
   */
  compareTimes(timeAStr, timeBStr) {
    const minA = this.parseTimeToMinutes(timeAStr);
    const minB = this.parseTimeToMinutes(timeBStr);
    if (minA !== null && minB !== null) {
      if (minA !== minB) return minA - minB;
    } else if (minA !== null) {
      return -1; // timed tasks come before untimed
    } else if (minB !== null) {
      return 1;
    }
    return (timeAStr || '').localeCompare(timeBStr || '');
  }

  /**
   * Compares two manual tasks (training classes or office tasks) for chronological ordering on the same day
   */
  compareTasksByTime(a, b) {
    const timeComp = this.compareTimes(a.time, b.time);
    if (timeComp !== 0) return timeComp;

    // Custom orderSeq tie-breaker if user manually moved up/down
    if (a.orderSeq !== undefined && b.orderSeq !== undefined && a.orderSeq !== b.orderSeq) {
      return a.orderSeq - b.orderSeq;
    }

    // Pending tasks before Complete tasks
    const aDone = a.status === 'Complete';
    const bDone = b.status === 'Complete';
    if (aDone !== bDone) return aDone ? 1 : -1;

    // Tie-breaker: createdAt or title
    if (a.createdAt && b.createdAt && a.createdAt !== b.createdAt) {
      return a.createdAt.localeCompare(b.createdAt);
    }
    return (a.title || a.certType || '').localeCompare(b.title || b.certType || '');
  }

  /**
   * Compares tasks by date, then chronologically by time
   */
  compareTasksByDateAndTime(a, b) {
    const dateA = a.date || a.dateKey || '';
    const dateB = b.date || b.dateKey || '';
    if (dateA !== dateB) return dateA.localeCompare(dateB);
    return this.compareTasksByTime(a, b);
  }

  /**
   * Moves a task up (-1) or down (+1) in the visual list.
   * If both tasks have scheduled times, swaps their times; otherwise swaps their orderSeq.
   */
  moveManualTask(taskId, direction) {
    if (!this.manualTasks) this.manualTasks = this.loadManualTasks();
    const task = this.manualTasks.find(t => t.id === taskId);
    if (!task) return;

    const dateKey = task.dateKey || task.date;
    const isCert = (task.taskCategory === 'cert_class' || !!task.certType);

    // Get all tasks for this date and category sorted by current display order
    const dateTasks = this.manualTasks
      .filter(t => (t.dateKey === dateKey || t.date === dateKey) && (isCert ? (t.taskCategory === 'cert_class' || !!t.certType) : (t.taskCategory === 'personal_task' && !t.certType)))
      .sort((a, b) => this.compareTasksByTime(a, b));

    const currentIdx = dateTasks.findIndex(t => t.id === taskId);
    if (currentIdx === -1) return;

    const targetIdx = currentIdx + direction;
    if (targetIdx < 0 || targetIdx >= dateTasks.length) return;

    const targetTask = dateTasks[targetIdx];

    // If both tasks have different times, swap their scheduled times
    if (task.time && targetTask.time && task.time !== targetTask.time) {
      const tempTime = task.time;
      task.time = targetTask.time;
      targetTask.time = tempTime;
    } else {
      // Otherwise adjust orderSeq
      if (task.orderSeq === undefined) task.orderSeq = currentIdx;
      if (targetTask.orderSeq === undefined) targetTask.orderSeq = targetIdx;
      const tempSeq = task.orderSeq;
      task.orderSeq = targetTask.orderSeq;
      targetTask.orderSeq = tempSeq;
      if (task.orderSeq === targetTask.orderSeq) {
        task.orderSeq += direction;
      }
    }

    this.saveManualTasks(this.manualTasks);
    this.renderPlanner();
  }

  normalizeCertClassName(name) {
    if (!name) return '';
    const s = String(name).trim();
    const map = {
      'OSHA Trench Competent Person (3-Yr)': 'OSHA Trench Competent Person',
      'OSHA Trench Comp Person': 'OSHA Trench Competent Person',
      'Rigging & Signaling / Signalperson (3-Yr)': 'Rigging & Signaling / Signalperson',
      'Rigging & Signaling/Signalperson & Spotter Cert': 'Rigging & Signaling / Signalperson',
      'CPR / AED (2-Yr)': 'CPR / AED',
      '1st Aid / First Aid (2-Yr)': '1st Aid / First Aid',
      'CPR & 1st Aid Combo (2-Yr)': 'CPR / AED & 1st Aid Combo',
      'Pole Top Rescue (Annual)': 'Pole Top Rescue',
      'Bucket Truck Rescue (Annual)': 'Bucket Truck Rescue',
      'Forklift Operator Safety Training (3-Yr)': 'Forklift Operator Safety Training',
      'Forklift (3-Yr)': 'Forklift Certification',
      'Dig Safe / 811 Excavation (2-Yr)': 'Dig Safe (811)',
      'Harassment & Workplace Safety (Annual)': 'Harassment Training'
    };
    return map[s] || s;
  }

  getAvailableCertTypes() {
    const certsList = [];

    const addCert = (lbl) => {
      const clean = String(lbl || '').trim();
      if (!clean) return;
      if (!certsList.includes(clean)) {
        certsList.push(clean);
      }
    };

    // 1. Primary Source: Exact certifications configured in Certification Requirements & Job Role Matrix
    if (window.certsConfigEngine && Array.isArray(window.certsConfigEngine.certs) && window.certsConfigEngine.certs.length > 0) {
      window.certsConfigEngine.certs.forEach(c => {
        // Exclude driver-specific credentials from training class list as they are individual driver credentials
        if (c.key === 'DL' || c.key === 'MEC Expiration') return;
        const label = c.label || c.name || c.key;
        addCert(label);
      });
    } else {
      try {
        const raw = localStorage.getItem('sa_certs_config');
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed) && parsed.length > 0) {
            parsed.forEach(c => {
              if (c.key === 'DL' || c.key === 'MEC Expiration') return;
              addCert(c.label || c.name || c.key);
            });
          }
        }
      } catch (e) {}
    }

    // 2. Fallback canonical list strictly matching Certification Requirements & Job Role Matrix
    if (certsList.length === 0) {
      [
        'CPR / AED',
        '1st Aid / First Aid',
        'Pole Top Rescue',
        'OSHA 1910',
        'OSHA Trench Competent Person',
        'Forklift Certification',
        'Forklift Operator Safety Training',
        'Rigging & Signaling / Signalperson',
        'Crane Certification',
        'Crane Evaluation',
        'Dig Safe (811)',
        'Harassment Training',
        'BNSF Rail Safety',
        'MSHA Mine Safety',
        'NECA Helicopter Safety'
      ].forEach(addCert);
    }

    return certsList;
  }

  getEmployeeOptions() {
    const empTable = this.db.getTable('employees');
    if (!empTable || !empTable.rows) return [];

    return empTable.rows
      .map(r => {
        const name = String(r['Name'] || r['Employee Name'] || r['Employee'] || '').trim();
        const role = String(r['Job Classification'] || r['Role'] || r['Title'] || '').trim();
        const crew = String(r['Job Number'] || r['Crew'] || '').trim();
        const status = String(r['Status'] || '').trim().toLowerCase();
        if (!name || status === 'terminated' || status === 'previous employee') return null;
        return {
          name: name,
          role: role,
          crew: crew,
          display: role ? `${name} (${role}${crew ? ' · Crew ' + crew : ''})` : name
        };
      })
      .filter(Boolean)
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  escapeJs(str) {
    if (!str) return '';
    return String(str).replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '\\"');
  }

  setupManualTaskAutocomplete() {
    if (this._manualTaskClickOutsideBound) return;
    this._manualTaskClickOutsideBound = true;

    document.addEventListener('mousedown', (e) => {
      const empInput = document.getElementById('manual-task-employee-input');
      const empDropdown = document.getElementById('manual-task-employee-dropdown');
      if (empDropdown && empDropdown.style.display !== 'none') {
        if (!empDropdown.contains(e.target) && e.target !== empInput) {
          empDropdown.style.display = 'none';
        }
      }

      const crewInput = document.getElementById('manual-task-crew-input');
      const crewDropdown = document.getElementById('manual-task-crew-dropdown');
      if (crewDropdown && crewDropdown.style.display !== 'none') {
        if (!crewDropdown.contains(e.target) && e.target !== crewInput) {
          crewDropdown.style.display = 'none';
        }
      }

      const certInput = document.getElementById('manual-task-cert-type-input');
      const certDropdown = document.getElementById('manual-task-cert-dropdown');
      if (certDropdown && certDropdown.style.display !== 'none') {
        if (!certDropdown.contains(e.target) && e.target !== certInput) {
          certDropdown.style.display = 'none';
        }
      }
    });
  }

  showEmployeeDropdown() {
    this.setupManualTaskAutocomplete();
    const input = document.getElementById('manual-task-employee-input');
    this.filterEmployeeDropdown(input ? input.value : '');
  }

  filterEmployeeDropdown(query = '') {
    const dropdown = document.getElementById('manual-task-employee-dropdown');
    if (!dropdown) return;

    const emps = this.getEmployeeOptions();
    const q = String(query || '').trim().toLowerCase();

    const filtered = q
      ? emps.filter(e => e.name.toLowerCase().includes(q) || e.role.toLowerCase().includes(q) || e.crew.toLowerCase().includes(q))
      : emps;

    this.highlightedEmpIdx = -1;

    if (filtered.length === 0) {
      dropdown.innerHTML = `
        <div style="padding: 10px 14px; font-size: 12px; color: var(--text-muted); text-align: center;">
          No matching employees. Enter custom: "<strong>${this.escapeHtml(query)}</strong>"
          <div style="margin-top: 6px;">
            <button type="button" class="btn btn-secondary" style="padding: 2px 8px; font-size: 11px; color: #60a5fa;" onmousedown="window.tripPlanner.addClassAttendee('${this.escapeJs(query)}');">
              + Add "${this.escapeHtml(query)}"
            </button>
          </div>
        </div>
      `;
      dropdown.style.display = 'block';
      return;
    }

    dropdown.innerHTML = filtered.map((e, idx) => `
      <div class="emp-dropdown-item" data-idx="${idx}" data-name="${this.escapeHtml(e.name)}" style="padding: 8px 12px; display: flex; align-items: center; justify-content: space-between; gap: 8px; cursor: pointer; border-bottom: 1px solid rgba(255,255,255,0.05); transition: background 0.15s ease;" onmouseenter="window.tripPlanner.setHighlightedEmp(${idx});" onmousedown="window.tripPlanner.selectEmployee(this.getAttribute('data-name'));">
        <div style="font-size: 12.5px; font-weight: 700; color: #f8fafc; display: flex; align-items: center; gap: 6px;">
          <span>👤</span>
          <span>${this.escapeHtml(e.name)}</span>
        </div>
        <div style="display: flex; align-items: center; gap: 4px;">
          ${e.role ? `<span class="badge" style="background: rgba(59, 130, 246, 0.15); color: #93c5fd; font-size: 9.5px; padding: 1px 5px; border-radius: 3px;">${this.escapeHtml(e.role)}</span>` : ''}
          ${e.crew ? `<span class="badge" style="background: rgba(255,255,255,0.06); color: #cbd5e1; font-size: 9.5px; padding: 1px 4px; border-radius: 3px;">Crew ${this.escapeHtml(e.crew)}</span>` : ''}
        </div>
      </div>
    `).join('');

    dropdown.style.display = 'block';
  }

  setHighlightedEmp(idx) {
    this.highlightedEmpIdx = idx;
    const dropdown = document.getElementById('manual-task-employee-dropdown');
    if (!dropdown) return;
    const items = dropdown.querySelectorAll('.emp-dropdown-item');
    items.forEach((item, i) => {
      if (i === idx) {
        item.style.backgroundColor = 'rgba(59, 130, 246, 0.25)';
        item.scrollIntoView({ block: 'nearest' });
      } else {
        item.style.backgroundColor = '';
      }
    });
  }

  handleEmployeeKeydown(e) {
    const dropdown = document.getElementById('manual-task-employee-dropdown');
    if (!dropdown || dropdown.style.display === 'none') {
      if (e.key === 'ArrowDown') {
        this.showEmployeeDropdown();
        e.preventDefault();
      } else if (e.key === 'Enter') {
        const input = document.getElementById('manual-task-employee-input');
        if (input && input.value.trim()) {
          this.addClassAttendee(input.value.trim());
          e.preventDefault();
        } else {
          this.saveManualTaskFromModal();
        }
      }
      return;
    }

    const items = dropdown.querySelectorAll('.emp-dropdown-item');
    if (items.length === 0) {
      if (e.key === 'Enter') {
        const input = document.getElementById('manual-task-employee-input');
        if (input && input.value.trim()) {
          this.addClassAttendee(input.value.trim());
          e.preventDefault();
        } else {
          this.saveManualTaskFromModal();
        }
      }
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      let nextIdx = (this.highlightedEmpIdx !== undefined ? this.highlightedEmpIdx : -1) + 1;
      if (nextIdx >= items.length) nextIdx = 0;
      this.setHighlightedEmp(nextIdx);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      let prevIdx = (this.highlightedEmpIdx !== undefined ? this.highlightedEmpIdx : 0) - 1;
      if (prevIdx < 0) prevIdx = items.length - 1;
      this.setHighlightedEmp(prevIdx);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (this.highlightedEmpIdx >= 0 && this.highlightedEmpIdx < items.length) {
        const name = items[this.highlightedEmpIdx].getAttribute('data-name');
        if (name) this.selectEmployee(name);
      } else {
        const input = document.getElementById('manual-task-employee-input');
        if (input && input.value.trim()) {
          this.addClassAttendee(input.value.trim());
        } else {
          this.hideEmployeeDropdown();
        }
      }
    } else if (e.key === 'Escape') {
      this.hideEmployeeDropdown();
    }
  }

  selectEmployee(name) {
    this.addClassAttendee(name);
  }

  hideEmployeeDropdown() {
    const dropdown = document.getElementById('manual-task-employee-dropdown');
    if (dropdown) dropdown.style.display = 'none';
    this.highlightedEmpIdx = -1;
  }

  /* ==================== CREW & ATTENDEE CLASS MANAGEMENT ==================== */

  getActiveCrewOptions() {
    const jobTable = this.db.getTable('job_tracking');
    const crews = [];
    const seen = new Set();

    if (jobTable && jobTable.rows) {
      jobTable.rows.forEach(r => {
        const rawCrewId = String(r['Job Number'] || r['Crew'] || r['Job #'] || '').trim();
        const crewId = this.getSignificantJobNumber(rawCrewId);
        const foreman = String(r['Foreman'] || r['Crew Lead'] || r['Lead'] || '').trim();
        const loc = this.cleanPhysicalLocation(String(r['Location'] || '').trim());
        const jobName = String(r['Job Name'] || '').trim();
        const status = String(r['Status'] || r['Job Status'] || '').trim().toLowerCase();

        if (!crewId || seen.has(crewId)) return;
        if (crewId.startsWith('002') || crewId.startsWith('005')) return;
        if (status.includes('completed') || status.includes('on hold')) return;

        seen.add(crewId);
        crews.push({
          crewId,
          foreman: foreman || 'Lead',
          location: loc || 'Helena',
          jobName,
          display: `Crew ${crewId} — ${foreman || 'Lead'}${loc ? ` (${loc})` : ''}`
        });
      });
    }

    const empTable = this.db.getTable('employees');
    if (empTable && empTable.rows) {
      empTable.rows.forEach(r => {
        const rawCrewId = String(r['Job Number'] || r['Crew'] || '').trim();
        const crewId = this.getSignificantJobNumber(rawCrewId);
        if (!crewId || seen.has(crewId)) return;
        if (crewId.startsWith('002') || crewId.startsWith('005')) return;
        seen.add(crewId);
        crews.push({
          crewId,
          foreman: 'Lead',
          location: 'Helena',
          jobName: '',
          display: `Crew ${crewId}`
        });
      });
    }

    return crews.sort((a, b) => a.crewId.localeCompare(b.crewId));
  }

  getCrewMembers(crewId) {
    if (!crewId) return [];
    const cleanId = this.getSignificantJobNumber(String(crewId).trim()).toLowerCase();
    const empTable = this.db.getTable('employees');
    if (!empTable || !empTable.rows) return [];

    // Also check job_tracking to see if a foreman is known for this crew
    let trackingForeman = '';
    const jobTable = this.db.getTable('job_tracking');
    if (jobTable && jobTable.rows) {
      const jRow = jobTable.rows.find(r => {
        const jNum = this.getSignificantJobNumber(String(r['Job Number'] || r['Crew'] || r['Job #'] || ''));
        return jNum.toLowerCase() === cleanId;
      });
      if (jRow) {
        trackingForeman = String(jRow['Foreman'] || jRow['Crew Lead'] || jRow['Lead'] || '').trim();
      }
    }

    const members = [];
    empTable.rows.forEach(r => {
      const status = String(r['Status'] || '').trim().toLowerCase();
      if (status === 'terminated' || status === 'previous employee') return;
      const rawJob = String(r['Job Number'] || r['Crew'] || '').trim();
      const rawSecJob = String(r['Secondary Job Number'] || r['Secondary Job #'] || '').trim();
      const jobNum = this.getSignificantJobNumber(rawJob).toLowerCase();
      const secJobNum = this.getSignificantJobNumber(rawSecJob).toLowerCase();

      const name = String(r['Employee Name'] || r['Name'] || r['Employee'] || '').trim();
      const role = String(r['Job Classification'] || r['Role'] || r['Title'] || '').trim();
      if (!name) return;

      const isMatch = (jobNum === cleanId) || (secJobNum === cleanId) || (trackingForeman && name.toLowerCase() === trackingForeman.toLowerCase());

      if (isMatch && !members.some(m => m.name.toLowerCase() === name.toLowerCase())) {
        const isF = role === 'F' || role === 'GF' || role === 'SUP' || (trackingForeman && name.toLowerCase() === trackingForeman.toLowerCase()) || String(r['Crew Lead'] || '').toLowerCase() === 'yes';
        members.push({
          name,
          role: role || (isF ? 'Foreman' : 'Lineman'),
          isForeman: isF
        });
      }
    });

    return members.sort((a, b) => {
      if (a.isForeman && !b.isForeman) return -1;
      if (!a.isForeman && b.isForeman) return 1;
      return a.name.localeCompare(b.name);
    });
  }

  resolveClassAttendees(task) {
    const result = {
      crews: [],
      crewIds: [],
      crewMembers: [],
      individualMembers: [],
      allAttendees: [],
      totalCount: 0,
      crewId: '',
      foreman: '',
      foremanEmails: [],
      allEmails: []
    };

    const empTable = this.db.getTable('employees');
    const empRows = (empTable && empTable.rows) ? empTable.rows : [];
    const jobTable = this.db.getTable('job_tracking');
    const jobRows = (jobTable && jobTable.rows) ? jobTable.rows : [];

    const findEmp = (name) => {
      const clean = String(name || '').trim().toLowerCase();
      return empRows.find(r => {
        const n = String(r['Name'] || r['Employee Name'] || r['Employee'] || '').trim().toLowerCase();
        return n === clean;
      });
    };

    const getEmpEmail = (empRow) => {
      if (!empRow) return '';
      return String(empRow['Email Address'] || empRow['Email'] || empRow['MP Email'] || empRow['Notification Emails'] || '').trim();
    };

    // Extract all crew IDs (supports crewIds array or legacy comma-separated crewId)
    const rawCrews = Array.isArray(task.crewIds) && task.crewIds.length > 0
      ? task.crewIds
      : (task.crewId ? String(task.crewId).split(',').map(s => s.trim()).filter(Boolean) : []);

    const allAttendeesMap = new Map();

    rawCrews.forEach(rawId => {
      const crewId = this.getSignificantJobNumber(rawId);
      if (!crewId) return;
      if (!result.crewIds.includes(crewId)) result.crewIds.push(crewId);

      let foreman = '';
      const jobRow = jobRows.find(r => {
        const jNum = this.getSignificantJobNumber(String(r['Job Number'] || r['Crew'] || r['Job #'] || ''));
        return jNum.toLowerCase() === crewId.toLowerCase();
      });
      if (jobRow) {
        foreman = String(jobRow['Foreman'] || jobRow['Crew Lead'] || jobRow['Lead'] || '').trim();
      }

      const members = this.getCrewMembers(crewId);
      members.forEach(m => {
        if (m.isForeman && !foreman) foreman = m.name;
        const empR = findEmp(m.name);
        const email = getEmpEmail(empR);
        m.email = email;
        if (!allAttendeesMap.has(m.name.toLowerCase())) {
          allAttendeesMap.set(m.name.toLowerCase(), { name: m.name, role: m.role, isForeman: m.isForeman, crewId: crewId, email: email });
        }
      });

      let fEmail = '';
      if (foreman) {
        const fRow = findEmp(foreman);
        fEmail = getEmpEmail(fRow);
        if (fEmail && !result.foremanEmails.includes(fEmail)) {
          result.foremanEmails.push(fEmail);
        }
      }

      if (foreman && !allAttendeesMap.has(foreman.toLowerCase())) {
        allAttendeesMap.set(foreman.toLowerCase(), { name: foreman, role: 'Foreman', isForeman: true, crewId: crewId, email: fEmail });
      }

      result.crews.push({
        crewId,
        foreman,
        foremanEmail: fEmail,
        members
      });
    });

    // Populate crewMembers from all deduplicated crew attendees
    allAttendeesMap.forEach(item => {
      result.crewMembers.push(item);
      result.allAttendees.push(item.name);
      if (item.email && !result.allEmails.includes(item.email)) {
        result.allEmails.push(item.email);
      }
      if (item.isForeman && item.email && !result.foremanEmails.includes(item.email)) {
        result.foremanEmails.push(item.email);
      }
    });

    // Individual attendees
    const indList = Array.isArray(task.assignedEmployees)
      ? task.assignedEmployees
      : (task.employee && !task.employee.startsWith('Crew ') ? [task.employee] : []);

    indList.forEach(name => {
      const cleanName = String(name || '').trim();
      if (cleanName && !allAttendeesMap.has(cleanName.toLowerCase())) {
        const r = findEmp(cleanName);
        const role = r ? String(r['Job Classification'] || r['Role'] || r['Title'] || '').trim() : '';
        const email = getEmpEmail(r);
        result.individualMembers.push({ name: cleanName, role, email });
        result.allAttendees.push(cleanName);
        if (email && !result.allEmails.includes(email)) {
          result.allEmails.push(email);
        }
      }
    });

    result.totalCount = result.allAttendees.length;
    result.crewId = result.crewIds.join(', ');
    result.foreman = result.crews.length > 0 ? result.crews[0].foreman : '';
    return result;
  }

  showCrewDropdown() {
    this.setupManualTaskAutocomplete();
    const input = document.getElementById('manual-task-crew-input');
    this.filterCrewDropdown(input ? input.value : '');
  }

  filterCrewDropdown(query = '') {
    const dropdown = document.getElementById('manual-task-crew-dropdown');
    if (!dropdown) return;

    const crews = this.getActiveCrewOptions();
    const q = String(query || '').trim().toLowerCase();

    const filtered = q
      ? crews.filter(c => c.crewId.toLowerCase().includes(q) || c.foreman.toLowerCase().includes(q) || c.location.toLowerCase().includes(q) || c.jobName.toLowerCase().includes(q))
      : crews;

    this.highlightedCrewIdx = -1;

    if (filtered.length === 0) {
      dropdown.innerHTML = `
        <div style="padding: 10px 14px; font-size: 12px; color: var(--text-muted); text-align: center;">
          No matching active crews.
          <div style="margin-top: 6px;">
            <button type="button" class="btn btn-secondary" style="padding: 3px 8px; font-size: 11px; color: #60a5fa;" onmousedown="window.tripPlanner.selectClassCrew('${this.escapeJs(query)}');">
              ✓ Assign Job #${this.escapeHtml(query)}
            </button>
          </div>
        </div>
      `;
      dropdown.style.display = 'block';
      return;
    }

    dropdown.innerHTML = filtered.map((c, idx) => `
      <div class="crew-dropdown-item" data-idx="${idx}" data-crew="${this.escapeHtml(c.crewId)}" style="padding: 8px 12px; display: flex; align-items: center; justify-content: space-between; gap: 8px; cursor: pointer; border-bottom: 1px solid rgba(255,255,255,0.05); transition: background 0.15s ease;" onmouseenter="window.tripPlanner.setHighlightedCrew(${idx});" onmousedown="window.tripPlanner.selectClassCrew(this.getAttribute('data-crew'));">
        <div style="font-size: 12px; font-weight: 700; color: #f8fafc; display: flex; align-items: center; gap: 6px;">
          <span>🚚</span>
          <span style="color: #60a5fa;">Crew ${this.escapeHtml(c.crewId)}</span>
          <span style="color: #cbd5e1; font-weight: normal;">— ${this.escapeHtml(c.foreman)}</span>
        </div>
        <div style="display: flex; align-items: center; gap: 4px;">
          ${c.location ? `<span class="badge" style="background: rgba(255,255,255,0.06); color: #94a3b8; font-size: 9.5px; padding: 1px 4px; border-radius: 3px;">📍 ${this.escapeHtml(c.location)}</span>` : ''}
        </div>
      </div>
    `).join('');

    dropdown.style.display = 'block';
  }

  setHighlightedCrew(idx) {
    this.highlightedCrewIdx = idx;
    const dropdown = document.getElementById('manual-task-crew-dropdown');
    if (!dropdown) return;
    const items = dropdown.querySelectorAll('.crew-dropdown-item');
    items.forEach((item, i) => {
      if (i === idx) {
        item.style.backgroundColor = 'rgba(59, 130, 246, 0.25)';
        item.scrollIntoView({ block: 'nearest' });
      } else {
        item.style.backgroundColor = '';
      }
    });
  }

  handleCrewKeydown(e) {
    const dropdown = document.getElementById('manual-task-crew-dropdown');
    if (!dropdown || dropdown.style.display === 'none') {
      if (e.key === 'ArrowDown') {
        this.showCrewDropdown();
        e.preventDefault();
      }
      return;
    }

    const items = dropdown.querySelectorAll('.crew-dropdown-item');
    if (items.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      let next = (this.highlightedCrewIdx !== undefined ? this.highlightedCrewIdx : -1) + 1;
      if (next >= items.length) next = 0;
      this.setHighlightedCrew(next);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      let prev = (this.highlightedCrewIdx !== undefined ? this.highlightedCrewIdx : 0) - 1;
      if (prev < 0) prev = items.length - 1;
      this.setHighlightedCrew(prev);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (this.highlightedCrewIdx >= 0 && this.highlightedCrewIdx < items.length) {
        const crewId = items[this.highlightedCrewIdx].getAttribute('data-crew');
        if (crewId) this.selectClassCrew(crewId);
      } else {
        const input = document.getElementById('manual-task-crew-input');
        if (input && input.value.trim()) {
          this.selectClassCrew(input.value.trim());
        }
        this.hideCrewDropdown();
      }
    } else if (e.key === 'Escape') {
      this.hideCrewDropdown();
    }
  }

  hideCrewDropdown() {
    const dropdown = document.getElementById('manual-task-crew-dropdown');
    if (dropdown) dropdown.style.display = 'none';
    this.highlightedCrewIdx = -1;
  }

  selectClassCrew(crewId) {
    this.addClassCrew(crewId);
  }

  addClassCrew(crewId) {
    if (!crewId) return;
    const cleanId = this.getSignificantJobNumber(String(crewId).trim());
    if (!cleanId) return;
    if (!this.selectedClassCrews) this.selectedClassCrews = [];
    if (!this.selectedClassCrews.includes(cleanId)) {
      this.selectedClassCrews.push(cleanId);
    }
    this.selectedClassCrew = this.selectedClassCrews[0] || '';
    const input = document.getElementById('manual-task-crew-input');
    if (input) {
      input.value = '';
      input.focus();
    }
    this.hideCrewDropdown();
    this.renderAssignedCrewCards();
    this.updateClassAttendeesSummary();
  }

  removeSelectedCrew(crewId) {
    if (!this.selectedClassCrews) return;
    const clean = this.getSignificantJobNumber(String(crewId).trim());
    this.selectedClassCrews = this.selectedClassCrews.filter(c => c !== clean);
    this.selectedClassCrew = this.selectedClassCrews[0] || '';
    this.renderAssignedCrewCards();
    this.updateClassAttendeesSummary();
  }

  clearClassCrew() {
    this.selectedClassCrews = [];
    this.selectedClassCrew = '';
    const input = document.getElementById('manual-task-crew-input');
    if (input) input.value = '';
    this.renderAssignedCrewCards();
    this.updateClassAttendeesSummary();
  }

  renderAssignedCrewCards() {
    const container = document.getElementById('manual-task-assigned-crews-container');
    if (!container) return;

    if (!this.selectedClassCrews || this.selectedClassCrews.length === 0) {
      container.innerHTML = '';
      return;
    }

    const jobTable = this.db.getTable('job_tracking');
    const jobRows = (jobTable && jobTable.rows) ? jobTable.rows : [];

    container.innerHTML = this.selectedClassCrews.map(cId => {
      const members = this.getCrewMembers(cId);
      let foreman = 'Lead';
      const jRow = jobRows.find(r => this.getSignificantJobNumber(String(r['Job Number'] || r['Crew'] || '')).toLowerCase() === cId.toLowerCase());
      if (jRow) {
        foreman = String(jRow['Foreman'] || jRow['Crew Lead'] || jRow['Lead'] || 'Lead').trim();
      } else if (members.length > 0 && members[0].isForeman) {
        foreman = members[0].name;
      }

      return `
        <div class="assigned-crew-card" style="background: rgba(59, 130, 246, 0.08); border: 1px solid rgba(59, 130, 246, 0.28); border-radius: 6px; padding: 8px 10px;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
            <div style="display: flex; align-items: center; gap: 6px;">
              <span style="font-size: 11.5px; font-weight: 800; color: #60a5fa;">🚚 Crew ${this.escapeHtml(cId)}</span>
              <span style="font-size: 11px; color: #f8fafc;">👑 <strong>${this.escapeHtml(foreman)}</strong></span>
            </div>
            <div style="display: flex; align-items: center; gap: 6px;">
              <span class="badge" style="background: rgba(16, 185, 129, 0.2); color: #34d399; font-size: 9.5px; font-weight: 700; padding: 1px 6px;">
                🟢 ${members.length} Linemen Scheduled
              </span>
              <button type="button" class="btn btn-secondary" style="padding: 2px 7px; font-size: 10.5px; color: #f87171; border-color: rgba(248,113,113,0.3); background: rgba(248,113,113,0.08); cursor: pointer;" onclick="window.tripPlanner.removeSelectedCrew('${this.escapeJs(cId)}')" title="Remove crew">✕</button>
            </div>
          </div>
          <div style="font-size: 10px; color: #cbd5e1; display: flex; flex-wrap: wrap; gap: 4px; margin-top: 4px;">
            ${members.length > 0 ? members.map(m => `
              <span class="badge" style="background: rgba(255,255,255,0.06); color: #cbd5e1; font-size: 9px; padding: 2px 5px; border: 1px solid rgba(255,255,255,0.1); border-radius: 3px;">
                ${m.isForeman ? '👑' : '👤'} ${this.escapeHtml(m.name)} ${m.role ? `(${this.escapeHtml(m.role)})` : ''}
              </span>
            `).join('') : `<span style="color: #94a3b8; font-style: italic; font-size: 9.5px;">No active linemen currently listed on Job #${this.escapeHtml(cId)} in Employees sheet.</span>`}
          </div>
        </div>
      `;
    }).join('') + `
      <div style="font-size: 9.5px; color: #94a3b8; margin-top: 2px; font-style: italic;">
        ⚡ Note: When new weekly crew sheets are imported, this class automatically updates to whoever is on these crews.
      </div>
    `;
  }

  updateClassCrewPreview() {
    // Retained for backward-compatibility; redirects to renderAssignedCrewCards
    this.renderAssignedCrewCards();
  }

  addClassAttendee(name) {
    if (!name) return;
    const cleanName = String(name).trim();
    if (!this.selectedClassAttendees) this.selectedClassAttendees = [];
    if (!this.selectedClassAttendees.some(n => n.toLowerCase() === cleanName.toLowerCase())) {
      this.selectedClassAttendees.push(cleanName);
    }
    const input = document.getElementById('manual-task-employee-input');
    if (input) {
      input.value = '';
      input.focus();
    }
    this.hideEmployeeDropdown();
    this.renderClassAttendeeChips();
    this.updateClassAttendeesSummary();
  }

  removeClassAttendee(name) {
    if (!this.selectedClassAttendees) return;
    const clean = String(name).trim().toLowerCase();
    this.selectedClassAttendees = this.selectedClassAttendees.filter(n => n.toLowerCase() !== clean);
    this.renderClassAttendeeChips();
    this.updateClassAttendeesSummary();
  }

  renderClassAttendeeChips() {
    const container = document.getElementById('manual-task-attendee-chips');
    if (!container) return;

    if (!this.selectedClassAttendees || this.selectedClassAttendees.length === 0) {
      container.innerHTML = `<span style="font-size: 10.5px; color: #64748b; font-style: italic;">No individual employees added yet.</span>`;
      return;
    }

    container.innerHTML = this.selectedClassAttendees.map(name => `
      <span class="badge" style="background: rgba(59, 130, 246, 0.2); color: #93c5fd; border: 1px solid rgba(59, 130, 246, 0.4); padding: 3px 8px; font-size: 11px; border-radius: 4px; display: inline-flex; align-items: center; gap: 6px;">
        <span>👤 ${this.escapeHtml(name)}</span>
        <span style="cursor: pointer; color: #f87171; font-weight: 800; font-size: 11px; line-height: 1;" onclick="window.tripPlanner.removeClassAttendee('${this.escapeJs(name)}')">✕</span>
      </span>
    `).join('');
  }

  updateClassAttendeesSummary() {
    const summaryEl = document.getElementById('manual-task-attendees-summary');
    if (!summaryEl) return;

    const allAttendeesMap = new Map();
    const crewBreakdowns = [];

    (this.selectedClassCrews || []).forEach(cId => {
      const members = this.getCrewMembers(cId);
      members.forEach(m => allAttendeesMap.set(m.name.toLowerCase(), m.name));
      crewBreakdowns.push(`${members.length} from Crew ${cId}`);
    });

    const indCount = (this.selectedClassAttendees || []).length;
    (this.selectedClassAttendees || []).forEach(name => {
      allAttendeesMap.set(name.toLowerCase(), name);
    });

    const total = allAttendeesMap.size;

    summaryEl.innerHTML = `
      <span>👥 Total Attendees: <strong style="color: ${total > 0 ? '#4ade80' : '#94a3b8'}; font-size: 12px;">${total} Linemen</strong></span>
      <span id="manual-task-attendees-detail" style="font-weight: normal; color: #94a3b8; font-size: 10.5px;">
        ${crewBreakdowns.join(' + ')}
        ${crewBreakdowns.length > 0 && indCount > 0 ? ' + ' : ''}
        ${indCount > 0 ? `${indCount} Individual${indCount > 1 ? 's' : ''}` : ''}
        ${total === 0 ? 'Select crews and/or individual employees' : ''}
      </span>
    `;
  }

  toggleClassRoster(taskId) {
    if (!this._rosterExpanded) this._rosterExpanded = {};
    this._rosterExpanded[taskId] = !this._rosterExpanded[taskId];
    const el = document.getElementById(`class-roster-${taskId}`);
    const icon = document.getElementById(`class-roster-toggle-${taskId}`);
    if (el) {
      const isOpen = this._rosterExpanded[taskId];
      el.style.display = isOpen ? 'flex' : 'none';
      if (icon) icon.textContent = isOpen ? '▼' : '▶';
    } else {
      this.renderPlanner();
    }
  }

  showCertDropdown(forceAll = false) {
    this.setupManualTaskAutocomplete();
    const input = document.getElementById('manual-task-cert-type-input');
    const val = input ? input.value.trim() : '';
    const certs = this.getAvailableCertTypes();
    const isExactMatch = certs.some(c => c.toLowerCase() === val.toLowerCase());

    // If forceAll is true, OR if current value matches an existing cert (e.g. when editing!),
    // show ALL available certs so the user can easily change to a different class!
    if (forceAll || isExactMatch || !val) {
      this.filterCertDropdown('');
    } else {
      this.filterCertDropdown(val);
    }
  }

  toggleCertDropdown() {
    const dropdown = document.getElementById('manual-task-cert-dropdown');
    if (dropdown && dropdown.style.display !== 'none') {
      this.hideCertDropdown();
    } else {
      this.showCertDropdown(true);
    }
  }

  filterCertDropdown(query = '') {
    const dropdown = document.getElementById('manual-task-cert-dropdown');
    if (!dropdown) return;

    const certs = this.getAvailableCertTypes();
    const q = String(query || '').trim().toLowerCase();

    const input = document.getElementById('manual-task-cert-type-input');
    const currentVal = input ? input.value.trim().toLowerCase() : '';

    const filtered = q
      ? certs.filter(c => c.toLowerCase().includes(q))
      : certs;

    this.highlightedCertIdx = -1;

    if (filtered.length === 0) {
      dropdown.innerHTML = `
        <div style="padding: 10px 14px; font-size: 12px; color: var(--text-muted); text-align: center;">
          Custom class: "<strong>${this.escapeHtml(query)}</strong>"
          <div style="margin-top: 6px;">
            <button type="button" class="btn btn-secondary" style="padding: 2px 8px; font-size: 11px; color: #10b981;" onmousedown="window.tripPlanner.selectCertType('${this.escapeJs(query)}');">
              Use Custom "${this.escapeHtml(query)}"
            </button>
          </div>
        </div>
      `;
      dropdown.style.display = 'block';
      return;
    }

    dropdown.innerHTML = filtered.map((c, idx) => {
      const isSelected = (c.toLowerCase() === currentVal);
      return `
        <div class="cert-dropdown-item" data-idx="${idx}" data-cert="${this.escapeHtml(c)}" style="padding: 8px 12px; display: flex; align-items: center; justify-content: space-between; gap: 8px; cursor: pointer; border-bottom: 1px solid rgba(255,255,255,0.05); background: ${isSelected ? 'rgba(16, 185, 129, 0.18)' : 'transparent'}; transition: background 0.15s ease;" onmouseenter="window.tripPlanner.setHighlightedCert(${idx});" onmousedown="window.tripPlanner.selectCertType(this.getAttribute('data-cert'));">
          <div style="font-size: 12.5px; font-weight: 700; color: ${isSelected ? '#34d399' : '#f8fafc'}; display: flex; align-items: center; gap: 6px;">
            <span>🎓</span>
            <span>${this.escapeHtml(c)}</span>
          </div>
          ${isSelected ? `<span style="font-size: 10.5px; font-weight: 700; color: #34d399;">✓ Current</span>` : ''}
        </div>
      `;
    }).join('');

    dropdown.style.display = 'block';
  }

  setHighlightedCert(idx) {
    this.highlightedCertIdx = idx;
    const dropdown = document.getElementById('manual-task-cert-dropdown');
    if (!dropdown) return;
    const items = dropdown.querySelectorAll('.cert-dropdown-item');
    items.forEach((item, i) => {
      if (i === idx) {
        item.style.backgroundColor = 'rgba(16, 185, 129, 0.25)';
        item.scrollIntoView({ block: 'nearest' });
      } else {
        const isSel = item.textContent.includes('✓ Current');
        item.style.backgroundColor = isSel ? 'rgba(16, 185, 129, 0.18)' : '';
      }
    });
  }

  handleCertKeydown(e) {
    const dropdown = document.getElementById('manual-task-cert-dropdown');
    if (!dropdown || dropdown.style.display === 'none') {
      if (e.key === 'ArrowDown') {
        this.showCertDropdown(true);
        e.preventDefault();
      } else if (e.key === 'Enter') {
        this.saveManualTaskFromModal();
      }
      return;
    }

    const items = dropdown.querySelectorAll('.cert-dropdown-item');
    if (items.length === 0) {
      if (e.key === 'Enter') this.saveManualTaskFromModal();
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      let nextIdx = (this.highlightedCertIdx !== undefined ? this.highlightedCertIdx : -1) + 1;
      if (nextIdx >= items.length) nextIdx = 0;
      this.setHighlightedCert(nextIdx);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      let prevIdx = (this.highlightedCertIdx !== undefined ? this.highlightedCertIdx : 0) - 1;
      if (prevIdx < 0) prevIdx = items.length - 1;
      this.setHighlightedCert(prevIdx);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (this.highlightedCertIdx >= 0 && this.highlightedCertIdx < items.length) {
        const cert = items[this.highlightedCertIdx].getAttribute('data-cert');
        if (cert) this.selectCertType(cert);
      } else {
        this.hideCertDropdown();
      }
    } else if (e.key === 'Escape') {
      this.hideCertDropdown();
    }
  }

  selectCertType(cert) {
    const input = document.getElementById('manual-task-cert-type-input');
    if (input) {
      input.value = cert;
    }
    this.hideCertDropdown();
  }

  hideCertDropdown() {
    const dropdown = document.getElementById('manual-task-cert-dropdown');
    if (dropdown) dropdown.style.display = 'none';
    this.highlightedCertIdx = -1;
  }

  closeManualTaskModal() {
    const modal = document.getElementById('manual-task-modal');
    if (modal) modal.classList.remove('active');
    this.hideEmployeeDropdown();
    this.hideCertDropdown();
  }

  switchManualTaskTab(category, autoFocus = true) {
    const activeCategoryInput = document.getElementById('manual-task-active-category');
    if (activeCategoryInput) activeCategoryInput.value = category;

    const certFields = document.getElementById('section-cert-class-fields');
    const personalFields = document.getElementById('section-personal-task-fields');
    const tabCert = document.getElementById('tab-btn-cert-class');
    const tabPersonal = document.getElementById('tab-btn-personal-task');
    const modalIcon = document.getElementById('manual-task-modal-icon');
    const saveBtn = document.getElementById('btn-save-manual-task');
    const saveBtnText = document.getElementById('btn-save-manual-task-text');

    const editIdInput = document.getElementById('manual-task-edit-id');
    const isEditing = !!(editIdInput && editIdInput.value.trim());

    if (category === 'cert_class') {
      if (certFields) certFields.style.display = 'flex';
      if (personalFields) personalFields.style.display = 'none';

      if (tabCert) {
        tabCert.style.border = '1px solid #10b981';
        tabCert.style.background = 'rgba(16, 185, 129, 0.2)';
        tabCert.style.color = '#34d399';
      }
      if (tabPersonal) {
        tabPersonal.style.border = '1px solid rgba(255, 255, 255, 0.1)';
        tabPersonal.style.background = 'var(--bg-primary)';
        tabPersonal.style.color = '#94a3b8';
      }
      if (modalIcon) modalIcon.textContent = '🎓';
      if (saveBtn) {
        saveBtn.style.background = '#10b981';
        saveBtn.style.boxShadow = '0 2px 8px rgba(16, 185, 129, 0.4)';
      }
      if (saveBtnText) saveBtnText.textContent = isEditing ? 'Update Class' : 'Schedule Class';

      if (autoFocus) {
        setTimeout(() => {
          const certInput = document.getElementById('manual-task-cert-type-input');
          if (certInput) certInput.focus();
        }, 50);
      }
    } else {
      if (certFields) certFields.style.display = 'none';
      if (personalFields) personalFields.style.display = 'flex';

      if (tabPersonal) {
        tabPersonal.style.border = '1px solid #3b82f6';
        tabPersonal.style.background = 'rgba(59, 130, 246, 0.2)';
        tabPersonal.style.color = '#93c5fd';
      }
      if (tabCert) {
        tabCert.style.border = '1px solid rgba(255, 255, 255, 0.1)';
        tabCert.style.background = 'var(--bg-primary)';
        tabCert.style.color = '#94a3b8';
      }
      if (modalIcon) modalIcon.textContent = '💼';
      if (saveBtn) {
        saveBtn.style.background = '#3b82f6';
        saveBtn.style.boxShadow = '0 2px 8px rgba(59, 130, 246, 0.4)';
      }
      if (saveBtnText) saveBtnText.textContent = isEditing ? 'Update Task' : 'Save Task';

      if (autoFocus) {
        setTimeout(() => {
          const titleInput = document.getElementById('manual-task-personal-title-input');
          if (titleInput) titleInput.focus();
        }, 50);
      }
    }
  }

  getManualTasksForDate(dateKey) {
    if (!this.manualTasks) this.manualTasks = this.loadManualTasks();
    return this.manualTasks
      .filter(t => (t.dateKey === dateKey || t.date === dateKey))
      .sort((a, b) => this.compareTasksByTime(a, b));
  }

  addManualTask(dateKey, taskData) {
    if (!this.manualTasks) this.manualTasks = this.loadManualTasks();
    const isCert = (taskData.taskCategory === 'cert_class' || !!taskData.certType);
    const certTypeVal = (taskData.certType || '').trim();

    const newTask = {
      id: 'mt_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
      taskCategory: isCert ? 'cert_class' : 'personal_task',
      title: (taskData.title || (isCert ? certTypeVal : '')).trim(),
      certType: certTypeVal,
      crewIds: Array.isArray(taskData.crewIds) ? [...taskData.crewIds] : [],
      crewId: (taskData.crewId || '').trim(),
      assignedEmployees: Array.isArray(taskData.assignedEmployees) ? [...taskData.assignedEmployees] : [],
      employee: (taskData.employee || '').trim(),
      instructor: (taskData.instructor || 'Cody Bechdol (Self)').trim(),
      assignedTo: (taskData.assignedTo || 'Myself').trim(),
      dateKey: dateKey,
      date: dateKey,
      location: (taskData.location || '').trim(),
      time: (taskData.time || '').trim(),
      priority: (taskData.priority || 'Normal').trim(),
      notes: (taskData.notes || '').trim(),
      status: 'Pending',
      createdAt: new Date().toISOString(),
      completedAt: null
    };

    this.manualTasks.push(newTask);
    this.saveManualTasks(this.manualTasks);
    this.renderPlanner();
    return newTask;
  }

  updateManualTask(taskId, taskData) {
    if (!this.manualTasks) this.manualTasks = this.loadManualTasks();
    const idx = this.manualTasks.findIndex(t => t.id === taskId);
    if (idx === -1) return null;

    const existing = this.manualTasks[idx];
    const isCert = (taskData.taskCategory === 'cert_class' || !!taskData.certType);
    const dateVal = taskData.dateKey || taskData.date || existing.dateKey || existing.date;
    const certTypeVal = (taskData.certType !== undefined ? taskData.certType : existing.certType || '').trim();

    this.manualTasks[idx] = {
      ...existing,
      taskCategory: isCert ? 'cert_class' : 'personal_task',
      title: (taskData.title || (isCert ? certTypeVal : existing.title)).trim(),
      certType: certTypeVal,
      crewIds: (taskData.crewIds !== undefined ? [...taskData.crewIds] : (existing.crewIds ? [...existing.crewIds] : [])),
      crewId: (taskData.crewId !== undefined ? taskData.crewId : existing.crewId || '').trim(),
      assignedEmployees: (taskData.assignedEmployees !== undefined ? [...taskData.assignedEmployees] : (existing.assignedEmployees ? [...existing.assignedEmployees] : [])),
      employee: (taskData.employee !== undefined ? taskData.employee : existing.employee || '').trim(),
      instructor: (taskData.instructor !== undefined ? taskData.instructor : existing.instructor || 'Cody Bechdol (Self)').trim(),
      assignedTo: (taskData.assignedTo !== undefined ? taskData.assignedTo : existing.assignedTo || 'Myself').trim(),
      dateKey: dateVal,
      date: dateVal,
      location: (taskData.location !== undefined ? taskData.location : existing.location || '').trim(),
      time: (taskData.time !== undefined ? taskData.time : existing.time || '').trim(),
      priority: (taskData.priority !== undefined ? taskData.priority : existing.priority || 'Normal').trim(),
      notes: (taskData.notes !== undefined ? taskData.notes : existing.notes || '').trim()
    };

    this.saveManualTasks(this.manualTasks);
    this.renderPlanner();
    return this.manualTasks[idx];
  }

  toggleManualTask(taskId) {
    if (!this.manualTasks) this.manualTasks = this.loadManualTasks();
    const task = this.manualTasks.find(t => t.id === taskId);
    if (task) {
      task.status = task.status === 'Complete' ? 'Pending' : 'Complete';
      task.completedAt = task.status === 'Complete' ? new Date().toISOString() : null;
      this.saveManualTasks(this.manualTasks);
      this.renderPlanner();
    }
  }

  deleteManualTask(taskId) {
    if (!this.manualTasks) this.manualTasks = this.loadManualTasks();
    this.manualTasks = this.manualTasks.filter(t => t.id !== taskId);
    this.saveManualTasks(this.manualTasks);
    this.renderPlanner();
  }

  openAddManualTaskModal(dateKey = '', displayDate = '', defaultCategory = 'cert_class') {
    const modal = document.getElementById('manual-task-modal');
    if (!modal) return;

    this.setupManualTaskAutocomplete();
    this.hideEmployeeDropdown();
    this.hideCrewDropdown();
    this.hideCertDropdown();

    const titleEl = document.getElementById('manual-task-modal-title');
    const editIdInput = document.getElementById('manual-task-edit-id');
    if (editIdInput) editIdInput.value = '';

    const targetDate = dateKey || new Date().toISOString().split('T')[0];
    const trips = this.getTripsForDate(targetDate);
    const defaultLoc = trips.length > 0 ? trips[0].location : 'Helena HQ';

    // Reset Cert Class fields
    const certTypeInput = document.getElementById('manual-task-cert-type-input');
    const certEmpInput = document.getElementById('manual-task-employee-input');
    const certCrewInput = document.getElementById('manual-task-crew-input');
    const certDateInput = document.getElementById('manual-task-cert-date-input');
    const certLocInput = document.getElementById('manual-task-cert-loc-input');
    const certTimeInput = document.getElementById('manual-task-cert-time-input');
    const certTrainerInput = document.getElementById('manual-task-cert-trainer-input');
    const certNotesInput = document.getElementById('manual-task-cert-notes-input');

    if (certTypeInput) certTypeInput.value = '';
    if (certEmpInput) certEmpInput.value = '';
    if (certCrewInput) certCrewInput.value = '';
    if (certDateInput) certDateInput.value = targetDate;
    if (certLocInput) certLocInput.value = defaultLoc;
    if (certTimeInput) certTimeInput.value = '';
    if (certTrainerInput) certTrainerInput.value = 'Cody Bechdol (Self)';
    if (certNotesInput) certNotesInput.value = '';

    // Reset Class attendees & crew
    this.selectedClassCrews = [];
    this.selectedClassCrew = '';
    this.selectedClassAttendees = [];
    this.renderAssignedCrewCards();
    this.renderClassAttendeeChips();
    this.updateClassAttendeesSummary();

    // Reset Personal Task fields
    const pTitleInput = document.getElementById('manual-task-personal-title-input');
    const pAssignedInput = document.getElementById('manual-task-assigned-to-input');
    const pDateInput = document.getElementById('manual-task-personal-date-input');
    const pLocInput = document.getElementById('manual-task-personal-loc-input');
    const pPrioInput = document.getElementById('manual-task-personal-priority-input');
    const pTimeInput = document.getElementById('manual-task-personal-time-input');
    const pNotesInput = document.getElementById('manual-task-personal-notes-input');

    if (pTitleInput) pTitleInput.value = '';
    if (pAssignedInput) pAssignedInput.value = 'Myself';
    if (pDateInput) pDateInput.value = targetDate;
    if (pLocInput) pLocInput.value = defaultLoc === 'Helena HQ' ? 'Helena Office' : defaultLoc;
    if (pPrioInput) pPrioInput.value = 'Normal';
    if (pTimeInput) pTimeInput.value = '';
    if (pNotesInput) pNotesInput.value = '';

    if (titleEl) {
      titleEl.textContent = displayDate ? `Schedule Task / Class • ${displayDate}` : `Schedule Task / Class (${targetDate})`;
    }

    this.switchManualTaskTab(defaultCategory);
    modal.classList.add('active');
  }

  openEditManualTaskModal(taskId) {
    if (!this.manualTasks) this.manualTasks = this.loadManualTasks();
    const task = this.manualTasks.find(t => t.id === taskId);
    if (!task) return;

    const modal = document.getElementById('manual-task-modal');
    if (!modal) return;

    this.setupManualTaskAutocomplete();
    this.hideEmployeeDropdown();
    this.hideCrewDropdown();
    this.hideCertDropdown();

    const titleEl = document.getElementById('manual-task-modal-title');
    const editIdInput = document.getElementById('manual-task-edit-id');
    if (editIdInput) editIdInput.value = task.id;

    const isCert = (task.taskCategory === 'cert_class' || !!task.certType);

    if (isCert) {
      const certTypeInput = document.getElementById('manual-task-cert-type-input');
      const certEmpInput = document.getElementById('manual-task-employee-input');
      const certCrewInput = document.getElementById('manual-task-crew-input');
      const certDateInput = document.getElementById('manual-task-cert-date-input');
      const certLocInput = document.getElementById('manual-task-cert-loc-input');
      const certTimeInput = document.getElementById('manual-task-cert-time-input');
      const certTrainerInput = document.getElementById('manual-task-cert-trainer-input');
      const certNotesInput = document.getElementById('manual-task-cert-notes-input');

      const normCert = this.normalizeCertClassName(task.certType || task.title || '');
      if (certTypeInput) certTypeInput.value = normCert;
      if (certEmpInput) certEmpInput.value = '';
      if (certDateInput) certDateInput.value = task.dateKey || task.date || '';
      if (certLocInput) certLocInput.value = task.location || '';
      if (certTimeInput) certTimeInput.value = task.time || '';
      if (certTrainerInput) certTrainerInput.value = task.instructor || 'Cody Bechdol (Self)';
      if (certNotesInput) certNotesInput.value = task.notes || '';

      this.selectedClassCrews = Array.isArray(task.crewIds) && task.crewIds.length > 0
        ? [...task.crewIds]
        : (task.crewId ? String(task.crewId).split(',').map(s => this.getSignificantJobNumber(s.trim())).filter(Boolean) : []);
      this.selectedClassCrew = this.selectedClassCrews[0] || '';
      if (certCrewInput) certCrewInput.value = '';

      this.selectedClassAttendees = Array.isArray(task.assignedEmployees)
        ? [...task.assignedEmployees]
        : (task.employee && !task.employee.startsWith('Crew ') ? [task.employee] : []);

      this.renderAssignedCrewCards();
      this.renderClassAttendeeChips();
      this.updateClassAttendeesSummary();

      this.switchManualTaskTab('cert_class', false);
    } else {
      const pTitleInput = document.getElementById('manual-task-personal-title-input');
      const pAssignedInput = document.getElementById('manual-task-assigned-to-input');
      const pDateInput = document.getElementById('manual-task-personal-date-input');
      const pLocInput = document.getElementById('manual-task-personal-loc-input');
      const pPrioInput = document.getElementById('manual-task-personal-priority-input');
      const pTimeInput = document.getElementById('manual-task-personal-time-input');
      const pNotesInput = document.getElementById('manual-task-personal-notes-input');

      if (pTitleInput) pTitleInput.value = task.title || '';
      if (pAssignedInput) pAssignedInput.value = task.assignedTo || 'Myself';
      if (pDateInput) pDateInput.value = task.dateKey || task.date || '';
      if (pLocInput) pLocInput.value = task.location || '';
      if (pPrioInput) pPrioInput.value = task.priority || 'Normal';
      if (pTimeInput) pTimeInput.value = task.time || '';
      if (pNotesInput) pNotesInput.value = task.notes || '';

      this.switchManualTaskTab('personal_task', false);
    }

    if (titleEl) {
      titleEl.textContent = isCert ? `Edit Cert / Training Class` : `Edit Personal / Office Task`;
    }

    modal.classList.add('active');
  }

  closeManualTaskModal() {
    const modal = document.getElementById('manual-task-modal');
    if (modal) modal.classList.remove('active');
  }

  saveManualTaskFromModal() {
    const editIdInput = document.getElementById('manual-task-edit-id');
    const activeCategoryInput = document.getElementById('manual-task-active-category');
    const editId = editIdInput ? editIdInput.value.trim() : '';
    const category = activeCategoryInput ? activeCategoryInput.value : 'cert_class';

    if (category === 'cert_class') {
      const certTypeInput = document.getElementById('manual-task-cert-type-input');
      const certEmpInput = document.getElementById('manual-task-employee-input');
      const certCrewInput = document.getElementById('manual-task-crew-input');
      const certDateInput = document.getElementById('manual-task-cert-date-input');
      const certLocInput = document.getElementById('manual-task-cert-loc-input');
      const certTimeInput = document.getElementById('manual-task-cert-time-input');
      const certTrainerInput = document.getElementById('manual-task-cert-trainer-input');
      const certNotesInput = document.getElementById('manual-task-cert-notes-input');

      const certType = certTypeInput ? certTypeInput.value.trim() : '';
      const dateKey = certDateInput ? certDateInput.value.trim() : '';
      let time = certTimeInput ? certTimeInput.value.trim() : '';
      if (time) {
        time = time.replace(/^([0-9]{1,2}(?::[0-9]{2})?)\s*am(\s*[\/\-–—]\s*[0-9]{1,2}(?::[0-9]{2})?\s*pm)/i, (match, p1, p2) => {
          const h = parseInt(p1.split(':')[0], 10);
          if (h >= 1 && h <= 6) {
            return `${p1} pm${p2}`;
          }
          return match;
        });
      }
      const instructor = certTrainerInput ? certTrainerInput.value.trim() : 'Cody Bechdol (Self)';
      const notes = certNotesInput ? certNotesInput.value.trim() : '';

      if (!certType) {
        if (certTypeInput) certTypeInput.focus();
        return;
      }
      if (!dateKey) {
        if (certDateInput) certDateInput.focus();
        return;
      }

      // Check if user typed a crew without selecting from dropdown
      const leftoverCrew = certCrewInput ? certCrewInput.value.trim() : '';
      if (leftoverCrew) {
        const cleanLeftover = this.getSignificantJobNumber(leftoverCrew);
        if (cleanLeftover && !this.selectedClassCrews.includes(cleanLeftover)) {
          this.selectedClassCrews.push(cleanLeftover);
        }
      }

      // Check if user typed an employee without selecting from dropdown
      const leftoverEmp = certEmpInput ? certEmpInput.value.trim() : '';
      if (leftoverEmp && !this.selectedClassAttendees.some(n => n.toLowerCase() === leftoverEmp.toLowerCase())) {
        this.selectedClassAttendees.push(leftoverEmp);
      }

      const hasCrews = (this.selectedClassCrews && this.selectedClassCrews.length > 0);
      const hasEmployees = (this.selectedClassAttendees && this.selectedClassAttendees.length > 0);

      if (!hasCrews && !hasEmployees) {
        alert('Please assign at least one Crew (Job #) or add individual attendees to this class.');
        if (certCrewInput) certCrewInput.focus();
        return;
      }

      const taskData = {
        taskCategory: 'cert_class',
        title: certType,
        certType: certType,
        crewIds: [...this.selectedClassCrews],
        crewId: this.selectedClassCrews.join(', '),
        assignedEmployees: [...this.selectedClassAttendees],
        employee: this.selectedClassAttendees.length > 0
          ? this.selectedClassAttendees[0]
          : (this.selectedClassCrews.length > 0 ? `Crew ${this.selectedClassCrews[0]}` : 'Unassigned'),
        instructor: instructor,
        dateKey: dateKey,
        location: location || 'Helena HQ',
        time: time,
        notes: notes,
        priority: 'Normal'
      };

      if (editId) {
        this.updateManualTask(editId, taskData);
      } else {
        this.addManualTask(dateKey, taskData);
      }
    } else {
      const pTitleInput = document.getElementById('manual-task-personal-title-input');
      const pAssignedInput = document.getElementById('manual-task-assigned-to-input');
      const pDateInput = document.getElementById('manual-task-personal-date-input');
      const pLocInput = document.getElementById('manual-task-personal-loc-input');
      const pPrioInput = document.getElementById('manual-task-personal-priority-input');
      const pTimeInput = document.getElementById('manual-task-personal-time-input');
      const pNotesInput = document.getElementById('manual-task-personal-notes-input');

      const title = pTitleInput ? pTitleInput.value.trim() : '';
      const assignedTo = pAssignedInput ? pAssignedInput.value.trim() : 'Myself';
      const dateKey = pDateInput ? pDateInput.value.trim() : '';
      const location = pLocInput ? pLocInput.value.trim() : '';
      const priority = pPrioInput ? pPrioInput.value : 'Normal';
      let time = pTimeInput ? pTimeInput.value.trim() : '';
      if (time) {
        time = time.replace(/^([0-9]{1,2}(?::[0-9]{2})?)\s*am(\s*[\/\-–—]\s*[0-9]{1,2}(?::[0-9]{2})?\s*pm)/i, (match, p1, p2) => {
          const h = parseInt(p1.split(':')[0], 10);
          if (h >= 1 && h <= 6) {
            return `${p1} pm${p2}`;
          }
          return match;
        });
      }
      const notes = pNotesInput ? pNotesInput.value.trim() : '';

      if (!title) {
        if (pTitleInput) pTitleInput.focus();
        return;
      }
      if (!dateKey) {
        if (pDateInput) pDateInput.focus();
        return;
      }

      const taskData = {
        taskCategory: 'personal_task',
        title: title,
        assignedTo: assignedTo || 'Myself',
        dateKey: dateKey,
        location: location || 'Helena Office',
        priority: priority,
        time: time,
        notes: notes
      };

      if (editId) {
        this.updateManualTask(editId, taskData);
      } else {
        this.addManualTask(dateKey, taskData);
      }
    }

    this.closeManualTaskModal();
  }

  getTripsForDate(dateKey) {
    if (!this.plannedTrips) return [];
    const entry = this.plannedTrips[dateKey];
    if (!entry) return [];
    if (Array.isArray(entry)) return entry;
    if (typeof entry === 'object' && entry.location) return [entry];
    return [];
  }

  setTrip(dateKey, location) {
    if (!dateKey || !location) return;

    if (this.isDayHoliday(dateKey)) {
      const hName = this.getHolidayName(dateKey);
      alert(`🏖️ ${dateKey} is marked as a holiday (${hName}). Field crew visits cannot be scheduled on holiday days.`);
      return;
    }

    if (!this.plannedTrips[dateKey]) {
      this.plannedTrips[dateKey] = [];
    } else if (!Array.isArray(this.plannedTrips[dateKey])) {
      this.plannedTrips[dateKey] = [this.plannedTrips[dateKey]];
    }

    const exists = this.plannedTrips[dateKey].some(t => t && t.location === location);
    if (!exists) {
      this.plannedTrips[dateKey].push({ location: location });
      this.saveTrips();
      this.renderPlanner();
    }
  }

  removeTrip(dateKey, location) {
    if (!this.plannedTrips[dateKey]) return;
    if (Array.isArray(this.plannedTrips[dateKey])) {
      this.plannedTrips[dateKey] = this.plannedTrips[dateKey].filter(t => t && t.location !== location);
      if (this.plannedTrips[dateKey].length === 0) {
        delete this.plannedTrips[dateKey];
      }
    } else {
      delete this.plannedTrips[dateKey];
    }
    this.saveTrips();
    this.renderPlanner();
  }

  clearWeekTrips(weekDateKey) {
    if (!confirm('🗑️ Clear all scheduled trips for this week?')) return;
    const baseDate = this.parseDate(weekDateKey);
    if (!baseDate) return;

    for (let i = 0; i < 7; i++) {
      const d = new Date(baseDate);
      d.setDate(baseDate.getDate() + i);
      const dKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      delete this.plannedTrips[dKey];
    }
    this.saveTrips();
    this.renderPlanner();
  }

  saveTrips() {
    this.db.savePlannedTrips(this.plannedTrips);
  }

  /**
   * Normalizes various date string formats (YYYY-MM-DD, MM/DD/YYYY, ISO) to standard YYYY-MM-DD.
   */
  normalizeDateKey(dateStr) {
    if (!dateStr) return '';
    const s = String(dateStr).trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    if (s.includes('/')) {
      const parts = s.split('/');
      if (parts.length === 3) {
        const mm = parts[0].padStart(2, '0');
        const dd = parts[1].padStart(2, '0');
        let yyyy = parts[2].trim();
        if (yyyy.length === 2) yyyy = '20' + yyyy;
        if (yyyy.length === 4) return `${yyyy}-${mm}-${dd}`;
      }
    }
    if (s.includes('T')) {
      const d = s.split('T')[0];
      if (/^\d{4}-\d{2}-\d{2}$/.test(d)) return d;
    }
    const parsed = new Date(s);
    if (!isNaN(parsed.getTime())) {
      const yyyy = parsed.getFullYear();
      const mm = String(parsed.getMonth() + 1).padStart(2, '0');
      const dd = String(parsed.getDate()).padStart(2, '0');
      return `${yyyy}-${mm}-${dd}`;
    }
    return '';
  }

  /**
   * Formats a time string (e.g. 09:30 or 14:00) into friendly 12-hour AM/PM format.
   */
  formatTimeDisplay(timeStr) {
    if (!timeStr) return '';
    const s = String(timeStr).trim();
    if (s.includes('AM') || s.includes('PM') || s.includes('am') || s.includes('pm')) return s;
    if (s.includes(':')) {
      const parts = s.split(':');
      let hh = parseInt(parts[0], 10);
      const mm = parts[1].padStart(2, '0');
      if (isNaN(hh)) return s;
      const ampm = hh >= 12 ? 'PM' : 'AM';
      hh = hh % 12;
      if (hh === 0) hh = 12;
      return `${hh}:${mm} ${ampm}`;
    }
    return s;
  }

  /**
   * Retrieves all DOT Drug Tests assigned to a specific dateKey (YYYY-MM-DD).
   */
  getDrugTestsForDate(dateKey) {
    if (!this.db) this.db = window.localDB || window.safetyDB;
    if (!this.db) return [];

    const table = this.db.getTable('dot_drug_tests');
    if (!table || !table.rows) return [];

    const matched = [];
    table.rows.forEach(r => {
      const empName = String(r['Employee Name'] || r['Name'] || r[1] || '').trim();
      if (!empName || empName.toLowerCase() === 'employee name') return;

      const schedDate = String(r['Scheduled Date'] || r[11] || r[9] || '').trim();
      if (!schedDate || schedDate === 'N/A') return;

      const normDate = this.normalizeDateKey(schedDate);
      if (normDate !== dateKey) return;

      const status = String(r['Status'] || r[14] || 'Pending').trim();
      if (status.toLowerCase() === 'excused') return;

      const schedTime = String(r['Scheduled Time'] || r[12] || r[10] || '').trim();
      const testType = String(r['Test Type'] || r[5] || 'Drug Only').trim();
      const classification = String(r['Classification'] || r[6] || 'FMCSA').trim();
      const collectionType = String(r['Collection Type'] || r[7] || 'Clinic Visit').trim();
      const isMobile = collectionType.toLowerCase().includes('mobile');
      const clinicName = String(r['Clinic Name'] || r[8] || '').trim();
      const clinicCity = String(r['Clinic City / State'] || r[9] || '').trim();
      const meetingAddr = String(r['Meeting / Collection Address'] || r[13] || '').trim();
      const phone = String(r['Phone Number'] || r[4] || '').trim();
      const job = String(r['Job Number'] || r[3] || '').trim();
      const location = String(r['Location'] || r[2] || '').trim();

      matched.push({
        employee: empName,
        date: schedDate,
        dateKey: normDate,
        time: schedTime,
        status: status,
        testType: testType,
        classification: classification,
        collectionType: collectionType,
        isMobile: isMobile,
        clinicName: clinicName,
        clinicCity: clinicCity,
        meetingAddr: meetingAddr,
        phone: phone,
        job: job,
        location: location
      });
    });

    // Sort chronologically by time, then name
    matched.sort((a, b) => {
      const timeDiff = this.compareTimes(a.time, b.time);
      if (timeDiff !== 0) return timeDiff;
      return a.employee.localeCompare(b.employee);
    });

    return matched;
  }

  /**
   * One-click action to mark a drug test appointment done directly from Trip Planner.
   */
  async markDrugTestDone(empName, dateKey) {
    if (!confirm(`Mark DOT Drug Test completed for ${empName}?`)) return;

    if (window.drugTestingEngine && typeof window.drugTestingEngine.markComplete === 'function') {
      await window.drugTestingEngine.markComplete(empName, dateKey);
    } else {
      const table = this.db ? this.db.getTable('dot_drug_tests') : null;
      if (table && table.rows) {
        const row = table.rows.find(r => {
          const n = String(r['Employee Name'] || r['Name'] || r[1] || '').trim().toLowerCase();
          return n === empName.toLowerCase().trim();
        });
        if (row) {
          row['Status'] = 'Completed';
          row['Date Completed'] = dateKey;
          if (this.db && typeof this.db.addMutation === 'function') {
            await this.db.addMutation({
              action: 'UPDATE_ROW',
              sheetName: 'DOT Drug Tests',
              tableKey: 'dot_drug_tests',
              row: row
            });
          }
        }
      }
    }
    this.renderPlanner();
  }

  openHolidaysModal() {
    const modal = document.getElementById('holidays-modal');
    if (!modal) return;
    this.renderHolidaysModalContent();
    modal.style.display = 'flex';
  }

  closeHolidaysModal() {
    const modal = document.getElementById('holidays-modal');
    if (modal) modal.style.display = 'none';
  }

  renderHolidaysModalContent() {
    const body = document.getElementById('holidays-modal-body');
    if (!body) return;

    if (!this.holidaysMap) this.holidaysMap = this.loadHolidays();
    const sortedKeys = Object.keys(this.holidaysMap).sort();

    body.innerHTML = `
      <div style="display: flex; flex-direction: column; gap: 14px;">
        <div style="background: linear-gradient(135deg, rgba(202, 138, 4, 0.15) 0%, rgba(161, 98, 7, 0.05) 100%); border: 1px solid rgba(202, 138, 4, 0.35); border-radius: 8px; padding: 12px 16px;">
          <div style="font-size: 14px; font-weight: 700; color: #fde047; margin-bottom: 2px;">
            🏖️ Holiday & Blackout Day Manager
          </div>
          <div style="font-size: 12px; color: var(--text-secondary);">
            Holidays protect work days from trip drops and adjust safety compliance and timesheet calculations.
          </div>
        </div>

        <!-- Add Custom Holiday Row -->
        <div style="display: flex; gap: 8px; align-items: center; background: var(--bg-primary); border: 1px solid var(--border-color); border-radius: 6px; padding: 10px 14px;">
          <input type="date" id="new-holiday-date" style="padding: 5px 8px; font-size: 12px; background: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: 4px; color: #fff;">
          <input type="text" id="new-holiday-name" placeholder="Holiday name (e.g. Memorial Day)" style="flex: 1; padding: 5px 8px; font-size: 12px; background: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: 4px; color: #fff;">
          <button class="btn btn-primary" onclick="window.tripPlanner.addNewHolidayFromModal()" style="font-size: 12px; font-weight: 700; background: #ca8a04; border: none; padding: 6px 12px;">
            ➕ Add Holiday
          </button>
        </div>

        <!-- Current Holidays List -->
        <div style="max-height: 300px; overflow-y: auto; border: 1px solid var(--border-color); border-radius: 6px; background: var(--bg-primary);">
          <table class="data-table" style="width: 100%; border-collapse: collapse; font-size: 12.5px;">
            <thead>
              <tr style="position: sticky; top: 0; background: #1e293b; z-index: 2;">
                <th style="width: 130px;">Date</th>
                <th>Holiday / Blackout Name</th>
                <th style="width: 80px; text-align: center;">Action</th>
              </tr>
            </thead>
            <tbody>
              ${sortedKeys.length === 0 ? `
                <tr><td colspan="3" style="padding: 20px; text-align: center; color: var(--text-muted);">No holidays configured.</td></tr>
              ` : sortedKeys.map(dKey => `
                <tr>
                  <td style="font-weight: 700; color: #fde047; font-family: monospace;">${dKey}</td>
                  <td style="font-weight: 600; color: #f8fafc;">${this.escapeHtml(this.holidaysMap[dKey])}</td>
                  <td style="text-align: center;">
                    <button class="btn btn-secondary" style="padding: 2px 6px; font-size: 11px; color: #f87171;" onclick="window.tripPlanner.deleteHolidayFromModal('${dKey}')">
                      🗑️
                    </button>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  addNewHolidayFromModal() {
    const dateInput = document.getElementById('new-holiday-date');
    const nameInput = document.getElementById('new-holiday-name');
    if (!dateInput || !dateInput.value) {
      alert('⚠️ Please choose a date.');
      return;
    }
    const dKey = dateInput.value;
    const name = (nameInput && nameInput.value.trim()) ? nameInput.value.trim() : 'Company Holiday';

    this.toggleHoliday(dKey, name);
    this.renderHolidaysModalContent();
    dateInput.value = '';
    if (nameInput) nameInput.value = '';
  }

  deleteHolidayFromModal(dKey) {
    if (this.holidaysMap && this.holidaysMap[dKey]) {
      delete this.holidaysMap[dKey];
      this.saveHolidays(this.holidaysMap);
      this.renderHolidaysModalContent();
      this.renderPlanner();
    }
  }

  // =========================================================================
  // TRAINING SCHEDULE EMAIL COMPOSER
  // =========================================================================

  openComposeTrainingEmailModal(classId = null) {
    const allManual = this.manualTasks || [];
    const allClasses = allManual
      .filter(m => m.taskCategory === 'cert_class' || !!m.certType)
      .sort((a, b) => this.compareTasksByDateAndTime(a, b));

    if (allClasses.length === 0) {
      alert('⚠️ No scheduled training classes found on the Trip Planner.\n\nPlease schedule a class first using "+ Class" or "Manual Task".');
      return;
    }

    this._trainingEmailSelectedClassIds = new Set();

    if (classId && allClasses.some(c => c.id === classId)) {
      const cls = allClasses.find(c => c.id === classId);
      this._trainingEmailStartDate = cls.date || '';
      this._trainingEmailEndDate = cls.date || '';
      this._trainingEmailActivePreset = 'custom';
      this._trainingEmailSelectedClassIds.add(classId);
    } else {
      // Default date range: check if any classes exist this week, else next 2 weeks, else upcoming
      const now = new Date();
      const dayOfWeek = now.getDay();
      const distToMon = (dayOfWeek === 0 ? -6 : 1) - dayOfWeek;
      const mon = new Date(now.getFullYear(), now.getMonth(), now.getDate() + distToMon, 12, 0, 0);
      const sun = new Date(mon.getFullYear(), mon.getMonth(), mon.getDate() + 6, 12, 0, 0);
      const sMon = this.formatIsoDate(mon);
      const sSun = this.formatIsoDate(sun);

      const thisWeekClasses = allClasses.filter(c => c.date && c.date >= sMon && c.date <= sSun);
      if (thisWeekClasses.length > 0) {
        this._trainingEmailStartDate = sMon;
        this._trainingEmailEndDate = sSun;
        this._trainingEmailActivePreset = 'this_week';
        thisWeekClasses.forEach(c => this._trainingEmailSelectedClassIds.add(c.id));
      } else {
        const in14 = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 14, 12, 0, 0);
        const s14 = this.formatIsoDate(in14);
        const next2WksClasses = allClasses.filter(c => c.date && c.date >= sMon && c.date <= s14);
        if (next2WksClasses.length > 0) {
          this._trainingEmailStartDate = sMon;
          this._trainingEmailEndDate = s14;
          this._trainingEmailActivePreset = 'next_2_weeks';
          next2WksClasses.forEach(c => this._trainingEmailSelectedClassIds.add(c.id));
        } else {
          // If no upcoming classes within 2 weeks, show all dates
          this._trainingEmailStartDate = '';
          this._trainingEmailEndDate = '';
          this._trainingEmailActivePreset = 'all';
          allClasses.slice(0, 10).forEach(c => this._trainingEmailSelectedClassIds.add(c.id));
        }
      }
    }

    this._trainingEmailActiveTab = 'html';
    const modal = document.getElementById('training-email-modal');
    if (modal) modal.classList.add('active');

    this.renderTrainingEmailModalContent();
  }

  openComposeTrainingEmailModalForDate(dateKey) {
    const allManual = this.manualTasks || [];
    const dateClasses = allManual.filter(m => (m.taskCategory === 'cert_class' || !!m.certType) && m.date === dateKey);
    if (dateClasses.length === 0) {
      alert(`⚠️ No training classes scheduled for ${dateKey}.`);
      return;
    }
    this._trainingEmailStartDate = dateKey;
    this._trainingEmailEndDate = dateKey;
    this._trainingEmailActivePreset = 'custom';
    this._trainingEmailSelectedClassIds = new Set(dateClasses.map(c => c.id));
    this._trainingEmailActiveTab = 'html';
    const modal = document.getElementById('training-email-modal');
    if (modal) modal.classList.add('active');

    this.renderTrainingEmailModalContent();
  }

  openComposeTrainingEmailModalWithRange(startDate, endDate) {
    this._trainingEmailStartDate = startDate || '';
    this._trainingEmailEndDate = endDate || '';
    this._trainingEmailActivePreset = 'custom';
    this._trainingEmailSelectedClassIds = new Set();

    const allManual = this.manualTasks || [];
    const matchingClasses = allManual.filter(c => {
      if (c.taskCategory !== 'cert_class' && !c.certType) return false;
      if (!c.date) return !startDate && !endDate;
      if (startDate && c.date < startDate) return false;
      if (endDate && c.date > endDate) return false;
      return true;
    });
    matchingClasses.forEach(c => this._trainingEmailSelectedClassIds.add(c.id));

    this._trainingEmailActiveTab = 'html';
    const modal = document.getElementById('training-email-modal');
    if (modal) modal.classList.add('active');

    this.renderTrainingEmailModalContent();
  }

  closeComposeTrainingEmailModal() {
    const modal = document.getElementById('training-email-modal');
    if (modal) modal.classList.remove('active');
  }

  formatIsoDate(d) {
    if (!d || isNaN(d.getTime())) return '';
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }

  formatEmailDate(dateStr, format = 'short') {
    if (!dateStr) return 'Date TBD';
    const parts = String(dateStr).split('-');
    if (parts.length === 3) {
      const d = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10), 12, 0, 0);
      const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      if (format === 'long') {
        const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
        return `${days[d.getDay()]}, ${months[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
      } else if (format === 'month_day') {
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        return `${months[d.getMonth()]} ${d.getDate()}`;
      } else if (format === 'concise') {
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        return `${months[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
      } else {
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        return `${days[d.getDay()]}, ${months[d.getMonth()]} ${d.getDate()}`;
      }
    }
    return dateStr;
  }

  getTrainingEmailRangeSummaryText() {
    const s = this._trainingEmailStartDate;
    const e = this._trainingEmailEndDate;
    if (s && e) {
      if (s === e) return this.formatEmailDate(s, 'long');
      const sParts = s.split('-');
      const eParts = e.split('-');
      if (sParts[0] === eParts[0]) {
        return `${this.formatEmailDate(s, 'month_day')} – ${this.formatEmailDate(e, 'concise')}`;
      }
      return `${this.formatEmailDate(s, 'concise')} – ${this.formatEmailDate(e, 'concise')}`;
    } else if (s) {
      return `From ${this.formatEmailDate(s, 'concise')} onwards`;
    } else if (e) {
      return `Through ${this.formatEmailDate(e, 'concise')}`;
    }
    return 'All Scheduled Dates';
  }

  setTrainingEmailDatePreset(preset) {
    const now = new Date();
    let s = '';
    let e = '';

    if (preset === 'this_week') {
      const dayOfWeek = now.getDay();
      const distToMon = (dayOfWeek === 0 ? -6 : 1) - dayOfWeek;
      const mon = new Date(now.getFullYear(), now.getMonth(), now.getDate() + distToMon, 12, 0, 0);
      const sun = new Date(mon.getFullYear(), mon.getMonth(), mon.getDate() + 6, 12, 0, 0);
      s = this.formatIsoDate(mon);
      e = this.formatIsoDate(sun);
    } else if (preset === 'next_week') {
      const dayOfWeek = now.getDay();
      const distToMon = (dayOfWeek === 0 ? -6 : 1) - dayOfWeek;
      const nextMon = new Date(now.getFullYear(), now.getMonth(), now.getDate() + distToMon + 7, 12, 0, 0);
      const nextSun = new Date(nextMon.getFullYear(), nextMon.getMonth(), nextMon.getDate() + 6, 12, 0, 0);
      s = this.formatIsoDate(nextMon);
      e = this.formatIsoDate(nextSun);
    } else if (preset === 'next_2_weeks') {
      s = this.formatIsoDate(now);
      const in14 = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 14, 12, 0, 0);
      e = this.formatIsoDate(in14);
    } else if (preset === 'this_month') {
      const mStart = new Date(now.getFullYear(), now.getMonth(), 1, 12, 0, 0);
      const mEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 12, 0, 0);
      s = this.formatIsoDate(mStart);
      e = this.formatIsoDate(mEnd);
    } else if (preset === 'next_month') {
      const nmStart = new Date(now.getFullYear(), now.getMonth() + 1, 1, 12, 0, 0);
      const nmEnd = new Date(now.getFullYear(), now.getMonth() + 2, 0, 12, 0, 0);
      s = this.formatIsoDate(nmStart);
      e = this.formatIsoDate(nmEnd);
    } else if (preset === 'all') {
      s = '';
      e = '';
    }

    this._trainingEmailActivePreset = preset;
    this._trainingEmailStartDate = s;
    this._trainingEmailEndDate = e;

    const sEl = document.getElementById('training-email-start-date');
    if (sEl) sEl.value = s;
    const eEl = document.getElementById('training-email-end-date');
    if (eEl) eEl.value = e;

    this.updateTrainingEmailPresetButtonsUi();
    this.applyTrainingEmailDateRangeFilter();
  }

  updateTrainingEmailPresetButtonsUi() {
    const presets = ['this_week', 'next_week', 'next_2_weeks', 'this_month', 'next_month', 'all'];
    presets.forEach(p => {
      const btn = document.getElementById(`training-preset-${p}`);
      if (btn) {
        if (this._trainingEmailActivePreset === p) {
          btn.style.borderColor = '#10b981';
          btn.style.background = 'rgba(16, 185, 129, 0.25)';
          btn.style.color = '#34d399';
          btn.style.fontWeight = '700';
        } else {
          btn.style.borderColor = p === 'all' ? 'rgba(59, 130, 246, 0.35)' : 'rgba(16, 185, 129, 0.35)';
          btn.style.background = p === 'all' ? 'rgba(59, 130, 246, 0.08)' : 'rgba(16, 185, 129, 0.08)';
          btn.style.color = p === 'all' ? '#93c5fd' : '#6ee7b7';
          btn.style.fontWeight = 'normal';
        }
      }
    });
  }

  onTrainingEmailDateRangeChange() {
    this._trainingEmailActivePreset = 'custom';
    const sEl = document.getElementById('training-email-start-date');
    const eEl = document.getElementById('training-email-end-date');
    this._trainingEmailStartDate = sEl ? sEl.value : '';
    this._trainingEmailEndDate = eEl ? eEl.value : '';
    this.updateTrainingEmailPresetButtonsUi();
    this.applyTrainingEmailDateRangeFilter();
  }

  applyTrainingEmailDateRangeFilter() {
    const allManual = this.manualTasks || [];
    const allClasses = allManual
      .filter(m => m.taskCategory === 'cert_class' || !!m.certType)
      .sort((a, b) => this.compareTasksByDateAndTime(a, b));

    const s = this._trainingEmailStartDate;
    const e = this._trainingEmailEndDate;

    const matchingClasses = allClasses.filter(c => {
      if (!c.date) return !s && !e;
      if (s && c.date < s) return false;
      if (e && c.date > e) return false;
      return true;
    });

    // Auto-select all matching classes in range
    this._trainingEmailSelectedClassIds = new Set(matchingClasses.map(c => c.id));

    // Update range summary text
    const sumEl = document.getElementById('training-email-range-summary');
    if (sumEl) sumEl.textContent = this.getTrainingEmailRangeSummaryText();

    // Update class chips & heading
    this.updateTrainingEmailClassChipsDom();

    this.updateTrainingEmailClassesCountBadge();
    this.updateTrainingEmailRecipientsAndSubject();
    this.updateTrainingEmailLivePreview();
  }

  toggleTrainingEmailClass(classId) {
    if (!this._trainingEmailSelectedClassIds) this._trainingEmailSelectedClassIds = new Set();
    if (this._trainingEmailSelectedClassIds.has(classId)) {
      this._trainingEmailSelectedClassIds.delete(classId);
    } else {
      this._trainingEmailSelectedClassIds.add(classId);
    }
    this.updateTrainingEmailClassChipsDom();
    this.updateTrainingEmailClassesCountBadge();
    this.updateTrainingEmailRecipientsAndSubject();
    this.updateTrainingEmailLivePreview();
  }

  selectAllTrainingEmailClasses() {
    const allManual = this.manualTasks || [];
    const allClasses = allManual.filter(m => m.taskCategory === 'cert_class' || !!m.certType);
    const s = this._trainingEmailStartDate;
    const e = this._trainingEmailEndDate;
    const matchingClasses = allClasses.filter(c => {
      if (!c.date) return !s && !e;
      if (s && c.date < s) return false;
      if (e && c.date > e) return false;
      return true;
    });
    this._trainingEmailSelectedClassIds = new Set(matchingClasses.map(c => c.id));
    this.updateTrainingEmailClassChipsDom();
    this.updateTrainingEmailClassesCountBadge();
    this.updateTrainingEmailRecipientsAndSubject();
    this.updateTrainingEmailLivePreview();
  }

  selectNoneTrainingEmailClasses() {
    this._trainingEmailSelectedClassIds = new Set();
    this.updateTrainingEmailClassChipsDom();
    this.updateTrainingEmailClassesCountBadge();
    this.updateTrainingEmailRecipientsAndSubject();
    this.updateTrainingEmailLivePreview();
  }

  updateTrainingEmailClassChipsDom() {
    const allManual = this.manualTasks || [];
    const allClasses = allManual
      .filter(m => m.taskCategory === 'cert_class' || !!m.certType)
      .sort((a, b) => this.compareTasksByDateAndTime(a, b));
    const s = this._trainingEmailStartDate;
    const e = this._trainingEmailEndDate;
    const matchingClasses = allClasses.filter(c => {
      if (!c.date) return !s && !e;
      if (s && c.date < s) return false;
      if (e && c.date > e) return false;
      return true;
    });

    const chipsEl = document.getElementById('training-email-classes-chips-container');
    if (chipsEl) {
      chipsEl.innerHTML = this.renderTrainingEmailClassChipsHtml(allClasses, matchingClasses);
    }
    const headEl = document.getElementById('training-email-classes-heading');
    if (headEl) {
      const selCount = matchingClasses.filter(c => this._trainingEmailSelectedClassIds && this._trainingEmailSelectedClassIds.has(c.id)).length;
      headEl.textContent = `CLASSES IN RANGE (${matchingClasses.length} found, ${selCount} selected):`;
    }
  }

  renderTrainingEmailClassChipsHtml(allClasses, matchingClasses) {
    if (!matchingClasses || matchingClasses.length === 0) {
      return `
        <div style="padding: 10px 14px; font-size: 11.5px; color: #94a3b8; font-style: italic; background: var(--bg-primary); border-radius: 6px; width: 100%;">
          ⚠️ No training classes scheduled within this date range. Adjust start / end dates or click <strong style="color: #93c5fd; cursor: pointer; text-decoration: underline;" onclick="window.tripPlanner.setTrainingEmailDatePreset('all')">"All Dates"</strong>.
        </div>
      `;
    }

    return matchingClasses.map(c => {
      const isSel = this._trainingEmailSelectedClassIds && this._trainingEmailSelectedClassIds.has(c.id);
      const res = this.resolveClassAttendees(c);
      const crewLabel = res.crews.length > 0 ? (res.crews.length === 1 ? `Crew ${res.crews[0].crewId}` : `${res.crews.length} Crews`) : `${res.totalCount} Attendee${res.totalCount === 1 ? '' : 's'}`;
      return `
        <div style="cursor: pointer; display: inline-flex; align-items: center; gap: 6px; padding: 5px 10px; border-radius: 6px; font-size: 11px; font-weight: 600; border: 1px solid ${isSel ? '#10b981' : 'rgba(255,255,255,0.1)'}; background: ${isSel ? 'rgba(16, 185, 129, 0.18)' : 'var(--bg-primary)'}; color: ${isSel ? '#34d399' : '#94a3b8'}; transition: all 0.15s ease;" onclick="window.tripPlanner.toggleTrainingEmailClass('${this.escapeHtml(c.id)}')">
          <input type="checkbox" ${isSel ? 'checked' : ''} style="accent-color: #10b981; pointer-events: none; margin: 0; width: 13px; height: 13px;">
          <span><strong>${c.date ? this.formatEmailDate(c.date) : 'Date TBD'}:</strong> ${this.escapeHtml(c.certType || c.title)}</span>
          <span style="opacity: 0.75; font-size: 10px;">(${this.escapeHtml(crewLabel)})</span>
          ${c.location ? `<span style="font-size: 9.5px; opacity: 0.6;">· 📍 ${this.escapeHtml(c.location)}</span>` : ''}
          ${c.time ? `<span style="font-size: 9.5px; opacity: 0.85; color: #6ee7b7;">· ⏰ ${this.escapeHtml(c.time)}</span>` : ''}
        </div>
      `;
    }).join('');
  }

  updateTrainingEmailClassesCountBadge() {
    const badge = document.getElementById('training-email-classes-count');
    if (badge) {
      const count = this._trainingEmailSelectedClassIds ? this._trainingEmailSelectedClassIds.size : 0;
      badge.textContent = `${count} Class${count === 1 ? '' : 'es'} Selected`;
    }
  }

  renderTrainingEmailModalContent() {
    const container = document.getElementById('training-email-modal-body');
    if (!container) return;

    const allManual = this.manualTasks || [];
    const allClasses = allManual
      .filter(m => m.taskCategory === 'cert_class' || !!m.certType)
      .sort((a, b) => this.compareTasksByDateAndTime(a, b));

    const s = this._trainingEmailStartDate;
    const e = this._trainingEmailEndDate;

    const matchingClasses = allClasses.filter(c => {
      if (!c.date) return !s && !e;
      if (s && c.date < s) return false;
      if (e && c.date > e) return false;
      return true;
    });

    if (!this._trainingEmailSelectedClassIds) this._trainingEmailSelectedClassIds = new Set();
    const selectedClasses = allClasses.filter(c => this._trainingEmailSelectedClassIds.has(c.id));

    this.updateTrainingEmailClassesCountBadge();

    // Gather recipients
    const foremanEmails = [];
    const allEmails = [];
    selectedClasses.forEach(task => {
      const res = this.resolveClassAttendees(task);
      (res.foremanEmails || []).forEach(em => { if (em && !foremanEmails.includes(em)) foremanEmails.push(em); });
      (res.allEmails || []).forEach(em => { if (em && !allEmails.includes(em)) allEmails.push(em); });
    });

    let defaultSubject = '';
    if (selectedClasses.length === 1) {
      const t = selectedClasses[0];
      defaultSubject = `Upcoming Training: ${t.certType || t.title} - ${this.formatEmailDate(t.date)}${t.location ? ` (${t.location})` : ''}`;
    } else if (selectedClasses.length > 1) {
      defaultSubject = `Scheduled Safety Training Classes: ${this.getTrainingEmailRangeSummaryText()} (${selectedClasses.length} Sessions)`;
    } else {
      defaultSubject = s || e ? `Scheduled Safety Training Classes: ${this.getTrainingEmailRangeSummaryText()}` : 'Upcoming Scheduled Safety Training Classes';
    }

    const defaultNote = 'Team, please review the upcoming scheduled safety training session details, locations, and attendee rosters below. Please ensure all assigned crew members arrive on time and prepared with required PPE.';

    container.innerHTML = `
      <!-- Date Range Filter & Quick Presets Strip -->
      <div style="background: rgba(15, 23, 42, 0.7); border: 1px solid rgba(16, 185, 129, 0.3); border-radius: 8px; padding: 12px 14px; display: flex; flex-direction: column; gap: 10px;">
        <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px;">
          <div style="font-size: 11px; font-weight: 800; color: #34d399; letter-spacing: 0.5px; display: flex; align-items: center; gap: 6px;">
            <span>📅</span> FILTER BY DATE RANGE
          </div>
          <!-- Quick Presets -->
          <div style="display: flex; gap: 4px; flex-wrap: wrap;">
            <button type="button" id="training-preset-this_week" class="btn btn-secondary" style="padding: 2px 7px; font-size: 10px; color: #6ee7b7; border-color: rgba(16, 185, 129, 0.35); background: rgba(16, 185, 129, 0.08);" onclick="window.tripPlanner.setTrainingEmailDatePreset('this_week')">This Week</button>
            <button type="button" id="training-preset-next_week" class="btn btn-secondary" style="padding: 2px 7px; font-size: 10px; color: #6ee7b7; border-color: rgba(16, 185, 129, 0.35); background: rgba(16, 185, 129, 0.08);" onclick="window.tripPlanner.setTrainingEmailDatePreset('next_week')">Next Week</button>
            <button type="button" id="training-preset-next_2_weeks" class="btn btn-secondary" style="padding: 2px 7px; font-size: 10px; color: #6ee7b7; border-color: rgba(16, 185, 129, 0.35); background: rgba(16, 185, 129, 0.08);" onclick="window.tripPlanner.setTrainingEmailDatePreset('next_2_weeks')">Next 2 Wks</button>
            <button type="button" id="training-preset-this_month" class="btn btn-secondary" style="padding: 2px 7px; font-size: 10px; color: #6ee7b7; border-color: rgba(16, 185, 129, 0.35); background: rgba(16, 185, 129, 0.08);" onclick="window.tripPlanner.setTrainingEmailDatePreset('this_month')">This Month</button>
            <button type="button" id="training-preset-next_month" class="btn btn-secondary" style="padding: 2px 7px; font-size: 10px; color: #6ee7b7; border-color: rgba(16, 185, 129, 0.35); background: rgba(16, 185, 129, 0.08);" onclick="window.tripPlanner.setTrainingEmailDatePreset('next_month')">Next Month</button>
            <button type="button" id="training-preset-all" class="btn btn-secondary" style="padding: 2px 7px; font-size: 10px; color: #93c5fd; border-color: rgba(59, 130, 246, 0.35); background: rgba(59, 130, 246, 0.08);" onclick="window.tripPlanner.setTrainingEmailDatePreset('all')">All Dates</button>
          </div>
        </div>

        <div style="display: flex; align-items: center; gap: 10px; flex-wrap: wrap;">
          <div style="display: flex; align-items: center; gap: 6px;">
            <label style="font-size: 11px; font-weight: 700; color: #cbd5e1;">FROM:</label>
            <input type="date" id="training-email-start-date" value="${this._trainingEmailStartDate || ''}" style="padding: 5px 8px; font-size: 12px; background: var(--bg-primary); border: 1px solid var(--border-color); border-radius: 5px; color: #fff;" onchange="window.tripPlanner.onTrainingEmailDateRangeChange()">
          </div>
          <div style="display: flex; align-items: center; gap: 6px;">
            <label style="font-size: 11px; font-weight: 700; color: #cbd5e1;">TO:</label>
            <input type="date" id="training-email-end-date" value="${this._trainingEmailEndDate || ''}" style="padding: 5px 8px; font-size: 12px; background: var(--bg-primary); border: 1px solid var(--border-color); border-radius: 5px; color: #fff;" onchange="window.tripPlanner.onTrainingEmailDateRangeChange()">
          </div>
          <div style="margin-left: auto; font-size: 11px; color: #94a3b8; font-weight: 600;" id="training-email-range-summary">
            ${this.getTrainingEmailRangeSummaryText()}
          </div>
        </div>

        <!-- Class Selector Header & Chips -->
        <div style="border-top: 1px solid rgba(255,255,255,0.08); padding-top: 8px; margin-top: 2px;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; flex-wrap: wrap; gap: 6px;">
            <div id="training-email-classes-heading" style="font-size: 10.5px; font-weight: 700; color: var(--text-muted); letter-spacing: 0.5px;">
              CLASSES IN RANGE (${matchingClasses.length} found, ${selectedClasses.length} selected):
            </div>
            <div style="display: flex; gap: 4px;">
              <button type="button" class="btn btn-secondary" style="padding: 1px 6px; font-size: 9.5px; color: #93c5fd;" onclick="window.tripPlanner.selectAllTrainingEmailClasses()">Select All in Range</button>
              <button type="button" class="btn btn-secondary" style="padding: 1px 6px; font-size: 9.5px; color: #94a3b8;" onclick="window.tripPlanner.selectNoneTrainingEmailClasses()">Clear</button>
            </div>
          </div>

          <div id="training-email-classes-chips-container" style="display: flex; flex-wrap: wrap; gap: 6px; max-height: 120px; overflow-y: auto; padding: 2px 0;">
            ${this.renderTrainingEmailClassChipsHtml(allClasses, matchingClasses)}
          </div>
        </div>
      </div>

      <!-- Email Fields -->
      <div style="background: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: 8px; padding: 14px; display: flex; flex-direction: column; gap: 10px;">
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
          <div>
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
              <label style="font-size: 10.5px; font-weight: 700; color: var(--text-muted); letter-spacing: 0.5px;">TO (RECIPIENTS):</label>
              <div style="display: flex; gap: 4px;">
                <button type="button" class="btn btn-secondary" style="padding: 1px 6px; font-size: 9.5px; color: #60a5fa;" onclick="window.tripPlanner.addForemenEmailsToRecipientInput()" title="Add emails of foremen for selected classes">
                  + Foremen (${foremanEmails.length})
                </button>
                <button type="button" class="btn btn-secondary" style="padding: 1px 6px; font-size: 9.5px; color: #34d399;" onclick="window.tripPlanner.addAllAttendeeEmailsToRecipientInput()" title="Add all attendee emails">
                  + All (${allEmails.length})
                </button>
              </div>
            </div>
            <input type="text" id="training-email-to-input" class="form-control" value="${this.escapeHtml(foremanEmails.join(', '))}" placeholder="Enter emails separated by comma..." style="width: 100%; box-sizing: border-box; font-size: 12px; padding: 6px 10px; background: var(--bg-primary); border: 1px solid var(--border-color); border-radius: 6px; color: #fff;">
          </div>
          <div>
            <label style="display: block; font-size: 10.5px; font-weight: 700; color: var(--text-muted); margin-bottom: 4px; letter-spacing: 0.5px;">CC (OPTIONAL):</label>
            <input type="text" id="training-email-cc-input" class="form-control" placeholder="e.g. superintendent@example.com, management@example.com" style="width: 100%; box-sizing: border-box; font-size: 12px; padding: 6px 10px; background: var(--bg-primary); border: 1px solid var(--border-color); border-radius: 6px; color: #fff;">
          </div>
        </div>

        <div>
          <label style="display: block; font-size: 10.5px; font-weight: 700; color: var(--text-muted); margin-bottom: 4px; letter-spacing: 0.5px;">SUBJECT LINE:</label>
          <input type="text" id="training-email-subject-input" class="form-control" value="${this.escapeHtml(defaultSubject)}" style="width: 100%; box-sizing: border-box; font-size: 12.5px; font-weight: 600; padding: 7px 10px; background: var(--bg-primary); border: 1px solid var(--border-color); border-radius: 6px; color: #fff;" oninput="window.tripPlanner.updateTrainingEmailLivePreview()">
        </div>

        <div>
          <label style="display: block; font-size: 10.5px; font-weight: 700; color: var(--text-muted); margin-bottom: 4px; letter-spacing: 0.5px;">MESSAGE / INSTRUCTIONS (PREPENDED TO ROSTER):</label>
          <textarea id="training-email-note-input" class="form-control" rows="2" style="width: 100%; box-sizing: border-box; font-size: 12px; padding: 6px 10px; background: var(--bg-primary); border: 1px solid var(--border-color); border-radius: 6px; color: #fff; resize: vertical;" oninput="window.tripPlanner.updateTrainingEmailLivePreview()">${defaultNote}</textarea>
        </div>
      </div>

      <!-- Preview Tabs & Container -->
      <div style="display: flex; flex-direction: column; gap: 8px;">
        <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--border-color); padding-bottom: 6px;">
          <div style="display: flex; gap: 6px;">
            <button type="button" id="tab-btn-email-html" class="btn" style="padding: 4px 10px; font-size: 11px; font-weight: 700; border-radius: 5px; cursor: pointer; border: 1px solid #10b981; background: rgba(16, 185, 129, 0.2); color: #34d399;" onclick="window.tripPlanner.switchTrainingEmailPreviewTab('html')">
              📄 Formatted HTML (Outlook / Gmail)
            </button>
            <button type="button" id="tab-btn-email-text" class="btn" style="padding: 4px 10px; font-size: 11px; font-weight: 700; border-radius: 5px; cursor: pointer; border: 1px solid rgba(255,255,255,0.1); background: var(--bg-primary); color: #94a3b8;" onclick="window.tripPlanner.switchTrainingEmailPreviewTab('text')">
              📝 Plain Text (SMS / Slack)
            </button>
          </div>
          <span style="font-size: 11px; color: var(--text-muted);">
            👁️ Live Email Output Preview
          </span>
        </div>

        <div id="training-email-preview-container" style="border: 1px solid var(--border-color); border-radius: 6px; overflow: hidden; background: #ffffff;">
          <!-- Injected dynamically -->
        </div>
      </div>
    `;

    this.updateTrainingEmailPresetButtonsUi();
    this.updateTrainingEmailLivePreview();
  }

  updateTrainingEmailRecipientsAndSubject() {
    const allManual = this.manualTasks || [];
    const selectedClasses = allManual.filter(c => (c.taskCategory === 'cert_class' || !!c.certType) && this._trainingEmailSelectedClassIds && this._trainingEmailSelectedClassIds.has(c.id));

    const foremanEmails = [];
    selectedClasses.forEach(task => {
      const res = this.resolveClassAttendees(task);
      (res.foremanEmails || []).forEach(em => { if (em && !foremanEmails.includes(em)) foremanEmails.push(em); });
    });

    const toInput = document.getElementById('training-email-to-input');
    if (toInput && !toInput.dataset.userEdited) {
      toInput.value = foremanEmails.join(', ');
    }

    const subjInput = document.getElementById('training-email-subject-input');
    if (subjInput && !subjInput.dataset.userEdited) {
      const s = this._trainingEmailStartDate;
      const e = this._trainingEmailEndDate;
      if (selectedClasses.length === 1) {
        const t = selectedClasses[0];
        subjInput.value = `Upcoming Training: ${t.certType || t.title} - ${this.formatEmailDate(t.date)}${t.location ? ` (${t.location})` : ''}`;
      } else if (selectedClasses.length > 1) {
        subjInput.value = `Scheduled Safety Training Classes: ${this.getTrainingEmailRangeSummaryText()} (${selectedClasses.length} Sessions)`;
      } else {
        subjInput.value = s || e ? `Scheduled Safety Training Classes: ${this.getTrainingEmailRangeSummaryText()}` : 'Upcoming Scheduled Safety Training Classes';
      }
    }
  }

  addForemenEmailsToRecipientInput() {
    const allManual = this.manualTasks || [];
    const selectedClasses = allManual.filter(c => (c.taskCategory === 'cert_class' || !!c.certType) && this._trainingEmailSelectedClassIds.has(c.id));
    const foremanEmails = [];
    selectedClasses.forEach(task => {
      const res = this.resolveClassAttendees(task);
      (res.foremanEmails || []).forEach(em => { if (em && !foremanEmails.includes(em)) foremanEmails.push(em); });
    });
    const toInput = document.getElementById('training-email-to-input');
    if (toInput) {
      const existing = toInput.value.split(',').map(s => s.trim()).filter(Boolean);
      foremanEmails.forEach(e => { if (!existing.includes(e)) existing.push(e); });
      toInput.value = existing.join(', ');
      toInput.dataset.userEdited = 'true';
      this.showEmailToast(`Added ${foremanEmails.length} foremen emails.`);
    }
  }

  addAllAttendeeEmailsToRecipientInput() {
    const allManual = this.manualTasks || [];
    const selectedClasses = allManual.filter(c => (c.taskCategory === 'cert_class' || !!c.certType) && this._trainingEmailSelectedClassIds.has(c.id));
    const allEmails = [];
    selectedClasses.forEach(task => {
      const res = this.resolveClassAttendees(task);
      (res.allEmails || []).forEach(em => { if (em && !allEmails.includes(em)) allEmails.push(em); });
    });
    const toInput = document.getElementById('training-email-to-input');
    if (toInput) {
      const existing = toInput.value.split(',').map(s => s.trim()).filter(Boolean);
      allEmails.forEach(e => { if (!existing.includes(e)) existing.push(e); });
      toInput.value = existing.join(', ');
      toInput.dataset.userEdited = 'true';
      this.showEmailToast(`Added ${allEmails.length} attendee emails.`);
    }
  }

  switchTrainingEmailPreviewTab(tab) {
    this._trainingEmailActiveTab = tab;
    const btnHtml = document.getElementById('tab-btn-email-html');
    const btnText = document.getElementById('tab-btn-email-text');
    if (btnHtml && btnText) {
      if (tab === 'html') {
        btnHtml.style.border = '1px solid #10b981';
        btnHtml.style.background = 'rgba(16, 185, 129, 0.2)';
        btnHtml.style.color = '#34d399';
        btnText.style.border = '1px solid rgba(255,255,255,0.1)';
        btnText.style.background = 'var(--bg-primary)';
        btnText.style.color = '#94a3b8';
      } else {
        btnText.style.border = '1px solid #10b981';
        btnText.style.background = 'rgba(16, 185, 129, 0.2)';
        btnText.style.color = '#34d399';
        btnHtml.style.border = '1px solid rgba(255,255,255,0.1)';
        btnHtml.style.background = 'var(--bg-primary)';
        btnHtml.style.color = '#94a3b8';
      }
    }
    this.updateTrainingEmailLivePreview();
  }

  getSelectedTrainingTasks() {
    const allManual = this.manualTasks || [];
    return allManual
      .filter(m => (m.taskCategory === 'cert_class' || !!m.certType) && this._trainingEmailSelectedClassIds && this._trainingEmailSelectedClassIds.has(m.id))
      .sort((a, b) => this.compareTasksByDateAndTime(a, b));
  }

  generateTrainingEmailHtml() {
    const selected = this.getSelectedTrainingTasks();
    const noteEl = document.getElementById('training-email-note-input');
    const noteText = noteEl ? noteEl.value.trim() : '';

    if (selected.length === 0) {
      return `
        <div style="padding: 30px; text-align: center; color: #64748b; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
          <div style="font-size: 24px; margin-bottom: 6px;">⚠️</div>
          <div style="font-weight: 700; color: #0f172a;">No Classes Selected</div>
          <div style="font-size: 13px;">Please select at least one training class from the list above.</div>
        </div>
      `;
    }

    let html = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1e293b; background: #ffffff; padding: 20px; line-height: 1.5; font-size: 13px;">
        ${noteText ? `
          <div style="background: #f8fafc; border-left: 4px solid #10b981; border-radius: 4px; padding: 12px 14px; margin-bottom: 20px; color: #334155; font-size: 13.5px; line-height: 1.5;">
            ${this.escapeHtml(noteText).replace(/\n/g, '<br>')}
          </div>
        ` : ''}

        <div style="margin-bottom: 16px; border-bottom: 2px solid #059669; padding-bottom: 6px;">
          <h2 style="margin: 0 0 4px 0; color: #064e3b; font-size: 17px; font-weight: 800; display: flex; align-items: center; gap: 6px;">
            <span>🎓</span> Scheduled Safety Training Schedule
          </h2>
          <div style="font-size: 12px; color: #64748b;">
            Mountain Power · Safety & Compliance Department · <strong>${this.escapeHtml(this.getTrainingEmailRangeSummaryText())}</strong> · ${selected.length} Scheduled Session${selected.length === 1 ? '' : 's'}
          </div>
        </div>

        <div style="display: flex; flex-direction: column; gap: 20px;">
    `;

    selected.forEach((task, idx) => {
      const resolved = this.resolveClassAttendees(task);
      const isDone = task.status === 'Complete';
      const formattedDate = this.formatEmailDate(task.date, 'long');
      const timeStr = task.time || 'Time TBD';
      const locStr = task.location || 'Location TBD';
      const instructorStr = task.instructor || 'Cody Bechdol';

      html += `
        <div style="border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.05); margin-bottom: 16px;">
          <!-- Card Header -->
          <div style="background: ${isDone ? '#f1f5f9' : '#f0fdf4'}; border-bottom: 1px solid #e2e8f0; padding: 10px 14px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px;">
            <div>
              <span style="font-size: 11px; font-weight: 800; color: #059669; text-transform: uppercase; letter-spacing: 0.5px;">CLASS #${idx + 1}</span>
              <h3 style="margin: 2px 0 0 0; font-size: 15px; font-weight: 800; color: #0f172a;">
                🎓 ${this.escapeHtml(task.certType || task.title)}
              </h3>
            </div>
            <div style="display: flex; gap: 6px; align-items: center; flex-wrap: wrap;">
              <span style="background: #ffffff; color: #0f172a; border: 1px solid #cbd5e1; font-size: 11px; font-weight: 700; padding: 2px 8px; border-radius: 12px;">
                📍 ${this.escapeHtml(locStr)}
              </span>
              <span style="background: #dbeafe; color: #1e40af; font-size: 11px; font-weight: 700; padding: 2px 8px; border-radius: 12px;">
                👥 ${resolved.totalCount} Attendee${resolved.totalCount === 1 ? '' : 's'}
              </span>
              ${isDone ? `
                <span style="background: #e2e8f0; color: #475569; font-size: 11px; font-weight: 700; padding: 2px 8px; border-radius: 12px;">✅ Completed</span>
              ` : ''}
            </div>
          </div>

          <!-- Concise Logistics Table (Date, Time, Assigned) -->
          <table style="width: 100%; border-collapse: collapse; font-size: 12px; background: #ffffff;">
            <tbody>
              <tr style="border-bottom: 1px solid #f1f5f9;">
                <td style="padding: 7px 14px; color: #475569; width: 50%;">
                  📅 <strong>Date:</strong> <span style="color: #0f172a; font-weight: 700;">${this.escapeHtml(formattedDate)}</span>
                </td>
                <td style="padding: 7px 14px; color: #475569; width: 50%;">
                  ⏰ <strong>Time:</strong> <span style="color: #059669; font-weight: 700;">${this.escapeHtml(timeStr)}</span>
                </td>
              </tr>
              <tr style="border-bottom: 1px solid #f1f5f9;">
                <td colspan="2" style="padding: 7px 14px; color: #334155;">
                  🚚 <strong>Assigned:</strong> ${resolved.crews.length > 0 ? resolved.crews.map(c => `<strong>Crew ${this.escapeHtml(c.crewId)}</strong>${c.foreman ? ` (Foreman: <strong>${this.escapeHtml(c.foreman)}</strong>)` : ''}`).join('; ') : '<em>Individual Attendees Only</em>'}
                </td>
              </tr>
              ${task.notes ? `
                <tr style="border-bottom: 1px solid #f1f5f9;">
                  <td colspan="2" style="padding: 7px 14px; color: #b45309; font-size: 11.5px;">
                    📝 <strong>Notes:</strong> ${this.escapeHtml(task.notes)}
                  </td>
                </tr>
              ` : ''}
            </tbody>
          </table>

          <!-- Attendee Roster Section -->
          <div style="padding: 10px 14px 4px 14px; background: #f8fafc; border-top: 1px solid #e2e8f0;">
            ${resolved.crews.length > 0 ? resolved.crews.map(c => `
              <div style="background: #ffffff; border: 1px solid #e2e8f0; border-radius: 6px; padding: 8px 12px; margin-bottom: 8px;">
                <div style="font-size: 12px; font-weight: 800; color: #1e40af; border-bottom: 1px solid #f1f5f9; padding-bottom: 4px; margin-bottom: 6px;">
                  <span>🚚 Crew ${this.escapeHtml(c.crewId)} ${c.foreman ? `· Foreman: ${this.escapeHtml(c.foreman)}` : ''}</span>
                </div>
                <ul style="margin: 0; padding-left: 18px; font-size: 12px; color: #334155;">
                  ${c.members.map(m => `
                    <li style="margin-bottom: 3px;">
                      <strong>${this.escapeHtml(m.name)}</strong>
                      <span style="color: #64748b;"> — ${this.escapeHtml(m.role || (m.isForeman ? 'Foreman' : 'Lineman'))}</span>
                      ${m.isForeman ? `<span style="background: #fef08a; color: #854d0e; font-size: 10px; font-weight: 700; padding: 0 4px; border-radius: 3px; margin-left: 4px;">Foreman</span>` : ''}
                    </li>
                  `).join('')}
                </ul>
              </div>
            `).join('') : ''}

            ${resolved.individualMembers.length > 0 ? `
              <div style="background: #ffffff; border: 1px solid #e2e8f0; border-radius: 6px; padding: 8px 12px; margin-bottom: 8px;">
                <div style="font-size: 12px; font-weight: 800; color: #7c3aed; border-bottom: 1px solid #f1f5f9; padding-bottom: 4px; margin-bottom: 6px;">
                  👤 Individual Attendees (${resolved.individualMembers.length})
                </div>
                <ul style="margin: 0; padding-left: 18px; font-size: 12px; color: #334155;">
                  ${resolved.individualMembers.map(m => `
                    <li style="margin-bottom: 3px;">
                      <strong>${this.escapeHtml(m.name)}</strong>
                      ${m.role ? `<span style="color: #64748b;"> — ${this.escapeHtml(m.role)}</span>` : ''}
                    </li>
                  `).join('')}
                </ul>
              </div>
            ` : ''}
          </div>
        </div>
      `;
    });

    html += `
        </div>

        <div style="margin-top: 20px; border-top: 1px solid #e2e8f0; padding-top: 14px; font-size: 12px; color: #64748b; line-height: 1.4;">
          <strong>Mountain Power Safety & Operations</strong><br>
          Cody Bechdol · Safety Director<br>
          Generated via Safety Assistant Trip Planner
        </div>
      </div>
    `;

    return html;
  }

  generateTrainingEmailPlainText() {
    const selected = this.getSelectedTrainingTasks();
    const noteEl = document.getElementById('training-email-note-input');
    const noteText = noteEl ? noteEl.value.trim() : '';

    if (selected.length === 0) {
      return 'No training classes selected.';
    }

    let text = `UPCOMING SAFETY TRAINING SCHEDULE\n============================================================\n`;
    text += `DATE RANGE: ${this.getTrainingEmailRangeSummaryText()}\n`;
    text += `SESSIONS:   ${selected.length} Scheduled\n`;
    text += `============================================================\n\n`;

    if (noteText) {
      text += `${noteText}\n\n`;
      text += `============================================================\n\n`;
    }

    selected.forEach((task, idx) => {
      const resolved = this.resolveClassAttendees(task);
      const formattedDate = this.formatEmailDate(task.date, 'long');
      const timeStr = task.time || 'Time TBD';
      const locStr = task.location || 'Location TBD';

      text += `SESSION #${idx + 1}: ${task.certType || task.title}\n`;
      text += `LOCATION:   ${locStr} | ATTENDEES: ${resolved.totalCount}\n`;
      text += `------------------------------------------------------------\n`;
      text += `  • DATE:     ${formattedDate}\n`;
      text += `  • TIME:     ${timeStr}\n`;
      if (resolved.crews.length > 0) {
        text += `  • ASSIGNED: ${resolved.crews.map(c => `Crew ${c.crewId}${c.foreman ? ` (Foreman: ${c.foreman})` : ''}`).join(', ')}\n`;
      }
      if (task.notes) {
        text += `  • NOTES:    ${task.notes}\n`;
      }
      text += `\n`;
      if (resolved.crews.length > 0) {
        resolved.crews.forEach(c => {
          text += `  [Crew ${c.crewId}]${c.foreman ? ` (Foreman: ${c.foreman})` : ''}:\n`;
          c.members.forEach(m => {
            text += `    - ${m.name} (${m.role || (m.isForeman ? 'Foreman' : 'Lineman')})\n`;
          });
        });
      }

      if (resolved.individualMembers.length > 0) {
        text += `  [Individual Attendees] - ${resolved.individualMembers.length} Workers:\n`;
        resolved.individualMembers.forEach(m => {
          text += `    - ${m.name}${m.role ? ` (${m.role})` : ''}\n`;
        });
      }

      text += `\n`;
    });

    text += `============================================================\n`;
    text += `Mountain Power Safety & Operations\n`;
    text += `Cody Bechdol · Safety Director\n`;
    text += `Generated via Safety Assistant Trip Planner\n`;

    return text;
  }

  updateTrainingEmailLivePreview() {
    const container = document.getElementById('training-email-preview-container');
    if (!container) return;

    if (this._trainingEmailActiveTab === 'text') {
      const text = this.generateTrainingEmailPlainText();
      container.innerHTML = `
        <pre style="margin: 0; padding: 16px; font-family: Consolas, Monaco, 'Courier New', monospace; font-size: 11.5px; line-height: 1.4; color: #1e293b; background: #f8fafc; white-space: pre-wrap; word-break: break-word; max-height: 400px; overflow-y: auto;">${this.escapeHtml(text)}</pre>
      `;
    } else {
      const html = this.generateTrainingEmailHtml();
      container.innerHTML = `
        <div style="max-height: 420px; overflow-y: auto; background: #ffffff;">
          ${html}
        </div>
      `;
    }
  }

  async copyTrainingEmailHtml() {
    const html = this.generateTrainingEmailHtml();
    const text = this.generateTrainingEmailPlainText();

    try {
      if (navigator.clipboard && window.ClipboardItem) {
        const blobHtml = new Blob([html], { type: 'text/html' });
        const blobText = new Blob([text], { type: 'text/plain' });
        await navigator.clipboard.write([
          new ClipboardItem({
            'text/html': blobHtml,
            'text/plain': blobText
          })
        ]);
      } else {
        const el = document.createElement('div');
        el.innerHTML = html;
        el.style.position = 'fixed';
        el.style.opacity = '0';
        document.body.appendChild(el);
        const range = document.createRange();
        range.selectNodeContents(el);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
        document.execCommand('copy');
        sel.removeAllRanges();
        document.body.removeChild(el);
      }
      this.showEmailToast('✅ Formatted email copied! Ready to paste into Outlook or Gmail.');
    } catch (err) {
      console.warn('Rich copy fallback to text:', err);
      this.copyTrainingEmailText();
    }
  }

  async copyTrainingEmailText() {
    const text = this.generateTrainingEmailPlainText();
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      this.showEmailToast('✅ Plain text copied to clipboard!');
    } catch (err) {
      alert('Error copying text: ' + err);
    }
  }

  openTrainingEmailClient() {
    const toInput = document.getElementById('training-email-to-input');
    const ccInput = document.getElementById('training-email-cc-input');
    const subjInput = document.getElementById('training-email-subject-input');

    const to = toInput ? toInput.value.trim() : '';
    const cc = ccInput ? ccInput.value.trim() : '';
    const subject = subjInput ? subjInput.value.trim() : 'Scheduled Safety Training';
    const body = this.generateTrainingEmailPlainText();

    let mailtoUrl = `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}`;
    if (cc) mailtoUrl += `&cc=${encodeURIComponent(cc)}`;
    mailtoUrl += `&body=${encodeURIComponent(body)}`;

    window.location.href = mailtoUrl;
  }

  openTrainingEmailGmail() {
    const toInput = document.getElementById('training-email-to-input');
    const ccInput = document.getElementById('training-email-cc-input');
    const subjInput = document.getElementById('training-email-subject-input');

    const to = toInput ? toInput.value.trim() : '';
    const cc = ccInput ? ccInput.value.trim() : '';
    const subject = subjInput ? subjInput.value.trim() : 'Scheduled Safety Training';
    const body = this.generateTrainingEmailPlainText();

    let gmailUrl = `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(to)}&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    if (cc) gmailUrl += `&cc=${encodeURIComponent(cc)}`;

    window.open(gmailUrl, '_blank');
  }

  printTrainingAttendanceRoster() {
    const selected = this.getSelectedTrainingTasks();
    if (selected.length === 0) {
      alert('⚠️ Please select at least one training class to print roster.');
      return;
    }

    const printWin = window.open('', '_blank', 'width=900,height=700');
    if (!printWin) {
      alert('⚠️ Popup blocked. Please allow popups to print roster.');
      return;
    }

    let printHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Training Attendance & Sign-In Sheet</title>
        <style>
          @page { size: portrait; margin: 0.5in; }
          body { font-family: Arial, sans-serif; font-size: 12px; color: #000; margin: 0; padding: 15px; }
          .sheet-header { border-bottom: 2px solid #000; padding-bottom: 8px; margin-bottom: 12px; }
          .sheet-title { font-size: 16px; font-weight: bold; text-transform: uppercase; margin: 0 0 4px 0; }
          .sheet-sub { font-size: 11px; color: #444; }
          .meta-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 14px; font-size: 12px; }
          .meta-item { border: 1px solid #ccc; padding: 6px 10px; }
          table { width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 11.5px; }
          th, td { border: 1px solid #000; padding: 6px 8px; }
          th { background: #eee; font-weight: bold; text-align: left; }
          .sig-line { height: 28px; width: 220px; }
          .footer-sigs { display: flex; justify-content: space-between; margin-top: 30px; font-size: 12px; }
          .footer-sig-box { width: 45%; border-top: 1px solid #000; padding-top: 4px; }
          .page-break { page-break-after: always; }
        </style>
      </head>
      <body>
    `;

    selected.forEach((task, idx) => {
      const resolved = this.resolveClassAttendees(task);
      const formattedDate = this.formatEmailDate(task.date, 'long');
      const timeStr = task.time || 'Time TBD';
      const locStr = task.location || 'Location TBD';
      const instructorStr = task.instructor || 'Cody Bechdol';

      printHtml += `
        <div class="sheet-header">
          <div class="sheet-title">Mountain Power — Training Attendance & Sign-In Roster</div>
          <div class="sheet-sub">Official Safety Training Compliance Record</div>
        </div>

        <div class="meta-grid">
          <div class="meta-item"><strong>Course / Topic:</strong> ${this.escapeHtml(task.certType || task.title)}</div>
          <div class="meta-item"><strong>Date:</strong> ${this.escapeHtml(formattedDate)}</div>
          <div class="meta-item"><strong>Location / Facility:</strong> ${this.escapeHtml(locStr)}</div>
          <div class="meta-item"><strong>Time / Window:</strong> ${this.escapeHtml(timeStr)}</div>
          <div class="meta-item"><strong>Instructor:</strong> ${this.escapeHtml(instructorStr)}</div>
          <div class="meta-item"><strong>Assigned Crews:</strong> ${resolved.crews.map(c => `Crew ${c.crewId}`).join(', ') || 'Individual'}</div>
        </div>

        <table>
          <thead>
            <tr>
              <th style="width: 30px; text-align: center;">#</th>
              <th>Trainee Name</th>
              <th style="width: 150px;">Classification / Role</th>
              <th style="width: 100px;">Crew (Job #)</th>
              <th style="width: 220px;">Trainee Signature</th>
            </tr>
          </thead>
          <tbody>
      `;

      let attendeeIndex = 1;
      if (resolved.crews.length > 0) {
        resolved.crews.forEach(c => {
          c.members.forEach(m => {
            printHtml += `
              <tr>
                <td style="text-align: center;">${attendeeIndex++}</td>
                <td><strong>${this.escapeHtml(m.name)}</strong></td>
                <td>${this.escapeHtml(m.role || (m.isForeman ? 'Foreman' : 'Lineman'))}</td>
                <td>Crew ${this.escapeHtml(c.crewId)}</td>
                <td class="sig-line"></td>
              </tr>
            `;
          });
        });
      }

      if (resolved.individualMembers.length > 0) {
        resolved.individualMembers.forEach(m => {
          printHtml += `
            <tr>
              <td style="text-align: center;">${attendeeIndex++}</td>
              <td><strong>${this.escapeHtml(m.name)}</strong></td>
              <td>${this.escapeHtml(m.role || 'Attendee')}</td>
              <td>Individual</td>
              <td class="sig-line"></td>
            </tr>
          `;
        });
      }

      // Add 4 blank lines for walk-ins / visitors
      for (let i = 0; i < 4; i++) {
        printHtml += `
          <tr>
            <td style="text-align: center; color: #999;">${attendeeIndex++}</td>
            <td style="color: #999;">(Walk-in / Attendee)</td>
            <td></td>
            <td></td>
            <td class="sig-line"></td>
          </tr>
        `;
      }

      printHtml += `
          </tbody>
        </table>

        <div class="footer-sigs">
          <div class="footer-sig-box">
            Instructor Signature: ___________________________<br>
            Name: ${this.escapeHtml(instructorStr)}
          </div>
          <div class="footer-sig-box">
            Date Completed: ___________________________<br>
            Practical Evaluation Passed: [  ] Yes  [  ] No
          </div>
        </div>
      `;

      if (idx < selected.length - 1) {
        printHtml += `<div class="page-break"></div>`;
      }
    });

    printHtml += `
      </body>
      </html>
    `;

    printWin.document.write(printHtml);
    printWin.document.close();
    printWin.focus();
    setTimeout(() => {
      printWin.print();
    }, 250);
  }

  showEmailToast(message, isError = false) {
    const toast = document.getElementById('training-email-toast');
    if (!toast) return;
    toast.textContent = message;
    toast.style.color = isError ? '#f87171' : '#34d399';
    toast.style.display = 'block';
    if (this._emailToastTimer) clearTimeout(this._emailToastTimer);
    this._emailToastTimer = setTimeout(() => {
      toast.style.display = 'none';
    }, 4000);
  }

  setWeeksToShow(weeks) {
    this.weeksToShow = parseInt(weeks, 10) || 8;
    try {
      localStorage.setItem('sa_trip_planner_weeks', this.weeksToShow);
    } catch (e) {}
    [1, 2, 4, 6, 8, 12].forEach(w => {
      const btn = document.getElementById(`btn-span-${w}w`);
      if (btn) {
        if (w === this.weeksToShow) btn.classList.add('active');
        else btn.classList.remove('active');
      }
    });
    this.renderPlanner();
  }

  prevWeek() {
    this.currentDate.setDate(this.currentDate.getDate() - 7);
    this.updateDropdownValue();
    this.renderPlanner();
  }

  nextWeek() {
    this.currentDate.setDate(this.currentDate.getDate() + 7);
    this.updateDropdownValue();
    this.renderPlanner();
  }

  jumpWeeks(n) {
    this.currentDate.setDate(this.currentDate.getDate() + (n * 7));
    this.updateDropdownValue();
    this.renderPlanner();
  }

  currentWeek() {
    this.currentDate = new Date();
    this.updateDropdownValue();
    this.renderPlanner();
  }

  onWeekSelectChange(dateKey) {
    if (dateKey) {
      const parts = dateKey.split('-');
      if (parts.length === 3) {
        this.currentDate = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10), 12, 0, 0);
        this.renderPlanner();
      }
    }
  }

  onDatePickerChange(dateVal) {
    if (dateVal) {
      const parts = dateVal.split('-');
      if (parts.length === 3) {
        this.currentDate = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10), 12, 0, 0);
        this.updateDropdownValue();
        this.renderPlanner();
      }
    }
  }

  populateWeekDropdown() {
    const select = document.getElementById('trip-planner-week-select');
    if (!select) return;
    select.innerHTML = '';

    const today = new Date();
    const dayOfWeek = today.getDay();
    const distToMon = (dayOfWeek === 0 ? -6 : 1) - dayOfWeek;
    const baseMonday = new Date(today.getFullYear(), today.getMonth(), today.getDate() + distToMon, 12, 0, 0);

    // Discover the full range of scheduled trips in past & future
    let minPastWeeks = -26; // 6 months back default
    let maxFutureWeeks = 26; // 6 months forward default

    if (this.plannedTrips) {
      Object.keys(this.plannedTrips).forEach(dateKey => {
        const tripDate = this.parseDate(dateKey);
        if (tripDate) {
          const tripMonday = this.getMondayForDate(tripDate);
          const diffMs = tripMonday.getTime() - baseMonday.getTime();
          const diffWeeks = Math.round(diffMs / (7 * 24 * 60 * 60 * 1000));
          if (diffWeeks < minPastWeeks) minPastWeeks = Math.max(-52, diffWeeks - 2);
          if (diffWeeks > maxFutureWeeks) maxFutureWeeks = Math.min(52, diffWeeks + 4);
        }
      });
    }

    // Generate week options spanning all past scheduled history and future planning window
    for (let w = minPastWeeks; w <= maxFutureWeeks; w++) {
      const mon = new Date(baseMonday);
      mon.setDate(baseMonday.getDate() + (w * 7));
      const fri = new Date(mon);
      fri.setDate(mon.getDate() + 4);

      const yyyy = mon.getFullYear();
      const mm = String(mon.getMonth() + 1).padStart(2, '0');
      const dd = String(mon.getDate()).padStart(2, '0');
      const key = `${yyyy}-${mm}-${dd}`;

      // Check if this week has any scheduled trips
      let tripsCount = 0;
      for (let i = 0; i < 5; i++) {
        const d = new Date(mon);
        d.setDate(mon.getDate() + i);
        const dKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        tripsCount += (this.getTripsForDate(dKey) || []).length;
      }

      let label = `${mon.getMonth() + 1}/${mon.getDate()} - ${fri.getMonth() + 1}/${fri.getDate()}, ${yyyy}`;
      if (w === 0) label += ' ★ (This Week)';
      else if (w === 1) label += ' (+1 Wk)';
      else if (w > 1) label += ` (+${w} Wks)`;
      else if (w === -1) label += ' (-1 Wk)';
      else if (w < -1) label += ` (${w} Wks)`;

      if (tripsCount > 0) {
        label += ` 🚗 [${tripsCount} Trip${tripsCount > 1 ? 's' : ''}]`;
      }

      const opt = document.createElement('option');
      opt.value = key;
      opt.textContent = label;
      select.appendChild(opt);
    }

    this.updateDropdownValue();
  }

  updateDropdownValue() {
    const select = document.getElementById('trip-planner-week-select');
    const datePicker = document.getElementById('trip-planner-date-picker');
    const monday = this.getMondayForDate(this.currentDate);
    const yyyy = monday.getFullYear();
    const mm = String(monday.getMonth() + 1).padStart(2, '0');
    const dd = String(monday.getDate()).padStart(2, '0');
    const key = `${yyyy}-${mm}-${dd}`;

    if (select) {
      select.value = key;
    }
    if (datePicker) {
      datePicker.value = key;
    }
  }

  getMondayForDate(date) {
    const d = new Date(date);
    const day = d.getDay();
    const diff = (day === 0 ? -6 : 1) - day;
    d.setDate(d.getDate() + diff);
    return d;
  }

  setCityFilter(filter) {
    this.cityFilter = filter;
    const btnActive = document.getElementById('btn-filter-active-cities');
    const btnAll = document.getElementById('btn-filter-all-cities');
    if (btnActive && btnAll) {
      if (filter === 'active') {
        btnActive.classList.add('active');
        btnAll.classList.remove('active');
      } else {
        btnActive.classList.remove('active');
        btnAll.classList.add('active');
      }
    }
    this.renderAvailableLocations();
  }

  clearWeekTrips(startMondayKey) {
    const monday = startMondayKey ? this.parseDate(startMondayKey) : this.getMondayForDate(this.currentDate);
    for (let i = 0; i < 5; i++) {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      delete this.plannedTrips[`${yyyy}-${mm}-${dd}`];
    }
    this.saveTrips();
    this.renderPlanner();
  }

  /**
   * Calculates concise task count breakdown for a crew
   */
  getCrewTaskSummary(crewTasks) {
    const activeTasks = (crewTasks || []).filter(t => String(t.status || '').toLowerCase() !== 'complete');
    let gloves = 0;
    let sleeves = 0;
    let blankets = 0;
    let macks = 0;
    let equipment = 0;
    let training = 0;
    let certs = 0;
    let reports = 0;
    let drugTests = 0;
    let overdue = 0;

    activeTasks.forEach(t => {
      if (t.isOverdue || String(t.status || '').toLowerCase() === 'overdue') overdue++;
      const type = String(t.type || '').toLowerCase();
      const item = String(t.itemType || '').toLowerCase();
      const cat = String(t.category || '').toLowerCase();

      if (cat === 'drug testing' || type.includes('drug') || item.includes('drug')) {
        drugTests++;
      } else if (type.includes('glove') || item.includes('glove')) {
        gloves++;
      } else if (type.includes('sleeve') || item.includes('sleeve')) {
        sleeves++;
      } else if (type.includes('blanket') || item.includes('blanket')) {
        blankets++;
      } else if (type.includes('mack') || item.includes('mack')) {
        macks++;
      } else if (cat === 'equipment' || type.includes('tester') || type.includes('phasing') || type.includes('aed') || type.includes('ground') || type.includes('stick') || type.includes('equipment') || type.includes('jumper') || type.includes('cone') || type.includes('first aid')) {
        equipment++;
      } else if (cat === 'training' || type.includes('training')) {
        training++;
      } else if (cat === 'certs' || type.includes('cert') || type.includes('cpr') || type.includes('crane') || type.includes('rescue')) {
        certs++;
      } else if (cat === 'safety reports' || type.includes('safety report') || type.includes('meeting') || type.includes('compliance') || type.includes('jha') || type.includes('checklist')) {
        reports++;
      } else {
        equipment++;
      }
    });

    return {
      total: activeTasks.length,
      overdue,
      gloves,
      sleeves,
      blankets,
      macks,
      equipment,
      training,
      certs,
      reports,
      drugTests
    };
  }

  /**
   * Discovers and builds structured location objects from Job Tracking, Employees, and Master list
   */
  getLocationData() {
    const allKnownLocations = new Set(Object.keys(this.masterLocations || {}));
    const activeCrewsByLoc = {};

    // 1. Scan Job Tracking for all active crews and locations
    const jobTable = this.db.getTable('job_tracking');
    if (jobTable && jobTable.rows) {
      jobTable.rows.forEach(r => {
        const status = String(r['Status'] || r['Job Status'] || '').trim();
        const rawLoc = String(r['Location'] || '').trim();
        const loc = this.cleanPhysicalLocation(rawLoc);
        const rawCrewId = String(r['Job Number'] || r['Crew'] || r['Job #'] || '').trim();
        const crewId = this.getSignificantJobNumber(rawCrewId);
        const foreman = String(r['Foreman'] || r['Crew Lead'] || r['Lead'] || '').trim();
        const crewSize = parseInt(r['Crew Size'] || r['Size'] || 0, 10) || 0;
        const jobName = String(r['Job Name'] || '').trim();

        if (loc && !this.isStatusLocation(loc)) {
          allKnownLocations.add(loc);
          const sLower = status.toLowerCase();
          const isExcludedPrefix = crewId.startsWith('002') || crewId.startsWith('005');
          if (!isExcludedPrefix && (sLower === 'active' || sLower === 'pending start' || (!sLower.includes('completed') && !sLower.includes('on hold') && status !== ''))) {
            if (!activeCrewsByLoc[loc]) {
              activeCrewsByLoc[loc] = [];
            }
            if (crewId && !activeCrewsByLoc[loc].some(c => c.crewId === crewId)) {
              activeCrewsByLoc[loc].push({
                crewId: crewId,
                foreman: foreman || 'Lead',
                crewSize: crewSize,
                jobName: jobName,
                status: status
              });
            }
          }
        }
      });
    }

    // 2. Scan Locations master table from snapshot if present
    const locTable = this.db.getTable('locations');
    if (locTable && locTable.rows) {
      locTable.rows.forEach(r => {
        const rawLoc = String(r['Location'] || '').trim();
        const loc = this.cleanPhysicalLocation(rawLoc);
        if (loc && !this.isStatusLocation(loc)) {
          allKnownLocations.add(loc);
        }
      });
    }

    // 4. Build unified location cards list
    const locationList = [];
    allKnownLocations.forEach(locName => {
      const activeCrews = activeCrewsByLoc[locName] || [];
      const driveInfo = this.getDriveTime(locName);
      locationList.push({
        name: locName,
        activeCrews: activeCrews,
        isActive: activeCrews.length > 0,
        driveTime: driveInfo.time,
        driveDesc: driveInfo.desc,
        mins: driveInfo.mins,
        dir: driveInfo.dir
      });
    });

    // Sort: Active locations first (ordered by crew count desc, then distance asc), then inactive locations
    locationList.sort((a, b) => {
      if (a.isActive && !b.isActive) return -1;
      if (!a.isActive && b.isActive) return 1;
      if (a.isActive && b.isActive) {
        if (b.activeCrews.length !== a.activeCrews.length) {
          return b.activeCrews.length - a.activeCrews.length;
        }
        return a.mins - b.mins;
      }
      return a.name.localeCompare(b.name);
    });

    return {
      locations: locationList,
      activeCount: Object.keys(activeCrewsByLoc).length
    };
  }

  getSignificantJobNumber(jobNum) {
    if (!jobNum) return '';
    const str = String(jobNum).trim();
    const match = str.match(/^(\d+-\d+)/);
    return match ? match[1] : str;
  }

  cleanPhysicalLocation(loc) {
    if (!loc) return '';
    let clean = String(loc).trim();
    const parenMatch = clean.match(/^([^(]+)\s*\([^)]+\)$/);
    if (parenMatch) clean = parenMatch[1].trim();
    return clean.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  }

  isStatusLocation(loc) {
    const lower = String(loc || '').toLowerCase().trim();
    const statusValues = [
      'vacation', 'light duty', 'weeds', 'leave', 'previous employee', 'medical', 
      "worker's comp", 'unknown', 'in testing', 'location', 'lost', 'destroyed', 
      "cody's truck", 'arnett / jm test', 'arnett'
    ];
    return statusValues.some(s => lower === s || lower.includes(`(${s})`));
  }

  getDriveTime(loc) {
    const snap = this.db.getSnapshot();
    const locLower = String(loc || '').toLowerCase().trim();

    // 1. Look up in master verified locations dictionary
    let masterInfo = null;
    for (const [mName, mInfo] of Object.entries(this.masterLocations)) {
      if (mName.toLowerCase() === locLower) {
        masterInfo = mInfo;
        break;
      }
    }

    // 2. Check if snapshot contains driveTimeMap from Google Sheets
    if (snap && snap.configs && snap.configs.driveTimeMap) {
      const dMap = snap.configs.driveTimeMap;
      if (dMap[locLower] !== undefined && typeof dMap[locLower] === 'number') {
        let mins = dMap[locLower];

        // Sanity check: If non-Helena location has mins <= 10, it was entered as hours (e.g., 3 hrs = 180 min)
        if (mins > 0 && mins <= 10 && locLower !== 'helena' && locLower !== 'base' && locLower !== 'office') {
          mins = mins * 60;
        }

        // If masterInfo has an exact verified route and sheet value is unreasonable (e.g. < 20 min when master is >= 45 min), use master
        if (masterInfo && masterInfo.mins >= 45 && mins < 20) {
          mins = masterInfo.mins;
        }

        const h = Math.floor(mins / 60);
        const m = mins % 60;
        const timeStr = h > 0 ? (m > 0 ? `${h}h ${m.toString().padStart(2, '0')}m` : `${h}h`) : `${m}m`;
        return {
          mins: mins,
          time: masterInfo ? masterInfo.time : timeStr,
          desc: masterInfo ? masterInfo.desc : `${timeStr} from Helena`,
          dir: masterInfo ? masterInfo.dir : 'Montana'
        };
      }
    }

    if (masterInfo) {
      return masterInfo;
    }

    return {
      mins: 90,
      time: '1h 30m',
      desc: '1h 30m from Helena Base',
      dir: 'Montana'
    };
  }

  renderPlanner() {
    this.loadSavedTrips();
    const board = document.getElementById('trip-planner-board');
    const scheduleBadge = document.getElementById('trip-planner-schedule-badge');
    if (!board) return;
    board.innerHTML = '';

    // Synchronize UI active button with current weeksToShow
    [1, 2, 4, 6, 8, 12].forEach(w => {
      const btn = document.getElementById(`btn-span-${w}w`);
      if (btn) {
        if (w === this.weeksToShow) btn.classList.add('active');
        else btn.classList.remove('active');
      }
    });

    const snap = this.db.getSnapshot();
    const workSchedule = this.activeSchedule || (snap && snap.configs && snap.configs.workSchedule) || 'Mon-Thu';
    if (scheduleBadge) {
      scheduleBadge.textContent = `🗓️ ${workSchedule} Schedule`;
    }

    const { locations } = this.getLocationData();
    const locMap = {};
    locations.forEach(l => { locMap[l.name] = l; });

    const baseMonday = this.getMondayForDate(this.currentDate);

    // Render multi-week sections based on weeksToShow
    for (let w = 0; w < this.weeksToShow; w++) {
      try {
        const weekMonday = new Date(baseMonday);
        weekMonday.setDate(baseMonday.getDate() + (w * 7));
        const weekDays = this.getDaysForWeek(weekMonday, workSchedule);

      const firstDay = weekDays[0];
      const lastDay = weekDays[weekDays.length - 1];
      const weekDateKey = firstDay.dateKey;
      const tripsInWeek = weekDays.reduce((sum, d) => sum + this.getTripsForDate(d.dateKey).length, 0);
      const drugTestsInWeek = weekDays.reduce((sum, d) => sum + this.getDrugTestsForDate(d.dateKey).length, 0);

      const section = document.createElement('div');
      section.className = 'trip-planner-week-section';

      section.innerHTML = `
        <!-- Week Header -->
        <div class="trip-planner-week-header">
          <div style="display: flex; align-items: center; gap: 10px;">
            <span style="font-size: 15px; font-weight: 800; color: #93c5fd;">
              📅 Week ${w + 1}: ${firstDay.formattedDate} – ${lastDay.formattedDate}, ${firstDay.year}
            </span>
            ${w === 0 ? `
              <span class="badge" style="background: rgba(59, 130, 246, 0.25); color: #60a5fa; font-size: 10.5px; font-weight: 700; padding: 2px 8px; border-radius: 10px;">
                Current View Base
              </span>
            ` : `
              <span class="badge" style="background: rgba(255, 255, 255, 0.08); color: #cbd5e1; font-size: 10.5px; padding: 2px 8px; border-radius: 10px;">
                +${w} Week${w > 1 ? 's' : ''} Out
              </span>
            `}
          </div>

          <div style="display: flex; align-items: center; gap: 8px;">
            <span style="font-size: 11.5px; color: ${(tripsInWeek > 0 || drugTestsInWeek > 0) ? '#4ade80' : 'var(--text-muted)'}; font-weight: 600; display: flex; align-items: center; gap: 6px;">
              ${tripsInWeek > 0 ? `<span>🚗 ${tripsInWeek} City Visit${tripsInWeek > 1 ? 's' : ''}</span>` : ''}
              ${drugTestsInWeek > 0 ? `<span class="badge" style="background: rgba(168, 85, 247, 0.2); color: #d8b4fe; border: 1px solid rgba(168, 85, 247, 0.4); font-size: 10px; font-weight: 700; padding: 1px 6px;">🧪 ${drugTestsInWeek} Drug Test${drugTestsInWeek > 1 ? 's' : ''}</span>` : ''}
              ${tripsInWeek === 0 && drugTestsInWeek === 0 ? '⚪ No trips or tests scheduled' : ''}
            </span>
            ${tripsInWeek > 0 ? `
              <button class="btn btn-secondary" style="padding: 2px 8px; font-size: 10.5px; color: #f87171;" onclick="window.tripPlanner.clearWeekTrips('${weekDateKey}')" title="Clear scheduled trips for this week">
                🗑️ Clear Week
              </button>
            ` : ''}
          </div>
        </div>

        <!-- 5-Day Grid -->
        <div class="trip-planner-week-grid" id="grid-week-${w}"></div>
      `;

      const grid = section.querySelector(`#grid-week-${w}`);

      weekDays.forEach(day => {
        const dateKey = day.dateKey;
        const trips = this.getTripsForDate(dateKey);
        const drugTests = this.getDrugTestsForDate(dateKey);
        const isHoliday = this.isDayHoliday(dateKey);

        const col = document.createElement('div');
        col.className = 'day-column';

        // 1. Render Drug Test appointments if scheduled on this date
        let drugTestsHtml = '';
        if (drugTests.length > 0) {
          const isCollapsed = this.isSectionCollapsed(dateKey, 'drug_tests');
          drugTestsHtml = `
            <div class="day-section-collapsible drug-tests-day-section" style="margin-bottom: 8px;">
              <div style="font-size: 10.5px; font-weight: 800; color: #c084fc; display: flex; align-items: center; justify-content: space-between; padding: 4px 7px; background: rgba(168, 85, 247, 0.12); border-radius: 4px; border-left: 3px solid #a855f7; cursor: pointer; user-select: none;" onclick="window.tripPlanner.toggleSectionCollapse('${dateKey}', 'drug_tests')" title="Click to collapse / expand DOT Drug Tests">
                <span style="display: flex; align-items: center; gap: 5px;">
                  <span id="section-chevron-${dateKey}-drug_tests" style="font-size: 8px; width: 10px; display: inline-block;">${isCollapsed ? '▶' : '▼'}</span>
                  <span>🧪 DOT Drug Tests (${drugTests.length})</span>
                </span>
                <button class="btn btn-secondary" style="padding: 1px 6px; font-size: 9.5px; color: #c084fc; border-color: rgba(168, 85, 247, 0.35); background: rgba(168, 85, 247, 0.08); cursor: pointer;" onclick="event.stopPropagation(); window.sheetNavigator.switchWorkspace('drug_testing')" title="Open DOT Drug Testing Workspace">Manage ↗</button>
              </div>
              <div id="section-body-${dateKey}-drug_tests" style="display: ${isCollapsed ? 'none' : 'flex'}; flex-direction: column; gap: 6px; margin-top: 5px;">
                ${drugTests.map(dt => `
                  <div class="drug-test-appointment-card" style="background: var(--bg-primary); border: 1px solid rgba(168, 85, 247, 0.35); border-left: 4px solid #a855f7; border-radius: 6px; padding: 8px 10px; box-shadow: 0 2px 6px rgba(0,0,0,0.25);">
                    <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 4px;">
                      <div style="font-weight: 700; font-size: 12.5px; color: #f8fafc; cursor: pointer;" onclick="if(window.employeeProfileEngine){window.employeeProfileEngine.openProfileModal('${this.escapeJs(dt.employee)}', 'drug_tests');}" title="Click to view employee profile">
                        👤 <span style="color: #60a5fa; text-decoration: underline dotted;">${this.escapeHtml(dt.employee)}</span>
                      </div>
                      <span class="badge" style="font-size: 9.5px; padding: 1px 5px; font-weight: 700; ${dt.time ? 'background: rgba(59, 130, 246, 0.2); color: #93c5fd; border: 1px solid rgba(59, 130, 246, 0.4);' : 'background: rgba(148, 163, 184, 0.15); color: #94a3b8;'}">
                        ⏰ ${dt.time ? this.formatTimeDisplay(dt.time) : 'Time TBD'}
                      </span>
                    </div>

                    <div style="font-size: 10px; color: #cbd5e1; margin-bottom: 4px; display: flex; align-items: center; gap: 4px; flex-wrap: wrap;">
                      <span class="badge" style="background: rgba(168, 85, 247, 0.15); color: #d8b4fe; font-size: 9.5px; padding: 1px 4px;">
                        ${this.escapeHtml(dt.testType)} (${this.escapeHtml(dt.classification)})
                      </span>
                      <span class="badge" style="background: ${dt.isMobile ? 'rgba(245, 158, 11, 0.15)' : 'rgba(59, 130, 246, 0.15)'}; color: ${dt.isMobile ? '#fcd34d' : '#93c5fd'}; font-size: 9.5px; padding: 1px 4px;">
                        ${dt.isMobile ? '🚐 Mobile' : '🏥 Clinic'}
                      </span>
                      <span class="badge" style="background: ${dt.status === 'Completed' ? 'rgba(16, 185, 129, 0.2)' : (dt.status === 'Scheduled' ? 'rgba(59, 130, 246, 0.2)' : 'rgba(234, 179, 8, 0.2)')}; color: ${dt.status === 'Completed' ? '#34d399' : (dt.status === 'Scheduled' ? '#93c5fd' : '#facc15')}; font-size: 9.5px; padding: 1px 4px;">
                        ${dt.status === 'Completed' ? '✅ Done' : (dt.status === 'Scheduled' ? '📅 Sched' : '⏳ Pending')}
                      </span>
                    </div>

                    ${dt.meetingAddr ? `
                      <div style="font-size: 10.5px; color: #94a3b8; margin-top: 3px; line-height: 1.3;">
                        📍 <strong style="color: #cbd5e1;">Meet:</strong> ${this.escapeHtml(dt.meetingAddr)}
                      </div>
                    ` : (dt.clinicName ? `
                      <div style="font-size: 10.5px; color: #94a3b8; margin-top: 3px; line-height: 1.3;">
                        🏥 <strong style="color: #cbd5e1;">Clinic:</strong> ${this.escapeHtml(dt.clinicName)}${dt.clinicCity ? ' (' + this.escapeHtml(dt.clinicCity) + ')' : ''}
                      </div>
                    ` : '')}

                    ${dt.phone ? `
                      <div style="font-size: 10px; color: #64748b; margin-top: 2px;">
                        📞 ${this.escapeHtml(dt.phone)} ${dt.job ? `· Job ${this.escapeHtml(dt.job)}` : ''}
                      </div>
                    ` : ''}

                    <div style="display: flex; justify-content: flex-end; gap: 4px; margin-top: 5px; padding-top: 4px; border-top: 1px solid rgba(255,255,255,0.06);">
                      ${dt.status !== 'Completed' ? `
                        <button class="btn btn-primary" style="padding: 2px 7px; font-size: 10px; background: #10b981; border: none; font-weight: 700; cursor: pointer;" onclick="window.tripPlanner.markDrugTestDone('${this.escapeJs(dt.employee)}', '${dateKey}')" title="Mark test completed today">
                          ✅ Done
                        </button>
                      ` : `
                        <span style="font-size: 10px; color: #34d399; font-weight: 700; display: flex; align-items: center; gap: 2px;">✓ Completed</span>
                      `}
                      <button class="btn btn-secondary" style="padding: 2px 6px; font-size: 10px; color: #c084fc; border-color: rgba(168, 85, 247, 0.3); cursor: pointer;" onclick="window.sheetNavigator.switchWorkspace('drug_testing')" title="View in DOT Drug Testing">
                        🔍 Details
                      </button>
                    </div>
                  </div>
                `).join('')}
              </div>
            </div>
          `;
        }

        // 2. Render Training Section (Classes Cody teaches)
        const allManualTasks = this.getManualTasksForDate(dateKey);
        const trainingClasses = allManualTasks
          .filter(m => m.taskCategory === 'cert_class' || !!m.certType)
          .sort((a, b) => this.compareTasksByTime(a, b));
        const personalTasks = allManualTasks
          .filter(m => m.taskCategory === 'personal_task' && !m.certType)
          .sort((a, b) => this.compareTasksByTime(a, b));

        let trainingHtml = '';
        if (trainingClasses.length > 0) {
          const isCollapsed = this.isSectionCollapsed(dateKey, 'training');
          const pendingCount = trainingClasses.filter(m => m.status !== 'Complete').length;
          trainingHtml = `
            <div class="day-section-collapsible training-day-section" style="margin-bottom: 8px;">
              <div style="font-size: 10.5px; font-weight: 800; color: #34d399; display: flex; align-items: center; justify-content: space-between; padding: 4px 7px; background: rgba(16, 185, 129, 0.12); border-radius: 4px; border-left: 3px solid #10b981; cursor: pointer; user-select: none;" onclick="window.tripPlanner.toggleSectionCollapse('${dateKey}', 'training')" title="Click to collapse / expand Training Classes">
                <span style="display: flex; align-items: center; gap: 5px;">
                  <span id="section-chevron-${dateKey}-training" style="font-size: 8px; width: 10px; display: inline-block;">${isCollapsed ? '▶' : '▼'}</span>
                  <span>🎓 Training (${pendingCount}/${trainingClasses.length})</span>
                </span>
                <div style="display: flex; gap: 4px; align-items: center;">
                  <button class="btn btn-secondary" style="padding: 1px 6px; font-size: 9.5px; color: #34d399; border-color: rgba(16, 185, 129, 0.35); background: rgba(16, 185, 129, 0.08); cursor: pointer;" onclick="event.stopPropagation(); window.tripPlanner.openComposeTrainingEmailModalForDate('${dateKey}')" title="Compose email for scheduled training classes on ${day.dayName}">📧 Email</button>
                  <button class="btn btn-secondary" style="padding: 1px 6px; font-size: 9.5px; color: #34d399; border-color: rgba(16, 185, 129, 0.35); background: rgba(16, 185, 129, 0.08); cursor: pointer;" onclick="event.stopPropagation(); window.tripPlanner.openAddManualTaskModal('${dateKey}', '${this.escapeJs(day.dayName)}, ${this.escapeJs(day.formattedDate)}', 'cert_class')" title="Schedule Training Class on ${day.dayName}">+ Class</button>
                </div>
              </div>
              <div id="section-body-${dateKey}-training" style="display: ${isCollapsed ? 'none' : 'flex'}; flex-direction: column; gap: 5px; margin-top: 5px;">
                ${trainingClasses.map((mt, classIdx) => {
                  const isDone = mt.status === 'Complete';
                  const resolved = this.resolveClassAttendees(mt);
                  const isRosterOpen = !!(this._rosterExpanded && this._rosterExpanded[mt.id]);
                  return `
                    <div class="manual-task-card cert-class-card" style="background: var(--bg-primary); border: 1px solid ${isDone ? 'rgba(16, 185, 129, 0.3)' : 'rgba(16, 185, 129, 0.4)'}; border-left: 4px solid ${isDone ? '#10b981' : '#059669'}; border-radius: 6px; padding: 7px 9px; box-shadow: 0 1px 4px rgba(0,0,0,0.25); opacity: ${isDone ? '0.65' : '1'}; transition: opacity 0.2s;">
                      <div style="display: flex; align-items: flex-start; justify-content: space-between; gap: 6px;">
                        <div style="display: flex; align-items: flex-start; gap: 7px; flex: 1; min-width: 0;">
                          <input type="checkbox" ${isDone ? 'checked' : ''} onchange="window.tripPlanner.toggleManualTask('${this.escapeHtml(mt.id)}')" style="cursor: pointer; margin-top: 2px; accent-color: #10b981; width: 14px; height: 14px;" title="${isDone ? 'Mark Pending' : 'Mark Class Complete'}">
                          <div style="flex: 1; min-width: 0;">
                            <div style="display: flex; align-items: center; gap: 4px; margin-bottom: 3px; flex-wrap: wrap;">
                              <span class="badge" style="background: rgba(16, 185, 129, 0.15); color: #34d399; border: 1px solid rgba(16, 185, 129, 0.3); font-size: 9px; font-weight: 800; padding: 1px 5px; border-radius: 3px;">
                                🎓 Cert Class
                              </span>
                              ${isDone ? `
                                <span class="badge" style="background: rgba(16, 185, 129, 0.25); color: #a7f3d0; font-size: 9px; padding: 1px 4px;">
                                  ✅ Completed
                                </span>
                              ` : ''}
                              ${resolved.crews.length > 0 ? `
                                <span class="badge" style="background: rgba(59, 130, 246, 0.15); color: #93c5fd; border: 1px solid rgba(59, 130, 246, 0.3); font-size: 9px; font-weight: 700; padding: 1px 4px; border-radius: 3px;" title="Crew makeup auto-syncs with Employees sheet">
                                  🔄 ${resolved.crews.length === 1 ? `Crew ${this.escapeHtml(resolved.crews[0].crewId)}` : `${resolved.crews.length} Crews (${resolved.crewIds.join(', ')})`}
                                </span>
                              ` : ''}
                            </div>
                            <div style="font-size: 12px; font-weight: 800; color: ${isDone ? '#94a3b8' : '#f8fafc'}; text-decoration: ${isDone ? 'line-through' : 'none'}; word-break: break-word; line-height: 1.3;">
                              ${this.escapeHtml(mt.certType || mt.title)}
                            </div>

                            <!-- Attendees / Audience Header -->
                            ${resolved.crews.length > 0 ? `
                              <div style="font-size: 11px; margin-top: 3px; color: #cbd5e1; line-height: 1.3;">
                                ${resolved.crews.length === 1 ? `
                                  <span>🚚 <strong>Crew ${this.escapeHtml(resolved.crews[0].crewId)}</strong></span>
                                  ${resolved.crews[0].foreman ? `<span> (${this.escapeHtml(resolved.crews[0].foreman)})</span>` : ''}
                                  <span style="color: #94a3b8;"> · ${resolved.totalCount} Linemen</span>
                                ` : `
                                  <span>🚚 <strong>${resolved.crews.length} Crews:</strong> ${resolved.crews.map(c => `Crew ${this.escapeHtml(c.crewId)}${c.foreman ? ` (${this.escapeHtml(c.foreman)})` : ''}`).join(', ')}</span>
                                  <span style="color: #94a3b8;"> · ${resolved.totalCount} Linemen</span>
                                `}
                              </div>
                            ` : (resolved.totalCount > 0 ? `
                              <div style="font-size: 11px; margin-top: 3px; color: #cbd5e1; line-height: 1.3;">
                                <span>👥 <strong>${resolved.totalCount} Attendee${resolved.totalCount > 1 ? 's' : ''}:</strong> ${this.escapeHtml(resolved.allAttendees.slice(0, 2).join(', '))}${resolved.totalCount > 2 ? ` +${resolved.totalCount - 2} more` : ''}</span>
                              </div>
                            ` : `
                              <div style="font-size: 11px; margin-top: 3px; color: #94a3b8; font-style: italic;">
                                Unassigned Attendees
                              </div>
                            `)}

                            <div style="font-size: 10px; color: #94a3b8; margin-top: 4px; display: flex; align-items: center; gap: 4px; flex-wrap: wrap;">
                              ${mt.location ? `<span class="badge" style="background: rgba(255,255,255,0.06); color: #cbd5e1; font-size: 9px; padding: 1px 4px;">📍 ${this.escapeHtml(mt.location)}</span>` : ''}
                              ${mt.time ? `<span class="badge" style="background: rgba(16, 185, 129, 0.15); color: #6ee7b7; font-size: 9px; padding: 1px 4px;">⏰ ${this.escapeHtml(mt.time)}</span>` : ''}
                              ${mt.instructor ? `<span class="badge" style="background: rgba(255,255,255,0.04); color: #94a3b8; font-size: 9px; padding: 1px 4px;">👨‍🏫 ${this.escapeHtml(mt.instructor)}</span>` : ''}
                              ${mt.notes ? `<div style="color: var(--text-muted); font-size: 9.5px; margin-top: 2px; width: 100%; word-break: break-word;">📝 ${this.escapeHtml(mt.notes)}</div>` : ''}
                            </div>

                            <!-- Expandable Attendee Roster -->
                            ${resolved.totalCount > 0 ? `
                              <div style="margin-top: 5px; padding-top: 4px; border-top: 1px solid rgba(255,255,255,0.06);">
                                <div style="font-size: 10px; font-weight: 700; color: #60a5fa; cursor: pointer; display: flex; align-items: center; gap: 4px; user-select: none;" onclick="window.tripPlanner.toggleClassRoster('${this.escapeHtml(mt.id)}')" title="Click to show/hide attendee list">
                                  <span id="class-roster-toggle-${this.escapeHtml(mt.id)}">${isRosterOpen ? '▼' : '▶'}</span>
                                  <span>📋 View Attendees (${resolved.totalCount})</span>
                                  ${resolved.crews.length > 0 ? `<span style="font-size: 9px; color: #34d399; margin-left: auto;">🔄 Synced</span>` : ''}
                                </div>
                                <div id="class-roster-${this.escapeHtml(mt.id)}" style="display: ${isRosterOpen ? 'flex' : 'none'}; flex-direction: column; gap: 3px; margin-top: 5px; padding: 4px 6px; background: rgba(0,0,0,0.25); border-radius: 4px;">
                                  ${resolved.crews.length > 1 ? resolved.crews.map(c => `
                                    <div style="font-size: 9.5px; font-weight: 800; color: #93c5fd; margin-top: 4px; padding-bottom: 2px; border-bottom: 1px solid rgba(255,255,255,0.08); display: flex; justify-content: space-between; align-items: center;">
                                      <span>🚚 Crew ${this.escapeHtml(c.crewId)} (${this.escapeHtml(c.foreman || 'Lead')})</span>
                                      <span style="font-size: 8.5px; color: #34d399;">${c.members.length} linemen</span>
                                    </div>
                                    ${c.members.map(m => `
                                      <div style="font-size: 10px; color: #cbd5e1; display: flex; justify-content: space-between; align-items: center; padding-left: 6px;">
                                        <span style="cursor: pointer;" onclick="if(window.employeeProfileEngine){window.employeeProfileEngine.openProfileModal('${this.escapeJs(m.name)}');}" title="View employee profile">
                                          ${m.isForeman ? '👑' : '👤'} <strong style="color: ${m.isForeman ? '#facc15' : '#60a5fa'}; text-decoration: underline dotted;">${this.escapeHtml(m.name)}</strong>
                                        </span>
                                        <span class="badge" style="font-size: 8.5px; padding: 1px 4px; background: rgba(255,255,255,0.06); color: #94a3b8;">${this.escapeHtml(m.role || (m.isForeman ? 'Foreman' : 'Crew'))}</span>
                                      </div>
                                    `).join('')}
                                  `).join('') : resolved.crewMembers.map(m => `
                                    <div style="font-size: 10px; color: #cbd5e1; display: flex; justify-content: space-between; align-items: center;">
                                      <span style="cursor: pointer;" onclick="if(window.employeeProfileEngine){window.employeeProfileEngine.openProfileModal('${this.escapeJs(m.name)}');}" title="View employee profile">
                                        ${m.isForeman ? '👑' : '👤'} <strong style="color: ${m.isForeman ? '#facc15' : '#60a5fa'}; text-decoration: underline dotted;">${this.escapeHtml(m.name)}</strong>
                                      </span>
                                      <span class="badge" style="font-size: 8.5px; padding: 1px 4px; background: rgba(255,255,255,0.06); color: #94a3b8;">${this.escapeHtml(m.role || (m.isForeman ? 'Foreman' : 'Crew'))}</span>
                                    </div>
                                  `).join('')}
                                  ${resolved.individualMembers.length > 0 ? `
                                    <div style="font-size: 9.5px; font-weight: 800; color: #a78bfa; margin-top: 4px; padding-bottom: 2px; border-bottom: 1px solid rgba(255,255,255,0.08);">
                                      👤 Individual Attendees (${resolved.individualMembers.length})
                                    </div>
                                    ${resolved.individualMembers.map(m => `
                                      <div style="font-size: 10px; color: #cbd5e1; display: flex; justify-content: space-between; align-items: center; padding-left: 6px;">
                                        <span style="cursor: pointer;" onclick="if(window.employeeProfileEngine){window.employeeProfileEngine.openProfileModal('${this.escapeJs(m.name)}');}" title="View employee profile">
                                          👤 <strong style="color: #60a5fa; text-decoration: underline dotted;">${this.escapeHtml(m.name)}</strong>
                                        </span>
                                        <span class="badge" style="font-size: 8.5px; padding: 1px 4px; background: rgba(59, 130, 246, 0.15); color: #93c5fd;">Individual</span>
                                      </div>
                                    `).join('')}
                                  ` : ''}
                                </div>
                              </div>
                            ` : ''}
                          </div>
                        </div>
                        <div style="display: flex; align-items: center; gap: 3px;">
                          ${trainingClasses.length > 1 ? `
                            <button style="background: none; border: none; color: ${classIdx > 0 ? '#94a3b8' : '#334155'}; cursor: ${classIdx > 0 ? 'pointer' : 'default'}; padding: 1px 2px; font-size: 10px; line-height: 1; border-radius: 3px;" ${classIdx > 0 ? `onclick="window.tripPlanner.moveManualTask('${this.escapeHtml(mt.id)}', -1)" onmouseover="this.style.color='#34d399'" onmouseout="this.style.color='#94a3b8'"` : 'disabled'} title="${classIdx > 0 ? 'Move Class Up' : ''}">
                              ▲
                            </button>
                            <button style="background: none; border: none; color: ${classIdx < trainingClasses.length - 1 ? '#94a3b8' : '#334155'}; cursor: ${classIdx < trainingClasses.length - 1 ? 'pointer' : 'default'}; padding: 1px 2px; font-size: 10px; line-height: 1; border-radius: 3px;" ${classIdx < trainingClasses.length - 1 ? `onclick="window.tripPlanner.moveManualTask('${this.escapeHtml(mt.id)}', 1)" onmouseover="this.style.color='#34d399'" onmouseout="this.style.color='#94a3b8'"` : 'disabled'} title="${classIdx < trainingClasses.length - 1 ? 'Move Class Down' : ''}">
                              ▼
                            </button>
                          ` : ''}
                          <button style="background: none; border: none; color: #34d399; cursor: pointer; padding: 1px 3px; font-size: 11.5px; line-height: 1; border-radius: 3px;" onmouseover="this.style.color='#10b981'" onmouseout="this.style.color='#34d399'" onclick="window.tripPlanner.openComposeTrainingEmailModal('${this.escapeHtml(mt.id)}')" title="Compose Email for this Class">
                            ✉️
                          </button>
                          <button style="background: none; border: none; color: #64748b; cursor: pointer; padding: 1px 3px; font-size: 11px; line-height: 1; border-radius: 3px;" onmouseover="this.style.color='#60a5fa'" onmouseout="this.style.color='#64748b'" onclick="window.tripPlanner.openEditManualTaskModal('${this.escapeHtml(mt.id)}')" title="Edit Class">
                            ✏️
                          </button>
                          <button style="background: none; border: none; color: #64748b; cursor: pointer; padding: 1px 4px; font-size: 12px; line-height: 1; border-radius: 3px;" onmouseover="this.style.color='#f87171'" onmouseout="this.style.color='#64748b'" onclick="window.tripPlanner.deleteManualTask('${this.escapeHtml(mt.id)}')" title="Delete Class">
                            ✕
                          </button>
                        </div>
                      </div>
                    </div>
                  `;
                }).join('')}
              </div>
            </div>
          `;
        }

        // 3. Render Personal / Office Tasks
        let officeHtml = '';
        if (personalTasks.length > 0) {
          const isCollapsed = this.isSectionCollapsed(dateKey, 'office');
          const pendingCount = personalTasks.filter(m => m.status !== 'Complete').length;
          officeHtml = `
            <div class="day-section-collapsible office-tasks-day-section" style="margin-bottom: 8px;">
              <div style="font-size: 10.5px; font-weight: 800; color: #93c5fd; display: flex; align-items: center; justify-content: space-between; padding: 4px 7px; background: rgba(59, 130, 246, 0.12); border-radius: 4px; border-left: 3px solid #3b82f6; cursor: pointer; user-select: none;" onclick="window.tripPlanner.toggleSectionCollapse('${dateKey}', 'office')" title="Click to collapse / expand Office Tasks">
                <span style="display: flex; align-items: center; gap: 5px;">
                  <span id="section-chevron-${dateKey}-office" style="font-size: 8px; width: 10px; display: inline-block;">${isCollapsed ? '▶' : '▼'}</span>
                  <span>💼 Office Tasks (${pendingCount}/${personalTasks.length})</span>
                </span>
                <button class="btn btn-secondary" style="padding: 1px 6px; font-size: 9.5px; color: #93c5fd; border-color: rgba(59, 130, 246, 0.35); background: rgba(59, 130, 246, 0.08); cursor: pointer;" onclick="event.stopPropagation(); window.tripPlanner.openAddManualTaskModal('${dateKey}', '${this.escapeJs(day.dayName)}, ${this.escapeJs(day.formattedDate)}', 'personal_task')" title="Add Office Task">+ Task</button>
              </div>
              <div id="section-body-${dateKey}-office" style="display: ${isCollapsed ? 'none' : 'flex'}; flex-direction: column; gap: 5px; margin-top: 5px;">
                ${personalTasks.map((mt, taskIdx) => {
                  const isDone = mt.status === 'Complete';
                  const assignee = mt.assignedTo || 'Myself';
                  return `
                    <div class="manual-task-card personal-task-card" style="background: var(--bg-primary); border: 1px solid ${isDone ? 'rgba(16, 185, 129, 0.3)' : 'rgba(59, 130, 246, 0.3)'}; border-left: 4px solid ${isDone ? '#10b981' : (mt.priority === 'High' ? '#ef4444' : '#3b82f6')}; border-radius: 6px; padding: 7px 9px; box-shadow: 0 1px 4px rgba(0,0,0,0.25); opacity: ${isDone ? '0.65' : '1'}; transition: opacity 0.2s;">
                      <div style="display: flex; align-items: flex-start; justify-content: space-between; gap: 6px;">
                        <div style="display: flex; align-items: flex-start; gap: 7px; flex: 1; min-width: 0;">
                          <input type="checkbox" ${isDone ? 'checked' : ''} onchange="window.tripPlanner.toggleManualTask('${this.escapeHtml(mt.id)}')" style="cursor: pointer; margin-top: 2px; accent-color: #10b981; width: 14px; height: 14px;" title="${isDone ? 'Mark Pending' : 'Mark Complete'}">
                          <div style="flex: 1; min-width: 0;">
                            <div style="display: flex; align-items: center; gap: 4px; margin-bottom: 3px; flex-wrap: wrap;">
                              <span class="badge" style="background: rgba(59, 130, 246, 0.15); color: #93c5fd; border: 1px solid rgba(59, 130, 246, 0.3); font-size: 9px; font-weight: 800; padding: 1px 5px; border-radius: 3px;">
                                💼 Personal / Office
                              </span>
                              ${mt.priority === 'High' ? `
                                <span class="badge" style="background: rgba(239, 68, 68, 0.2); color: #f87171; border: 1px solid rgba(239, 68, 68, 0.35); font-size: 9px; padding: 1px 4px;">
                                  🔴 High
                                </span>
                              ` : ''}
                              ${isDone ? `
                                <span class="badge" style="background: rgba(16, 185, 129, 0.25); color: #a7f3d0; font-size: 9px; padding: 1px 4px;">
                                  ✅ Completed
                                </span>
                              ` : ''}
                            </div>
                            <div style="font-size: 12px; font-weight: 700; color: ${isDone ? '#94a3b8' : '#f8fafc'}; text-decoration: ${isDone ? 'line-through' : 'none'}; word-break: break-word; line-height: 1.3;">
                              ${this.escapeHtml(mt.title)}
                            </div>
                            <div style="font-size: 10.5px; color: #94a3b8; margin-top: 3px;">
                              👤 <strong style="color: #cbd5e1;">Assigned:</strong> ${this.escapeHtml(assignee)}
                            </div>
                            <div style="font-size: 10px; color: #94a3b8; margin-top: 4px; display: flex; align-items: center; gap: 4px; flex-wrap: wrap;">
                              ${mt.location ? `<span class="badge" style="background: rgba(255,255,255,0.06); color: #cbd5e1; font-size: 9px; padding: 1px 4px;">📍 ${this.escapeHtml(mt.location)}</span>` : ''}
                              ${mt.time ? `<span class="badge" style="background: rgba(59, 130, 246, 0.15); color: #93c5fd; font-size: 9px; padding: 1px 4px;">⏰ ${this.escapeHtml(mt.time)}</span>` : ''}
                              ${mt.notes ? `<div style="color: var(--text-muted); font-size: 9.5px; margin-top: 2px; width: 100%; word-break: break-word;">📝 ${this.escapeHtml(mt.notes)}</div>` : ''}
                            </div>
                          </div>
                        </div>
                        <div style="display: flex; align-items: center; gap: 3px;">
                          ${personalTasks.length > 1 ? `
                            <button style="background: none; border: none; color: ${taskIdx > 0 ? '#94a3b8' : '#334155'}; cursor: ${taskIdx > 0 ? 'pointer' : 'default'}; padding: 1px 2px; font-size: 10px; line-height: 1; border-radius: 3px;" ${taskIdx > 0 ? `onclick="window.tripPlanner.moveManualTask('${this.escapeHtml(mt.id)}', -1)" onmouseover="this.style.color='#60a5fa'" onmouseout="this.style.color='#94a3b8'"` : 'disabled'} title="${taskIdx > 0 ? 'Move Task Up' : ''}">
                              ▲
                            </button>
                            <button style="background: none; border: none; color: ${taskIdx < personalTasks.length - 1 ? '#94a3b8' : '#334155'}; cursor: ${taskIdx < personalTasks.length - 1 ? 'pointer' : 'default'}; padding: 1px 2px; font-size: 10px; line-height: 1; border-radius: 3px;" ${taskIdx < personalTasks.length - 1 ? `onclick="window.tripPlanner.moveManualTask('${this.escapeHtml(mt.id)}', 1)" onmouseover="this.style.color='#60a5fa'" onmouseout="this.style.color='#94a3b8'"` : 'disabled'} title="${taskIdx < personalTasks.length - 1 ? 'Move Task Down' : ''}">
                              ▼
                            </button>
                          ` : ''}
                          <button style="background: none; border: none; color: #64748b; cursor: pointer; padding: 1px 3px; font-size: 11px; line-height: 1; border-radius: 3px;" onmouseover="this.style.color='#60a5fa'" onmouseout="this.style.color='#64748b'" onclick="window.tripPlanner.openEditManualTaskModal('${this.escapeHtml(mt.id)}')" title="Edit Task">
                            ✏️
                          </button>
                          <button style="background: none; border: none; color: #64748b; cursor: pointer; padding: 1px 4px; font-size: 12px; line-height: 1; border-radius: 3px;" onmouseover="this.style.color='#f87171'" onmouseout="this.style.color='#64748b'" onclick="window.tripPlanner.deleteManualTask('${this.escapeHtml(mt.id)}')" title="Delete Task">
                            ✕
                          </button>
                        </div>
                      </div>
                    </div>
                  `;
                }).join('')}
              </div>
            </div>
          `;
        }

        // 4. Render Tasks (Sidebar Locations, Crews, & Equipment Swaps)
        let tasksHtml = '';
        let totalCrewTasksCount = 0;
        trips.forEach(trip => {
          const locInfo = locMap[trip.location] || null;
          if (locInfo && locInfo.activeCrews) {
            locInfo.activeCrews.forEach(c => {
              const cTasks = window.taskManager ? window.taskManager.getTasksByCrew(c.crewId, weekMonday) : [];
              totalCrewTasksCount += cTasks.length;
            });
          }
        });

        if (trips.length > 0) {
          const isCollapsed = this.isSectionCollapsed(dateKey, 'tasks');
          tasksHtml = `
            <div class="day-section-collapsible tasks-day-section" style="margin-bottom: 8px;">
              <div style="font-size: 10.5px; font-weight: 800; color: #38bdf8; display: flex; align-items: center; justify-content: space-between; padding: 4px 7px; background: rgba(56, 189, 248, 0.12); border-radius: 4px; border-left: 3px solid #38bdf8; cursor: pointer; user-select: none;" onclick="window.tripPlanner.toggleSectionCollapse('${dateKey}', 'tasks')" title="Click to collapse / expand Tasks">
                <span style="display: flex; align-items: center; gap: 5px;">
                  <span id="section-chevron-${dateKey}-tasks" style="font-size: 8px; width: 10px; display: inline-block;">${isCollapsed ? '▶' : '▼'}</span>
                  <span>📋 Tasks (${totalCrewTasksCount > 0 ? `${totalCrewTasksCount} Tasks · ` : ''}${trips.length} ${trips.length === 1 ? 'Location' : 'Locations'})</span>
                </span>
                <span style="font-size: 9px; color: #7dd3fc; opacity: 0.85;">Crews & PPE</span>
              </div>
              <div id="section-body-${dateKey}-tasks" style="display: ${isCollapsed ? 'none' : 'flex'}; flex-direction: column; gap: 6px; margin-top: 5px;">
                ${trips.map(trip => {
                  const locInfo = locMap[trip.location] || null;
                  const drive = this.getDriveTime(trip.location);

                  return `
                    <div class="location-card" draggable="true" data-date="${dateKey}" data-location="${this.escapeHtml(trip.location)}" style="border-left: 4px solid #38bdf8; background: var(--bg-primary); margin-bottom: 4px;">
                      <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 6px;">
                        <div class="location-card-title" style="color: #60a5fa; font-size: 13.5px; font-weight: 800; display: flex; align-items: center; gap: 4px;">
                          📍 ${this.escapeHtml(trip.location)}
                        </div>
                        <span class="badge" style="background: rgba(56, 189, 248, 0.2); color: #38bdf8; font-size: 10px; font-weight: 700; padding: 2px 6px; border-radius: 4px;">
                          🚗 ${this.escapeHtml(drive.time)}
                        </span>
                      </div>
                      
                      <div class="location-card-meta" style="line-height: 1.4; margin-bottom: 6px;">
                        <div style="color: #94a3b8; font-size: 10.5px;">Distance: <strong>${this.escapeHtml(drive.desc)}</strong></div>
                        ${locInfo && locInfo.activeCrews.length > 0 ? `
                          <div style="margin-top: 6px; padding-top: 6px; border-top: 1px solid rgba(255,255,255,0.08);">
                            <div style="font-size: 11px; font-weight: 700; color: #4ade80; margin-bottom: 6px;">
                              🟢 Active Crews & Tasks (${locInfo.activeCrews.length}):
                            </div>
                            ${locInfo.activeCrews.map(c => {
                              const crewTasks = window.taskManager ? window.taskManager.getTasksByCrew(c.crewId, weekMonday) : [];
                              const summary = this.getCrewTaskSummary(crewTasks);

                              return `
                                <div class="crew-task-box" onclick="window.tripPlanner.openCrewTasksModal('${this.escapeHtml(c.crewId)}', '${this.escapeHtml(trip.location)}', 'All', '${dateKey}')" title="Click to view all tasks for Crew ${this.escapeHtml(c.crewId)}">
                                  <div style="font-size: 11px; color: #cbd5e1; display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
                                    <span><strong style="color: #60a5fa;">Crew ${this.escapeHtml(c.crewId)}</strong> (${this.escapeHtml(c.foreman)})</span>
                                    <div style="display: flex; align-items: center; gap: 4px;">
                                      ${summary.overdue > 0 ? `
                                        <span class="badge" style="background: #ef4444; color: #fff; font-size: 9px; font-weight: 700; padding: 1px 4px; border-radius: 3px;">
                                          🔴 ${summary.overdue}
                                        </span>
                                      ` : ''}
                                      <span class="badge" style="background: ${summary.total > 0 ? 'rgba(59, 130, 246, 0.25)' : 'rgba(16, 185, 129, 0.2)'}; color: ${summary.total > 0 ? '#93c5fd' : '#4ade80'}; font-size: 9px; font-weight: 700; padding: 1px 5px;">
                                        ${summary.total > 0 ? `${summary.total} Tasks 🔍` : '✓ Current'}
                                      </span>
                                    </div>
                                  </div>

                                  <!-- Task Count Overview Pills -->
                                  <div style="display: flex; flex-wrap: wrap; gap: 3px; margin-top: 3px;">
                                    ${summary.gloves > 0 ? `<span class="badge" style="background: rgba(59, 130, 246, 0.15); color: #93c5fd; font-size: 9px; padding: 1px 4px; border: 1px solid rgba(59, 130, 246, 0.3);">🧤 ${summary.gloves}</span>` : ''}
                                    ${summary.sleeves > 0 ? `<span class="badge" style="background: rgba(168, 85, 247, 0.15); color: #d8b4fe; font-size: 9px; padding: 1px 4px; border: 1px solid rgba(168, 85, 247, 0.3);">🧤 ${summary.sleeves}</span>` : ''}
                                    ${summary.blankets > 0 ? `<span class="badge" style="background: rgba(236, 72, 153, 0.15); color: #f472b6; font-size: 9px; padding: 1px 4px; border: 1px solid rgba(236, 72, 153, 0.3);">🛏️ ${summary.blankets}</span>` : ''}
                                    ${summary.macks > 0 ? `<span class="badge" style="background: rgba(245, 158, 11, 0.15); color: #fcd34d; font-size: 9px; padding: 1px 4px; border: 1px solid rgba(245, 158, 11, 0.3);">⚡ ${summary.macks}</span>` : ''}
                                    ${summary.equipment > 0 ? `<span class="badge" style="background: rgba(20, 184, 166, 0.15); color: #5eead4; font-size: 9px; padding: 1px 4px; border: 1px solid rgba(20, 184, 166, 0.3);">🧰 ${summary.equipment}</span>` : ''}
                                    ${summary.training > 0 ? `<span class="badge" style="background: rgba(34, 197, 94, 0.15); color: #86efac; font-size: 9px; padding: 1px 4px; border: 1px solid rgba(34, 197, 94, 0.3);">🎓 ${summary.training}</span>` : ''}
                                    ${summary.certs > 0 ? `<span class="badge" style="background: rgba(239, 68, 68, 0.15); color: #fca5a5; font-size: 9px; padding: 1px 4px; border: 1px solid rgba(239, 68, 68, 0.3);">📜 ${summary.certs}</span>` : ''}
                                    ${summary.reports > 0 ? `<span class="badge" style="background: rgba(249, 115, 22, 0.15); color: #fdba74; font-size: 9px; padding: 1px 4px; border: 1px solid rgba(249, 115, 22, 0.3);">📋 ${summary.reports}</span>` : ''}
                                    ${summary.drugTests > 0 ? `<span class="badge" style="background: rgba(139, 92, 246, 0.15); color: #c084fc; font-size: 9px; padding: 1px 4px; border: 1px solid rgba(139, 92, 246, 0.3);">🧪 ${summary.drugTests}</span>` : ''}
                                    ${summary.total === 0 ? `<span style="font-size: 9px; color: #94a3b8; font-style: italic;">✓ No pending tasks</span>` : ''}
                                  </div>
                                </div>
                              `;
                            }).join('')}
                          </div>
                        ` : `
                          <div style="margin-top: 4px; font-size: 11px; color: #94a3b8;">Base / Non-crew visit</div>
                        `}
                      </div>

                      <div style="display: flex; justify-content: flex-end; margin-top: 4px;">
                        <button class="btn btn-secondary" style="padding: 2px 7px; font-size: 9.5px; color: #f87171; border: 1px solid rgba(239, 68, 68, 0.3);" onclick="window.tripPlanner.removeTrip('${dateKey}', '${this.escapeHtml(trip.location)}')">❌ Remove</button>
                      </div>
                    </div>
                  `;
                }).join('')}

                ${!isHoliday ? `
                  <div style="color: var(--text-muted); font-size: 10.5px; text-align: center; border: 1px dashed rgba(255,255,255,0.1); border-radius: 6px; padding: 6px; opacity: 0.85;">
                    + Drop another city from sidebar
                  </div>
                ` : ''}
              </div>
            </div>
          `;
        } else {
          const hasOtherSections = (drugTests.length > 0) || (trainingClasses.length > 0) || (personalTasks.length > 0);
          tasksHtml = `
            <div class="tasks-drop-placeholder" style="margin-top: ${hasOtherSections ? '4px' : '20px'};">
              <div style="color: var(--text-muted); font-size: 11px; text-align: center; border: 1px dashed var(--border-color); border-radius: 6px; padding: ${hasOtherSections ? '8px 6px' : '14px 10px'};">
                ${isHoliday ? '🏖️ Holiday Day' : '+ Drop city / crew tasks from sidebar'}
              </div>
            </div>
          `;
        }

        const cardsHtml = drugTestsHtml + trainingHtml + officeHtml + tasksHtml;

        col.innerHTML = `
          <div class="day-header" style="background: ${isHoliday ? 'linear-gradient(90deg, #854d0e 0%, #1e293b 100%)' : (drugTests.length > 0 ? 'linear-gradient(90deg, rgba(88, 28, 135, 0.4) 0%, #1e293b 100%)' : '#1e293b')};">
            <div style="display: flex; align-items: center; gap: 4px; min-width: 0; flex-wrap: wrap;">
              <span style="font-weight: 800; color: #f8fafc; white-space: nowrap;">${day.dayName}, ${day.formattedDate}</span>
              ${drugTests.length > 0 ? `
                <span class="badge" style="background: rgba(168, 85, 247, 0.25); color: #d8b4fe; border: 1px solid rgba(168, 85, 247, 0.4); font-size: 9px; padding: 1px 4px; border-radius: 3px;" title="${drugTests.length} DOT Drug Test Appt(s) Scheduled">
                  🧪 ${drugTests.length}
                </span>
              ` : ''}
              ${trainingClasses.length > 0 ? `
                <span class="badge" style="background: rgba(16, 185, 129, 0.2); color: #34d399; border: 1px solid rgba(16, 185, 129, 0.35); font-size: 9px; padding: 1px 4px; border-radius: 3px;" title="${trainingClasses.length} Training Class(es)">
                  🎓 ${trainingClasses.filter(t => t.status !== 'Complete').length}
                </span>
              ` : ''}
              ${personalTasks.length > 0 ? `
                <span class="badge" style="background: rgba(59, 130, 246, 0.2); color: #93c5fd; border: 1px solid rgba(59, 130, 246, 0.35); font-size: 9px; padding: 1px 4px; border-radius: 3px;" title="${personalTasks.length} Office Task(s)">
                  💼 ${personalTasks.filter(t => t.status !== 'Complete').length}
                </span>
              ` : ''}
              ${totalCrewTasksCount > 0 ? `
                <span class="badge" style="background: rgba(56, 189, 248, 0.2); color: #7dd3fc; border: 1px solid rgba(56, 189, 248, 0.35); font-size: 9px; padding: 1px 4px; border-radius: 3px;" title="${totalCrewTasksCount} Crew Task(s) from Sidebar">
                  📋 ${totalCrewTasksCount}
                </span>
              ` : ''}
            </div>
            <div style="display: flex; align-items: center; gap: 4px;">
              <button class="btn btn-secondary" style="padding: 1px 5px; font-size: 9px; line-height: 1.2; background: rgba(16, 185, 129, 0.15); color: #34d399; border: 1px solid rgba(16, 185, 129, 0.3); border-radius: 3px; cursor: pointer;" onclick="window.tripPlanner.openAddManualTaskModal('${dateKey}', '${this.escapeJs(day.dayName)}, ${this.escapeJs(day.formattedDate)}', 'cert_class')" title="Schedule Training Class on ${day.dayName}">
                🎓 + Class
              </button>
              <button class="btn btn-secondary" style="padding: 1px 5px; font-size: 9px; line-height: 1.2; background: rgba(59, 130, 246, 0.15); color: #93c5fd; border: 1px solid rgba(59, 130, 246, 0.3); border-radius: 3px; cursor: pointer;" onclick="window.tripPlanner.openAddManualTaskModal('${dateKey}', '${this.escapeJs(day.dayName)}, ${this.escapeJs(day.formattedDate)}', 'personal_task')" title="Add Personal / Office Task on ${day.dayName}">
                💼 + Task
              </button>
              <span class="badge" style="background: ${isHoliday ? '#ca8a04' : (day.isWorkDay ? '#0284c7' : '#475569')}; color: #fff; font-size: 9.5px; padding: 2px 5px; border-radius: 4px;">
                ${isHoliday ? '🏖️ Holiday' : (day.isWorkDay ? 'Work' : 'Off')}
              </span>
            </div>
          </div>
          <div class="card-drop-zone" data-date="${dateKey}" style="background: ${isHoliday ? 'rgba(202, 138, 4, 0.04)' : 'transparent'};">
            ${cardsHtml}
          </div>
        `;

        // Setup drop zone
        const dropZone = col.querySelector('.card-drop-zone');
        dropZone.addEventListener('dragover', (e) => {
          e.preventDefault();
          dropZone.style.backgroundColor = 'rgba(59, 130, 246, 0.15)';
        });
        dropZone.addEventListener('dragleave', () => {
          dropZone.style.backgroundColor = '';
        });
        dropZone.addEventListener('drop', (e) => {
          e.preventDefault();
          dropZone.style.backgroundColor = '';
          const location = e.dataTransfer.getData('text/plain');
          if (location) {
            this.setTrip(dateKey, location);
          }
        });

        grid.appendChild(col);
      });

        board.appendChild(section);
      } catch (weekErr) {
        console.error(`Error rendering week ${w + 1}:`, weekErr);
      }
    }

    this.renderAvailableLocations();
  }

  renderAvailableLocations() {
    const list = document.getElementById('available-locations-list');
    const countBadge = document.getElementById('active-cities-count-badge');
    if (!list) return;
    list.innerHTML = '';

    const { locations, activeCount } = this.getLocationData();

    if (countBadge) {
      countBadge.textContent = `${activeCount} Active`;
    }

    let filtered = locations;

    // Apply category filter
    if (this.cityFilter === 'active') {
      filtered = filtered.filter(l => l.isActive);
    }

    // Apply search keyword filter
    if (this.searchTerm) {
      const q = this.searchTerm;
      filtered = filtered.filter(l => {
        const nameMatch = l.name.toLowerCase().includes(q);
        const crewMatch = l.activeCrews.some(c => 
          c.crewId.toLowerCase().includes(q) || 
          c.foreman.toLowerCase().includes(q) || 
          c.jobName.toLowerCase().includes(q)
        );
        return nameMatch || crewMatch;
      });
    }

    if (filtered.length === 0) {
      list.innerHTML = `
        <div style="padding: 20px 10px; text-align: center; color: var(--text-muted); font-size: 12px;">
          No matching locations found.
        </div>
      `;
      return;
    }

    filtered.forEach(loc => {
      const card = document.createElement('div');
      card.className = 'location-card';
      card.draggable = true;
      card.style.marginBottom = '8px';
      card.style.borderLeft = loc.isActive ? '4px solid #10b981' : '4px solid #64748b';
      card.style.background = 'var(--bg-primary)';

      const totalWorkers = loc.activeCrews.reduce((sum, c) => sum + (c.crewSize || 0), 0);
      const locTasks = window.taskManager ? window.taskManager.getTasksByLocation(loc.name) : [];
      const overdueTasks = locTasks.filter(t => t.isOverdue).length;

      card.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 2px;">
          <div class="location-card-title" style="color: #f8fafc; font-size: 13.5px; font-weight: 700;">📍 ${this.escapeHtml(loc.name)}</div>
          <span style="font-size: 10px; color: #93c5fd; font-weight: 700;">${this.escapeHtml(loc.driveTime)}</span>
        </div>
        
        <div class="location-card-meta" style="font-size: 11px; margin-top: 4px;">
          <div style="color: var(--text-muted); font-size: 10.5px;">${this.escapeHtml(loc.driveDesc)}</div>
          
          ${loc.isActive ? `
            <div style="margin-top: 6px; background: rgba(16, 185, 129, 0.1); border: 1px solid rgba(16, 185, 129, 0.25); border-radius: 4px; padding: 4px 6px;">
              <div style="color: #4ade80; font-weight: 700; font-size: 10.5px; display: flex; justify-content: space-between;">
                <span>🟢 ${loc.activeCrews.length} Active Crew${loc.activeCrews.length > 1 ? 's' : ''}</span>
                ${totalWorkers > 0 ? `<span>${totalWorkers} Linemen</span>` : ''}
              </div>
              
              <div style="display: flex; flex-direction: column; gap: 4px; margin-top: 5px;">
                ${loc.activeCrews.map(c => {
                  const crewTasks = window.taskManager ? window.taskManager.getTasksByCrew(c.crewId) : [];
                  const summary = this.getCrewTaskSummary(crewTasks);

                  return `
                    <div class="crew-task-box" style="margin-bottom: 0; padding: 4px 6px;" onclick="window.tripPlanner.openCrewTasksModal('${this.escapeHtml(c.crewId)}', '${this.escapeHtml(loc.name)}')" title="Click to view tasks for Crew ${this.escapeHtml(c.crewId)}">
                      <div style="display: flex; justify-content: space-between; align-items: center;">
                        <span style="font-size: 10.5px; color: #cbd5e1;"><strong style="color: #60a5fa;">${this.escapeHtml(c.crewId)}</strong> (${this.escapeHtml(c.foreman)})</span>
                        <span style="font-size: 9.5px; color: ${summary.total > 0 ? '#93c5fd' : '#4ade80'};">${summary.total} tasks</span>
                      </div>
                      <div style="display: flex; flex-wrap: wrap; gap: 2px; margin-top: 2px;">
                        ${summary.gloves > 0 ? `<span style="font-size: 9px; color: #93c5fd;">🧤${summary.gloves}</span>` : ''}
                        ${summary.sleeves > 0 ? `<span style="font-size: 9px; color: #d8b4fe;">🧤${summary.sleeves}</span>` : ''}
                        ${summary.training > 0 ? `<span style="font-size: 9px; color: #86efac;">🎓${summary.training}</span>` : ''}
                        ${summary.certs > 0 ? `<span style="font-size: 9px; color: #fca5a5;">📜${summary.certs}</span>` : ''}
                        ${summary.equipment > 0 || summary.macks > 0 ? `<span style="font-size: 9px; color: #5eead4;">⚡${summary.equipment + summary.macks}</span>` : ''}
                        ${summary.reports > 0 ? `<span style="font-size: 9px; color: #fdba74;">📋${summary.reports}</span>` : ''}
                        ${summary.drugTests > 0 ? `<span style="font-size: 9px; color: #c084fc;">🧪${summary.drugTests}</span>` : ''}
                      </div>
                    </div>
                  `;
                }).join('')}
              </div>

              ${locTasks.length > 0 ? `
                <div style="margin-top: 4px; padding-top: 3px; border-top: 1px solid rgba(255,255,255,0.06); font-size: 10px; color: ${overdueTasks > 0 ? '#f87171' : '#facc15'}; display: flex; justify-content: space-between;">
                  <span>📋 ${locTasks.length} task${locTasks.length > 1 ? 's' : ''} total</span>
                  ${overdueTasks > 0 ? `<span>(${overdueTasks} overdue)</span>` : ''}
                </div>
              ` : ''}
            </div>
          ` : `
            <div style="margin-top: 4px; color: #64748b; font-size: 10.5px;">⚪ Standby Location</div>
          `}
        </div>
      `;

      card.addEventListener('dragstart', (e) => {
        e.dataTransfer.setData('text/plain', loc.name);
      });

      list.appendChild(card);
    });
  }

  /**
   * Opens the full task checklist modal for a specific crew
   */
  openCrewTasksModal(crewId, location = '', filterCat = 'All', targetDateKey = null) {
    this.activeModalCrewId = crewId;
    this.activeModalCat = filterCat;
    this.activeModalDateKey = targetDateKey;

    const modal = document.getElementById('crew-tasks-modal');
    const title = document.getElementById('crew-tasks-modal-title');
    const body = document.getElementById('crew-tasks-modal-body');
    const footerMeta = document.getElementById('crew-tasks-modal-footer-meta');
    if (!modal || !body) return;

    const targetDate = targetDateKey ? this.parseDate(targetDateKey) : this.currentDate;

    // Get active (non-completed) tasks for this crew
    const allCrewTasks = window.taskManager ? window.taskManager.getTasksByCrew(crewId, targetDate, false) : [];
    const summary = this.getCrewTaskSummary(allCrewTasks);

    // Get crew details from Job Tracking
    const jobTable = this.db.getTable('job_tracking');
    let foreman = 'Lead';
    let loc = location || 'Helena';
    let crewSize = 0;
    let jobName = '';

    if (jobTable && jobTable.rows) {
      const jobRow = jobTable.rows.find(r => String(r['Job Number'] || r['Crew'] || r['Job #'] || '').trim() === String(crewId).trim());
      if (jobRow) {
        foreman = String(jobRow['Foreman'] || jobRow['Crew Lead'] || jobRow['Lead'] || 'Lead').trim();
        loc = String(jobRow['Location'] || loc).trim();
        crewSize = parseInt(jobRow['Crew Size'] || jobRow['Size'] || 0, 10) || 0;
        jobName = String(jobRow['Job Name'] || '').trim();
      }
    }

    if (title) {
      title.innerHTML = `🚚 Crew ${this.escapeHtml(crewId)} — ${this.escapeHtml(foreman)} <span style="color: #93c5fd; font-size: 12px; font-weight: normal; margin-left: 8px;">📍 ${this.escapeHtml(loc)}</span>`;
    }

    // Filter tasks for active category tab (ignoring completed tasks)
    let filtered = allCrewTasks.filter(t => String(t.status || '').toLowerCase() !== 'complete');
    if (filterCat === 'PPE') {
      filtered = filtered.filter(t => t.category === 'PPE' || (t.type || '').toLowerCase().includes('glove') || (t.type || '').toLowerCase().includes('sleeve') || (t.type || '').toLowerCase().includes('blanket'));
    } else if (filterCat === 'Equipment') {
      filtered = filtered.filter(t => t.category === 'Equipment' || (t.type || '').toLowerCase().includes('mack') || (t.type || '').toLowerCase().includes('tester') || (t.type || '').toLowerCase().includes('phasing') || (t.type || '').toLowerCase().includes('aed') || (t.type || '').toLowerCase().includes('ground') || (t.type || '').toLowerCase().includes('stick') || (t.type || '').toLowerCase().includes('equipment') || (t.type || '').toLowerCase().includes('jumper') || (t.type || '').toLowerCase().includes('cone') || (t.type || '').toLowerCase().includes('first aid'));
    } else if (filterCat === 'Training') {
      filtered = filtered.filter(t => t.category === 'Training' || (t.type || '').toLowerCase().includes('training'));
    } else if (filterCat === 'Certs') {
      filtered = filtered.filter(t => t.category === 'Certs' || (t.type || '').toLowerCase().includes('cert') || (t.type || '').toLowerCase().includes('cpr') || (t.type || '').toLowerCase().includes('crane') || (t.type || '').toLowerCase().includes('rescue'));
    } else if (filterCat === 'Reports') {
      filtered = filtered.filter(t => t.category === 'Safety Reports' || (t.type || '').toLowerCase().includes('safety report') || (t.type || '').toLowerCase().includes('meeting') || (t.type || '').toLowerCase().includes('compliance') || (t.type || '').toLowerCase().includes('jha') || (t.type || '').toLowerCase().includes('checklist'));
    } else if (filterCat === 'DrugTests') {
      filtered = filtered.filter(t => t.category === 'Drug Testing' || (t.type || '').toLowerCase().includes('drug'));
    }

    const safeDateKey = this.escapeHtml(targetDateKey || '');

    body.innerHTML = `
      <!-- Crew Header Banner -->
      <div style="background: linear-gradient(90deg, #1e293b 0%, #0f172a 100%); border: 1px solid var(--border-color); border-radius: 8px; padding: 14px 18px; margin-bottom: 16px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px;">
        <div>
          <div style="font-size: 16px; font-weight: 800; color: #f8fafc;">
            Crew ${this.escapeHtml(crewId)} Work Checklist
          </div>
          <div style="font-size: 12px; color: var(--text-secondary); margin-top: 2px;">
            Foreman: <strong style="color: #fff;">${this.escapeHtml(foreman)}</strong> &nbsp;•&nbsp; 
            Location: <strong style="color: #93c5fd;">${this.escapeHtml(loc)}</strong> &nbsp;•&nbsp; 
            ${crewSize > 0 ? `Crew Size: <strong>${crewSize} Linemen</strong> &nbsp;•&nbsp;` : ''}
            ${jobName ? `Site: <strong>${this.escapeHtml(jobName)}</strong>` : ''}
          </div>
        </div>

        <div style="display: flex; gap: 8px; align-items: center;">
          ${summary.overdue > 0 ? `
            <span class="badge" style="background: #ef4444; color: #fff; font-size: 12px; font-weight: 700; padding: 4px 10px; border-radius: 4px;">
              🔴 ${summary.overdue} Overdue
            </span>
          ` : ''}
          <span class="badge" style="background: rgba(59, 130, 246, 0.25); color: #93c5fd; font-size: 12px; font-weight: 700; padding: 4px 10px; border-radius: 4px; border: 1px solid rgba(59, 130, 246, 0.4);">
            ${allCrewTasks.length} Active Task${allCrewTasks.length > 1 ? 's' : ''}
          </span>
        </div>
      </div>

      <!-- Category Filter Pills -->
      <div style="display: flex; gap: 6px; margin-bottom: 14px; flex-wrap: wrap;">
        <button class="btn btn-secondary ${filterCat === 'All' ? 'active' : ''}" style="padding: 3px 10px; font-size: 11.5px; font-weight: 700;" onclick="window.tripPlanner.openCrewTasksModal('${this.escapeHtml(crewId)}', '${this.escapeHtml(loc)}', 'All', '${safeDateKey}')">
          All Active (${allCrewTasks.length})
        </button>
        <button class="btn btn-secondary ${filterCat === 'PPE' ? 'active' : ''}" style="padding: 3px 10px; font-size: 11.5px;" onclick="window.tripPlanner.openCrewTasksModal('${this.escapeHtml(crewId)}', '${this.escapeHtml(loc)}', 'PPE', '${safeDateKey}')">
          🧤 PPE Swaps (${summary.gloves + summary.sleeves + summary.blankets})
        </button>
        <button class="btn btn-secondary ${filterCat === 'Equipment' ? 'active' : ''}" style="padding: 3px 10px; font-size: 11.5px;" onclick="window.tripPlanner.openCrewTasksModal('${this.escapeHtml(crewId)}', '${this.escapeHtml(loc)}', 'Equipment', '${safeDateKey}')">
          ⚡ Tool & Equipment (${summary.macks + summary.equipment})
        </button>
        <button class="btn btn-secondary ${filterCat === 'Training' ? 'active' : ''}" style="padding: 3px 10px; font-size: 11.5px;" onclick="window.tripPlanner.openCrewTasksModal('${this.escapeHtml(crewId)}', '${this.escapeHtml(loc)}', 'Training', '${safeDateKey}')">
          🎓 Safety Training (${summary.training})
        </button>
        <button class="btn btn-secondary ${filterCat === 'Certs' ? 'active' : ''}" style="padding: 3px 10px; font-size: 11.5px;" onclick="window.tripPlanner.openCrewTasksModal('${this.escapeHtml(crewId)}', '${this.escapeHtml(loc)}', 'Certs', '${safeDateKey}')">
          📜 Certifications (${summary.certs})
        </button>
        ${summary.reports > 0 ? `
          <button class="btn btn-secondary ${filterCat === 'Reports' ? 'active' : ''}" style="padding: 3px 10px; font-size: 11.5px;" onclick="window.tripPlanner.openCrewTasksModal('${this.escapeHtml(crewId)}', '${this.escapeHtml(loc)}', 'Reports', '${safeDateKey}')">
            📋 Safety Reports (${summary.reports})
          </button>
        ` : ''}
        ${summary.drugTests > 0 ? `
          <button class="btn btn-secondary ${filterCat === 'DrugTests' ? 'active' : ''}" style="padding: 3px 10px; font-size: 11.5px;" onclick="window.tripPlanner.openCrewTasksModal('${this.escapeHtml(crewId)}', '${this.escapeHtml(loc)}', 'DrugTests', '${safeDateKey}')">
            🧪 Drug Tests (${summary.drugTests})
          </button>
        ` : ''}
      </div>

      <!-- Task Checklist Items -->
      <div style="display: flex; flex-direction: column; gap: 8px;">
        ${filtered.length === 0 ? `
          <div style="padding: 40px 20px; text-align: center; color: var(--text-muted); background: var(--bg-secondary); border-radius: 8px; border: 1px dashed var(--border-color);">
            <div style="font-size: 28px; margin-bottom: 6px;">🎉</div>
            <h4 style="font-size: 14px; font-weight: 700; color: #f8fafc; margin-bottom: 4px;">All Tasks Complete!</h4>
            <p style="font-size: 12px; color: var(--text-secondary);">All assignments in this category are up to date.</p>
          </div>
        ` : filtered.map(t => {
          const isComplete = String(t.status || '').toLowerCase() === 'complete';
          const isOverdue = t.isOverdue || String(t.status || '').toLowerCase() === 'overdue';
          const badgeColor = isComplete ? '#10b981' : (isOverdue ? '#ef4444' : '#f59e0b');

          return `
            <div style="background-color: var(--bg-primary); border: 1px solid var(--border-color); border-left: 4px solid ${badgeColor}; border-radius: 6px; padding: 12px 14px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px;">
              <div style="flex: 1; min-width: 260px;">
                <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 4px; flex-wrap: wrap;">
                  <span style="font-weight: 800; font-size: 14px; color: #f8fafc;">
                    ${this.escapeHtml(t.type)}: ${this.escapeHtml(t.itemType)}
                  </span>
                  ${t.truckNumber ? `
                    <span class="badge" style="background: rgba(234, 179, 8, 0.15); color: #fde047; border: 1px solid rgba(234, 179, 8, 0.35); font-weight: 700; font-size: 11px; padding: 2px 7px;">
                      🚛 ${this.escapeHtml(t.truckNumber)}
                    </span>
                  ` : ''}
                  ${t.testType ? `
                    <span class="badge" style="background: rgba(139, 92, 246, 0.15); color: #c084fc; border: 1px solid rgba(139, 92, 246, 0.35); font-weight: 700; font-size: 11px; padding: 2px 7px;">
                      🧪 ${this.escapeHtml(t.testType)}
                    </span>
                  ` : ''}
                  ${t.classification ? `
                    <span class="badge" style="background: rgba(59, 130, 246, 0.15); color: #93c5fd; border: 1px solid rgba(59, 130, 246, 0.35); font-weight: 700; font-size: 11px; padding: 2px 7px;">
                      🏛️ ${this.escapeHtml(t.classification)}
                    </span>
                  ` : ''}
                  ${t.currentItem ? `
                    <span class="badge" style="background: rgba(255,255,255,0.06); color: #93c5fd; font-family: monospace; font-size: 11px; padding: 1px 6px;">
                      ${this.escapeHtml(t.currentItem)}
                    </span>
                  ` : ''}
                </div>

                <div style="font-size: 12px; color: var(--text-secondary); display: flex; align-items: center; gap: 12px; flex-wrap: wrap;">
                  <span>
                    👤 Lineman: <strong style="color: #60a5fa; cursor: pointer; text-decoration: underline dotted;" onclick="if(window.employeeProfileEngine){window.employeeProfileEngine.openProfileModal('${this.escapeHtml(t.employee)}');}">${this.escapeHtml(t.employee)}</strong>
                  </span>
                  ${t.truckNumber ? `
                    <span>
                      🚛 Truck: <strong style="color: #fde047;">${this.escapeHtml(t.truckNumber)}</strong>
                    </span>
                  ` : ''}
                  <span style="color: ${isOverdue ? '#f87171' : 'var(--text-secondary)'}; font-weight: ${isOverdue ? '700' : 'normal'};">
                    📅 Due: <strong>${this.escapeHtml(t.dueDate)}</strong>
                  </span>
                  ${t.scheduledDate ? `<span>🗓️ Scheduled: <strong>${this.escapeHtml(t.scheduledDate)}</strong></span>` : ''}
                  ${t.scheduledTime ? `<span>⏰ Time: <strong>${this.escapeHtml(t.scheduledTime)}</strong></span>` : ''}
                </div>

                ${t.meetingAddress ? `
                  <div style="font-size: 11.5px; color: #93c5fd; margin-top: 3px;">
                    📍 <strong>Meeting / Collection Address:</strong> ${this.escapeHtml(t.meetingAddress)}
                  </div>
                ` : ''}

                ${t.notes ? `
                  <div style="font-size: 11px; color: var(--text-muted); margin-top: 4px;">
                    📝 ${this.escapeHtml(t.notes)}
                  </div>
                ` : ''}
              </div>

              <div style="display: flex; align-items: center; gap: 8px;">
                <span class="badge" style="background: ${isComplete ? '#15803d' : (isOverdue ? '#b91c1c' : '#d97706')}; color: #fff; font-size: 11px; font-weight: 700; padding: 3px 8px; border-radius: 4px;">
                  ${isComplete ? '✅ Complete' : (isOverdue ? '🔴 Overdue' : '⏳ Pending')}
                </span>
                ${!isComplete ? `
                  <button class="btn" style="background-color: #10b981; color: #fff; padding: 4px 10px; font-size: 11px; font-weight: 700; border-radius: 4px; cursor: pointer;" onclick="window.tripPlanner.completeTaskInModal('${this.escapeHtml(t.id)}', '${this.escapeHtml(crewId)}', '${this.escapeHtml(loc)}')">
                    ✓ Mark Complete
                  </button>
                  <button class="btn btn-secondary" style="color: #f87171; border: 1px solid rgba(239, 68, 68, 0.35); padding: 4px 8px; font-size: 11px; font-weight: 700; border-radius: 4px; cursor: pointer;" onclick="window.tripPlanner.deleteTaskInModal('${this.escapeHtml(t.id)}', '${this.escapeHtml(t.sourceSheet)}', '${this.escapeHtml(crewId)}', '${this.escapeHtml(loc)}')">
                    🗑️ Delete
                  </button>
                ` : `
                  <span style="color: var(--text-muted); font-size: 11px;">✓ Completed</span>
                  <button class="btn btn-secondary" style="color: #94a3b8; border: 1px solid rgba(255, 255, 255, 0.1); padding: 2px 6px; font-size: 10px; border-radius: 4px; cursor: pointer;" onclick="window.tripPlanner.deleteTaskInModal('${this.escapeHtml(t.id)}', '${this.escapeHtml(t.sourceSheet)}', '${this.escapeHtml(crewId)}', '${this.escapeHtml(loc)}')">
                    🗑️
                  </button>
                `}
              </div>
            </div>
          `;
        }).join('')}
      </div>
    `;

    if (footerMeta) {
      footerMeta.textContent = `Showing ${filtered.length} of ${allCrewTasks.length} tasks for Crew ${crewId}`;
    }

    modal.classList.add('active');
  }

  closeCrewTasksModal() {
    const modal = document.getElementById('crew-tasks-modal');
    if (modal) modal.classList.remove('active');
    this.activeModalCrewId = null;
  }

  completeTaskInModal(taskId, crewId, location) {
    if (window.taskManager) {
      window.taskManager.completeTask(taskId);
      this.openCrewTasksModal(crewId, location, this.activeModalCat, this.activeModalDateKey);
      this.renderPlanner();
    }
  }

  deleteTaskInModal(taskId, sourceSheet, crewId, location) {
    if (window.taskManager) {
      window.taskManager.deleteTask(taskId, sourceSheet);
      this.openCrewTasksModal(crewId, location, this.activeModalCat, this.activeModalDateKey);
      this.renderPlanner();
    }
  }

  addTrip(dateKey, location) {
    if (!location) return;
    const currentList = [...this.getTripsForDate(dateKey)];
    // Prevent duplicate of same city on the exact same day
    if (!currentList.some(t => t.location.toLowerCase() === location.toLowerCase())) {
      currentList.push({ location, crew: '' });
    }
    this.plannedTrips[dateKey] = currentList;
    this.saveTrips();

    // Record mutation for sync
    this.db.addMutation({
      action: 'SET_TRIP_SCHEDULE',
      date: dateKey,
      location: location,
      trips: this.plannedTrips
    });

    this.renderPlanner();
  }

  setTrip(dateKey, location) {
    this.addTrip(dateKey, location);
  }

  removeTrip(dateKey, locationToRemove = null) {
    if (!locationToRemove) {
      delete this.plannedTrips[dateKey];
    } else {
      const currentList = this.getTripsForDate(dateKey);
      const updated = currentList.filter(t => t.location.toLowerCase() !== locationToRemove.toLowerCase());
      if (updated.length === 0) {
        delete this.plannedTrips[dateKey];
      } else {
        this.plannedTrips[dateKey] = updated;
      }
    }
    this.saveTrips();

    this.db.addMutation({
      action: 'SET_TRIP_SCHEDULE',
      date: dateKey,
      location: locationToRemove || '',
      trips: this.plannedTrips
    });

    this.renderPlanner();
  }

  getDaysForWeek(mondayDate, schedule = 'Mon-Thu') {
    const days = [];
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

    for (let i = 0; i < 5; i++) { // Mon, Tue, Wed, Thu, Fri
      const d = new Date(mondayDate);
      d.setDate(mondayDate.getDate() + i);

      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      const dateKey = `${yyyy}-${mm}-${dd}`;
      const dayIndex = d.getDay(); // 1=Mon, 2=Tue, 3=Wed, 4=Thu, 5=Fri

      // Work day logic based on schedule config
      let isWorkDay = false;
      if (schedule === 'Tue-Fri') {
        isWorkDay = (dayIndex >= 2 && dayIndex <= 5); // Tue-Fri
      } else {
        isWorkDay = (dayIndex >= 1 && dayIndex <= 4); // Mon-Thu
      }

      days.push({
        dateKey,
        dayName: dayNames[dayIndex],
        formattedDate: `${d.getMonth() + 1}/${d.getDate()}`,
        year: yyyy,
        isWorkDay: isWorkDay
      });
    }

    return days;
  }

  parseDate(str) {
    if (!str || str === 'N/A') return new Date();
    if (str.includes('-')) {
      const parts = str.split('-');
      if (parts.length === 3) {
        return new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10), 12, 0, 0);
      }
    }
    const d = new Date(str);
    return isNaN(d.getTime()) ? new Date() : d;
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
      .replace(/"/g, '\\"')
      .replace(/\n/g, '\\n')
      .replace(/\r/g, '\\r');
  }
}

window.tripPlanner = new TripPlannerApp(window.localDB);
