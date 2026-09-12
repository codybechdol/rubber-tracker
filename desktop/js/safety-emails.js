/**
 * Safety Assistant Desktop - Safety Email Processing Engine
 * Handles Gmail scanning for JHAs, Weekly Safety Meetings, and Monthly Checklists directly from the Desktop App.
 */

class SafetyEmailsEngine {
  constructor(db) {
    this.db = db;
    this.isProcessing = false;
    this.isMinimized = false;
    this.cancelRequested = false;
    this.bgDismissTimer = null;
    this.activeCategoryFilter = 'all';
    this.selectedMonthFilter = 'all';
    this.activeSortOption = 'date_desc';
    this.searchQuery = '';
    this.pdfCache = new Map();
  }

  init() {
    console.log('SafetyEmailsEngine initialized');
  }

  parseDate(val) {
    if (!val || val === 'N/A' || val === '—') return null;
    if (val instanceof Date) return isNaN(val.getTime()) ? null : val;
    const s = String(val).trim();
    if (s.includes('/')) {
      const parts = s.split(' ')[0].split('/');
      if (parts.length === 3) {
        const m = parseInt(parts[0], 10) - 1;
        const d = parseInt(parts[1], 10);
        let y = parseInt(parts[2], 10);
        if (y < 100) y += 2000;
        const dt = new Date(y, m, d, 12, 0, 0);
        return isNaN(dt.getTime()) ? null : dt;
      }
    }
    if (s.includes('-')) {
      const parts = s.split(' ')[0].split('-');
      if (parts.length === 3) {
        const y = parseInt(parts[0], 10);
        const m = parseInt(parts[1], 10) - 1;
        const d = parseInt(parts[2], 10);
        const dt = new Date(y, m, d, 12, 0, 0);
        return isNaN(dt.getTime()) ? null : dt;
      }
    }
    const dt = new Date(s);
    return isNaN(dt.getTime()) ? null : dt;
  }

  getAvailableMonths() {
    const monthMap = new Map();
    (this.currentLogs || []).forEach(log => {
      const dStr = log.date || log.dateReceived;
      const d = this.parseDate(dStr);
      if (d) {
        const yyyy = d.getFullYear();
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const key = `${yyyy}-${mm}`;
        if (!monthMap.has(key)) {
          const monthName = d.toLocaleString('en-US', { month: 'long', year: 'numeric' });
          monthMap.set(key, { key: key, label: monthName });
        }
      }
    });

    const months = Array.from(monthMap.values());
    months.sort((a, b) => b.key.localeCompare(a.key)); // Newest month first
    return months;
  }

  sortLogs(logs, sortOption) {
    const parseLogDate = (log) => {
      const dStr = log.date || log.dateReceived;
      if (!dStr) return 0;
      const d = this.parseDate(dStr);
      return d ? d.getTime() : 0;
    };

    const parseReceivedDate = (log) => {
      const dStr = log.dateReceived || log.date;
      if (!dStr) return 0;
      const d = this.parseDate(dStr);
      return d ? d.getTime() : 0;
    };

    const getMonthKey = (log) => {
      const dStr = log.date || log.dateReceived;
      const d = this.parseDate(dStr);
      if (!d) return '9999-99';
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      return `${yyyy}-${mm}`;
    };

    const getJobKey = (log) => {
      const j = String(log.jobNumber || '').trim().toLowerCase();
      const f = String(log.foreman || '').trim().toLowerCase();
      return `${j}|${f}`;
    };

    return [...logs].sort((a, b) => {
      if (sortOption === 'job_foreman') {
        const jA = getJobKey(a);
        const jB = getJobKey(b);
        if (jA !== jB) return jA.localeCompare(jB);
        return parseLogDate(b) - parseLogDate(a);
      }

      if (sortOption === 'month_job_foreman') {
        const mA = getMonthKey(a);
        const mB = getMonthKey(b);
        if (mA !== mB) return mB.localeCompare(mA);
        const jA = getJobKey(a);
        const jB = getJobKey(b);
        if (jA !== jB) return jA.localeCompare(jB);
        return parseLogDate(b) - parseLogDate(a);
      }

      if (sortOption === 'month_asc') {
        const mA = getMonthKey(a);
        const mB = getMonthKey(b);
        if (mA !== mB) return mA.localeCompare(mB);
        return parseLogDate(a) - parseLogDate(b);
      }

      if (sortOption === 'month_desc') {
        const mA = getMonthKey(a);
        const mB = getMonthKey(b);
        if (mA !== mB) return mB.localeCompare(mA);
        return parseLogDate(b) - parseLogDate(a);
      }

      if (sortOption === 'date_asc') {
        return parseLogDate(a) - parseLogDate(b);
      }

      if (sortOption === 'received_desc') {
        return parseReceivedDate(b) - parseReceivedDate(a);
      }

      // Default: date_desc
      return parseLogDate(b) - parseLogDate(a);
    });
  }

  /**
   * Renders the interactive completion view with clickable category cards, sorting options, and live drill-down log table.
   */
  renderCompletionModalContent(container, stats) {
    const availableMonths = this.getAvailableMonths();

    const warningBanner = stats.complianceError ? `
      <div style="background: rgba(245, 158, 11, 0.15); border: 1px solid rgba(245, 158, 11, 0.4); border-radius: 8px; padding: 10px 14px; color: #fcd34d; font-size: 12px; line-height: 1.4;">
        <strong>⚠️ Compliance Calculation Notice:</strong> Emails were logged, but matrix recalculation reported:
        <div style="font-family: monospace; font-size: 11px; margin-top: 4px; color: #fef08a;">${this.escapeHtml(stats.complianceError)}</div>
        You can use the <strong>🔄 Recalculate</strong> button on the toolbar to re-run compliance calculation.
      </div>
    ` : '';

    container.innerHTML = `
      <div style="display: flex; flex-direction: column; gap: 14px;">
        ${warningBanner}
        <div style="background: linear-gradient(135deg, rgba(16, 185, 129, 0.15) 0%, rgba(5, 150, 105, 0.05) 100%); border: 1px solid rgba(16, 185, 129, 0.4); border-radius: 8px; padding: 12px 18px; text-align: center;">
          <div style="font-size: 24px; margin-bottom: 4px;">✅</div>
          <h3 style="color: #6ee7b7; font-size: 15px; font-weight: 800; margin-bottom: 2px;">Safety Emails & Complete Audit Log</h3>
          <p style="color: var(--text-secondary); font-size: 12px; margin: 0;">
            Inspect original email PDFs, filter by month, sort by crew, or correct typos directly in the log.
          </p>
        </div>

        <!-- Interactive Summary Breakdown Cards -->
        <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px;">
          ${(() => {
            const logs = this.currentLogs || [];
            const totalInDb = logs.length;
            const jhaInDb = logs.filter(l => l.type === 'JHA' || l.sheetName === 'JHA Log').length;
            const weeklyInDb = logs.filter(l => l.type === 'Weekly Safety Meeting' || l.sheetName === 'Weekly Safety Log').length;
            const monthlyInDb = logs.filter(l => l.type === 'Monthly Checklist' || l.sheetName === 'Monthly Checklist Log').length;
            const issuesInDb = logs.filter(l => l.hasEquipmentIssues === 'Yes' || l.type === 'Equipment').length;

            const newJha = (stats.cumulativeLogs && stats.cumulativeLogs.jha) || 0;
            const newWeekly = (stats.cumulativeLogs && stats.cumulativeLogs.weekly) || 0;
            const newMonthly = (stats.cumulativeLogs && stats.cumulativeLogs.monthly) || 0;
            const totalNew = (stats.totalLogs !== undefined && stats.totalLogs > 0) ? stats.totalLogs : (newJha + newWeekly + newMonthly);

            const allDisplay = totalInDb > 0 ? totalInDb : (stats.totalLogs || 0);
            const jhaDisplay = jhaInDb > 0 ? jhaInDb : newJha;
            const weeklyDisplay = weeklyInDb > 0 ? weeklyInDb : newWeekly;
            const monthlyDisplay = monthlyInDb > 0 ? monthlyInDb : newMonthly;
            const issuesDisplay = issuesInDb > 0 ? issuesInDb : (stats.totalIssues || 0);

            return `
              <div class="stat-card-clickable ${this.activeCategoryFilter === 'all' ? 'active' : ''}" onclick="window.safetyComplianceEngine.setCategoryFilter('all')" style="background: var(--bg-primary); border: 1px solid var(--border-color); border-radius: 6px; padding: 10px 14px;">
                <span class="view-hint">🔍 View</span>
                <div style="font-size: 10.5px; color: var(--text-muted); text-transform: uppercase; font-weight: 600;">✨ All Logs</div>
                <div style="font-size: 18px; font-weight: 800; color: #34d399; margin-top: 2px;">${allDisplay}</div>
                <div style="font-size: 10px; color: ${totalNew > 0 ? '#6ee7b7' : '#94a3b8'}; margin-top: 2px; font-weight: ${totalNew > 0 ? '700' : '500'};">${totalNew > 0 ? `+${totalNew} new` : 'All up to date'}</div>
              </div>
              <div class="stat-card-clickable ${this.activeCategoryFilter === 'jha' ? 'active' : ''}" onclick="window.safetyComplianceEngine.setCategoryFilter('jha')" style="background: var(--bg-primary); border: 1px solid var(--border-color); border-radius: 6px; padding: 10px 14px;">
                <span class="view-hint">🔍 View</span>
                <div style="font-size: 10.5px; color: var(--text-muted); text-transform: uppercase; font-weight: 600;">📋 Daily JHAs</div>
                <div style="font-size: 18px; font-weight: 700; color: #60a5fa; margin-top: 2px;">${jhaDisplay}</div>
                <div style="font-size: 10px; color: ${newJha > 0 ? '#60a5fa' : '#94a3b8'}; margin-top: 2px; font-weight: ${newJha > 0 ? '700' : '500'};">${newJha > 0 ? `+${newJha} new` : 'Up to date'}</div>
              </div>
              <div class="stat-card-clickable ${this.activeCategoryFilter === 'weekly' ? 'active' : ''}" onclick="window.safetyComplianceEngine.setCategoryFilter('weekly')" style="background: var(--bg-primary); border: 1px solid var(--border-color); border-radius: 6px; padding: 10px 14px;">
                <span class="view-hint">🔍 View</span>
                <div style="font-size: 10.5px; color: var(--text-muted); text-transform: uppercase; font-weight: 600;">🗣️ Weekly Meetings</div>
                <div style="font-size: 18px; font-weight: 700; color: #a78bfa; margin-top: 2px;">${weeklyDisplay}</div>
                <div style="font-size: 10px; color: ${newWeekly > 0 ? '#a78bfa' : '#94a3b8'}; margin-top: 2px; font-weight: ${newWeekly > 0 ? '700' : '500'};">${newWeekly > 0 ? `+${newWeekly} new` : 'Up to date'}</div>
              </div>
              <div class="stat-card-clickable ${this.activeCategoryFilter === 'monthly' ? 'active' : ''}" onclick="window.safetyComplianceEngine.setCategoryFilter('monthly')" style="background: var(--bg-primary); border: 1px solid var(--border-color); border-radius: 6px; padding: 10px 14px;">
                <span class="view-hint">🔍 View</span>
                <div style="font-size: 10.5px; color: var(--text-muted); text-transform: uppercase; font-weight: 600;">🚛 Monthly Checklists</div>
                <div style="font-size: 18px; font-weight: 700; color: #34d399; margin-top: 2px;">${monthlyDisplay}</div>
                <div style="font-size: 10px; color: ${newMonthly > 0 ? '#34d399' : '#94a3b8'}; margin-top: 2px; font-weight: ${newMonthly > 0 ? '700' : '500'};">${newMonthly > 0 ? `+${newMonthly} new` : 'Up to date'}</div>
              </div>
              <div class="stat-card-clickable ${this.activeCategoryFilter === 'equipment' ? 'active' : ''}" onclick="window.safetyComplianceEngine.setCategoryFilter('equipment')" style="background: var(--bg-primary); border: 1px solid var(--border-color); border-radius: 6px; padding: 10px 14px;">
                <span class="view-hint">🔍 View</span>
                <div style="font-size: 10.5px; color: var(--text-muted); text-transform: uppercase; font-weight: 600;">⚠️ Equipment Needs</div>
                <div style="font-size: 18px; font-weight: 700; color: #f59e0b; margin-top: 2px;">${issuesDisplay}</div>
                <div style="font-size: 10px; color: ${(stats.totalIssues || 0) > 0 ? '#f59e0b' : '#94a3b8'}; margin-top: 2px;">${(stats.totalIssues || 0) > 0 ? `${stats.totalIssues} new` : 'None detected'}</div>
              </div>
              <div class="stat-card-clickable" onclick="window.safetyComplianceEngine.setCategoryFilter('all')" style="background: var(--bg-primary); border: 1px solid var(--border-color); border-radius: 6px; padding: 10px 14px;">
                <div style="font-size: 10.5px; color: var(--text-muted); text-transform: uppercase; font-weight: 600;">📬 Total Emails</div>
                <div style="font-size: 18px; font-weight: 800; color: #f8fafc; margin-top: 2px;">${stats.totalThreads || allDisplay}</div>
                <div style="font-size: 10px; color: #94a3b8; margin-top: 2px;">Scanned in Gmail</div>
              </div>
            `;
          })()}
        </div>

        <!-- Filter bar, Month selector & Sort Controls -->
        <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-wrap: wrap; margin-top: 2px;">
          <input type="text" id="safety-log-search" placeholder="🔍 Search foreman, job #, date..." value="${this.escapeHtml(this.searchQuery)}" oninput="window.safetyComplianceEngine.onSearchInput(this.value)" style="flex: 1; min-width: 180px; background: var(--bg-primary); border: 1px solid var(--border-color); border-radius: 6px; padding: 6px 12px; color: var(--text-primary); font-size: 12px;" />
          
          <!-- Month Filter Selector -->
          <div style="display: flex; align-items: center; gap: 6px;">
            <span style="font-size: 11px; color: var(--text-muted); font-weight: 600;">Month:</span>
            <select id="safety-log-month-filter" onchange="window.safetyComplianceEngine.setMonthFilter(this.value)" style="background: var(--bg-primary); border: 1px solid var(--border-color); border-radius: 6px; padding: 6px 10px; color: #60a5fa; font-size: 12px; font-weight: 600;">
              <option value="all" ${this.selectedMonthFilter === 'all' ? 'selected' : ''}>🗓️ All Months (Full Year)</option>
              ${availableMonths.map(m => `
                <option value="${m.key}" ${this.selectedMonthFilter === m.key ? 'selected' : ''}>${m.label}</option>
              `).join('')}
            </select>
          </div>

          <!-- Sort Order Selector -->
          <div style="display: flex; align-items: center; gap: 6px;">
            <span style="font-size: 11px; color: var(--text-muted); font-weight: 600;">Sort By:</span>
            <select id="safety-log-sort-filter" onchange="window.safetyComplianceEngine.setSortOption(this.value)" style="background: var(--bg-primary); border: 1px solid var(--border-color); border-radius: 6px; padding: 6px 10px; color: #34d399; font-size: 12px; font-weight: 600;">
              <option value="date_desc" ${this.activeSortOption === 'date_desc' ? 'selected' : ''}>📅 Date (Newest First)</option>
              <option value="date_asc" ${this.activeSortOption === 'date_asc' ? 'selected' : ''}>📅 Date (Oldest First)</option>
              <option value="month_desc" ${this.activeSortOption === 'month_desc' ? 'selected' : ''}>🗓️ Month (Newest to Oldest)</option>
              <option value="month_asc" ${this.activeSortOption === 'month_asc' ? 'selected' : ''}>🗓️ Month (Oldest to Newest)</option>
              <option value="job_foreman" ${this.activeSortOption === 'job_foreman' ? 'selected' : ''}>👷 Job # / Foreman</option>
              <option value="month_job_foreman" ${this.activeSortOption === 'month_job_foreman' ? 'selected' : ''}>🗓️👷 Month, then Job # / Foreman</option>
              <option value="received_desc" ${this.activeSortOption === 'received_desc' ? 'selected' : ''}>📥 Date Received (Newest)</option>
            </select>
          </div>

          <span id="log-count-indicator" style="font-size: 11.5px; color: var(--text-muted); font-weight: 600;"></span>
        </div>

        <!-- Drill-down log items list -->
        <div class="safety-logs-container" id="safety-logs-table-container">
          ${this.renderLogsTableHtml()}
        </div>
      </div>
    `;
    this.updateLogCountIndicator();
  }

