/**
 * procurement.js - Unified Procurement & Purchase Needs Engine (Phase 3)
 */

class ProcurementEngine {
  constructor(db) {
    this.db = db;
    this.items = [];
    this.selectedVendor = null;
    this.vendors = [];
  }

  init() {
    const vendorSelect = document.getElementById('procurement-vendor-select');
    if (vendorSelect) {
      vendorSelect.addEventListener('change', (e) => this.onVendorChange(e.target.value));
    }

    const btnGenPO = document.getElementById('btn-procurement-gen-po');
    if (btnGenPO) {
      btnGenPO.addEventListener('click', () => this.generatePOText());
    }

    const btnCopy = document.getElementById('btn-procurement-copy-po');
    if (btnCopy) {
      btnCopy.addEventListener('click', () => {
        const textarea = document.getElementById('procurement-po-textarea');
        if (textarea) {
          navigator.clipboard.writeText(textarea.value).then(() => {
            btnCopy.textContent = '📋 Copied!';
            setTimeout(() => { btnCopy.textContent = '📋 Copy to Clipboard'; }, 2000);
          });
        }
      });
    }
  }

  loadData() {
    this.loadVendors();
    this.scanPurchaseNeeds();
    this.render();
  }

  loadVendors() {
    const vTable = this.db.getTable('vendors');
    const rawRows = vTable ? (vTable.rawGrid || vTable.rows || []) : [];

    const vendorMap = {};
    rawRows.forEach(r => {
      let vName = '';
      let contact = '';
      let email = '';
      let phone = '';
      let notes = '';
      let item = '';
      let itemNumber = '';
      let price = 0;

      if (Array.isArray(r)) {
        if (String(r[0] || '').toLowerCase() === 'vendor name') return; // skip header
        vName = String(r[0] || '').trim();
        contact = String(r[1] || '').trim();
        email = String(r[2] || '').trim();
        phone = String(r[3] || '').trim();
        notes = String(r[4] || '').trim();
        item = String(r[5] || '').trim();
        itemNumber = String(r[6] || '').trim();
        price = parseFloat(String(r[7] || '0').replace(/[$,]/g, '')) || 0;
      } else if (typeof r === 'object' && r !== null) {
        vName = String(r['Vendor Name'] || r['Vendor'] || r['name'] || '').trim();
        contact = String(r['Contact Name'] || r['Contact'] || '').trim();
        email = String(r['Email'] || '').trim();
        phone = String(r['Phone'] || '').trim();
        notes = String(r['Notes'] || '').trim();
        item = String(r['Item'] || '').trim();
        itemNumber = String(r['Item Number'] || r['Part Number'] || '').trim();
        price = parseFloat(String(r['Price'] || '0').replace(/[$,]/g, '')) || 0;
      }

      if (!vName) return;

      if (!vendorMap[vName]) {
        vendorMap[vName] = {
          name: vName,
          contact: contact,
          email: email,
          phone: phone,
          notes: notes,
          items: []
        };
      }

      if (item) {
        vendorMap[vName].items.push({
          item: item,
          itemNumber: itemNumber,
          price: price
        });
      }
    });

    this.vendors = Object.values(vendorMap);
  }

