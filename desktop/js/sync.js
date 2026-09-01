/**
 * sync.js - Google Sheets Synchronization Client with Live Offline Changes Modal
 */

const DEFAULT_SYNC_URL = 'https://script.google.com/macros/s/AKfycbzkXtU3SM5OaY3_INM7WNIlpoOHaFAiHTxkVQ-aBycP8OPtagn-t4qI4EGvvGB0Si56/exec';

class SyncEngine {
  constructor(db) {
    this.db = db;
    let savedUrl = localStorage.getItem('sa_sync_url');
    // If savedUrl is missing, empty, or points to any old non-working deployment URL, auto-migrate to DEFAULT_SYNC_URL!
    if (!savedUrl || !savedUrl.includes('AKfycbzkXtU3SM5OaY3')) {
      savedUrl = DEFAULT_SYNC_URL;
      localStorage.setItem('sa_sync_url', DEFAULT_SYNC_URL);
    }
    this.syncUrl = savedUrl;
    this.isSyncing = false;
    if (this.db && typeof this.db.subscribe === 'function') {
      this.db.subscribe(() => this.renderOutboxBadge());
    }
    setTimeout(() => {
      this.renderOutboxBadge();
    }, 150);
  }

  getSyncUrl() {
    return this.syncUrl || DEFAULT_SYNC_URL;
  }

  setSyncUrl(url) {
    this.syncUrl = (url || '').trim() || DEFAULT_SYNC_URL;
    localStorage.setItem('sa_sync_url', this.syncUrl);
  }

