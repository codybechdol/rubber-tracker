/**
 * item-stats.js - Item Lifecycle Analytics & Visualizer Engine for Desktop App
 * Computes lifespan, time breakdown (field vs shelf vs testing vs packed for testing vs packed for delivery vs lost),
 * test turnaround cycles, and renders interactive visual timeline steppers.
 */

class ItemStatsEngine {
  constructor(db) {
    this.db = db;
  }

  parseDate(val) {
    if (!val || val === 'N/A') return null;
    if (val instanceof Date) return val;
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
    const dt = new Date(s);
    return isNaN(dt.getTime()) ? null : dt;
  }

  formatDate(d) {
    if (!d || !(d instanceof Date) || isNaN(d.getTime())) return '';
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const yyyy = d.getFullYear();
    return `${mm}/${dd}/${yyyy}`;
  }

  formatDuration(days) {
    days = Math.max(0, Math.round(days || 0));
    if (days === 0) return '0 days';
    if (days === 1) return '1 day';
    if (days < 30) return `${days} days`;
    if (days < 365) {
      const mos = (days / 30.4375).toFixed(1);
      return `${mos} mos (${days}d)`;
    }
    const yrs = (days / 365.25).toFixed(1);
    return `${yrs} yrs (${days}d)`;
  }

  classifyState(assignedTo, location, notes, status) {
    const sAssigned = String(assignedTo || '').toLowerCase().trim();
    const sLoc = String(location || '').toLowerCase().trim();
    const sStatus = String(status || '').toLowerCase().trim();

    // 1. Retired / Failed (End of life only)
    if (
      sAssigned === 'failed rubber' ||
      sAssigned === 'failed' ||
      sAssigned === 'not repairable' ||
      sAssigned === 'destroyed' ||
      sStatus === 'failed rubber' ||
      sStatus === 'failed' ||
      sStatus === 'not repairable' ||
      sStatus === 'destroyed'
    ) {
      return {
        key: 'RETIRED',
        label: 'Retired / Failed',
        badgeClass: 'badge-retired',
        color: '#ef4444',
        icon: '❌'
      };
    }

    // 2. Lost / Missing (Location unknown / Needs locating)
    if (
      sAssigned === 'lost' ||
      sLoc === 'lost' ||
      sStatus === 'lost' ||
      sAssigned.includes('lost') ||
      sLoc.includes('lost') ||
      sStatus.includes('lost')
    ) {
      return {
        key: 'LOST',
        label: 'Lost (Missing)',
        badgeClass: 'badge-lost',
        color: '#eab308',
        icon: '🔍'
      };
    }

    // 3. Packed For Testing (Truck staging for testing lab)
    if (
      sAssigned === 'packed for testing' ||
      sStatus === 'packed for testing' ||
      (sStatus === 'ready for test' && sLoc === "cody's truck")
    ) {
      return {
        key: 'PACKED_TESTING',
        label: 'Packed For Testing',
        badgeClass: 'badge-packed-testing',
        color: '#f97316',
        icon: '🚚'
      };
    }

    // 4. Packed For Delivery (Truck staging for field delivery)
    if (
      sAssigned === 'packed for delivery' ||
      sStatus === 'packed for delivery' ||
      sStatus === 'ready for delivery' ||
      (sLoc === "cody's truck" && !sAssigned.includes('testing'))
    ) {
      return {
        key: 'PACKED_DELIVERY',
        label: 'Packed For Delivery',
        badgeClass: 'badge-packed-delivery',
        color: '#06b6d4',
        icon: '🚚'
      };
    }

    // 5. In Testing (Lab)
    if (
      sAssigned === 'in testing' ||
      sAssigned === 'arnett' ||
      sAssigned === 'jm test' ||
      sAssigned === 'arnett / jm test' ||
      sAssigned === 'lab' ||
      sAssigned === 'testing' ||
      sLoc === 'arnett / jm test' ||
      sLoc === 'arnett' ||
      sLoc === 'jm test' ||
      sStatus === 'in testing' ||
      sStatus === 'ready for test'
    ) {
      return {
        key: 'TESTING',
        label: 'In Testing (Lab)',
        badgeClass: 'badge-testing',
        color: '#a855f7',
        icon: '🔬'
      };
    }

    // 6. On Shelf / Storage / Unassigned
    if (
      sAssigned === 'on shelf' ||
      sAssigned === 'storage' ||
      sAssigned === 'available' ||
      sAssigned === 'unassigned' ||
      sAssigned === 'shelf' ||
      sAssigned === 'previous employee' ||
      sAssigned === 'n/a' ||
      sAssigned === 'none' ||
      sAssigned === 'unknown' ||
      !sAssigned ||
      sStatus === 'on shelf' ||
      sStatus === 'in stock' ||
      (sLoc === 'helena' && (!sAssigned || sAssigned === 'n/a' || sAssigned === 'helena'))
    ) {
      return {
        key: 'SHELF',
        label: 'On Shelf / Storage',
        badgeClass: 'badge-shelf',
        color: '#f59e0b',
        icon: '📦'
      };
    }

    // 7. Default: Field Service (Assigned to Lineman)
    return {
      key: 'FIELD',
      label: 'Field Service (Assigned)',
      badgeClass: 'badge-field',
      color: '#3b82f6',
      icon: '👷'
    };
  }