  scanPurchaseNeeds() {
    const swapSheets = [
      { key: 'glove_swaps', type: 'Gloves', label: '🧤 Gloves' },
      { key: 'sleeve_swaps', type: 'Sleeves', label: '🦺 Sleeves' },
      { key: 'blanket_swaps', type: 'Blankets', label: '🧱 Blankets' },
      { key: 'mack_swaps', type: 'MACKs', label: '🧱 MACKs' },
      { key: 'hv_tester_swaps', type: 'HV Testers', label: '⚡ HV Testers' },
      { key: 'phasing_set_swaps', type: 'Phasing Sets', label: '⚡ Phasing Sets' },
      { key: 'ground_swaps', type: 'Grounds', label: '⚡ Grounds' },
      { key: 'hot_stick_swaps', type: 'Hot Sticks', label: '🔴 Hot Sticks' },
      { key: 'aed_swaps', type: 'AED', label: '🏥 AED Units' }
    ];

    const aggregated = {};

    swapSheets.forEach(s => {
      const table = this.db.getTable(s.key);
      if (!table) return;

      const rawRows = table.rawGrid || table.rows || [];
      if (!rawRows.length) return;

      let currentClass = 'Class 0';
      if (s.type === 'Sleeves') currentClass = 'Class 2';
      else if (s.type === 'Blankets') currentClass = 'Class 4';
      else if (s.type === 'MACKs') currentClass = 'Class 4';

      rawRows.forEach((row, rowIdx) => {
        let emp = '';
        let itemNum = '';
        let size = '—';
        let pickItem = '';
        let status = '';
        let daysLeft = 30;

        if (Array.isArray(row)) {
          const firstCell = String(row[0] || '').trim();
          if (firstCell.toUpperCase().includes('CLASS 0')) currentClass = 'Class 0';
          else if (firstCell.toUpperCase().includes('CLASS 2')) currentClass = 'Class 2';
          else if (firstCell.toUpperCase().includes('CLASS 3')) currentClass = 'Class 3';
          else if (firstCell.toUpperCase().includes('CLASS 4')) currentClass = 'Class 4';

          // Skip section headers or subheaders
          if (firstCell.includes('📍') || firstCell.includes('👤') || firstCell.includes('👷') ||
              firstCell.includes('Foreman:') || firstCell.includes('Swaps') || firstCell === 'Employee' || firstCell === 'Item #') {
            return;
          }

          emp = firstCell;
          itemNum = String(row[1] || '').trim();
          size = String(row[2] || '—').trim();
          const daysVal = parseInt(row[5], 10);
          if (!isNaN(daysVal)) daysLeft = daysVal;
          pickItem = String(row[6] || '').trim();
          status = String(row[7] || '').trim();
        } else if (typeof row === 'object' && row !== null) {
          emp = String(row['Employee'] || row['Employee Name'] || row['Assigned To'] || '').trim();
          itemNum = String(row['Current Item #'] || row['Item #'] || '').trim();
          size = String(row['Size'] || '—').trim();
          const daysVal = parseInt(row['Days Left'] || row['Days Remaining'], 10);
          if (!isNaN(daysVal)) daysLeft = daysVal;
          pickItem = String(row['Pick List Item #'] || row['Pick Item #'] || '').trim();
          status = String(row['Status'] || row['Pick List Status'] || '').trim();
          if (row['Class'] || row['KV']) currentClass = String(row['Class'] || row['KV']);
        }

        const statLower = status.toLowerCase();
        const isSizeUp = statLower.includes('size up');
        const isNeedToPurchase = statLower.includes('need to purchase') ||
                                 statLower.includes('purchase') ||
                                 isSizeUp ||
                                 pickItem === '—' ||
                                 (pickItem === '' && statLower.includes('unassigned'));

        if (!isNeedToPurchase || !emp) return;

        const aggKey = `${s.type}|${size}|${currentClass}`;

        if (!aggregated[aggKey]) {
          aggregated[aggKey] = {
            itemType: s.type,
            typeLabel: s.label,
            size: size,
            classVal: currentClass,
            quantity: 0,
            employees: [],
            sizeUpCount: 0,
            minDaysLeft: daysLeft,
            selected: true,
            price: 0,
            partNumber: ''
          };
        }

        aggregated[aggKey].quantity += 1;
        if (isSizeUp) aggregated[aggKey].sizeUpCount += 1;
        const empLabel = isSizeUp ? `${emp} (Size Up Picked)` : emp;
        if (emp && !aggregated[aggKey].employees.includes(empLabel)) {
          aggregated[aggKey].employees.push(empLabel);
        }
        if (daysLeft < aggregated[aggKey].minDaysLeft) {
          aggregated[aggKey].minDaysLeft = daysLeft;
        }
      });
    });

    this.items = Object.values(aggregated).map(item => {
      let priority = 'LOW';
      let priorityEmoji = '🟢';
      let timeframe = 'Consider / Future';

      if (item.minDaysLeft <= 14) {
        priority = 'HIGH';
        priorityEmoji = '🔴';
        timeframe = 'Immediate (< 14d)';
      } else if (item.minDaysLeft <= 30) {
        priority = 'MEDIUM';
        priorityEmoji = '🟠';
        timeframe = 'Soon (15-30d)';
      }

      return {
        ...item,
        priority,
        priorityEmoji,
        timeframe
      };
    });

    this.items.sort((a, b) => {
      const order = { 'HIGH': 1, 'MEDIUM': 2, 'LOW': 3 };
      return (order[a.priority] || 4) - (order[b.priority] || 4) || b.quantity - a.quantity;
    });
  }

  onVendorChange(vendorName) {
    this.selectedVendor = this.vendors.find(v => v.name === vendorName) || null;
    this.updatePricing();
    this.render();
  }

