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

    if (this.db && typeof this.db.on === 'function') {
      this.db.on('change', () => {
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
    } catch (e) {}
    this.renderPlanner();
  }

  loadManualTasks() {
    try {
      const snap = this.db.getSnapshot();
      if (snap && snap.configs && Array.isArray(snap.configs.manual_tasks)) {
        return snap.configs.manual_tasks;
      }
      const raw = localStorage.getItem('sa_trip_manual_tasks');
      if (raw) return JSON.parse(raw);
    } catch (e) {}
    return [];
  }

  saveManualTasks(tasks) {
    this.manualTasks = tasks || this.manualTasks || [];
    try {
      localStorage.setItem('sa_trip_manual_tasks', JSON.stringify(this.manualTasks));
      const snap = this.db.getSnapshot();
      if (snap) {
        if (!snap.configs) snap.configs = {};
        snap.configs.manual_tasks = this.manualTasks;
        this.db.setSnapshot(snap);
      }
    } catch (e) {}
  }

  getAvailableCertTypes() {
    const certs = [
      'CPR / AED (2-Yr)',
      '1st Aid / First Aid (2-Yr)',
      'CPR & 1st Aid Combo (2-Yr)',
      'Pole Top Rescue (Annual)',
      'Bucket Truck Rescue (Annual)',
      'Forklift Operator Safety Training (3-Yr)',
      'Dig Safe / 811 Excavation (2-Yr)',
      'OSHA 10 Construction',
      'OSHA 30 Construction',
      'OSHA 1910 T&D Refresher',
      'OSHA Trench Competent Person (3-Yr)',
      'Rigging & Signaling / Signalperson (3-Yr)',
      'Crane Safety & Practical Evaluation',
      'Confined Space Entry & Rescue',
      'Flagger & Traffic Control Certification',
      'Defensive Driving / Smith System',
      'Harassment & Workplace Safety (Annual)'
    ];

    if (window.certsConfigEngine && window.certsConfigEngine.certs) {
      window.certsConfigEngine.certs.forEach(c => {
        const name = c.name || c.label || c.key;
        if (name && !certs.some(dc => dc.toLowerCase().includes(name.toLowerCase()))) {
          certs.push(name);
        }
      });
    }

    return certs;
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

    const members = [];
    empTable.rows.forEach(r => {
      const status = String(r['Status'] || '').trim().toLowerCase();
      if (status === 'terminated' || status === 'previous employee') return;
      const rawJob = String(r['Job Number'] || r['Crew'] || '').trim();
      const jobNum = this.getSignificantJobNumber(rawJob).toLowerCase();

      if (jobNum === cleanId) {
        const name = String(r['Name'] || r['Employee Name'] || r['Employee'] || '').trim();
        const role = String(r['Job Classification'] || r['Role'] || r['Title'] || '').trim();
        if (name && !members.some(m => m.name.toLowerCase() === name.toLowerCase())) {
          const isF = role === 'F' || role === 'GF' || role === 'SUP';
          members.push({
            name,
            role,
            isForeman: isF
          });
        }
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
      crewId: task.crewId || '',
      foreman: '',
      crewMembers: [],
      individualMembers: [],
      allAttendees: [],
      totalCount: 0
    };

    const empTable = this.db.getTable('employees');
    const empRows = (empTable && empTable.rows) ? empTable.rows : [];

    const findEmp = (name) => {
      const clean = String(name || '').trim().toLowerCase();
      return empRows.find(r => {
        const n = String(r['Name'] || r['Employee Name'] || r['Employee'] || '').trim().toLowerCase();
        return n === clean;
      });
    };

    if (task.crewId) {
      const crewId = this.getSignificantJobNumber(task.crewId);
      result.crewId = crewId;

      const jobTable = this.db.getTable('job_tracking');
      if (jobTable && jobTable.rows) {
        const jobRow = jobTable.rows.find(r => {
          const jNum = this.getSignificantJobNumber(String(r['Job Number'] || r['Crew'] || r['Job #'] || ''));
          return jNum.toLowerCase() === crewId.toLowerCase();
        });
        if (jobRow) {
          result.foreman = String(jobRow['Foreman'] || jobRow['Crew Lead'] || jobRow['Lead'] || '').trim();
        }
      }

      const members = this.getCrewMembers(crewId);
      members.forEach(m => {
        if (m.isForeman && !result.foreman) result.foreman = m.name;
        result.crewMembers.push(m);
        if (!result.allAttendees.includes(m.name)) {
          result.allAttendees.push(m.name);
        }
      });

      if (result.foreman && !result.allAttendees.includes(result.foreman)) {
        result.crewMembers.unshift({ name: result.foreman, role: 'Foreman', isForeman: true });
        result.allAttendees.unshift(result.foreman);
      }
    }

    const indList = Array.isArray(task.assignedEmployees)
      ? task.assignedEmployees
      : (task.employee && !task.employee.startsWith('Crew ') ? [task.employee] : []);

    indList.forEach(name => {
      const cleanName = String(name || '').trim();
      if (cleanName && !result.allAttendees.includes(cleanName)) {
        const r = findEmp(cleanName);
        const role = r ? String(r['Job Classification'] || r['Role'] || r['Title'] || '').trim() : '';
        result.individualMembers.push({ name: cleanName, role });
        result.allAttendees.push(cleanName);
      }
    });

    result.totalCount = result.allAttendees.length;
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
    const cleanId = this.getSignificantJobNumber(crewId);
    this.selectedClassCrew = cleanId;
    const input = document.getElementById('manual-task-crew-input');
    if (input) input.value = cleanId;
    this.hideCrewDropdown();
    this.updateClassCrewPreview();
    this.updateClassAttendeesSummary();
  }

  clearClassCrew() {
    this.selectedClassCrew = '';
    const input = document.getElementById('manual-task-crew-input');
    if (input) input.value = '';
    this.updateClassCrewPreview();
    this.updateClassAttendeesSummary();
  }

  updateClassCrewPreview() {
    const previewBox = document.getElementById('manual-task-crew-preview');
    const clearBtn = document.getElementById('btn-clear-class-crew');
    if (!previewBox) return;

    if (!this.selectedClassCrew) {
      previewBox.style.display = 'none';
      if (clearBtn) clearBtn.style.display = 'none';
      return;
    }

    const members = this.getCrewMembers(this.selectedClassCrew);
    let foreman = 'Lead';
    const jobTable = this.db.getTable('job_tracking');
    if (jobTable && jobTable.rows) {
      const jobRow = jobTable.rows.find(r => this.getSignificantJobNumber(String(r['Job Number'] || r['Crew'] || '')).toLowerCase() === this.selectedClassCrew.toLowerCase());
      if (jobRow) {
        foreman = String(jobRow['Foreman'] || jobRow['Crew Lead'] || jobRow['Lead'] || 'Lead').trim();
      }
    }

    const titleEl = document.getElementById('manual-task-crew-preview-title');
    const badgeEl = document.getElementById('manual-task-crew-preview-badge');
    const foremanEl = document.getElementById('manual-task-crew-preview-foreman');
    const membersEl = document.getElementById('manual-task-crew-preview-members');

    if (titleEl) titleEl.textContent = `🚚 Crew ${this.selectedClassCrew}`;
    if (badgeEl) badgeEl.textContent = `🟢 ${members.length} Linemen Scheduled`;
    if (foremanEl) foremanEl.innerHTML = `👑 <strong>Foreman:</strong> <span style="color: #60a5fa;">${this.escapeHtml(foreman)}</span>`;

    if (membersEl) {
      if (members.length > 0) {
        membersEl.innerHTML = members.map(m => `
          <span class="badge" style="background: rgba(255,255,255,0.06); color: #cbd5e1; font-size: 9.5px; padding: 2px 6px; border: 1px solid rgba(255,255,255,0.1); border-radius: 3px;">
            ${m.isForeman ? '👑' : '👤'} ${this.escapeHtml(m.name)} ${m.role ? `(${this.escapeHtml(m.role)})` : ''}
          </span>
        `).join('');
      } else {
        membersEl.innerHTML = `<span style="color: #94a3b8; font-style: italic;">No active linemen currently listed on Job #${this.escapeHtml(this.selectedClassCrew)} in Employees sheet.</span>`;
      }
    }

    previewBox.style.display = 'block';
    if (clearBtn) clearBtn.style.display = 'block';
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

    const crewMembers = this.selectedClassCrew ? this.getCrewMembers(this.selectedClassCrew) : [];
    const indCount = (this.selectedClassAttendees || []).length;
    const crewCount = crewMembers.length;

    const allSet = new Set();
    crewMembers.forEach(m => allSet.add(m.name.toLowerCase()));
    (this.selectedClassAttendees || []).forEach(n => allSet.add(n.toLowerCase()));
    const total = allSet.size;

    summaryEl.innerHTML = `
      <span>👥 Total Attendees: <strong style="color: ${total > 0 ? '#4ade80' : '#94a3b8'}; font-size: 12px;">${total} Linemen</strong></span>
      <span id="manual-task-attendees-detail" style="font-weight: normal; color: #94a3b8; font-size: 10.5px;">
        ${crewCount > 0 ? `${crewCount} from Crew ${this.selectedClassCrew}` : ''}
        ${crewCount > 0 && indCount > 0 ? ' + ' : ''}
        ${indCount > 0 ? `${indCount} Individual${indCount > 1 ? 's' : ''}` : ''}
        ${total === 0 ? 'Select a crew and/or individual employees' : ''}
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

  showCertDropdown() {
    this.setupManualTaskAutocomplete();
    const input = document.getElementById('manual-task-cert-type-input');
    this.filterCertDropdown(input ? input.value : '');
  }

  filterCertDropdown(query = '') {
    const dropdown = document.getElementById('manual-task-cert-dropdown');
    if (!dropdown) return;

    const certs = this.getAvailableCertTypes();
    const q = String(query || '').trim().toLowerCase();

    const filtered = q
      ? certs.filter(c => c.toLowerCase().includes(q))
      : certs;

    this.highlightedCertIdx = -1;

    if (filtered.length === 0) {
      dropdown.innerHTML = `
        <div style="padding: 10px 14px; font-size: 12px; color: var(--text-muted); text-align: center;">
          Custom class: "<strong>${this.escapeHtml(query)}</strong>"
        </div>
      `;
      dropdown.style.display = 'block';
      return;
    }

    dropdown.innerHTML = filtered.map((c, idx) => `
      <div class="cert-dropdown-item" data-idx="${idx}" data-cert="${this.escapeHtml(c)}" style="padding: 8px 12px; display: flex; align-items: center; justify-content: space-between; gap: 8px; cursor: pointer; border-bottom: 1px solid rgba(255,255,255,0.05); transition: background 0.15s ease;" onmouseenter="window.tripPlanner.setHighlightedCert(${idx});" onmousedown="window.tripPlanner.selectCertType(this.getAttribute('data-cert'));">
        <div style="font-size: 12.5px; font-weight: 700; color: #f8fafc; display: flex; align-items: center; gap: 6px;">
          <span>🎓</span>
          <span>${this.escapeHtml(c)}</span>
        </div>
      </div>
    `).join('');

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
        item.style.backgroundColor = '';
      }
    });
  }

  handleCertKeydown(e) {
    const dropdown = document.getElementById('manual-task-cert-dropdown');
    if (!dropdown || dropdown.style.display === 'none') {
      if (e.key === 'ArrowDown') {
        this.showCertDropdown();
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
      input.focus();
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

  switchManualTaskTab(category) {
    const activeCategoryInput = document.getElementById('manual-task-active-category');
    if (activeCategoryInput) activeCategoryInput.value = category;

    const certFields = document.getElementById('section-cert-class-fields');
    const personalFields = document.getElementById('section-personal-task-fields');
    const tabCert = document.getElementById('tab-btn-cert-class');
    const tabPersonal = document.getElementById('tab-btn-personal-task');
    const modalIcon = document.getElementById('manual-task-modal-icon');
    const saveBtn = document.getElementById('btn-save-manual-task');
    const saveBtnText = document.getElementById('btn-save-manual-task-text');

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
      if (saveBtnText) saveBtnText.textContent = 'Schedule Class';

      setTimeout(() => {
        const certInput = document.getElementById('manual-task-cert-type-input');
        if (certInput) certInput.focus();
      }, 50);
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
      if (saveBtnText) saveBtnText.textContent = 'Save Task';

      setTimeout(() => {
        const titleInput = document.getElementById('manual-task-personal-title-input');
        if (titleInput) titleInput.focus();
      }, 50);
    }
  }

  getManualTasksForDate(dateKey) {
    if (!this.manualTasks) this.manualTasks = this.loadManualTasks();
    return this.manualTasks.filter(t => t.dateKey === dateKey);
  }

  addManualTask(dateKey, taskData) {
    if (!this.manualTasks) this.manualTasks = this.loadManualTasks();
    const isCert = (taskData.taskCategory === 'cert_class' || !!taskData.certType);

    const newTask = {
      id: 'mt_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
      taskCategory: isCert ? 'cert_class' : 'personal_task',
      title: (taskData.title || (isCert ? taskData.certType : '')).trim(),
      certType: (taskData.certType || '').trim(),
      crewId: (taskData.crewId || '').trim(),
      assignedEmployees: Array.isArray(taskData.assignedEmployees) ? [...taskData.assignedEmployees] : [],
      employee: (taskData.employee || '').trim(),
      instructor: (taskData.instructor || 'Cody Bechdol (Self)').trim(),
      assignedTo: (taskData.assignedTo || 'Myself').trim(),
      dateKey: dateKey,
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

    this.manualTasks[idx] = {
      ...existing,
      taskCategory: isCert ? 'cert_class' : 'personal_task',
      title: (taskData.title || (isCert ? taskData.certType : existing.title)).trim(),
      certType: (taskData.certType !== undefined ? taskData.certType : existing.certType || '').trim(),
      crewId: (taskData.crewId !== undefined ? taskData.crewId : existing.crewId || '').trim(),
      assignedEmployees: (taskData.assignedEmployees !== undefined ? taskData.assignedEmployees : existing.assignedEmployees || []),
      employee: (taskData.employee !== undefined ? taskData.employee : existing.employee || '').trim(),
      instructor: (taskData.instructor !== undefined ? taskData.instructor : existing.instructor || 'Cody Bechdol (Self)').trim(),
      assignedTo: (taskData.assignedTo !== undefined ? taskData.assignedTo : existing.assignedTo || 'Myself').trim(),
      dateKey: taskData.dateKey || existing.dateKey,
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
    this.selectedClassCrew = '';
    this.selectedClassAttendees = [];
    this.updateClassCrewPreview();
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

      if (certTypeInput) certTypeInput.value = task.certType || task.title || '';
      if (certEmpInput) certEmpInput.value = '';
      if (certDateInput) certDateInput.value = task.dateKey || '';
      if (certLocInput) certLocInput.value = task.location || '';
      if (certTimeInput) certTimeInput.value = task.time || '';
      if (certTrainerInput) certTrainerInput.value = task.instructor || 'Cody Bechdol (Self)';
      if (certNotesInput) certNotesInput.value = task.notes || '';

      this.selectedClassCrew = task.crewId || '';
      if (certCrewInput) certCrewInput.value = this.selectedClassCrew;

      this.selectedClassAttendees = Array.isArray(task.assignedEmployees)
        ? [...task.assignedEmployees]
        : (task.employee && !task.employee.startsWith('Crew ') ? [task.employee] : []);

      this.updateClassCrewPreview();
      this.renderClassAttendeeChips();
      this.updateClassAttendeesSummary();

      this.switchManualTaskTab('cert_class');
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
      if (pDateInput) pDateInput.value = task.dateKey || '';
      if (pLocInput) pLocInput.value = task.location || '';
      if (pPrioInput) pPrioInput.value = task.priority || 'Normal';
      if (pTimeInput) pTimeInput.value = task.time || '';
      if (pNotesInput) pNotesInput.value = task.notes || '';

      this.switchManualTaskTab('personal_task');
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
      const location = certLocInput ? certLocInput.value.trim() : '';
      const time = certTimeInput ? certTimeInput.value.trim() : '';
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

      // Check if user typed an employee without selecting from dropdown
      const leftoverEmp = certEmpInput ? certEmpInput.value.trim() : '';
      if (leftoverEmp && !this.selectedClassAttendees.some(n => n.toLowerCase() === leftoverEmp.toLowerCase())) {
        this.selectedClassAttendees.push(leftoverEmp);
      }

      // Check if user typed a crew without selecting from dropdown
      if (!this.selectedClassCrew && certCrewInput && certCrewInput.value.trim()) {
        this.selectedClassCrew = this.getSignificantJobNumber(certCrewInput.value.trim());
      }

      const hasCrew = !!this.selectedClassCrew;
      const hasEmployees = (this.selectedClassAttendees && this.selectedClassAttendees.length > 0);

      if (!hasCrew && !hasEmployees) {
        alert('Please assign a Crew (Job #) or add at least one individual attendee to this class.');
        if (certCrewInput) certCrewInput.focus();
        return;
      }

      const taskData = {
        taskCategory: 'cert_class',
        title: certType,
        certType: certType,
        crewId: this.selectedClassCrew || '',
        assignedEmployees: [...this.selectedClassAttendees],
        employee: this.selectedClassAttendees.length > 0
          ? this.selectedClassAttendees[0]
          : (this.selectedClassCrew ? `Crew ${this.selectedClassCrew}` : 'Unassigned'),
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
      const time = pTimeInput ? pTimeInput.value.trim() : '';
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
      if (a.time && b.time) return a.time.localeCompare(b.time);
      if (a.time) return -1;
      if (b.time) return 1;
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
    this.db.addMutation({
      action: 'SAVE_PLANNED_TRIPS',
      trips: this.plannedTrips
    });
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
        const trainingClasses = allManualTasks.filter(m => m.taskCategory === 'cert_class' || !!m.certType);
        const personalTasks = allManualTasks.filter(m => m.taskCategory === 'personal_task' && !m.certType);

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
                <button class="btn btn-secondary" style="padding: 1px 6px; font-size: 9.5px; color: #34d399; border-color: rgba(16, 185, 129, 0.35); background: rgba(16, 185, 129, 0.08); cursor: pointer;" onclick="event.stopPropagation(); window.tripPlanner.openAddManualTaskModal('${dateKey}', '${this.escapeJs(day.dayName)}, ${this.escapeJs(day.formattedDate)}', 'cert_class')" title="Schedule Training Class on ${day.dayName}">+ Class</button>
              </div>
              <div id="section-body-${dateKey}-training" style="display: ${isCollapsed ? 'none' : 'flex'}; flex-direction: column; gap: 5px; margin-top: 5px;">
                ${trainingClasses.map(mt => {
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
                              ${resolved.crewId ? `
                                <span class="badge" style="background: rgba(59, 130, 246, 0.15); color: #93c5fd; border: 1px solid rgba(59, 130, 246, 0.3); font-size: 9px; font-weight: 700; padding: 1px 4px; border-radius: 3px;" title="Crew makeup auto-syncs with Employees sheet">
                                  🔄 Crew ${this.escapeHtml(resolved.crewId)}
                                </span>
                              ` : ''}
                            </div>
                            <div style="font-size: 12px; font-weight: 800; color: ${isDone ? '#94a3b8' : '#f8fafc'}; text-decoration: ${isDone ? 'line-through' : 'none'}; word-break: break-word; line-height: 1.3;">
                              ${this.escapeHtml(mt.certType || mt.title)}
                            </div>

                            <!-- Attendees / Audience Header -->
                            ${resolved.crewId ? `
                              <div style="font-size: 11px; margin-top: 3px; color: #cbd5e1; line-height: 1.3;">
                                <span>🚚 <strong>Crew ${this.escapeHtml(resolved.crewId)}</strong></span>
                                ${resolved.foreman ? `<span> (${this.escapeHtml(resolved.foreman)})</span>` : ''}
                                <span style="color: #94a3b8;"> · ${resolved.totalCount} Linemen</span>
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
                                  ${resolved.crewId ? `<span style="font-size: 9px; color: #34d399; margin-left: auto;">🔄 Synced</span>` : ''}
                                </div>
                                <div id="class-roster-${this.escapeHtml(mt.id)}" style="display: ${isRosterOpen ? 'flex' : 'none'}; flex-direction: column; gap: 3px; margin-top: 5px; padding: 4px 6px; background: rgba(0,0,0,0.25); border-radius: 4px;">
                                  ${resolved.crewMembers.map(m => `
                                    <div style="font-size: 10px; color: #cbd5e1; display: flex; justify-content: space-between; align-items: center;">
                                      <span style="cursor: pointer;" onclick="if(window.employeeProfileEngine){window.employeeProfileEngine.openProfileModal('${this.escapeJs(m.name)}');}" title="View employee profile">
                                        ${m.isForeman ? '👑' : '👤'} <strong style="color: ${m.isForeman ? '#facc15' : '#60a5fa'}; text-decoration: underline dotted;">${this.escapeHtml(m.name)}</strong>
                                      </span>
                                      <span class="badge" style="font-size: 8.5px; padding: 1px 4px; background: rgba(255,255,255,0.06); color: #94a3b8;">${this.escapeHtml(m.role || (m.isForeman ? 'Foreman' : 'Crew'))}</span>
                                    </div>
                                  `).join('')}
                                  ${resolved.individualMembers.map(m => `
                                    <div style="font-size: 10px; color: #cbd5e1; display: flex; justify-content: space-between; align-items: center;">
                                      <span style="cursor: pointer;" onclick="if(window.employeeProfileEngine){window.employeeProfileEngine.openProfileModal('${this.escapeJs(m.name)}');}" title="View employee profile">
                                        👤 <strong style="color: #60a5fa; text-decoration: underline dotted;">${this.escapeHtml(m.name)}</strong>
                                      </span>
                                      <span class="badge" style="font-size: 8.5px; padding: 1px 4px; background: rgba(59, 130, 246, 0.15); color: #93c5fd;">Individual</span>
                                    </div>
                                  `).join('')}
                                </div>
                              </div>
                            ` : ''}
                          </div>
                        </div>
                        <div style="display: flex; align-items: center; gap: 3px;">
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
                ${personalTasks.map(mt => {
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
