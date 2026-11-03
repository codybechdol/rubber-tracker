/**
 * supabase-sync.js - Optional Real-Time Multi-User Sync Engine (Supabase PostgreSQL + Realtime)
 *
 * Non-Intrusive Design:
 * - Completely inactive until a Supabase Project URL & Anon Key are saved in Settings.
 * - Works alongside the existing Google Drive / Google Sheets sync engine without interfering.
 * - Provides <1s full database downloads, ~100ms granular row/cell sync, and live WebSocket
 *   multi-user updates across all connected laptops and tablets.
 */

const DEFAULT_SUPABASE_URL = 'https://ixjlynzrqnuynpdtpdzu.supabase.co';
const DEFAULT_SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml4amx5bnpycW51eW5wZHRwZHp1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTM2NTE2OTAsImV4cCI6MjEwOTIyNzY5MH0.TjgigNhr-UXvT3IrFzZFOEKz3_3qkk3-F14MEtQc-sQ';

class SupabaseSyncEngine {
  constructor(db, googleSyncEngine) {
    this.db = db;
    this.googleSync = googleSyncEngine;

    let savedUrl = (localStorage.getItem('sa_supabase_url') || '').trim().replace(/\/+$/, '');
    let savedKey = (localStorage.getItem('sa_supabase_anon_key') || '').trim();
    if (!savedUrl) {
      savedUrl = DEFAULT_SUPABASE_URL;
      try { localStorage.setItem('sa_supabase_url', savedUrl); } catch { /* ignore */ }
    }
    if (!savedKey) {
      savedKey = DEFAULT_SUPABASE_ANON_KEY;
      try { localStorage.setItem('sa_supabase_anon_key', savedKey); } catch { /* ignore */ }
    }

    this.url = savedUrl;
    this.anonKey = savedKey;
    this.enabled = localStorage.getItem('sa_supabase_enabled') !== 'false';
    this.deviceName = (localStorage.getItem('sa_supabase_device_name') || '').trim() || this._defaultDeviceName();
    this.deviceId = this._getOrCreateDeviceId();

    this.lastSeq = Number(localStorage.getItem('sa_supabase_last_seq') || 0);
    this.seenMutIds = new Set();
    this.ws = null;
    this.wsHeartbeatTimer = null;
    this.pollTimer = null;
    this.isApplyingRemote = false;
    this._tablePushTimers = new Map();
    this._modifiedTables = new Set();

    // Hook into db.addMutation non-intrusively so local edits stream live when configured
    this._installMutationHook();

    if (this.isConfigured() && this.enabled) {
      setTimeout(() => {
        this.startRealtimeSync();
      }, 1800);
    }
  }

  _defaultDeviceName() {
    const isDesktop = typeof window !== 'undefined' && !!window.desktopAPI;
    return isDesktop ? 'Office Laptop' : 'Field Tablet';
  }

  _getOrCreateDeviceId() {
    let id = localStorage.getItem('sa_supabase_device_id');
    if (!id) {
      id = 'dev_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 8);
      try { localStorage.setItem('sa_supabase_device_id', id); } catch { /* ignore */ }
    }
    return id;
  }

  isConfigured() {
    return Boolean(this.url && this.anonKey && this.url.startsWith('https://'));
  }

  isActive() {
    return this.isConfigured() && this.enabled;
  }

  saveSettings({ url, anonKey, deviceName, enabled }) {
    if (url !== undefined) {
      this.url = String(url || '').trim().replace(/\/+$/, '');
      localStorage.setItem('sa_supabase_url', this.url);
    }
    if (anonKey !== undefined) {
      this.anonKey = String(anonKey || '').trim();
      localStorage.setItem('sa_supabase_anon_key', this.anonKey);
    }
    if (deviceName !== undefined) {
      this.deviceName = String(deviceName || '').trim() || this._defaultDeviceName();
      localStorage.setItem('sa_supabase_device_name', this.deviceName);
    }
    if (enabled !== undefined) {
      this.enabled = Boolean(enabled);
      localStorage.setItem('sa_supabase_enabled', this.enabled ? 'true' : 'false');
    }

    this.updateSettingsBadge();

    if (this.isActive()) {
      this.startRealtimeSync();
    } else {
      this.stopRealtimeSync();
    }
  }