  updatePricing() {
    if (!this.selectedVendor || !this.selectedVendor.items) {
      this.items.forEach(i => {
        i.price = 0;
        i.partNumber = '';
      });
      return;
    }

    const catalog = this.selectedVendor.items;

    this.items.forEach(item => {
      const tClassNum = (item.classVal || '').replace(/[^0-9]/g, '').trim(); // e.g. "0", "2", "4"
      const tType = (item.itemType || '').toLowerCase(); // e.g. "gloves", "sleeves", "blankets", "macks"
      const tSize = (item.size || '').toLowerCase().trim(); // e.g. "10.5", "9", "regular"

      // 1. Exact Match (Type + Class + Size) - e.g. "Glove CL2 9.5", "Glove Class 2 9.5"
      let match = catalog.find(ci => {
        const name = ci.item.toLowerCase();
        const typeMatch = name.includes(tType.slice(0, 4)) || (tType.startsWith('glove') && name.includes('glove')) || (tType.startsWith('sleeve') && name.includes('sleeve')) || (tType.startsWith('blanket') && name.includes('blanket'));
        const classMatch = !tClassNum || name.includes(`cl${tClassNum}`) || name.includes(`class ${tClassNum}`) || name.includes(`class${tClassNum}`) || name.includes(` ${tClassNum} `) || name.endsWith(` ${tClassNum}`);
        const sizeMatch = (tSize !== '—' && tSize !== '') && (
          name.endsWith(` ${tSize}`) ||
          name.includes(` ${tSize} `) ||
          name.includes(` ${tSize}`) ||
          name.includes(`size ${tSize}`) ||
          name.includes(` ${tSize}h`) ||
          name.includes(tSize)
        );
        return typeMatch && classMatch && sizeMatch;
      });

      // 2. Type + Class Match (e.g. "Class 2 Sleeve", "Blanket CL4")
      if (!match) {
        match = catalog.find(ci => {
          const name = ci.item.toLowerCase();
          const typeMatch = name.includes(tType.slice(0, 4)) || (tType.startsWith('glove') && name.includes('glove')) || (tType.startsWith('sleeve') && name.includes('sleeve')) || (tType.startsWith('blanket') && name.includes('blanket'));
          const classMatch = !tClassNum || name.includes(`cl${tClassNum}`) || name.includes(`class ${tClassNum}`) || name.includes(`class${tClassNum}`);
          return typeMatch && classMatch;
        });
      }

      // 3. Fallback Type Match (e.g. "AED", "Grounding", "Hot Stick")
      if (!match) {
        match = catalog.find(ci => {
          const name = ci.item.toLowerCase();
          return name.includes(tType.slice(0, 4));
        });
      }

      if (match) {
        item.price = match.price;
        item.partNumber = match.itemNumber || '';
      } else {
        item.price = 0;
        item.partNumber = '';
      }
    });
  }

