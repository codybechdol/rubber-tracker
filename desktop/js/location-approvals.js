/**
 * location-approvals.js - Location Rubber Class Approvals Manager for Safety Assistant Desktop App
 * Provides a dedicated, interactive UI for viewing and adjusting high-voltage rubber class requirements
 * (Class 2, Class 3, Both, or None) across all operational locations.
 * Automatically synchronizes with local database and Google Sheets outbox queue.
 */

class LocationApprovalsEngine {
  constructor(db) {
    this._db = db;
    this.searchTerm = '';
    this.filterClass = 'all'; // 'all', 'CL2', 'CL3', 'CL2 & CL3', 'None'
  }

  get db() {
    return this._db || window.localDB;
  }

  set db(val) {
    this._db = val;
  }

  init() {
    // Attach listener if needed
  }

  /**
   * Opens the Location Approvals Modal
   */
  openModal() {
    let modal = document.getElementById('location-approvals-modal');
    if (!modal) {
      this.createModalDom();
      modal = document.getElementById('location-approvals-modal');
    }
    if (!modal) return;

    this.searchTerm = '';
    this.filterClass = 'all';

    const searchInput = document.getElementById('loc-approvals-search');
    if (searchInput) searchInput.value = '';

    this.render();
    modal.style.display = 'flex';
  }

  /**
   * Closes the Location Approvals Modal
   */
  closeModal() {
    const modal = document.getElementById('location-approvals-modal');
    if (modal) {
      modal.style.display = 'none';
    }
  }

  /**
   * Reads all locations from database
   */
  getLocationsData() {
    const locTable = (this.db && typeof this.db.getTable === 'function' ? this.db.getTable('locations') : null) || this.db?.snapshot?.tables?.['locations'];
    if (!locTable || !locTable.rows) return [];

    return locTable.rows.map((r, idx) => {
      const name = String(r['Location'] || Object.values(r)[0] || '').trim();
      const driveTime = r['Drive Time (min)'] !== undefined ? r['Drive Time (min)'] : (r['Drive Time'] || 0);
      const direction = String(r['Direction'] || '').trim();
      const approval = String(r['Rubber Class Approval'] || r['Approval'] || Object.values(r)[6] || 'CL2').trim();
      const baseTime = r['Base Time (min)'] || 15;
      const perTask = r['Per Task (min)'] || 10;

      return {
        _rowIdx: r._rowIdx || (idx + 2),
        name,
        driveTime,
        direction,
        approval,
        baseTime,
        perTask,
        rawRecord: r
      };
    }).filter(l => l.name);
  }

