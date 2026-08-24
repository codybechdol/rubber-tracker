/**
 * aging.js - Inventory Aging & Fleet Lifecycle Analytics Engine (Phase 3 Step 4)
 */

class InventoryAgingEngine {
  constructor(db) {
    this.db = db;
    this.items = [];
    this.selectedCategory = 'all';
    this.selectedTier = 'all';
    this.selectedRecert = 'all';
    this.searchTerm = '';
    this.sortBy = 'age_desc'; // age_desc, age_asc, due_asc, item_asc
  }

  init() {
    this.bindEvents();
  }

  bindEvents() {
    const searchInput = document.getElementById('aging-search-input');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        this.searchTerm = (e.target.value || '').toLowerCase().trim();
        this.render();
      });
    }

    const sortSelect = document.getElementById('aging-sort-select');
    if (sortSelect) {
      sortSelect.addEventListener('change', (e) => {
        this.sortBy = e.target.value;
        this.render();
      });
    }
  }

  loadData() {
    this.scanInventoryAging();
    this.render();
  }

  scanInventoryAging() {
    const categories = [
      { key: 'gloves', histKey: 'gloves_history', type: 'Gloves', label: '🧤 Gloves', icon: '🧤' },
      { key: 'sleeves', histKey: 'sleeves_history', type: 'Sleeves', label: '🦺 Sleeves', icon: '🦺' },
      { key: 'blankets', histKey: 'blankets_history', type: 'Blankets', label: '🧱 Blankets', icon: '🧱' },
      { key: 'macks', histKey: 'macks_history', type: 'MACKs', label: '🧱 MACKs', icon: '🧱' },
      { key: 'hv_testers', histKey: 'hv_testers_history', type: 'HV Testers', label: '⚡ HV Testers', icon: '⚡' },
      { key: 'phasing_sets', histKey: 'phasing_sets_history', type: 'Phasing Sets', label: '⚡ Phasing Sets', icon: '⚡' },
      { key: 'grounds', histKey: 'grounds_history', type: 'Grounds', label: '⚡ Grounds', icon: '⚡' },
      { key: 'hot_sticks', histKey: 'hot_sticks_history', type: 'Hot Sticks', label: '🔴 Hot Sticks', icon: '🔴' },
      { key: 'aed', histKey: 'aed_history', type: 'AED', label: '🏥 AED Units', icon: '🏥' }
    ];

    const today = new Date();
    today.setHours(12, 0, 0, 0);

    const allItems = [];

    categories.forEach(cat => {
      const table = this.db.getTable(cat.key);
      if (!table) return;

      const rawRows = table.rawGrid || table.rows || [];
      if (!rawRows.length) return;

      const histTable = this.db.getTable(cat.histKey);
      const historyRows = histTable ? (histTable.rawGrid || histTable.rows || []) : [];

      // Build history lookup for initial service date and cycle count
      const historyMap = {};
      historyRows.forEach(hr => {
        let iNum = '';
        let dateVal = null;
        if (Array.isArray(hr)) {
          iNum = String(hr[0] || '').trim();
          dateVal = hr[1] ? new Date(hr[1]) : null;
        } else if (typeof hr === 'object' && hr !== null) {
          const keys = Object.keys(hr);
          iNum = String(hr['Item #'] || hr['Serial #'] || hr['ESL ID'] || hr[keys[0]] || '').trim();
          dateVal = hr['Date'] ? new Date(hr['Date']) : null;
        }

        if (iNum && iNum !== 'Item #' && iNum !== 'Serial #') {
          if (!historyMap[iNum]) {
            historyMap[iNum] = { earliestDate: null, count: 0 };
          }
          historyMap[iNum].count++;
          if (dateVal && !isNaN(dateVal.getTime())) {
            if (!historyMap[iNum].earliestDate || dateVal < historyMap[iNum].earliestDate) {
              historyMap[iNum].earliestDate = dateVal;
            }
          }
        }
      });

      rawRows.forEach((row, rIdx) => {
        let itemNum = '';
        let size = '—';
        let classVal = '—';
        let testDate = null;
        let dateAssigned = null;
        let changeOutDate = null;
        let location = '—';
        let status = 'On Shelf';
        let assignedTo = '—';
        let notes = '';

        if (Array.isArray(row)) {
          const first = String(row[0] || '').trim();
          if (first.toLowerCase().includes('item') || first.toLowerCase().includes('serial') || !first) return;
          itemNum = first;
          // Standard 11/12/13 column layouts
          if (cat.key === 'gloves' || cat.key === 'sleeves') {
            size = String(row[2] || '—').trim();
            classVal = String(row[3] || '—').trim();
            testDate = row[4] ? new Date(row[4]) : null;
            dateAssigned = row[5] ? new Date(row[5]) : null;
            location = String(row[6] || '—').trim();
            status = String(row[7] || 'On Shelf').trim();
            assignedTo = String(row[8] || '—').trim();
            changeOutDate = row[9] ? new Date(row[9]) : null;
            notes = String(row[11] || '').trim();
          } else {
            // General equipment
            classVal = String(row[1] || row[2] || '—').trim();
            testDate = row[4] || row[5] ? new Date(row[4] || row[5]) : null;
            dateAssigned = row[5] || row[6] ? new Date(row[5] || row[6]) : null;
            location = String(row[6] || row[7] || '—').trim();
            status = String(row[7] || row[8] || 'On Shelf').trim();
            assignedTo = String(row[8] || row[9] || '—').trim();
            changeOutDate = row[9] || row[10] ? new Date(row[9] || row[10]) : null;
            notes = String(row[10] || row[11] || '').trim();
          }
        } else if (typeof row === 'object' && row !== null) {
          const keys = Object.keys(row);
          itemNum = String(row['Item #'] || row['Serial #'] || row['ESL ID'] || row['Glove'] || row['Sleeve'] || row[keys[0]] || '').trim();
          if (!itemNum || itemNum.toLowerCase().includes('item')) return;

          size = String(row['Size'] || '—').trim();
          classVal = String(row['Class'] || row['KV'] || row['Model'] || row['Type'] || '—').trim();
          testDate = row['Test Date'] || row['Calibration Date'] ? new Date(row['Test Date'] || row['Calibration Date']) : null;
          dateAssigned = row['Date Assigned'] ? new Date(row['Date Assigned']) : null;
          location = String(row['Location'] || '—').trim();
          status = String(row['Status'] || 'On Shelf').trim();
          assignedTo = String(row['Assigned To'] || '—').trim();
          changeOutDate = row['Change Out Date'] ? new Date(row['Change Out Date']) : null;
          notes = String(row['Notes'] || '').trim();
        }

        if (!itemNum) return;

        // Determine earliest recorded date for age
        let earliestDate = testDate || dateAssigned || changeOutDate;
        const histInfo = historyMap[itemNum];
        if (histInfo && histInfo.earliestDate && (!earliestDate || histInfo.earliestDate < earliestDate)) {
          earliestDate = histInfo.earliestDate;
        }

        let ageDays = 180; // default conservative estimate if no date
        if (earliestDate && !isNaN(earliestDate.getTime())) {
          ageDays = Math.max(0, Math.floor((today - earliestDate) / (1000 * 60 * 60 * 24)));
        }

        const ageYears = (ageDays / 365.25).toFixed(1);

        // Days until next test
        let daysUntil = 999;
        if (changeOutDate && !isNaN(changeOutDate.getTime())) {
          daysUntil = Math.floor((changeOutDate - today) / (1000 * 60 * 60 * 24));
        }

        // Determine Age Tier
        let tier = 'FRESH';
        let tierLabel = '🟢 Fresh (<1 yr)';
        let tierColor = '#4ade80';

        if (ageDays >= 1825) { // 5 years
          tier = 'CRITICAL';
          tierLabel = '🔴 EOL Candidate (>5 yrs)';
          tierColor = '#f87171';
        } else if (ageDays >= 1095) { // 3 - 5 years
          tier = 'AGING';
          tierLabel = '🟠 Aging (3-5 yrs)';
          tierColor = '#fb923c';
        } else if (ageDays >= 365) { // 1 - 3 years
          tier = 'MID_LIFE';
          tierLabel = '🟡 Mid-Life (1-3 yrs)';
          tierColor = '#facc15';
        }

        // Recertification status
        let recertStatus = 'CURRENT';
        let recertLabel = '🟢 Current';
        let recertBadgeClass = 'badge-success';

        if (daysUntil < 0) {
          recertStatus = 'OVERDUE';
          recertLabel = `🔴 Overdue (${Math.abs(daysUntil)}d)`;
          recertBadgeClass = 'badge-danger';
        } else if (daysUntil <= 30) {
          recertStatus = 'DUE_SOON';
          recertLabel = `🟠 Due in ${daysUntil}d`;
          recertBadgeClass = 'badge-warning';
        } else if (daysUntil <= 60) {
          recertStatus = 'DUE_60D';
          recertLabel = `🟡 Due in ${daysUntil}d`;
          recertBadgeClass = 'badge-secondary';
        }

        allItems.push({
          itemNum,
          categoryKey: cat.key,
          categoryType: cat.type,
          categoryLabel: cat.label,
          categoryIcon: cat.icon,
          size,
          classVal,
          location,
          status,
          assignedTo,
          testDateStr: testDate && !isNaN(testDate.getTime()) ? testDate.toLocaleDateString() : '—',
          dateAssignedStr: dateAssigned && !isNaN(dateAssigned.getTime()) ? dateAssigned.toLocaleDateString() : '—',
          changeOutDateStr: changeOutDate && !isNaN(changeOutDate.getTime()) ? changeOutDate.toLocaleDateString() : '—',
          ageDays,
          ageYears,
          daysUntil,
          cycleCount: histInfo ? histInfo.count : 1,
          tier,
          tierLabel,
          tierColor,
          recertStatus,
          recertLabel,
          recertBadgeClass,
          notes
        });
      });
    });

    this.items = allItems;
  }

  setCategory(cat) {
    this.selectedCategory = cat;
    document.querySelectorAll('.aging-cat-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.cat === cat);
    });
    this.render();
  }

  setTier(tier) {
    this.selectedTier = tier;
    document.querySelectorAll('.aging-tier-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.tier === tier);
    });
    this.render();
  }

  setRecert(recert) {
    this.selectedRecert = recert;
    document.querySelectorAll('.aging-recert-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.recert === recert);
    });
    this.render();
  }

  getFilteredItems() {
    return this.items.filter(it => {
      // Category filter
      if (this.selectedCategory !== 'all' && it.categoryKey !== this.selectedCategory) return false;

      // Tier filter
      if (this.selectedTier !== 'all' && it.tier !== this.selectedTier) return false;

      // Recertification filter
      if (this.selectedRecert !== 'all' && it.recertStatus !== this.selectedRecert) return false;

      // Search filter
      if (this.searchTerm) {
        const str = `${it.itemNum} ${it.categoryType} ${it.size} ${it.classVal} ${it.location} ${it.status} ${it.assignedTo} ${it.notes}`.toLowerCase();
        if (!str.includes(this.searchTerm)) return false;
      }

      return true;
    }).sort((a, b) => {
      if (this.sortBy === 'age_desc') return b.ageDays - a.ageDays;
      if (this.sortBy === 'age_asc') return a.ageDays - b.ageDays;
      if (this.sortBy === 'due_asc') return a.daysUntil - b.daysUntil;
      if (this.sortBy === 'cycles_desc') return b.cycleCount - a.cycleCount;
      if (this.sortBy === 'item_asc') return String(a.itemNum).localeCompare(String(b.itemNum), undefined, { numeric: true });
      return 0;
    });
  }

  render() {
    this.renderStats();
    this.renderTable();
  }

  renderStats() {
    const totalFleet = this.items.length;
    if (totalFleet === 0) return;

    const criticalCount = this.items.filter(i => i.tier === 'CRITICAL').length;
    const agingCount = this.items.filter(i => i.tier === 'AGING').length;
    const overdueCount = this.items.filter(i => i.recertStatus === 'OVERDUE').length;
    const dueSoonCount = this.items.filter(i => i.recertStatus === 'DUE_SOON').length;

    const totalAgeDays = this.items.reduce((sum, i) => sum + i.ageDays, 0);
    const avgAgeYears = (totalAgeDays / totalFleet / 365.25).toFixed(1);

    const setEl = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.textContent = val;
    };

    setEl('aging-stat-total', `${totalFleet} items`);
    setEl('aging-stat-avg-age', `${avgAgeYears} yrs`);
    setEl('aging-stat-critical', `${criticalCount} items`);
    setEl('aging-stat-overdue', `${overdueCount} items`);
    setEl('aging-stat-due-soon', `${dueSoonCount} items`);
  }

  renderTable() {
    const container = document.getElementById('aging-table-container');
    if (!container) return;

    const filtered = this.getFilteredItems();

    const countBadge = document.getElementById('aging-results-count');
    if (countBadge) countBadge.textContent = `${filtered.length} of ${this.items.length} items`;

    if (filtered.length === 0) {
      container.innerHTML = `
        <div style="padding: 40px; text-align: center; color: var(--text-muted);">
          <div style="font-size: 32px; margin-bottom: 8px;">🔍</div>
          <h3 style="color: var(--text-primary); font-size: 15px;">No matching equipment found</h3>
          <p style="margin-top: 6px; font-size: 13px;">Try adjusting your category or aging filters.</p>
        </div>
      `;
      return;
    }

    let html = `
      <table class="table" style="width: 100%; border-collapse: collapse; font-size: 12.5px;">
        <thead>
          <tr style="background: rgba(255,255,255,0.05); border-bottom: 2px solid var(--border-color);">
            <th style="padding: 10px; text-align: left; width: 110px;">Item #</th>
            <th style="padding: 10px; text-align: left; width: 140px;">Category</th>
            <th style="padding: 10px; text-align: center; width: 80px;">Size</th>
            <th style="padding: 10px; text-align: center; width: 90px;">Class / KV</th>
            <th style="padding: 10px; text-align: left; width: 130px;">Location</th>
            <th style="padding: 10px; text-align: left;">Assigned To</th>
            <th style="padding: 10px; text-align: center; width: 110px;">Recert Date</th>
            <th style="padding: 10px; text-align: center; width: 130px;">Recert Urgency</th>
            <th style="padding: 10px; text-align: center; width: 110px;">Est. Fleet Age</th>
            <th style="padding: 10px; text-align: center; width: 160px;">Lifecycle Tier</th>
          </tr>
        </thead>
        <tbody>
    `;

    filtered.forEach(item => {
      html += `
        <tr style="border-bottom: 1px solid var(--border-color); cursor: pointer; transition: background 0.15s;" class="aging-table-row" onclick="window.itemStatsEngine ? window.itemStatsEngine.openDossierModal('${item.itemNum}', '${item.categoryKey}') : null">
          <td style="padding: 8px 10px; font-weight: 700; color: #60a5fa; font-family: monospace; font-size: 13px;">
            ${item.itemNum}
          </td>
          <td style="padding: 8px 10px;">
            <span style="font-weight: 600; color: var(--text-primary);">${item.categoryLabel}</span>
          </td>
          <td style="padding: 8px 10px; text-align: center; font-weight: 600;">${item.size}</td>
          <td style="padding: 8px 10px; text-align: center;">${item.classVal}</td>
          <td style="padding: 8px 10px;">
            <span style="color: var(--text-secondary);">${item.location}</span>
          </td>
          <td style="padding: 8px 10px;">
            <span style="font-weight: ${item.assignedTo !== '—' ? '600' : '400'}; color: ${item.assignedTo !== '—' ? '#f472b6' : 'var(--text-muted)'};">${item.assignedTo}</span>
            <div style="font-size: 11px; color: var(--text-muted);">${item.status}</div>
          </td>
          <td style="padding: 8px 10px; text-align: center; font-family: monospace; font-size: 12px;">
            ${item.changeOutDateStr}
          </td>
          <td style="padding: 8px 10px; text-align: center;">
            <span class="badge ${item.recertBadgeClass}" style="font-size: 11px; font-weight: 700;">${item.recertLabel}</span>
          </td>
          <td style="padding: 8px 10px; text-align: center;">
            <div style="font-weight: 700; font-family: monospace; color: ${item.tierColor}; font-size: 13px;">${item.ageYears} yrs</div>
            <div style="font-size: 10.5px; color: var(--text-muted);">${item.ageDays} days</div>
          </td>
          <td style="padding: 8px 10px; text-align: center;">
            <span style="display: inline-block; padding: 3px 8px; border-radius: 4px; font-size: 11px; font-weight: 700; background: rgba(255,255,255,0.06); color: ${item.tierColor}; border: 1px solid ${item.tierColor}40;">
              ${item.tierLabel}
            </span>
          </td>
        </tr>
      `;
    });

    html += '</tbody></table>';
    container.innerHTML = html;
  }
}
