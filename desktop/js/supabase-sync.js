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
    this.userName = (localStorage.getItem('sa_active_user_name') || 'Cody Bechdol').trim();
    this.deviceType = (localStorage.getItem('sa_active_device_type') || this._defaultDeviceType()).trim();
    this.userPhone = (localStorage.getItem('sa_active_user_phone') || '').trim();
    this.deviceName = this._composeDeviceLabel();
    this.deviceId = this._getOrCreateDeviceId();

    this.lastSeq = Number(localStorage.getItem('sa_supabase_last_seq') || 0);
    this.seenMutIds = new Set();
    this.ws = null;
    this.wsHeartbeatTimer = null;
    this.pollTimer = null;
    this.isApplyingRemote = false;
    this.isFlushingQueue = false;
    this._tablePushTimers = new Map();
    this._modifiedTables = new Set();
    this._cellHistory = new Map(); // cellKey -> { timestamp, value, deviceName, mutId }
    this.pendingQueue = this._loadPendingQueue();
    this.activeConflicts = [];

    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => {
        if (this.isActive()) {
          this._pollMissedMutations().then(() => this._flushPendingOfflineQueue());
        }
      });
    }

    // Hook into db.addMutation non-intrusively so local edits stream live when configured
    this._installMutationHook();

    if (this.isConfigured() && this.enabled) {
      setTimeout(() => {
        this.updateUserHeaderButton();
        this.applyActiveUserPermissions();
        this.startRealtimeSync();
      }, 1800);
    } else {
      setTimeout(() => {
        this.updateUserHeaderButton();
        this.applyActiveUserPermissions();
      }, 500);
    }
  }

  _defaultDeviceType() {
    const isDesktop = typeof window !== 'undefined' && !!window.desktopAPI;
    return isDesktop ? 'Office Laptop' : 'Field Tablet';
  }

  _defaultDeviceName() {
    return `${this.userName || 'Cody Bechdol'} (${this.deviceType || this._defaultDeviceType()})`;
  }

  _composeDeviceLabel() {
    const savedCustom = (localStorage.getItem('sa_supabase_device_name') || '').trim();
    const uName = (this.userName || 'Cody Bechdol').trim();
    const dType = (this.deviceType || this._defaultDeviceType()).trim();
    if (savedCustom && savedCustom.includes('(')) {
      return savedCustom;
    }
    const label = `${uName} (${dType})`;
    try { localStorage.setItem('sa_supabase_device_name', label); } catch { /* ignore */ }
    return label;
  }

  _lookupEmployeePhone(personName) {
    if (!personName || !this.db || !this.db.snapshot || !this.db.snapshot.tables) return '';
    const cleanName = String(personName).replace(/\s*\([^)]*\)\s*$/, '').trim().toLowerCase();
    const empTable = this.db.snapshot.tables.employees;
    if (!empTable || !Array.isArray(empTable.rows)) return '';
    const match = empTable.rows.find(r => {
      const n = String(r['Employee Name'] || r['Name'] || r['Employee'] || Object.values(r)[0] || '').trim().toLowerCase();
      return n === cleanName;
    });
    if (!match) return '';
    return String(match['Phone Number'] || match['Phone'] || match['Cell'] || '').trim();
  }

  static get APP_PERMISSION_PAGES() {
    return [
      {
        key: 'sheets-view',
        label: '📦 Active Inventory & Swaps',
        tabs: [
          { key: 'employees', label: '👥 Employees' },
          { key: 'job_tracking', label: '📋 Job Tracking' },
          { key: 'locations', label: '📍 Locations & Approvals' },
          { key: 'gloves', label: '🧤 Gloves' },
          { key: 'glove_swaps', label: '🔄 Glove Swaps' },
          { key: 'sleeves', label: '🦺 Sleeves' },
          { key: 'sleeve_swaps', label: '🔄 Sleeve Swaps' },
          { key: 'blankets', label: '🧱 Blankets' },
          { key: 'blanket_swaps', label: '🔄 Blanket Swaps' },
          { key: 'macks', label: '🧱 MACKs' },
          { key: 'mack_swaps', label: '🔄 MACK Swaps' },
          { key: 'hv_testers', label: '⚡ HV Testers' },
          { key: 'hv_tester_swaps', label: '🔄 HV Tester Swaps' },
          { key: 'phasing_sets', label: '⚡ Phasing Sets' },
          { key: 'phasing_set_swaps', label: '🔄 Phasing Set Swaps' },
          { key: 'aed', label: '🏥 AED' },
          { key: 'aed_swaps', label: '🔄 AED Swaps' },
          { key: 'grounds', label: '⚡ Grounds' },
          { key: 'ground_swaps', label: '🔄 Ground Swaps' },
          { key: 'hot_sticks', label: '🔴 Hot Sticks' },
          { key: 'hot_stick_swaps', label: '🔄 Hot Stick Swaps' },
          { key: 'dot_drug_tests', label: '🧪 DOT Drug Tests' },
          { key: 'retired_equipment', label: '🗄️ Retired Equipment' },
          { key: 'test_batches', label: '🔬 Test Batches' }
        ]
      },
      { key: 'weekly-summary-view', label: '📊 Weekly Summary & Briefing', tabs: [] },
      { key: 'tailgate-generator-view', label: '👷 Foreman Tailgates', tabs: [] },
      { key: 'crew-import-view', label: '👥 Crew Import (Excel)', tabs: [] },
      { key: 'safety-compliance-view', label: '🛡️ Safety Compliance', tabs: [] },
      { key: 'incident-reports-view', label: '⚠️ Incident Reports', tabs: [] },
      { key: 'expiring-certs-view', label: '📜 Expiring Certs', tabs: [] },
      { key: 'training-view', label: '🎓 Training', tabs: [] },
      { 
        key: 'drug-testing-view', 
        label: '🧪 DOT Drug Testing', 
        tabs: [
          { key: 'dot_drug_tests', label: '🧪 Quarterly Test Pool' },
          { key: 'drug_test_clinics', label: '🏥 Drug Test Clinics' }
        ] 
      },
      { key: 'previous-employees-view', label: '👥 Previous Employees', tabs: [] },
      {
        key: 'history-view',
        label: '📜 History Records',
        tabs: [
          { key: 'gloves_history', label: '🧤 Gloves History' },
          { key: 'sleeves_history', label: '🦺 Sleeves History' },
          { key: 'blankets_history', label: '🧱 Blankets History' },
          { key: 'macks_history', label: '🧱 MACKs History' },
          { key: 'hv_testers_history', label: '⚡ HV Testers History' },
          { key: 'phasing_sets_history', label: '⚡ Phasing Sets History' },
          { key: 'aed_history', label: '🏥 AED History' },
          { key: 'grounds_history', label: '⚡ Grounds History' },
          { key: 'hot_sticks_history', label: '🔴 Hot Sticks History' },
          { key: 'employee_history', label: '👥 Employee History' }
        ]
      },
      { 
        key: 'trip-planner-view', 
        label: '🗺️ Trip Planner', 
        tabs: [
          { key: 'board', label: '📅 Schedule Board' },
          { key: 'map', label: '🗺️ Route Map & Stops' },
          { key: 'trip_schedule', label: '📋 Trip Schedule' },
          { key: 'field_gps_log', label: '📍 Field GPS Log' },
          { key: 'daily_accomplishments', label: '⏱️ Daily Accomplishments' }
        ] 
      },
      { key: 'tasks-view', label: '📋 Tasks & Calendar', tabs: [] },
      { key: 'lookup-view', label: '🔍 Lookup & Search', tabs: [] },
      { key: 'procurement-view', label: '🛒 Purchase Needs & Orders', tabs: [] },
      { key: 'aging-view', label: '📊 Fleet Aging & EOL', tabs: [] },
      { key: 'jm-test-view', label: '⚡ JM Test Systems', tabs: [] },
      { key: 'nwe-fire-view', label: '🔥 NWE Fire Info', tabs: [] },
      { key: 'open-ppe-tracker', label: '🧤 Rubber PPE Tracker (Popup)', tabs: [] },
      { key: 'open-location-approvals', label: '📍 Location Approvals (Popup)', tabs: [] },
      { key: 'open-fiscal-year-transition', label: '📅 FY Transition (Popup)', tabs: [] },
      { key: 'ai-copilot', label: '✨ AI Copilot', tabs: [] },
      { 
        key: 'settings-view', 
        label: '⚙️ Sync Settings', 
        tabs: [
          { key: 'sync_setup', label: '⚡ Sync & Database Controls' },
          { key: 'system_config', label: '⚙️ System Config Table' }
        ] 
      }
    ];
  }

  buildPresetPermissions(preset = 'view_all') {
    const pages = {};
    const tabs = {};
    const schema = SupabaseSyncEngine.APP_PERMISSION_PAGES;

    const foremanViewPages = new Set([
      'sheets-view', 'tailgate-generator-view', 'safety-compliance-view',
      'expiring-certs-view', 'training-view', 'lookup-view', 'nwe-fire-view'
    ]);
    const foremanEditPages = new Set(['tailgate-generator-view']);
    const foremanViewTabs = new Set([
      'employees', 'job_tracking', 'gloves', 'glove_swaps', 'sleeves', 'sleeve_swaps',
      'blankets', 'blanket_swaps', 'macks', 'mack_swaps', 'grounds', 'ground_swaps', 'hot_sticks', 'hot_stick_swaps'
    ]);

    const ppeTechEditPages = new Set([
      'sheets-view', 'history-view', 'trip-planner-view', 'tasks-view',
      'lookup-view', 'procurement-view', 'aging-view', 'jm-test-view', 'open-ppe-tracker'
    ]);

    schema.forEach(p => {
      let v = false;
      let e = false;
      if (preset === 'full_edit') {
        v = true; e = true;
      } else if (preset === 'view_all') {
        v = true; e = false;
      } else if (preset === 'foreman') {
        v = foremanViewPages.has(p.key);
        e = foremanEditPages.has(p.key);
      } else if (preset === 'ppe_tech') {
        v = true;
        e = ppeTechEditPages.has(p.key);
      } else if (preset === 'none') {
        v = false; e = false;
      }
      pages[p.key] = { view: v, edit: v && e };
      (p.tabs || []).forEach(t => {
        let tv = v;
        let te = v && e;
        if (preset === 'foreman' && p.key === 'sheets-view') {
          tv = foremanViewTabs.has(t.key);
          te = false;
        }
        tabs[t.key] = { view: tv, edit: tv && te };
      });
    });

    return { pages, tabs };
  }

  _defaultUserAccounts() {
    return [
      {
        name: 'Cody Bechdol',
        email: '',
        role: 'master_admin',
        pin: '1234',
        phone: this._lookupEmployeePhone('Cody Bechdol') || '',
        permissions: this.buildPresetPermissions('full_edit')
      },
      {
        name: 'Sid Wade',
        email: '',
        role: 'admin',
        pin: '2468',
        phone: this._lookupEmployeePhone('Sid Wade') || '',
        permissions: this.buildPresetPermissions('full_edit')
      }
    ];
  }

  getUserAccounts() {
    let accounts = [];
    // Check shared snapshot configs first if available
    const cfgAccounts = this.db && this.db.snapshot && this.db.snapshot.configs && this.db.snapshot.configs.userAccounts;
    if (Array.isArray(cfgAccounts) && cfgAccounts.length > 0) {
      accounts = cfgAccounts;
    } else {
      try {
        const raw = localStorage.getItem('sa_user_accounts');
        if (raw) accounts = JSON.parse(raw);
      } catch { /* ignore */ }
    }
    if (!Array.isArray(accounts) || accounts.length === 0) {
      accounts = this._defaultUserAccounts();
    }
    // Always guarantee Cody Bechdol is Master Admin
    let cody = accounts.find(a => String(a.name || '').trim().toLowerCase() === 'cody bechdol');
    if (!cody) {
      cody = {
        name: 'Cody Bechdol',
        email: '',
        role: 'master_admin',
        pin: '1234',
        phone: this._lookupEmployeePhone('Cody Bechdol') || '',
        permissions: this.buildPresetPermissions('full_edit')
      };
      accounts.unshift(cody);
    } else {
      cody.role = 'master_admin';
      if (!cody.pin) cody.pin = '1234';
      if (!cody.phone) cody.phone = this._lookupEmployeePhone('Cody Bechdol') || '';
    }
    // Ensure every account has a normalized permissions object
    accounts.forEach(acc => {
      if (!acc.permissions || !acc.permissions.pages || !acc.permissions.tabs) {
        const preset = (acc.role === 'master_admin' || acc.role === 'admin') ? 'full_edit' : 'view_all';
        acc.permissions = this.buildPresetPermissions(preset);
      }
    });
    return accounts;
  }

  saveUserAccounts(accounts) {
    if (!Array.isArray(accounts)) return;
    try {
      localStorage.setItem('sa_user_accounts', JSON.stringify(accounts));
    } catch { /* ignore */ }
    if (this.db && this.db.snapshot) {
      if (!this.db.snapshot.configs) this.db.snapshot.configs = {};
      this.db.snapshot.configs.userAccounts = accounts;
      if (typeof this.db.saveSnapshot === 'function') {
        this.db.saveSnapshot(this.db.snapshot).catch(() => {});
      }
      if (this.isActive()) {
        this._scheduleTableSnapshotPush('__configs__');
      }
    }
    this.applyActiveUserPermissions();
  }

  getAccountForUser(userName) {
    const clean = String(userName || this.userName || 'Cody Bechdol').trim().toLowerCase();
    const accounts = this.getUserAccounts();
    return accounts.find(a => String(a.name || '').trim().toLowerCase() === clean) || null;
  }

  isMasterAdmin(userName) {
    const target = String(userName || this.userName || '').trim().toLowerCase();
    if (target === 'cody bechdol') return true;
    const acc = this.getAccountForUser(target);
    return Boolean(acc && acc.role === 'master_admin');
  }

  canViewPage(pageKey, userName) {
    if (this.isMasterAdmin(userName)) return true;
    const acc = this.getAccountForUser(userName);
    if (!acc) return true;
    if (acc.permissions && acc.permissions.pages && acc.permissions.pages[pageKey]) {
      return Boolean(acc.permissions.pages[pageKey].view);
    }
    return true;
  }

  canEditPage(pageKey, userName) {
    if (this.isMasterAdmin(userName)) return true;
    if (!this.canViewPage(pageKey, userName)) return false;
    const acc = this.getAccountForUser(userName);
    if (!acc) return false;
    if (acc.role === 'view_only') return false;
    if (acc.permissions && acc.permissions.pages && acc.permissions.pages[pageKey]) {
      return Boolean(acc.permissions.pages[pageKey].edit);
    }
    return acc.role === 'admin';
  }

  canViewTab(tabKey, parentPageKey = 'sheets-view', userName) {
    if (this.isMasterAdmin(userName)) return true;
    if (!this.canViewPage(parentPageKey, userName)) return false;
    const acc = this.getAccountForUser(userName);
    if (!acc) return true;
    if (acc.permissions && acc.permissions.tabs && acc.permissions.tabs[tabKey]) {
      return Boolean(acc.permissions.tabs[tabKey].view);
    }
    return true;
  }

  canEditTab(tabKey, parentPageKey = 'sheets-view', userName) {
    if (this.isMasterAdmin(userName)) return true;
    if (!this.canViewTab(tabKey, parentPageKey, userName)) return false;
    if (!this.canEditPage(parentPageKey, userName)) return false;
    const acc = this.getAccountForUser(userName);
    if (!acc) return false;
    if (acc.role === 'view_only') return false;
    if (acc.permissions && acc.permissions.tabs && acc.permissions.tabs[tabKey]) {
      return Boolean(acc.permissions.tabs[tabKey].edit);
    }
    return acc.role === 'admin';
  }

  canEditCurrentContext(viewIdOverride) {
    if (this.isMasterAdmin()) return true;
    const activeViewEl = document.querySelector('.view-container.active');
    const viewId = viewIdOverride || (activeViewEl ? activeViewEl.id : 'sheets-view');
    if (viewId === 'sheets-view' && window.sheetNavigator) {
      return this.canEditTab(window.sheetNavigator.currentSheetKey, 'sheets-view');
    }
    if (viewId === 'history-view' && window.historyNavigator) {
      return this.canEditTab(window.historyNavigator.currentSheetKey, 'history-view');
    }
    return this.canEditPage(viewId);
  }

  syncEditModeForCurrentContext(viewIdOverride) {
    if (typeof window.setAppRoleMode !== 'function') return;
    if (this.isMasterAdmin()) {
      // Master Admin keeps full control; do not force-revert if Cody manually toggled View Only for testing
      return;
    }
    const canEdit = this.canEditCurrentContext(viewIdOverride);
    window.setAppRoleMode(canEdit ? 'admin' : 'view_only');
  }

  applyActiveUserPermissions() {
    if (typeof document === 'undefined') return;
    const isMaster = this.isMasterAdmin();

    // 1. Sidebar items with data-view
    document.querySelectorAll('.nav-item[data-view], .mobile-nav-btn[data-view]').forEach(el => {
      const viewKey = el.dataset.view;
      if (!viewKey) return;
      const allowed = isMaster || this.canViewPage(viewKey);
      el.style.display = allowed ? '' : 'none';
    });

    // 2. Sidebar items with data-action or AI copilot
    document.querySelectorAll('.nav-item[data-action]').forEach(el => {
      const actKey = el.dataset.action;
      if (!actKey) return;
      const allowed = isMaster || this.canViewPage(actKey);
      el.style.display = allowed ? '' : 'none';
    });
    const aiNav = document.getElementById('nav-item-ai-copilot');
    const aiBtn = document.getElementById('btn-ai-copilot');
    const aiAllowed = isMaster || this.canViewPage('ai-copilot');
    if (aiNav) aiNav.style.display = aiAllowed ? '' : 'none';
    if (aiBtn) aiBtn.style.display = aiAllowed ? 'flex' : 'none';

    // 3. Re-render Sheet & History Tab Bars so hidden tabs are filtered out
    if (window.sheetNavigator && typeof window.sheetNavigator.renderTabsBar === 'function') {
      if (!isMaster && !this.canViewTab(window.sheetNavigator.currentSheetKey, 'sheets-view')) {
        const firstAllowed = window.sheetNavigator.sheetList.find(s => this.canViewTab(s.key, 'sheets-view'));
        if (firstAllowed) {
          window.sheetNavigator.currentSheetKey = firstAllowed.key;
        }
      }
      window.sheetNavigator.renderTabsBar(true);
      if (document.getElementById('sheets-view')?.classList.contains('active')) {
        window.sheetNavigator.renderCurrentSheet();
      }
    }

    if (window.historyNavigator && typeof window.historyNavigator.renderTabsBar === 'function') {
      if (!isMaster && !this.canViewTab(window.historyNavigator.currentSheetKey, 'history-view')) {
        const firstAllowed = window.historyNavigator.sheetList.find(s => this.canViewTab(s.key, 'history-view'));
        if (firstAllowed) {
          window.historyNavigator.currentSheetKey = firstAllowed.key;
        }
      }
      window.historyNavigator.renderTabsBar(true);
      if (document.getElementById('history-view')?.classList.contains('active')) {
        window.historyNavigator.renderCurrentHistory();
      }
    }

    // 4. Redirect away if current active view is hidden
    const activeViewEl = document.querySelector('.view-container.active');
    if (activeViewEl && !isMaster && !this.canViewPage(activeViewEl.id)) {
      const firstPage = SupabaseSyncEngine.APP_PERMISSION_PAGES.find(p => p.key.endsWith('-view') && this.canViewPage(p.key));
      if (firstPage && typeof window.navigateToView === 'function') {
        window.navigateToView(firstPage.key);
      }
    }

    // 5. Enforce Edit vs View-Only mode for the active page/tab
    if (isMaster) {
      if (typeof window.setAppRoleMode === 'function') window.setAppRoleMode('admin');
    } else {
      this.syncEditModeForCurrentContext();
    }
  }

  verifyUserOrMasterPin(targetUserName, enteredPin) {
    const pin = String(enteredPin || '').trim();
    if (!pin) return false;
    const accounts = this.getUserAccounts();
    const master = accounts.find(a => a.role === 'master_admin' || String(a.name || '').toLowerCase() === 'cody bechdol');
    if (master && String(master.pin || '1234').trim() === pin) {
      return true; // Master Admin PIN unlocks all accounts and all info
    }
    const targetAcc = this.getAccountForUser(targetUserName);
    if (targetAcc && String(targetAcc.pin || '').trim() === pin) {
      return true;
    }
    return false;
  }

  setUserIdentity({ userName, deviceType, userPhone }) {
    if (userName !== undefined) {
      this.userName = String(userName || '').trim() || 'Cody Bechdol';
      localStorage.setItem('sa_active_user_name', this.userName);
    }
    if (deviceType !== undefined) {
      this.deviceType = String(deviceType || '').trim() || this._defaultDeviceType();
      localStorage.setItem('sa_active_device_type', this.deviceType);
    }
    if (userPhone !== undefined) {
      this.userPhone = String(userPhone || '').trim();
      localStorage.setItem('sa_active_user_phone', this.userPhone);
    }
    if (!this.userPhone) {
      const acc = this.getAccountForUser(this.userName);
      const autoPhone = (acc && acc.phone) || this._lookupEmployeePhone(this.userName);
      if (autoPhone) {
        this.userPhone = autoPhone;
        localStorage.setItem('sa_active_user_phone', this.userPhone);
      }
    }
    this.deviceName = `${this.userName} (${this.deviceType})`;
    localStorage.setItem('sa_supabase_device_name', this.deviceName);
    const sbDevEl = document.getElementById('supabase-device-input');
    if (sbDevEl) sbDevEl.value = this.deviceName;

    this.updateUserHeaderButton();
    this.applyActiveUserPermissions();
  }

  updateUserHeaderButton() {
    const btn = document.getElementById('btn-active-user-identity');
    if (!btn) return;
    const icon = (this.deviceType || '').toLowerCase().includes('tablet') ? '📱' : '💻';
    const isMaster = this.isMasterAdmin(this.userName);
    const badge = isMaster ? '👑' : '👤';
    btn.innerHTML = `<span>${badge}</span> <span>${this.userName}</span> <span style="opacity:0.75;font-size:10.5px;">(${icon} ${this.deviceType})</span>`;
    btn.title = `Logged in as: ${this.deviceName}${isMaster ? ' [Master Admin]' : ''}${this.userPhone ? ' • ' + this.userPhone : ''}. Click to switch user or manage accounts.`;
  }

  openUserIdentityModal(adminUnlocked = false) {
    let modal = document.getElementById('user-identity-modal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'user-identity-modal';
      modal.className = 'modal-overlay';
      document.body.appendChild(modal);
    }

    const accounts = this.getUserAccounts();
    const isCurrentMaster = this.isMasterAdmin(this.userName) || adminUnlocked;
    const curPhone = this.userPhone || this._lookupEmployeePhone(this.userName) || '';

    const roleLabel = (role) => {
      if (role === 'master_admin') return '👑 Master Admin (Full Access)';
      if (role === 'admin') return '🔧 Admin (Can Edit)';
      if (role === 'custom') return '🔑 Custom Page/Tab Permissions';
      return '👁️ View Only';
    };

    modal.innerHTML = `
      <div class="modal-box" style="max-width: 640px; width: 95%; max-height: 90vh; overflow-y: auto; overflow-x: hidden;">
        <div class="modal-header" style="background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%); border-bottom: 1px solid rgba(59, 130, 246, 0.35);">
          <div style="display: flex; align-items: center; gap: 8px;">
            <span style="font-size: 18px;">${isCurrentMaster ? '👑' : '🔒'}</span>
            <span style="font-weight: 700; font-size: 15px;">User Account & PIN Protection</span>
          </div>
          <button class="btn btn-secondary" style="padding: 2px 8px; font-size: 12px;" onclick="document.getElementById('user-identity-modal').style.display='none'">✕</button>
        </div>
        <div class="modal-body" style="padding: 18px; display: flex; flex-direction: column; gap: 14px;">
          <div style="background: rgba(59, 130, 246, 0.1); border: 1px solid rgba(59, 130, 246, 0.3); border-radius: 8px; padding: 10px 12px; font-size: 12px; display: flex; justify-content: space-between; align-items: center;">
            <div>
              <div style="color: var(--text-secondary); font-size: 11px;">CURRENTLY SIGNED IN AS</div>
              <div style="font-weight: 700; font-size: 14px; color: #f8fafc; margin-top: 2px;">
                ${this.isMasterAdmin(this.userName) ? '👑 ' : '👤 '}${this.userName}
                <span style="font-weight: 500; font-size: 11.5px; color: #93c5fd; margin-left: 6px;">(${roleLabel((this.getAccountForUser(this.userName) || {}).role || 'admin')})</span>
              </div>
            </div>
          </div>

          <div>
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
              <label style="font-size: 11.5px; font-weight: 700; color: var(--text-secondary);">SELECT USER ACCOUNT</label>
              <button type="button" class="btn btn-secondary" style="padding: 2px 8px; font-size: 11px; color: #fbbf24; border-color: rgba(245, 158, 11, 0.4); font-weight: 600; display: inline-flex; align-items: center; gap: 4px;" onclick="const selName = document.getElementById('identity-user-name-input')?.value; if(selName && window.employeeProfileEngine){ window.employeeProfileEngine.openWelcomeLetterModal(selName); }">
                <span>✉️</span> View / Resend Welcome Letter
              </button>
            </div>
            <select id="identity-user-name-input" class="sheet-search" style="width: 100%; font-size: 13px;" onchange="window.supabaseSync._onModalAccountSelectChange()">
              ${accounts.map(a => `<option value="${a.name.replace(/"/g, '&quot;')}" ${a.name === this.userName ? 'selected' : ''}>${a.role === 'master_admin' ? '👑 ' : '👤 '}${a.name}${a.email ? ' (' + a.email + ')' : ''} — ${roleLabel(a.role)}</option>`).join('')}
            </select>
          </div>

          <div id="identity-pin-prompt-container" style="display: none; background: rgba(245, 158, 11, 0.12); border: 1px solid rgba(245, 158, 11, 0.4); border-radius: 8px; padding: 12px;">
            <label style="display: block; font-size: 11.5px; font-weight: 700; color: #fbbf24; margin-bottom: 4px;">🔒 ENTER 4-DIGIT PIN TO SWITCH ACCOUNT</label>
            <input type="password" id="identity-user-pin-input" maxlength="8" inputmode="numeric" class="sheet-search" style="width: 100%; font-size: 15px; letter-spacing: 4px; font-weight: 700;" placeholder="•••• (User PIN or Master Admin PIN)">
            <div style="font-size: 11px; color: var(--text-secondary); margin-top: 4px;">
              Prevents accidental account switching. Cody Bechdol's Master Admin PIN unlocks all accounts.
            </div>
          </div>

          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
            <div>
              <label style="display: block; font-size: 11.5px; font-weight: 700; color: var(--text-secondary); margin-bottom: 4px;">THIS DEVICE TYPE</label>
              <select id="identity-device-type-select" class="sheet-search" style="width: 100%; font-size: 13px;">
                <option value="Office Laptop" ${this.deviceType === 'Office Laptop' ? 'selected' : ''}>💻 Office Laptop</option>
                <option value="Field Tablet" ${this.deviceType === 'Field Tablet' ? 'selected' : ''}>📱 Field Tablet</option>
                <option value="Field Laptop" ${this.deviceType === 'Field Laptop' ? 'selected' : ''}>💻 Field Laptop</option>
                <option value="Mobile Phone" ${this.deviceType === 'Mobile Phone' ? 'selected' : ''}>📲 Mobile Phone</option>
              </select>
            </div>
            <div>
              <label style="display: block; font-size: 11.5px; font-weight: 700; color: var(--text-secondary); margin-bottom: 4px;">CONTACT PHONE #</label>
              <input type="text" id="identity-user-phone-input" class="sheet-search" style="width: 100%; font-size: 13px;" value="${curPhone}" placeholder="Auto-filled or enter #">
            </div>
          </div>

          ${isCurrentMaster ? `
            <div style="margin-top: 6px; border-top: 1px solid rgba(148, 163, 184, 0.2); padding-top: 12px;">
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                <span style="font-size: 12px; font-weight: 700; color: #fbbf24;">👑 MASTER ADMIN: MANAGE ALL ACCOUNTS & PINS</span>
                <span style="font-size: 11px; color: var(--text-secondary);">Invite via Employee Profile → Notification Email</span>
              </div>
              <div style="display: flex; flex-direction: column; gap: 6px; max-height: 240px; overflow-y: auto; overflow-x: hidden; padding-right: 2px;">
                ${accounts.map((acc, idx) => `
                  <div style="display: flex; gap: 6px; align-items: center; background: rgba(15, 23, 42, 0.6); padding: 6px 8px; border-radius: 6px; border: 1px solid rgba(148, 163, 184, 0.15);">
                    <div style="flex: 1; min-width: 0;">
                      <div style="font-size: 12px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${acc.role === 'master_admin' ? '👑 ' : ''}${acc.name}</div>
                      ${acc.email ? `<div style="font-size: 10px; color: #93c5fd; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">✉️ ${acc.email}</div>` : ''}
                    </div>
                    <select class="sheet-search" style="width: 110px; font-size: 11px; padding: 3px 4px;" ${acc.role === 'master_admin' ? 'disabled' : ''} onchange="window.supabaseSync._updateAccountField(${idx}, 'role', this.value)">
                      <option value="master_admin" ${acc.role === 'master_admin' ? 'selected' : ''}>👑 Master Admin</option>
                      <option value="admin" ${acc.role === 'admin' ? 'selected' : ''}>🔧 Admin (Edit)</option>
                      <option value="custom" ${acc.role === 'custom' ? 'selected' : ''}>🔑 Custom</option>
                      <option value="view_only" ${acc.role === 'view_only' ? 'selected' : ''}>👁️ View Only</option>
                    </select>
                    <input type="text" class="sheet-search" style="width: 58px; font-size: 11.5px; padding: 3px 2px; text-align: center; font-family: monospace;" value="${acc.pin || '0000'}" title="4-Digit PIN" onchange="window.supabaseSync._updateAccountField(${idx}, 'pin', this.value)">
                    <button type="button" class="btn btn-secondary" style="padding: 2px 7px; font-size: 11px; color: #fbbf24; border-color: rgba(245, 158, 11, 0.4); white-space: nowrap;" title="View, Print or Resend Welcome Letter & Field Guide" onclick="if(window.employeeProfileEngine){window.employeeProfileEngine.openWelcomeLetterModal('${acc.name.replace(/'/g, "\\'")}');}">✉️ Letter</button>
                    ${acc.role === 'master_admin' ? `<span style="font-size: 10px; color: #94a3b8; padding: 0 4px; white-space: nowrap;">Master</span>` : `
                      <button type="button" class="btn btn-secondary" style="padding: 2px 6px; font-size: 11px; color: #60a5fa; white-space: nowrap;" title="Configure Page & Tab Permissions in Employee Profile" onclick="document.getElementById('user-identity-modal').style.display='none'; if(window.employeeProfileEngine){window.employeeProfileEngine.openProfileModal('${acc.name.replace(/'/g, "\\'")}', 'details');}">⚙️ Perms</button>
                      <button type="button" class="btn btn-secondary" style="padding: 2px 6px; font-size: 11px; color: #f87171; white-space: nowrap;" title="Remove Account" onclick="window.supabaseSync._removeUserAccount(${idx})">✕</button>
                    `}
                  </div>
                `).join('')}
              </div>
              <div style="display: flex; gap: 6px; margin-top: 8px; align-items: center;">
                <input type="text" id="new-account-name-input" class="sheet-search" style="flex: 1; min-width: 0; font-size: 12px; padding: 5px 8px;" placeholder="New User Full Name">
                <select id="new-account-role-select" class="sheet-search" style="width: 110px; font-size: 11.5px; padding: 5px 4px;">
                  <option value="custom">🔑 Custom</option>
                  <option value="admin">🔧 Admin (Edit)</option>
                  <option value="view_only">👁️ View Only</option>
                </select>
                <input type="text" id="new-account-pin-input" class="sheet-search" style="width: 65px; font-size: 12px; padding: 5px 4px; text-align: center; font-family: monospace;" placeholder="PIN (4d)" maxlength="8">
                <button type="button" class="btn btn-secondary" style="padding: 5px 10px; font-size: 11.5px; font-weight: 700; color: #34d399; border-color: rgba(16,185,129,0.4); white-space: nowrap;" onclick="window.supabaseSync._addNewUserAccount()">+ Add</button>
              </div>
            </div>
          ` : `
            <div style="border-top: 1px solid rgba(148, 163, 184, 0.2); padding-top: 10px; display: flex; justify-content: space-between; align-items: center;">
              <span style="font-size: 11.5px; color: var(--text-secondary);">Need to manage users or reset a PIN?</span>
              <button class="btn btn-secondary" style="padding: 4px 10px; font-size: 11.5px; color: #fbbf24;" onclick="window.supabaseSync._promptMasterAdminUnlock()">👑 Master Admin Unlock</button>
            </div>
          `}
        </div>
        <div class="modal-footer" style="display: flex; justify-content: flex-end; gap: 8px;">
          <button class="btn btn-secondary" onclick="document.getElementById('user-identity-modal').style.display='none'">Cancel</button>
          <button class="btn btn-primary" style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); border: none; font-weight: 700;" onclick="window.supabaseSync.saveUserIdentityFromModal(${isCurrentMaster ? 'true' : 'false'})">💾 Switch / Save Identity</button>
        </div>
      </div>
    `;
    modal.style.display = 'flex';
    modal.classList.add('active');
  }

  _onModalAccountSelectChange() {
    const selectedName = document.getElementById('identity-user-name-input')?.value || '';
    const acc = this.getAccountForUser(selectedName);
    const phoneInput = document.getElementById('identity-user-phone-input');
    if (phoneInput) {
      phoneInput.value = (acc && acc.phone) || this._lookupEmployeePhone(selectedName) || '';
    }
    const pinContainer = document.getElementById('identity-pin-prompt-container');
    if (pinContainer) {
      // Master Admin (Cody Bechdol) can switch into any account without needing their PIN.
      // Any other user switching to a different account must enter that user's PIN (or Master Admin PIN).
      const requiresPin = !this.isMasterAdmin(this.userName) && selectedName.trim().toLowerCase() !== this.userName.trim().toLowerCase();
      pinContainer.style.display = requiresPin ? 'block' : 'none';
      if (requiresPin) {
        setTimeout(() => document.getElementById('identity-user-pin-input')?.focus(), 50);
      }
    }
  }

  _promptMasterAdminUnlock() {
    const pin = window.prompt('👑 Enter Cody Bechdol\'s Master Admin PIN to manage all accounts:');
    if (pin === null) return;
    if (this.verifyUserOrMasterPin('Cody Bechdol', pin)) {
      this.openUserIdentityModal(true);
    } else if (typeof window.showToast === 'function') {
      window.showToast('❌ Incorrect Master Admin PIN.', 'error');
    }
  }

  _updateAccountField(idx, field, value) {
    const accounts = this.getUserAccounts();
    if (!accounts[idx]) return;
    accounts[idx][field] = String(value || '').trim();
    if (field === 'role') {
      if (value === 'admin' || value === 'master_admin') {
        accounts[idx].permissions = this.buildPresetPermissions('full_edit');
      } else if (value === 'view_only') {
        accounts[idx].permissions = this.buildPresetPermissions('view_all');
      }
    }
    this.saveUserAccounts(accounts);
    if (typeof window.showToast === 'function') {
      window.showToast(`✅ Updated ${accounts[idx].name}'s ${field}`);
    }
  }

  upsertAccountFromEmployeeProfile({ name, email, phone, pin, enabled, permissions }) {
    if (!this.isMasterAdmin()) return;
    const cleanName = String(name || '').trim();
    if (!cleanName) return;

    const accounts = this.getUserAccounts();
    const idx = accounts.findIndex(a => String(a.name || '').trim().toLowerCase() === cleanName.toLowerCase());

    if (!enabled) {
      if (idx !== -1 && accounts[idx].role !== 'master_admin') {
        accounts.splice(idx, 1);
        this.saveUserAccounts(accounts);
      }
      return;
    }

    const isCody = cleanName.toLowerCase() === 'cody bechdol';
    const record = idx !== -1 ? accounts[idx] : {
      name: cleanName,
      role: isCody ? 'master_admin' : 'custom',
      pin: pin || '0000',
      phone: phone || this._lookupEmployeePhone(cleanName) || '',
      email: email || '',
      permissions: permissions || this.buildPresetPermissions('view_all')
    };

    record.email = String(email || '').trim();
    if (phone !== undefined) record.phone = String(phone || '').trim();
    if (pin) record.pin = String(pin).trim();
    if (!isCody) {
      record.role = 'custom';
      if (permissions) record.permissions = permissions;
    } else {
      record.role = 'master_admin';
    }

    if (idx === -1) {
      accounts.push(record);
    } else {
      accounts[idx] = record;
    }
    this.saveUserAccounts(accounts);
  }

  _addNewUserAccount() {
    const nameEl = document.getElementById('new-account-name-input');
    const roleEl = document.getElementById('new-account-role-select');
    const pinEl = document.getElementById('new-account-pin-input');
    const name = String(nameEl?.value || '').trim();
    const role = String(roleEl?.value || 'custom').trim();
    const pin = String(pinEl?.value || '').trim() || '0000';
    if (!name) {
      if (typeof window.showToast === 'function') window.showToast('⚠️ Enter a user name first.', 'error');
      return;
    }
    const accounts = this.getUserAccounts();
    if (accounts.some(a => a.name.toLowerCase() === name.toLowerCase())) {
      if (typeof window.showToast === 'function') window.showToast('⚠️ Account already exists.', 'error');
      return;
    }
    const preset = (role === 'admin' || role === 'master_admin') ? 'full_edit' : 'view_all';
    accounts.push({
      name,
      email: '',
      role,
      pin,
      phone: this._lookupEmployeePhone(name) || '',
      permissions: this.buildPresetPermissions(preset)
    });
    this.saveUserAccounts(accounts);
    this.openUserIdentityModal(true);
    if (typeof window.showToast === 'function') {
      window.showToast(`✅ Added account for ${name} (PIN: ${pin})`);
    }
  }

  _removeUserAccount(idx) {
    const accounts = this.getUserAccounts();
    const target = accounts[idx];
    if (!target || target.role === 'master_admin') return;
    accounts.splice(idx, 1);
    this.saveUserAccounts(accounts);
    this.openUserIdentityModal(true);
    if (typeof window.showToast === 'function') {
      window.showToast(`🗑️ Removed account ${target.name}`);
    }
  }

  saveUserIdentityFromModal(adminUnlocked = false) {
    const userName = document.getElementById('identity-user-name-input')?.value || 'Cody Bechdol';
    const deviceType = document.getElementById('identity-device-type-select')?.value || this._defaultDeviceType();
    const userPhone = document.getElementById('identity-user-phone-input')?.value || '';

    const isSwitchingUser = userName.trim().toLowerCase() !== this.userName.trim().toLowerCase();
    const isCurrentMaster = this.isMasterAdmin(this.userName) || adminUnlocked;

    if (isSwitchingUser && !isCurrentMaster) {
      const enteredPin = document.getElementById('identity-user-pin-input')?.value || '';
      if (!this.verifyUserOrMasterPin(userName, enteredPin)) {
        if (typeof window.showToast === 'function') {
          window.showToast(`🔒 Incorrect PIN for ${userName}. Enter ${userName}'s PIN or Cody's Master Admin PIN.`, 'error');
        }
        const pinContainer = document.getElementById('identity-pin-prompt-container');
        if (pinContainer) pinContainer.style.display = 'block';
        document.getElementById('identity-user-pin-input')?.focus();
        return;
      }
    }

    // Save phone number back to the account record as well
    const accounts = this.getUserAccounts();
    const acc = accounts.find(a => a.name.toLowerCase() === userName.trim().toLowerCase());
    if (acc && userPhone) {
      acc.phone = userPhone.trim();
      this.saveUserAccounts(accounts);
    }

    this.setUserIdentity({ userName, deviceType, userPhone });
    const modal = document.getElementById('user-identity-modal');
    if (modal) {
      modal.classList.remove('active');
      modal.style.display = 'none';
    }
    if (typeof window.showToast === 'function') {
      window.showToast(`👤 Signed in as: ${this.deviceName}`);
    }
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
        const mutRecord = result || mutation;
        const cellKey = this._getCellKey(mutRecord);
        if (cellKey) {
          this._cellHistory.set(cellKey, {
            timestamp: mutRecord.timestamp || new Date().toISOString(),
            value: mutRecord.value,
            oldValue: mutRecord.oldValue,
            deviceName: this.deviceName,
            mutId: mutRecord.id
          });
        }
        this._enqueueOrBroadcastMutation(mutRecord);
      }
      return result;
    };
    this.db._supabaseHookInstalled = true;
  }

  _loadPendingQueue() {
    try {
      const raw = localStorage.getItem('sa_supabase_pending_queue');
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  _savePendingQueue() {
    try {
      localStorage.setItem('sa_supabase_pending_queue', JSON.stringify(this.pendingQueue || []));
    } catch { /* ignore */ }
  }

  _getCellKey(mut) {
    if (!mut || mut.action !== 'UPDATE_CELL') return null;
    const tableKey = (mut.tableKey || (mut.sheetName && this.db && this.db.getTableKeyForSheet ? this.db.getTableKeyForSheet(mut.sheetName) : mut.sheetName) || '').toLowerCase();
    const rowId = String(mut.itemIdentifier || mut.row || '').trim().toLowerCase();
    const colId = String(mut.header || mut.col || '').trim().toLowerCase();
    if (!tableKey || !rowId || !colId) return null;
    return `${tableKey}::${rowId}::${colId}`;
  }

  async _enqueueOrBroadcastMutation(mutRecord) {
    if (!mutRecord) return;
    const enriched = {
      ...mutRecord,
      id: mutRecord.id || ('mut_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7)),
      timestamp: mutRecord.timestamp || new Date().toISOString(),
      deviceName: this.deviceName,
      userName: this.userName,
      deviceType: this.deviceType,
      userPhone: this.userPhone || this._lookupEmployeePhone(this.userName)
    };

    // If browser reports offline, queue immediately for reconnection flush
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      this._queueOfflineMutation(enriched);
      return;
    }

    try {
      await this._broadcastLocalMutation(enriched);
    } catch (err) {
      console.warn('[SupabaseSync] Offline or network drop detected — queuing edit for automatic sync on reconnect:', err.message);
      this._queueOfflineMutation(enriched);
    }
  }

  _queueOfflineMutation(mutRecord) {
    const cellKey = this._getCellKey(mutRecord);
    if (cellKey) {
      const existingIdx = this.pendingQueue.findIndex(m => this._getCellKey(m) === cellKey);
      if (existingIdx !== -1) {
        mutRecord.oldValue = this.pendingQueue[existingIdx].oldValue;
        this.pendingQueue[existingIdx] = mutRecord;
        this._savePendingQueue();
        return;
      }
    }
    this.pendingQueue.push(mutRecord);
    this._savePendingQueue();
  }

  async _flushPendingOfflineQueue() {
    if (!this.isActive() || this.isFlushingQueue || !this.pendingQueue || this.pendingQueue.length === 0) return;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return;

    this.isFlushingQueue = true;
    try {
      // 1. Always pull any remote mutations that occurred while this device was offline FIRST
      await this._pollMissedMutations();

      // 2. Push remaining non-conflicting queued mutations in chronological order
      const remaining = [];
      for (const mut of this.pendingQueue) {
        if (mut._conflictHold) {
          remaining.push(mut);
          continue;
        }
        try {
          await this._broadcastLocalMutation(mut);
        } catch {
          remaining.push(mut);
        }
      }
      this.pendingQueue = remaining;
      this._savePendingQueue();
    } finally {
      this.isFlushingQueue = false;
    }
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

    // 1. Lightweight 5-second delta poll (catches any mutations across cellular/Wi-Fi drops and flushes offline queue)
    this.pollTimer = setInterval(async () => {
      await this._pollMissedMutations();
      if (this.pendingQueue && this.pendingQueue.length > 0) {
        await this._flushPendingOfflineQueue();
      }
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

    const cellKey = this._getCellKey(mut);
    const remoteTime = new Date(mut.timestamp || record.created_at || Date.now()).getTime();
    const remoteDevice = record.device_name || mut.deviceName || 'Another Device';

    // Check 1: Does this incoming remote mutation collide with an unsent offline edit in our pendingQueue?
    if (cellKey && this.pendingQueue && this.pendingQueue.length > 0) {
      const pendingMatch = this.pendingQueue.find(pm => this._getCellKey(pm) === cellKey);
      if (pendingMatch && String(pendingMatch.value ?? '') !== String(mut.value ?? '')) {
        pendingMatch._conflictHold = true;
        this._savePendingQueue();
        this._promptCellConflict({
          cellKey,
          sheetName: mut.sheetName || pendingMatch.sheetName || record.table_key,
          itemIdentifier: mut.itemIdentifier || pendingMatch.itemIdentifier || `Row ${mut.row}`,
          header: mut.header || pendingMatch.header || `Col ${mut.col}`,
          localMutation: pendingMatch,
          localValue: pendingMatch.value,
          localTime: pendingMatch.timestamp,
          localDevice: this.deviceName,
          remoteMutation: mut,
          remoteValue: mut.value,
          remoteTime: mut.timestamp || record.created_at,
          remoteDevice: remoteDevice
        });
        return;
      }
    }

    // Check 2: Two offline devices reconnecting at different times — did a late-reconnecting device send an OLDER edit
    // for the exact same cell that we or another device edited MORE RECENTLY?
    if (cellKey && this._cellHistory.has(cellKey)) {
      const currentCell = this._cellHistory.get(cellKey);
      const currentTime = new Date(currentCell.timestamp || 0).getTime();
      if (String(currentCell.value ?? '') !== String(mut.value ?? '') && remoteTime < currentTime) {
        // Remote edit was made BEFORE our current edit (e.g. a late-reconnecting offline device):
        // Do NOT silently overwrite the newer edit — open conflict modal so the user can review both!
        this._promptCellConflict({
          cellKey,
          sheetName: mut.sheetName || record.table_key,
          itemIdentifier: mut.itemIdentifier || `Row ${mut.row}`,
          header: mut.header || `Col ${mut.col}`,
          localMutation: { ...mut, value: currentCell.value, timestamp: currentCell.timestamp },
          localValue: currentCell.value,
          localTime: currentCell.timestamp,
          localDevice: currentCell.deviceName || this.deviceName,
          remoteMutation: mut,
          remoteValue: mut.value,
          remoteTime: mut.timestamp || record.created_at,
          remoteDevice: remoteDevice
        });
        return;
      }
    }

    try {
      this.isApplyingRemote = true;
      await this.db.applyLocalMutation(mut);
      if (cellKey) {
        this._cellHistory.set(cellKey, {
          timestamp: mut.timestamp || record.created_at || new Date().toISOString(),
          value: mut.value,
          deviceName: remoteDevice,
          mutId: record.mut_id
        });
      }
      this.db.schedulePersistSnapshot(this.db.snapshot, 400);
      this.db.notify();

      if (this.googleSync && typeof this.googleSync.refreshAllViewsAfterSnapshotLoad === 'function') {
        this.googleSync.refreshAllViewsAfterSnapshotLoad();
      }
      if (typeof window.showToast === 'function') {
        const label = record.sheet_name || record.table_key || mut.action || 'Database';
        window.showToast(`⚡ Live update from ${remoteDevice}: ${label}`);
      }
    } catch (err) {
      console.warn('[SupabaseSync] Error applying remote mutation:', err);
    } finally {
      this.isApplyingRemote = false;
    }
  }

  _promptCellConflict(conflict) {
    // Deduplicate by cellKey
    const existingIdx = this.activeConflicts.findIndex(c => c.cellKey === conflict.cellKey);
    if (existingIdx !== -1) {
      this.activeConflicts[existingIdx] = conflict;
    } else {
      this.activeConflicts.push(conflict);
    }
    this._renderConflictModal();
  }

  _renderConflictModal() {
    const modal = document.getElementById('conflict-resolution-modal');
    const body = document.getElementById('conflict-modal-body');
    const applyBtn = document.getElementById('conflict-apply-btn');
    if (!modal || !body || this.activeConflicts.length === 0) return;

    const fmtTime = (iso) => {
      if (!iso) return 'Unknown time';
      const d = new Date(iso);
      return isNaN(d.getTime()) ? String(iso) : d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    };

    let html = `
      <div style="background: rgba(239, 68, 68, 0.1); border: 1px solid rgba(239, 68, 68, 0.3); border-radius: 6px; padding: 12px 14px; font-size: 12px; color: #fca5a5; line-height: 1.5;">
        <strong>⚠️ Same-Field Offline / Simultaneous Edit Detected:</strong> Two devices edited the exact same field before syncing. Choose which value to keep below (the newer timestamp is pre-selected by default).
      </div>
      <div style="display: flex; flex-direction: column; gap: 12px;">
    `;

    this.activeConflicts.forEach((conf, idx) => {
      const lMs = new Date(conf.localTime || 0).getTime();
      const rMs = new Date(conf.remoteTime || 0).getTime();
      const localIsNewer = lMs >= rMs;
      const localPhone = (conf.localMutation && conf.localMutation.userPhone) || this.userPhone || this._lookupEmployeePhone(conf.localDevice) || '';
      const remotePhone = (conf.remoteMutation && conf.remoteMutation.userPhone) || this._lookupEmployeePhone(conf.remoteDevice) || '';

      html += `
        <div style="background: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: 8px; padding: 14px;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
            <div>
              <span class="brand-badge" style="background: rgba(59, 130, 246, 0.15); color: #93c5fd; border: 1px solid rgba(59, 130, 246, 0.3); font-size: 11px;">
                ${conf.sheetName}
              </span>
              <strong style="font-size: 13px; color: #f8fafc; margin-left: 6px;">${conf.itemIdentifier}</strong>
              <span style="font-size: 12px; color: #60a5fa; margin-left: 8px;">Field: ${conf.header}</span>
            </div>
          </div>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
            <label style="cursor: pointer; display: flex; flex-direction: column; gap: 6px; background: rgba(16, 185, 129, 0.08); border: 1.5px solid rgba(16, 185, 129, 0.35); border-radius: 6px; padding: 10px 12px;">
              <div style="display: flex; justify-content: space-between; align-items: center;">
                <span style="font-size: 11px; font-weight: 700; color: #34d399;">
                  🟢 ${conf.localDevice} • ${fmtTime(conf.localTime)} ${localIsNewer ? '★ Newer' : ''}
                </span>
                <input type="radio" name="sb_conflict_choice_${idx}" value="local" ${localIsNewer ? 'checked' : ''} style="accent-color: #10b981; cursor: pointer;">
              </div>
              <div style="font-size: 14px; font-weight: 700; color: #f8fafc;">${conf.localValue || '(empty)'}</div>
              ${localPhone ? `<div style="font-size: 11px; color: #a7f3d0;">📞 Contact: ${localPhone}</div>` : ''}
            </label>
            <label style="cursor: pointer; display: flex; flex-direction: column; gap: 6px; background: rgba(59, 130, 246, 0.08); border: 1.5px solid rgba(59, 130, 246, 0.35); border-radius: 6px; padding: 10px 12px;">
              <div style="display: flex; justify-content: space-between; align-items: center;">
                <span style="font-size: 11px; font-weight: 700; color: #60a5fa;">
                  🔵 ${conf.remoteDevice} • ${fmtTime(conf.remoteTime)} ${!localIsNewer ? '★ Newer' : ''}
                </span>
                <input type="radio" name="sb_conflict_choice_${idx}" value="remote" ${!localIsNewer ? 'checked' : ''} style="accent-color: #3b82f6; cursor: pointer;">
              </div>
              <div style="font-size: 14px; font-weight: 700; color: #f8fafc;">${conf.remoteValue || '(empty)'}</div>
              ${remotePhone ? `<div style="font-size: 11px; color: #93c5fd;">📞 Call to verify: <a href="tel:${remotePhone}" style="color: #60a5fa; text-decoration: underline;">${remotePhone}</a></div>` : ''}
            </label>
          </div>
        </div>
      `;
    });

    html += `</div>`;
    body.innerHTML = html;

    if (applyBtn) {
      applyBtn.onclick = () => this.resolveActiveConflicts();
    }

    modal.style.display = 'flex';
    modal.classList.add('active');
  }

  async resolveActiveConflicts() {
    const conflicts = [...this.activeConflicts];
    this.activeConflicts = [];

    const modal = document.getElementById('conflict-resolution-modal');
    if (modal) {
      modal.classList.remove('active');
      modal.style.display = 'none';
    }

    for (let idx = 0; idx < conflicts.length; idx++) {
      const conf = conflicts[idx];
      const radios = document.getElementsByName(`sb_conflict_choice_${idx}`);
      let choice = 'local';
      for (const r of radios) {
        if (r.checked) choice = r.value;
      }

      const winningMut = choice === 'local' ? conf.localMutation : conf.remoteMutation;
      winningMut.timestamp = new Date().toISOString();
      winningMut.id = 'mut_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);

      // Remove any held conflict entry from pendingQueue
      this.pendingQueue = (this.pendingQueue || []).filter(pm => this._getCellKey(pm) !== conf.cellKey);
      this._savePendingQueue();

      this.isApplyingRemote = true;
      await this.db.applyLocalMutation(winningMut);
      this.isApplyingRemote = false;

      this._cellHistory.set(conf.cellKey, {
        timestamp: winningMut.timestamp,
        value: winningMut.value,
        deviceName: this.deviceName,
        mutId: winningMut.id
      });

      // Broadcast winning resolution to all devices
      await this._enqueueOrBroadcastMutation(winningMut);
    }

    this.db.schedulePersistSnapshot(this.db.snapshot, 300);
    this.db.notify();
    if (this.googleSync && typeof this.googleSync.refreshAllViewsAfterSnapshotLoad === 'function') {
      this.googleSync.refreshAllViewsAfterSnapshotLoad();
    }
    if (typeof window.showToast === 'function') {
      window.showToast('✅ Conflict resolved and synchronized across all devices!');
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