  /**
   * Updates a location's Rubber Class Approval setting
   */
  async updateApproval(locationName, newApproval) {
    if (!locationName || !newApproval) return;
    const locTable = (this.db && typeof this.db.getTable === 'function' ? this.db.getTable('locations') : null) || this.db?.snapshot?.tables?.['locations'];
    if (!locTable) return;

    const rowObj = locTable.rows.find(r => {
      const n = String(r['Location'] || Object.values(r)[0] || '').trim().toLowerCase();
      return n === locationName.toLowerCase();
    });

    if (!rowObj) {
      console.warn(`[LocationApprovals] Location not found: ${locationName}`);
      return;
    }

    const oldApproval = rowObj['Rubber Class Approval'] || 'CL2';
    if (oldApproval === newApproval) return;

    rowObj['Rubber Class Approval'] = newApproval;

    // Update rawGrid if present
    if (locTable.rawGrid && locTable.headers) {
      const colIdx = locTable.headers.findIndex(h => /rubber class|approval/i.test(String(h || '').trim()));
      const targetCol = colIdx !== -1 ? colIdx : 6;
      const actualRowIdx = rowObj._rowIdx || (locTable.rows.indexOf(rowObj) + 2);
      if (locTable.rawGrid[actualRowIdx - 1]) {
        locTable.rawGrid[actualRowIdx - 1][targetCol] = newApproval;
      }
    }

    // Queue UPDATE_CELL mutation for Google Sheets
    const actualRowIdx = rowObj._rowIdx || (locTable.rows.indexOf(rowObj) + 2);
    const colIdx = (locTable.headers || []).findIndex(h => /rubber class|approval/i.test(String(h || '').trim()));
    const sheetCol = colIdx !== -1 ? (colIdx + 1) : 7;

    await this.db.addMutation({
      action: 'UPDATE_CELL',
      sheetName: 'Locations',
      tableKey: 'locations',
      row: actualRowIdx,
      col: sheetCol,
      header: 'Rubber Class Approval',
      itemIdentifier: locationName,
      value: newApproval
    });

    // Auto-persist snapshot
    if (typeof this.db.persistSnapshot === 'function') {
      await this.db.persistSnapshot(this.db.snapshot);
    } else if (window.desktopAPI) {
      await window.desktopAPI.saveLocalSnapshot(this.db.snapshot);
    }

    // Show toast
    if (window.showToast) {
      window.showToast(`✅ ${locationName} updated to ${newApproval}`, 'success');
    }

    // Re-render modal to refresh counters and badges
    this.render();

    // Re-render sheets view if currently looking at locations sheet
    if (window.sheetNavigator && window.sheetNavigator.currentSheetKey === 'locations') {
      window.sheetNavigator.renderCurrentSheet();
    }

    // Recalculate procurement if procurement engine exists
    if (window.procurementEngine && typeof window.procurementEngine.buildPurchaseNeeds === 'function') {
      window.procurementEngine.buildPurchaseNeeds();
      if (document.getElementById('procurement-view')?.classList.contains('active')) {
        window.procurementEngine.render();
      }
    }
  }

  /**
   * Sets filter tab
   */
  setFilter(filter) {
    this.filterClass = filter;
    this.render();
  }

