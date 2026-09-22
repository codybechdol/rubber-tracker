/**
 * item-stats.js - Item Lifecycle Analytics & Visualizer Engine for Desktop App
 * Computes lifespan, time breakdown (field vs shelf vs testing vs packed for testing vs packed for delivery vs lost),
 * test turnaround cycles, and renders interactive visual timeline steppers.
 */

class ItemStatsEngine {
  constructor(db) {
    this.db = db;
    this.currentSectionItems = [];
    this.currentActiveItemIndex = -1;
    this.currentActiveItemKey = null;
    this.currentActiveSheetKey = null;
    this._bookListenersInitialized = false;
    this.initBookPagingListeners();
  }

  parseDate(val) {
    if (!val || val === 'N/A') return null;
    if (val instanceof Date) return isNaN(val.getTime()) ? null : val;
    const s = String(val).trim();
    if (s.includes('/')) {
      const parts = s.split('/');
      if (parts.length === 3) {
        const m = parseInt(parts[0], 10) - 1;
        const d = parseInt(parts[1], 10);
        let y = parseInt(parts[2], 10);
        if (y > 2100 && y >= 20200 && y <= 20300) y = Math.floor(y / 10);
        else if (y === 2032) y = 2022;
        else if (y < 100) y = y < 50 ? 2000 + y : 1900 + y;
        const dt = new Date(y, m, d, 12, 0, 0);
        return isNaN(dt.getTime()) ? null : dt;
      } else if (parts.length === 2) {
        const m = parseInt(parts[0], 10) - 1;
        const d = parseInt(parts[1], 10);
        const now = new Date();
        let y = now.getFullYear();
        if (m > now.getMonth() || (m === now.getMonth() && d > now.getDate())) {
          y = y - 1;
        }
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

  getCanonicalEmployeeName(rawName) {
    if (!rawName) return '';
    if (this.db && typeof this.db.getCanonicalEmployeeName === 'function') {
      return this.db.getCanonicalEmployeeName(rawName);
    }
    if (typeof window !== 'undefined' && window.employeeResolver && typeof window.employeeResolver.getCanonicalName === 'function') {
      return window.employeeResolver.getCanonicalName(rawName);
    }
    return String(rawName).trim();
  }

  areSameEmployee(nameA, nameB) {
    if (!nameA || !nameB) return false;
    if (this.db && typeof this.db.areSameEmployee === 'function') {
      return this.db.areSameEmployee(nameA, nameB);
    }
    if (typeof window !== 'undefined' && window.employeeResolver && typeof window.employeeResolver.areSameEmployee === 'function') {
      return window.employeeResolver.areSameEmployee(nameA, nameB);
    }
    return String(nameA).trim().toLowerCase() === String(nameB).trim().toLowerCase();
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

  analyzeLifecycle(itemKey, groupRows, activeItemRow = null) {
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

    // Sanitize sorted rows before generating milestones:
    // 1. Identify dates where an active employee field assignment exists
    const empAssignmentDates = new Set();
    sorted.forEach(r => {
      const st = this.classifyState(r['Assigned To'], r['Location'], r['Notes'], r['Status']);
      if (st.key === 'FIELD') {
        const dObj = this.parseDate(r['Date Assigned'] || r['Date'] || Object.values(r)[0]);
        if (dObj) empAssignmentDates.add(dObj.toISOString().slice(0, 10));
      }
    });

    // 2. Discard 0-day intermediate shelf artifacts that occur on the exact same date as an employee assignment
    const noIntermediateShelf = sorted.filter(r => {
      const st = this.classifyState(r['Assigned To'], r['Location'], r['Notes'], r['Status']);
      if (st.key === 'SHELF' || st.key === 'NEW_PURCHASE') {
        const dObj = this.parseDate(r['Date Assigned'] || r['Date'] || Object.values(r)[0]);
        if (dObj && empAssignmentDates.has(dObj.toISOString().slice(0, 10))) {
          return false; // Discard 0-day intermediate shelf artifact
        }
      }
      return true;
    });

    // 3. Collapse consecutive same-state records
    const cleanSorted = [];
    for (let sIdx = 0; sIdx < noIntermediateShelf.length; sIdx++) {
      const cur = noIntermediateShelf[sIdx];
      if (cleanSorted.length > 0) {
        const prev = cleanSorted[cleanSorted.length - 1];
        const curSt = this.classifyState(cur['Assigned To'], cur['Location'], cur['Notes'], cur['Status']);
        const prevSt = this.classifyState(prev['Assigned To'], prev['Location'], prev['Notes'], prev['Status']);

        const isBothShelf = (curSt.key === 'SHELF' || curSt.key === 'NEW_PURCHASE') && (prevSt.key === 'SHELF' || prevSt.key === 'NEW_PURCHASE');
        const isSameHolder = this.areSameEmployee(cur['Assigned To'], prev['Assigned To']);

        if (isBothShelf || (curSt.key === prevSt.key && isSameHolder)) {
          // Update prev with the later date & merge notes
          const cDate = cur['Date Assigned'] || cur['Date'];
          if (cDate) {
            prev['Date Assigned'] = cDate;
            if (prev['Date']) prev['Date'] = cDate;
          }
          if (cur['Notes'] && !String(prev['Notes'] || '').includes(cur['Notes'])) {
            prev['Notes'] = prev['Notes'] ? `${prev['Notes']} | ${cur['Notes']}` : cur['Notes'];
          }
          if (cur['Location'] && String(cur['Location']).toLowerCase() !== 'helena') {
            prev['Location'] = cur['Location'];
          }
          const curAssignedRaw = String(cur['Assigned To'] || '').trim();
          if (curAssignedRaw && curAssignedRaw.toLowerCase() !== String(prev['Assigned To'] || '').trim().toLowerCase()) {
            prev['Assigned To'] = curAssignedRaw;
          }
          continue; // Collapsed!
        }
      }
      cleanSorted.push(cur);
    }

    const milestoneSource = cleanSorted.length > 0 ? cleanSorted : sorted;

    for (let i = 0; i < milestoneSource.length; i++) {
      const current = milestoneSource[i];
      const next = i < milestoneSource.length - 1 ? milestoneSource[i + 1] : null;

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
          const canKey = this.getCanonicalEmployeeName(linemanName);
          if (!linemenMap[canKey]) {
            linemenMap[canKey] = {
              canonicalName: canKey,
              displayName: linemanName,
              days: 0
            };
          }
          linemenMap[canKey].days += days;
          if (i === milestoneSource.length - 1 && activeItemRow && activeItemRow['Assigned To']) {
            linemenMap[canKey].displayName = String(activeItemRow['Assigned To']).trim() || canKey;
          }
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

      const isFutureDate = startDate.getTime() > (Date.now() + 30 * 86400000);

      let assignedDisplay = assignedTo;
      if (state.key === 'NEW_PURCHASE') {
        assignedDisplay = assignedTo || 'New (Purchased)';
      } else if (i === milestoneSource.length - 1 && !isRetired && activeItemRow && activeItemRow['Assigned To']) {
        const actAssigned = String(activeItemRow['Assigned To']).trim();
        if (actAssigned && this.areSameEmployee(actAssigned, assignedTo)) {
          assignedDisplay = actAssigned;
        }
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
        assignedTo: assignedDisplay,
        location: location || 'Helena',
        notes: notes,
        isCurrent: i === milestoneSource.length - 1 && !isRetired,
        isFutureDate: isFutureDate,
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
    const activeAssignedTo = activeItemRow ? String(activeItemRow['Assigned To'] || '').trim() : '';
    const linemenList = Object.keys(linemenMap).map(canKey => {
      const entry = linemenMap[canKey];
      const isCurrentLineman = !isRetired && (
        (lastMilestone && lastMilestone.state.key === 'FIELD' && this.areSameEmployee(lastMilestone.assignedTo, canKey)) ||
        (activeAssignedTo && this.areSameEmployee(activeAssignedTo, canKey))
      );
      let finalDisplayName = entry.displayName || canKey;
      if (isCurrentLineman && activeAssignedTo) {
        finalDisplayName = activeAssignedTo;
      }

      return {
        name: finalDisplayName,
        canonicalName: canKey,
        days: entry.days,
        durationFormatted: this.formatDuration(entry.days),
        pct: Math.round((entry.days / (fieldDays || 1)) * 100),
        isCurrent: isCurrentLineman
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
      retiredDays: retiredDays,
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

  /**
   * computeFleetVisualMetrics - Aggregates fleet-wide lifecycle, failure, purchase, and assignment metrics
   * for Gloves or Sleeves.
   * @param {string} sheetKey - 'gloves' or 'sleeves'
   * @returns {Object} Calculated metrics
   */
  computeFleetVisualMetrics(sheetKey = 'gloves') {
    sheetKey = (sheetKey || 'gloves').toLowerCase();
    const isGloves = sheetKey.includes('glove');
    const cleanKey = isGloves ? 'gloves' : 'sleeves';
    const histKey = cleanKey + '_history';

    const mainTable = this.db.getTable(cleanKey);
    const histTable = this.db.getTable(histKey);
    const mainRows = (mainTable && mainTable.rows) ? mainTable.rows : [];
    const histRows = (histTable && histTable.rows) ? histTable.rows : [];

    // 1. Group history by item #
    const histByItem = {};
    histRows.forEach(r => {
      const num = String(r['Item #'] || r['Item Number'] || r['Item'] || '').trim();
      if (!num) return;
      if (!histByItem[num]) histByItem[num] = [];
      histByItem[num].push(r);
    });

    // 2. Failed rubber analysis
    const failedActive = [];
    const failureReasons = {
      'Visual': { count: 0, label: 'Visual (Cuts / Tears / Punctures)', color: '#f59e0b', icon: '👁️', shortLabel: 'Visual' },
      'Electrical': { count: 0, label: 'Electrical Test Failure (Dielectric)', color: '#ef4444', icon: '⚡', shortLabel: 'Electrical' },
      'Field Damage': { count: 0, label: 'Damaged in Field', color: '#a855f7', icon: '💥', shortLabel: 'Field Damage' },
      'Failed Test': { count: 0, label: 'Lab Retest Failed', color: '#ec4899', icon: '🔬', shortLabel: 'Lab Test' },
      'Unspecified': { count: 0, label: 'Unspecified / No Note', color: '#64748b', icon: '❓', shortLabel: 'Unspecified' }
    };
    const failuresByClass = {};
    const failuresBySize = {};

    mainRows.forEach(r => {
      const status = String(r['Status'] || '').toLowerCase().trim();
      const assigned = String(r['Assigned To'] || '').toLowerCase().trim();
      const notes = String(r['Notes'] || '').trim();
      const size = String(r['Size'] || 'Unknown').trim();
      const cls = String(r['Class'] || 'Unknown').trim();

      const isFailed = status === 'failed rubber' || assigned === 'failed rubber' || status === 'failed' || assigned === 'failed';
      if (isFailed) {
        failedActive.push(r);
        if (cls) failuresByClass[cls] = (failuresByClass[cls] || 0) + 1;
        if (size) failuresBySize[size] = (failuresBySize[size] || 0) + 1;

        const nLower = notes.toLowerCase();
        if (nLower.includes('visual') || nLower.includes('cut') || nLower.includes('tear') || nLower.includes('hole') || nLower.includes('puncture') || nLower.includes('ozone')) {
          failureReasons['Visual'].count++;
        } else if (nLower.includes('electr') || nLower.includes('dielectric') || nLower.includes('burn')) {
          failureReasons['Electrical'].count++;
        } else if (nLower.includes('damag') || nLower.includes('field')) {
          failureReasons['Field Damage'].count++;
        } else if (nLower.includes('test fail') || nLower.includes('failed test')) {
          failureReasons['Failed Test'].count++;
        } else {
          failureReasons['Unspecified'].count++;
        }
      }
    });

    // Also count all-time retired/failed items from history
    const historicalFailedItems = new Set();
    histRows.forEach(r => {
      const assigned = String(r['Assigned To'] || '').toLowerCase().trim();
      const status = String(r['Status'] || '').toLowerCase().trim();
      const notes = String(r['Notes'] || '').toLowerCase().trim();
      const num = String(r['Item #'] || '').trim();
      if (assigned === 'failed rubber' || assigned === 'failed' || status === 'failed rubber' || status === 'failed' || notes.includes('failed rubber') || notes.includes('failed test')) {
        if (num) historicalFailedItems.add(num);
      }
    });

    // 3. New Purchases tracking
    const newPurchaseItems = new Set();
    histRows.forEach(r => {
      const assigned = String(r['Assigned To'] || '').toLowerCase().trim();
      const notes = String(r['Notes'] || '').toLowerCase().trim();
      const num = String(r['Item #'] || '').trim();
      if (
        assigned === 'new' || assigned === 'newly purchased' || assigned === 'brand new' || assigned === 'new purchase' ||
        assigned.startsWith('new (') ||
        notes.includes('new purchase') || notes.includes('initial purchase') || notes.includes('newly purchased') ||
        notes === 'new'
      ) {
        if (num) newPurchaseItems.add(num);
      }
    });
    mainRows.forEach(r => {
      const assigned = String(r['Assigned To'] || '').toLowerCase().trim();
      const notes = String(r['Notes'] || '').toLowerCase().trim();
      const num = String(r['Glove'] || r['Sleeve'] || r['Item #'] || '').trim();
      if (assigned === 'new' || assigned === 'new purchase' || notes.includes('new purchase') || notes.includes('initial purchase')) {
        if (num) newPurchaseItems.add(num);
      }
    });
    const newPurchasesCount = newPurchaseItems.size;

    // 4. Lifespan vs. Assignment Duration Analysis
    let totalLifespanDays = 0;
    let totalFieldDays = 0;
    let totalShelfDays = 0;
    let totalTestingDays = 0;
    let totalLostDays = 0;
    let countWithHistory = 0;
    let totalLinemenAssignments = 0;
    let totalLinemenDays = 0;

    mainRows.forEach(r => {
      const num = String(r['Glove'] || r['Sleeve'] || r['Item #'] || '').trim();
      const gRows = histByItem[num];
      if (gRows && gRows.length > 0) {
        const stats = this.analyzeLifecycle(num, gRows, r);
        if (stats) {
          totalLifespanDays += stats.totalDays;
          totalFieldDays += stats.fieldDays;
          totalShelfDays += stats.shelfDays;
          totalTestingDays += stats.testingDays;
          totalLostDays += stats.lostDays;
          countWithHistory++;
          (stats.linemenList || []).forEach(l => {
            totalLinemenAssignments++;
            totalLinemenDays += l.days;
          });
        }
      }
    });

    const avgLifespanDays = countWithHistory > 0 ? Math.round(totalLifespanDays / countWithHistory) : 0;
    const avgAssignmentDays = totalLinemenAssignments > 0 ? Math.round(totalLinemenDays / totalLinemenAssignments) : 0;
    const avgFieldDays = countWithHistory > 0 ? Math.round(totalFieldDays / countWithHistory) : 0;
    const avgShelfDays = countWithHistory > 0 ? Math.round(totalShelfDays / countWithHistory) : 0;

    const aggregateTotalDays = Math.max(1, totalFieldDays + totalShelfDays + totalTestingDays + totalLostDays);
    const lifeAllocation = {
      fieldPct: Math.round((totalFieldDays / aggregateTotalDays) * 100),
      shelfPct: Math.round((totalShelfDays / aggregateTotalDays) * 100),
      testingPct: Math.round((totalTestingDays / aggregateTotalDays) * 100),
      lostPct: Math.max(0, 100 - Math.round((totalFieldDays / aggregateTotalDays) * 100) - Math.round((totalShelfDays / aggregateTotalDays) * 100) - Math.round((totalTestingDays / aggregateTotalDays) * 100))
    };

    // 5. Fleet Operational Readiness
    const now = Date.now();
    let statusField = 0;
    let statusShelf = 0;
    let statusTesting = 0;
    let statusReadyDelivery = 0;
    let statusExpiringSoon = 0;
    let statusOverdue = 0;

    mainRows.forEach(r => {
      const status = String(r['Status'] || '').toLowerCase().trim();
      const assigned = String(r['Assigned To'] || '').toLowerCase().trim();
      const chgDate = r['Change Out Date'];

      const isFailed = status === 'failed rubber' || assigned === 'failed rubber';
      if (!isFailed) {
        if (status === 'on shelf' || assigned === 'on shelf' || status === 'in stock') {
          statusShelf++;
        } else if (status === 'in testing' || assigned === 'in testing' || status === 'ready for test') {
          statusTesting++;
        } else if (status === 'ready for delivery' || assigned === 'packed for delivery') {
          statusReadyDelivery++;
        } else {
          statusField++;
        }

        if (chgDate && chgDate !== 'N/A' && chgDate !== '—') {
          const dt = this.parseDate(chgDate);
          if (dt) {
            const daysLeft = (dt.getTime() - now) / 86400000;
            if (daysLeft < 0) statusOverdue++;
            else if (daysLeft <= 30) statusExpiringSoon++;
          }
        }
      }
    });

    const netReplacementBalance = newPurchasesCount - failedActive.length;

    return {
      sheetKey: cleanKey,
      sheetLabel: isGloves ? 'Gloves' : 'Sleeves',
      singularLabel: isGloves ? 'Glove' : 'Sleeve',
      totalFleet: mainRows.length,
      failedCount: failedActive.length,
      failedRatePct: mainRows.length > 0 ? ((failedActive.length / mainRows.length) * 100).toFixed(1) : '0.0',
      historicalFailedCount: historicalFailedItems.size,
      failureReasons: failureReasons,
      failuresByClass: failuresByClass,
      failuresBySize: failuresBySize,
      newPurchasesCount: newPurchasesCount,
      netReplacementBalance: netReplacementBalance,
      avgLifespanDays: avgLifespanDays,
      avgLifespanFormatted: this.formatDuration(avgLifespanDays),
      avgAssignmentDays: avgAssignmentDays,
      avgAssignmentFormatted: this.formatDuration(avgAssignmentDays),
      avgFieldDays: avgFieldDays,
      avgFieldFormatted: this.formatDuration(avgFieldDays),
      avgShelfDays: avgShelfDays,
      avgShelfFormatted: this.formatDuration(avgShelfDays),
      totalLinemenAssignments: totalLinemenAssignments,
      itemsAnalyzed: countWithHistory,
      lifeAllocation: lifeAllocation,
      readiness: {
        field: statusField,
        shelf: statusShelf,
        testing: statusTesting,
        readyDelivery: statusReadyDelivery,
        expiringSoon: statusExpiringSoon,
        overdue: statusOverdue
      }
    };
  }

  /**
   * renderFleetVisualsHtml - Generates the complete interactive visual analytics dashboard HTML
   * for Gloves or Sleeves.
   */
  renderFleetVisualsHtml(sheetKey, metrics, isExpanded = true, activeFailureReasonFilter = null) {
    if (!metrics) return '';

    const icon = metrics.sheetKey === 'gloves' ? '🧤' : '🦺';
    const totalFailed = Math.max(1, metrics.failedCount);

    // Build failure reason breakdown segmented bar & chips
    const reasonKeys = ['Visual', 'Electrical', 'Field Damage', 'Failed Test', 'Unspecified'];
    const barSegmentsHtml = reasonKeys.map(k => {
      const r = metrics.failureReasons[k];
      if (!r || r.count === 0) return '';
      const pct = Math.round((r.count / totalFailed) * 100);
      return `<div style="width: ${pct}%; background-color: ${r.color};" title="${r.label}: ${r.count} (${pct}%)"></div>`;
    }).filter(Boolean).join('');

    const reasonChipsHtml = reasonKeys.map(k => {
      const r = metrics.failureReasons[k];
      if (!r) return '';
      const isFilterActive = activeFailureReasonFilter && activeFailureReasonFilter.toLowerCase() === k.toLowerCase();
      const pct = metrics.failedCount > 0 ? Math.round((r.count / metrics.failedCount) * 100) : 0;
      return `
        <button class="failure-reason-chip ${isFilterActive ? 'active' : ''}"
                style="background: ${isFilterActive ? r.color : 'rgba(255, 255, 255, 0.04)'};
                       color: ${isFilterActive ? '#ffffff' : 'var(--text-primary)'};
                       border: 1px solid ${isFilterActive ? r.color : 'rgba(255, 255, 255, 0.12)'};
                       border-left: 3px solid ${r.color};"
                onclick="window.sheetNavigator.filterByFailureReason('${this.escapeHtml(k)}')"
                title="Click to filter table by ${r.label}">
          <span>${r.icon}</span>
          <span style="font-weight: 600;">${r.shortLabel}</span>
          <span class="reason-count-badge" style="background: rgba(0, 0, 0, 0.25);">${r.count}</span>
          <span style="font-size: 10px; color: ${isFilterActive ? 'rgba(255,255,255,0.85)' : 'var(--text-muted)'};">(${pct}%)</span>
        </button>
      `;
    }).join('');

    // Purchases vs Failures ratio bar
    const totalPF = Math.max(1, metrics.newPurchasesCount + metrics.failedCount);
    const purchasePct = Math.round((metrics.newPurchasesCount / totalPF) * 100);
    const failurePct = Math.max(0, 100 - purchasePct);

    // Class attrition chips
    const classChipsHtml = Object.entries(metrics.failuresByClass).sort((a, b) => b[1] - a[1]).map(([cls, count]) => {
      return `
        <span class="attrition-pill" onclick="window.sheetNavigator.setClassFilter('${this.escapeHtml(cls)}')" title="Filter by Class ${this.escapeHtml(cls)}">
          <strong>Class ${this.escapeHtml(cls)}:</strong> ${count} failed
        </span>
      `;
    }).join('') || '<span style="font-size: 11px; color: var(--text-muted);">None</span>';

    // Size attrition chips
    const sizeChipsHtml = Object.entries(metrics.failuresBySize).sort((a, b) => b[1] - a[1]).map(([sz, count]) => {
      return `
        <span class="attrition-pill" onclick="window.sheetNavigator.setSizeFilter('${this.escapeHtml(sz)}')" title="Filter by Size ${this.escapeHtml(sz)}">
          <strong>Size ${this.escapeHtml(sz)}:</strong> ${count}
        </span>
      `;
    }).join('') || '<span style="font-size: 11px; color: var(--text-muted);">None</span>';

    if (!isExpanded) {
      // Collapsed Bar View
      return `
        <div class="inventory-visuals-collapsed" onclick="window.sheetNavigator.toggleVisualsDashboard()">
          <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
            <span style="font-size: 16px;">${icon}</span>
            <span style="font-weight: 700; font-size: 13px; color: var(--text-primary);">${metrics.sheetLabel} Fleet Visuals</span>
            <span class="brand-badge" style="font-size: 10.5px; background: rgba(239, 68, 68, 0.15); color: #f87171; border: 1px solid rgba(239, 68, 68, 0.35);">
              ❌ ${metrics.failedCount} Failed (${metrics.failedRatePct}%)
            </span>
            <span class="brand-badge" style="font-size: 10.5px; background: rgba(16, 185, 129, 0.15); color: #34d399; border: 1px solid rgba(16, 185, 129, 0.35);">
              ✨ ${metrics.newPurchasesCount} New Purchases
            </span>
            <span class="brand-badge" style="font-size: 10.5px; background: rgba(59, 130, 246, 0.15); color: #93c5fd; border: 1px solid rgba(59, 130, 246, 0.35);">
              ⏱️ ${metrics.avgLifespanFormatted} Avg Life (Lineman: ${metrics.avgAssignmentFormatted})
            </span>
          </div>
          <div style="margin-left: auto; display: flex; align-items: center; gap: 6px; font-size: 11.5px; font-weight: 600; color: #60a5fa;">
            <span>Show Analytics Dashboard</span>
            <span style="font-size: 12px;">▼</span>
          </div>
        </div>
      `;
    }

    // Expanded Full Dashboard
    return `
      <div class="inventory-visuals-wrapper">
        <!-- Dashboard Header -->
        <div class="inventory-visuals-header">
          <div style="display: flex; align-items: center; gap: 8px;">
            <span style="font-size: 18px;">${icon}</span>
            <div>
              <div style="font-size: 14px; font-weight: 700; color: #ffffff; display: flex; align-items: center; gap: 8px;">
                <span>${metrics.sheetLabel} Fleet Visual Analytics & Lifecycle Intelligence</span>
                <span class="brand-badge" style="font-size: 10px; padding: 1px 6px; background: rgba(59, 130, 246, 0.2); color: #93c5fd; border: 1px solid rgba(59, 130, 246, 0.4);">
                  ${metrics.totalFleet} Total Fleet
                </span>
              </div>
              <div style="font-size: 11px; color: var(--text-muted); margin-top: 1px;">
                Live metrics from active inventory & historical audit logs • Analyzed ${metrics.itemsAnalyzed} items across ${metrics.totalLinemenAssignments} lineman deployments
              </div>
            </div>
          </div>
          <div style="display: flex; align-items: center; gap: 6px;">
            ${activeFailureReasonFilter ? `
              <button class="btn btn-secondary" style="padding: 3px 8px; font-size: 11px; color: #f87171; border-color: rgba(239, 68, 68, 0.4);" onclick="window.sheetNavigator.clearFailureReasonFilter()">
                ✕ Clear "${this.escapeHtml(activeFailureReasonFilter)}" Filter
              </button>
            ` : ''}
            <button class="btn btn-secondary" style="padding: 3px 8px; font-size: 11px; display: inline-flex; align-items: center; gap: 4px;" onclick="window.sheetNavigator.toggleVisualsDashboard()" title="Collapse Visuals to maximize table view">
              <span>▲ Collapse</span>
            </button>
          </div>
        </div>

        <!-- Row 1: Top 4 KPI Cards -->
        <div class="fleet-kpi-grid">
          
          <!-- Card 1: Failed Rubber Totals & Reasons -->
          <div class="fleet-kpi-card" style="border-top: 3px solid #ef4444;">
            <div class="kpi-header">
              <span class="kpi-title"><span>❌</span> Failed Rubber Totals</span>
              <span class="kpi-tag" style="background: rgba(239, 68, 68, 0.15); color: #f87171;">${metrics.failedRatePct}% Attrition</span>
            </div>
            <div class="kpi-main-val" style="color: #ef4444;">
              ${metrics.failedCount} <span style="font-size: 13px; font-weight: 500; color: var(--text-muted);">/ ${metrics.totalFleet} pairs</span>
            </div>
            <div class="kpi-subtext">
              All-time retired: <strong>${metrics.historicalFailedCount}</strong> items in history
            </div>
            <div style="margin-top: 8px;">
              <button class="btn btn-sm btn-secondary" style="width: 100%; font-size: 11px; padding: 3px 6px; justify-content: center; gap: 4px;" onclick="window.sheetNavigator.setStatusFilter('failed_rubber')">
                🔍 Filter All Failed Rubber
              </button>
            </div>
          </div>

          <!-- Card 2: Failures vs. New Purchases -->
          <div class="fleet-kpi-card" style="border-top: 3px solid #10b981;">
            <div class="kpi-header">
              <span class="kpi-title"><span>⚖️</span> Failures vs. Purchases</span>
              <span class="kpi-tag" style="background: ${metrics.netReplacementBalance >= 0 ? 'rgba(16, 185, 129, 0.15)' : 'rgba(245, 158, 11, 0.15)'}; color: ${metrics.netReplacementBalance >= 0 ? '#34d399' : '#fbbf24'};">
                ${metrics.netReplacementBalance >= 0 ? '+' + metrics.netReplacementBalance + ' Net Growth' : metrics.netReplacementBalance + ' Deficit'}
              </span>
            </div>
            <div class="kpi-main-val">
              <span style="color: #10b981;">${metrics.newPurchasesCount}</span>
              <span style="font-size: 13px; font-weight: 500; color: var(--text-muted);">New vs</span>
              <span style="color: #ef4444;">${metrics.failedCount}</span>
              <span style="font-size: 13px; font-weight: 500; color: var(--text-muted);">Failed</span>
            </div>
            <!-- Mini Progress Bar comparing New vs Failed -->
            <div style="height: 6px; border-radius: 3px; overflow: hidden; background: var(--bg-tertiary); display: flex; margin-top: 6px;">
              <div style="width: ${purchasePct}%; background: #10b981;" title="New Purchases: ${metrics.newPurchasesCount} (${purchasePct}%)"></div>
              <div style="width: ${failurePct}%; background: #ef4444;" title="Failures: ${metrics.failedCount} (${failurePct}%)"></div>
            </div>
            <div class="kpi-subtext" style="margin-top: 6px;">
              Replacement Ratio: <strong>${(metrics.newPurchasesCount / Math.max(1, metrics.failedCount)).toFixed(2)}x</strong>
            </div>
          </div>

          <!-- Card 3: Avg Lifespan vs. Lineman Time -->
          <div class="fleet-kpi-card" style="border-top: 3px solid #3b82f6;">
            <div class="kpi-header">
              <span class="kpi-title"><span>⏱️</span> Lifespan vs. Field Time</span>
              <span class="kpi-tag" style="background: rgba(59, 130, 246, 0.15); color: #93c5fd;">Cycle Metric</span>
            </div>
            <div class="kpi-main-val" style="color: #60a5fa;">
              ${metrics.avgLifespanFormatted}
            </div>
            <div class="kpi-subtext">
              Avg Lineman Deployment: <strong style="color: #93c5fd;">${metrics.avgAssignmentFormatted}</strong> (~${(metrics.avgAssignmentDays / 30.4).toFixed(1)} mos)
            </div>
            <div class="kpi-subtext" style="color: var(--text-muted); font-size: 10.5px; margin-top: 4px;">
              ${metrics.totalLinemenAssignments} employee assignments analyzed
            </div>
          </div>

          <!-- Card 4: Fleet Operational Readiness -->
          <div class="fleet-kpi-card" style="border-top: 3px solid #f59e0b;">
            <div class="kpi-header">
              <span class="kpi-title"><span>🛡️</span> Fleet Readiness</span>
              <span class="kpi-tag" style="background: rgba(245, 158, 11, 0.15); color: #fbbf24;">Operational</span>
            </div>
            <div class="kpi-main-val" style="font-size: 18px;">
              <span style="color: #3b82f6;" title="Active with Linemen">👷 ${metrics.readiness.field}</span>
              <span style="font-size: 13px; color: var(--text-muted); font-weight: normal;">•</span>
              <span style="color: #f59e0b;" title="Warehouse Spares">📦 ${metrics.readiness.shelf}</span>
              <span style="font-size: 13px; color: var(--text-muted); font-weight: normal;">•</span>
              <span style="color: #c084fc;" title="In Testing Lab">🔬 ${metrics.readiness.testing}</span>
            </div>
            <div class="kpi-subtext" style="display: flex; gap: 8px; margin-top: 6px; flex-wrap: wrap;">
              <span style="color: ${metrics.readiness.expiringSoon > 0 ? '#fbbf24' : 'var(--text-muted)'};">
                ⚠️ ${metrics.readiness.expiringSoon} Expiring (<30d)
              </span>
              <span style="color: ${metrics.readiness.overdue > 0 ? '#f87171' : 'var(--text-muted)'}; font-weight: ${metrics.readiness.overdue > 0 ? '700' : 'normal'};">
                ❌ ${metrics.readiness.overdue} Overdue
              </span>
            </div>
          </div>

        </div>

        <!-- Row 2: 3 Detailed Breakdown Panels -->
        <div class="fleet-detail-grid">
          
          <!-- Detail Panel 1: Failure Reasons from Notes -->
          <div class="fleet-detail-card">
            <div class="detail-card-title">
              <span>👁️ Failure Reasons from Notes</span>
              <span style="font-size: 11px; font-weight: 500; color: var(--text-muted);">(${metrics.failedCount} failed items)</span>
            </div>
            <div style="font-size: 11px; color: var(--text-muted); margin-bottom: 8px;">
              Extracted from inspector change-out & test notes. Click any reason below to filter the grid:
            </div>
            
            <!-- Segmented Distribution Bar -->
            <div style="height: 10px; border-radius: 5px; overflow: hidden; background: var(--bg-tertiary); display: flex; margin-bottom: 10px; box-shadow: inset 0 1px 2px rgba(0,0,0,0.3);">
              ${barSegmentsHtml || '<div style="width: 100%; background: var(--bg-tertiary);"></div>'}
            </div>

            <!-- Reason Filter Chips -->
            <div class="failure-reasons-chips-grid">
              ${reasonChipsHtml}
            </div>
          </div>

          <!-- Detail Panel 2: Lifespan vs Time Assigned to Employee -->
          <div class="fleet-detail-card">
            <div class="detail-card-title">
              <span>⏱️ Lifespan vs. Lineman Deployment</span>
              <span style="font-size: 11px; font-weight: 500; color: var(--text-muted);">${metrics.sheetLabel} Lifecycle</span>
            </div>
            
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 10px;">
              <div style="background: rgba(255, 255, 255, 0.03); border: 1px solid var(--border-color); border-radius: 6px; padding: 6px 8px;">
                <div style="font-size: 10.5px; color: var(--text-muted); text-transform: uppercase; font-weight: 600;">Total Lifespan</div>
                <div style="font-size: 15px; font-weight: 700; color: #60a5fa; margin-top: 2px;">${metrics.avgLifespanFormatted}</div>
                <div style="font-size: 10px; color: var(--text-muted);">Tracking origin to EOL</div>
              </div>
              <div style="background: rgba(255, 255, 255, 0.03); border: 1px solid var(--border-color); border-radius: 6px; padding: 6px 8px;">
                <div style="font-size: 10.5px; color: var(--text-muted); text-transform: uppercase; font-weight: 600;">Time Per Lineman</div>
                <div style="font-size: 15px; font-weight: 700; color: #34d399; margin-top: 2px;">${metrics.avgAssignmentFormatted}</div>
                <div style="font-size: 10px; color: var(--text-muted);">Avg continuous deployment</div>
              </div>
            </div>

            <div style="font-size: 11px; color: var(--text-muted); margin-bottom: 6px; display: flex; justify-content: space-between;">
              <span>Lifetime Stage Allocation:</span>
              <span style="color: var(--text-secondary); font-weight: 600;">${metrics.avgFieldFormatted} Total Field Time</span>
            </div>

            <!-- Segmented Lifetime Allocation Bar -->
            <div style="height: 10px; border-radius: 5px; overflow: hidden; background: var(--bg-tertiary); display: flex; margin-bottom: 8px; box-shadow: inset 0 1px 2px rgba(0,0,0,0.3);">
              ${metrics.lifeAllocation.fieldPct > 0 ? `<div style="width: ${metrics.lifeAllocation.fieldPct}%; background: #3b82f6;" title="Field Service: ${metrics.lifeAllocation.fieldPct}%"></div>` : ''}
              ${metrics.lifeAllocation.shelfPct > 0 ? `<div style="width: ${metrics.lifeAllocation.shelfPct}%; background: #f59e0b;" title="Warehouse Shelf: ${metrics.lifeAllocation.shelfPct}%"></div>` : ''}
              ${metrics.lifeAllocation.testingPct > 0 ? `<div style="width: ${metrics.lifeAllocation.testingPct}%; background: #c084fc;" title="Testing Lab: ${metrics.lifeAllocation.testingPct}%"></div>` : ''}
              ${metrics.lifeAllocation.lostPct > 0 ? `<div style="width: ${metrics.lifeAllocation.lostPct}%; background: #64748b;" title="Lost/Other: ${metrics.lifeAllocation.lostPct}%"></div>` : ''}
            </div>

            <div style="display: flex; gap: 10px; font-size: 10.5px; color: var(--text-muted); flex-wrap: wrap;">
              <span style="display: flex; align-items: center; gap: 4px;"><span style="width: 8px; height: 8px; border-radius: 50%; background: #3b82f6;"></span> Field (${metrics.lifeAllocation.fieldPct}%)</span>
              <span style="display: flex; align-items: center; gap: 4px;"><span style="width: 8px; height: 8px; border-radius: 50%; background: #f59e0b;"></span> Shelf (${metrics.lifeAllocation.shelfPct}%)</span>
              <span style="display: flex; align-items: center; gap: 4px;"><span style="width: 8px; height: 8px; border-radius: 50%; background: #c084fc;"></span> Testing (${metrics.lifeAllocation.testingPct}%)</span>
            </div>
            
            <div style="font-size: 10px; color: var(--text-muted); margin-top: 8px; border-top: 1px dashed rgba(255,255,255,0.08); padding-top: 6px;">
              ℹ️ Recertification Interval: <strong>${metrics.sheetKey === 'gloves' ? '3 Months (OSHA / Utility Spec)' : '6–12 Months'}</strong>. Linemen rotations align closely with required test cycles.
            </div>
          </div>

          <!-- Detail Panel 3: High-Attrition / Procurement Alert -->
          <div class="fleet-detail-card">
            <div class="detail-card-title">
              <span>📊 Attrition by Class & Size</span>
              <span style="font-size: 11px; font-weight: 500; color: var(--text-muted);">Procurement Guide</span>
            </div>
            
            <div style="font-size: 11px; color: var(--text-muted); margin-bottom: 6px;">
              Failure breakdown to guide re-ordering & safety stock:
            </div>

            <!-- By Class -->
            <div style="margin-bottom: 8px;">
              <div style="font-size: 10.5px; font-weight: 700; color: var(--text-secondary); margin-bottom: 4px; text-transform: uppercase;">
                Failures by Voltage Class:
              </div>
              <div style="display: flex; gap: 6px; flex-wrap: wrap;">
                ${classChipsHtml}
              </div>
            </div>

            <!-- By Size -->
            <div>
              <div style="font-size: 10.5px; font-weight: 700; color: var(--text-secondary); margin-bottom: 4px; text-transform: uppercase;">
                Failures by Size (High-Attrition):
              </div>
              <div style="display: flex; gap: 6px; flex-wrap: wrap;">
                ${sizeChipsHtml}
              </div>
            </div>

            <div style="margin-top: 10px; background: rgba(59, 130, 246, 0.08); border: 1px solid rgba(59, 130, 246, 0.2); border-radius: 6px; padding: 6px 8px; font-size: 10.5px; color: #93c5fd;">
              💡 <strong>Safety Stock Tip:</strong> Order replacement stock ahead of quarterly swap cycles to prevent size stockouts during field swaps.
            </div>
          </div>

        </div>
      </div>
    `;
  }

  initBookPagingListeners() {
    if (this._bookListenersInitialized) return;
    this._bookListenersInitialized = true;

    // 1. Keyboard Navigation (ArrowLeft / ArrowRight / PageUp / PageDown)
    window.addEventListener('keydown', (e) => {
      const modal = document.getElementById('item-lifecycle-modal');
      if (!modal || !modal.classList.contains('active')) return;

      // Do not intercept if user is typing in an input, textarea, or select
      const activeEl = document.activeElement;
      if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || activeEl.tagName === 'SELECT')) {
        return;
      }

      // If an overlay modal is open on top of dossier, don't intercept
      const impModal = document.getElementById('import-history-log-modal');
      if (impModal && impModal.classList.contains('active')) return;
      const editMModal = document.getElementById('edit-milestone-modal');
      if (editMModal && (editMModal.classList.contains('active') || editMModal.style.display !== 'none')) return;

      if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
        e.preventDefault();
        this.pageDossier(-1);
      } else if (e.key === 'ArrowRight' || e.key === 'PageDown') {
        e.preventDefault();
        this.pageDossier(1);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        this.closeDossierModal();
      }
    });

    // 2. Touch & Swipe Gestures (for phone, tablet, touch laptop screen)
    const setupTouch = () => {
      const modal = document.getElementById('item-lifecycle-modal');
      const modalBox = modal ? modal.querySelector('.modal-box') : null;
      if (!modalBox || modalBox._touchBound) return;
      modalBox._touchBound = true;

      let startX = 0;
      let startY = 0;
      let startTime = 0;
      let isTracking = false;

      modalBox.addEventListener('touchstart', (e) => {
        if (!e.touches || e.touches.length !== 1) return;
        const target = e.target;
        if (target && (target.tagName === 'INPUT' || target.tagName === 'SELECT' || target.tagName === 'TEXTAREA' || target.closest('button, input, select, textarea'))) {
          return;
        }
        startX = e.touches[0].clientX;
        startY = e.touches[0].clientY;
        startTime = Date.now();
        isTracking = true;
      }, { passive: true });

      modalBox.addEventListener('touchmove', () => {}, { passive: true });

      modalBox.addEventListener('touchend', (e) => {
        if (!isTracking || !e.changedTouches || e.changedTouches.length === 0) return;
        isTracking = false;

        const endX = e.changedTouches[0].clientX;
        const endY = e.changedTouches[0].clientY;
        const deltaX = endX - startX;
        const deltaY = endY - startY;
        const elapsed = Date.now() - startTime;

        // Swipe horizontal threshold
        if (elapsed < 800 && Math.abs(deltaX) >= 45 && Math.abs(deltaX) > Math.abs(deltaY) * 1.25) {
          if (deltaX < 0) {
            // Swipe Left -> Next Page (forward)
            this.pageDossier(1);
          } else {
            // Swipe Right -> Previous Page (backward)
            this.pageDossier(-1);
          }
        }
      }, { passive: true });

      modalBox.addEventListener('touchcancel', () => {
        isTracking = false;
      }, { passive: true });
    };

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', setupTouch);
    } else {
      setupTouch();
    }
  }

  getSectionItemList(sheetKey, activeItemKey) {
    const activeSheetKey = (sheetKey || 'gloves').replace('_history', '');
    const cleanActive = String(activeItemKey || '').trim();

    // Check if sheetNavigator has active sheet open with filtered/sorted rows
    if (window.sheetNavigator && window.sheetNavigator.currentSheetKey === activeSheetKey) {
      const navRows = window.sheetNavigator.currentFilteredRows || (window.sheetNavigator.currentSheetData ? window.sheetNavigator.currentSheetData.rows : null);
      if (navRows && navRows.length > 0) {
        const headers = window.sheetNavigator.currentSheetData ? (window.sheetNavigator.currentSheetData.headers || []) : [];
        const primaryHeader = headers.length > 0 ? headers[0] : '';
        const navItems = [];
        const seen = new Set();
        navRows.forEach(r => {
          let val = '';
          if (primaryHeader && r[primaryHeader] !== undefined) {
            val = String(r[primaryHeader] || '').trim();
          } else if (Array.isArray(r)) {
            val = String(r[0] || '').trim();
          }
          if (val && !seen.has(val.toLowerCase())) {
            seen.add(val.toLowerCase());
            navItems.push(val);
          }
        });
        if (navItems.length > 0) {
          if (cleanActive && !seen.has(cleanActive.toLowerCase())) {
            navItems.push(cleanActive);
          }
          return navItems;
        }
      }
    }

    const activeTable = this.db ? this.db.getTable(activeSheetKey) : null;
    const histTable = this.db ? this.db.getTable(activeSheetKey + '_history') : null;

    const items = [];
    const seen = new Set();

    const isItemHeader = (h, isHist) => {
      const hl = (h || '').toLowerCase().trim();
      if (isHist) return /^(item|serial)/i.test(hl);
      return (
        hl === 'glove' || hl === 'gloves' || hl === 'glove #' || hl === 'glove#' ||
        hl === 'sleeve' || hl === 'sleeves' || hl === 'sleeve #' || hl === 'sleeve#' ||
        hl === 'blanket' || hl === 'blankets' || hl === 'blanket #' || hl === 'blanket#' ||
        hl === 'mack' || hl === 'macks' || hl === 'mack #' || hl === 'mack#' ||
        hl === 'hvt #' || hl === 'hvt' || hl === 'hvt#' ||
        hl === 'phasing set' || hl === 'phasing set #' ||
        hl === 'aed' || hl === 'aed #' ||
        hl === 'serial #' || hl === 'serial#' || hl === 'serial' ||
        hl === 'item #' || hl === 'item#' || hl === 'item' || hl === 'items'
      );
    };

    const addFromTable = (t, isHist) => {
      if (!t || !t.rows || t.rows.length === 0) return;
      const headers = t.headers || [];
      let itemHeader = headers.find(h => isItemHeader(h, isHist));
      if (!itemHeader && headers.length > 0) {
        itemHeader = isHist && headers.length > 1 ? headers[1] : headers[0];
      }

      t.rows.forEach(r => {
        let val = '';
        if (itemHeader && r[itemHeader] !== undefined) {
          val = String(r[itemHeader] || '').trim();
        } else if (Array.isArray(r)) {
          val = String(r[isHist ? 1 : 0] || '').trim();
        } else {
          for (const k in r) {
            if (isItemHeader(k, isHist)) {
              val = String(r[k] || '').trim();
              if (val) break;
            }
          }
        }
        if (val && !seen.has(val.toLowerCase())) {
          seen.add(val.toLowerCase());
          items.push(val);
        }
      });
    };

    if (activeTable) addFromTable(activeTable, false);
    if (histTable) addFromTable(histTable, true);

    if (cleanActive && !seen.has(cleanActive.toLowerCase())) {
      items.push(cleanActive);
    }

    // Natural alphanumeric sorting (e.g. 1001, 1002 ... 1030, 1031, 1032 ...)
    items.sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));

    return items;
  }

  pageDossier(direction) {
    if (!this.currentSectionItems || this.currentSectionItems.length <= 1) {
      this.showPageTurnToast('No additional items in this section');
      return;
    }

    const newIdx = this.currentActiveItemIndex + direction;
    if (newIdx < 0) {
      this.showPageTurnToast('Reached first item in section', 'start');
      return;
    }
    if (newIdx >= this.currentSectionItems.length) {
      this.showPageTurnToast('Reached last item in section', 'end');
      return;
    }

    const nextItemKey = this.currentSectionItems[newIdx];
    const sheetKey = this.currentActiveSheetKey || 'gloves';

    const body = document.getElementById('item-lifecycle-modal-body');
    if (body) {
      const turnClass = direction > 0 ? 'dossier-turn-forward' : 'dossier-turn-backward';
      const enterClass = direction > 0 ? 'dossier-enter-forward' : 'dossier-enter-backward';

      body.classList.remove('dossier-turn-forward', 'dossier-turn-backward', 'dossier-enter-forward', 'dossier-enter-backward');
      body.classList.add(turnClass);

      setTimeout(() => {
        this.openDossierModal(nextItemKey, sheetKey, { direction });
        const newBody = document.getElementById('item-lifecycle-modal-body');
        if (newBody) {
          newBody.scrollTop = 0;
          newBody.classList.remove(turnClass);
          newBody.classList.add(enterClass);
          setTimeout(() => {
            newBody.classList.remove(enterClass);
          }, 240);
        }
      }, 120);
    } else {
      this.openDossierModal(nextItemKey, sheetKey);
    }
  }

  updateBookNavControls(cleanItemKey, sheetTitle) {
    const totalItems = this.currentSectionItems ? this.currentSectionItems.length : 0;
    const curIdx = this.currentActiveItemIndex;
    const pageNum = curIdx >= 0 ? curIdx + 1 : 1;

    const prevItemKey = (curIdx > 0 && this.currentSectionItems) ? this.currentSectionItems[curIdx - 1] : null;
    const nextItemKey = (curIdx < totalItems - 1 && this.currentSectionItems) ? this.currentSectionItems[curIdx + 1] : null;

    // Header Prev / Next Buttons
    const headerPrevBtn = document.getElementById('dossier-header-prev-btn');
    const headerPrevText = document.getElementById('dossier-header-prev-text');
    if (headerPrevBtn) {
      headerPrevBtn.disabled = !prevItemKey;
      if (headerPrevText) headerPrevText.textContent = prevItemKey ? `Prev (#${prevItemKey})` : 'Prev';
      headerPrevBtn.title = prevItemKey ? `Previous: #${prevItemKey} (Swipe Right or ← Arrow)` : 'Beginning of section';
    }

    const headerNextBtn = document.getElementById('dossier-header-next-btn');
    const headerNextText = document.getElementById('dossier-header-next-text');
    if (headerNextBtn) {
      headerNextBtn.disabled = !nextItemKey;
      if (headerNextText) headerNextText.textContent = nextItemKey ? `Next (#${nextItemKey})` : 'Next';
      headerNextBtn.title = nextItemKey ? `Next: #${nextItemKey} (Swipe Left or → Arrow)` : 'End of section';
    }

    // Header Page Counter Badge
    const pageCounterText = document.getElementById('dossier-page-counter-text');
    if (pageCounterText) {
      pageCounterText.textContent = totalItems > 1 ? `Item ${pageNum} of ${totalItems}` : `#${cleanItemKey}`;
    }

    // Floating Chevrons
    const floatPrev = document.getElementById('dossier-floating-prev');
    const tooltipPrev = document.getElementById('dossier-tooltip-prev');
    if (floatPrev) {
      floatPrev.disabled = !prevItemKey;
      if (tooltipPrev) tooltipPrev.textContent = prevItemKey ? `Prev (#${prevItemKey})` : 'Start';
    }

    const floatNext = document.getElementById('dossier-floating-next');
    const tooltipNext = document.getElementById('dossier-tooltip-next');
    if (floatNext) {
      floatNext.disabled = !nextItemKey;
      if (tooltipNext) tooltipNext.textContent = nextItemKey ? `Next (#${nextItemKey})` : 'End';
    }

    // Footer Prev / Next Buttons
    const footerPrevBtn = document.getElementById('dossier-footer-prev-btn');
    const footerPrevText = document.getElementById('dossier-footer-prev-text');
    if (footerPrevBtn) {
      footerPrevBtn.disabled = !prevItemKey;
      if (footerPrevText) footerPrevText.textContent = prevItemKey ? `Previous (#${prevItemKey})` : 'Previous';
    }

    const footerNextBtn = document.getElementById('dossier-footer-next-btn');
    const footerNextText = document.getElementById('dossier-footer-next-text');
    if (footerNextBtn) {
      footerNextBtn.disabled = !nextItemKey;
      if (footerNextText) footerNextText.textContent = nextItemKey ? `Next (#${nextItemKey})` : 'Next';
    }

    const footerPageText = document.getElementById('dossier-footer-page-text');
    if (footerPageText) {
      footerPageText.textContent = totalItems > 1 ? `Item ${pageNum} of ${totalItems} (${sheetTitle})` : `${sheetTitle} #${cleanItemKey}`;
    }
  }

  showPageTurnToast(msg, type) {
    const modalBox = document.querySelector('#item-lifecycle-modal .modal-box');
    if (!modalBox) return;

    const old = modalBox.querySelector('.dossier-turn-toast');
    if (old) old.remove();

    const toast = document.createElement('div');
    toast.className = 'dossier-turn-toast';
    toast.innerHTML = `<span>📖</span> <span>${this.escapeHtml(msg)}</span>`;
    if (type === 'start' || type === 'end') {
      toast.style.borderColor = 'rgba(245, 158, 11, 0.6)';
    }
    modalBox.appendChild(toast);
    setTimeout(() => { if (toast.parentNode) toast.remove(); }, 950);
  }

  promptJumpToItem() {
    if (!this.currentSectionItems || this.currentSectionItems.length <= 1) return;
    const total = this.currentSectionItems.length;
    const current = this.currentActiveItemKey;
    const input = prompt(`Jump to item number in this section (${total} items total):`, current || '');
    if (input && input.trim()) {
      const target = input.trim().toLowerCase();
      const targetNum = parseInt(target, 10);
      const match = this.currentSectionItems.find(k => 
        k.toLowerCase() === target || 
        (!isNaN(targetNum) && parseInt(k, 10) === targetNum)
      );
      if (match) {
        this.openDossierModal(match, this.currentActiveSheetKey);
      } else {
        alert(`Item #${input} was not found in this section.`);
      }
    }
  }

  /**
   * Retrieves history rows and active inventory row for an item with robust, consistent matching
   * and fallback baseline synthesis when no history rows exist yet.
   */
  getItemHistoryAndActive(sheetKey, itemKey) {
    const histKey = sheetKey.endsWith('_history') ? sheetKey : `${sheetKey}_history`;
    const histTable = this.db ? this.db.getTable(histKey) : null;
    const activeKey = histKey.replace('_history', '');
    const activeTable = this.db ? this.db.getTable(activeKey) : null;
    const cleanItemKey = String(itemKey || '').trim();

    const numKey = parseInt(cleanItemKey, 10);
    const isPureNumKey = !isNaN(numKey) && String(numKey) === cleanItemKey;

    const rows = histTable ? (histTable.rows || []) : [];

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
            if (isPureNumKey) {
              const rNum = parseInt(val, 10);
              if (!isNaN(rNum) && String(rNum) === val && rNum === numKey) return true;
            }
          }
        }
        return false;
      });
    }

