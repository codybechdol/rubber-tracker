/**
 * inventory.js - Unified Item Creation & Inventory Management Engine for Desktop App
 * Handles item creation across all 9 equipment categories, change-out date calculations,
 * status transitions, and local database mutations.
 */

class InventoryManager {
  constructor(db) {
    this._db = db;
    this.modalEl = null;
  }

  get db() {
    return this._db || window.localDB;
  }

  set db(val) {
    this._db = val;
  }

  init() {
    this.createModalHtml();
    this.bindEvents();
  }

  /**
   * Calculates the Change Out Date based on equipment rules
   *
   * GLOVES:
   * - On Shelf = +12 months
   * - Northern Lights = +6 months
   * - In Testing / Packed For Delivery / Packed For Testing = +3 months
   * - Employee assigned = +3 months
   * - Lost / Failed Rubber / Destroyed / Previous Employee = N/A
   *
   * SLEEVES:
   * - +12 months (all)
   * - Lost / Failed Rubber / Destroyed / Previous Employee = N/A
   *
   * BLANKETS:
   * - Test Date + 12 months
   *
   * MACKS:
   * - Test Date + 12 months
   *
   * HV TESTERS & PHASING SETS:
   * - Calibration Date + 10 years
   *
   * AED:
   * - Min of Pad Expiration Date and Battery Expiration Date
   *
   * GROUNDS:
   * - Test Date + 12 months (1-year cycle)
   *
   * HOT STICKS:
   * - Test Date + 24 months (2-year cycle per OSHA 1910.269 / ASTM F711)
   */
  calculateChangeOutDate(dateAssigned, location, assignedTo, itemType, extra = {}) {
    const sAssigned = String(assignedTo || '').trim().toLowerCase();
    const sLoc = String(location || '').trim().toLowerCase();
    const sType = String(itemType || '').trim().toLowerCase();

    // End of life / excluded states get N/A
    if (
      sAssigned === 'lost' ||
      sAssigned === 'failed rubber' ||
      sAssigned === 'not repairable' ||
      sAssigned === 'destroyed' ||
      sLoc === 'previous employee' ||
      sLoc === 'destroyed' ||
      sLoc === 'lost'
    ) {
      return 'N/A';
    }

    const parseToDate = (val) => {
      if (!val || val === 'N/A') return null;
      if (val instanceof Date) return isNaN(val.getTime()) ? null : val;
      const s = String(val).trim();
      if (s.includes('/')) {
        const parts = s.split('/');
        if (parts.length === 3) {
          const m = parseInt(parts[0], 10) - 1;
          const d = parseInt(parts[1], 10);
          const y = parseInt(parts[2], 10);
          const dt = new Date(y, m, d, 12, 0, 0);
          return isNaN(dt.getTime()) ? null : dt;
        }
      }
      if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
        const parts = s.split('-');
        const y = parseInt(parts[0], 10);
        const m = parseInt(parts[1], 10) - 1;
        const d = parseInt(parts[2], 10);
        const dt = new Date(y, m, d, 12, 0, 0);
        return isNaN(dt.getTime()) ? null : dt;
      }
      const dt = new Date(s);
      return isNaN(dt.getTime()) ? null : dt;
    };

    const formatDateStr = (d) => {
      if (!d || !(d instanceof Date) || isNaN(d.getTime())) return '';
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      const yyyy = d.getFullYear();
      return `${mm}/${dd}/${yyyy}`;
    };

    // 1. AED
    if (sType === 'aed') {
      const padDate = parseToDate(extra.padExpiration || dateAssigned);
      const batDate = parseToDate(extra.batteryExpiration);
      if (padDate && batDate) {
        return formatDateStr(padDate < batDate ? padDate : batDate);
      }
      if (padDate) return formatDateStr(padDate);
      if (batDate) return formatDateStr(batDate);
      return '';
    }

    // 2. HV Testers & Phasing Sets (+10 years)
    if (sType === 'hv_testers' || sType === 'hv testers' || sType === 'phasing_sets' || sType === 'phasing sets') {
      const calDate = parseToDate(extra.calibrationDate || dateAssigned);
      if (!calDate) return '';
      const d = new Date(calDate);
      d.setFullYear(d.getFullYear() + 10);
      return formatDateStr(d);
    }

    // 3. Hot Sticks (+24 months)
    if (sType === 'hot_sticks' || sType === 'hot sticks') {
      const tDate = parseToDate(extra.testDate || dateAssigned);
      if (!tDate) return '';
      const d = new Date(tDate);
      d.setMonth(d.getMonth() + 24);
      return formatDateStr(d);
    }

    // 4. Blankets, MACKs, Grounds (+12 months from Test Date)
    if (
      sType === 'blankets' ||
      sType === 'blanket' ||
      sType === 'macks' ||
      sType === 'mack' ||
      sType === 'grounds' ||
      sType === 'ground'
    ) {
      const tDate = parseToDate(extra.testDate || dateAssigned);
      if (!tDate) return '';
      const d = new Date(tDate);
      d.setMonth(d.getMonth() + 12);
      return formatDateStr(d);
    }

    // 5. Sleeves (+12 months)
    if (sType === 'sleeves' || sType === 'sleeve') {
      const aDate = parseToDate(dateAssigned);
      if (!aDate) return '';
      const d = new Date(aDate);
      d.setMonth(d.getMonth() + 12);
      return formatDateStr(d);
    }

    // 6. Gloves
    const aDate = parseToDate(dateAssigned);
    if (!aDate) return '';
    const d = new Date(aDate);

    let months = 3; // Default employee assigned
    if (sAssigned === 'on shelf') {
      months = 12;
    } else if (sLoc === 'northern lights' || sLoc.includes('northern lights')) {
      months = 6;
    } else if (
      sAssigned === 'packed for delivery' ||
      sAssigned === 'packed for testing' ||
      sAssigned === 'in testing'
    ) {
      months = 3;
    }