  render() {
    const vSelect = document.getElementById('procurement-vendor-select');
    if (vSelect) {
      const currentVal = this.selectedVendor ? this.selectedVendor.name : '';
      vSelect.innerHTML = '<option value="">Select a vendor...</option>' +
        this.vendors.map(v => `<option value="${v.name}" ${v.name === currentVal ? 'selected' : ''}>${v.name} (${v.items.length} items)</option>`).join('');
    }

    const vInfo = document.getElementById('procurement-vendor-info');
    if (vInfo) {
      if (this.selectedVendor) {
        vInfo.innerHTML = `<strong>${this.selectedVendor.name}</strong> • Contact: ${this.selectedVendor.contact || 'N/A'} • Email: ${this.selectedVendor.email || 'N/A'} • Phone: ${this.selectedVendor.phone || 'N/A'}`;
      } else {
        vInfo.innerHTML = '<span style="color: var(--text-muted);">Select a vendor to auto-match catalog pricing and part numbers.</span>';
      }
    }

    const container = document.getElementById('procurement-items-table');
    if (!container) return;

    if (this.items.length === 0) {
      container.innerHTML = `
        <div style="padding: 40px; text-align: center; color: var(--text-muted);">
          <div style="font-size: 32px; margin-bottom: 8px;">✅</div>
          <h3 style="color: var(--text-primary); font-size: 16px;">All Equipment In Stock</h3>
          <p style="margin-top: 6px; font-size: 13px;">No items currently require purchase across any swap sheets.</p>
        </div>
      `;
      this.updateTotals();
      return;
    }

    let html = `
      <table class="table" style="width: 100%; border-collapse: collapse; font-size: 13px;">
        <thead>
          <tr style="background: rgba(255,255,255,0.05); border-bottom: 2px solid var(--border-color);">
            <th style="padding: 10px; width: 40px; text-align: center;"><input type="checkbox" id="procurement-select-all" checked></th>
            <th style="padding: 10px; text-align: left;">Category & Item</th>
            <th style="padding: 10px; text-align: center; width: 80px;">Size</th>
            <th style="padding: 10px; text-align: center; width: 90px;">Class / KV</th>
            <th style="padding: 10px; text-align: center; width: 80px;">Qty</th>
            <th style="padding: 10px; text-align: center; width: 140px;">Urgency</th>
            <th style="padding: 10px; text-align: right; width: 100px;">Unit Price</th>
            <th style="padding: 10px; text-align: right; width: 110px;">Est. Total</th>
          </tr>
        </thead>
        <tbody>
    `;

    this.items.forEach((item, idx) => {
      const isChecked = item.selected ? 'checked' : '';
      const totalCost = (item.price || 0) * item.quantity;
      const notes = item.employees.length > 0 ? `For: ${item.employees.join(', ')}` : '';

      html += `
        <tr style="border-bottom: 1px solid var(--border-color); ${item.selected ? 'background: rgba(37, 99, 235, 0.05);' : ''}">
          <td style="padding: 8px; text-align: center;">
            <input type="checkbox" class="procurement-item-check" data-idx="${idx}" ${isChecked}>
          </td>
          <td style="padding: 8px;">
            <div style="font-weight: 600; color: var(--text-primary);">${item.typeLabel}</div>
            ${item.partNumber ? `<div style="font-size: 11px; color: #3b82f6;">PN: ${item.partNumber}</div>` : ''}
            ${notes ? `<div style="font-size: 11px; color: var(--text-muted);">${notes}</div>` : ''}
          </td>
          <td style="padding: 8px; text-align: center; font-weight: 600;">${item.size}</td>
          <td style="padding: 8px; text-align: center;">${item.classVal}</td>
          <td style="padding: 8px; text-align: center;">
            <input type="number" min="1" value="${item.quantity}" data-idx="${idx}" class="procurement-qty-input" style="width: 55px; padding: 4px 6px; text-align: center; background: var(--bg-tertiary); border: 1px solid var(--border-color); border-radius: 4px; color: var(--text-primary);">
          </td>
          <td style="padding: 8px; text-align: center;">
            <span class="badge ${item.priority === 'HIGH' ? 'badge-danger' : (item.priority === 'MEDIUM' ? 'badge-warning' : 'badge-success')}">
              ${item.priorityEmoji} ${item.timeframe}
            </span>
          </td>
          <td style="padding: 8px; text-align: right; font-family: monospace;">
            ${item.price > 0 ? `$${item.price.toFixed(2)}` : '—'}
          </td>
          <td style="padding: 8px; text-align: right; font-weight: 600; font-family: monospace;">
            ${totalCost > 0 ? `$${totalCost.toFixed(2)}` : '—'}
          </td>
        </tr>
      `;
    });

    html += '</tbody></table>';
    container.innerHTML = html;

    const selectAll = document.getElementById('procurement-select-all');
    if (selectAll) {
      selectAll.addEventListener('change', (e) => {
        const val = e.target.checked;
        this.items.forEach(i => i.selected = val);
        this.render();
      });
    }

    container.querySelectorAll('.procurement-item-check').forEach(cb => {
      cb.addEventListener('change', (e) => {
        const idx = parseInt(e.target.dataset.idx, 10);
        if (this.items[idx]) {
          this.items[idx].selected = e.target.checked;
          this.updateTotals();
        }
      });
    });

    container.querySelectorAll('.procurement-qty-input').forEach(input => {
      input.addEventListener('change', (e) => {
        const idx = parseInt(e.target.dataset.idx, 10);
        const qty = parseInt(e.target.value, 10) || 1;
        if (this.items[idx]) {
          this.items[idx].quantity = Math.max(1, qty);
          this.render();
        }
      });
    });

    this.updateTotals();
  }

  updateTotals() {
    let selectedCount = 0;
    let totalQty = 0;
    let totalCost = 0;

    this.items.forEach(i => {
      if (i.selected) {
        selectedCount++;
        totalQty += i.quantity;
        totalCost += (i.price || 0) * i.quantity;
      }
    });

    const badge = document.getElementById('procurement-selected-badge');
    if (badge) badge.textContent = `${selectedCount} items selected (${totalQty} units)`;

    const totalEl = document.getElementById('procurement-total-cost');
    if (totalEl) totalEl.textContent = `$${totalCost.toFixed(2)}`;
  }

