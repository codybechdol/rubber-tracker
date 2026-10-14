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

          let rawDate = entry.deliveredDate || (entry.timestamp ? entry.timestamp.substring(0, 10) : '') || newInvItem['Date Assigned'];
          const dKey = this.normalizeDateKey(rawDate);
          if (daysMap[dKey]) {
            const rawPick = String(entry.pickListNum || '').trim();
            const cleanNew = (rawPick === '—' || rawPick === '-') ? '' : rawPick;
            const cleanOld = String(entry.currentItemNum || '').trim();
            const isReclaim = !cleanNew;
            const dedupe = `${cfg.label}_${empClean}_${cleanNew}_${cleanOld}`.toLowerCase();
            if (!seenSwapKeys.has(dedupe)) {
              seenSwapKeys.add(dedupe);
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
                status: 'Delivered'
              };

              // Try to attach to a matching field visit location on that day
              let attached = false;
              const dayLocKeys = Object.keys(daysMap[dKey].locations);
              for (const lKey of dayLocKeys) {
                const locObj = daysMap[dKey].locations[lKey];
                const locNameClean = lKey.toLowerCase();
                const swapLocClean = swapObj.location.toLowerCase();
                const swapSigCrew = this.getSignificantJobNumber(swapObj.crew);
                const locCrewsSig = (locObj.crews || []).map(c => this.getSignificantJobNumber(c));

                const matchesLocation = (swapLocClean === locNameClean || swapLocClean.includes(locNameClean) || locNameClean.includes(swapLocClean));
                const matchesCrew = Boolean(swapSigCrew && locCrewsSig.includes(swapSigCrew));

                if (matchesLocation || matchesCrew) {
                  locObj.swaps.push(swapObj);
                  attached = true;
                  break;
                }
              }

              if (!attached) {
                daysMap[dKey].tasks.push(swapObj);
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
            const rawDate = dateChanged || r['Stage 3 Date'] || r['Stage 2 Date'] || r['Date'];
            const dKey = this.normalizeDateKey(rawDate);
            if (daysMap[dKey]) {
              const empClean = String(r['Employee'] || r['Assigned To'] || 'Worker').trim();
              const oldItem = String(r['Current Glove #'] || r['Current Sleeve #'] || r['Current Item #'] || r['Item #'] || '').trim();
              const rawPick = String(r['Pick List Glove #'] || r['Pick List Sleeve #'] || r['Pick List Item #'] || '').trim();
              const cleanNew = (rawPick === '—' || rawPick === '-') ? '' : rawPick;
              const isReclaim = Boolean(!cleanNew || String(r['Days Left'] || '').toUpperCase().includes('PREV') || status.includes('return to shelf'));
              const dedupe = `${cfg.label}_${empClean}_${cleanNew}_${oldItem}`.toLowerCase();
              if (!seenSwapKeys.has(dedupe)) {
                seenSwapKeys.add(dedupe);
                const empInfo = empMap[empClean.toLowerCase()] || {};
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
                  status: 'Delivered'
                };

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
                  daysMap[dKey].tasks.push(swapObj);
                }
              }
            }
          }
        });
      }
    });

    // C. Completed Equipment Swaps & Reclaims from Trip Planner (scheduled_swaps)
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

    Object.keys(schedRegistry).forEach(k => {
      const entry = schedRegistry[k];
      if (!entry || (!entry.completed && !entry.isCompleted)) return;

      const rawDate = entry.completedDate || entry.dateKey || entry.date;
      const dKey = this.normalizeDateKey(rawDate);
      if (!daysMap[dKey]) return;

      const swapData = entry.swap || entry;
      const empClean = String(entry.employeeName || swapData.employeeName || swapData.employee || '').trim();
      if (!empClean) return;

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

      const dedupe = `${label}_${empClean}_${cleanNew}_${oldItem}`.toLowerCase();
      if (!seenSwapKeys.has(dedupe)) {
        seenSwapKeys.add(dedupe);

        const empInfo = empMap[empClean.toLowerCase()] || {};
        const swapLoc = entry.location || swapData.location || empInfo.loc || 'Helena';
        const swapCrew = entry.crewId || swapData.crewId || swapData.jobNum || empInfo.crew || '';

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
          crew: swapCrew,
          status: 'Delivered'
        };

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
          daysMap[dKey].tasks.push(swapObj);
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

    // 6. Enrich planned trip locations with active crews from job_tracking if empty
    const jobTable = this.db ? this.db.getTable('job_tracking') : null;
    if (jobTable && jobTable.rows) {
      Object.keys(daysMap).forEach(dKey => {
        const locs = daysMap[dKey].locations;
        Object.keys(locs).forEach(lKey => {
          if (locs[lKey].crews.length === 0) {
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
      lines.push(`📅 ${dayName}`);
      lines.push(`-------------------------------------------------------`);

      // Locations & Field Visits with associated equipment swaps
      if (hasLocations) {
        locKeys.forEach(locKey => {
          totalTrips++;
          const loc = day.locations[locKey];
          const crewStr = (loc.crews && loc.crews.filter(Boolean).length > 0) ? ` [${loc.crews.filter(Boolean).join(', ')}]` : '';
          lines.push(`  🚗 Field Visit: ${loc.name}${crewStr}`);

          if (loc.swaps && loc.swaps.length > 0) {
            lines.push(`     • Completed Equipment Swaps & Reclaims (${loc.swaps.length}):`);
            loc.swaps.forEach(sw => {
              totalSwaps++;
              const crewTag = sw.crew ? ` (Crew ${this.getSignificantJobNumber(sw.crew)})` : '';
              const specParts = [];
              if (sw.size) specParts.push(`Size ${sw.size}`);
              if (sw.itemClass) specParts.push(`Class ${sw.itemClass}`);
              if (sw.kv) specParts.push(`${sw.kv} kV`);
              if (sw.model) specParts.push(`Model ${sw.model}`);
              if (sw.length) specParts.push(`${sw.length}`);
              const specs = specParts.join(', ');

              const isReclaim = Boolean(sw.isReclaim || (!sw.newItem || sw.newItem === '—' || sw.newItem === '-'));
              const swapAction = isReclaim ? `${sw.label} Reclaim` : `${sw.label} Swap`;
              let swapDetails = '';
              if (isReclaim) {
                swapDetails = `#${sw.oldItem} ➔ ${sw.location || 'Helena'}`;
              } else if (sw.oldItem && sw.newItem) {
                swapDetails = `#${sw.oldItem} ➔ #${sw.newItem}`;
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
          const rawNotes = ot.notes ? ot.notes.replace(/\r?\n+/g, ' · ').trim() : '';
          const notes = rawNotes ? ` · ${rawNotes}` : '';
          lines.push(`     • ${ot.title}${loc}${time}${notes}`);
        });
      }

      // Other Completed Equipment Swaps & Tasks (not tied to a specific field visit location)
      if (hasTasks) {
        lines.push(`  🔧 Other Completed Equipment Swaps & Tasks (${day.tasks.length}):`);
        day.tasks.forEach(t => {
          totalSwaps++;
          const emp = t.employee || t['Assigned To'] || t['Employee'] || 'Unassigned';
          const crewTag = t.crew ? ` (Crew ${this.getSignificantJobNumber(t.crew)})` : (t.job ? ` (Job ${t.job})` : '');

          const isReclaim = Boolean(t.isReclaim || ((t.oldItem || t.newItem) && (!t.newItem || t.newItem === '—' || t.newItem === '-')));
          const cleanLabel = t.label || String(t.type || 'Equipment').replace(/\s*(Swap|Reclaim)\s*/i, '');
          const type = isReclaim ? `${cleanLabel} Reclaim` : (t.label ? `${t.label} Swap` : (t.type || t['Task Type'] || t['Type'] || 'Task'));

          let swapDetails = '';
          if (isReclaim) {
            swapDetails = `#${t.oldItem} ➔ ${t.location || 'Helena'}`;
          } else if (t.oldItem || t.newItem) {
            swapDetails = (t.oldItem && t.newItem && t.newItem !== '—' && t.newItem !== '-') ? `#${t.oldItem} ➔ #${t.newItem}` : `#${t.newItem || t.oldItem}`;
          } else {
            swapDetails = t.item || t['Description'] || t['Item'] || '';
          }

          const specParts = [];
          if (t.size) specParts.push(`Size ${t.size}`);
          if (t.itemClass) specParts.push(`Class ${t.itemClass}`);
          if (t.kv) specParts.push(`${t.kv} kV`);
          if (t.model) specParts.push(`Model ${t.model}`);
          if (t.length) specParts.push(`${t.length}`);
          const specs = specParts.join(', ');

          lines.push(`     • ${emp}${crewTag}: ${type} ${swapDetails}${specs ? ' (' + specs + ')' : ''}`);
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

      // Completed Equipment Deliveries
      if (hasEquip) {
        lines.push(`  🧰 Completed Equipment Deliveries (${day.equipmentDeliveries.length}):`);
        day.equipmentDeliveries.forEach(eq => {
          totalEquipDeliveries++;
          const crew = eq.crewId ? ` · Crew ${this.getSignificantJobNumber(eq.crewId)}` : '';
          const unit = eq.vehicleNumber ? ` [Unit ${eq.vehicleNumber}]` : '';
          const loc = eq.location ? ` (📍 ${eq.location})` : '';
          const notes = eq.notes ? ` · ${eq.notes}` : '';
          lines.push(`     • ${eq.equipmentType}${unit}${crew}${loc}${notes}`);
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
    if (totalTrips > 0) summaryParts.push(`${totalTrips} Field Visits`);
    if (totalSwaps > 0) summaryParts.push(`${totalSwaps} Equipment Swaps`);
    if (totalClasses > 0) summaryParts.push(`${totalClasses} Classes Taught`);
    if (totalOfficeTasks > 0) summaryParts.push(`${totalOfficeTasks} Office Tasks`);
    if (totalTrainings > 0) summaryParts.push(`${totalTrainings} Trainings`);
    if (totalEquipDeliveries > 0) summaryParts.push(`${totalEquipDeliveries} Equipment Deliveries`);
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
      if (loc.name && !visitedCities.includes(loc.name)) visitedCities.push(loc.name);
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
      route: visitedCities.join(' ➔ '),
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
