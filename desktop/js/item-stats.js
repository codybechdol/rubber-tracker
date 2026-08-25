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

  escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  classifyState(assignedTo, location, notes, status) {
    const sAssigned = String(assignedTo || '').toLowerCase().trim();
    const sLoc = String(location || '').toLowerCase().trim();
    const sNotes = String(notes || '').toLowerCase().trim();
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
      sStatus === 'destroyed' ||
      sLoc === 'destroyed'
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

    // 0. Brand New Purchase (Initial acquisition / On Shelf from new)
    if (
      sAssigned === 'new' ||
      sAssigned === 'newly purchased' ||
      sAssigned === 'brand new' ||
      sAssigned === 'new purchase' ||
      sAssigned === 'new item' ||
      sAssigned.startsWith('new (') ||
      ((sNotes.includes('new purchase') || sNotes.includes('initial purchase') || sNotes.includes('newly purchased')) &&
       (!sAssigned || sAssigned === 'on shelf' || sAssigned === 'in stock' || sStatus === 'in stock' || sStatus === 'on shelf'))
    ) {
      return {
        key: 'NEW_PURCHASE',
        label: 'Brand New (On Shelf)',
        badgeClass: 'badge-new-purchase',
        color: '#10b981',
        icon: '✨',
        isPurchaseEntry: true
      };
    }

    // 0A. Made From Failed Pairs (Gloves/Sleeves paired from good singles)
    if (
      (sNotes.includes('made from failed pairs') || sNotes.includes('failed pairs') || sNotes.includes('failed pair') || sAssigned.includes('failed pair')) &&
      (!sAssigned || sAssigned === 'on shelf' || sAssigned === 'in stock' || sStatus === 'in stock' || sStatus === 'on shelf')
    ) {
      return {
        key: 'FAILED_PAIR_REPAIR',
        label: 'Made From Failed Pairs',
        badgeClass: 'badge-new-purchase',
        color: '#8b5cf6',
        icon: '🧤',
        isPurchaseEntry: true
      };
    }

    // 0B. Lost Item Found (Recovered / Located inventory)
    if (
      (sNotes.includes('lost item found') || sNotes.includes('item found') || sNotes.includes('found item')) &&
      (!sAssigned || sAssigned === 'on shelf' || sAssigned === 'in stock' || sStatus === 'in stock' || sStatus === 'on shelf')
    ) {
      return {
        key: 'LOST_FOUND',
        label: 'Lost Item Found',
        badgeClass: 'badge-new-purchase',
        color: '#06b6d4',
        icon: '🔍',
        isPurchaseEntry: true
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
      if (tA !== tB) return tA - tB;

      // Same-day tie-breaker using canonical lifecycle state sequence
      const stateA = this.classifyState(a['Assigned To'], a['Location'], a['Notes'], a['Status']);
      const stateB = this.classifyState(b['Assigned To'], b['Location'], b['Notes'], b['Status']);
      
      const statePrecedence = {
        'NEW_PURCHASE': 1,
        'SHELF': 2,
        'PACKED_DELIVERY': 3,
        'FIELD': 4,
        'PACKED_TESTING': 5,
        'TESTING': 6,
        'LOST': 7,
        'RETIRED': 8
      };
      const rankA = statePrecedence[stateA.key] || 4;
      const rankB = statePrecedence[stateB.key] || 4;
      if (rankA !== rankB) return rankA - rankB;

      if (stateA.isPurchaseEntry && !stateB.isPurchaseEntry) return -1;
      if (!stateA.isPurchaseEntry && stateB.isPurchaseEntry) return 1;
      return 0;
    });

    let firstDate = this.parseDate(sorted[0]['Date Assigned'] || sorted[0]['Date'] || Object.values(sorted[0])[0]) || new Date();
    const now = new Date();

    // Check if earliest entry represents a known brand-new purchase
    const firstRawAssigned = String(sorted[0]['Assigned To'] || sorted[0]['Employee Name'] || sorted[0]['Employee'] || '').toLowerCase().trim();
    const firstRawNotes = String(sorted[0]['Notes'] || sorted[0]['Note'] || '').toLowerCase().trim();
    const isPurchaseOrigin = firstRawAssigned === 'new' ||
                             firstRawAssigned === 'newly purchased' ||
                             firstRawAssigned === 'brand new' ||
                             firstRawAssigned === 'new purchase' ||
                             firstRawAssigned.startsWith('new (') ||
                             firstRawNotes.includes('new purchase') ||
                             firstRawNotes.includes('initial purchase');

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
        if (linemanName && !['new', 'n/a', 'unknown', 'none', 'shelf', 'storage'].includes(linemanName.toLowerCase())) {
          linemenMap[linemanName] = (linemenMap[linemanName] || 0) + days;
        }
      } else if (state.key === 'SHELF' || state.key === 'NEW_PURCHASE') {
        shelfDays += days; // "New" items on shelf count towards shelf/storage duration
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
        assignedTo: state.key === 'NEW_PURCHASE' ? 'New (Purchased)' : assignedTo,
        location: location || 'Helena',
        notes: notes,
        isCurrent: i === sorted.length - 1 && !isRetired,
        isOriginRecord: i === 0,
        isPurchaseOrigin: i === 0 && isPurchaseOrigin,
        rawRow: current
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
      hasKnownPurchaseDate: isPurchaseOrigin,
      lifecycleType: isPurchaseOrigin ? 'KNOWN_PURCHASE' : 'TRACKING_START_UNKNOWN_PURCHASE',
      purchaseDate: isPurchaseOrigin ? firstDate : null,
      purchaseDateFormatted: isPurchaseOrigin ? this.formatDate(firstDate) : 'Unknown',
      provenanceLabel: isPurchaseOrigin ? 'Known Purchase Date' : 'Tracking Start Date (Purchase Date Unknown)',
      provenanceBadgeText: isPurchaseOrigin ? `✨ Purchased: ${this.formatDate(firstDate)}` : `⏳ Tracking Start: ${this.formatDate(firstDate)} (Purchase Unknown)`,
      provenanceDescription: isPurchaseOrigin
        ? `Full lifecycle tracked from original purchase date on ${this.formatDate(firstDate)}. Initial stage was On Shelf until first deployment.`
        : `Initial recorded tracking began on ${this.formatDate(firstDate)}. Original purchase date and prior history before this record are unknown.`,
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

  renderKpiCardsHtml(stats) {
    if (!stats) return '';
    return `
      <div class="kpi-cards-grid" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 8px; margin-top: 8px; margin-bottom: 8px;">
        
        <div class="kpi-stat-card" style="background-color: var(--bg-secondary); border: 1px solid ${stats.hasKnownPurchaseDate ? 'rgba(16, 185, 129, 0.4)' : 'rgba(245, 158, 11, 0.4)'}; border-radius: 8px; padding: 8px 10px; box-shadow: 0 1px 3px rgba(0,0,0,0.2);">
          <div style="font-size: 11px; color: var(--text-muted); margin-bottom: 4px; display: flex; align-items: center; justify-content: space-between;">
            <span style="display: flex; align-items: center; gap: 4px;"><span>${stats.hasKnownPurchaseDate ? '⏳' : '⏱️'}</span> ${stats.hasKnownPurchaseDate ? 'Total Lifespan' : 'Tracked Lifespan'}</span>
          </div>
          <div style="font-size: 14px; font-weight: 700; color: ${stats.hasKnownPurchaseDate ? '#34d399' : '#fbbf24'};">${stats.lifespanFormatted}</div>
          <div style="font-size: 10px; color: var(--text-muted); margin-top: 2px;">
            ${stats.hasKnownPurchaseDate ? `Purchased ${stats.firstDateFormatted}` : `Since ${stats.firstDateFormatted}`}
          </div>
          <div style="margin-top: 4px;">
            ${stats.hasKnownPurchaseDate ? `
              <span class="brand-badge" style="font-size: 9px; padding: 1px 5px; background: rgba(16, 185, 129, 0.2); color: #34d399; border: 1px solid rgba(16, 185, 129, 0.4);">✨ Known Purchase</span>
            ` : `
              <span class="brand-badge" style="font-size: 9px; padding: 1px 5px; background: rgba(245, 158, 11, 0.2); color: #fbbf24; border: 1px solid rgba(245, 158, 11, 0.4);">⚠️ Purchase Date Unknown</span>
            `}
          </div>
        </div>

        <div class="kpi-stat-card" style="background-color: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: 8px; padding: 8px 10px; box-shadow: 0 1px 3px rgba(0,0,0,0.2);">
          <div style="font-size: 11px; color: var(--text-muted); margin-bottom: 4px; display: flex; align-items: center; gap: 4px;">
            <span>👷</span> Field Service
          </div>
          <div style="font-size: 14px; font-weight: 700; color: #60a5fa;">${stats.fieldDays} Days</div>
          <div style="font-size: 10px; color: var(--text-muted); margin-top: 2px;">${stats.fieldPct}% of total life</div>
        </div>

        <div class="kpi-stat-card" style="background-color: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: 8px; padding: 8px 10px; box-shadow: 0 1px 3px rgba(0,0,0,0.2);">
          <div style="font-size: 11px; color: var(--text-muted); margin-bottom: 4px; display: flex; align-items: center; gap: 4px;">
            <span>📦</span> Shelf / Storage
          </div>
          <div style="font-size: 14px; font-weight: 700; color: #fbbf24;">${stats.shelfDays} Days</div>
          <div style="font-size: 10px; color: var(--text-muted); margin-top: 2px;">${stats.shelfPct}% of total life</div>
        </div>

        <div class="kpi-stat-card" style="background-color: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: 8px; padding: 8px 10px; box-shadow: 0 1px 3px rgba(0,0,0,0.2);">
          <div style="font-size: 11px; color: var(--text-muted); margin-bottom: 4px; display: flex; align-items: center; gap: 4px;">
            <span>🔬</span> Lab Testing
          </div>
          <div style="font-size: 14px; font-weight: 700; color: #c084fc;">${stats.testingDays} Days</div>
          <div style="font-size: 10px; color: var(--text-muted); margin-top: 2px;">${stats.testCyclesCount} completed</div>
        </div>

        <div class="kpi-stat-card" style="background-color: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: 8px; padding: 8px 10px; box-shadow: 0 1px 3px rgba(0,0,0,0.2);">
          <div style="font-size: 11px; color: var(--text-muted); margin-bottom: 4px; display: flex; align-items: center; gap: 4px;">
            <span>🚚</span> Packed Testing
          </div>
          <div style="font-size: 14px; font-weight: 700; color: #fb923c;">${stats.packedTestingDays} Days</div>
          <div style="font-size: 10px; color: var(--text-muted); margin-top: 2px;">${stats.packedTestingPct}% on truck</div>
        </div>

        <div class="kpi-stat-card" style="background-color: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: 8px; padding: 8px 10px; box-shadow: 0 1px 3px rgba(0,0,0,0.2);">
          <div style="font-size: 11px; color: var(--text-muted); margin-bottom: 4px; display: flex; align-items: center; gap: 4px;">
            <span>🚚</span> Packed Delivery
          </div>
          <div style="font-size: 14px; font-weight: 700; color: #22d3ee;">${stats.packedDeliveryDays} Days</div>
          <div style="font-size: 10px; color: var(--text-muted); margin-top: 2px;">${stats.packedDeliveryPct}% on truck</div>
        </div>

        <div class="kpi-stat-card" style="background-color: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: 8px; padding: 8px 10px; box-shadow: 0 1px 3px rgba(0,0,0,0.2);">
          <div style="font-size: 11px; color: var(--text-muted); margin-bottom: 4px; display: flex; align-items: center; gap: 4px;">
            <span>🔍</span> Lost / Missing
          </div>
          <div style="font-size: 14px; font-weight: 700; color: #facc15;">${stats.lostDays} Days</div>
          <div style="font-size: 10px; color: var(--text-muted); margin-top: 2px;">${stats.lostPct}% of total life</div>
        </div>

      </div>
    `;
  }

  renderLinemenSummaryHtml(stats) {
    if (!stats || !stats.linemenList || stats.linemenList.length === 0) return '';
    const chips = stats.linemenList.map(l => {
      return `<span style="background: rgba(255,255,255,0.04); border: 1px solid var(--border-color); padding: 2px 8px; border-radius: 6px; font-size: 11px; color: var(--text-secondary); display: inline-flex; align-items: center; gap: 4px;">
        <strong style="color: var(--text-primary);">${l.name}</strong>: ${l.durationFormatted} (${l.pct}%)
        ${l.isCurrent ? '<span class="brand-badge" style="font-size: 9px; padding: 1px 4px; background: rgba(34, 197, 94, 0.2); color: #4ade80;">Active</span>' : ''}
      </span>`;
    }).join(' ');

    return `
      <div style="display: flex; align-items: center; gap: 8px; margin-top: 6px; font-size: 11px; color: var(--text-muted); flex-wrap: wrap;">
        <span style="font-weight: 600; color: var(--text-secondary); display: inline-flex; align-items: center; gap: 4px;"><span>👥</span> Linemen:</span>
        ${chips}
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

    const cleanItemKey = String(itemKey || '').trim();
    this.currentActiveItemKey = cleanItemKey;
    this.currentActiveSheetKey = sheetKey;

    const numKey = parseInt(cleanItemKey, 10);
    const isPureNumKey = !isNaN(numKey) && String(numKey) === cleanItemKey;

    let groupRows = rows.filter(r => {
      for (const k in r) {
        const kl = k.toLowerCase();
        if (
          kl.includes('item') ||
          kl.includes('glove') ||
          kl.includes('sleeve') ||
          kl.includes('blanket') ||
          kl.includes('mack') ||
          kl.includes('serial') ||
          kl.includes('esl') ||
          kl === 'id'
        ) {
          const val = String(r[k] || '').trim();
          if (!val) continue;
          if (val.toLowerCase() === cleanItemKey.toLowerCase()) return true;
          if (isPureNumKey) {
            const rNum = parseInt(val, 10);
            if (!isNaN(rNum) && String(rNum) === val && rNum === numKey) return true;
          }
        }
      }
      return false;
    });

    // If no history entries exist yet, synthesize an active baseline record from the active inventory sheet
    const activeSheetKey = sheetKey.replace('_history', '');
    const activeTable = this.db.getTable(activeSheetKey);
    let foundActive = null;
    if (activeTable && activeTable.rows) {
      foundActive = activeTable.rows.find(r => {
        for (const k in r) {
          const kl = k.toLowerCase();
          if (
            kl.includes('item') ||
            kl.includes('glove') ||
            kl.includes('sleeve') ||
            kl.includes('blanket') ||
            kl.includes('mack') ||
            kl.includes('serial') ||
            kl.includes('esl')
          ) {
            const val = String(r[k] || '').trim();
            if (!val) continue;
            if (val.toLowerCase() === cleanItemKey.toLowerCase()) return true;
            if (isPureNumKey && parseInt(val, 10) === numKey) return true;
          }
        }
        return false;
      });
    }

    if (foundActive) {
      const activeStatus = String(foundActive['Status'] || '').trim().toLowerCase();
      const activeAssigned = String(foundActive['Assigned To'] || '').trim().toLowerCase();
      const activeLoc = String(foundActive['Location'] || '').trim().toLowerCase();
      const activeNotes = String(foundActive['Notes'] || '').trim();
      const hasOriginNote = activeNotes.toLowerCase().includes('new purchase') ||
                            activeNotes.toLowerCase().includes('failed pair') ||
                            activeNotes.toLowerCase().includes('item found') ||
                            activeNotes.toLowerCase().includes('initial purchase');

      if (groupRows.length === 0) {
        if (hasOriginNote && (activeStatus === 'failed rubber' || activeStatus === 'destroyed' || activeStatus === 'lost' || activeStatus === 'assigned' || activeStatus === 'in testing' || activeStatus === 'ready for delivery' || activeStatus === 'ready for test')) {
          // Event 1: Origin Purchase on shelf
          groupRows.push({
            'Date Assigned': foundActive['Test Date'] || foundActive['Date Assigned'] || new Date().toISOString(),
            'Item #': cleanItemKey,
            'Size': foundActive['Size'] || '',
            'Class': foundActive['Class'] || '',
            'Location': 'Helena',
            'Assigned To': 'On Shelf',
            'Status': 'In Stock',
            'Notes': activeNotes
          });
          // Event 2: Current Status
          groupRows.push({
            'Date Assigned': foundActive['Date Assigned'] || new Date().toISOString(),
            'Item #': cleanItemKey,
            'Size': foundActive['Size'] || '',
            'Class': foundActive['Class'] || '',
            'Location': foundActive['Location'] || (activeStatus.includes('failed') ? 'Destroyed' : (activeStatus.includes('lost') ? 'Lost' : 'Helena')),
            'Assigned To': foundActive['Assigned To'] || foundActive['Status'] || 'Failed Rubber',
            'Status': foundActive['Status'] || 'Failed Rubber',
            'Notes': (foundActive['Status'] === 'Failed Rubber' ? 'Failed Rubber' : (foundActive['Status'] === 'Lost' ? 'Lost' : ''))
          });
        } else {
          groupRows.push({
            'Date Assigned': foundActive['Date Assigned'] || foundActive['Test Date'] || new Date().toISOString(),
            'Item #': cleanItemKey,
            'Size': foundActive['Size'] || '',
            'Class': foundActive['Class'] || '',
            'Location': foundActive['Location'] || 'Helena',
            'Assigned To': foundActive['Assigned To'] || foundActive['Status'] || 'On Shelf',
            'Status': foundActive['Status'] || 'On Shelf',
            'Notes': activeNotes || 'Current Active Inventory Status'
          });
        }
      }
    }

    const stats = this.analyzeLifecycle(cleanItemKey, groupRows, foundActive);
    const sheetTitle = sheetKey.replace('_history', '').replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase());

    if (titleEl) {
      titleEl.innerHTML = `<span>📊</span> ${sheetTitle} #${cleanItemKey} Lifecycle Dossier`;
    }

    if (!stats) {
      body.innerHTML = `
        <div style="padding: 40px; text-align: center; color: var(--text-muted);">
          <div style="font-size: 32px; margin-bottom: 8px;">📜</div>
          <div style="font-size: 15px; font-weight: 600; color: var(--text-primary);">No history or inventory records found for ${sheetTitle} #${cleanItemKey}</div>
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

    const activeItemRow = foundActive || groupRows[groupRows.length - 1] || {};
    const curTestDate = activeItemRow['Test Date'] || activeItemRow['Calibration Date'] || activeItemRow['Date Tested'] || '';
    const curDateAssigned = activeItemRow['Date Assigned'] || '';
    const curStatus = activeItemRow['Status'] || (stats.currentState ? stats.currentState.label : 'On Shelf');
    const curLocation = activeItemRow['Location'] || 'Helena';
    const curAssignedTo = activeItemRow['Assigned To'] || curStatus;

    const toIsoDate = (dStr) => {
      if (!dStr || dStr === 'N/A') return '';
      if (/^\d{4}-\d{2}-\d{2}$/.test(dStr)) return dStr;
      if (dStr.includes('/')) {
        const parts = dStr.split('/');
        if (parts.length === 3) {
          const m = String(parseInt(parts[0], 10)).padStart(2, '0');
          const d = String(parseInt(parts[1], 10)).padStart(2, '0');
          let y = parseInt(parts[2], 10);
          if (y < 100) y = 2000 + y;
          return `${y}-${m}-${d}`;
        }
      }
      const dt = new Date(dStr);
      if (!isNaN(dt.getTime())) return dt.toISOString().split('T')[0];
      return '';
    };

    const testDateIso = toIsoDate(curTestDate);
    const dateAssignedIso = toIsoDate(curDateAssigned);

    let html = `
      <!-- Header Banner & Metadata -->
      <div style="background-color: var(--bg-primary); border: 1px solid var(--border-color); border-radius: 10px; padding: 16px; margin-bottom: 20px;">
        <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px; margin-bottom: 12px;">
          <div style="display: flex; align-items: center; gap: 10px;">
            <span style="font-size: 24px;">📦</span>
            <div>
              <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                <span style="font-size: 18px; font-weight: 700; color: var(--text-primary);">${sheetTitle} #${stats.itemKey}</span>
                ${stats.hasKnownPurchaseDate ? `
                  <span class="brand-badge" style="background: rgba(16, 185, 129, 0.2); color: #34d399; border: 1px solid rgba(16, 185, 129, 0.4); font-size: 11px; font-weight: 700; display: inline-flex; align-items: center; gap: 4px;" title="Full lifecycle history tracked from initial purchase on ${stats.firstDateFormatted}">
                    <span>✨</span> Known Purchase: ${stats.firstDateFormatted}
                  </span>
                ` : `
                  <span class="brand-badge" style="background: rgba(245, 158, 11, 0.2); color: #fbbf24; border: 1px solid rgba(245, 158, 11, 0.4); font-size: 11px; font-weight: 700; display: inline-flex; align-items: center; gap: 4px;" title="Tracking began on ${stats.firstDateFormatted}. Original purchase date is unrecorded.">
                    <span>⏳</span> Tracking Start: ${stats.firstDateFormatted} (Purchase Date Unknown)
                  </span>
                `}
              </div>
              <div style="display: flex; align-items: center; gap: 6px; margin-top: 4px;">
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

        <!-- Provenance Baseline Notice -->
        <div style="font-size: 11px; color: ${stats.hasKnownPurchaseDate ? '#94a3b8' : '#cbd5e1'}; background: ${stats.hasKnownPurchaseDate ? 'rgba(16, 185, 129, 0.08)' : 'rgba(245, 158, 11, 0.1)'}; border-left: 3px solid ${stats.hasKnownPurchaseDate ? '#10b981' : '#f59e0b'}; padding: 6px 12px; border-radius: 4px; margin-bottom: 12px; display: flex; align-items: center; justify-content: space-between; gap: 8px;">
          <div>
            ${stats.hasKnownPurchaseDate ? `
              <strong>✨ Full Lifecycle Tracking:</strong> Recorded as <strong>Brand New</strong> on ${stats.firstDateFormatted} and remained On Shelf until initial field deployment. Lifespan metrics reflect the complete duration since purchase.
            ` : `
              <strong>⚠️ Tracking Baseline Notice:</strong> Original purchase date is <strong>unknown</strong>. Tracking history begins on ${stats.firstDateFormatted} (initial assignment to <strong>${this.escapeHtml(stats.milestones[0]?.assignedTo || 'lineman')}</strong>). Metrics reflect time tracked since this baseline.
            `}
          </div>
        </div>

        <!-- Quick Edit Dates & Assignment Panel -->
        <div id="dossier-edit-panel" style="background: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: 8px; padding: 14px; margin-bottom: 16px;">
          <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; flex-wrap: wrap; gap: 6px;">
            <span style="font-weight: 700; font-size: 13px; color: var(--text-primary); display: flex; align-items: center; gap: 6px;">
              <span>✏️</span> Change Test Date, Date Assigned & Status
            </span>
            <span style="font-size: 11px; color: #60a5fa; font-weight: 600;">Auto-recalculates Change Out Date</span>
          </div>
          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(135px, 1fr)); gap: 10px; align-items: end;">
            <div>
              <label style="display: block; font-size: 11px; font-weight: 700; color: var(--text-muted); margin-bottom: 4px;">TEST / CAL DATE</label>
              <input type="date" id="dossier-edit-test-date" class="form-control" value="${testDateIso}">
            </div>
            <div>
              <label style="display: block; font-size: 11px; font-weight: 700; color: var(--text-muted); margin-bottom: 4px;">DATE ASSIGNED</label>
              <input type="date" id="dossier-edit-date-assigned" class="form-control" value="${dateAssignedIso}">
            </div>
            <div>
              <label style="display: block; font-size: 11px; font-weight: 700; color: var(--text-muted); margin-bottom: 4px;">STATUS</label>
              <select id="dossier-edit-status" class="form-control">
                <option value="On Shelf" ${curStatus.toLowerCase() === 'on shelf' ? 'selected' : ''}>On Shelf</option>
                <option value="Assigned" ${curStatus.toLowerCase() === 'assigned' ? 'selected' : ''}>Assigned</option>
                <option value="Ready For Delivery" ${curStatus.toLowerCase() === 'ready for delivery' ? 'selected' : ''}>Ready For Delivery</option>
                <option value="Ready For Test" ${curStatus.toLowerCase() === 'ready for test' ? 'selected' : ''}>Ready For Test</option>
                <option value="In Testing" ${curStatus.toLowerCase() === 'in testing' ? 'selected' : ''}>In Testing</option>
                <option value="Failed Rubber" ${curStatus.toLowerCase() === 'failed rubber' ? 'selected' : ''}>Failed Rubber</option>
                <option value="Lost" ${curStatus.toLowerCase() === 'lost' ? 'selected' : ''}>Lost</option>
              </select>
            </div>
            <div>
              <label style="display: block; font-size: 11px; font-weight: 700; color: var(--text-muted); margin-bottom: 4px;">LOCATION</label>
              <input type="text" id="dossier-edit-location" class="form-control" value="${this.escapeHtml(curLocation)}">
            </div>
            <div>
              <label style="display: block; font-size: 11px; font-weight: 700; color: var(--text-muted); margin-bottom: 4px;">ASSIGNED TO</label>
              <input type="text" id="dossier-edit-assigned-to" list="new-item-employees-datalist" class="form-control" value="${this.escapeHtml(curAssignedTo)}">
            </div>
            <div>
              <button class="btn btn-primary" style="width: 100%; font-weight: 700; padding: 7px 12px; display: flex; align-items: center; justify-content: center; gap: 6px;" onclick="window.itemStatsEngine.saveDossierItemEdits('${this.escapeHtml(sheetKey)}', '${this.escapeHtml(cleanItemKey)}')">
                💾 Save Dates
              </button>
            </div>
          </div>
        </div>

        <!-- 7-Card KPI Stat Grid (Single Horizontal Line) -->
        ${this.renderKpiCardsHtml(stats)}

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
      const isOrigin = m.isOriginRecord;
      const isPurchaseOrigin = m.isPurchaseOrigin;

      html += `
        <div style="position: relative; margin-bottom: 20px;">
          <!-- Node circle on timeline -->
          <div style="position: absolute; left: -27px; top: 0px; width: 14px; height: 14px; border-radius: 50%; background-color: ${nodeColor}; border: 3px solid var(--bg-secondary); box-shadow: 0 0 0 2px ${nodeColor}88;"></div>
          
          <div style="background-color: var(--bg-primary); border: 1px solid ${isPurchaseOrigin ? 'rgba(16, 185, 129, 0.4)' : (isOrigin && !stats.hasKnownPurchaseDate ? 'rgba(245, 158, 11, 0.4)' : 'var(--border-color)')}; border-radius: 8px; padding: 12px;">
            <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px; gap: 8px; flex-wrap: wrap;">
              <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                <span style="font-size: 15px;">${m.state.icon}</span>
                <span style="font-weight: 700; font-size: 13px; color: var(--text-primary);">${m.state.label}</span>
                ${m.isCurrent ? `<span class="brand-badge" style="background: rgba(234, 179, 8, 0.2); color: #facc15; font-size: 10px;">Current</span>` : ''}
                ${isPurchaseOrigin ? `<span class="brand-badge" style="background: rgba(16, 185, 129, 0.2); color: #34d399; font-size: 10px; font-weight: 700;">✨ Lifecycle Origin (Purchased New)</span>` : ''}
                ${isOrigin && !stats.hasKnownPurchaseDate ? `<span class="brand-badge" style="background: rgba(245, 158, 11, 0.2); color: #fbbf24; font-size: 10px;">⏳ Tracking Baseline (Purchase Unknown)</span>` : ''}
              </div>
              <div style="display: flex; align-items: center; gap: 8px;">
                <span style="font-size: 11px; font-weight: 600; color: #60a5fa;">${m.durationFormatted}</span>
                <button class="btn btn-sm" title="Delete this history record" style="padding: 2px 6px; font-size: 11px; background: rgba(239, 68, 68, 0.15); color: #f87171; border: 1px solid rgba(239, 68, 68, 0.3); border-radius: 4px; cursor: pointer;" onclick="window.itemStatsEngine.deleteMilestoneRecord('${this.escapeHtml(sheetKey)}', '${this.escapeHtml(cleanItemKey)}', ${reversedMilestones.length - 1 - mIdx})">
                  🗑️ Delete
                </button>
              </div>
            </div>

            <div style="font-size: 12px; color: var(--text-secondary); margin-bottom: 4px;">
              <strong>Date:</strong> ${m.startDateFormatted} ${m.isCurrent ? '→ Present' : (m.endDateFormatted !== m.startDateFormatted ? '→ ' + m.endDateFormatted : '')}
            </div>

            ${m.assignedTo ? `
              <div style="font-size: 12px; color: var(--text-secondary); margin-bottom: 4px;">
                <strong>Holder:</strong> 
                ${m.state.key === 'NEW_PURCHASE' ? `
                  <span style="color: #34d399; font-weight: 700;">New Item (In Stock - On Shelf)</span> ${m.location ? `(${m.location})` : ''}
                ` : `
                  <span style="color: var(--text-primary); font-weight: 600;">${m.assignedTo}</span> ${m.location ? `(${m.location})` : ''}
                `}
              </div>
            ` : ''}

            ${m.notes ? `
              <div style="font-size: 11px; color: var(--text-muted); background: var(--bg-secondary); padding: 4px 8px; border-radius: 4px; margin-top: 6px; border-left: 2px solid ${nodeColor};">
                ${m.notes}
              </div>
            ` : ''}

            ${isOrigin && !stats.hasKnownPurchaseDate ? `
              <div style="font-size: 10px; color: #fbbf24; margin-top: 6px; padding: 4px 8px; background: rgba(245, 158, 11, 0.08); border-radius: 4px;">
                *Earliest history entry on record. Original purchase date prior to this entry is unrecorded.
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
        <!-- Action Bar -->
        <div style="margin-top: 20px; padding-top: 14px; border-top: 1px solid var(--border-color); display: flex; align-items: center; justify-content: space-between; gap: 10px;">
          <div>
            <button class="btn btn-secondary" style="color: #f87171; border: 1px solid rgba(239, 68, 68, 0.4); background: rgba(239, 68, 68, 0.1); font-size: 12px; font-weight: 700; display: inline-flex; align-items: center; gap: 6px; cursor: pointer;" onclick="window.inventoryManager.promptDeleteItem('${this.escapeHtml(cleanItemKey)}', '${this.escapeHtml(activeSheetKey)}')">
              🗑️ Delete Item #${this.escapeHtml(cleanItemKey)}
            </button>
          </div>
          <div style="display: flex; align-items: center; gap: 8px;">
            <button class="btn btn-secondary" style="font-size: 12px; display: inline-flex; align-items: center; gap: 5px; cursor: pointer;" onclick="window.itemStatsEngine.openImportLogModal('${this.escapeHtml(cleanItemKey)}', '${this.escapeHtml(sheetKey)}')">
              📥 Import History Log
            </button>
            <button class="btn btn-primary" style="font-size: 12px; cursor: pointer;" onclick="window.itemStatsEngine.closeDossierModal()">
              Done
            </button>
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

  openImportLogModal(prefillItemKey, prefillSheetKey) {
    const modal = document.getElementById('import-history-log-modal');
    if (!modal) return;

    const itemNumEl = document.getElementById('dt-history-item-num');
    const eqTypeEl = document.getElementById('dt-history-eq-type');
    const logTextEl = document.getElementById('dt-history-log-text');
    const alertEl = document.getElementById('dt-history-import-alert');

    if (alertEl) {
      alertEl.style.display = 'none';
      alertEl.innerHTML = '';
    }

    const itemToUse = prefillItemKey || this.currentActiveItemKey || '';
    const sheetToUse = prefillSheetKey || this.currentActiveSheetKey || 'gloves_history';

    if (itemNumEl) itemNumEl.value = itemToUse;
    if (eqTypeEl) eqTypeEl.value = sheetToUse;
    if (logTextEl) logTextEl.value = '';

    modal.classList.add('active');
  }

  closeImportLogModal() {
    const modal = document.getElementById('import-history-log-modal');
    if (modal) modal.classList.remove('active');
  }

  async submitImportLog() {
    const itemNumEl = document.getElementById('dt-history-item-num');
    const eqTypeEl = document.getElementById('dt-history-eq-type');
    const logTextEl = document.getElementById('dt-history-log-text');
    const alertEl = document.getElementById('dt-history-import-alert');

    const itemNum = itemNumEl ? itemNumEl.value.trim() : '';
    const sheetKey = eqTypeEl ? eqTypeEl.value : 'gloves_history';
    const logText = logTextEl ? logTextEl.value.trim() : '';

    if (!itemNum) {
      if (alertEl) {
        alertEl.className = 'alert alert-danger';
        alertEl.style.display = 'block';
        alertEl.style.background = 'rgba(239, 68, 68, 0.15)';
        alertEl.style.border = '1px solid rgba(239, 68, 68, 0.3)';
        alertEl.style.color = '#f87171';
        alertEl.innerHTML = 'Please enter an Item # or Serial #.';
      }
      return;
    }

    if (!logText) {
      if (alertEl) {
        alertEl.className = 'alert alert-danger';
        alertEl.style.display = 'block';
        alertEl.style.background = 'rgba(239, 68, 68, 0.15)';
        alertEl.style.border = '1px solid rgba(239, 68, 68, 0.3)';
        alertEl.style.color = '#f87171';
        alertEl.innerHTML = 'Please paste history log text to import.';
      }
      return;
    }

    // Parse lines client-side
    const lines = logText.split(/[\r\n]+/);
    const parsedEntries = [];

    // Build employee lookup from local DB
    const empTable = this.db.getTable('employees');
    const empRows = empTable ? (empTable.rows || []) : [];
    const empLookup = {};

    empRows.forEach(emp => {
      const name = String(emp['Employee Name'] || emp['Name'] || Object.values(emp)[0] || '').trim();
      const loc = String(emp['Location'] || 'Helena').trim();
      if (!name) return;
      empLookup[name.toLowerCase()] = { name: name, location: loc };
      const parts = name.split(/\s+/);
      if (parts.length >= 2) {
        const first = parts[0];
        const last = parts[parts.length - 1];
        empLookup[(first.charAt(0) + '. ' + last).toLowerCase()] = { name: name, location: loc };
        empLookup[(first.charAt(0) + ' ' + last).toLowerCase()] = { name: name, location: loc };
        empLookup[(first.charAt(0) + '.' + last).toLowerCase()] = { name: name, location: loc };
        empLookup[(first + ' ' + last.charAt(0) + '.').toLowerCase()] = { name: name, location: loc };
        empLookup[(first + ' ' + last.charAt(0)).toLowerCase()] = { name: name, location: loc };
      }
    });

    // Lookup metadata from local inventory table
    const invSheetKey = sheetKey.replace('_history', '');
    const invTable = this.db.getTable(invSheetKey);
    const invRows = invTable ? (invTable.rows || []) : [];
    let itemMeta = { size: '', classVal: '', model: '', kv: '', serial: '', length: '', type: '', location: 'Helena' };

    const foundInv = invRows.find(r => {
      const firstVal = String(Object.values(r)[0] || '').trim();
      const iNum = String(r['Item #'] || r['Glove'] || r['Sleeve'] || r['Blanket'] || r['ESL ID'] || r['Serial #'] || firstVal).trim();
      const esl = String(r['ESL ID'] || '').trim();
      return iNum === itemNum || esl === itemNum;
    });

    if (foundInv) {
      itemMeta.size = String(foundInv['Size'] || '');
      itemMeta.classVal = String(foundInv['Class'] || '');
      itemMeta.model = String(foundInv['Model'] || '');
      itemMeta.kv = String(foundInv['KV'] || '');
      itemMeta.length = String(foundInv['Length'] || '');
      itemMeta.type = String(foundInv['Type'] || '');
      itemMeta.serial = String(foundInv['Serial #'] || '');
      itemMeta.location = String(foundInv['Location'] || 'Helena');
    }

    lines.forEach(line => {
      line = line.trim();
      if (!line) return;

      const dateMatch = line.match(/^(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4}|\d{4}[\/\-\.]\d{1,2}[\/\-\.]\d{1,2})\s*[-–—:]\s*(.+)$/);
      let dateStr = '';
      let rawTarget = '';

      if (dateMatch) {
        dateStr = dateMatch[1].trim();
        rawTarget = dateMatch[2].trim();
      } else {
        const spaceSplit = line.split(/\s+/);
        if (spaceSplit.length >= 2 && this.parseDate(spaceSplit[0])) {
          dateStr = spaceSplit[0];
          rawTarget = line.substring(dateStr.length).replace(/^[-–—:]\s*/, '').trim();
        } else {
          return;
        }
      }

      const parsedDate = this.parseDate(dateStr);
      if (!parsedDate) return;

      const formattedDate = this.formatDate(parsedDate);
      const targetLower = rawTarget.toLowerCase();

      let assignedTo = rawTarget;
      let location = 'Helena';
      let notes = '';

      if (targetLower.includes('failed visual')) {
        assignedTo = 'Failed Rubber';
        notes = 'Failed Visual';
        location = 'Helena';
      } else if (targetLower.includes('failed rubber') || targetLower.includes('failed test') || targetLower === 'failed') {
        assignedTo = 'Failed Rubber';
        notes = 'Failed Test';
        location = 'Helena';
      } else if (targetLower.includes('destroyed') || targetLower.includes('not repairable')) {
        assignedTo = 'Failed Rubber';
        notes = 'Destroyed';
        location = 'Helena';
      } else if (targetLower.includes('lost') || targetLower.includes('missing')) {
        assignedTo = 'Lost';
        location = 'Lost';
        notes = 'Lost';
      } else if (targetLower.includes('packed for testing') || targetLower.includes('ready for test')) {
        assignedTo = 'Packed For Testing';
        location = "Cody's Truck";
        notes = 'Packed on truck';
      } else if (targetLower.includes('packed for delivery') || targetLower.includes('ready for delivery')) {
        assignedTo = 'Packed For Delivery';
        location = "Cody's Truck";
        notes = 'Packed on truck';
      } else if (targetLower.includes('in testing') || targetLower.includes('lab') || targetLower.includes('arnett') || targetLower.includes('jm test')) {
        assignedTo = 'In Testing';
        location = 'Arnett / JM Test';
        notes = 'Sent to lab';
      } else if (targetLower.includes('on shelf') || targetLower === 'shelf' || targetLower === 'storage' || targetLower === 'unassigned') {
        assignedTo = 'On Shelf';
        location = 'Helena';
        notes = 'On Shelf';
      } else if (targetLower === 'new' || targetLower === 'newly purchased' || targetLower === 'brand new' || targetLower === 'new purchase' || targetLower.startsWith('new (')) {
        assignedTo = 'New';
        location = 'Helena';
        notes = 'Initial Purchase (On Shelf)';
      } else {
        const matchedEmp = empLookup[targetLower];
        if (matchedEmp) {
          assignedTo = matchedEmp.name;
          location = matchedEmp.location || 'Helena';
          notes = 'Assigned to ' + matchedEmp.name;
        } else {
          assignedTo = rawTarget;
          location = 'Helena';
          notes = 'Assigned';
        }
      }

      parsedEntries.push({
        dateObj: parsedDate,
        dateFormatted: formattedDate,
        assignedTo: assignedTo,
        location: location,
        notes: notes
      });
    });

    if (parsedEntries.length === 0) {
      if (alertEl) {
        alertEl.className = 'alert alert-danger';
        alertEl.style.display = 'block';
        alertEl.style.background = 'rgba(239, 68, 68, 0.15)';
        alertEl.style.border = '1px solid rgba(239, 68, 68, 0.3)';
        alertEl.style.color = '#f87171';
        alertEl.innerHTML = 'No valid "Date - Holder/Status" lines could be parsed.';
      }
      return;
    }

    parsedEntries.sort((a, b) => a.dateObj.getTime() - b.dateObj.getTime());

    // Insert into local history table
    const histTable = this.db.getTable(sheetKey);
    let addedCount = 0;
    if (histTable && histTable.rows) {
      parsedEntries.forEach(entry => {
        const isDupe = histTable.rows.some(r => {
          const rDate = String(r['Date Assigned'] || r['Date'] || Object.values(r)[0] || '').trim();
          const rAssigned = String(r['Assigned To'] || '').trim().toLowerCase();
          const rItem = String(r['Item #'] || r['Glove'] || r['Sleeve'] || r['Blanket'] || r['Serial #'] || '').trim();
          return rDate === entry.dateFormatted && rAssigned === entry.assignedTo.toLowerCase() && rItem === itemNum;
        });

        if (!isDupe) {
          const newRowObj = {
            'Date Assigned': entry.dateFormatted,
            'Item #': itemNum,
            'Size': itemMeta.size,
            'Class': itemMeta.classVal,
            'Location': entry.location,
            'Assigned To': entry.assignedTo,
            'Notes': entry.notes
          };
          if (sheetKey.includes('mack')) newRowObj['KV'] = itemMeta.kv;
          if (sheetKey.includes('hv_tester') || sheetKey.includes('phasing')) newRowObj['Model'] = itemMeta.model;
          histTable.rows.push(newRowObj);
          addedCount++;
        }
      });
    }

    // Queue mutation to outbox for sync
    const eqNameMap = {
      'gloves_history': 'Gloves',
      'sleeves_history': 'Sleeves',
      'blankets_history': 'Blankets',
      'macks_history': 'MACKs',
      'hv_testers_history': 'HV Testers',
      'phasing_sets_history': 'Phasing Sets',
      'aed_history': 'AED',
      'grounds_history': 'Grounds',
      'hot_sticks_history': 'Hot Sticks'
    };

    const targetEq = eqNameMap[sheetKey] || 'Gloves';
    const targetSheet = targetEq + ' History';

    await this.db.addMutation({
      action: 'IMPORT_HISTORY_LOG',
      equipmentType: targetEq,
      sheetName: targetSheet,
      itemNum: itemNum,
      logText: logText,
      timestamp: new Date().toISOString()
    });

    // Explicitly persist updated in-memory snapshot
    if (this.db.snapshot) {
      await this.db.setSnapshot(this.db.snapshot);
    }

    // Auto-reconcile active inventory table so it reflects the imported history immediately
    if (window.inventoryManager && typeof window.inventoryManager.reconcileInventoryWithHistory === 'function') {
      try {
        await window.inventoryManager.reconcileInventoryWithHistory(invSheetKey, true);
      } catch (err) {
        console.warn('Auto-reconcile after history import warning:', err);
      }
    }

    this.closeImportLogModal();

    // Re-render open Dossier modal
    this.openDossierModal(itemNum, sheetKey);
  }

  /**
   * Deletes a single history milestone event from a dossier view
   */
  async deleteMilestoneRecord(sheetKey, itemKey, milestoneIdx) {
    const histKey = sheetKey.endsWith('_history') ? sheetKey : `${sheetKey}_history`;
    const histTable = this.db.getTable(histKey);
    if (!histTable || !histTable.rows) return;

    const activeKey = histKey.replace('_history', '');
    const activeTable = this.db.getTable(activeKey);
    const cleanItemKey = String(itemKey || '').trim();

    const groupRows = histTable.rows.filter(r => {
      for (const k of Object.keys(r)) {
        const kl = k.toLowerCase();
        if (kl.includes('item') || kl.includes('serial') || kl.includes('glove') || kl.includes('sleeve') || kl.includes('blanket') || kl.includes('mack')) {
          if (String(r[k] || '').trim() === cleanItemKey) return true;
        }
      }
      return false;
    });

    const foundActive = activeTable && activeTable.rows ? activeTable.rows.find(r => {
      for (const k of Object.keys(r)) {
        const kl = k.toLowerCase();
        if (kl.includes('item') || kl.includes('serial') || kl.includes('glove') || kl.includes('sleeve') || kl.includes('blanket') || kl.includes('mack')) {
          if (String(r[k] || '').trim() === cleanItemKey) return true;
        }
      }
      return false;
    }) : null;

    const stats = this.analyzeLifecycle(cleanItemKey, groupRows, foundActive);
    if (!stats || !stats.milestones || !stats.milestones[milestoneIdx]) return;

    const m = stats.milestones[milestoneIdx];
    const confirmMsg = `🗑️ Delete History Record?\n\n• Item: #${itemKey}\n• Date: ${m.startDateFormatted}\n• Status / Holder: ${m.assignedTo || m.state.label}\n• Notes: ${m.notes || 'None'}\n\nAre you sure you want to permanently delete this entry?`;
    
    if (!confirm(confirmMsg)) return;

    if (m.rawRow) {
      await this.db.deleteHistoryRow(histKey, m.rawRow);
    } else {
      await this.db.deleteHistoryRow(histKey, r => {
        const d = String(r['Date Assigned'] || r['Date'] || Object.values(r)[0] || '').trim();
        const a = String(r['Assigned To'] || r['Employee Name'] || '').trim();
        return d === m.startDateFormatted && a === m.assignedTo;
      });
    }

    // Refresh UI
    this.openDossierModal(itemKey, histKey);
    if (window.historyNavigator) {
      window.historyNavigator.renderCurrentHistory();
    }
  }

  /**
   * Saves updated dates, status, location, or assignment from the Dossier modal
   */
  async saveDossierItemEdits(sheetKey, cleanItemKey) {
    const activeSheetKey = sheetKey.replace('_history', '');
    const table = this.db.getTable(activeSheetKey);
    if (!table || !table.rows) {
      alert('Could not find active inventory sheet table.');
      return;
    }

    const testDateInput = document.getElementById('dossier-edit-test-date');
    const dateAssignedInput = document.getElementById('dossier-edit-date-assigned');
    const statusSelect = document.getElementById('dossier-edit-status');
    const locationInput = document.getElementById('dossier-edit-location');
    const assignedToInput = document.getElementById('dossier-edit-assigned-to');

    const numKey = parseInt(cleanItemKey, 10);
    const isPureNumKey = !isNaN(numKey) && String(numKey) === cleanItemKey;

    const row = table.rows.find(r => {
      for (const k in r) {
        const kl = k.toLowerCase();
        if (kl.includes('item') || kl.includes('glove') || kl.includes('sleeve') || kl.includes('blanket') || kl.includes('mack') || kl.includes('serial') || kl.includes('esl')) {
          const val = String(r[k] || '').trim();
          if (val.toLowerCase() === cleanItemKey.toLowerCase()) return true;
          if (isPureNumKey && parseInt(val, 10) === numKey) return true;
        }
      }
      return false;
    });

    if (!row) {
      alert('Item record not found in active inventory.');
      return;
    }

    const formatToMdY = (dStr) => {
      if (!dStr) return '';
      if (dStr.includes('/')) return dStr;
      const parts = dStr.split('-');
      if (parts.length === 3) return `${parts[1]}/${parts[2]}/${parts[0]}`;
      return dStr;
    };

    const newTestDate = testDateInput ? formatToMdY(testDateInput.value.trim()) : '';
    const newDateAssigned = dateAssignedInput ? formatToMdY(dateAssignedInput.value.trim()) : '';
    const newStatus = statusSelect ? statusSelect.value.trim() : (row['Status'] || '');
    const newLocation = locationInput ? locationInput.value.trim() : (row['Location'] || '');
    const newAssignedTo = assignedToInput ? assignedToInput.value.trim() : (row['Assigned To'] || '');

    // Identify which header names exist on this sheet
    const testHeader = table.headers.find(h => /test\s*date|calibration|pad\s*exp/i.test(h)) || 'Test Date';
    const dateAssignedHeader = table.headers.find(h => /date\s*assigned/i.test(h)) || 'Date Assigned';
    const statusHeader = table.headers.find(h => /^status$/i.test(h)) || 'Status';
    const locationHeader = table.headers.find(h => /^location$/i.test(h)) || 'Location';
    const assignedToHeader = table.headers.find(h => /assigned\s*to/i.test(h)) || 'Assigned To';
    const changeOutHeader = table.headers.find(h => /change\s*out/i.test(h)) || 'Change Out Date';

    // Calculate new Change Out Date
    let newChgOut = '';
    if (window.inventoryManager && typeof window.inventoryManager.calculateChangeOutDate === 'function') {
      newChgOut = window.inventoryManager.calculateChangeOutDate(
        newDateAssigned || newTestDate, newLocation, newAssignedTo, activeSheetKey, {
          testDate: newTestDate,
          calibrationDate: newTestDate,
          padExpiration: newTestDate,
          batteryExpiration: row['Battery Expiration'] || ''
        }
      );
    }

    // Apply updates to row object
    if (newTestDate && testHeader) row[testHeader] = newTestDate;
    if (newDateAssigned && dateAssignedHeader) row[dateAssignedHeader] = newDateAssigned;
    if (newStatus && statusHeader) row[statusHeader] = newStatus;
    if (newLocation && locationHeader) row[locationHeader] = newLocation;
    if (newAssignedTo && assignedToHeader) row[assignedToHeader] = newAssignedTo;
    if (newChgOut && changeOutHeader) row[changeOutHeader] = newChgOut;

    // Apply to rawGrid if exists
    const rowIdx = row._rowIdx || (table.rows.indexOf(row) !== -1 ? table.rows.indexOf(row) + 2 : null);
    if (table.rawGrid && rowIdx && table.rawGrid[rowIdx - 1]) {
      const gRow = table.rawGrid[rowIdx - 1];
      table.headers.forEach((h, colIdx) => {
        if (row[h] !== undefined) gRow[colIdx] = row[h];
      });
    }

    // Queue UPDATE_CELL mutations for sync
    const sheetName = table.name || activeSheetKey;
    const addCellMutation = async (hName, val) => {
      if (!hName || val === undefined) return;
      const colIdx = table.headers.indexOf(hName);
      if (colIdx !== -1 && rowIdx) {
        await this.db.addMutation({
          action: 'UPDATE_CELL',
          sheetName: sheetName,
          row: rowIdx,
          col: colIdx + 1,
          header: hName,
          value: val
        });
      }
    };

    if (newTestDate && testHeader) await addCellMutation(testHeader, newTestDate);
    if (newDateAssigned && dateAssignedHeader) await addCellMutation(dateAssignedHeader, newDateAssigned);
    if (newStatus && statusHeader) await addCellMutation(statusHeader, newStatus);
    if (newLocation && locationHeader) await addCellMutation(locationHeader, newLocation);
    if (newAssignedTo && assignedToHeader) await addCellMutation(assignedToHeader, newAssignedTo);
    if (newChgOut && changeOutHeader) await addCellMutation(changeOutHeader, newChgOut);

    // Auto-record history transition if status/assigned changed
    await this.db.recordItemHistoryEvent(sheetName, row, row['Notes'] || `Dates updated`);

    // Persist snapshot to storage
    if (this.db.snapshot) {
      await this.db.setSnapshot(this.db.snapshot);
    }

    // Refresh views
    if (window.sheetNavigator) {
      window.sheetNavigator.renderActiveView();
    }
    this.openDossierModal(cleanItemKey, sheetKey);

    if (window.inventoryManager && typeof window.inventoryManager.showToast === 'function') {
      window.inventoryManager.showToast(`✅ Successfully updated dates & details for #${cleanItemKey}!`);
    } else {
      alert(`✅ Successfully updated #${cleanItemKey}!`);
    }
  }
}

// Global instance
window.itemStatsEngine = new ItemStatsEngine(window.localDB);
