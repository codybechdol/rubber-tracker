/**
 * history.js - History Workspaces & Record Grid for Desktop App
 * Provides dedicated offline viewing, filtering, and sorting for all equipment and employee history sheets.
 */

class HistoryNavigator {
  constructor(db) {
    this.db = db;
    this.currentSheetKey = 'gloves_history';
    this.searchTerm = '';
    this.sortCol = null;
    this.sortDir = 'asc';
    this.multiSort = null;

    this.sheetList = [
      { key: 'gloves_history', label: '🧤 Gloves History', icon: '🧤' },
      { key: 'sleeves_history', label: '🦺 Sleeves History', icon: '🦺' },
      { key: 'blankets_history', label: '🧱 Blankets History', icon: '🧱' },
      { key: 'macks_history', label: '🧱 MACKs History', icon: '🧱' },
      { key: 'hv_testers_history', label: '⚡ HV Testers History', icon: '⚡' },
      { key: 'phasing_sets_history', label: '⚡ Phasing Sets History', icon: '⚡' },
      { key: 'aed_history', label: '🏥 AED History', icon: '🏥' },
      { key: 'grounds_history', label: '⚡ Grounds History', icon: '⚡' },
      { key: 'hot_sticks_history', label: '🔴 Hot Sticks History', icon: '🔴' },
      { key: 'employee_history', label: '👥 Employee History', icon: '👥' }
    ];
  }

  init() {
    this.renderTabsBar();
    this.setupSearch();
    this.renderCurrentHistory();
  }

  renderTabsBar() {
    const bar = document.getElementById('history-tabs-bar');
    if (!bar) return;
    bar.innerHTML = '';

    this.sheetList.forEach(sheet => {
      const btn = document.createElement('button');
      btn.className = 'sheet-tab-btn' + (sheet.key === this.currentSheetKey ? ' active' : '');
      btn.innerHTML = `<span>${sheet.icon}</span> ${sheet.label.replace(/^.*? /, '')}`;
      btn.onclick = () => {
        this.currentSheetKey = sheet.key;
        this.sortCol = null;
        this.multiSort = null;
        this.sortDir = 'asc';
        this.renderTabsBar();
        this.renderCurrentHistory();
      };
      bar.appendChild(btn);
    });
  }

  setupSearch() {
    const input = document.getElementById('history-search-input');
    if (!input) return;
    input.addEventListener('input', (e) => {
      this.searchTerm = e.target.value.toLowerCase().trim();
      this.renderCurrentHistory();
    });
  }

  setSort(colName) {
    if (this.sortCol === colName) {
      this.sortDir = this.sortDir === 'asc' ? 'desc' : 'asc';
    } else {
      this.sortCol = colName;
      this.sortDir = 'asc';
    }
    this.multiSort = null;
    this.renderCurrentHistory();
  }

  setPresetSort(type) {
    const tableData = this.db.getTable(this.currentSheetKey);
    const headers = tableData ? (tableData.headers || []) : [];

    const findCol = (candidates) => {
      for (const c of candidates) {
        const cLower = c.toLowerCase();
        const found = headers.find(h => {
          const hLower = String(h || '').toLowerCase().trim();
          return hLower === cLower || hLower.startsWith(cLower) || hLower.includes(cLower);
        });
        if (found) return found;
      }
      return candidates[0];
    };

    if (type === 'itemNum') {
      const col = findCol(['item #', 'item', 'serial #', 'glove', 'sleeve', 'blanket', 'mack']);
      if (this.sortCol === col) {
        this.sortDir = this.sortDir === 'asc' ? 'desc' : 'asc';
      } else {
        this.sortCol = col;
        this.sortDir = 'asc';
      }
      this.multiSort = null;
    } else if (type === 'dateAssigned') {
      const col = findCol(['date assigned', 'date', 'action date']);
      if (this.sortCol === col) {
        this.sortDir = this.sortDir === 'asc' ? 'desc' : 'asc';
      } else {
        this.sortCol = col;
        this.sortDir = 'desc'; // Dates default to newest first on click
      }
      this.multiSort = null;
    } else if (type === 'size') {
      const col = findCol(['size']);
      if (this.sortCol === col) {
        this.sortDir = this.sortDir === 'asc' ? 'desc' : 'asc';
      } else {
        this.sortCol = col;
        this.sortDir = 'asc';
      }
      this.multiSort = null;
    } else if (type === 'class') {
      const col = findCol(['class']);
      if (this.sortCol === col) {
        this.sortDir = this.sortDir === 'asc' ? 'desc' : 'asc';
      } else {
        this.sortCol = col;
        this.sortDir = 'asc';
      }
      this.multiSort = null;
    } else if (type === 'location') {
      const col = findCol(['location']);
      if (this.sortCol === col) {
        this.sortDir = this.sortDir === 'asc' ? 'desc' : 'asc';
      } else {
        this.sortCol = col;
        this.sortDir = 'asc';
      }
      this.multiSort = null;
    } else if (type === 'assignedTo') {
      const col = findCol(['assigned to', 'employee name', 'employee', 'assigned']);
      if (this.sortCol === col) {
        this.sortDir = this.sortDir === 'asc' ? 'desc' : 'asc';
      } else {
        this.sortCol = col;
        this.sortDir = 'asc';
      }
      this.multiSort = null;
    }
    this.renderCurrentHistory();
  }