  generatePOText() {
    const selected = this.items.filter(i => i.selected);
    if (selected.length === 0) {
      alert('Please select at least one item to generate a purchase order.');
      return;
    }

    const currentYear = new Date().getFullYear();
    const poNum = `002-${String(currentYear).slice(-2)}`;
    const vendorName = this.selectedVendor ? this.selectedVendor.name : '[Vendor Name]';
    const dateStr = new Date().toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' });

    let lines = [];
    lines.push(`PURCHASE ORDER: ${poNum}`);
    lines.push(`Date: ${dateStr}`);
    lines.push(`Vendor: ${vendorName}`);
    if (this.selectedVendor && this.selectedVendor.email) lines.push(`Attn: ${this.selectedVendor.contact || ''} (${this.selectedVendor.email})`);
    lines.push('----------------------------------------------------');
    lines.push('Please fulfill the following order:\n');

    let grandTotal = 0;

    selected.forEach(item => {
      let line = `• (${item.quantity}) ${item.itemType} - Size ${item.size} - Class/Rating: ${item.classVal}`;
      if (item.partNumber) line += ` [Part #: ${item.partNumber}]`;
      if (item.price > 0) {
        const itemTotal = item.price * item.quantity;
        grandTotal += itemTotal;
        line += ` @ $${item.price.toFixed(2)} ea = $${itemTotal.toFixed(2)}`;
      }
      lines.push(line);
    });

    lines.push('\n----------------------------------------------------');
    if (grandTotal > 0) {
      lines.push(`Estimated Total: $${grandTotal.toFixed(2)}`);
    }
    lines.push('Please confirm availability and estimated delivery date.\n');
    lines.push('Thank you,\nSafety Department');

    const poText = lines.join('\n');

    const modal = document.getElementById('procurement-po-modal');
    const textarea = document.getElementById('procurement-po-textarea');
    if (modal && textarea) {
      textarea.value = poText;
      modal.style.display = 'flex';
    }
  }

  openManageVendorsModal() {
    this.activeModalVendorIdx = (this.activeModalVendorIdx !== undefined && this.activeModalVendorIdx < this.vendors.length) ? this.activeModalVendorIdx : 0;
    this.renderVendorModal();
    const modal = document.getElementById('manage-vendors-modal');
    if (modal) modal.style.display = 'flex';
  }

  closeManageVendorsModal() {
    const modal = document.getElementById('manage-vendors-modal');
    if (modal) modal.style.display = 'none';
  }