  setCategoryFilter(category) {
    this.activeCategoryFilter = category;
    const body = document.getElementById('process-safety-emails-modal-body');
    if (body) {
      const cards = body.querySelectorAll('.stat-card-clickable');
      cards.forEach(card => card.classList.remove('active'));
      const container = document.getElementById('safety-logs-table-container');
      if (container) {
        container.innerHTML = this.renderLogsTableHtml();
        this.updateLogCountIndicator();
      }
    }
  }

  setMonthFilter(monthKey) {
    this.selectedMonthFilter = monthKey || 'all';
    const container = document.getElementById('safety-logs-table-container');
    if (container) {
      container.innerHTML = this.renderLogsTableHtml();
      this.updateLogCountIndicator();
    }
  }

  setSortOption(sortKey) {
    this.activeSortOption = sortKey || 'date_desc';
    const container = document.getElementById('safety-logs-table-container');
    if (container) {
      container.innerHTML = this.renderLogsTableHtml();
      this.updateLogCountIndicator();
    }
  }

  onSearchInput(val) {
    this.searchQuery = val || '';
    const container = document.getElementById('safety-logs-table-container');
    if (container) {
      container.innerHTML = this.renderLogsTableHtml();
      this.updateLogCountIndicator();
    }
  }

  updateLogCountIndicator() {
    const ind = document.getElementById('log-count-indicator');
    if (ind) {
      const filtered = this.getFilteredLogs();
      ind.textContent = `Showing ${filtered.length} item(s)`;
    }
  }

  getFilteredLogs() {
    let logs = this.currentLogs || [];

    // Category filter
    if (this.activeCategoryFilter === 'jha') {
      logs = logs.filter(l => l.type === 'JHA' || l.sheetName === 'JHA Log');
    } else if (this.activeCategoryFilter === 'weekly') {
      logs = logs.filter(l => l.type === 'Weekly Safety Meeting' || l.sheetName === 'Weekly Safety Log');
    } else if (this.activeCategoryFilter === 'monthly') {
      logs = logs.filter(l => l.type === 'Monthly Checklist' || l.sheetName === 'Monthly Checklist Log');
    } else if (this.activeCategoryFilter === 'equipment') {
      logs = logs.filter(l => l.hasEquipmentIssues === 'Yes' || l.type === 'Equipment');
    }

    // Month filter
    if (this.selectedMonthFilter && this.selectedMonthFilter !== 'all') {
      logs = logs.filter(l => {
        const dStr = l.date || l.dateReceived;
        const d = this.parseDate(dStr);
        if (!d) return false;
        const yyyy = d.getFullYear();
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        return `${yyyy}-${mm}` === this.selectedMonthFilter;
      });
    }

    // Search query filter
    if (this.searchQuery && this.searchQuery.trim()) {
      const q = this.searchQuery.toLowerCase().trim();
      logs = logs.filter(l => {
        return (l.foreman && l.foreman.toLowerCase().includes(q)) ||
               (l.jobNumber && l.jobNumber.toLowerCase().includes(q)) ||
               (l.creditedTo && l.creditedTo.toLowerCase().includes(q)) ||
               (l.date && l.date.toLowerCase().includes(q)) ||
               (l.dateReceived && l.dateReceived.toLowerCase().includes(q)) ||
               (l.subject && l.subject.toLowerCase().includes(q)) ||
               (l.notes && l.notes.toLowerCase().includes(q));
      });
    }

    // Apply active sort
    return this.sortLogs(logs, this.activeSortOption || 'date_desc');
  }