  renderCurrentHistory() {
    const container = document.getElementById('history-grid-container');
    const title = document.getElementById('current-history-title');
    const countBadge = document.getElementById('history-row-count');
    if (!container) return;

    const tableData = this.db.getTable(this.currentSheetKey);
    const sheetMeta = this.sheetList.find(s => s.key === this.currentSheetKey);
    if (title && sheetMeta) title.textContent = sheetMeta.label;

    if (!tableData || (!tableData.rows?.length && !tableData.rawGrid?.length)) {
      container.innerHTML = `
        <div style="padding: 40px; text-align: center; color: var(--text-muted);">
          <div style="font-size: 36px; margin-bottom: 12px;">📜</div>
          <div style="font-size: 16px; font-weight: 600; margin-bottom: 6px;">No history records found</div>
          <div style="font-size: 13px;">Click <strong>🔄 Sync with Google Sheets</strong> at top right to download full history data.</div>
        </div>
      `;
      if (countBadge) countBadge.textContent = '0 rows';
      return;
    }

    let rows = [...(tableData.rows || [])];

    // Search filter
    if (this.searchTerm) {
      rows = rows.filter(row => {
        return Object.values(row).some(val => 
          String(val || '').toLowerCase().includes(this.searchTerm)
        );
      });
    }

    const compareValues = (col, valA, valB) => {
      const sA = String(valA || '').trim();
      const sB = String(valB || '').trim();
      const colLower = String(col || '').toLowerCase();

      // Empty / N/A values sort to the bottom
      if (!sA && sB) return 1;
      if (sA && !sB) return -1;
      if (!sA && !sB) return 0;
      if (sA.toUpperCase() === 'N/A' && sB.toUpperCase() !== 'N/A') return 1;
      if (sA.toUpperCase() !== 'N/A' && sB.toUpperCase() === 'N/A') return -1;

      // Date comparison
      if (colLower.includes('date')) {
        const parseDate = (dStr) => {
          if (!dStr || dStr === 'N/A') return NaN;
          if (dStr.includes('/')) {
            const parts = dStr.split('/');
            if (parts.length === 3) {
              const m = parseInt(parts[0], 10) - 1;
              const d = parseInt(parts[1], 10);
              const y = parseInt(parts[2], 10);
              return new Date(y, m, d, 12, 0, 0).getTime();
            }
          }
          const t = new Date(dStr).getTime();
          return isNaN(t) ? NaN : t;
        };

        const dA = parseDate(sA);
        const dB = parseDate(sB);
        if (!isNaN(dA) && !isNaN(dB)) {
          return dA - dB;
        }
      }

      return sA.localeCompare(sB, undefined, { numeric: true, sensitivity: 'base' });
    };

    // Sort logic
    if (this.multiSort && this.multiSort.length > 0) {
      const [colA, colB] = this.multiSort;
      const dir = this.sortDir === 'asc' ? 1 : -1;
      rows.sort((a, b) => {
        const cmp1 = compareValues(colA, a[colA], b[colA]);
        if (cmp1 !== 0) return dir * cmp1;
        return dir * compareValues(colB, a[colB], b[colB]);
      });
    } else if (this.sortCol) {
      const col = this.sortCol;
      const dir = this.sortDir === 'asc' ? 1 : -1;
      rows.sort((a, b) => {
        return dir * compareValues(col, a[col], b[col]);
      });
    }

    if (countBadge) countBadge.textContent = `${rows.length} rows`;

    // Presets bar for History sheets
    const dirArrow = (active) => active ? (this.sortDir === 'asc' ? ' ▲' : ' ▼') : '';
    const isItemSorted = this.sortCol && ['item #', 'item', 'serial #', 'glove', 'sleeve', 'blanket', 'mack'].some(k => this.sortCol.toLowerCase().includes(k));
    const isDateSorted = this.sortCol && this.sortCol.toLowerCase().includes('date');
    const isSizeSorted = this.sortCol && this.sortCol.toLowerCase().includes('size');
    const isClassSorted = this.sortCol && this.sortCol.toLowerCase().includes('class');
    const isLocSorted = this.sortCol && this.sortCol.toLowerCase().includes('location');
    const isAssignedSorted = this.sortCol && this.sortCol.toLowerCase().includes('assigned');

    const showSize = ['gloves_history', 'sleeves_history', 'macks_history'].includes(this.currentSheetKey);
    const showClass = ['gloves_history', 'sleeves_history', 'blankets_history'].includes(this.currentSheetKey);

    const presetBarHtml = `
      <div style="padding: 8px 16px; background-color: var(--bg-secondary); border-bottom: 1px solid var(--border-color); display: flex; align-items: center; gap: 6px; font-size: 12px; overflow-x: auto; flex-wrap: wrap;">
        <span style="color: var(--text-muted); font-weight: 600; white-space: nowrap;">⚡ Quick Sort:</span>
        <button class="btn btn-secondary ${isItemSorted ? 'active' : ''}" style="padding: 3px 8px; font-size: 11px; white-space: nowrap;" onclick="window.historyNavigator.setPresetSort('itemNum')">🔢 Item #${dirArrow(isItemSorted)}</button>
        <button class="btn btn-secondary ${isDateSorted ? 'active' : ''}" style="padding: 3px 8px; font-size: 11px; white-space: nowrap;" onclick="window.historyNavigator.setPresetSort('dateAssigned')">📅 Date Assigned${dirArrow(isDateSorted)}</button>
        ${showSize ? `<button class="btn btn-secondary ${isSizeSorted ? 'active' : ''}" style="padding: 3px 8px; font-size: 11px; white-space: nowrap;" onclick="window.historyNavigator.setPresetSort('size')">📏 Size${dirArrow(isSizeSorted)}</button>` : ''}
        ${showClass ? `<button class="btn btn-secondary ${isClassSorted ? 'active' : ''}" style="padding: 3px 8px; font-size: 11px; white-space: nowrap;" onclick="window.historyNavigator.setPresetSort('class')">⚡ Class${dirArrow(isClassSorted)}</button>` : ''}
        <button class="btn btn-secondary ${isLocSorted ? 'active' : ''}" style="padding: 3px 8px; font-size: 11px; white-space: nowrap;" onclick="window.historyNavigator.setPresetSort('location')">📍 Location${dirArrow(isLocSorted)}</button>
        <button class="btn btn-secondary ${isAssignedSorted ? 'active' : ''}" style="padding: 3px 8px; font-size: 11px; white-space: nowrap;" onclick="window.historyNavigator.setPresetSort('assignedTo')">👤 Assigned To${dirArrow(isAssignedSorted)}</button>
      </div>
    `;

    let html = presetBarHtml + `<table class="data-table"><thead><tr>`;
    html += `<th style="width: 40px; text-align: center;">#</th>`;

    tableData.headers.forEach((h) => {
      let sortIndicator = '';
      if (this.sortCol === h) {
        sortIndicator = this.sortDir === 'asc' ? ' ▲' : ' ▼';
      }
      html += `<th onclick="window.historyNavigator.setSort('${this.escapeHtml(h)}')">${this.escapeHtml(h)}<span class="sort-indicator">${sortIndicator}</span></th>`;
    });
    html += `</tr></thead><tbody>`;

    rows.forEach((row, idx) => {
      html += `<tr><td style="text-align: center; color: var(--text-muted); font-size: 11px;">${idx + 1}</td>`;
      tableData.headers.forEach(h => {
        const val = row[h] !== undefined && row[h] !== null ? row[h] : '';
        const hLower = h.toLowerCase();

        // Style Notes with clean pill badge
        if (hLower === 'notes' || hLower === 'note' || hLower === 'action') {
          const valStr = String(val || '').trim();
          let pillStyle = 'background-color: var(--bg-tertiary); color: var(--text-secondary);';
          if (valStr.toLowerCase().startsWith('new')) {
            pillStyle = 'background-color: rgba(59, 130, 246, 0.15); color: #60a5fa; border: 1px solid rgba(59, 130, 246, 0.3);';
          } else if (valStr.toLowerCase().startsWith('return')) {
            pillStyle = 'background-color: rgba(245, 158, 11, 0.15); color: #fbbf24; border: 1px solid rgba(245, 158, 11, 0.3);';
          } else if (valStr.toLowerCase().startsWith('reassign')) {
            pillStyle = 'background-color: rgba(168, 85, 247, 0.15); color: #c084fc; border: 1px solid rgba(168, 85, 247, 0.3);';
          }
          html += `<td>${valStr ? `<span style="padding: 2px 8px; border-radius: 12px; font-size: 11px; font-weight: 500; display: inline-block; ${pillStyle}">${this.escapeHtml(valStr)}</span>` : ''}</td>`;
        } else if (hLower === 'item #' || hLower === 'serial #' || hLower === 'item') {
          html += `<td style="font-weight: 600; color: var(--text-primary);">${this.escapeHtml(String(val))}</td>`;
        } else if (hLower === 'assigned to' || hLower === 'employee name') {
          html += `<td style="font-weight: 500;">${this.escapeHtml(String(val))}</td>`;
        } else {
          html += `<td>${this.escapeHtml(String(val))}</td>`;
        }
      });
      html += `</tr>`;
    });

    html += `</tbody></table>`;
    container.innerHTML = html;
  }

  escapeHtml(text) {
    if (!text) return '';
    return String(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
}

// Global instance
window.historyNavigator = new HistoryNavigator(window.localDB);
