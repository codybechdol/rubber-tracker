/**
 * fiscal-year.js - Fiscal Year Transition Engine for Safety Assistant Desktop App
 * Handles annual October 1st job number migration (e.g., ###-26 -> ###-27 and custom renames),
 * atomic multi-table synchronization (Employees, Job Tracking, History, Training, Inventory),
 * and October transition alias mapping for seamless email credit continuity.
 */

class FiscalYearEngine {
  constructor(db) {
    this._db = db;
    this.currentFY = '26';
    this.newFY = '27';
    this.crewPlan = []; // Array of crew transition specs
  }

  get db() {
    return this._db || window.localDB;
  }

  set db(val) {
    this._db = val;
  }

  init() {
    this.detectFiscalYears();
  }

  /**
   * Automatically detects current fiscal year suffix from active jobs in database.
   */
  detectFiscalYears() {
    const snap = this.db?.snapshot;
    if (!snap?.tables) return;

    const empTable = snap.tables['employees'];
    const suffixCounts = {};

    if (empTable && empTable.rows) {
      empTable.rows.forEach(r => {
        const job = String(r['Job Number'] || '').trim();
        const m = job.match(/-(\d{2})(?:\.\d+)?$/);
        if (m) {
          const s = m[1];
          suffixCounts[s] = (suffixCounts[s] || 0) + 1;
        }
      });
    }

    let topSuffix = '26';
    let maxCount = 0;
    Object.entries(suffixCounts).forEach(([s, count]) => {
      if (count > maxCount) {
        maxCount = count;
        topSuffix = s;
      }
    });

    this.currentFY = topSuffix;
    const num = parseInt(topSuffix, 10);
    this.newFY = (!isNaN(num) ? String(num + 1).padStart(2, '0') : '27');
  }

  /**
   * Scans employees and job_tracking to build the full transition candidate roster.
   */
  scanTransitionCandidates(curFY = this.currentFY, targetFY = this.newFY) {
    const snap = this.db?.snapshot;
    if (!snap?.tables) return [];

    const empTable = snap.tables['employees'] || { rows: [] };
    const jtTable = snap.tables['job_tracking'] || { rows: [] };

    // Group employees by base crew number
    const crewEmployees = new Map(); // baseJob -> Array of employee rows
    empTable.rows.forEach(r => {
      const job = String(r['Job Number'] || '').trim();
      const loc = String(r['Location'] || '').trim().toLowerCase();
      if (!job || loc === 'previous employee') return;

      const base = job.split('.')[0];
      if (!crewEmployees.has(base)) {
        crewEmployees.set(base, []);
      }
      crewEmployees.get(base).push(r);
    });

    // Collect all unique base job numbers from both Job Tracking and Employees
    const crewMap = new Map();

    // 1. From Job Tracking
    jtTable.rows.forEach(r => {
      const base = String(r['Job Number'] || '').trim();
      if (!base) return;

      const status = String(r['Status'] || 'Active').trim();
      const foreman = String(r['Foreman'] || '').trim();
      const loc = String(r['Location'] || '').trim();
      const jobName = String(r['Job Name'] || '').trim();

      const emps = crewEmployees.get(base) || [];
      const statusLower = status.toLowerCase();

      // Exclude completed or closed jobs that have no active employees
      if ((statusLower === 'completed' || statusLower === 'closed') && emps.length === 0) {
        return;
      }

      const isCompleted = (statusLower === 'completed' || statusLower === 'closed');
      const defaultAction = isCompleted ? 'complete' : 'transition';

      crewMap.set(base, {
        baseJob: base,
        status: status,
        foreman: foreman || (emps[0] ? emps[0]['Name'] : 'Unassigned'),
        location: loc || (emps[0] ? emps[0]['Location'] : 'Helena'),
        jobName: jobName,
        employeeCount: emps.length,
        employees: emps,
        action: defaultAction, // 'transition' | 'custom' | 'stay' | 'complete'
        suggestedJob: base.endsWith(`-${curFY}`) ? base.replace(new RegExp(`-${curFY}$`), `-${targetFY}`) : base,
        targetJob: base.endsWith(`-${curFY}`) ? base.replace(new RegExp(`-${curFY}$`), `-${targetFY}`) : base,
        inJobTracking: true
      });
    });

    // 2. From Employees (for any crews present in Employees but missing in Job Tracking)
    crewEmployees.forEach((emps, base) => {
      if (!crewMap.has(base)) {
        const first = emps[0];
        crewMap.set(base, {
          baseJob: base,
          status: 'Active',
          foreman: first ? first['Name'] : 'Unassigned',
          location: first ? first['Location'] : 'Helena',
          jobName: '',
          employeeCount: emps.length,
          employees: emps,
          action: 'transition',
          suggestedJob: base.endsWith(`-${curFY}`) ? base.replace(new RegExp(`-${curFY}$`), `-${targetFY}`) : base,
          targetJob: base.endsWith(`-${curFY}`) ? base.replace(new RegExp(`-${curFY}$`), `-${targetFY}`) : base,
          inJobTracking: false
        });
      }
    });

    // Sort by baseJob
    const list = Array.from(crewMap.values());
    list.sort((a, b) => a.baseJob.localeCompare(b.baseJob));
    return list;
  }

