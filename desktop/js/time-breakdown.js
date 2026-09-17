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

  normalizeDateKey(rawDate) {
    if (!rawDate) return '';
    if (rawDate instanceof Date) return this.formatDateKey(rawDate);
    const str = String(rawDate).trim();
    if (!str) return '';
    if (/^\d{4}-\d{2}-\d{2}/.test(str)) return str.substring(0, 10);
    const slashParts = str.split('/');
    if (slashParts.length === 3) {
      const mm = slashParts[0].padStart(2, '0');
      const dd = slashParts[1].padStart(2, '0');
      let yyyy = slashParts[2].split(' ')[0].trim();
      if (yyyy.length === 2) yyyy = '20' + yyyy;
      return `${yyyy}-${mm}-${dd}`;
    }
    const parsed = new Date(str);
    return isNaN(parsed.getTime()) ? '' : this.formatDateKey(parsed);
  }

  cleanSwapSheetName(key) {
    const map = {
      'glove_swaps': 'Glove Swap',
      'sleeve_swaps': 'Sleeve Swap',
      'blanket_swaps': 'Blanket Swap',
      'mack_swaps': 'MACK Swap',
      'hv_tester_swaps': 'HV Tester Swap',
      'phasing_set_swaps': 'Phasing Set Swap',
      'aed_swaps': 'AED Swap',
      'ground_swaps': 'Ground Swap',
      'hot_stick_swaps': 'Hot Stick Swap'
    };
    return map[key] || key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  }

  /**
   * Collects all completed tasks, trips, and trainings in the date range.
   */
  collectAccomplishments() {
    const trips = (this.db && typeof this.db.getPlannedTrips === 'function') ? (this.db.getPlannedTrips() || {}) : {};
    const manualTasks = (this.db && typeof this.db.getManualTasks === 'function') ? (this.db.getManualTasks() || []) : [];
    const metaTable = this.db ? this.db.getTable('task_metadata') : null;
    const trainTable = this.db ? this.db.getTable('training_tracking') : null;
    const drugTestTable = this.db ? this.db.getTable('dot_drug_tests') : null;

    // Group items by dateKey (YYYY-MM-DD)
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
        classes: [],
        officeTasks: [],
        drugTests: []
      };
      cur.setDate(cur.getDate() + 1);
    }

    // 1. Collect Trips Planned (Field Visits) - NO drive times stored or needed
    Object.keys(trips).forEach(dKey => {
      if (daysMap[dKey]) {
        const tripEntries = Array.isArray(trips[dKey]) ? trips[dKey] : [trips[dKey]];
        tripEntries.forEach(t => {
          if (!t || !t.location) return;
          if (!daysMap[dKey].locations[t.location]) {
            daysMap[dKey].locations[t.location] = {
              name: t.location,
              crews: []
            };
          }
          if (t.crew && !daysMap[dKey].locations[t.location].crews.includes(t.crew)) {
            daysMap[dKey].locations[t.location].crews.push(t.crew);
          }
        });
      }
    });

    // 2. Collect Checked-off Manual Tasks from Trip Planner (Classes & Office Tasks)
    manualTasks.forEach(t => {
      const isComplete = String(t.status || '').toLowerCase() === 'complete';
      if (!isComplete) return;

      const dKey = t.dateKey || t.date || this.normalizeDateKey(t.completedAt);
      if (daysMap[dKey]) {
        const isCert = (t.taskCategory === 'cert_class' || !!t.certType);
        if (isCert) {
          daysMap[dKey].classes.push(t);
        } else {
          daysMap[dKey].officeTasks.push(t);
        }
      }
    });

    // 3. Collect Completed Equipment Swaps from Swap Sheets
    const swapSheets = [
      'glove_swaps', 'sleeve_swaps', 'blanket_swaps', 'mack_swaps',
      'hv_tester_swaps', 'phasing_set_swaps', 'aed_swaps', 'ground_swaps', 'hot_stick_swaps'
    ];
    const seenSwapKeys = new Set();

    swapSheets.forEach(swKey => {
      const swTable = this.db ? this.db.getTable(swKey) : null;
      if (swTable && swTable.rows) {
        swTable.rows.forEach(r => {
          const status = String(r['Status'] || r['Stage'] || '').toLowerCase();
          const dateChanged = String(r['Date Changed'] || r['Delivered Date'] || r['Completed Date'] || '').trim();

          if (dateChanged || status.includes('delivered') || status === 'complete' || status === 'resolved') {
            const rawDate = dateChanged || r['Stage 3 Date'] || r['Stage 2 Date'] || r['Date'];
            const dKey = this.normalizeDateKey(rawDate);
            if (daysMap[dKey]) {
              const emp = r['Employee'] || r['Assigned To'] || 'Worker';
              const item = r['Item #'] || r['Item#'] || r['Serial #'] || r['Current Glove #'] || r['Current Sleeve #'] || r['Pick List Item #'] || '';
              const dedupeKey = `${swKey}_${emp}_${item}`.toLowerCase();
              if (!seenSwapKeys.has(dedupeKey)) {
                seenSwapKeys.add(dedupeKey);
                daysMap[dKey].tasks.push({
                  type: this.cleanSwapSheetName(swKey),
                  item: item,
                  employee: emp,
                  job: r['Job Number'] || r['Job #'] || r['Crew'] || '',
                  status: 'Delivered'
                });
              }
            }
          }
        });
      }
    });

    // 4. Collect Completed Tasks from task_metadata
    if (metaTable && metaTable.rows) {
      metaTable.rows.forEach(r => {
        const status = String(r['Status'] || '').toLowerCase();
        if (status !== 'complete' && status !== 'resolved') return;

        const rawDate = r['CompletedDate'] || r['Completed Date'] || r['LastModified'] || r['DueDate'];
        const dKey = this.normalizeDateKey(rawDate);
        if (daysMap[dKey]) {
          const emp = r['Employee'] || 'Unassigned';
          const type = r['TaskType'] || r['Type'] || 'Task';
          const item = r['CurrentItem'] || r['ItemType'] || '';
          const dedupeKey = `${type}_${emp}_${item}`.toLowerCase();
          if (!seenSwapKeys.has(dedupeKey)) {
            seenSwapKeys.add(dedupeKey);
            daysMap[dKey].tasks.push({
              type: type,
              item: item,
              employee: emp,
              job: r['Job Number'] || r['Job #'] || '',
              status: 'Complete'
            });
          }
        }
      });
    }

    // 5. Collect Completed Monthly Trainings from training_tracking
    if (trainTable && trainTable.rows) {
      trainTable.rows.forEach(tr => {
        const status = String(tr['Status'] || tr['Training Status'] || '').toLowerCase();
        if (status !== 'complete') return;

        const rawDate = tr['Completion Date'] || tr['Date Completed'] || tr['Date'] || tr['Date Done'];
        const dKey = this.normalizeDateKey(rawDate);
        if (daysMap[dKey]) {
          daysMap[dKey].trainings.push(tr);
        }
      });
    }

    // 6. Collect Completed DOT Drug Tests from dot_drug_tests
    if (drugTestTable && drugTestTable.rows) {
      drugTestTable.rows.forEach(dt => {
        const status = String(dt['Status'] || dt[14] || '').toLowerCase();
        if (!status.includes('complete') && !status.includes('done')) return;

        const rawDate = dt['Date Completed'] || dt['Scheduled Date'];
        const dKey = this.normalizeDateKey(rawDate);
        if (daysMap[dKey]) {
          daysMap[dKey].drugTests.push(dt);
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
    let totalClasses = 0;
    let totalOfficeTasks = 0;
    let totalTrainings = 0;
    let totalDrugTests = 0;
    let daysWithContent = 0;

    days.forEach(day => {
      const dayName = day.date.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' });
      const locKeys = Object.keys(day.locations);
      const hasClasses = day.classes && day.classes.length > 0;
      const hasOffice = day.officeTasks && day.officeTasks.length > 0;
      const hasTasks = day.tasks && day.tasks.length > 0;
      const hasTrainings = day.trainings && day.trainings.length > 0;
      const hasDrugTests = day.drugTests && day.drugTests.length > 0;
      const hasLocations = locKeys.length > 0;

      const hasContent = hasLocations || hasClasses || hasOffice || hasTasks || hasTrainings || hasDrugTests;
      if (!hasContent) return;

      daysWithContent++;
      lines.push(`📅 ${dayName}`);
      lines.push(`-------------------------------------------------------`);

      // Locations & Travel (Drive times removed per user request)
      if (hasLocations) {
        locKeys.forEach(locKey => {
          totalTrips++;
          const loc = day.locations[locKey];
          const crewStr = (loc.crews && loc.crews.filter(Boolean).length > 0) ? ` (Crews: ${loc.crews.filter(Boolean).join(', ')})` : '';
          lines.push(`  🚗 Field Visit: ${loc.name}${crewStr}`);
        });
      }

      // Completed Classes Taught
      if (hasClasses) {
        lines.push(`  🎓 Training Classes Taught (${day.classes.length}):`);
        day.classes.forEach(c => {
          totalClasses++;
          const loc = c.location ? ` [${c.location}]` : '';
          const time = c.time ? ` (${c.time})` : '';
          const crew = (c.crewIds && c.crewIds.length > 0) ? ` · Crew: ${c.crewIds.join(', ')}` : (c.crewId ? ` · Crew: ${c.crewId}` : '');
          const attCount = (c.assignedEmployees && c.assignedEmployees.length) || (c.employee ? 1 : 0);
          const attStr = attCount > 0 ? ` · Attendees (${attCount}): ${(c.assignedEmployees || [c.employee]).join(', ')}` : '';
          lines.push(`     • ${c.title}${loc}${time}${crew}${attStr}`);
        });
      }

      // Completed Personal / Office / Safety Admin Tasks
      if (hasOffice) {
        lines.push(`  💼 Completed Office & Safety Tasks (${day.officeTasks.length}):`);
        day.officeTasks.forEach(ot => {
          totalOfficeTasks++;
          const loc = (ot.location && ot.location !== 'Helena Office') ? ` [${ot.location}]` : '';
          const time = ot.time ? ` (${ot.time})` : '';
          const notes = ot.notes ? ` · ${ot.notes}` : '';
          lines.push(`     • ${ot.title}${loc}${time}${notes}`);
        });
      }

      // Completed Equipment Swaps & Tasks
      if (hasTasks) {
        lines.push(`  🔧 Completed Equipment Swaps & Tasks (${day.tasks.length}):`);
        day.tasks.forEach(t => {
          totalCompletedTasks++;
          const emp = t.employee || t['Assigned To'] || t['Employee'] || 'Unassigned';
          const type = t.type || t['Task Type'] || t['Type'] || 'Task';
          const desc = t.item || t['Description'] || t['Item'] || '';
          const job = t.job || t['Job Number'] || t['Job #'] || '';
          lines.push(`     • ${type}${desc ? ': ' + desc : ''} (${emp}${job ? ' · Job ' + job : ''})`);
        });
      }

      // Completed Monthly Safety Trainings
      if (hasTrainings) {
        lines.push(`  📚 Monthly Safety Training Records (${day.trainings.length}):`);
        day.trainings.forEach(tr => {
          totalTrainings++;
          const topic = tr['Training Topic'] || tr['Topic'] || tr['Training'] || 'Safety Training';
          const crew = tr['Crew #'] || tr['Crew'] || tr['Job #'] || '';
          const lead = tr['Crew Lead'] || tr['Lead'] || tr['Foreman'] || '';
          lines.push(`     • ${topic}${crew ? ' · Crew ' + crew : ''}${lead ? ' (Lead: ' + lead + ')' : ''}`);
        });
      }

      // Completed DOT Drug Tests
      if (hasDrugTests) {
        lines.push(`  🧪 Completed DOT Drug Tests (${day.drugTests.length}):`);
        day.drugTests.forEach(dt => {
          totalDrugTests++;
          const emp = dt['Employee Name'] || dt['Name'] || 'Worker';
          const testType = dt['Test Type'] || 'Drug Test';
          const clinic = dt['Clinic Name'] || dt['Collection Type'] || '';
          lines.push(`     • ${emp} · ${testType}${clinic ? ' (' + clinic + ')' : ''}`);
        });
      }

      lines.push('');
    });

    if (daysWithContent === 0) {
      return 'No completed tasks, field visits, or trainings recorded for the selected period.';
    }

    const summaryParts = [];
    if (totalTrips > 0) summaryParts.push(`${totalTrips} Field Location Visits`);
    if (totalClasses > 0) summaryParts.push(`${totalClasses} Classes Taught`);
    if (totalOfficeTasks > 0) summaryParts.push(`${totalOfficeTasks} Office Tasks`);
    if (totalCompletedTasks > 0) summaryParts.push(`${totalCompletedTasks} Equipment Swaps`);
    if (totalTrainings > 0) summaryParts.push(`${totalTrainings} Trainings`);
    if (totalDrugTests > 0) summaryParts.push(`${totalDrugTests} Drug Tests`);

    lines.push(`=======================================================`);
    lines.push(`SUMMARY: ${summaryParts.join(' | ') || '0 Accomplishments'}`);
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