  /**
   * Renders the modal content
   */
  render() {
    const body = document.getElementById('loc-approvals-modal-body');
    if (!body) return;

    const allLocations = this.getLocationsData();

    // Compute metrics
    let countCL3 = 0;
    let countCL2 = 0;
    let countBoth = 0;
    let countNone = 0;

    allLocations.forEach(loc => {
      const a = loc.approval.toUpperCase();
      if (a === 'CL3') countCL3++;
      else if (a === 'CL2') countCL2++;
      else if (a.includes('&') || a.includes('BOTH')) countBoth++;
      else if (a === 'NONE') countNone++;
      else countCL2++;
    });

    // Filter locations
    const qLower = this.searchTerm.toLowerCase().trim();
    const filtered = allLocations.filter(loc => {
      if (qLower) {
        const matchName = loc.name.toLowerCase().includes(qLower);
        const matchDir = loc.direction.toLowerCase().includes(qLower);
        const matchApp = loc.approval.toLowerCase().includes(qLower);
        if (!matchName && !matchDir && !matchApp) return false;
      }

      if (this.filterClass === 'CL3') return loc.approval.toUpperCase() === 'CL3';
      if (this.filterClass === 'CL2') return loc.approval.toUpperCase() === 'CL2';
      if (this.filterClass === 'CL2 & CL3') return loc.approval.toUpperCase().includes('&') || loc.approval.toUpperCase().includes('BOTH');
      if (this.filterClass === 'None') return loc.approval.toUpperCase() === 'NONE';

      return true;
    });

    // Sort locations alphabetically
    filtered.sort((a, b) => a.name.localeCompare(b.name));

    let html = `
      <!-- Stats Summary Banner -->
      <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 18px;">
        <div style="background: rgba(124, 58, 237, 0.12); border: 1px solid rgba(124, 58, 237, 0.35); border-radius: 8px; padding: 12px 14px; text-align: center;">
          <div style="font-size: 11px; font-weight: 700; color: #c084fc; text-transform: uppercase; letter-spacing: 0.5px;">⚡ Class 3 Only (26.5kV)</div>
          <div style="font-size: 24px; font-weight: 800; color: #fff; margin-top: 4px;">${countCL3}</div>
          <div style="font-size: 10.5px; color: #e9d5ff; margin-top: 2px;">e.g. Big Sky</div>
        </div>
        <div style="background: rgba(37, 99, 235, 0.12); border: 1px solid rgba(37, 99, 235, 0.35); border-radius: 8px; padding: 12px 14px; text-align: center;">
          <div style="font-size: 11px; font-weight: 700; color: #93c5fd; text-transform: uppercase; letter-spacing: 0.5px;">🧤 Class 2 Only (17kV)</div>
          <div style="font-size: 24px; font-weight: 800; color: #fff; margin-top: 4px;">${countCL2}</div>
          <div style="font-size: 10.5px; color: #bfdbfe; margin-top: 2px;">Helena, Bozeman, Butte...</div>
        </div>
        <div style="background: rgba(5, 150, 105, 0.12); border: 1px solid rgba(5, 150, 105, 0.35); border-radius: 8px; padding: 12px 14px; text-align: center;">
          <div style="font-size: 11px; font-weight: 700; color: #6ee7b7; text-transform: uppercase; letter-spacing: 0.5px;">🔄 Class 2 & Class 3</div>
          <div style="font-size: 24px; font-weight: 800; color: #fff; margin-top: 4px;">${countBoth}</div>
          <div style="font-size: 10.5px; color: #a7f3d0; margin-top: 2px;">Great Falls, Livingston...</div>
        </div>
        <div style="background: rgba(71, 85, 105, 0.15); border: 1px solid rgba(71, 85, 105, 0.35); border-radius: 8px; padding: 12px 14px; text-align: center;">
          <div style="font-size: 11px; font-weight: 700; color: #cbd5e1; text-transform: uppercase; letter-spacing: 0.5px;">🚫 No High Voltage</div>
          <div style="font-size: 24px; font-weight: 800; color: #fff; margin-top: 4px;">${countNone}</div>
          <div style="font-size: 10.5px; color: #94a3b8; margin-top: 2px;">Office / Shop / Status</div>
        </div>
      </div>

      <!-- Controls Bar: Search & Filter Pills -->
      <div style="display: flex; gap: 12px; align-items: center; justify-content: space-between; margin-bottom: 16px; flex-wrap: wrap;">
        <div style="flex: 1; min-width: 260px; position: relative;">
          <input type="text" id="loc-approvals-search" class="form-control" placeholder="🔍 Search locations (e.g. Big Sky, Helena, Great Falls)..." value="${this.escapeHtml(this.searchTerm)}" oninput="window.locationApprovalsEngine.onSearchInput(this.value)" style="width: 100%; box-sizing: border-box; padding: 8px 12px; font-size: 13px; background: var(--bg-primary); border: 1px solid var(--border-color); border-radius: 6px; color: #fff;">
        </div>

        <div style="display: flex; gap: 6px; align-items: center; flex-wrap: wrap;">
          <button class="filter-pill ${this.filterClass === 'all' ? 'active' : ''}" onclick="window.locationApprovalsEngine.setFilter('all')">All (${allLocations.length})</button>
          <button class="filter-pill ${this.filterClass === 'CL3' ? 'active' : ''}" onclick="window.locationApprovalsEngine.setFilter('CL3')">⚡ Class 3 (${countCL3})</button>
          <button class="filter-pill ${this.filterClass === 'CL2' ? 'active' : ''}" onclick="window.locationApprovalsEngine.setFilter('CL2')">🧤 Class 2 (${countCL2})</button>
          <button class="filter-pill ${this.filterClass === 'CL2 & CL3' ? 'active' : ''}" onclick="window.locationApprovalsEngine.setFilter('CL2 & CL3')">🔄 Both (${countBoth})</button>
          <button class="filter-pill ${this.filterClass === 'None' ? 'active' : ''}" onclick="window.locationApprovalsEngine.setFilter('None')">🚫 None (${countNone})</button>
        </div>
      </div>

      <!-- Locations List / Table -->
      <div style="border: 1px solid var(--border-color); border-radius: 8px; overflow: hidden; background: var(--bg-secondary);">
        <table style="width: 100%; border-collapse: collapse; text-align: left; font-size: 13px;">
          <thead>
            <tr style="background: rgba(15, 23, 42, 0.8); border-bottom: 1px solid var(--border-color); color: var(--text-muted); font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px;">
              <th style="padding: 10px 16px;">Location</th>
              <th style="padding: 10px 16px;">Region / Direction</th>
              <th style="padding: 10px 16px;">Drive Time (from Helena)</th>
              <th style="padding: 10px 16px;">Current Voltage Requirement</th>
              <th style="padding: 10px 16px; width: 220px;">Adjust Class Approval</th>
            </tr>
          </thead>
          <tbody>
    `;

    if (filtered.length === 0) {
      html += `
        <tr>
          <td colspan="5" style="padding: 30px; text-align: center; color: var(--text-muted);">
            No locations match your current search or filter.
          </td>
        </tr>
      `;
    } else {
      filtered.forEach((loc, idx) => {
        const bgStyle = idx % 2 === 0 ? 'background: rgba(255, 255, 255, 0.015);' : 'background: transparent;';
        const appUpper = loc.approval.toUpperCase();

        let badgeHtml = '';
        if (appUpper === 'CL3') {
          badgeHtml = `<span class="badge" style="background-color: #7c3aed; color: #fff; padding: 3px 10px; border-radius: 4px; font-weight: 700; font-size: 11.5px; display: inline-flex; align-items: center; gap: 4px;">⚡ Class 3 (26.5kV Only)</span>`;
        } else if (appUpper === 'CL2') {
          badgeHtml = `<span class="badge" style="background-color: #2563eb; color: #fff; padding: 3px 10px; border-radius: 4px; font-weight: 700; font-size: 11.5px; display: inline-flex; align-items: center; gap: 4px;">🧤 Class 2 (17kV Only)</span>`;
        } else if (appUpper.includes('&') || appUpper.includes('BOTH')) {
          badgeHtml = `<span class="badge" style="background-color: #059669; color: #fff; padding: 3px 10px; border-radius: 4px; font-weight: 700; font-size: 11.5px; display: inline-flex; align-items: center; gap: 4px;">🔄 Class 2 & Class 3</span>`;
        } else if (appUpper === 'NONE') {
          badgeHtml = `<span class="badge" style="background-color: #475569; color: #cbd5e1; padding: 3px 10px; border-radius: 4px; font-weight: 600; font-size: 11.5px; display: inline-flex; align-items: center; gap: 4px;">🚫 None (Office / Shop)</span>`;
        } else {
          badgeHtml = `<span class="badge" style="background-color: #2563eb; color: #fff; padding: 3px 10px; border-radius: 4px; font-weight: 700; font-size: 11.5px;">🧤 ${loc.approval}</span>`;
        }

        html += `
          <tr style="${bgStyle} border-bottom: 1px solid rgba(255, 255, 255, 0.05); transition: background 0.15s ease;">
            <td style="padding: 12px 16px; font-weight: 700; color: #fff;">
              <div style="display: flex; align-items: center; gap: 6px;">
                <span style="color: #60a5fa;">📍</span>
                <span>${this.escapeHtml(loc.name)}</span>
              </div>
            </td>
            <td style="padding: 12px 16px; color: #94a3b8;">
              ${loc.direction ? `<span style="display: inline-flex; align-items: center; gap: 4px;">🧭 ${this.escapeHtml(loc.direction)}</span>` : '—'}
            </td>
            <td style="padding: 12px 16px; color: #cbd5e1; font-family: monospace;">
              ${loc.driveTime ? `${loc.driveTime} min` : '0 min (Home)'}
            </td>
            <td style="padding: 12px 16px;">
              ${badgeHtml}
            </td>
            <td style="padding: 12px 16px;">
              <select class="form-control" style="width: 100%; font-size: 12.5px; font-weight: 600; padding: 5px 8px; background: var(--bg-primary); border: 1px solid var(--border-color); border-radius: 5px; color: #fff;" onchange="window.locationApprovalsEngine.updateApproval('${this.escapeJs(loc.name)}', this.value)">
                <option value="CL2" ${appUpper === 'CL2' ? 'selected' : ''}>🧤 CL2 (Class 2 - 17kV)</option>
                <option value="CL3" ${appUpper === 'CL3' ? 'selected' : ''}>⚡ CL3 (Class 3 - 26.5kV)</option>
                <option value="CL2 & CL3" ${(appUpper.includes('&') || appUpper.includes('BOTH')) ? 'selected' : ''}>🔄 CL2 & CL3 (Both Approved)</option>
                <option value="None" ${appUpper === 'NONE' ? 'selected' : ''}>🚫 None (No HV Rubber)</option>
              </select>
            </td>
          </tr>
        `;
      });
    }

    html += `
          </tbody>
        </table>
      </div>
    `;

    body.innerHTML = html;
  }