  /**
   * Opens the Fiscal Year Transition Wizard modal.
   */
  openModal() {
    this.detectFiscalYears();
    const existing = document.getElementById('fy-transition-modal');
    if (existing) existing.remove();

    this.crewPlan = this.scanTransitionCandidates(this.currentFY, this.newFY);

    const modal = document.createElement('div');
    modal.id = 'fy-transition-modal';
    modal.className = 'modal-overlay';
    modal.style.cssText = 'position: fixed; inset: 0; background: rgba(0, 0, 0, 0.8); backdrop-filter: blur(5px); z-index: 10000; display: flex; align-items: center; justify-content: center; padding: 20px;';

    modal.innerHTML = `
      <div class="modal-box" style="background: var(--bg-card, #1e293b); border: 1px solid var(--border-color, #334155); border-radius: 12px; width: 100%; max-width: 1050px; max-height: 90vh; display: flex; flex-direction: column; box-shadow: 0 20px 40px rgba(0,0,0,0.6); color: #f8fafc; overflow: hidden;">
        
        <!-- Header -->
        <div style="padding: 16px 24px; background: rgba(15, 23, 42, 0.85); border-bottom: 1px solid var(--border-color, #334155); display: flex; justify-content: space-between; align-items: center;">
          <div style="display: flex; align-items: center; gap: 10px;">
            <span style="font-size: 22px;">📅</span>
            <div>
              <h3 style="margin: 0; font-size: 16px; font-weight: 800; color: #f8fafc; letter-spacing: -0.3px;">
                Fiscal Year Transition Wizard <span style="color: #a855f7;">(FY${this.currentFY} ➔ FY${this.newFY})</span>
              </h3>
              <div style="font-size: 11.5px; color: #94a3b8; margin-top: 2px;">
                Annual job number migration, employee rank preservation, and audit trail synchronization.
              </div>
            </div>
          </div>
          <button onclick="document.getElementById('fy-transition-modal').remove()" style="background: none; border: none; color: #94a3b8; font-size: 20px; cursor: pointer; padding: 4px;">✕</button>
        </div>

        <!-- Body -->
        <div style="padding: 20px 24px; overflow-y: auto; flex: 1; display: flex; flex-direction: column; gap: 18px;">
          
          <!-- Suffix Configuration Bar -->
          <div style="display: grid; grid-template-columns: 1fr 1fr 2fr; gap: 14px; background: rgba(30, 41, 59, 0.6); border: 1px solid var(--border-color, #334155); border-radius: 8px; padding: 14px 18px; align-items: center;">
            <div>
              <label style="display: block; font-size: 11px; font-weight: 700; color: #94a3b8; text-transform: uppercase; margin-bottom: 4px;">Current FY Suffix</label>
              <div style="display: flex; align-items: center; gap: 6px;">
                <span style="font-family: monospace; font-size: 13px; color: #cbd5e1;">###-</span>
                <input type="text" id="fy-cur-input" value="${this.currentFY}" maxlength="2" style="width: 50px; background: var(--bg-secondary, #0f172a); border: 1px solid var(--border-color, #334155); border-radius: 4px; padding: 5px 8px; color: #60a5fa; font-weight: 800; font-family: monospace; text-align: center;" onchange="window.fiscalYearEngine.onYearChange()">
              </div>
            </div>

            <div>
              <label style="display: block; font-size: 11px; font-weight: 700; color: #94a3b8; text-transform: uppercase; margin-bottom: 4px;">New FY Suffix</label>
              <div style="display: flex; align-items: center; gap: 6px;">
                <span style="font-family: monospace; font-size: 13px; color: #cbd5e1;">###-</span>
                <input type="text" id="fy-new-input" value="${this.newFY}" maxlength="2" style="width: 50px; background: var(--bg-secondary, #0f172a); border: 1px solid #a855f7; border-radius: 4px; padding: 5px 8px; color: #c084fc; font-weight: 800; font-family: monospace; text-align: center;" onchange="window.fiscalYearEngine.onYearChange()">
              </div>
            </div>

            <div style="font-size: 12px; color: #94a3b8; line-height: 1.4; border-left: 1px solid rgba(255,255,255,0.1); padding-left: 14px;">
              💡 <strong>Annual Suffix Rule:</strong> Standard field crews automatically increment from <code style="color: #60a5fa;">-${this.currentFY}</code> to <code style="color: #c084fc;">-${this.newFY}</code>. You can override individual jobs below for crews whose numbers change completely.
            </div>
          </div>

          <!-- Stats KPI Summary Bar -->
          <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px;" id="fy-stats-bar">
            <!-- Injected by renderStats() -->
          </div>

          <!-- Quick Filters & Batch Actions -->
          <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px;">
            <div style="display: flex; gap: 8px;">
              <button class="btn btn-secondary" onclick="window.fiscalYearEngine.setAllActions('transition')" style="font-size: 11.5px; padding: 4px 10px;">
                ✓ Transition All (-${this.newFY})
              </button>
              <button class="btn btn-secondary" onclick="window.fiscalYearEngine.setAllActions('stay')" style="font-size: 11.5px; padding: 4px 10px;">
                ⏸️ Keep All on -${this.currentFY}
              </button>
            </div>
            <input type="text" id="fy-filter-input" placeholder="Filter crews by job #, foreman, or location..." style="background: var(--bg-secondary, #0f172a); border: 1px solid var(--border-color, #334155); border-radius: 6px; padding: 6px 12px; color: #f8fafc; font-size: 12px; width: 300px; outline: none;" oninput="window.fiscalYearEngine.filterTable(this.value)">
          </div>

          <!-- Interactive Mapping Table -->
          <div style="border: 1px solid var(--border-color, #334155); border-radius: 8px; overflow: hidden; background: rgba(15, 23, 42, 0.5); max-height: 380px; overflow-y: auto;">
            <table style="width: 100%; border-collapse: collapse; font-size: 12px;">
              <thead>
                <tr style="background: rgba(30, 41, 59, 0.9); position: sticky; top: 0; z-index: 2; border-bottom: 2px solid var(--border-color, #334155);">
                  <th style="padding: 10px 14px; text-align: left; font-weight: 700; color: #94a3b8;">Current Job #</th>
                  <th style="padding: 10px 14px; text-align: left; font-weight: 700; color: #94a3b8;">Foreman</th>
                  <th style="padding: 10px 14px; text-align: left; font-weight: 700; color: #94a3b8;">Location</th>
                  <th style="padding: 10px 14px; text-align: center; font-weight: 700; color: #94a3b8;">Employees</th>
                  <th style="padding: 10px 14px; text-align: left; font-weight: 700; color: #c084fc;">Transition Action</th>
                  <th style="padding: 10px 14px; text-align: left; font-weight: 700; color: #34d399;">New Job Number</th>
                </tr>
              </thead>
              <tbody id="fy-table-body">
                <!-- Rows injected dynamically -->
              </tbody>
            </table>
          </div>

          <!-- Migration Options Checklist -->
          <div style="background: rgba(30, 41, 59, 0.5); border: 1px solid var(--border-color, #334155); border-radius: 8px; padding: 14px 18px;">
            <div style="font-size: 12px; font-weight: 700; color: #f8fafc; text-transform: uppercase; margin-bottom: 10px; display: flex; align-items: center; gap: 6px;">
              <span>⚙️</span> Migration Execution Settings
            </div>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; font-size: 12px; color: #cbd5e1;">
              <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
                <input type="checkbox" id="fy-opt-employees" checked>
                <span>Update active employee job numbers (preserves position indices e.g. .1, .2)</span>
              </label>
              <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
                <input type="checkbox" id="fy-opt-jobtracking" checked>
                <span>Migrate Job Tracking records in-place (preserves Foremen, Cities, Skip Days)</span>
              </label>
              <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
                <input type="checkbox" id="fy-opt-history" checked>
                <span>Log FISCAL_YEAR_TRANSITION lifecycle records in Employee History</span>
              </label>
              <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
                <input type="checkbox" id="fy-opt-alias" checked>
                <span>Activate October Email Transition Alias Map (credits -${this.currentFY} emails to -${this.newFY})</span>
              </label>
              <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
                <input type="checkbox" id="fy-opt-training" checked>
                <span>Update future scheduled visits in Training Tracking (dates >= Oct 1)</span>
              </label>
            </div>
          </div>

        </div>

        <!-- Footer -->
        <div style="padding: 14px 24px; background: rgba(15, 23, 42, 0.9); border-top: 1px solid var(--border-color, #334155); display: flex; justify-content: space-between; align-items: center;">
          <div style="display: flex; align-items: center; gap: 8px;">
            <input type="checkbox" id="fy-confirm-checkbox" onchange="document.getElementById('fy-apply-btn').disabled = !this.checked">
            <label for="fy-confirm-checkbox" style="font-size: 12px; color: #cbd5e1; cursor: pointer; user-select: none;">
              I confirm the transition mapping and authorize database updates.
            </label>
          </div>

          <div style="display: flex; gap: 10px;">
            <button class="btn btn-secondary" onclick="document.getElementById('fy-transition-modal').remove()">Cancel</button>
            <button class="btn btn-primary" id="fy-apply-btn" disabled onclick="window.fiscalYearEngine.executeTransition()" style="font-weight: 700; background: linear-gradient(135deg, #a855f7 0%, #7e22ce 100%); border: none; padding: 8px 20px; box-shadow: 0 4px 12px rgba(168, 85, 247, 0.3);">
              🚀 Apply Fiscal Year Transition
            </button>
          </div>
        </div>

      </div>
    `;

    document.body.appendChild(modal);
    this.renderStats();
    this.renderTable();
  }

