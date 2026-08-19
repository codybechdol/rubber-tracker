/**
 * sheets.js - Interactive Sheet Navigator & Data Grid Renderer
 */

class SheetNavigator {
  constructor(db) {
    this.db = db;
    this.currentSheetKey = 'employees';
    this.searchTerm = '';
    this.sortCol = null;
    this.sortDir = 'asc';
    this.multiSort = ['Location', 'Job Number']; // Default automatic sort for Employees
    this.sheetList = [
      { key: 'employees', label: '👥 Employees', icon: '👤', isSwap: false },
      { key: 'job_tracking', label: '📋 Job Tracking', icon: '📋', isSwap: false },
      { key: 'gloves', label: '🧤 Gloves', icon: '🧤', isSwap: false },
      { key: 'glove_swaps', label: '🔄 Glove Swaps', icon: '🔄', isSwap: true },
      { key: 'sleeves', label: '🦺 Sleeves', icon: '🦺', isSwap: false },
      { key: 'sleeve_swaps', label: '🔄 Sleeve Swaps', icon: '🔄', isSwap: true },
      { key: 'blankets', label: '🧱 Blankets', icon: '🧱', isSwap: false },
      { key: 'blanket_swaps', label: '🔄 Blanket Swaps', icon: '🔄', isSwap: true },
      { key: 'macks', label: '🧱 MACKs', icon: '🧱', isSwap: false },
      { key: 'mack_swaps', label: '🔄 MACK Swaps', icon: '🔄', isSwap: true },
      { key: 'hv_testers', label: '⚡ HV Testers', icon: '⚡', isSwap: false },
      { key: 'hv_tester_swaps', label: '🔄 HV Tester Swaps', icon: '🔄', isSwap: true },
      { key: 'phasing_sets', label: '⚡ Phasing Sets', icon: '⚡', isSwap: false },
      { key: 'phasing_set_swaps', label: '🔄 Phasing Set Swaps', icon: '🔄', isSwap: true },
      { key: 'aed', label: '🏥 AED', icon: '🏥', isSwap: false },
      { key: 'aed_swaps', label: '🔄 AED Swaps', icon: '🔄', isSwap: true },
      { key: 'grounds', label: '⚡ Grounds', icon: '⚡', isSwap: false },
      { key: 'ground_swaps', label: '🔄 Ground Swaps', icon: '🔄', isSwap: true },
      { key: 'hot_sticks', label: '🔴 Hot Sticks', icon: '🔴', isSwap: false },
      { key: 'hot_stick_swaps', label: '🔄 Hot Stick Swaps', icon: '🔄', isSwap: true },
      { key: 'safety_compliance', label: '🛡️ Safety Compliance', icon: '🛡️', isSwap: false },
      { key: 'expiring_certs', label: '📜 Expiring Certs', icon: '📜', isSwap: false },
      { key: 'training_tracking', label: '📚 Training', icon: '📚', isSwap: false }
    ];
  }

  init() {
    this.renderTabsBar();
    this.setupSearch();
    this.renderCurrentSheet();
  }

  renderTabsBar() {
    const bar = document.getElementById('sheet-tabs-bar');
    if (!bar) return;
    bar.innerHTML = '';

    this.sheetList.forEach(sheet => {
      const btn = document.createElement('button');
      btn.className = 'sheet-tab-btn' + (sheet.key === this.currentSheetKey ? ' active' : '');
      btn.innerHTML = `<span>${sheet.icon}</span> ${sheet.label.replace(/^.*? /, '')}`;
      btn.onclick = () => {
        this.currentSheetKey = sheet.key;
        if (sheet.key === 'employees') {
          this.multiSort = ['Location', 'Job Number'];
          this.sortCol = null;
        } else if (sheet.key === 'job_tracking') {
          this.multiSort = ['Status', 'Job Number'];
          this.sortCol = null;
        } else {
          this.sortCol = null;
          this.multiSort = null;
        }
        this.sortDir = 'asc';
        this.renderTabsBar();
        this.renderCurrentSheet();
      };
      bar.appendChild(btn);
    });
  }

