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
                        const crewTasks = window.taskManager ? window.taskManager.getTasksByCrew(c.crewId) : [];
                        return `
                          <div style="background: rgba(0,0,0,0.25); border: 1px solid rgba(255,255,255,0.06); border-radius: 4px; padding: 6px 8px; margin-bottom: 6px;">
                            <div style="font-size: 11px; color: #cbd5e1; display: flex; justify-content: space-between; align-items: center; margin-bottom: 3px;">
                              <span><strong style="color: #60a5fa;">Crew ${this.escapeHtml(c.crewId)}</strong> (${this.escapeHtml(c.foreman)})</span>
                              <span class="badge" style="background: ${crewTasks.length > 0 ? 'rgba(245, 158, 11, 0.2)' : 'rgba(16, 185, 129, 0.2)'}; color: ${crewTasks.length > 0 ? '#facc15' : '#4ade80'}; font-size: 9.5px; padding: 1px 5px;">
                                ${crewTasks.length > 0 ? `📋 ${crewTasks.length} task${crewTasks.length > 1 ? 's' : ''}` : '✓ Current'}
                              </span>
                            </div>
                            ${crewTasks.length > 0 ? `
                              <div style="display: flex; flex-direction: column; gap: 2px; margin-top: 3px; padding-left: 4px; border-left: 2px solid rgba(245, 158, 11, 0.5);">
                                ${crewTasks.slice(0, 3).map(t => `
                                  <div style="font-size: 10px; color: ${t.isOverdue ? '#f87171' : '#e2e8f0'}; display: flex; justify-content: space-between;">
                                    <span>• ${this.escapeHtml(t.type)}: ${this.escapeHtml(t.itemType)}</span>
                                    <span style="font-size: 9px; color: var(--text-muted);">${this.escapeHtml(t.dueDate)}</span>
                                  </div>
                                `).join('')}
                                ${crewTasks.length > 3 ? `
                                  <div style="font-size: 9.5px; color: #93c5fd; font-style: italic;">+ ${crewTasks.length - 3} more tasks</div>
                                ` : ''}
                              </div>
                            ` : `
                              <div style="font-size: 9.5px; color: #94a3b8; font-style: italic;">No pending tasks</div>
                            `}
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
              <div style="color: #cbd5e1; font-size: 10px; margin-top: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${loc.activeCrews.map(c => `Crew ${c.crewId} (${c.foreman})`).join(', ')}">
                ${loc.activeCrews.map(c => `<strong>${this.escapeHtml(c.crewId)}</strong> (${this.escapeHtml(c.foreman)})`).join(', ')}
              </div>
              ${locTasks.length > 0 ? `
                <div style="margin-top: 4px; padding-top: 3px; border-top: 1px solid rgba(255,255,255,0.06); font-size: 10px; color: ${overdueTasks > 0 ? '#f87171' : '#facc15'}; display: flex; justify-content: space-between;">
                  <span>📋 ${locTasks.length} task${locTasks.length > 1 ? 's' : ''} pending</span>
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
