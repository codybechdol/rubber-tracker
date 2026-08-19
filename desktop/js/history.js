/**
 * history.js - History Workspaces & Record Grid for Desktop App
 * Provides dedicated offline viewing, filtering, item grouping, and sorting for all equipment and employee history sheets.
 */

class HistoryNavigator {
  constructor(db) {
    this.db = db;
    this.currentSheetKey = 'gloves_history';
    this.searchTerm = '';
    this.sortCol = null;
    this.sortDir = 'asc';
    this.multiSort = null;
    this.groupByItem = true; // Default: Group like item numbers together with clear separation

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

  toggleGrouping() {
    this.groupByItem = !this.groupByItem;
    this.renderCurrentHistory();
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

  // Find primary grouping column for this sheet (Item # / Serial # / Employee Name)
  getGroupCol(headers) {
    if (!headers || headers.length === 0) return null;
    const candidates = ['item #', 'serial #', 'item', 'employee name', 'employee', 'name'];
    for (const cand of candidates) {
      const found = headers.find(h => {
        const hLower = String(h || '').toLowerCase().trim();
        return hLower === cand || hLower.startsWith(cand);
      });
      if (found) return found;
    }
    return headers[1] || headers[0];
  }

  parseDateToTimestamp(dStr) {
    if (!dStr || dStr === 'N/A') return 0;
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
    return isNaN(t) ? 0 : t;
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
          <div style="font-size: 13px;">Click <strong>🔄 Sync with Google Sheets</strong> or <strong>📁 Import Snapshot</strong> to load history data.</div>
        </div>
      `;
      if (countBadge) countBadge.textContent = '0 rows';
      return;
    }

    const headers = tableData.headers || [];
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
        const dA = this.parseDateToTimestamp(sA);
        const dB = this.parseDateToTimestamp(sB);
        if (dA !== 0 && dB !== 0) {
          return dA - dB;
        }
      }

      // Numeric comparison
      const numA = parseFloat(sA);
      const numB = parseFloat(sB);
      if (!isNaN(numA) && !isNaN(numB) && String(numA) === sA && String(numB) === sB) {
        return numA - numB;
      }

      return sA.localeCompare(sB, undefined, { numeric: true, sensitivity: 'base' });
    };

    const groupCol = this.getGroupCol(headers);
    const dateCol = headers.find(h => h.toLowerCase().includes('date')) || headers[0];

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
      <div style="padding: 8px 16px; background-color: var(--bg-secondary); border-bottom: 1px solid var(--border-color); display: flex; align-items: center; justify-content: space-between; gap: 8px; font-size: 12px; overflow-x: auto; flex-wrap: wrap;">
        <div style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">
          <span style="color: var(--text-muted); font-weight: 600; white-space: nowrap;">⚡ Quick Sort:</span>
          <button class="btn btn-secondary ${isItemSorted ? 'active' : ''}" style="padding: 3px 8px; font-size: 11px; white-space: nowrap;" onclick="window.historyNavigator.setPresetSort('itemNum')">🔢 Item #${dirArrow(isItemSorted)}</button>
          <button class="btn btn-secondary ${isDateSorted ? 'active' : ''}" style="padding: 3px 8px; font-size: 11px; white-space: nowrap;" onclick="window.historyNavigator.setPresetSort('dateAssigned')">📅 Date Assigned${dirArrow(isDateSorted)}</button>
          ${showSize ? `<button class="btn btn-secondary ${isSizeSorted ? 'active' : ''}" style="padding: 3px 8px; font-size: 11px; white-space: nowrap;" onclick="window.historyNavigator.setPresetSort('size')">📏 Size${dirArrow(isSizeSorted)}</button>` : ''}
          ${showClass ? `<button class="btn btn-secondary ${isClassSorted ? 'active' : ''}" style="padding: 3px 8px; font-size: 11px; white-space: nowrap;" onclick="window.historyNavigator.setPresetSort('class')">⚡ Class${dirArrow(isClassSorted)}</button>` : ''}
          <button class="btn btn-secondary ${isLocSorted ? 'active' : ''}" style="padding: 3px 8px; font-size: 11px; white-space: nowrap;" onclick="window.historyNavigator.setPresetSort('location')">📍 Location${dirArrow(isLocSorted)}</button>
          <button class="btn btn-secondary ${isAssignedSorted ? 'active' : ''}" style="padding: 3px 8px; font-size: 11px; white-space: nowrap;" onclick="window.historyNavigator.setPresetSort('assignedTo')">👤 Assigned To${dirArrow(isAssignedSorted)}</button>
        </div>
        <div style="display: flex; align-items: center; gap: 8px;">
          <button class="btn btn-secondary ${this.groupByItem ? 'active' : ''}" style="padding: 3px 10px; font-size: 11px; white-space: nowrap;" onclick="window.historyNavigator.toggleGrouping()">
            ${this.groupByItem ? '📁 Grouped by Item' : '📄 Flat Table'}
          </button>
        </div>
      </div>
    `;

    // Grouping by item logic
    if (this.groupByItem && groupCol) {
      const itemGroups = {};
      rows.forEach(r => {
        const itemKey = String(r[groupCol] || '').trim() || 'Unknown Item';
        if (!itemGroups[itemKey]) itemGroups[itemKey] = [];
        itemGroups[itemKey].push(r);
      });

      const sortedItemKeys = Object.keys(itemGroups);

      // Sort item groups
      sortedItemKeys.sort((a, b) => {
        const numA = parseInt(a, 10);
        const numB = parseInt(b, 10);
        if (!isNaN(numA) && !isNaN(numB) && String(numA) === a && String(numB) === b) {
          return numA - numB;
        }
        return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
      });

      // Sort entries within each item group chronologically (newest first by default)
      sortedItemKeys.forEach(key => {
        itemGroups[key].sort((a, b) => {
          const tA = this.parseDateToTimestamp(a[dateCol]);
          const tB = this.parseDateToTimestamp(b[dateCol]);
          return tB - tA; // Newest entry on top within group
        });
      });

      if (countBadge) countBadge.textContent = `${rows.length} rows (${sortedItemKeys.length} items)`;

      let html = presetBarHtml + `<table class="data-table"><thead><tr>`;
      html += `<th style="width: 40px; text-align: center;">#</th>`;

      headers.forEach(h => {
        let sortIndicator = '';
        if (this.sortCol === h) {
          sortIndicator = this.sortDir === 'asc' ? ' ▲' : ' ▼';
        }
        html += `<th onclick="window.historyNavigator.setSort('${this.escapeHtml(h)}')">${this.escapeHtml(h)}<span class="sort-indicator">${sortIndicator}</span></th>`;
      });
      html += `</tr></thead><tbody>`;

      let globalRowIdx = 1;

      sortedItemKeys.forEach((itemKey, groupIdx) => {
        const groupRows = itemGroups[itemKey];
        const firstRow = groupRows[0] || {};
        
        // Extract metadata pills (Size, Class, Type, KV, Serial)
        let metaDetails = [];
        headers.forEach(h => {
          const hLower = h.toLowerCase();
          if (['size', 'class', 'type', 'kv', 'model', 'length'].includes(hLower) && firstRow[h]) {
            metaDetails.push(`<span><strong>${this.escapeHtml(h)}:</strong> ${this.escapeHtml(String(firstRow[h]))}</span>`);
          }
        });

        // Calculate lifecycle stats for this item group
        const stats = window.itemStatsEngine ? window.itemStatsEngine.analyzeLifecycle(itemKey, groupRows) : null;

        // Group Header Banner with distinct visual separation & Lifecycle Stats
        const topMargin = groupIdx > 0 ? 'border-top: 3px solid #3b82f6;' : '';
        html += `
          <tr class="history-item-group-header" style="background: linear-gradient(90deg, #1e293b 0%, #0f172a 100%); ${topMargin}">
            <td colspan="${headers.length + 1}" style="padding: 12px 16px; border-bottom: 1px solid rgba(59, 130, 246, 0.3);">
              <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px; margin-bottom: 6px;">
                <div style="display: flex; align-items: center; gap: 10px; flex-wrap: wrap;">
                  <span style="background-color: #3b82f6; color: #ffffff; font-weight: 700; font-size: 12px; padding: 3px 10px; border-radius: 6px; box-shadow: 0 1px 3px rgba(0,0,0,0.3); display: inline-flex; align-items: center; gap: 5px; cursor: pointer;" title="Click to view complete lifecycle dossier" onclick="window.itemStatsEngine.openDossierModal('${this.escapeHtml(itemKey)}', '${this.currentSheetKey}')">
                    <span>${sheetMeta?.icon || '📦'}</span> ${this.escapeHtml(groupCol)}: ${this.escapeHtml(itemKey)}
                  </span>
                  ${metaDetails.length > 0 ? `
                    <div style="display: flex; align-items: center; gap: 12px; font-size: 11px; color: var(--text-secondary); background: rgba(255,255,255,0.04); padding: 3px 10px; border-radius: 6px; border: 1px solid var(--border-color);">
                      ${metaDetails.join('<span style="color: var(--text-muted);">•</span>')}
                    </div>
                  ` : ''}
                </div>
                <div style="display: flex; align-items: center; gap: 8px;">
                  <button class="btn btn-secondary" style="padding: 3px 8px; font-size: 11px; display: inline-flex; align-items: center; gap: 4px;" onclick="window.itemStatsEngine.openDossierModal('${this.escapeHtml(itemKey)}', '${this.currentSheetKey}')">
                    <span>🔍</span> Inspect Lifecycle
                  </button>
                  <span class="brand-badge" style="background: rgba(59, 130, 246, 0.15); color: #60a5fa; border: 1px solid rgba(59, 130, 246, 0.3); font-size: 11px; font-weight: 600;">
                    ${groupRows.length} ${groupRows.length === 1 ? 'record' : 'lifecycle records'}
                  </span>
                </div>
              </div>

              ${stats ? `
                <div style="background: rgba(15, 23, 42, 0.6); border: 1px solid rgba(255, 255, 255, 0.05); border-radius: 6px; padding: 8px 12px; margin-top: 6px;">
                  ${window.itemStatsEngine.renderKpiChipsHtml(stats)}
                  ${window.itemStatsEngine.renderSegmentedBarHtml(stats)}
                </div>
              ` : ''}
            </td>
          </tr>
        `;

        // Render rows in this item group
        groupRows.forEach((row, rowInGroupIdx) => {
          const isLastInGroup = rowInGroupIdx === groupRows.length - 1;
          const groupRowStyle = `border-left: 3px solid rgba(59, 130, 246, 0.5); ${isLastInGroup ? 'border-bottom: 2px solid var(--border-color);' : ''}`;

          html += `<tr style="${groupRowStyle}"><td style="text-align: center; color: var(--text-muted); font-size: 11px;">${globalRowIdx++}</td>`;
          
          headers.forEach(h => {
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
              html += `<td style="font-weight: 700; color: #60a5fa;">${this.escapeHtml(String(val))}</td>`;
            } else if (hLower === 'assigned to' || hLower === 'employee name') {
              html += `<td style="font-weight: 600; color: var(--text-primary);">${this.escapeHtml(String(val))}</td>`;
            } else if (hLower === 'location') {
              html += `<td><span style="display: inline-flex; align-items: center; gap: 4px;"><span>📍</span> ${this.escapeHtml(String(val))}</span></td>`;
            } else {
              html += `<td>${this.escapeHtml(String(val))}</td>`;
            }
          });
          html += `</tr>`;
        });
      });

      html += `</tbody></table>`;
      container.innerHTML = html;
      return;
    }

    // Flat sort fallback if grouping is toggled off
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

    let html = presetBarHtml + `<table class="data-table"><thead><tr>`;
    html += `<th style="width: 40px; text-align: center;">#</th>`;

    headers.forEach((h) => {
      let sortIndicator = '';
      if (this.sortCol === h) {
        sortIndicator = this.sortDir === 'asc' ? ' ▲' : ' ▼';
      }
      html += `<th onclick="window.historyNavigator.setSort('${this.escapeHtml(h)}')">${this.escapeHtml(h)}<span class="sort-indicator">${sortIndicator}</span></th>`;
    });
    html += `</tr></thead><tbody>`;

    rows.forEach((row, idx) => {
      html += `<tr><td style="text-align: center; color: var(--text-muted); font-size: 11px;">${idx + 1}</td>`;
      headers.forEach(h => {
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