  renderLogsTableHtml() {
    const logs = this.getFilteredLogs();
    if (!logs || logs.length === 0) {
      return `
        <div style="padding: 32px 16px; text-align: center; color: var(--text-muted); font-size: 12.5px;">
          No log entries match the selected filter.
        </div>
      `;
    }

    return `
      <table class="safety-log-table">
        <thead>
          <tr>
            <th style="width: 105px;">Type</th>
            <th style="width: 85px;">Report Date</th>
            <th style="width: 110px;">Date Received</th>
            <th style="width: 75px;">Job #</th>
            <th>Foreman</th>
            <th style="width: 80px;">Credited</th>
            <th style="width: 75px;">Status</th>
            <th style="width: 160px; text-align: center;">Actions</th>
          </tr>
        </thead>
        <tbody>
          ${logs.map((log, index) => {
            const typeClass = log.type === 'JHA' ? 'jha' : (log.type === 'Weekly Safety Meeting' ? 'weekly' : (log.type === 'Monthly Checklist' ? 'monthly' : 'equipment'));
            const typeLabel = log.type === 'JHA' ? '📋 JHA' : (log.type === 'Weekly Safety Meeting' ? '🗣️ Meeting' : (log.type === 'Monthly Checklist' ? '🚛 Checklist' : '⚠️ Issue'));
            const statusColor = log.status === 'Credited' ? '#34d399' : (log.status === 'Unknown Job' ? '#f59e0b' : '#94a3b8');

            return `
              <tr>
                <td>
                  <span class="badge-log-type ${typeClass}">${typeLabel}</span>
                </td>
                <td style="font-weight: 600; color: #f8fafc;">${this.escapeHtml(log.date || '—')}</td>
                <td style="font-size: 11.5px; color: #94a3b8; font-family: monospace;">${this.escapeHtml(log.dateReceived || '—')}</td>
                <td><span style="font-family: monospace; font-weight: 700; color: #60a5fa;">${this.escapeHtml(log.jobNumber || '—')}</span></td>
                <td style="font-weight: 600;">${this.escapeHtml(log.foreman || 'UNKNOWN')}</td>
                <td><span style="font-family: monospace; color: #cbd5e1;">${this.escapeHtml(log.creditedTo || '—')}</span></td>
                <td>
                  <span style="color: ${statusColor}; font-weight: 700; font-size: 11px;">
                    ${this.escapeHtml(log.status || 'Logged')}
                  </span>
                </td>
                <td style="text-align: center;">
                  <div style="display: inline-flex; align-items: center; gap: 6px;">
                    <button class="btn-pdf-link" onclick="window.safetyComplianceEngine.openPdfViewer('${this.escapeHtml(log.id || (log.sheetName + '_' + log.rowIndex))}')" title="Preview original attached PDF document directly in the app">
                      📄 View PDF
                    </button>
                    <button class="btn-edit-log-row" onclick="window.safetyComplianceEngine.openEditLogModal('${this.escapeHtml(log.id || (log.sheetName + '_' + log.rowIndex))}')" title="Edit log info (fix typos)">
                      ✏️ Edit
                    </button>
                  </div>
                </td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    `;
  }

  openProcessEmailsModal() {
    const modal = document.getElementById('process-safety-emails-modal');
    const modalBox = document.getElementById('process-safety-emails-modal-box');
    const titleEl = document.getElementById('process-safety-emails-modal-title');
    const iconEl = document.getElementById('process-safety-emails-modal-icon');
    const body = document.getElementById('process-safety-emails-modal-body');
    const footer = document.getElementById('process-safety-emails-modal-footer');
    if (!modal || !body) return;

    if (modalBox) modalBox.style.maxWidth = '740px';
    if (titleEl) titleEl.textContent = 'Process Safety Emails (Gmail Scanner)';
    if (iconEl) iconEl.textContent = '📬';

    const complianceTable = this.db.getTable('safety_compliance');
    const jhaTable = this.db.getTable('jha_log');
    const weeklyTable = this.db.getTable('weekly_safety_log');
    const monthlyTable = this.db.getTable('monthly_checklist_log');

    const totalJhaCount = jhaTable && jhaTable.rows ? jhaTable.rows.length : 0;
    const totalWeeklyCount = weeklyTable && weeklyTable.rows ? weeklyTable.rows.length : 0;
    const totalMonthlyCount = monthlyTable && monthlyTable.rows ? monthlyTable.rows.length : 0;

    body.innerHTML = `
      <div style="display: flex; flex-direction: column; gap: 16px;">
        <!-- Overview Banner -->
        <div style="background: linear-gradient(135deg, rgba(16, 185, 129, 0.12) 0%, rgba(5, 150, 105, 0.05) 100%); border: 1px solid rgba(16, 185, 129, 0.3); border-radius: 8px; padding: 14px 18px;">
          <div style="font-size: 13.5px; font-weight: 700; color: #6ee7b7; margin-bottom: 4px; display: flex; align-items: center; gap: 8px;">
            <span>📬</span> Automated Safety Documentation Scanner
          </div>
          <div style="font-size: 12px; color: var(--text-secondary); line-height: 1.5;">
            Scans your safety mailbox for incoming foreman emails, parses PDF attachments, updates the <strong>JHA Log</strong>, <strong>Weekly Safety Log</strong>, and <strong>Monthly Checklist Log</strong>, and recalculates the <strong>Safety Compliance</strong> matrix.
          </div>
        </div>

        <!-- Current Database Statistics -->
        <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px;">
          <div style="background: var(--bg-primary); border: 1px solid var(--border-color); border-radius: 6px; padding: 10px 14px; text-align: center;">
            <div style="font-size: 11px; color: var(--text-muted); text-transform: uppercase; font-weight: 600;">📋 Logged JHAs</div>
            <div style="font-size: 18px; font-weight: 800; color: #60a5fa; margin-top: 2px;">${totalJhaCount}</div>
          </div>
          <div style="background: var(--bg-primary); border: 1px solid var(--border-color); border-radius: 6px; padding: 10px 14px; text-align: center;">
            <div style="font-size: 11px; color: var(--text-muted); text-transform: uppercase; font-weight: 600;">🗣️ Weekly Meetings</div>
            <div style="font-size: 18px; font-weight: 800; color: #a78bfa; margin-top: 2px;">${totalWeeklyCount}</div>
          </div>
          <div style="background: var(--bg-primary); border: 1px solid var(--border-color); border-radius: 6px; padding: 10px 14px; text-align: center;">
            <div style="font-size: 11px; color: var(--text-muted); text-transform: uppercase; font-weight: 600;">🚛 Monthly Checks</div>
            <div style="font-size: 18px; font-weight: 800; color: #34d399; margin-top: 2px;">${totalMonthlyCount}</div>
          </div>
        </div>

        <!-- Step 1: Select Report Type -->
        <div style="background: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: 8px; padding: 14px 16px;">
          <label style="font-size: 12px; font-weight: 700; color: #f8fafc; display: block; margin-bottom: 8px;">
            1. Report Types to Process
          </label>
          <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px;">
            <label style="display: flex; align-items: center; gap: 8px; font-size: 12.5px; color: var(--text-primary); cursor: pointer; background: var(--bg-primary); padding: 8px 12px; border-radius: 6px; border: 1px solid var(--border-color);">
              <input type="radio" name="proc-report-type" value="ALL" checked style="accent-color: #10b981;">
              <span>🌟 All Safety Reports (Recommended)</span>
            </label>
            <label style="display: flex; align-items: center; gap: 8px; font-size: 12.5px; color: var(--text-primary); cursor: pointer; background: var(--bg-primary); padding: 8px 12px; border-radius: 6px; border: 1px solid var(--border-color);">
              <input type="radio" name="proc-report-type" value="JHA" style="accent-color: #10b981;">
              <span>📋 Daily JHAs Only</span>
            </label>
            <label style="display: flex; align-items: center; gap: 8px; font-size: 12.5px; color: var(--text-primary); cursor: pointer; background: var(--bg-primary); padding: 8px 12px; border-radius: 6px; border: 1px solid var(--border-color);">
              <input type="radio" name="proc-report-type" value="WEEKLY" style="accent-color: #10b981;">
              <span>🗣️ Weekly Safety Meetings Only</span>
            </label>
            <label style="display: flex; align-items: center; gap: 8px; font-size: 12.5px; color: var(--text-primary); cursor: pointer; background: var(--bg-primary); padding: 8px 12px; border-radius: 6px; border: 1px solid var(--border-color);">
              <input type="radio" name="proc-report-type" value="MONTHLY" style="accent-color: #10b981;">
              <span>🚛 Monthly Fleet Checklists Only</span>
            </label>
          </div>
        </div>

        <!-- Step 2: Select Date Range / Scope -->
        <div style="background: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: 8px; padding: 14px 16px;">
          <label style="font-size: 12px; font-weight: 700; color: #f8fafc; display: block; margin-bottom: 8px;">
            2. Email Date Range
          </label>
          <div style="display: flex; flex-direction: column; gap: 8px;">
            <label style="display: flex; align-items: center; gap: 8px; font-size: 12.5px; color: var(--text-primary); cursor: pointer;">
              <input type="radio" name="proc-date-scope" value="new" checked onchange="document.getElementById('custom-date-box').style.display='none';" style="accent-color: #10b981;">
              <span>⚡ <strong>Only New Emails</strong> (Fastest — scans since last processed date)</span>
            </label>
            <label style="display: flex; align-items: center; gap: 8px; font-size: 12.5px; color: var(--text-primary); cursor: pointer;">
              <input type="radio" name="proc-date-scope" value="7" onchange="document.getElementById('custom-date-box').style.display='none';" style="accent-color: #10b981;">
              <span>📅 Last 7 Days</span>
            </label>
            <label style="display: flex; align-items: center; gap: 8px; font-size: 12.5px; color: var(--text-primary); cursor: pointer;">
              <input type="radio" name="proc-date-scope" value="14" onchange="document.getElementById('custom-date-box').style.display='none';" style="accent-color: #10b981;">
              <span>📅 Last 14 Days</span>
            </label>
            <label style="display: flex; align-items: center; gap: 8px; font-size: 12.5px; color: var(--text-primary); cursor: pointer;">
              <input type="radio" name="proc-date-scope" value="30" onchange="document.getElementById('custom-date-box').style.display='none';" style="accent-color: #10b981;">
              <span>📅 Last 30 Days</span>
            </label>
            <label style="display: flex; align-items: center; gap: 8px; font-size: 12.5px; color: var(--text-primary); cursor: pointer;">
              <input type="radio" name="proc-date-scope" value="custom" onchange="document.getElementById('custom-date-box').style.display='flex';" style="accent-color: #10b981;">
              <span>🗓️ Custom Date Range...</span>
            </label>
          </div>

          <!-- Custom Date Range Picker (Hidden by default) -->
          <div id="custom-date-box" style="display: none; align-items: center; gap: 12px; margin-top: 10px; padding-top: 10px; border-top: 1px dashed var(--border-color);">
            <div style="flex: 1;">
              <label style="font-size: 11px; color: var(--text-muted); display: block; margin-bottom: 2px;">Start Date:</label>
              <input type="date" id="proc-start-date" class="sheet-search" style="width: 100%; font-size: 12px;">
            </div>
            <div style="flex: 1;">
              <label style="font-size: 11px; color: var(--text-muted); display: block; margin-bottom: 2px;">End Date (Optional):</label>
              <input type="date" id="proc-end-date" class="sheet-search" style="width: 100%; font-size: 12px;">
            </div>
          </div>
        </div>

        <!-- Step 3: Select Processing Speed / Mode -->
        <div style="background: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: 8px; padding: 14px 16px;">
          <label style="font-size: 12px; font-weight: 700; color: #f8fafc; display: block; margin-bottom: 8px;">
            3. Processing Mode
          </label>
          <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px;">
            <label style="display: flex; align-items: flex-start; gap: 8px; font-size: 12px; color: var(--text-primary); cursor: pointer; background: var(--bg-primary); padding: 10px 12px; border-radius: 6px; border: 1px solid var(--border-color);">
              <input type="radio" name="proc-speed-mode" value="fast" checked style="accent-color: #10b981; margin-top: 2px;">
              <div>
                <span style="font-weight: 700; color: #6ee7b7;">⚡ Fast Mode (Recommended)</span>
                <div style="font-size: 11px; color: var(--text-muted); margin-top: 2px; line-height: 1.35;">
                  Parses subject lines & email dates. Blazing fast (15-20 emails/batch) and prevents Google proxy timeouts.
                </div>
              </div>
            </label>
            <label style="display: flex; align-items: flex-start; gap: 8px; font-size: 12px; color: var(--text-primary); cursor: pointer; background: var(--bg-primary); padding: 10px 12px; border-radius: 6px; border: 1px solid var(--border-color);">
              <input type="radio" name="proc-speed-mode" value="deep" style="accent-color: #10b981; margin-top: 2px;">
              <div>
                <span style="font-weight: 700; color: #f8fafc;">🔍 Deep Scan (Extract PDFs)</span>
                <div style="font-size: 11px; color: var(--text-muted); margin-top: 2px; line-height: 1.35;">
                  Uses Google Drive OCR to read attached PDFs for internal JHA dates. Scans 1 email per batch to stay under limits.
                </div>
              </div>
            </label>
          </div>
        </div>
      </div>
    `;

    if (footer) {
      footer.innerHTML = `
        <button class="btn btn-secondary" onclick="window.safetyComplianceEngine.closeProcessEmailsModal()">Cancel</button>
        <button class="btn btn-secondary" id="btn-bg-process-emails" onclick="window.safetyComplianceEngine.startCloudBackgroundProcess()" style="display: flex; align-items: center; gap: 6px;" title="Execute processing directly on Google Cloud servers in the background with a 6-minute quota and zero proxy timeouts">
          <span>⚡</span> Run in Background
        </button>
        <button class="btn btn-primary" id="btn-start-process-emails" onclick="window.safetyComplianceEngine.runProcessEmails()" style="font-weight: 700; background: linear-gradient(135deg, #10b981 0%, #059669 100%); border: none; display: flex; align-items: center; gap: 6px; box-shadow: 0 2px 8px rgba(16, 185, 129, 0.4);">
          <span>🚀</span> Process Safety Emails Now
        </button>
      `;
    }

    modal.style.display = 'flex';
  }

  /**
   * Triggers asynchronous background safety email processing on Google Cloud servers.
   * Executes via a 1-shot time-driven trigger on Google Apps Script with a 6-minute quota,
   * completely avoiding HTTP proxy gateway limits, while polling status in the desktop app.
   */
  async startCloudBackgroundProcess() {
    const syncUrl = window.syncEngine ? window.syncEngine.getSyncUrl() : '';
    if (!syncUrl) {
      alert('Sync URL not configured. Please connect to Google Sheets in the header bar first.');
      return;
    }

    const scopeRadio = document.querySelector('input[name="proc-scope"]:checked');
    const scopeVal = scopeRadio ? scopeRadio.value : '7';
    let daysBack = 7;
    let newOnlyMode = true;
    let startDate = '';
    let endDate = '';

    if (scopeVal === 'new') {
      newOnlyMode = true;
      daysBack = 30;
    } else if (scopeVal === 'custom') {
      newOnlyMode = false;
      startDate = document.getElementById('proc-start-date') ? document.getElementById('proc-start-date').value : '';
      endDate = document.getElementById('proc-end-date') ? document.getElementById('proc-end-date').value : '';
      if (startDate) {
        const startParsed = new Date(startDate);
        const now = new Date();
        daysBack = Math.max(1, Math.ceil((now.getTime() - startParsed.getTime()) / (1000 * 60 * 60 * 24)));
      }
    } else {
      newOnlyMode = false;
      daysBack = parseInt(scopeVal, 10) || 7;
    }

    const speedRadio = document.querySelector('input[name="proc-speed-mode"]:checked');
    const skipPdfExtraction = speedRadio ? (speedRadio.value === 'fast') : true;

    const filterRadio = document.querySelector('input[name="proc-filter"]:checked');
    const reportTypeFilter = filterRadio ? filterRadio.value : 'ALL';

    this.closeProcessEmailsModal();
    this.showToast('⚡ Initiating background email scan on Google Cloud servers...');

    const widget = document.getElementById('safety-emails-bg-widget');
    if (widget) widget.style.display = 'flex';
    this.updateBackgroundWidget({
      title: 'Google Cloud Background Scan',
      sub: 'Starting background worker on Google Apps Script...'
    });

    try {
      const payload = {
        action: 'startProcessSafetyEmailsInBackground',
        reportTypeFilter: reportTypeFilter,
        daysBack: daysBack,
        newOnlyMode: newOnlyMode,
        fastMode: skipPdfExtraction,
        startDate: startDate,
        endDate: endDate
      };

      const startRes = await window.syncEngine.executeNetworkRequest(syncUrl, 'POST', payload, 30000);
      if (!startRes || !startRes.success) {
        throw new Error((startRes && startRes.error) || 'Failed to start background trigger on server.');
      }

      this.updateBackgroundWidget({
        title: 'Google Cloud Background Scan',
        sub: 'Worker running in cloud. Polling status...'
      });

      // Poll status every 4 seconds
      const startTime = Date.now();
      const pollInterval = setInterval(async () => {
        const elapsedSec = Math.round((Date.now() - startTime) / 1000);

        try {
          const statusRes = await window.syncEngine.executeNetworkRequest(syncUrl, 'POST', {
            action: 'getSafetyEmailsStatus',
            reportTypeFilter: reportTypeFilter
          }, 30000);

          const curStatus = (statusRes && statusRes.currentStatus) || 'IDLE';

          if (curStatus === 'RUNNING') {
            this.updateBackgroundWidget({
              title: 'Google Cloud Background Scan',
              sub: `Worker active in cloud (${elapsedSec}s elapsed)...`
            });
          } else if (curStatus === 'COMPLETE') {
            clearInterval(pollInterval);
            this.updateBackgroundWidget({
              title: '✅ Cloud Scan Completed',
              sub: `Finished in ${elapsedSec}s. Syncing local tables...`
            });

            // Refresh database from Google Sheets
            if (window.syncEngine) {
              await window.syncEngine.syncWithGoogleSheets();
            }
            this.renderSafetyComplianceView();
            this.showToast('✅ Safety emails processed successfully in the cloud! Compliance updated.');

            setTimeout(() => {
              if (widget) widget.style.display = 'none';
            }, 6000);

          } else if (curStatus.startsWith('ERROR')) {
            clearInterval(pollInterval);
            this.updateBackgroundWidget({
              title: '❌ Cloud Scan Error',
              sub: curStatus
            });
            this.showToast(curStatus, true);
          } else if (elapsedSec > 360) {
            // Safety timeout after 6 minutes
            clearInterval(pollInterval);
            this.updateBackgroundWidget({
              title: '⚠️ Background Scan Timeout',
              sub: 'Worker took longer than 6 minutes. Try running again.'
            });
          }
        } catch (pollErr) {
          console.warn('Status poll warning:', pollErr);
        }
      }, 4000);

    } catch (err) {
      console.error('startCloudBackgroundProcess error:', err);
      this.updateBackgroundWidget({
        title: '❌ Failed to Start Cloud Scan',
        sub: err.message
      });
      this.showToast(`Error: ${err.message}`, true);
    }
  }

  showToast(msg, isError = false) {
    const existing = document.getElementById('app-toast');
    if (existing) {
      if (typeof existing.remove === 'function') existing.remove();
      else if (existing.parentNode) existing.parentNode.removeChild(existing);
    }
    const toast = document.createElement('div');
    toast.id = 'app-toast';
    toast.style.cssText = `
      position: fixed;
      bottom: 24px;
      right: 24px;
      background: ${isError ? '#ef4444' : '#10b981'};
      color: #ffffff;
      padding: 10px 18px;
      border-radius: 8px;
      font-size: 13px;
      font-weight: 600;
      box-shadow: 0 4px 14px rgba(0, 0, 0, 0.35);
      z-index: 99999;
      display: flex;
      align-items: center;
      gap: 8px;
      animation: slideInUp 0.2s ease-out;
    `;
    toast.innerHTML = msg;
    document.body.appendChild(toast);
    setTimeout(() => {
      if (toast && toast.parentNode) toast.parentNode.removeChild(toast);
    }, 4500);
  }

  minimizeProcessEmailsModal() {
    this.isMinimized = true;
    const modal = document.getElementById('process-safety-emails-modal');
    if (modal) modal.style.display = 'none';

    const widget = document.getElementById('safety-emails-bg-widget');
    if (widget) widget.style.display = 'flex';

    this.showToast('📬 Email scan is continuing in the background. You can navigate and make edits freely!');
  }

  restoreProcessEmailsModal() {
    this.isMinimized = false;
    const widget = document.getElementById('safety-emails-bg-widget');
    if (widget) widget.style.display = 'none';

    const modal = document.getElementById('process-safety-emails-modal');
    if (modal) modal.style.display = 'flex';
  }

  cancelProcessEmails() {
    if (!this.isProcessing) return;
    this.cancelRequested = true;
    const subEl = document.getElementById('proc-live-sub');
    if (subEl) subEl.textContent = '🛑 Stopping scan after current batch finishes...';
    this.updateBackgroundWidget({ sub: 'Stopping after current batch...' });
    this.showToast('🛑 Safety email scanner will stop after the current batch finishes.');
  }

  dismissBackgroundWidget() {
    const widget = document.getElementById('safety-emails-bg-widget');
    if (widget) widget.style.display = 'none';
  }

  updateBackgroundWidget(opts = {}) {
    const widget = document.getElementById('safety-emails-bg-widget');
    if (!widget) return;

    if (opts.pct !== undefined) {
      const pctEl = document.getElementById('safety-bg-pct');
      if (pctEl) pctEl.textContent = `${opts.pct}%`;
      const barEl = document.getElementById('safety-bg-bar');
      if (barEl) barEl.style.width = `${Math.max(5, opts.pct)}%`;
    }

    if (opts.title) {
      const titleEl = document.getElementById('safety-bg-title-text');
      if (titleEl) titleEl.textContent = opts.title;
    }

    if (opts.sub) {
      const subEl = document.getElementById('safety-bg-sub');
      if (subEl) subEl.textContent = opts.sub;
    }

    if (opts.status === 'completed') {
      widget.classList.add('completed');
      widget.classList.remove('error');
      const spinner = document.getElementById('safety-bg-spinner');
      if (spinner) {
        spinner.style.animation = 'none';
        spinner.style.border = 'none';
        spinner.textContent = '✅';
        spinner.style.fontSize = '18px';
      }
      const dismissBtn = document.getElementById('safety-bg-dismiss-btn');
      if (dismissBtn) dismissBtn.style.display = 'flex';
    } else if (opts.status === 'error') {
      widget.classList.add('error');
      widget.classList.remove('completed');
      const spinner = document.getElementById('safety-bg-spinner');
      if (spinner) {
        spinner.style.animation = 'none';
        spinner.style.border = 'none';
        spinner.textContent = '❌';
        spinner.style.fontSize = '18px';
      }
      const dismissBtn = document.getElementById('safety-bg-dismiss-btn');
      if (dismissBtn) dismissBtn.style.display = 'flex';
    } else {
      widget.classList.remove('completed', 'error');
      const spinner = document.getElementById('safety-bg-spinner');
      if (spinner) {
        spinner.textContent = '';
        spinner.style.fontSize = '';
        spinner.style.border = '2.5px solid rgba(16, 185, 129, 0.25)';
        spinner.style.borderTopColor = '#34d399';
        spinner.style.animation = 'spin 0.85s linear infinite';
      }
      const dismissBtn = document.getElementById('safety-bg-dismiss-btn');
      if (dismissBtn) dismissBtn.style.display = 'none';
    }
  }

  closeProcessEmailsModal() {
    if (this.isProcessing) {
      this.minimizeProcessEmailsModal();
      return;
    }
    const modal = document.getElementById('process-safety-emails-modal');
    if (modal) modal.style.display = 'none';
  }

  async runProcessEmails() {
    if (this.isProcessing) {
      this.restoreProcessEmailsModal();
      return;
    }

    const syncUrl = window.syncEngine.getSyncUrl();
    if (!syncUrl) {
      alert('⚠️ Please configure your Google Apps Script Web App sync URL first in Settings.');
      return;
    }

    const typeRadio = document.querySelector('input[name="proc-report-type"]:checked');
    const reportTypeFilter = typeRadio ? typeRadio.value : 'ALL';

    const scopeRadio = document.querySelector('input[name="proc-date-scope"]:checked');
    const scopeVal = scopeRadio ? scopeRadio.value : 'new';

    let daysBack = 7;
    let newOnlyMode = true;
    let startDate = null;
    let endDate = null;

    if (scopeVal === 'new') {
      newOnlyMode = true;
      daysBack = 7;
    } else if (scopeVal === 'custom') {
      newOnlyMode = false;
      startDate = document.getElementById('proc-start-date')?.value || null;
      endDate = document.getElementById('proc-end-date')?.value || null;
      if (startDate) {
        const startD = new Date(startDate);
        const nowD = new Date();
        const diffDays = Math.max(1, Math.ceil((nowD - startD) / (1000 * 60 * 60 * 24)));
        daysBack = diffDays;
      }
    } else {
      newOnlyMode = false;
      daysBack = parseInt(scopeVal, 10) || 7;
    }

    const speedRadio = document.querySelector('input[name="proc-speed-mode"]:checked');
    let skipPdfExtraction = speedRadio ? (speedRadio.value === 'fast') : true;

    this.isProcessing = true;
    this.isMinimized = false;
    this.cancelRequested = false;

    const minBtn = document.getElementById('btn-minimize-process-emails');
    if (minBtn) minBtn.style.display = 'inline-flex';

    const body = document.getElementById('process-safety-emails-modal-body');
    const footer = document.getElementById('process-safety-emails-modal-footer');

    if (body) {
      body.innerHTML = `
        <div style="padding: 24px 16px; text-align: center;">
          <div class="spinner" style="width: 44px; height: 44px; border: 4px solid rgba(16, 185, 129, 0.2); border-top-color: #10b981; border-radius: 50%; animation: spin 0.85s linear infinite; margin: 0 auto 16px auto;"></div>
          <h3 id="proc-live-title" style="color: #f8fafc; font-size: 16px; font-weight: 700; margin-bottom: 6px;">Scanning Gmail & Processing Emails...</h3>
          <div id="proc-live-sub" style="color: var(--text-secondary); font-size: 12.5px; margin-bottom: 18px;">
            Connecting to Gmail, searching for safety emails (${reportTypeFilter})...
          </div>

          <!-- Live Progress Bar -->
          <div style="width: 100%; background: var(--bg-primary); border: 1px solid var(--border-color); border-radius: 12px; height: 22px; overflow: hidden; position: relative; margin-bottom: 14px; box-shadow: inset 0 2px 4px rgba(0,0,0,0.4);">
            <div id="proc-live-bar" style="width: 0%; height: 100%; background: linear-gradient(90deg, #10b981 0%, #059669 100%); border-radius: 12px; transition: width 0.3s ease; display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 800; color: white; text-shadow: 0 1px 2px rgba(0,0,0,0.5);">
              0%
            </div>
          </div>

          <!-- Running Email Counter Box -->
          <div id="proc-live-counter" style="background: var(--bg-primary); border: 1px solid var(--border-color); border-radius: 8px; padding: 12px 16px; display: inline-flex; flex-direction: column; gap: 4px; min-width: 320px;">
            <div style="font-size: 13px; font-weight: 700; color: #6ee7b7;" id="proc-live-count-text">
              Searching Gmail...
            </div>
            <div style="font-size: 11px; color: var(--text-muted);" id="proc-live-stats-text">
              0 processed • 0 skipped • 0 equipment issues
            </div>
          </div>
        </div>
      `;
    }

    if (footer) {
      footer.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center; width: 100%;">
          <button class="btn btn-secondary" onclick="window.safetyComplianceEngine.minimizeProcessEmailsModal()" style="font-weight: 600; color: #a7f3d0; border: 1px solid rgba(16, 185, 129, 0.4); background: rgba(6, 78, 59, 0.4); display: flex; align-items: center; gap: 6px; font-size: 12px; padding: 6px 12px;" title="Keep scanning in the background while you use other tabs and make edits">
            <span>🗕</span> Run in Background
          </button>
          <div style="display: flex; align-items: center; gap: 10px;">
            <span class="spinner" style="width: 14px; height: 14px; border: 2px solid rgba(16, 185, 129, 0.2); border-top-color: #10b981; border-radius: 50%; display: inline-block; animation: spin 0.85s linear infinite;"></span>
            <span style="font-size: 12px; color: var(--text-muted);">Scanning Gmail...</span>
            <button class="btn btn-secondary" onclick="window.safetyComplianceEngine.cancelProcessEmails()" style="font-size: 11px; padding: 4px 8px; color: #fca5a5; border-color: rgba(239, 68, 68, 0.3); background: rgba(239, 68, 68, 0.1);" title="Finish current batch and save progress">
              🛑 Stop After Batch
            </button>
          </div>
        </div>
      `;
    }

