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

      const totalLogs = (cumulativeLogs.jha || 0) + (cumulativeLogs.weekly || 0) + (cumulativeLogs.monthly || 0);

      if (body) {
        body.innerHTML = `
          <div style="display: flex; flex-direction: column; gap: 16px;">
            <div style="background: linear-gradient(135deg, rgba(16, 185, 129, 0.15) 0%, rgba(5, 150, 105, 0.05) 100%); border: 1px solid rgba(16, 185, 129, 0.4); border-radius: 8px; padding: 16px 20px; text-align: center;">
              <div style="font-size: 32px; margin-bottom: 8px;">✅</div>
              <h3 style="color: #6ee7b7; font-size: 16px; font-weight: 800; margin-bottom: 4px;">Safety Emails Successfully Processed!</h3>
              <p style="color: var(--text-secondary); font-size: 12.5px; margin: 0;">
                Gmail scanning completed. All new logs and compliance scores have been updated directly in the app.
              </p>
            </div>

            <!-- Processing Results Breakdown -->
            <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px;">
              <div style="background: var(--bg-primary); border: 1px solid var(--border-color); border-radius: 6px; padding: 12px 16px;">
                <div style="font-size: 11px; color: var(--text-muted); text-transform: uppercase; font-weight: 600;">📬 Total Emails Scanned</div>
                <div style="font-size: 20px; font-weight: 800; color: #f8fafc; margin-top: 2px;">${totalThreads || totalProcessed + totalSkipped}</div>
              </div>
              <div style="background: var(--bg-primary); border: 1px solid var(--border-color); border-radius: 6px; padding: 12px 16px;">
                <div style="font-size: 11px; color: var(--text-muted); text-transform: uppercase; font-weight: 600;">✨ New Logs Created</div>
                <div style="font-size: 20px; font-weight: 800; color: #34d399; margin-top: 2px;">+${totalLogs}</div>
              </div>
              <div style="background: var(--bg-primary); border: 1px solid var(--border-color); border-radius: 6px; padding: 12px 16px;">
                <div style="font-size: 11px; color: var(--text-muted); text-transform: uppercase; font-weight: 600;">📋 Daily JHAs Logged</div>
                <div style="font-size: 16px; font-weight: 700; color: #60a5fa; margin-top: 2px;">+${cumulativeLogs.jha || 0}</div>
              </div>
              <div style="background: var(--bg-primary); border: 1px solid var(--border-color); border-radius: 6px; padding: 12px 16px;">
                <div style="font-size: 11px; color: var(--text-muted); text-transform: uppercase; font-weight: 600;">🗣️ Weekly Meetings Logged</div>
                <div style="font-size: 16px; font-weight: 700; color: #a78bfa; margin-top: 2px;">+${cumulativeLogs.weekly || 0}</div>
              </div>
              <div style="background: var(--bg-primary); border: 1px solid var(--border-color); border-radius: 6px; padding: 12px 16px;">
                <div style="font-size: 11px; color: var(--text-muted); text-transform: uppercase; font-weight: 600;">🚛 Monthly Checklists Logged</div>
                <div style="font-size: 16px; font-weight: 700; color: #34d399; margin-top: 2px;">+${cumulativeLogs.monthly || 0}</div>
              </div>
              <div style="background: var(--bg-primary); border: 1px solid var(--border-color); border-radius: 6px; padding: 12px 16px;">
                <div style="font-size: 11px; color: var(--text-muted); text-transform: uppercase; font-weight: 600;">⚠️ Equipment Needs Logged</div>
                <div style="font-size: 16px; font-weight: 700; color: #f59e0b; margin-top: 2px;">+${totalIssues}</div>
              </div>
            </div>
          </div>
        `;
      }

      if (footer) {
        footer.innerHTML = `
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
