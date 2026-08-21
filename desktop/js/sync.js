/**
 * sync.js - Google Sheets Synchronization Client with Live Offline Changes Modal
 */

class SyncEngine {
  constructor(db) {
    this.db = db;
    this.syncUrl = localStorage.getItem('sa_sync_url') || '';
    this.isSyncing = false;
  }

  getSyncUrl() {
    return this.syncUrl;
  }

  setSyncUrl(url) {
    this.syncUrl = (url || '').trim();
    localStorage.setItem('sa_sync_url', this.syncUrl);
  }

  async testConnection() {
    if (!this.syncUrl) return { success: false, message: 'Please enter your Google Apps Script Web App URL.' };
    
    if (this.syncUrl.includes('docs.google.com/spreadsheets')) {
      return { 
        success: false, 
        message: 'You entered a Google Spreadsheet link instead of the Apps Script Web App URL.\n\nTo get your Web App URL:\n1. Open your Google Sheet\n2. Click Extensions > Apps Script\n3. Click Deploy (top right) > Manage Deployments (or New Deployment > Web App)\n4. Copy the Web App URL (starts with https://script.google.com/macros/s/.../exec)' 
      };
    }

    try {
      const resp = await fetch(`${this.syncUrl}?action=ping`, { method: 'GET' });
      const text = await resp.text();
      try {
        const data = JSON.parse(text);
        return { success: data.status === 'ok', data };
      } catch (parseErr) {
        return { 
          success: false, 
          message: 'The URL did not return a valid Apps Script response. Make sure the Web App deployment has "Who has access" set to "Anyone".' 
        };
      }
    } catch (e) {
      return { success: false, message: e.message };
    }
  }