  analyzeLifecycle(itemKey, groupRows, activeInvItem = null) {
    if (!groupRows || groupRows.length === 0) {
      return null;
    }

    // Sort chronologically (oldest first: index 0 is first acquisition, last index is current)
    const sorted = [...groupRows].sort((a, b) => {
      const dateA = this.parseDate(a['Date Assigned'] || a['Date'] || Object.values(a)[0]);
      const dateB = this.parseDate(b['Date Assigned'] || b['Date'] || Object.values(b)[0]);
      const tA = dateA ? dateA.getTime() : 0;
      const tB = dateB ? dateB.getTime() : 0;
      return tA - tB;
    });

    let firstDate = this.parseDate(sorted[0]['Date Assigned'] || sorted[0]['Date'] || Object.values(sorted[0])[0]) || new Date();
    const now = new Date();

    let fieldDays = 0;
    let shelfDays = 0;
    let testingDays = 0;
    let packedTestingDays = 0;
    let packedDeliveryDays = 0;
    let lostDays = 0;
    let retiredDays = 0;

    let testCyclesCount = 0;
    let linemenMap = {}; // name -> totalDays
    const milestones = [];

    let isRetired = false;
    let retiredDate = null;
    let retiredReason = '';

    for (let i = 0; i < sorted.length; i++) {
      const current = sorted[i];
      const next = i < sorted.length - 1 ? sorted[i + 1] : null;

      const dateStr = current['Date Assigned'] || current['Date'] || Object.values(current)[0];
      const startDate = this.parseDate(dateStr) || firstDate;
      
      const assignedTo = current['Assigned To'] || current['Employee Name'] || current['Employee'] || '';
      const location = current['Location'] || '';
      const notes = current['Notes'] || current['Note'] || '';
      const status = current['Status'] || '';

      const state = this.classifyState(assignedTo, location, notes, status);

      let endDate;
      if (next) {
        const nextDateStr = next['Date Assigned'] || next['Date'] || Object.values(next)[0];
        endDate = this.parseDate(nextDateStr) || startDate;
      } else {
        if (state.key === 'RETIRED') {
          endDate = startDate;
          isRetired = true;
          retiredDate = startDate;
          retiredReason = notes || assignedTo || 'Retired';
        } else {
          endDate = now;
        }
      }

      // Calculate days spent in this transition
      let diffMs = endDate.getTime() - startDate.getTime();
      let days = Math.max(0, Math.round(diffMs / (1000 * 60 * 60 * 24)));
      if (i === sorted.length - 1 && !isRetired && days === 0) {
        days = 1; // At least 1 day active today
      }

      // Tally state durations
      if (state.key === 'FIELD') {
        fieldDays += days;
        const linemanName = assignedTo.trim();
        if (linemanName && linemanName.toLowerCase() !== 'n/a' && linemanName.toLowerCase() !== 'unknown') {
          linemenMap[linemanName] = (linemenMap[linemanName] || 0) + days;
        }
      } else if (state.key === 'SHELF') {
        shelfDays += days;
      } else if (state.key === 'TESTING') {
        testingDays += days;
        testCyclesCount++;
      } else if (state.key === 'PACKED_TESTING') {
        packedTestingDays += days;
      } else if (state.key === 'PACKED_DELIVERY') {
        packedDeliveryDays += days;
      } else if (state.key === 'LOST') {
        lostDays += days;
      } else if (state.key === 'RETIRED') {
        retiredDays += days;
      }

      milestones.push({
        idx: i + 1,
        startDate: startDate,
        endDate: endDate,
        startDateFormatted: this.formatDate(startDate),
        endDateFormatted: this.formatDate(endDate),
        days: days,
        durationFormatted: this.formatDuration(days),
        state: state,
        assignedTo: assignedTo,
        location: location,
        notes: notes,
        isCurrent: i === sorted.length - 1 && !isRetired
      });
    }

    const lastMilestone = milestones[milestones.length - 1];
    const totalDays = Math.max(1, fieldDays + shelfDays + testingDays + packedTestingDays + packedDeliveryDays + lostDays);

    const fieldPct = Math.round((fieldDays / totalDays) * 100);
    const shelfPct = Math.round((shelfDays / totalDays) * 100);
    const testingPct = Math.round((testingDays / totalDays) * 100);
    const packedTestingPct = Math.round((packedTestingDays / totalDays) * 100);
    const packedDeliveryPct = Math.round((packedDeliveryDays / totalDays) * 100);
    const lostPct = Math.max(0, 100 - fieldPct - shelfPct - testingPct - packedTestingPct - packedDeliveryPct);

    // Linemen list sorted by longest days
    const linemenList = Object.keys(linemenMap).map(name => {
      return {
        name: name,
        days: linemenMap[name],
        durationFormatted: this.formatDuration(linemenMap[name]),
        pct: Math.round((linemenMap[name] / (fieldDays || 1)) * 100),
        isCurrent: !isRetired && lastMilestone && lastMilestone.state.key === 'FIELD' && lastMilestone.assignedTo.toLowerCase() === name.toLowerCase()
      };
    }).sort((a, b) => b.days - a.days);

    return {
      itemKey: itemKey,
      firstDate: firstDate,
      firstDateFormatted: this.formatDate(firstDate),
      lastDate: isRetired ? retiredDate : now,
      lastDateFormatted: this.formatDate(isRetired ? retiredDate : now),
      isRetired: isRetired,
      retiredReason: retiredReason,
      totalDays: totalDays,
      lifespanFormatted: this.formatDuration(totalDays),
      fieldDays: fieldDays,
      fieldPct: fieldPct,
      shelfDays: shelfDays,
      shelfPct: shelfPct,
      testingDays: testingDays,
      testingPct: testingPct,
      packedTestingDays: packedTestingDays,
      packedTestingPct: packedTestingPct,
      packedDeliveryDays: packedDeliveryDays,
      packedDeliveryPct: packedDeliveryPct,
      lostDays: lostDays,
      lostPct: lostPct,
      testCyclesCount: testCyclesCount,
      linemenList: linemenList,
      milestones: milestones,
      currentHolder: isRetired ? 'Retired' : (lastMilestone ? lastMilestone.assignedTo : 'Unassigned'),
      currentLocation: lastMilestone ? lastMilestone.location : 'Helena',
      currentState: isRetired ? { key: 'RETIRED', label: 'Retired / Failed', color: '#ef4444' } : (lastMilestone ? lastMilestone.state : { key: 'SHELF', label: 'On Shelf', color: '#f59e0b' })
    };
  }