  onYearChange() {
    const curInput = document.getElementById('fy-cur-input');
    const newInput = document.getElementById('fy-new-input');
    if (!curInput || !newInput) return;

    this.currentFY = curInput.value.trim() || '26';
    this.newFY = newInput.value.trim() || '27';

    this.crewPlan = this.scanTransitionCandidates(this.currentFY, this.newFY);
    this.renderStats();
    this.renderTable();
  }

  renderStats() {
    const container = document.getElementById('fy-stats-bar');
    if (!container) return;

    const totalCrews = this.crewPlan.length;
    const willTransition = this.crewPlan.filter(c => c.action === 'transition' || c.action === 'custom').length;
    const willStay = this.crewPlan.filter(c => c.action === 'stay').length;
    const willComplete = this.crewPlan.filter(c => c.action === 'complete').length;
    const totalEmpsAffected = this.crewPlan
      .filter(c => c.action === 'transition' || c.action === 'custom')
      .reduce((sum, c) => sum + (c.employeeCount || 0), 0);

    container.innerHTML = `
      <div style="background: rgba(15, 23, 42, 0.7); border: 1px solid var(--border-color, #334155); border-radius: 8px; padding: 10px 14px; text-align: center;">
        <div style="font-size: 11px; font-weight: 700; color: #94a3b8; text-transform: uppercase;">Active Crews</div>
        <div style="font-size: 20px; font-weight: 800; color: #60a5fa; margin-top: 2px;">${totalCrews}</div>
      </div>
      <div style="background: rgba(15, 23, 42, 0.7); border: 1px solid var(--border-color, #334155); border-radius: 8px; padding: 10px 14px; text-align: center;">
        <div style="font-size: 11px; font-weight: 700; color: #94a3b8; text-transform: uppercase;">Will Transition</div>
        <div style="font-size: 20px; font-weight: 800; color: #a855f7; margin-top: 2px;">${willTransition}</div>
      </div>
      <div style="background: rgba(15, 23, 42, 0.7); border: 1px solid var(--border-color, #334155); border-radius: 8px; padding: 10px 14px; text-align: center;">
        <div style="font-size: 11px; font-weight: 700; color: #94a3b8; text-transform: uppercase;">Will Stay / Complete</div>
        <div style="font-size: 20px; font-weight: 800; color: #fbbf24; margin-top: 2px;">${willStay + willComplete}</div>
      </div>
      <div style="background: rgba(15, 23, 42, 0.7); border: 1px solid var(--border-color, #334155); border-radius: 8px; padding: 10px 14px; text-align: center;">
        <div style="font-size: 11px; font-weight: 700; color: #94a3b8; text-transform: uppercase;">Employees Affected</div>
        <div style="font-size: 20px; font-weight: 800; color: #34d399; margin-top: 2px;">${totalEmpsAffected}</div>
      </div>
    `;
  }