  onSearchInput(val) {
    this.searchTerm = val || '';
    this.render();
  }

  /**
   * Injects modal HTML into body if not already present
   */
  createModalDom() {
    if (document.getElementById('location-approvals-modal')) return;

    const modal = document.createElement('div');
    modal.id = 'location-approvals-modal';
    modal.className = 'modal-overlay';
    modal.style.zIndex = '1200';
    modal.style.display = 'none';

    modal.innerHTML = `
      <div class="modal-box" style="max-width: 960px; width: 94%; max-height: 92vh; display: flex; flex-direction: column; box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.7); border: 1px solid rgba(124, 58, 237, 0.4);">
        <div class="modal-header" style="background: linear-gradient(135deg, #1e1b4b 0%, #312e81 100%); color: white; padding: 14px 20px; display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid rgba(124, 58, 237, 0.3);">
          <div style="display: flex; align-items: center; gap: 10px;">
            <span style="font-size: 22px;">📍</span>
            <div>
              <div style="font-weight: 800; font-size: 16px; letter-spacing: 0.3px;">Location Rubber Class Approvals</div>
              <div style="font-size: 11.5px; color: #c7d2fe; margin-top: 1px;">Adjust high voltage glove & sleeve voltage requirements (CL2, CL3, or Both) for each crew location.</div>
            </div>
          </div>
          <button class="btn btn-secondary" style="padding: 2px 8px; font-size: 12px; background: rgba(0,0,0,0.25); border: none; color: white; cursor: pointer;" onclick="window.locationApprovalsEngine.closeModal()">✕</button>
        </div>

        <div class="modal-body" id="loc-approvals-modal-body" style="padding: 20px; overflow-y: auto; max-height: 76vh; background: var(--bg-primary);">
          <!-- Injected dynamically -->
        </div>

        <div class="modal-footer" style="display: flex; justify-content: space-between; align-items: center; padding: 12px 20px; background: var(--bg-secondary); border-top: 1px solid var(--border-color);">
          <div style="font-size: 11.5px; color: var(--text-muted);">
            💡 Changes take effect immediately in Swaps, Trip Planner, and Purchase Needs, and sync to Google Sheets.
          </div>
          <button class="btn btn-primary" style="padding: 6px 18px; font-size: 13px; font-weight: 700; background: linear-gradient(135deg, #7c3aed 0%, #6d28d9 100%); border: none;" onclick="window.locationApprovalsEngine.closeModal()">Done</button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);
  }

  escapeHtml(str) {
    if (!str && str !== 0) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  escapeJs(str) {
    if (!str && str !== 0) return '';
    return String(str)
      .replace(/\\/g, '\\\\')
      .replace(/'/g, "\\'")
      .replace(/"/g, '\\"');
  }
}

if (typeof window !== 'undefined') {
  window.LocationApprovalsEngine = LocationApprovalsEngine;
}