  renderSegmentedBarHtml(stats) {
    if (!stats) return '';
    return `
      <div style="margin-top: 8px; margin-bottom: 6px;">
        <div style="display: flex; height: 8px; border-radius: 4px; overflow: hidden; background-color: var(--bg-tertiary); box-shadow: inset 0 1px 2px rgba(0,0,0,0.3);">
          ${stats.fieldPct > 0 ? `<div style="width: ${stats.fieldPct}%; background-color: #3b82f6;" title="Field Service: ${stats.fieldDays}d (${stats.fieldPct}%)"></div>` : ''}
          ${stats.shelfPct > 0 ? `<div style="width: ${stats.shelfPct}%; background-color: #f59e0b;" title="On Shelf: ${stats.shelfDays}d (${stats.shelfPct}%)"></div>` : ''}
          ${stats.testingPct > 0 ? `<div style="width: ${stats.testingPct}%; background-color: #a855f7;" title="In Testing: ${stats.testingDays}d (${stats.testingPct}%)"></div>` : ''}
          ${stats.packedTestingPct > 0 ? `<div style="width: ${stats.packedTestingPct}%; background-color: #f97316;" title="Packed For Testing: ${stats.packedTestingDays}d (${stats.packedTestingPct}%)"></div>` : ''}
          ${stats.packedDeliveryPct > 0 ? `<div style="width: ${stats.packedDeliveryPct}%; background-color: #06b6d4;" title="Packed For Delivery: ${stats.packedDeliveryDays}d (${stats.packedDeliveryPct}%)"></div>` : ''}
          ${stats.lostPct > 0 ? `<div style="width: ${stats.lostPct}%; background-color: #eab308;" title="Lost / Missing: ${stats.lostDays}d (${stats.lostPct}%)"></div>` : ''}
          ${stats.isRetired ? `<div style="width: 4px; background-color: #ef4444;" title="Retired / Failed"></div>` : ''}
        </div>
      </div>
    `;
  }