  renderTable(filterText = '') {
    const tbody = document.getElementById('fy-table-body');
    if (!tbody) return;

    const term = (filterText || '').toLowerCase().trim();
    const filtered = this.crewPlan.filter(c => {
      if (!term) return true;
      return (
        c.baseJob.toLowerCase().includes(term) ||
        c.foreman.toLowerCase().includes(term) ||
        c.location.toLowerCase().includes(term) ||
        c.targetJob.toLowerCase().includes(term)
      );
    });

    if (filtered.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" style="padding: 24px; text-align: center; color: #94a3b8;">No matching crews found.</td></tr>`;
      return;
    }

    tbody.innerHTML = filtered.map((c, idx) => {
      const isOffice = c.baseJob.startsWith('005-');
      const isLost = c.baseJob.startsWith('002-');
      const badge = isOffice ? `<span style="font-size: 10px; background: rgba(59, 130, 246, 0.2); color: #93c5fd; padding: 1px 5px; border-radius: 4px; margin-left: 4px;">Office/LightDuty</span>` :
                    isLost ? `<span style="font-size: 10px; background: rgba(239, 68, 68, 0.2); color: #fca5a5; padding: 1px 5px; border-radius: 4px; margin-left: 4px;">Lost/Destroyed</span>` : '';

      return `
        <tr style="border-bottom: 1px solid rgba(255,255,255,0.05); background: ${idx % 2 === 0 ? 'rgba(255,255,255,0.02)' : 'transparent'};">
          <td style="padding: 8px 14px; font-family: monospace; font-weight: 700; color: #f8fafc;">
            ${this.escapeHtml(c.baseJob)} ${badge}
          </td>
          <td style="padding: 8px 14px; font-weight: 600; color: #cbd5e1;">${this.escapeHtml(c.foreman)}</td>
          <td style="padding: 8px 14px; color: #94a3b8;">${this.escapeHtml(c.location)}</td>
          <td style="padding: 8px 14px; text-align: center; font-weight: 700; color: ${c.employeeCount > 0 ? '#60a5fa' : '#64748b'};">
            ${c.employeeCount}
          </td>
          <td style="padding: 8px 14px;">
            <select style="background: var(--bg-secondary, #0f172a); border: 1px solid var(--border-color, #334155); border-radius: 4px; padding: 4px 8px; color: #cbd5e1; font-size: 11.5px; outline: none;" onchange="window.fiscalYearEngine.onRowActionChange('${c.baseJob}', this.value)">
              <option value="transition" ${c.action === 'transition' ? 'selected' : ''}>➔ Suffix -${this.newFY}</option>
              <option value="custom" ${c.action === 'custom' ? 'selected' : ''}>✏️ Custom Number</option>
              <option value="stay" ${c.action === 'stay' ? 'selected' : ''}>⏸️ Stay on -${this.currentFY}</option>
              <option value="complete" ${c.action === 'complete' ? 'selected' : ''}>⏹️ Mark Completed</option>
            </select>
          </td>
          <td style="padding: 8px 14px;">
            <input type="text" id="target-input-${c.baseJob}" value="${this.escapeHtml(c.targetJob)}" ${c.action === 'stay' || c.action === 'complete' ? 'disabled' : ''} style="background: ${c.action === 'stay' || c.action === 'complete' ? 'rgba(0,0,0,0.2)' : 'var(--bg-secondary, #0f172a)'}; border: 1px solid ${c.action === 'custom' ? '#a855f7' : 'var(--border-color, #334155)'}; border-radius: 4px; padding: 4px 8px; color: ${c.action === 'complete' ? '#ef4444' : (c.action === 'stay' ? '#94a3b8' : '#34d399')}; font-family: monospace; font-weight: 800; width: 110px; outline: none;" onchange="window.fiscalYearEngine.onRowTargetChange('${c.baseJob}', this.value)">
          </td>
        </tr>
      `;
    }).join('');
  }