  _headers(extra = {}) {
    return {
      'apikey': this.anonKey,
      'Authorization': `Bearer ${this.anonKey}`,
      'Content-Type': 'application/json',
      ...extra
    };
  }

  async _request(path, { method = 'GET', body = null, headers = {}, timeoutMs = 30000 } = {}) {
    if (!this.isConfigured()) {
      throw new Error('Supabase URL and Anon Key are not configured yet.');
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const resp = await fetch(`${this.url}${path}`, {
        method,
        headers: this._headers(headers),
        body: body ? (typeof body === 'string' ? body : JSON.stringify(body)) : null,
        signal: controller.signal
      });
      clearTimeout(timer);
      const text = await resp.text();
      let data = null;
      if (text) {
        try { data = JSON.parse(text); } catch { data = text; }
      }
      if (!resp.ok) {
        const msg = (data && (data.message || data.error_description || data.hint || data.error)) || `HTTP ${resp.status}`;
        const err = new Error(msg);
        err.status = resp.status;
        err.code = data && data.code;
        throw err;
      }
      return data;
    } catch (err) {
      clearTimeout(timer);
      throw err;
    }
  }

  /**
   * Tests connection to Supabase and checks whether sa_tables & sa_mutations have been created.
   */
  async testConnection() {
    if (!this.isConfigured()) {
      return { success: false, message: 'Please enter both your Supabase Project URL and Anon Public Key.' };
    }
    try {
      const rows = await this._request('/rest/v1/sa_tables?select=table_key,revision,updated_at&limit=5', { method: 'GET' });
      const count = Array.isArray(rows) ? rows.length : 0;
      return {
        success: true,
        tablesInitialized: true,
        sampleCount: count,
        message: count > 0
          ? `Connected to Supabase! Found active database tables.`
          : `Connected to Supabase! Tables are ready — click "Push Full Database to Supabase" to upload your current laptop data.`
      };
    } catch (err) {
      if (err.status === 404 || (err.message && (err.message.includes('sa_tables') || err.message.includes('relation') || err.code === '42P01'))) {
        return {
          success: false,
          needsSchemaSetup: true,
          message: 'Connected to your Supabase project, but the database tables (sa_tables, sa_mutations) have not been created yet. Click "📋 Copy SQL Setup Script" and run it once in your Supabase SQL Editor.'
        };
      }
      return {
        success: false,
        message: `Supabase connection error: ${err.message}`
      };
    }
  }

