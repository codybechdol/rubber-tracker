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
      } catch (e) {
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
      } catch (e) {
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
      } catch (e) {
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
      } catch (e) {
        resolve(false);
      }
    });
  }
}

class LocalDatabase {
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
            try { localStorage.removeItem('sa_snapshot'); } catch (e) {}
          }
        } catch (e) {
          console.warn('Could not read/migrate from localStorage:', e);
        }
      }

      this.snapshot = loadedSnapshot;

      try {
        const storedOutbox = localStorage.getItem('sa_outbox');
        if (storedOutbox) this.outbox = JSON.parse(storedOutbox);
      } catch (e) {
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
      this.normalizeSnapshot(snapshot);
    }
    this.snapshot = snapshot;
    await this.persistSnapshot(snapshot);
    this.notify();
  }

  async persistSnapshot(snapshot = this.snapshot) {
    if (!snapshot) return;
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
        try { localStorage.removeItem('sa_snapshot'); } catch (e) {}
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

  getPlannedTrips() {
    let trips = {};
    const stored = localStorage.getItem('sa_planned_trips');
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        if (parsed && typeof parsed === 'object' && Object.keys(parsed).length > 0) {
          trips = { ...parsed };
        }
      } catch (e) {}
    }
    if (this.snapshot && this.snapshot.configs && this.snapshot.configs.plannedTrips) {
      const snapTrips = this.snapshot.configs.plannedTrips;
      if (snapTrips && typeof snapTrips === 'object' && Object.keys(snapTrips).length > 0) {
        trips = { ...trips, ...snapTrips };
      }
    }
    return trips;
  }

  async savePlannedTrips(trips) {
    if (!this.snapshot) this.snapshot = { configs: {}, tables: {} };
    if (!this.snapshot.configs) this.snapshot.configs = {};
    this.snapshot.configs.plannedTrips = trips;
    try {
      localStorage.setItem('sa_planned_trips', JSON.stringify(trips));
    } catch (e) {}
    if (window.desktopAPI) {
      await window.desktopAPI.saveLocalSnapshot(this.snapshot);
    }
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
    return snapshot;
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
    if (!table._headersNormalized) {
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
    const location = String(itemRow['Location'] || 'Helena').trim();
    const notes = reasonNote || itemRow['Notes'] || '';

    // Check if the latest history entry for this item already has the identical assignedTo and location
    if (histTable.rows && histTable.rows.length > 0) {
      const isNum = /^\d+$/.test(itemNum);
      const parsedNum = isNum ? parseInt(itemNum, 10) : null;
      const latest = histTable.rows.find(r => {
        const rNum = String(r['Item #'] || r['Model'] || r['Serial #'] || Object.values(r)[1] || Object.values(r)[0] || '').trim();
        if (rNum.toLowerCase() === itemNum.toLowerCase()) return true;
        if (isNum && /^\d+$/.test(rNum) && parseInt(rNum, 10) === parsedNum) return true;
        return false;
      });
      if (latest) {
        const lAssigned = String(latest['Assigned To'] || latest['Status'] || '').trim().toLowerCase();
        const lLoc = String(latest['Location'] || '').trim().toLowerCase();
        if (lAssigned === assignedTo.toLowerCase() && lLoc === location.toLowerCase()) {
          return; // Already recorded
        }
      }
    }

    const histRow = {
      'Date Assigned': itemRow['Date Assigned'] || todayStr,
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
          return rDate === oDate && rItem === oItem && rAssigned === oAssigned && (oNotes ? rNotes === oNotes : true);
        });
      }
    }

    if (rowIdx === -1) return false;

    const removedRow = table.rows.splice(rowIdx, 1)[0];
    table.rowCount = table.rows.length;

    // Remove from rawGrid as well
    if (table.rawGrid) {
      const oDate = String(removedRow['Date Assigned'] || removedRow['Date'] || '').trim();
      const oItem = String(removedRow['Item #'] || removedRow['Item'] || removedRow['Serial #'] || '').trim();
      const oAssigned = String(removedRow['Assigned To'] || '').trim();

      const gridIdx = table.rawGrid.findIndex((gr, idx) => {
        if (idx === 0) return false;
        const grDate = String(gr[0] || '').trim();
        const grItem = String(gr[1] || '').trim();
        const grAssigned = String(gr[5] || gr[4] || gr[3] || '').trim();
        return (oDate ? grDate === oDate : true) && (oItem ? grItem === oItem : true);
      });
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
      _normalized: true
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

    this.notify();
    return this.snapshot.tables[tableKey];
  }

  async addMutation(mutation) {
    if (!mutation) return null;

    // Discard redundant cell edits where oldValue === value
    if (mutation.action === 'UPDATE_CELL' && mutation.oldValue !== undefined && mutation.oldValue === mutation.value) {
      return null;
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
          try { localStorage.setItem('sa_outbox', JSON.stringify(this.outbox)); } catch (e) {}
        }
        await this.persistSnapshot(this.snapshot);
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
          try { localStorage.setItem('sa_outbox', JSON.stringify(this.outbox)); } catch (e) {}
        }
        await this.persistSnapshot(this.snapshot);
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
      try { localStorage.setItem('sa_outbox', JSON.stringify(this.outbox)); } catch (e) {}
    }
    await this.persistSnapshot(this.snapshot);

    this.notify();
    return mutRecord;
  }

  async applyLocalMutation(mut) {
    if (!this.snapshot || !this.snapshot.tables) return;

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
        if (mut.itemIdentifier && String(mut.itemIdentifier).trim() !== '') {
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
        if (!row && mut.row) {
          row = table.rows.find(r => r._rowIdx === mut.row);
        }
        if (!row && typeof mut.row === 'number' && mut.row >= 2 && table.rows[mut.row - 2]) {
          row = table.rows[mut.row - 2];
        }

        const colHeader = mut.header || table.headers[mut.col - 1];
        if (row && colHeader) {
          row[colHeader] = mut.value;

          let gridRowIdx = (row._rowIdx && row._rowIdx >= 2) ? (row._rowIdx - 1) : -1;
          if (gridRowIdx === -1 && mut.itemIdentifier && table.rawGrid) {
            const idClean = String(mut.itemIdentifier).trim().toLowerCase();
            gridRowIdx = table.rawGrid.findIndex((gr, idx) => idx > 0 && String(gr[0] || '').trim().toLowerCase() === idClean);
          }
          if (gridRowIdx === -1 && typeof mut.row === 'number' && mut.row >= 2) {
            gridRowIdx = mut.row - 1;
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
          if (hLower === 'status' || hLower === 'item status' || hLower === 'assigned to' || hLower.includes('assigned to') || hLower === 'location') {
            const reason = (row['Status'] === 'Failed Rubber' || row['Assigned To'] === 'Failed Rubber') ? 'Failed Rubber' :
                           (row['Status'] === 'Lost' || row['Assigned To'] === 'Lost') ? 'Lost' :
                           (row['Status'] === 'In Testing' || row['Assigned To'] === 'In Testing') ? 'In Testing' :
                           row['Notes'] || '';
            await this.recordItemHistoryEvent(table.name, row, reason);
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
        
        // Find item identifier
        const firstKey = Object.keys(mut.rowData)[0] || 'Item #';
        const itemIdentifier = String(mut.rowData['Item #'] || mut.rowData['Glove'] || mut.rowData['Sleeve'] || mut.rowData['Blanket'] || mut.rowData['Serial #'] || mut.rowData['ESL ID'] || mut.rowData[firstKey] || '').trim();
        
        const exists = table.rows.some(r => {
          const rKey = String(r['Item #'] || r['Glove'] || r['Sleeve'] || r['Blanket'] || r['Serial #'] || r['ESL ID'] || Object.values(r)[0] || '').trim();
          return rKey === itemIdentifier;
        });

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
    if (mut.action === 'DELETE_ROW' && mut.itemIdentifier) {
      const table = Object.values(this.snapshot.tables).find(t => t.name === mut.sheetName) || this.snapshot.tables[mut.tableKey];
      if (table) {
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
        } catch (e) {}
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
        } catch (e) {}
      }
    }
    const cleanId = String(taskId).trim();
    this.dismissedTaskIds.add(cleanId);
    this.dismissedTaskIds.add(cleanId.toLowerCase());
    try {
      localStorage.setItem('sa_dismissed_tasks', JSON.stringify(Array.from(this.dismissedTaskIds)));
    } catch (e) {}
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