  renderVendorModal() {
    const body = document.getElementById('manage-vendors-modal-body');
    if (!body) return;

    if (!this.vendors || this.vendors.length === 0) {
      body.innerHTML = `
        <div style="padding: 50px 20px; text-align: center; color: var(--text-muted);">
          <div style="font-size: 36px; margin-bottom: 10px;">🏢</div>
          <h3 style="color: var(--text-primary); font-size: 16px; margin-bottom: 6px;">No Vendors Configured</h3>
          <p style="font-size: 13px; max-width: 440px; margin: 0 auto 16px;">
            Click <strong>"➕ Add Vendor"</strong> to create a vendor, or click <strong>"Download Snapshot"</strong> to sync with Google Sheets.
          </p>
          <button class="btn btn-primary" style="font-size: 12px; padding: 6px 16px;" onclick="window.procurementEngine.addVendor()">➕ Add Vendor</button>
        </div>
      `;
      return;
    }

    const currentV = this.vendors[this.activeModalVendorIdx] || this.vendors[0];

    let html = `
      <div style="display: grid; grid-template-columns: 280px 1fr; gap: 20px; min-height: 480px;">
        <!-- Left Column: Vendors List -->
        <div style="background: rgba(15, 23, 42, 0.6); border: 1px solid var(--border-color); border-radius: 8px; padding: 14px; display: flex; flex-direction: column; gap: 12px;">
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <div style="font-weight: 700; font-size: 13px; color: #93c5fd;">🏢 Vendors (${this.vendors.length})</div>
            <button class="btn btn-primary" style="font-size: 11px; padding: 4px 8px;" onclick="window.procurementEngine.addVendor()">➕ Add</button>
          </div>
          <div style="flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: 6px; max-height: 420px;">
    `;

    this.vendors.forEach((v, idx) => {
      const isSelected = idx === this.activeModalVendorIdx;
      html += `
        <div style="padding: 10px; border-radius: 6px; cursor: pointer; border: 1px solid ${isSelected ? '#3b82f6' : 'var(--border-color)'}; background: ${isSelected ? 'rgba(59, 130, 246, 0.15)' : 'rgba(30, 41, 59, 0.4)'}; display: flex; justify-content: space-between; align-items: center;" onclick="window.procurementEngine.selectModalVendor(${idx})">
          <div>
            <div style="font-weight: ${isSelected ? '700' : '500'}; color: ${isSelected ? '#fff' : 'var(--text-primary)'}; font-size: 12.5px;">${v.name || 'Unnamed Vendor'}</div>
            <div style="font-size: 11px; color: var(--text-muted);">${(v.items || []).length} catalog items</div>
          </div>
          <button class="btn btn-secondary" style="padding: 2px 6px; font-size: 11px; color: #f87171;" title="Delete Vendor" onclick="event.stopPropagation(); window.procurementEngine.deleteVendor(${idx})">🗑️</button>
        </div>
      `;
    });

    html += `
          </div>
        </div>

        <!-- Right Column: Vendor Details & Product Catalog -->
        <div style="display: flex; flex-direction: column; gap: 16px; overflow-y: auto;">
          <!-- Vendor Contact Info -->
          <div style="background: rgba(30, 41, 59, 0.5); border: 1px solid var(--border-color); border-radius: 8px; padding: 14px;">
            <div style="font-weight: 700; font-size: 13px; color: #93c5fd; margin-bottom: 10px;">👤 Vendor Contact Details</div>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
              <div>
                <label style="font-size: 11px; color: var(--text-muted); display: block; margin-bottom: 3px;">Vendor Name</label>
                <input type="text" value="${currentV.name || ''}" class="form-input" style="width: 100%; font-size: 12px; padding: 6px; background: var(--bg-tertiary); border: 1px solid var(--border-color); border-radius: 4px; color: #fff;" onchange="window.procurementEngine.updateCurrentVendorField('name', this.value)">
              </div>
              <div>
                <label style="font-size: 11px; color: var(--text-muted); display: block; margin-bottom: 3px;">Contact Person</label>
                <input type="text" value="${currentV.contact || ''}" class="form-input" style="width: 100%; font-size: 12px; padding: 6px; background: var(--bg-tertiary); border: 1px solid var(--border-color); border-radius: 4px; color: #fff;" onchange="window.procurementEngine.updateCurrentVendorField('contact', this.value)">
              </div>
              <div>
                <label style="font-size: 11px; color: var(--text-muted); display: block; margin-bottom: 3px;">Email Address</label>
                <input type="email" value="${currentV.email || ''}" class="form-input" style="width: 100%; font-size: 12px; padding: 6px; background: var(--bg-tertiary); border: 1px solid var(--border-color); border-radius: 4px; color: #fff;" onchange="window.procurementEngine.updateCurrentVendorField('email', this.value)">
              </div>
              <div>
                <label style="font-size: 11px; color: var(--text-muted); display: block; margin-bottom: 3px;">Phone Number</label>
                <input type="text" value="${currentV.phone || ''}" class="form-input" style="width: 100%; font-size: 12px; padding: 6px; background: var(--bg-tertiary); border: 1px solid var(--border-color); border-radius: 4px; color: #fff;" onchange="window.procurementEngine.updateCurrentVendorField('phone', this.value)">
              </div>
            </div>
          </div>

          <!-- Product Catalog Section -->
          <div style="background: rgba(30, 41, 59, 0.5); border: 1px solid var(--border-color); border-radius: 8px; padding: 14px; flex: 1; display: flex; flex-direction: column;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
              <div style="font-weight: 700; font-size: 13px; color: #93c5fd;">📦 Product Catalog & Pricing</div>
              <button class="btn btn-primary" style="font-size: 11px; padding: 4px 10px;" onclick="window.procurementEngine.addCatalogItem()">➕ Add Item</button>
            </div>

            <div style="flex: 1; max-height: 280px; overflow-y: auto;">
              <table style="width: 100%; border-collapse: collapse; font-size: 12px;">
                <thead>
                  <tr style="border-bottom: 1px solid var(--border-color); color: var(--text-muted); text-align: left;">
                    <th style="padding: 6px;">Item Description</th>
                    <th style="padding: 6px; width: 160px;">Part / Item #</th>
                    <th style="padding: 6px; width: 110px; text-align: right;">Unit Price ($)</th>
                    <th style="padding: 6px; width: 40px;"></th>
                  </tr>
                </thead>
                <tbody>
    `;

    if (!currentV.items || currentV.items.length === 0) {
      html += `<tr><td colspan="4" style="text-align: center; padding: 20px; color: var(--text-muted);">No catalog items. Click "➕ Add Item" to add pricing.</td></tr>`;
    } else {
      currentV.items.forEach((it, iIdx) => {
        html += `
          <tr style="border-bottom: 1px solid rgba(255,255,255,0.05);">
            <td style="padding: 6px;">
              <input type="text" value="${it.item || ''}" placeholder="e.g. Class 0 Glove, Class 4 Blanket" style="width: 100%; font-size: 12px; padding: 4px 6px; background: var(--bg-tertiary); border: 1px solid var(--border-color); border-radius: 4px; color: #fff;" onchange="window.procurementEngine.updateCatalogItem(${iIdx}, 'item', this.value)">
            </td>
            <td style="padding: 6px;">
              <input type="text" value="${it.itemNumber || ''}" placeholder="e.g. WS-GLV-0" style="width: 100%; font-size: 12px; padding: 4px 6px; background: var(--bg-tertiary); border: 1px solid var(--border-color); border-radius: 4px; color: #fff;" onchange="window.procurementEngine.updateCatalogItem(${iIdx}, 'itemNumber', this.value)">
            </td>
            <td style="padding: 6px; text-align: right;">
              <input type="number" step="0.01" min="0" value="${it.price || 0}" style="width: 90px; text-align: right; font-size: 12px; padding: 4px 6px; background: var(--bg-tertiary); border: 1px solid var(--border-color); border-radius: 4px; color: #4ade80;" onchange="window.procurementEngine.updateCatalogItem(${iIdx}, 'price', parseFloat(this.value)||0)">
            </td>
            <td style="padding: 6px; text-align: center;">
              <button class="btn btn-secondary" style="padding: 2px 5px; font-size: 11px; color: #f87171;" title="Delete Item" onclick="window.procurementEngine.deleteCatalogItem(${iIdx})">✕</button>
            </td>
          </tr>
        `;
      });
    }

    html += `
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    `;

    body.innerHTML = html;
  }