  renderKpiChipsHtml(stats) {
    if (!stats) return '';
    return `
      <div style="display: flex; align-items: center; gap: 10px; font-size: 11px; flex-wrap: wrap; color: var(--text-secondary);">
        <span title="Total Lifespan">⏳ <strong>Lifespan:</strong> ${stats.lifespanFormatted}</span>
        <span style="color: var(--text-muted);">•</span>
        <span title="Time with Linemen in Field" style="color: #60a5fa;">👷 <strong>Field:</strong> ${stats.fieldDays}d (${stats.fieldPct}%)</span>
        <span style="color: var(--text-muted);">•</span>
        <span title="Time in Storage / Shelf" style="color: #fbbf24;">📦 <strong>Shelf:</strong> ${stats.shelfDays}d (${stats.shelfPct}%)</span>
        <span style="color: var(--text-muted);">•</span>
        <span title="Time in Test Lab" style="color: #c084fc;">🔬 <strong>Testing:</strong> ${stats.testingDays}d (${stats.testingPct}%)</span>
        ${stats.packedTestingDays > 0 ? `
          <span style="color: var(--text-muted);">•</span>
          <span title="Packed For Testing (Truck)" style="color: #fb923c;">🚚 <strong>Packed Testing:</strong> ${stats.packedTestingDays}d (${stats.packedTestingPct}%)</span>
        ` : ''}
        ${stats.packedDeliveryDays > 0 ? `
          <span style="color: var(--text-muted);">•</span>
          <span title="Packed For Delivery (Truck)" style="color: #22d3ee;">🚚 <strong>Packed Delivery:</strong> ${stats.packedDeliveryDays}d (${stats.packedDeliveryPct}%)</span>
        ` : ''}
        ${stats.lostDays > 0 ? `
          <span style="color: var(--text-muted);">•</span>
          <span title="Time marked as Lost / Missing" style="color: #facc15;">🔍 <strong>Lost:</strong> ${stats.lostDays}d (${stats.lostPct}%)</span>
        ` : ''}
        <span style="color: var(--text-muted);">•</span>
        <span title="Completed Turnaround Test Cycles">🔄 <strong>${stats.testCyclesCount}</strong> ${stats.testCyclesCount === 1 ? 'Test Cycle' : 'Test Cycles'}</span>
      </div>
    `;
  }