  setupSearch() {
    const input = document.getElementById('sheet-search-input');
    if (!input) return;
    input.addEventListener('input', (e) => {
      this.searchTerm = e.target.value.toLowerCase().trim();
      this.renderCurrentSheet();
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
    this.renderCurrentSheet();
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
      const col = findCol(['glove', 'sleeve', 'blanket', 'mack', 'item #', 'item', 'serial #', 'esl id']);
      if (this.sortCol === col) {
        this.sortDir = this.sortDir === 'asc' ? 'desc' : 'asc';
      } else {
        this.sortCol = col;
        this.sortDir = 'asc';
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
    } else if (type === 'classSize') {
      const classCol = findCol(['class']);
      const sizeCol = findCol(['size']);
      if (this.multiSort && this.multiSort[0] === classCol && this.multiSort[1] === sizeCol) {
        this.sortDir = this.sortDir === 'asc' ? 'desc' : 'asc';
      } else {
        this.multiSort = [classCol, sizeCol];
        this.sortCol = null;
        this.sortDir = 'asc';
      }
    } else if (type === 'location') {
      const col = findCol(['location']);
      if (this.sortCol === col) {
        this.sortDir = this.sortDir === 'asc' ? 'desc' : 'asc';
      } else {
        this.sortCol = col;
        this.sortDir = 'asc';
      }
      this.multiSort = null;
    } else if (type === 'status') {
      const col = findCol(['status', 'item status', 'job status']);
      if (this.sortCol === col) {
        this.sortDir = this.sortDir === 'asc' ? 'desc' : 'asc';
      } else {
        this.sortCol = col;
        this.sortDir = 'asc';
      }
      this.multiSort = null;
    } else if (type === 'assignedTo') {
      const col = findCol(['assigned to', 'assigned', 'crew lead']);
      if (this.sortCol === col) {
        this.sortDir = this.sortDir === 'asc' ? 'desc' : 'asc';
      } else {
        this.sortCol = col;
        this.sortDir = 'asc';
      }
      this.multiSort = null;
    } else if (type === 'changeOutDate') {
      const col = findCol(['change out date', 'change out', 'changeout']);
      if (this.sortCol === col) {
        this.sortDir = this.sortDir === 'asc' ? 'desc' : 'asc';
      } else {
        this.sortCol = col;
        this.sortDir = 'asc';
      }
      this.multiSort = null;
    } else if (type === 'type') {
      const col = findCol(['type']);
      if (this.sortCol === col) {
        this.sortDir = this.sortDir === 'asc' ? 'desc' : 'asc';
      } else {
        this.sortCol = col;
        this.sortDir = 'asc';
      }
      this.multiSort = null;
    } else if (type === 'kv') {
      const col = findCol(['kv']);
      if (this.sortCol === col) {
        this.sortDir = this.sortDir === 'asc' ? 'desc' : 'asc';
      } else {
        this.sortCol = col;
        this.sortDir = 'asc';
      }
      this.multiSort = null;
    } else if (type === 'jobNumber') {
      const col = findCol(['job number', 'job #']);
      if (this.sortCol === col) {
        this.sortDir = this.sortDir === 'asc' ? 'desc' : 'asc';
      } else {
        this.sortCol = col;
        this.sortDir = 'asc';
      }
      this.multiSort = null;
    } else if (type === 'statusJob') {
      const statusCol = findCol(['status', 'job status']);
      const jobCol = findCol(['job number', 'job #']);
      this.multiSort = [statusCol, jobCol];
      this.sortCol = null;
      this.sortDir = 'asc';
    } else if (type === 'locationJob') {
      const locCol = findCol(['location']);
      const jobCol = findCol(['job number', 'job #']);
      this.multiSort = [locCol, jobCol];
      this.sortCol = null;
      this.sortDir = 'asc';
    } else if (type === 'name') {
      const col = findCol(['employee name', 'name', 'employee']);
      if (this.sortCol === col) {
        this.sortDir = this.sortDir === 'asc' ? 'desc' : 'asc';
      } else {
        this.sortCol = col;
        this.sortDir = 'asc';
      }
      this.multiSort = null;
    }
    this.renderCurrentSheet();
  }

  setComplianceWeek(weekStr) {
    this.selectedComplianceWeek = weekStr;
    this.renderCurrentSheet();
  }

  renderCurrentSheet() {
    const container = document.getElementById('sheet-grid-container');
    const title = document.getElementById('current-sheet-title');
    const countBadge = document.getElementById('sheet-row-count');
    if (!container) return;

    const tableData = this.db.getTable(this.currentSheetKey);
    const sheetMeta = this.sheetList.find(s => s.key === this.currentSheetKey);
    if (title && sheetMeta) title.textContent = sheetMeta.label;

    if (!tableData || (!tableData.rows?.length && !tableData.rawGrid?.length)) {
      container.innerHTML = `
        <div style="padding: 40px; text-align: center; color: var(--text-muted);">
          <h3>No data loaded for this sheet</h3>
          <p style="margin-top: 8px;">Click "Sync with Google Sheets" or "Import Snapshot" to load your data.</p>
        </div>
      `;
      if (countBadge) countBadge.textContent = '0 rows';
      return;
    }

    // Render swap report sheets
    if (sheetMeta?.isSwap && tableData.rawGrid && tableData.rawGrid.length > 0) {
      this.renderSwapReportGrid(container, countBadge, tableData);
      return;
    }

    // Standard tabular grid renderer (Employees, Gloves, Job Tracking, etc.)
    this.renderStandardTable(container, countBadge, tableData);
  }

  renderSwapReportGrid(container, countBadge, tableData) {
    const grid = tableData.rawGrid;
    if (!grid || grid.length === 0) return;

    // Find the primary subheader row to identify visible columns and labels (Col A-J max 10 columns)
    let visibleColIndices = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
    let colLabels = ['Employee', 'Current Item #', 'Size', 'Date Assigned', 'Change Out Date', 'Days Left', 'Pick List Item #', 'Status', 'Picked', 'Date Changed'];

    for (let r = 0; r < Math.min(grid.length, 10); r++) {
      const row = grid[r];
      if (row && (row[0] === 'Employee' || (row[1] && String(row[1]).includes('Current')) || (row[3] && String(row[3]).includes('Current')))) {
        const detected = [];
        const detectedLabels = [];
        for (let c = 0; c < 12; c++) {
          const val = String(row[c] || '').trim();
          if (val || c === 0) {
            detected.push(c);
            detectedLabels.push(val || (c === 0 ? 'Employee' : `Col ${c+1}`));
            // Stop once Date Changed is reached (hides Stage 1 helper columns at Col K/L)
            if (val.toLowerCase().includes('date changed') || val.toLowerCase().includes('changed')) {
              break;
            }
          }
        }
        if (detected.length >= 6) {
          visibleColIndices = detected;
          colLabels = detectedLabels;
          break;
        }
      }
    }

    let html = `<table class="data-table"><thead><tr>`;
    html += `<th style="width: 45px; text-align: center;">Row</th>`;

    colLabels.forEach((label) => {
      html += `<th>${this.escapeHtml(label)}</th>`;
    });
    html += `</tr></thead><tbody>`;

    let visibleRowCount = 0;
    let currentSection = 'standard';

    grid.forEach((rowArr, rowIdx) => {
      const hasContent = visibleColIndices.some(c => String(rowArr[c] || '').trim() !== '');
      if (!hasContent) return;

      const firstCell = String(rowArr[0] || '').trim();

      // Suppress stray Stage 1-3 floating subheadings (e.g. Row 2-3 with STAGE 1 / Status Check)
      if (!firstCell && rowArr.some(c => {
        const str = String(c || '').toUpperCase();
        return str.includes('STAGE 1') || str.includes('STAGE 2') || str.includes('STAGE 3') || str.includes('STATUS CHECK');
      })) {
        return;
      }

      const isClassHeader = firstCell.includes('Class ') && (firstCell.includes('Swaps') || firstCell.includes('Sleeves') || firstCell.includes('Blankets') || firstCell.includes('MACKs'));
      const isPrevEmpHeader = firstCell.includes('Previous Employee');
      const isClassReclaimHeader = firstCell.includes('Class Reclaims');
      const isLostHeader = (firstCell.includes('Lost ') && firstCell.includes('Locate')) || firstCell.includes('Lost Glove') || firstCell.includes('Lost Sleeve') || firstCell.includes('Lost Blanket') || firstCell.includes('Lost MACK');

      if (isClassHeader) currentSection = 'class';
      else if (isPrevEmpHeader) currentSection = 'prev_emp';
      else if (isClassReclaimHeader) currentSection = 'class_reclaim';
      else if (isLostHeader) currentSection = 'lost';

      const isSubHeader = firstCell === 'Employee' || (rowArr[3] && String(rowArr[3]).includes('Current'));
      const isCityHeader = firstCell.startsWith('📍') || firstCell.startsWith('📍 ') || (rowArr[0] && rowArr[0].includes('📍'));
      const isForemanHeader = firstCell.startsWith('👤') || (rowArr[0] && rowArr[0].includes('👤'));

      if (this.searchTerm) {
        const rowMatches = visibleColIndices.some(c => 
          String(rowArr[c] || '').toLowerCase().includes(this.searchTerm)
        );
        if (!rowMatches && !isClassHeader && !isPrevEmpHeader && !isClassReclaimHeader && !isLostHeader && !isCityHeader) return;
      }

      visibleRowCount++;
      html += `<tr>`;
      html += `<td style="text-align: center; color: var(--text-muted); font-size: 11px; font-weight: bold; background-color: var(--bg-tertiary);">${rowIdx + 1}</td>`;

      const colSpan = visibleColIndices.length;

      if (isClassHeader) {
        html += `<td colspan="${colSpan}" style="font-size: 14px; font-weight: 800; color: #93c5fd; background: linear-gradient(90deg, #1e3a8a 0%, #1e293b 100%); padding: 8px 14px; text-align: left; border-top: 2px solid #3b82f6; border-bottom: 2px solid #3b82f6;">${this.escapeHtml(firstCell)}</td></tr>`;
        return;
      }

      if (isPrevEmpHeader) {
        html += `<td colspan="${colSpan}" style="font-size: 14px; font-weight: 800; color: #fca5a5; background: linear-gradient(90deg, #7f1d1d 0%, #1e293b 100%); padding: 8px 14px; text-align: left; border-top: 2px solid #ef4444; border-bottom: 2px solid #ef4444;">${this.escapeHtml(firstCell)}</td></tr>`;
        return;
      }

      if (isClassReclaimHeader) {
        html += `<td colspan="${colSpan}" style="font-size: 14px; font-weight: 800; color: #fdba74; background: linear-gradient(90deg, #7c2d12 0%, #1e293b 100%); padding: 8px 14px; text-align: left; border-top: 2px solid #f97316; border-bottom: 2px solid #f97316;">${this.escapeHtml(firstCell)}</td></tr>`;
        return;
      }

      if (isLostHeader) {
        html += `<td colspan="${colSpan}" style="font-size: 14px; font-weight: 800; color: #fde047; background: linear-gradient(90deg, #713f12 0%, #1e293b 100%); padding: 8px 14px; text-align: left; border-top: 2px solid #eab308; border-bottom: 2px solid #eab308;">${this.escapeHtml(firstCell)}</td></tr>`;
        return;
      }

      if (isCityHeader) {
        html += `<td colspan="${colSpan}" style="font-weight: 800; color: #c4b5fd; background-color: rgba(139, 92, 246, 0.2); font-size: 13px; text-align: left; padding: 6px 12px; border-left: 3px solid #8b5cf6;">${this.escapeHtml(firstCell)}</td></tr>`;
        return;
      }

      if (isForemanHeader) {
        html += `<td colspan="${colSpan}" style="font-weight: 700; color: #f472b6; background-color: rgba(244, 114, 182, 0.15); font-size: 12px; text-align: left; padding: 6px 12px; border-left: 3px solid #ec4899;">${this.escapeHtml(firstCell)}</td></tr>`;
        return;
      }

      // If this row is in the Lost Items section, verify if the item is still lost
      if (currentSection === 'lost') {
        const itemNum = String(rowArr[1] || '').trim();
        if (itemNum && itemNum !== '—' && itemNum !== '-') {
          let invSheetKey = 'gloves';
          const sNameLower = String(tableData.name || '').toLowerCase();
          if (sNameLower.includes('sleeve')) invSheetKey = 'sleeves';
          else if (sNameLower.includes('blanket')) invSheetKey = 'blankets';
          else if (sNameLower.includes('mack')) invSheetKey = 'macks';

          const invTable = this.db.getTable(invSheetKey);
          if (invTable && invTable.rows) {
            const invItem = invTable.rows.find(r => {
              const itemKeys = Object.keys(r);
              const firstKey = itemKeys[0] || 'Item #';
              const iNum = String(r['Item #'] || r['Glove'] || r['Sleeve'] || r['Blanket'] || r['ESL ID'] || r['Serial #'] || r[firstKey] || '').trim();
              const esl = String(r['ESL ID'] || '').trim();
              return iNum === itemNum || esl === itemNum;
            });
            if (invItem) {
              const statLower = String(invItem['Status'] || '').toLowerCase();
              const locLower = String(invItem['Location'] || '').toLowerCase();
              const assignedLower = String(invItem['Assigned To'] || '').toLowerCase();
              const notesUpper = String(invItem['Notes'] || '').toUpperCase();
              const isStillLost = statLower === 'lost' || locLower === 'lost' || assignedLower === 'lost' || notesUpper.includes('LOST-LOCATE') || notesUpper.includes('LOST LOCATE');
              if (!isStillLost) {
                // Item is located! Skip rendering in Lost section
                return;
              }
            }
          }
        }
      }

      visibleColIndices.forEach((c, idx) => {
        let val = rowArr[c] !== undefined ? String(rowArr[c]).trim() : '';
        let cellStyle = 'text-align: center;';
        let customContent = null;
        let isCellEditable = false;
        const colLabel = colLabels[idx] || '';

        if (isSubHeader) {
          cellStyle = 'font-weight: 700; color: #93c5fd; background-color: #1e293b; font-size: 12px; text-align: center;';
          customContent = this.escapeHtml(val);
        } else {
          const colLower = colLabel.toLowerCase().trim();
          const isPickedCol = colLower === 'picked';
          const isStatusCol = colLower === 'status';

          if (isPickedCol) {
            const isChecked = (val === 'TRUE' || val === 'true' || val === true);
            customContent = `<span style="cursor: pointer; font-size: 14px;" data-toggle-checkbox="${rowIdx + 1}" data-col="${c + 1}" data-sheet="${this.escapeHtml(tableData.name)}" data-header="${this.escapeHtml(colLabel)}">${isChecked ? '☑️' : '⬜'}</span>`;
          } else if (isStatusCol) {
            let vLower = val.toLowerCase().trim();

            // Self-healing / section detection for Previous Employee rows:
            const isPrevEmpRow = currentSection === 'prev_emp' || String(rowArr[5] || '').toUpperCase().includes('PREV EMP') || (String(rowArr[6] || '').trim() === '—' && currentSection !== 'lost');
            if (isPrevEmpRow) {
              const pVal = String(rowArr[8] || '').trim().toUpperCase();
              const isChecked = (pVal === 'TRUE' || pVal === '1' || rowArr[8] === true);
              const dVal = String(rowArr[9] || '').trim();
              if (dVal && !dVal.includes('Stock') && !dVal.includes('Ready')) {
                val = 'Packed For Testing';
                vLower = 'packed for testing';
              } else if (isChecked) {
                val = 'Ready For Test';
                vLower = 'ready for test';
              } else {
                val = 'Return to Shelf';
                vLower = 'return to shelf';
              }
              if (tableData.rawGrid && tableData.rawGrid[rowIdx]) {
                tableData.rawGrid[rowIdx][c] = val;
              }
            }

            if (vLower === 'return to shelf' || vLower.includes('return to shelf') || vLower.includes('return')) {
              customContent = `<span class="badge" style="background-color: #475569; color: #fff; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 600;">↩️ Return to Shelf</span>`;
            } else if (vLower === 'packed for testing' || vLower.includes('packed for testing')) {
              customContent = `<span class="badge" style="background-color: #4f46e5; color: #fff; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 600;">🔬 Packed For Testing</span>`;
            } else if (vLower === 'ready for test' || vLower.includes('ready for test')) {
              customContent = `<span class="badge" style="background-color: #6366f1; color: #fff; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 600;">🔬 Ready For Test</span>`;
            } else if (vLower === 'ready for delivery' || vLower.includes('ready for delivery') || vLower.includes('delivery') || val.includes('🚚')) {
              customContent = `<span class="badge" style="background-color: #15803d; color: #fff; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 600;">🚚 ${this.escapeHtml(val)}</span>`;
            } else if (vLower === 'assigned' || vLower.includes('assigned') || val.includes('✅')) {
              customContent = `<span class="badge" style="background-color: #16a34a; color: #fff; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 700;">✅ ${this.escapeHtml(val)}</span>`;
            } else if (vLower === 'in stock' || vLower.includes('in stock') || val.includes('📦')) {
              customContent = `<span class="badge" style="background-color: #0369a1; color: #fff; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 600;">📦 ${this.escapeHtml(val)}</span>`;
            } else if (vLower === 'overdue' || vLower.includes('overdue')) {
              customContent = `<span class="badge" style="background-color: #b91c1c; color: #fff; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 700;">⚠️ OVERDUE</span>`;
            } else if (vLower === 'need to purchase' || vLower.includes('purchase')) {
              customContent = `<span class="badge" style="background-color: #b45309; color: #fff; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 600;">🛒 ${this.escapeHtml(val)}</span>`;
            } else if (vLower.includes('locate')) {
              customContent = `<span class="badge" style="background-color: #d97706; color: #fff; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 600;">🔍 ${this.escapeHtml(val)}</span>`;
            } else {
              customContent = this.escapeHtml(val);
            }
          } else {
            let displayVal = (val === 'FALSE' || val === 'false') ? '' : val;
            const isDateChangedCol = colLower.includes('changed');
            if (isDateChangedCol && (displayVal.includes('Stock') || displayVal.includes('Ready'))) {
              displayVal = ''; // Clean up any old stray status text in Date Changed
              if (tableData.rawGrid && tableData.rawGrid[rowIdx]) {
                tableData.rawGrid[rowIdx][c] = '';
              }
            }
            const isReadOnly = colLower.includes('change out') || colLower.includes('days');
            isCellEditable = !isReadOnly;
            customContent = this.escapeHtml(displayVal);
          }
        }

        html += `<td class="${isCellEditable ? 'editable' : ''}" 
                     contenteditable="${isCellEditable}" 
                     style="${cellStyle}"
                     data-row="${rowIdx + 1}" 
                     data-col="${c + 1}" 
                     data-header="${this.escapeHtml(colLabel)}"
                     data-sheet="${this.escapeHtml(tableData.name)}">${customContent}</td>`;
      });
      html += `</tr>`;
    });

    html += `</tbody></table>`;
    container.innerHTML = html;
    if (countBadge) countBadge.textContent = `${visibleRowCount} rows`;

    // Attach inline edit handlers for swap reports
    container.querySelectorAll('td.editable').forEach(td => {
      td.addEventListener('blur', async (e) => {
        const newVal = e.target.textContent.trim();
        const sheetName = e.target.dataset.sheet;
        const row = parseInt(e.target.dataset.row, 10);
        const col = parseInt(e.target.dataset.col, 10);
        const header = e.target.dataset.header;

        // Update in-memory grid
        if (tableData.rawGrid && tableData.rawGrid[row - 1]) {
          tableData.rawGrid[row - 1][col - 1] = newVal;
        }

        await this.db.addMutation({
          action: 'UPDATE_CELL',
          sheetName: sheetName,
          row: row,
          col: col,
          header: header,
          value: newVal
        });

        // Re-render swap grid if Date Changed was edited to update status pill immediately
        if (header && (header.toLowerCase().includes('changed') || header.toLowerCase().includes('date'))) {
          this.renderCurrentSheet();
        }
      });

      td.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          e.target.blur();
        }
      });
    });

