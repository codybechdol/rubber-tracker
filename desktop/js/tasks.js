/**
 * tasks.js - Offline Tasks & Crew Work Checklist Management
 */

class TaskManagerApp {
  constructor(db) {
    this.db = db;
    this.filterStatus = 'All'; // 'All', 'Overdue', 'Unassigned', 'Complete'
    this.filterCategory = 'All'; // 'All', 'PPE', 'Equipment', 'Training', 'Certs'
    this.groupBy = 'crew'; // 'crew' or 'list'
    this.searchTerm = '';
  }

  init() {
    this.setupSearchListeners();
    this.renderTasks();
  }

  setupSearchListeners() {
    const searchInput = document.getElementById('tasks-search-input');
    if (searchInput && !searchInput.dataset.bound) {
      searchInput.dataset.bound = 'true';
      searchInput.addEventListener('input', (e) => {
        this.searchTerm = (e.target.value || '').toLowerCase().trim();
        this.renderTasks();
      });
    }
  }

  setStatus(status) {
    this.filterStatus = status;
    const btns = ['task-status-all', 'task-status-overdue', 'task-status-unassigned', 'task-status-complete'];
    btns.forEach(bId => {
      const el = document.getElementById(bId);
      if (el) el.classList.remove('active');
    });
    const activeBtn = document.getElementById(`task-status-${status.toLowerCase()}`);
    if (activeBtn) activeBtn.classList.add('active');
    this.renderTasks();
  }

  setCategory(cat) {
    this.filterCategory = cat;
    const btns = ['task-cat-all', 'task-cat-ppe', 'task-cat-equipment', 'task-cat-training', 'task-cat-certs'];
    btns.forEach(bId => {
      const el = document.getElementById(bId);
      if (el) el.classList.remove('active');
    });
    const activeBtn = document.getElementById(`task-cat-${cat.toLowerCase()}`);
    if (activeBtn) activeBtn.classList.add('active');
    this.renderTasks();
  }

  setGrouping(grouping) {
    this.groupBy = grouping;
    const btnCrew = document.getElementById('btn-group-crew');
    const btnList = document.getElementById('btn-group-list');
    if (btnCrew && btnList) {
      if (grouping === 'crew') {
        btnCrew.classList.add('active');
        btnList.classList.remove('active');
      } else {
        btnCrew.classList.remove('active');
        btnList.classList.add('active');
      }
    }
    this.renderTasks();
  }

