/**
 * Safety Assistant Desktop - Safety Email Processing Engine
 * Handles Gmail scanning for JHAs, Weekly Safety Meetings, and Monthly Checklists directly from the Desktop App.
 */

class SafetyEmailsEngine {
  constructor(db) {
    this.db = db;
    this.isProcessing = false;
  }

  init() {
    console.log('SafetyEmailsEngine initialized');
  }

  openProcessEmailsModal() {
    const modal = document.getElementById('process-safety-emails-modal');
    const body = document.getElementById('process-safety-emails-modal-body');
    const footer = document.getElementById('process-safety-emails-modal-footer');
    if (!modal || !body) return;

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

        <!-- Advanced Options -->
        <div style="display: flex; align-items: center; justify-content: space-between; padding: 0 4px;">
          <label style="display: flex; align-items: center; gap: 8px; font-size: 12px; color: var(--text-secondary); cursor: pointer;">
            <input type="checkbox" id="proc-fast-mode" style="accent-color: #10b981;">
            <span>⚡ Fast Mode (Skip full PDF OCR text extraction to speed up scan)</span>
          </label>
        </div>
      </div>
    `;

    if (footer) {
      footer.innerHTML = `
        <button class="btn btn-secondary" onclick="window.safetyComplianceEngine.closeProcessEmailsModal()">Cancel</button>
        <button class="btn btn-primary" id="btn-start-process-emails" onclick="window.safetyComplianceEngine.runProcessEmails()" style="font-weight: 700; background: linear-gradient(135deg, #10b981 0%, #059669 100%); border: none; display: flex; align-items: center; gap: 6px; box-shadow: 0 2px 8px rgba(16, 185, 129, 0.4);">
          <span>🚀</span> Process Safety Emails Now
        </button>
      `;
    }

    modal.style.display = 'flex';
  }

  closeProcessEmailsModal() {
    const modal = document.getElementById('process-safety-emails-modal');
    if (modal) modal.style.display = 'none';
  }

  async runProcessEmails() {
    if (this.isProcessing) return;

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

    const fastModeEl = document.getElementById('proc-fast-mode');
    const skipPdfExtraction = fastModeEl ? fastModeEl.checked : false;

    this.isProcessing = true;

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
        <button class="btn btn-secondary" disabled style="opacity: 0.5;">Processing...</button>
      `;
    }

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
      let finalResult = null;
      let batchIndex = 1;

