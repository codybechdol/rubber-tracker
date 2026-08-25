/**
 * time-breakdown.js - Daily Accomplishments & Timesheet Breakdown Generator
 * 
 * Generates a clean, copy-pasteable daily breakdown of completed field swaps,
 * crew visits, calculated Montana travel times, and training completions.
 */

class TimeBreakdownEngine {
  constructor(db) {
    this.db = db;
    this.startDate = null;
    this.endDate = null;
    this.presetRange = 'this_week'; // 'today', 'this_week', 'last_week', 'this_month', 'custom'
  }

  /**
   * Opens the Daily Accomplishments modal.
   */
  openModal() {
    this.setPresetRange('this_week');

    const modal = document.getElementById('time-breakdown-modal');
    if (!modal) return;

    modal.style.display = 'flex';
    this.renderModal();
  }

  closeModal() {
    const modal = document.getElementById('time-breakdown-modal');
    if (modal) modal.style.display = 'none';
  }

  setPresetRange(preset) {
    this.presetRange = preset;
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12, 0, 0);

    if (preset === 'today') {
      this.startDate = new Date(today);
      this.endDate = new Date(today);
    } else if (preset === 'this_week') {
      const day = today.getDay();
      const distToMon = (day === 0 ? -6 : 1) - day;
      this.startDate = new Date(today.getFullYear(), today.getMonth(), today.getDate() + distToMon, 12, 0, 0);
      this.endDate = new Date(this.startDate.getFullYear(), this.startDate.getMonth(), this.startDate.getDate() + 4, 12, 0, 0);
    } else if (preset === 'last_week') {
      const day = today.getDay();
      const distToMon = (day === 0 ? -6 : 1) - day - 7;
      this.startDate = new Date(today.getFullYear(), today.getMonth(), today.getDate() + distToMon, 12, 0, 0);
      this.endDate = new Date(this.startDate.getFullYear(), this.startDate.getMonth(), this.startDate.getDate() + 4, 12, 0, 0);
    } else if (preset === 'this_month') {
      this.startDate = new Date(today.getFullYear(), today.getMonth(), 1, 12, 0, 0);
      this.endDate = new Date(today.getFullYear(), today.getMonth() + 1, 0, 12, 0, 0);
    }