  /**
   * Collects, enriches, and normalizes all tasks across Task Metadata, Swap Sheets, Training, and Expiring Certs
   */
  collectAllTasks(targetDate = new Date()) {
    const allTasks = [];
    const seenTaskKeys = new Set();

    // Build employee lookup cache for Location, Crew #, and Foreman
    const empTable = this.db.getTable('employees');
    const empLookup = {};
    if (empTable && empTable.rows) {
      empTable.rows.forEach(r => {
        const name = String(r['Employee Name'] || r['Name'] || r['Employee'] || '').trim().toLowerCase();
        if (name) {
          empLookup[name] = {
            displayName: String(r['Employee Name'] || r['Name'] || r['Employee'] || '').trim(),
            location: String(r['Location'] || '').trim(),
            crewId: String(r['Job Number'] || r['Job #'] || '').trim(),
            foreman: String(r['Foreman'] || r['Crew Lead'] || r['Lead'] || '').trim(),
            phone: String(r['Phone Number'] || r['Phone'] || '').trim()
          };
        }
      });
    }

    // Build Job Tracking lookup cache for Foreman and Location by Crew #
    const jobTable = this.db.getTable('job_tracking');
    const jobLookup = {};
    if (jobTable && jobTable.rows) {
      jobTable.rows.forEach(r => {
        const crewId = String(r['Job Number'] || r['Crew'] || r['Job #'] || '').trim();
        if (crewId) {
          jobLookup[crewId] = {
            location: String(r['Location'] || '').trim(),
            foreman: String(r['Foreman'] || r['Crew Lead'] || r['Lead'] || '').trim(),
            jobName: String(r['Job Name'] || '').trim()
          };
        }
      });
    }

    // 1. Ingest tasks from Task Metadata
    const metaTable = this.db.getTable('task_metadata');
    if (metaTable && metaTable.rows) {
      metaTable.rows.forEach((r, idx) => {
        const taskId = String(r['TaskID'] || r['Task ID'] || r['id'] || `task_${idx}`).trim();
        const sourceSheet = String(r['SourceSheet'] || r['Source Sheet'] || '').trim();
        const rawType = String(r['TaskType'] || r['Task Type'] || r['Type'] || sourceSheet || 'Equipment Swap').trim();
        const employee = String(r['Employee'] || r['Assigned Worker'] || r['Name'] || '').trim();
        const itemType = String(r['ItemType'] || r['Item Type'] || r['Item'] || '').trim();
        const currentItem = String(r['CurrentItem'] || r['Current Item'] || '').trim();
        let loc = String(r['Location'] || '').trim();
        let foreman = String(r['Foreman'] || '').trim();
        const dueDate = String(r['DueDate'] || r['Due Date'] || r['Expiration Date'] || r['Change Out Date'] || 'N/A').trim();
        const scheduledDate = String(r['ScheduledDate'] || r['Scheduled Date'] || '').trim();
        const status = String(r['Status'] || 'Unassigned').trim();
        const notes = String(r['Notes'] || '').trim();

        const category = this.categorizeTask(rawType, sourceSheet);

        // Filter out future monthly training until the month arrives
        if (category === 'Training' || sourceSheet === 'Training Tracking' || rawType.toLowerCase().includes('training')) {
          if (this.isFutureTrainingMonth(dueDate, targetDate) || this.isFutureTrainingMonth(currentItem, targetDate)) {
            return; // Skip future month training
          }
        }

        const empInfo = empLookup[employee.toLowerCase()] || {};
        let crewId = String(r['Job Number'] || r['Crew'] || r['Job #'] || r['Crew #'] || empInfo.crewId || '').trim();
        if (!crewId) crewId = 'Unassigned Crew';
        if (!loc || loc === 'Unknown') loc = empInfo.location || (jobLookup[crewId]?.location) || 'Helena';
        if (!foreman) foreman = empInfo.foreman || (jobLookup[crewId]?.foreman) || 'Lead';

        let isOverdue = status.toLowerCase() === 'overdue' || this.checkIfOverdue(dueDate);
        if (category === 'Training' && (this.isPastTrainingMonth(dueDate, targetDate) || this.isPastTrainingMonth(currentItem, targetDate))) {
          if (!status.toLowerCase().includes('complete')) isOverdue = true;
        }

        const taskObj = {
          id: taskId,
          sourceSheet: sourceSheet,
          category: category,
          type: this.cleanTaskType(rawType, sourceSheet),
          itemType: itemType,
          currentItem: currentItem,
          employee: employee || 'Unassigned',
          crewId: crewId,
          foreman: foreman,
          location: this.cleanLocation(loc),
          dueDate: dueDate,
          scheduledDate: scheduledDate,
          status: isOverdue ? 'Overdue' : status,
          isOverdue: isOverdue,
          notes: notes
        };

        const taskKey = `${taskObj.type}_${taskObj.employee}_${taskObj.itemType}_${taskObj.dueDate}`.toLowerCase();
        if (!seenTaskKeys.has(taskKey)) {
          seenTaskKeys.add(taskKey);
          allTasks.push(taskObj);
        }
      });
    }

    // 2. Direct harvest from swap sheets if not already captured in metadata
    const swapSheets = [
      { key: 'glove_swaps', name: 'Glove Swap', cat: 'PPE' },
      { key: 'sleeve_swaps', name: 'Sleeve Swap', cat: 'PPE' },
      { key: 'blanket_swaps', name: 'Blanket Swap', cat: 'PPE' },
      { key: 'mack_swaps', name: 'MACK Swap', cat: 'Equipment' },
      { key: 'hv_tester_swaps', name: 'HV Tester Swap', cat: 'Equipment' },
      { key: 'phasing_set_swaps', name: 'Phasing Set Swap', cat: 'Equipment' },
      { key: 'aed_swaps', name: 'AED Swap', cat: 'Equipment' },
      { key: 'ground_swaps', name: 'Ground Swap', cat: 'Equipment' },
      { key: 'hot_stick_swaps', name: 'Hot Stick Swap', cat: 'Equipment' }
    ];

    swapSheets.forEach(sw => {
      const swTable = this.db.getTable(sw.key);
      if (swTable && swTable.rows) {
        swTable.rows.forEach((r, idx) => {
          const emp = String(r['Assigned To'] || r['Employee'] || r['Name'] || '').trim();
          const itemNum = String(r['Item #'] || r['Item#'] || r['Serial #'] || r['Serial#'] || r['ESL ID'] || '').trim();
          const specs = String(r['Size'] || r['Model'] || r['KV'] || r['Type'] || r['Class'] || '').trim();
          const changeOut = String(r['Change Out Date'] || r['Due Date'] || r['Expiration'] || 'N/A').trim();
          const stage = String(r['Status'] || r['Stage'] || 'Unassigned').trim();
          const pickedFor = String(r['Picked For'] || '').trim();

          const empInfo = empLookup[emp.toLowerCase()] || {};
          const crewId = empInfo.crewId || 'Unassigned Crew';
          const loc = empInfo.location || String(r['Location'] || 'Helena').trim();
          const foreman = empInfo.foreman || 'Lead';

          const taskKey = `${sw.name}_${emp}_${specs}_${changeOut}`.toLowerCase();
          if (!seenTaskKeys.has(taskKey) && emp && emp !== 'N/A') {
            seenTaskKeys.add(taskKey);
            const isOverdue = this.checkIfOverdue(changeOut);
            allTasks.push({
              id: `${sw.key}_${idx + 1}`,
              sourceSheet: sw.name,
              category: sw.cat,
              type: sw.name,
              itemType: specs || sw.name,
              currentItem: itemNum,
              employee: emp,
              crewId: crewId,
              foreman: foreman,
              location: this.cleanLocation(loc),
              dueDate: changeOut,
              scheduledDate: '',
              status: isOverdue ? 'Overdue' : (stage.includes('Picked') ? 'Picked & Ready' : 'Unassigned'),
              isOverdue: isOverdue,
              notes: pickedFor ? `Picked For: ${pickedFor}` : ''
            });
          }
        });
      }
    });

    // 3. Harvest Scheduled / Pending Training from Training Tracking (Excluding Future Months)
    const trainTable = this.db.getTable('training_tracking');
    if (trainTable && trainTable.rows) {
      trainTable.rows.forEach((r, idx) => {
        const status = String(r['Status'] || r['Training Status'] || '').trim();
        const month = String(r['Month'] || r['Scheduled Month'] || '').trim();
        const topic = String(r['Topic'] || r['Training Topic'] || r['Training'] || 'Safety Training').trim();
        const crewId = String(r['Crew #'] || r['Crew'] || r['Job Number'] || r['Job #'] || '').trim();
        const lead = String(r['Lead'] || r['Crew Lead'] || r['Foreman'] || '').trim();
        const attendees = String(r['Attendees'] || r['Crew Members'] || '').trim();

        // Skip completed or N/A
        if (status.toLowerCase() === 'complete' || status.toLowerCase() === 'n/a') return;

        // Skip future months until that month arrives
        if (this.isFutureTrainingMonth(month, targetDate)) {
          return;
        }

        const isPastMonth = this.isPastTrainingMonth(month, targetDate);
        const isOverdue = isPastMonth && !status.toLowerCase().includes('complete');

        const loc = (jobLookup[crewId]?.location) || 'Helena';
        const foreman = lead || (jobLookup[crewId]?.foreman) || 'Lead';
        const taskKey = `training_${crewId}_${topic}_${month}`.toLowerCase();

        if (!seenTaskKeys.has(taskKey) && crewId) {
          seenTaskKeys.add(taskKey);
          allTasks.push({
            id: `training_${idx + 1}`,
            sourceSheet: 'Training Tracking',
            category: 'Training',
            type: '🎓 Safety Training',
            itemType: topic,
            currentItem: `Month: ${month}`,
            employee: attendees ? `Crew Members: ${attendees}` : (foreman ? `Lead: ${foreman}` : `Crew ${crewId}`),
            crewId: crewId,
            foreman: foreman,
            location: this.cleanLocation(loc),
            dueDate: month || 'Current Month',
            scheduledDate: '',
            status: isOverdue ? 'Overdue' : 'Scheduled',
            isOverdue: isOverdue,
            notes: `Topic: ${topic} (${month})`
          });
        }
      });
    }

    // 4. Harvest Expiring Certifications
    const certTable = this.db.getTable('expiring_certs');
    if (certTable && certTable.rows) {
      certTable.rows.forEach((r, idx) => {
        const emp = String(r['Employee'] || r['Name'] || r['Employee Name'] || '').trim();
        const certType = String(r['Item Type'] || r['Certification'] || r['Cert'] || r['Type'] || 'Certification').trim();
        const expDate = String(r['Expiration Date'] || r['Expiration'] || r['Change Out Date'] || 'N/A').trim();
        const status = String(r['Status'] || '').trim();

        const empInfo = empLookup[emp.toLowerCase()] || {};
        const crewId = empInfo.crewId || 'Unassigned Crew';
        const loc = empInfo.location || String(r['Location'] || 'Helena').trim();
        const foreman = empInfo.foreman || 'Lead';

        const isExpired = status.toUpperCase() === 'CRITICAL' || status.toUpperCase() === 'WARNING' || this.checkIfOverdue(expDate);

        if (isExpired && emp && emp !== 'N/A') {
          const taskKey = `cert_${emp}_${certType}_${expDate}`.toLowerCase();
          if (!seenTaskKeys.has(taskKey)) {
            seenTaskKeys.add(taskKey);
            allTasks.push({
              id: `cert_${idx + 1}`,
              sourceSheet: 'Expiring Certs',
              category: 'Certs',
              type: '📜 Cert Renewal',
              itemType: certType,
              currentItem: status || 'Upcoming Expiry',
              employee: emp,
              crewId: crewId,
              foreman: foreman,
              location: this.cleanLocation(loc),
              dueDate: expDate,
              scheduledDate: '',
              status: isExpired ? 'Overdue' : 'Upcoming',
              isOverdue: isExpired,
              notes: `Expiring Cert: ${certType} (Expires: ${expDate})`
            });
          }
        }
      });
    }

    return allTasks;
  }

