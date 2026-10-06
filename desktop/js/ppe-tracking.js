/**
 * ppe-tracking.js - Rubber PPE (Gloves & Sleeves) Compliance & Tracking Engine
 *
 * Rules:
 * - Tracked Classifications: SUP, GF, F, JRY, and AP 1-7
 * - AP 1-3: Require Rubber Gloves ONLY (Sleeves NOT required)
 * - AP 4-7: Require Rubber Gloves AND Sleeves (Advancing to AP 4 triggers sleeve requirement)
 * - JRY: Require Rubber Gloves AND Sleeves
 * - SUP, GF, F: Require Rubber Gloves AND Sleeves
 */

class RubberPpeTrackingEngine {
  constructor(db) {
    this.db = db || window.localDB;
    this.currentFilter = 'all_missing'; // 'all_missing' | 'missing_gloves' | 'missing_sleeves' | 'missing_both' | 'fully_equipped' | 'excluded' | 'all_tracked'
    this.classificationFilter = 'all'; // 'all' | 'sup' | 'gf' | 'f' | 'jry' | 'ap1_3' | 'ap4_7'
    this.locationFilter = 'all';
    this.searchQuery = '';
    this.currentAuditData = null;
    this.activeAssignTarget = null; // { employeeName, itemType: 'gloves' | 'sleeves', preferredSize, location }
    this.excludedEmployeeMap = this.loadExcludedEmployeeMap();
  }