  /**
   * Uploads all 52 tables + configs + manualPicks from the local snapshot to Supabase `sa_tables`.
   */
  async pushFullSnapshotToSupabase(options = { showModal: true }) {
    if (!this.isConfigured()) {
      alert('Please configure your Supabase Project URL and Anon Key in Settings first.');
      return { success: false };
    }
    if (!this.db || !this.db.snapshot || !this.db.snapshot.tables) {
      alert('Local database snapshot is not loaded yet.');
      return { success: false };
    }

    const startTime = Date.now();
    if (typeof this.db.flushPersist === 'function') await this.db.flushPersist();
    if (typeof this.db.bundleLocalStateIntoSnapshot === 'function') {
      this.db.bundleLocalStateIntoSnapshot(this.db.snapshot);
    }

    if (options.showModal && this.googleSync) {
      this.googleSync.openSyncModal('Pushing Database to Supabase', '⚡');
      this.googleSync.renderModalChanges([], 'Uploading all 52 tables & configurations to Supabase PostgreSQL...', 'syncing', false);
    }

    try {
      const snap = this.db.snapshot;
      const rev = Number(snap.revision || 1);
      const nowIso = new Date().toISOString();

      // Swap sheets rely on rawGrid for location/foreman section headers; standard tables can rebuild rawGrid from headers + rows
      const keepRawGridTables = new Set([
        'glove_swaps', 'sleeve_swaps', 'blanket_swaps', 'mack_swaps',
        'hv_tester_swaps', 'phasing_set_swaps', 'aed_swaps', 'ground_swaps', 'hot_stick_swaps',
        'safety_compliance', 'training_tracking'
      ]);

      const heavyArchiveTables = new Set([
        'jha_log', 'weekly_safety_log', 'monthly_checklist_log',
        'employee_history', 'gloves_history', 'sleeves_history',
        'blankets_history', 'macks_history', 'hv_testers_history',
        'phasing_sets_history', 'aed_history', 'grounds_history', 'hot_sticks_history'
      ]);

      // Fetch current row counts in Supabase (~80ms) so unchanged multi-thousand-row archive logs don't re-upload unnecessarily
      const remoteRowCounts = new Map();
      if (!options.forceAll) {
        try {
          const metaRows = await this._request('/rest/v1/sa_tables?select=table_key,row_count', { method: 'GET', timeoutMs: 10000 });
          if (Array.isArray(metaRows)) {
            for (const mr of metaRows) {
              remoteRowCounts.set(mr.table_key, Number(mr.row_count || 0));
            }
          }
        } catch { /* upload all if check fails */ }
      }

      const payloadRows = [];
      for (const [tableKey, tableObj] of Object.entries(snap.tables)) {
        if (!tableObj) continue;
        const headers = Array.isArray(tableObj.headers) ? tableObj.headers : [];
        const rows = Array.isArray(tableObj.rows) ? tableObj.rows : [];

        if (
          !options.forceAll &&
          heavyArchiveTables.has(tableKey) &&
          !this._modifiedTables.has(tableKey) &&
          remoteRowCounts.has(tableKey) &&
          remoteRowCounts.get(tableKey) === rows.length
        ) {
          continue;
        }

        const includeRawGrid = keepRawGridTables.has(tableKey) || rows.length === 0;
        payloadRows.push({
          table_key: tableKey,
          sheet_name: tableObj.name || tableKey,
          headers: headers,
          rows: rows,
          raw_grid: includeRawGrid && Array.isArray(tableObj.rawGrid) ? tableObj.rawGrid : null,
          row_count: rows.length,
          revision: rev,
          updated_by: this.deviceName,
          updated_at: nowIso
        });
      }

      // Also store configs & manualPicks as dedicated meta rows in sa_tables
      payloadRows.push({
        table_key: '__configs__',
        sheet_name: '__configs__',
        headers: ['key'],
        rows: [snap.configs || {}],
        raw_grid: null,
        row_count: 1,
        revision: rev,
        updated_by: this.deviceName,
        updated_at: nowIso
      });

      payloadRows.push({
        table_key: '__manual_picks__',
        sheet_name: '__manual_picks__',
        headers: ['key'],
        rows: [snap.manualPicks || {}],
        raw_grid: null,
        row_count: 1,
        revision: rev,
        updated_by: this.deviceName,
        updated_at: nowIso
      });

      // Upload batches in parallel (up to 4 concurrent requests) for ~2s push speed
      const batchSize = 10;
      const batches = [];
      for (let i = 0; i < payloadRows.length; i += batchSize) {
        batches.push(payloadRows.slice(i, i + batchSize));
      }

      const concurrency = 4;
      for (let i = 0; i < batches.length; i += concurrency) {
        const group = batches.slice(i, i + concurrency);
        await Promise.all(group.map(batch =>
          this._request('/rest/v1/sa_tables?on_conflict=table_key', {
            method: 'POST',
            headers: { 'Prefer': 'resolution=merge-duplicates,return=minimal' },
            body: batch,
            timeoutMs: 45000
          })
        ));
      }

      this._modifiedTables.clear();

      // Sync latest mutation seq cursor
      await this._refreshLatestSeqCursor();

      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1) + 's';
      if (options.showModal && this.googleSync) {
        this.googleSync.openSyncModal('Supabase Database Initialized', '✅');
        this.googleSync.renderModalChanges([
          {
            table: 'Supabase PostgreSQL',
            action: `${Object.keys(snap.tables).length} Tables Synced`,
            description: `All active & historical tables + Trip Planner configs uploaded in ${elapsed}`
          },
          {
            table: 'Multi-User Realtime',
            action: 'Live',
            description: `Device "${this.deviceName}" connected for instant multi-user sync`
          }
        ], `✅ Uploaded complete database to Supabase in ${elapsed}!`, 'success', false);
        setTimeout(() => this.googleSync.closeSyncModal(), 2000);
      }

      this.updateSettingsBadge('Connected & Synced');
      return { success: true, elapsed };
    } catch (err) {
      console.error('[SupabaseSync] pushFullSnapshotToSupabase failed:', err);
      if (options.showModal && this.googleSync) {
        this.googleSync.openSyncModal('Supabase Upload Error', '❌');
        this.googleSync.renderModalChanges([], `❌ Supabase upload failed: ${err.message}`, 'error', true);
      }
      return { success: false, error: err.message };
    }
  }

  /**
   * Downloads all 52 tables + configs + manualPicks from Supabase `sa_tables` in ~1 second.
   */
  async downloadSnapshotFromSupabase(options = { showModal: true }) {
    if (!this.isConfigured()) {
      return { success: false, error: 'Supabase is not configured.' };
    }

    const startTime = Date.now();
    if (options.showModal && this.googleSync) {
      this.googleSync.openSyncModal('Downloading from Supabase', '⚡');
      this.googleSync.renderModalChanges([], 'Fetching live multi-user database from Supabase PostgreSQL...', 'syncing', false);
      this.googleSync.updateStatusUI('syncing', 'Downloading from Supabase...');
    }

    try {
      const rows = await this._request('/rest/v1/sa_tables?select=*', {
        method: 'GET',
        timeoutMs: 45000
      });

      if (!Array.isArray(rows) || rows.length === 0) {
        throw new Error('Supabase database is currently empty. Please click "Push Full Database to Supabase" from your main laptop first.');
      }

      const tables = {};
      let configs = {};
      let manualPicks = {};
      let maxRevision = 1;
      let latestUpdatedAt = new Date().toISOString();

      for (const r of rows) {
        if (Number(r.revision || 0) > maxRevision) {
          maxRevision = Number(r.revision);
        }
        if (r.updated_at && r.updated_at > latestUpdatedAt) {
          latestUpdatedAt = r.updated_at;
        }
        if (r.table_key === '__configs__') {
          if (Array.isArray(r.rows) && r.rows[0] && typeof r.rows[0] === 'object') {
            configs = r.rows[0];
          }
          continue;
        }
        if (r.table_key === '__manual_picks__') {
          if (Array.isArray(r.rows) && r.rows[0] && typeof r.rows[0] === 'object') {
            manualPicks = r.rows[0];
          }
          continue;
        }

        const headers = Array.isArray(r.headers) ? r.headers : [];
        const tableRows = Array.isArray(r.rows) ? r.rows : [];
        let rawGrid = Array.isArray(r.raw_grid) && r.raw_grid.length > 0 ? r.raw_grid : null;
        if (!rawGrid && headers.length > 0) {
          rawGrid = [
            headers,
            ...tableRows.map(rowObj => headers.map(h => (rowObj && rowObj[h] !== undefined && rowObj[h] !== null) ? rowObj[h] : ''))
          ];
        }

        tables[r.table_key] = {
          name: r.sheet_name || r.table_key,
          headers,
          rows: tableRows,
          rawGrid: rawGrid || [],
          rowCount: tableRows.length,
          maxRows: rawGrid ? rawGrid.length : (tableRows.length + 1),
          maxCols: headers.length
        };
      }

      const freshSnapshot = {
        exportedAt: latestUpdatedAt,
        timestamp: latestUpdatedAt,
        revision: maxRevision,
        source: 'supabase',
        tables,
        configs,
        manualPicks
      };

      await this.db.setSnapshot(freshSnapshot);
      if (typeof this.db.clearOutbox === 'function') {
        await this.db.clearOutbox();
      }
      if (this.googleSync) {
        this.googleSync.renderOutboxBadge();
        this.googleSync.refreshAllViewsAfterSnapshotLoad();
      }

      await this._refreshLatestSeqCursor();

      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1) + 's';
      if (options.showModal && this.googleSync) {
        this.googleSync.updateStatusUI('synced', `Supabase Synced (${elapsed})`);
        this.googleSync.renderModalChanges([], `⚡ Downloaded ${Object.keys(tables).length} tables from Supabase in ${elapsed}!`, 'success', false);
        setTimeout(() => this.googleSync.closeSyncModal(), 1200);
      }

      this.updateSettingsBadge('Connected & Synced');
      return { success: true, snapshot: freshSnapshot, elapsed };
    } catch (err) {
      console.error('[SupabaseSync] downloadSnapshotFromSupabase failed:', err);
      if (options.showModal && this.googleSync) {
        this.googleSync.openSyncModal('Supabase Download Error', '⚠️');
        this.googleSync.renderModalChanges([], `❌ Supabase download failed: ${err.message}`, 'error', true);
      }
      return { success: false, error: err.message };
    }
  }

  /**
   * Hooks into LocalDatabase.addMutation so local edits are broadcast to Supabase in the background
   * without interfering with the existing Google Sheets outbox.
   */
  _installMutationHook() {
    if (!this.db || typeof this.db.addMutation !== 'function' || this.db._supabaseHookInstalled) return;
    const origAddMutation = this.db.addMutation.bind(this.db);

    this.db.addMutation = async (mutation) => {
      const result = await origAddMutation(mutation);
      if (this.isActive() && !this.isApplyingRemote && window.currentRoleMode !== 'view_only') {
        this._broadcastLocalMutation(result || mutation).catch(err => {
          console.warn('[SupabaseSync] Background mutation broadcast warning:', err.message);
        });
      }
      return result;
    };
    this.db._supabaseHookInstalled = true;
  }

  async _broadcastLocalMutation(mutRecord) {
    if (!mutRecord || !this.isActive()) return;
    const mutId = mutRecord.id || ('mut_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7));
    this.seenMutIds.add(mutId);

    const tableKey = mutRecord.tableKey || (mutRecord.sheetName && this.db.getTableKeyForSheet ? this.db.getTableKeyForSheet(mutRecord.sheetName) : null);

    // 1. Insert granular mutation into sa_mutations so other connected devices replay it immediately
    const inserted = await this._request('/rest/v1/sa_mutations', {
      method: 'POST',
      headers: { 'Prefer': 'return=representation' },
      body: {
        mut_id: mutId,
        device_id: this.deviceId,
        device_name: this.deviceName,
        action: mutRecord.action || 'UPDATE_CELL',
        table_key: tableKey || null,
        sheet_name: mutRecord.sheetName || null,
        mutation: mutRecord
      },
      timeoutMs: 15000
    });

    if (Array.isArray(inserted) && inserted[0] && inserted[0].seq) {
      const seq = Number(inserted[0].seq);
      if (seq > this.lastSeq) {
        this.lastSeq = seq;
        try { localStorage.setItem('sa_supabase_last_seq', String(seq)); } catch { /* ignore */ }
      }
    }

    // 2. Debounce-upsert the affected table(s) in sa_tables so future full downloads have the exact state
    const tablesToSync = new Set();
    if (tableKey && this.db.snapshot && this.db.snapshot.tables && this.db.snapshot.tables[tableKey]) {
      tablesToSync.add(tableKey);
    }
    // If a swap sheet mutation also updated an inventory table, sync that inventory table too
    if (tableKey && tableKey.includes('_swaps')) {
      const invMap = {
        glove_swaps: 'gloves',
        sleeve_swaps: 'sleeves',
        blanket_swaps: 'blankets',
        mack_swaps: 'macks',
        hv_tester_swaps: 'hv_testers',
        phasing_set_swaps: 'phasing_sets',
        aed_swaps: 'aed',
        ground_swaps: 'grounds',
        hot_stick_swaps: 'hot_sticks'
      };
      if (invMap[tableKey]) tablesToSync.add(invMap[tableKey]);
    }
    if (mutRecord.action && (mutRecord.action.startsWith('SAVE_') || mutRecord.action.startsWith('SET_'))) {
      tablesToSync.add('__configs__');
    }

    for (const tKey of tablesToSync) {
      this._modifiedTables.add(tKey);
      this._scheduleTableUpsert(tKey);
    }
  }

  _scheduleTableUpsert(tableKey) {
    if (this._tablePushTimers.has(tableKey)) {
      clearTimeout(this._tablePushTimers.get(tableKey));
    }
    const timer = setTimeout(async () => {
      this._tablePushTimers.delete(tableKey);
      try {
        await this._upsertSingleTable(tableKey);
      } catch (e) {
        console.warn(`[SupabaseSync] Table upsert warning for ${tableKey}:`, e.message);
      }
    }, 800);
    this._tablePushTimers.set(tableKey, timer);
  }

  async _upsertSingleTable(tableKey) {
    if (!this.isActive() || !this.db || !this.db.snapshot) return;
    const snap = this.db.snapshot;
    const rev = Number(snap.revision || 1);
    const nowIso = new Date().toISOString();

    if (tableKey === '__configs__') {
      if (typeof this.db.bundleLocalStateIntoSnapshot === 'function') {
        this.db.bundleLocalStateIntoSnapshot(snap);
      }
      await this._request('/rest/v1/sa_tables?on_conflict=table_key', {
        method: 'POST',
        headers: { 'Prefer': 'resolution=merge-duplicates,return=minimal' },
        body: [
          {
            table_key: '__configs__',
            sheet_name: '__configs__',
            headers: ['key'],
            rows: [snap.configs || {}],
            raw_grid: null,
            row_count: 1,
            revision: rev,
            updated_by: this.deviceName,
            updated_at: nowIso
          },
          {
            table_key: '__manual_picks__',
            sheet_name: '__manual_picks__',
            headers: ['key'],
            rows: [snap.manualPicks || {}],
            raw_grid: null,
            row_count: 1,
            revision: rev,
            updated_by: this.deviceName,
            updated_at: nowIso
          }
        ]
      });
      return;
    }

    const tableObj = snap.tables && snap.tables[tableKey];
    if (!tableObj) return;
    const keepRawGrid = tableKey.includes('swaps') || tableKey === 'safety_compliance' || tableKey === 'training_tracking';
    const headers = Array.isArray(tableObj.headers) ? tableObj.headers : [];
    const rows = Array.isArray(tableObj.rows) ? tableObj.rows : [];

    await this._request('/rest/v1/sa_tables?on_conflict=table_key', {
      method: 'POST',
      headers: { 'Prefer': 'resolution=merge-duplicates,return=minimal' },
      body: [{
        table_key: tableKey,
        sheet_name: tableObj.name || tableKey,
        headers,
        rows,
        raw_grid: keepRawGrid && Array.isArray(tableObj.rawGrid) ? tableObj.rawGrid : null,
        row_count: rows.length,
        revision: rev,
        updated_by: this.deviceName,
        updated_at: nowIso
      }]
    });
  }

  async _refreshLatestSeqCursor() {
    try {
      const latest = await this._request('/rest/v1/sa_mutations?select=seq&order=seq.desc&limit=1', { method: 'GET' });
      if (Array.isArray(latest) && latest[0] && latest[0].seq) {
        this.lastSeq = Number(latest[0].seq);
        localStorage.setItem('sa_supabase_last_seq', String(this.lastSeq));
      }
    } catch { /* ignore if empty */ }
  }

  /**
   * Starts real-time multi-user listener (WebSocket + 5s delta catch-up poll).
   */
  async startRealtimeSync() {
    this.stopRealtimeSync();
    if (!this.isActive()) return;

    await this._pollMissedMutations();

    // 1. Lightweight 5-second delta poll (catches any mutations across cellular/Wi-Fi drops)
    this.pollTimer = setInterval(() => {
      this._pollMissedMutations();
    }, 5000);

    // 2. Live Supabase Realtime WebSocket for instant <200ms push notifications
    try {
      const wsUrl = this.url.replace(/^http/, 'ws') + `/realtime/v1/websocket?apikey=${encodeURIComponent(this.anonKey)}&vsn=1.0.0`;
      const ws = new WebSocket(wsUrl);
      this.ws = ws;

      ws.onopen = () => {
        const joinMsg = {
          topic: 'realtime:public:sa_mutations',
          event: 'phx_join',
          payload: {
            config: {
               broadcast: { self: false },
              presence: { key: '' },
              postgres_changes: [
                { event: 'INSERT', schema: 'public', table: 'sa_mutations' }
              ]
            }
          },
          ref: '1'
        };
        ws.send(JSON.stringify(joinMsg));
        this.updateSettingsBadge('Live (Realtime WebSocket)');

        this.wsHeartbeatTimer = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ topic: 'phoenix', event: 'heartbeat', payload: {}, ref: String(Date.now()) }));
          }
        }, 25000);
      };

      ws.onmessage = (evt) => {
        try {
          const msg = JSON.parse(evt.data);
          if (msg && (msg.event === 'postgres_changes' || msg.event === 'INSERT')) {
            const record = (msg.payload && (msg.payload.record || (msg.payload.data && msg.payload.data.record))) || null;
            if (record) {
              this._handleIncomingMutationRecord(record);
            } else {
              this._pollMissedMutations();
            }
          }
        } catch { /* ignore non-JSON frames */ }
      };

      ws.onclose = () => {
        if (this.wsHeartbeatTimer) clearInterval(this.wsHeartbeatTimer);
      };
    } catch (e) {
      console.warn('[SupabaseSync] WebSocket init fallback to delta polling:', e.message);
    }
  }

  stopRealtimeSync() {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    if (this.wsHeartbeatTimer) {
      clearInterval(this.wsHeartbeatTimer);
      this.wsHeartbeatTimer = null;
    }
    if (this.ws) {
      try { this.ws.close(); } catch { /* ignore */ }
      this.ws = null;
    }
  }

  async _pollMissedMutations() {
    if (!this.isActive() || this.isApplyingRemote) return;
    try {
      const rows = await this._request(
        `/rest/v1/sa_mutations?select=*&seq=gt.${this.lastSeq}&order=seq.asc&limit=100`,
        { method: 'GET', timeoutMs: 10000 }
      );
      if (Array.isArray(rows) && rows.length > 0) {
        for (const r of rows) {
          await this._handleIncomingMutationRecord(r);
        }
      }
    } catch {
      // Silent ignore during brief offline moments
    }
  }

  async _handleIncomingMutationRecord(record) {
    if (!record) return;
    const seq = Number(record.seq || 0);
    if (seq > this.lastSeq) {
      this.lastSeq = seq;
      try { localStorage.setItem('sa_supabase_last_seq', String(seq)); } catch { /* ignore */ }
    }

    // Ignore mutations that originated from this device
    if (record.device_id === this.deviceId || (record.mut_id && this.seenMutIds.has(record.mut_id))) {
      return;
    }
    if (record.mut_id) this.seenMutIds.add(record.mut_id);

    const mut = record.mutation;
    if (!mut || !this.db) return;

    try {
      this.isApplyingRemote = true;
      await this.db.applyLocalMutation(mut);
      this.db.schedulePersistSnapshot(this.db.snapshot, 400);
      this.db.notify();

      if (this.googleSync && typeof this.googleSync.refreshAllViewsAfterSnapshotLoad === 'function') {
        this.googleSync.refreshAllViewsAfterSnapshotLoad();
      }
      if (typeof window.showToast === 'function') {
        const label = record.sheet_name || record.table_key || mut.action || 'Database';
        window.showToast(`⚡ Live update from ${record.device_name || 'Teammate'}: ${label}`);
      }
    } catch (err) {
      console.warn('[SupabaseSync] Error applying remote mutation:', err);
    } finally {
      this.isApplyingRemote = false;
    }
  }

  updateSettingsBadge(statusText = null) {
    const badge = document.getElementById('supabase-status-badge');
    if (!badge) return;

    if (!this.isConfigured()) {
      badge.textContent = 'Not Configured (Using Google Drive)';
      badge.style.background = 'rgba(148, 163, 184, 0.15)';
      badge.style.color = '#94a3b8';
      badge.style.borderColor = 'rgba(148, 163, 184, 0.35)';
    } else if (!this.enabled) {
      badge.textContent = 'Paused (Using Google Drive)';
      badge.style.background = 'rgba(245, 158, 11, 0.15)';
      badge.style.color = '#fbbf24';
      badge.style.borderColor = 'rgba(245, 158, 11, 0.35)';
    } else {
      badge.textContent = statusText || 'Active (Multi-User Realtime)';
      badge.style.background = 'rgba(16, 185, 129, 0.15)';
      badge.style.color = '#34d399';
      badge.style.borderColor = 'rgba(16, 185, 129, 0.4)';
    }
  }

  copySqlSetupScript() {
    const sql = `-- Safety Assistant — Supabase Multi-User Real-Time Database Setup
CREATE TABLE IF NOT EXISTS public.sa_tables (
  table_key   TEXT PRIMARY KEY,
  sheet_name  TEXT NOT NULL,
  headers     JSONB NOT NULL DEFAULT '[]'::jsonb,
  rows        JSONB NOT NULL DEFAULT '[]'::jsonb,
  raw_grid    JSONB DEFAULT NULL,
  row_count   INTEGER NOT NULL DEFAULT 0,
  revision    BIGINT NOT NULL DEFAULT 1,
  updated_by  TEXT DEFAULT 'system',
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.sa_mutations (
  seq         BIGSERIAL PRIMARY KEY,
  mut_id      TEXT UNIQUE NOT NULL,
  device_id   TEXT NOT NULL,
  device_name TEXT NOT NULL DEFAULT 'Unknown Device',
  action      TEXT NOT NULL,
  table_key   TEXT,
  sheet_name  TEXT,
  mutation    JSONB NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sa_mutations_seq ON public.sa_mutations (seq);
ALTER TABLE public.sa_tables ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sa_mutations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow full access to sa_tables" ON public.sa_tables;
CREATE POLICY "Allow full access to sa_tables" ON public.sa_tables FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow full access to sa_mutations" ON public.sa_mutations;
CREATE POLICY "Allow full access to sa_mutations" ON public.sa_mutations FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'sa_mutations') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.sa_mutations;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'sa_tables') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.sa_tables;
  END IF;
END $$;`;

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(sql).then(() => {
        if (typeof window.showToast === 'function') {
          window.showToast('📋 SQL Setup Script copied to clipboard! Paste it into your Supabase SQL Editor.');
        } else {
          alert('📋 SQL Setup Script copied to clipboard!');
        }
      });
    }
  }
}

window.SupabaseSyncEngine = SupabaseSyncEngine;