  isFutureTrainingMonth(monthStr, targetDate = new Date()) {
    if (!monthStr) return false;
    const monthLower = String(monthStr).toLowerCase().trim();
    const MONTH_MAP = {
      'january': 0, 'jan': 0,
      'february': 1, 'feb': 1,
      'march': 2, 'mar': 2,
      'april': 3, 'apr': 3,
      'may': 4,
      'june': 5, 'jun': 5,
      'july': 6, 'jul': 6,
      'august': 7, 'aug': 7,
      'september': 8, 'sep': 8, 'sept': 8,
      'october': 9, 'oct': 9,
      'november': 10, 'nov': 10,
      'december': 11, 'dec': 11
    };

    // Extract month name if inside string like "Month: September"
    for (const [mName, mIdx] of Object.entries(MONTH_MAP)) {
      if (monthLower === mName || monthLower.includes(mName)) {
        const targetMonthIdx = targetDate.getMonth();
        return mIdx > targetMonthIdx;
      }
    }
    return false;
  }

  isPastTrainingMonth(monthStr, targetDate = new Date()) {
    if (!monthStr) return false;
    const monthLower = String(monthStr).toLowerCase().trim();
    const MONTH_MAP = {
      'january': 0, 'jan': 0,
      'february': 1, 'feb': 1,
      'march': 2, 'mar': 2,
      'april': 3, 'apr': 3,
      'may': 4,
      'june': 5, 'jun': 5,
      'july': 6, 'jul': 6,
      'august': 7, 'aug': 7,
      'september': 8, 'sep': 8, 'sept': 8,
      'october': 9, 'oct': 9,
      'november': 10, 'nov': 10,
      'december': 11, 'dec': 11
    };

    for (const [mName, mIdx] of Object.entries(MONTH_MAP)) {
      if (monthLower === mName || monthLower.includes(mName)) {
        const targetMonthIdx = targetDate.getMonth();
        return mIdx < targetMonthIdx;
      }
    }
    return false;
  }