  selectModalVendor(idx) {
    this.activeModalVendorIdx = idx;
    this.renderVendorModal();
  }

  addVendor() {
    const newName = prompt('Enter new vendor name:');
    if (!newName || !newName.trim()) return;
    this.vendors.push({
      name: newName.trim(),
      contact: '',
      email: '',
      phone: '',
      notes: '',
      items: [
        { item: 'Class 0 Glove', itemNumber: '', price: 0 },
        { item: 'Class 2 Glove', itemNumber: '', price: 0 },
        { item: 'Class 2 Sleeve', itemNumber: '', price: 0 },
        { item: 'Class 4 Blanket', itemNumber: '', price: 0 }
      ]
    });
    this.activeModalVendorIdx = this.vendors.length - 1;
    this.renderVendorModal();
  }

  deleteVendor(idx) {
    const v = this.vendors[idx];
    if (!v) return;
    if (confirm(`Are you sure you want to delete vendor "${v.name}"?`)) {
      this.vendors.splice(idx, 1);
      if (this.activeModalVendorIdx >= this.vendors.length) {
        this.activeModalVendorIdx = Math.max(0, this.vendors.length - 1);
      }
      this.renderVendorModal();
    }
  }

  updateCurrentVendorField(field, val) {
    const currentV = this.vendors[this.activeModalVendorIdx];
    if (currentV) {
      currentV[field] = val;
    }
  }

  addCatalogItem() {
    const currentV = this.vendors[this.activeModalVendorIdx];
    if (!currentV) return;
    if (!currentV.items) currentV.items = [];
    currentV.items.push({
      item: 'New Item',
      itemNumber: '',
      price: 0
    });
    this.renderVendorModal();
  }

  deleteCatalogItem(iIdx) {
    const currentV = this.vendors[this.activeModalVendorIdx];
    if (!currentV || !currentV.items) return;
    currentV.items.splice(iIdx, 1);
    this.renderVendorModal();
  }

  updateCatalogItem(iIdx, field, val) {
    const currentV = this.vendors[this.activeModalVendorIdx];
    if (currentV && currentV.items && currentV.items[iIdx]) {
      currentV.items[iIdx][field] = val;
    }
  }