    d.setMonth(d.getMonth() + months);
    return formatDateStr(d);
  }

  createModalHtml() {
    if (document.getElementById('new-item-modal')) return;

    const modal = document.createElement('div');
    modal.id = 'new-item-modal';
    modal.className = 'modal-backdrop';
    modal.style.display = 'none';

    modal.innerHTML = `
      <div class="modal-dialog" style="max-width: 620px; max-height: 90vh; overflow-y: auto;">
        <div class="modal-header">
          <div style="display: flex; align-items: center; gap: 8px;">
            <span style="font-size: 20px;" id="new-item-modal-icon">📦</span>
            <h3 style="margin: 0; font-size: 17px;" id="new-item-modal-title">Add New Equipment Item</h3>
          </div>
          <button type="button" class="modal-close-btn" onclick="window.inventoryManager.closeModal()">&times;</button>
        </div>

        <div class="modal-body" style="padding: 16px 20px;">
          <!-- Category & Origin Reason Selectors -->
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 14px;">
            <div class="form-group" style="margin-bottom: 0;">
              <label style="display: block; font-size: 11.5px; font-weight: 700; color: var(--text-muted); margin-bottom: 5px;">EQUIPMENT CATEGORY</label>
              <select id="new-item-category" class="form-control" style="width: 100%; padding: 8px 10px; border-radius: 6px; background: var(--bg-secondary); color: var(--text-main); border: 1px solid var(--border-color); font-size: 13px; font-weight: 600;" onchange="window.inventoryManager.onCategoryChanged()">
                <option value="gloves">🧤 Gloves (Rubber Gloves)</option>
                <option value="sleeves">🦺 Sleeves (Rubber Sleeves)</option>
                <option value="blankets">🧱 Blankets (Insulating Blankets)</option>
                <option value="macks">🧱 MACKs (Mechanical Jumpers)</option>
                <option value="hv_testers">⚡ HV Testers (High Voltage Testers)</option>
                <option value="phasing_sets">⚡ Phasing Sets (Voltage Phasing Sets)</option>
                <option value="aed">🏥 AED (Automated External Defibrillator)</option>
                <option value="grounds">⚡ Grounds (Overhead / Underground Grounds)</option>
                <option value="hot_sticks">🔴 Hot Sticks (Live-Line Tools)</option>
              </select>
            </div>

            <div class="form-group" style="margin-bottom: 0;">
              <label style="display: block; font-size: 11.5px; font-weight: 700; color: var(--text-muted); margin-bottom: 5px;">ADDITION REASON / ORIGIN *</label>
              <select id="new-item-origin-reason" class="form-control" style="width: 100%; padding: 8px 10px; border-radius: 6px; background: var(--bg-secondary); color: var(--text-main); border: 1px solid var(--border-color); font-size: 13px; font-weight: 600;" onchange="window.inventoryManager.onOriginReasonChanged()">
                <option value="New Purchase">✨ New Purchase</option>
                <option value="Made From Failed Pairs" id="opt-failed-pairs">🧤 Made From Failed Pairs</option>
                <option value="Lost Item Found">🔍 Lost Item Found</option>
              </select>
            </div>
          </div>

          <!-- Dynamic Form Fields Container -->
          <div id="new-item-fields-container"></div>

          <!-- Live Calculated Preview -->
          <div style="margin-top: 14px; padding: 12px 14px; background: rgba(59, 130, 246, 0.08); border: 1px solid rgba(59, 130, 246, 0.25); border-radius: 8px;">
            <div style="font-size: 11px; font-weight: 700; color: #60a5fa; text-transform: uppercase; margin-bottom: 4px;">Calculated Due Date Preview</div>
            <div style="display: flex; align-items: center; justify-content: space-between;">
              <span style="font-size: 13px; color: var(--text-main);">Change Out / Recertification Date:</span>
              <span id="new-item-preview-change-out" style="font-size: 14px; font-weight: 700; color: #38bdf8;">—</span>
            </div>
          </div>
        </div>

        <div class="modal-footer" style="padding: 12px 20px; display: flex; justify-content: flex-end; gap: 10px; border-top: 1px solid var(--border-color);">
          <button type="button" class="btn btn-secondary" onclick="window.inventoryManager.closeModal()">Cancel</button>
          <button type="button" class="btn" id="new-item-submit-btn" style="background: #2563eb; color: white;" onclick="window.inventoryManager.submitNewItem()">
            💾 Save Item to Inventory
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);
    this.modalEl = modal;
  }

  bindEvents() {
    // Escape key closes modal
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.modalEl && this.modalEl.style.display !== 'none') {
        this.closeModal();
      }
    });
  }

  showNewItemModal(defaultCategory = null) {
    if (!this.modalEl) this.createModalHtml();

    const categorySelect = document.getElementById('new-item-category');
    const originSelect = document.getElementById('new-item-origin-reason');
    if (originSelect) originSelect.value = 'New Purchase';

    if (defaultCategory) {
      // Map sheet keys to category values
      const valid = ['gloves', 'sleeves', 'blankets', 'macks', 'hv_testers', 'phasing_sets', 'aed', 'grounds', 'hot_sticks'];
      const normalized = defaultCategory.toLowerCase().replace(/[\s-]/g, '_');
      if (valid.includes(normalized)) {
        categorySelect.value = normalized;
      } else if (normalized.includes('glove')) categorySelect.value = 'gloves';
      else if (normalized.includes('sleeve')) categorySelect.value = 'sleeves';
      else if (normalized.includes('blanket')) categorySelect.value = 'blankets';
      else if (normalized.includes('mack')) categorySelect.value = 'macks';
      else if (normalized.includes('hv')) categorySelect.value = 'hv_testers';
      else if (normalized.includes('phas')) categorySelect.value = 'phasing_sets';
      else if (normalized.includes('aed')) categorySelect.value = 'aed';
      else if (normalized.includes('ground')) categorySelect.value = 'grounds';
      else if (normalized.includes('stick') || normalized.includes('hot')) categorySelect.value = 'hot_sticks';
    }

    this.onCategoryChanged();
    this.modalEl.style.display = 'flex';
  }

  closeModal() {
    if (this.modalEl) {
      this.modalEl.style.display = 'none';
    }
  }

  onCategoryChanged() {
    const cat = document.getElementById('new-item-category').value;
    const originSelect = document.getElementById('new-item-origin-reason');
    const optFailedPairs = document.getElementById('opt-failed-pairs');
    const container = document.getElementById('new-item-fields-container');
    const titleEl = document.getElementById('new-item-modal-title');
    const iconEl = document.getElementById('new-item-modal-icon');

    // Toggle Made From Failed Pairs option (only allowed on Gloves & Sleeves)
    const isGlovesOrSleeves = (cat === 'gloves' || cat === 'sleeves');
    if (optFailedPairs) {
      optFailedPairs.style.display = isGlovesOrSleeves ? 'block' : 'none';
      optFailedPairs.disabled = !isGlovesOrSleeves;
      if (!isGlovesOrSleeves && originSelect && originSelect.value === 'Made From Failed Pairs') {
        originSelect.value = 'New Purchase';
      }
    }

    // Get today in YYYY-MM-DD for date defaults
    const today = new Date();
    const todayIso = today.toISOString().split('T')[0];

    // Build employees list for assignment dropdown
    const empTable = this.db.getTable('employees');
    const employees = (empTable && empTable.rows) ? empTable.rows : [];
    const empOptions = employees
      .map(e => {
        const name = String(e['Name'] || e['Employee Name'] || '').trim();
        const loc = String(e['Location'] || '').trim();
        const crew = String(e['Job Number'] || e['Job #'] || '').trim();
        return name ? `<option value="${name}" data-location="${loc}" data-crew="${crew}">${name} (${loc || 'No Loc'}${crew ? ' • ' + crew : ''})</option>` : '';
      })
      .filter(Boolean)
      .join('');

    let fieldsHtml = '';

    if (cat === 'gloves' || cat === 'sleeves') {
      const isGlove = cat === 'gloves';
      iconEl.textContent = isGlove ? '🧤' : '🦺';
      titleEl.textContent = isGlove ? 'Add New Rubber Glove' : 'Add New Rubber Sleeve';

      const sizes = isGlove
        ? ['8', '8.5', '9', '9.5', '10', '10.5', '11', '12']
        : ['18', '20', '22', '24', '26'];

      fieldsHtml = `
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 12px;">
          <div>
            <label style="display: block; font-size: 11.5px; font-weight: 700; margin-bottom: 4px;">ITEM # *</label>
            <input type="text" id="f-item-num" class="form-control" placeholder="e.g., 2045, S-1102" required oninput="window.inventoryManager.onItemNumChanged()">
            <div id="f-item-num-feedback" style="font-size: 11px; margin-top: 3px; min-height: 14px;"></div>
          </div>
          <div>
            <label style="display: block; font-size: 11.5px; font-weight: 700; margin-bottom: 4px;">ESL ID (BARCODE)</label>
            <input type="text" id="f-esl-id" class="form-control" placeholder="e.g., ESL-889421" oninput="window.inventoryManager.onItemNumChanged()">
          </div>
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 12px;">
          <div>
            <label style="display: block; font-size: 11.5px; font-weight: 700; margin-bottom: 4px;">SIZE *</label>
            <select id="f-size" class="form-control" onchange="window.inventoryManager.updatePreview()">
              ${sizes.map(s => `<option value="${s}">${s}</option>`).join('')}
            </select>
          </div>
          <div>
            <label style="display: block; font-size: 11.5px; font-weight: 700; margin-bottom: 4px;">CLASS *</label>
            <select id="f-class" class="form-control" onchange="window.inventoryManager.updatePreview()">
              ${isGlove ? '<option value="0">Class 0</option>' : ''}
              <option value="2" selected>Class 2</option>
              <option value="3">Class 3</option>
            </select>
          </div>
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 12px;">
          <div>
            <label style="display: block; font-size: 11.5px; font-weight: 700; margin-bottom: 4px;">TEST DATE</label>
            <input type="date" id="f-test-date" class="form-control" value="${todayIso}" onchange="window.inventoryManager.updatePreview()">
          </div>
          <div>
            <label style="display: block; font-size: 11.5px; font-weight: 700; margin-bottom: 4px;">DATE ASSIGNED</label>
            <input type="date" id="f-date-assigned" class="form-control" value="${todayIso}" onchange="window.inventoryManager.updatePreview()">
          </div>
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 12px;">
          <div>
            <label style="display: block; font-size: 11.5px; font-weight: 700; margin-bottom: 4px;">STATUS</label>
            <select id="f-status" class="form-control" onchange="window.inventoryManager.onStatusChanged()">
              <option value="On Shelf" selected>On Shelf (Helena Stock)</option>
              <option value="Assigned">Assigned (To Employee)</option>
              <option value="Ready For Delivery">Ready For Delivery (On Truck)</option>
              <option value="Ready For Test">Ready For Test (Packed)</option>
              <option value="In Testing">In Testing (At Lab)</option>
            </select>
          </div>
          <div>
            <label style="display: block; font-size: 11.5px; font-weight: 700; margin-bottom: 4px;">LOCATION</label>
            <input type="text" id="f-location" class="form-control" value="Helena" oninput="window.inventoryManager.updatePreview()">
          </div>
        </div>

        <div style="margin-bottom: 12px;" id="assigned-to-group">
          <label style="display: block; font-size: 11.5px; font-weight: 700; margin-bottom: 4px;">ASSIGNED TO</label>
          <div id="assigned-to-control-wrapper">
            <input type="text" id="f-assigned-to" class="form-control" value="On Shelf" oninput="window.inventoryManager.updatePreview()">
          </div>
        </div>

        <div style="margin-bottom: 12px;">
          <label style="display: block; font-size: 11.5px; font-weight: 700; margin-bottom: 4px;">NOTES</label>
          <input type="text" id="f-notes" class="form-control" placeholder="Optional notes...">
        </div>
      `;
    } else if (cat === 'blankets') {
      iconEl.textContent = '🧱';
      titleEl.textContent = 'Add New Insulating Blanket';
      fieldsHtml = `
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 12px;">
          <div>
            <label style="display: block; font-size: 11.5px; font-weight: 700; margin-bottom: 4px;">BLANKET ITEM # *</label>
            <input type="text" id="f-item-num" class="form-control" placeholder="e.g., B104, S208" required oninput="window.inventoryManager.onItemNumChanged()">
            <div id="f-item-num-feedback" style="font-size: 11px; margin-top: 3px; min-height: 14px;"></div>
          </div>
          <div>
            <label style="display: block; font-size: 11.5px; font-weight: 700; margin-bottom: 4px;">TYPE *</label>
            <select id="f-type" class="form-control">
              <option value="Regular">Regular Blanket</option>
              <option value="Split">Split Blanket</option>
            </select>
          </div>
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 12px;">
          <div>
            <label style="display: block; font-size: 11.5px; font-weight: 700; margin-bottom: 4px;">CLASS *</label>
            <select id="f-class" class="form-control">
              <option value="2">Class 2</option>
              <option value="4" selected>Class 4</option>
            </select>
          </div>
          <div>
            <label style="display: block; font-size: 11.5px; font-weight: 700; margin-bottom: 4px;">TEST DATE *</label>
            <input type="date" id="f-test-date" class="form-control" value="${todayIso}" onchange="window.inventoryManager.updatePreview()">
          </div>
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 12px;">
          <div>
            <label style="display: block; font-size: 11.5px; font-weight: 700; margin-bottom: 4px;">STATUS</label>
            <select id="f-status" class="form-control" onchange="window.inventoryManager.onStatusChanged()">
              <option value="On Shelf" selected>On Shelf (Helena Stock)</option>
              <option value="Assigned">Assigned (To Crew)</option>
              <option value="In Testing">In Testing</option>
            </select>
          </div>
          <div>
            <label style="display: block; font-size: 11.5px; font-weight: 700; margin-bottom: 4px;">LOCATION</label>
            <input type="text" id="f-location" class="form-control" value="Helena" oninput="window.inventoryManager.updatePreview()">
          </div>
        </div>

        <div style="margin-bottom: 12px;">
          <label style="display: block; font-size: 11.5px; font-weight: 700; margin-bottom: 4px;">ASSIGNED TO / CREW LEAD</label>
          <input type="text" id="f-assigned-to" class="form-control" value="On Shelf" oninput="window.inventoryManager.updatePreview()">
        </div>

        <div style="margin-bottom: 12px;">
          <label style="display: block; font-size: 11.5px; font-weight: 700; margin-bottom: 4px;">NOTES</label>
          <input type="text" id="f-notes" class="form-control" placeholder="Optional notes...">
        </div>
      `;
    } else if (cat === 'macks') {
      iconEl.textContent = '🧱';
      titleEl.textContent = 'Add New MACK (Mechanical Jumper)';
      fieldsHtml = `
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 12px;">
          <div>
            <label style="display: block; font-size: 11.5px; font-weight: 700; margin-bottom: 4px;">MACK ITEM # (ESL ID) *</label>
            <input type="text" id="f-item-num" class="form-control" placeholder="e.g., 64977789" required oninput="window.inventoryManager.onItemNumChanged()">
            <div id="f-item-num-feedback" style="font-size: 11px; margin-top: 3px; min-height: 14px;"></div>
          </div>
          <div>
            <label style="display: block; font-size: 11.5px; font-weight: 700; margin-bottom: 4px;">KV RATING</label>
            <input type="text" id="f-kv" class="form-control" placeholder="e.g., 15KV, 25KV, 35KV" value="15KV">
          </div>
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 12px;">
          <div>
            <label style="display: block; font-size: 11.5px; font-weight: 700; margin-bottom: 4px;">SIZE / CONDUCTOR</label>
            <input type="text" id="f-size" class="form-control" placeholder="e.g., #2, 1/0, 2/0, 4/0" value="1/0">
          </div>
          <div>
            <label style="display: block; font-size: 11.5px; font-weight: 700; margin-bottom: 4px;">LENGTH</label>
            <input type="text" id="f-length" class="form-control" placeholder="e.g., 6 ft, 8 ft, 12 ft" value="8 ft">
          </div>
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 12px;">
          <div>
            <label style="display: block; font-size: 11.5px; font-weight: 700; margin-bottom: 4px;">TEST DATE *</label>
            <input type="date" id="f-test-date" class="form-control" value="${todayIso}" onchange="window.inventoryManager.updatePreview()">
          </div>
          <div>
            <label style="display: block; font-size: 11.5px; font-weight: 700; margin-bottom: 4px;">STATUS</label>
            <select id="f-status" class="form-control" onchange="window.inventoryManager.onStatusChanged()">
              <option value="On Shelf" selected>On Shelf (Helena Stock)</option>
              <option value="Assigned">Assigned (To Crew)</option>
              <option value="In Testing">In Testing</option>
            </select>
          </div>
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 12px;">
          <div>
            <label style="display: block; font-size: 11.5px; font-weight: 700; margin-bottom: 4px;">LOCATION</label>
            <input type="text" id="f-location" class="form-control" value="Helena" oninput="window.inventoryManager.updatePreview()">
          </div>
          <div>
            <label style="display: block; font-size: 11.5px; font-weight: 700; margin-bottom: 4px;">ASSIGNED TO / CREW LEAD</label>
            <input type="text" id="f-assigned-to" class="form-control" value="On Shelf" oninput="window.inventoryManager.updatePreview()">
          </div>
        </div>

        <div style="margin-bottom: 12px;">
          <label style="display: block; font-size: 11.5px; font-weight: 700; margin-bottom: 4px;">NOTES</label>
          <input type="text" id="f-notes" class="form-control" placeholder="Optional notes...">
        </div>
      `;
    } else if (cat === 'hv_testers' || cat === 'phasing_sets') {
      const isHV = cat === 'hv_testers';
      iconEl.textContent = '⚡';
      titleEl.textContent = isHV ? 'Add New HV Tester' : 'Add New Phasing Set';

      fieldsHtml = `
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 12px;">
          <div>
            <label style="display: block; font-size: 11.5px; font-weight: 700; margin-bottom: 4px;">ITEM # *</label>
            <input type="text" id="f-item-num" class="form-control" placeholder="e.g., HVT-04, PS-12" required oninput="window.inventoryManager.onItemNumChanged()">
            <div id="f-item-num-feedback" style="font-size: 11px; margin-top: 3px; min-height: 14px;"></div>
          </div>
          <div>
            <label style="display: block; font-size: 11.5px; font-weight: 700; margin-bottom: 4px;">MODEL</label>
            <select id="f-model" class="form-control">
              <option value="Chance">Chance</option>
              <option value="HD Electric">HD Electric</option>
              <option value="Megger">Megger</option>
              <option value="Other">Other</option>
            </select>
          </div>
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 12px;">
          <div>
            <label style="display: block; font-size: 11.5px; font-weight: 700; margin-bottom: 4px;">KV RATING</label>
            <input type="text" id="f-kv" class="form-control" placeholder="e.g., 69, 138, 230" value="69">
          </div>
          <div>
            <label style="display: block; font-size: 11.5px; font-weight: 700; margin-bottom: 4px;">SERIAL #</label>
            <input type="text" id="f-serial-num" class="form-control" placeholder="Enter serial number">
          </div>
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 12px;">
          <div>
            <label style="display: block; font-size: 11.5px; font-weight: 700; margin-bottom: 4px;">CALIBRATION DATE *</label>
            <input type="date" id="f-cal-date" class="form-control" value="${todayIso}" onchange="window.inventoryManager.updatePreview()">
          </div>
          <div>
            <label style="display: block; font-size: 11.5px; font-weight: 700; margin-bottom: 4px;">STATUS</label>
            <select id="f-status" class="form-control" onchange="window.inventoryManager.onStatusChanged()">
              <option value="On Shelf" selected>On Shelf (Helena Stock)</option>
              <option value="Assigned">Assigned (To Crew)</option>
              <option value="In Testing">In Testing</option>
            </select>
          </div>
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 12px;">
          <div>
            <label style="display: block; font-size: 11.5px; font-weight: 700; margin-bottom: 4px;">LOCATION</label>
            <input type="text" id="f-location" class="form-control" value="Helena" oninput="window.inventoryManager.updatePreview()">
          </div>
          <div>
            <label style="display: block; font-size: 11.5px; font-weight: 700; margin-bottom: 4px;">ASSIGNED TO / CREW LEAD</label>
            <input type="text" id="f-assigned-to" class="form-control" value="On Shelf" oninput="window.inventoryManager.updatePreview()">
          </div>
        </div>

        <div style="margin-bottom: 12px;">
          <label style="display: block; font-size: 11.5px; font-weight: 700; margin-bottom: 4px;">NOTES</label>
          <input type="text" id="f-notes" class="form-control" placeholder="Optional notes...">
        </div>
      `;
    } else if (cat === 'aed') {
      iconEl.textContent = '🏥';
      titleEl.textContent = 'Add New AED Unit';
      fieldsHtml = `
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 12px;">
          <div>
            <label style="display: block; font-size: 11.5px; font-weight: 700; margin-bottom: 4px;">AED ITEM # *</label>
            <input type="text" id="f-item-num" class="form-control" placeholder="e.g., AED-01, TRUCK-5" required oninput="window.inventoryManager.onItemNumChanged()">
            <div id="f-item-num-feedback" style="font-size: 11px; margin-top: 3px; min-height: 14px;"></div>
          </div>
          <div>
            <label style="display: block; font-size: 11.5px; font-weight: 700; margin-bottom: 4px;">MODEL</label>
            <input type="text" id="f-model" class="form-control" placeholder="e.g., Zoll AED Plus, Philips" value="Zoll AED Plus">
          </div>
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 12px;">
          <div>
            <label style="display: block; font-size: 11.5px; font-weight: 700; margin-bottom: 4px;">PAD EXPIRATION DATE *</label>
            <input type="date" id="f-pad-exp" class="form-control" onchange="window.inventoryManager.updatePreview()">
          </div>
          <div>
            <label style="display: block; font-size: 11.5px; font-weight: 700; margin-bottom: 4px;">BATTERY EXPIRATION DATE</label>
            <input type="date" id="f-bat-exp" class="form-control" onchange="window.inventoryManager.updatePreview()">
          </div>
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 12px;">
          <div>
            <label style="display: block; font-size: 11.5px; font-weight: 700; margin-bottom: 4px;">STATUS</label>
            <select id="f-status" class="form-control" onchange="window.inventoryManager.onStatusChanged()">
              <option value="On Shelf" selected>On Shelf (Helena Stock)</option>
              <option value="Assigned">Assigned (To Crew)</option>
            </select>
          </div>
          <div>
            <label style="display: block; font-size: 11.5px; font-weight: 700; margin-bottom: 4px;">LOCATION</label>
            <input type="text" id="f-location" class="form-control" value="Helena" oninput="window.inventoryManager.updatePreview()">
          </div>
        </div>

        <div style="margin-bottom: 12px;">
          <label style="display: block; font-size: 11.5px; font-weight: 700; margin-bottom: 4px;">ASSIGNED TO / CREW LEAD</label>
          <input type="text" id="f-assigned-to" class="form-control" value="On Shelf" oninput="window.inventoryManager.updatePreview()">
        </div>

        <div style="margin-bottom: 12px;">
          <label style="display: block; font-size: 11.5px; font-weight: 700; margin-bottom: 4px;">NOTES</label>
          <input type="text" id="f-notes" class="form-control" placeholder="Optional notes...">
        </div>
      `;
    } else if (cat === 'grounds') {
      iconEl.textContent = '⚡';
      titleEl.textContent = 'Add New Electrical Ground Set';
      fieldsHtml = `
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 12px;">
          <div>
            <label style="display: block; font-size: 11.5px; font-weight: 700; margin-bottom: 4px;">SERIAL # / ITEM # *</label>
            <input type="text" id="f-item-num" class="form-control" placeholder="e.g., GND-552, 98401" required oninput="window.inventoryManager.onItemNumChanged()">
            <div id="f-item-num-feedback" style="font-size: 11px; margin-top: 3px; min-height: 14px;"></div>
          </div>
          <div>
            <label style="display: block; font-size: 11.5px; font-weight: 700; margin-bottom: 4px;">TYPE *</label>
            <select id="f-type" class="form-control">
              <option value="OH">OH (Overhead)</option>
              <option value="UG">UG (Underground)</option>
            </select>
          </div>
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 12px;">
          <div>
            <label style="display: block; font-size: 11.5px; font-weight: 700; margin-bottom: 4px;">SIZE / CONDUCTOR</label>
            <select id="f-size" class="form-control">
              <option value="2/0">2/0</option>
              <option value="4/0" selected>4/0</option>
            </select>
          </div>
          <div>
            <label style="display: block; font-size: 11.5px; font-weight: 700; margin-bottom: 4px;">LENGTH</label>
            <input type="text" id="f-length" class="form-control" placeholder="e.g., 6 ft, 8 ft" value="6 ft">
          </div>
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 12px;">
          <div>
            <label style="display: block; font-size: 11.5px; font-weight: 700; margin-bottom: 4px;">TEST DATE *</label>
            <input type="date" id="f-test-date" class="form-control" value="${todayIso}" onchange="window.inventoryManager.updatePreview()">
          </div>
          <div>
            <label style="display: block; font-size: 11.5px; font-weight: 700; margin-bottom: 4px;">STATUS</label>
            <select id="f-status" class="form-control" onchange="window.inventoryManager.onStatusChanged()">
              <option value="On Shelf" selected>On Shelf (Helena Stock)</option>
              <option value="Assigned">Assigned (To Crew)</option>
              <option value="In Testing">In Testing</option>
            </select>
          </div>
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 12px;">
          <div>
            <label style="display: block; font-size: 11.5px; font-weight: 700; margin-bottom: 4px;">LOCATION</label>
            <input type="text" id="f-location" class="form-control" value="Helena" oninput="window.inventoryManager.updatePreview()">
          </div>
          <div>
            <label style="display: block; font-size: 11.5px; font-weight: 700; margin-bottom: 4px;">ASSIGNED TO / CREW LEAD</label>
            <input type="text" id="f-assigned-to" class="form-control" value="On Shelf" oninput="window.inventoryManager.updatePreview()">
          </div>
        </div>

        <div style="margin-bottom: 12px;">
          <label style="display: block; font-size: 11.5px; font-weight: 700; margin-bottom: 4px;">NOTES</label>
          <input type="text" id="f-notes" class="form-control" placeholder="Optional notes...">
        </div>
      `;
    } else if (cat === 'hot_sticks') {
      iconEl.textContent = '🔴';
      titleEl.textContent = 'Add New Hot Stick (Live-Line Tool)';
      fieldsHtml = `
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 12px;">
          <div>
            <label style="display: block; font-size: 11.5px; font-weight: 700; margin-bottom: 4px;">STICK ITEM # *</label>
            <input type="text" id="f-item-num" class="form-control" placeholder="e.g., HS-10, TEL-04" required oninput="window.inventoryManager.onItemNumChanged()">
            <div id="f-item-num-feedback" style="font-size: 11px; margin-top: 3px; min-height: 14px;"></div>
          </div>
          <div>
            <label style="display: block; font-size: 11.5px; font-weight: 700; margin-bottom: 4px;">TYPE *</label>
            <select id="f-type" class="form-control">
              <option value="Telescopic">Telescopic (Extendo)</option>
              <option value="Shotgun">Shotgun / Grip-All</option>
              <option value="Universal Stick">Universal Stick</option>
              <option value="Disconnect Stick">Disconnect Stick</option>
            </select>
          </div>
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 12px;">
          <div>
            <label style="display: block; font-size: 11.5px; font-weight: 700; margin-bottom: 4px;">LENGTH</label>
            <input type="text" id="f-length" class="form-control" placeholder="e.g., 8 ft, 35 ft" value="8 ft">
          </div>
          <div>
            <label style="display: block; font-size: 11.5px; font-weight: 700; margin-bottom: 4px;">TEST DATE * (2-YR CYCLE)</label>
            <input type="date" id="f-test-date" class="form-control" value="${todayIso}" onchange="window.inventoryManager.updatePreview()">
          </div>
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 12px;">
          <div>
            <label style="display: block; font-size: 11.5px; font-weight: 700; margin-bottom: 4px;">STATUS</label>
            <select id="f-status" class="form-control" onchange="window.inventoryManager.onStatusChanged()">
              <option value="On Shelf" selected>On Shelf (Helena Stock)</option>
              <option value="Assigned">Assigned (To Crew)</option>
              <option value="In Testing">In Testing</option>
            </select>
          </div>
          <div>
            <label style="display: block; font-size: 11.5px; font-weight: 700; margin-bottom: 4px;">LOCATION</label>
            <input type="text" id="f-location" class="form-control" value="Helena" oninput="window.inventoryManager.updatePreview()">
          </div>
        </div>

        <div style="margin-bottom: 12px;">
          <label style="display: block; font-size: 11.5px; font-weight: 700; margin-bottom: 4px;">ASSIGNED TO / CREW LEAD</label>
          <input type="text" id="f-assigned-to" class="form-control" value="On Shelf" oninput="window.inventoryManager.updatePreview()">
        </div>

        <div style="margin-bottom: 12px;">
          <label style="display: block; font-size: 11.5px; font-weight: 700; margin-bottom: 4px;">NOTES</label>
          <input type="text" id="f-notes" class="form-control" placeholder="Optional notes...">
        </div>
      `;
    }

    container.innerHTML = fieldsHtml;
    this.updatePreview();
  }

  checkDuplicate(cat, itemNum, eslId = '') {
    const table = this.db.getTable(cat);
    if (!table || !table.rows || !itemNum) return null;

    const cleanNum = String(itemNum).trim().toLowerCase();
    const cleanEsl = String(eslId || '').trim().toLowerCase();
    const isNumOnly = /^\d+$/.test(cleanNum);
    const parsedCleanNum = isNumOnly ? parseInt(cleanNum, 10) : null;

    for (const r of table.rows) {
      const firstKey = Object.keys(r)[0] || 'Item #';
      const rNum = String(r['Item #'] || r['Glove'] || r['Sleeve'] || r['Blanket'] || r['Serial #'] || r[firstKey] || '').trim().toLowerCase();
      const rEsl = String(r['ESL ID'] || '').trim().toLowerCase();

      if (cleanNum && (rNum === cleanNum || (isNumOnly && /^\d+$/.test(rNum) && parseInt(rNum, 10) === parsedCleanNum))) {
        return { field: 'itemNum', value: rNum, existingRow: r };
      }
      if (cleanEsl && rEsl && rEsl === cleanEsl) {
        return { field: 'eslId', value: rEsl, existingRow: r };
      }
    }
    return null;
  }

  onItemNumChanged() {
    const cat = document.getElementById('new-item-category')?.value;
    if (!cat) return;
    const itemNumInput = document.getElementById('f-item-num');
    const eslInput = document.getElementById('f-esl-id');
    const itemNum = (itemNumInput?.value || '').trim();
    const eslId = (eslInput?.value || '').trim();
    const feedback = document.getElementById('f-item-num-feedback');
    const submitBtn = document.getElementById('new-item-submit-btn');

    if (!itemNum) {
      if (feedback) feedback.innerHTML = '';
      if (itemNumInput) itemNumInput.style.borderColor = 'var(--border-color)';
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.style.opacity = '1';
      }
      this.updatePreview();
      return;
    }

    const dup = this.checkDuplicate(cat, itemNum, eslId);
    if (dup) {
      const assigned = dup.existingRow['Assigned To'] || dup.existingRow['Status'] || 'In Inventory';
      const loc = dup.existingRow['Location'] || 'Helena';
      if (feedback) {
        feedback.innerHTML = `<span style="color: #ef4444; font-weight: 600;">⛔ Item #${itemNum} already exists (${assigned} • ${loc})</span>`;
      }
      if (itemNumInput) itemNumInput.style.borderColor = '#ef4444';
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.style.opacity = '0.5';
        submitBtn.title = 'Duplicate item number not allowed';
      }
    } else {
      if (feedback) {
        feedback.innerHTML = `<span style="color: #10b981; font-weight: 600;">✓ Item #${itemNum} available</span>`;
      }
      if (itemNumInput) itemNumInput.style.borderColor = '#10b981';
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.style.opacity = '1';
        submitBtn.title = '';
      }
    }

    this.updatePreview();
  }

  onOriginReasonChanged() {
    const originVal = document.getElementById('new-item-origin-reason') ? document.getElementById('new-item-origin-reason').value : 'New Purchase';
    const notesInput = document.getElementById('f-notes');
    if (notesInput) {
      if (originVal === 'Made From Failed Pairs') {
        notesInput.placeholder = 'Optional details (e.g., Paired from glove #1024)...';
      } else if (originVal === 'Lost Item Found') {
        notesInput.placeholder = 'Optional details (e.g., Found in truck #4 / Bozeman dock)...';
      } else {
        notesInput.placeholder = 'Optional additional notes (e.g., PO #)...';
      }
    }
    this.updatePreview();
  }

  onStatusChanged() {
    const statusVal = (document.getElementById('f-status').value || '').trim();
    const locInput = document.getElementById('f-location');
    const assignedInput = document.getElementById('f-assigned-to');

    if (!locInput || !assignedInput) return;

    if (statusVal === 'On Shelf' || statusVal === 'In Stock') {
      locInput.value = 'Helena';
      assignedInput.value = 'On Shelf';
    } else if (statusVal === 'Ready For Delivery') {
      locInput.value = "Cody's Truck";
      assignedInput.value = 'Packed For Delivery';
    } else if (statusVal === 'Ready For Test') {
      locInput.value = "Cody's Truck";
      assignedInput.value = 'Packed For Testing';
    } else if (statusVal === 'In Testing') {
      locInput.value = 'Arnett / JM Test';
      assignedInput.value = 'In Testing';
    } else if (statusVal === 'Assigned') {
      if (assignedInput.value === 'On Shelf' || assignedInput.value === 'Packed For Delivery' || assignedInput.value === 'In Testing') {
        assignedInput.value = '';
      }
    }
    this.updatePreview();
  }

  updatePreview() {
    const cat = document.getElementById('new-item-category') ? document.getElementById('new-item-category').value : 'gloves';
    const previewEl = document.getElementById('new-item-preview-change-out');
    if (!previewEl) return;

    const assignedTo = document.getElementById('f-assigned-to') ? document.getElementById('f-assigned-to').value : '';
    const location = document.getElementById('f-location') ? document.getElementById('f-location').value : '';
    const dateAssigned = document.getElementById('f-date-assigned') ? document.getElementById('f-date-assigned').value : '';
    const testDate = document.getElementById('f-test-date') ? document.getElementById('f-test-date').value : '';
    const calDate = document.getElementById('f-cal-date') ? document.getElementById('f-cal-date').value : '';
    const padExp = document.getElementById('f-pad-exp') ? document.getElementById('f-pad-exp').value : '';
    const batExp = document.getElementById('f-bat-exp') ? document.getElementById('f-bat-exp').value : '';

    const chgOut = this.calculateChangeOutDate(dateAssigned, location, assignedTo, cat, {
      testDate: testDate,
      calibrationDate: calDate,
      padExpiration: padExp,
      batteryExpiration: batExp
    });

    previewEl.textContent = chgOut || '—';
  }

  async submitNewItem() {
    const cat = document.getElementById('new-item-category').value;
    const itemNumInput = document.getElementById('f-item-num');
    const itemNum = itemNumInput ? itemNumInput.value.trim() : '';

    if (!itemNum) {
      alert('Please enter an Item # or Serial #.');
      if (itemNumInput) itemNumInput.focus();
      return;
    }

    const table = this.db.getTable(cat);

    // Hard Fail-Safe: Strictly block duplicate item numbers
    const dup = this.checkDuplicate(cat, itemNum, document.getElementById('f-esl-id')?.value);
    if (dup) {
      const assigned = dup.existingRow['Assigned To'] || dup.existingRow['Status'] || 'In Inventory';
      const loc = dup.existingRow['Location'] || 'Helena';
      alert(`⛔ Duplicate Error: Item #${itemNum} already exists in ${table ? table.name : cat}!\n\nCurrent Record:\n• Status / Assigned To: ${assigned}\n• Location: ${loc}\n\nDuplicate item numbers are not allowed.`);
      if (itemNumInput) {
        itemNumInput.focus();
        itemNumInput.select();
      }
      return;
    }

    const assignedTo = document.getElementById('f-assigned-to') ? document.getElementById('f-assigned-to').value.trim() : 'On Shelf';
    const location = document.getElementById('f-location') ? document.getElementById('f-location').value.trim() : 'Helena';
    const status = document.getElementById('f-status') ? document.getElementById('f-status').value.trim() : 'On Shelf';
    
    // Process Origin Reason and Notes for 1st entry
    const originReason = document.getElementById('new-item-origin-reason') ? document.getElementById('new-item-origin-reason').value.trim() : 'New Purchase';
    const userNotes = document.getElementById('f-notes') ? document.getElementById('f-notes').value.trim() : '';
    let notes = originReason;
    if (userNotes) {
      if (userNotes.toLowerCase().includes(originReason.toLowerCase())) {
        notes = userNotes;
      } else {
        notes = `${originReason} - ${userNotes}`;
      }
    }

    const rawTestDate = document.getElementById('f-test-date') ? document.getElementById('f-test-date').value : '';
    const rawDateAssigned = document.getElementById('f-date-assigned') ? document.getElementById('f-date-assigned').value : '';
    const rawCalDate = document.getElementById('f-cal-date') ? document.getElementById('f-cal-date').value : '';
    const rawPadExp = document.getElementById('f-pad-exp') ? document.getElementById('f-pad-exp').value : '';
    const rawBatExp = document.getElementById('f-bat-exp') ? document.getElementById('f-bat-exp').value : '';

    const formatToMdY = (dStr) => {
      if (!dStr) return '';
      if (dStr.includes('/')) return dStr;
      const parts = dStr.split('-');
      if (parts.length === 3) return `${parts[1]}/${parts[2]}/${parts[0]}`;
      return dStr;
    };

    const testDate = formatToMdY(rawTestDate);
    const dateAssigned = formatToMdY(rawDateAssigned);
    const calDate = formatToMdY(rawCalDate);
    const padExp = formatToMdY(rawPadExp);
    const batExp = formatToMdY(rawBatExp);

    const changeOutDate = this.calculateChangeOutDate(rawDateAssigned || rawTestDate || rawCalDate || rawPadExp, location, assignedTo, cat, {
      testDate: rawTestDate,
      calibrationDate: rawCalDate,
      padExpiration: rawPadExp,
      batteryExpiration: rawBatExp
    });

    let newRow = {};

    if (cat === 'gloves' || cat === 'sleeves') {
      const isGlove = cat === 'gloves';
      const itemHeader = isGlove ? 'Glove' : 'Sleeve';
      const eslId = document.getElementById('f-esl-id') ? document.getElementById('f-esl-id').value.trim() : '';
      const size = document.getElementById('f-size') ? document.getElementById('f-size').value : (isGlove ? '10' : '20');
      const itemClass = document.getElementById('f-class') ? document.getElementById('f-class').value : '2';

      newRow = {
        [itemHeader]: itemNum,
        'Item #': itemNum,
        'ESL ID': eslId,
        'Size': size,
        'Class': itemClass,
        'Test Date': testDate,
        'Date Assigned': dateAssigned,
        'Location': location,
        'Status': status,
        'Assigned To': assignedTo,
        'Change Out Date': changeOutDate,
        'Picked For': '',
        'Notes': notes
      };
    } else if (cat === 'blankets') {
      const bType = document.getElementById('f-type') ? document.getElementById('f-type').value : 'Regular';
      const bClass = document.getElementById('f-class') ? document.getElementById('f-class').value : '4';

      newRow = {
        'Blanket': itemNum,
        'Item #': itemNum,
        'Type': bType,
        'Class': bClass,
        'Test Date': testDate,
        'Date Assigned': dateAssigned || testDate,
        'Location': location,
        'Status': status,
        'Assigned To': assignedTo,
        'Change Out Date': changeOutDate,
        'Picked For': '',
        'Notes': notes
      };
    } else if (cat === 'macks') {
      const kv = document.getElementById('f-kv') ? document.getElementById('f-kv').value.trim() : '15KV';
      const size = document.getElementById('f-size') ? document.getElementById('f-size').value.trim() : '1/0';
      const len = document.getElementById('f-length') ? document.getElementById('f-length').value.trim() : '8 ft';

      newRow = {
        'MACK': itemNum,
        'Item #': itemNum,
        'ESL ID': itemNum,
        'KV': kv,
        'Size': size,
        'Length': len,
        'Test Date': testDate,
        'Date Assigned': dateAssigned || testDate,
        'Location': location,
        'Status': status,
        'Assigned To': assignedTo,
        'Change Out Date': changeOutDate,
        'Picked For': '',
        'Notes': notes
      };
    } else if (cat === 'hv_testers' || cat === 'phasing_sets') {
      const model = document.getElementById('f-model') ? document.getElementById('f-model').value : 'Chance';
      const kv = document.getElementById('f-kv') ? document.getElementById('f-kv').value.trim() : '69';
      const serial = document.getElementById('f-serial-num') ? document.getElementById('f-serial-num').value.trim() : '';

      newRow = {
        'Item #': itemNum,
        'Model': model,
        'KV': kv,
        'Serial #': serial,
        'Calibration Date': calDate,
        'Date Assigned': dateAssigned || calDate,
        'Location': location,
        'Status': status,
        'Assigned To': assignedTo,
        'Change Out Date': changeOutDate,
        'Picked For': '',
        'Notes': notes
      };
    } else if (cat === 'aed') {
      const model = document.getElementById('f-model') ? document.getElementById('f-model').value.trim() : 'Zoll AED Plus';

      newRow = {
        'Item #': itemNum,
        'Model': model,
        'Serial #': '',
        'Pad Expiration': padExp,
        'Date Assigned': dateAssigned,
        'Location': location,
        'Status': status,
        'Assigned To': assignedTo,
        'Battery Expiration': batExp,
        'Picked For': '',
        'Notes': notes
      };
    } else if (cat === 'grounds') {
      const gType = document.getElementById('f-type') ? document.getElementById('f-type').value : 'OH';
      const size = document.getElementById('f-size') ? document.getElementById('f-size').value : '4/0';
      const len = document.getElementById('f-length') ? document.getElementById('f-length').value.trim() : '6 ft';

      newRow = {
        'Serial #': itemNum,
        'Item #': itemNum,
        'Type': gType,
        'Size': size,
        'KV': '',
        'Length': len,
        'Test Date': testDate,
        'Date Assigned': dateAssigned || testDate,
        'Location': location,
        'Status': status,
        'Assigned To': assignedTo,
        'Change Out Date': changeOutDate,
        'Picked For': '',
        'Notes': notes
      };
    } else if (cat === 'hot_sticks') {
      const hType = document.getElementById('f-type') ? document.getElementById('f-type').value : 'Telescopic';
      const len = document.getElementById('f-length') ? document.getElementById('f-length').value.trim() : '8 ft';

      newRow = {
        'Item #': itemNum,
        'Type': hType,
        'Length': len,
        'Test Date': testDate,
        'Date Assigned': dateAssigned || testDate,
        'Location': location,
        'Status': status,
        'Assigned To': assignedTo,
        'Change Out Date': changeOutDate,
        'Picked For': '',
        'Notes': notes
      };
    }

    // Add row to LocalDatabase
    await this.db.addRow(cat, newRow);

    this.closeModal();

    // Switch to added sheet tab and refresh grid (clears filter so full list is visible with new item at the top)
    if (window.sheetNavigator) {
      window.sheetNavigator.currentSheetKey = cat;
      const searchInput = document.getElementById('sheet-search-input');
      if (searchInput) {
        searchInput.value = '';
        window.sheetNavigator.searchTerm = '';
      }
      window.sheetNavigator.renderTabsBar();
      window.sheetNavigator.renderCurrentSheet();
    }

    // Show toast
    this.showToast(`✅ Successfully added Item #${itemNum} to ${table ? table.name : cat}!`);
  }

  /**
   * Prompts user for confirmation and deletes an item from active inventory
   */
  async promptDeleteItem(itemNum, cat) {
    if (!itemNum || !cat) return;
    const table = this.db.getTable(cat);
    const sheetName = table ? table.name : cat;

    if (!confirm(`Are you sure you want to permanently delete Item #${itemNum} from ${sheetName}?\n\nThis will remove the item from the active inventory list.`)) {
      return;
    }

    const success = await this.db.deleteRow(cat, itemNum);
    if (success) {
      if (window.itemStatsEngine) window.itemStatsEngine.closeDossierModal();
      if (window.sheetNavigator) {
        window.sheetNavigator.renderCurrentSheet();
      }
      this.showToast(`🗑️ Permanently deleted Item #${itemNum} from ${sheetName}.`);
    } else {
      alert(`Could not find Item #${itemNum} in ${sheetName} to delete.`);
    }
  }

  showToast(msg) {
    const existing = document.getElementById('app-toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.id = 'app-toast';
    toast.style.cssText = `
      position: fixed;
      bottom: 24px;
      right: 24px;
      background: #1e293b;
      color: #f8fafc;
      padding: 12px 20px;
      border-radius: 8px;
      border: 1px solid #38bdf8;
      box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.5);
      font-size: 13.5px;
      font-weight: 600;
      z-index: 10000;
      animation: slideUp 0.25s ease-out;
    `;
    toast.textContent = msg;
    document.body.appendChild(toast);

    setTimeout(() => {
      if (toast) {
        if (typeof toast.remove === 'function') toast.remove();
        else if (toast.parentNode) toast.parentNode.removeChild(toast);
      }
    }, 4000);
  }

  /**
   * Recalculates all Change Out Dates in the specified equipment table
   */
  async recalculateAllChangeOutDates(tableKey = null) {
    const targetKeys = tableKey ? [tableKey] : ['gloves', 'sleeves', 'blankets', 'macks', 'hv_testers', 'phasing_sets', 'grounds', 'hot_sticks'];
    let fixedCount = 0;

    targetKeys.forEach(tKey => {
      const table = this.db.getTable(tKey);
      if (!table || !table.rows) return;

      table.rows.forEach((row, rIdx) => {
        const dateAssigned = row['Date Assigned'] || row['Test Date'] || row['Calibration Date'];
        const location = row['Location'];
        const assignedTo = row['Assigned To'];
        const currentChangeOut = row['Change Out Date'] || row['Pad Expiration'];

        if (!dateAssigned) return;

        const correct = this.calculateChangeOutDate(dateAssigned, location, assignedTo, tKey, {
          testDate: row['Test Date'],
          calibrationDate: row['Calibration Date'],
          padExpiration: row['Pad Expiration'],
          batteryExpiration: row['Battery Expiration']
        });

        if (correct && String(correct) !== String(currentChangeOut || '')) {
          row['Change Out Date'] = correct;
          fixedCount++;

          // Queue mutation
          const sheetRow = rIdx + 2;
          const colIdx = (table.headers || []).indexOf('Change Out Date') + 1;
          if (colIdx > 0) {
            this.db.queueMutation({
              action: 'UPDATE_CELL',
              sheetName: table.name,
              row: sheetRow,
              col: colIdx,
              header: 'Change Out Date',
              oldValue: currentChangeOut,
              value: correct
            });
          }
        }
      });
    });

    if (window.sheetNavigator) {
      window.sheetNavigator.renderCurrentSheet();
    }

    this.showToast(`Fixed ${fixedCount} Change Out Date(s) across inventory.`);
    return fixedCount;
  }
}

window.inventoryManager = new InventoryManager(window.localDB);