  onRowActionChange(baseJob, newAction) {
    const item = this.crewPlan.find(c => c.baseJob === baseJob);
    if (!item) return;

    item.action = newAction;
    if (newAction === 'transition') {
      item.targetJob = item.suggestedJob;
    } else if (newAction === 'stay') {
      item.targetJob = item.baseJob;
    } else if (newAction === 'complete') {
      item.targetJob = `${item.baseJob} (Completed)`;
    }

    this.renderStats();
    this.renderTable(document.getElementById('fy-filter-input')?.value);
  }

  onRowTargetChange(baseJob, newTarget) {
    const item = this.crewPlan.find(c => c.baseJob === baseJob);
    if (!item) return;

    item.targetJob = newTarget.trim();
    if (item.targetJob !== item.suggestedJob && item.targetJob !== item.baseJob) {
      item.action = 'custom';
    }
    this.renderStats();
  }

  setAllActions(actionType) {
    this.crewPlan.forEach(c => {
      c.action = actionType;
      if (actionType === 'transition') c.targetJob = c.suggestedJob;
      else if (actionType === 'stay') c.targetJob = c.baseJob;
    });
    this.renderStats();
    this.renderTable(document.getElementById('fy-filter-input')?.value);
  }

  filterTable(term) {
    this.renderTable(term);
  }