    this.updateBackgroundWidget({
      title: '📬 Scanning Emails',
      sub: `Connecting to Gmail (${reportTypeFilter})...`,
      pct: 0,
      status: 'scanning'
    });

    try {
      let totalThreads = 0;
      let totalProcessed = 0;
      let totalSkipped = 0;
      let totalIssues = 0;
      let cumulativeLogs = { jha: 0, weekly: 0, monthly: 0 };
      let isComplete = false;
      let isPostProcessing = false;
      let lastResult = null;
      let finalSnapshot = null;
      let finalUpdatedRows = null;
      let finalResult = null;
      let batchIndex = 1;

      while (!isComplete) {
        if (this.cancelRequested) {
          console.log('User requested cancellation of safety email scanning.');
          isComplete = true;
          break;
        }

        console.log(`Executing safety email batch #${batchIndex}...`);
        const payload = {
          action: 'processSafetyEmails',
          daysBack: daysBack,
          // Safe batch sizes: 5 threads per batch in Fast Mode (~10-15s per cycle), 1 thread in Deep Scan (OCR)
          batchSize: skipPdfExtraction ? 5 : 1,
          reportTypeFilter: reportTypeFilter,
          newOnlyMode: newOnlyMode,
          skipPdfExtraction: skipPdfExtraction,
          endDate: endDate,
          isPostProcessing: isPostProcessing,
          prevResult: lastResult,
          resetBatch: (batchIndex === 1 && !isPostProcessing)
        };

        // Resilient network request with automatic retry on temporary server/gateway hiccups
        let response = null;
        let batchAttempts = 0;
        while (batchAttempts < 3) {
          batchAttempts++;
          try {
            response = await window.syncEngine.executeNetworkRequest(syncUrl, 'POST', payload, 180000);
            if (response && response.success) {
              break;
            }
            if (batchAttempts < 3) {
              console.warn(`Safety email batch #${batchIndex} attempt ${batchAttempts} returned non-success, retrying in 3.5s:`, response);
              // If we were running in Deep Scan mode and timed out, automatically fall back to Fast Mode for this and remaining batches!
              if (!skipPdfExtraction) {
                console.warn('Switching to Fast Mode (skipPdfExtraction = true) for subsequent attempt to bypass heavy PDF OCR timeout.');
                skipPdfExtraction = true;
                payload.skipPdfExtraction = true;
                payload.batchSize = 5;
              }
              const subEl = document.getElementById('proc-live-sub');
              if (subEl) subEl.textContent = `Server busy, retrying batch #${batchIndex} (attempt ${batchAttempts + 1}/3)...`;
              this.updateBackgroundWidget({ sub: `Retrying batch #${batchIndex} (${batchAttempts + 1}/3)...` });
              await new Promise(r => setTimeout(r, 3500));
            }
          } catch (netErr) {
            if (batchAttempts < 3) {
              console.warn(`Safety email batch #${batchIndex} attempt ${batchAttempts} network error, retrying in 3.5s:`, netErr);
              // If we were running in Deep Scan mode and encountered a timeout/404, auto-switch to Fast Mode to bypass the bad PDF
              if (!skipPdfExtraction) {
                console.warn('Switching to Fast Mode (skipPdfExtraction = true) for subsequent attempt to bypass heavy PDF OCR timeout.');
                skipPdfExtraction = true;
                payload.skipPdfExtraction = true;
                payload.batchSize = 5;
              }
              const subEl = document.getElementById('proc-live-sub');
              if (subEl) subEl.textContent = `Server busy or proxy timeout, retrying batch #${batchIndex} (attempt ${batchAttempts + 1}/3)...`;
              this.updateBackgroundWidget({ sub: `Retrying batch #${batchIndex} (${batchAttempts + 1}/3)...` });
              await new Promise(r => setTimeout(r, 3500));
            } else {
              throw netErr;
            }
          }
        }

        console.log(`Safety email batch #${batchIndex} response:`, response);

        // Guard against receiving a raw database snapshot on server timeout/redirect
        if (response && response.version && response.tables && !response.result) {
          throw new Error('The Google Apps Script server timed out while scanning emails. Please try selecting a shorter date range (e.g. Last 7 Days) or try again.');
        }

        if (!response || !response.success) {
          let errMsg = (response && (response.error || response.message)) 
            ? (response.error || response.message) 
            : 'No response from Apps Script server.';
          if (typeof errMsg === 'object') {
            errMsg = JSON.stringify(errMsg);
          }
          if (errMsg.length > 250) {
            errMsg = errMsg.substring(0, 250) + '...';
          }
          throw new Error(errMsg);
        }

        const res = response.result || {};
        lastResult = res;

        // Extract numbers
        if (res.totalThreads !== undefined) totalThreads = res.totalThreads;
        const processedSoFar = res.threadsProcessed !== undefined ? res.threadsProcessed : (totalProcessed + (res.processedThisBatch || 0) + (res.skippedThisBatch || 0));
        totalProcessed += (res.processedThisBatch || 0);
        totalSkipped += (res.skippedThisBatch || 0);
        totalIssues += (res.issuesThisBatch || 0);

        if (res.logsCreated) {
          cumulativeLogs.jha += (res.logsCreated.jha || 0);
          cumulativeLogs.weekly += (res.logsCreated.weekly || 0);
          cumulativeLogs.monthly += (res.logsCreated.monthly || 0);
        }

        // Update Live UI
        const barEl = document.getElementById('proc-live-bar');
        const countTextEl = document.getElementById('proc-live-count-text');
        const statsTextEl = document.getElementById('proc-live-stats-text');
        const titleEl = document.getElementById('proc-live-title');
        const subEl = document.getElementById('proc-live-sub');

        const pct = totalThreads > 0 ? Math.min(100, Math.round((processedSoFar / totalThreads) * 100)) : (isPostProcessing ? 98 : 10);

        if (barEl) {
          barEl.style.width = `${Math.max(5, pct)}%`;
          barEl.textContent = `${pct}%`;
        }

        if (countTextEl) {
          if (totalThreads > 0) {
            countTextEl.innerHTML = `Scanned <strong>${processedSoFar}</strong> of <strong>${totalThreads}</strong> emails (${pct}%)`;
          } else {
            countTextEl.textContent = `Scanned ${processedSoFar} emails...`;
          }
        }

        if (statsTextEl) {
          statsTextEl.textContent = `${totalProcessed} logged • ${totalSkipped} skipped • ${totalIssues} equipment issues`;
        }

        this.updateBackgroundWidget({
          pct: pct,
          sub: totalThreads > 0 ? `Scanned ${processedSoFar} of ${totalThreads} (${pct}%) • Batch #${batchIndex}` : `Scanned ${processedSoFar} emails...`
        });

        // Check if finished
        if (response.complete === true) {
          isComplete = true;
          finalResult = res;
          finalSnapshot = response.snapshot || response.dataSnapshot || (response.result && (response.result.snapshot || response.result.dataSnapshot)) || null;
          finalUpdatedRows = response.updatedRows || (response.result && response.result.updatedRows) || null;
          break;
        }

        // Check if ready for post-processing
        if (res.isPostProcessing === true) {
          isPostProcessing = true;
          if (titleEl) titleEl.textContent = "Finalizing Compliance & Logs...";
          if (subEl) subEl.textContent = "Calculating crew scores, updating Safety Compliance matrix, and finalizing logs...";
          if (barEl) {
            barEl.style.width = "95%";
            barEl.textContent = "95%";
            barEl.style.background = "linear-gradient(90deg, #3b82f6 0%, #10b981 100%)";
          }
          this.updateBackgroundWidget({
            title: '🛡️ Finalizing Compliance',
            sub: 'Calculating scores & updating matrix...',
            pct: 95
          });
        }

        // Polite pause between batches to prevent Google edge proxy burst rate limiting
        await new Promise(r => setTimeout(r, 1200));
        batchIndex++;
      }

      // Update local database snapshot if fresh snapshot returned, or merge updatedRows
      if (finalUpdatedRows && finalUpdatedRows.length > 0) {
        this.mergeComplianceUpdates(finalUpdatedRows);
        const activeView = document.querySelector('.view-container.active');
        if (activeView && activeView.id === 'safety-compliance-view' && window.sheetNavigator) {
          window.sheetNavigator.renderSafetyCompliance();
        }
      } else if (finalSnapshot) {
        await window.localDB.setSnapshot(finalSnapshot);
        const activeView = document.querySelector('.view-container.active');
        if (activeView && activeView.id === 'safety-compliance-view' && window.sheetNavigator) {
          window.sheetNavigator.renderSafetyCompliance();
        }
      } else if (window.syncEngine) {
        // Asynchronous compliance calculation runs in the background on Google Cloud;
        // schedule a sync in 5 seconds to load the updated compliance table.
        setTimeout(async () => {
          try {
            await window.syncEngine.syncWithGoogleSheets();
            const activeView = document.querySelector('.view-container.active');
            if (activeView && activeView.id === 'safety-compliance-view' && window.sheetNavigator) {
              window.sheetNavigator.renderSafetyCompliance();
            }
          } catch (syncErr) {
            console.warn('Auto-sync after safety email processing warning:', syncErr);
          }
        }, 5000);
      }

      // Hide header minimize button
      if (minBtn) minBtn.style.display = 'none';

      // Save logs in memory
      this.currentLogs = (finalResult && finalResult.recentLogs && finalResult.recentLogs.length > 0)
        ? finalResult.recentLogs
        : this.extractLogsFromLocalDB();

      this.activeCategoryFilter = 'all';
      this.searchQuery = '';

      const totalLogs = (cumulativeLogs.jha || 0) + (cumulativeLogs.weekly || 0) + (cumulativeLogs.monthly || 0);

      // Render completion content so it's ready in modal
      if (body) {
        this.renderCompletionModalContent(body, {
          totalThreads: totalThreads || totalProcessed + totalSkipped,
          totalLogs: totalLogs,
          cumulativeLogs: cumulativeLogs,
          totalIssues: totalIssues,
          complianceError: finalResult ? finalResult.complianceError : null
        });
      }

      if (footer) {
        footer.innerHTML = `
          <button class="btn btn-secondary" onclick="window.safetyComplianceEngine.openSafetyLogsModal()" style="font-size: 12px; font-weight: 600;">
            📋 Full Logs & PDFs
          </button>
          <button class="btn btn-primary" onclick="window.safetyComplianceEngine.closeProcessEmailsModal()" style="font-weight: 700; background: #10b981; border: none; padding: 8px 24px;">
            Done & View Compliance
          </button>
        `;
      }

      if (finalResult && finalResult.complianceError) {
        console.warn('Compliance calculation reported error:', finalResult.complianceError);
        window.syncEngine.updateStatusUI('error', 'Emails logged, but compliance calculation had an issue');
      } else {
        window.syncEngine.updateStatusUI('synced', `Compliance updated (${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})`);
      }

      // If running in background, update floating widget and show completion toast
      if (this.isMinimized) {
        this.updateBackgroundWidget({
          title: '✅ Email Processing Complete',
          sub: `${totalLogs} logged • ${totalIssues} issues • Click to view report`,
          pct: 100,
          status: 'completed'
        });
        this.showToast(`🎉 Safety email processing complete! <strong>${totalLogs} emails logged</strong>, ${totalIssues} equipment issues. <a href="javascript:void(0)" onclick="window.safetyComplianceEngine.restoreProcessEmailsModal()" style="color: #fef08a; text-decoration: underline; margin-left: 6px; font-weight: 700;">View Report</a>`);
      }

    } catch (err) {
      console.error('runProcessEmails error:', err);
      let displayError = (err && err.message) ? err.message : 'An error occurred while processing emails.';
      if (displayError.length > 300) {
        displayError = displayError.substring(0, 300) + '... (See console for full details)';
      }

      if (minBtn) minBtn.style.display = 'none';

      if (body) {
        body.innerHTML = `
          <div style="background: rgba(239, 68, 68, 0.1); border: 1px solid rgba(239, 68, 68, 0.3); border-radius: 8px; padding: 16px 20px;">
            <div style="font-size: 14px; font-weight: 700; color: #fca5a5; margin-bottom: 6px;">❌ Processing Error</div>
            <div style="font-size: 12.5px; color: var(--text-secondary); line-height: 1.5; margin-bottom: 12px; word-break: break-word;">
              ${this.escapeHtml(displayError)}
            </div>
            <div style="font-size: 11.5px; color: var(--text-muted);">
              Tip: If processing many emails, try selecting <strong>📅 Last 7 Days</strong> or clicking <strong>🗕 Run in Background</strong> to continue working while it scans.
            </div>
          </div>
        `;
      }

      if (footer) {
        footer.innerHTML = `
          <button class="btn btn-secondary" onclick="window.safetyComplianceEngine.closeProcessEmailsModal()">Close</button>
          <button class="btn btn-primary" onclick="window.safetyComplianceEngine.openProcessEmailsModal()">Try Again</button>
        `;
      }

      if (this.isMinimized) {
        this.updateBackgroundWidget({
          title: '❌ Email Processing Error',
          sub: `${displayError.substring(0, 45)}... Click to view`,
          status: 'error'
        });
        this.showToast(`⚠️ Error processing safety emails: ${this.escapeHtml(displayError.substring(0, 80))}. <a href="javascript:void(0)" onclick="window.safetyComplianceEngine.restoreProcessEmailsModal()" style="color: #fef08a; text-decoration: underline; margin-left: 6px; font-weight: 700;">View Details</a>`, true);
      }
    } finally {
      this.isProcessing = false;
      const minBtn = document.getElementById('btn-minimize-process-emails');
      if (minBtn) minBtn.style.display = 'none';
    }
  }

  /**
   * Directly merges updated compliance rows into the local IndexedDB snapshot
   * without requiring a full database download.
   */
  mergeComplianceUpdates(updatedRows) {
    if (!Array.isArray(updatedRows) || updatedRows.length === 0) return false;
    if (!window.localDB || !window.localDB.snapshot || !window.localDB.snapshot.tables) return false;

    let scTable = window.localDB.snapshot.tables.safety_compliance;
    if (!scTable) {
      scTable = {
        name: 'Safety Compliance',
        headers: ["Week Start", "Job Number", "Foreman", "Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Weekly Meeting", "Monthly Checklist", "Status", "Updated"],
        rows: [],
        rawGrid: []
      };
      window.localDB.snapshot.tables.safety_compliance = scTable;
    }

    if (!scTable.rows) scTable.rows = [];
    if (!scTable.headers || scTable.headers.length === 0) {
      scTable.headers = ["Week Start", "Job Number", "Foreman", "Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Weekly Meeting", "Monthly Checklist", "Status", "Updated"];
    }

    updatedRows.forEach(newRow => {
      const nwStr = String(newRow['Week Start'] || '').trim();
      const njStr = String(newRow['Job Number'] || '').trim();
      let matched = false;
      for (let r = 0; r < scTable.rows.length; r++) {
        const row = scTable.rows[r];
        const rwStr = String(row['Week Start'] || '').trim();
        const rjStr = String(row['Job Number'] || '').trim();
        if (rwStr === nwStr && rjStr === njStr) {
          Object.assign(row, newRow);
          matched = true;
          break;
        }
      }
      if (!matched) {
        newRow._rowIdx = scTable.rows.length + 2;
        scTable.rows.push(newRow);
      }
    });

    // Rebuild rawGrid so grid renderers have matching data
    scTable.rawGrid = [
      scTable.headers,
      ...scTable.rows.map(r => scTable.headers.map(h => r[h] !== undefined && r[h] !== null ? String(r[h]) : ''))
    ];
    scTable.rowCount = scTable.rows.length;
    scTable.maxRows = scTable.rows.length + 1;
    scTable.maxCols = scTable.headers.length;

    if (typeof window.localDB.persistSnapshot === 'function') {
      window.localDB.persistSnapshot(window.localDB.snapshot);
    }
    return true;
  }

  /**
   * Recalculates Safety Compliance matrix without re-scanning Gmail.
   */
  async runRecalculateCompliance() {
    if (this.isProcessing) return;

    const syncUrl = window.syncEngine ? window.syncEngine.getSyncUrl() : '';
    if (!syncUrl) {
      alert('⚠️ Please configure your Google Apps Script Web App sync URL first in Settings.');
      return;
    }

    const confirmRecalc = confirm('Recalculate Safety Compliance matrix now?\n\nThis will evaluate all logged JHAs, weekly safety meetings, and monthly checklists for current and previous weeks and refresh your desktop view.');
    if (!confirmRecalc) return;

    this.isProcessing = true;
    window.syncEngine.updateStatusUI('syncing', 'Recalculating Compliance...');

    try {
      const payload = {
        action: 'recalculateCompliance',
        targetWeek: 'current'
      };

      const response = await window.syncEngine.executeNetworkRequest(syncUrl, 'POST', payload, 180000);
      console.log('Recalculate compliance response:', response);

      if (!response || !response.success) {
        const errMsg = (response && (response.error || response.message || (response.result && response.result.error)))
          ? (response.error || response.message || response.result.error)
          : 'Failed to recalculate compliance.';
        throw new Error(errMsg);
      }

      const updatedRows = response.updatedRows || (response.result && response.result.updatedRows);
      if (updatedRows && updatedRows.length > 0) {
        this.mergeComplianceUpdates(updatedRows);
      } else {
        const freshSnap = response.snapshot || response.dataSnapshot || (response.result && (response.result.snapshot || response.result.dataSnapshot));
        if (freshSnap) {
          await window.localDB.setSnapshot(freshSnap);
        }
      }

      if (window.sheetNavigator) {
        window.sheetNavigator.renderSafetyCompliance();
      }

      window.syncEngine.updateStatusUI('synced', `Compliance recalculated (${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})`);
      alert('✅ Safety Compliance matrix recalculated successfully! View has been updated.');
    } catch (err) {
      console.error('runRecalculateCompliance error:', err);
      window.syncEngine.updateStatusUI('error', 'Recalculation failed');
      alert(`❌ Failed to recalculate compliance:\n\n${err.message}`);
    } finally {
      this.isProcessing = false;
    }
  }



  /**
   * Opens the In-App PDF Document Viewer Modal to render the attached safety PDF immediately.
   */
  async openPdfViewer(logId) {
    const log = (this.currentLogs || []).find(l => (l.id === logId || (l.sheetName + '_' + l.rowIndex) === logId));
    if (!log) {
      alert('Log record not found.');
      return;
    }

    const modal = document.getElementById('safety-pdf-modal');
    const body = document.getElementById('safety-pdf-modal-body');
    const titleEl = document.getElementById('safety-pdf-modal-title');
    const subtitleEl = document.getElementById('safety-pdf-modal-subtitle');
    const gmailBtn = document.getElementById('safety-pdf-btn-gmail');
    const downloadBtn = document.getElementById('safety-pdf-btn-download');
    const popoutBtn = document.getElementById('safety-pdf-btn-newtab');

    if (!modal || !body) return;

    modal.style.display = 'flex';

    if (titleEl) titleEl.textContent = `${log.type} · Job ${log.jobNumber || 'N/A'}`;
    if (subtitleEl) subtitleEl.textContent = `Foreman: ${log.foreman || 'UNKNOWN'} | Report Date: ${log.date || 'N/A'} | Received: ${log.dateReceived || 'N/A'}`;

    if (gmailBtn) {
      gmailBtn.href = log.gmailUrl || '#';
      gmailBtn.style.display = log.gmailUrl ? 'inline-flex' : 'none';
    }

    body.innerHTML = `
      <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 14px; color: var(--text-secondary); padding: 40px;">
        <div class="loading-spinner" style="width: 40px; height: 40px; border: 3px solid rgba(16, 185, 129, 0.2); border-top-color: #10b981; border-radius: 50%; animation: spin 0.8s linear infinite;"></div>
        <div style="font-size: 13.5px; font-weight: 700; color: #f8fafc;">Retrieving attached PDF directly from Gmail...</div>
        <div style="font-size: 11.5px; color: #94a3b8;">${this.escapeHtml(log.subject || log.jobNumber)}</div>
      </div>
    `;

    try {
      const syncUrl = window.syncEngine ? window.syncEngine.getSyncUrl() : '';
      if (!syncUrl) {
        throw new Error('Sync URL not configured.');
      }

      if (!this.pdfCache) this.pdfCache = new Map();
      const cacheKey = log.emailId || log.subject || (log.sheetName + '_' + log.rowIndex);
      let pdfData = this.pdfCache.get(cacheKey);

      if (!pdfData) {
        const payload = {
          action: 'getSafetyPdf',
          emailId: log.emailId || '',
          subject: log.subject || ''
        };

        let resJson = null;
        if (window.syncEngine && typeof window.syncEngine.executeNetworkRequest === 'function') {
          resJson = await window.syncEngine.executeNetworkRequest(syncUrl, 'POST', payload, 60000);
        } else if (window.desktopAPI && typeof window.desktopAPI.sendSyncRequest === 'function') {
          const apiRes = await window.desktopAPI.sendSyncRequest({ url: syncUrl, method: 'POST', body: payload });
          resJson = apiRes ? (apiRes.data || apiRes) : null;
        } else {
          // Browser fallback: send via GET with query parameters which redirects cleanly in browser
          const getUrl = `${syncUrl}?action=getSafetyPdf&emailId=${encodeURIComponent(log.emailId || '')}&subject=${encodeURIComponent(log.subject || '')}`;
          const response = await fetch(getUrl);
          if (!response.ok) throw new Error(`Server returned HTTP ${response.status}`);
          resJson = await response.json();
        }

        if (!resJson || !resJson.success || !resJson.base64) {
          throw new Error((resJson && resJson.error) || 'Failed to extract PDF attachment.');
        }

        pdfData = resJson;
        this.pdfCache.set(cacheKey, pdfData);
      }

      // Convert base64 to Blob URL
      const byteCharacters = atob(pdfData.base64);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      // Guarantee proper application/pdf MIME type even if email server reported application/octet-stream
      const mimeType = (pdfData.filename && pdfData.filename.toLowerCase().endsWith('.pdf')) ? 'application/pdf' : (pdfData.contentType || 'application/pdf');
      const blob = new Blob([byteArray], { type: mimeType });
      const blobUrl = URL.createObjectURL(blob);

      if (downloadBtn) {
        downloadBtn.href = blobUrl;
        downloadBtn.download = pdfData.filename || `${log.type.replace(/\s+/g, '_')}_${log.jobNumber}.pdf`;
        downloadBtn.onclick = async (e) => {
          if (window.desktopAPI && typeof window.desktopAPI.savePdfToFile === 'function') {
            e.preventDefault();
            await window.desktopAPI.savePdfToFile(pdfData.base64, pdfData.filename || `${log.type.replace(/\s+/g, '_')}_${log.jobNumber}.pdf`);
          }
        };
      }

      if (popoutBtn) {
        popoutBtn.href = blobUrl;
        popoutBtn.onclick = async (e) => {
          if (window.desktopAPI && typeof window.desktopAPI.openPdfExternally === 'function') {
            e.preventDefault();
            await window.desktopAPI.openPdfExternally(pdfData.base64, pdfData.filename || 'SafetyDocument.pdf');
          }
        };
      }

      if (gmailBtn) {
        gmailBtn.href = log.gmailUrl || '#';
        gmailBtn.style.display = log.gmailUrl ? 'inline-flex' : 'none';
        gmailBtn.onclick = (e) => {
          if (log.gmailUrl && window.desktopAPI && typeof window.desktopAPI.openExternal === 'function') {
            e.preventDefault();
            window.desktopAPI.openExternal(log.gmailUrl);
          }
        };
      }

      if (subtitleEl) {
        subtitleEl.textContent = `${pdfData.filename || 'Document.pdf'} (${Math.round((pdfData.sizeBytes || 0)/1024)} KB) · Foreman: ${log.foreman || 'UNKNOWN'} · Date: ${log.date || 'N/A'} · Received: ${log.dateReceived || 'N/A'}`;
      }

      body.innerHTML = `
        <object data="${blobUrl}#view=FitH&toolbar=1" type="application/pdf" style="width: 100%; height: 100%; border: none; background: #1e293b;">
          <iframe src="${blobUrl}#view=FitH" style="width: 100%; height: 100%; border: none; background: #1e293b;">
            <div style="padding: 30px; text-align: center; color: var(--text-secondary);">
              <p>Preview cannot be rendered inline in this view.</p>
              <button class="btn btn-primary" onclick="if (window.desktopAPI) window.desktopAPI.openPdfExternally('${pdfData.base64}', '${pdfData.filename || 'SafetyDocument.pdf'}')">Open in System PDF Viewer</button>
            </div>
          </iframe>
        </object>
      `;

    } catch (err) {
      body.innerHTML = `
        <div style="padding: 30px; text-align: center; max-width: 500px; color: #f87171;">
          <div style="font-size: 32px; margin-bottom: 12px;">⚠️</div>
          <div style="font-size: 14px; font-weight: 700; margin-bottom: 6px;">Could not load PDF document directly</div>
          <div style="font-size: 12px; color: var(--text-secondary); margin-bottom: 20px; line-height: 1.5;">${this.escapeHtml(err.message || 'Unknown error')}</div>
          ${log.gmailUrl ? `
            <button onclick="if (window.desktopAPI) { window.desktopAPI.openExternal('${this.escapeHtml(log.gmailUrl)}'); } else { window.open('${this.escapeHtml(log.gmailUrl)}', '_blank'); }" class="btn btn-primary" style="font-weight: 700; background: #10b981; border: none; display: inline-flex; align-items: center; gap: 6px; padding: 8px 18px; cursor: pointer; color: white; border-radius: 6px;">
              <span>✉️</span> Open Email in Gmail Instead
            </button>
          ` : ''}
        </div>
      `;
    }
  }

  closePdfModal() {
    const modal = document.getElementById('safety-pdf-modal');
    if (modal) modal.style.display = 'none';
  }

  /**
   * Opens the Edit Log Entry modal to allow fixing typos in Foreman, Job Number, Credited To, Date, Notes.
   */
  openEditLogModal(logId) {
    const log = (this.currentLogs || []).find(l => (l.id === logId || (l.sheetName + '_' + l.rowIndex) === logId));
    if (!log) {
      alert('Log record not found.');
      return;
    }

    const existingModal = document.getElementById('edit-log-entry-modal');
    if (existingModal) existingModal.remove();

    const modal = document.createElement('div');
    modal.id = 'edit-log-entry-modal';
    modal.className = 'modal-backdrop';
    modal.style.cssText = 'position: fixed; inset: 0; background: rgba(0,0,0,0.8); z-index: 10000; display: flex; align-items: center; justify-content: center; backdrop-filter: blur(4px);';

    modal.innerHTML = `
      <div style="background: #1e293b; border: 1px solid var(--border-color); border-radius: 12px; width: 480px; max-width: 95vw; overflow: hidden; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.7);">
        <div style="display: flex; align-items: center; justify-content: space-between; padding: 14px 18px; border-bottom: 1px solid var(--border-color); background: rgba(0,0,0,0.2);">
          <div style="display: flex; align-items: center; gap: 8px;">
            <span style="font-size: 18px;">✏️</span>
            <h3 style="margin: 0; font-size: 15px; font-weight: 700; color: #f8fafc;">Edit Safety Log Record</h3>
          </div>
          <button onclick="document.getElementById('edit-log-entry-modal').remove()" style="background: none; border: none; color: var(--text-muted); cursor: pointer; font-size: 18px;">✕</button>
        </div>

        <div style="padding: 18px; display: flex; flex-direction: column; gap: 12px; max-height: 70vh; overflow-y: auto;">
          <div style="font-size: 12px; color: #6ee7b7; background: rgba(16, 185, 129, 0.1); border: 1px solid rgba(16, 185, 129, 0.25); border-radius: 6px; padding: 8px 12px;">
            Editing <strong>${this.escapeHtml(log.type || log.sheetName)}</strong> (Row ${log.rowIndex} in <em>${this.escapeHtml(log.sheetName)}</em>)
          </div>

          <div>
            <label style="display: block; font-size: 11px; font-weight: 700; color: var(--text-muted); text-transform: uppercase; margin-bottom: 4px;">Foreman Name</label>
            <input type="text" id="edit-log-foreman" value="${this.escapeHtml(log.foreman || '')}" style="width: 100%; background: var(--bg-primary); border: 1px solid var(--border-color); border-radius: 6px; padding: 8px 12px; color: var(--text-primary); font-size: 13px;" />
          </div>

          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
            <div>
              <label style="display: block; font-size: 11px; font-weight: 700; color: var(--text-muted); text-transform: uppercase; margin-bottom: 4px;">Job Number</label>
              <input type="text" id="edit-log-jobnum" value="${this.escapeHtml(log.jobNumber || '')}" style="width: 100%; background: var(--bg-primary); border: 1px solid var(--border-color); border-radius: 6px; padding: 8px 12px; color: var(--text-primary); font-size: 13px; font-family: monospace;" />
            </div>
            <div>
              <label style="display: block; font-size: 11px; font-weight: 700; color: var(--text-muted); text-transform: uppercase; margin-bottom: 4px;">Credited To</label>
              <input type="text" id="edit-log-credited" value="${this.escapeHtml(log.creditedTo || '')}" style="width: 100%; background: var(--bg-primary); border: 1px solid var(--border-color); border-radius: 6px; padding: 8px 12px; color: var(--text-primary); font-size: 13px; font-family: monospace;" />
            </div>
          </div>

          <div>
            <label style="display: block; font-size: 11px; font-weight: 700; color: var(--text-muted); text-transform: uppercase; margin-bottom: 4px;">Work / Report Date</label>
            <input type="text" id="edit-log-date" value="${this.escapeHtml(log.date || '')}" placeholder="MM/DD/YYYY" style="width: 100%; background: var(--bg-primary); border: 1px solid var(--border-color); border-radius: 6px; padding: 8px 12px; color: var(--text-primary); font-size: 13px;" />
          </div>

          <div>
            <label style="display: block; font-size: 11px; font-weight: 700; color: var(--text-muted); text-transform: uppercase; margin-bottom: 4px;">Status</label>
            <select id="edit-log-status" style="width: 100%; background: var(--bg-primary); border: 1px solid var(--border-color); border-radius: 6px; padding: 8px 12px; color: var(--text-primary); font-size: 13px;">
              <option value="Credited" ${log.status === 'Credited' ? 'selected' : ''}>Credited</option>
              <option value="Unknown Job" ${log.status === 'Unknown Job' ? 'selected' : ''}>Unknown Job</option>
              <option value="Duplicate" ${log.status === 'Duplicate' ? 'selected' : ''}>Duplicate</option>
              <option value="Error" ${log.status === 'Error' ? 'selected' : ''}>Error</option>
            </select>
          </div>

          <div>
            <label style="display: block; font-size: 11px; font-weight: 700; color: var(--text-muted); text-transform: uppercase; margin-bottom: 4px;">Notes / Correction Reason</label>
            <textarea id="edit-log-notes" rows="2" style="width: 100%; background: var(--bg-primary); border: 1px solid var(--border-color); border-radius: 6px; padding: 8px 12px; color: var(--text-primary); font-size: 12.5px; resize: vertical;">${this.escapeHtml(log.notes || '')}</textarea>
          </div>
        </div>

        <div style="padding: 12px 18px; border-top: 1px solid var(--border-color); background: rgba(0,0,0,0.2); display: flex; align-items: center; justify-content: flex-end; gap: 8px;">
          <button class="btn btn-secondary" onclick="document.getElementById('edit-log-entry-modal').remove()">Cancel</button>
          <button class="btn btn-primary" onclick="window.safetyComplianceEngine.saveLogEntryEdit('${this.escapeHtml(logId)}')" style="font-weight: 700; background: #10b981; border: none; padding: 8px 20px;">Save Changes</button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);
  }

  /**
   * Saves edits made to a log record, updates local DB and queues synchronization.
   */
  async saveLogEntryEdit(logId) {
    const log = (this.currentLogs || []).find(l => (l.id === logId || (l.sheetName + '_' + l.rowIndex) === logId));
    if (!log) return;

    const foreman = document.getElementById('edit-log-foreman')?.value.trim() || '';
    const jobNum = document.getElementById('edit-log-jobnum')?.value.trim() || '';
    const credited = document.getElementById('edit-log-credited')?.value.trim() || '';
    const dateStr = document.getElementById('edit-log-date')?.value.trim() || '';
    const status = document.getElementById('edit-log-status')?.value.trim() || 'Credited';
    const notes = document.getElementById('edit-log-notes')?.value.trim() || '';

    // Update in-memory log
    log.foreman = foreman;
    log.jobNumber = jobNum;
    log.creditedTo = credited;
    log.date = dateStr;
    log.status = status;
    log.notes = notes;

    // Queue mutations to sync back to Google Sheets
    if (window.syncEngine && log.sheetName && log.rowIndex > 1) {
      if (log.sheetName === 'JHA Log') {
        // Col B (2)=Date, C (3)=JobNum, D (4)=Foreman, H (8)=Status, I (9)=CreditedTo, J (10)=Notes
        if (dateStr) window.syncEngine.addMutation({ action: 'UPDATE_CELL', sheetName: log.sheetName, row: log.rowIndex, col: 2, value: dateStr });
        window.syncEngine.addMutation({ action: 'UPDATE_CELL', sheetName: log.sheetName, row: log.rowIndex, col: 3, value: jobNum });
        window.syncEngine.addMutation({ action: 'UPDATE_CELL', sheetName: log.sheetName, row: log.rowIndex, col: 4, value: foreman });
        window.syncEngine.addMutation({ action: 'UPDATE_CELL', sheetName: log.sheetName, row: log.rowIndex, col: 8, value: status });
        window.syncEngine.addMutation({ action: 'UPDATE_CELL', sheetName: log.sheetName, row: log.rowIndex, col: 9, value: credited });
        window.syncEngine.addMutation({ action: 'UPDATE_CELL', sheetName: log.sheetName, row: log.rowIndex, col: 10, value: notes });
      } else if (log.sheetName === 'Weekly Safety Log') {
        // Col B (2)=Week Of, C (3)=JobNum, D (4)=Foreman, G (7)=Status, H (8)=CreditedTo, I (9)=Notes
        if (dateStr) window.syncEngine.addMutation({ action: 'UPDATE_CELL', sheetName: log.sheetName, row: log.rowIndex, col: 2, value: dateStr });
        window.syncEngine.addMutation({ action: 'UPDATE_CELL', sheetName: log.sheetName, row: log.rowIndex, col: 3, value: jobNum });
        window.syncEngine.addMutation({ action: 'UPDATE_CELL', sheetName: log.sheetName, row: log.rowIndex, col: 4, value: foreman });
        window.syncEngine.addMutation({ action: 'UPDATE_CELL', sheetName: log.sheetName, row: log.rowIndex, col: 7, value: status });
        window.syncEngine.addMutation({ action: 'UPDATE_CELL', sheetName: log.sheetName, row: log.rowIndex, col: 8, value: credited });
        window.syncEngine.addMutation({ action: 'UPDATE_CELL', sheetName: log.sheetName, row: log.rowIndex, col: 9, value: notes });
      } else if (log.sheetName === 'Monthly Checklist Log') {
        // Col B (2)=Report Date, C (3)=JobNum, D (4)=Foreman, H (8)=Status, I (9)=CreditedTo, K (11)=Notes
        if (dateStr) window.syncEngine.addMutation({ action: 'UPDATE_CELL', sheetName: log.sheetName, row: log.rowIndex, col: 2, value: dateStr });
        window.syncEngine.addMutation({ action: 'UPDATE_CELL', sheetName: log.sheetName, row: log.rowIndex, col: 3, value: jobNum });
        window.syncEngine.addMutation({ action: 'UPDATE_CELL', sheetName: log.sheetName, row: log.rowIndex, col: 4, value: foreman });
        window.syncEngine.addMutation({ action: 'UPDATE_CELL', sheetName: log.sheetName, row: log.rowIndex, col: 8, value: status });
        window.syncEngine.addMutation({ action: 'UPDATE_CELL', sheetName: log.sheetName, row: log.rowIndex, col: 9, value: credited });
        window.syncEngine.addMutation({ action: 'UPDATE_CELL', sheetName: log.sheetName, row: log.rowIndex, col: 11, value: notes });
      }
    }

    // Close edit modal
    const editModal = document.getElementById('edit-log-entry-modal');
    if (editModal) editModal.remove();

    // Re-render table
    const container = document.getElementById('safety-logs-table-container');
    if (container) {
      container.innerHTML = this.renderLogsTableHtml();
      this.updateLogCountIndicator();
    }
  }

  /**
   * Fallback extractor that reads existing safety logs from localDB snapshot tables.
   */
  extractLogsFromLocalDB() {
    const snap = window.localDB ? window.localDB.getSnapshot() : null;
    if (!snap || !snap.tables) return [];
    const all = [];

    function buildLogUrl(subject, emailId, jobNum, type) {
      if (subject && String(subject).trim()) {
        return `https://mail.google.com/mail/#search/${encodeURIComponent('subject:"' + String(subject).trim() + '"')}`;
      }
      if (emailId) {
        const baseId = String(emailId).trim().split('_')[0];
        if (baseId) return `https://mail.google.com/mail/#all/${baseId}`;
      }
      if (jobNum) {
        return `https://mail.google.com/mail/#search/${encodeURIComponent(jobNum + (type ? (' ' + type) : ''))}`;
      }
      return '';
    }

    function getLogRowDateReceived(row) {
      if (!row) return '';
      const v = row['Date Received'] || row['Date Recieved'] || row['date_received'] || row['date_recieved'] ||
                row['Date_Received'] || row['Date_Recieved'] || row.dateReceived || row.dateRecieved ||
                row['Received'] || row['received'] || '';
      if (!v && v !== 0) return '';
      if (v instanceof Date) {
        const m = String(v.getMonth() + 1).padStart(2, '0');
        const d = String(v.getDate()).padStart(2, '0');
        const y = v.getFullYear();
        const hr = String(v.getHours()).padStart(2, '0');
        const mn = String(v.getMinutes()).padStart(2, '0');
        return (v.getHours() !== 0 || v.getMinutes() !== 0) ? `${m}/${d}/${y} ${hr}:${mn}` : `${m}/${d}/${y}`;
      }
      return String(v).trim();
    }

    // JHA Log
    const jhaTbl = snap.tables.jha_log;
    if (jhaTbl && jhaTbl.rows) {
      [...jhaTbl.rows].reverse().forEach((r, idx) => {
        const emailId = r['Email ID'] || r.email_id || '';
        const subject = r['Email Subject'] || r.email_subject || '';
        const jobNum = r['Job Number'] || r.job_number || '';
        all.push({
          id: 'jha_' + (r._rowIdx || (idx + 1)),
          sheetName: 'JHA Log',
          type: 'JHA',
          rowIndex: r._rowIdx || (idx + 2),
          dateReceived: getLogRowDateReceived(r),
          date: r['Date Created'] || r['Date Completed'] || r['Work Date'] || r.date || '',
          jobNumber: jobNum,
          foreman: r['Foreman'] || '',
          subject: subject,
          emailId: emailId,
          gmailUrl: buildLogUrl(subject, emailId, jobNum, 'JHA'),
          status: r['Status'] || 'Credited',
          creditedTo: r['Credited To'] || '',
          notes: r['Notes'] || ''
        });
      });
    }

    // Weekly Safety Log
    const wklyTbl = snap.tables.weekly_safety_log;
    if (wklyTbl && wklyTbl.rows) {
      [...wklyTbl.rows].reverse().forEach((r, idx) => {
        const emailId = r['Email ID'] || r.email_id || '';
        const subject = r['Email Subject'] || r.email_subject || '';
        const jobNum = r['Job Number'] || r.job_number || '';
        all.push({
          id: 'weekly_' + (r._rowIdx || (idx + 1)),
          sheetName: 'Weekly Safety Log',
          type: 'Weekly Safety Meeting',
          rowIndex: r._rowIdx || (idx + 2),
          dateReceived: getLogRowDateReceived(r),
          date: r['Week Of'] || '',
          jobNumber: jobNum,
          foreman: r['Foreman'] || '',
          subject: subject,
          emailId: emailId,
          gmailUrl: buildLogUrl(subject, emailId, jobNum, 'Safety Meeting'),
          status: r['Status'] || 'Credited',
          creditedTo: r['Credited To'] || '',
          notes: r['Notes'] || ''
        });
      });
    }

    // Monthly Checklist Log
    const monTbl = snap.tables.monthly_checklist_log;
    if (monTbl && monTbl.rows) {
      [...monTbl.rows].reverse().forEach((r, idx) => {
        const emailId = r['Email ID'] || r.email_id || '';
        const subject = r['Email Subject'] || r.email_subject || '';
        const jobNum = r['Job Number'] || r.job_number || '';
        all.push({
          id: 'monthly_' + (r._rowIdx || (idx + 1)),
          sheetName: 'Monthly Checklist Log',
          type: 'Monthly Checklist',
          rowIndex: r._rowIdx || (idx + 2),
          dateReceived: getLogRowDateReceived(r),
          date: r['Report Date'] || '',
          jobNumber: jobNum,
          foreman: r['Foreman'] || '',
          vehicleNumber: r['Vehicle Number'] || '',
          subject: subject,
          emailId: emailId,
          gmailUrl: buildLogUrl(subject, emailId, jobNum, 'Safety Checklist'),
          status: r['Status'] || 'Credited',
          creditedTo: r['Credited To'] || '',
          hasEquipmentIssues: r['Has Equipment Issues'] || 'No',
          notes: r['Notes'] || ''
        });
      });
    }

    return all;
  }

  /**
   * Opens the Safety Logs viewer modal directly from the toolbar.
   */
  openSafetyLogsModal() {
    this.isProcessing = false;
    this.currentLogs = this.extractLogsFromLocalDB();
    this.activeCategoryFilter = 'all';
    this.selectedMonthFilter = 'all';
    this.activeSortOption = 'date_desc';
    this.searchQuery = '';

    const modal = document.getElementById('process-safety-emails-modal');
    const modalBox = document.getElementById('process-safety-emails-modal-box');
    const titleEl = document.getElementById('process-safety-emails-modal-title');
    const iconEl = document.getElementById('process-safety-emails-modal-icon');
    const body = document.getElementById('process-safety-emails-modal-body');
    const footer = document.getElementById('process-safety-emails-modal-footer');
    if (!modal || !body) return;

    if (modalBox) modalBox.style.maxWidth = '1120px';
    if (titleEl) titleEl.textContent = 'Safety Documentation & Complete Audit Log';
    if (iconEl) iconEl.textContent = '📋';

    modal.style.display = 'flex';

    const jhaCount = this.currentLogs.filter(l => l.type === 'JHA').length;
    const weeklyCount = this.currentLogs.filter(l => l.type === 'Weekly Safety Meeting').length;
    const monthlyCount = this.currentLogs.filter(l => l.type === 'Monthly Checklist').length;

    this.renderCompletionModalContent(body, {
      totalThreads: this.currentLogs.length,
      totalLogs: this.currentLogs.length,
      cumulativeLogs: { jha: jhaCount, weekly: weeklyCount, monthly: monthlyCount },
      totalIssues: this.currentLogs.filter(l => l.hasEquipmentIssues === 'Yes').length
    });

    if (footer) {
      footer.innerHTML = `
        <button class="btn btn-secondary" onclick="window.safetyComplianceEngine.closeProcessEmailsModal()">Close</button>
      `;
    }
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
window.SafetyEmailsEngine = SafetyEmailsEngine;