  categorizeTask(taskType, sourceSheet) {
    const combined = `${taskType} ${sourceSheet}`.toLowerCase();
    if (combined.includes('glove') || combined.includes('sleeve') || combined.includes('blanket')) return 'PPE';
    if (combined.includes('mack') || combined.includes('tester') || combined.includes('phasing') || combined.includes('aed') || combined.includes('ground') || combined.includes('stick') || combined.includes('safety equipment') || combined.includes('equipment') || combined.includes('jumper') || combined.includes('cone') || combined.includes('first aid')) return 'Equipment';
    if (combined.includes('training')) return 'Training';
    if (combined.includes('cert') || combined.includes('cpr') || combined.includes('crane') || combined.includes('rescue')) return 'Certs';
    if (combined.includes('safety report') || combined.includes('meeting') || combined.includes('compliance') || combined.includes('jha') || combined.includes('checklist')) return 'Safety Reports';
    if (combined.includes('reclaim')) return 'Reclaim';
    return 'Equipment';
  }

  cleanTaskType(rawType, sourceSheet) {
    if (!rawType || rawType === 'Equipment Swap') {
      if (sourceSheet) return sourceSheet.replace('Swaps', 'Swap').trim();
      return 'Equipment Swap';
    }
    return rawType.replace('Swaps', 'Swap').trim();
  }