  openDossierModal(itemKey, sheetKey) {
    const modal = document.getElementById('item-lifecycle-modal');
    const body = document.getElementById('item-lifecycle-modal-body');
    const titleEl = document.getElementById('item-lifecycle-modal-title');
    if (!modal || !body) return;

    const tableData = this.db.getTable(sheetKey);
    const rows = tableData ? (tableData.rows || []) : [];
    const headers = tableData ? (tableData.headers || []) : [];

    const groupCol = headers.find(h => {
      const hl = h.toLowerCase();
      return (
        hl.includes('item') ||
        hl.includes('serial') ||
        hl.includes('glove') ||
        hl.includes('sleeve') ||
        hl.includes('blanket') ||
        hl.includes('mack') ||
        hl.includes('name')
      );
    }) || headers[1] || headers[0];

    const cleanItemKey = String(itemKey || '').trim();
    const groupRows = rows.filter(r => {
      const val = String(r[groupCol] || '').trim();
      if (val === cleanItemKey) return true;
      const numVal = parseInt(val, 10);
      const numKey = parseInt(cleanItemKey, 10);
      if (!isNaN(numVal) && !isNaN(numKey) && String(numVal) === val && String(numKey) === cleanItemKey && numVal === numKey) return true;
      return false;
    });

    const stats = this.analyzeLifecycle(cleanItemKey, groupRows);
    const sheetTitle = sheetKey.replace('_history', '').replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase());

    if (titleEl) {
      titleEl.innerHTML = `<span>📊</span> ${sheetTitle} #${cleanItemKey} Lifecycle Dossier`;
    }

    if (!stats) {
      body.innerHTML = `
        <div style="padding: 40px; text-align: center; color: var(--text-muted);">
          <div style="font-size: 32px; margin-bottom: 8px;">📜</div>
          <div style="font-size: 15px; font-weight: 600; color: var(--text-primary);">No history records found for ${sheetTitle} #${cleanItemKey}</div>
          <div style="font-size: 12px; margin-top: 6px;">Sync with Google Sheets or check the <strong>📜 History Records</strong> workspace.</div>
        </div>
      `;
      modal.classList.add('active');
      return;
    }

    const firstRow = groupRows[0] || {};
    let metaChips = [];
    headers.forEach(h => {
      const hl = h.toLowerCase();
      if (['size', 'class', 'type', 'kv', 'model', 'length'].includes(hl) && firstRow[h]) {
        metaChips.push(`<span class="brand-badge" style="font-size: 11px;">${h}: ${firstRow[h]}</span>`);
      }
    });