  init() {
    // Escape key handling for PPE modals
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        const exclusionsModal = document.getElementById('ppe-exclusions-modal');
        if (exclusionsModal && exclusionsModal.classList.contains('active')) {
          this.closeExclusionsModal();
          return;
        }
        const quickAssignModal = document.getElementById('ppe-quick-assign-modal');
        if (quickAssignModal && quickAssignModal.classList.contains('active')) {
          this.closeQuickAssignModal();
          return;
        }
        const trackingModal = document.getElementById('rubber-ppe-tracking-modal');
        if (trackingModal && trackingModal.classList.contains('active')) {
          this.closeModal();
        }
      }
    });

    // Update toolbar badge on initial load
    setTimeout(() => {
      this.updateToolbarBadge();
    }, 400);
  }

  /**
   * Loads excluded employees mapping (normalized name -> original display name) from localStorage
   */
  loadExcludedEmployeeMap() {
    const map = new Map();
    try {
      const raw = localStorage.getItem('sa_ppe_excluded_employees');
      if (raw) {
        const arr = JSON.parse(raw);
        if (Array.isArray(arr)) {
          arr.forEach(name => {
            const clean = String(name || '').trim();
            if (clean) {
              map.set(this.normalizeName(clean), clean);
            }
          });
        }
      }
    } catch (e) {
      console.warn('Error reading excluded PPE employees config:', e);
    }
    return map;
  }

  /**
   * Persists excluded employee list to localStorage
   */
  saveExcludedEmployeeMap() {
    try {
      const list = Array.from(this.excludedEmployeeMap.values());
      localStorage.setItem('sa_ppe_excluded_employees', JSON.stringify(list));
    } catch (e) {
      console.error('Error saving excluded PPE employees config:', e);
    }
  }

  /**
   * Checks whether an employee is currently excluded from Rubber PPE tracking
   */
  isEmployeeExcluded(empName) {
    if (!empName) return false;
    const norm = this.normalizeName(empName);
    if (!norm) return false;
    if (this.excludedEmployeeMap.has(norm)) return true;
    for (const key of this.excludedEmployeeMap.keys()) {
      if (this.isNameMatch(key, norm)) return true;
    }
    return false;
  }

  /**
   * Adds or removes an employee from Rubber PPE tracking exclusions
   */
  setEmployeeExcluded(empName, isExcluded) {
    if (!empName) return;
    const clean = String(empName).trim();
    const norm = this.normalizeName(clean);
    if (!norm) return;

    if (isExcluded) {
      this.excludedEmployeeMap.set(norm, clean);
    } else {
      this.excludedEmployeeMap.delete(norm);
      for (const key of this.excludedEmployeeMap.keys()) {
        if (this.isNameMatch(key, norm)) {
          this.excludedEmployeeMap.delete(key);
        }
      }
    }

    this.saveExcludedEmployeeMap();
    this.compileAuditData();
    this.updateToolbarBadge();

    // Re-render main modal if active
    const modal = document.getElementById('rubber-ppe-tracking-modal');
    const body = document.getElementById('rubber-ppe-modal-body');
    if (modal && modal.classList.contains('active') && body) {
      this.renderModalContent(body);
    }

    // Re-render exclusions modal if active
    const exclModal = document.getElementById('ppe-exclusions-modal');
    const exclBody = document.getElementById('ppe-exclusions-modal-body');
    if (exclModal && exclModal.classList.contains('active') && exclBody) {
      this.renderExclusionsModalContent(exclBody);
    }

    // Refresh crew cards in sheets view if available
    if (window.sheetNavigator && typeof window.sheetNavigator.renderCurrentSheet === 'function') {
      window.sheetNavigator.renderCurrentSheet();
    }

    if (typeof window.showToast === 'function') {
      if (isExcluded) {
        window.showToast(`🚫 Excluded "${clean}" from Rubber PPE compliance tracking`, 'info');
      } else {
        window.showToast(`✅ Restored "${clean}" to Rubber PPE compliance tracking`, 'success');
      }
    }
  }

  /**
   * Toggles exclusion status for an employee
   */
  toggleEmployeeExcluded(empName) {
    const isCurrently = this.isEmployeeExcluded(empName);
    this.setEmployeeExcluded(empName, !isCurrently);
  }

  /**
   * Prompts user for confirmation before excluding an employee
   */
  promptExcludeEmployee(empName) {
    if (!empName) return;
    const confirmed = confirm(
      `Exclude "${empName}" from Rubber PPE compliance tracking?\n\n` +
      `• They will no longer be counted as missing gloves or sleeves.\n` +
      `• Alert badges will be hidden on crew cards.\n` +
      `• You can re-include them at any time from the Excluded tab or Manage Exclusions dialog.`
    );
    if (confirmed) {
      this.setEmployeeExcluded(empName, true);
    }
  }

  /**
   * Clears all exclusions
   */
  clearAllExclusions() {
    this.excludedEmployeeMap.clear();
    this.saveExcludedEmployeeMap();
    this.compileAuditData();
    this.updateToolbarBadge();

    const modal = document.getElementById('rubber-ppe-tracking-modal');
    const body = document.getElementById('rubber-ppe-modal-body');
    if (modal && modal.classList.contains('active') && body) {
      this.renderModalContent(body);
    }

    const exclModal = document.getElementById('ppe-exclusions-modal');
    const exclBody = document.getElementById('ppe-exclusions-modal-body');
    if (exclModal && exclModal.classList.contains('active') && exclBody) {
      this.renderExclusionsModalContent(exclBody);
    }

    if (window.sheetNavigator && typeof window.sheetNavigator.renderCurrentSheet === 'function') {
      window.sheetNavigator.renderCurrentSheet();
    }

    if (typeof window.showToast === 'function') {
      window.showToast('✅ Cleared all PPE tracking exclusions', 'success');
    }
  }

  promptClearAllExclusions() {
    if (this.excludedEmployeeMap.size === 0) {
      alert('There are no excluded employees to clear.');
      return;
    }
    if (confirm(`Are you sure you want to remove all ${this.excludedEmployeeMap.size} exclusion(s) and restore all employees to Rubber PPE tracking?`)) {
      this.clearAllExclusions();
    }
  }

  /**
   * Excludes all active employees of a specific classification tier (e.g., 'sup')
   */
  excludeEmployeesByTier(tierKey) {
    const audit = this.compileAuditData();
    const records = audit?.records || [];
    let count = 0;
    records.forEach(r => {
      if (r.classMeta && r.classMeta.tier === tierKey && !r.isExcluded) {
        this.excludedEmployeeMap.set(this.normalizeName(r.name), r.name);
        count++;
      }
    });

    if (count === 0) {
      if (typeof window.showToast === 'function') {
        window.showToast(`No new employees found matching classification ${tierKey.toUpperCase()}`, 'info');
      }
      return;
    }

    this.saveExcludedEmployeeMap();
    this.compileAuditData();
    this.updateToolbarBadge();

    const modal = document.getElementById('rubber-ppe-tracking-modal');
    const body = document.getElementById('rubber-ppe-modal-body');
    if (modal && modal.classList.contains('active') && body) {
      this.renderModalContent(body);
    }

    const exclModal = document.getElementById('ppe-exclusions-modal');
    const exclBody = document.getElementById('ppe-exclusions-modal-body');
    if (exclModal && exclModal.classList.contains('active') && exclBody) {
      this.renderExclusionsModalContent(exclBody);
    }

    if (typeof window.showToast === 'function') {
      window.showToast(`🚫 Excluded ${count} employee(s) in ${tierKey.toUpperCase()} from Rubber PPE tracking`, 'success');
    }
  }

  /**
   * Excludes all active employees on a specific crew prefix (e.g., '005')
   */
  excludeEmployeesByJobPrefix(prefix) {
    const audit = this.compileAuditData();
    const records = audit?.records || [];
    let count = 0;
    const pfx = String(prefix).trim().toLowerCase();
    records.forEach(r => {
      if (String(r.jobNumber).toLowerCase().startsWith(pfx) && !r.isExcluded) {
        this.excludedEmployeeMap.set(this.normalizeName(r.name), r.name);
        count++;
      }
    });

    if (count === 0) {
      if (typeof window.showToast === 'function') {
        window.showToast(`No active employees found matching Job Prefix ${prefix}`, 'info');
      }
      return;
    }

    this.saveExcludedEmployeeMap();
    this.compileAuditData();
    this.updateToolbarBadge();

    const modal = document.getElementById('rubber-ppe-tracking-modal');
    const body = document.getElementById('rubber-ppe-modal-body');
    if (modal && modal.classList.contains('active') && body) {
      this.renderModalContent(body);
    }

    const exclModal = document.getElementById('ppe-exclusions-modal');
    const exclBody = document.getElementById('ppe-exclusions-modal-body');
    if (exclModal && exclModal.classList.contains('active') && exclBody) {
      this.renderExclusionsModalContent(exclBody);
    }

    if (typeof window.showToast === 'function') {
      window.showToast(`🚫 Excluded ${count} employee(s) on crew ${prefix} from Rubber PPE tracking`, 'success');
    }
  }

  /**
   * Evaluates if classification is one of SUP, GF, F, JRY, or AP 1-7.
   * Returns metadata with requirement rules or null if untracked.
   */
  parseTrackedClassification(rawCls) {
    if (!rawCls) return null;
    const s = String(rawCls).trim();
    const up = s.toUpperCase();

    // 1. Apprentices & Sub Techs (AP 1-7, ST 1-7, etc.)
    const apMatch = up.match(/^(?:AP|ST|APP|APPRENTICE|SUB TECH)[\s\-_.]*([1-7])(?:\b|\s|$)/i) ||
                    up.match(/^([1-7])[\s\-_.]*(?:AP|ST|APP|APPRENTICE)\b/i) ||
                    up.match(/^(?:AP|ST)\s*([1-7])$/i);

    if (apMatch) {
      const level = parseInt(apMatch[1], 10);
      if (level >= 1 && level <= 3) {
        return {
          code: `AP ${level}`,
          level: level,
          tier: 'ap1_3',
          category: 'AP 1-3',
          label: `Apprentice Level ${level}`,
          subLabel: 'AP 1–3 (Gloves Only)',
          needsGloves: true,
          needsSleeves: false,
          ruleSummary: 'AP 1–3: Gloves required · Sleeves NOT required'
        };
      } else if (level >= 4 && level <= 7) {
        return {
          code: `AP ${level}`,
          level: level,
          tier: 'ap4_7',
          category: 'AP 4-7',
          label: `Apprentice Level ${level}`,
          subLabel: 'AP 4–7 (Gloves & Sleeves)',
          needsGloves: true,
          needsSleeves: true,
          ruleSummary: 'AP 4–7: Gloves AND Sleeves both required'
        };
      }
    }

    // 2. Supervisor / Superintendent (SUP)
    if (/^(SUP|SUPERVISOR|SUPERINTENDENT|SUPV|SUP\.)(\s|$)/i.test(up)) {
      return {
        code: 'SUP',
        level: 0,
        tier: 'sup',
        category: 'SUP',
        label: 'Supervisor / Superintendent',
        subLabel: 'Supervision (Gloves & Sleeves)',
        needsGloves: true,
        needsSleeves: true,
        ruleSummary: 'Supervisor: Gloves AND Sleeves both required'
      };
    }

    // 3. General Foreman (GF)
    if (/^(GF|GENERAL\s*FOREMAN|GEN\s*FOREMAN|GEN\.\s*FOREMAN|GF\.)(\s|$)/i.test(up)) {
      return {
        code: 'GF',
        level: 0,
        tier: 'gf',
        category: 'GF',
        label: 'General Foreman',
        subLabel: 'General Foreman (Gloves & Sleeves)',
        needsGloves: true,
        needsSleeves: true,
        ruleSummary: 'General Foreman: Gloves AND Sleeves both required'
      };
    }

    // 4. Foreman (F, GTO F, Foreman, Crew Lead)
    if (/^(F|FOREMAN|GTO\s*F|GTO\s*FOREMAN|F\.)(\s|$)/i.test(up)) {
      return {
        code: up.includes('GTO') ? 'GTO F' : 'F',
        level: 0,
        tier: 'f',
        category: 'F',
        label: up.includes('GTO') ? 'GTO Foreman' : 'Foreman',
        subLabel: 'Foreman (Gloves & Sleeves)',
        needsGloves: true,
        needsSleeves: true,
        ruleSummary: 'Foreman: Gloves AND Sleeves both required'
      };
    }

    // 5. Journeyman Lineman (JRY, JL, Journeyman)
    if (/^(JRY|JL|JOURNEYMAN|JOURNEYMAN\s*LINEMAN)$/i.test(up) ||
        (/^(JRY|JL|JOURNEYMAN|JOURNEYMAN\s*LINEMAN)\b/i.test(up) && !/\b(OP|OPERATOR)\b/i.test(up))) {
      return {
        code: 'JRY',
        level: 0,
        tier: 'jry',
        category: 'JRY',
        label: 'Journeyman Lineman',
        subLabel: 'Journeyman (Gloves & Sleeves)',
        needsGloves: true,
        needsSleeves: true,
        ruleSummary: 'Journeyman Lineman: Gloves AND Sleeves both required'
      };
    }

    return null;
  }

  /**
   * Flexible name normalization
   */
  normalizeName(name) {
    if (!name) return '';
    return String(name).toLowerCase()
      .replace(/\(.*?\)/g, '')
      .replace(/[^a-z0-9]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  isNameMatch(nameA, nameB) {
    if (!nameA || !nameB) return false;
    if (window.employeeProfileEngine && typeof window.employeeProfileEngine.isNameMatch === 'function') {
      return window.employeeProfileEngine.isNameMatch(nameA, nameB);
    }
    const nA = this.normalizeName(nameA);
    const nB = this.normalizeName(nameB);
    if (!nA || !nB) return false;
    if (nA === nB) return true;
    if (nA.includes(nB) || nB.includes(nA)) return true;
    return false;
  }

  getItemIdentifier(row) {
    if (!row) return '—';
    return String(row['Glove'] || row['Sleeve'] || row['Item #'] || row['Item'] || row['ESL ID'] || '—').trim();
  }

  /**
   * Compiles complete audit data for all active employees against gloves and sleeves tables.
   */
  compileAuditData() {
    const snap = (this.db && typeof this.db.getSnapshot === 'function')
      ? this.db.getSnapshot()
      : (window.localDB ? window.localDB.getSnapshot() : null);

    if (!snap || !snap.tables) {
      return {
        records: [],
        locations: [],
        summary: {
          totalTracked: 0,
          totalMissingAny: 0,
          totalMissingGloves: 0,
          totalMissingSleeves: 0,
          totalMissingBoth: 0,
          totalFullyEquipped: 0,
          totalAp1_3: 0,
          totalAp4_7: 0,
          totalSupGfF: 0,
          totalJry: 0
        }
      };
    }

    const empTable = snap.tables['employees'];
    const glovesTable = snap.tables['gloves'];
    const sleevesTable = snap.tables['sleeves'];

    const empRows = (empTable && empTable.rows) ? empTable.rows : [];
    const gloveRows = (glovesTable && glovesTable.rows) ? glovesTable.rows : [];
    const sleeveRows = (sleevesTable && sleevesTable.rows) ? sleevesTable.rows : [];

    const NON_ASSIGNED_STATUSES = new Set([
      'on shelf', 'lost', 'destroyed', 'failed rubber', 'failed',
      'retired', 'in testing', 'packed for testing', 'not repairable', 'reclaimed'
    ]);

    const NON_EMP_HOLDERS = new Set([
      '', 'on shelf', 'shelf', 'in testing', 'packed for testing',
      'lost', 'destroyed', 'failed', 'failed rubber', 'retired', 'unassigned', 'n/a', '—', '-'
    ]);

    // Fast helper to find items assigned to employee
    const findAssignedItems = (itemRows, empName, altNames = '') => {
      const assigned = [];
      const altArr = String(altNames || '').split(',').map(s => s.trim()).filter(Boolean);

      for (let i = 0; i < itemRows.length; i++) {
        const it = itemRows[i];
        const holder = String(it['Assigned To'] || it['Holder'] || it['Employee'] || '').trim();
        const holderNorm = this.normalizeName(holder);
        const status = String(it['Status'] || '').trim().toLowerCase();

        if (NON_EMP_HOLDERS.has(holderNorm) || NON_ASSIGNED_STATUSES.has(status)) {
          continue;
        }

        let isMatch = this.isNameMatch(holder, empName);
        if (!isMatch && altArr.length > 0) {
          isMatch = altArr.some(alt => this.isNameMatch(holder, alt));
        }

        if (isMatch) {
          assigned.push({
            itemNum: this.getItemIdentifier(it),
            eslId: String(it['ESL ID'] || '').trim(),
            size: String(it['Size'] || '—').trim(),
            classVal: String(it['Class'] || '—').trim(),
            status: String(it['Status'] || 'Assigned').trim(),
            changeOutDate: String(it['Change Out Date'] || it['Changeout Date'] || '—').trim(),
            dateAssigned: String(it['Date Assigned'] || '—').trim(),
            testDate: String(it['Test Date'] || '—').trim(),
            location: String(it['Location'] || '—').trim(),
            notes: String(it['Notes'] || '').trim(),
            raw: it
          });
        }
      }
      return assigned;
    };

    const records = [];
    const locationSet = new Set();

    let totalTracked = 0;
    let totalMissingAny = 0;
    let totalMissingGloves = 0;
    let totalMissingSleeves = 0;
    let totalMissingBoth = 0;
    let totalFullyEquipped = 0;
    let totalExcluded = 0;
    let totalAp1_3 = 0;
    let totalAp4_7 = 0;
    let totalSupGfF = 0;
    let totalJry = 0;

    for (let i = 0; i < empRows.length; i++) {
      const emp = empRows[i];
      const name = String(emp['Employee Name'] || emp['Name'] || emp['Worker'] || '').trim();
      if (!name) continue;

      const locRaw = String(emp['Location'] || emp['City'] || '').trim();
      const locClean = (window.getPhysicalLocation ? window.getPhysicalLocation(locRaw) : locRaw) || 'Helena';
      const locLower = locRaw.toLowerCase();

      // Exclude previous employees and terminated employees with a past Last Day
      if (locLower === 'previous employee' || locLower.includes('previous')) continue;
      const lastDay = String(emp['Last Day'] || '').trim();
      if (lastDay) {
        const lastDayDate = new Date(lastDay);
        if (!isNaN(lastDayDate.getTime()) && lastDayDate < new Date()) {
          continue;
        }
      }

      // Skip dummy system rows
      const nameNorm = this.normalizeName(name);
      if (nameNorm === 'lost' || nameNorm === 'in testing' || nameNorm.includes('system placeholder')) continue;

      const rawCls = String(emp['Job Classification'] || emp['Classification'] || emp['Class'] || '').trim();
      const classMeta = this.parseTrackedClassification(rawCls);
      if (!classMeta) continue; // Only track SUP, GF, F, JRY, and AP 1-7

      const isExcluded = this.isEmployeeExcluded(name);

      if (locClean && locClean !== '—') locationSet.add(locClean);

      const altNames = String(emp['Alternate Names'] || '').trim();
      const jobNumber = String(emp['Job Number'] || emp['Job #'] || emp['Crew'] || '—').trim();
      const gloveSize = String(emp['Glove Size'] || emp['Glove'] || '—').trim();
      const sleeveSize = String(emp['Sleeve Size'] || emp['Sleeve'] || '—').trim();
      const phone = String(emp['Phone Number'] || emp['Phone'] || '—').trim();
      const email = String(emp['Email Address'] || emp['Email'] || '').trim();
      const crewLead = String(emp['Crew Lead'] || '').trim();

      // Correlate with inventory
      const assignedGloves = findAssignedItems(gloveRows, name, altNames);
      const assignedSleeves = findAssignedItems(sleeveRows, name, altNames);

      const hasGloves = assignedGloves.length > 0;
      const hasSleeves = assignedSleeves.length > 0;

      const missingGloves = !hasGloves;
      // AP 1-3 ONLY need gloves, NOT sleeves.
      // AP 4-7, JRY, SUP, GF, F need rubber gloves AND sleeves.
      const missingSleeves = classMeta.needsSleeves && !hasSleeves;

      const isMissingBoth = missingGloves && missingSleeves;
      const isMissingAny = missingGloves || missingSleeves;
      const isFullyEquipped = !isMissingAny;

      if (isExcluded) {
        totalExcluded++;
      } else {
        totalTracked++;
        if (classMeta.tier === 'ap1_3') totalAp1_3++;
        else if (classMeta.tier === 'ap4_7') totalAp4_7++;
        else if (classMeta.tier === 'jry') totalJry++;
        else totalSupGfF++;

        if (isMissingAny) totalMissingAny++;
        if (missingGloves) totalMissingGloves++;
        if (missingSleeves) totalMissingSleeves++;
        if (isMissingBoth) totalMissingBoth++;
        if (isFullyEquipped) totalFullyEquipped++;
      }

      records.push({
        name,
        classification: rawCls,
        classMeta,
        jobNumber,
        location: locClean,
        locationRaw: locRaw,
        gloveSize,
        sleeveSize,
        phone,
        email,
        crewLead,
        assignedGloves,
        assignedSleeves,
        hasGloves,
        hasSleeves,
        missingGloves,
        missingSleeves,
        isMissingBoth,
        isMissingAny,
        isFullyEquipped,
        isExcluded,
        empRow: emp
      });
    }

    // Sort: Non-excluded Missing first, then non-excluded equipped, then excluded, then by tier and name
    records.sort((a, b) => {
      if (a.isExcluded !== b.isExcluded) {
        return a.isExcluded ? 1 : -1;
      }
      if (a.isMissingAny !== b.isMissingAny) {
        return a.isMissingAny ? -1 : 1;
      }
      if (a.classMeta.tier !== b.classMeta.tier) {
        const tierRank = { sup: 1, gf: 2, f: 3, jry: 4, ap4_7: 5, ap1_3: 6 };
        return (tierRank[a.classMeta.tier] || 99) - (tierRank[b.classMeta.tier] || 99);
      }
      return a.name.localeCompare(b.name);
    });

    const locations = Array.from(locationSet).sort();

    this.currentAuditData = {
      records,
      locations,
      summary: {
        totalTracked,
        totalMissingAny,
        totalMissingGloves,
        totalMissingSleeves,
        totalMissingBoth,
        totalFullyEquipped,
        totalExcluded,
        totalAllPersonnel: records.length,
        totalAp1_3,
        totalAp4_7,
        totalSupGfF,
        totalJry
      }
    };

    return this.currentAuditData;
  }

  /**
   * Updates toolbar button badge on the sheets view
   */
  updateToolbarBadge() {
    const btn = document.getElementById('btn-ppe-tracking');
    const badge = document.getElementById('ppe-missing-badge');
    if (!btn) return;

    const audit = this.compileAuditData();
    const missingCount = audit?.summary?.totalMissingAny || 0;
    const exclCount = audit?.summary?.totalExcluded || 0;

    if (badge) {
      badge.textContent = missingCount;
      if (missingCount > 0) {
        badge.style.display = 'inline-block';
        badge.style.background = '#ef4444';
        badge.style.color = '#ffffff';
      } else {
        badge.style.display = 'inline-block';
        badge.style.background = '#10b981';
        badge.style.color = '#ffffff';
      }
    }

    const exclNote = exclCount > 0 ? ` (${exclCount} excluded)` : '';
    btn.title = `Rubber PPE Tracker: ${missingCount} employee${missingCount === 1 ? '' : 's'} in SUP, GF, F, JRY, AP 1-7 missing required rubber PPE${exclNote}`;
  }

  /**
   * Returns HTML badge for inline rendering inside crew cards in sheets.js
   */
  getMemberRowBadge(empName, rawCls) {
    if (!empName || !rawCls) return '';
    const classMeta = this.parseTrackedClassification(rawCls);
    if (!classMeta) return '';

    // Fast check against current audit
    if (!this.currentAuditData) {
      this.compileAuditData();
    }

    const rec = (this.currentAuditData?.records || []).find(r => this.isNameMatch(r.name, empName));
    if (!rec) return '';

    // If excluded from PPE tracking, don't show any missing alerts
    if (rec.isExcluded) return '';

    if (rec.isMissingBoth) {
      return `
        <span class="badge ppe-pill-missing-both"
              onclick="event.stopPropagation(); window.ppeTrackingEngine.openModalForEmployee('${this.escapeJs(empName)}')"
              style="background: rgba(239, 68, 68, 0.2); color: #fca5a5; border: 1px solid rgba(239, 68, 68, 0.45); font-size: 9.5px; font-weight: 700; padding: 1px 6px; border-radius: 4px; cursor: pointer; display: inline-flex; align-items: center; gap: 3px;"
              title="Rubber PPE Alert: Needs BOTH Rubber Gloves & Sleeves! Click to view.">
          ⚠️ Needs Gloves & Sleeves
        </span>
      `;
    }

    if (rec.missingGloves) {
      return `
        <span class="badge ppe-pill-missing-gloves"
              onclick="event.stopPropagation(); window.ppeTrackingEngine.openModalForEmployee('${this.escapeJs(empName)}')"
              style="background: rgba(14, 165, 233, 0.18); color: #38bdf8; border: 1px solid rgba(56, 189, 248, 0.45); font-size: 9.5px; font-weight: 700; padding: 1px 6px; border-radius: 4px; cursor: pointer; display: inline-flex; align-items: center; gap: 3px;"
              title="Rubber PPE Alert: Needs Rubber Gloves! Click to view.">
          🧤 Needs Gloves
        </span>
      `;
    }

    if (rec.missingSleeves) {
      return `
        <span class="badge ppe-pill-missing-sleeves"
              onclick="event.stopPropagation(); window.ppeTrackingEngine.openModalForEmployee('${this.escapeJs(empName)}')"
              style="background: rgba(168, 85, 247, 0.2); color: #d8b4fe; border: 1px solid rgba(168, 85, 247, 0.45); font-size: 9.5px; font-weight: 700; padding: 1px 6px; border-radius: 4px; cursor: pointer; display: inline-flex; align-items: center; gap: 3px;"
              title="Rubber PPE Alert: Classification ${this.escapeHtml(classMeta.code)} requires Sleeves. Needs Rubber Sleeves! Click to view.">
          🦾 Needs Sleeves
        </span>
      `;
    }

    // Fully equipped - return empty so compliant employees have clean rows without visual noise
    return '';
  }

  /**
   * Opens the main Rubber PPE Tracker Modal
   */
  openModal(targetFilter = null) {
    const modal = document.getElementById('rubber-ppe-tracking-modal');
    const body = document.getElementById('rubber-ppe-modal-body');
    if (!modal || !body) return;

    if (targetFilter) {
      this.currentFilter = targetFilter;
    }

    this.compileAuditData();
    this.renderModalContent(body);
    modal.classList.add('active');
  }

  /**
   * Opens modal pre-filtered for a specific employee
   */
  openModalForEmployee(employeeName) {
    this.searchQuery = employeeName || '';
    this.currentFilter = 'all_tracked';
    this.openModal();
  }

  closeModal() {
    const modal = document.getElementById('rubber-ppe-tracking-modal');
    if (modal) modal.classList.remove('active');
  }

  setFilter(filterKey) {
    this.currentFilter = filterKey;
    const body = document.getElementById('rubber-ppe-modal-body');
    if (body) this.renderModalContent(body);
  }

  setClassificationFilter(val) {
    this.classificationFilter = val;
    const body = document.getElementById('rubber-ppe-modal-body');
    if (body) this.renderModalContent(body);
  }

  setLocationFilter(val) {
    this.locationFilter = val;
    const body = document.getElementById('rubber-ppe-modal-body');
    if (body) this.renderModalContent(body);
  }

  setSearchQuery(q) {
    this.searchQuery = q || '';
    const body = document.getElementById('rubber-ppe-modal-body');
    if (body) this.renderModalContent(body);
  }

  /**
   * Main Modal Renderer
   */
  renderModalContent(container) {
    if (!container) return;
    const audit = this.compileAuditData();
    const { summary, records, locations } = audit;

    // Filter records according to user controls
    const filteredRecords = records.filter(rec => {
      // 1. Primary Filter Tab
      if (this.currentFilter === 'all_missing' && (!rec.isMissingAny || rec.isExcluded)) return false;
      if (this.currentFilter === 'missing_gloves' && (!rec.missingGloves || rec.isExcluded)) return false;
      if (this.currentFilter === 'missing_sleeves' && (!rec.missingSleeves || rec.isExcluded)) return false;
      if (this.currentFilter === 'missing_both' && (!rec.isMissingBoth || rec.isExcluded)) return false;
      if (this.currentFilter === 'fully_equipped' && (!rec.isFullyEquipped || rec.isExcluded)) return false;
      if (this.currentFilter === 'excluded' && !rec.isExcluded) return false;

      // 2. Classification Filter
      if (this.classificationFilter !== 'all') {
        if (this.classificationFilter === 'ap1_3' && rec.classMeta.tier !== 'ap1_3') return false;
        if (this.classificationFilter === 'ap4_7' && rec.classMeta.tier !== 'ap4_7') return false;
        if (this.classificationFilter === 'jry' && rec.classMeta.tier !== 'jry') return false;
        if (this.classificationFilter === 'f' && rec.classMeta.tier !== 'f') return false;
        if (this.classificationFilter === 'gf' && rec.classMeta.tier !== 'gf') return false;
        if (this.classificationFilter === 'sup' && rec.classMeta.tier !== 'sup') return false;
        if (this.classificationFilter === 'supervision_foreman' && !['sup', 'gf', 'f'].includes(rec.classMeta.tier)) return false;
      }

      // 3. Location Filter
      if (this.locationFilter !== 'all') {
        if (rec.location.toLowerCase() !== this.locationFilter.toLowerCase()) return false;
      }

      // 4. Search Filter
      if (this.searchQuery) {
        const q = this.searchQuery.toLowerCase().trim();
        const match = rec.name.toLowerCase().includes(q) ||
                      rec.classification.toLowerCase().includes(q) ||
                      rec.jobNumber.toLowerCase().includes(q) ||
                      rec.location.toLowerCase().includes(q) ||
                      String(rec.gloveSize).toLowerCase().includes(q) ||
                      String(rec.sleeveSize).toLowerCase().includes(q);
        if (!match) return false;
      }

      return true;
    });

    container.innerHTML = `
      <div class="ppe-tracking-container" style="display: flex; flex-direction: column; gap: 16px;">
        
        <!-- Rule Notice Header Banner -->
        <div class="ppe-rule-banner" style="background: linear-gradient(135deg, rgba(30, 41, 59, 0.95), rgba(15, 23, 42, 0.98)); border: 1px solid rgba(59, 130, 246, 0.35); border-left: 5px solid #3b82f6; border-radius: 8px; padding: 12px 16px; display: flex; justify-content: space-between; align-items: center; gap: 16px; flex-wrap: wrap;">
          <div style="display: flex; align-items: flex-start; gap: 12px;">
            <span style="font-size: 24px; line-height: 1;">📋</span>
            <div>
              <div style="font-size: 13.5px; font-weight: 700; color: #f8fafc; margin-bottom: 2px;">
                Rubber PPE Requirements by Classification
              </div>
              <div style="font-size: 12px; color: #94a3b8; line-height: 1.45;">
                <span style="color: #60a5fa; font-weight: 600;">AP 1–3:</span> Rubber Gloves <strong style="color: #4ade80;">ONLY</strong> (Sleeves not required). 
                <span style="margin: 0 4px; color: #475569;">•</span>
                <span style="color: #f59e0b; font-weight: 600;">AP 4–7:</span> Rubber Gloves <strong style="color: #fbbf24;">AND</strong> Sleeves (advancing to AP 4 triggers sleeve requirement).
                <span style="margin: 0 4px; color: #475569;">•</span>
                <span style="color: #38bdf8; font-weight: 600;">JRY:</span> Rubber Gloves <strong style="color: #7dd3fc;">AND</strong> Sleeves both required.
                <span style="margin: 0 4px; color: #475569;">•</span>
                <span style="color: #a855f7; font-weight: 600;">SUP, GF, F:</span> Rubber Gloves <strong style="color: #c084fc;">AND</strong> Sleeves both required.
              </div>
            </div>
          </div>
          <div style="display: flex; gap: 8px; align-items: center; flex-wrap: wrap;">
            <button class="btn btn-secondary" onclick="window.ppeTrackingEngine.openExclusionsDialog()" style="font-size: 12px; font-weight: 600; padding: 6px 12px; border-color: rgba(148, 163, 184, 0.4); color: #cbd5e1; display: flex; align-items: center; gap: 6px;" title="Manage employees excluded from PPE tracking">
              <span>🚫</span> Manage Exclusions ${summary.totalExcluded > 0 ? `(${summary.totalExcluded})` : ''}
            </button>
            <button class="btn btn-secondary" onclick="window.ppeTrackingEngine.exportToCsv()" style="font-size: 12px; font-weight: 600; padding: 6px 12px; border-color: rgba(59, 130, 246, 0.4); color: #93c5fd; display: flex; align-items: center; gap: 6px;" title="Export current filtered list to CSV">
              <span>📥</span> Export CSV
            </button>
            <button class="btn btn-secondary" onclick="window.ppeTrackingEngine.openModal()" style="font-size: 12px; padding: 6px 10px; color: #cbd5e1;" title="Refresh audit data">
              <span>🔄</span> Refresh
            </button>
          </div>
        </div>

        <!-- KPI Metric Cards Grid -->
        <div class="ppe-metrics-grid" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 10px;">
          
          <div class="ppe-stat-card ${this.currentFilter === 'all_missing' ? 'active-stat' : ''}" 
               onclick="window.ppeTrackingEngine.setFilter('all_missing')"
               style="background: ${this.currentFilter === 'all_missing' ? 'rgba(239, 68, 68, 0.22)' : 'rgba(239, 68, 68, 0.08)'}; border: 1px solid ${this.currentFilter === 'all_missing' ? '#ef4444' : 'rgba(239, 68, 68, 0.3)'}; border-radius: 8px; padding: 10px 14px; cursor: pointer; transition: all 0.15s ease;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
              <span style="font-size: 11px; font-weight: 700; color: #f87171; text-transform: uppercase; letter-spacing: 0.5px;">All Missing</span>
              <span style="font-size: 16px;">🚨</span>
            </div>
            <div style="font-size: 24px; font-weight: 800; color: #fecaca; line-height: 1;">${summary.totalMissingAny}</div>
            <div style="font-size: 11px; color: #f87171; margin-top: 4px;">Needs Gloves or Sleeves</div>
          </div>

          <div class="ppe-stat-card ${this.currentFilter === 'missing_gloves' ? 'active-stat' : ''}"
               onclick="window.ppeTrackingEngine.setFilter('missing_gloves')"
               style="background: ${this.currentFilter === 'missing_gloves' ? 'rgba(14, 165, 233, 0.22)' : 'rgba(14, 165, 233, 0.08)'}; border: 1px solid ${this.currentFilter === 'missing_gloves' ? '#0ea5e9' : 'rgba(14, 165, 233, 0.3)'}; border-radius: 8px; padding: 10px 14px; cursor: pointer; transition: all 0.15s ease;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
              <span style="font-size: 11px; font-weight: 700; color: #38bdf8; text-transform: uppercase; letter-spacing: 0.5px;">Needs Gloves</span>
              <span style="font-size: 16px;">🧤</span>
            </div>
            <div style="font-size: 24px; font-weight: 800; color: #bae6fd; line-height: 1;">${summary.totalMissingGloves}</div>
            <div style="font-size: 11px; color: #38bdf8; margin-top: 4px;">No gloves assigned</div>
          </div>

          <div class="ppe-stat-card ${this.currentFilter === 'missing_sleeves' ? 'active-stat' : ''}"
               onclick="window.ppeTrackingEngine.setFilter('missing_sleeves')"
               style="background: ${this.currentFilter === 'missing_sleeves' ? 'rgba(168, 85, 247, 0.22)' : 'rgba(168, 85, 247, 0.08)'}; border: 1px solid ${this.currentFilter === 'missing_sleeves' ? '#a855f7' : 'rgba(168, 85, 247, 0.3)'}; border-radius: 8px; padding: 10px 14px; cursor: pointer; transition: all 0.15s ease;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
              <span style="font-size: 11px; font-weight: 700; color: #c084fc; text-transform: uppercase; letter-spacing: 0.5px;">Needs Sleeves</span>
              <span style="font-size: 16px;">🦾</span>
            </div>
            <div style="font-size: 24px; font-weight: 800; color: #e9d5ff; line-height: 1;">${summary.totalMissingSleeves}</div>
            <div style="font-size: 11px; color: #c084fc; margin-top: 4px;">AP 4–7, JRY, SUP, GF, F</div>
          </div>

          <div class="ppe-stat-card ${this.currentFilter === 'missing_both' ? 'active-stat' : ''}"
               onclick="window.ppeTrackingEngine.setFilter('missing_both')"
               style="background: ${this.currentFilter === 'missing_both' ? 'rgba(225, 29, 72, 0.22)' : 'rgba(225, 29, 72, 0.08)'}; border: 1px solid ${this.currentFilter === 'missing_both' ? '#e11d48' : 'rgba(225, 29, 72, 0.3)'}; border-radius: 8px; padding: 10px 14px; cursor: pointer; transition: all 0.15s ease;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
              <span style="font-size: 11px; font-weight: 700; color: #fb7185; text-transform: uppercase; letter-spacing: 0.5px;">Needs Both</span>
              <span style="font-size: 16px;">⚠️</span>
            </div>
            <div style="font-size: 24px; font-weight: 800; color: #fecdd3; line-height: 1;">${summary.totalMissingBoth}</div>
            <div style="font-size: 11px; color: #fb7185; margin-top: 4px;">Zero rubber PPE</div>
          </div>

          <div class="ppe-stat-card ${this.currentFilter === 'fully_equipped' ? 'active-stat' : ''}"
               onclick="window.ppeTrackingEngine.setFilter('fully_equipped')"
               style="background: ${this.currentFilter === 'fully_equipped' ? 'rgba(16, 185, 129, 0.22)' : 'rgba(16, 185, 129, 0.08)'}; border: 1px solid ${this.currentFilter === 'fully_equipped' ? '#10b981' : 'rgba(16, 185, 129, 0.3)'}; border-radius: 8px; padding: 10px 14px; cursor: pointer; transition: all 0.15s ease;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
              <span style="font-size: 11px; font-weight: 700; color: #34d399; text-transform: uppercase; letter-spacing: 0.5px;">Equipped</span>
              <span style="font-size: 16px;">✅</span>
            </div>
            <div style="font-size: 24px; font-weight: 800; color: #a7f3d0; line-height: 1;">${summary.totalFullyEquipped}</div>
            <div style="font-size: 11px; color: #34d399; margin-top: 4px;">100% Compliant</div>
          </div>

          <div class="ppe-stat-card ${this.currentFilter === 'excluded' ? 'active-stat' : ''}"
               onclick="window.ppeTrackingEngine.setFilter('excluded')"
               style="background: ${this.currentFilter === 'excluded' ? 'rgba(148, 163, 184, 0.22)' : 'rgba(148, 163, 184, 0.08)'}; border: 1px solid ${this.currentFilter === 'excluded' ? '#94a3b8' : 'rgba(148, 163, 184, 0.3)'}; border-radius: 8px; padding: 10px 14px; cursor: pointer; transition: all 0.15s ease;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
              <span style="font-size: 11px; font-weight: 700; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.5px;">Excluded</span>
              <span style="font-size: 16px;">🚫</span>
            </div>
            <div style="font-size: 24px; font-weight: 800; color: #cbd5e1; line-height: 1;">${summary.totalExcluded}</div>
            <div style="font-size: 11px; color: #94a3b8; margin-top: 4px;">Exempt Personnel</div>
          </div>

          <div class="ppe-stat-card ${this.currentFilter === 'all_tracked' ? 'active-stat' : ''}"
               onclick="window.ppeTrackingEngine.setFilter('all_tracked')"
               style="background: ${this.currentFilter === 'all_tracked' ? 'rgba(59, 130, 246, 0.22)' : 'rgba(59, 130, 246, 0.08)'}; border: 1px solid ${this.currentFilter === 'all_tracked' ? '#3b82f6' : 'rgba(59, 130, 246, 0.3)'}; border-radius: 8px; padding: 10px 14px; cursor: pointer; transition: all 0.15s ease;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
              <span style="font-size: 11px; font-weight: 700; color: #60a5fa; text-transform: uppercase; letter-spacing: 0.5px;">Total Tracked</span>
              <span style="font-size: 16px;">👥</span>
            </div>
            <div style="font-size: 24px; font-weight: 800; color: #bfdbfe; line-height: 1;">${summary.totalTracked}</div>
            <div style="font-size: 11px; color: #93c5fd; margin-top: 4px;">Active Personnel${summary.totalExcluded > 0 ? ` (${summary.totalExcluded} Excluded)` : ''}</div>
          </div>

        </div>

        <!-- Filter Controls Toolbar -->
        <div class="ppe-filter-toolbar" style="display: flex; gap: 10px; align-items: center; flex-wrap: wrap; background: rgba(15, 23, 42, 0.6); border: 1px solid var(--border-color); border-radius: 8px; padding: 8px 12px;">
          
          <!-- Filter Pills -->
          <div class="ppe-filter-pills" style="display: flex; gap: 4px; align-items: center; flex-wrap: wrap;">
            <button class="filter-pill ${this.currentFilter === 'all_missing' ? 'active' : ''}" onclick="window.ppeTrackingEngine.setFilter('all_missing')">
              🚨 All Missing (${summary.totalMissingAny})
            </button>
            <button class="filter-pill ${this.currentFilter === 'missing_gloves' ? 'active' : ''}" onclick="window.ppeTrackingEngine.setFilter('missing_gloves')">
              🧤 Needs Gloves (${summary.totalMissingGloves})
            </button>
            <button class="filter-pill ${this.currentFilter === 'missing_sleeves' ? 'active' : ''}" onclick="window.ppeTrackingEngine.setFilter('missing_sleeves')">
              🦾 Needs Sleeves (${summary.totalMissingSleeves})
            </button>
            <button class="filter-pill ${this.currentFilter === 'missing_both' ? 'active' : ''}" onclick="window.ppeTrackingEngine.setFilter('missing_both')">
              ⚠️ Needs Both (${summary.totalMissingBoth})
            </button>
            <button class="filter-pill ${this.currentFilter === 'fully_equipped' ? 'active' : ''}" onclick="window.ppeTrackingEngine.setFilter('fully_equipped')">
              ✅ Equipped (${summary.totalFullyEquipped})
            </button>
            <button class="filter-pill ${this.currentFilter === 'excluded' ? 'active' : ''}" onclick="window.ppeTrackingEngine.setFilter('excluded')" style="${summary.totalExcluded > 0 ? 'border-color: rgba(148, 163, 184, 0.45); color: #cbd5e1;' : ''}">
              🚫 Excluded (${summary.totalExcluded})
            </button>
            <button class="filter-pill ${this.currentFilter === 'all_tracked' ? 'active' : ''}" onclick="window.ppeTrackingEngine.setFilter('all_tracked')">
              All (${records.length})
            </button>
          </div>

          <div style="margin-left: auto; display: flex; gap: 8px; align-items: center; flex-wrap: wrap;">
            <!-- Classification Select -->
            <select class="filter-select" style="font-size: 11.5px; padding: 5px 8px;" onchange="window.ppeTrackingEngine.setClassificationFilter(this.value)">
              <option value="all" ${this.classificationFilter === 'all' ? 'selected' : ''}>All Classifications</option>
              <option value="ap1_3" ${this.classificationFilter === 'ap1_3' ? 'selected' : ''}>AP 1–3 (Gloves Only)</option>
              <option value="ap4_7" ${this.classificationFilter === 'ap4_7' ? 'selected' : ''}>AP 4–7 (Gloves & Sleeves)</option>
              <option value="jry" ${this.classificationFilter === 'jry' ? 'selected' : ''}>Journeyman (JRY / JL)</option>
              <option value="f" ${this.classificationFilter === 'f' ? 'selected' : ''}>Foreman (F / GTO F)</option>
              <option value="gf" ${this.classificationFilter === 'gf' ? 'selected' : ''}>General Foreman (GF)</option>
              <option value="sup" ${this.classificationFilter === 'sup' ? 'selected' : ''}>Supervisor / Supt (SUP)</option>
              <option value="supervision_foreman" ${this.classificationFilter === 'supervision_foreman' ? 'selected' : ''}>All Supervision (SUP/GF/F)</option>
            </select>

            <!-- Location Select -->
            <select class="filter-select" style="font-size: 11.5px; padding: 5px 8px;" onchange="window.ppeTrackingEngine.setLocationFilter(this.value)">
              <option value="all" ${this.locationFilter === 'all' ? 'selected' : ''}>All Locations (${locations.length})</option>
              ${locations.map(loc => `
                <option value="${this.escapeHtml(loc)}" ${this.locationFilter === loc ? 'selected' : ''}>${this.escapeHtml(loc)}</option>
              `).join('')}
            </select>

            <!-- Live Search Box -->
            <div style="position: relative;">
              <input type="text" 
                     placeholder="Search employee, job, size..." 
                     value="${this.escapeHtml(this.searchQuery)}"
                     oninput="window.ppeTrackingEngine.setSearchQuery(this.value)"
                     style="font-size: 12px; padding: 5px 26px 5px 8px; background: var(--bg-tertiary); border: 1px solid var(--border-color); color: #fff; border-radius: 4px; width: 170px;">
              ${this.searchQuery ? `
                <span onclick="window.ppeTrackingEngine.setSearchQuery('')" style="position: absolute; right: 6px; top: 50%; transform: translateY(-50%); color: #94a3b8; cursor: pointer; font-size: 11px;">✕</span>
              ` : ''}
            </div>
          </div>
        </div>

        <!-- Table View or Empty State -->
        <div class="ppe-table-card" style="background: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: 8px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.25);">
          
          <div style="padding: 10px 14px; background: rgba(0,0,0,0.15); border-bottom: 1px solid var(--border-color); display: flex; justify-content: space-between; align-items: center;">
            <div style="font-size: 13px; font-weight: 700; color: #f8fafc; display: flex; align-items: center; gap: 8px;">
              <span>👥</span>
              <span>Tracked Employees List</span>
              <span class="badge" style="background: rgba(59, 130, 246, 0.2); color: #93c5fd; font-size: 11px; padding: 1px 7px; border-radius: 10px;">
                Showing ${filteredRecords.length} of ${records.length}
              </span>
            </div>
            ${this.searchQuery || this.classificationFilter !== 'all' || this.locationFilter !== 'all' || this.currentFilter !== 'all_missing' ? `
              <button class="btn btn-xs btn-secondary" onclick="window.ppeTrackingEngine.resetFilters()" style="font-size: 11px; padding: 2px 8px; color: #94a3b8;">
                ✕ Reset Filters
              </button>
            ` : ''}
          </div>

          <div style="overflow-x: auto; max-height: 52vh;">
            <table class="data-table" style="width: 100%; border-collapse: collapse; font-size: 12.5px; text-align: left;">
              <thead>
                <tr style="background: var(--bg-tertiary); position: sticky; top: 0; z-index: 10; border-bottom: 2px solid var(--border-color);">
                  <th style="padding: 10px 12px; font-weight: 700; color: #cbd5e1;">Employee</th>
                  <th style="padding: 10px 12px; font-weight: 700; color: #cbd5e1;">Classification & Rule</th>
                  <th style="padding: 10px 12px; font-weight: 700; color: #cbd5e1;">Job / Crew</th>
                  <th style="padding: 10px 12px; font-weight: 700; color: #cbd5e1;">Location</th>
                  <th style="padding: 10px 12px; font-weight: 700; color: #cbd5e1;">Rubber Gloves</th>
                  <th style="padding: 10px 12px; font-weight: 700; color: #cbd5e1;">Rubber Sleeves</th>
                  <th style="padding: 10px 12px; font-weight: 700; color: #cbd5e1;">Status</th>
                  <th style="padding: 10px 12px; font-weight: 700; color: #cbd5e1; text-align: right;">Quick Actions</th>
                </tr>
              </thead>
              <tbody>
                ${filteredRecords.length === 0 ? `
                  <tr>
                    <td colspan="8" style="padding: 40px 20px; text-align: center; color: var(--text-muted);">
                      <div style="font-size: 32px; margin-bottom: 8px;">🎉</div>
                      <div style="font-size: 15px; font-weight: 700; color: #f8fafc; margin-bottom: 4px;">
                        ${this.currentFilter === 'excluded'
                          ? 'No Excluded Employees'
                          : (this.currentFilter === 'all_missing' || this.currentFilter === 'missing_gloves' || this.currentFilter === 'missing_sleeves' ? 'No Missing Equipment!' : 'No Employees Match the Current Filters')}
                      </div>
                      <div style="font-size: 12.5px; color: #94a3b8; max-width: 480px; margin: 0 auto;">
                        ${this.currentFilter === 'excluded'
                          ? 'No employees are currently excluded from Rubber PPE compliance tracking. Click "🚫 Exclude" on any employee row or "Manage Exclusions" above to exempt personnel.'
                          : (this.currentFilter === 'all_missing' 
                            ? 'All active employees in the selected classifications are fully equipped with their required rubber gloves and sleeves.' 
                            : 'Try clearing your search query or selecting a different filter above.')}
                      </div>
                    </td>
                  </tr>
                ` : filteredRecords.map((r, idx) => this.renderTableRow(r, idx)).join('')}
              </tbody>
            </table>
          </div>

        </div>

      </div>
    `;
  }

  /**
   * Renders a single row in the tracking table
   */
  renderTableRow(r, idx) {
    const bg = idx % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)';
    const clsMeta = r.classMeta;

    // Classification badge color
    let clsBadgeStyle = 'background: rgba(59, 130, 246, 0.15); color: #93c5fd; border: 1px solid rgba(59, 130, 246, 0.3);';
    if (clsMeta.tier === 'ap1_3') {
      clsBadgeStyle = 'background: rgba(16, 185, 129, 0.15); color: #6ee7b7; border: 1px solid rgba(16, 185, 129, 0.3);';
    } else if (clsMeta.tier === 'ap4_7') {
      clsBadgeStyle = 'background: rgba(245, 158, 11, 0.15); color: #fcd34d; border: 1px solid rgba(245, 158, 11, 0.35);';
    } else if (clsMeta.tier === 'jry') {
      clsBadgeStyle = 'background: rgba(14, 165, 233, 0.18); color: #7dd3fc; border: 1px solid rgba(56, 189, 248, 0.4);';
    } else if (clsMeta.tier === 'f') {
      clsBadgeStyle = 'background: rgba(99, 102, 241, 0.18); color: #a5b4fc; border: 1px solid rgba(99, 102, 241, 0.35);';
    } else if (clsMeta.tier === 'gf' || clsMeta.tier === 'sup') {
      clsBadgeStyle = 'background: rgba(168, 85, 247, 0.18); color: #d8b4fe; border: 1px solid rgba(168, 85, 247, 0.35);';
    }

    // Gloves column cell
    let glovesCell = '';
    if (r.hasGloves) {
      glovesCell = `
        <div style="display: flex; flex-direction: column; gap: 3px;">
          ${r.assignedGloves.map(g => `
            <div style="display: flex; align-items: center; gap: 5px; flex-wrap: wrap;">
              <span class="badge" style="background: rgba(16, 185, 129, 0.15); color: #34d399; font-weight: 700; font-size: 11px; padding: 1px 6px; border-radius: 3px;">
                🧤 #${this.escapeHtml(g.itemNum)}
              </span>
              <span style="font-size: 11px; color: #94a3b8;">
                Sz ${this.escapeHtml(g.size)} · Cl ${this.escapeHtml(g.classVal)}
              </span>
              ${g.changeOutDate && g.changeOutDate !== '—' ? `
                <span class="badge" style="background: rgba(255,255,255,0.06); color: #cbd5e1; font-size: 10px; padding: 1px 4px; border-radius: 3px;" title="Change-out due date">
                  📅 ${this.escapeHtml(g.changeOutDate)}
                </span>
              ` : ''}
            </div>
          `).join('')}
        </div>
      `;
    } else {
      glovesCell = `
        <div style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">
          <span class="badge" style="background: rgba(239, 68, 68, 0.15); color: #f87171; border: 1px solid rgba(239, 68, 68, 0.35); font-size: 11px; font-weight: 700; padding: 2px 6px; border-radius: 4px;">
            ❌ Not Assigned
          </span>
          <span style="font-size: 11px; color: #94a3b8;" title="Preferred Glove Size on file">
            Size: <strong style="color: #f1f5f9;">${this.escapeHtml(r.gloveSize)}</strong>
          </span>
          <button class="btn btn-xs" 
                  onclick="window.ppeTrackingEngine.promptQuickAssign('${this.escapeJs(r.name)}', 'gloves', '${this.escapeJs(r.gloveSize)}', '${this.escapeJs(r.location)}')"
                  style="background: rgba(59, 130, 246, 0.15); border: 1px solid rgba(59, 130, 246, 0.35); color: #93c5fd; padding: 2px 7px; font-size: 11px; border-radius: 3px; cursor: pointer;"
                  title="Assign an on-shelf glove to ${this.escapeHtml(r.name)}">
            ➕ Assign
          </button>
        </div>
      `;
    }

    // Sleeves column cell
    let sleevesCell = '';
    if (!clsMeta.needsSleeves) {
      // AP 1-3 only need gloves and NOT sleeves
      sleevesCell = `
        <div style="display: flex; align-items: center; gap: 5px;">
          <span class="badge" style="background: rgba(148, 163, 184, 0.12); color: #94a3b8; border: 1px dashed rgba(148, 163, 184, 0.3); font-size: 10.5px; padding: 2px 7px; border-radius: 4px;" title="Rule: AP 1–3 only require rubber gloves. Sleeves become mandatory at AP 4.">
            ⚪ Not Required (AP 1–3)
          </span>
        </div>
      `;
    } else if (r.hasSleeves) {
      sleevesCell = `
        <div style="display: flex; flex-direction: column; gap: 3px;">
          ${r.assignedSleeves.map(s => `
            <div style="display: flex; align-items: center; gap: 5px; flex-wrap: wrap;">
              <span class="badge" style="background: rgba(16, 185, 129, 0.15); color: #34d399; font-weight: 700; font-size: 11px; padding: 1px 6px; border-radius: 3px;">
                🦾 #${this.escapeHtml(s.itemNum)}
              </span>
              <span style="font-size: 11px; color: #94a3b8;">
                Sz ${this.escapeHtml(s.size)} · Cl ${this.escapeHtml(s.classVal)}
              </span>
              ${s.changeOutDate && s.changeOutDate !== '—' ? `
                <span class="badge" style="background: rgba(255,255,255,0.06); color: #cbd5e1; font-size: 10px; padding: 1px 4px; border-radius: 3px;" title="Change-out due date">
                  📅 ${this.escapeHtml(s.changeOutDate)}
                </span>
              ` : ''}
            </div>
          `).join('')}
        </div>
      `;
    } else {
      sleevesCell = `
        <div style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">
          <span class="badge" style="background: rgba(239, 68, 68, 0.15); color: #f87171; border: 1px solid rgba(239, 68, 68, 0.35); font-size: 11px; font-weight: 700; padding: 2px 6px; border-radius: 4px;">
            ❌ Not Assigned
          </span>
          <span style="font-size: 11px; color: #94a3b8;" title="Preferred Sleeve Size on file">
            Size: <strong style="color: #f1f5f9;">${this.escapeHtml(r.sleeveSize)}</strong>
          </span>
          <button class="btn btn-xs" 
                  onclick="window.ppeTrackingEngine.promptQuickAssign('${this.escapeJs(r.name)}', 'sleeves', '${this.escapeJs(r.sleeveSize)}', '${this.escapeJs(r.location)}')"
                  style="background: rgba(168, 85, 247, 0.15); border: 1px solid rgba(168, 85, 247, 0.35); color: #d8b4fe; padding: 2px 7px; font-size: 11px; border-radius: 3px; cursor: pointer;"
                  title="Assign an on-shelf sleeve to ${this.escapeHtml(r.name)}">
            ➕ Assign
          </button>
        </div>
      `;
    }

    // Overall status pill
    let overallBadge = '';
    if (r.isExcluded) {
      overallBadge = `
        <span class="badge" style="background: rgba(148, 163, 184, 0.18); color: #cbd5e1; border: 1px dashed rgba(148, 163, 184, 0.45); font-weight: 700; font-size: 11px; padding: 3px 8px; border-radius: 4px;" title="Exempt / Excluded from Rubber PPE compliance tracking">
          🚫 Excluded
        </span>
      `;
    } else if (r.isMissingBoth) {
      overallBadge = `
        <span class="badge" style="background: rgba(239, 68, 68, 0.2); color: #fca5a5; border: 1px solid rgba(239, 68, 68, 0.45); font-weight: 700; font-size: 11px; padding: 3px 8px; border-radius: 4px;">
          🚨 Needs Both
        </span>
      `;
    } else if (r.missingGloves) {
      overallBadge = `
        <span class="badge" style="background: rgba(14, 165, 233, 0.2); color: #38bdf8; border: 1px solid rgba(14, 165, 233, 0.45); font-weight: 700; font-size: 11px; padding: 3px 8px; border-radius: 4px;">
          🧤 Needs Gloves
        </span>
      `;
    } else if (r.missingSleeves) {
      overallBadge = `
        <span class="badge" style="background: rgba(168, 85, 247, 0.2); color: #d8b4fe; border: 1px solid rgba(168, 85, 247, 0.45); font-weight: 700; font-size: 11px; padding: 3px 8px; border-radius: 4px;">
          🦾 Needs Sleeves
        </span>
      `;
    } else {
      overallBadge = `
        <span class="badge" style="background: rgba(16, 185, 129, 0.2); color: #6ee7b7; border: 1px solid rgba(16, 185, 129, 0.4); font-weight: 700; font-size: 11px; padding: 3px 8px; border-radius: 4px;">
          ✅ Equipped
        </span>
      `;
    }

    return `
      <tr style="background: ${bg}; border-bottom: 1px solid rgba(255,255,255,0.05); transition: background 0.12s ease; ${r.isExcluded ? 'opacity: 0.85;' : ''}"
          onmouseover="this.style.background='rgba(255,255,255,0.04)';"
          onmouseout="this.style.background='${bg}';">
        
        <!-- Employee Name & Profile Link -->
        <td style="padding: 10px 12px;">
          <div style="display: flex; align-items: center; gap: 6px;">
            <a href="javascript:void(0)" 
               onclick="if(window.employeeProfileEngine){window.employeeProfileEngine.openProfileModal('${this.escapeJs(r.name)}');}"
               style="color: #60a5fa; font-weight: 700; text-decoration: none; cursor: pointer; display: inline-flex; align-items: center; gap: 4px;"
               onmouseover="this.style.textDecoration='underline';"
               onmouseout="this.style.textDecoration='none';"
               title="Open Employee Dossier & Equipment Profile">
              <span>👤</span>
              <span>${this.escapeHtml(r.name)}</span>
            </a>
            ${r.crewLead === 'Yes' ? '<span title="Crew Lead" style="font-size: 11px;">👑</span>' : ''}
          </div>
        </td>

        <!-- Classification & Rule -->
        <td style="padding: 10px 12px;">
          <div style="display: flex; flex-direction: column; gap: 2px;">
            <div style="display: flex; align-items: center; gap: 6px;">
              <span class="badge" style="${clsBadgeStyle} font-size: 11px; font-weight: 800; padding: 1px 7px; border-radius: 3px;">
                ${this.escapeHtml(clsMeta.code)}
              </span>
              <span style="font-size: 11px; color: #94a3b8; font-weight: 500;">
                ${this.escapeHtml(clsMeta.label)}
              </span>
            </div>
            <div style="font-size: 10px; color: ${clsMeta.tier === 'ap1_3' ? '#4ade80' : '#fbbf24'};">
              ${this.escapeHtml(clsMeta.ruleSummary)}
            </div>
          </div>
        </td>

        <!-- Job / Crew -->
        <td style="padding: 10px 12px;">
          <span style="font-family: monospace; font-size: 11.5px; color: #93c5fd; background: rgba(59, 130, 246, 0.1); border: 1px solid rgba(59, 130, 246, 0.2); padding: 1px 5px; border-radius: 3px;">
            ${this.escapeHtml(r.jobNumber)}
          </span>
        </td>

        <!-- Location -->
        <td style="padding: 10px 12px; color: #cbd5e1; font-size: 12px;">
          📍 ${this.escapeHtml(r.location)}
        </td>

        <!-- Rubber Gloves -->
        <td style="padding: 10px 12px;">
          ${glovesCell}
        </td>

        <!-- Rubber Sleeves -->
        <td style="padding: 10px 12px;">
          ${sleevesCell}
        </td>

        <!-- Overall Status -->
        <td style="padding: 10px 12px;">
          ${overallBadge}
        </td>

        <!-- Quick Actions -->
        <td style="padding: 10px 12px; text-align: right;">
          <div style="display: inline-flex; align-items: center; gap: 5px;">
            <button class="btn btn-xs btn-secondary" 
                    onclick="if(window.employeeProfileEngine){window.employeeProfileEngine.openProfileModal('${this.escapeJs(r.name)}');}"
                    style="font-size: 11px; padding: 3px 8px; color: #93c5fd; border-color: rgba(59, 130, 246, 0.35);"
                    title="View complete employee equipment profile">
              👤 Dossier
            </button>
            ${r.isExcluded ? `
              <button class="btn btn-xs" 
                      onclick="window.ppeTrackingEngine.setEmployeeExcluded('${this.escapeJs(r.name)}', false)"
                      style="background: rgba(16, 185, 129, 0.15); border: 1px solid rgba(16, 185, 129, 0.4); color: #6ee7b7; font-size: 11px; padding: 3px 8px; border-radius: 4px; cursor: pointer; display: inline-flex; align-items: center; gap: 3px;"
                      title="Include ${this.escapeHtml(r.name)} back in Rubber PPE compliance tracking">
                <span>↩</span> Include
              </button>
            ` : `
              ${r.missingGloves ? `
                <button class="btn btn-xs" 
                        onclick="window.ppeTrackingEngine.promptQuickAssign('${this.escapeJs(r.name)}', 'gloves', '${this.escapeJs(r.gloveSize)}', '${this.escapeJs(r.location)}')"
                        style="background: #2563eb; color: #fff; font-size: 11px; padding: 3px 8px; border-radius: 4px; border: none; cursor: pointer;"
                        title="Quick assign available rubber gloves">
                  + Glove
                </button>
              ` : ''}
              ${r.missingSleeves ? `
                <button class="btn btn-xs" 
                        onclick="window.ppeTrackingEngine.promptQuickAssign('${this.escapeJs(r.name)}', 'sleeves', '${this.escapeJs(r.sleeveSize)}', '${this.escapeJs(r.location)}')"
                        style="background: #7c3aed; color: #fff; font-size: 11px; padding: 3px 8px; border-radius: 4px; border: none; cursor: pointer;"
                        title="Quick assign available rubber sleeves">
                  + Sleeve
                </button>
              ` : ''}
              <button class="btn btn-xs btn-secondary" 
                      onclick="window.ppeTrackingEngine.promptExcludeEmployee('${this.escapeJs(r.name)}')"
                      style="font-size: 11px; padding: 3px 7px; color: #94a3b8; border-color: rgba(148, 163, 184, 0.35); cursor: pointer;"
                      title="Exclude ${this.escapeHtml(r.name)} from Rubber PPE compliance tracking">
                🚫 Exclude
              </button>
            `}
          </div>
        </td>

      </tr>
    `;
  }

  resetFilters() {
    this.currentFilter = 'all_missing';
    this.classificationFilter = 'all';
    this.locationFilter = 'all';
    this.searchQuery = '';
    const body = document.getElementById('rubber-ppe-modal-body');
    if (body) this.renderModalContent(body);
  }

  /**
   * Prompts quick assignment modal for gloves or sleeves
   */
  promptQuickAssign(empName, itemType, preferredSize, location) {
    this.activeAssignTarget = {
      empName,
      itemType, // 'gloves' | 'sleeves'
      preferredSize: preferredSize && preferredSize !== '—' ? preferredSize : '',
      location: location || 'Helena'
    };

    const modal = document.getElementById('ppe-quick-assign-modal');
    const body = document.getElementById('ppe-quick-assign-modal-body');
    const title = document.getElementById('ppe-quick-assign-modal-title');
    if (!modal || !body) return;

    const itemLabel = itemType === 'gloves' ? 'Rubber Glove' : 'Rubber Sleeve';
    if (title) {
      title.innerHTML = `<span>➕</span> Assign ${itemLabel} to <strong>${this.escapeHtml(empName)}</strong>`;
    }

    this.renderQuickAssignContent(body);
    modal.classList.add('active');
  }

  closeQuickAssignModal() {
    const modal = document.getElementById('ppe-quick-assign-modal');
    if (modal) modal.classList.remove('active');
    this.activeAssignTarget = null;
  }

  /**
   * Renders available inventory in the quick assignment modal
   */
  renderQuickAssignContent(container) {
    if (!container || !this.activeAssignTarget) return;
    const { empName, itemType, preferredSize, location } = this.activeAssignTarget;
    const snap = this.db.getSnapshot();
    const sheetKey = itemType === 'gloves' ? 'gloves' : 'sleeves';
    const table = snap?.tables?.[sheetKey];
    const rows = table?.rows || [];

    // Filter items that are currently On Shelf
    const onShelfItems = rows.filter(r => {
      const status = String(r['Status'] || '').trim().toLowerCase();
      const assignedTo = String(r['Assigned To'] || r['Holder'] || '').trim().toLowerCase();
      return status === 'on shelf' || assignedTo === 'on shelf' || assignedTo === '';
    });

    // Sort by matching size first
    onShelfItems.sort((a, b) => {
      const sizeA = String(a['Size'] || '').trim().toLowerCase();
      const sizeB = String(b['Size'] || '').trim().toLowerCase();
      const pref = String(preferredSize || '').trim().toLowerCase();

      const matchA = pref && sizeA === pref;
      const matchB = pref && sizeB === pref;
      if (matchA && !matchB) return -1;
      if (!matchA && matchB) return 1;
      return String(a['Glove'] || a['Sleeve'] || a['Item #'] || '').localeCompare(String(b['Glove'] || b['Sleeve'] || b['Item #'] || ''));
    });

    container.innerHTML = `
      <div style="display: flex; flex-direction: column; gap: 14px;">
        <div style="background: rgba(59, 130, 246, 0.1); border: 1px solid rgba(59, 130, 246, 0.25); border-radius: 6px; padding: 10px 14px; font-size: 12.5px; color: #cbd5e1; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px;">
          <div>
            Assigning to: <strong style="color: #60a5fa;">${this.escapeHtml(empName)}</strong>
            <span style="margin: 0 6px; color: #475569;">•</span>
            Location: <strong style="color: #f1f5f9;">${this.escapeHtml(location)}</strong>
            <span style="margin: 0 6px; color: #475569;">•</span>
            Preferred Size: <strong style="color: #fbbf24;">${this.escapeHtml(preferredSize || 'Not specified')}</strong>
          </div>
          <div style="font-size: 11.5px; color: #94a3b8;">
            Available On Shelf: <strong style="color: #34d399;">${onShelfItems.length}</strong>
          </div>
        </div>

        <div style="max-height: 48vh; overflow-y: auto; border: 1px solid var(--border-color); border-radius: 6px;">
          ${onShelfItems.length === 0 ? `
            <div style="padding: 30px; text-align: center; color: var(--text-muted);">
              <div style="font-size: 28px; margin-bottom: 8px;">📦</div>
              <div style="font-size: 14px; font-weight: 700; color: #f8fafc; margin-bottom: 4px;">No On-Shelf Items Available</div>
              <div style="font-size: 12px; color: #94a3b8;">There are currently no items with status "On Shelf" in the ${itemType} inventory.</div>
            </div>
          ` : `
            <table class="data-table" style="width: 100%; border-collapse: collapse; font-size: 12px;">
              <thead>
                <tr style="background: var(--bg-tertiary); position: sticky; top: 0; z-index: 5; border-bottom: 1px solid var(--border-color);">
                  <th style="padding: 8px 10px; color: #cbd5e1;">Item #</th>
                  <th style="padding: 8px 10px; color: #cbd5e1;">ESL ID</th>
                  <th style="padding: 8px 10px; color: #cbd5e1;">Size</th>
                  <th style="padding: 8px 10px; color: #cbd5e1;">Class</th>
                  <th style="padding: 8px 10px; color: #cbd5e1;">Test Date</th>
                  <th style="padding: 8px 10px; color: #cbd5e1;">Location</th>
                  <th style="padding: 8px 10px; text-align: right; color: #cbd5e1;">Action</th>
                </tr>
              </thead>
              <tbody>
                ${onShelfItems.map((item, idx) => {
                  const itNum = this.getItemIdentifier(item);
                  const eslId = String(item['ESL ID'] || '—').trim();
                  const size = String(item['Size'] || '—').trim();
                  const classVal = String(item['Class'] || '—').trim();
                  const testDate = String(item['Test Date'] || '—').trim();
                  const loc = String(item['Location'] || 'Helena').trim();

                  const isPreferredMatch = preferredSize && size.toLowerCase() === preferredSize.toLowerCase();
                  const rowBg = isPreferredMatch ? 'rgba(59, 130, 246, 0.08)' : (idx % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)');

                  return `
                    <tr style="background: ${rowBg}; border-bottom: 1px solid rgba(255,255,255,0.04);">
                      <td style="padding: 8px 10px; font-weight: 700; color: #60a5fa;">
                        #${this.escapeHtml(itNum)}
                      </td>
                      <td style="padding: 8px 10px; color: #94a3b8; font-family: monospace;">
                        ${this.escapeHtml(eslId)}
                      </td>
                      <td style="padding: 8px 10px;">
                        <span style="font-weight: ${isPreferredMatch ? '800' : '500'}; color: ${isPreferredMatch ? '#fbbf24' : '#f1f5f9'};">
                          ${this.escapeHtml(size)}
                        </span>
                        ${isPreferredMatch ? `
                          <span class="badge" style="background: rgba(245, 158, 11, 0.2); color: #fbbf24; font-size: 9px; padding: 1px 4px; border-radius: 3px; margin-left: 4px;">
                            ★ Match
                          </span>
                        ` : ''}
                      </td>
                      <td style="padding: 8px 10px; color: #cbd5e1;">
                        Cl ${this.escapeHtml(classVal)}
                      </td>
                      <td style="padding: 8px 10px; color: #cbd5e1;">
                        ${this.escapeHtml(testDate)}
                      </td>
                      <td style="padding: 8px 10px; color: #94a3b8;">
                        ${this.escapeHtml(loc)}
                      </td>
                      <td style="padding: 8px 10px; text-align: right;">
                        <button class="btn btn-xs btn-primary"
                                onclick="window.ppeTrackingEngine.executeQuickAssign('${this.escapeJs(itNum)}', '${this.escapeJs(sheetKey)}')"
                                style="font-size: 11px; padding: 3px 10px; font-weight: 700;">
                          Assign to ${this.escapeHtml(empName.split(' ')[0])}
                        </button>
                      </td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
          `}
        </div>
      </div>
    `;
  }

  /**
   * Executes the item assignment to the employee
   */
  async executeQuickAssign(itemIdentifier, sheetKey) {
    if (!this.activeAssignTarget) return;
    const { empName, location } = this.activeAssignTarget;

    let assignDetails = null;
    if (window.sheetNavigator && typeof window.sheetNavigator.promptAssignItemDetails === 'function') {
      assignDetails = await window.sheetNavigator.promptAssignItemDetails(itemIdentifier, empName, location);
    } else {
      const today = new Date();
      const todayFormatted = `${String(today.getMonth() + 1).padStart(2, '0')}/${String(today.getDate()).padStart(2, '0')}/${today.getFullYear()}`;
      assignDetails = { dateAssigned: todayFormatted, location };
    }

    if (!assignDetails) return; // User cancelled prompt

    const chosenDate = assignDetails.dateAssigned;
    const chosenLoc = assignDetails.location || location || 'Helena';

    const snap = this.db.getSnapshot();
    const table = snap?.tables?.[sheetKey];
    if (!table || !table.rows) return;

    // Locate the row in table
    const targetRow = table.rows.find(r => this.getItemIdentifier(r) === itemIdentifier);
    if (!targetRow) {
      alert(`⚠️ Item #${itemIdentifier} could not be located in ${sheetKey} table.`);
      return;
    }

    // Determine column names
    const headers = table.headers || Object.keys(targetRow);
    const assignedCol = headers.find(h => /^(assigned\s*to|holder|assigned)$/i.test(h)) || 'Assigned To';
    const statusCol = headers.find(h => /^status$/i.test(h)) || 'Status';
    const locCol = headers.find(h => /^location$/i.test(h)) || 'Location';
    const dateAssignedCol = headers.find(h => /^(date\s*assigned|date)$/i.test(h)) || 'Date Assigned';
    const chgOutCol = headers.find(h => /^(change\s*out\s*date|changeout\s*date)$/i.test(h)) || 'Change Out Date';
    const pickedCol = headers.find(h => /^picked\s*for$/i.test(h)) || 'Picked For';
    const testDateCol = headers.find(h => /^test\s*date$/i.test(h)) || 'Test Date';

    // Apply updates
    targetRow[assignedCol] = empName;
    targetRow[statusCol] = 'Assigned';
    targetRow[locCol] = chosenLoc;
    targetRow[dateAssignedCol] = chosenDate;
    if (pickedCol) targetRow[pickedCol] = '';

    // Calculate Change Out Date
    const testDateVal = testDateCol ? (targetRow[testDateCol] || '') : '';
    if (window.inventoryManager && typeof window.inventoryManager.calculateChangeOutDate === 'function') {
      const calc = window.inventoryManager.calculateChangeOutDate(
        chosenDate || testDateVal,
        chosenLoc,
        empName,
        sheetKey,
        { testDate: testDateVal }
      );
      if (calc && calc !== 'N/A' && chgOutCol) {
        targetRow[chgOutCol] = calc;
      }
    }

    // Queue synchronization mutations
    if (typeof this.db.queueMutation === 'function') {
      const actualRowIdx = targetRow._rowIdx || 2;
      const getColNum = (hName) => (headers.indexOf(hName) + 1);

      await this.db.queueMutation({ type: 'UPDATE_CELL', sheet: table.name || sheetKey, row: actualRowIdx, col: getColNum(assignedCol), value: empName });
      await this.db.queueMutation({ type: 'UPDATE_CELL', sheet: table.name || sheetKey, row: actualRowIdx, col: getColNum(statusCol), value: 'Assigned' });
      await this.db.queueMutation({ type: 'UPDATE_CELL', sheet: table.name || sheetKey, row: actualRowIdx, col: getColNum(locCol), value: chosenLoc });
      await this.db.queueMutation({ type: 'UPDATE_CELL', sheet: table.name || sheetKey, row: actualRowIdx, col: getColNum(dateAssignedCol), value: chosenDate });
      if (pickedCol) await this.db.queueMutation({ type: 'UPDATE_CELL', sheet: table.name || sheetKey, row: actualRowIdx, col: getColNum(pickedCol), value: '' });
      if (chgOutCol && targetRow[chgOutCol]) {
        await this.db.queueMutation({ type: 'UPDATE_CELL', sheet: table.name || sheetKey, row: actualRowIdx, col: getColNum(chgOutCol), value: targetRow[chgOutCol] });
      }
    }

    // Record history event
    if (typeof this.db.recordItemHistoryEvent === 'function') {
      try {
        await this.db.recordItemHistoryEvent(table.name || sheetKey, targetRow, `Assigned to ${empName}`);
      } catch (e) {
        console.warn('History recording note:', e);
      }
    }

    // Persist snapshot
    if (typeof this.db.persistSnapshot === 'function') {
      await this.db.persistSnapshot(snap);
    }

    // Sync to Trip Planner as a completed task & notify Daily Accomplishments
    try {
      await this.recordAssignmentToTripPlanner({
        empName,
        sheetKey,
        itemIdentifier,
        chosenDate,
        chosenLoc,
        targetRow
      });
    } catch (err) {
      console.warn('Trip planner recording note:', err);
    }

    this.closeQuickAssignModal();

    // Re-render modal and update toolbar badge
    this.compileAuditData();
    const modalBody = document.getElementById('rubber-ppe-modal-body');
    if (modalBody) this.renderModalContent(modalBody);
    this.updateToolbarBadge();

    // If sheets view is open, refresh view
    if (window.sheetNavigator && typeof window.sheetNavigator.renderCurrentSheet === 'function') {
      window.sheetNavigator.renderCurrentSheet();
    }
  }

  /**
   * Records an assigned PPE item (glove or sleeve) as a completed task in the Trip Planner
   * so it appears on the Trip Planner schedule and is included in the Daily Accomplishments breakdown.
   */
  async recordAssignmentToTripPlanner({ empName, sheetKey, itemIdentifier, chosenDate, chosenLoc, targetRow }) {
    if (!empName || !sheetKey || !itemIdentifier) return;

    let dateKey = '';
    if (chosenDate) {
      const isoMatch = String(chosenDate).match(/^(\d{4})-(\d{2})-(\d{2})/);
      const usMatch = String(chosenDate).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
      if (isoMatch) {
        dateKey = `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
      } else if (usMatch) {
        dateKey = `${usMatch[3]}-${usMatch[1].padStart(2, '0')}-${usMatch[2].padStart(2, '0')}`;
      }
    }
    if (!dateKey) {
      const today = new Date();
      dateKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    }

    const snap = (this.db && typeof this.db.getSnapshot === 'function')
      ? this.db.getSnapshot()
      : (window.localDB ? window.localDB.getSnapshot() : null);
    const empTable = snap?.tables?.employees;
    let empJob = '';
    let empLocation = chosenLoc || 'Helena';
    if (empTable && empTable.rows) {
      const empRow = empTable.rows.find(r => String(r['Employee Name'] || '').trim().toLowerCase() === String(empName).trim().toLowerCase());
      if (empRow) {
        empJob = String(empRow['Job Number'] || empRow['Job #'] || '').trim();
        if (!chosenLoc && empRow['Location']) empLocation = empRow['Location'];
      }
    }

    const isGlove = sheetKey === 'gloves';
    const itemSingular = isGlove ? 'Rubber Glove' : 'Rubber Sleeve';
    const size = targetRow ? String(targetRow['Size'] || '').trim() : '';
    const classVal = targetRow ? String(targetRow['Class'] || '').trim() : '';
    const eslId = targetRow ? String(targetRow['ESL ID'] || '').trim() : '';

    let tasks = [];
    if (window.tripPlanner && typeof window.tripPlanner.loadManualTasks === 'function') {
      tasks = window.tripPlanner.loadManualTasks() || [];
    } else if (this.db && typeof this.db.getManualTasks === 'function') {
      tasks = this.db.getManualTasks() || [];
    }

    const empClean = String(empName).trim().toLowerCase();
    const keyword = isGlove ? 'glove' : 'sleeve';

    // Check if an existing pending task for this employee and equipment type is on the board
    const existingIdx = tasks.findIndex(t => {
      if (String(t.status || '').toLowerCase() === 'complete') return false;
      const tEmp = String(t.employee || '').trim().toLowerCase();
      const tTitle = String(t.title || '').toLowerCase();
      const tNotes = String(t.notes || '').toLowerCase();
      const hasEmp = tEmp === empClean || tTitle.includes(empClean) || (Array.isArray(t.assignedEmployees) && t.assignedEmployees.some(e => String(e).trim().toLowerCase() === empClean));
      if (!hasEmp) return false;
      return tTitle.includes(keyword) || tNotes.includes(keyword) || tTitle.includes('ppe');
    });

    const nowIso = new Date().toISOString();
    const specs = [];
    if (size) specs.push(`Size ${size}`);
    if (classVal) specs.push(`Class ${classVal}`);
    if (eslId && eslId !== '—') specs.push(`ESL: ${eslId}`);
    const specStr = specs.length > 0 ? ` (${specs.join(', ')})` : '';

    const noteText = `Assigned ${itemSingular} #${itemIdentifier}${specStr} to ${empName}${empJob ? ` on Crew ${empJob}` : ''} at ${empLocation}. (Recorded from Rubber PPE Tracker)`;

    if (existingIdx !== -1) {
      const t = tasks[existingIdx];
      t.status = 'Complete';
      t.completedAt = nowIso;
      t.dateKey = dateKey;
      t.date = dateKey;
      t.title = `Assigned ${itemSingular}: ${empName} (#${itemIdentifier})`;
      t.notes = t.notes ? `${t.notes}\n\n✅ ${noteText}` : noteText;
    } else {
      const newTask = {
        id: 'mt_ppe_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
        taskCategory: 'personal_task',
        title: `Assigned ${itemSingular}: ${empName} (#${itemIdentifier})`,
        certType: '',
        crewIds: empJob ? [empJob] : [],
        crewId: empJob,
        assignedEmployees: [empName],
        employee: empName,
        instructor: 'Cody Bechdol (Self)',
        assignedTo: 'Myself',
        dateKey: dateKey,
        date: dateKey,
        location: `${empLocation}${empJob ? ` (${empJob})` : ''}`,
        time: '',
        priority: 'Normal',
        notes: noteText,
        status: 'Complete',
        createdAt: nowIso,
        completedAt: nowIso
      };
      tasks.push(newTask);
    }

    if (this.db && typeof this.db.saveManualTasks === 'function') {
      await this.db.saveManualTasks(tasks);
    }

    if (window.tripPlanner) {
      window.tripPlanner.manualTasks = tasks;
      if (typeof window.tripPlanner.renderPlanner === 'function') {
        window.tripPlanner.renderPlanner();
      }
      if (typeof window.tripPlanner.notifyAccomplishmentsModal === 'function') {
        window.tripPlanner.notifyAccomplishmentsModal();
      }
    }

    if (window.timeBreakdownEngine) {
      const tbModal = document.getElementById('time-breakdown-modal');
      if (tbModal && tbModal.style.display !== 'none' && typeof window.timeBreakdownEngine.renderModal === 'function') {
        window.timeBreakdownEngine.renderModal();
      }
    }

    if (typeof window.showToast === 'function') {
      window.showToast(`✅ Assigned ${itemSingular} #${itemIdentifier} to ${empName} and recorded to Trip Planner & Accomplishments!`, 'success');
    }
  }

  /**
   * Generates and downloads a CSV of the tracked equipment audit
   */
  /**
   * Generates and downloads a CSV of the tracked equipment audit
   */
  exportToCsv() {
    const audit = this.compileAuditData();
    const records = audit?.records || [];

    const headers = [
      'Employee Name',
      'Classification',
      'Requirement Rule',
      'Job Number',
      'Location',
      'Excluded from Tracking',
      'Rubber Gloves Status',
      'Assigned Glove #',
      'Preferred Glove Size',
      'Rubber Sleeves Status',
      'Assigned Sleeve #',
      'Preferred Sleeve Size',
      'Overall Status'
    ];

    const csvRows = [headers.join(',')];

    records.forEach(r => {
      const isExcl = r.isExcluded ? 'Yes' : 'No';
      const gloveStatus = r.hasGloves ? 'Assigned' : 'Missing';
      const gloveItems = r.assignedGloves.map(g => `#${g.itemNum} (${g.size})`).join('; ') || 'None';

      let sleeveStatus = 'Missing';
      if (!r.classMeta.needsSleeves) sleeveStatus = 'Not Required (AP 1-3)';
      else if (r.hasSleeves) sleeveStatus = 'Assigned';

      const sleeveItems = r.assignedSleeves.map(s => `#${s.itemNum} (${s.size})`).join('; ') || (r.classMeta.needsSleeves ? 'None' : 'N/A');

      let overall = 'Fully Equipped';
      if (r.isExcluded) overall = 'Excluded (Exempt)';
      else if (r.isMissingBoth) overall = 'Missing Both Gloves & Sleeves';
      else if (r.missingGloves) overall = 'Missing Gloves';
      else if (r.missingSleeves) overall = 'Missing Sleeves';

      const row = [
        `"${String(r.name).replace(/"/g, '""')}"`,
        `"${String(r.classification).replace(/"/g, '""')}"`,
        `"${String(r.classMeta.ruleSummary).replace(/"/g, '""')}"`,
        `"${String(r.jobNumber).replace(/"/g, '""')}"`,
        `"${String(r.location).replace(/"/g, '""')}"`,
        `"${isExcl}"`,
        `"${gloveStatus}"`,
        `"${gloveItems.replace(/"/g, '""')}"`,
        `"${String(r.gloveSize).replace(/"/g, '""')}"`,
        `"${sleeveStatus}"`,
        `"${sleeveItems.replace(/"/g, '""')}"`,
        `"${String(r.sleeveSize).replace(/"/g, '""')}"`,
        `"${overall}"`
      ];
      csvRows.push(row.join(','));
    });

    const csvContent = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csvRows.join('\n'));
    const link = document.createElement('a');
    const todayStr = new Date().toISOString().split('T')[0];
    link.setAttribute('href', csvContent);
    link.setAttribute('download', `Rubber_PPE_Tracking_Audit_${todayStr}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  /**
   * Opens the Manage Exclusions modal
   */
  openExclusionsDialog() {
    const modal = document.getElementById('ppe-exclusions-modal');
    const body = document.getElementById('ppe-exclusions-modal-body');
    if (!modal || !body) return;

    this.renderExclusionsModalContent(body);
    modal.classList.add('active');
  }

  /**
   * Closes the Manage Exclusions modal
   */
  closeExclusionsModal() {
    const modal = document.getElementById('ppe-exclusions-modal');
    if (modal) modal.classList.remove('active');
  }

  /**
   * Renders the Manage Exclusions modal content
   */
  renderExclusionsModalContent(container) {
    if (!container) return;
    const audit = this.compileAuditData();
    const records = audit?.records || [];

    const snap = (this.db && typeof this.db.getSnapshot === 'function')
      ? this.db.getSnapshot()
      : (window.localDB ? window.localDB.getSnapshot() : null);
    const empTable = snap?.tables?.employees;
    const allEmpRows = empTable?.rows || [];

    const availableToAdd = [];
    allEmpRows.forEach(emp => {
      const name = String(emp['Employee Name'] || emp['Name'] || '').trim();
      if (!name) return;
      const loc = String(emp['Location'] || '').toLowerCase();
      if (loc === 'previous employee' || loc.includes('previous')) return;
      const norm = this.normalizeName(name);
      if (norm === 'lost' || norm === 'in testing' || norm.includes('system placeholder')) return;
      if (!this.isEmployeeExcluded(name)) {
        availableToAdd.push({
          name,
          classification: String(emp['Job Classification'] || emp['Classification'] || '—').trim(),
          job: String(emp['Job Number'] || emp['Job #'] || '—').trim(),
          location: String(emp['Location'] || 'Helena').trim()
        });
      }
    });

    availableToAdd.sort((a, b) => a.name.localeCompare(b.name));

    container.innerHTML = `
      <div style="display: flex; flex-direction: column; gap: 14px;">
        <!-- Explanation Info Banner -->
        <div style="background: rgba(148, 163, 184, 0.08); border: 1px solid rgba(148, 163, 184, 0.25); border-left: 4px solid #94a3b8; border-radius: 6px; padding: 10px 14px; font-size: 12px; color: #cbd5e1; line-height: 1.45;">
          <div style="font-weight: 700; color: #f8fafc; margin-bottom: 2px;">
            Rubber PPE Compliance Exclusions
          </div>
          Excluded employees are exempt from Rubber PPE tracking. They will not count as missing gloves or sleeves, will not reduce compliance percentages, and will not show missing equipment warning badges on crew cards.
        </div>

        <!-- Quick Presets -->
        <div style="background: rgba(15, 23, 42, 0.6); border: 1px solid var(--border-color); border-radius: 6px; padding: 10px 14px; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px;">
          <div style="font-size: 12px; font-weight: 700; color: #94a3b8;">
            ⚡ Quick Presets:
          </div>
          <div style="display: flex; gap: 6px; flex-wrap: wrap;">
            <button class="btn btn-xs btn-secondary" onclick="window.ppeTrackingEngine.excludeEmployeesByTier('sup')" style="font-size: 11px; padding: 4px 8px; color: #cbd5e1;" title="Exclude all employees with classification SUP (Superintendents/Supervisors)">
              👑 Exclude All SUP (Supervisors)
            </button>
            <button class="btn btn-xs btn-secondary" onclick="window.ppeTrackingEngine.excludeEmployeesByJobPrefix('005')" style="font-size: 11px; padding: 4px 8px; color: #cbd5e1;" title="Exclude all employees on crew prefix 005 (Office/Management/Light Duty)">
              🏢 Exclude 005- Office / Mgmt
            </button>
          </div>
        </div>

        <!-- Add Employee to Exclusions Search Bar -->
        <div style="background: var(--bg-tertiary); border: 1px solid var(--border-color); border-radius: 6px; padding: 10px 14px; display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
          <label style="font-size: 12px; font-weight: 700; color: #cbd5e1; white-space: nowrap;">
            ➕ Exclude Employee:
          </label>
          <select id="ppe-exclude-select-emp" style="flex: 1; min-width: 220px; font-size: 12px; padding: 6px 8px; background: var(--bg-secondary); border: 1px solid var(--border-color); color: #fff; border-radius: 4px;">
            <option value="">-- Select an employee to exclude --</option>
            ${availableToAdd.map(emp => `
              <option value="${this.escapeHtml(emp.name)}">${this.escapeHtml(emp.name)} (${this.escapeHtml(emp.classification)} · Crew ${this.escapeHtml(emp.job)} · ${this.escapeHtml(emp.location)})</option>
            `).join('')}
          </select>
          <button class="btn btn-sm btn-primary" onclick="
            const sel = document.getElementById('ppe-exclude-select-emp');
            if (sel && sel.value) {
              window.ppeTrackingEngine.setEmployeeExcluded(sel.value, true);
            }
          " style="font-size: 11.5px; padding: 5px 12px; font-weight: 700;">
            🚫 Exclude
          </button>
        </div>

        <!-- Currently Excluded Employees List -->
        <div style="background: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: 6px; overflow: hidden;">
          <div style="padding: 8px 12px; background: rgba(0,0,0,0.15); border-bottom: 1px solid var(--border-color); display: flex; justify-content: space-between; align-items: center;">
            <div style="font-size: 12.5px; font-weight: 700; color: #f8fafc; display: flex; align-items: center; gap: 6px;">
              <span>🚫</span>
              <span>Currently Excluded Employees</span>
              <span class="badge" style="background: rgba(148, 163, 184, 0.2); color: #cbd5e1; font-size: 10.5px; padding: 1px 6px; border-radius: 10px;">
                ${this.excludedEmployeeMap.size}
              </span>
            </div>
            ${this.excludedEmployeeMap.size > 0 ? `
              <span style="font-size: 11px; color: #94a3b8;">
                Click "↩ Include" to restore
              </span>
            ` : ''}
          </div>

          <div style="max-height: 38vh; overflow-y: auto;">
            ${this.excludedEmployeeMap.size === 0 ? `
              <div style="padding: 28px 16px; text-align: center; color: var(--text-muted);">
                <div style="font-size: 24px; margin-bottom: 6px;">🛡️</div>
                <div style="font-size: 13.5px; font-weight: 700; color: #f8fafc; margin-bottom: 3px;">No Excluded Employees</div>
                <div style="font-size: 11.5px; color: #94a3b8;">All active personnel in tracked classifications are currently monitored for Rubber PPE compliance.</div>
              </div>
            ` : `
              <table class="data-table" style="width: 100%; border-collapse: collapse; font-size: 12px;">
                <thead>
                  <tr style="background: var(--bg-tertiary); border-bottom: 1px solid var(--border-color);">
                    <th style="padding: 8px 10px; color: #cbd5e1;">Employee</th>
                    <th style="padding: 8px 10px; color: #cbd5e1;">Classification</th>
                    <th style="padding: 8px 10px; color: #cbd5e1;">Job / Crew</th>
                    <th style="padding: 8px 10px; color: #cbd5e1;">Location</th>
                    <th style="padding: 8px 10px; text-align: right; color: #cbd5e1;">Action</th>
                  </tr>
                </thead>
                <tbody>
                  ${Array.from(this.excludedEmployeeMap.values()).map(empName => {
                    const matchRec = records.find(r => this.isNameMatch(r.name, empName));
                    const cls = matchRec ? matchRec.classification : '—';
                    const job = matchRec ? matchRec.jobNumber : '—';
                    const loc = matchRec ? matchRec.location : '—';

                    return `
                      <tr style="border-bottom: 1px solid rgba(255,255,255,0.04);">
                        <td style="padding: 8px 10px; font-weight: 700; color: #f1f5f9;">
                          ${this.escapeHtml(empName)}
                        </td>
                        <td style="padding: 8px 10px; color: #94a3b8;">
                          ${this.escapeHtml(cls)}
                        </td>
                        <td style="padding: 8px 10px; color: #93c5fd; font-family: monospace;">
                          ${this.escapeHtml(job)}
                        </td>
                        <td style="padding: 8px 10px; color: #cbd5e1;">
                          ${this.escapeHtml(loc)}
                        </td>
                        <td style="padding: 8px 10px; text-align: right;">
                          <button class="btn btn-xs" onclick="window.ppeTrackingEngine.setEmployeeExcluded('${this.escapeJs(empName)}', false)" style="background: rgba(16, 185, 129, 0.15); border: 1px solid rgba(16, 185, 129, 0.35); color: #6ee7b7; font-size: 11px; padding: 2px 8px; border-radius: 4px; cursor: pointer; display: inline-flex; align-items: center; gap: 3px;">
                            <span>↩</span> Include
                          </button>
                        </td>
                      </tr>
                    `;
                  }).join('')}
                </tbody>
              </table>
            `}
          </div>
        </div>

      </div>
    `;
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

  escapeJs(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/\\/g, '\\\\')
      .replace(/'/g, "\\'")
      .replace(/"/g, '\\"')
      .replace(/\n/g, '\\n')
      .replace(/\r/g, '\\r');
  }
}

// Global instantiation & registration
if (typeof window !== 'undefined') {
  window.RubberPpeTrackingEngine = RubberPpeTrackingEngine;
}