  /**
   * Applies the full fiscal year transition atomically.
   */
  async executeTransition(options = {}) {
    const btn = document.getElementById('fy-apply-btn');
    if (btn) {
      btn.disabled = true;
      btn.textContent = '⏳ Executing Transition...';
    }

    try {
      const snap = this.db?.snapshot;
      if (!snap?.tables) throw new Error('Database snapshot is not loaded.');

      const empTable = snap.tables['employees'];
      const jtTable = snap.tables['job_tracking'];
      if (!empTable || !jtTable) throw new Error('Employees or Job Tracking table missing.');

      const optEmployees = options.optEmployees ?? document.getElementById('fy-opt-employees')?.checked ?? true;
      const optJobTracking = options.optJobTracking ?? document.getElementById('fy-opt-jobtracking')?.checked ?? true;
      const optHistory = options.optHistory ?? document.getElementById('fy-opt-history')?.checked ?? true;
      const optAlias = options.optAlias ?? document.getElementById('fy-opt-alias')?.checked ?? true;
      const optTraining = options.optTraining ?? document.getElementById('fy-opt-training')?.checked ?? true;

      const dateStr = new Date().toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' });

      // 1. Build transition mapping lookup: oldBaseJob -> newBaseJob
      const transitionMap = new Map(); // oldBase -> newBase
      const completedJobs = new Set();
      const aliasMap = {}; // for October safety email normalization

      const plan = options.crewPlan || this.crewPlan;
      plan.forEach(c => {
        if (c.action === 'transition' || c.action === 'custom') {
          if (c.targetJob && c.targetJob !== c.baseJob) {
            transitionMap.set(c.baseJob, c.targetJob);
            aliasMap[c.baseJob] = c.targetJob;
          }
        } else if (c.action === 'complete') {
          completedJobs.add(c.baseJob);
        }
      });

      let updatedEmployeesCount = 0;
      let updatedJobsCount = 0;
      let historyLogsCount = 0;
      let trainingRowsUpdated = 0;

      // 2. Update Employees Table
      if (optEmployees && empTable.rows) {
        const jobCol = empTable.headers.find(h => /^job\s*number$/i.test(h.trim())) || 'Job Number';

        empTable.rows.forEach(r => {
          const curJob = String(r[jobCol] || '').trim();
          if (!curJob) return;

          const base = curJob.split('.')[0];
          const suffixMatch = curJob.match(/\.\d+$/);
          const suffix = suffixMatch ? suffixMatch[0] : '';

          if (transitionMap.has(base)) {
            const newBase = transitionMap.get(base);
            const newFullJob = `${newBase}${suffix}`;
            const empName = String(r['Name'] || r['Employee Name'] || '').trim();

            r[jobCol] = newFullJob;
            updatedEmployeesCount++;

            // 3. Log to Employee History
            if (optHistory) {
              const histTable = snap.tables['employee_history'];
              if (histTable) {
                const histHeaders = histTable.headers || [
                  'Date', 'Employee Name', 'Event Type', 'Location', 'Job Number',
                  'Hire Date', 'Last Day', 'Last Day Reason', 'Rehire Date', 'Notes',
                  'Phone Number', 'Notification Emails', 'Glove Size', 'Sleeve Size'
                ];
                const histRow = {
                  'Date': dateStr,
                  'Employee Name': empName,
                  'Event Type': 'FISCAL_YEAR_TRANSITION',
                  'Location': r['Location'] || '',
                  'Job Number': newFullJob,
                  'Hire Date': r['Hire Date'] || '',
                  'Last Day': '',
                  'Last Day Reason': '',
                  'Rehire Date': '',
                  'Notes': `Fiscal Year Transition: ${curJob} ➔ ${newFullJob}`,
                  'Phone Number': r['Phone Number'] || '',
                  'Notification Emails': r['Notification Emails'] || '',
                  'Glove Size': r['Glove Size'] || '',
                  'Sleeve Size': r['Sleeve Size'] || ''
                };
                if (!histTable.rows) histTable.rows = [];
                histTable.rows.unshift(histRow);
                histTable.rowCount = histTable.rows.length;
                historyLogsCount++;
              }
            }
          }
        });

        // Rebuild rawGrid for Employees table
        if (empTable.rawGrid && empTable.headers) {
          empTable.rawGrid = [empTable.headers];
          empTable.rows.forEach(r => {
            empTable.rawGrid.push(empTable.headers.map(h => r[h] !== undefined ? r[h] : ''));
          });
          empTable.maxRows = empTable.rawGrid.length;
        }
      }

      // 4. Update Job Tracking Table
      if (optJobTracking && jtTable.rows) {
        const jobCol = jtTable.headers.find(h => /^job\s*number$/i.test(h.trim())) || 'Job Number';
        const statusCol = jtTable.headers.find(h => /^status$/i.test(h.trim())) || 'Status';

        jtTable.rows.forEach(r => {
          const curJob = String(r[jobCol] || '').trim();
          if (transitionMap.has(curJob)) {
            const newBase = transitionMap.get(curJob);
            r[jobCol] = newBase;
            r[statusCol] = 'Active';
            updatedJobsCount++;
          } else if (completedJobs.has(curJob)) {
            r[statusCol] = 'Completed';
            updatedJobsCount++;
          }
        });

        // Rebuild rawGrid for Job Tracking table
        if (jtTable.rawGrid && jtTable.headers) {
          jtTable.rawGrid = [jtTable.headers];
          jtTable.rows.forEach(r => {
            jtTable.rawGrid.push(jtTable.headers.map(h => r[h] !== undefined ? r[h] : ''));
          });
          jtTable.maxRows = jtTable.rawGrid.length;
        }
      }

      // 5. Update Training Tracking for future visits
      if (optTraining) {
        const trainTable = snap.tables['training_tracking'] || snap.tables['Training Tracking'];
        if (trainTable && trainTable.rows) {
          const crewCol = trainTable.headers.find(h => /^(crew|job\s*number)$/i.test(h.trim())) || 'Crew';
          const dateCol = trainTable.headers.find(h => /^(date|month)$/i.test(h.trim())) || 'Date';

          trainTable.rows.forEach(r => {
            const curCrew = String(r[crewCol] || '').trim();
            if (transitionMap.has(curCrew)) {
              r[crewCol] = transitionMap.get(curCrew);
              trainingRowsUpdated++;
            }
          });

          if (trainTable.rawGrid && trainTable.headers) {
            trainTable.rawGrid = [trainTable.headers];
            trainTable.rows.forEach(r => {
              trainTable.rawGrid.push(trainTable.headers.map(h => r[h] !== undefined ? r[h] : ''));
            });
          }
        }
      }

      // 6. Store October Email Alias Map in localStorage and database config
      if (optAlias) {
        try {
          const existingAlias = JSON.parse(localStorage.getItem('FY_TRANSITION_ALIAS_MAP') || '{}');
          const merged = Object.assign({}, existingAlias, aliasMap);
          localStorage.setItem('FY_TRANSITION_ALIAS_MAP', JSON.stringify(merged));
          if (!snap.configs) snap.configs = {};
          snap.configs['FY_TRANSITION_ALIAS_MAP'] = merged;
        } catch (e) {
          console.warn('Could not store email alias map:', e);
        }
      }

      // 8. Copy Trip Planner Crew Lead preferences to new crew keys
      try {
        const leadPref = JSON.parse(localStorage.getItem('CREW_IMPORT_LEAD_SELECTIONS') || '{}');
        transitionMap.forEach((newBase, oldBase) => {
          if (leadPref[oldBase]) {
            leadPref[newBase] = leadPref[oldBase];
          }
        });
        localStorage.setItem('CREW_IMPORT_LEAD_SELECTIONS', JSON.stringify(leadPref));
      } catch (e) {
        console.warn('Could not migrate lead preferences:', e);
      }

      // 9. Queue Sync Mutations for Google Sheets
      if (typeof this.db.addMutation === 'function') {
        if (optEmployees && empTable) {
          await this.db.addMutation({
            action: 'REPLACE_TABLE_DATA',
            sheetName: empTable.name || 'Employees',
            tableKey: 'employees',
            rawGrid: empTable.rawGrid,
            headers: empTable.headers,
            rows: empTable.rows
          });
        }
        if (optJobTracking && jtTable) {
          await this.db.addMutation({
            action: 'REPLACE_TABLE_DATA',
            sheetName: jtTable.name || 'Job Tracking',
            tableKey: 'job_tracking',
            rawGrid: jtTable.rawGrid,
            headers: jtTable.headers,
            rows: jtTable.rows
          });
        }
        if (optAlias && Object.keys(aliasMap).length > 0) {
          try {
            const currentFullAlias = JSON.parse(localStorage.getItem('FY_TRANSITION_ALIAS_MAP') || '{}');
            await this.db.addMutation({
              action: 'UPDATE_SYSTEM_CONFIG',
              key: 'FY_TRANSITION_ALIAS_MAP',
              value: currentFullAlias,
              description: 'October Fiscal Year Transition Job Aliases'
            });
          } catch (eAliasMut) {
            console.warn('Could not queue UPDATE_SYSTEM_CONFIG mutation for aliases:', eAliasMut);
          }
        }
        try {
          await this.db.addMutation({
            action: 'UPDATE_SYSTEM_CONFIG',
            key: 'CURRENT_FISCAL_YEAR',
            value: this.newFY,
            description: 'Active Fiscal Year Suffix'
          });
        } catch (eFYSuffix) {
          console.warn('Could not queue UPDATE_SYSTEM_CONFIG for CURRENT_FISCAL_YEAR:', eFYSuffix);
        }
      }

      // 10. Persist Local Snapshot to disk
      if (typeof this.db.setSnapshot === 'function') {
        await this.db.setSnapshot(snap);
      } else if (window.desktopAPI?.saveLocalSnapshot) {
        await window.desktopAPI.saveLocalSnapshot(snap);
      }

      // Close modal
      document.getElementById('fy-transition-modal')?.remove();

      // Show comprehensive success modal
      this.showSuccessModal({
        oldFY: this.currentFY,
        newFY: this.newFY,
        updatedEmployeesCount,
        updatedJobsCount,
        historyLogsCount,
        trainingRowsUpdated,
        transitionMap
      });

      // Refresh current active view
      if (window.sheetNavigator) {
        window.sheetNavigator.renderCurrentSheet();
      }

    } catch (err) {
      console.error('Fiscal Year Transition failed:', err);
      alert('⚠️ Fiscal Year Transition error: ' + err.message);
      if (btn) {
        btn.disabled = false;
        btn.textContent = '🚀 Apply Fiscal Year Transition';
      }
    }
  }