  async executeNetworkRequest(url, method = 'GET', body = null) {
    // 1. If running inside Electron desktop app, use native Node HTTPS bridge
    if (window.desktopAPI && typeof window.desktopAPI.sendSyncRequest === 'function') {
      try {
        const res = await window.desktopAPI.sendSyncRequest({ url, method, body });
        if (res && res.success && res.data) {
          return res.data;
        } else if (res && res.data) {
          return res.data;
        } else if (res && res.error) {
          throw new Error(res.error);
        }
      } catch (ipcErr) {
        console.warn('Native Electron sync bridge error, trying browser fetch fallback:', ipcErr);
      }
    }

    // 2. Browser fetch fallback (with 300s timeout for safety email batch scanning)
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 300000);
    try {
      const options = { method, redirect: 'follow', signal: controller.signal };
      if (method === 'POST' && body) {
        options.headers = { 'Content-Type': 'text/plain;charset=utf-8' };
        options.body = typeof body === 'string' ? body : JSON.stringify(body);
      }
      const resp = await fetch(url, options);
      clearTimeout(timeoutId);
      const text = await resp.text();
      try {
        return JSON.parse(text);
      } catch (parseErr) {
        if (text.includes('<!DOCTYPE') || text.includes('<html')) {
          throw new Error('Google returned a login/access page. You can either:\n1. Click "📁 Import Snapshot" at the top and select SafetyAssistant_Sync_Snapshot.json from your Google Drive/Downloads, or\n2. In Google Sheets: Extensions > Apps Script > Deploy > Manage Deployments, ensure "Who has access" is set to "Anyone".');
        }
        throw parseErr;
      }
    } catch (fetchErr) {
      clearTimeout(timeoutId);
      if (fetchErr.name === 'AbortError') {
        throw new Error('Sync network request timed out after 180 seconds.');
      }
      throw fetchErr;
    }
  }

  async testConnection() {
    let activeUrl = this.syncUrl || DEFAULT_SYNC_URL;
    if (activeUrl.includes('docs.google.com/spreadsheets')) {
      return { 
        success: false, 
        message: 'You entered a Google Spreadsheet link instead of the Apps Script Web App URL.\n\nTo get your Web App URL:\n1. Open your Google Sheet\n2. Click Extensions > Apps Script\n3. Click Deploy (top right) > Manage Deployments (or New Deployment > Web App)\n4. Copy the Web App URL (starts with https://script.google.com/macros/s/.../exec)' 
      };
    }

    try {
      const data = await this.executeNetworkRequest(`${activeUrl}?action=ping`, 'GET');
      return { success: data && (data.status === 'ok' || data.success === true), data };
    } catch (e) {
      if (activeUrl !== DEFAULT_SYNC_URL) {
        try {
          const fallbackData = await this.executeNetworkRequest(`${DEFAULT_SYNC_URL}?action=ping`, 'GET');
          if (fallbackData && (fallbackData.status === 'ok' || fallbackData.success === true)) {
            this.setSyncUrl(DEFAULT_SYNC_URL);
            return { success: true, data: fallbackData };
          }
        } catch (fErr) { /* ignore */ }
      }
      return { 
        success: false, 
        message: e.message || 'Connection failed. Please ensure "Who has access" is set to "Anyone" in Deploy > Manage deployments.' 
      };
    }
  }

  formatMutation(mut) {
    if (!mut) return { title: 'Unknown Change', desc: '', icon: '✏️', sheet: 'System', time: '' };
    const timeStr = mut.timestamp ? new Date(mut.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '';
    const sheet = mut.sheetName || 'Sheet';

    // Resolve context from local db row or mutation payload
    let employeeName = mut.employeeName || mut.empName || '';
    let itemNumber = mut.itemNumber || mut.itemNum || mut.serialNum || mut.itemIdentifier || '';
    let certName = mut.certName || mut.certType || mut.itemType || '';
    let fieldHeader = mut.header || mut.colName || (mut.col ? `Column ${mut.col}` : 'Field');
    let rowData = mut.rowData || {};

    const tableKey = mut.tableKey || (this.db && typeof this.db.getTableKeyForSheet === 'function' ? this.db.getTableKeyForSheet(sheet) : sheet.toLowerCase().replace(/\s+/g, '_'));
    const table = this.db && typeof this.db.getTable === 'function' ? this.db.getTable(tableKey) : null;

    if (table && table.rows && mut.row && table.rows[mut.row - 2]) {
      const rowObj = table.rows[mut.row - 2];
      if (!employeeName) employeeName = rowObj['Employee Name'] || rowObj['Name'] || rowObj['Assigned To'] || rowObj['Worker'] || '';
      if (!itemNumber) itemNumber = rowObj['Item #'] || rowObj['Serial #'] || rowObj['Glove'] || rowObj['Sleeve'] || rowObj['Blanket'] || rowObj['MACK'] || '';
      if (!certName) certName = rowObj['Item Type'] || rowObj['Cert Type'] || rowObj['Type'] || '';
      if ((!mut.header || mut.header.startsWith('Column ')) && table.headers && mut.col && table.headers[mut.col - 1]) {
        fieldHeader = table.headers[mut.col - 1];
      }
    } else if (rowData && Object.keys(rowData).length > 0) {
      if (!employeeName) employeeName = rowData['Employee Name'] || rowData['Name'] || rowData['Assigned To'] || '';
      if (!itemNumber) itemNumber = rowData['Item #'] || rowData['Serial #'] || '';
      if (!certName) certName = rowData['Item Type'] || rowData['Cert Type'] || '';
    }

    if (mut.action === 'UPDATE_CELL') {
      const row = mut.row;
      const oldVal = mut.oldValue !== undefined && mut.oldValue !== null && String(mut.oldValue).trim() !== '' ? `"${mut.oldValue}"` : '(Empty)';
      const newVal = mut.value !== undefined && mut.value !== null && String(mut.value).trim() !== '' ? `"${mut.value}"` : '(Empty)';
      
      let title = '';
      let desc = '';

      if (employeeName && certName) {
        title = `👤 ${employeeName} — 📜 ${certName}`;
        desc = `<span style="color: var(--text-muted); font-size: 11px;">${fieldHeader} (Row ${row}):</span> ${oldVal} → <strong style="color: #60a5fa;">${newVal}</strong>`;
      } else if (employeeName) {
        title = `👤 ${employeeName} • ${fieldHeader}`;
        desc = `<span style="color: var(--text-muted); font-size: 11px;">Row ${row}:</span> ${oldVal} → <strong style="color: #60a5fa;">${newVal}</strong>`;
      } else if (itemNumber) {
        title = `🧤 Item #${itemNumber}${employeeName ? ` (${employeeName})` : ''} • ${fieldHeader}`;
        desc = `<span style="color: var(--text-muted); font-size: 11px;">Row ${row}:</span> ${oldVal} → <strong style="color: #60a5fa;">${newVal}</strong>`;
      } else {
        title = `Row ${row} • ${fieldHeader}`;
        desc = `${oldVal} → <strong style="color: #60a5fa;">${newVal}</strong>`;
      }

      return {
        icon: '✏️',
        sheet: sheet,
        title: title,
        desc: desc,
        time: timeStr
      };
    }

    if (mut.action === 'ADD_ROW') {
      let title = 'Add New Record';
      let desc = '';

      if (employeeName && certName) {
        const expDate = rowData['Expiration Date'] || rowData['Date Acquired'] || mut.value || '';
        title = `✨ New Cert: 👤 ${employeeName} — 📜 ${certName}`;
        desc = `Date: <strong style="color: #34d399;">${expDate || 'N/A'}</strong> • Loc: ${rowData['Location'] || 'Helena'}`;
      } else if (itemNumber) {
        title = `✨ New Item: #${itemNumber}`;
        desc = `Status: ${rowData['Status'] || 'In Stock'} • Loc: ${rowData['Location'] || 'Helena'}`;
      } else if (employeeName) {
        title = `✨ New Employee: 👤 ${employeeName}`;
        desc = `Job: ${rowData['Job Number'] || 'N/A'} • Loc: ${rowData['Location'] || 'Helena'}`;
      } else {
        title = `✨ Added Row to ${sheet}`;
        desc = Object.entries(rowData).slice(0, 3).map(([k, v]) => `${k}: <strong>${v}</strong>`).join(' • ');
      }

      return {
        icon: '➕',
        sheet: sheet,
        title: title,
        desc: desc,
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
    // Does not cancel the background sync loop; user can continue working while push runs
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
        <span id="sync-modal-subtitle">${statusMessage}</span>
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
    if (this.activeConflicts && this.activeConflicts.length > 0) {
      this.openConflictModal(this.activeConflicts, this.activeOutbox || this.db.getOutbox());
      return;
    }
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

  /**
   * Pushes pending offline changes to Google Sheets WITHOUT downloading or overwriting local database
   */
  async pushChangesToGoogleSheets(options = {}) {
    if (this.isSyncing) return;

    if (!this.syncUrl) {
      this.openSyncModal('Connect to Google Sheets', '⚙️');
      const body = document.getElementById('sync-modal-body');
      if (body) {
        body.innerHTML = `
          <div style="background-color: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: 8px; padding: 20px;">
            <h3 style="font-size: 14px; margin-bottom: 10px; color: #f8fafc;">Setup Google Sheets Sync</h3>
            <p style="font-size: 12px; color: var(--text-secondary); line-height: 1.5; margin-bottom: 14px;">
              To push your offline changes directly to Google Sheets, enter your Apps Script Web App URL below:
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
              <button class="btn btn-primary" onclick="const val = document.getElementById('modal-sync-url-input').value; if(val){ window.syncEngine.setSyncUrl(val); const inEl = document.getElementById('sync-url-input'); if(inEl) inEl.value = val; window.syncEngine.pushChangesToGoogleSheets(); }">💾 Save & Push Now</button>
            </div>
          </div>
        `;
      }
      return;
    }

    const outbox = [...(this.db.getOutbox() || [])];

    // If outbox is empty, inform the user cleanly
    if (outbox.length === 0) {
      this.openSyncModal('Push Offline Changes', '⬆️');
      this.renderModalChanges([], '✅ Everything is in sync! There are 0 offline changes waiting to push.', 'success', false);
      this.updateStatusUI('synced', `Synced (${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})`);
      setTimeout(() => {
        this.closeSyncModal();
      }, 2000);
      return { success: true, count: 0 };
    }

    this.isSyncing = true;

    // Auto-reconcile any active items that lack history records before pushing
    const invCategories = ['gloves', 'sleeves', 'blankets', 'macks', 'hv_testers', 'phasing_sets', 'aed', 'grounds', 'hot_sticks'];
    if (this.db.snapshot && this.db.snapshot.tables) {
      for (const cat of invCategories) {
        const activeTable = this.db.getTable(cat);
        const histTable = this.db.getTable(`${cat}_history`);
        if (activeTable && activeTable.rows && histTable) {
          const histItemNums = new Set((histTable.rows || []).map(r => {
            const firstK = Object.keys(r)[1] || Object.keys(r)[0] || 'Item #';
            return String(r['Item #'] || r['Serial #'] || r[firstK] || '').trim().toLowerCase();
          }));
          for (const ar of activeTable.rows) {
            const firstK = Object.keys(ar)[0] || 'Item #';
            const itemNum = String(ar['Item #'] || ar['Glove'] || ar['Sleeve'] || ar['Blanket'] || ar['MACK'] || ar['Serial #'] || ar[firstK] || '').trim();
            if (itemNum && !histItemNums.has(itemNum.toLowerCase())) {
              const notes = String(ar['Notes'] || '').trim();
              const hasOrigin = notes.toLowerCase().includes('new purchase') || notes.toLowerCase().includes('failed pair') || notes.toLowerCase().includes('item found');
              if (hasOrigin || ar['Status'] === 'Failed Rubber' || ar['Status'] === 'Lost') {
                const targetSheetName = (activeTable && activeTable.name) ? activeTable.name : (this.db.getSheetNameForTableKey(cat) || cat);
                if (hasOrigin) {
                  await this.db.recordItemHistoryEvent(targetSheetName, {
                    ...ar,
                    'Location': 'Helena',
                    'Assigned To': 'On Shelf',
                    'Status': 'In Stock'
                  }, notes || 'New Purchase');
                }
                if (ar['Status'] && ar['Status'] !== 'In Stock' && ar['Status'] !== 'On Shelf') {
                  await this.db.recordItemHistoryEvent(targetSheetName, ar, ar['Status'] === 'Failed Rubber' ? 'Failed Rubber' : ar['Notes']);
                }
              }
            }
          }
        }
      }
    }

    const currentOutbox = [...(this.db.getOutbox() || [])];
    const pushStartTime = Date.now();
    let currentBatchText = `Pushing ${currentOutbox.length} offline change(s) to Google Sheets...`;

    this.openSyncModal('Pushing Changes to Google Sheets', '⬆️');
    this.renderModalChanges(currentOutbox, `${currentBatchText} (${this.formatDuration(0)})`, 'syncing', false);
    this.updateStatusUI('syncing', `Pushing ${currentOutbox.length} change(s)...`);

    const pushTimerInterval = setInterval(() => {
      const elapsedMs = Date.now() - pushStartTime;
      const subTitleEl = document.getElementById('sync-modal-subtitle');
      if (subTitleEl) {
        subTitleEl.textContent = `${currentBatchText} (${this.formatDuration(elapsedMs)})`;
      }
    }, 200);

    // 1. Pre-Flight Conflict Scan (only for small outboxes <= 15 items to prevent large payload timeouts)
    if (options.force !== true && options.detectConflicts !== false && currentOutbox.length > 0 && currentOutbox.length <= 15) {
      currentBatchText = `Checking for conflicts (${currentOutbox.length} change${currentOutbox.length === 1 ? '' : 's'})...`;
      const subTitleEl = document.getElementById('sync-modal-subtitle');
      if (subTitleEl) subTitleEl.textContent = `${currentBatchText} (${this.formatDuration(Date.now() - pushStartTime)})`;
      this.updateStatusUI('syncing', `Scanning for conflicts...`);

      try {
        const checkRes = await this.executeNetworkRequest(this.syncUrl, 'POST', {
          action: 'applyMutations',
          mutations: currentOutbox,
          detectConflicts: true,
          checkConflictsOnly: true,
          force: false,
          skipPostProcessing: true,
          returnSnapshot: false
        });

        if (checkRes && checkRes.conflict && Array.isArray(checkRes.conflicts) && checkRes.conflicts.length > 0) {
          clearInterval(pushTimerInterval);
          this.closeSyncModal();
          this.updateStatusUI('pending', `⚠️ ${checkRes.conflicts.length} conflict(s) detected`);
          this.openConflictModal(checkRes.conflicts, currentOutbox);
          this.isSyncing = false;
          return { success: false, conflict: true, conflicts: checkRes.conflicts };
        }
      } catch (checkErr) {
        console.warn('Pre-flight conflict check error (continuing with chunked push):', checkErr);
      }
    }

    try {
      const totalCount = currentOutbox.length;
      let totalPushed = 0;
      let lastPushResult = null;
      let i = 0;
      let batchNum = 0;

      while (i < totalCount) {
        batchNum++;
        // 10 changes per request for fast streaming on flattened formula-free sheets
        const chunkSize = 10;
        const chunk = currentOutbox.slice(i, i + chunkSize);
        const isLastChunk = (i + chunk.length >= totalCount);

        currentBatchText = `Pushing batch ${batchNum} (${Math.min(i + chunk.length, totalCount)}/${totalCount} changes)...`;
        const subTitleEl = document.getElementById('sync-modal-subtitle');
        if (subTitleEl) {
          subTitleEl.textContent = `${currentBatchText} (${this.formatDuration(Date.now() - pushStartTime)})`;
        }
        this.updateStatusUI('syncing', `Pushing batch ${batchNum} (${Math.min(i + chunk.length, totalCount)}/${totalCount})...`);

        let pushResult = null;
        try {
          pushResult = await this.executeNetworkRequest(this.syncUrl, 'POST', {
            action: 'applyMutations',
            mutations: chunk,
            detectConflicts: false,
            force: true,
            skipPostProcessing: !isLastChunk,
            returnSnapshot: false
          });
        } catch (pushErr) {
          const encodedChunk = encodeURIComponent(JSON.stringify(chunk));
          if (encodedChunk.length < 1800) {
            console.warn('POST push failed, trying GET fallback:', pushErr);
            const getUrl = `${this.syncUrl}?action=applyMutations&mutations=${encodedChunk}&detectConflicts=false&force=true&skipPostProcessing=${!isLastChunk}&returnSnapshot=false`;
            pushResult = await this.executeNetworkRequest(getUrl, 'GET');
          } else {
            throw pushErr;
          }
        }

        lastPushResult = pushResult;

        // 1. Handle Edit Conflicts (fallback)
        if (pushResult && pushResult.conflict && Array.isArray(pushResult.conflicts) && pushResult.conflicts.length > 0) {
          clearInterval(pushTimerInterval);
          this.closeSyncModal();
          this.updateStatusUI('pending', `⚠️ ${pushResult.conflicts.length} conflict(s) detected`);
          const remainingOutbox = currentOutbox.slice(i);
          await this.db.saveOutbox(remainingOutbox);
          this.renderOutboxBadge();
          this.openConflictModal(pushResult.conflicts, remainingOutbox);
          this.isSyncing = false;
          return { success: false, conflict: true, conflicts: pushResult.conflicts };
        }

        // 2. Handle Errors
        if (pushResult && pushResult.errors && pushResult.errors.length > 0) {
          clearInterval(pushTimerInterval);
          console.warn('Push server errors:', pushResult.errors);
          const remaining = currentOutbox.slice(i);
          await this.db.saveOutbox(remaining);
          this.renderOutboxBadge();
          this.renderModalChanges(remaining, `⚠️ Server error on batch ${batchNum}: ${pushResult.errors.join('; ')}`, 'error', true);
          this.updateStatusUI('pending', 'Push error / Pending changes');
          this.isSyncing = false;
          return { success: false, errors: pushResult.errors };
        }

        // 3. Remove ONLY the successfully pushed mutations by ID (safely preserves any new edits made while pushing)
        const pushedIds = new Set(chunk.map(m => m.id).filter(Boolean));
        const liveOutbox = this.db.getOutbox() || [];
        const newRemaining = pushedIds.size > 0 
          ? liveOutbox.filter(m => !pushedIds.has(m.id))
          : liveOutbox.slice(chunk.length);
        await this.db.saveOutbox(newRemaining);
        this.renderOutboxBadge();
        totalPushed += chunk.length;
        i += chunk.length;
      }

      clearInterval(pushTimerInterval);
      const totalElapsedMs = Date.now() - pushStartTime;
      const durationFormatted = this.formatDuration(totalElapsedMs);
      const durationSec = (totalElapsedMs / 1000).toFixed(1);

      this.savePushTelemetry({
        timestamp: new Date().toISOString(),
        durationSeconds: parseFloat(durationSec),
        durationFormatted: durationFormatted,
        mutationsCount: totalCount,
        status: 'SUCCESS'
      });

      const finalRemaining = this.db.getOutbox() || [];
      if (finalRemaining.length === 0) {
        this.updateStatusUI('synced', `Synced in ${durationFormatted}`);
        this.renderModalChanges([], `✅ Successfully pushed all ${totalCount} change(s) in ${durationFormatted}!`, 'success', false);
      } else {
        this.updateStatusUI('pending', `${finalRemaining.length} new change(s) queued`);
        this.renderModalChanges(finalRemaining, `✅ Pushed ${totalCount} change(s). ${finalRemaining.length} new change(s) queued for next push.`, 'info', true);
      }

      // Auto-close modal after 2 seconds if everything was pushed
      if (finalRemaining.length === 0) {
        setTimeout(() => {
          this.closeSyncModal();
        }, 2000);
      }

      this.isSyncing = false;
      return { success: true, count: totalCount, durationFormatted: durationFormatted, durationSeconds: parseFloat(durationSec) };
    } catch (err) {
      clearInterval(pushTimerInterval);
      const totalElapsedMs = Date.now() - pushStartTime;
      const durationFormatted = this.formatDuration(totalElapsedMs);
      const durationSec = (totalElapsedMs / 1000).toFixed(1);
      console.error('Push failed:', err);
      const isAuthError = err.message && (err.message.includes('HTML') || err.message.includes('Anyone') || err.message.includes('deployments'));
      const statusLabel = isAuthError ? 'Auth Error (Check Web App Access)' : 'Offline / Connection error';
      this.savePushTelemetry({
        timestamp: new Date().toISOString(),
        durationSeconds: parseFloat(durationSec),
        durationFormatted: durationFormatted,
        mutationsCount: currentOutbox.length,
        status: 'FAILED',
        error: err.message
      });
      this.updateStatusUI('offline', statusLabel);
      this.openSyncModal('Push Error', '⚠️');
      this.renderModalChanges(currentOutbox, `❌ Push failed (${durationFormatted}): ${err.message}`, 'error', true);
      this.isSyncing = false;
      return { success: false, error: err.message };
    }
  }

  /**
   * Records sync telemetry to localStorage for audit history
   */
  savePushTelemetry(record) {
    try {
      const raw = localStorage.getItem('SAFETY_ASSISTANT_SYNC_TELEMETRY');
      const list = raw ? JSON.parse(raw) : [];
      list.unshift(record);
      if (list.length > 30) list.length = 30;
      localStorage.setItem('SAFETY_ASSISTANT_SYNC_TELEMETRY', JSON.stringify(list));
    } catch (e) { /* ignore */ }
  }

  /**
   * Retrieves recent push history telemetry
   */
  getRecentPushTelemetry() {
    try {
      const raw = localStorage.getItem('SAFETY_ASSISTANT_SYNC_TELEMETRY');
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      return [];
    }
  }

  /**
   * Opens the Multi-User Conflict Resolution Modal with side-by-side diffs
   */
  openConflictModal(conflicts, outbox) {
    this.activeConflicts = conflicts;
    this.activeOutbox = outbox;

    const modal = document.getElementById('conflict-resolution-modal');
    const body = document.getElementById('conflict-modal-body');
    if (!modal || !body) return;

    let html = `
      <div style="background: rgba(239, 68, 68, 0.1); border: 1px solid rgba(239, 68, 68, 0.25); border-radius: 8px; padding: 12px 16px;">
        <div style="font-size: 13px; font-weight: 700; color: #fca5a5; margin-bottom: 4px;">
          Simultaneous Edits on Google Sheets (${conflicts.length} Conflict${conflicts.length > 1 ? 's' : ''})
        </div>
        <div style="font-size: 12px; color: var(--text-secondary); line-height: 1.4;">
          The following cell(s) were modified on Google Sheets by another user or session while you were editing offline. Select which version to keep for each item:
        </div>
      </div>

      <!-- Quick Batch Actions Bar -->
      <div style="display: flex; gap: 10px; align-items: center; justify-content: flex-end; padding: 6px 0;">
        <span style="font-size: 11px; color: var(--text-muted); font-weight: 600;">QUICK SELECT:</span>
        <button type="button" class="btn btn-secondary" style="font-size: 11px; padding: 4px 10px; border-color: rgba(16, 185, 129, 0.4); color: #34d399;" onclick="window.syncEngine.selectAllConflictChoices('local')">
          ⚡ Keep All My Offline Edits
        </button>
        <button type="button" class="btn btn-secondary" style="font-size: 11px; padding: 4px 10px; border-color: rgba(59, 130, 246, 0.4); color: #60a5fa;" onclick="window.syncEngine.selectAllConflictChoices('remote')">
          ☁️ Accept All Google Sheets Values
        </button>
      </div>

      <div style="display: flex; flex-direction: column; gap: 12px;">
    `;

    conflicts.forEach((conf, idx) => {
      const sheetName = conf.sheetName || 'Sheet';

      // Look up local db row to get rich contextual info (Employee name, cert type, item number)
      const tableKey = this.db && typeof this.db.getTableKeyForSheet === 'function' ? this.db.getTableKeyForSheet(sheetName) : sheetName.toLowerCase().replace(/\s+/g, '_');
      const table = this.db && typeof this.db.getTable === 'function' ? this.db.getTable(tableKey) : null;
      let rowObj = (table && table.rows && conf.row && table.rows[conf.row - 2]) ? table.rows[conf.row - 2] : {};

      let employeeName = conf.employeeName || rowObj['Employee Name'] || rowObj['Name'] || rowObj['Assigned To'] || rowObj['Worker'] || '';
      let certName = conf.certName || conf.itemType || rowObj['Item Type'] || rowObj['Cert Type'] || rowObj['Type'] || '';
      let itemNumber = conf.itemNumber || conf.itemIdentifier || rowObj['Item #'] || rowObj['Serial #'] || rowObj['Glove'] || rowObj['Sleeve'] || '';
      let fieldName = conf.header || conf.field || (table && table.headers && conf.col ? table.headers[conf.col - 1] : '') || `Column ${conf.col}`;

      let itemTitle = '';
      if (employeeName && certName) {
        itemTitle = `👤 ${employeeName} — 📜 ${certName}`;
      } else if (employeeName) {
        itemTitle = `👤 ${employeeName}`;
      } else if (itemNumber) {
        itemTitle = `🧤 Item #${itemNumber}${employeeName ? ` (${employeeName})` : ''}`;
      } else {
        itemTitle = conf.itemIdentifier ? `Item ${conf.itemIdentifier}` : `Row ${conf.row}`;
      }

      const expectedVal = conf.expectedValue !== undefined && String(conf.expectedValue).trim() !== '' ? conf.expectedValue : '(Empty)';
      const localVal = conf.localValue !== undefined && String(conf.localValue).trim() !== '' ? conf.localValue : '(Empty)';
      const serverVal = conf.serverValue !== undefined && String(conf.serverValue).trim() !== '' ? conf.serverValue : '(Empty)';

      html += `
        <div style="background: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: 8px; padding: 14px; display: flex; flex-direction: column; gap: 10px;">
          <div style="display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 1px solid rgba(255,255,255,0.06); padding-bottom: 8px; flex-wrap: wrap; gap: 6px;">
            <div style="display: flex; flex-direction: column; gap: 3px;">
              <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                <span class="brand-badge" style="background: rgba(59, 130, 246, 0.15); color: #93c5fd; border: 1px solid rgba(59, 130, 246, 0.3); font-size: 11px;">
                  ${sheetName}
                </span>
                <span style="font-size: 13.5px; font-weight: 700; color: #f8fafc;">
                  ${itemTitle}
                </span>
              </div>
              <div style="font-size: 11.5px; color: #94a3b8; margin-left: 2px;">
                Field: <strong style="color: #60a5fa;">${fieldName}</strong> <span style="color: var(--text-muted); font-size: 10.5px;">(Row ${conf.row}, Col ${conf.col})</span>
              </div>
            </div>
            <span style="font-size: 11px; color: var(--text-muted);">Original Base: <em>${expectedVal}</em></span>
          </div>

          <!-- Comparison Columns -->
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
            <!-- Choice 1: Local Edit -->
            <label style="cursor: pointer; display: flex; flex-direction: column; gap: 6px; background: rgba(16, 185, 129, 0.08); border: 1.5px solid rgba(16, 185, 129, 0.35); border-radius: 6px; padding: 10px 12px; transition: all 0.15s ease;">
              <div style="display: flex; justify-content: space-between; align-items: center;">
                <span style="font-size: 11px; font-weight: 700; color: #34d399; text-transform: uppercase;">
                  🟢 My Offline Edit
                </span>
                <input type="radio" name="conflict_choice_${idx}" value="local" checked style="accent-color: #10b981; cursor: pointer;">
              </div>
              <div style="font-size: 14px; font-weight: 700; color: #f8fafc; word-break: break-all;">
                ${localVal}
              </div>
              <span style="font-size: 10.5px; color: #6ee7b7;">Overwrite Google Sheets with this edit</span>
            </label>

            <!-- Choice 2: Server Value -->
            <label style="cursor: pointer; display: flex; flex-direction: column; gap: 6px; background: rgba(59, 130, 246, 0.08); border: 1.5px solid rgba(59, 130, 246, 0.35); border-radius: 6px; padding: 10px 12px; transition: all 0.15s ease;">
              <div style="display: flex; justify-content: space-between; align-items: center;">
                <span style="font-size: 11px; font-weight: 700; color: #60a5fa; text-transform: uppercase;">
                  🔵 Google Sheets Value
                </span>
                <input type="radio" name="conflict_choice_${idx}" value="remote" style="accent-color: #3b82f6; cursor: pointer;">
              </div>
              <div style="font-size: 14px; font-weight: 700; color: #f8fafc; word-break: break-all;">
                ${serverVal}
              </div>
              <span style="font-size: 10.5px; color: #93c5fd;">Discard my edit & adopt Google Sheets value</span>
            </label>
          </div>
        </div>
      `;
    });

    html += `</div>`;
    body.innerHTML = html;
    modal.style.display = 'flex';
    modal.classList.add('active');
  }

  selectAllConflictChoices(choice = 'local') {
    if (!this.activeConflicts) return;
    this.activeConflicts.forEach((_, idx) => {
      const radios = document.getElementsByName(`conflict_choice_${idx}`);
      for (const r of radios) {
        if (r.value === choice) r.checked = true;
      }
    });
  }

  closeConflictModal() {
    const modal = document.getElementById('conflict-resolution-modal');
    if (modal) {
      modal.classList.remove('active');
      modal.style.display = 'none';
    }
  }

  async forcePushChangesToGoogleSheets() {
    const outbox = this.db.getOutbox() || [];
    outbox.forEach(m => { m.force = true; });
    await this.db.saveOutbox(outbox);
    return await this.pushChangesToGoogleSheets({ force: true, detectConflicts: false });
  }

  async applyConflictResolutions() {
    try {
      if (!this.activeConflicts || !this.activeOutbox) {
        this.closeConflictModal();
        return;
      }

      const conflicts = this.activeConflicts;
      let outbox = [...this.activeOutbox];
      const mutationsToDrop = new Set();

      conflicts.forEach((conf, idx) => {
        const radios = document.getElementsByName(`conflict_choice_${idx}`);
        let selected = 'local';
        for (const r of radios) {
          if (r.checked) selected = r.value;
        }

        // Locate the exact matching mutation in outbox
        let mutIdx = -1;

        // 1. Direct match by sheetName, row, and col
        if (conf.sheetName && conf.row && conf.col) {
          mutIdx = outbox.findIndex(m => 
            String(m.sheetName || '').trim().toLowerCase() === String(conf.sheetName || '').trim().toLowerCase() &&
            Number(m.row) === Number(conf.row) &&
            Number(m.col) === Number(conf.col)
          );
        }

        // 2. If not found, match by itemIdentifier + col + sheetName
        if (mutIdx === -1 && conf.itemIdentifier) {
          const cleanId = String(conf.itemIdentifier).trim().toLowerCase();
          mutIdx = outbox.findIndex(m => 
            m.itemIdentifier && String(m.itemIdentifier).trim().toLowerCase() === cleanId &&
            Number(m.col) === Number(conf.col)
          );
        }

        // 3. Fallback to mutationIndex if valid and matching sheetName
        if (mutIdx === -1 && conf.mutationIndex !== undefined && outbox[conf.mutationIndex]) {
          const cand = outbox[conf.mutationIndex];
          if (!conf.sheetName || String(cand.sheetName || '').trim().toLowerCase() === String(conf.sheetName || '').trim().toLowerCase()) {
            mutIdx = conf.mutationIndex;
          }
        }

        if (selected === 'local') {
          // User wants to keep local offline edit: mark mutation to force write
          if (mutIdx !== -1 && outbox[mutIdx]) {
            outbox[mutIdx].force = true;
          }
        } else {
          // User wants to accept Google Sheets value: drop local mutation and update local DB
          if (mutIdx !== -1 && outbox[mutIdx]) {
            mutationsToDrop.add(mutIdx);
          }

          // Update local workspace so local view reflects the Google Sheets value
          if (conf.sheetName && conf.row && conf.col) {
            const tableKey = this.db.getTableKeyForSheet ? this.db.getTableKeyForSheet(conf.sheetName) : conf.sheetName.toLowerCase().replace(/\s+/g, '_');
            const table = tableKey ? this.db.getTable(tableKey) : null;
            if (table && table.rows && table.rows[conf.row - 2]) {
              const header = conf.header;
              if (header && table.rows[conf.row - 2][header] !== undefined) {
                table.rows[conf.row - 2][header] = conf.serverValue;
              }
            }
          }
        }
      });

      // Filter out dropped mutations
      const resolvedOutbox = outbox.filter((_, i) => !mutationsToDrop.has(i));
      await this.db.saveOutbox(resolvedOutbox);
      this.renderOutboxBadge();

      this.closeConflictModal();

      // Refresh active views so user sees immediate state
      if (window.sheetNavigator && typeof window.sheetNavigator.renderActiveView === 'function') {
        window.sheetNavigator.renderActiveView();
      }
      if (window.inventoryAging && typeof window.inventoryAging.loadData === 'function') {
        window.inventoryAging.loadData();
      }
      if (window.safetyComplianceEngine && typeof window.safetyComplianceEngine.renderSafetyLogs === 'function') {
        window.safetyComplianceEngine.renderSafetyLogs();
      }

      if (resolvedOutbox.length > 0) {
        // Re-push resolved mutations to Google Sheets without re-triggering conflict modal
        await this.pushChangesToGoogleSheets({ force: true, detectConflicts: false });
      } else {
        this.updateStatusUI('synced', `Synced (${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})`);
        alert('✅ All conflict resolutions applied! Your local data has been synchronized with Google Sheets.');
      }
    } catch (err) {
      console.error('Error applying conflict resolutions:', err);
      alert('Error applying conflict resolutions: ' + err.message);
    }
  }

  /**
   * Pushes a full clean table replacement (Employees, Job Tracking, etc.) directly to Google Sheets
   */
  async pushFullCleanTable(tableKey = 'employees') {
    const table = this.db.getTable(tableKey);
    if (!table || !table.rows) return { success: false, error: 'Table not found' };

    await this.db.addMutation({
      action: 'REPLACE_TABLE_DATA',
      sheetName: table.name || (tableKey === 'employees' ? 'Employees' : 'Job Tracking'),
      tableKey: tableKey,
      rawGrid: table.rawGrid,
      headers: table.headers,
      rows: table.rows
    });

    return await this.pushChangesToGoogleSheets();
  }

  /**
   * Pushes both Employees and Job Tracking clean tables to Google Sheets
   */
  async pushAllCleanData() {
    const empTable = this.db.getTable('employees');
    const jtTable = this.db.getTable('job_tracking');

    if (empTable) {
      await this.db.addMutation({
        action: 'REPLACE_TABLE_DATA',
        sheetName: empTable.name || 'Employees',
        tableKey: 'employees',
        rawGrid: empTable.rawGrid,
        headers: empTable.headers,
        rows: empTable.rows
      });
    }

    if (jtTable) {
      await this.db.addMutation({
        action: 'REPLACE_TABLE_DATA',
        sheetName: jtTable.name || 'Job Tracking',
        tableKey: 'job_tracking',
        rawGrid: jtTable.rawGrid,
        headers: jtTable.headers,
        rows: jtTable.rows
      });
    }

    return await this.pushChangesToGoogleSheets();
  }

  /**
   * Downloads the latest database snapshot from Google Sheets and updates local database
   */
  async downloadLatestSnapshot(force = false, silent = false) {
    if (this.isSyncing) return;

    if (!this.syncUrl) {
      if (silent) return;
      this.openSyncModal('Connect to Google Sheets', '⚙️');
      const body = document.getElementById('sync-modal-body');
      if (body) {
        body.innerHTML = `
          <div style="background-color: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: 8px; padding: 20px;">
            <h3 style="font-size: 14px; margin-bottom: 10px; color: #f8fafc;">Setup Google Sheets Connection</h3>
            <p style="font-size: 12px; color: var(--text-secondary); line-height: 1.5; margin-bottom: 14px;">
              To download the latest database snapshot from Google Sheets, enter your Apps Script Web App URL below:
            </p>
            <input type="text" id="modal-sync-url-input" class="sheet-search" style="width: 100%; margin-bottom: 14px;" placeholder="https://script.google.com/macros/s/.../exec">
            <div style="display: flex; justify-content: flex-end; gap: 8px;">
              <button class="btn btn-secondary" onclick="window.syncEngine.closeSyncModal()">Cancel</button>
              <button class="btn btn-primary" onclick="const val = document.getElementById('modal-sync-url-input').value; if(val){ window.syncEngine.setSyncUrl(val); const inEl = document.getElementById('sync-url-input'); if(inEl) inEl.value = val; window.syncEngine.downloadLatestSnapshot(); }">💾 Save & Download Now</button>
            </div>
          </div>
        `;
      }
      return;
    }

    const outbox = this.db.getOutbox() || [];
    if (outbox.length > 0) {
      if (silent) return; // Never overwrite pending edits during silent background check
      if (!force) {
        const proceed = confirm(
          `⚠️ Warning: You have ${outbox.length} pending offline change(s) that haven't been pushed to Google Sheets yet.\n\n` +
          `Downloading the latest snapshot will replace your local database with the current Google Sheets version.\n\n` +
          `• Click "OK" to download snapshot (overwriting local data).\n` +
          `• Click "Cancel" to go back and click "Push Changes to Sheets" first.`
        );
        if (!proceed) return { success: false, cancelled: true };
      }
    }

    this.isSyncing = true;
    const downloadStartTime = Date.now();
    const baseDownloadMsg = 'Connecting to Google Sheets and downloading fresh database snapshot...';
    if (!silent) {
      this.openSyncModal('Downloading Latest Snapshot', '⬇️');
      this.renderModalChanges([], `${baseDownloadMsg} (${this.formatDuration(0)})`, 'syncing', false);
    }
    this.updateStatusUI('syncing', 'Downloading snapshot...');

    let downloadTimerInterval = null;
    if (!silent) {
      downloadTimerInterval = setInterval(() => {
        const elapsedMs = Date.now() - downloadStartTime;
        const subTitleEl = document.getElementById('sync-modal-subtitle');
        if (subTitleEl) {
          subTitleEl.textContent = `${baseDownloadMsg} (${this.formatDuration(elapsedMs)})`;
        }
      }, 200);
    }

    try {
      let activeUrl = this.syncUrl || DEFAULT_SYNC_URL;
      let freshSnapshot = null;
      try {
        freshSnapshot = await this.executeNetworkRequest(`${activeUrl}?action=getSnapshot`, 'GET');
      } catch (reqErr) {
        if (activeUrl !== DEFAULT_SYNC_URL) {
          console.warn('Custom syncUrl failed, falling back to default working URL:', reqErr);
          this.setSyncUrl(DEFAULT_SYNC_URL);
          freshSnapshot = await this.executeNetworkRequest(`${DEFAULT_SYNC_URL}?action=getSnapshot`, 'GET');
        } else {
          throw reqErr;
        }
      }

      if (downloadTimerInterval) clearInterval(downloadTimerInterval);
      const totalElapsedMs = Date.now() - downloadStartTime;
      const durationFormatted = this.formatDuration(totalElapsedMs);

      if (freshSnapshot && freshSnapshot.tables) {
        await this.db.setSnapshot(freshSnapshot);
        if (window.sheetNavigator) window.sheetNavigator.renderActiveView();
        if (window.historyNavigator) window.historyNavigator.renderCurrentHistory();
        if (window.tripPlanner) window.tripPlanner.renderPlanner();
        if (window.taskManager) window.taskManager.renderTasks();
        if (window.safetyComplianceEngine) window.safetyComplianceEngine.renderOverview();

        this.updateStatusUI('synced', `Synced in ${durationFormatted}`);
        if (!silent) {
          this.renderModalChanges([], `✅ Latest database snapshot successfully downloaded and loaded in ${durationFormatted}!`, 'success', false);
          setTimeout(() => {
            this.closeSyncModal();
          }, 2000);
        }

        this.isSyncing = false;
        return { success: true, snapshot: freshSnapshot };
      } else if (freshSnapshot && freshSnapshot.error) {
        throw new Error(freshSnapshot.error);
      } else {
        throw new Error('Web App returned non-JSON response.');
      }
    } catch (err) {
      if (downloadTimerInterval) clearInterval(downloadTimerInterval);
      const totalElapsedMs = Date.now() - downloadStartTime;
      const durationFormatted = this.formatDuration(totalElapsedMs);
      console.error('Download snapshot failed:', err);
      if (!silent) {
        const isAuthError = err.message && (err.message.includes('HTML') || err.message.includes('Anyone') || err.message.includes('deployments'));
        const statusLabel = isAuthError ? 'Auth Error (Check Web App Access)' : 'Offline / Connection error';
        this.updateStatusUI('offline', statusLabel);
        this.openSyncModal('Download Error', '⚠️');
        this.renderModalChanges([], `❌ Download failed (${durationFormatted}): ${err.message}`, 'error', true);
      }
      this.isSyncing = false;
      return { success: false, error: err.message };
    }
  }

  /**
   * Backwards-compatible alias for pushChangesToGoogleSheets
   */
  async syncWithGoogleSheets() {
    return await this.pushChangesToGoogleSheets();
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
      return { success: false };
    }

    // Web & Mobile File Picker Fallback
    return new Promise((resolve) => {
      const fileInput = document.createElement('input');
      fileInput.type = 'file';
      // Do not set accept on iOS/mobile: iOS UIDocumentPicker greys out files with unrecognized UTIs if accept is specified.
      fileInput.style.display = 'none';

      fileInput.onchange = async (e) => {
        const file = e.target.files && e.target.files[0];
        if (!file) {
          resolve({ success: false });
          return;
        }

        try {
          const text = await file.text();
          if (text.includes('quota') || text.includes('Quota') || text.startsWith('<!DOCTYPE') || text.startsWith('<html')) {
            alert('⚠️ This file is not a valid snapshot file. It contains an error message or rate limit notice from Google Drive:\n\n"' + text.substring(0, 140).trim() + '..."\n\nPlease export a fresh snapshot directly from Google Sheets: Glove Manager > 💾 Save & Backup > 🔄 Export Offline Snapshot (Desktop App).');
            resolve({ success: false, error: 'Quota exceeded in downloaded file' });
            return;
          }
          const data = JSON.parse(text);
          if (data && data.tables) {
            await this.db.setSnapshot(data);
            if (window.sheetNavigator) window.sheetNavigator.renderActiveView();
            if (window.historyNavigator) window.historyNavigator.renderCurrentHistory();
            if (window.tripPlanner) window.tripPlanner.renderPlanner();
            if (window.taskManager) window.taskManager.renderTasks();
            this.updateStatusUI('synced', `Loaded ${file.name}`);
            alert(`✅ Successfully loaded snapshot from "${file.name}"!`);
            resolve({ success: true, data });
          } else {
            alert('⚠️ Invalid snapshot file. Missing "tables" property.');
            resolve({ success: false });
          }
        } catch (err) {
          alert('❌ Could not parse JSON file: ' + err.message);
          resolve({ success: false, error: err.message });
        } finally {
          fileInput.remove();
        }
      };

      document.body.appendChild(fileInput);
      fileInput.click();
    });
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

  renderOutboxBadge() {
    const outbox = (this.db && typeof this.db.getOutbox === 'function') ? (this.db.getOutbox() || []) : [];
    const count = outbox.length;

    const pushBtn = document.getElementById('push-changes-btn');
    if (pushBtn) {
      pushBtn.innerHTML = count > 0
        ? `⬆️ Push Changes to Sheets <span class="badge" style="background: rgba(255,255,255,0.25); color: #fff; font-size: 11px; padding: 1px 6px; border-radius: 10px; margin-left: 4px;">${count}</span>`
        : `⬆️ Push Changes to Sheets`;
    }

    if (!this.isSyncing) {
      if (count > 0) {
        this.updateStatusUI('pending', `${count} pending change${count === 1 ? '' : 's'}`);
      } else {
        const text = document.getElementById('sync-status-text');
        if (text && text.textContent && text.textContent.includes('pending')) {
          this.updateStatusUI('synced', `Synced (${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})`);
        }
      }
    }
  }

  async queueMutation(mutation) {
    if (this.db && typeof this.db.addMutation === 'function') {
      const res = await this.db.addMutation(mutation);
      this.renderOutboxBadge();
      return res;
    }
    return null;
  }

  async addMutation(mutation) {
    if (this.db && typeof this.db.addMutation === 'function') {
      const res = await this.db.addMutation(mutation);
      this.renderOutboxBadge();
      return res;
    }
    return null;
  }

  formatDuration(ms) {
    const totalSec = Math.max(0, Math.floor(ms / 1000));
    const mins = Math.floor(totalSec / 60);
    const secs = totalSec % 60;
    return `${mins}m ${secs < 10 ? '0' : ''}${secs}s`;
  }
}

if (typeof window !== 'undefined') {
  window.SyncEngine = SyncEngine;
  window.syncEngine = new SyncEngine(window.localDB);
}