    const body = document.getElementById('time-breakdown-modal-body');
    if (body) {
      this.renderModal();
    }
  }

  onCustomDateChange() {
    const startInput = document.getElementById('tb-start-date');
    const endInput = document.getElementById('tb-end-date');
    if (startInput && startInput.value) {
      const parts = startInput.value.split('-');
      this.startDate = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10), 12, 0, 0);
    }
    if (endInput && endInput.value) {
      const parts = endInput.value.split('-');
      this.endDate = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10), 12, 0, 0);
    }
    this.presetRange = 'custom';
    this.renderModal();
  }

  formatDateKey(d) {
    if (!d) return '';
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }

  /**
   * Collects all completed tasks, trips, and trainings in the date range.
   */
  collectAccomplishments() {
    const startKey = this.formatDateKey(this.startDate);
    const endKey = this.formatDateKey(this.endDate);

    const tasksTable = this.db.getTable('tasks');
    const trips = this.db.getPlannedTrips() || {};
    const trainTable = this.db.getTable('training_tracking');
    const empTable = this.db.getTable('employees');

    // Town drive time lookup
    const townTimes = (window.tripPlanner && window.tripPlanner.masterLocations) ? window.tripPlanner.masterLocations : {};

    // Group items by dateKey
    const daysMap = {};

    // Iterate through all days in range
    const cur = new Date(this.startDate);
    while (cur <= this.endDate) {
      const key = this.formatDateKey(cur);
      daysMap[key] = {
        date: new Date(cur),
        dateKey: key,
        locations: {},
        tasks: [],
        trainings: [],
        officeTasks: []
      };
      cur.setDate(cur.getDate() + 1);
    }

    // Collect trips planned
    Object.keys(trips).forEach(dKey => {
      if (daysMap[dKey]) {
        const tripEntries = Array.isArray(trips[dKey]) ? trips[dKey] : [trips[dKey]];
        tripEntries.forEach(t => {
          if (!t || !t.location) return;
          if (!daysMap[dKey].locations[t.location]) {
            const locMeta = townTimes[t.location] || { time: '0m', mins: 0 };
            daysMap[dKey].locations[t.location] = {
              name: t.location,
              driveTime: locMeta.time,
              driveMins: locMeta.mins,
              crews: []
            };
          }
          if (t.crew && !daysMap[dKey].locations[t.location].crews.includes(t.crew)) {
            daysMap[dKey].locations[t.location].crews.push(t.crew);
          }
        });
      }
    });

    // Collect completed tasks
    if (tasksTable && tasksTable.rows) {
      tasksTable.rows.forEach(t => {
        const status = String(t['Status'] || '').toLowerCase();
        if (status !== 'completed' && status !== 'complete') return;

        const dateDone = String(t['Date Completed'] || t['Date Changed'] || t['Completed Date'] || '').trim();
        if (!dateDone) return;

        const dKey = dateDone.substring(0, 10);
        if (daysMap[dKey]) {
          daysMap[dKey].tasks.push(t);
        }
      });
    }

    // Collect completed trainings
    if (trainTable && trainTable.rows) {
      trainTable.rows.forEach(tr => {
        const status = String(tr['Status'] || '').toLowerCase();
        if (status !== 'completed' && status !== 'complete') return;

        const dateDone = String(tr['Date Completed'] || tr['Date'] || '').trim();
        if (!dateDone) return;

        const dKey = dateDone.substring(0, 10);
        if (daysMap[dKey]) {
          daysMap[dKey].trainings.push(tr);
        }
      });
    }

    return Object.values(daysMap).sort((a, b) => a.date - b.date);
  }

  /**
   * Generates formatted text report for timesheet copy/paste.
   */
  generateTextReport(days) {
    if (!days || days.length === 0) return 'No tasks found for the selected period.';

    let lines = [];
    lines.push(`=======================================================`);
    lines.push(`📋 DAILY ACCOMPLISHMENTS REPORT`);
    lines.push(`Period: ${this.formatDateKey(this.startDate)} to ${this.formatDateKey(this.endDate)}`);
    lines.push(`Generated: ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}`);
    lines.push(`=======================================================\n`);

    let totalTrips = 0;
    let totalCompletedTasks = 0;

    days.forEach(day => {
      const dayName = day.date.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' });
      const locKeys = Object.keys(day.locations);
      const hasContent = locKeys.length > 0 || day.tasks.length > 0 || day.trainings.length > 0;

      if (!hasContent) return;

      lines.push(`📅 ${dayName}`);
      lines.push(`-------------------------------------------------------`);

      // Locations & Travel
      if (locKeys.length > 0) {
        locKeys.forEach(locKey => {
          totalTrips++;
          const loc = day.locations[locKey];
          const crewStr = loc.crews.length > 0 ? ` (Crews: ${loc.crews.join(', ')})` : '';
          lines.push(`  🚗 Field Visit: ${loc.name}${crewStr}`);
          if (loc.driveTime && loc.driveTime !== '0m') {
            lines.push(`     • Drive Time: ${loc.driveTime} one-way (~${Math.round((loc.driveMins * 2) / 60 * 10) / 10}h round-trip)`);
          }
        });
      }

      // Completed Tasks / Swaps
      if (day.tasks.length > 0) {
        lines.push(`  🔧 Completed Equipment Swaps & Tasks (${day.tasks.length}):`);
        day.tasks.forEach(t => {
          totalCompletedTasks++;
          const emp = t['Assigned To'] || t['Employee'] || 'Unassigned';
          const type = t['Task Type'] || t['Type'] || 'Task';
          const desc = t['Description'] || t['Item'] || '';
          const job = t['Job Number'] || t['Job #'] || '';
          lines.push(`     • ${type}: ${desc} (${emp}${job ? ' - Job ' + job : ''})`);
        });
      }

      // Completed Trainings
      if (day.trainings.length > 0) {
        lines.push(`  🎓 Completed Training & Meetings (${day.trainings.length}):`);
        day.trainings.forEach(tr => {
          const topic = tr['Topic'] || tr['Training'] || 'Safety Training';
          const crew = tr['Crew'] || tr['Job #'] || '';
          const lead = tr['Lead'] || tr['Foreman'] || '';
          lines.push(`     • ${topic} - Crew ${crew} (Lead: ${lead})`);
        });
      }

      lines.push('');
    });

    lines.push(`=======================================================`);
    lines.push(`SUMMARY: ${totalTrips} Field Location Visits | ${totalCompletedTasks} Equipment Swaps Completed`);
    lines.push(`=======================================================`);

    return lines.join('\n');
  }

  /**
   * Renders the modal dialog content.
   */
  renderModal() {
    const body = document.getElementById('time-breakdown-modal-body');
    const footer = document.getElementById('time-breakdown-modal-footer');
    if (!body) return;

    const days = this.collectAccomplishments();
    const textReport = this.generateTextReport(days);

    const startVal = this.formatDateKey(this.startDate);
    const endVal = this.formatDateKey(this.endDate);

    body.innerHTML = `
      <div style="display: flex; flex-direction: column; gap: 14px;">
        <!-- Header Controls & Presets -->
        <div style="background: var(--bg-primary); border: 1px solid var(--border-color); border-radius: 8px; padding: 14px 16px; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 10px;">
          <div style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">
            <span style="font-size: 11.5px; color: var(--text-muted); font-weight: 700; text-transform: uppercase;">Range:</span>
            <button class="btn btn-secondary ${this.presetRange === 'today' ? 'active' : ''}" onclick="window.timeBreakdownEngine.setPresetRange('today')" style="font-size: 11.5px; padding: 4px 10px;">Today</button>
            <button class="btn btn-secondary ${this.presetRange === 'this_week' ? 'active' : ''}" onclick="window.timeBreakdownEngine.setPresetRange('this_week')" style="font-size: 11.5px; padding: 4px 10px;">This Week</button>
            <button class="btn btn-secondary ${this.presetRange === 'last_week' ? 'active' : ''}" onclick="window.timeBreakdownEngine.setPresetRange('last_week')" style="font-size: 11.5px; padding: 4px 10px;">Last Week</button>
            <button class="btn btn-secondary ${this.presetRange === 'this_month' ? 'active' : ''}" onclick="window.timeBreakdownEngine.setPresetRange('this_month')" style="font-size: 11.5px; padding: 4px 10px;">This Month</button>
          </div>

          <!-- Custom Date Inputs -->
          <div style="display: flex; align-items: center; gap: 8px;">
            <input type="date" id="tb-start-date" value="${startVal}" class="sheet-search" style="padding: 4px 8px; font-size: 11.5px;" onchange="window.timeBreakdownEngine.onCustomDateChange()">
            <span style="color: var(--text-muted); font-size: 11.5px;">to</span>
            <input type="date" id="tb-end-date" value="${endVal}" class="sheet-search" style="padding: 4px 8px; font-size: 11.5px;" onchange="window.timeBreakdownEngine.onCustomDateChange()">
          </div>
        </div>

        <!-- Formatted Report Output Area -->
        <div style="position: relative;">
          <textarea id="time-breakdown-output" readonly style="width: 100%; height: 380px; font-family: 'Consolas', 'Courier New', monospace; font-size: 12px; line-height: 1.45; background: #0f172a; border: 1px solid var(--border-color); border-radius: 8px; padding: 14px; color: #f8fafc; resize: none; white-space: pre;">${this.escapeHtml(textReport)}</textarea>
        </div>
      </div>
    `;

    if (footer) {
      footer.innerHTML = `
        <button class="btn btn-secondary" onclick="window.timeBreakdownEngine.closeModal()">Close</button>
        <button class="btn btn-primary" onclick="window.timeBreakdownEngine.copyToClipboard()" style="font-weight: 700; background: linear-gradient(135deg, #10b981 0%, #059669 100%); border: none; display: flex; align-items: center; gap: 6px; box-shadow: 0 2px 8px rgba(16, 185, 129, 0.4);">
          <span>📋</span> Copy Breakdown to Clipboard
        </button>
      `;
    }
  }

  copyToClipboard() {
    const textarea = document.getElementById('time-breakdown-output');
    if (!textarea || !textarea.value) return;

    navigator.clipboard.writeText(textarea.value).then(() => {
      alert('✅ Daily Accomplishments report copied to clipboard!\n\nYou can now paste directly into your timesheet or email.');
    }).catch(err => {
      console.error('Clipboard copy failed:', err);
      prompt('Copy the report text below:', textarea.value);
    });
  }

  escapeHtml(str) {
    if (!str && str !== 0) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
}

// Attach globally
window.TimeBreakdownEngine = TimeBreakdownEngine;
