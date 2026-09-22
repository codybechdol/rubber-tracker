/**
 * db.js - Local Database & Offline Mutation Outbox Manager
 */

/**
 * SnapshotStorage - Lightweight IndexedDB wrapper for large database snapshots.
 * Replaces localStorage (5MB limit) with IndexedDB (gigabytes quota) to prevent QuotaExceededError on tablets/mobile.
 */
class SnapshotStorage {
  static get DB_NAME() { return 'SafetyAssistantDB'; }
  static get STORE_NAME() { return 'snapshots'; }
  static get DB_VERSION() { return 1; }

  static async open() {
    if (typeof window === 'undefined' || !window.indexedDB) return null;
    return new Promise((resolve) => {
      try {
        const req = window.indexedDB.open(SnapshotStorage.DB_NAME, SnapshotStorage.DB_VERSION);
        req.onupgradeneeded = (e) => {
          const db = e.target.result;
          if (!db.objectStoreNames.contains(SnapshotStorage.STORE_NAME)) {
            db.createObjectStore(SnapshotStorage.STORE_NAME);
          }
        };
        req.onsuccess = (e) => resolve(e.target.result);
        req.onerror = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
  }

  static async get(key) {
    const db = await SnapshotStorage.open();
    if (!db) return null;
    return new Promise((resolve) => {
      try {
        const tx = db.transaction(SnapshotStorage.STORE_NAME, 'readonly');
        const store = tx.objectStore(SnapshotStorage.STORE_NAME);
        const req = store.get(key);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
  }

  static async set(key, value) {
    const db = await SnapshotStorage.open();
    if (!db) return false;
    return new Promise((resolve) => {
      try {
        const tx = db.transaction(SnapshotStorage.STORE_NAME, 'readwrite');
        const store = tx.objectStore(SnapshotStorage.STORE_NAME);
        const req = store.put(value, key);
        req.onsuccess = () => resolve(true);
        req.onerror = () => resolve(false);
      } catch {
        resolve(false);
      }
    });
  }

  static async delete(key) {
    const db = await SnapshotStorage.open();
    if (!db) return false;
    return new Promise((resolve) => {
      try {
        const tx = db.transaction(SnapshotStorage.STORE_NAME, 'readwrite');
        const store = tx.objectStore(SnapshotStorage.STORE_NAME);
        const req = store.delete(key);
        req.onsuccess = () => resolve(true);
        req.onerror = () => resolve(false);
      } catch {
        resolve(false);
      }
    });
  }
}

class LocalDatabase {
  /**
   * Strips the "New" note marker from a notes string while preserving all other notes
   * (e.g. "New, Visual" -> "Visual", "New" -> "")
   */
  static stripNewNote(notes) {
    if (!notes) return '';
    let cleaned = String(notes)
      .replace(/(^|\s*[,;]\s*)\bnew\b(\s*[,;]\s*|$)/gi, (match, p1, p2) => {
        if (p1 && p2 && p1.includes(',') && p2.includes(',')) return ', ';
        if (p1 && p2 && p1.includes(';') && p2.includes(';')) return '; ';
        return '';
      })
      .trim();
    cleaned = cleaned.replace(/^[,;]\s*/, '').replace(/\s*[,;]$/, '').trim();
    return cleaned;
  }

  constructor() {
    this.snapshot = null;
    this.outbox = [];
    this.listeners = [];
  }

  async init() {
    // Load snapshot from desktop API or IndexedDB / localStorage
    if (window.desktopAPI) {
      this.snapshot = await window.desktopAPI.getLocalSnapshot();
      this.outbox = await window.desktopAPI.getLocalOutbox() || [];
    } else {
      // 1. Try IndexedDB first (virtually unlimited quota)
      let loadedSnapshot = null;
      try {
        loadedSnapshot = await SnapshotStorage.get('sa_snapshot');
      } catch (e) {
        console.warn('Could not read from IndexedDB:', e);
      }

      // 2. Fallback to localStorage and auto-migrate to IndexedDB
      if (!loadedSnapshot) {
        try {
          const stored = localStorage.getItem('sa_snapshot');
          if (stored) {
            loadedSnapshot = JSON.parse(stored);
            // Migrate to IndexedDB and free localStorage
            await SnapshotStorage.set('sa_snapshot', loadedSnapshot);
            try { localStorage.removeItem('sa_snapshot'); } catch { /* ignore */ }
          }
        } catch (e) {
          console.warn('Could not read/migrate from localStorage:', e);
        }
      }

      this.snapshot = loadedSnapshot;

      try {
        const storedOutbox = localStorage.getItem('sa_outbox');
        if (storedOutbox) this.outbox = JSON.parse(storedOutbox);
      } catch {
        this.outbox = [];
      }
    }

    if (this.snapshot) {
      this.normalizeSnapshot(this.snapshot);
      await this.persistSnapshot(this.snapshot);
    }

    this.notify();
    return this.snapshot;
  }

  getSnapshot() {
    return this.snapshot;
  }

  async setSnapshot(snapshot) {
    if (snapshot) {
      if (snapshot.isPartial && this.snapshot && this.snapshot.tables) {
        for (const [k, v] of Object.entries(snapshot.tables || {})) {
          this.snapshot.tables[k] = v;
        }
        if (snapshot.configs && this.snapshot.configs) {
          Object.assign(this.snapshot.configs, snapshot.configs);
        }
        snapshot = this.snapshot;
      } else if (this.snapshot && this.snapshot.tables && snapshot.tables) {
        // Full snapshot download: Protect local history from being truncated or wiped out!
        const historyTableKeys = [
          'gloves_history', 'sleeves_history', 'blankets_history', 'macks_history',
          'hv_testers_history', 'phasing_sets_history', 'aed_history', 'grounds_history',
          'hot_sticks_history', 'employee_history'
        ];

        historyTableKeys.forEach(histKey => {
          const oldTable = this.snapshot.tables[histKey];
          const newTable = snapshot.tables[histKey];
          if (oldTable && oldTable.rows && oldTable.rows.length > 0) {
            if (!newTable || !newTable.rows || newTable.rows.length === 0) {
              snapshot.tables[histKey] = oldTable;
            } else {
              // Build index of incoming server rows
              const newKeySet = new Set();
              newTable.rows.forEach(r => {
                const item = String(r['Item #'] || r['Serial #'] || r['Glove'] || r['Sleeve'] || r['Blanket'] || r['ESL ID'] || '').trim().toLowerCase();
                const date = String(r['Date Assigned'] || r['Date'] || Object.values(r)[0] || '').trim();
                const assigned = String(r['Assigned To'] || '').trim().toLowerCase();
                if (item) newKeySet.add(`${item}|${date}|${assigned}`);
              });

              // Merge any local rows that the server snapshot did not include
              let mergedAny = false;
              oldTable.rows.forEach(r => {
                const item = String(r['Item #'] || r['Serial #'] || r['Glove'] || r['Sleeve'] || r['Blanket'] || r['ESL ID'] || '').trim().toLowerCase();
                const date = String(r['Date Assigned'] || r['Date'] || Object.values(r)[0] || '').trim();
                const assigned = String(r['Assigned To'] || '').trim().toLowerCase();
                const rowKey = `${item}|${date}|${assigned}`;
                if (item && !newKeySet.has(rowKey)) {
                  newTable.rows.push(r);
                  newKeySet.add(rowKey);
                  mergedAny = true;
                }
              });

              if (mergedAny) {
                newTable.rowCount = newTable.rows.length;
              }
            }
          }
        });
      }
      this.normalizeSnapshot(snapshot);
    }
    this.snapshot = snapshot;

    // Keep localStorage config caches in sync with fresh snapshot
    if (snapshot && snapshot.configs) {
      if (snapshot.configs.plannedTrips) {
        try {
          localStorage.setItem('sa_planned_trips', JSON.stringify(snapshot.configs.plannedTrips));
        } catch { /* ignore */ }
      }
      if (Array.isArray(snapshot.configs.manual_tasks)) {
        try {
          localStorage.setItem('sa_trip_manual_tasks', JSON.stringify(snapshot.configs.manual_tasks));
        } catch { /* ignore */ }
      }
      if (snapshot.configs.workSchedule) {
        try {
          localStorage.setItem('sa_work_schedule', snapshot.configs.workSchedule);
        } catch { /* ignore */ }
      }
      if (snapshot.configs.holidays && (Array.isArray(snapshot.configs.holidays) ? snapshot.configs.holidays.length > 0 : Object.keys(snapshot.configs.holidays).length > 0)) {
        try {
          localStorage.setItem('sa_holidays', JSON.stringify(snapshot.configs.holidays));
        } catch { /* ignore */ }
      }
    }

    await this.persistSnapshot(snapshot);
    this.notify();
  }

  async persistSnapshot(snapshot = this.snapshot) {
    if (!snapshot) return;
    if (this._persistTimer) {
      clearTimeout(this._persistTimer);
      this._persistTimer = null;
    }
    if (window.desktopAPI) {
      await window.desktopAPI.saveLocalSnapshot(snapshot);
      return;
    }

    // Web & Tablet / Mobile: Save to IndexedDB (virtually unlimited quota)
    let savedToIdb = false;
    try {
      savedToIdb = await SnapshotStorage.set('sa_snapshot', snapshot);
      if (savedToIdb) {
        // Free up localStorage by removing the massive snapshot string
        try { localStorage.removeItem('sa_snapshot'); } catch { /* ignore */ }
      }
    } catch (idbErr) {
      console.warn('IndexedDB persist failed:', idbErr);
    }

    // Fallback to localStorage only if IndexedDB was unavailable
    if (!savedToIdb) {
      try {
        localStorage.setItem('sa_snapshot', JSON.stringify(snapshot));
      } catch (lsErr) {
        console.warn('localStorage persist failed (quota exceeded):', lsErr);
      }
    }
  }

  schedulePersistSnapshot(snapshot = this.snapshot, delayMs = 600) {
    if (this._persistTimer) {
      clearTimeout(this._persistTimer);
    }
    return new Promise((resolve) => {
      this._persistTimer = setTimeout(async () => {
        this._persistTimer = null;
        await this.persistSnapshot(snapshot);
        resolve();
      }, delayMs);
    });
  }

  async flushPersist() {
    if (this._persistTimer) {
      clearTimeout(this._persistTimer);
      this._persistTimer = null;
      await this.persistSnapshot(this.snapshot);
    }
  }

  getPlannedTrips() {
    if (this.snapshot && this.snapshot.configs && this.snapshot.configs.plannedTrips && typeof this.snapshot.configs.plannedTrips === 'object') {
      return this.snapshot.configs.plannedTrips;
    }
    const stored = localStorage.getItem('sa_planned_trips');
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        if (parsed && typeof parsed === 'object') {
          return parsed;
        }
      } catch { /* ignore */ }
    }
    return {};
  }

  async savePlannedTrips(trips) {
    if (!this.snapshot) this.snapshot = { configs: {}, tables: {} };
    if (!this.snapshot.configs) this.snapshot.configs = {};
    this.snapshot.configs.plannedTrips = trips;
    try {
      localStorage.setItem('sa_planned_trips', JSON.stringify(trips));
    } catch { /* ignore */ }
    await this.persistSnapshot(this.snapshot);
    await this.addMutation({
      action: 'SAVE_PLANNED_TRIPS',
      trips: trips
    });
  }

  getManualTasks() {
    if (this.snapshot && this.snapshot.configs && Array.isArray(this.snapshot.configs.manual_tasks)) {
      return this.snapshot.configs.manual_tasks;
    }
    const stored = localStorage.getItem('sa_trip_manual_tasks');
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) return parsed;
      } catch { /* ignore */ }
    }
    return [];
  }

  async saveManualTasks(tasks) {
    if (!this.snapshot) this.snapshot = { configs: {}, tables: {} };
    if (!this.snapshot.configs) this.snapshot.configs = {};
    this.snapshot.configs.manual_tasks = tasks;
    try {
      localStorage.setItem('sa_trip_manual_tasks', JSON.stringify(tasks));
    } catch { /* ignore */ }
    await this.persistSnapshot(this.snapshot);
    await this.addMutation({
      action: 'SAVE_MANUAL_TASKS',
      manual_tasks: tasks
    });
  }

  getTable(tableKey) {
    if (!this.snapshot || !this.snapshot.tables) return { headers: [], rows: [] };
    const table = this.snapshot.tables[tableKey] || { headers: [], rows: [] };
    return this.normalizeTableData(table, tableKey);
  }

  normalizeSnapshot(snapshot) {
    if (!snapshot || !snapshot.tables) return snapshot;
    Object.keys(snapshot.tables).forEach(key => {
      this.normalizeTableData(snapshot.tables[key], key);
    });
    this.healCrossClassSwaps(snapshot);
    return snapshot;
  }

  healCrossClassSwaps(snapshot) {
    if (!snapshot || !snapshot.tables) return;

    const parseClass = (c) => {
      if (c === undefined || c === null) return 0;
      const m = String(c).match(/\d+/);
      return m ? parseInt(m[0], 10) : 0;
    };

    const targetPairs = [
      { swapKey: 'glove_swaps', invKey: 'gloves', label: 'Glove' },
      { swapKey: 'sleeve_swaps', invKey: 'sleeves', label: 'Sleeve' }
    ];

    targetPairs.forEach(({ swapKey, invKey }) => {
      const invTable = snapshot.tables[invKey];
      const swapTable = snapshot.tables[swapKey];
      if (!invTable || !invTable.rows) return;

      // Index inventory by item number
      const invMap = {};
      invTable.rows.forEach(it => {
        const num = String(it['Item #'] || it['Glove'] || it['Sleeve'] || it['ESL ID'] || '').trim().toLowerCase();
        if (num) invMap[num] = it;
      });

      // 1. Clean manualPicks in snapshot & local storage
      let localRegistry = {};
      try {
        const stored = localStorage.getItem('sa_manual_picks');
        if (stored) localRegistry = JSON.parse(stored);
      } catch { /* ignore */ }

      if (snapshot.manualPicks && snapshot.manualPicks[swapKey]) {
        for (const [k, v] of Object.entries(snapshot.manualPicks[swapKey])) {
          if (!v || !v.pickListNum || v.pickListNum === '—' || v.pickListNum === '-') continue;
          const curItem = invMap[String(v.currentItemNum || '').trim().toLowerCase()];
          const pickItem = invMap[String(v.pickListNum || '').trim().toLowerCase()];
          if (curItem && pickItem) {
            const curClass = parseClass(curItem['Class']);
            const pickClass = parseClass(pickItem['Class']);
            if (curClass !== pickClass) {
              console.warn(`[healCrossClassSwaps] Purging cross-class manual pick in ${swapKey}: ${k} (Current Class ${curClass} vs Picked Class ${pickClass})`);
              delete snapshot.manualPicks[swapKey][k];
              if (localRegistry[swapKey]) delete localRegistry[swapKey][k];
            }
          }
        }
      }
      try {
        localStorage.setItem('sa_manual_picks', JSON.stringify(localRegistry));
      } catch { /* ignore */ }

      // 2. Clean swapTable rawGrid
      if (swapTable && swapTable.rawGrid && Array.isArray(swapTable.rawGrid)) {
        let headers = swapTable.headers || [];
        if ((!headers || headers.length === 0) && Array.isArray(swapTable.rawGrid[1])) {
          headers = swapTable.rawGrid[1];
        }
        let curCol = headers.findIndex(h => /current|^serial\s*#/i.test(h));
        let pickCol = headers.findIndex(h => /pick\s*list/i.test(h));
        let statCol = headers.findIndex(h => /^status$/i.test(h));
        let pickedCol = headers.findIndex(h => /^picked$/i.test(h));

        if (curCol === -1) curCol = 1;
        if (pickCol === -1) pickCol = 6;
        if (statCol === -1) statCol = 7;
        if (pickedCol === -1) pickedCol = 8;

        swapTable.rawGrid.forEach((row, idx) => {
          if (idx === 0 || !Array.isArray(row)) return;
          const curNum = String(row[curCol] || '').trim().toLowerCase();
          const pickNum = String(row[pickCol] || '').trim().toLowerCase();
          if (!curNum || !pickNum || pickNum === '—' || pickNum === '-') return;

          const curItem = invMap[curNum];
          const pickItem = invMap[pickNum];
          if (curItem && pickItem) {
            const curClass = parseClass(curItem['Class']);
            const pickClass = parseClass(pickItem['Class']);
            if (curClass !== pickClass) {
              console.warn(`[healCrossClassSwaps] Purging cross-class rawGrid assignment in ${swapKey} row ${idx}: ${row[0]} Current ${row[curCol]} (Class ${curClass}) vs Pick ${row[pickCol]} (Class ${pickClass})`);
              row[pickCol] = '—';
              row[statCol] = 'Need to Purchase ❌';
              row[pickedCol] = false;
            }
          }
        });
      }

      // 3. Clean swapTable rows
      if (swapTable && swapTable.rows && Array.isArray(swapTable.rows)) {
        swapTable.rows.forEach(r => {
          const curNum = String(r['Current Glove #'] || r['Current Sleeve #'] || r['Current Item #'] || '').trim().toLowerCase();
          const pickNum = String(r['Pick List Item #'] || '').trim().toLowerCase();
          if (!curNum || !pickNum || pickNum === '—' || pickNum === '-') return;

          const curItem = invMap[curNum];
          const pickItem = invMap[pickNum];
          if (curItem && pickItem) {
            const curClass = parseClass(curItem['Class']);
            const pickClass = parseClass(pickItem['Class']);
            if (curClass !== pickClass) {
              console.warn(`[healCrossClassSwaps] Purging cross-class row assignment in ${swapKey}: ${r['Employee']} Current ${curNum} (Class ${curClass}) vs Pick ${pickNum} (Class ${pickClass})`);
              r['Pick List Item #'] = '—';
              r['Status'] = 'Need to Purchase ❌';
              r['Picked'] = false;
              r._manualPick = false;
              r.isManualPick = false;
            }
          }
        });
      }
    });
  }

  normalizeTableData(table, tableKey) {
    if (!table) return { headers: [], rows: [] };

    if (!table.name && tableKey) {
      table.name = this.getSheetNameForTableKey(tableKey) || tableKey;
    }

    // 1. Employee healing & cleaning (ALWAYS RUNS on every call)
    if (table.rows && tableKey === 'employees') {
      const nameKey = (table.headers || []).find(h => /^(employee\s*name|name)$/i.test(h.trim())) || (table.headers ? table.headers[0] : null);
      if (nameKey) {
        // Remove ghost duplicate 'Active' rows created by prior bug runs
        table.rows = table.rows.filter(r => {
          const name = String(r[nameKey] || '').trim();
          if (name.toLowerCase() === 'active' && !r['Phone Number'] && !r['Email Address'] && !r['MP Email']) {
            return false;
          }
          return true;
        });
        table.rowCount = table.rows.length;

        // Heal and restore real employee names
        table.rows.forEach(r => {
          let val = String(r[nameKey] || '').trim();
          if (val && (/^active\s*\|\s*/i.test(val) || /\blast\s*day\b/i.test(val) || /\bquitting\b/i.test(val))) {
            let cleaned = val.replace(/^active\s*\|\s*/i, '').trim();
            const nameMatch = cleaned.match(/^([A-Za-z]+(?:\s+[A-Za-z]+)+?)(?:\s+(?:JL|JRY|F|SUP|GF|AP|\d+\s*ap|EO|WT|GTO|Last\s*day|Quit|off\b))/i);
            if (nameMatch && nameMatch[1]) {
              val = nameMatch[1].trim();
            }
          }
          if (!val || val.toLowerCase() === 'active') {
            const jNum = String(r['Job Number'] || '').trim();
            const loc = String(r['Location'] || '').trim().toLowerCase();
            if (jNum === '029-26.04' || (loc === 'belgrade' && (jNum === '029-26.4' || jNum === '029-26.04'))) {
              val = 'Owen Hunter';
            } else if (jNum === '049-26.04' || (loc === 'butte' && (jNum === '049-26.4' || jNum === '049-26.04'))) {
              val = 'Lucas Kovalsky';
            } else if (jNum === '052-26.03' || (loc === 'melville' && (jNum === '052-26.3' || jNum === '052-26.03'))) {
              val = 'Caleb Cook';
            } else if (table.rawGrid && r._rowIdx && table.rawGrid[r._rowIdx - 1]) {
              const rawVal = String(table.rawGrid[r._rowIdx - 1][0] || '').trim();
              if (rawVal && rawVal.toLowerCase() !== 'active') {
                val = rawVal;
              }
            }
          }
          if (val) {
            r[nameKey] = val;
            if (val === 'Owen Hunter' && r['Hire Date'] === '08/22/2026') {
              r['Hire Date'] = '08/24/2026';
            }
            if (table.rawGrid && r._rowIdx && table.rawGrid[r._rowIdx - 1]) {
              table.rawGrid[r._rowIdx - 1][0] = val;
              if (val === 'Owen Hunter' && r['Hire Date'] === '08/24/2026') {
                const hireIdx = (table.headers || []).findIndex(h => /hire\s*date/i.test(h));
                if (hireIdx !== -1) {
                  table.rawGrid[r._rowIdx - 1][hireIdx] = '08/24/2026';
                }
              }
            }
          }
        });

        // Deduplicate employee rows (e.g. If an employee was added multiple times during test runs)
        const seenEmployees = new Map();
        const rowsToRemove = new Set();
        table.rows.forEach(r => {
          const empName = String(r[nameKey] || '').trim();
          if (empName && empName.toLowerCase() !== 'active') {
            const key = empName.toLowerCase();
            if (seenEmployees.has(key)) {
              const existing = seenEmployees.get(key);
              // If current row has hire date 08/24/2026 and existing has 08/22/2026, keep current and remove existing
              if (r['Hire Date'] === '08/24/2026' && existing['Hire Date'] !== '08/24/2026') {
                rowsToRemove.add(existing);
                seenEmployees.set(key, r);
              } else {
                rowsToRemove.add(r);
              }
            } else {
              seenEmployees.set(key, r);
            }
          }
        });

        if (rowsToRemove.size > 0) {
          table.rows = table.rows.filter(r => !rowsToRemove.has(r));
          table.rowCount = table.rows.length;
          if (table.rawGrid) {
            const rowIndicesToRemove = new Set([...rowsToRemove].map(r => r._rowIdx).filter(Boolean));
            table.rawGrid = table.rawGrid.filter((gridRow, idx) => !rowIndicesToRemove.has(idx + 1));
          }
        }

        // Sanitize Last Day Reason to match Google Sheets dropdown validation (Quit, Fired, Layoff, Resigned)
        table.rows.forEach(r => {
          const ldr = String(r['Last Day Reason'] || '').trim().toLowerCase();
          if (ldr) {
            if (ldr.includes('quit')) r['Last Day Reason'] = 'Quit';
            else if (ldr.includes('fire')) r['Last Day Reason'] = 'Fired';
            else if (ldr.includes('layoff') || ldr.includes('laid')) r['Last Day Reason'] = 'Layoff';
            else if (ldr.includes('resign')) r['Last Day Reason'] = 'Resigned';
            else r['Last Day Reason'] = 'Quit';
          }
        });
      }
    }

    // 1b. Employee History healing & cleaning: remove ghost 'Active' rows and non-employee artifacts
    if (table.rows && tableKey === 'employee_history') {
      const nameKey = (table.headers || []).find(h => /^(employee\s*name|name)$/i.test(h.trim())) || (table.headers ? table.headers[1] : 'Employee Name');
      const badStatusNames = ['active', 'packed for delivery', 'packed for testing'];
      table.rows = table.rows.filter(r => {
        const name = String(r[nameKey] || '').trim().toLowerCase();
        if (badStatusNames.includes(name) || name.startsWith('active |')) {
          return false;
        }
        return true;
      });
      table.rowCount = table.rows.length;
    }

    // 2. Normalize equipment status, location, notes, and auto-heal missing fields
    if (table.rows) {
      const locKey = (table.headers || []).find(h => /^location$/i.test(String(h || '').trim())) || 'Location';
      const locIdx = (table.headers || []).findIndex(h => /^location$/i.test(String(h || '').trim()));
      const isInv = ['gloves', 'sleeves', 'blankets', 'macks', 'hv_testers', 'phasing_sets', 'aed', 'grounds', 'hot_sticks'].includes(tableKey);
      const empTable = (isInv && this.snapshot && this.snapshot.tables) ? this.snapshot.tables['employees'] : null;

      table.rows.forEach(r => {
        if (isInv) {
          if (r['Status'] === 'In Stock') {
            r['Status'] = 'On Shelf';
          }
          // Clean 'Not New' or 'New Purchase' if written directly to active notes column
          if (r['Notes'] === 'Not New' || r['Notes'] === 'New Purchase') {
            r['Notes'] = '';
          }

          // Annual rollover for 'New' notes:
          // Once the purchase year has completed, 'New' falls off so each year starts fresh.
          if (r['Notes'] && /\bnew\b/i.test(r['Notes'])) {
            const currentYear = new Date().getFullYear();
            let itemYear = null;
            const itemNum = String(r['Serial #'] || r['Item #'] || r['Glove'] || r['Sleeve'] || r['Blanket'] || r['MACK'] || r['Model'] || Object.values(r)[0] || '').trim();
            const histKey = tableKey + '_history';
            const histTable = (this.snapshot && this.snapshot.tables) ? this.snapshot.tables[histKey] : null;
            if (histTable && histTable.rows) {
              const hRows = histTable.rows.filter(hr => {
                const hn = String(hr['Item #'] || hr['Model'] || hr['Serial #'] || hr['Glove'] || hr['Sleeve'] || Object.values(hr)[1] || Object.values(hr)[0] || '').trim().toLowerCase();
                return hn === itemNum.toLowerCase();
              });
              if (hRows.length > 0) {
                let earliestTime = Infinity;
                for (const hr of hRows) {
                  const dStr = String(hr['Date Assigned'] || hr['Date'] || Object.values(hr)[0] || '').trim();
                  const pd = new Date(dStr);
                  if (!isNaN(pd.getTime()) && pd.getTime() < earliestTime) {
                    earliestTime = pd.getTime();
                    itemYear = pd.getFullYear();
                  }
                }
              }
            }
            if (!itemYear) {
              const dateStr = String(r['Date Assigned'] || r['Test Date'] || r['Calibration Date'] || '').trim();
              const pd = new Date(dateStr);
              if (!isNaN(pd.getTime())) itemYear = pd.getFullYear();
            }
            if (itemYear && itemYear < currentYear) {
              r['Notes'] = LocalDatabase.stripNewNote(r['Notes']);
              this.syncRowToRawGrid(table, r);
            }
          }

          // Specific healing for OH-105
          const itemNum = String(r['Serial #'] || r['Item #'] || '').trim();
          if (itemNum === 'OH-105') {
            if (!r['Location'] || r['Location'] === 'Helena') r['Location'] = 'Hamilton';
            if (!r['Status'] || r['Status'] === 'On Shelf') r['Status'] = 'Assigned';
            if (r['Notes'] === 'Not New') r['Notes'] = '';
          }

          // Auto-heal missing Location/Status for assigned employees
          const assignedTo = String(r['Assigned To'] || '').trim();
          const isSpecial = ['on shelf', 'in stock', 'in testing', 'packed for delivery', 'ready for delivery', ''].includes(assignedTo.toLowerCase());
          if (assignedTo && !isSpecial) {
            if (!r['Status'] || r['Status'] === 'On Shelf') {
              r['Status'] = 'Assigned';
            }
            if (!r['Location'] || r['Location'] === 'Helena') {
              if (empTable && empTable.rows) {
                const match = empTable.rows.find(er => {
                  const en = String(er['Name'] || er['Employee'] || er['Employee Name'] || Object.values(er)[0] || '').trim().toLowerCase();
                  return en === assignedTo.toLowerCase();
                });
                if (match) {
                  const rawLoc = String(match['Location'] || '').trim();
                  const cleanLoc = rawLoc.replace(/\s*\([^)]*\)/g, '').trim();
                  if (cleanLoc) {
                    r['Location'] = cleanLoc;
                    if (r[locKey] !== undefined) r[locKey] = cleanLoc;
                  }
                }
              }
            }
          }
        }

        const locVal = String(r[locKey] || r['Location'] || '').trim();
        if (/^bozeman/i.test(locVal)) {
          const newLoc = locVal.replace(/^bozeman/i, 'Belgrade');
          if (r[locKey] !== undefined) r[locKey] = newLoc;
          r['Location'] = newLoc;
          if (table.rawGrid && r._rowIdx && table.rawGrid[r._rowIdx - 1] && locIdx !== -1) {
            table.rawGrid[r._rowIdx - 1][locIdx] = newLoc;
          }
        }
      });
    }

    // 3. Header finding logic (guarded so it only runs if headers need re-indexing)
    const isSwapTable = tableKey && (tableKey.endsWith('_swaps') || tableKey.includes('swap'));
    if (isSwapTable) {
      table._headersNormalized = true;
    }
    if (!table._headersNormalized && !isSwapTable) {
      const validHeaders = (table.headers || []).filter(h => String(h || '').trim() !== '');
      const isTraining = tableKey === 'training_tracking';

      if ((validHeaders.length <= 2 || isTraining) && table.rawGrid && table.rawGrid.length > 1) {
        let headerIdx = -1;

        // Check for known header keywords
        for (let i = 0; i < Math.min(table.rawGrid.length, 10); i++) {
          const row = table.rawGrid[i];
          let matches = 0;
          for (let c = 0; c < row.length; c++) {
            const val = String(row[c] || '').toLowerCase().trim();
            if ([
              'month', 'scheduled month',
              'crew #', 'crew', 'job number', 'job #', 'crew number',
              'training topic', 'topic', 'training',
              'lead', 'crew lead', 'foreman',
              'status', 'training status',
              'attendees', 'crew members',
              'completion date', 'date completed', 'hours'
            ].includes(val)) {
              matches++;
            }
          }
          if (matches >= 2) {
            headerIdx = i;
            break;
          }
        }

        // If not found by keyword, look for row with highest non-empty cells
        if (headerIdx === -1 && validHeaders.length <= 1) {
          let maxCount = 0;
          let bestIdx = -1;
          for (let i = 0; i < Math.min(table.rawGrid.length, 6); i++) {
            const count = table.rawGrid[i].filter(v => String(v || '').trim() !== '').length;
            if (count > maxCount && count >= 3) {
              maxCount = count;
              bestIdx = i;
            }
          }
          if (bestIdx !== -1 && bestIdx !== 0) {
            headerIdx = bestIdx;
          }
        }

        if (headerIdx !== -1 && headerIdx !== 0) {
          const rawHeaderRow = table.rawGrid[headerIdx];
          let lastHeaderCol = rawHeaderRow.length - 1;
          while (lastHeaderCol >= 0 && String(rawHeaderRow[lastHeaderCol] || '').trim() === '') {
            lastHeaderCol--;
          }

          const newHeaders = [];
          for (let c = 0; c <= lastHeaderCol; c++) {
            const hName = String(rawHeaderRow[c] || '').trim();
            newHeaders.push(hName || `Column ${c + 1}`);
          }

          const newRows = [];
          for (let r = headerIdx + 1; r < table.rawGrid.length; r++) {
            const gridRow = table.rawGrid[r];
            if (!gridRow || !gridRow.some(v => String(v || '').trim() !== '')) continue;

            const rowObj = { _rowIdx: r + 1 };
            for (let c = 0; c < newHeaders.length; c++) {
              const h = newHeaders[c];
              if (h) {
                rowObj[h] = gridRow[c] !== undefined ? gridRow[c] : '';
              }
            }
            newRows.push(rowObj);
          }

          table.headers = newHeaders;
          table.rows = newRows;
          table.rowCount = newRows.length;
        }
      }
      table._headersNormalized = true;
    }

    if (table.rows && table.headers) {
      table.rows.forEach((r, i) => {
        if (!r._rowIdx) r._rowIdx = i + 2;
      });
      if (!table.rawGrid || table.rawGrid.length <= 1) {
        table.rawGrid = [
          table.headers,
          ...table.rows.map((r, i) => {
            r._rowIdx = i + 2;
            return table.headers.map(h => r[h] !== undefined ? r[h] : '');
          })
        ];
      }
      table.rowCount = table.rows.length;
      table.maxRows = table.rawGrid ? table.rawGrid.length : table.rows.length + 1;
    }

    return table;
  }

  getOutbox() {
    return this.outbox;
  }

  async saveOutbox(newOutbox) {
    this.outbox = Array.isArray(newOutbox) ? newOutbox : [];
    if (window.desktopAPI) {
      await window.desktopAPI.saveLocalOutbox(this.outbox);
    } else {
      localStorage.setItem('sa_outbox', JSON.stringify(this.outbox));
    }
    this.notify();
  }

  getTableKeyForSheet(sheetName) {
    if (!sheetName) return null;
    const clean = String(sheetName).trim().toLowerCase();
    const map = {
      'gloves': 'gloves',
      'sleeves': 'sleeves',
      'blankets': 'blankets',
      'macks': 'macks',
      'hv testers': 'hv_testers',
      'hv_testers': 'hv_testers',
      'phasing sets': 'phasing_sets',
      'phasing_sets': 'phasing_sets',
      'aed': 'aed',
      'grounds': 'grounds',
      'hot sticks': 'hot_sticks',
      'hot_sticks': 'hot_sticks',
      'employees': 'employees',
      'job tracking': 'job_tracking',
      'job_tracking': 'job_tracking',
      'safety compliance': 'safety_compliance',
      'safety_compliance': 'safety_compliance',
      'jha log': 'jha_log',
      'jha_log': 'jha_log',
      'weekly safety log': 'weekly_safety_log',
      'weekly_safety_log': 'weekly_safety_log',
      'monthly checklist log': 'monthly_checklist_log',
      'monthly_checklist_log': 'monthly_checklist_log',
      'dot drug tests': 'dot_drug_tests',
      'dot_drug_tests': 'dot_drug_tests',
      'drug test clinics': 'drug_test_clinics',
      'drug_test_clinics': 'drug_test_clinics'
    };
    if (map[clean]) return map[clean];

    if (this.snapshot && this.snapshot.tables) {
      for (const key of Object.keys(this.snapshot.tables)) {
        const tbl = this.snapshot.tables[key];
        if (tbl && tbl.name && tbl.name.toLowerCase() === clean) return key;
        if (key.toLowerCase() === clean.replace(/\s+/g, '_')) return key;
      }
    }
    return clean.replace(/\s+/g, '_');
  }

  getSheetNameForTableKey(tableKey) {
    if (!tableKey) return '';
    const clean = String(tableKey).trim().toLowerCase();
    const map = {
      'gloves': 'Gloves',
      'sleeves': 'Sleeves',
      'blankets': 'Blankets',
      'macks': 'MACKs',
      'hv_testers': 'HV Testers',
      'hv testers': 'HV Testers',
      'phasing_sets': 'Phasing Sets',
      'phasing sets': 'Phasing Sets',
      'aed': 'AED',
      'grounds': 'Grounds',
      'hot_sticks': 'Hot Sticks',
      'hot sticks': 'Hot Sticks',
      'glove_swaps': 'Glove Swaps',
      'sleeve_swaps': 'Sleeve Swaps',
      'blanket_swaps': 'Blanket Swaps',
      'mack_swaps': 'MACK Swaps',
      'hv_tester_swaps': 'HV Tester Swaps',
      'phasing_set_swaps': 'Phasing Set Swaps',
      'aed_swaps': 'AED Swaps',
      'ground_swaps': 'Ground Swaps',
      'hot_stick_swaps': 'Hot Stick Swaps',
      'employees': 'Employees',
      'job_tracking': 'Job Tracking',
      'safety_compliance': 'Safety Compliance',
      'expiring_certs': 'Expiring Certs',
      'training_tracking': 'Training Tracking',
      'gloves_history': 'Gloves History',
      'sleeves_history': 'Sleeves History',
      'blankets_history': 'Blankets History',
      'macks_history': 'MACKs History',
      'hv_testers_history': 'HV Testers History',
      'phasing_sets_history': 'Phasing Sets History',
      'aed_history': 'AED History',
      'grounds_history': 'Grounds History',
      'hot_sticks_history': 'Hot Sticks History',
      'employee_history': 'Employee History',
      'safety_equipment_needs': 'Safety Equipment Needs',
      'jha_log': 'JHA Log',
      'weekly_safety_log': 'Weekly Safety Log',
      'monthly_checklist_log': 'Monthly Checklist Log',
      'locations': 'Locations',
      'drive_time_routes': 'Drive Time Routes',
      'vendors': 'Vendors',
      'purchase_orders': 'Purchase Orders',
      'dot_drug_tests': 'DOT Drug Tests',
      'dot drug tests': 'DOT Drug Tests',
      'drug_test_clinics': 'Drug Test Clinics',
      'drug test clinics': 'Drug Test Clinics'
    };
    if (map[clean]) return map[clean];
    if (this.snapshot && this.snapshot.tables && this.snapshot.tables[clean]) {
      const tbl = this.snapshot.tables[clean];
      if (tbl && tbl.name) return tbl.name;
    }
    return clean.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  }

  getPendingCount() {
    return this.outbox.length;
  }

  async queueMutation(mutation) {
    return await this.addMutation(mutation);
  }

  async addRow(tableKey, rowObj, originReason = '') {
    if (!this.snapshot) this.snapshot = { tables: {}, configs: {} };
    if (!this.snapshot.tables) this.snapshot.tables = {};

    let table = this.snapshot.tables[tableKey];
    if (!table) {
      const sheetNameMap = {
        gloves: 'Gloves',
        sleeves: 'Sleeves',
        blankets: 'Blankets',
        macks: 'MACKs',
        hv_testers: 'HV Testers',
        phasing_sets: 'Phasing Sets',
        aed: 'AED',
        grounds: 'Grounds',
        hot_sticks: 'Hot Sticks',
        employees: 'Employees',
        job_tracking: 'Job Tracking'
      };
      const name = sheetNameMap[tableKey] || tableKey;
      table = { name: name, headers: Object.keys(rowObj), rows: [], rawGrid: [Object.keys(rowObj)], rowCount: 0, _normalized: true };
      this.snapshot.tables[tableKey] = table;
    }

    if (!table.rows) table.rows = [];
    if (!table.rawGrid) table.rawGrid = [table.headers || Object.keys(rowObj)];

    // Ensure headers exist
    if (!table.headers || table.headers.length === 0) {
      table.headers = Object.keys(rowObj);
      table.rawGrid[0] = table.headers;
    }

    // Add to rows array (insert at the beginning so newly added items appear at the top)
    rowObj._rowIdx = 2;
    table.rows.unshift({ ...rowObj });
    table.rows.forEach((r, idx) => {
      r._rowIdx = idx + 2;
    });
    table.rowCount = table.rows.length;

    // Add to rawGrid array right after header row (index 1)
    const gridRow = table.headers.map(h => rowObj[h] !== undefined ? rowObj[h] : '');
    table.rawGrid.splice(1, 0, gridRow);
    table.maxRows = table.rawGrid.length;

    // Queue ADD_ROW mutation for Google Sheets sync
    await this.addMutation({
      action: 'ADD_ROW',
      sheetName: table.name,
      tableKey: tableKey,
      rowData: rowObj
    });

    // Auto-record initial History entry if this is an inventory sheet
    const histNote = originReason || rowObj['Notes'] || 'New Purchase';
    await this.recordItemHistoryEvent(table.name, rowObj, histNote);

    return rowObj;
  }

  /**
   * Synchronizes an in-memory row object's updated values into the table's rawGrid representation
   */
  syncRowToRawGrid(table, rowObj) {
    if (!table || !table.rawGrid || !table.headers || !rowObj) return;
    const rowIdx = rowObj._rowIdx || (table.rows ? table.rows.indexOf(rowObj) + 2 : null);
    if (rowIdx && table.rawGrid[rowIdx - 1]) {
      const gRow = table.rawGrid[rowIdx - 1];
      table.headers.forEach((h, cIdx) => {
        if (rowObj[h] !== undefined) gRow[cIdx] = rowObj[h];
      });
      return;
    }

    const keyProp = table.headers[0];
    const keyVal = String(rowObj[keyProp] || Object.values(rowObj)[0] || '').trim().toLowerCase();
    if (!keyVal) return;

    for (let i = 1; i < table.rawGrid.length; i++) {
      const gRow = table.rawGrid[i];
      if (String(gRow[0] || '').trim().toLowerCase() === keyVal || String(gRow[1] || '').trim().toLowerCase() === keyVal) {
        table.headers.forEach((h, colIdx) => {
          if (rowObj[h] !== undefined) {
            gRow[colIdx] = rowObj[h];
          }
        });
        break;
      }
    }
  }

  /**
   * Updates an existing history row in a history table and syncs to rawGrid and Google Sheets mutation outbox
   */
  async updateHistoryRow(sheetKey, targetRowOrPredicate, updatedFields) {
    if (!this.snapshot || !this.snapshot.tables || !targetRowOrPredicate || !updatedFields) return false;
    const cleanKey = String(sheetKey || '').toLowerCase().trim();
    const histKey = cleanKey.endsWith('_history') ? cleanKey : `${cleanKey}_history`;
    const table = this.snapshot.tables[histKey] || this.getTable(histKey);
    if (!table || !table.rows) return false;

    let targetRow = null;
    if (typeof targetRowOrPredicate === 'function') {
      targetRow = table.rows.find(targetRowOrPredicate);
    } else if (typeof targetRowOrPredicate === 'object') {
      targetRow = table.rows.find(r => r === targetRowOrPredicate);
      if (!targetRow && targetRowOrPredicate._rowIdx) {
        targetRow = table.rows.find(r => r._rowIdx === targetRowOrPredicate._rowIdx);
      }
      if (!targetRow) {
        const itemVal = String(targetRowOrPredicate['Item #'] || targetRowOrPredicate['Serial #'] || targetRowOrPredicate['Model'] || Object.values(targetRowOrPredicate)[1] || Object.values(targetRowOrPredicate)[0] || '').trim().toLowerCase();
        const dateVal = String(targetRowOrPredicate['Date Assigned'] || targetRowOrPredicate['Date'] || '').trim();
        const assignedVal = String(targetRowOrPredicate['Assigned To'] || targetRowOrPredicate['Employee Name'] || '').trim().toLowerCase();
        targetRow = table.rows.find(r => {
          const rItem = String(r['Item #'] || r['Serial #'] || r['Model'] || Object.values(r)[1] || Object.values(r)[0] || '').trim().toLowerCase();
          const rDate = String(r['Date Assigned'] || r['Date'] || '').trim();
          const rAssigned = String(r['Assigned To'] || r['Employee Name'] || '').trim().toLowerCase();
          return (!itemVal || rItem === itemVal) && (!dateVal || rDate === dateVal) && (!assignedVal || rAssigned === assignedVal);
        });
      }
    }

    if (!targetRow) return false;

    // Apply updatedFields to row object
    for (const [k, v] of Object.entries(updatedFields)) {
      targetRow[k] = v;
      if (table.headers) {
        const matchingHeader = table.headers.find(h => h.toLowerCase() === k.toLowerCase());
        if (matchingHeader && matchingHeader !== k) {
          targetRow[matchingHeader] = v;
        }
      }
    }

    // Sync to rawGrid
    this.syncRowToRawGrid(table, targetRow);

    // Queue UPDATE_CELL mutations for sync
    const rIdx = targetRow._rowIdx || (table.rows.indexOf(targetRow) !== -1 ? table.rows.indexOf(targetRow) + 2 : null);
    if (rIdx && table.headers) {
      const itemIdentifier = String(targetRow['Item #'] || targetRow['Serial #'] || targetRow['Model'] || Object.values(targetRow)[1] || Object.values(targetRow)[0] || '');
      for (const [k, v] of Object.entries(updatedFields)) {
        const colIdx = table.headers.findIndex(h => h.toLowerCase() === k.toLowerCase());
        if (colIdx !== -1) {
          await this.addMutation({
            action: 'UPDATE_CELL',
            sheetName: table.name,
            row: rIdx,
            col: colIdx + 1,
            header: table.headers[colIdx],
            itemIdentifier: itemIdentifier,
            value: v
          });
        }
      }
    }

    this.schedulePersistSnapshot(this.snapshot, 400);
    this.notify();
    return true;
  }

  /**
   * Records an item state transition event to the corresponding History table and syncs to Google Sheets
   */
  async recordItemHistoryEvent(sheetName, itemRow, reasonNote = '') {
    if (!itemRow || !this.snapshot || !this.snapshot.tables) return;
    const sNameLower = String(sheetName || '').toLowerCase().trim();
    const invMap = {
      'gloves': 'gloves_history',
      'sleeves': 'sleeves_history',
      'blankets': 'blankets_history',
      'macks': 'macks_history',
      'hv testers': 'hv_testers_history',
      'hv_testers': 'hv_testers_history',
      'phasing sets': 'phasing_sets_history',
      'phasing_sets': 'phasing_sets_history',
      'aed': 'aed_history',
      'grounds': 'grounds_history',
      'hot sticks': 'hot_sticks_history',
      'hot_sticks': 'hot_sticks_history'
    };
    const histTableKey = invMap[sNameLower];
    if (!histTableKey) return;

    const histSheetName = sheetName.includes('History') ? sheetName : `${sheetName} History`;
    let histTable = this.snapshot.tables[histTableKey];
    if (!histTable) {
      histTable = { name: histSheetName, headers: ['Date Assigned', 'Item #', 'Size', 'Class', 'Location', 'Assigned To', 'Notes'], rows: [], rawGrid: [], rowCount: 0, _normalized: true };
      this.snapshot.tables[histTableKey] = histTable;
    }

    const todayStr = new Date().toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' });
    let itemNum = '';
    if (sNameLower.includes('hv') || sNameLower.includes('tester') || sNameLower.includes('phasing')) {
      itemNum = String(itemRow['Model'] || itemRow['HVT #'] || itemRow['PS #'] || itemRow['Serial #'] || itemRow['Item #'] || Object.values(itemRow)[0] || '').trim();
    } else {
      itemNum = String(itemRow['Item #'] || itemRow['Glove'] || itemRow['Sleeve'] || itemRow['Blanket'] || itemRow['MACK'] || itemRow['Serial #'] || Object.values(itemRow)[0] || '').trim();
    }
    if (!itemNum) return;

    const assignedTo = String(itemRow['Assigned To'] || itemRow['Status'] || 'On Shelf').trim();
    const cleanLoc = window.getPhysicalLocation ? window.getPhysicalLocation(itemRow['Location']) : itemRow['Location'];
    const location = String(cleanLoc || itemRow['Location'] || 'Helena').trim();
    const notes = reasonNote || itemRow['Notes'] || '';

    let latest = null;
    let lAssigned = '';
    let lLoc = '';

    // Check if the chronologically latest history entry for this item already has the identical assignedTo and location
    if (histTable.rows && histTable.rows.length > 0) {
      const isNum = /^\d+$/.test(itemNum);
      const parsedNum = isNum ? parseInt(itemNum, 10) : null;
      const itemHistRows = histTable.rows.filter(r => {
        const rNum = String(r['Item #'] || r['Model'] || r['Serial #'] || Object.values(r)[1] || Object.values(r)[0] || '').trim();
        if (rNum.toLowerCase() === itemNum.toLowerCase()) return true;
        if (isNum && /^\d+$/.test(rNum) && parseInt(rNum, 10) === parsedNum) return true;
        return false;
      });

      if (itemHistRows.length > 0) {
        // Find the chronologically latest record for this item (ignoring anomalous future dates)
        const nowMs = Date.now() + 86400000;
        let latestTime = -Infinity;
        for (const r of itemHistRows) {
          const dStr = String(r['Date Assigned'] || r['Date'] || Object.values(r)[0] || '').trim();
          let t = 0;
          if (window.itemStatsEngine && typeof window.itemStatsEngine.parseDate === 'function') {
            const pd = window.itemStatsEngine.parseDate(dStr);
            t = pd ? pd.getTime() : 0;
          } else {
            const pd = new Date(dStr);
            t = !isNaN(pd.getTime()) ? pd.getTime() : 0;
          }
          if (t <= nowMs && (!latest || t > latestTime)) {
            latestTime = t;
            latest = r;
          }
        }

        if (latest) {
          lAssigned = String(latest['Assigned To'] || latest['Status'] || '').trim().toLowerCase();
          lLoc = String(latest['Location'] || '').trim().toLowerCase();
          const isSameHolder = this.areSameEmployee(lAssigned, assignedTo);
          const isBothShelf = (lAssigned === 'on shelf' || lAssigned === 'storage' || lAssigned === 'in stock') && 
                              (assignedTo.toLowerCase() === 'on shelf' || assignedTo.toLowerCase() === 'storage' || assignedTo.toLowerCase() === 'in stock');
          if (isSameHolder || isBothShelf) {
            const newDate = String(itemRow['Date Assigned'] || itemRow['Date'] || '').trim();
            const curDate = String(latest['Date Assigned'] || latest['Date'] || '').trim();
            let hasChange = false;
            if (assignedTo && String(latest['Assigned To'] || '').trim() !== assignedTo) {
              latest['Assigned To'] = assignedTo;
              hasChange = true;
            }
            if (newDate && newDate !== curDate) {
              latest['Date Assigned'] = newDate;
              hasChange = true;
            }
            if (location && lLoc !== location.toLowerCase()) {
              latest['Location'] = location;
              hasChange = true;
            }
            if (notes && latest['Notes'] !== notes) {
              latest['Notes'] = notes;
              hasChange = true;
            }
            if (hasChange && histTable.rawGrid && histTable.headers) {
              const dateColIdx = histTable.headers.findIndex(h => /date\s*assigned|^date$/i.test(h));
              const itemColIdx = histTable.headers.findIndex(h => /^(item(\s*#)?|serial(\s*#)?|glove|sleeve|blanket|mack|hv\s*tester|phasing|model)/i.test(h));
              let rIdx = null;
              if (latest._rowIdx && latest._rowIdx >= 2 && latest._rowIdx <= histTable.rawGrid.length) {
                const checkRow = histTable.rawGrid[latest._rowIdx - 1];
                const checkItem = itemColIdx !== -1 ? String(checkRow[itemColIdx] || '').trim() : '';
                if (!itemNum || checkItem.toLowerCase() === itemNum.toLowerCase()) {
                  rIdx = latest._rowIdx;
                }
              }
              if (!rIdx) {
                const gIdx = histTable.rawGrid.findIndex((gr, idx) => {
                  if (idx === 0) return false;
                  const grItem = itemColIdx !== -1 ? String(gr[itemColIdx] || '').trim() : '';
                  const grDate = dateColIdx !== -1 ? String(gr[dateColIdx] || '').trim() : '';
                  return (!itemNum || grItem.toLowerCase() === itemNum.toLowerCase()) && (!curDate || grDate === curDate);
                });
                if (gIdx !== -1) {
                  rIdx = gIdx + 1;
                  latest._rowIdx = rIdx;
                } else {
                  rIdx = histTable.rows.indexOf(latest) !== -1 ? histTable.rows.indexOf(latest) + 2 : null;
                }
              }
              if (rIdx && histTable.rawGrid[rIdx - 1] && dateColIdx !== -1 && newDate) {
                histTable.rawGrid[rIdx - 1][dateColIdx] = newDate;
              }
              if (rIdx && dateColIdx !== -1 && newDate) {
                await this.addMutation({
                  action: 'UPDATE_CELL',
                  sheetName: histTable.name,
                  row: rIdx,
                  col: dateColIdx + 1,
                  header: histTable.headers[dateColIdx],
                  itemIdentifier: itemNum,
                  value: newDate
                });
              }
            }
            this.schedulePersistSnapshot(this.snapshot, 600);
            this.notify();
            return; // Already recorded & date synced
          }
        }
      }
    }

    let eventDate = String(itemRow['Date Assigned'] || itemRow['Date'] || '').trim();
    // Guard: Prevent future assignment dates from being recorded to history
    if (eventDate) {
      const parsedDt = window.itemStatsEngine && typeof window.itemStatsEngine.parseDate === 'function'
        ? window.itemStatsEngine.parseDate(eventDate)
        : new Date(eventDate);
      if (parsedDt && !isNaN(parsedDt.getTime()) && parsedDt.getTime() > (Date.now() + 86400000)) {
        eventDate = todayStr;
        itemRow['Date Assigned'] = todayStr;
      }
    }
    if (!eventDate) {
      eventDate = todayStr;
      itemRow['Date Assigned'] = todayStr;
    }

    const histRow = {
      'Date Assigned': eventDate || todayStr,
      'Item #': itemNum,
      'Location': location,
      'Assigned To': assignedTo,
      'Notes': notes
    };
    if (itemRow['Model']) histRow['Model'] = itemRow['Model'];
    if (itemRow['KV']) histRow['KV'] = itemRow['KV'];
    if (itemRow['Serial #'] && !histRow['Serial #']) histRow['Serial #'] = itemRow['Serial #'];
    if (itemRow['Size']) histRow['Size'] = itemRow['Size'];
    if (itemRow['Class']) histRow['Class'] = itemRow['Class'];
    if (itemRow['Type']) histRow['Type'] = itemRow['Type'];
    if (itemRow['Length']) histRow['Length'] = itemRow['Length'];

    if (!histTable.rows) histTable.rows = [];
    histTable.rows.unshift({ ...histRow });
    histTable.rowCount = histTable.rows.length;

    if (histTable.rawGrid && histTable.headers) {
      const gridRow = histTable.headers.map(h => histRow[h] !== undefined ? histRow[h] : '');
      histTable.rawGrid.splice(1, 0, gridRow);
      histTable.maxRows = histTable.rawGrid.length;
    }

    // Queue mutation for Google Sheets sync
    await this.addMutation({
      action: 'ADD_ROW',
      sheetName: histSheetName,
      tableKey: histTableKey,
      itemNumber: itemNum,
      itemIdentifier: itemNum,
      rowData: histRow
    });

    this.schedulePersistSnapshot(this.snapshot, 600);
    this.notify();
  }

  /**
   * Deletes an item row from local table and queues DELETE_ROW mutation
   */
  async deleteRow(tableKey, itemIdentifier) {
    const table = this.getTable(tableKey);
    if (!table || !table.rows) return false;

    const cleanId = String(itemIdentifier).trim().toLowerCase();
    const rowIdx = table.rows.findIndex(r => {
      const firstKey = Object.keys(r)[0] || 'Item #';
      const num = String(r['Item #'] || r['Glove'] || r['Sleeve'] || r['Blanket'] || r['Serial #'] || r['ESL ID'] || r[firstKey] || '').trim().toLowerCase();
      const esl = String(r['ESL ID'] || '').trim().toLowerCase();
      return num === cleanId || esl === cleanId;
    });

    if (rowIdx === -1) return false;

    const removedRow = table.rows.splice(rowIdx, 1)[0];
    table.rowCount = table.rows.length;

    // Remove from rawGrid as well (offset +1 for header)
    if (table.rawGrid) {
      const gridIdx = table.rawGrid.findIndex((gr, idx) => {
        if (idx === 0) return false; // Header
        return gr.some(cell => String(cell).trim().toLowerCase() === cleanId);
      });
      if (gridIdx > 0) {
        table.rawGrid.splice(gridIdx, 1);
        table.maxRows = table.rawGrid.length;
      }
    }

    // Queue DELETE_ROW mutation for active inventory table
    await this.addMutation({
      action: 'DELETE_ROW',
      sheetName: table.name,
      tableKey: tableKey,
      itemIdentifier: itemIdentifier,
      rowData: removedRow
    });

    // Cascade delete all history records for this item from the corresponding history table
    const invMap = {
      'gloves': 'gloves_history',
      'sleeves': 'sleeves_history',
      'blankets': 'blankets_history',
      'macks': 'macks_history',
      'hv_testers': 'hv_testers_history',
      'phasing_sets': 'phasing_sets_history',
      'aed': 'aed_history',
      'grounds': 'grounds_history',
      'hot_sticks': 'hot_sticks_history'
    };
    const histKey = invMap[tableKey] || (tableKey.endsWith('_history') ? null : `${tableKey}_history`);
    if (histKey) {
      const histTable = this.getTable(histKey);
      if (histTable && histTable.rows) {
        const matchingHistRows = histTable.rows.filter(r => {
          const num = String(r['Item #'] || r['Item'] || r['Glove'] || r['Sleeve'] || r['Blanket'] || r['Serial #'] || r['ESL ID'] || Object.values(r)[1] || Object.values(r)[0] || '').trim().toLowerCase();
          return num === cleanId;
        });

        if (matchingHistRows.length > 0) {
          for (const hRow of matchingHistRows) {
            const hIdx = histTable.rows.indexOf(hRow);
            if (hIdx !== -1) {
              histTable.rows.splice(hIdx, 1);
            }
          }
          histTable.rowCount = histTable.rows.length;

          if (histTable.rawGrid) {
            histTable.rawGrid = histTable.rawGrid.filter((gr, idx) => {
              if (idx === 0) return true; // Keep header
              const cellVal = String(gr[1] || gr[0] || '').trim().toLowerCase();
              return cellVal !== cleanId;
            });
            histTable.maxRows = histTable.rawGrid.length;
          }

          // Queue DELETE_ROW mutation for the history table
          await this.addMutation({
            action: 'DELETE_ROW',
            sheetName: histTable.name,
            tableKey: histKey,
            itemIdentifier: itemIdentifier
          });
        }
      }
    }

    return true;
  }

  /**
   * Deletes a single history record from a history table and queues DELETE_ROW mutation
   */
  async deleteHistoryRow(historyTableKey, matchFnOrRowObj) {
    const table = this.getTable(historyTableKey);
    if (!table || !table.rows) return false;

    let rowIdx = -1;
    if (typeof matchFnOrRowObj === 'function') {
      rowIdx = table.rows.findIndex(matchFnOrRowObj);
    } else if (typeof matchFnOrRowObj === 'object') {
      rowIdx = table.rows.indexOf(matchFnOrRowObj);
      if (rowIdx === -1) {
        const obj = matchFnOrRowObj;
        const oDate = String(obj['Date Assigned'] || obj['Date'] || obj['Action Date'] || '').trim();
        const oItem = String(obj['Item #'] || obj['Item'] || obj['Serial #'] || obj['Glove'] || obj['Sleeve'] || obj['Blanket'] || '').trim();
        const oAssigned = String(obj['Assigned To'] || obj['Employee Name'] || obj['Employee'] || '').trim();
        const oNotes = String(obj['Notes'] || obj['Note'] || '').trim();

        rowIdx = table.rows.findIndex(r => {
          const rDate = String(r['Date Assigned'] || r['Date'] || r['Action Date'] || '').trim();
          const rItem = String(r['Item #'] || r['Item'] || r['Serial #'] || r['Glove'] || r['Sleeve'] || r['Blanket'] || '').trim();
          const rAssigned = String(r['Assigned To'] || r['Employee Name'] || r['Employee'] || '').trim();
          const rNotes = String(r['Notes'] || r['Note'] || '').trim();
          return rDate === oDate && rItem.toLowerCase() === oItem.toLowerCase() && (oAssigned ? rAssigned.toLowerCase() === oAssigned.toLowerCase() : true) && (oNotes ? rNotes === oNotes : true);
        });
      }
    }

    if (rowIdx === -1) return false;

    const removedRow = table.rows.splice(rowIdx, 1)[0];
    table.rowCount = table.rows.length;

    // Remove from rawGrid as well
    if (table.rawGrid) {
      let itemColIdx = -1;
      let dateColIdx = -1;
      let assignedColIdx = -1;
      if (table.headers) {
        itemColIdx = table.headers.findIndex(h => /^(item(\s*#)?|serial(\s*#)?|glove|sleeve|blanket|mack|hv\s*tester|phasing)/i.test(String(h).trim()));
        dateColIdx = table.headers.findIndex(h => /^(date(\s*assigned)?|action\s*date|date)/i.test(String(h).trim()));
        assignedColIdx = table.headers.findIndex(h => /^(assigned\s*to|employee(\s*name)?|employee|holder)/i.test(String(h).trim()));
      }
      if (itemColIdx === -1) itemColIdx = 1;
      if (dateColIdx === -1) dateColIdx = 0;

      const oDate = String(removedRow['Date Assigned'] || removedRow['Date'] || '').trim();
      const oItem = String(removedRow['Item #'] || removedRow['Item'] || removedRow['Serial #'] || '').trim();
      const oAssigned = String(removedRow['Assigned To'] || '').trim();

      let gridIdx = -1;
      if (removedRow._rowIdx && removedRow._rowIdx >= 2 && removedRow._rowIdx <= table.rawGrid.length) {
        const candidateRow = table.rawGrid[removedRow._rowIdx - 1];
        if (candidateRow) {
          const cItem = String(candidateRow[itemColIdx] || '').trim();
          const cDate = String(candidateRow[dateColIdx] || '').trim();
          if ((!oItem || cItem.toLowerCase() === oItem.toLowerCase()) && (!oDate || cDate === oDate)) {
            gridIdx = removedRow._rowIdx - 1;
          }
        }
      }

      if (gridIdx === -1) {
        gridIdx = table.rawGrid.findIndex((gr, idx) => {
          if (idx === 0) return false;
          const grDate = String(gr[dateColIdx] || gr[0] || '').trim();
          const grItem = String(gr[itemColIdx] || gr[1] || '').trim();
          const grAssigned = assignedColIdx !== -1 ? String(gr[assignedColIdx] || '').trim() : String(gr[5] || gr[4] || gr[3] || '').trim();
          return (oDate ? grDate === oDate : true) && (oItem ? grItem.toLowerCase() === oItem.toLowerCase() : true) && (oAssigned ? grAssigned.toLowerCase() === oAssigned.toLowerCase() : true);
        });
      }

      if (gridIdx > 0) {
        table.rawGrid.splice(gridIdx, 1);
        table.maxRows = table.rawGrid.length;
      }
    }

    // Queue DELETE_ROW mutation
    await this.addMutation({
      action: 'DELETE_ROW',
      sheetName: table.name,
      tableKey: historyTableKey,
      rowData: removedRow
    });

    return true;
  }

  /**
   * Updates fields of a single history record in a history table and queues UPDATE_CELL mutations
   */
  async updateHistoryRow(historyTableKey, matchFnOrRowObj, updatedFields = {}) {
    const table = this.getTable(historyTableKey);
    if (!table || !table.rows || !updatedFields || Object.keys(updatedFields).length === 0) return false;

    let targetRow = null;
    let rowIdx = -1;

    if (typeof matchFnOrRowObj === 'function') {
      rowIdx = table.rows.findIndex(matchFnOrRowObj);
      if (rowIdx !== -1) targetRow = table.rows[rowIdx];
    } else if (typeof matchFnOrRowObj === 'object') {
      rowIdx = table.rows.indexOf(matchFnOrRowObj);
      if (rowIdx !== -1) {
        targetRow = table.rows[rowIdx];
      } else {
        const obj = matchFnOrRowObj;
        const oDate = String(obj['Date Assigned'] || obj['Date'] || obj['Action Date'] || '').trim();
        const oItem = String(obj['Item #'] || obj['Item'] || obj['Serial #'] || obj['Glove'] || obj['Sleeve'] || obj['Blanket'] || '').trim();
        const oAssigned = String(obj['Assigned To'] || obj['Employee Name'] || obj['Employee'] || '').trim();
        const oNotes = String(obj['Notes'] || obj['Note'] || '').trim();

        const oNum = parseInt(oItem, 10);
        const isPureONum = !isNaN(oNum) && String(oNum) === oItem;

        rowIdx = table.rows.findIndex(r => {
          const rDate = String(r['Date Assigned'] || r['Date'] || r['Action Date'] || '').trim();
          const rItem = String(r['Item #'] || r['Item'] || r['Serial #'] || r['Glove'] || r['Sleeve'] || r['Blanket'] || '').trim();
          const rAssigned = String(r['Assigned To'] || r['Employee Name'] || r['Employee'] || '').trim();
          const rNotes = String(r['Notes'] || r['Note'] || '').trim();

          let itemMatches = rItem.toLowerCase() === oItem.toLowerCase();
          if (!itemMatches && isPureONum) {
            const rNum = parseInt(rItem, 10);
            if (!isNaN(rNum) && String(rNum) === rItem && rNum === oNum) itemMatches = true;
          }
          return rDate === oDate && itemMatches && (oAssigned ? rAssigned.toLowerCase() === oAssigned.toLowerCase() : true) && (oNotes ? rNotes === oNotes : true);
        });

        if (rowIdx === -1) {
          rowIdx = table.rows.findIndex(r => {
            const rDate = String(r['Date Assigned'] || r['Date'] || r['Action Date'] || '').trim();
            const rItem = String(r['Item #'] || r['Item'] || r['Serial #'] || r['Glove'] || r['Sleeve'] || r['Blanket'] || '').trim();
            const rAssigned = String(r['Assigned To'] || r['Employee Name'] || r['Employee'] || '').trim();

            let itemMatches = rItem.toLowerCase() === oItem.toLowerCase();
            if (!itemMatches && isPureONum) {
              const rNum = parseInt(rItem, 10);
              if (!isNaN(rNum) && String(rNum) === rItem && rNum === oNum) itemMatches = true;
            }
            return rDate === oDate && itemMatches && (oAssigned ? rAssigned.toLowerCase() === oAssigned.toLowerCase() : true);
          });
        }

        if (rowIdx !== -1) targetRow = table.rows[rowIdx];
      }
    }

    if (!targetRow || rowIdx === -1) return false;

    const itemNum = String(targetRow['Item #'] || targetRow['Item'] || targetRow['Serial #'] || targetRow['Glove'] || targetRow['Sleeve'] || targetRow['Blanket'] || '').trim();

    // Determine grid row index (1-indexed for sheet)
    let gridIdx = -1;
    if (table.rawGrid) {
      let itemColIdx = -1;
      let dateColIdx = -1;
      let assignedColIdx = -1;
      let locationColIdx = -1;

      if (table.headers) {
        itemColIdx = table.headers.findIndex(h => /^(item(\s*#)?|serial(\s*#)?|glove|sleeve|blanket|mack|hv\s*tester|phasing)/i.test(String(h).trim()));
        dateColIdx = table.headers.findIndex(h => /^(date(\s*assigned)?|action\s*date|date)/i.test(String(h).trim()));
        assignedColIdx = table.headers.findIndex(h => /^(assigned\s*to|employee(\s*name)?|employee|holder)/i.test(String(h).trim()));
        locationColIdx = table.headers.findIndex(h => /^location$/i.test(String(h).trim()));
      }
      if (itemColIdx === -1) itemColIdx = 1;
      if (dateColIdx === -1) dateColIdx = 0;

      const oDate = String(targetRow['Date Assigned'] || targetRow['Date'] || targetRow['Action Date'] || '').trim();
      const oAssigned = String(targetRow['Assigned To'] || targetRow['Employee Name'] || targetRow['Employee'] || '').trim();
      const oLocation = String(targetRow['Location'] || '').trim();

      // Only trust targetRow._rowIdx if it exists, is in bounds, AND matches this item in rawGrid
      if (targetRow._rowIdx && targetRow._rowIdx >= 2 && targetRow._rowIdx <= table.rawGrid.length) {
        const candidateIdx = targetRow._rowIdx - 1;
        const candidateRow = table.rawGrid[candidateIdx];
        if (candidateRow) {
          const candidateItem = itemColIdx !== -1 ? String(candidateRow[itemColIdx] || '').trim() : '';
          const candidateDate = dateColIdx !== -1 ? String(candidateRow[dateColIdx] || '').trim() : '';
          const itemMatches = !itemNum || candidateItem.toLowerCase() === itemNum.toLowerCase();
          const dateMatches = !oDate || candidateDate === oDate;
          if (itemMatches && dateMatches) {
            gridIdx = candidateIdx;
          }
        }
      }

      // If targetRow._rowIdx did not match rawGrid, search rawGrid
      if (gridIdx === -1) {
        // 1. Strict match: Item + Date + Assigned + Location
        gridIdx = table.rawGrid.findIndex((gr, idx) => {
          if (idx === 0) return false;
          const grItem = itemColIdx !== -1 ? String(gr[itemColIdx] || '').trim() : String(gr[1] || '').trim();
          const grDate = dateColIdx !== -1 ? String(gr[dateColIdx] || '').trim() : String(gr[0] || '').trim();
          const grAssigned = assignedColIdx !== -1 ? String(gr[assignedColIdx] || '').trim() : '';
          const grLocation = locationColIdx !== -1 ? String(gr[locationColIdx] || '').trim() : '';
          return (!itemNum || grItem.toLowerCase() === itemNum.toLowerCase()) &&
                 (!oDate || grDate === oDate) &&
                 (!oAssigned || grAssigned.toLowerCase() === oAssigned.toLowerCase()) &&
                 (!oLocation || grLocation.toLowerCase() === oLocation.toLowerCase());
        });

        // 2. Match: Item + Date + Assigned
        if (gridIdx === -1) {
          gridIdx = table.rawGrid.findIndex((gr, idx) => {
            if (idx === 0) return false;
            const grItem = itemColIdx !== -1 ? String(gr[itemColIdx] || '').trim() : String(gr[1] || '').trim();
            const grDate = dateColIdx !== -1 ? String(gr[dateColIdx] || '').trim() : String(gr[0] || '').trim();
            const grAssigned = assignedColIdx !== -1 ? String(gr[assignedColIdx] || '').trim() : '';
            return (!itemNum || grItem.toLowerCase() === itemNum.toLowerCase()) &&
                   (!oDate || grDate === oDate) &&
                   (!oAssigned || grAssigned.toLowerCase() === oAssigned.toLowerCase());
          });
        }

        // 3. Match: Item + Date
        if (gridIdx === -1 && oDate) {
          gridIdx = table.rawGrid.findIndex((gr, idx) => {
            if (idx === 0) return false;
            const grItem = itemColIdx !== -1 ? String(gr[itemColIdx] || '').trim() : String(gr[1] || '').trim();
            const grDate = dateColIdx !== -1 ? String(gr[dateColIdx] || '').trim() : String(gr[0] || '').trim();
            return (!itemNum || grItem.toLowerCase() === itemNum.toLowerCase()) && grDate === oDate;
          });
        }

        // 4. Match: Item alone
        if (gridIdx === -1 && itemNum) {
          gridIdx = table.rawGrid.findIndex((gr, idx) => {
            if (idx === 0) return false;
            const grItem = itemColIdx !== -1 ? String(gr[itemColIdx] || '').trim() : String(gr[1] || '').trim();
            return grItem.toLowerCase() === itemNum.toLowerCase();
          });
        }
      }

      if (gridIdx !== -1) {
        targetRow._rowIdx = gridIdx + 1;
      }
    }

    const actualRowIdx = gridIdx !== -1 ? gridIdx + 1 : (rowIdx + 2);

    for (const [key, newVal] of Object.entries(updatedFields)) {
      const oldVal = targetRow[key];
      targetRow[key] = newVal;

      let colIdx = -1;
      if (table.headers) {
        colIdx = table.headers.indexOf(key);
        if (colIdx === -1) {
          colIdx = table.headers.findIndex(h => h.toLowerCase() === key.toLowerCase());
        }
      }

      if (gridIdx !== -1 && colIdx !== -1 && table.rawGrid && table.rawGrid[gridIdx]) {
        table.rawGrid[gridIdx][colIdx] = newVal;
      }

      if (colIdx !== -1) {
        await this.addMutation({
          action: 'UPDATE_CELL',
          sheetName: table.name,
          row: actualRowIdx,
          col: colIdx + 1,
          header: table.headers[colIdx],
          itemIdentifier: itemNum,
          oldValue: oldVal,
          value: newVal
        });
      }
    }

    this.schedulePersistSnapshot(this.snapshot, 600);
    this.notify();
    return true;
  }

  /**
   * Save a manual pick override for an employee on a swap sheet
   */
  saveManualPick(swapTableKey, empName, currentItemNum, pickListNum, status = 'In Stock ✅', isPicked = false) {
    if (!swapTableKey || !empName) return;
    const cleanSheet = String(swapTableKey).toLowerCase().trim();
    const cleanEmp = String(empName).toLowerCase().trim();
    const cleanItem = String(currentItemNum || '').toLowerCase().trim();
    const cleanPick = String(pickListNum || '').trim();
    const isPickedBool = Boolean(isPicked || String(status || '').toLowerCase().includes('ready for delivery'));

    if (!this.snapshot) this.snapshot = { tables: {}, configs: {} };
    if (!this.snapshot.manualPicks) this.snapshot.manualPicks = {};
    if (!this.snapshot.manualPicks[cleanSheet]) this.snapshot.manualPicks[cleanSheet] = {};

    let localRegistry = {};
    try {
      const stored = localStorage.getItem('sa_manual_picks');
      if (stored) localRegistry = JSON.parse(stored);
    } catch { /* ignore */ }
    if (!localRegistry[cleanSheet]) localRegistry[cleanSheet] = {};

    if (!cleanPick || cleanPick === '—' || cleanPick === '-') {
      if (cleanItem) {
        delete this.snapshot.manualPicks[cleanSheet][`${cleanEmp}|${cleanItem}`];
        delete localRegistry[cleanSheet][`${cleanEmp}|${cleanItem}`];
        const existingSimple = this.snapshot.manualPicks[cleanSheet][cleanEmp];
        if (existingSimple && existingSimple.currentItemNum && String(existingSimple.currentItemNum).toLowerCase().trim() === cleanItem) {
          delete this.snapshot.manualPicks[cleanSheet][cleanEmp];
          delete localRegistry[cleanSheet][cleanEmp];
        }
      } else {
        delete this.snapshot.manualPicks[cleanSheet][cleanEmp];
        delete localRegistry[cleanSheet][cleanEmp];
      }
    } else {
      const entry = {
        pickListNum: cleanPick,
        status: status,
        currentItemNum: currentItemNum,
        empName: empName,
        isPicked: isPickedBool,
        timestamp: new Date().toISOString()
      };
      if (cleanItem) {
        this.snapshot.manualPicks[cleanSheet][`${cleanEmp}|${cleanItem}`] = entry;
        localRegistry[cleanSheet][`${cleanEmp}|${cleanItem}`] = entry;
        const existingSimple = this.snapshot.manualPicks[cleanSheet][cleanEmp];
        if (!existingSimple || !existingSimple.currentItemNum || String(existingSimple.currentItemNum).toLowerCase().trim() === cleanItem) {
          this.snapshot.manualPicks[cleanSheet][cleanEmp] = entry;
          localRegistry[cleanSheet][cleanEmp] = entry;
        } else {
          delete this.snapshot.manualPicks[cleanSheet][cleanEmp];
          delete localRegistry[cleanSheet][cleanEmp];
        }
      } else {
        this.snapshot.manualPicks[cleanSheet][cleanEmp] = entry;
        localRegistry[cleanSheet][cleanEmp] = entry;
      }
    }

    try {
      localStorage.setItem('sa_manual_picks', JSON.stringify(localRegistry));
    } catch { /* ignore */ }
    this.schedulePersistSnapshot(this.snapshot, 1000);
  }

  /**
   * Get all manual pick overrides for a given swap sheet
   */
  getManualPicks(swapTableKey) {
    const cleanSheet = String(swapTableKey || '').toLowerCase().trim();
    const res = {};
    
    // Read from localStorage first as primary persistent fallback
    try {
      const stored = localStorage.getItem('sa_manual_picks');
      if (stored) {
        const localRegistry = JSON.parse(stored);
        if (localRegistry && localRegistry[cleanSheet]) {
          Object.assign(res, localRegistry[cleanSheet]);
        }
      }
    } catch { /* ignore */ }

    // Merge in snapshot manualPicks
    if (this.snapshot && this.snapshot.manualPicks && this.snapshot.manualPicks[cleanSheet]) {
      Object.assign(res, this.snapshot.manualPicks[cleanSheet]);
    }
    return res;
  }

  /**
   * Clear a manual pick override
   */
  clearManualPick(swapTableKey, empName, currentItemNum) {
    this.saveManualPick(swapTableKey, empName, currentItemNum, '—');
  }

  async replaceSwapTable(tableKey, rawGrid, headers, rows) {
    if (!this.snapshot) this.snapshot = { tables: {}, configs: {} };
    if (!this.snapshot.tables) this.snapshot.tables = {};

    const sheetNameMap = {
      glove_swaps: 'Glove Swaps',
      sleeve_swaps: 'Sleeve Swaps',
      blanket_swaps: 'Blanket Swaps',
      mack_swaps: 'MACK Swaps',
      hv_tester_swaps: 'HV Tester Swaps',
      phasing_set_swaps: 'Phasing Set Swaps',
      aed_swaps: 'AED Swaps',
      ground_swaps: 'Ground Swaps',
      hot_stick_swaps: 'Hot Stick Swaps'
    };
    const name = sheetNameMap[tableKey] || tableKey;
    const prevTable = this.snapshot.tables[tableKey];
    let isUnchanged = false;
    if (prevTable && prevTable.rawGrid && Array.isArray(prevTable.rawGrid) && prevTable.rawGrid.length === rawGrid.length) {
      // Check if grid content matches
      isUnchanged = JSON.stringify(prevTable.rawGrid) === JSON.stringify(rawGrid);
    }

    this.snapshot.tables[tableKey] = {
      name: name,
      headers: headers,
      rawGrid: rawGrid,
      rows: rows,
      rowCount: rows.length,
      maxRows: rawGrid.length,
      maxCols: headers.length,
      _normalized: true,
      _headersNormalized: true
    };

    // Only queue REPLACE_SWAP_TABLE mutation if table content actually changed
    if (!isUnchanged) {
      await this.addMutation({
        action: 'REPLACE_SWAP_TABLE',
        sheetName: name,
        tableKey: tableKey,
        rawGrid: rawGrid
      });
    }

    await this.persistSnapshot(this.snapshot);
    this.notify();
    return this.snapshot.tables[tableKey];
  }

  async saveTable(tableKey, table) {
    if (!this.snapshot) this.snapshot = { tables: {}, configs: {} };
    if (!this.snapshot.tables) this.snapshot.tables = {};

    if (table) {
      this.normalizeTableData(table, tableKey);
      this.snapshot.tables[tableKey] = table;
    }
    await this.persistSnapshot(this.snapshot);

    const sheetName = (table && table.name) || this.getSheetNameForTableKey(tableKey) || tableKey;
    if (typeof this.addMutation === 'function') {
      await this.addMutation({
        action: 'REPLACE_TABLE_DATA',
        sheetName: sheetName,
        tableKey: tableKey,
        headers: (table && table.headers) || [],
        rows: (table && table.rows) || [],
        rawGrid: (table && table.rawGrid) || []
      });
    }

    if (window.syncEngine && typeof window.syncEngine.renderOutboxBadge === 'function') {
      window.syncEngine.renderOutboxBadge();
    }

    this.notify();
    return this.snapshot.tables[tableKey];
  }

  /**
   * Resolves a holder name to its canonical employee name using employeeResolver or employees table
   */
  getCanonicalEmployeeName(rawName) {
    if (!rawName) return '';
    const clean = String(rawName).trim();
    if (typeof window !== 'undefined' && window.employeeResolver && typeof window.employeeResolver.getCanonicalName === 'function') {
      return window.employeeResolver.getCanonicalName(clean);
    }
    if (this._empAliasMap) {
      const lower = clean.toLowerCase();
      if (this._empAliasMap.has(lower)) return this._empAliasMap.get(lower);
    } else {
      this._buildEmpAliasMap();
      if (this._empAliasMap) {
        const lower = clean.toLowerCase();
        if (this._empAliasMap.has(lower)) return this._empAliasMap.get(lower);
      }
    }
    return clean;
  }

  /**
   * Checks if two names refer to the same employee or special status
   */
  areSameEmployee(nameA, nameB) {
    if (!nameA || !nameB) return false;
    const sA = String(nameA).trim().toLowerCase();
    const sB = String(nameB).trim().toLowerCase();
    if (sA === sB) return true;

    if (typeof window !== 'undefined' && window.employeeResolver && typeof window.employeeResolver.areSameEmployee === 'function') {
      return window.employeeResolver.areSameEmployee(nameA, nameB);
    }

    const canA = this.getCanonicalEmployeeName(nameA).toLowerCase();
    const canB = this.getCanonicalEmployeeName(nameB).toLowerCase();
    if (canA && canB && canA === canB) return true;

    // Special statuses
    const shelfWords = ['on shelf', 'shelf', 'storage', 'in stock', 'unassigned'];
    if (shelfWords.includes(sA) && shelfWords.includes(sB)) return true;
    const testWords = ['in testing', 'testing', 'arnett', 'jm test', 'arnett / jm test', 'lab'];
    if (testWords.includes(sA) && testWords.includes(sB)) return true;
    const packedDeliv = ['packed for delivery', 'ready for delivery'];
    if (packedDeliv.includes(sA) && packedDeliv.includes(sB)) return true;
    const packedTest = ['packed for testing', 'ready for test'];
    if (packedTest.includes(sA) && packedTest.includes(sB)) return true;

    return false;
  }

  _buildEmpAliasMap() {
    this._empAliasMap = new Map();
    const empTable = this.getTable ? this.getTable('employees') : (this.snapshot && this.snapshot.tables ? this.snapshot.tables['employees'] : null);
    if (!empTable || !empTable.rows) return;

    empTable.rows.forEach(r => {
      const canonical = String(r['Employee Name'] || r['Name'] || Object.values(r)[0] || '').trim();
      if (!canonical) return;
      this._empAliasMap.set(canonical.toLowerCase(), canonical);

      let altNamesRaw = '';
      for (const [k, v] of Object.entries(r)) {
        if (/^(alt(ernat(e|ive))?(\s*names?)?|also\s*known\s*as|aka|aliases?)$/i.test(k.trim())) {
          altNamesRaw = String(v || '').trim();
          if (altNamesRaw) break;
        }
      }
      if (!altNamesRaw) {
        altNamesRaw = String(r['Alternate Names'] || r['Alternative names'] || r['Alternative Names'] || r['Aliases'] || r['Alt Names'] || '').trim();
      }
      if (altNamesRaw) {
        altNamesRaw.split(/[;,/]+/).forEach(alt => {
          const cleanAlt = alt.trim();
          if (cleanAlt) {
            this._empAliasMap.set(cleanAlt.toLowerCase(), canonical);
          }
        });
      }
    });
  }

  /**
   * Cleans duplicate history rows from an equipment history table (or for a specific item).
   * Two rows are duplicates if they have the same item identifier, date assigned, and assigned to holder.
   * Merges notes, preserves physical locations, re-indexes _rowIdx, rebuilds rawGrid, and queues REPLACE_TABLE_DATA.
   * @param {string} tableKey - e.g. 'gloves_history', 'sleeves_history', etc.
   * @param {string|number|null} [itemKey] - optional item identifier to limit cleanup to
   * @returns {Promise<{ removedCount: number, totalRemaining: number, tableKey: string }>}
   */
  async cleanDuplicateHistoryRows(tableKey, itemKey = null) {
    const table = this.getTable(tableKey);
    if (!table || !table.rows || table.rows.length === 0) {
      return { removedCount: 0, totalRemaining: 0, tableKey };
    }

    const cleanFilterItem = itemKey !== null && itemKey !== undefined ? String(itemKey).trim() : null;
    const isPureFilterNum = cleanFilterItem && /^\d+$/.test(cleanFilterItem);
    const filterNum = isPureFilterNum ? parseInt(cleanFilterItem, 10) : null;

    let itemColIdx = -1;
    let dateColIdx = -1;
    let assignedColIdx = -1;
    let locationColIdx = -1;
    let notesColIdx = -1;

    if (table.headers) {
      itemColIdx = table.headers.findIndex(h => /^(item(\s*#)?|serial(\s*#)?|glove|sleeve|blanket|mack|hv\s*tester|phasing|model)/i.test(String(h).trim()));
      dateColIdx = table.headers.findIndex(h => /^(date(\s*assigned)?|action\s*date|^date$)/i.test(String(h).trim()));
      assignedColIdx = table.headers.findIndex(h => /^(assigned\s*to|employee(\s*name)?|employee|holder)/i.test(String(h).trim()));
      locationColIdx = table.headers.findIndex(h => /^location$/i.test(String(h).trim()));
      notesColIdx = table.headers.findIndex(h => /^(notes?|comment)/i.test(String(h).trim()));
    }

    const itemColName = itemColIdx !== -1 && table.headers ? table.headers[itemColIdx] : 'Item #';
    const dateColName = dateColIdx !== -1 && table.headers ? table.headers[dateColIdx] : 'Date Assigned';
    const assignedColName = assignedColIdx !== -1 && table.headers ? table.headers[assignedColIdx] : 'Assigned To';
    const locColName = locationColIdx !== -1 && table.headers ? table.headers[locationColIdx] : 'Location';
    const notesColName = notesColIdx !== -1 && table.headers ? table.headers[notesColIdx] : 'Notes';

    const normalizeDateStr = (dStr) => {
      if (!dStr) return '';
      const s = String(dStr).trim();
      if (s.includes('/')) {
        const parts = s.split('/');
        if (parts.length === 3) {
          const m = parts[0].padStart(2, '0');
          const d = parts[1].padStart(2, '0');
          let y = parts[2];
          const yNum = parseInt(y, 10);
          if (yNum > 2100 && yNum >= 20200 && yNum <= 20300) y = String(Math.floor(yNum / 10));
          else if (yNum === 2032) y = '2022';
          else if (y.length === 2) y = '20' + y;
          return `${y}-${m}-${d}`;
        }
      } else if (s.includes('-')) {
        const parts = s.split('-');
        if (parts.length === 3) {
          let y = parts[0];
          const yNum = parseInt(y, 10);
          if (yNum > 2100 && yNum >= 20200 && yNum <= 20300) y = String(Math.floor(yNum / 10));
          else if (yNum === 2032) y = '2022';
          return `${y}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
        }
      }
      return s;
    };

    const normalizeItemStr = (val) => {
      const s = String(val || '').trim();
      if (/^\d+$/.test(s)) return String(parseInt(s, 10));
      return s.toLowerCase();
    };

    const parseRowTimestamp = (dStr) => {
      if (!dStr) return 0;
      const s = String(dStr).trim();
      if (s.includes('/')) {
        const parts = s.split('/');
        if (parts.length === 3) {
          const m = parseInt(parts[0], 10) - 1;
          const d = parseInt(parts[1], 10);
          let y = parseInt(parts[2], 10);
          if (y > 2100 && y >= 20200 && y <= 20300) y = Math.floor(y / 10);
          else if (y === 2032) y = 2022;
          else if (y < 100) y = y < 50 ? 2000 + y : 1900 + y;
          const dt = new Date(y, m, d, 12, 0, 0);
          return isNaN(dt.getTime()) ? 0 : dt.getTime();
        }
      }
      const dt = new Date(s);
      return isNaN(dt.getTime()) ? 0 : dt.getTime();
    };

    const seenGroups = new Map();
    let pass1Rows = [];
    let removedCount = 0;
    const nowBuffer = Date.now() + 86400000; // 1 day buffer for timezone differences

    for (let i = 0; i < table.rows.length; i++) {
      const row = table.rows[i];
      const rowItemRaw = String(row[itemColName] || row['Item #'] || row['Serial #'] || Object.values(row)[1] || Object.values(row)[0] || '').trim();
      const rowItemNorm = normalizeItemStr(rowItemRaw);

      // If filtering by a specific item, bypass other items without modification
      if (cleanFilterItem) {
        let isTarget = rowItemNorm === normalizeItemStr(cleanFilterItem);
        if (!isTarget && isPureFilterNum && /^\d+$/.test(rowItemRaw)) {
          isTarget = parseInt(rowItemRaw, 10) === filterNum;
        }
        if (!isTarget) {
          pass1Rows.push(row);
          continue;
        }
      }

      const dateRaw = String(row[dateColName] || row['Date Assigned'] || row['Date'] || '').trim();
      const rowTime = parseRowTimestamp(dateRaw);

      // 1. Guard: Purge future date anomalies (e.g. 10/29/2026 In Testing, 02/03/2027)
      if (rowTime > nowBuffer) {
        removedCount++;
        continue;
      }

      // Repair year typo in row if detected (e.g. 20026 -> 2026, 2032 -> 2022)
      if (dateRaw.includes('20026') || dateRaw.includes('2032')) {
        const repairedDate = dateRaw.replace('20026', '2026').replace('2032', '2022');
        row[dateColName] = repairedDate;
        if (row['Date Assigned']) row['Date Assigned'] = repairedDate;
      }

      const dateNorm = normalizeDateStr(String(row[dateColName] || row['Date Assigned'] || '').trim());
      const assignedRaw = String(row[assignedColName] || row['Assigned To'] || '').trim();
      const canonicalAssigned = this.getCanonicalEmployeeName(assignedRaw).toLowerCase();

      // Key consists of Item + Normalized Date + Canonical Assigned To holder
      const dedupKey = `${rowItemNorm}::${dateNorm}::${canonicalAssigned}`;

      if (seenGroups.has(dedupKey)) {
        removedCount++;
        const masterRow = seenGroups.get(dedupKey);

        // Prefer active assigned name or canonical name if master currently has alias
        const curAssigned = String(row[assignedColName] || row['Assigned To'] || '').trim();
        const masterAssigned = String(masterRow[assignedColName] || masterRow['Assigned To'] || '').trim();
        if (curAssigned && masterAssigned && curAssigned.toLowerCase() === canonicalAssigned && masterAssigned.toLowerCase() !== canonicalAssigned) {
          masterRow[assignedColName] = curAssigned;
          if (masterRow['Assigned To']) masterRow['Assigned To'] = curAssigned;
        }

        // Merge Notes
        const masterNotes = String(masterRow[notesColName] || masterRow['Notes'] || '').trim();
        const dupNotes = String(row[notesColName] || row['Notes'] || '').trim();
        if (!masterNotes && dupNotes) {
          masterRow[notesColName] = dupNotes;
        } else if (masterNotes && dupNotes && masterNotes.toLowerCase() !== dupNotes.toLowerCase()) {
          if (!masterNotes.toLowerCase().includes(dupNotes.toLowerCase())) {
            masterRow[notesColName] = `${masterNotes} | ${dupNotes}`;
          }
        }

        // Merge Location (favor specific physical location over default 'Helena' or empty)
        const masterLoc = String(masterRow[locColName] || masterRow['Location'] || '').trim();
        const dupLoc = String(row[locColName] || row['Location'] || '').trim();
        if ((!masterLoc || masterLoc.toLowerCase() === 'helena') && dupLoc && dupLoc.toLowerCase() !== 'helena') {
          masterRow[locColName] = dupLoc;
        }

        // Merge other attributes if missing in master
        for (const [k, v] of Object.entries(row)) {
          if (v !== undefined && v !== null && String(v).trim() !== '') {
            if (masterRow[k] === undefined || masterRow[k] === null || String(masterRow[k]).trim() === '') {
              masterRow[k] = v;
            }
          }
        }
      } else {
        seenGroups.set(dedupKey, row);
        pass1Rows.push(row);
      }
    }

    // 2. Consecutive same-holder collapse
    // Group remaining rows by item, sort chronologically, and merge back-to-back duplicate states
    const itemRowGroups = new Map();
    const otherRows = [];

    pass1Rows.forEach(row => {
      const rowItemRaw = String(row[itemColName] || row['Item #'] || row['Serial #'] || Object.values(row)[1] || Object.values(row)[0] || '').trim();
      const rowItemNorm = normalizeItemStr(rowItemRaw);
      if (cleanFilterItem && rowItemNorm !== normalizeItemStr(cleanFilterItem)) {
        otherRows.push(row);
        return;
      }
      if (!itemRowGroups.has(rowItemNorm)) itemRowGroups.set(rowItemNorm, []);
      itemRowGroups.get(rowItemNorm).push(row);
    });

    const cleanedRows = [...otherRows];

    itemRowGroups.forEach((groupRows) => {
      if (groupRows.length <= 1) {
        cleanedRows.push(...groupRows);
        return;
      }

      const statePrecedence = {
        'new_purchase': 1, 'new': 1,
        'on shelf': 2, 'shelf': 2, 'storage': 2, 'in stock': 2,
        'packed for delivery': 3,
        'field': 4,
        'packed for testing': 5,
        'in testing': 6, 'testing': 6,
        'lost': 7,
        'failed rubber': 8, 'destroyed': 8
      };

      const getRank = (assigned) => {
        const a = String(assigned || '').toLowerCase().trim();
        if (statePrecedence[a] !== undefined) return statePrecedence[a];
        if (a.includes('fail') || a.includes('destroy')) return 8;
        if (a.includes('lost')) return 7;
        if (a.includes('test')) return 6;
        if (a.includes('packed') && a.includes('test')) return 5;
        if (a.includes('packed') && a.includes('deliv')) return 3;
        if (a.includes('shelf') || a.includes('stock') || a.includes('stor')) return 2;
        return 4; // Field assignment to employee
      };

      // 1. Identify dates where active employee field assignments exist
      const empAssignmentDates = new Set();
      groupRows.forEach(r => {
        const aVal = r[assignedColName] || r['Assigned To'] || '';
        if (getRank(aVal) === 4) {
          const dStr = normalizeDateStr(r[dateColName] || r['Date Assigned'] || r['Date'] || Object.values(r)[0]);
          if (dStr) empAssignmentDates.add(dStr);
        }
      });

      // 2. Discard 0-day intermediate shelf records on dates where an employee assignment occurred
      const noIntermediateShelf = groupRows.filter((r, idx) => {
        if (idx === 0) return true; // Never discard the item's initial origin record
        const aVal = r[assignedColName] || r['Assigned To'] || '';
        if (getRank(aVal) === 2) {
          const dStr = normalizeDateStr(r[dateColName] || r['Date Assigned'] || r['Date'] || Object.values(r)[0]);
          if (dStr && empAssignmentDates.has(dStr)) {
            removedCount++;
            return false;
          }
        }
        return true;
      });

      // 3. Sort chronologically ascending, tie-breaking by canonical lifecycle state rank
      noIntermediateShelf.sort((a, b) => {
        const tA = parseRowTimestamp(a[dateColName] || a['Date Assigned'] || a['Date'] || Object.values(a)[0]);
        const tB = parseRowTimestamp(b[dateColName] || b['Date Assigned'] || b['Date'] || Object.values(b)[0]);
        if (tA !== tB) return tA - tB;
        return getRank(a[assignedColName] || a['Assigned To']) - getRank(b[assignedColName] || b['Assigned To']);
      });

      // 4. Consecutive same-holder collapse
      const collapsed = [];
      for (let g = 0; g < noIntermediateShelf.length; g++) {
        const cur = noIntermediateShelf[g];
        const curAssigned = String(cur[assignedColName] || cur['Assigned To'] || '').trim().toLowerCase();
        
        if (collapsed.length > 0) {
          const prev = collapsed[collapsed.length - 1];
          const prevAssigned = String(prev[assignedColName] || prev['Assigned To'] || '').trim().toLowerCase();
          const prevRank = getRank(prevAssigned);
          const curRank = getRank(curAssigned);

          const isSameHolder = this.areSameEmployee(curAssigned, prevAssigned);
          const isBothShelf = prevRank === 2 && curRank === 2;

          if (isSameHolder || isBothShelf) {
            removedCount++;
            // Update prev to the later date and merge notes & location
            const curDate = cur[dateColName] || cur['Date Assigned'] || '';
            if (curDate) {
              prev[dateColName] = curDate;
              if (prev['Date Assigned']) prev['Date Assigned'] = curDate;
            }

            // Update assignedTo to the latest assignment spelling if matching
            const origCur = String(cur[assignedColName] || cur['Assigned To'] || '').trim();
            if (origCur && String(prev[assignedColName] || prev['Assigned To'] || '').trim() !== origCur) {
              prev[assignedColName] = origCur;
              if (prev['Assigned To']) prev['Assigned To'] = origCur;
            }

            const pNotes = String(prev[notesColName] || prev['Notes'] || '').trim();
            const cNotes = String(cur[notesColName] || cur['Notes'] || '').trim();
            if (!pNotes && cNotes) {
              prev[notesColName] = cNotes;
              if (prev['Notes']) prev['Notes'] = cNotes;
            } else if (pNotes && cNotes && !pNotes.toLowerCase().includes(cNotes.toLowerCase())) {
              const combined = `${pNotes} | ${cNotes}`;
              prev[notesColName] = combined;
              if (prev['Notes']) prev['Notes'] = combined;
            }

            const pLoc = String(prev[locColName] || prev['Location'] || '').trim();
            const cLoc = String(cur[locColName] || cur['Location'] || '').trim();
            if ((!pLoc || pLoc.toLowerCase() === 'helena') && cLoc && cLoc.toLowerCase() !== 'helena') {
              prev[locColName] = cLoc;
              if (prev['Location']) prev['Location'] = cLoc;
            }
            continue; // Collapsed!
          }
        }
        collapsed.push(cur);
      }
      cleanedRows.push(...collapsed);
    });

    if (removedCount > 0) {
      table.rows = cleanedRows;
      table.rowCount = cleanedRows.length;

      // Re-index _rowIdx for all remaining rows
      table.rows.forEach((r, idx) => {
        r._rowIdx = idx + 2;
      });

      // Rebuild rawGrid to ensure 100% sync
      if (table.headers) {
        table.rawGrid = [
          [...table.headers],
          ...table.rows.map(r => table.headers.map(h => r[h] !== undefined && r[h] !== null ? r[h] : ''))
        ];
        table.maxRows = table.rawGrid.length;
      }

      await this.saveTable(tableKey, table);
    }

    return { removedCount, totalRemaining: table.rows.length, tableKey };
  }

  /**
   * Cleans duplicate history rows across all equipment history tables in a single batch.
   * @returns {Promise<{ totalRemoved: number, tableBreakdown: Record<string, number> }>}
   */
  async cleanAllHistoryDuplicates() {
    const historyTables = [
      'gloves_history',
      'sleeves_history',
      'blankets_history',
      'macks_history',
      'hv_testers_history',
      'phasing_sets_history',
      'aed_history',
      'grounds_history',
      'hot_sticks_history'
    ];

    let totalRemoved = 0;
    const tableBreakdown = {};

    for (const key of historyTables) {
      if (this.getTable(key)) {
        const res = await this.cleanDuplicateHistoryRows(key);
        if (res.removedCount > 0) {
          tableBreakdown[key] = res.removedCount;
          totalRemoved += res.removedCount;
        }
      }
    }

    return { totalRemoved, tableBreakdown };
  }

  async addMutation(mutation) {
    if (!mutation) return null;

    // Discard redundant cell edits where oldValue === value
    if (mutation.action === 'UPDATE_CELL') {
      const normOld = (mutation.oldValue === undefined || mutation.oldValue === null) ? '' : String(mutation.oldValue).trim();
      const normNew = (mutation.value === undefined || mutation.value === null) ? '' : String(mutation.value).trim();
      if (normOld === normNew) {
        return null;
      }

      // If oldValue was not specified, verify against current cell value in local snapshot
      if (mutation.oldValue === undefined && mutation.sheetName && mutation.row && mutation.col) {
        const tableKey = this.getTableKeyForSheet(mutation.sheetName);
        const tbl = tableKey ? this.getTable(tableKey) : null;
        if (tbl && tbl.rawGrid && tbl.rawGrid[mutation.row - 1]) {
          const curCellVal = String(tbl.rawGrid[mutation.row - 1][mutation.col - 1] || '').trim();
          if (curCellVal === normNew) {
            return null; // Cell already contains this value
          }
        }
      }
    }

      // Coalesce / update existing pending cell edit in outbox if present
    if (mutation.action === 'UPDATE_CELL') {
      const existingIdx = this.outbox.findIndex(m => 
        m.action === 'UPDATE_CELL' &&
        m.sheetName === mutation.sheetName &&
        m.row === mutation.row &&
        m.col === mutation.col
      );
      if (existingIdx !== -1) {
        this.outbox[existingIdx].value = mutation.value;
        this.outbox[existingIdx].timestamp = new Date().toISOString();
        await this.applyLocalMutation(mutation);
        if (window.desktopAPI) {
          await window.desktopAPI.saveLocalOutbox(this.outbox);
        } else {
          try { localStorage.setItem('sa_outbox', JSON.stringify(this.outbox)); } catch { /* ignore */ }
        }
        this.schedulePersistSnapshot(this.snapshot, 600);
        this.notify();
        return this.outbox[existingIdx];
      }
    }

    // Coalesce full-table replacements for the same sheet/tableKey
    if (mutation.action === 'REPLACE_SWAP_TABLE' || mutation.action === 'REPLACE_TABLE_DATA' || mutation.action === 'SYNC_FULL_TABLE') {
      const existingIdx = this.outbox.findIndex(m => 
        (m.action === 'REPLACE_SWAP_TABLE' || m.action === 'REPLACE_TABLE_DATA' || m.action === 'SYNC_FULL_TABLE') &&
        (m.sheetName === mutation.sheetName || (m.tableKey && mutation.tableKey && m.tableKey === mutation.tableKey))
      );
      if (existingIdx !== -1) {
        this.outbox[existingIdx] = {
          ...this.outbox[existingIdx],
          ...mutation,
          timestamp: new Date().toISOString()
        };
        await this.applyLocalMutation(mutation);
        if (window.desktopAPI) {
          await window.desktopAPI.saveLocalOutbox(this.outbox);
        } else {
          try { localStorage.setItem('sa_outbox', JSON.stringify(this.outbox)); } catch { /* ignore */ }
        }
        this.schedulePersistSnapshot(this.snapshot, 600);
        this.notify();
        return this.outbox[existingIdx];
      }
    }

    // Coalesce config mutations (SAVE_PLANNED_TRIPS, SAVE_MANUAL_TASKS, SET_HOLIDAYS, SET_TRIP_SCHEDULE)
    if (mutation.action === 'SAVE_PLANNED_TRIPS' || mutation.action === 'SAVE_MANUAL_TASKS' || mutation.action === 'SET_HOLIDAYS' || mutation.action === 'SET_TRIP_SCHEDULE') {
      const existingIdx = this.outbox.findIndex(m => m.action === mutation.action);
      if (existingIdx !== -1) {
        this.outbox[existingIdx] = {
          ...this.outbox[existingIdx],
          ...mutation,
          timestamp: new Date().toISOString()
        };
        await this.applyLocalMutation(mutation);
        if (window.desktopAPI) {
          await window.desktopAPI.saveLocalOutbox(this.outbox);
        } else {
          try { localStorage.setItem('sa_outbox', JSON.stringify(this.outbox)); } catch { /* ignore */ }
        }
        this.schedulePersistSnapshot(this.snapshot, 600);
        this.notify();
        return this.outbox[existingIdx];
      }
    }

    const mutRecord = {
      id: 'mut_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
      timestamp: new Date().toISOString(),
      ...mutation
    };

    this.outbox.push(mutRecord);

    // Apply mutation optimistically to local in-memory snapshot
    await this.applyLocalMutation(mutation);

    if (window.desktopAPI) {
      await window.desktopAPI.saveLocalOutbox(this.outbox);
    } else {
      try { localStorage.setItem('sa_outbox', JSON.stringify(this.outbox)); } catch { /* ignore */ }
    }
    this.schedulePersistSnapshot(this.snapshot, 600);

    this.notify();
    return mutRecord;
  }

  async applyLocalMutation(mut) {
    if (!this.snapshot) return;

    // Config mutations
    if (mut.action === 'SAVE_PLANNED_TRIPS') {
      if (!this.snapshot.configs) this.snapshot.configs = {};
      this.snapshot.configs.plannedTrips = mut.trips;
      return;
    }
    if (mut.action === 'SAVE_MANUAL_TASKS') {
      if (!this.snapshot.configs) this.snapshot.configs = {};
      this.snapshot.configs.manual_tasks = mut.manual_tasks;
      return;
    }
    if (mut.action === 'SET_HOLIDAYS') {
      if (!this.snapshot.configs) this.snapshot.configs = {};
      this.snapshot.configs.holidays = mut.holidays;
      return;
    }
    if (mut.action === 'SET_TRIP_SCHEDULE') {
      if (!this.snapshot.configs) this.snapshot.configs = {};
      this.snapshot.configs.workSchedule = mut.schedule;
      return;
    }

    if (!this.snapshot.tables) return;

    const addMonths = (dateStr, months) => {
      if (!dateStr) return '';
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return '';
      d.setMonth(d.getMonth() + months);
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      const yyyy = d.getFullYear();
      return `${mm}/${dd}/${yyyy}`;
    };

    // Direct cell edit
    if (mut.action === 'UPDATE_CELL') {
      const table = Object.values(this.snapshot.tables).find(t => (t.name && t.name.toLowerCase() === String(mut.sheetName || '').toLowerCase())) || this.snapshot.tables[this.getTableKeyForSheet(mut.sheetName)] || this.snapshot.tables[mut.sheetName];
      const sheetNameLower = (mut.sheetName || '').toLowerCase();

      // 1. If edit is on a Swap Sheet (Glove Swaps, Sleeve Swaps, Blanket Swaps, MACK Swaps)
      if (sheetNameLower.includes('swaps') && table && table.rawGrid) {
        const rowIdx = mut.row - 1;
        const colIdx = mut.col - 1;
        if (table.rawGrid[rowIdx]) {
          table.rawGrid[rowIdx][colIdx] = mut.value;

          // Find the subheader row to get column positions dynamically
          let colPick = -1;
          let colStat = -1;
          let colPickList = -1;

          for (let r = 0; r < Math.min(table.rawGrid.length, 10); r++) {
            const subRow = table.rawGrid[r];
            if (subRow && (subRow[0] === 'Employee' || (subRow[1] && String(subRow[1]).includes('Current')) || (subRow[3] && String(subRow[3]).includes('Current')))) {
              subRow.forEach((cVal, ci) => {
                const s = String(cVal || '').toLowerCase().trim();
                if (s === 'picked' && colPick === -1) colPick = ci;
                else if (s === 'status' && colStat === -1) colStat = ci;
                else if (s.includes('pick list') && colPickList === -1) colPickList = ci;
              });
              break;
            }
          }

          // Fallbacks for standard swap sheets (A=0:Emp, B=1:Current, C=2:Size, D=3:Date, E=4:ChangeOut, F=5:Days, G=6:PickList, H=7:Status, I=8:Picked, J=9:DateChanged)
          if (colPick === -1) colPick = 8;
          if (colStat === -1) colStat = 7;
          if (colPickList === -1) colPickList = 6;

          const headerLower = String(mut.header || '').toLowerCase();
          const isPickedCol = headerLower.includes('picked') || colIdx === colPick;

          const isDateChangedCol = headerLower.includes('changed') || colIdx === 9;

          if (isPickedCol) {
          const empName = String(table.rawGrid[rowIdx][0] || '').trim();
          const oldItemNum = String(table.rawGrid[rowIdx][1] || '').trim();
          const pickItemNum = String(table.rawGrid[rowIdx][colPickList] || '').trim();
          const daysLeft = String(table.rawGrid[rowIdx][5] || '').trim().toUpperCase();

          const isPrevEmpRow = (daysLeft === 'PREV EMP' || daysLeft.includes('PREV'));
          const isLostRow = (daysLeft === 'LOST-LOCATE');

          // Find matching inventory table (gloves, sleeves, blankets, macks)
          let invTableKey = 'gloves';
          if (sheetNameLower.includes('sleeve')) invTableKey = 'sleeves';
          else if (sheetNameLower.includes('blanket')) invTableKey = 'blankets';
          else if (sheetNameLower.includes('mack')) invTableKey = 'macks';
          const invTable = this.snapshot.tables[invTableKey];

          if (isPickedCol) {
            const isChecked = (mut.value === true || mut.value === 'TRUE' || mut.value === 'true');

            if (isPrevEmpRow) {
              // PREVIOUS EMPLOYEE ROW PICKED
              if (colStat !== -1) {
                table.rawGrid[rowIdx][colStat] = isChecked ? 'Ready For Test' : 'Return to Shelf';
              }
              if (invTable && invTable.rows && oldItemNum && oldItemNum !== '—' && oldItemNum !== '-') {
                const oldRow = invTable.rows.find(r => {
                  const itemKeys = Object.keys(r);
                  const firstKey = itemKeys[0] || 'Item #';
                  const iNum = String(r['Item #'] || r['Glove'] || r['Sleeve'] || r['Blanket'] || r['ESL ID'] || r['Serial #'] || r[firstKey] || '').trim();
                  const esl = String(r['ESL ID'] || '').trim();
                  return iNum === oldItemNum || esl === oldItemNum;
                });
                if (oldRow) {
                  if (isChecked) {
                    oldRow['Location'] = "Cody's Truck";
                    oldRow['Status'] = 'Ready For Test';
                    oldRow['Assigned To'] = 'Packed For Testing';
                    oldRow['Picked For'] = '';
                  } else {
                    oldRow['Location'] = 'Previous Employee';
                    oldRow['Status'] = 'Assigned';
                    oldRow['Assigned To'] = empName;
                    oldRow['Picked For'] = '';
                  }
                }
              }
            } else if (isLostRow) {
              if (colStat !== -1) {
                table.rawGrid[rowIdx][colStat] = 'Locate Item 🔍';
              }
            } else {
              // STANDARD SWAP OR CLASS RECLAIM
              if (colStat !== -1) {
                table.rawGrid[rowIdx][colStat] = isChecked ? 'Ready For Delivery 🚚' : 'In Stock ✅';
              }

              if (invTable && invTable.rows && pickItemNum && pickItemNum !== '—' && pickItemNum !== '-') {
                const invRow = invTable.rows.find(r => {
                  const itemKeys = Object.keys(r);
                  const firstKey = itemKeys[0] || 'Item #';
                  const iNum = String(r['Item #'] || r['Glove'] || r['Sleeve'] || r['Blanket'] || r['ESL ID'] || r['Serial #'] || r[firstKey] || '').trim();
                  const esl = String(r['ESL ID'] || '').trim();
                  return iNum === pickItemNum || esl === pickItemNum;
                });

                if (invRow) {
                  const now = new Date();
                  const mm = String(now.getMonth() + 1).padStart(2, '0');
                  const dd = String(now.getDate()).padStart(2, '0');
                  const yyyy = now.getFullYear();
                  const todayFormatted = `${mm}/${dd}/${yyyy}`;
                  const todayIso = `${yyyy}-${mm}-${dd}`;

                  if (isChecked) {
                    invRow['Location'] = "Cody's Truck";
                    invRow['Status'] = 'Ready For Delivery';
                    invRow['Assigned To'] = 'Packed For Delivery';
                    invRow['Date Assigned'] = todayFormatted;
                    invRow['Picked For'] = `${empName} Picked On ${todayIso}`;

                    let months = 12;
                    if (sheetNameLower.includes('glove')) months = 3;
                    else if (sheetNameLower.includes('hot_stick') || sheetNameLower.includes('hot stick')) months = 24;
                    invRow['Change Out Date'] = addMonths(todayFormatted, months);
                  } else {
                    // Stage 5 Revert
                    invRow['Location'] = 'Helena';
                    invRow['Status'] = 'On Shelf';
                    invRow['Assigned To'] = 'On Shelf';
                    invRow['Picked For'] = '';

                    const origDateAssigned = invRow['Date Assigned'] || invRow['Test Date'] || todayFormatted;
                    invRow['Date Assigned'] = origDateAssigned;

                    let months = 12;
                    if (sheetNameLower.includes('hot_stick') || sheetNameLower.includes('hot stick')) months = 24;
                    invRow['Change Out Date'] = addMonths(invRow['Test Date'] || origDateAssigned, months);
                  }
                }
              }
            }
          } else if (isDateChangedCol) {
            const hasDate = (mut.value !== null && mut.value !== undefined && String(mut.value).trim() !== '');

            if (isPrevEmpRow) {
              // PREVIOUS EMPLOYEE ROW DATE CHANGED
              if (colStat !== -1) {
                table.rawGrid[rowIdx][colStat] = hasDate ? 'Packed For Testing' : 'Return to Shelf';
              }
              if (invTable && invTable.rows && oldItemNum && oldItemNum !== '—' && oldItemNum !== '-') {
                const oldRow = invTable.rows.find(r => {
                  const itemKeys = Object.keys(r);
                  const firstKey = itemKeys[0] || 'Item #';
                  const iNum = String(r['Item #'] || r['Glove'] || r['Sleeve'] || r['Blanket'] || r['ESL ID'] || r['Serial #'] || r[firstKey] || '').trim();
                  const esl = String(r['ESL ID'] || '').trim();
                  return iNum === oldItemNum || esl === oldItemNum;
                });
                if (oldRow) {
                  if (hasDate) {
                    oldRow['Location'] = "Cody's Truck";
                    oldRow['Status'] = 'Ready For Test';
                    oldRow['Assigned To'] = 'Packed For Testing';
                    oldRow['Date Assigned'] = String(mut.value);
                    oldRow['Change Out Date'] = addMonths(String(mut.value), 12);
                    oldRow['Picked For'] = '';
                  } else {
                    oldRow['Location'] = "Cody's Truck";
                    oldRow['Status'] = 'Ready For Test';
                    oldRow['Assigned To'] = 'Packed For Testing';
                    oldRow['Date Assigned'] = '';
                    oldRow['Change Out Date'] = '';
                    oldRow['Picked For'] = '';
                  }
                }
              }
            } else {
              // STANDARD SWAP OR CLASS RECLAIM
              if (hasDate) {
                // Update status badge and days left on swap sheet
                if (colStat !== -1) {
                  table.rawGrid[rowIdx][colStat] = 'Assigned';
                }
                if (table.rawGrid[rowIdx][5] !== undefined) {
                  table.rawGrid[rowIdx][5] = 'Assigned';
                }

                // Look up employee location from employees table
                let empLoc = 'Helena';
                const empTable = this.snapshot.tables['employees'];
                if (empTable && empTable.rows) {
                  const emp = empTable.rows.find(e => String(e['Name'] || e['Employee Name'] || '').trim().toLowerCase() === empName.toLowerCase());
                  if (emp && emp['Location']) empLoc = emp['Location'];
                }

                if (invTable && invTable.rows) {
                  const invSheetName = (invTable && invTable.name) ? invTable.name : (this.getSheetNameForTableKey(invTableKey) || invTableKey);

                  // 1. Pick list item -> Assigned
                  if (pickItemNum && pickItemNum !== '—' && pickItemNum !== '-') {
                    const pickRow = invTable.rows.find(r => {
                      const itemKeys = Object.keys(r);
                      const firstKey = itemKeys[0] || 'Item #';
                      const iNum = String(r['Item #'] || r['Glove'] || r['Sleeve'] || r['Blanket'] || r['ESL ID'] || r['Serial #'] || r[firstKey] || '').trim();
                      const esl = String(r['ESL ID'] || '').trim();
                      return iNum === pickItemNum || esl === pickItemNum;
                    });
                    if (pickRow) {
                      pickRow['Location'] = empLoc;
                      pickRow['Status'] = 'Assigned';
                      pickRow['Assigned To'] = empName;
                      pickRow['Date Assigned'] = String(mut.value);
                      pickRow['Picked For'] = ''; // Clear Picked For note!

                      let months = 12;
                      if (sheetNameLower.includes('glove')) {
                        months = empLoc.toLowerCase().includes('northern lights') ? 6 : 3;
                      }
                      pickRow['Change Out Date'] = addMonths(String(mut.value), months);
                      this.syncRowToRawGrid(invTable, pickRow);
                      if (!mut.skipHistory) {
                        await this.recordItemHistoryEvent(invSheetName, pickRow, `Assigned to ${empName}`);
                      }
                    }
                  }

                  // 2. Old item -> Ready For Test
                  if (oldItemNum && oldItemNum !== '—' && oldItemNum !== '-') {
                    const oldRow = invTable.rows.find(r => {
                      const itemKeys = Object.keys(r);
                      const firstKey = itemKeys[0] || 'Item #';
                      const iNum = String(r['Item #'] || r['Glove'] || r['Sleeve'] || r['Blanket'] || r['ESL ID'] || r['Serial #'] || r[firstKey] || '').trim();
                      const esl = String(r['ESL ID'] || '').trim();
                      return iNum === oldItemNum || esl === oldItemNum;
                    });
                    if (oldRow) {
                      oldRow['Location'] = "Cody's Truck";
                      oldRow['Status'] = 'Ready For Test';
                      oldRow['Assigned To'] = 'Packed For Testing';
                      oldRow['Date Assigned'] = String(mut.value);
                      oldRow['Picked For'] = '';

                      let months = 12;
                      if (sheetNameLower.includes('glove')) months = 3;
                      oldRow['Change Out Date'] = addMonths(String(mut.value), months);
                      this.syncRowToRawGrid(invTable, oldRow);
                      if (!mut.skipHistory) {
                        await this.recordItemHistoryEvent(invSheetName, oldRow, `Returned from ${empName} (Swap Completed)`);
                      }
                    }
                  }
                }
              } else {
                // Date Changed cleared -> Revert to Ready For Delivery
                if (colStat !== -1) {
                  table.rawGrid[rowIdx][colStat] = 'Ready For Delivery 🚚';
                }
              }
            }
          }
          }
        }
      }

      // 2. Direct rawGrid and row update for Inventory or Data Sheets (Gloves, Sleeves, Blankets, MACKs, Grounds, etc.)
      if (table && table.rows && table.headers) {
        let row = null;
        const sheetNameLower = (mut.sheetName || table.name || '').toLowerCase();
        const isMultiItemTable = sheetNameLower.includes('history') || sheetNameLower.includes('log') || sheetNameLower.includes('swaps');

        // Only use itemIdentifier alone for primary tables where each item appears exactly once
        if (!isMultiItemTable && mut.itemIdentifier && String(mut.itemIdentifier).trim() !== '') {
          const idClean = String(mut.itemIdentifier).trim().toLowerCase();
          // Priority 1: Exact match on primary item identifier keys
          row = table.rows.find(r => {
            const pk = String(r['Glove'] || r['Sleeve'] || r['Blanket'] || r['MACK'] || r['HVT #'] || r['Phasing Set #'] || r['AED #'] || r['Serial #'] || r['Item #'] || r['Item'] || r['Employee Name'] || r['Name'] || r['Job Number'] || Object.values(r)[0] || '').trim().toLowerCase();
            return pk === idClean;
          });
          // Priority 2: Secondary item/serial fields
          if (!row) {
            row = table.rows.find(r => {
              for (const k in r) {
                const kl = k.toLowerCase();
                if (kl.includes('item') || kl.includes('serial') || kl.includes('glove') || kl.includes('sleeve') || kl.includes('blanket') || kl.includes('mack') || kl.includes('employee') || kl.includes('name')) {
                  if (String(r[k] || '').trim().toLowerCase() === idClean) return true;
                }
              }
              return false;
            });
          }
        }

        // For history/multi-item tables or if not matched by itemIdentifier, match strictly by row index
        if (!row && mut.row) {
          row = table.rows.find(r => r._rowIdx === mut.row);
        }
        if (!row && typeof mut.row === 'number' && mut.row >= 2 && table.rows[mut.row - 2]) {
          row = table.rows[mut.row - 2];
        }

        const colHeader = mut.header || table.headers[mut.col - 1];
        if (row && colHeader) {
          row[colHeader] = mut.value;

          let gridRowIdx = -1;
          if (typeof mut.row === 'number' && mut.row >= 2) {
            gridRowIdx = mut.row - 1;
          } else if (row._rowIdx && row._rowIdx >= 2) {
            gridRowIdx = row._rowIdx - 1;
          }

          if (!isMultiItemTable && gridRowIdx === -1 && mut.itemIdentifier && table.rawGrid) {
            const idClean = String(mut.itemIdentifier).trim().toLowerCase();
            gridRowIdx = table.rawGrid.findIndex((gr, idx) => idx > 0 && String(gr[0] || '').trim().toLowerCase() === idClean);
          }
          if (gridRowIdx !== -1 && table.rawGrid && table.rawGrid[gridRowIdx]) {
            const colIdx = (typeof mut.col === 'number' && mut.col >= 1) ? (mut.col - 1) : table.headers.indexOf(colHeader);
            if (colIdx !== -1) {
              table.rawGrid[gridRowIdx][colIdx] = mut.value;
            }
          }

          const hLower = colHeader.toLowerCase();

          // A. If Assigned To was edited
          if (hLower === 'assigned to' || hLower.includes('assigned to')) {
            const assignedName = String(mut.value || '').trim();
            const assignedLower = assignedName.toLowerCase();

            let newStatus = '';
            let newLocation = '';

            if (assignedLower === 'on shelf') {
              newStatus = 'On Shelf';
              newLocation = 'Helena';
              row['Picked For'] = '';
            } else if (assignedLower === 'packed for delivery') {
              newStatus = 'Ready For Delivery';
              newLocation = "Cody's Truck";
            } else if (assignedLower === 'packed for testing') {
              newStatus = 'Ready For Test';
              newLocation = "Cody's Truck";
            } else if (assignedLower === 'in testing') {
              newStatus = 'In Testing';
              newLocation = 'Arnett / JM Test';
            } else if (assignedLower === 'failed rubber' || assignedLower === 'not repairable') {
              newStatus = 'Failed Rubber';
              newLocation = 'Destroyed';
              row['Change Out Date'] = 'N/A';
            } else if (assignedLower === 'lost') {
              newStatus = 'Lost';
              newLocation = 'Lost';
              row['Change Out Date'] = 'N/A';
            } else if (assignedName) {
              newStatus = 'Assigned';
              // Look up employee location from employees table
              const empTable = this.snapshot.tables['employees'];
              if (empTable && empTable.rows) {
                const emp = empTable.rows.find(e => {
                  const nameVal = String(e['Name'] || e['Employee Name'] || e['Employee'] || Object.values(e)[0] || '').trim().toLowerCase();
                  return nameVal === assignedLower;
                });
                if (emp) {
                  for (const k of Object.keys(emp)) {
                    if (k.toLowerCase().includes('location')) {
                      let rawL = String(emp[k] || '').trim();
                      if (rawL.includes('(') && rawL.includes(')')) {
                        rawL = rawL.replace(/\s*\([^)]*\)/, '').trim();
                      }
                      newLocation = rawL;
                      break;
                    }
                  }
                }
              }
              if (!newLocation) newLocation = 'Helena';

              // Calculate Change Out Date if Date Assigned exists
              const dateAssigned = row['Date Assigned'] || row['Calibration Date'] || row['Test Date'];
              if (dateAssigned) {
                let months = 12;
                if (sheetNameLower.includes('glove')) {
                  months = newLocation.toLowerCase().includes('northern lights') ? 6 : 3;
                } else if (sheetNameLower.includes('hot_stick') || sheetNameLower.includes('hot stick')) {
                  months = 24;
                }
                row['Change Out Date'] = addMonths(dateAssigned, months);
              }
            }

            if (newStatus) {
              row['Status'] = newStatus;
              if (table.rawGrid && table.rawGrid[mut.row - 1]) {
                const statColIdx = table.headers.findIndex(h => h.toLowerCase().includes('status'));
                if (statColIdx !== -1) table.rawGrid[mut.row - 1][statColIdx] = newStatus;
              }
            }
            if (newLocation) {
              row['Location'] = newLocation;
              if (table.rawGrid && table.rawGrid[mut.row - 1]) {
                const locColIdx = table.headers.findIndex(h => h.toLowerCase().includes('location'));
                if (locColIdx !== -1) table.rawGrid[mut.row - 1][locColIdx] = newLocation;
              }
            }
            if (row['Change Out Date'] && table.rawGrid && table.rawGrid[mut.row - 1]) {
              const chgColIdx = table.headers.findIndex(h => h.toLowerCase().includes('change out'));
              if (chgColIdx !== -1) table.rawGrid[mut.row - 1][chgColIdx] = row['Change Out Date'];
            }
          }

          // B. If Status was edited directly
          if (hLower === 'status' || hLower === 'item status') {
            const statusVal = String(mut.value || '').trim();
            const statusLower = statusVal.toLowerCase();

            if (statusLower === 'on shelf') {
              row['Assigned To'] = 'On Shelf';
              row['Location'] = 'Helena';
              row['Picked For'] = '';
            } else if (statusLower === 'ready for delivery') {
              row['Assigned To'] = 'Packed For Delivery';
              row['Location'] = "Cody's Truck";
            } else if (statusLower === 'ready for test') {
              row['Assigned To'] = 'Packed For Testing';
              row['Location'] = "Cody's Truck";
            } else if (statusLower === 'in testing') {
              row['Assigned To'] = 'In Testing';
              row['Location'] = 'Arnett / JM Test';
            } else if (statusLower === 'failed rubber' || statusLower === 'not repairable') {
              row['Assigned To'] = 'Failed Rubber';
              row['Location'] = 'Destroyed';
              row['Change Out Date'] = 'N/A';
            } else if (statusLower === 'lost') {
              row['Assigned To'] = 'Lost';
              row['Location'] = 'Lost';
              row['Change Out Date'] = 'N/A';
            }

            // If item is no longer Lost, clear LOST-LOCATE notes and remove from companion swap sheet table
            const statLower = String(row['Status'] || '').toLowerCase();
            const assignedLower = String(row['Assigned To'] || '').toLowerCase();
            if (statLower !== 'lost' && assignedLower !== 'lost') {
              if (row['Notes'] && (row['Notes'].toUpperCase().includes('LOST-LOCATE') || row['Notes'].toUpperCase().includes('LOST LOCATE') || row['Notes'].toUpperCase() === 'LOCATE')) {
                row['Notes'] = '';
              }
              const swapSheetKey = sheetNameLower.includes('glove') ? 'glove_swaps' :
                                  sheetNameLower.includes('sleeve') ? 'sleeve_swaps' :
                                  sheetNameLower.includes('blanket') ? 'blanket_swaps' :
                                  sheetNameLower.includes('mack') ? 'mack_swaps' : null;
              if (swapSheetKey && this.snapshot.tables[swapSheetKey]) {
                const swTable = this.snapshot.tables[swapSheetKey];
                const itemKeys = Object.keys(row);
                const firstKey = itemKeys[0] || 'Item #';
                const iNum = String(row['Item #'] || row['Glove'] || row['Sleeve'] || row['Blanket'] || row['ESL ID'] || row['Serial #'] || row[firstKey] || '').trim();
                if (swTable.rawGrid && iNum) {
                  swTable.rawGrid = swTable.rawGrid.filter(rArr => {
                    const curItem = String(rArr[1] || '').trim();
                    const daysLeft = String(rArr[5] || '').trim().toUpperCase();
                    return !(curItem === iNum && (daysLeft === 'LOST-LOCATE' || daysLeft.includes('LOST')));
                  });
                }
              }
            }
          }

          // C. If Date Assigned / Test Date / Calibration Date / Pad Expiration was edited
          if (hLower.includes('date assigned') || hLower.includes('calibration') || hLower.includes('test date') || hLower.includes('pad expiration') || hLower.includes('battery expiration')) {
            const tableKey = this.getTableKeyForSheet(sheetNameLower);
            const isInv = ['gloves', 'sleeves', 'blankets', 'macks', 'hv_testers', 'phasing_sets', 'aed', 'grounds', 'hot_sticks'].includes(tableKey);

            if (isInv) {
              const dAssigned = row['Date Assigned'] || '';
              const tDate = row['Test Date'] || row['Date Tested'] || row['Calibration Date'] || '';
              const padExp = row['Pad Expiration'] || '';
              const batExp = row['Battery Expiration'] || '';
              const loc = row['Location'] || '';
              const assignedTo = row['Assigned To'] || '';

              let newChgOut = '';
              if (window.inventoryManager && typeof window.inventoryManager.calculateChangeOutDate === 'function') {
                newChgOut = window.inventoryManager.calculateChangeOutDate(
                  dAssigned || tDate || padExp, loc, assignedTo, tableKey, {
                    testDate: tDate,
                    calibrationDate: row['Calibration Date'] || tDate,
                    padExpiration: padExp,
                    batteryExpiration: batExp
                  }
                );
              } else {
                const dateAssigned = dAssigned || tDate || mut.value;
                if (dateAssigned) {
                  let months = 12;
                  if (sheetNameLower.includes('glove')) {
                    months = loc.toLowerCase().includes('northern lights') ? 6 : 3;
                  } else if (sheetNameLower.includes('hot_stick') || sheetNameLower.includes('hot stick')) {
                    months = 24;
                  }
                  newChgOut = addMonths(dateAssigned, months);
                }
              }

              if (newChgOut && newChgOut !== 'N/A') {
                row['Change Out Date'] = newChgOut;
                let chgGridIdx = (row._rowIdx && row._rowIdx >= 2) ? (row._rowIdx - 1) : (typeof mut.row === 'number' ? mut.row - 1 : -1);
                if (chgGridIdx !== -1 && table.rawGrid && table.rawGrid[chgGridIdx]) {
                  const chgColIdx = table.headers.findIndex(h => h.toLowerCase().includes('change out'));
                  if (chgColIdx !== -1) table.rawGrid[chgGridIdx][chgColIdx] = newChgOut;
                }
              }
            }
          }

          // D. If status, location, or assigned to changed on an inventory sheet, auto-record history transition
          if (!mut.skipHistory) {
            if (hLower === 'status' || hLower === 'item status' || hLower === 'assigned to' || hLower.includes('assigned to') || hLower === 'location') {
              const sAssigned = String(row['Assigned To'] || '').trim().toLowerCase();
              const sStatus = String(row['Status'] || '').trim().toLowerCase();
              // Guard against intermediate multi-cell states (e.g. status changed to Assigned while holder is still On Shelf)
              const isTransitional = (sStatus === 'assigned' && sAssigned === 'on shelf') ||
                                     (sStatus === 'on shelf' && sAssigned && !['on shelf', '', 'unassigned'].includes(sAssigned));
              if (!isTransitional) {
                const reason = (row['Status'] === 'Failed Rubber' || row['Assigned To'] === 'Failed Rubber') ? 'Failed Rubber' :
                               (row['Status'] === 'Lost' || row['Assigned To'] === 'Lost') ? 'Lost' :
                               (row['Status'] === 'In Testing' || row['Assigned To'] === 'In Testing') ? 'In Testing' :
                               row['Notes'] || '';
                await this.recordItemHistoryEvent(table.name, row, reason);
              }
            }
          }
        }
      }
    }

    // Row update by key
    if (mut.action === 'UPDATE_ROW_BY_KEY') {
      const table = Object.values(this.snapshot.tables).find(t => t.name === mut.sheetName);
      if (table && table.rows) {
        const row = table.rows.find(r => String(r[mut.keyColName] || '').trim() === String(mut.keyValue || '').trim());
        if (row && mut.updates) {
          Object.assign(row, mut.updates);
        }
      }
    }

    // Task deletion / dismissal
    if (mut.action === 'DELETE_TASK') {
      const taskTable = this.snapshot.tables['task_metadata'];
      if (taskTable) {
        if (taskTable.rows) {
          const idx = taskTable.rows.findIndex(t => 
            String(t['TaskID'] || t['Task ID'] || t['id'] || '').trim() === String(mut.taskId || '').trim() ||
            String(t['SourceSheet'] + '_' + t['SourceRow']) === String(mut.taskId || '').trim()
          );
          if (idx !== -1) {
            taskTable.rows.splice(idx, 1);
          }
        }
        if (taskTable.rawGrid && taskTable.headers) {
          const idColIdx = taskTable.headers.findIndex(h => String(h || '').toLowerCase().includes('task'));
          const targetCol = idColIdx !== -1 ? idColIdx : 0;
          for (let r = 1; r < taskTable.rawGrid.length; r++) {
            const rowId = String(taskTable.rawGrid[r][targetCol] || '').trim();
            if (rowId === String(mut.taskId || '').trim()) {
              taskTable.rawGrid.splice(r, 1);
              break;
            }
          }
        }
      }

      this.addDismissedTask(mut.taskId);
    }

    // Task completion
    if (mut.action === 'SET_TASK_STATUS') {
      if (mut.taskId && String(mut.status || '').toLowerCase() === 'complete') {
        this.addDismissedTask(mut.taskId);
      }
      const taskTable = this.snapshot.tables['task_metadata'];
      if (taskTable) {
        if (taskTable.rows) {
          const task = taskTable.rows.find(t => 
            String(t['TaskID'] || t['Task ID'] || t['id'] || '').trim() === String(mut.taskId || '').trim()
          );
          if (task) {
            task['Status'] = mut.status || 'Complete';
            task['CompletedDate'] = mut.completedDate || new Date().toISOString().split('T')[0];
            task['Completed Date'] = mut.completedDate || new Date().toISOString().split('T')[0];
          }
        }
        if (taskTable.rawGrid && taskTable.headers) {
          const statusColIdx = taskTable.headers.findIndex(h => String(h || '').toLowerCase().trim() === 'status');
          const idColIdx = taskTable.headers.findIndex(h => String(h || '').toLowerCase().includes('task'));
          if (statusColIdx !== -1) {
            for (let r = 1; r < taskTable.rawGrid.length; r++) {
              const rowId = String(taskTable.rawGrid[r][idColIdx !== -1 ? idColIdx : 0] || '').trim();
              if (rowId === String(mut.taskId || '').trim()) {
                taskTable.rawGrid[r][statusColIdx] = mut.status || 'Complete';
                break;
              }
            }
          }
        }
      }
    }

    // Add Row mutation replay
    if (mut.action === 'ADD_ROW' && mut.rowData) {
      const table = Object.values(this.snapshot.tables).find(t => t.name === mut.sheetName) || this.snapshot.tables[mut.tableKey];
      if (table) {
        if (!table.rows) table.rows = [];
        if (!table.rawGrid) table.rawGrid = [table.headers || Object.keys(mut.rowData)];
        
        const isHistoryTable = (mut.tableKey && mut.tableKey.endsWith('_history')) ||
                               (mut.sheetName && mut.sheetName.toLowerCase().includes('history'));

        let exists = false;
        if (isHistoryTable) {
          const mDate = String(mut.rowData['Date Assigned'] || mut.rowData['Date'] || Object.values(mut.rowData)[0] || '').trim();
          const mAssigned = String(mut.rowData['Assigned To'] || '').trim().toLowerCase();
          const mItem = String(mut.rowData['Item #'] || mut.rowData['Serial #'] || Object.values(mut.rowData)[1] || '').trim().toLowerCase();
          exists = table.rows.some(r => {
            const rDate = String(r['Date Assigned'] || r['Date'] || Object.values(r)[0] || '').trim();
            const rAssigned = String(r['Assigned To'] || '').trim().toLowerCase();
            const rItem = String(r['Item #'] || r['Serial #'] || Object.values(r)[1] || '').trim().toLowerCase();
            return rItem === mItem && rDate === mDate && rAssigned === mAssigned;
          });
        } else {
          // Find item identifier for primary key tables
          const firstKey = Object.keys(mut.rowData)[0] || 'Item #';
          const itemIdentifier = String(mut.rowData['Item #'] || mut.rowData['Glove'] || mut.rowData['Sleeve'] || mut.rowData['Blanket'] || mut.rowData['Serial #'] || mut.rowData['ESL ID'] || mut.rowData[firstKey] || '').trim();
          
          exists = table.rows.some(r => {
            const rKey = String(r['Item #'] || r['Glove'] || r['Sleeve'] || r['Blanket'] || r['Serial #'] || r['ESL ID'] || Object.values(r)[0] || '').trim();
            return rKey === itemIdentifier;
          });
        }

        if (!exists) {
          table.rows.unshift({ ...mut.rowData });
          table.rowCount = table.rows.length;
          const gridRow = table.headers.map(h => mut.rowData[h] !== undefined ? mut.rowData[h] : '');
          table.rawGrid.splice(1, 0, gridRow);
          table.maxRows = table.rawGrid.length;
        }
      }
    }

    // Delete Row mutation replay
    if (mut.action === 'DELETE_ROW') {
      const table = Object.values(this.snapshot.tables).find(t => t.name === mut.sheetName) || this.snapshot.tables[mut.tableKey];
      if (table) {
        if (mut.rowData) {
          const mDate = String(mut.rowData['Date Assigned'] || mut.rowData['Date'] || Object.values(mut.rowData)[0] || '').trim();
          const mAssigned = String(mut.rowData['Assigned To'] || '').trim().toLowerCase();
          const mItem = String(mut.rowData['Item #'] || mut.rowData['Serial #'] || Object.values(mut.rowData)[1] || '').trim().toLowerCase();
          const mNotes = String(mut.rowData['Notes'] || mut.rowData['Note'] || '').trim();

          if (table.rows) {
            const rowIdx = table.rows.findIndex(r => {
              const rDate = String(r['Date Assigned'] || r['Date'] || Object.values(r)[0] || '').trim();
              const rAssigned = String(r['Assigned To'] || '').trim().toLowerCase();
              const rItem = String(r['Item #'] || r['Serial #'] || Object.values(r)[1] || '').trim().toLowerCase();
              const rNotes = String(r['Notes'] || r['Note'] || '').trim();
              return (!mItem || rItem === mItem) && (!mDate || rDate === mDate) && (!mAssigned || rAssigned === mAssigned) && (!mNotes || rNotes === mNotes);
            });
            if (rowIdx !== -1) {
              table.rows.splice(rowIdx, 1);
              table.rowCount = table.rows.length;
            }
          }
          if (table.rawGrid) {
            const gIdx = table.rawGrid.findIndex((gr, idx) => {
              if (idx === 0) return false;
              const grStr = gr.map(c => String(c || '').trim().toLowerCase());
              return (!mItem || grStr.includes(mItem)) && (!mDate || grStr.includes(mDate.toLowerCase())) && (!mAssigned || grStr.includes(mAssigned));
            });
            if (gIdx > 0) {
              table.rawGrid.splice(gIdx, 1);
              table.maxRows = table.rawGrid.length;
            }
          }
        } else if (mut.itemIdentifier) {
          const idLower = String(mut.itemIdentifier).trim().toLowerCase();
          if (table.rows) {
            const rowIdx = table.rows.findIndex(r => {
              return Object.values(r).some(val => String(val || '').trim().toLowerCase() === idLower);
            });
            if (rowIdx !== -1) {
              table.rows.splice(rowIdx, 1);
              table.rowCount = table.rows.length;
            }
          }
          if (table.rawGrid) {
            table.rawGrid = table.rawGrid.filter((gr, idx) => {
              if (idx === 0) return true;
              return !gr.some(cell => String(cell || '').trim().toLowerCase() === idLower);
            });
            table.maxRows = table.rawGrid.length;
          }
        }
      }
    }

    // Replace Table Data / Swap Table mutation replay
    if ((mut.action === 'REPLACE_TABLE_DATA' || mut.action === 'REPLACE_SWAP_TABLE') && this.snapshot && this.snapshot.tables) {
      const tableKey = mut.tableKey || this.getTableKeyForSheet(mut.sheetName);
      if (tableKey) {
        this.snapshot.tables[tableKey] = {
          name: mut.sheetName || this.getSheetNameForTableKey(tableKey) || tableKey,
          headers: mut.headers || [],
          rows: mut.rows || [],
          rawGrid: mut.rawGrid || [],
          rowCount: (mut.rows && mut.rows.length) || 0,
          maxRows: (mut.rawGrid && mut.rawGrid.length) || 0,
          maxCols: (mut.headers && mut.headers.length) || 0,
          _normalized: true
        };
      }
    }
  }

  isTaskDismissed(taskId) {
    if (!taskId) return false;
    if (!this.dismissedTaskIds) {
      this.dismissedTaskIds = new Set();
      const saved = localStorage.getItem('sa_dismissed_tasks');
      if (saved) {
        try {
          JSON.parse(saved).forEach(id => {
            const s = String(id).trim();
            this.dismissedTaskIds.add(s);
            this.dismissedTaskIds.add(s.toLowerCase());
          });
        } catch { /* ignore */ }
      }
    }
    const cleanId = String(taskId).trim();
    return this.dismissedTaskIds.has(cleanId) || this.dismissedTaskIds.has(cleanId.toLowerCase());
  }

  addDismissedTask(taskId) {
    if (!taskId) return;
    if (!this.dismissedTaskIds) {
      this.dismissedTaskIds = new Set();
      const saved = localStorage.getItem('sa_dismissed_tasks');
      if (saved) {
        try {
          JSON.parse(saved).forEach(id => {
            const s = String(id).trim();
            this.dismissedTaskIds.add(s);
            this.dismissedTaskIds.add(s.toLowerCase());
          });
        } catch { /* ignore */ }
      }
    }
    const cleanId = String(taskId).trim();
    this.dismissedTaskIds.add(cleanId);
    this.dismissedTaskIds.add(cleanId.toLowerCase());
    try {
      localStorage.setItem('sa_dismissed_tasks', JSON.stringify(Array.from(this.dismissedTaskIds)));
    } catch { /* ignore */ }
  }

  async clearOutbox() {
    this.outbox = [];
    if (window.desktopAPI) {
      await window.desktopAPI.saveLocalOutbox([]);
    } else {
      localStorage.removeItem('sa_outbox');
    }
    this.notify();
  }

  subscribe(callback) {
    this.listeners.push(callback);
  }

  notify() {
    this.listeners.forEach(cb => cb(this.snapshot, this.outbox));
  }
}

window.localDB = new LocalDatabase();