    // Attach checkbox toggle handlers for swap reports
    container.querySelectorAll('[data-toggle-checkbox]').forEach(cb => {
      cb.addEventListener('click', async (e) => {
        const span = e.currentTarget;
        const sheetName = span.dataset.sheet;
        const row = parseInt(span.dataset.toggleCheckbox, 10);
        const col = parseInt(span.dataset.col, 10);
        const header = span.dataset.header;
        const isCurrentlyChecked = span.textContent === '☑️';
        const newBool = !isCurrentlyChecked;

        span.textContent = newBool ? '☑️' : '⬜';

        // Update in-memory grid
        if (tableData.rawGrid && tableData.rawGrid[row - 1]) {
          tableData.rawGrid[row - 1][col - 1] = newBool ? 'TRUE' : 'FALSE';
        }

        await this.db.addMutation({
          action: 'UPDATE_CELL',
          sheetName: sheetName,
          row: row,
          col: col,
          header: header,
          value: newBool
        });

        // Re-render swap grid to update status pill
        this.renderCurrentSheet();
      });
    });
  }

  renderStandardTable(container, countBadge, tableData) {
    let rows = [...(tableData.rows || [])];

    // Search filter
    if (this.searchTerm) {
      rows = rows.filter(row => {
        return Object.values(row).some(val => 
          String(val || '').toLowerCase().includes(this.searchTerm)
        );
      });
    }

    // Custom status ranking for Job Tracking & Inventory
    const statusRank = {
      'in service': 1,
      'assigned': 1,
      'active': 1,
      'ready for delivery': 2,
      'pending start': 2,
      'on shelf': 3,
      'on hold': 3,
      'ready for test': 4,
      'in testing': 5,
      'in calibration': 5,
      'failed rubber': 6,
      'failed': 6,
      'not repairable': 6,
      'lost': 7,
      'out of service': 8,
      'retired': 9,
      'completed': 10
    };

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

      // Date comparison (handles MM/DD/YYYY, YYYY-MM-DD, ISO)
      if (colLower.includes('date') || colLower.includes('expiration') || colLower.includes('pad')) {
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

      // Custom status ranking
      if (colLower === 'status' || colLower === 'job status' || colLower === 'item status') {
        const rA = statusRank[sA.toLowerCase()] || 99;
        const rB = statusRank[sB.toLowerCase()] || 99;
        if (rA !== rB) return rA - rB;
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

    // Presets bar for Employees, Job Tracking, Gloves, Sleeves, Blankets, MACKs, etc.
    let presetBarHtml = '';
    const dirArrow = (active) => active ? (this.sortDir === 'asc' ? ' ▲' : ' ▼') : '';

    if (this.currentSheetKey === 'gloves' || this.currentSheetKey === 'sleeves') {
      const isItemSorted = this.sortCol && ['glove', 'sleeve', 'item #', 'item'].some(k => this.sortCol.toLowerCase().includes(k));
      const isSizeSorted = this.sortCol && this.sortCol.toLowerCase().includes('size');
      const isClassSorted = this.sortCol && this.sortCol.toLowerCase().includes('class');
      const isClassSizeSorted = this.multiSort && this.multiSort[0]?.toLowerCase().includes('class') && this.multiSort[1]?.toLowerCase().includes('size');
      const isLocSorted = this.sortCol && this.sortCol.toLowerCase().includes('location');
      const isStatSorted = this.sortCol && this.sortCol.toLowerCase().includes('status');
      const isAssignedSorted = this.sortCol && this.sortCol.toLowerCase().includes('assigned');
      const isChangeOutSorted = this.sortCol && (this.sortCol.toLowerCase().includes('change out') || this.sortCol.toLowerCase().includes('changeout'));

      presetBarHtml = `
        <div style="padding: 8px 16px; background-color: var(--bg-secondary); border-bottom: 1px solid var(--border-color); display: flex; align-items: center; gap: 6px; font-size: 12px; overflow-x: auto; flex-wrap: wrap;">
          <span style="color: var(--text-muted); font-weight: 600; white-space: nowrap;">⚡ Quick Sort:</span>
          <button class="btn btn-secondary ${isItemSorted ? 'active' : ''}" style="padding: 3px 8px; font-size: 11px; white-space: nowrap;" onclick="window.sheetNavigator.setPresetSort('itemNum')">🔢 Item #${dirArrow(isItemSorted)}</button>
          <button class="btn btn-secondary ${isSizeSorted ? 'active' : ''}" style="padding: 3px 8px; font-size: 11px; white-space: nowrap;" onclick="window.sheetNavigator.setPresetSort('size')">📏 Size${dirArrow(isSizeSorted)}</button>
          <button class="btn btn-secondary ${isClassSorted ? 'active' : ''}" style="padding: 3px 8px; font-size: 11px; white-space: nowrap;" onclick="window.sheetNavigator.setPresetSort('class')">⚡ Class${dirArrow(isClassSorted)}</button>
          <button class="btn btn-secondary ${isClassSizeSorted ? 'active' : ''}" style="padding: 3px 8px; font-size: 11px; white-space: nowrap;" onclick="window.sheetNavigator.setPresetSort('classSize')">⚡+📏 Class then Size${dirArrow(isClassSizeSorted)}</button>
          <button class="btn btn-secondary ${isLocSorted ? 'active' : ''}" style="padding: 3px 8px; font-size: 11px; white-space: nowrap;" onclick="window.sheetNavigator.setPresetSort('location')">📍 Location${dirArrow(isLocSorted)}</button>
          <button class="btn btn-secondary ${isStatSorted ? 'active' : ''}" style="padding: 3px 8px; font-size: 11px; white-space: nowrap;" onclick="window.sheetNavigator.setPresetSort('status')">🏷️ Status${dirArrow(isStatSorted)}</button>
          <button class="btn btn-secondary ${isAssignedSorted ? 'active' : ''}" style="padding: 3px 8px; font-size: 11px; white-space: nowrap;" onclick="window.sheetNavigator.setPresetSort('assignedTo')">👤 Assigned To${dirArrow(isAssignedSorted)}</button>
          <button class="btn btn-secondary ${isChangeOutSorted ? 'active' : ''}" style="padding: 3px 8px; font-size: 11px; white-space: nowrap;" onclick="window.sheetNavigator.setPresetSort('changeOutDate')">📅 Changeout Date${dirArrow(isChangeOutSorted)}</button>
        </div>
      `;
    } else if (this.currentSheetKey === 'blankets') {
      const isItemSorted = this.sortCol && ['blanket', 'item #', 'item'].some(k => this.sortCol.toLowerCase().includes(k));
      const isTypeSorted = this.sortCol && this.sortCol.toLowerCase().includes('type');
      const isClassSorted = this.sortCol && this.sortCol.toLowerCase().includes('class');
      const isLocSorted = this.sortCol && this.sortCol.toLowerCase().includes('location');
      const isStatSorted = this.sortCol && this.sortCol.toLowerCase().includes('status');
      const isAssignedSorted = this.sortCol && this.sortCol.toLowerCase().includes('assigned');
      const isChangeOutSorted = this.sortCol && (this.sortCol.toLowerCase().includes('change out') || this.sortCol.toLowerCase().includes('changeout'));

      presetBarHtml = `
        <div style="padding: 8px 16px; background-color: var(--bg-secondary); border-bottom: 1px solid var(--border-color); display: flex; align-items: center; gap: 6px; font-size: 12px; overflow-x: auto; flex-wrap: wrap;">
          <span style="color: var(--text-muted); font-weight: 600; white-space: nowrap;">⚡ Quick Sort:</span>
          <button class="btn btn-secondary ${isItemSorted ? 'active' : ''}" style="padding: 3px 8px; font-size: 11px; white-space: nowrap;" onclick="window.sheetNavigator.setPresetSort('itemNum')">🔢 Item #${dirArrow(isItemSorted)}</button>
          <button class="btn btn-secondary ${isTypeSorted ? 'active' : ''}" style="padding: 3px 8px; font-size: 11px; white-space: nowrap;" onclick="window.sheetNavigator.setPresetSort('type')">🔲 Type${dirArrow(isTypeSorted)}</button>
          <button class="btn btn-secondary ${isClassSorted ? 'active' : ''}" style="padding: 3px 8px; font-size: 11px; white-space: nowrap;" onclick="window.sheetNavigator.setPresetSort('class')">⚡ Class${dirArrow(isClassSorted)}</button>
          <button class="btn btn-secondary ${isLocSorted ? 'active' : ''}" style="padding: 3px 8px; font-size: 11px; white-space: nowrap;" onclick="window.sheetNavigator.setPresetSort('location')">📍 Location${dirArrow(isLocSorted)}</button>
          <button class="btn btn-secondary ${isStatSorted ? 'active' : ''}" style="padding: 3px 8px; font-size: 11px; white-space: nowrap;" onclick="window.sheetNavigator.setPresetSort('status')">🏷️ Status${dirArrow(isStatSorted)}</button>
          <button class="btn btn-secondary ${isAssignedSorted ? 'active' : ''}" style="padding: 3px 8px; font-size: 11px; white-space: nowrap;" onclick="window.sheetNavigator.setPresetSort('assignedTo')">👤 Assigned To${dirArrow(isAssignedSorted)}</button>
          <button class="btn btn-secondary ${isChangeOutSorted ? 'active' : ''}" style="padding: 3px 8px; font-size: 11px; white-space: nowrap;" onclick="window.sheetNavigator.setPresetSort('changeOutDate')">📅 Changeout Date${dirArrow(isChangeOutSorted)}</button>
        </div>
      `;
    } else if (this.currentSheetKey === 'macks') {
      const isItemSorted = this.sortCol && ['mack', 'esl id', 'item #', 'item'].some(k => this.sortCol.toLowerCase().includes(k));
      const isKvSorted = this.sortCol && this.sortCol.toLowerCase().includes('kv');
      const isSizeSorted = this.sortCol && this.sortCol.toLowerCase().includes('size');
      const isLocSorted = this.sortCol && this.sortCol.toLowerCase().includes('location');
      const isStatSorted = this.sortCol && this.sortCol.toLowerCase().includes('status');
      const isAssignedSorted = this.sortCol && this.sortCol.toLowerCase().includes('assigned');
      const isChangeOutSorted = this.sortCol && (this.sortCol.toLowerCase().includes('change out') || this.sortCol.toLowerCase().includes('changeout'));

      presetBarHtml = `
        <div style="padding: 8px 16px; background-color: var(--bg-secondary); border-bottom: 1px solid var(--border-color); display: flex; align-items: center; gap: 6px; font-size: 12px; overflow-x: auto; flex-wrap: wrap;">
          <span style="color: var(--text-muted); font-weight: 600; white-space: nowrap;">⚡ Quick Sort:</span>
          <button class="btn btn-secondary ${isItemSorted ? 'active' : ''}" style="padding: 3px 8px; font-size: 11px; white-space: nowrap;" onclick="window.sheetNavigator.setPresetSort('itemNum')">🔢 ESL ID${dirArrow(isItemSorted)}</button>
          <button class="btn btn-secondary ${isKvSorted ? 'active' : ''}" style="padding: 3px 8px; font-size: 11px; white-space: nowrap;" onclick="window.sheetNavigator.setPresetSort('kv')">⚡ KV${dirArrow(isKvSorted)}</button>
          <button class="btn btn-secondary ${isSizeSorted ? 'active' : ''}" style="padding: 3px 8px; font-size: 11px; white-space: nowrap;" onclick="window.sheetNavigator.setPresetSort('size')">📏 Size${dirArrow(isSizeSorted)}</button>
          <button class="btn btn-secondary ${isLocSorted ? 'active' : ''}" style="padding: 3px 8px; font-size: 11px; white-space: nowrap;" onclick="window.sheetNavigator.setPresetSort('location')">📍 Location${dirArrow(isLocSorted)}</button>
          <button class="btn btn-secondary ${isStatSorted ? 'active' : ''}" style="padding: 3px 8px; font-size: 11px; white-space: nowrap;" onclick="window.sheetNavigator.setPresetSort('status')">🏷️ Status${dirArrow(isStatSorted)}</button>
          <button class="btn btn-secondary ${isAssignedSorted ? 'active' : ''}" style="padding: 3px 8px; font-size: 11px; white-space: nowrap;" onclick="window.sheetNavigator.setPresetSort('assignedTo')">👤 Assigned To${dirArrow(isAssignedSorted)}</button>
          <button class="btn btn-secondary ${isChangeOutSorted ? 'active' : ''}" style="padding: 3px 8px; font-size: 11px; white-space: nowrap;" onclick="window.sheetNavigator.setPresetSort('changeOutDate')">📅 Changeout Date${dirArrow(isChangeOutSorted)}</button>
        </div>
      `;
    } else if (['hv_testers', 'phasing_sets', 'aed', 'grounds', 'hot_sticks'].includes(this.currentSheetKey)) {
      const isItemSorted = this.sortCol && ['item #', 'item', 'serial #'].some(k => this.sortCol.toLowerCase().includes(k));
      const isLocSorted = this.sortCol && this.sortCol.toLowerCase().includes('location');
      const isStatSorted = this.sortCol && this.sortCol.toLowerCase().includes('status');
      const isAssignedSorted = this.sortCol && this.sortCol.toLowerCase().includes('assigned');
      const isChangeOutSorted = this.sortCol && (this.sortCol.toLowerCase().includes('change out') || this.sortCol.toLowerCase().includes('changeout') || this.sortCol.toLowerCase().includes('pad'));

      presetBarHtml = `
        <div style="padding: 8px 16px; background-color: var(--bg-secondary); border-bottom: 1px solid var(--border-color); display: flex; align-items: center; gap: 6px; font-size: 12px; overflow-x: auto; flex-wrap: wrap;">
          <span style="color: var(--text-muted); font-weight: 600; white-space: nowrap;">⚡ Quick Sort:</span>
          <button class="btn btn-secondary ${isItemSorted ? 'active' : ''}" style="padding: 3px 8px; font-size: 11px; white-space: nowrap;" onclick="window.sheetNavigator.setPresetSort('itemNum')">🔢 Item #${dirArrow(isItemSorted)}</button>
          <button class="btn btn-secondary ${isLocSorted ? 'active' : ''}" style="padding: 3px 8px; font-size: 11px; white-space: nowrap;" onclick="window.sheetNavigator.setPresetSort('location')">📍 Location${dirArrow(isLocSorted)}</button>
          <button class="btn btn-secondary ${isStatSorted ? 'active' : ''}" style="padding: 3px 8px; font-size: 11px; white-space: nowrap;" onclick="window.sheetNavigator.setPresetSort('status')">🏷️ Status${dirArrow(isStatSorted)}</button>
          <button class="btn btn-secondary ${isAssignedSorted ? 'active' : ''}" style="padding: 3px 8px; font-size: 11px; white-space: nowrap;" onclick="window.sheetNavigator.setPresetSort('assignedTo')">👤 Assigned To${dirArrow(isAssignedSorted)}</button>
          <button class="btn btn-secondary ${isChangeOutSorted ? 'active' : ''}" style="padding: 3px 8px; font-size: 11px; white-space: nowrap;" onclick="window.sheetNavigator.setPresetSort('changeOutDate')">📅 Changeout Date${dirArrow(isChangeOutSorted)}</button>
        </div>
      `;
    } else if (this.currentSheetKey === 'employees') {
      const isLocSorted = this.sortCol === 'Location';
      const isJobSorted = this.sortCol === 'Job Number';
      const isLocJobSorted = this.multiSort && this.multiSort[0] === 'Location';
      const isNameSorted = this.sortCol === 'Name';

      presetBarHtml = `
        <div style="padding: 8px 16px; background-color: var(--bg-secondary); border-bottom: 1px solid var(--border-color); display: flex; align-items: center; gap: 8px; font-size: 12px;">
          <span style="color: var(--text-muted); font-weight: 600;">⚡ Quick Sort:</span>
          <button class="btn btn-secondary ${isLocSorted ? 'active' : ''}" style="padding: 3px 8px; font-size: 11px;" onclick="window.sheetNavigator.setPresetSort('location')">📍 Location${dirArrow(isLocSorted)}</button>
          <button class="btn btn-secondary ${isJobSorted ? 'active' : ''}" style="padding: 3px 8px; font-size: 11px;" onclick="window.sheetNavigator.setPresetSort('jobNumber')">🔢 Job #${dirArrow(isJobSorted)}</button>
          <button class="btn btn-secondary ${isLocJobSorted ? 'active' : ''}" style="padding: 3px 8px; font-size: 11px;" onclick="window.sheetNavigator.setPresetSort('locationJob')">📍+🔢 Location then Job #${dirArrow(isLocJobSorted)}</button>
          <button class="btn btn-secondary ${isNameSorted ? 'active' : ''}" style="padding: 3px 8px; font-size: 11px;" onclick="window.sheetNavigator.setPresetSort('name')">👤 Name${dirArrow(isNameSorted)}</button>
        </div>
      `;
    } else if (this.currentSheetKey === 'job_tracking') {
      const isStatSorted = this.sortCol === 'Status';
      const isJobSorted = this.sortCol === 'Job Number';
      const isStatJobSorted = this.multiSort && this.multiSort[0] === 'Status';
      const isLocSorted = this.sortCol === 'Location';

      presetBarHtml = `
        <div style="padding: 8px 16px; background-color: var(--bg-secondary); border-bottom: 1px solid var(--border-color); display: flex; align-items: center; gap: 8px; font-size: 12px;">
          <span style="color: var(--text-muted); font-weight: 600;">⚡ Quick Sort:</span>
          <button class="btn btn-secondary ${isStatSorted ? 'active' : ''}" style="padding: 3px 8px; font-size: 11px;" onclick="window.sheetNavigator.setPresetSort('status')">🏷️ Status${dirArrow(isStatSorted)}</button>
          <button class="btn btn-secondary ${isJobSorted ? 'active' : ''}" style="padding: 3px 8px; font-size: 11px;" onclick="window.sheetNavigator.setPresetSort('jobNumber')">🔢 Job #${dirArrow(isJobSorted)}</button>
          <button class="btn btn-secondary ${isStatJobSorted ? 'active' : ''}" style="padding: 3px 8px; font-size: 11px;" onclick="window.sheetNavigator.setPresetSort('statusJob')">🏷️+🔢 Status then Job #${dirArrow(isStatJobSorted)}</button>
          <button class="btn btn-secondary ${isLocSorted ? 'active' : ''}" style="padding: 3px 8px; font-size: 11px;" onclick="window.sheetNavigator.setPresetSort('location')">📍 Location${dirArrow(isLocSorted)}</button>
        </div>
      `;
    } else if (this.currentSheetKey === 'safety_compliance') {
      // Find all unique weeks
      const uniqueWeeks = [];
      (tableData.rows || []).forEach(r => {
        const w = String(r['Week Start'] || r['Week'] || '').trim();
        if (w && !uniqueWeeks.includes(w)) uniqueWeeks.push(w);
      });

      const selectedWeek = this.selectedComplianceWeek || 'ALL';
      if (selectedWeek !== 'ALL') {
        rows = rows.filter(r => String(r['Week Start'] || r['Week'] || '').trim() === selectedWeek);
      }

      presetBarHtml = `
        <div style="padding: 8px 16px; background-color: var(--bg-secondary); border-bottom: 1px solid var(--border-color); display: flex; align-items: center; gap: 6px; font-size: 12px; overflow-x: auto;">
          <span style="color: var(--text-muted); font-weight: 600; white-space: nowrap;">📅 Filter Week:</span>
          <button class="btn btn-secondary ${selectedWeek === 'ALL' ? 'active' : ''}" style="padding: 3px 8px; font-size: 11px;" onclick="window.sheetNavigator.setComplianceWeek('ALL')">All Weeks</button>
          ${uniqueWeeks.map(w => `
            <button class="btn btn-secondary ${selectedWeek === w ? 'active' : ''}" style="padding: 3px 8px; font-size: 11px; white-space: nowrap;" onclick="window.sheetNavigator.setComplianceWeek('${this.escapeHtml(w)}')">
              Week of ${this.escapeHtml(w)}
            </button>
          `).join('')}
        </div>
      `;
    }

    let html = presetBarHtml + `<table class="data-table"><thead><tr>`;
    html += `<th style="width: 40px; text-align: center;">#</th>`;

    tableData.headers.forEach((h) => {
      let sortIndicator = '';
      if (this.sortCol === h) {
        sortIndicator = this.sortDir === 'asc' ? ' ▲' : ' ▼';
      } else if (this.multiSort && this.multiSort.includes(h)) {
        sortIndicator = ` [${this.multiSort.indexOf(h) + 1}]`;
      }

      html += `<th style="cursor: pointer; user-select: none;" onclick="window.sheetNavigator.setSort('${this.escapeHtml(h)}')" title="Click to sort by ${this.escapeHtml(h)}">
        ${this.escapeHtml(h)}<span style="color: var(--accent); font-weight: bold;">${sortIndicator}</span>
      </th>`;
    });
    html += `</tr></thead><tbody>`;

    const isJobTracking = this.currentSheetKey === 'job_tracking';
    const isCompliance = this.currentSheetKey === 'safety_compliance';
    const isEmployees = this.currentSheetKey === 'employees';
    let lastRenderedWeek = null;
    let lastRenderedLoc = null;
    let lastRenderedJob = null;

    rows.forEach((row, rowIdx) => {
      const sheetRowIdx = row._rowIdx || (rowIdx + 2);
      const currentWeekVal = String(row['Week Start'] || row['Week'] || '').trim();
      const currentLocVal = String(row['Location'] || '').trim();
      const currentJobVal = String(row['Job Number'] || '').trim();

      // Week Divider Banner for Safety Compliance
      if (isCompliance && currentWeekVal && currentWeekVal !== lastRenderedWeek) {
        lastRenderedWeek = currentWeekVal;
        html += `
          <tr style="background: linear-gradient(90deg, #1e3a8a 0%, #1e293b 100%);">
            <td colspan="${tableData.headers.length + 1}" style="padding: 8px 16px; font-size: 13px; font-weight: 800; color: #93c5fd; text-align: left; border-top: 3px solid #3b82f6; border-bottom: 1px solid #3b82f6;">
              📅 Week of ${this.escapeHtml(currentWeekVal)}
            </td>
          </tr>
        `;
      }

      // Location Divider Banner for Employees (when sorted by Location or Location + Job #)
      const isSortedByLoc = this.sortCol === 'Location' || (this.multiSort && this.multiSort[0] === 'Location');
      if (isEmployees && isSortedByLoc && currentLocVal && currentLocVal !== lastRenderedLoc) {
        lastRenderedLoc = currentLocVal;
        html += `
          <tr style="background: linear-gradient(90deg, #4c1d95 0%, #1e293b 100%);">
            <td colspan="${tableData.headers.length + 1}" style="padding: 8px 16px; font-size: 13px; font-weight: 800; color: #c4b5fd; text-align: left; border-top: 3px solid #8b5cf6; border-bottom: 1px solid #8b5cf6;">
              📍 Location: ${this.escapeHtml(currentLocVal)}
            </td>
          </tr>
        `;
      }

      // Job Number Divider Banner for Employees (when sorted solely by Job Number)
      const isSortedByJob = this.sortCol === 'Job Number' && !this.multiSort;
      if (isEmployees && isSortedByJob && currentJobVal && currentJobVal !== lastRenderedJob) {
        lastRenderedJob = currentJobVal;
        html += `
          <tr style="background: linear-gradient(90deg, #1e3a8a 0%, #1e293b 100%);">
            <td colspan="${tableData.headers.length + 1}" style="padding: 8px 16px; font-size: 13px; font-weight: 800; color: #93c5fd; text-align: left; border-top: 3px solid #3b82f6; border-bottom: 1px solid #3b82f6;">
              🔢 Job #${this.escapeHtml(currentJobVal)}
            </td>
          </tr>
        `;
      }

      html += `<tr>`;
      html += `<td style="text-align: center; color: var(--text-muted); font-size: 10px;">${sheetRowIdx}</td>`;

      tableData.headers.forEach((h, colIdx) => {
        let val = row[h] !== undefined ? row[h] : '';
        const hLower = h.toLowerCase();
        let customCellHtml = null;

        // Job Tracking Conditional Formatting
        if (isJobTracking) {
          if (hLower === 'status' || hLower === 'job status') {
            const statusStr = String(val).trim();
            if (statusStr === 'Active') {
              customCellHtml = `<span class="badge" style="background-color: #15803d; color: #fff; padding: 2px 8px; border-radius: 4px; font-weight: 700;">🚚 Active</span>`;
            } else if (statusStr === 'Pending Start') {
              customCellHtml = `<span class="badge" style="background-color: #b45309; color: #fff; padding: 2px 8px; border-radius: 4px; font-weight: 700;">⏳ Pending Start</span>`;
            } else if (statusStr === 'Completed') {
              customCellHtml = `<span class="badge" style="background-color: #0369a1; color: #fff; padding: 2px 8px; border-radius: 4px; font-weight: 600;">✓ Completed</span>`;
            } else if (statusStr === 'On Hold') {
              customCellHtml = `<span class="badge" style="background-color: #7c3aed; color: #fff; padding: 2px 8px; border-radius: 4px; font-weight: 600;">⏸️ On Hold</span>`;
            }
          } else if (hLower.startsWith('skip ')) {
            const isChecked = val === true || val === 'TRUE' || val === 'true';
            customCellHtml = `<span style="cursor: pointer; font-size: 14px;" data-toggle-checkbox="${sheetRowIdx}" data-col="${colIdx + 1}" data-sheet="${this.escapeHtml(tableData.name)}" data-header="${this.escapeHtml(h)}">${isChecked ? '☑️' : '⬜'}</span>`;
          } else if (hLower.includes('job number') || hLower === 'job #') {
            customCellHtml = `<span style="font-family: monospace; font-weight: bold; color: #60a5fa;">${this.escapeHtml(val)}</span>`;
          }
        }

        // Safety Compliance Formatting
        if (this.currentSheetKey === 'safety_compliance') {
          const vStr = String(val).trim();
          if (vStr === '✅' || vStr.includes('✅')) {
            customCellHtml = `<span style="font-size: 14px;">✅</span>`;
          } else if (vStr === '❌' || vStr.includes('❌')) {
            customCellHtml = `<span style="font-size: 14px;">❌</span>`;
          } else if (vStr === '⏳' || vStr.includes('⏳')) {
            customCellHtml = `<span style="font-size: 14px;">⏳</span>`;
          } else if (vStr === 'N/A' || vStr === 'n/a') {
            customCellHtml = `<span style="color: #64748b; font-size: 11px; font-weight: 600;">N/A</span>`;
          } else if (vStr.endsWith('%')) {
            const pct = parseFloat(vStr);
            const color = pct >= 100 ? '#15803d' : (pct >= 80 ? '#0369a1' : '#b91c1c');
            customCellHtml = `<span class="badge" style="background-color: ${color}; color: #fff; padding: 2px 8px; border-radius: 4px; font-weight: 700;">${this.escapeHtml(vStr)}</span>`;
          } else if (hLower.includes('crew') || hLower.includes('job')) {
            customCellHtml = `<span style="font-family: monospace; font-weight: bold; color: #60a5fa;">${this.escapeHtml(val)}</span>`;
          }
        }

        // Equipment Sheet Formatting (Clickable Item # for Lifecycle Dossier)
        if (['gloves', 'sleeves', 'blankets', 'macks', 'hv_testers', 'phasing_sets', 'aed', 'grounds', 'hot_sticks'].includes(this.currentSheetKey) && (hLower === 'item #' || hLower === 'item' || hLower === 'serial #' || hLower === 'esl id')) {
          const itemKey = val;
          const histKey = this.currentSheetKey + '_history';
          customCellHtml = `<span style="font-weight: 700; color: #60a5fa; cursor: pointer; text-decoration: underline dotted;" title="Click to inspect complete lifecycle dossier" onclick="window.itemStatsEngine ? window.itemStatsEngine.openDossierModal('${this.escapeHtml(itemKey)}', '${this.escapeHtml(histKey)}') : null">${this.escapeHtml(val)}</span>`;
        }

        // Employee Sheet Formatting
        if (this.currentSheetKey === 'employees') {
          if (hLower === 'job number' || hLower === 'job #') {
            customCellHtml = `<span style="font-family: monospace; font-weight: bold; color: #60a5fa;">${this.escapeHtml(val)}</span>`;
          } else if (hLower === 'location') {
            customCellHtml = `<span style="font-weight: 600; color: #a78bfa;">📍 ${this.escapeHtml(val)}</span>`;
          }
        }

        const isEditable = !hLower.includes('change out') && !hLower.startsWith('skip ');

        html += `<td class="${isEditable ? 'editable' : ''}" 
                     contenteditable="${isEditable}" 
                     data-row="${sheetRowIdx}" 
                     data-col="${colIdx + 1}" 
                     data-header="${this.escapeHtml(h)}"
                     data-sheet="${this.escapeHtml(tableData.name)}">${customCellHtml !== null ? customCellHtml : this.escapeHtml(val)}</td>`;
      });
      html += `</tr>`;
    });

    html += `</tbody></table>`;
    container.innerHTML = html;

    // Attach inline edit handlers
    container.querySelectorAll('td.editable').forEach(td => {
      td.addEventListener('blur', async (e) => {
        const newVal = e.target.textContent.trim();
        const sheetName = e.target.dataset.sheet;
        const row = parseInt(e.target.dataset.row, 10);
        const col = parseInt(e.target.dataset.col, 10);
        const header = e.target.dataset.header;

        await this.db.addMutation({
          action: 'UPDATE_CELL',
          sheetName: sheetName,
          row: row,
          col: col,
          header: header,
          value: newVal
        });

        // Re-render sheet to immediately reflect auto-calculated Location, Status, and Change Out Dates
        this.renderCurrentSheet();
      });

      td.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          e.target.blur();
        }
      });
    });

    // Attach checkbox toggle handlers
    container.querySelectorAll('[data-toggle-checkbox]').forEach(cb => {
      cb.addEventListener('click', async (e) => {
        const span = e.currentTarget;
        const sheetName = span.dataset.sheet;
        const row = parseInt(span.dataset.toggleCheckbox, 10);
        const col = parseInt(span.dataset.col, 10);
        const header = span.dataset.header;
        const isCurrentlyChecked = span.textContent === '☑️';
        const newBool = !isCurrentlyChecked;

        span.textContent = newBool ? '☑️' : '⬜';

        await this.db.addMutation({
          action: 'UPDATE_CELL',
          sheetName: sheetName,
          row: row,
          col: col,
          header: header,
          value: newBool
        });

        this.renderCurrentSheet();
      });
    });
  }

  escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
}

window.sheetNavigator = new SheetNavigator(window.localDB);
