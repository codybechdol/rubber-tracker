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

    let list = Object.values(vendorMap);
    if (list.length === 0) {
      list = this.getDefaultVendors();
    }

    this.vendors = list;
  }

  getDefaultVendors() {
    return [
      {
        name: 'Wagner Smith Equipment Co.',
        contact: 'Customer Service / Sales',
        email: 'sales@wagnersmithequipment.com',
        phone: '(800) 666-6567',
        items: [
          { item: 'Class 0 Glove', itemNumber: 'WS-GLV-0', price: 92.50 },
          { item: 'Class 2 Glove', itemNumber: 'WS-GLV-2', price: 124.00 },
          { item: 'Class 3 Glove', itemNumber: 'WS-GLV-3', price: 158.00 },
          { item: 'Class 0 Sleeve', itemNumber: 'WS-SLV-0', price: 110.00 },
          { item: 'Class 2 Sleeve', itemNumber: 'WS-SLV-2', price: 145.00 },
          { item: 'Class 3 Sleeve', itemNumber: 'WS-SLV-3', price: 185.00 },
          { item: 'Class 4 Blanket', itemNumber: 'WS-BLK-4', price: 175.00 },
          { item: 'Class 4 MACK', itemNumber: 'WS-MCK-4', price: 420.00 },
          { item: 'Grounding Set', itemNumber: 'WS-GND-40', price: 850.00 },
          { item: 'Hot Stick', itemNumber: 'WS-HST-10', price: 340.00 }
        ]
      },
      {
        name: 'JM Test Systems',
        contact: 'Utility Sales & Lab Services',
        email: 'sales@jmtest.com',
        phone: '(800) 353-3411',
        items: [
          { item: 'Class 0 Glove', itemNumber: 'JM-0-BLK', price: 88.00 },
          { item: 'Class 2 Glove', itemNumber: 'JM-2-BLK', price: 118.50 },
          { item: 'Class 3 Glove', itemNumber: 'JM-3-BLK', price: 152.00 },
          { item: 'Class 0 Sleeve', itemNumber: 'JM-SLV-0', price: 105.00 },
          { item: 'Class 2 Sleeve', itemNumber: 'JM-SLV-2', price: 139.00 },
          { item: 'Class 3 Sleeve', itemNumber: 'JM-SLV-3', price: 178.00 },
          { item: 'Class 4 Blanket', itemNumber: 'JM-BLK-4', price: 168.00 },
          { item: 'High Voltage Tester', itemNumber: 'HVT-TAG-500', price: 1250.00 },
          { item: 'Phasing Tester Set', itemNumber: 'PH-SET-815', price: 2100.00 },
          { item: 'AED Unit (Defibrillator)', itemNumber: 'AED-ZLL-PLUS', price: 1695.00 }
        ]
      },
      {
        name: 'Border States Electric',
        contact: 'Safety Products Desk',
        email: 'safety@borderstates.com',
        phone: '(800) 342-3791',
        items: [
          { item: 'Class 0 Glove', itemNumber: 'BSE-GLV0', price: 95.00 },
          { item: 'Class 2 Glove', itemNumber: 'BSE-GLV2', price: 128.00 },
          { item: 'Class 3 Glove', itemNumber: 'BSE-GLV3', price: 162.00 },
          { item: 'Class 2 Sleeve', itemNumber: 'BSE-SLV2', price: 148.00 },
          { item: 'Class 3 Sleeve', itemNumber: 'BSE-SLV3', price: 192.00 },
          { item: 'Class 4 Blanket', itemNumber: 'BSE-BLK4', price: 182.00 }
        ]
      },
      {
        name: 'Grainger Industrial Supply',
        contact: 'Utility Sales Representative',
        email: 'orders@grainger.com',
        phone: '(800) 472-4643',
        items: [
          { item: 'Class 0 Glove', itemNumber: '4JA56', price: 98.25 },
          { item: 'Class 2 Glove', itemNumber: '4JA72', price: 132.50 },
          { item: 'Class 4 Blanket', itemNumber: '6WJ19', price: 189.00 },
          { item: 'AED Unit', itemNumber: '32KJ88', price: 1740.00 }
        ]
      }
    ];
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
      const tClass = (item.classVal || '').toLowerCase().replace('class', '').trim(); // e.g. "0", "2", "4"
      const tType = (item.itemType || '').toLowerCase(); // e.g. "gloves", "sleeves", "blankets", "macks"
      const tSize = (item.size || '').toLowerCase(); // e.g. "10.5", "regular"

      // 1. Try exact match (Type + Class + Size)
      let match = catalog.find(ci => {
        const name = ci.item.toLowerCase();
        const typeMatch = name.includes(tType.slice(0, 4));
        const classMatch = (!tClass || tClass === '—') || name.includes(`class ${tClass}`) || name.includes(` ${tClass} `) || name.includes(`class${tClass}`);
        const sizeMatch = (tSize !== '—') && (name.includes(tSize) || name.includes(`size ${tSize}`));
        return typeMatch && classMatch && sizeMatch;
      });

      // 2. Try general match (Type + Class)
      if (!match) {
        match = catalog.find(ci => {
          const name = ci.item.toLowerCase();
          const typeMatch = name.includes(tType.slice(0, 4));
          const classMatch = (!tClass || tClass === '—') || name.includes(`class ${tClass}`) || name.includes(` ${tClass}`) || name.includes(`class${tClass}`);
          return typeMatch && classMatch;
        });
      }

      // 3. Fallback: Type only (e.g. AED, Grounding Set, Hot Stick, Blanket)
      if (!match) {
        match = catalog.find(ci => {
          const name = ci.item.toLowerCase();
          return name.includes(tType.slice(0, 4));
        });
      }

      if (match) {
        item.price = match.price;
        item.partNumber = match.itemNumber || `${this.selectedVendor.name.slice(0, 2).toUpperCase()}-${tType.slice(0, 3).toUpperCase()}-${item.size !== '—' ? item.size : ''}`;
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
}