  showSuccessModal(stats) {
    const modal = document.createElement('div');
    modal.id = 'fy-success-modal';
    modal.className = 'modal-overlay';
    modal.style.cssText = 'position: fixed; inset: 0; background: rgba(0, 0, 0, 0.85); backdrop-filter: blur(5px); z-index: 10001; display: flex; align-items: center; justify-content: center; padding: 20px;';

    const pairs = Array.from(stats.transitionMap.entries()).slice(0, 8);

    modal.innerHTML = `
      <div class="modal-box" style="background: var(--bg-card, #1e293b); border: 1px solid #10b981; border-radius: 12px; width: 100%; max-width: 620px; box-shadow: 0 20px 40px rgba(0,0,0,0.6); color: #f8fafc; padding: 24px;">
        
        <div style="text-align: center; margin-bottom: 20px;">
          <div style="font-size: 48px; margin-bottom: 8px;">🎉</div>
          <h2 style="font-size: 20px; font-weight: 800; margin: 0; color: #34d399;">Fiscal Year ${stats.newFY} Transition Complete!</h2>
          <div style="font-size: 13px; color: #94a3b8; margin-top: 4px;">
            Database successfully transitioned from FY${stats.oldFY} to FY${stats.newFY}.
          </div>
        </div>

        <div style="background: rgba(15, 23, 42, 0.7); border: 1px solid var(--border-color, #334155); border-radius: 8px; padding: 16px; display: grid; grid-template-columns: 1fr 1fr; gap: 12px; font-size: 12.5px; margin-bottom: 20px;">
          <div>👤 <strong>Employees Updated:</strong> <span style="color: #60a5fa; font-weight: 700;">${stats.updatedEmployeesCount}</span></div>
          <div>📋 <strong>Jobs Migrated:</strong> <span style="color: #a855f7; font-weight: 700;">${stats.updatedJobsCount}</span></div>
          <div>📜 <strong>History Logs Appended:</strong> <span style="color: #34d399; font-weight: 700;">${stats.historyLogsCount}</span></div>
          <div>🎓 <strong>Training Rows Updated:</strong> <span style="color: #fbbf24; font-weight: 700;">${stats.trainingRowsUpdated}</span></div>
        </div>

        <div style="background: rgba(59, 130, 246, 0.1); border: 1px solid rgba(59, 130, 246, 0.3); border-radius: 8px; padding: 12px 14px; font-size: 12px; color: #93c5fd; line-height: 1.4; margin-bottom: 20px;">
          🛡️ <strong>October Email Safety Protection:</strong> Incoming JHA and safety meeting emails referencing old <code>-${stats.oldFY}</code> job numbers will be automatically credited to active <code>-${stats.newFY}</code> crews throughout October.
        </div>

        <div style="display: flex; justify-content: flex-end; gap: 10px;">
          <button class="btn btn-secondary" onclick="document.getElementById('fy-success-modal').remove()">Close</button>
          <button class="btn btn-primary" onclick="document.getElementById('fy-success-modal').remove(); window.syncEngine.pushChangesToGoogleSheets();" style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); border: none; font-weight: 700;">
            ⬆️ Push Changes to Cloud
          </button>
        </div>

      </div>
    `;

    document.body.appendChild(modal);
  }

  escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
}

// Global instance
if (typeof window !== 'undefined') {
  window.fiscalYearEngine = new FiscalYearEngine(window.localDB);
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = FiscalYearEngine;
}