  formatMutation(mut) {
    if (!mut) return { title: 'Unknown Change', desc: '', icon: '✏️', sheet: 'System', time: '' };
    const timeStr = mut.timestamp ? new Date(mut.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '';
    
    if (mut.action === 'UPDATE_CELL') {
      const sheet = mut.sheetName || 'Sheet';
      const col = mut.colName || `Column ${mut.col}`;
      const row = mut.row;
      const oldVal = mut.oldValue !== undefined && mut.oldValue !== null && String(mut.oldValue).trim() !== '' ? `"${mut.oldValue}"` : 'empty';
      const newVal = mut.value !== undefined && mut.value !== null && String(mut.value).trim() !== '' ? `"${mut.value}"` : 'empty';
      
      return {
        icon: '✏️',
        sheet: sheet,
        title: `Row ${row} • ${col}`,
        desc: `${oldVal} → <strong style="color: #60a5fa;">${newVal}</strong>`,
        time: timeStr
      };
    }
    
    if (mut.action === 'UPDATE_JOB_TRACKING') {
      return {
        icon: '📋',
        sheet: 'Job Tracking',
        title: `Job #${mut.jobNumber || 'N/A'} • ${mut.field || 'Field'}`,
        desc: `Updated to <strong style="color: #60a5fa;">"${mut.value}"</strong>`,
        time: timeStr
      };
    }

    if (mut.action === 'SCHEDULE_CREW_VISIT') {
      return {
        icon: '🗺️',
        sheet: 'Trip Planner',
        title: `Scheduled Crew Visit`,
        desc: `Visit for <strong style="color: #60a5fa;">${mut.jobLocation || mut.location}</strong> on <strong>${mut.scheduledDate}</strong>`,
        time: timeStr
      };
    }

    if (mut.action === 'UNSCHEDULE_CREW_VISIT') {
      return {
        icon: '🗑️',
        sheet: 'Trip Planner',
        title: `Unscheduled Visit`,
        desc: `Removed visit for <strong>${mut.jobLocation || mut.location}</strong> on ${mut.date}`,
        time: timeStr
      };
    }

    if (mut.action === 'SAVE_TASK') {
      return {
        icon: '📅',
        sheet: 'Tasks & Calendar',
        title: mut.taskTitle || 'Task',
        desc: `${mut.taskType || 'Task'} scheduled for <strong>${mut.scheduledDate || 'Date'}</strong>`,
        time: timeStr
      };
    }

    if (mut.action === 'SET_HOLIDAYS') {
      return {
        icon: '🏖️',
        sheet: 'Trip Planner',
        title: 'Holiday Calendar',
        desc: 'Updated holiday/blackout dates',
        time: timeStr
      };
    }

    if (mut.action === 'ADD_LOCATION_OVERRIDE') {
      return {
        icon: '📍',
        sheet: 'Trip Planner',
        title: 'Location Override',
        desc: `Set override for ${mut.location} to ${mut.destination}`,
        time: timeStr
      };
    }

    if (mut.action === 'IMPORT_HISTORY_LOG') {
      return {
        icon: '📥',
        sheet: `${mut.equipmentType || 'Equipment'} History`,
        title: `Imported Log • Item #${mut.itemNum}`,
        desc: `Imported multi-line history assignment log`,
        time: timeStr
      };
    }

    return {
      icon: '🔄',
      sheet: mut.sheetName || 'System',
      title: mut.action || 'Change',
      desc: JSON.stringify(mut).substring(0, 80),
      time: timeStr
    };
  }

  openSyncModal(title = 'Syncing Offline Changes', icon = '🔄') {
    const modal = document.getElementById('sync-modal');
    const titleEl = document.getElementById('sync-modal-title');
    const iconEl = document.getElementById('sync-modal-icon');
    if (!modal) return;
    if (titleEl) titleEl.textContent = title;
    if (iconEl) iconEl.textContent = icon;
    modal.classList.add('active');
  }

  closeSyncModal() {
    const modal = document.getElementById('sync-modal');
    if (modal) modal.classList.remove('active');
  }

  renderModalChanges(outbox, statusMessage, statusType = 'syncing', allowClear = false) {
    const body = document.getElementById('sync-modal-body');
    const clearBtn = document.getElementById('sync-modal-clear-btn');
    if (!body) return;

    if (clearBtn) {
      clearBtn.style.display = outbox.length > 0 ? 'inline-block' : 'none';
    }

    let statusBg = 'rgba(59, 130, 246, 0.15); color: #60a5fa; border: 1px solid rgba(59, 130, 246, 0.3);';
    if (statusType === 'success') {
      statusBg = 'background-color: rgba(34, 197, 94, 0.15); color: #4ade80; border: 1px solid rgba(34, 197, 94, 0.3);';
    } else if (statusType === 'error') {
      statusBg = 'background-color: rgba(239, 68, 68, 0.15); color: #f87171; border: 1px solid rgba(239, 68, 68, 0.3);';
    } else if (statusType === 'info') {
      statusBg = 'background-color: var(--bg-tertiary); color: var(--text-secondary); border: 1px solid var(--border-color);';
    }

    let html = `
      <div style="padding: 10px 14px; border-radius: 8px; font-size: 13px; font-weight: 500; margin-bottom: 16px; display: flex; align-items: center; justify-content: space-between; ${statusBg}">
        <span>${statusMessage}</span>
        <span class="brand-badge" style="background: rgba(255,255,255,0.1);">${outbox.length} change${outbox.length === 1 ? '' : 's'}</span>
      </div>
    `;

    if (outbox.length === 0) {
      html += `
        <div style="padding: 30px; text-align: center; color: var(--text-muted);">
          <div style="font-size: 28px; margin-bottom: 8px;">✅</div>
          <div style="font-weight: 600; font-size: 14px;">No pending offline changes</div>
          <div style="font-size: 12px; margin-top: 4px;">All edits are fully in sync with Google Sheets.</div>
        </div>
      `;
    } else {
      html += `<div style="display: flex; flex-direction: column; gap: 8px;">`;
      outbox.forEach((mut, idx) => {
        const item = this.formatMutation(mut);
        html += `
          <div style="background-color: var(--bg-primary); border: 1px solid var(--border-color); border-radius: 8px; padding: 10px 14px; display: flex; align-items: flex-start; gap: 12px;">
            <div style="font-size: 16px; margin-top: 2px;">${item.icon}</div>
            <div style="flex: 1; min-width: 0;">
              <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 4px;">
                <div style="display: flex; align-items: center; gap: 6px;">
                  <span class="brand-badge" style="font-size: 10px; padding: 1px 6px;">${item.sheet}</span>
                  <span style="font-weight: 600; font-size: 12px; color: var(--text-primary);">${item.title}</span>
                </div>
                <span style="font-size: 10px; color: var(--text-muted);">${item.time}</span>
              </div>
              <div style="font-size: 12px; color: var(--text-secondary); word-break: break-word;">${item.desc}</div>
            </div>
          </div>
        `;
      });
      html += `</div>`;
    }

    body.innerHTML = html;
  }

  showPendingChangesModal() {
    const outbox = this.db.getOutbox();
    this.openSyncModal('Pending Offline Changes', '📋');
    this.renderModalChanges(
      outbox,
      outbox.length > 0 ? `Showing ${outbox.length} offline edit(s) waiting to sync` : 'All changes in sync',
      outbox.length > 0 ? 'info' : 'success',
      true
    );
  }

  async clearPendingOutbox() {
    if (confirm('Are you sure you want to discard all pending offline changes? They will not be pushed to Google Sheets.')) {
      await this.db.clearOutbox();
      this.showPendingChangesModal();
      this.updateStatusUI('synced', 'Outbox cleared');
    }
  }

  async syncWithGoogleSheets() {
    if (this.isSyncing) return;

    if (!this.syncUrl) {
      this.openSyncModal('Connect to Google Sheets', '⚙️');
      const body = document.getElementById('sync-modal-body');
      if (body) {
        body.innerHTML = `
          <div style="background-color: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: 8px; padding: 20px;">
            <h3 style="font-size: 14px; margin-bottom: 10px; color: #f8fafc;">Setup Google Sheets Sync</h3>
            <p style="font-size: 12px; color: var(--text-secondary); line-height: 1.5; margin-bottom: 14px;">
              To sync your offline changes and Trip Planner directly with Google Sheets, enter your Apps Script Web App URL below:
            </p>
            <div style="background: rgba(0,0,0,0.25); border: 1px solid rgba(255,255,255,0.06); border-radius: 6px; padding: 12px 14px; margin-bottom: 16px; font-size: 11.5px; color: #cbd5e1; line-height: 1.6;">
              <strong style="color: #60a5fa;">How to get your Web App URL in Google Sheets:</strong><br>
              1. In your Google Sheet, click <strong>Extensions > Apps Script</strong><br>
              2. Click <strong>Deploy</strong> (top right) > <strong>Manage Deployments</strong> (or <em>New Deployment > Web App</em>)<br>
              3. Set <em>"Who has access"</em> to <strong>"Anyone"</strong><br>
              4. Copy the Web App URL (starts with <code>https://script.google.com/macros/s/.../exec</code>)
            </div>
            <input type="text" id="modal-sync-url-input" class="sheet-search" style="width: 100%; margin-bottom: 14px;" placeholder="https://script.google.com/macros/s/.../exec">
            <div style="display: flex; justify-content: flex-end; gap: 8px;">
              <button class="btn btn-secondary" onclick="window.syncEngine.closeSyncModal()">Cancel</button>
              <button class="btn btn-primary" onclick="const val = document.getElementById('modal-sync-url-input').value; if(val){ window.syncEngine.setSyncUrl(val); const inEl = document.getElementById('sync-url-input'); if(inEl) inEl.value = val; window.syncEngine.syncWithGoogleSheets(); }">💾 Save & Sync Now</button>
            </div>
          </div>
        `;
      }
      return;
    }

    this.isSyncing = true;
    const outbox = [...(this.db.getOutbox() || [])];

    // If there are pending changes, show the modal listing them
    if (outbox.length > 0) {
      this.openSyncModal('Pushing Offline Changes', '🔄');
      this.renderModalChanges(outbox, `Pushing ${outbox.length} offline change(s) to Google Sheets...`, 'syncing', false);
    } else {
      this.updateStatusUI('syncing', 'Syncing with Google Sheets...');
    }

    try {
      // Step 1: If we have pending offline mutations, push them first
      if (outbox.length > 0 && this.syncUrl) {
        this.updateStatusUI('syncing', `Pushing ${outbox.length} offline change(s)...`);
        
        let pushResult = null;
        let pushSucceeded = false;

        // Attempt 1: Try HTTP POST
        try {
          const pushResp = await fetch(this.syncUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify({
              action: 'applyMutations',
              mutations: outbox,
              returnSnapshot: true
            })
          });
          const rawText = await pushResp.text();
          try {
            pushResult = JSON.parse(rawText);
            if (pushResult && (pushResult.success || pushResult.appliedCount !== undefined)) {
              pushSucceeded = true;
            }
          } catch (parseE) { /* ignore to try GET fallback */ }
        } catch (postE) {
          console.warn('POST sync attempt failed, trying GET fallback:', postE);
        }

        // Attempt 2: Fallback to HTTP GET (bypasses Google Apps Script POST auth issues)
        if (!pushSucceeded) {
          try {
            const getUrl = `${this.syncUrl}?action=applyMutations&mutations=${encodeURIComponent(JSON.stringify(outbox))}&returnSnapshot=true`;
            const getResp = await fetch(getUrl, { method: 'GET' });
            const rawGetText = await getResp.text();
            pushResult = JSON.parse(rawGetText);
            if (pushResult && (pushResult.success || pushResult.appliedCount !== undefined)) {
              pushSucceeded = true;
            }
          } catch (getE) {
            console.warn('GET sync fallback failed:', getE);
          }
        }

        if (pushResult && pushResult.errors && pushResult.errors.length > 0) {
          console.warn('Sync server errors:', pushResult.errors);
          this.renderModalChanges(outbox, `⚠️ Server error: ${pushResult.errors.join('; ')}`, 'error', true);
          this.updateStatusUI('pending', 'Sync error / Pending changes');
          this.isSyncing = false;
          return { success: false, errors: pushResult.errors };
        } else if (pushSucceeded && pushResult) {
          // Clear outbox once successfully sent to server
          await this.db.clearOutbox();

          // If the server returned the fresh snapshot in the same response, consume it immediately (single round-trip!)
          if (pushResult.snapshot && pushResult.snapshot.tables) {
            await this.db.setSnapshot(pushResult.snapshot);
            if (window.sheetNavigator) window.sheetNavigator.renderActiveView();
            if (window.historyNavigator) window.historyNavigator.renderCurrentHistory();
            if (window.tripPlanner) window.tripPlanner.renderPlanner();
            if (window.taskManager) window.taskManager.renderTasks();

            this.updateStatusUI('synced', `Synced (${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})`);
            this.renderModalChanges([], `✅ All ${outbox.length} changes pushed and latest database loaded!`, 'success', false);
            setTimeout(() => {
              this.closeSyncModal();
            }, 2500);

            this.isSyncing = false;
            return { success: true, snapshot: pushResult.snapshot };
          }

          this.renderModalChanges(outbox, `✅ Pushed ${outbox.length} change(s) successfully! Downloading fresh snapshot...`, 'success', false);
        } else {
          console.warn('Invalid server response during push:', pushResult);
          const msg = (pushResult && pushResult.error) ? pushResult.error : 'Web App returned non-JSON response. Please verify in Google Sheets: Extensions > Apps Script > Deploy > Manage deployments, and ensure "Who has access" is set to "Anyone".';
          this.renderModalChanges(outbox, `❌ Push failed: ${msg}`, 'error', true);
          this.updateStatusUI('pending', 'Sync failed / Pending changes');
          this.isSyncing = false;
          return { success: false, error: msg };
        }
      }

      // Step 2: Pull fresh database snapshot (for pull-only sync or fallback)
      if (this.syncUrl) {
        this.updateStatusUI('syncing', 'Downloading latest snapshot...');
        const getResp = await fetch(`${this.syncUrl}?action=getSnapshot`, { method: 'GET' });
        const rawText = await getResp.text();
        let freshSnapshot = null;
        try {
          freshSnapshot = JSON.parse(rawText);
        } catch (parseE) {
          console.warn('Failed to parse snapshot JSON:', parseE, rawText);
          throw new Error('Web App returned HTML/login redirect instead of JSON. In Google Sheets: go to Extensions > Apps Script > Deploy > Manage deployments > Edit > set "Who has access: Anyone" > Deploy.');
        }

        if (freshSnapshot && freshSnapshot.tables) {
          await this.db.setSnapshot(freshSnapshot);
          if (window.sheetNavigator) window.sheetNavigator.renderActiveView();
          if (window.historyNavigator) window.historyNavigator.renderCurrentHistory();
          if (window.tripPlanner) window.tripPlanner.renderPlanner();
          if (window.taskManager) window.taskManager.renderTasks();

          this.updateStatusUI('synced', `Synced (${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})`);
          
          if (outbox.length > 0) {
            this.renderModalChanges([], `✅ All ${outbox.length} changes pushed and latest database loaded!`, 'success', false);
            // Auto close modal after 2.5 seconds on success
            setTimeout(() => {
              this.closeSyncModal();
            }, 2500);
          }

          this.isSyncing = false;
          return { success: true, snapshot: freshSnapshot };
        } else if (freshSnapshot && freshSnapshot.error) {
          throw new Error(freshSnapshot.error);
        }
      }

      this.updateStatusUI('synced', 'Offline mode active');
      this.isSyncing = false;
      if (outbox.length > 0) {
        setTimeout(() => { this.closeSyncModal(); }, 2000);
      }
      return { success: true };

    } catch (err) {
      console.error('Sync failed:', err);
      const isAuthError = err.message && (err.message.includes('HTML') || err.message.includes('Anyone') || err.message.includes('deployments'));
      const statusLabel = isAuthError ? 'Auth Error (Check Web App Access)' : 'Offline / Connection error';
      this.updateStatusUI('offline', statusLabel);
      this.openSyncModal('Sync Error', '⚠️');
      this.renderModalChanges(outbox, `❌ Sync failed: ${err.message}`, 'error', true);
      this.isSyncing = false;
      return { success: false, error: err.message };
    }
  }

  async importLocalSnapshotFile() {
    if (window.desktopAPI) {
      const data = await window.desktopAPI.selectSnapshotFile();
      if (data && data.tables) {
        await this.db.setSnapshot(data);
        if (window.sheetNavigator) window.sheetNavigator.renderActiveView();
        if (window.historyNavigator) window.historyNavigator.renderCurrentHistory();
        if (window.tripPlanner) window.tripPlanner.renderPlanner();
        if (window.taskManager) window.taskManager.renderTasks();
        this.updateStatusUI('synced', 'Loaded local snapshot');
        return { success: true };
      } else if (data && data.error) {
        alert('Error loading file: ' + data.error);
      }
    }
    return { success: false };
  }

  updateStatusUI(status, label) {
    const dot = document.getElementById('sync-status-dot');
    const text = document.getElementById('sync-status-text');
    if (!dot || !text) return;

    dot.className = 'status-dot';
    if (status === 'syncing' || status === 'pending') dot.classList.add('pending');
    if (status === 'offline') dot.classList.add('offline');

    text.textContent = label;
  }
}

window.syncEngine = new SyncEngine(window.localDB);
