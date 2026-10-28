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
    this.reportFormat = 'paragraph'; // 'paragraph' (conversational) or 'bullets'
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

  getSignificantJobNumber(jobNum) {
    if (!jobNum) return '';
    const match = String(jobNum).trim().match(/^(\d+-\d+)/);
    return match ? match[1] : String(jobNum).trim();
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

  normalizeEmpName(name) {
    if (!name) return '';
    return String(name)
      .replace(/\s*\((?:prev\s*emp|previous\s*employee|former\s*worker|former\s*employee|vacation|light\s*duty|leave|medical|worker'?s\s*comp)\)/gi, '')
      .trim();
  }

  cleanPhysicalLocation(loc) {
    if (!loc) return '';
    let clean = String(loc).trim();
    const parenMatch = clean.match(/^([^(]+)\s*\([^)]+\)$/);
    if (parenMatch) clean = parenMatch[1].trim();
    if (/^(helena\s+office|helena\s+shop|office|shop)$/i.test(clean)) {
      return 'Helena';
    }
    return clean.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
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

  formatTaskSentence(rawTitle, rawNotes) {
    let title = String(rawTitle || '').trim();
    if (!title) return '';

    // Strip trailing punctuation
    title = title.replace(/[.\s]+$/, '');

    // Convert leading imperative verbs to natural past tense
    const verbMap = [
      [/^deliver\b/i, 'Delivered'],
      [/^drop off\b/i, 'Dropped off'],
      [/^pick up\b/i, 'Picked up'],
      [/^meet with\b/i, 'Met with'],
      [/^meet\b/i, 'Met'],
      [/^check\b/i, 'Checked'],
      [/^inspect\b/i, 'Inspected'],
      [/^audit\b/i, 'Audited'],
      [/^review\b/i, 'Reviewed'],
      [/^send\b/i, 'Sent'],
      [/^order\b/i, 'Ordered'],
      [/^clean\b/i, 'Cleaned'],
      [/^organize\b/i, 'Organized'],
      [/^fix\b/i, 'Fixed'],
      [/^repair\b/i, 'Repaired'],
      [/^schedule\b/i, 'Scheduled'],
      [/^coordinate\b/i, 'Coordinated'],
      [/^assist\b/i, 'Assisted'],
      [/^help\b/i, 'Helped'],
      [/^take\b/i, 'Took'],
      [/^bring\b/i, 'Brought'],
      [/^issue\b/i, 'Issued'],
      [/^exchange\b/i, 'Exchanged'],
      [/^swap\b/i, 'Swapped'],
      [/^replace\b/i, 'Replaced'],
      [/^provide\b/i, 'Provided'],
      [/^teach\b/i, 'Taught'],
      [/^train\b/i, 'Trained'],
      [/^install\b/i, 'Installed'],
      [/^test\b/i, 'Tested'],
      [/^perform\b/i, 'Performed'],
      [/^complete\b/i, 'Completed'],
      [/^handle\b/i, 'Handled'],
      [/^follow up\b/i, 'Followed up']
    ];

    let matched = false;
    for (const [pattern, replacement] of verbMap) {
      if (pattern.test(title)) {
        title = title.replace(pattern, replacement);
        matched = true;
        break;
      }
    }

    if (!matched && !/^[A-Z][a-z]+ed\b/.test(title)) {
      title = title.charAt(0).toUpperCase() + title.slice(1);
    }

    const cleanNotes = rawNotes ? String(rawNotes).replace(/\r?\n+/g, ' ').replace(/[.\s]+$/, '').trim() : '';
    if (cleanNotes && cleanNotes.includes('Recorded from Rubber PPE Tracker')) {
      const m = cleanNotes.match(/Assigned\s+([^#]+)#([^\s(]+)(?:\s*\(([^)]+)\))?\s+to\s+(.+?)(?:\s+on\s+Crew\s+([^,]+?))?\s+at\s+([^.]+?)\s*\.\s*\(Recorded/i);
      if (m) {
        const itemType = m[1].trim().toLowerCase();
        const itemNum = m[2].trim();
        const specs = m[3] ? ` (${m[3].trim()})` : '';
        const emp = m[4].trim();
        const crew = m[5] ? m[5].trim() : "";
        const loc = m[6] ? m[6].trim() : "";
        const tagParts = [];
        if (crew) tagParts.push(`Crew ${crew}`);
        if (loc) tagParts.push(loc);
        const tag = tagParts.length > 0 ? ` (${tagParts.join(", ")})` : "";
        return `Assigned and staged initial ${itemType} #${itemNum}${specs} in the shop for ${emp}${tag}.`;
      }
      return `Assigned and staged ${title} in the shop for field delivery.`;
    }
    if (title.toLowerCase() === 'dentist') {
      return 'Personal appointment (Dentist).';
    }
    if (title.toLowerCase() === 'doctor') {
      return 'Personal appointment (Doctor).';
    }
    const fullText = cleanNotes ? `${title} (${cleanNotes})` : title;
    return `${fullText}.`;
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

    // 1. Build lookup tables for employees and inventory items
    const empTable = this.db ? this.db.getTable('employees') : null;
    const empMap = {};
    if (empTable && empTable.rows) {
      empTable.rows.forEach(r => {
        const n = String(r['Employee Name'] || '').trim().toLowerCase();
        if (n) {
          empMap[n] = {
            name: String(r['Employee Name'] || '').trim(),
            crew: String(r['Job Number'] || r['Job #'] || '').trim(),
            loc: String(r['Location'] || '').trim()
          };
        }
      });
    }
    this.empMap = empMap;

    const invLookup = {};
    const invTables = ['gloves', 'sleeves', 'blankets', 'macks', 'hv_testers', 'phasing_sets', 'aed', 'grounds', 'hot_sticks'];
    invTables.forEach(tblKey => {
      invLookup[tblKey] = {};
      const tbl = this.db ? this.db.getTable(tblKey) : null;
      if (tbl && tbl.rows) {
        tbl.rows.forEach(r => {
          const num = String(r['Glove'] || r['Sleeve'] || r['Blanket'] || r['MACK'] || r['Item #'] || r['Item'] || r['Serial #'] || r['ESL ID'] || '').trim();
          if (num) invLookup[tblKey][num] = r;
        });
      }
    });

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
        drugTests: [],
        equipmentDeliveries: []
      };
      cur.setDate(cur.getDate() + 1);
    }

    // 2. Collect Trips Planned (Field Visits)
    Object.keys(trips).forEach(dKey => {
      if (daysMap[dKey]) {
        const tripEntries = Array.isArray(trips[dKey]) ? trips[dKey] : [trips[dKey]];
        tripEntries.forEach(t => {
          if (!t || !t.location) return;
          if (!daysMap[dKey].locations[t.location]) {
            daysMap[dKey].locations[t.location] = {
              name: t.location,
              crews: [],
              swaps: []
            };
          }
          if (t.crew && !daysMap[dKey].locations[t.location].crews.includes(t.crew)) {
            daysMap[dKey].locations[t.location].crews.push(t.crew);
          }
        });
      }
    });

    // 3. Collect Checked-off Manual Tasks from Trip Planner (Classes & Office Tasks)
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

    // 4. Collect Completed Equipment Swaps from Manual Picks and Swap Sheets
    // Gather scheduled swaps registry from Trip Planner first so we know which dateKey each swap was scheduled on
    const schedRegistry = {};
    if (this.db && typeof this.db.getScheduledSwaps === 'function') {
      Object.assign(schedRegistry, this.db.getScheduledSwaps() || {});
    }
    if (this.db && this.db.snapshot && this.db.snapshot.configs && this.db.snapshot.configs.scheduled_swaps) {
      Object.assign(schedRegistry, this.db.snapshot.configs.scheduled_swaps);
    }
    try {
      const localSched = JSON.parse(localStorage.getItem('TRIP_PLANNER_SCHEDULED_SWAPS') || localStorage.getItem('sa_trip_scheduled_swaps') || '{}');
      Object.assign(schedRegistry, localSched);
    } catch { /* ignore */ }

    // Load office task registry for swaps/reclaims
    const swapOfficeRegistry = {};
    try {
      const localOffice = JSON.parse(localStorage.getItem('TRIP_PLANNER_SWAP_OFFICE_TASKS') || '{}');
      Object.assign(swapOfficeRegistry, localOffice);
    } catch { /* ignore */ }

    const cleanNum = (s) => String(s || '').replace(/^[#\s]+/, '').trim().toLowerCase();

    const getSwapOfficeInfo = (sKey, emp, oldItm, newItm, type, dKey) => {
      if (sKey && swapOfficeRegistry[sKey] && swapOfficeRegistry[sKey].isOfficeTask) {
        return { isOfficeTask: true, officeNote: swapOfficeRegistry[sKey].officeNote || '' };
      }
      if (sKey && schedRegistry[sKey] && schedRegistry[sKey].isOfficeTask) {
        return { isOfficeTask: true, officeNote: schedRegistry[sKey].officeNote || '' };
      }
      const rawEmpK = String(emp || '').trim().toLowerCase();
      const normEmpK = this.normalizeEmpName(emp).toLowerCase();
      const oldK = cleanNum(oldItm);
      const newK = cleanNum(newItm);
      const typeK = String(type || '').trim().toLowerCase();
      const empVariants = [...new Set([rawEmpK, normEmpK])].filter(Boolean);
      const targetDateIso = this.normalizeDateKey(dKey);

      for (const ek of empVariants) {
        if (oldK) {
          const candidates = [
            `${typeK}_${ek}_${oldK}_${targetDateIso}`,
            `${typeK}_${ek}_${oldK}_${dKey}`,
            `${typeK}_${ek}_${oldK}`,
            `${ek}_${oldK}_${targetDateIso}`,
            `${ek}_${oldK}_${dKey}`,
            `${ek}_${oldK}`
          ];
          for (const ck of candidates) {
            if (swapOfficeRegistry[ck] && swapOfficeRegistry[ck].isOfficeTask) {
              return { isOfficeTask: true, officeNote: swapOfficeRegistry[ck].officeNote || '' };
            }
          }
        }
        if (newK) {
          const candidates = [
            `${typeK}_${ek}_${newK}`,
            `${ek}_${newK}`
          ];
          for (const ck of candidates) {
            if (swapOfficeRegistry[ck] && swapOfficeRegistry[ck].isOfficeTask) {
              return { isOfficeTask: true, officeNote: swapOfficeRegistry[ck].officeNote || '' };
            }
          }
        }
        if (targetDateIso && swapOfficeRegistry[`emp_${ek}_${targetDateIso}`] && swapOfficeRegistry[`emp_${ek}_${targetDateIso}`].isOfficeTask) {
          return { isOfficeTask: true, officeNote: swapOfficeRegistry[`emp_${ek}_${targetDateIso}`].officeNote || '' };
        }
        if (dKey && swapOfficeRegistry[`emp_${ek}_${dKey}`] && swapOfficeRegistry[`emp_${ek}_${dKey}`].isOfficeTask) {
          return { isOfficeTask: true, officeNote: swapOfficeRegistry[`emp_${ek}_${dKey}`].officeNote || '' };
        }
        if (swapOfficeRegistry[`emp_${ek}`] && swapOfficeRegistry[`emp_${ek}`].isOfficeTask) {
          return { isOfficeTask: true, officeNote: swapOfficeRegistry[`emp_${ek}`].officeNote || '' };
        }
      }

      // Exact item match across all office task records
      for (const [k, entry] of Object.entries(swapOfficeRegistry)) {
        if (entry && entry.isOfficeTask) {
          const entryEmpRaw = String(entry.employeeName || '').trim().toLowerCase();
          const entryEmpNorm = this.normalizeEmpName(entry.employeeName || '').toLowerCase();
          const entryOld = cleanNum(entry.currentItem || entry.oldItem);
          const empMatches = empVariants.includes(entryEmpRaw) || empVariants.includes(entryEmpNorm);
          if (empMatches && (!oldK || entryOld === oldK)) {
            return { isOfficeTask: true, officeNote: entry.officeNote || '' };
          }
        }
      }

      for (const [sk, entry] of Object.entries(schedRegistry)) {
        if (entry && entry.isOfficeTask) {
          const sDate = entry.dateKey || (entry.swap && entry.swap.dateKey) || '';
          const sDateIso = this.normalizeDateKey(sDate);
          if (targetDateIso && sDateIso && sDateIso !== targetDateIso) continue;
          const sEmpRaw = String(entry.employeeName || (entry.swap && entry.swap.employeeName) || '').trim().toLowerCase();
          const sEmpNorm = this.normalizeEmpName(entry.employeeName || (entry.swap && entry.swap.employeeName) || '').toLowerCase();
          const sOld = cleanNum(entry.currentItem || (entry.swap && entry.swap.currentItem));
          const empMatches = empVariants.includes(sEmpRaw) || empVariants.includes(sEmpNorm);
          if (empMatches && (!oldK || sOld === oldK)) {
            return { isOfficeTask: true, officeNote: entry.officeNote || '' };
          }
        }
      }

      // Fallback: match by employee on this date!
      // If Joe Piazzola or Trapper Payne had items brought to the shop (e.g. Syd or JT delivered PPE),
      // ALL swaps/reclaims for that employee on that trip date share the office task status and note.
      for (const [k, entry] of Object.entries(swapOfficeRegistry)) {
        if (entry && entry.isOfficeTask) {
          const entryEmpRaw = String(entry.employeeName || '').trim().toLowerCase();
          const entryEmpNorm = this.normalizeEmpName(entry.employeeName || '').toLowerCase();
          const empMatches = empVariants.includes(entryEmpRaw) || empVariants.includes(entryEmpNorm);
          if (empMatches) {
            const entryDateIso = this.normalizeDateKey(entry.dateKey);
            if (!targetDateIso || !entryDateIso || entryDateIso === targetDateIso) {
              return { isOfficeTask: true, officeNote: entry.officeNote || '' };
            }
          }
        }
      }

      for (const [sk, entry] of Object.entries(schedRegistry)) {
        if (entry && entry.isOfficeTask) {
          const sDate = entry.dateKey || (entry.swap && entry.swap.dateKey) || '';
          const sDateIso = this.normalizeDateKey(sDate);
          if (targetDateIso && sDateIso && sDateIso !== targetDateIso) continue;
          const sEmpRaw = String(entry.employeeName || (entry.swap && entry.swap.employeeName) || '').trim().toLowerCase();
          const sEmpNorm = this.normalizeEmpName(entry.employeeName || (entry.swap && entry.swap.employeeName) || '').toLowerCase();
          const empMatches = empVariants.includes(sEmpRaw) || empVariants.includes(sEmpNorm);
          if (empMatches) {
            return { isOfficeTask: true, officeNote: entry.officeNote || '' };
          }
        }
      }

      return { isOfficeTask: false, officeNote: '' };
    };

    // Map scheduled swap keys to their scheduled trip dateKey
    const scheduledDateMap = {};
    Object.keys(schedRegistry).forEach(k => {
      const entry = schedRegistry[k];
      if (!entry) return;
      const sDateKey = entry.dateKey || (entry.swap && entry.swap.dateKey) || '';
      if (sDateKey) {
        const swapData = entry.swap || entry;
        const emp = String(entry.employeeName || swapData.employeeName || swapData.employee || '').trim().toLowerCase();
        const oldItm = String(swapData.currentItem || swapData.oldItem || entry.currentItem || '').trim().toLowerCase();
        const newItm = String(swapData.pickItem || swapData.newItem || entry.pickItem || '').trim().toLowerCase();
        const swType = String(entry.type || swapData.type || '').trim().toLowerCase();
        if (emp && oldItm) {
          scheduledDateMap[`${emp}_${oldItm}`] = sDateKey;
          if (swType) scheduledDateMap[`${swType}_${emp}_${oldItm}`] = sDateKey;
        }
        if (emp && newItm && newItm !== '—' && newItm !== '-') {
          scheduledDateMap[`new_${emp}_${newItm}`] = sDateKey;
          if (swType) scheduledDateMap[`new_${swType}_${emp}_${newItm}`] = sDateKey;
        }
      }
    });

    const swapSheets = [
      { sw: 'glove_swaps', inv: 'gloves', label: 'Glove' },
      { sw: 'sleeve_swaps', inv: 'sleeves', label: 'Sleeve' },
      { sw: 'blanket_swaps', inv: 'blankets', label: 'Blanket' },
      { sw: 'mack_swaps', inv: 'macks', label: 'MACK' },
      { sw: 'hv_tester_swaps', inv: 'hv_testers', label: 'HV Tester' },
      { sw: 'phasing_set_swaps', inv: 'phasing_sets', label: 'Phasing Set' },
      { sw: 'aed_swaps', inv: 'aed', label: 'AED' },
      { sw: 'ground_swaps', inv: 'grounds', label: 'Ground' },
      { sw: 'hot_stick_swaps', inv: 'hot_sticks', label: 'Hot Stick' }
    ];
    const seenSwapKeys = new Set();

    swapSheets.forEach(cfg => {
      // A. Manual picks registry (contains real-time delivered swaps in desktop app)
      const mpRegistry = {};
      if (this.db && typeof this.db.getManualPicks === 'function') {
        Object.assign(mpRegistry, this.db.getManualPicks(cfg.sw) || {});
      }
      if (this.db && this.db.snapshot && this.db.snapshot.manualPicks && this.db.snapshot.manualPicks[cfg.sw]) {
        Object.assign(mpRegistry, this.db.snapshot.manualPicks[cfg.sw]);
      }

      Object.keys(mpRegistry).forEach(mpKey => {
        if (!mpKey.includes('|')) return;
        const entry = mpRegistry[mpKey];
        if (entry && String(entry.status || '').includes('Delivered')) {
          const empClean = String(entry.empName || '').trim();
          const empInfo = empMap[empClean.toLowerCase()] || {};
          const invTable = invLookup[cfg.inv] || {};
          const newInvItem = invTable[entry.pickListNum] || {};

          const rawPick = String(entry.pickListNum || '').trim();
          const cleanNew = (rawPick === '—' || rawPick === '-') ? '' : rawPick;
          const cleanOld = String(entry.currentItemNum || '').trim();
          const isReclaim = !cleanNew;
          const normEmp = this.normalizeEmpName(empClean).toLowerCase();
          const dedupe = `${cfg.label}_${normEmp}_${cleanNew}_${cleanOld}`.toLowerCase();

          // Prioritize scheduled trip dateKey over entry.deliveredDate if user checked box on later day
          const empKey = empClean.toLowerCase();
          const oldItmKey = cleanOld.toLowerCase();
          const newItmKey = cleanNew.toLowerCase();
          const swType = cfg.label.toLowerCase();
          const schedTripDate = scheduledDateMap[`${swType}_${empKey}_${oldItmKey}`] ||
            scheduledDateMap[`${empKey}_${oldItmKey}`] ||
            (newItmKey ? (scheduledDateMap[`new_${swType}_${empKey}_${newItmKey}`] || scheduledDateMap[`new_${empKey}_${newItmKey}`]) : '');

          const isStillAssignedToEmp = newInvItem && String(newInvItem['Assigned To'] || '').trim().toLowerCase() === empKey;
          let rawDate = schedTripDate || (isStillAssignedToEmp && newInvItem['Date Assigned'] ? newInvItem['Date Assigned'] : '') || entry.deliveredDate || (entry.timestamp ? entry.timestamp.substring(0, 10) : '');
          const dKey = this.normalizeDateKey(rawDate);
          if (daysMap[dKey]) {
            if (!seenSwapKeys.has(dedupe)) {
              seenSwapKeys.add(dedupe);
              const sKey = `${cfg.sw}|${empClean.toLowerCase()}|${cfg.label.toLowerCase()}|${cleanOld.toLowerCase()}`;
              const officeInfo = getSwapOfficeInfo(sKey, empClean, cleanOld, cleanNew, cfg.label, dKey);
              const swapObj = {
                type: isReclaim ? `${cfg.label} Reclaim` : `${cfg.label} Swap`,
                label: cfg.label,
                isReclaim: isReclaim,
                employee: empClean,
                oldItem: cleanOld,
                newItem: cleanNew,
                size: newInvItem['Size'] || '',
                itemClass: newInvItem['Class'] || '',
                kv: newInvItem['KV'] || '',
                model: newInvItem['Model'] || '',
                length: newInvItem['Length'] || '',
                location: newInvItem['Location'] || empInfo.loc || 'Helena',
                crew: empInfo.crew || '',
                status: 'Delivered',
                isOfficeTask: officeInfo.isOfficeTask,
                officeNote: officeInfo.officeNote
              };

              const cleanSwapLoc = this.cleanPhysicalLocation(swapObj.location) || 'Helena';
              swapObj.originCity = cleanSwapLoc;

              if (swapObj.isOfficeTask) {
                // Handled in office / shop — belongs to Helena! Does not create a field trip or travel leg!
                if (!daysMap[dKey].locations['Helena']) {
                  daysMap[dKey].locations['Helena'] = {
                    name: 'Helena',
                    crews: [],
                    swaps: []
                  };
                }
                daysMap[dKey].locations['Helena'].swaps.push(swapObj);
              } else {
                let attached = false;
                const dayLocKeys = Object.keys(daysMap[dKey].locations);
                for (const lKey of dayLocKeys) {
                  const locObj = daysMap[dKey].locations[lKey];
                  const locNameClean = lKey.toLowerCase();
                  const swapLocClean = swapObj.location.toLowerCase();
                  const swapSigCrew = this.getSignificantJobNumber(swapObj.crew);
                  const locCrewsSig = (locObj.crews || []).map(c => this.getSignificantJobNumber(c));

                  if (swapLocClean === locNameClean || swapLocClean.includes(locNameClean) || locNameClean.includes(swapLocClean) || (swapSigCrew && locCrewsSig.includes(swapSigCrew))) {
                    locObj.swaps.push(swapObj);
                    attached = true;
                    break;
                  }
                }

                if (!attached) {
                  if (cleanSwapLoc && cleanSwapLoc.toLowerCase() !== 'helena' && !this.isStatusLocation(cleanSwapLoc)) {
                    if (!daysMap[dKey].locations[cleanSwapLoc]) {
                      daysMap[dKey].locations[cleanSwapLoc] = {
                        name: cleanSwapLoc,
                        crews: [],
                        swaps: []
                      };
                    }
                    daysMap[dKey].locations[cleanSwapLoc].swaps.push(swapObj);
                  } else {
                    daysMap[dKey].tasks.push(swapObj);
                  }
                }
              }
            }
          }
        }
      });

      // B. Swap sheet rows (for swaps tracked directly in table rows)
      const swTable = this.db ? this.db.getTable(cfg.sw) : null;
      if (swTable && swTable.rows) {
        swTable.rows.forEach(r => {
          const status = String(r['Status'] || r['Stage'] || '').toLowerCase();
          const dateChanged = String(r['Date Changed'] || r['Delivered Date'] || r['Completed Date'] || '').trim();

          if (dateChanged || status.includes('delivered') || status === 'complete' || status === 'resolved') {
            const empClean = String(r['Employee'] || r['Assigned To'] || 'Worker').trim();
            const oldItem = String(r['Current Glove #'] || r['Current Sleeve #'] || r['Current Item #'] || r['Item #'] || '').trim();
            const rawPick = String(r['Pick List Glove #'] || r['Pick List Sleeve #'] || r['Pick List Item #'] || '').trim();
            const cleanNew = (rawPick === '—' || rawPick === '-') ? '' : rawPick;

            // Prioritize scheduled trip dateKey over dateChanged if user checked box on later day
            const empKey = empClean.toLowerCase();
            const oldItmKey = oldItem.toLowerCase();
            const newItmKey = cleanNew.toLowerCase();
            const swType = cfg.label.toLowerCase();
            const schedTripDate = scheduledDateMap[`${swType}_${empKey}_${oldItmKey}`] ||
              scheduledDateMap[`${empKey}_${oldItmKey}`] ||
              (newItmKey ? (scheduledDateMap[`new_${swType}_${empKey}_${newItmKey}`] || scheduledDateMap[`new_${empKey}_${newItmKey}`]) : '');

            const rawDate = schedTripDate || dateChanged || r['Stage 3 Date'] || r['Stage 2 Date'] || r['Date'];
            const dKey = this.normalizeDateKey(rawDate);
            if (daysMap[dKey]) {
              const isReclaim = Boolean(!cleanNew || String(r['Days Left'] || '').toUpperCase().includes('PREV') || status.includes('return to shelf'));
              const normEmp = this.normalizeEmpName(empClean).toLowerCase();
              const dedupe = `${cfg.label}_${normEmp}_${cleanNew}_${oldItem}`.toLowerCase();
              if (!seenSwapKeys.has(dedupe)) {
                seenSwapKeys.add(dedupe);
                const empInfo = empMap[empClean.toLowerCase()] || {};
                const sKey = `${cfg.sw}|${empClean.toLowerCase()}|${cfg.label.toLowerCase()}|${oldItem.toLowerCase()}`;
                const officeInfo = getSwapOfficeInfo(sKey, empClean, oldItem, cleanNew, cfg.label, dKey);
                const swapObj = {
                  type: isReclaim ? `${cfg.label} Reclaim` : `${cfg.label} Swap`,
                  label: cfg.label,
                  isReclaim: isReclaim,
                  employee: empClean,
                  oldItem: oldItem,
                  newItem: cleanNew,
                  size: r['Size'] || '',
                  itemClass: r['Class'] || '',
                  kv: r['KV'] || '',
                  model: r['Model'] || '',
                  length: r['Length'] || '',
                  location: r['Location'] || empInfo.loc || 'Helena',
                  crew: r['Job Number'] || r['Job #'] || empInfo.crew || '',
                  status: 'Delivered',
                  isOfficeTask: officeInfo.isOfficeTask,
                  officeNote: officeInfo.officeNote
                };

                const cleanSwapLoc = this.cleanPhysicalLocation(swapObj.location) || 'Helena';
                swapObj.originCity = cleanSwapLoc;

                if (swapObj.isOfficeTask) {
                  // Handled in office / shop — belongs to Helena! Does not create a field trip or travel leg!
                  if (!daysMap[dKey].locations['Helena']) {
                    daysMap[dKey].locations['Helena'] = {
                      name: 'Helena',
                      crews: [],
                      swaps: []
                    };
                  }
                  daysMap[dKey].locations['Helena'].swaps.push(swapObj);
                } else {
                  let attached = false;
                  for (const lKey of Object.keys(daysMap[dKey].locations)) {
                    const locObj = daysMap[dKey].locations[lKey];
                    const locNameClean = lKey.toLowerCase();
                    const swapLocClean = swapObj.location.toLowerCase();
                    const swapSigCrew = this.getSignificantJobNumber(swapObj.crew);
                    const locCrewsSig = (locObj.crews || []).map(c => this.getSignificantJobNumber(c));

                    if (swapLocClean === locNameClean || swapLocClean.includes(locNameClean) || locNameClean.includes(swapLocClean) || (swapSigCrew && locCrewsSig.includes(swapSigCrew))) {
                      locObj.swaps.push(swapObj);
                      attached = true;
                      break;
                    }
                  }

                  if (!attached) {
                    if (cleanSwapLoc && cleanSwapLoc.toLowerCase() !== 'helena' && !this.isStatusLocation(cleanSwapLoc)) {
                      if (!daysMap[dKey].locations[cleanSwapLoc]) {
                        daysMap[dKey].locations[cleanSwapLoc] = {
                          name: cleanSwapLoc,
                          crews: [],
                          swaps: []
                        };
                      }
                      daysMap[dKey].locations[cleanSwapLoc].swaps.push(swapObj);
                    } else {
                      daysMap[dKey].tasks.push(swapObj);
                    }
                  }
                }
              }
            }
          }
        });
      }
    });

    // C. Completed Equipment Swaps & Reclaims from Trip Planner (scheduled_swaps)
    Object.keys(schedRegistry).forEach(k => {
      const entry = schedRegistry[k];
      if (!entry || (!entry.completed && !entry.isCompleted)) return;

      // Prioritize the scheduled dateKey of the trip day
      const rawDate = entry.dateKey || entry.completedDate || entry.date;
      const dKey = this.normalizeDateKey(rawDate);
      if (!daysMap[dKey]) return;

      const swapData = entry.swap || entry;
      const rawEmp = String(entry.employeeName || swapData.employeeName || swapData.employee || '').trim();
      if (!rawEmp) return;
      const empClean = this.normalizeEmpName(rawEmp);

      const oldItem = String(swapData.currentItem || swapData.oldItem || entry.currentItem || '').trim();
      const rawNew = String(swapData.pickItem || swapData.newItem || entry.pickItem || '').trim();
      const cleanNew = (rawNew && rawNew !== '—' && rawNew !== '-') ? rawNew : '';

      const rawType = String(swapData.type || entry.type || '').trim();
      const label = rawType.replace(/\s*(Swap|Reclaim)\s*/i, '').trim() || 'Equipment';

      const isReclaim = Boolean(
        swapData.isReclaim ||
        entry.isReclaim ||
        swapData.daysLeft === 'PREV EMP' ||
        String(swapData.daysLeft || '').includes('PREV') ||
        String(swapData.status || '').toLowerCase().includes('return to shelf') ||
        !cleanNew
      );

      const normEmp = empClean.toLowerCase();
      const dedupe = `${label}_${normEmp}_${cleanNew}_${oldItem}`.toLowerCase();
      if (!seenSwapKeys.has(dedupe)) {
        seenSwapKeys.add(dedupe);

        const empInfo = empMap[normEmp] || {};
        const swapLoc = entry.location || swapData.location || empInfo.loc || 'Helena';
        const swapCrew = entry.crewId || swapData.crewId || swapData.jobNum || empInfo.crew || '';

        const sKey = k || `${swapData.tableKey || 'glove_swaps'}|${normEmp}|${label.toLowerCase()}|${oldItem.toLowerCase()}`;
        const officeInfo = (entry && entry.isOfficeTask)
          ? { isOfficeTask: true, officeNote: entry.officeNote || '' }
          : getSwapOfficeInfo(sKey, rawEmp, oldItem, cleanNew, label, dKey);

        const cleanSwapLoc = this.cleanPhysicalLocation(swapLoc) || 'Helena';

        const swapObj = {
          type: isReclaim ? `${label} Reclaim` : `${label} Swap`,
          label: label,
          isReclaim: isReclaim,
          employee: empClean,
          oldItem: oldItem,
          newItem: cleanNew,
          size: swapData.size || '',
          itemClass: swapData.itemClass || swapData.class || '',
          kv: swapData.kv || '',
          model: swapData.model || '',
          length: swapData.length || '',
          location: swapLoc,
          originCity: cleanSwapLoc,
          crew: swapCrew,
          status: 'Delivered',
          isOfficeTask: officeInfo.isOfficeTask,
          officeNote: officeInfo.officeNote
        };

        if (swapObj.isOfficeTask) {
          // Handled in office / shop — belongs to Helena! Does not create a field trip or travel leg!
          if (!daysMap[dKey].locations['Helena']) {
            daysMap[dKey].locations['Helena'] = {
              name: 'Helena',
              crews: [],
              swaps: []
            };
          }
          daysMap[dKey].locations['Helena'].swaps.push(swapObj);
        } else {
          let attached = false;
          for (const lKey of Object.keys(daysMap[dKey].locations)) {
            const locObj = daysMap[dKey].locations[lKey];
            const locNameClean = lKey.toLowerCase();
            const swapLocClean = swapObj.location.toLowerCase();
            const swapSigCrew = this.getSignificantJobNumber(swapObj.crew);
            const locCrewsSig = (locObj.crews || []).map(c => this.getSignificantJobNumber(c));

            if (swapLocClean === locNameClean || swapLocClean.includes(locNameClean) || locNameClean.includes(swapLocClean) || (swapSigCrew && locCrewsSig.includes(swapSigCrew))) {
              locObj.swaps.push(swapObj);
              attached = true;
              break;
            }
          }

          if (!attached) {
            if (cleanSwapLoc && cleanSwapLoc.toLowerCase() !== 'helena' && !this.isStatusLocation(cleanSwapLoc)) {
              if (!daysMap[dKey].locations[cleanSwapLoc]) {
                daysMap[dKey].locations[cleanSwapLoc] = {
                  name: cleanSwapLoc,
                  crews: [],
                  swaps: []
                };
              }
              daysMap[dKey].locations[cleanSwapLoc].swaps.push(swapObj);
            } else {
              daysMap[dKey].tasks.push(swapObj);
            }
          }
        }
      }
    });

    // 5. Collect Completed Tasks from task_metadata
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

    // 6. Enrich planned trip locations with active crews from job_tracking ONLY if this location was an explicit planned field trip
    const jobTable = this.db ? this.db.getTable('job_tracking') : null;
    if (jobTable && jobTable.rows) {
      Object.keys(daysMap).forEach(dKey => {
        const plannedTripLocs = new Set();
        const dayTrips = trips[dKey];
        if (dayTrips) {
          const tripList = Array.isArray(dayTrips) ? dayTrips : [dayTrips];
          tripList.forEach(t => {
            if (t && t.location) {
              const cl = this.cleanPhysicalLocation(t.location);
              if (cl) plannedTripLocs.add(cl.toLowerCase());
            }
          });
        }

        const locs = daysMap[dKey].locations;
        Object.keys(locs).forEach(lKey => {
          // ONLY enrich if the user explicitly planned a field trip to this location
          if (locs[lKey].crews.length === 0 && plannedTripLocs.has(lKey.toLowerCase()) && lKey.toLowerCase() !== 'helena') {
            const matchedCrews = jobTable.rows
              .filter(jr => {
                const jLoc = String(jr['Location'] || '').toLowerCase().trim();
                const jStat = String(jr['Status'] || jr['Job Status'] || '').toLowerCase().trim();
                return jLoc === lKey.toLowerCase() && (jStat === 'active' || !jStat);
              })
              .map(jr => {
                const jNum = this.getSignificantJobNumber(jr['Job Number'] || jr['Job #'] || jr['Crew']);
                const foreman = String(jr['Foreman'] || jr['Crew Lead'] || jr['Lead'] || '').trim();
                return `Crew ${jNum}${foreman ? ' (' + foreman + ')' : ''}`;
              });
            locs[lKey].crews = [...new Set(matchedCrews)];
          }
        });
      });
    }

    // 7. Collect Completed Monthly Trainings from training_tracking
    if (trainTable && trainTable.rows) {
      trainTable.rows.forEach(tr => {
        const status = String(tr['Status'] || tr['Training Status'] || '').toLowerCase();
        if (status !== 'complete' && status !== 'completed' && status !== 'done') return;

        const rawDate = tr['Completion Date'] || tr['Date Completed'] || tr['Date'] || tr['Date Done'];
        const dKey = this.normalizeDateKey(rawDate);
        if (daysMap[dKey]) {
          daysMap[dKey].trainings.push(tr);
        }
      });
    }

    // 7a. Also collect completed trainings directly from Trip Planner scheduled_training
    const schedTrainings = {};
    if (window.tripPlanner && window.tripPlanner.scheduledTrainingNeeds) {
      Object.assign(schedTrainings, window.tripPlanner.scheduledTrainingNeeds);
    }
    try {
      const localTrain = JSON.parse(localStorage.getItem('TRIP_PLANNER_SCHEDULED_TRAINING') || localStorage.getItem('sa_trip_scheduled_training') || '{}');
      Object.assign(schedTrainings, localTrain);
    } catch { /* ignore */ }

    Object.keys(schedTrainings).forEach(k => {
      const entry = schedTrainings[k];
      if (!entry) return;
      const isDone = !!(entry.completed || entry.isCompleted || (entry.training && (entry.training.isCompleted || entry.training.completed)));
      if (!isDone) return;

      const rawDate = entry.completedDate || (entry.training && entry.training.completedDate) || entry.dateKey || entry.date;
      const dKey = this.normalizeDateKey(rawDate);
      if (!daysMap[dKey]) return;

      const trData = entry.training || entry;
      const topic = String(trData.topic || trData['Topic'] || trData['Training Topic'] || '').trim();
      const crew = String(trData.crewId || trData['Crew #'] || '').trim();

      const already = daysMap[dKey].trainings.some(t => {
        const tTopic = String(t['Topic'] || t['Training Topic'] || t.topic || '').trim().toLowerCase();
        const tCrew = String(t['Crew #'] || t.crewId || '').trim().toLowerCase();
        return tTopic === topic.toLowerCase() && tCrew === crew.toLowerCase();
      });

      if (!already) {
        daysMap[dKey].trainings.push({
          'Training Topic': topic,
          'Topic': topic,
          'Crew #': crew,
          'Crew Lead': trData.lead || trData['Crew Lead'] || '',
          'Attendees': trData.attendees || '',
          'Location': trData.location || '',
          'Status': 'Completed',
          'Date Completed': rawDate
        });
      }
    });

    // 7b. Collect Completed Equipment Deliveries (from scheduledEquipmentNeeds and safety_equipment_needs)
    const schedEquip = {};
    if (window.tripPlanner && window.tripPlanner.scheduledEquipmentNeeds) {
      Object.assign(schedEquip, window.tripPlanner.scheduledEquipmentNeeds);
    }
    try {
      const localEq = JSON.parse(localStorage.getItem('TRIP_PLANNER_SCHEDULED_EQUIPMENT') || localStorage.getItem('sa_trip_scheduled_equipment') || '{}');
      Object.assign(schedEquip, localEq);
    } catch { /* ignore */ }

    const seenEquipDedupe = new Set();
    Object.keys(schedEquip).forEach(k => {
      const entry = schedEquip[k];
      if (!entry) return;
      const item = entry.item || entry;
      const isResolved = !!(entry.completed || entry.isCompleted || item.resolved || item.isResolved || item.completed);
      if (!isResolved) return;

      const rawDate = entry.completedDate || item.completedDate || entry.dateKey || entry.date;
      const dKey = this.normalizeDateKey(rawDate);
      if (!daysMap[dKey]) return;

      const dedupe = `${item.crewId}_${item.vehicleNumber}_${item.equipmentType}_${item.notes}`.toLowerCase();
      if (!seenEquipDedupe.has(dedupe)) {
        seenEquipDedupe.add(dedupe);
        daysMap[dKey].equipmentDeliveries.push({
          crewId: item.crewId || '',
          vehicleNumber: item.vehicleNumber || '',
          equipmentType: item.equipmentType || 'Equipment',
          notes: item.notes || item.desc || '',
          location: item.location || '',
          foreman: item.foreman || ''
        });
      }
    });

    const eqTable = this.db ? this.db.getTable('safety_equipment_needs') : null;
    if (eqTable && eqTable.rows) {
      eqTable.rows.forEach(r => {
        const stat = String(r['Status'] || '').toLowerCase();
        if (stat !== 'resolved' && stat !== 'complete' && stat !== 'completed') return;
        const rawDate = r['Resolved On'] || r['Date Resolved'] || r['Date'];
        const dKey = this.normalizeDateKey(rawDate);
        if (!daysMap[dKey]) return;

        const crewId = String(r['Crew #'] || r['Crew'] || '').trim();
        const veh = String(r['Vehicle #'] || r['Unit #'] || '').trim();
        const eqType = String(r['Equipment Type'] || r['Type'] || 'Equipment').trim();
        const notes = String(r['Notes'] || r['Defect'] || '').trim();
        const dedupe = `${crewId}_${veh}_${eqType}_${notes}`.toLowerCase();
        if (!seenEquipDedupe.has(dedupe)) {
          seenEquipDedupe.add(dedupe);
          daysMap[dKey].equipmentDeliveries.push({
            crewId: crewId,
            vehicleNumber: veh,
            equipmentType: eqType,
            notes: notes,
            location: r['Location'] || '',
            foreman: r['Crew Lead'] || r['Lead'] || ''
          });
        }
      });
    }

    // 8. Collect Completed DOT Drug Tests from dot_drug_tests
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
   * Switches output format (conversational paragraph vs clean bullet list) and re-renders report.
   */
  setFormat(format) {
    this.reportFormat = format || 'paragraph';
    const textarea = document.getElementById('time-breakdown-output');
    if (textarea) {
      const days = this.collectAccomplishments();
      textarea.value = this.generateTextReport(days);
    }
  }

  /**
   * Helper to format an array of strings into a natural English list ("A, B, and C").
   */
  formatListNatural(arr) {
    if (!arr || arr.length === 0) return '';
    const clean = arr.filter(Boolean).map(s => String(s).trim()).filter(Boolean);
    if (clean.length === 0) return '';
    if (clean.length === 1) return clean[0];
    if (clean.length === 2) return `${clean[0]} and ${clean[1]}`;
    return `${clean.slice(0, -1).join(', ')}, and ${clean[clean.length - 1]}`;
  }

  /**
   * Generates a conversational, human-friendly paragraph for a single day,
   * grouped by city with natural travel/movement transitions.
   */
  generateDayParagraph(day) {
    // 1. Group all accomplishments for the day by city bucket
    const cityMap = {};
    const getCityBucket = (cityName) => {
      const clean = this.cleanPhysicalLocation(cityName) || 'Helena';
      if (!cityMap[clean]) {
        cityMap[clean] = {
          name: clean,
          swaps: [],
          classes: [],
          trainings: [],
          deliveries: [],
          drugTests: [],
          officeTasks: [],
          crewsVisited: new Set()
        };
      }
      return cityMap[clean];
    };

    // Helper to resolve an office / manual task location
    const resolveTaskLocation = (task) => {
      const rawText = (String(task.title || '') + ' ' + String(task.notes || '')).toLowerCase();
      // Rubber PPE Tracker records are shop prep/assignment actions done in Helena
      if (rawText.includes('recorded from rubber ppe tracker') || (task.title && task.title.toLowerCase().startsWith('assigned rubber'))) {
        return 'Helena';
      }
      // Personal appointments (Dentist, etc.) are handled locally in Helena
      if (rawText.includes('dentist') || rawText.includes('doctor') || (task.title && task.title.toLowerCase().includes('dentist'))) {
        return 'Helena';
      }
      if (task.location && !this.isStatusLocation(task.location)) {
        return this.cleanPhysicalLocation(task.location);
      }
      const text = rawText;
      // Check if employee name is mentioned in task title or notes
      if (this.db) {
        const empTable = this.db.getTable('employees');
        if (empTable && empTable.rows) {
          for (const r of empTable.rows) {
            const eName = String(r['Employee Name'] || '').trim().toLowerCase();
            if (eName && eName.length > 4 && text.includes(eName)) {
              const loc = String(r['Location'] || '').trim();
              if (loc && !this.isStatusLocation(loc)) return this.cleanPhysicalLocation(loc);
            }
          }
        }
      }
      // Check if known Montana city is mentioned
      const knownCities = ['Great Falls', 'Bozeman', 'Belgrade', 'Billings', 'Missoula', 'Butte', 'Kalispell', 'Helena', 'Townsend', 'Ennis', 'Whitehall', 'Havre', 'Miles City', 'Livingston', 'Dillon', 'Lewistown'];
      for (const city of knownCities) {
        if (text.includes(city.toLowerCase())) return city;
      }
      // If day has planned trips to another city and this is a delivery / field task
      const nonHelenaTrips = Object.keys(day.locations || {}).filter(k => k.toLowerCase() !== 'helena');
      if (nonHelenaTrips.length === 1 && /deliver|drop off|field|truck|swap|tools?|gear|parts?/i.test(text)) {
        return this.cleanPhysicalLocation(nonHelenaTrips[0]);
      }
      return 'Helena';
    };

    // Helper to resolve clinic city for drug test
    const resolveClinicCity = (dt) => {
      if (dt['Location'] || dt['City']) return this.cleanPhysicalLocation(dt['Location'] || dt['City']);
      const clinic = String(dt['Clinic Name'] || dt['Collection Type'] || '').toLowerCase();
      if (clinic.includes('drug information systems') || clinic.includes('dis') || clinic.includes('helena')) return 'Helena';
      if (clinic.includes('great falls')) return 'Great Falls';
      if (clinic.includes('bozeman')) return 'Bozeman';
      if (clinic.includes('billings')) return 'Billings';
      if (clinic.includes('missoula')) return 'Missoula';
      if (clinic.includes('butte')) return 'Butte';
      if (clinic.includes('kalispell')) return 'Kalispell';
      return 'Helena';
    };

    // A. Add planned trip locations & crews
    Object.keys(day.locations || {}).forEach(locKey => {
      const locObj = day.locations[locKey];
      const b = getCityBucket(locKey);
      (locObj.crews || []).forEach(c => b.crewsVisited.add(c));
      (locObj.swaps || []).forEach(sw => b.swaps.push(sw));
    });

    // B. Add unattached day.tasks (swaps / generic tasks)
    (day.tasks || []).forEach(t => {
      const loc = t.location || 'Helena';
      const b = getCityBucket(loc);
      b.swaps.push(t);
    });

    // C. Add training classes
    (day.classes || []).forEach(c => {
      const loc = c.location || 'Helena';
      getCityBucket(loc).classes.push(c);
    });

    // D. Add monthly safety trainings
    (day.trainings || []).forEach(tr => {
      const loc = tr.location || tr['Location'] || 'Helena';
      getCityBucket(loc).trainings.push(tr);
    });

    // E. Add equipment deliveries
    (day.equipmentDeliveries || []).forEach(eq => {
      const loc = eq.location || 'Helena';
      getCityBucket(loc).deliveries.push(eq);
    });

    // F. Add drug tests
    (day.drugTests || []).forEach(dt => {
      const loc = resolveClinicCity(dt);
      getCityBucket(loc).drugTests.push(dt);
    });

    // G. Add office / manual tasks
    (day.officeTasks || []).forEach(ot => {
      const loc = resolveTaskLocation(ot);
      getCityBucket(loc).officeTasks.push(ot);
    });

    // Consolidate office-only cities into Helena and remove empty ghost destinations
    Object.keys(cityMap).forEach(cityName => {
      if (cityName === 'Helena') return;
      const b = cityMap[cityName];
      
      const allSwapsOffice = b.swaps.length > 0 && b.swaps.every(sw => sw.isOfficeTask);
      const hasOtherWork = b.classes.length > 0 || b.trainings.length > 0 || b.deliveries.length > 0 || b.drugTests.length > 0 || b.officeTasks.length > 0;
      
      if (allSwapsOffice && !hasOtherWork) {
        // Entire city was handled via shop delivery/returns (e.g. Syd/JT delivered reclaims to Helena)
        if (!cityMap['Helena']) {
          cityMap['Helena'] = {
            name: 'Helena',
            swaps: [],
            classes: [],
            trainings: [],
            deliveries: [],
            drugTests: [],
            officeTasks: [],
            crewsVisited: new Set()
          };
        }
        cityMap['Helena'].swaps.push(...b.swaps);
        delete cityMap[cityName];
      } else if (b.swaps.length === 0 && !hasOtherWork) {
        // No actual field activities completed in this city
        delete cityMap[cityName];
      } else if (b.swaps.some(sw => sw.isOfficeTask)) {
        // Move office swaps to Helena, keep field work in this city
        const officeSwaps = b.swaps.filter(sw => sw.isOfficeTask);
        b.swaps = b.swaps.filter(sw => !sw.isOfficeTask);
        if (!cityMap['Helena']) {
          cityMap['Helena'] = {
            name: 'Helena',
            swaps: [],
            classes: [],
            trainings: [],
            deliveries: [],
            drugTests: [],
            officeTasks: [],
            crewsVisited: new Set()
          };
        }
        cityMap['Helena'].swaps.push(...officeSwaps);
      }
    });

    // 2. Order the cities logically: Helena first if active (home shop), then destinations visited
    const allCities = Object.keys(cityMap);
    if (allCities.length === 0) {
      return 'No specific accomplishments logged for this day.';
    }

    const orderedCities = [];
    if (cityMap['Helena']) {
      orderedCities.push('Helena');
    }
    allCities.forEach(c => {
      if (c !== 'Helena' && !orderedCities.includes(c)) {
        orderedCities.push(c);
      }
    });
    if (orderedCities.length === 0) {
      orderedCities.push(...allCities);
    }

    // 3. Generate natural text for each city
    const cityBlocks = [];
    let prevCity = null;
    const empMap = this.empMap || {};

    orderedCities.forEach((cityName, idx) => {
      const b = cityMap[cityName];
      const sentences = [];

      // 0. Crews visited in this city (placed at the very beginning of the city paragraph)
      const unmentionedCrews = Array.from(b.crewsVisited).filter(crewId => {
        const sig = this.getSignificantJobNumber(crewId);
        const hasTrain = b.trainings.some(t => this.getSignificantJobNumber(t['Crew #'] || t['Crew']) === sig);
        const hasClass = b.classes.some(c => (c.crewIds || [c.crewId]).map(x => this.getSignificantJobNumber(x)).includes(sig));
        return !hasTrain && !hasClass;
      });

      if (unmentionedCrews.length > 0) {
        const crewStrs = unmentionedCrews.map(c => {
          const str = String(c).trim();
          return str.toLowerCase().startsWith('crew') ? str : `Crew ${str}`;
        });
        sentences.push(`Visited ${this.formatListNatural(crewStrs)}.`);
      }

      // A. DOT Drug Tests in this city
      if (b.drugTests.length > 0) {
        const firstType = b.drugTests[0]['Test Type'] || 'Drug Only';
        const firstClinic = b.drugTests[0]['Clinic Name'] || b.drugTests[0]['Collection Type'] || '';
        const allSame = b.drugTests.every(dt => 
          (dt['Test Type'] || 'Drug Only') === firstType &&
          (dt['Clinic Name'] || dt['Collection Type'] || '') === firstClinic
        );

        if (allSame && b.drugTests.length > 1) {
          const names = b.drugTests.map(dt => dt['Employee Name'] || dt['Name'] || 'worker');
          const detailsStr = firstClinic ? `${firstType} at ${firstClinic}` : firstType;
          sentences.push(`Coordinated DOT drug testing for ${this.formatListNatural(names)} (${detailsStr}).`);
        } else {
          const testSummaries = b.drugTests.map(dt => {
            const emp = dt['Employee Name'] || dt['Name'] || 'worker';
            const testType = dt['Test Type'] || 'drug test';
            const clinic = dt['Clinic Name'] || dt['Collection Type'] || '';
            return `${emp} (${testType}${clinic ? ' at ' + clinic : ''})`;
          });
          sentences.push(`Coordinated DOT drug testing for ${this.formatListNatural(testSummaries)}.`);
        }
      }

      // B. Equipment Swaps & Reclaims in this city
      if (b.swaps.length > 0) {
        const officeSwaps = b.swaps.filter(sw => sw.isOfficeTask);
        const fieldSwaps = b.swaps.filter(sw => !sw.isOfficeTask);

        // 1. Office-handled equipment returns and swaps (brought to shop or handed off in office)
        if (officeSwaps.length > 0) {
          const empGroups = {};
          officeSwaps.forEach(sw => {
            const emp = sw.employee || 'Worker';
            if (!empGroups[emp]) empGroups[emp] = [];
            empGroups[emp].push(sw);
          });

          const officePhrases = Object.entries(empGroups).map(([emp, items]) => {
            const origin = items[0].originCity && items[0].originCity !== 'Helena' ? `${items[0].originCity} - ` : '';
            const itemPhrases = items.map(sw => {
              const label = (sw.label || sw.type || 'equipment').replace(/\s*(Swap|Reclaim)\s*/i, '').trim().toLowerCase();
              const isReclaim = Boolean(sw.isReclaim || (!sw.newItem || sw.newItem === '—' || sw.newItem === '-'));
              let desc = isReclaim ? `returned ${label} #${sw.oldItem || ''} to shelf` : `${label} swap #${sw.oldItem} to #${sw.newItem}`;
              const specs = [];
              if (!label.includes('glove')) {
                if (sw.size) specs.push(`size ${sw.size}`);
                if (sw.itemClass) specs.push(`class ${sw.itemClass}`);
              }
              if (sw.kv) specs.push(`${sw.kv} kV`);
              if (specs.length > 0) desc += ` (${specs.join(', ')})`;
              return desc;
            });

            const note = items.find(sw => sw.officeNote) ? items.find(sw => sw.officeNote).officeNote : '';
            const noteStr = note ? `; ${note}` : '';
            return `${emp} (${origin}${this.formatListNatural(itemPhrases)}${noteStr})`;
          });

          const allAreReclaims = officeSwaps.every(sw => Boolean(sw.isReclaim || (!sw.newItem || sw.newItem === '—' || sw.newItem === '-')));
          const actionHeader = allAreReclaims
            ? 'Processed equipment returns brought to the shop'
            : 'Handled equipment exchanges / returns at the shop';
          sentences.push(`${actionHeader}: ${this.formatListNatural(officePhrases)}.`);
        }

        // 2. Standard field swaps
        if (fieldSwaps.length > 0) {
          let isAllGloves = true;
          let isAllSleeves = true;
          let isAllBlankets = true;

          const swapDescriptions = fieldSwaps.map(sw => {
            const emp = sw.employee || sw['Assigned To'] || 'Worker';
            const isReclaim = Boolean(sw.isReclaim || (!sw.newItem || sw.newItem === '—' || sw.newItem === '-'));
            const label = (sw.label || sw.type || 'equipment').replace(/\s*(Swap|Reclaim)\s*/i, '').trim().toLowerCase();

            if (!label.includes('glove')) isAllGloves = false;
            if (!label.includes('sleeve')) isAllSleeves = false;
            if (!label.includes('blanket')) isAllBlankets = false;

            let itemDesc = '';
            if (isReclaim) {
              itemDesc = sw.oldItem ? `returned ${label} #${sw.oldItem} to shelf` : `returned ${label} to shelf`;
            } else if (sw.oldItem && sw.newItem && sw.newItem !== '—' && sw.newItem !== '-') {
              itemDesc = `${label} swap #${sw.oldItem} to #${sw.newItem}`;
            } else if (sw.newItem && sw.newItem !== '—' && sw.newItem !== '-') {
              itemDesc = `new ${label} #${sw.newItem}`;
            } else {
              itemDesc = `${label} exchange`;
            }

            const details = [];
            if (!label.includes('glove')) {
              if (sw.size) details.push(`size ${sw.size}`);
              if (sw.itemClass) details.push(`class ${sw.itemClass}`);
            }
            if (sw.kv) details.push(`${sw.kv} kV`);
            const detailStr = details.length > 0 ? `, ${details.join(', ')}` : '';

            return `${emp} (${itemDesc}${detailStr})`;
          });

          const allReclaims = fieldSwaps.every(sw => sw.isReclaim);
          let swapTypeWord = '';
          let pluralWord = '';

          if (allReclaims) {
            swapTypeWord = isAllGloves ? 'glove reclaim' :
                           isAllSleeves ? 'sleeve reclaim' :
                           isAllBlankets ? 'blanket reclaim' : 'equipment reclaim';
            pluralWord = isAllGloves ? 'glove reclaims' :
                         isAllSleeves ? 'sleeve reclaims' :
                         isAllBlankets ? 'blanket reclaims' : 'equipment reclaims';
          } else {
            swapTypeWord = isAllGloves ? 'glove swap' :
                           isAllSleeves ? 'sleeve swap' :
                           isAllBlankets ? 'blanket swap' : 'equipment exchange';
            pluralWord = isAllGloves ? 'glove swaps' :
                         isAllSleeves ? 'sleeve swaps' :
                         isAllBlankets ? 'blanket swaps' : 'equipment exchanges';
          }

          if (fieldSwaps.length === 1) {
            sentences.push(`Completed a ${swapTypeWord} for ${swapDescriptions[0]}.`);
          } else {
            sentences.push(`Completed ${pluralWord} for ${this.formatListNatural(swapDescriptions)}.`);
          }
        }
      }

      // C. Office / Field Tasks in this city (natural past tense, NO overly formal boilerplate)
      if (b.officeTasks.length > 0) {
        b.officeTasks.forEach(ot => {
          const sentence = this.formatTaskSentence(ot.title, ot.notes);
          if (sentence) sentences.push(sentence);
        });
      }

      // D. Training Classes in this city
      if (b.classes.length > 0) {
        const classSummaries = b.classes.map(c => {
          const title = c.title || 'safety certification';
          const crewStr = (c.crewIds && c.crewIds.length > 0) ? ` for Crew ${c.crewIds.join(', ')}` : (c.crewId ? ` for Crew ${c.crewId}` : '');
          const attendees = c.assignedEmployees || (c.employee ? [c.employee] : []);
          let attStr = '';
          if (attendees.length > 0) {
            attStr = ` with ${attendees.length} attendee${attendees.length === 1 ? '' : 's'} (${this.formatListNatural(attendees)})`;
          }
          return `${title}${crewStr}${attStr}`;
        });
        sentences.push(`Conducted training: ${this.formatListNatural(classSummaries)}.`);
      }

      // E. Monthly Safety Trainings in this city (Foreman instead of Lead)
      if (b.trainings.length > 0) {
        const trainingSummaries = b.trainings.map(tr => {
          const topic = tr['Training Topic'] || tr['Topic'] || tr['Training'] || 'Safety Training';
          const crew = tr['Crew #'] || tr['Crew'] || tr['Job #'] || '';
          const foreman = tr['Foreman'] || tr['Crew Lead'] || tr['Lead'] || '';
          let res = topic;
          if (crew) res += ` with Crew ${crew}`;
          if (foreman) res += ` (Foreman: ${foreman})`;
          return res;
        });
        sentences.push(`Completed monthly safety training on ${this.formatListNatural(trainingSummaries)}.`);
      }

      // F. Equipment Deliveries in this city
      if (b.deliveries.length > 0) {
        const deliverySummaries = b.deliveries.map(eq => {
          let desc = eq.equipmentType || 'safety gear';
          if (eq.vehicleNumber) desc += ` for Unit ${eq.vehicleNumber}`;
          if (eq.crewId) desc += ` (Crew ${this.getSignificantJobNumber(eq.crewId)})`;
          if (eq.notes) desc += ` - ${eq.notes}`;
          return desc;
        });
        sentences.push(`Delivered equipment including ${this.formatListNatural(deliverySummaries)}.`);
      }

      // If no specific tasks were logged for this city
      if (sentences.length === 0) {
        if (cityName === 'Helena') {
          sentences.push(`Spent time focusing on safety operations, inventory management, and shop support.`);
        } else {
          sentences.push(`Conducted field visits and safety walk-throughs.`);
        }
      }

      // Check if this entire city was handled in office/shop (no field travel)
      const allOfficeSwaps = b.swaps.length > 0 && b.swaps.every(sw => sw.isOfficeTask);
      const isCityAllOffice = allOfficeSwaps && b.crewsVisited.size === 0 && b.classes.length === 0 && b.trainings.length === 0 && b.deliveries.length === 0 && b.drugTests.length === 0 && b.officeTasks.length === 0;

      // Build city header / movement transition
      let cityHeader = '';
      if (idx === 0) {
        cityHeader = isCityAllOffice && cityName !== 'Helena' ? `${cityName} (Handled in Office / Shop - No Travel) - ` : `${cityName} - `;
      } else if (isCityAllOffice) {
        cityHeader = `${cityName} (Handled in Office / Shop - No Travel) - `;
      } else {
        const fromCity = prevCity || 'Helena';
        cityHeader = `Moved from ${fromCity} to ${cityName} - `;
      }

      cityBlocks.push(`${cityHeader}${sentences.join(' ')}`);
      if (!isCityAllOffice) {
        prevCity = cityName;
      }
    });

    return cityBlocks.join('\n\n');
  }

  /**
   * Generates conversational paragraph format (default).
   */
  generateParagraphReport(days) {
    if (!days || days.length === 0) return 'No tasks found for the selected period.';

    let totalTrips = 0;
    let totalSwaps = 0;
    let totalClasses = 0;
    let totalOfficeTasks = 0;
    let totalTrainings = 0;
    let totalDrugTests = 0;
    let totalEquipDeliveries = 0;
    let daysWithContent = 0;

    const sections = [];

    days.forEach(day => {
      const locKeys = Object.keys(day.locations || {});
      const hasClasses = day.classes && day.classes.length > 0;
      const hasOffice = day.officeTasks && day.officeTasks.length > 0;
      const hasTasks = day.tasks && day.tasks.length > 0;
      const hasTrainings = day.trainings && day.trainings.length > 0;
      const hasDrugTests = day.drugTests && day.drugTests.length > 0;
      const hasEquip = day.equipmentDeliveries && day.equipmentDeliveries.length > 0;
      const hasLocations = locKeys.length > 0;

      let locSwapsCount = 0;
      locKeys.forEach(lk => {
        if (day.locations[lk].swaps) locSwapsCount += day.locations[lk].swaps.length;
      });

      const hasContent = hasLocations || hasClasses || hasOffice || hasTasks || hasTrainings || hasDrugTests || hasEquip || locSwapsCount > 0;
      if (!hasContent) return;

      daysWithContent++;
      totalTrips += locKeys.filter(k => {
        if (k.toLowerCase() === 'helena') return false;
        const loc = day.locations[k];
        if (!loc) return false;
        const allOfficeSwaps = loc.swaps && loc.swaps.length > 0 && loc.swaps.every(s => s.isOfficeTask);
        const noOtherFieldActivities = (!loc.crews || loc.crews.length === 0) &&
          (!day.classes || !day.classes.some(c => (c.location || '').toLowerCase() === k.toLowerCase())) &&
          (!day.trainings || !day.trainings.some(t => (t.location || '').toLowerCase() === k.toLowerCase())) &&
          (!day.equipmentDeliveries || !day.equipmentDeliveries.some(e => (e.location || '').toLowerCase() === k.toLowerCase()));
        return !(allOfficeSwaps && noOtherFieldActivities);
      }).length;
      totalSwaps += locSwapsCount;
      locKeys.forEach(lk => {
        const loc = day.locations[lk];
        if (loc && loc.swaps) {
          totalOfficeTasks += loc.swaps.filter(s => s.isOfficeTask).length;
        }
      });
      if (day.tasks) {
        totalSwaps += day.tasks.filter(t => t.isReclaim || (t.type && (t.type.toLowerCase().includes('swap') || t.type.toLowerCase().includes('reclaim'))) || t.label).length;
      }
      if (day.classes) totalClasses += day.classes.length;
      if (day.officeTasks) totalOfficeTasks += day.officeTasks.length;
      if (day.trainings) totalTrainings += day.trainings.length;
      if (day.equipmentDeliveries) totalEquipDeliveries += day.equipmentDeliveries.length;
      if (day.drugTests) totalDrugTests += day.drugTests.length;

      const dayName = day.date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
      const paragraph = this.generateDayParagraph(day);
      sections.push(`${dayName}\n${paragraph}`);
    });

    if (daysWithContent === 0) {
      return 'No completed tasks, field visits, or trainings recorded for the selected period.';
    }

    const summaryParts = [];
    if (totalTrips > 0) summaryParts.push(`${totalTrips} field visit${totalTrips === 1 ? '' : 's'}`);
    if (totalSwaps > 0) summaryParts.push(`${totalSwaps} equipment swap${totalSwaps === 1 ? '' : 's'}`);
    if (totalClasses > 0) summaryParts.push(`${totalClasses} training class${totalClasses === 1 ? '' : 'es'}`);
    if (totalTrainings > 0) summaryParts.push(`${totalTrainings} monthly training${totalTrainings === 1 ? '' : 's'}`);
    if (totalEquipDeliveries > 0) summaryParts.push(`${totalEquipDeliveries} equipment deliver${totalEquipDeliveries === 1 ? 'y' : 'ies'}`);
    if (totalDrugTests > 0) summaryParts.push(`${totalDrugTests} drug test${totalDrugTests === 1 ? '' : 's'}`);
    if (totalOfficeTasks > 0) summaryParts.push(`${totalOfficeTasks} office task${totalOfficeTasks === 1 ? '' : 's'}`);

    if (summaryParts.length > 0 && daysWithContent > 1) {
      sections.push(`Period Summary: Completed ${this.formatListNatural(summaryParts)}.`);
    }

    return sections.join('\n\n');
  }

  /**
   * Generates clean bullet format without emojis or picture icons.
   */
  generateBulletReport(days) {
    if (!days || days.length === 0) return 'No tasks found for the selected period.';

    let lines = [];
    lines.push(`DAILY ACCOMPLISHMENTS REPORT`);
    lines.push(`Period: ${this.formatDateKey(this.startDate)} to ${this.formatDateKey(this.endDate)}`);
    lines.push(`Generated: ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}\n`);

    let totalTrips = 0;
    let totalSwaps = 0;
    let totalClasses = 0;
    let totalOfficeTasks = 0;
    let totalTrainings = 0;
    let totalDrugTests = 0;
    let totalEquipDeliveries = 0;
    let daysWithContent = 0;

    days.forEach(day => {
      const dayName = day.date.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' });
      const locKeys = Object.keys(day.locations);
      const hasClasses = day.classes && day.classes.length > 0;
      const hasOffice = day.officeTasks && day.officeTasks.length > 0;
      const hasTasks = day.tasks && day.tasks.length > 0;
      const hasTrainings = day.trainings && day.trainings.length > 0;
      const hasDrugTests = day.drugTests && day.drugTests.length > 0;
      const hasEquip = day.equipmentDeliveries && day.equipmentDeliveries.length > 0;
      const hasLocations = locKeys.length > 0;

      let locSwapsCount = 0;
      locKeys.forEach(lk => {
        if (day.locations[lk].swaps) locSwapsCount += day.locations[lk].swaps.length;
      });

      const hasContent = hasLocations || hasClasses || hasOffice || hasTasks || hasTrainings || hasDrugTests || hasEquip || locSwapsCount > 0;
      if (!hasContent) return;

      daysWithContent++;
      lines.push(`${dayName}`);
      lines.push(`-------------------------------------------------------`);

      // Field Visits & Office Handled Locations
      if (hasLocations) {
        locKeys.forEach(locKey => {
          const loc = day.locations[locKey];
          const allOfficeSwaps = loc.swaps && loc.swaps.length > 0 && loc.swaps.every(s => s.isOfficeTask);
          const noOtherFieldActivities = (!loc.crews || loc.crews.length === 0) &&
            (!day.classes || !day.classes.some(c => (c.location || '').toLowerCase() === locKey.toLowerCase())) &&
            (!day.trainings || !day.trainings.some(t => (t.location || '').toLowerCase() === locKey.toLowerCase())) &&
            (!day.equipmentDeliveries || !day.equipmentDeliveries.some(e => (e.location || '').toLowerCase() === locKey.toLowerCase()));

          if (allOfficeSwaps && noOtherFieldActivities) {
            lines.push(`  Office / Shop Task: ${loc.name} (Handled in Office - No Travel)`);
            totalOfficeTasks += loc.swaps.length;
          } else {
            totalTrips++;
            const crewStr = (loc.crews && loc.crews.filter(Boolean).length > 0) ? ` [${loc.crews.filter(Boolean).join(', ')}]` : '';
            lines.push(`  Field Visit: ${loc.name}${crewStr}`);
          }

          if (loc.swaps && loc.swaps.length > 0) {
            lines.push(`     Completed Equipment Swaps & Reclaims (${loc.swaps.length}):`);
            loc.swaps.forEach(sw => {
              totalSwaps++;
              const crewTag = sw.crew ? ` (Crew ${this.getSignificantJobNumber(sw.crew)})` : '';
              const isGloveSwap = String(sw.label || sw.type || '').toLowerCase().includes('glove');
              const specParts = [];
              if (!isGloveSwap) {
                if (sw.size) specParts.push(`Size ${sw.size}`);
                if (sw.itemClass) specParts.push(`Class ${sw.itemClass}`);
              }
              if (sw.kv) specParts.push(`${sw.kv} kV`);
              if (sw.model) specParts.push(`Model ${sw.model}`);
              if (sw.length) specParts.push(`${sw.length}`);
              if (sw.isOfficeTask) {
                specParts.push(sw.officeNote ? `Office Task: ${sw.officeNote}` : 'Office Task');
              }
              const specs = specParts.join(', ');

              const isReclaim = Boolean(sw.isReclaim || (!sw.newItem || sw.newItem === '—' || sw.newItem === '-'));
              const swapAction = isReclaim ? `${sw.label} Reclaim` : `${sw.label} Swap`;
              let swapDetails = '';
              if (isReclaim) {
                swapDetails = `#${sw.oldItem} to ${sw.location || 'Helena'}`;
              } else if (sw.oldItem && sw.newItem) {
                swapDetails = `#${sw.oldItem} to #${sw.newItem}`;
              } else {
                swapDetails = `#${sw.newItem || sw.oldItem}`;
              }
              lines.push(`       - ${sw.employee}${crewTag}: ${swapAction} ${swapDetails}${specs ? ' (' + specs + ')' : ''}`);
            });
          }
        });
      }

      // Completed Classes Taught
      if (hasClasses) {
        lines.push(`  Training Classes Taught (${day.classes.length}):`);
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

      // Office & Safety Admin Tasks
      if (hasOffice) {
        lines.push(`  Completed Office & Safety Tasks (${day.officeTasks.length}):`);
        day.officeTasks.forEach(ot => {
          totalOfficeTasks++;
          const loc = (ot.location && ot.location !== 'Helena Office') ? ` [${ot.location}]` : '';
          const time = ot.time ? ` (${ot.time})` : '';
          const rawNotes = ot.notes ? ot.notes.replace(/\r?\n+/g, ' · ').trim() : '';
          const notes = rawNotes ? ` · ${rawNotes}` : '';
          lines.push(`     • ${ot.title}${loc}${time}${notes}`);
        });
      }

      // Other Completed Equipment Swaps & Tasks
      if (hasTasks) {
        lines.push(`  Other Completed Equipment Swaps & Tasks (${day.tasks.length}):`);
        day.tasks.forEach(t => {
          totalSwaps++;
          const emp = t.employee || t['Assigned To'] || t['Employee'] || 'Unassigned';
          const crewTag = t.crew ? ` (Crew ${this.getSignificantJobNumber(t.crew)})` : (t.job ? ` (Job ${t.job})` : '');

          const isReclaim = Boolean(t.isReclaim || ((t.oldItem || t.newItem) && (!t.newItem || t.newItem === '—' || t.newItem === '-')));
          const cleanLabel = t.label || String(t.type || 'Equipment').replace(/\s*(Swap|Reclaim)\s*/i, '');
          const type = isReclaim ? `${cleanLabel} Reclaim` : (t.label ? `${t.label} Swap` : (t.type || t['Task Type'] || t['Type'] || 'Task'));

          let swapDetails = '';
          if (isReclaim) {
            swapDetails = `#${t.oldItem} to ${t.location || 'Helena'}`;
          } else if (t.oldItem || t.newItem) {
            swapDetails = (t.oldItem && t.newItem && t.newItem !== '—' && t.newItem !== '-') ? `#${t.oldItem} to #${t.newItem}` : `#${t.newItem || t.oldItem}`;
          } else {
            swapDetails = t.item || t['Description'] || t['Item'] || '';
          }

          const isGloveTask = String(t.label || t.type || '').toLowerCase().includes('glove');
          const specParts = [];
          if (!isGloveTask) {
            if (t.size) specParts.push(`Size ${t.size}`);
            if (t.itemClass) specParts.push(`Class ${t.itemClass}`);
          }
          if (t.kv) specParts.push(`${t.kv} kV`);
          if (t.model) specParts.push(`Model ${t.model}`);
          if (t.length) specParts.push(`${t.length}`);
          const specs = specParts.join(', ');

          lines.push(`     • ${emp}${crewTag}: ${type} ${swapDetails}${specs ? ' (' + specs + ')' : ''}`);
        });
      }

      // Monthly Safety Trainings
      if (hasTrainings) {
        lines.push(`  Monthly Safety Training Records (${day.trainings.length}):`);
        day.trainings.forEach(tr => {
          totalTrainings++;
          const topic = tr['Training Topic'] || tr['Topic'] || tr['Training'] || 'Safety Training';
          const crew = tr['Crew #'] || tr['Crew'] || tr['Job #'] || '';
          const foreman = tr['Foreman'] || tr['Crew Lead'] || tr['Lead'] || '';
          lines.push(`     • ${topic}${crew ? ' · Crew ' + crew : ''}${foreman ? ' (Foreman: ' + foreman + ')' : ''}`);
        });
      }

      // Equipment Deliveries
      if (hasEquip) {
        lines.push(`  Completed Equipment Deliveries (${day.equipmentDeliveries.length}):`);
        day.equipmentDeliveries.forEach(eq => {
          totalEquipDeliveries++;
          const crew = eq.crewId ? ` · Crew ${this.getSignificantJobNumber(eq.crewId)}` : '';
          const unit = eq.vehicleNumber ? ` [Unit ${eq.vehicleNumber}]` : '';
          const loc = eq.location ? ` (${eq.location})` : '';
          const notes = eq.notes ? ` · ${eq.notes}` : '';
          lines.push(`     • ${eq.equipmentType}${unit}${crew}${loc}${notes}`);
        });
      }

      // DOT Drug Tests
      if (hasDrugTests) {
        lines.push(`  Completed DOT Drug Tests (${day.drugTests.length}):`);
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
    if (totalTrips > 0) summaryParts.push(`${totalTrips} Field Visits`);
    if (totalSwaps > 0) summaryParts.push(`${totalSwaps} Equipment Swaps`);
    if (totalClasses > 0) summaryParts.push(`${totalClasses} Classes Taught`);
    if (totalOfficeTasks > 0) summaryParts.push(`${totalOfficeTasks} Office Tasks`);
    if (totalTrainings > 0) summaryParts.push(`${totalTrainings} Trainings`);
    if (totalEquipDeliveries > 0) summaryParts.push(`${totalEquipDeliveries} Equipment Deliveries`);
    if (totalDrugTests > 0) summaryParts.push(`${totalDrugTests} Drug Tests`);

    lines.push(`SUMMARY: ${summaryParts.join(' | ') || '0 Accomplishments'}`);

    return lines.join('\n');
  }

  /**
   * Generates formatted text report for timesheet copy/paste.
   */
  generateTextReport(days) {
    if (this.reportFormat === 'bullets') {
      return this.generateBulletReport(days);
    }
    return this.generateParagraphReport(days);
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

          <div style="display: flex; align-items: center; gap: 12px; flex-wrap: wrap;">
            <!-- Format Selector -->
            <div style="display: flex; align-items: center; gap: 6px;">
              <span style="font-size: 11.5px; color: var(--text-muted); font-weight: 700; text-transform: uppercase;">Format:</span>
              <select id="tb-format-select" class="sheet-search" style="padding: 4px 10px; font-size: 11.5px; border-radius: 6px; background: var(--bg-secondary); color: var(--text-primary); cursor: pointer;" onchange="window.timeBreakdownEngine.setFormat(this.value)">
                <option value="paragraph" ${this.reportFormat === 'paragraph' ? 'selected' : ''}>Conversational Paragraph</option>
                <option value="bullets" ${this.reportFormat === 'bullets' ? 'selected' : ''}>Bullet Points (No Emojis)</option>
              </select>
            </div>

            <!-- Custom Date Inputs -->
            <div style="display: flex; align-items: center; gap: 8px;">
              <input type="date" id="tb-start-date" value="${startVal}" class="sheet-search" style="padding: 4px 8px; font-size: 11.5px;" onchange="window.timeBreakdownEngine.onCustomDateChange()">
              <span style="color: var(--text-muted); font-size: 11.5px;">to</span>
              <input type="date" id="tb-end-date" value="${endVal}" class="sheet-search" style="padding: 4px 8px; font-size: 11.5px;" onchange="window.timeBreakdownEngine.onCustomDateChange()">
            </div>
          </div>
        </div>

        <!-- Formatted Report Output Area -->
        <div style="position: relative;">
          <textarea id="time-breakdown-output" readonly style="width: 100%; height: 380px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 13px; line-height: 1.6; background: #0f172a; border: 1px solid var(--border-color); border-radius: 8px; padding: 16px; color: #f8fafc; resize: none; white-space: pre-wrap; word-break: break-word;">${this.escapeHtml(textReport)}</textarea>
        </div>
      </div>
    `;

    if (footer) {
      footer.innerHTML = `
        <button class="btn btn-secondary" onclick="window.timeBreakdownEngine.closeModal()">Close</button>
        <button class="btn btn-primary" onclick="window.timeBreakdownEngine.saveToDatabase()" style="font-weight: 700; background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%); border: none; display: flex; align-items: center; gap: 6px; box-shadow: 0 2px 8px rgba(59, 130, 246, 0.4);">
          <span>💾</span> Save Daily Log to Sheets
        </button>
        <button class="btn btn-primary" onclick="window.timeBreakdownEngine.copyToClipboard()" style="font-weight: 700; background: linear-gradient(135deg, #10b981 0%, #059669 100%); border: none; display: flex; align-items: center; gap: 6px; box-shadow: 0 2px 8px rgba(16, 185, 129, 0.4);">
          <span>📋</span> Copy Breakdown to Clipboard
        </button>
      `;
    }
  }

  async saveToDatabase() {
    const textarea = document.getElementById('time-breakdown-output');
    if (!textarea || !textarea.value) {
      alert('⚠️ No daily accomplishment data to save.');
      return;
    }

    const days = this.collectAccomplishments();
    const activeDateKey = this.formatDateKey(this.startDate);
    const day = (Array.isArray(days) ? days.find(d => d.dateKey === activeDateKey) : null) || (Array.isArray(days) ? days[0] : null) || {};

    const visitedCrews = [];
    const visitedCities = [];
    let swapsCount = 0;
    let trainingsCount = 0;

    Object.values(day.locations || {}).forEach(loc => {
      const allOfficeSwaps = loc.swaps && loc.swaps.length > 0 && loc.swaps.every(s => s.isOfficeTask);
      const noOtherFieldActivities = (!loc.crews || loc.crews.length === 0);
      if (loc.name && !visitedCities.includes(loc.name) && !(allOfficeSwaps && noOtherFieldActivities)) {
        visitedCities.push(loc.name);
      }
      (loc.crews || []).forEach(c => {
        if (!visitedCrews.includes(c)) visitedCrews.push(c);
      });
      swapsCount += (loc.swaps || []).length;
    });

    trainingsCount = (day.trainings || []).length + (day.classes || []).length;

    const record = {
      date: activeDateKey,
      user: 'Safety Coordinator',
      crews: visitedCrews.join(', '),
      route: visitedCities.join(' to '),
      driveTime: day.driveTimeFormatted || '',
      swapsCount: swapsCount,
      trainingsCount: trainingsCount,
      summary: textarea.value,
      loggedAt: new Date().toLocaleString('en-US', { timeZone: 'America/Denver' })
    };

    if (this.db && typeof this.db.saveDailyAccomplishment === 'function') {
      await this.db.saveDailyAccomplishment(record);
      alert(`✅ Daily Accomplishments for ${activeDateKey} saved to the database!\n\nIt has been recorded to "Daily Accomplishments" and queued for sync.`);
    } else {
      alert('❌ Local database is not available.');
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