  cleanLocation(loc) {
    if (!loc) return 'Helena';
    let clean = String(loc).trim();
    const parenMatch = clean.match(/^([^(]+)\s*\([^)]+\)$/);
    if (parenMatch) clean = parenMatch[1].trim();
    return clean.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  }

  checkIfOverdue(dateStr) {
    if (!dateStr || dateStr === 'N/A' || dateStr === '—') return false;
    const d = this.parseDate(dateStr);
    if (!d || isNaN(d.getTime())) return false;
    const today = new Date().setHours(0, 0, 0, 0);
    return d.getTime() < today;
  }

  parseDate(str) {
    if (!str || str === 'N/A') return null;
    if (str.includes('/')) {
      const parts = str.split('/');
      if (parts.length === 3) {
        return new Date(parseInt(parts[2], 10), parseInt(parts[0], 10) - 1, parseInt(parts[1], 10), 12, 0, 0);
      }
    }
    const d = new Date(str);
    return isNaN(d.getTime()) ? null : d;
  }

  getSignificantJobNumber(jobNum) {
    if (!jobNum) return '';
    const str = String(jobNum).trim();
    const match = str.match(/^(\d+-\d+)/);
    return match ? match[1] : str;
  }

  isCrewMatch(crewA, crewB) {
    if (!crewA || !crewB) return false;
    const a = String(crewA).toLowerCase().trim();
    const b = String(crewB).toLowerCase().trim();
    if (a === b) return true;
    const sigA = this.getSignificantJobNumber(a);
    const sigB = this.getSignificantJobNumber(b);
    if (sigA && sigB && sigA === sigB) return true;
    return a.startsWith(b) || b.startsWith(a);
  }

  getTasksByLocation(location, targetDate = new Date()) {
    const locClean = this.cleanLocation(location).toLowerCase();
    const tasks = this.collectAllTasks(targetDate);
    return tasks.filter(t => {
      const tLoc = this.cleanLocation(t.location).toLowerCase();
      return tLoc === locClean || tLoc.includes(locClean) || locClean.includes(tLoc);
    });
  }

  getTasksByCrew(crewId, targetDate = new Date()) {
    const tasks = this.collectAllTasks(targetDate);
    return tasks.filter(t => this.isCrewMatch(t.crewId, crewId));
  }