    if (foundActive && groupRows.length === 0) {
      const activeStatus = String(foundActive['Status'] || '').trim().toLowerCase();
      const activeNotes = String(foundActive['Notes'] || '').trim();
      const hasOriginNote = activeNotes.toLowerCase().includes('new purchase') ||
                            activeNotes.toLowerCase().includes('failed pair') ||
                            activeNotes.toLowerCase().includes('item found') ||
                            activeNotes.toLowerCase().includes('initial purchase');

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
          'Notes': activeNotes,
          _isSynthesized: true
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
          'Notes': (foundActive['Status'] === 'Failed Rubber' ? 'Failed Rubber' : (foundActive['Status'] === 'Lost' ? 'Lost' : '')),
          _isSynthesized: true
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
          'Notes': activeNotes || 'Current Active Inventory Status',
          _isSynthesized: true
        });
      }
    }

    const stats = this.analyzeLifecycle(cleanItemKey, groupRows, foundActive);

    return {
      histKey,
      histTable,
      activeKey,
      activeTable,
      cleanItemKey,
      groupRows,
      foundActive,
      stats
    };
  }

  openDossierModal(itemKey, sheetKey, options = {}) {
    const modal = document.getElementById('item-lifecycle-modal');
    const body = document.getElementById('item-lifecycle-modal-body');
    const titleEl = document.getElementById('item-lifecycle-modal-title');
    if (!modal || !body) return;

    this.initBookPagingListeners();

    const cleanItemKey = String(itemKey || '').trim();
    this.currentActiveItemKey = cleanItemKey;
    this.currentActiveSheetKey = sheetKey;

    // Build ordered list of items for this equipment section
    this.currentSectionItems = this.getSectionItemList(sheetKey, cleanItemKey);
    const numKey = parseInt(cleanItemKey, 10);

    this.currentActiveItemIndex = this.currentSectionItems.findIndex(k => {
      if (k.toLowerCase() === cleanItemKey.toLowerCase()) return true;
      const kNum = parseInt(k, 10);
      return !isNaN(numKey) && !isNaN(kNum) && numKey === kNum;
    });
    if (this.currentActiveItemIndex === -1 && this.currentSectionItems.length > 0) {
      this.currentActiveItemIndex = 0;
    }

    const { histKey, activeKey, activeTable, groupRows, foundActive, stats } = this.getItemHistoryAndActive(sheetKey, cleanItemKey);
    const activeSheetKey = activeKey;
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
      this.updateBookNavControls(cleanItemKey, sheetTitle);
      modal.classList.add('active');
      return;
    }

    // Detect duplicate history entries for this item (same assigned to & date assigned)
    let dupesCount = 0;
    const seenMap = new Set();
    for (const r of groupRows) {
      const d = String(r['Date Assigned'] || r['Date'] || Object.values(r)[0] || '').trim();
      const a = String(r['Assigned To'] || r['Employee Name'] || '').trim();
      const canA = this.getCanonicalEmployeeName(a).toLowerCase();
      const k = `${d}::${canA}`;
      if (seenMap.has(k)) {
        dupesCount++;
      } else {
        seenMap.add(k);
      }
    }

    const cleanDupesBtn = document.getElementById('dossier-clean-dupes-btn');
    if (cleanDupesBtn) {
      if (dupesCount > 0) {
        cleanDupesBtn.style.display = 'inline-flex';
        cleanDupesBtn.innerHTML = `<span>🧹</span> Clean Duplicates (${dupesCount})`;
        cleanDupesBtn.title = `Remove ${dupesCount} duplicate history ${dupesCount === 1 ? 'record' : 'records'} for #${cleanItemKey} (same holder & date)`;
      } else {
        cleanDupesBtn.style.display = 'inline-flex';
        cleanDupesBtn.innerHTML = `<span>🧹</span> Clean Duplicates`;
        cleanDupesBtn.title = `No duplicate history records found for #${cleanItemKey}`;
      }
    }

    const firstRow = groupRows[0] || {};
    let metaChips = [];
    const metaOrder = ['size', 'class', 'type', 'kv', 'model', 'length'];
    metaOrder.forEach(f => {
      let val = '';
      let displayKey = f.charAt(0).toUpperCase() + f.slice(1);

      // Check foundActive first (current active record is most authoritative for size/class)
      if (foundActive) {
        for (const k of Object.keys(foundActive)) {
          if (k.toLowerCase() === f) {
            const v = foundActive[k];
            if (v !== undefined && v !== null && String(v).trim() !== '') {
              val = String(v).trim();
              displayKey = k;
              break;
            }
          }
        }
      }

      // If not found in active, fallback to firstRow from history
      if (!val && firstRow) {
        for (const k of Object.keys(firstRow)) {
          if (k.toLowerCase() === f) {
            const v = firstRow[k];
            if (v !== undefined && v !== null && String(v).trim() !== '') {
              val = String(v).trim();
              displayKey = k;
              break;
            }
          }
        }
      }

      if (val !== '') {
        metaChips.push(`<span class="brand-badge" style="font-size: 11px;">${displayKey}: ${this.escapeHtml(val)}</span>`);
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

        ${(() => {
          const latestM = (stats.milestones && stats.milestones.length > 0) ? stats.milestones[stats.milestones.length - 1] : null;
          if (!latestM) return '';

          // Normalize shelf/storage states: Brand New on shelf, In Stock, and On Shelf are all the same physical shelf status
          const isHistShelf = latestM.state.key === 'SHELF' || latestM.state.key === 'NEW_PURCHASE' ||
            ['on shelf', 'shelf', 'in stock', 'storage', 'unassigned', 'new (purchased)', 'new', 'brand new (on shelf)'].includes((latestM.assignedTo || '').toLowerCase());
          const isActiveShelf = curStatus.toLowerCase() === 'on shelf' || curAssignedTo.toLowerCase() === 'on shelf' || !curAssignedTo;

          // If both history and active sheet show the item is On Shelf / In Stock, there is NO discrepancy
          if (isHistShelf && isActiveShelf) return '';

          // Normalize in-testing states
          const isHistTesting = latestM.state.key === 'TESTING' || ['in testing', 'arnett', 'jm test', 'arnett / jm test', 'lab', 'testing', 'ready for test'].includes((latestM.assignedTo || '').toLowerCase());
          const isActiveTesting = ['in testing', 'ready for test'].includes(curStatus.toLowerCase()) || ['in testing', 'ready for test'].includes(curAssignedTo.toLowerCase());
          if (isHistTesting && isActiveTesting) return '';

          // Normalize packed delivery states
          const isHistDelivery = latestM.state.key === 'PACKED_DELIVERY' || ['packed for delivery', 'ready for delivery'].includes((latestM.assignedTo || '').toLowerCase());
          const isActiveDelivery = ['packed for delivery', 'ready for delivery'].includes(curStatus.toLowerCase()) || ['packed for delivery', 'ready for delivery'].includes(curAssignedTo.toLowerCase());
          if (isHistDelivery && isActiveDelivery) return '';

          const hasDisc = (
            (latestM.assignedTo && latestM.assignedTo.toLowerCase() !== curAssignedTo.toLowerCase()) ||
            (latestM.state.key === 'FIELD' && curStatus.toLowerCase() === 'on shelf')
          );
          if (!hasDisc) return '';
          return `
            <div style="background: rgba(245, 158, 11, 0.15); border: 1px solid rgba(245, 158, 11, 0.4); border-radius: 8px; padding: 10px 14px; margin-bottom: 14px; display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-wrap: wrap;">
              <div style="font-size: 12px; color: #fbbf24; max-width: 600px;">
                <strong>⚠️ Active Record Discrepancy:</strong> History records show this item is currently assigned to <strong>${this.escapeHtml(latestM.assignedTo)}</strong> (${this.escapeHtml(latestM.location || 'Unknown')}), but Active Sheet has <strong>${this.escapeHtml(curAssignedTo)}</strong> (${this.escapeHtml(curStatus)}).
              </div>
              <div style="display: inline-flex; gap: 8px; align-items: center; flex-wrap: wrap;">
                <button class="btn btn-sm" style="font-size: 11px; font-weight: 700; background: #10b981; color: #ffffff; border: none; border-radius: 6px; padding: 6px 14px; cursor: pointer; display: inline-flex; align-items: center; gap: 5px;" onclick="window.itemStatsEngine.recordActiveToHistory('${this.escapeHtml(sheetKey)}', '${this.escapeHtml(cleanItemKey)}')">
                  ⚡ Record Active Status to History
                </button>
                <button class="btn btn-sm" style="font-size: 11px; font-weight: 700; background: #f59e0b; color: #1e293b; border: none; border-radius: 6px; padding: 6px 14px; cursor: pointer; display: inline-flex; align-items: center; gap: 5px;" onclick="window.itemStatsEngine.syncActiveFromHistory('${this.escapeHtml(sheetKey)}', '${this.escapeHtml(cleanItemKey)}')">
                  ⚡ Sync Active From History
                </button>
              </div>
            </div>
          `;
        })()}

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
              <select id="dossier-edit-status" class="form-control" onchange="window.itemStatsEngine.handleDossierStatusChange(this.value)">
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
              <input type="text" id="dossier-edit-assigned-to" list="new-item-employees-datalist" class="form-control" value="${this.escapeHtml(curAssignedTo)}" oninput="window.itemStatsEngine.handleDossierAssignedToInput(this.value)">
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
          ${stats.milestones.some(m => m.isFutureDate) ? `
            <div style="background: rgba(239, 68, 68, 0.12); border: 1px solid rgba(239, 68, 68, 0.35); border-radius: 8px; padding: 10px 14px; margin-bottom: 14px; display: flex; align-items: center; gap: 10px;">
              <span style="font-size: 18px;">⚠️</span>
              <div style="font-size: 12px; color: #fca5a5; line-height: 1.4;">
                <strong>Future Date Anomaly Detected:</strong> This item has history entries dated far in the future (e.g. 2032). Click <strong>🗑️ Delete</strong> on the future card(s) below to remove them, or <strong>✏️ Edit</strong> to correct the year.
              </div>
            </div>
          ` : ''}
          ${dupesCount > 0 ? `
            <div style="background: rgba(245, 158, 11, 0.12); border: 1px solid rgba(245, 158, 11, 0.4); border-radius: 8px; padding: 10px 14px; margin-bottom: 14px; display: flex; align-items: center; justify-content: space-between; gap: 10px;">
              <div style="display: flex; align-items: center; gap: 8px;">
                <span style="font-size: 18px;">🧹</span>
                <div style="font-size: 12px; color: #fcd34d; line-height: 1.4;">
                  <strong>Duplicate History Records Detected (${dupesCount}):</strong> This item has ${dupesCount} redundant ${dupesCount === 1 ? 'entry' : 'entries'} for the same holder on the same date logging 0 days.
                </div>
              </div>
              <button class="btn btn-secondary" style="padding: 4px 10px; font-size: 11px; font-weight: 700; color: #fbbf24; border-color: rgba(245, 158, 11, 0.5); background: rgba(245, 158, 11, 0.18); cursor: pointer; white-space: nowrap;" onclick="window.itemStatsEngine.cleanCurrentItemDuplicates()">
                🧹 Clean Duplicates
              </button>
            </div>
          ` : ''}
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
                ${m.isFutureDate ? `<span class="brand-badge" style="background: rgba(239, 68, 68, 0.25); color: #f87171; border: 1px solid rgba(239, 68, 68, 0.4); font-size: 10px; font-weight: 700;">⚠️ Future Date (${m.startDateFormatted})</span>` : ''}
                ${isPurchaseOrigin ? `<span class="brand-badge" style="background: rgba(16, 185, 129, 0.2); color: #34d399; font-size: 10px; font-weight: 700;">✨ Lifecycle Origin (Purchased New)</span>` : ''}
                ${isOrigin && !stats.hasKnownPurchaseDate ? `<span class="brand-badge" style="background: rgba(245, 158, 11, 0.2); color: #fbbf24; font-size: 10px;">⏳ Tracking Baseline (Purchase Unknown)</span>` : ''}
              </div>
              <div style="display: flex; align-items: center; gap: 6px;">
                <span style="font-size: 11px; font-weight: 600; color: #60a5fa; margin-right: 2px;">${m.durationFormatted}</span>
                <button class="btn btn-sm" title="Edit date or details for this history record" style="padding: 2px 8px; font-size: 11px; background: rgba(59, 130, 246, 0.15); color: #60a5fa; border: 1px solid rgba(59, 130, 246, 0.35); border-radius: 4px; cursor: pointer; display: inline-flex; align-items: center; gap: 4px;" onclick="window.itemStatsEngine.openEditMilestoneModal('${this.escapeHtml(sheetKey)}', '${this.escapeHtml(cleanItemKey)}', ${reversedMilestones.length - 1 - mIdx})">
                  ✏️ Edit
                </button>
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
            <button class="btn btn-secondary" style="font-size: 12px; display: inline-flex; align-items: center; gap: 5px; cursor: pointer; ${dupesCount > 0 ? 'color: #fbbf24; border-color: rgba(245, 158, 11, 0.4); background: rgba(245, 158, 11, 0.1);' : ''}" onclick="window.itemStatsEngine.cleanCurrentItemDuplicates()" title="${dupesCount > 0 ? `Remove ${dupesCount} duplicate entries for #${this.escapeHtml(cleanItemKey)}` : 'Scan and clean duplicate entries'}">
              <span>🧹</span> Clean Duplicates${dupesCount > 0 ? ` (${dupesCount})` : ''}
            </button>
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
    this.updateBookNavControls(cleanItemKey, sheetTitle);

    if (options && options.direction) {
      this.showPageTurnToast(`${sheetTitle} #${cleanItemKey} (${this.currentActiveItemIndex + 1} of ${this.currentSectionItems.length})`);
    }
  }

  closeDossierModal() {
    const modal = document.getElementById('item-lifecycle-modal');
    if (modal) modal.classList.remove('active');
    const body = document.getElementById('item-lifecycle-modal-body');
    if (body) {
      body.classList.remove('dossier-turn-forward', 'dossier-turn-backward', 'dossier-enter-forward', 'dossier-enter-backward');
    }
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

    const currentItemAssignedTo = foundInv ? String(foundInv['Assigned To'] || foundInv['Holder'] || '').trim() : '';

    lines.forEach(line => {
      line = line.trim();
      if (!line) return;

      const dateMatch = line.match(/^(\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}|\d{4}[/.-]\d{1,2}[/.-]\d{1,2})\s*[-–—:]\s*(.+)$/);
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

      if (window.employeeResolver) {
        const res = window.employeeResolver.resolve(rawTarget, currentItemAssignedTo);
        if (res.match) {
          if (res.isStatus) {
            assignedTo = res.status;
            location = res.location || 'Helena';
            notes = res.notes || res.status;
          } else {
            assignedTo = res.employeeName;
            location = res.location || 'Helena';
            notes = 'Assigned to ' + res.employeeName;
          }
        } else {
          assignedTo = rawTarget;
          location = 'Helena';
          notes = 'Assigned';
        }
      } else {
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

    if (window.showToast) {
      window.showToast(`Imported ${addedCount} history entries for Item #${itemNum}.`);
    }

    // Re-render open Dossier modal
    this.openDossierModal(itemNum, sheetKey);
  }

  /**
   * Deletes a single history milestone event from a dossier view
   */
  async deleteMilestoneRecord(sheetKey, itemKey, milestoneIdx) {
    const { histKey, histTable, cleanItemKey, stats } = this.getItemHistoryAndActive(sheetKey, itemKey);
    if (!histTable || !histTable.rows) return;
    if (!stats || !stats.milestones || !stats.milestones[milestoneIdx]) return;

    const m = stats.milestones[milestoneIdx];
    const confirmMsg = `🗑️ Delete History Record?\n\n• Item: #${cleanItemKey}\n• Date: ${m.startDateFormatted}\n• Status / Holder: ${m.assignedTo || m.state.label}\n• Notes: ${m.notes || 'None'}\n\nAre you sure you want to permanently delete this entry?`;
    
    if (!confirm(confirmMsg)) return;

    if (m.rawRow && !m.rawRow._isSynthesized) {
      await this.db.deleteHistoryRow(histKey, m.rawRow);
    } else {
      await this.db.deleteHistoryRow(histKey, r => {
        const d = String(r['Date Assigned'] || r['Date'] || Object.values(r)[0] || '').trim();
        const a = String(r['Assigned To'] || r['Employee Name'] || '').trim();
        return d === m.startDateFormatted && a === m.assignedTo;
      });
    }

    // Refresh UI
    this.openDossierModal(cleanItemKey, histKey);
    if (window.historyNavigator) {
      window.historyNavigator.renderCurrentHistory();
    }
  }

  /**
   * Cleans duplicate history records for the currently viewed item in the dossier
   */
  async cleanCurrentItemDuplicates() {
    const cleanItemKey = this.currentActiveItemKey;
    const sheetKey = this.currentActiveSheetKey || 'gloves_history';
    if (!cleanItemKey || !this.db) return;

    const histKey = sheetKey.endsWith('_history') ? sheetKey : `${sheetKey}_history`;
    const res = await this.db.cleanDuplicateHistoryRows(histKey, cleanItemKey);

    if (res.removedCount > 0) {
      if (window.inventoryManager && typeof window.inventoryManager.showToast === 'function') {
        window.inventoryManager.showToast(`✅ Cleaned ${res.removedCount} duplicate history ${res.removedCount === 1 ? 'record' : 'records'} for #${cleanItemKey}!`);
      } else if (window.showToast) {
        window.showToast(`✅ Cleaned ${res.removedCount} duplicate history ${res.removedCount === 1 ? 'record' : 'records'} for #${cleanItemKey}!`);
      }
      this.openDossierModal(cleanItemKey, sheetKey);
      if (window.historyNavigator) {
        window.historyNavigator.renderCurrentHistory();
      }
    } else {
      if (window.inventoryManager && typeof window.inventoryManager.showToast === 'function') {
        window.inventoryManager.showToast(`ℹ️ No duplicate history records found for #${cleanItemKey}.`);
      } else if (window.showToast) {
        window.showToast(`ℹ️ No duplicate history records found for #${cleanItemKey}.`);
      }
    }
  }

  openEditMilestoneModal(sheetKey, itemKey, milestoneIdx) {
    const { histKey, histTable, activeKey, activeTable, cleanItemKey, stats } = this.getItemHistoryAndActive(sheetKey, itemKey);
    if (!histTable || !histTable.rows) return;
    if (!stats || !stats.milestones || !stats.milestones[milestoneIdx]) return;

    const m = stats.milestones[milestoneIdx];
    this.currentEditingMilestone = {
      sheetKey: histKey,
      activeSheetKey: activeKey,
      itemKey: cleanItemKey,
      milestoneIdx: milestoneIdx,
      milestone: m,
      rawRow: m.rawRow
    };

    const modal = document.getElementById('edit-milestone-modal');
    if (!modal) return;

    const titleEl = document.getElementById('edit-milestone-title');
    if (titleEl) {
      titleEl.innerHTML = `<span>✏️</span> Edit History Record — #${cleanItemKey}`;
    }

    const badgeEl = document.getElementById('edit-milestone-stage-badge');
    if (badgeEl) {
      badgeEl.innerHTML = `<span style="display: inline-flex; align-items: center; gap: 4px; padding: 4px 10px; border-radius: 6px; background-color: ${m.state.color}22; color: ${m.state.color}; border: 1px solid ${m.state.color}55; font-size: 11.5px; font-weight: 700;">${m.state.icon} ${m.state.label} ${m.isCurrent ? '• Current State' : ''}</span>`;
    }

    const toIso = (d) => {
      if (!d) return '';
      if (typeof d === 'string') {
        if (/^\d{4}-\d{2}-\d{2}$/.test(d)) return d;
        if (d.includes('/')) {
          const p = d.split('/');
          if (p.length === 3) {
            const mm = String(parseInt(p[0], 10)).padStart(2, '0');
            const dd = String(parseInt(p[1], 10)).padStart(2, '0');
            let y = parseInt(p[2], 10);
            if (y < 100) y = 2000 + y;
            return `${y}-${mm}-${dd}`;
          }
        }
        const dt = new Date(d);
        if (!isNaN(dt.getTime())) return dt.toISOString().split('T')[0];
      } else if (d instanceof Date && !isNaN(d.getTime())) {
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const dd = String(d.getDate()).padStart(2, '0');
        return `${d.getFullYear()}-${mm}-${dd}`;
      }
      return '';
    };

    const dateInput = document.getElementById('edit-milestone-date');
    const assignedInput = document.getElementById('edit-milestone-assigned');
    const locationInput = document.getElementById('edit-milestone-location');
    const notesInput = document.getElementById('edit-milestone-notes');
    const syncActiveContainer = document.getElementById('edit-milestone-sync-active-container');
    const syncActiveCheck = document.getElementById('edit-milestone-sync-active-check');

    if (dateInput) dateInput.value = toIso(m.startDate);
    if (assignedInput) assignedInput.value = m.assignedTo || '';
    if (locationInput) locationInput.value = m.location || 'Helena';
    if (notesInput) notesInput.value = m.notes || '';

    if (syncActiveContainer) {
      syncActiveContainer.style.display = m.isCurrent ? 'block' : 'none';
      if (syncActiveCheck) syncActiveCheck.checked = true;
    }

    modal.onclick = (e) => {
      if (e.target === modal) this.closeEditMilestoneModal();
    };

    modal.classList.add('active');
    modal.style.display = 'flex';
  }

  closeEditMilestoneModal() {
    const modal = document.getElementById('edit-milestone-modal');
    if (modal) {
      modal.classList.remove('active');
      modal.style.display = 'none';
      modal.onclick = null;
    }
    this.currentEditingMilestone = null;
  }

  async saveMilestoneEdit() {
    if (!this.currentEditingMilestone) return;
    const { sheetKey, activeSheetKey, itemKey, milestone, rawRow } = this.currentEditingMilestone;

    const dateInput = document.getElementById('edit-milestone-date');
    const assignedInput = document.getElementById('edit-milestone-assigned');
    const locationInput = document.getElementById('edit-milestone-location');
    const notesInput = document.getElementById('edit-milestone-notes');
    const syncActiveCheck = document.getElementById('edit-milestone-sync-active-check');

    const isoDate = dateInput ? dateInput.value.trim() : '';
    if (!isoDate) {
      alert('Please enter a valid Date.');
      return;
    }

    let dateFormatted = isoDate;
    if (isoDate.includes('-')) {
      const p = isoDate.split('-');
      if (p.length === 3) dateFormatted = `${p[1]}/${p[2]}/${p[0]}`;
    }

    const assignedTo = assignedInput ? assignedInput.value.trim() : (milestone.assignedTo || '');
    let location = locationInput ? locationInput.value.trim() : (milestone.location || 'Helena');
    const notes = notesInput ? notesInput.value.trim() : (milestone.notes || '');
    const shouldSyncActive = syncActiveCheck ? syncActiveCheck.checked : false;

    // Determine coordinated status & location if assignedTo is a standard state
    const assignedLower = assignedTo.toLowerCase();
    let coordinatedStatus = '';
    if (assignedLower === 'in testing' || assignedLower === 'testing' || assignedLower === 'lab' || assignedLower === 'arnett' || assignedLower === 'jm test' || assignedLower === 'arnett / jm test') {
      coordinatedStatus = 'In Testing';
      if (!location || location === 'Helena' || location === "Cody's Truck" || location === 'Belgrade') {
        location = 'Arnett / JM Test';
      }
    } else if (assignedLower === 'on shelf' || assignedLower === 'shelf') {
      coordinatedStatus = 'On Shelf';
      if (!location || location === "Cody's Truck" || location === 'Arnett / JM Test') {
        location = 'Helena';
      }
    } else if (assignedLower === 'packed for testing' || assignedLower === 'ready for test') {
      coordinatedStatus = 'Ready For Test';
      location = "Cody's Truck";
    } else if (assignedLower === 'packed for delivery' || assignedLower === 'ready for delivery') {
      coordinatedStatus = 'Ready For Delivery';
      location = "Cody's Truck";
    } else if (assignedLower === 'failed rubber' || assignedLower === 'failed' || assignedLower === 'destroyed') {
      coordinatedStatus = 'Failed Rubber';
      location = 'Destroyed';
    } else if (assignedLower === 'lost' || assignedLower === 'missing') {
      coordinatedStatus = 'Lost';
      location = 'Lost';
    } else {
      const nonEmpHolders = ['new', 'unassigned', 'n/a', '—', '-'];
      if (!nonEmpHolders.includes(assignedLower)) {
        coordinatedStatus = 'Assigned';
        const empTable = this.db ? this.db.getTable('employees') : (window.localDB ? window.localDB.getTable('employees') : null);
        if (empTable && empTable.rows) {
          const empMatch = empTable.rows.find(e => String(e['Name'] || e['Employee Name'] || Object.values(e)[0] || '').trim().toLowerCase() === assignedLower);
          if (empMatch) {
            const rawLoc = String(empMatch['Location'] || '').trim();
            const cleanLoc = (window.getPhysicalLocation ? window.getPhysicalLocation(rawLoc) : rawLoc) || 'Helena';
            location = cleanLoc;
          }
        }
      }
    }

    // Update history table row using db.updateHistoryRow
    const updatedFields = {
      'Date Assigned': dateFormatted,
      'Assigned To': assignedTo,
      'Location': location,
      'Notes': notes
    };

    let historyUpdated = false;
    if (rawRow && !rawRow._isSynthesized) {
      historyUpdated = await this.db.updateHistoryRow(sheetKey, rawRow, updatedFields);
    } else {
      historyUpdated = await this.db.updateHistoryRow(sheetKey, r => {
        const d = String(r['Date Assigned'] || r['Date'] || Object.values(r)[0] || '').trim();
        const a = String(r['Assigned To'] || r['Employee Name'] || '').trim();
        const itemVal = String(r['Item #'] || r['Item'] || r['Serial #'] || r['Glove'] || r['Sleeve'] || r['Blanket'] || '').trim();
        return (itemVal ? itemVal.toLowerCase() === itemKey.toLowerCase() : true) && d === milestone.startDateFormatted && a === milestone.assignedTo;
      }, updatedFields);
    }

    // If rawRow was synthesized from active inventory baseline or not found in history table, insert as a real history record now:
    if (!historyUpdated) {
      const activeTable = this.db.getTable(activeSheetKey);
      const activeRow = activeTable?.rows?.find(r => {
        const id = String(r['Serial #'] || r['Item #'] || r['Glove'] || r['Sleeve'] || r['Blanket'] || r['MACK'] || Object.values(r)[0] || '').trim();
        return id.toLowerCase() === itemKey.toLowerCase();
      });
      await this.db.recordItemHistoryEvent(
        activeTable ? activeTable.name : activeSheetKey,
        {
          ...(activeRow || {}),
          'Date Assigned': dateFormatted,
          'Assigned To': assignedTo,
          'Location': location,
          'Notes': notes
        },
        notes || `History milestone updated: ${assignedTo}`
      );
    }

    // If this is the current state and should sync with active sheet
    if (milestone.isCurrent && shouldSyncActive) {
      const activeTable = this.db.getTable(activeSheetKey);
      if (activeTable && activeTable.rows) {
        const numKey = parseInt(itemKey, 10);
        const isPureNumKey = !isNaN(numKey) && String(numKey) === itemKey;

        const activeRow = activeTable.rows.find(r => {
          for (const k of Object.keys(r)) {
            const kl = k.toLowerCase();
            if (kl.includes('item') || kl.includes('serial') || kl.includes('glove') || kl.includes('sleeve') || kl.includes('blanket') || kl.includes('mack')) {
              const val = String(r[k] || '').trim();
              if (val.toLowerCase() === itemKey.toLowerCase()) return true;
              if (isPureNumKey) {
                const rNum = parseInt(val, 10);
                if (!isNaN(rNum) && String(rNum) === val && rNum === numKey) return true;
              }
            }
          }
          return false;
        });

        if (activeRow) {
          const dateAssignedCol = (activeTable.headers || []).find(h => /date\s*assigned/i.test(h));
          const assignedToCol = (activeTable.headers || []).find(h => /assigned\s*to|^assigned$|^holder$/i.test(h));
          const locationCol = (activeTable.headers || []).find(h => /^location$/i.test(h));
          const statusCol = (activeTable.headers || []).find(h => /^status$|^item\s*status$/i.test(h));
          const pickedCol = (activeTable.headers || []).find(h => /^picked\s*for$/i.test(h));
          const chgOutCol = (activeTable.headers || []).find(h => /change\s*out/i.test(h));

          const oldVals = {
            dateAssigned: dateAssignedCol ? activeRow[dateAssignedCol] : undefined,
            assignedTo: assignedToCol ? activeRow[assignedToCol] : undefined,
            location: locationCol ? activeRow[locationCol] : undefined,
            status: statusCol ? activeRow[statusCol] : undefined,
            pickedFor: pickedCol ? activeRow[pickedCol] : undefined,
            chgOut: chgOutCol ? activeRow[chgOutCol] : undefined
          };

          if (dateAssignedCol) activeRow[dateAssignedCol] = dateFormatted;
          if (assignedToCol) activeRow[assignedToCol] = assignedTo;
          if (locationCol) activeRow[locationCol] = location;
          if (statusCol && coordinatedStatus) activeRow[statusCol] = coordinatedStatus;
          if (pickedCol && ['in testing', 'on shelf', 'failed rubber', 'lost', 'ready for test'].includes(assignedLower)) {
            activeRow[pickedCol] = '';
          }

          // Recalculate Change Out Date
          let calculatedChgOut = '';
          if (coordinatedStatus === 'Failed Rubber' || coordinatedStatus === 'Lost') {
            calculatedChgOut = 'N/A';
          } else if (window.inventoryManager && typeof window.inventoryManager.calculateChangeOutDate === 'function') {
            const testD = activeRow['Test Date'] || activeRow['Calibration Date'] || '';
            calculatedChgOut = window.inventoryManager.calculateChangeOutDate(
              dateFormatted || testD,
              location,
              assignedTo,
              activeSheetKey,
              { testDate: testD, calibrationDate: testD }
            );
          }
          if (calculatedChgOut && chgOutCol) {
            activeRow[chgOutCol] = calculatedChgOut;
          }

          // Update activeTable rawGrid & queue mutations
          const rIdx = activeRow._rowIdx || (activeTable.rows.indexOf(activeRow) !== -1 ? activeTable.rows.indexOf(activeRow) + 2 : null);
          if (rIdx && activeTable.rawGrid && activeTable.rawGrid[rIdx - 1]) {
            const gRow = activeTable.rawGrid[rIdx - 1];
            (activeTable.headers || []).forEach((h, cIdx) => {
              if (activeRow[h] !== undefined) gRow[cIdx] = activeRow[h];
            });
          }

          const queueCell = async (hName, val, oldVal) => {
            if (!hName || val === undefined) return;
            const cIdx = (activeTable.headers || []).indexOf(hName);
            if (cIdx !== -1 && rIdx) {
              await this.db.addMutation({
                action: 'UPDATE_CELL',
                sheetName: activeTable.name || activeSheetKey,
                row: rIdx,
                col: cIdx + 1,
                header: hName,
                itemIdentifier: itemKey,
                oldValue: oldVal,
                value: val,
                skipHistory: true // Prevent duplicate history unshift since history row is already updated above
              });
            }
          };

          if (dateAssignedCol) await queueCell(dateAssignedCol, dateFormatted, oldVals.dateAssigned);
          if (assignedToCol) await queueCell(assignedToCol, assignedTo, oldVals.assignedTo);
          if (locationCol) await queueCell(locationCol, location, oldVals.location);
          if (statusCol && coordinatedStatus) await queueCell(statusCol, coordinatedStatus, oldVals.status);
          if (pickedCol && ['in testing', 'on shelf', 'failed rubber', 'lost', 'ready for test'].includes(assignedLower)) {
            await queueCell(pickedCol, '', oldVals.pickedFor);
          }
          if (calculatedChgOut && chgOutCol) await queueCell(chgOutCol, calculatedChgOut, oldVals.chgOut);
        }
      }
    }

    // Persist snapshot to storage
    if (this.db && this.db.snapshot) {
      await this.db.setSnapshot(this.db.snapshot);
    }

    this.closeEditMilestoneModal();

    // Re-open dossier to recalculate all stats & display updated timeline
    this.openDossierModal(itemKey, sheetKey);

    if (window.sheetNavigator) {
      window.sheetNavigator.renderActiveView();
    }
    if (window.historyNavigator) {
      window.historyNavigator.renderCurrentHistory();
    }

    if (window.inventoryManager && typeof window.inventoryManager.showToast === 'function') {
      window.inventoryManager.showToast(`✅ Successfully updated history record for #${itemKey}!`);
    } else {
      alert(`✅ Successfully updated history record for #${itemKey}!`);
    }
  }

  /**
   * Auto-adjusts assigned to, location, and date assigned when a status is selected in the Dossier
   */
  handleDossierStatusChange(val) {
    const trimmed = String(val || '').trim();
    if (!trimmed) return;
    const lower = trimmed.toLowerCase();
    const assignedEl = document.getElementById('dossier-edit-assigned-to');
    const locEl = document.getElementById('dossier-edit-location');
    const dateEl = document.getElementById('dossier-edit-date-assigned');
    const todayIso = new Date().toISOString().split('T')[0];

    if (lower === 'in testing') {
      if (assignedEl) assignedEl.value = 'In Testing';
      if (locEl) locEl.value = 'Arnett / JM Test';
      if (dateEl) dateEl.value = todayIso;
    } else if (lower === 'on shelf') {
      if (assignedEl) assignedEl.value = 'On Shelf';
      if (locEl) locEl.value = 'Helena';
      if (dateEl) dateEl.value = todayIso;
    } else if (lower === 'ready for test') {
      if (assignedEl) assignedEl.value = 'Packed For Testing';
      if (locEl) locEl.value = "Cody's Truck";
      if (dateEl) dateEl.value = todayIso;
    } else if (lower === 'ready for delivery') {
      if (assignedEl) assignedEl.value = 'Packed For Delivery';
      if (locEl) locEl.value = "Cody's Truck";
      if (dateEl) dateEl.value = todayIso;
    } else if (lower === 'failed rubber') {
      if (assignedEl) assignedEl.value = 'Failed Rubber';
      if (locEl) locEl.value = 'Destroyed';
      if (dateEl) dateEl.value = todayIso;
    } else if (lower === 'lost') {
      if (assignedEl) assignedEl.value = 'Lost';
      if (locEl) locEl.value = 'Lost';
      if (dateEl) dateEl.value = todayIso;
    }
  }

  /**
   * Auto-adjusts status, location, and date assigned when an employee name or status is entered in the Dossier
   */
  handleDossierAssignedToInput(val) {
    const trimmed = String(val || '').trim();
    if (!trimmed) return;
    const lower = trimmed.toLowerCase();
    const statEl = document.getElementById('dossier-edit-status');
    const locEl = document.getElementById('dossier-edit-location');
    const dateEl = document.getElementById('dossier-edit-date-assigned');
    const todayIso = new Date().toISOString().split('T')[0];

    if (lower === 'in testing' || lower === 'testing' || lower === 'lab' || lower === 'arnett' || lower === 'jm test' || lower === 'arnett / jm test') {
      if (statEl) statEl.value = 'In Testing';
      if (locEl) locEl.value = 'Arnett / JM Test';
      if (dateEl) dateEl.value = todayIso;
      return;
    }
    if (lower === 'on shelf' || lower === 'shelf') {
      if (statEl) statEl.value = 'On Shelf';
      if (locEl) locEl.value = 'Helena';
      if (dateEl) dateEl.value = todayIso;
      return;
    }
    if (lower === 'packed for testing' || lower === 'ready for test') {
      if (statEl) statEl.value = 'Ready For Test';
      if (locEl) locEl.value = "Cody's Truck";
      if (dateEl) dateEl.value = todayIso;
      return;
    }
    if (lower === 'packed for delivery' || lower === 'ready for delivery') {
      if (statEl) statEl.value = 'Ready For Delivery';
      if (locEl) locEl.value = "Cody's Truck";
      if (dateEl) dateEl.value = todayIso;
      return;
    }
    if (lower === 'failed rubber' || lower === 'failed' || lower === 'destroyed') {
      if (statEl) statEl.value = 'Failed Rubber';
      if (locEl) locEl.value = 'Destroyed';
      if (dateEl) dateEl.value = todayIso;
      return;
    }
    if (lower === 'lost' || lower === 'missing') {
      if (statEl) statEl.value = 'Lost';
      if (locEl) locEl.value = 'Lost';
      if (dateEl) dateEl.value = todayIso;
      return;
    }

    const nonEmpHolders = ['new', 'unassigned', 'n/a', '—', '-'];
    if (nonEmpHolders.includes(lower)) return;

    if (statEl) statEl.value = 'Assigned';

    const empTable = this.db ? this.db.getTable('employees') : (window.localDB ? window.localDB.getTable('employees') : null);
    if (empTable && empTable.rows) {
      const empMatch = empTable.rows.find(e => String(e['Name'] || e['Employee Name'] || Object.values(e)[0] || '').trim().toLowerCase() === lower);
      if (empMatch) {
        const rawLoc = String(empMatch['Location'] || '').trim();
        const cleanLoc = (window.getPhysicalLocation ? window.getPhysicalLocation(rawLoc) : rawLoc) || 'Helena';
        if (locEl) locEl.value = cleanLoc;
      }
    }

    if (dateEl) {
      dateEl.value = todayIso;
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

    let newTestDate = testDateInput ? formatToMdY(testDateInput.value.trim()) : '';
    let newDateAssigned = dateAssignedInput ? formatToMdY(dateAssignedInput.value.trim()) : '';
    let newStatus = statusSelect ? statusSelect.value.trim() : (row['Status'] || '');
    let newLocation = locationInput ? locationInput.value.trim() : (row['Location'] || '');
    newLocation = (window.getPhysicalLocation ? window.getPhysicalLocation(newLocation) : newLocation) || newLocation;
    let newAssignedTo = assignedToInput ? assignedToInput.value.trim() : (row['Assigned To'] || '');

    const nonEmpHolders = ['on shelf', 'in testing', 'packed for testing', 'packed for delivery', 'failed rubber', 'failed', 'lost', 'destroyed', 'new', 'unassigned', 'n/a', '—', '-'];
    if (newAssignedTo && !nonEmpHolders.includes(newAssignedTo.toLowerCase())) {
      if (newStatus.toLowerCase() === 'on shelf') {
        newStatus = 'Assigned';
      }
    }

    const isFailedRubber = newStatus.toLowerCase() === 'failed rubber' || newAssignedTo.toLowerCase() === 'failed rubber';
    let failedReason = '';
    if (isFailedRubber) {
      newStatus = 'Failed Rubber';
      newAssignedTo = 'Failed Rubber';
      newLocation = 'Destroyed';
      const today = new Date();
      newDateAssigned = `${String(today.getMonth() + 1).padStart(2, '0')}/${String(today.getDate()).padStart(2, '0')}/${today.getFullYear()}`;
      if (window.sheetNavigator && typeof window.sheetNavigator.promptFailedRubberReason === 'function') {
        const curTestDate = newTestDate || String(row['Test Date'] || '').trim();
        const failResult = await window.sheetNavigator.promptFailedRubberReason(cleanItemKey, curTestDate);
        if (!failResult) return; // Cancelled
        failedReason = typeof failResult === 'object' ? failResult.reason : failResult;
        if (typeof failResult === 'object' && failResult.testDate) {
          newTestDate = failResult.testDate;
        }
      }
    }

    const isOnShelf = newStatus.toLowerCase() === 'on shelf' || newAssignedTo.toLowerCase() === 'on shelf';
    let shelfDetails = null;
    if (isOnShelf && !isFailedRubber) {
      newStatus = 'On Shelf';
      newAssignedTo = 'On Shelf';
      newLocation = 'Helena';
      const today = new Date();
      if (!newDateAssigned) {
        newDateAssigned = `${String(today.getMonth() + 1).padStart(2, '0')}/${String(today.getDate()).padStart(2, '0')}/${today.getFullYear()}`;
      }

      const hasEsl = (table.headers || []).some(h => /^esl\s*id$/i.test(h));
      const curEsl = row['ESL ID'] || '';
      if (window.sheetNavigator && typeof window.sheetNavigator.promptOnShelfDetails === 'function') {
        shelfDetails = await window.sheetNavigator.promptOnShelfDetails(cleanItemKey, newTestDate || row['Test Date'], curEsl, hasEsl);
        if (!shelfDetails) return; // Cancelled
        if (shelfDetails.testDate) newTestDate = shelfDetails.testDate;
      }
    }

    const isInTesting = newStatus.toLowerCase() === 'in testing' || newAssignedTo.toLowerCase() === 'in testing';
    if (isInTesting && !isFailedRubber && !isOnShelf) {
      newStatus = 'In Testing';
      newAssignedTo = 'In Testing';
      if (!newLocation || newLocation === 'Helena' || newLocation === 'Belgrade') {
        newLocation = 'Arnett / JM Test';
      }
      const today = new Date();
      const todayFormatted = `${String(today.getMonth() + 1).padStart(2, '0')}/${String(today.getDate()).padStart(2, '0')}/${today.getFullYear()}`;
      const prevDate = String(row['Date Assigned'] || '').trim();
      const prevAssigned = String(row['Assigned To'] || '').trim().toLowerCase();
      if (prevAssigned !== 'in testing' || newDateAssigned === prevDate || !newDateAssigned) {
        newDateAssigned = todayFormatted;
      }
    }

    const isPackedTesting = newStatus.toLowerCase() === 'ready for test' || newAssignedTo.toLowerCase() === 'packed for testing';
    if (isPackedTesting && !isFailedRubber && !isOnShelf && !isInTesting) {
      newStatus = 'Ready For Test';
      newAssignedTo = 'Packed For Testing';
      newLocation = "Cody's Truck";
      const today = new Date();
      const todayFormatted = `${String(today.getMonth() + 1).padStart(2, '0')}/${String(today.getDate()).padStart(2, '0')}/${today.getFullYear()}`;
      const prevDate = String(row['Date Assigned'] || '').trim();
      const prevAssigned = String(row['Assigned To'] || '').trim().toLowerCase();
      if (prevAssigned !== 'packed for testing' || newDateAssigned === prevDate || !newDateAssigned) {
        newDateAssigned = todayFormatted;
      }
    }

    const isPackedDelivery = newStatus.toLowerCase() === 'ready for delivery' || newAssignedTo.toLowerCase() === 'packed for delivery';
    if (isPackedDelivery && !isFailedRubber && !isOnShelf && !isInTesting && !isPackedTesting) {
      newStatus = 'Ready For Delivery';
      newAssignedTo = 'Packed For Delivery';
      newLocation = "Cody's Truck";
      const today = new Date();
      const todayFormatted = `${String(today.getMonth() + 1).padStart(2, '0')}/${String(today.getDate()).padStart(2, '0')}/${today.getFullYear()}`;
      const prevDate = String(row['Date Assigned'] || '').trim();
      const prevAssigned = String(row['Assigned To'] || '').trim().toLowerCase();
      if (prevAssigned !== 'packed for delivery' || newDateAssigned === prevDate || !newDateAssigned) {
        newDateAssigned = todayFormatted;
      }
    }

    const isLost = newStatus.toLowerCase() === 'lost' || newAssignedTo.toLowerCase() === 'lost';
    if (isLost && !isFailedRubber && !isOnShelf && !isInTesting && !isPackedTesting && !isPackedDelivery) {
      newStatus = 'Lost';
      newAssignedTo = 'Lost';
      newLocation = 'Lost';
      const today = new Date();
      const todayFormatted = `${String(today.getMonth() + 1).padStart(2, '0')}/${String(today.getDate()).padStart(2, '0')}/${today.getFullYear()}`;
      newDateAssigned = todayFormatted;
    }

    // Identify which header names exist on this sheet
    const testHeader = table.headers.find(h => /test\s*date|calibration|pad\s*exp/i.test(h)) || 'Test Date';
    let dateAssignedHeader = table.headers.find(h => /date\s*assigned/i.test(h)) || 'Date Assigned';
    const statusHeader = table.headers.find(h => /^status$/i.test(h)) || 'Status';
    const locationHeader = table.headers.find(h => /^location$/i.test(h)) || 'Location';
    const assignedToHeader = table.headers.find(h => /assigned\s*to/i.test(h)) || 'Assigned To';
    const changeOutHeader = table.headers.find(h => /change\s*out/i.test(h)) || 'Change Out Date';
    const notesHeader = table.headers.find(h => /^notes$|^note$/i.test(h)) || 'Notes';
    const pickedHeader = table.headers.find(h => /^picked\s*for$/i.test(h));
    const eslHeader = table.headers.find(h => /^esl\s*id$/i.test(h));

    // Calculate new Change Out Date
    let newChgOut = (isFailedRubber || isLost) ? 'N/A' : '';
    if (!isFailedRubber && window.inventoryManager && typeof window.inventoryManager.calculateChangeOutDate === 'function') {
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
    const addCellMutation = async (hName, val, skipHistory = true) => {
      if (!hName || val === undefined) return;
      const colIdx = table.headers.indexOf(hName);
      if (colIdx !== -1 && rowIdx) {
        await this.db.addMutation({
          action: 'UPDATE_CELL',
          sheetName: sheetName,
          row: rowIdx,
          col: colIdx + 1,
          header: hName,
          value: val,
          skipHistory: skipHistory
        });
      }
    };

    if (newTestDate && testHeader) await addCellMutation(testHeader, newTestDate);
    if (newDateAssigned && dateAssignedHeader) await addCellMutation(dateAssignedHeader, newDateAssigned);
    if (newStatus && statusHeader) await addCellMutation(statusHeader, newStatus);
    if (newLocation && locationHeader) await addCellMutation(locationHeader, newLocation);
    if (newAssignedTo && assignedToHeader) await addCellMutation(assignedToHeader, newAssignedTo);
    if (newChgOut && changeOutHeader) await addCellMutation(changeOutHeader, newChgOut);
    if (failedReason && notesHeader) {
      row[notesHeader] = failedReason;
      await addCellMutation(notesHeader, failedReason);
    }
    if (shelfDetails && shelfDetails.eslId && eslHeader) {
      row[eslHeader] = shelfDetails.eslId;
      await addCellMutation(eslHeader, shelfDetails.eslId);
    }
    if (isOnShelf && pickedHeader && row[pickedHeader]) {
      row[pickedHeader] = '';
      await addCellMutation(pickedHeader, '');
    }

    // Auto-record history transition if status/assigned changed
    let histNote = row['Notes'] || 'Dates updated';
    if (newAssignedTo === 'In Testing') {
      histNote = 'In Testing (Arnett / JM Test)';
    } else if (newAssignedTo === 'On Shelf') {
      histNote = 'Returned to Shelf';
    } else if (newAssignedTo === 'Packed For Testing') {
      histNote = "Packed For Testing (Cody's Truck)";
    } else if (newAssignedTo === 'Packed For Delivery') {
      histNote = "Packed For Delivery (Cody's Truck)";
    } else if (newAssignedTo === 'Lost') {
      histNote = 'Marked Lost / Missing';
    } else if (newAssignedTo && !['new', 'unassigned', 'n/a'].includes(newAssignedTo.toLowerCase())) {
      histNote = `Assigned to ${newAssignedTo}`;
    }
    await this.db.recordItemHistoryEvent(sheetName, row, histNote);

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

  async syncActiveFromHistory(sheetKey, cleanItemKey) {
    const activeKey = sheetKey.replace('_history', '');
    if (window.inventoryManager && typeof window.inventoryManager.reconcileInventoryWithHistory === 'function') {
      await window.inventoryManager.reconcileInventoryWithHistory(activeKey, false);
      this.openDossierModal(cleanItemKey, sheetKey);
    }
  }

  async recordActiveToHistory(sheetKey, cleanItemKey) {
    const activeKey = sheetKey.replace('_history', '');
    const activeTable = this.db.getTable(activeKey);
    if (!activeTable || !activeTable.rows) {
      alert(`Could not find active table for ${activeKey}`);
      return;
    }

    const itemRow = activeTable.rows.find(r => {
      const num = String(r['Item #'] || r['Glove'] || r['Sleeve'] || r['Blanket'] || r['MACK'] || r['HVT #'] || r['Phasing Set #'] || r['AED #'] || r['Serial #'] || r['ESL ID'] || '').trim();
      return num.toLowerCase() === String(cleanItemKey).trim().toLowerCase();
    });

    if (!itemRow) {
      alert(`Could not find item #${cleanItemKey} in active sheet ${activeKey}`);
      return;
    }

    const notes = String(itemRow['Notes'] || '').trim();
    const status = String(itemRow['Status'] || '').trim();

    await this.db.recordItemHistoryEvent(
      activeTable.name || activeKey,
      itemRow,
      notes || `Active status recorded to history (${status})`
    );

    // Refresh active table views and dossier
    if (window.sheetNavigator) {
      window.sheetNavigator.renderActiveView();
    }
    this.openDossierModal(cleanItemKey, sheetKey);

    if (window.inventoryManager && typeof window.inventoryManager.showToast === 'function') {
      window.inventoryManager.showToast(`✅ Successfully recorded active status to history for #${cleanItemKey}!`);
    } else {
      alert(`✅ Successfully recorded active status to history for #${cleanItemKey}!`);
    }
  }
}

// Global instance
window.itemStatsEngine = new ItemStatsEngine(window.localDB);