    let html = `
      <!-- Header Banner & Metadata -->
      <div style="background-color: var(--bg-primary); border: 1px solid var(--border-color); border-radius: 10px; padding: 16px; margin-bottom: 20px;">
        <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px; margin-bottom: 12px;">
          <div style="display: flex; align-items: center; gap: 10px;">
            <span style="font-size: 24px;">📦</span>
            <div>
              <div style="font-size: 18px; font-weight: 700; color: var(--text-primary);">${sheetTitle} #${stats.itemKey}</div>
              <div style="display: flex; align-items: center; gap: 6px; margin-top: 2px;">
                ${metaChips.join('')}
              </div>
            </div>
          </div>
          <div style="text-align: right;">
            <div style="font-size: 11px; color: var(--text-muted); margin-bottom: 2px;">Current Status</div>
            <span class="brand-badge" style="background-color: ${stats.currentState.color}22; color: ${stats.currentState.color}; border: 1px solid ${stats.currentState.color}55; font-size: 12px; font-weight: 600;">
              ${stats.currentState.label}
            </span>
          </div>
        </div>

        <!-- 6-Card KPI Stat Grid (Single Horizontal Line) -->
        <div style="display: grid; grid-template-columns: repeat(6, 1fr); gap: 10px; margin-top: 14px;">
          
          <div style="background-color: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: 8px; padding: 12px;">
            <div style="font-size: 11px; color: var(--text-muted); margin-bottom: 4px;">⏳ Total Lifespan</div>
            <div style="font-size: 16px; font-weight: 700; color: var(--text-primary);">${stats.lifespanFormatted}</div>
            <div style="font-size: 10px; color: var(--text-muted); margin-top: 2px;">Since ${stats.firstDateFormatted}</div>
          </div>

          <div style="background-color: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: 8px; padding: 12px;">
            <div style="font-size: 11px; color: var(--text-muted); margin-bottom: 4px;">👷 Field Service</div>
            <div style="font-size: 16px; font-weight: 700; color: #60a5fa;">${stats.fieldDays} Days</div>
            <div style="font-size: 10px; color: var(--text-muted); margin-top: 2px;">${stats.fieldPct}% of total life</div>
          </div>

          <div style="background-color: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: 8px; padding: 12px;">
            <div style="font-size: 11px; color: var(--text-muted); margin-bottom: 4px;">📦 Shelf / Storage</div>
            <div style="font-size: 16px; font-weight: 700; color: #fbbf24;">${stats.shelfDays} Days</div>
            <div style="font-size: 10px; color: var(--text-muted); margin-top: 2px;">${stats.shelfPct}% of total life</div>
          </div>

          <div style="background-color: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: 8px; padding: 12px;">
            <div style="font-size: 11px; color: var(--text-muted); margin-bottom: 4px;">🔬 Lab Testing</div>
            <div style="font-size: 16px; font-weight: 700; color: #c084fc;">${stats.testingDays} Days</div>
            <div style="font-size: 10px; color: var(--text-muted); margin-top: 2px;">${stats.testCyclesCount} completed cycles</div>
          </div>

          <div style="background-color: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: 8px; padding: 12px;">
            <div style="font-size: 11px; color: var(--text-muted); margin-bottom: 4px;">🚚 Packed For Testing</div>
            <div style="font-size: 16px; font-weight: 700; color: #fb923c;">${stats.packedTestingDays} Days</div>
            <div style="font-size: 10px; color: var(--text-muted); margin-top: 2px;">${stats.packedTestingPct}% on truck</div>
          </div>

          <div style="background-color: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: 8px; padding: 12px;">
            <div style="font-size: 11px; color: var(--text-muted); margin-bottom: 4px;">🚚 Packed For Delivery</div>
            <div style="font-size: 16px; font-weight: 700; color: #22d3ee;">${stats.packedDeliveryDays} Days</div>
            <div style="font-size: 10px; color: var(--text-muted); margin-top: 2px;">${stats.packedDeliveryPct}% on truck</div>
          </div>

        </div>

        <!-- Segmented Horizontal Lifespan Bar -->
        ${this.renderSegmentedBarHtml(stats)}
      </div>

      <!-- Two-Column Layout: Milestone Stepper & Linemen Summary -->
      <div style="display: grid; grid-template-columns: 2fr 1fr; gap: 20px;">
        
        <!-- Column 1: Vertical Milestone Journey Stepper -->
        <div>
          <h3 style="font-size: 14px; font-weight: 700; margin-bottom: 12px; display: flex; align-items: center; gap: 6px;">
            <span>🗺️</span> Complete Lifecycle Journey (${stats.milestones.length} Events)
          </h3>
          <div style="position: relative; padding-left: 20px; border-left: 2px solid var(--border-color); margin-left: 8px;">
    `;