  renderTasks() {
    const container = document.getElementById('tasks-list-container');
    const badge = document.getElementById('tasks-total-badge');
    if (!container) return;

    const allTasks = this.collectAllTasks();

    // Apply Category Filter
    let filtered = allTasks;
    if (this.filterCategory !== 'All') {
      filtered = filtered.filter(t => t.category === this.filterCategory);
    }

    // Apply Status Filter
    if (this.filterStatus === 'Overdue') {
      filtered = filtered.filter(t => t.isOverdue || t.status.toLowerCase() === 'overdue');
    } else if (this.filterStatus === 'Unassigned') {
      filtered = filtered.filter(t => t.status.toLowerCase().includes('unassigned') || t.status.toLowerCase().includes('scheduled') || t.status.toLowerCase().includes('pending'));
    } else if (this.filterStatus === 'Complete') {
      filtered = filtered.filter(t => t.status.toLowerCase() === 'complete');
    }

    // Apply Search Query
    if (this.searchTerm) {
      const q = this.searchTerm;
      filtered = filtered.filter(t =>
        t.employee.toLowerCase().includes(q) ||
        t.crewId.toLowerCase().includes(q) ||
        t.foreman.toLowerCase().includes(q) ||
        t.location.toLowerCase().includes(q) ||
        t.type.toLowerCase().includes(q) ||
        t.itemType.toLowerCase().includes(q) ||
        t.notes.toLowerCase().includes(q)
      );
    }

    if (badge) {
      badge.textContent = `${filtered.length} tasks (${allTasks.filter(t => t.isOverdue).length} overdue)`;
    }

    if (filtered.length === 0) {
      container.innerHTML = `
        <div style="padding: 60px 20px; text-align: center; color: var(--text-muted); background: var(--bg-secondary); border-radius: 8px; border: 1px dashed var(--border-color);">
          <div style="font-size: 32px; margin-bottom: 10px;">🎉</div>
          <h3 style="font-size: 16px; font-weight: 700; color: #f8fafc; margin-bottom: 6px;">No tasks match the active filters</h3>
          <p style="font-size: 12.5px; color: var(--text-secondary);">All crew assignments and PPE change-outs are current or completed.</p>
        </div>
      `;
      return;
    }

    // Render Grouped by Crew or Flat List
    if (this.groupBy === 'crew') {
      this.renderGroupedByCrew(container, filtered);
    } else {
      this.renderFlatList(container, filtered);
    }
  }

  renderGroupedByCrew(container, tasks) {
    // Group tasks by Crew / Location
    const groups = {};
    tasks.forEach(t => {
      const groupKey = `${t.location} — Crew ${t.crewId} (${t.foreman})`;
      if (!groups[groupKey]) {
        groups[groupKey] = {
          location: t.location,
          crewId: t.crewId,
          foreman: t.foreman,
          tasks: []
        };
      }
      groups[groupKey].tasks.push(t);
    });

    let html = '';
    Object.values(groups).forEach(g => {
      const overdueCount = g.tasks.filter(t => t.isOverdue).length;

      html += `
        <div style="background-color: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: 8px; margin-bottom: 18px; overflow: hidden; box-shadow: 0 2px 6px rgba(0,0,0,0.2);">
          
          <!-- Crew Section Header Banner -->
          <div style="background: linear-gradient(90deg, #1e293b 0%, #0f172a 100%); padding: 12px 18px; border-bottom: 1px solid var(--border-color); display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px;">
            <div style="display: flex; align-items: center; gap: 10px;">
              <span style="font-size: 16px;">🚚</span>
              <div>
                <div style="font-size: 14.5px; font-weight: 800; color: #f8fafc; display: flex; align-items: center; gap: 8px;">
                  <span>Crew ${this.escapeHtml(g.crewId)}</span>
                  <span style="color: #94a3b8; font-weight: normal; font-size: 13px;">(${this.escapeHtml(g.foreman)})</span>
                  <span class="badge" style="background: rgba(59, 130, 246, 0.2); color: #93c5fd; font-size: 11px; padding: 2px 8px; border-radius: 12px;">
                    📍 ${this.escapeHtml(g.location)}
                  </span>
                </div>
              </div>
            </div>

            <div style="display: flex; align-items: center; gap: 8px;">
              ${overdueCount > 0 ? `
                <span class="badge" style="background: #ef4444; color: #fff; font-size: 11px; font-weight: 700; padding: 3px 8px; border-radius: 4px;">
                  🔴 ${overdueCount} Overdue
                </span>
              ` : ''}
              <span class="badge" style="background: rgba(255,255,255,0.08); color: #cbd5e1; font-size: 11px; padding: 3px 8px; border-radius: 4px;">
                ${g.tasks.length} Task${g.tasks.length > 1 ? 's' : ''}
              </span>
            </div>
          </div>

          <!-- Tasks Checklist for this Crew -->
          <div style="padding: 12px 16px; display: flex; flex-direction: column; gap: 8px;">
            ${g.tasks.map(t => this.renderTaskCardHtml(t)).join('')}
          </div>

        </div>
      `;
    });

    container.innerHTML = html;
  }

