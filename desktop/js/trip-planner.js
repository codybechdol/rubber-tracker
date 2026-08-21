/**
 * trip-planner.js - Multi-Week Offline Trip Planner & Route Scheduler
 */

class TripPlannerApp {
  constructor(db) {
    this.db = db;
    this.currentDate = new Date();
    this.weeksToShow = 1; // 1, 2, 3, or 4 weeks
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
  }

  init() {
    this.loadSavedTrips();
    this.setupSearchListeners();
    this.populateWeekDropdown();
    this.renderPlanner();
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
    const saved = localStorage.getItem('sa_planned_trips');
    if (saved) {
      try { this.plannedTrips = JSON.parse(saved); } catch (e) {}
    }
  }

  saveTrips() {
    localStorage.setItem('sa_planned_trips', JSON.stringify(this.plannedTrips));
  }

  setWeeksToShow(weeks) {
    this.weeksToShow = parseInt(weeks, 10) || 1;
    [1, 2, 3, 4].forEach(w => {
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
    const baseMonday = new Date(today.setDate(today.getDate() + distToMon));

    // Generate next 16 weeks options
    for (let w = -2; w <= 14; w++) {
      const mon = new Date(baseMonday);
      mon.setDate(baseMonday.getDate() + (w * 7));
      const fri = new Date(mon);
      fri.setDate(mon.getDate() + 4);

      const yyyy = mon.getFullYear();
      const mm = String(mon.getMonth() + 1).padStart(2, '0');
      const dd = String(mon.getDate()).padStart(2, '0');
      const key = `${yyyy}-${mm}-${dd}`;

      let label = `${mon.getMonth() + 1}/${mon.getDate()} - ${fri.getMonth() + 1}/${fri.getDate()}`;
      if (w === 0) label += ' (This Week)';
      else if (w === 1) label += ' (+1 Wk)';
      else if (w > 1) label += ` (+${w} Wks)`;
      else if (w === -1) label += ' (Last Week)';
      else if (w < -1) label += ` (${w} Wks)`;

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
    let gloves = 0;
    let sleeves = 0;
    let blankets = 0;
    let macks = 0;
    let equipment = 0;
    let training = 0;
    let certs = 0;
    let overdue = 0;

    crewTasks.forEach(t => {
      if (t.isOverdue || String(t.status || '').toLowerCase() === 'overdue') overdue++;
      const type = String(t.type || '').toLowerCase();
      const item = String(t.itemType || '').toLowerCase();
      const cat = String(t.category || '').toLowerCase();

      if (type.includes('glove') || item.includes('glove')) {
        gloves++;
      } else if (type.includes('sleeve') || item.includes('sleeve')) {
        sleeves++;
      } else if (type.includes('blanket') || item.includes('blanket')) {
        blankets++;
      } else if (type.includes('mack') || item.includes('mack')) {
        macks++;
      } else if (cat === 'equipment' || type.includes('tester') || type.includes('phasing') || type.includes('aed') || type.includes('ground') || type.includes('stick')) {
        equipment++;
      } else if (cat === 'training' || type.includes('training')) {
        training++;
      } else if (cat === 'certs' || type.includes('cert') || type.includes('cpr') || type.includes('crane')) {
        certs++;
      } else {
        gloves++;
      }
    });

    return {
      total: crewTasks.length,
      overdue,
      gloves,
      sleeves,
      blankets,
      macks,
      equipment,
      training,
      certs
    };
  }

  /**
   * Discovers and builds structured location objects from Job Tracking, Employees, and Master list
   */
  getLocationData() {
    const activeCrewsByLoc = {};
    const allKnownLocations = new Set(Object.keys(this.masterLocations));

    // 1. Scan Job Tracking for all active crews and locations
    const jobTable = this.db.getTable('job_tracking');
    if (jobTable && jobTable.rows) {
      jobTable.rows.forEach(r => {
        const status = String(r['Status'] || r['Job Status'] || '').trim();
        const rawLoc = String(r['Location'] || '').trim();
        const loc = this.cleanPhysicalLocation(rawLoc);
        const crewId = String(r['Job Number'] || r['Crew'] || r['Job #'] || '').trim();
        const foreman = String(r['Foreman'] || r['Crew Lead'] || r['Lead'] || '').trim();
        const crewSize = parseInt(r['Crew Size'] || r['Size'] || 0, 10) || 0;
        const jobName = String(r['Job Name'] || '').trim();

        if (loc && !this.isStatusLocation(loc)) {
          allKnownLocations.add(loc);
          if (status === 'Active' || status === 'Pending Start' || (!status.toLowerCase().includes('completed') && !status.toLowerCase().includes('on hold') && status !== '')) {
            if (!activeCrewsByLoc[loc]) {
              activeCrewsByLoc[loc] = [];
            }
            activeCrewsByLoc[loc].push({
              crewId: crewId || 'N/A',
              foreman: foreman || 'Lead',
              crewSize: crewSize,
              jobName: jobName,
              status: status
            });
          }
        }
      });
    }

    // 2. Scan Employees sheet for any additional active locations
    const empTable = this.db.getTable('employees');
    if (empTable && empTable.rows) {
      empTable.rows.forEach(r => {
        const rawLoc = String(r['Location'] || '').trim();
        const loc = this.cleanPhysicalLocation(rawLoc);
        if (loc && !this.isStatusLocation(loc)) {
          allKnownLocations.add(loc);
        }
      });
    }

    // 3. Scan Locations master table from snapshot if present
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

  cleanPhysicalLocation(loc) {
    if (!loc) return '';
    let clean = String(loc).trim();
    const parenMatch = clean.match(/^([^(]+)\s*\([^)]+\)$/);
    if (parenMatch) clean = parenMatch[1].trim();
    return clean.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  }

  isStatusLocation(loc) {
    const lower = String(loc || '').toLowerCase().trim();
    const statusValues = ['vacation', 'light duty', 'weeds', 'leave', 'previous employee', 'medical', "worker's comp", 'unknown', 'in testing'];
    return statusValues.some(s => lower === s || lower.includes(`(${s})`));
  }

  getDriveTime(loc) {
    const snap = this.db.getSnapshot();
    const locLower = String(loc).toLowerCase().trim();

    // Check if snapshot contains driveTimeMap from Google Sheets
    if (snap && snap.configs && snap.configs.driveTimeMap) {
      const dMap = snap.configs.driveTimeMap;
      if (dMap[locLower] !== undefined && typeof dMap[locLower] === 'number') {
        const mins = dMap[locLower];
        const h = Math.floor(mins / 60);
        const m = mins % 60;
        const timeStr = h > 0 ? `${h}h ${m.toString().padStart(2, '0')}m` : `${m}m`;
        return {
          mins: mins,
          time: timeStr,
          desc: `${timeStr} from Helena`,
          dir: 'MT'
        };
      }
    }

    // Match against built-in master locations dictionary
    for (const [mName, mInfo] of Object.entries(this.masterLocations)) {
      if (mName.toLowerCase() === locLower) {
        return mInfo;
      }
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

    const snap = this.db.getSnapshot();
    const workSchedule = (snap && snap.configs && snap.configs.workSchedule) || this.activeSchedule;
    if (scheduleBadge) {
      scheduleBadge.textContent = `🗓️ ${workSchedule} Schedule`;
    }

    const { locations } = this.getLocationData();
    const locMap = {};
    locations.forEach(l => { locMap[l.name] = l; });

    const baseMonday = this.getMondayForDate(this.currentDate);

    // Render multi-week sections based on weeksToShow
    for (let w = 0; w < this.weeksToShow; w++) {
      const weekMonday = new Date(baseMonday);
      weekMonday.setDate(baseMonday.getDate() + (w * 7));
      const weekDays = this.getDaysForWeek(weekMonday, workSchedule);

      const firstDay = weekDays[0];
      const lastDay = weekDays[weekDays.length - 1];
      const weekDateKey = firstDay.dateKey;

      const tripsInWeek = weekDays.filter(d => this.plannedTrips[d.dateKey]).length;

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

          <div style="display: flex; align-items: center; gap: 10px;">
            <span style="font-size: 11.5px; color: ${tripsInWeek > 0 ? '#4ade80' : 'var(--text-muted)'}; font-weight: 600;">
              ${tripsInWeek > 0 ? `🚗 ${tripsInWeek} Trip${tripsInWeek > 1 ? 's' : ''} Scheduled` : '⚪ No trips scheduled'}
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
        const trip = this.plannedTrips[dateKey] || null;
        const isHoliday = this.isDayHoliday(dateKey);
        const locInfo = trip ? locMap[trip.location] : null;

        const col = document.createElement('div');
        col.className = 'day-column';

        col.innerHTML = `
          <div class="day-header" style="background: ${isHoliday ? 'linear-gradient(90deg, #854d0e 0%, #1e293b 100%)' : '#1e293b'};">
            <div>
              <span style="font-weight: 800; color: #f8fafc;">${day.dayName}, ${day.formattedDate}</span>
            </div>
            <div>
              <span class="badge" style="background: ${isHoliday ? '#ca8a04' : (day.isWorkDay ? '#0284c7' : '#475569')}; color: #fff; font-size: 9.5px; padding: 2px 5px; border-radius: 4px;">
                ${isHoliday ? '🏖️ Holiday' : (day.isWorkDay ? 'Work' : 'Off')}
              </span>
            </div>
          </div>
          <div class="card-drop-zone" data-date="${dateKey}" style="background: ${isHoliday ? 'rgba(202, 138, 4, 0.04)' : 'transparent'};">
            ${trip ? `
              <div class="location-card" draggable="true" data-date="${dateKey}" data-location="${this.escapeHtml(trip.location)}" style="border-left: 4px solid #38bdf8; background: var(--bg-primary);">
                <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 6px;">
                  <div class="location-card-title" style="color: #60a5fa; font-size: 14.5px; font-weight: 800; display: flex; align-items: center; gap: 4px;">
                    📍 ${this.escapeHtml(trip.location)}
                  </div>
                  <span class="badge" style="background: rgba(56, 189, 248, 0.2); color: #38bdf8; font-size: 10px; font-weight: 700; padding: 2px 6px; border-radius: 4px;">
                    🚗 ${this.escapeHtml(this.getDriveTime(trip.location).time)}
                  </span>
                </div>
                
                <div class="location-card-meta" style="line-height: 1.4; margin-bottom: 8px;">
                  <div style="color: #94a3b8; font-size: 11px;">Distance: <strong>${this.escapeHtml(this.getDriveTime(trip.location).desc)}</strong></div>
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
                              ${summary.gloves > 0 ? `<span class="badge" style="background: rgba(59, 130, 246, 0.15); color: #93c5fd; font-size: 9.5px; padding: 1px 5px; border: 1px solid rgba(59, 130, 246, 0.3);">🧤 ${summary.gloves} Glove${summary.gloves > 1 ? 's' : ''}</span>` : ''}
                              ${summary.sleeves > 0 ? `<span class="badge" style="background: rgba(168, 85, 247, 0.15); color: #d8b4fe; font-size: 9.5px; padding: 1px 5px; border: 1px solid rgba(168, 85, 247, 0.3);">🧤 ${summary.sleeves} Sleeve${summary.sleeves > 1 ? 's' : ''}</span>` : ''}
                              ${summary.blankets > 0 ? `<span class="badge" style="background: rgba(236, 72, 153, 0.15); color: #f472b6; font-size: 9.5px; padding: 1px 5px; border: 1px solid rgba(236, 72, 153, 0.3);">🛏️ ${summary.blankets} Blanket${summary.blankets > 1 ? 's' : ''}</span>` : ''}
                              ${summary.macks > 0 ? `<span class="badge" style="background: rgba(245, 158, 11, 0.15); color: #fcd34d; font-size: 9.5px; padding: 1px 5px; border: 1px solid rgba(245, 158, 11, 0.3);">⚡ ${summary.macks} MACK${summary.macks > 1 ? 's' : ''}</span>` : ''}
                              ${summary.equipment > 0 ? `<span class="badge" style="background: rgba(20, 184, 166, 0.15); color: #5eead4; font-size: 9.5px; padding: 1px 5px; border: 1px solid rgba(20, 184, 166, 0.3);">🧰 ${summary.equipment} Equip</span>` : ''}
                              ${summary.training > 0 ? `<span class="badge" style="background: rgba(34, 197, 94, 0.15); color: #86efac; font-size: 9.5px; padding: 1px 5px; border: 1px solid rgba(34, 197, 94, 0.3);">🎓 ${summary.training} Training</span>` : ''}
                              ${summary.certs > 0 ? `<span class="badge" style="background: rgba(239, 68, 68, 0.15); color: #fca5a5; font-size: 9.5px; padding: 1px 5px; border: 1px solid rgba(239, 68, 68, 0.3);">📜 ${summary.certs} Cert${summary.certs > 1 ? 's' : ''}</span>` : ''}
                              ${summary.total === 0 ? `<span style="font-size: 9.5px; color: #94a3b8; font-style: italic;">✓ No pending tasks</span>` : ''}
                            </div>
                          </div>
                        `;
                      }).join('')}
                    </div>
                  ` : `
                    <div style="margin-top: 4px; font-size: 11px; color: #94a3b8;">Base / Non-crew visit</div>
                  `}
                </div>

                <div style="display: flex; justify-content: flex-end; margin-top: 6px;">
                  <button class="btn btn-secondary" style="padding: 2px 8px; font-size: 10px; color: #f87171; border: 1px solid rgba(239, 68, 68, 0.3);" onclick="window.tripPlanner.removeTrip('${dateKey}')">❌ Remove</button>
                </div>
              </div>
            ` : `
              <div style="color: var(--text-muted); font-size: 11.5px; text-align: center; margin-top: 30px; border: 1px dashed var(--border-color); border-radius: 6px; padding: 14px;">
                ${isHoliday ? '🏖️ Holiday Day' : 'Drag city here'}
              </div>
            `}
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

    // Get all tasks for this crew
    const allCrewTasks = window.taskManager ? window.taskManager.getTasksByCrew(crewId, targetDate) : [];
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

    // Filter tasks for active category tab
    let filtered = allCrewTasks;
    if (filterCat === 'PPE') {
      filtered = filtered.filter(t => t.category === 'PPE' || (t.type || '').toLowerCase().includes('glove') || (t.type || '').toLowerCase().includes('sleeve') || (t.type || '').toLowerCase().includes('blanket'));
    } else if (filterCat === 'Equipment') {
      filtered = filtered.filter(t => t.category === 'Equipment' || (t.type || '').toLowerCase().includes('mack') || (t.type || '').toLowerCase().includes('tester') || (t.type || '').toLowerCase().includes('phasing') || (t.type || '').toLowerCase().includes('aed') || (t.type || '').toLowerCase().includes('ground') || (t.type || '').toLowerCase().includes('stick'));
    } else if (filterCat === 'Training') {
      filtered = filtered.filter(t => t.category === 'Training' || (t.type || '').toLowerCase().includes('training'));
    } else if (filterCat === 'Certs') {
      filtered = filtered.filter(t => t.category === 'Certs' || (t.type || '').toLowerCase().includes('cert'));
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
            ${allCrewTasks.length} Total Task${allCrewTasks.length > 1 ? 's' : ''}
          </span>
        </div>
      </div>

      <!-- Category Filter Pills -->
      <div style="display: flex; gap: 6px; margin-bottom: 14px; flex-wrap: wrap;">
        <button class="btn btn-secondary ${filterCat === 'All' ? 'active' : ''}" style="padding: 3px 10px; font-size: 11.5px; font-weight: 700;" onclick="window.tripPlanner.openCrewTasksModal('${this.escapeHtml(crewId)}', '${this.escapeHtml(loc)}', 'All', '${safeDateKey}')">
          All Tasks (${allCrewTasks.length})
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
      </div>

      <!-- Task Checklist Items -->
      <div style="display: flex; flex-direction: column; gap: 8px;">
        ${filtered.length === 0 ? `
          <div style="padding: 40px 20px; text-align: center; color: var(--text-muted); background: var(--bg-secondary); border-radius: 8px; border: 1px dashed var(--border-color);">
            <div style="font-size: 28px; margin-bottom: 6px;">✓</div>
            <h4 style="font-size: 14px; font-weight: 700; color: #f8fafc; margin-bottom: 4px;">No tasks in this category</h4>
            <p style="font-size: 12px; color: var(--text-secondary);">All assignments are current or completed.</p>
          </div>
        ` : filtered.map(t => {
          const isComplete = String(t.status || '').toLowerCase() === 'complete';
          const isOverdue = t.isOverdue || String(t.status || '').toLowerCase() === 'overdue';
          const badgeColor = isComplete ? '#10b981' : (isOverdue ? '#ef4444' : '#f59e0b');

          return `
            <div style="background-color: var(--bg-primary); border: 1px solid var(--border-color); border-left: 4px solid ${badgeColor}; border-radius: 6px; padding: 12px 14px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px;">
              <div style="flex: 1; min-width: 260px;">
                <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 4px;">
                  <span style="font-weight: 800; font-size: 14px; color: #f8fafc;">
                    ${this.escapeHtml(t.type)}: ${this.escapeHtml(t.itemType)}
                  </span>
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
                  <span style="color: ${isOverdue ? '#f87171' : 'var(--text-secondary)'}; font-weight: ${isOverdue ? '700' : 'normal'};">
                    📅 Due: <strong>${this.escapeHtml(t.dueDate)}</strong>
                  </span>
                  ${t.scheduledDate ? `<span>🗓️ Scheduled: <strong>${this.escapeHtml(t.scheduledDate)}</strong></span>` : ''}
                </div>

                ${t.notes ? `
                  <div style="font-size: 11px; color: var(--text-muted); margin-top: 4px;">
                    📝 ${this.escapeHtml(t.notes)}
                  </div>
                ` : ''}
              </div>

              <div style="display: flex; align-items: center; gap: 10px;">
                <span class="badge" style="background: ${isComplete ? '#15803d' : (isOverdue ? '#b91c1c' : '#d97706')}; color: #fff; font-size: 11px; font-weight: 700; padding: 3px 8px; border-radius: 4px;">
                  ${isComplete ? '✅ Complete' : (isOverdue ? '🔴 Overdue' : '⏳ Pending')}
                </span>
                ${!isComplete ? `
                  <button class="btn" style="background-color: #10b981; color: #fff; padding: 4px 10px; font-size: 11px; font-weight: 700; border-radius: 4px; cursor: pointer;" onclick="window.tripPlanner.completeTaskInModal('${this.escapeHtml(t.id)}', '${this.escapeHtml(crewId)}', '${this.escapeHtml(loc)}')">
                    ✓ Mark Complete
                  </button>
                ` : `
                  <span style="color: var(--text-muted); font-size: 11px;">✓ Completed</span>
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

  setTrip(dateKey, location) {
    this.plannedTrips[dateKey] = { location, crew: '' };
    this.saveTrips();

    // Record mutation for sync
    this.db.addMutation({
      action: 'SET_TRIP_SCHEDULE',
      date: dateKey,
      location: location
    });

    this.renderPlanner();
  }

  removeTrip(dateKey) {
    delete this.plannedTrips[dateKey];
    this.saveTrips();
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

  isDayHoliday(dateKey) {
    const snap = this.db.getSnapshot();
    if (snap && snap.configs && snap.configs.holidays) {
      return snap.configs.holidays.some(h => h.date === dateKey);
    }
    return false;
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
}

window.tripPlanner = new TripPlannerApp(window.localDB);