    // Render each milestone chronologically (newest at top)
    const reversedMilestones = [...stats.milestones].reverse();
    reversedMilestones.forEach((m, mIdx) => {
      const nodeColor = m.state.color;
      html += `
        <div style="position: relative; margin-bottom: 20px;">
          <!-- Node circle on timeline -->
          <div style="position: absolute; left: -27px; top: 0px; width: 14px; height: 14px; border-radius: 50%; background-color: ${nodeColor}; border: 3px solid var(--bg-secondary); box-shadow: 0 0 0 2px ${nodeColor}88;"></div>
          
          <div style="background-color: var(--bg-primary); border: 1px solid var(--border-color); border-radius: 8px; padding: 12px;">
            <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px; gap: 8px;">
              <div style="display: flex; align-items: center; gap: 8px;">
                <span style="font-size: 15px;">${m.state.icon}</span>
                <span style="font-weight: 700; font-size: 13px; color: var(--text-primary);">${m.state.label}</span>
                ${m.isCurrent ? `<span class="brand-badge" style="background: rgba(234, 179, 8, 0.2); color: #facc15; font-size: 10px;">Current</span>` : ''}
              </div>
              <span style="font-size: 11px; font-weight: 600; color: #60a5fa;">${m.durationFormatted}</span>
            </div>

            <div style="font-size: 12px; color: var(--text-secondary); margin-bottom: 4px;">
              <strong>Date:</strong> ${m.startDateFormatted} ${m.isCurrent ? '→ Present' : (m.endDateFormatted !== m.startDateFormatted ? '→ ' + m.endDateFormatted : '')}
            </div>

            ${m.assignedTo ? `
              <div style="font-size: 12px; color: var(--text-secondary); margin-bottom: 4px;">
                <strong>Holder:</strong> <span style="color: var(--text-primary); font-weight: 600;">${m.assignedTo}</span> ${m.location ? `(${m.location})` : ''}
              </div>
            ` : ''}

            ${m.notes ? `
              <div style="font-size: 11px; color: var(--text-muted); background: var(--bg-secondary); padding: 4px 8px; border-radius: 4px; margin-top: 6px; border-left: 2px solid ${nodeColor};">
                ${m.notes}
              </div>
            ` : ''}
          </div>
        </div>
      `;
    });

    html += `
          </div>
        </div>

        <!-- Column 2: Linemen Usage Summary -->
        <div>
          <h3 style="font-size: 14px; font-weight: 700; margin-bottom: 12px; display: flex; align-items: center; gap: 6px;">
            <span>👥</span> Linemen History (${stats.linemenList.length})
          </h3>
          <div style="background-color: var(--bg-primary); border: 1px solid var(--border-color); border-radius: 8px; padding: 14px;">
    `;

    if (stats.linemenList.length === 0) {
      html += `<div style="font-size: 12px; color: var(--text-muted); text-align: center; padding: 20px;">No linemen assignments recorded yet.</div>`;
    } else {
      stats.linemenList.forEach(l => {
        html += `
          <div style="padding: 8px 0; border-bottom: 1px solid var(--border-color); display: flex; align-items: center; justify-content: space-between; gap: 8px;">
            <div>
              <div style="font-weight: 600; font-size: 12px; color: var(--text-primary); display: flex; align-items: center; gap: 6px;">
                <span>${l.name}</span>
                ${l.isCurrent ? `<span class="brand-badge" style="font-size: 9px; padding: 1px 4px; background: rgba(34, 197, 94, 0.2); color: #4ade80;">Active</span>` : ''}
              </div>
              <div style="font-size: 10px; color: var(--text-muted);">${l.pct}% of total field time</div>
            </div>
            <div style="text-align: right; font-weight: 700; font-size: 12px; color: #60a5fa;">
              ${l.durationFormatted}
            </div>
          </div>
        `;
      });
    }

    html += `
          </div>
        </div>

      </div>
    `;

    body.innerHTML = html;
    modal.classList.add('active');
  }

  closeDossierModal() {
    const modal = document.getElementById('item-lifecycle-modal');
    if (modal) modal.classList.remove('active');
  }
}

// Global instance
window.itemStatsEngine = new ItemStatsEngine(window.localDB);