  async saveVendorsToDB() {
    const saveBtn = document.getElementById('btn-save-vendors');
    if (saveBtn) saveBtn.textContent = '⏳ Saving...';

    const headers = ['Vendor Name', 'Contact Name', 'Email', 'Phone', 'Notes', 'Item', 'Item Number', 'Price'];
    const rows = [];
    const rawGrid = [headers];

    this.vendors.forEach(v => {
      if (v.items && v.items.length > 0) {
        v.items.forEach(it => {
          const rowObj = {
            'Vendor Name': v.name,
            'Contact Name': v.contact,
            'Email': v.email,
            'Phone': v.phone,
            'Notes': v.notes,
            'Item': it.item,
            'Item Number': it.itemNumber,
            'Price': it.price
          };
          rows.push(rowObj);
          rawGrid.push([v.name, v.contact, v.email, v.phone, v.notes, it.item, it.itemNumber, it.price]);
        });
      } else {
        const rowObj = {
          'Vendor Name': v.name,
          'Contact Name': v.contact,
          'Email': v.email,
          'Phone': v.phone,
          'Notes': v.notes,
          'Item': '',
          'Item Number': '',
          'Price': 0
        };
        rows.push(rowObj);
        rawGrid.push([v.name, v.contact, v.email, v.phone, v.notes, '', '', 0]);
      }
    });

    const vTable = {
      name: 'Vendors',
      headers: headers,
      rows: rows,
      rawGrid: rawGrid,
      rowCount: rows.length,
      maxRows: rows.length + 1,
      maxCols: 8
    };

    await this.db.saveTable('vendors', vTable);

    this.updatePricing();
    this.render();
    this.closeManageVendorsModal();

    if (saveBtn) saveBtn.innerHTML = '<span>💾</span> Save Vendor Changes';
    alert('✅ Vendor catalog saved successfully! Click "Push Changes to Sheets" at the top whenever you wish to sync changes back to Google Sheets.');
  }

  /**
   * Generates formatted PO Email via mailto:
   */
  sendPoEmail() {
    const activeItems = (this.items || []).filter(i => i.selected && i.quantity > 0);
    if (activeItems.length === 0) {
      alert('⚠️ No purchase items selected.');
      return;
    }

    const v = this.selectedVendor;
    const recipient = v ? v.email : '';
    const subject = encodeURIComponent(`Purchase Order Request - PPE & Equipment (${new Date().toLocaleDateString()})`);
    
    let bodyText = `Dear ${v ? (v.contact || v.name) : 'Vendor'},\n\nPlease process the following purchase order for Mountain Power:\n\n`;
    bodyText += `========================================================\n`;
    bodyText += `ITEM DESCRIPTION | SPEC | PART # | QTY | UNIT PRICE | TOTAL\n`;
    bodyText += `========================================================\n`;

    let grandTotal = 0;
    activeItems.forEach(item => {
      const lineTotal = item.price > 0 ? (item.price * item.quantity) : 0;
      grandTotal += lineTotal;
      bodyText += `${item.itemType} | Size: ${item.size} (${item.classVal}) | Part: ${item.partNumber || 'N/A'} | Qty: ${item.quantity} | Unit: $${item.price.toFixed(2)} | Total: $${lineTotal.toFixed(2)}\n`;
    });

    bodyText += `========================================================\n`;
    bodyText += `ESTIMATED GRAND TOTAL: $${grandTotal.toFixed(2)}\n\n`;
    bodyText += `Ship To:\nMountain Power - Helena Base\nSafety & PPE Operations\nHelena, MT\n\nThank you,\nSafety Department`;

    const mailtoUrl = `mailto:${encodeURIComponent(recipient)}?subject=${subject}&body=${encodeURIComponent(bodyText)}`;
    window.open(mailtoUrl, '_blank');
  }

  /**
   * Downloads formatted CSV for purchasing system import.
   */
  downloadPoCsv() {
    const activeItems = (this.items || []).filter(i => i.selected && i.quantity > 0);
    if (activeItems.length === 0) {
      alert('⚠️ No purchase items selected.');
      return;
    }

    const lines = ['Item Category,Size,Class / KV,Part Number,Quantity,Unit Price,Subtotal,Assigned Personnel'];
    activeItems.forEach(i => {
      const sub = (i.price * i.quantity).toFixed(2);
      const emps = `"${i.employees.join('; ')}"`;
      lines.push(`"${i.itemType}","${i.size}","${i.classVal}","${i.partNumber}",${i.quantity},$${i.price.toFixed(2)},$${sub},${emps}`);
    });

    const csvContent = lines.join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Purchase_Order_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }
}
