/**
 * sync.js - Google Sheets Synchronization Client
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

  async syncWithGoogleSheets() {
    if (this.isSyncing) return;
    this.isSyncing = true;
    this.updateStatusUI('syncing', 'Syncing with Google Sheets...');

    try {
      const outbox = this.db.getOutbox();

      // Step 1: If we have pending offline mutations, push them first
      if (outbox.length > 0 && this.syncUrl) {
        this.updateStatusUI('syncing', `Pushing ${outbox.length} offline change(s)...`);
        const pushResp = await fetch(this.syncUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify({
            action: 'applyMutations',
            mutations: outbox
          })
        });
        const pushResult = await pushResp.json();
        if (pushResult.success) {
          await this.db.clearOutbox();
        } else {
          console.warn('Sync mutations had errors:', pushResult.errors);
        }
      }

      // Step 2: Pull fresh database snapshot
      if (this.syncUrl) {
        this.updateStatusUI('syncing', 'Downloading latest snapshot...');
        const getResp = await fetch(`${this.syncUrl}?action=getSnapshot`, { method: 'GET' });
        const freshSnapshot = await getResp.json();
        if (freshSnapshot && freshSnapshot.tables) {
          await this.db.setSnapshot(freshSnapshot);
          if (window.sheetNavigator) window.sheetNavigator.renderCurrentSheet();
          if (window.historyNavigator) window.historyNavigator.renderCurrentHistory();
          if (window.tripPlanner) window.tripPlanner.renderPlanner();
          if (window.taskManager) window.taskManager.renderTasks();
          this.updateStatusUI('synced', 'All Synced with Google Sheets');
          this.isSyncing = false;
          return { success: true, snapshot: freshSnapshot };
        }
      }

      this.updateStatusUI('synced', 'Offline mode active');
      this.isSyncing = false;
      return { success: true };

    } catch (err) {
      console.error('Sync failed:', err);
      this.updateStatusUI('offline', 'Offline / Connection error');
      this.isSyncing = false;
      return { success: false, error: err.message };
    }
  }

  async importLocalSnapshotFile() {
    if (window.desktopAPI) {
      const data = await window.desktopAPI.selectSnapshotFile();
      if (data && data.tables) {
        await this.db.setSnapshot(data);
        if (window.sheetNavigator) window.sheetNavigator.renderCurrentSheet();
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
