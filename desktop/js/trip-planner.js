/**
 * trip-planner.js - Offline Trip Planner & Route Scheduler
 */

class TripPlannerApp {
  constructor(db) {
    this.db = db;
    this.currentDate = new Date();
    this.activeSchedule = 'Mon-Thu';
    this.plannedTrips = {}; // { 'YYYY-MM-DD': { location: 'Bozeman', crew: '013-26' } }
    this.locations = [
      'Helena', 'Bozeman', 'Great Falls', 'Billings', 'Butte', 
      'Missoula', 'Glendive', 'Sidney', 'Kalispell', 'Anaconda',
      'Big Sky', 'Livingston', 'Lolo', 'Miles City', 'Stanford'
    ];
  }

  init() {
    this.loadSavedTrips();
    this.renderPlanner();
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

  renderPlanner() {
    const board = document.getElementById('trip-planner-board');
    if (!board) return;
    board.innerHTML = '';

    const weekDays = this.getDaysForCurrentWeek();

    weekDays.forEach(day => {
      const dateKey = day.dateKey;
      const trip = this.plannedTrips[dateKey] || null;
      const isHoliday = this.isDayHoliday(dateKey);

      const col = document.createElement('div');
      col.className = 'day-column';

      col.innerHTML = `
        <div class="day-header">
          <span>${day.dayName}, ${day.formattedDate}</span>
          <span style="font-size: 11px; font-weight: normal; color: var(--text-muted);">
            ${isHoliday ? '🏖️ Holiday' : (day.isWorkDay ? 'Work Day' : 'Off')}
          </span>
        </div>
        <div class="card-drop-zone" data-date="${dateKey}">
          ${trip ? `
            <div class="location-card" draggable="true" data-date="${dateKey}" data-location="${trip.location}">
              <div class="location-card-title">📍 ${trip.location}</div>
              <div class="location-card-meta">
                Drive Time: ${this.getDriveTime(trip.location)}<br>
                Scheduled Visits: ${trip.crew || 'All Active Crews'}
              </div>
              <button class="btn btn-secondary" style="padding: 2px 6px; font-size: 10px; margin-top: 8px;" onclick="window.tripPlanner.removeTrip('${dateKey}')">Remove</button>
            </div>
          ` : `
            <div style="color: var(--text-muted); font-size: 12px; text-align: center; margin-top: 40px;">
              Drag a city card here to schedule a trip
            </div>
          `}
        </div>
      `;

      // Setup drop zone
      const dropZone = col.querySelector('.card-drop-zone');
      dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.style.backgroundColor = 'rgba(59, 130, 246, 0.1)';
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

      board.appendChild(col);
    });

    this.renderAvailableLocations();
  }

  renderAvailableLocations() {
    const list = document.getElementById('available-locations-list');
    if (!list) return;
    list.innerHTML = '';

    this.locations.forEach(loc => {
      const card = document.createElement('div');
      card.className = 'location-card';
      card.draggable = true;
      card.style.marginBottom = '8px';
      card.innerHTML = `
        <div class="location-card-title">📍 ${loc}</div>
        <div class="location-card-meta">From Helena: ${this.getDriveTime(loc)}</div>
      `;

      card.addEventListener('dragstart', (e) => {
        e.dataTransfer.setData('text/plain', loc);
      });

      list.appendChild(card);
    });
  }

  setTrip(dateKey, location) {
    this.plannedTrips[dateKey] = { location, crew: '' };
    this.saveTrips();

    // Record mutation
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

  getDaysForCurrentWeek() {
    const days = [];
    const curr = new Date(this.currentDate);
    const first = curr.getDate() - curr.getDay() + 1; // Monday

    for (let i = 0; i < 5; i++) { // Mon - Fri
      const d = new Date(curr.setDate(first + i));
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      const dateKey = `${yyyy}-${mm}-${dd}`;
      const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

      days.push({
        dateKey,
        dayName: dayNames[d.getDay()],
        formattedDate: `${d.getMonth() + 1}/${d.getDate()}`,
        isWorkDay: i < 4 // Mon-Thu
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

  getDriveTime(loc) {
    const times = {
      'Bozeman': '1h 35m (98 mi)',
      'Great Falls': '1h 25m (89 mi)',
      'Billings': '3h 20m (230 mi)',
      'Butte': '1h 10m (68 mi)',
      'Missoula': '1h 45m (114 mi)',
      'Kalispell': '3h 15m (190 mi)',
      'Glendive': '6h 30m (450 mi)',
      'Sidney': '7h 15m (500 mi)',
      'Anaconda': '1h 15m (75 mi)',
      'Big Sky': '2h 15m (145 mi)',
      'Livingston': '2h 00m (125 mi)'
    };
    return times[loc] || '1h 00m (Helena Base)';
  }
}

window.tripPlanner = new TripPlannerApp(window.localDB);