      while (!isComplete) {
        console.log(`Executing safety email batch #${batchIndex}...`);
        const payload = {
          action: 'processSafetyEmails',
          daysBack: daysBack,
          batchSize: 50,
          reportTypeFilter: reportTypeFilter,
          newOnlyMode: newOnlyMode,
          skipPdfExtraction: skipPdfExtraction,
          endDate: endDate,
          isPostProcessing: isPostProcessing,
          prevResult: lastResult
        };

        const response = await window.syncEngine.executeNetworkRequest(syncUrl, 'POST', payload);
        console.log(`Safety email batch #${batchIndex} response:`, response);

        if (!response || !response.success) {
          throw new Error((response && response.error) ? response.error : 'Unknown server error during safety email batch.');
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

        // Check if finished
        if (response.complete === true) {
          isComplete = true;
          finalResult = res;
          finalSnapshot = response.snapshot || null;
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
        }

        batchIndex++;
      }

      // Update local database snapshot if fresh snapshot returned
      if (finalSnapshot) {
        await window.localDB.setSnapshot(finalSnapshot);
        if (window.sheetNavigator) {
          window.sheetNavigator.renderSafetyCompliance();
        }
      }

      // Save logs in memory
      this.currentLogs = (finalResult && finalResult.recentLogs && finalResult.recentLogs.length > 0)
        ? finalResult.recentLogs
        : this.extractLogsFromLocalDB();

      this.activeCategoryFilter = 'all';
      this.searchQuery = '';

      const totalLogs = (cumulativeLogs.jha || 0) + (cumulativeLogs.weekly || 0) + (cumulativeLogs.monthly || 0);

      if (body) {
        this.renderCompletionModalContent(body, {
          totalThreads: totalThreads || totalProcessed + totalSkipped,
          totalLogs: totalLogs,
          cumulativeLogs: cumulativeLogs,
          totalIssues: totalIssues
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

      window.syncEngine.updateStatusUI('synced', `Compliance updated (${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})`);

    } catch (err) {
      console.error('runProcessEmails error:', err);
      if (body) {
        body.innerHTML = `
          <div style="background: rgba(239, 68, 68, 0.1); border: 1px solid rgba(239, 68, 68, 0.3); border-radius: 8px; padding: 16px 20px;">
            <div style="font-size: 14px; font-weight: 700; color: #fca5a5; margin-bottom: 6px;">❌ Processing Error</div>
            <div style="font-size: 12.5px; color: var(--text-secondary); line-height: 1.5; margin-bottom: 12px;">
              ${this.escapeHtml(err.message)}
            </div>
            <div style="font-size: 11.5px; color: var(--text-muted);">
              Tip: Verify that your Google Account has Gmail permissions enabled for the Apps Script project.
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
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Renders the interactive completion view with clickable category cards and live drill-down log table.
   */
  renderCompletionModalContent(container, stats) {
    container.innerHTML = `
      <div style="display: flex; flex-direction: column; gap: 14px;">
        <div style="background: linear-gradient(135deg, rgba(16, 185, 129, 0.15) 0%, rgba(5, 150, 105, 0.05) 100%); border: 1px solid rgba(16, 185, 129, 0.4); border-radius: 8px; padding: 12px 18px; text-align: center;">
          <div style="font-size: 24px; margin-bottom: 4px;">✅</div>
          <h3 style="color: #6ee7b7; font-size: 15px; font-weight: 800; margin-bottom: 2px;">Safety Emails Successfully Processed!</h3>
          <p style="color: var(--text-secondary); font-size: 12px; margin: 0;">
            Click on any card below to view logged items, inspect original email PDFs, or correct typos.
          </p>
        </div>

        <!-- Interactive Summary Breakdown Cards -->
        <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px;">
          <div class="stat-card-clickable ${this.activeCategoryFilter === 'all' ? 'active' : ''}" onclick="window.safetyComplianceEngine.setCategoryFilter('all')" style="background: var(--bg-primary); border: 1px solid var(--border-color); border-radius: 6px; padding: 10px 14px;">
            <span class="view-hint">🔍 View</span>
            <div style="font-size: 10.5px; color: var(--text-muted); text-transform: uppercase; font-weight: 600;">✨ All Logs</div>
            <div style="font-size: 18px; font-weight: 800; color: #34d399; margin-top: 2px;">+${stats.totalLogs}</div>
          </div>
          <div class="stat-card-clickable ${this.activeCategoryFilter === 'jha' ? 'active' : ''}" onclick="window.safetyComplianceEngine.setCategoryFilter('jha')" style="background: var(--bg-primary); border: 1px solid var(--border-color); border-radius: 6px; padding: 10px 14px;">
            <span class="view-hint">🔍 View</span>
            <div style="font-size: 10.5px; color: var(--text-muted); text-transform: uppercase; font-weight: 600;">📋 Daily JHAs</div>
            <div style="font-size: 18px; font-weight: 700; color: #60a5fa; margin-top: 2px;">+${stats.cumulativeLogs.jha || 0}</div>
          </div>
          <div class="stat-card-clickable ${this.activeCategoryFilter === 'weekly' ? 'active' : ''}" onclick="window.safetyComplianceEngine.setCategoryFilter('weekly')" style="background: var(--bg-primary); border: 1px solid var(--border-color); border-radius: 6px; padding: 10px 14px;">
            <span class="view-hint">🔍 View</span>
            <div style="font-size: 10.5px; color: var(--text-muted); text-transform: uppercase; font-weight: 600;">🗣️ Weekly Meetings</div>
            <div style="font-size: 18px; font-weight: 700; color: #a78bfa; margin-top: 2px;">+${stats.cumulativeLogs.weekly || 0}</div>
          </div>
          <div class="stat-card-clickable ${this.activeCategoryFilter === 'monthly' ? 'active' : ''}" onclick="window.safetyComplianceEngine.setCategoryFilter('monthly')" style="background: var(--bg-primary); border: 1px solid var(--border-color); border-radius: 6px; padding: 10px 14px;">
            <span class="view-hint">🔍 View</span>
            <div style="font-size: 10.5px; color: var(--text-muted); text-transform: uppercase; font-weight: 600;">🚛 Monthly Checklists</div>
            <div style="font-size: 18px; font-weight: 700; color: #34d399; margin-top: 2px;">+${stats.cumulativeLogs.monthly || 0}</div>
          </div>
          <div class="stat-card-clickable ${this.activeCategoryFilter === 'equipment' ? 'active' : ''}" onclick="window.safetyComplianceEngine.setCategoryFilter('equipment')" style="background: var(--bg-primary); border: 1px solid var(--border-color); border-radius: 6px; padding: 10px 14px;">
            <span class="view-hint">🔍 View</span>
            <div style="font-size: 10.5px; color: var(--text-muted); text-transform: uppercase; font-weight: 600;">⚠️ Equipment Needs</div>
            <div style="font-size: 18px; font-weight: 700; color: #f59e0b; margin-top: 2px;">+${stats.totalIssues}</div>
          </div>
          <div class="stat-card-clickable" onclick="window.safetyComplianceEngine.setCategoryFilter('all')" style="background: var(--bg-primary); border: 1px solid var(--border-color); border-radius: 6px; padding: 10px 14px;">
            <div style="font-size: 10.5px; color: var(--text-muted); text-transform: uppercase; font-weight: 600;">📬 Total Emails</div>
            <div style="font-size: 18px; font-weight: 800; color: #f8fafc; margin-top: 2px;">${stats.totalThreads}</div>
          </div>
        </div>

        <!-- Filter bar & search -->
        <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-top: 2px;">
          <input type="text" id="safety-log-search" placeholder="🔍 Search foreman, job #, date..." value="${this.escapeHtml(this.searchQuery)}" oninput="window.safetyComplianceEngine.onSearchInput(this.value)" style="flex: 1; background: var(--bg-primary); border: 1px solid var(--border-color); border-radius: 6px; padding: 6px 12px; color: var(--text-primary); font-size: 12px;" />
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
      // Re-render table and update active card styles
      const cards = body.querySelectorAll('.stat-card-clickable');
      cards.forEach(card => card.classList.remove('active'));
      const container = document.getElementById('safety-logs-table-container');
      if (container) {
        container.innerHTML = this.renderLogsTableHtml();
        this.updateLogCountIndicator();
      }
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
    if (this.activeCategoryFilter === 'jha') {
      logs = logs.filter(l => l.type === 'JHA' || l.sheetName === 'JHA Log');
    } else if (this.activeCategoryFilter === 'weekly') {
      logs = logs.filter(l => l.type === 'Weekly Safety Meeting' || l.sheetName === 'Weekly Safety Log');
    } else if (this.activeCategoryFilter === 'monthly') {
      logs = logs.filter(l => l.type === 'Monthly Checklist' || l.sheetName === 'Monthly Checklist Log');
    } else if (this.activeCategoryFilter === 'equipment') {
      logs = logs.filter(l => l.hasEquipmentIssues === 'Yes' || l.type === 'Equipment');
    }

    if (this.searchQuery && this.searchQuery.trim()) {
      const q = this.searchQuery.toLowerCase().trim();
      logs = logs.filter(l => {
        return (l.foreman && l.foreman.toLowerCase().includes(q)) ||
               (l.jobNumber && l.jobNumber.toLowerCase().includes(q)) ||
               (l.creditedTo && l.creditedTo.toLowerCase().includes(q)) ||
               (l.date && l.date.toLowerCase().includes(q)) ||
               (l.subject && l.subject.toLowerCase().includes(q)) ||
               (l.notes && l.notes.toLowerCase().includes(q));
      });
    }

    return logs;
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
            <th style="width: 110px;">Type</th>
            <th style="width: 85px;">Date</th>
            <th style="width: 75px;">Job #</th>
            <th>Foreman</th>
            <th style="width: 80px;">Credited</th>
            <th style="width: 75px;">Status</th>
            <th style="width: 155px; text-align: center;">Actions</th>
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
                <td style="font-weight: 600; color: #f8fafc;">${this.escapeHtml(log.date || log.dateReceived || '—')}</td>
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
                    ${log.gmailUrl ? `
                      <a href="${this.escapeHtml(log.gmailUrl)}" target="_blank" class="btn-pdf-link" title="Open Gmail thread with attached PDF">
                        📄 View PDF
                      </a>
                    ` : `
                      <button class="btn-pdf-link" disabled style="opacity: 0.4; cursor: not-allowed;" title="No Gmail ID">
                        📄 PDF
                      </button>
                    `}
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

    // JHA Log
    const jhaTbl = snap.tables.jha_log;
    if (jhaTbl && jhaTbl.rows) {
      jhaTbl.rows.slice(-100).reverse().forEach((r, idx) => {
        const emailId = r['Email ID'] || r.email_id || '';
        const subject = r['Email Subject'] || r.email_subject || '';
        const jobNum = r['Job Number'] || r.job_number || '';
        all.push({
          id: 'jha_' + (r._rowIdx || (idx + 1)),
          sheetName: 'JHA Log',
          type: 'JHA',
          rowIndex: r._rowIdx || (idx + 2),
          dateReceived: r['Date Received'] || '',
          date: r['Date Created'] || '',
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
      wklyTbl.rows.slice(-100).reverse().forEach((r, idx) => {
        const emailId = r['Email ID'] || r.email_id || '';
        const subject = r['Email Subject'] || r.email_subject || '';
        const jobNum = r['Job Number'] || r.job_number || '';
        all.push({
          id: 'weekly_' + (r._rowIdx || (idx + 1)),
          sheetName: 'Weekly Safety Log',
          type: 'Weekly Safety Meeting',
          rowIndex: r._rowIdx || (idx + 2),
          dateReceived: r['Date Received'] || '',
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
      monTbl.rows.slice(-100).reverse().forEach((r, idx) => {
        const emailId = r['Email ID'] || r.email_id || '';
        const subject = r['Email Subject'] || r.email_subject || '';
        const jobNum = r['Job Number'] || r.job_number || '';
        all.push({
          id: 'monthly_' + (r._rowIdx || (idx + 1)),
          sheetName: 'Monthly Checklist Log',
          type: 'Monthly Checklist',
          rowIndex: r._rowIdx || (idx + 2),
          dateReceived: r['Date Received'] || '',
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
    this.currentLogs = this.extractLogsFromLocalDB();
    this.activeCategoryFilter = 'all';
    this.searchQuery = '';

    const modal = document.getElementById('process-safety-emails-modal');
    const body = document.getElementById('process-safety-emails-modal-body');
    const footer = document.getElementById('process-safety-emails-modal-footer');
    if (!modal || !body) return;

    modal.classList.remove('hidden');

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