  renderFlatList(container, tasks) {
    // Sort tasks: Overdue first, then by Due Date asc
    const sorted = [...tasks].sort((a, b) => {
      if (a.isOverdue && !b.isOverdue) return -1;
      if (!a.isOverdue && b.isOverdue) return 1;
      const dA = this.parseDate(a.dueDate);
      const dB = this.parseDate(b.dueDate);
      if (dA && dB) return dA.getTime() - dB.getTime();
      return 0;
    });

    container.innerHTML = `
      <div style="display: flex; flex-direction: column; gap: 10px;">
        ${sorted.map(t => this.renderTaskCardHtml(t)).join('')}
      </div>
    `;
  }

  renderTaskCardHtml(task) {
    const isComplete = task.status.toLowerCase() === 'complete';
    const isOverdue = task.isOverdue;
    const badgeColor = isComplete ? '#10b981' : (isOverdue ? '#ef4444' : '#f59e0b');
    const borderColor = isComplete ? 'rgba(16, 185, 129, 0.4)' : (isOverdue ? 'rgba(239, 68, 68, 0.4)' : 'var(--border-color)');

    return `
      <div style="background-color: var(--bg-primary); border: 1px solid ${borderColor}; border-left: 4px solid ${badgeColor}; border-radius: 6px; padding: 12px 14px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px;">
        
        <div style="flex: 1; min-width: 260px;">
          <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 4px;">
            <span style="font-weight: 800; font-size: 13.5px; color: #f8fafc;">
              ${this.escapeHtml(task.type)}: ${this.escapeHtml(task.itemType)}
            </span>
            ${task.currentItem ? `
              <span class="badge" style="background: rgba(255,255,255,0.06); color: #93c5fd; font-family: monospace; font-size: 11px; padding: 1px 6px;">
                ${this.escapeHtml(task.currentItem)}
              </span>
            ` : ''}
          </div>

          <div style="font-size: 12px; color: var(--text-secondary); display: flex; align-items: center; gap: 12px; flex-wrap: wrap;">
            <span>
              👤 Assigned to: <strong style="color: #60a5fa; cursor: pointer; text-decoration: underline dotted;" onclick="if(window.employeeProfileEngine){window.employeeProfileEngine.openProfileModal('${this.escapeHtml(task.employee)}');}">${this.escapeHtml(task.employee)}</strong>
            </span>
            <span>
              🚚 Crew: <strong>${this.escapeHtml(task.crewId)}</strong>
            </span>
            <span>
              📍 <strong>${this.escapeHtml(task.location)}</strong>
            </span>
            <span style="color: ${isOverdue ? '#f87171' : 'var(--text-secondary)'}; font-weight: ${isOverdue ? '700' : 'normal'};">
              📅 Due: <strong>${this.escapeHtml(task.dueDate)}</strong>
            </span>
          </div>

          ${task.notes ? `
            <div style="font-size: 11px; color: var(--text-muted); margin-top: 4px;">
              📝 ${this.escapeHtml(task.notes)}
            </div>
          ` : ''}
        </div>

        <div style="display: flex; align-items: center; gap: 10px;">
          <span class="badge" style="background: ${isComplete ? '#15803d' : (isOverdue ? '#b91c1c' : '#d97706')}; color: #fff; font-size: 11px; font-weight: 700; padding: 3px 8px; border-radius: 4px;">
            ${isComplete ? '✅ Complete' : (isOverdue ? '🔴 Overdue' : '⏳ Pending')}
          </span>
          ${!isComplete ? `
            <button class="btn" style="background-color: #10b981; color: #fff; padding: 4px 10px; font-size: 11px; font-weight: 700; border-radius: 4px; cursor: pointer;" onclick="window.taskManager.completeTask('${this.escapeHtml(task.id)}')">
              ✓ Mark Complete
            </button>
          ` : `
            <span style="color: var(--text-muted); font-size: 11px;">✓ Completed</span>
          `}
        </div>

      </div>
    `;
  }

  completeTask(taskId) {
    const todayStr = new Date().toISOString().split('T')[0];

    // Optimistically update local database
    this.db.addMutation({
      action: 'SET_TASK_STATUS',
      taskId: taskId,
      status: 'Complete',
      completedDate: todayStr
    });

    this.renderTasks();
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

window.taskManager = new TaskManagerApp(window.localDB);
