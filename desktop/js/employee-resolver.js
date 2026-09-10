/**
 * employee-resolver.js - Intelligent Employee Name Resolution & Autocomplete Engine
 * 
 * Provides:
 * 1. Comprehensive indexing of canonical Employee Names and Alternate Names (aliases).
 * 2. Resolution of initials (e.g. "P. Johnson" -> "Payton Johnson" / "Payton Miller-Johnson").
 * 3. Physical location linkage (e.g. correctly maps "Ennis" to Payton regardless of alias used).
 * 4. Real-time search for live cell autocomplete in Assigned To / Holder columns.
 * 5. Preservation of active assignment spellings to avoid unwanted name flips.
 */

class EmployeeNameResolver {
  constructor(db) {
    this.db = db;
    this.employees = [];
    this.indexMap = new Map(); // normalized string -> employee record + preferred name
    this.specialStatuses = [
      { name: 'On Shelf', label: 'On Shelf', icon: '📦', location: 'Helena', status: 'On Shelf' },
      { name: 'In Testing', label: 'In Testing (Arnett / JM Test)', icon: '⚡', location: 'Arnett / JM Test', status: 'In Testing' },
      { name: 'Packed For Testing', label: 'Packed For Testing (Truck)', icon: '🚚', location: "Cody's Truck", status: 'Packed For Testing' },
      { name: 'Packed For Delivery', label: 'Packed For Delivery (Truck)', icon: '🚚', location: "Cody's Truck", status: 'Packed For Delivery' },
      { name: 'Failed Rubber', label: 'Failed Rubber (Destroyed)', icon: '❌', location: 'Destroyed', status: 'Failed Rubber' },
      { name: 'Lost', label: 'Lost / Missing', icon: '❓', location: 'Lost', status: 'Lost' },
      { name: 'New', label: 'New Purchase (On Shelf)', icon: '✨', location: 'Helena', status: 'On Shelf' }
    ];
    this.init();

    // Auto-rebuild index whenever the database updates or snapshot syncs
    if (this.db && typeof this.db.subscribe === 'function') {
      this.db.subscribe(() => {
        this.rebuildIndex();
      });
    }
  }

  init() {
    this.rebuildIndex();
  }

  /**
   * Rebuilds employee index from local database
   */
  rebuildIndex() {
    this.indexMap.clear();
    this.employees = [];

    const empTable = this.db ? this.db.getTable('employees') : null;
    const rows = empTable ? (empTable.rows || []) : [];

    rows.forEach(r => {
      const canonical = String(r['Employee Name'] || r['Name'] || Object.values(r)[0] || '').trim();
      if (!canonical) return;

      const rawLoc = String(r['Location'] || 'Helena').trim();
      const location = (typeof window !== 'undefined' && window.getPhysicalLocation)
        ? window.getPhysicalLocation(rawLoc)
        : rawLoc.replace(/\s*\(.*?\)\s*/g, '').trim() || 'Helena';

      const jobClass = String(r['Job Classification'] || r['Classification'] || '').trim();
      const jobNumber = String(r['Job Number'] || '').trim();
      const phone = String(r['Phone Number'] || '').trim();

      // Dynamically locate Alternate / Alternative Names header across all known naming variations
      let altNamesRaw = '';
      for (const [k, v] of Object.entries(r)) {
        if (/^(alt(ernat(e|ive))?(\s*names?)?|also\s*known\s*as|aka|aliases?)$/i.test(k.trim())) {
          altNamesRaw = String(v || '').trim();
          if (altNamesRaw) break;
        }
      }
      if (!altNamesRaw) {
        altNamesRaw = String(r['Alternate Names'] || r['Alternative names'] || r['Alternative Names'] || r['Alternative Name'] || r['Alternate Name'] || r['Alt Names'] || r['Alt Name'] || r['Also Known As'] || r['AKA'] || '').trim();
      }

      const altNamesList = altNamesRaw
        ? altNamesRaw.split(/[;,\/]+/).map(s => s.trim()).filter(Boolean)
        : [];

      const empObj = {
        canonicalName: canonical,
        alternateNames: altNamesList,
        location: location,
        classification: jobClass,
        jobNumber: jobNumber,
        phone: phone,
        rawRow: r
      };

      this.employees.push(empObj);

      // Register all variations for this employee
      this._registerNameVariations(canonical, empObj, canonical);

      altNamesList.forEach(alt => {
        this._registerNameVariations(alt, empObj, alt);
      });
    });

    console.log(`[EmployeeResolver] Indexed ${this.employees.length} employees with ${this.indexMap.size} search tokens.`);
  }

  /**
   * Internal: registers a name and its initials/hyphenated variations into indexMap
   */
  _registerNameVariations(nameStr, empObj, preferredName) {
    if (!nameStr) return;
    const clean = nameStr.trim();
    const norm = clean.toLowerCase();

    // 1. Exact normalized name
    if (!this.indexMap.has(norm)) {
      this.indexMap.set(norm, { employee: empObj, preferredName: clean });
    }

    // Normalized without punctuation (e.g. "Payton Miller Johnson" vs "Payton Miller-Johnson")
    const noHyphen = norm.replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim();
    if (!this.indexMap.has(noHyphen)) {
      this.indexMap.set(noHyphen, { employee: empObj, preferredName: clean });
    }

    // 2. Part-based variations (First Last, First M. Last, etc.)
    const parts = clean.split(/[\s]+/);
    if (parts.length >= 2) {
      const first = parts[0];
      const last = parts[parts.length - 1];
      const fInit = first.charAt(0);

      // P. Johnson, P Johnson, P.Johnson
      const initForms = [
        `${fInit}. ${last}`.toLowerCase(),
        `${fInit} ${last}`.toLowerCase(),
        `${fInit}.${last}`.toLowerCase(),
        `${first} ${last.charAt(0)}.`.toLowerCase(),
        `${first} ${last.charAt(0)}`.toLowerCase(),
        `${last}, ${first}`.toLowerCase(),
        `${last} ${first}`.toLowerCase()
      ];

      // If parts.length >= 3 (e.g. "Jimmy James Bailey"), also automatically register First + Last!
      if (parts.length >= 3) {
        const firstLast = `${first} ${last}`.toLowerCase();
        initForms.push(firstLast);
        initForms.push(`${last}, ${first}`.toLowerCase());
        initForms.push(`${last} ${first}`.toLowerCase());
      }

      initForms.forEach(f => {
        if (!this.indexMap.has(f)) {
          this.indexMap.set(f, { employee: empObj, preferredName: clean });
        }
      });

      // Handle hyphenated last names like "Miller-Johnson"
      if (last.includes('-')) {
        const lastParts = last.split('-');
        lastParts.forEach(lp => {
          if (lp.length > 2) {
            const lpInitForm1 = `${fInit}. ${lp}`.toLowerCase();
            const lpInitForm2 = `${fInit} ${lp}`.toLowerCase();
            if (!this.indexMap.has(lpInitForm1)) {
              this.indexMap.set(lpInitForm1, { employee: empObj, preferredName: clean });
            }
            if (!this.indexMap.has(lpInitForm2)) {
              this.indexMap.set(lpInitForm2, { employee: empObj, preferredName: clean });
            }
          }
        });
      }

      // Handle hyphenated first names or compound names like "John-Michael"
      if (first.includes('-')) {
        const firstParts = first.split('-');
        firstParts.forEach(fp => {
          if (fp.length > 1) {
            const fpInitForm = `${fp.charAt(0)}. ${last}`.toLowerCase();
            if (!this.indexMap.has(fpInitForm)) {
              this.indexMap.set(fpInitForm, { employee: empObj, preferredName: clean });
            }
          }
        });
      }
    }
  }

  /**
   * Resolves an input string to an employee or special status
   * 
   * @param {string} rawInput - Name or status to resolve (e.g. "P. Johnson", "Payton Johnson", "On Shelf")
   * @param {string} currentAssignedTo - Current active assignment on the item (to preserve preferred name)
   * @returns {Object} Resolution result
   */
  resolve(rawInput, currentAssignedTo = '') {
    if (!rawInput) {
      return { match: false, isStatus: false, employeeName: '', location: 'Helena' };
    }

    const cleanInput = String(rawInput).trim().replace(/^👤\s*/, '').trim();
    if (!cleanInput) {
      return { match: false, isStatus: false, employeeName: '', location: 'Helena' };
    }

    const inputLower = cleanInput.toLowerCase();
    const noPunctLower = inputLower.replace(/[.\-_]+/g, ' ').replace(/\s+/g, ' ').trim();

    // 1. Check Special Statuses
    for (const st of this.specialStatuses) {
      const stLower = st.name.toLowerCase();
      if (inputLower === stLower || noPunctLower === stLower.replace(/[.\-_]+/g, ' ')) {
        return {
          match: true,
          isStatus: true,
          status: st.name,
          employeeName: st.name,
          location: st.location,
          notes: st.name
        };
      }
    }

    // Additional common status variants
    if (inputLower === 'shelf' || inputLower === 'onshelf' || inputLower === 'storage' || inputLower === 'unassigned') {
      return { match: true, isStatus: true, status: 'On Shelf', employeeName: 'On Shelf', location: 'Helena', notes: 'On Shelf' };
    }
    if (inputLower.includes('fail') || inputLower.includes('destroy') || inputLower.includes('not repairable')) {
      return { match: true, isStatus: true, status: 'Failed Rubber', employeeName: 'Failed Rubber', location: 'Destroyed', notes: 'Failed Rubber' };
    }
    if (inputLower.includes('test') || inputLower.includes('arnett') || inputLower.includes('jm test')) {
      return { match: true, isStatus: true, status: 'In Testing', employeeName: 'In Testing', location: 'Arnett / JM Test', notes: 'Sent to lab' };
    }
    if (inputLower.includes('lost') || inputLower.includes('missing')) {
      return { match: true, isStatus: true, status: 'Lost', employeeName: 'Lost', location: 'Lost', notes: 'Lost' };
    }

    // 2. Direct Index Lookup (Exact canonical, exact alias, or pre-computed initials/variations)
    let match = this.indexMap.get(inputLower) || this.indexMap.get(noPunctLower);

    // 3. Fallback: Check if input matches any employee or alias via token matching
    if (!match) {
      for (const emp of this.employees) {
        // Match against canonical name
        if (this._isFuzzyOrTokenMatch(cleanInput, emp.canonicalName)) {
          match = { employee: emp, preferredName: emp.canonicalName };
          break;
        }
        // Match against alternate names
        for (const alt of emp.alternateNames) {
          if (this._isFuzzyOrTokenMatch(cleanInput, alt)) {
            match = { employee: emp, preferredName: alt };
            break;
          }
        }
        if (match) break;
      }
    }

    if (match) {
      const emp = match.employee;
      let chosenName = match.preferredName || emp.canonicalName;

      // Smart Name Preservation:
      // If the item was already assigned to a recognized variation of this employee (e.g. "Payton Johnson"),
      // keep that exact assigned name rather than flipping it!
      if (currentAssignedTo) {
        const curClean = String(currentAssignedTo).trim();
        const curLower = curClean.toLowerCase();
        if (curLower === emp.canonicalName.toLowerCase()) {
          chosenName = emp.canonicalName;
        } else if (emp.alternateNames.some(alt => alt.toLowerCase() === curLower)) {
          chosenName = curClean;
        }
      }

      // If resolving from an initial like "P. Johnson" and the employee has an alias with the same last name
      // (e.g. "Payton Johnson" when canonical is "Payton Miller-Johnson"), prefer the matching alias
      if (cleanInput.includes('.') || cleanInput.length <= 12) {
        const inputParts = cleanInput.replace(/\./g, ' ').trim().split(/\s+/);
        if (inputParts.length >= 2) {
          const inputLast = inputParts[inputParts.length - 1].toLowerCase();
          for (const alt of emp.alternateNames) {
            const altLast = alt.trim().split(/\s+/).pop().toLowerCase();
            if (altLast === inputLast) {
              chosenName = alt;
              break;
            }
          }
        }
      }

      return {
        match: true,
        isStatus: false,
        employeeName: chosenName,
        canonicalName: emp.canonicalName,
        location: emp.location || 'Helena',
        classification: emp.classification || '',
        jobNumber: emp.jobNumber || '',
        phone: emp.phone || '',
        employee: emp
      };
    }

    return {
      match: false,
      isStatus: false,
      employeeName: cleanInput,
      location: 'Helena'
    };
  }

  /**
   * Helper: check if two names match via token, initials, or minor spelling variations
   */
  _isFuzzyOrTokenMatch(inputStr, targetStr) {
    if (!inputStr || !targetStr) return false;
    const inLower = inputStr.toLowerCase().trim();
    const tgLower = targetStr.toLowerCase().trim();

    if (inLower === tgLower) return true;

    // Remove punctuation
    const inTokens = inLower.replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean);
    const tgTokens = tgLower.replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean);

    if (!inTokens.length || !tgTokens.length) return false;

    // Direct First + Last matching for compound/middle names:
    // e.g. input ["jimmy", "bailey"] matches target ["jimmy", "james", "bailey"]
    if (inTokens.length === 2 && tgTokens.length >= 2) {
      if (inTokens[0] === tgTokens[0] && inTokens[1] === tgTokens[tgTokens.length - 1]) {
        return true;
      }
    }

    // Subsequence matching: all input tokens appear in target tokens in order
    if (inTokens.length >= 2 && inTokens.length < tgTokens.length) {
      let tIdx = 0;
      let matchedCount = 0;
      for (let i = 0; i < inTokens.length; i++) {
        while (tIdx < tgTokens.length && tgTokens[tIdx] !== inTokens[i]) {
          tIdx++;
        }
        if (tIdx < tgTokens.length && tgTokens[tIdx] === inTokens[i]) {
          matchedCount++;
          tIdx++;
        }
      }
      if (matchedCount === inTokens.length) return true;
    }

    // Single token initial + last: e.g. "p" + "johnson" vs "payton" + "miller" + "johnson"
    if (inTokens.length === 2 && inTokens[0].length === 1) {
      const initChar = inTokens[0];
      const inLast = inTokens[1];
      const tgLast = tgTokens[tgTokens.length - 1];
      const tgFirst = tgTokens[0];

      if (tgFirst.startsWith(initChar) && tgTokens.includes(inLast)) {
        return true;
      }
    }

    // Levenshtein similarity on full string
    if (inLower.length > 4 && tgLower.length > 4) {
      const dist = this._levenshtein(inLower, tgLower);
      const maxLen = Math.max(inLower.length, tgLower.length);
      if ((1 - dist / maxLen) >= 0.85) return true;
    }

    return false;
  }

  _levenshtein(a, b) {
    const matrix = [];
    for (let i = 0; i <= b.length; i++) matrix[i] = [i];
    for (let j = 0; j <= a.length; j++) matrix[0][j] = j;

    for (let i = 1; i <= b.length; i++) {
      for (let j = 1; j <= a.length; j++) {
        if (b.charAt(i - 1) === a.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          );
        }
      }
    }
    return matrix[b.length][a.length];
  }

  /**
   * Search active employees & statuses for real-time live cell autocomplete
   * 
   * @param {string} query - Text typed by user
   * @param {number} limit - Max results
   * @returns {Array} List of autocomplete suggestions
   */
  search(query, limit = 8) {
    const q = String(query || '').toLowerCase().trim();
    const qClean = q.replace(/[^a-z0-9]/g, '');
    const results = [];
    const seenNames = new Set();

    // 1. Match Special Statuses
    if (q && q.length >= 2) {
      this.specialStatuses.forEach(st => {
        const sName = st.name.toLowerCase();
        const sTokens = sName.split(/\s+/);
        if (sName.includes(q) || sTokens.some(t => t.startsWith(q))) {
          results.push({
            name: st.name,
            subText: st.label,
            icon: st.icon,
            isStatus: true,
            status: st.name,
            location: st.location
          });
        }
      });
    }

    // 2. Match Active Employees
    for (const emp of this.employees) {
      if (results.length >= limit) break;

      const cName = emp.canonicalName;
      const cLower = cName.toLowerCase();
      let matched = false;
      let matchedAlias = '';
      let displayPreferred = cName;

      if (!q) {
        // Return top employees when query is empty
        matched = true;
      } else {
        // Direct substring on canonical name
        if (cLower.includes(q) || cLower.replace(/[^a-z0-9]/g, '').includes(qClean)) {
          matched = true;
        }

        // Fuzzy/Token match on canonical name (e.g. "jimmy bailey" matches "Jimmy James Bailey")
        if (!matched && this._isFuzzyOrTokenMatch(q, cName)) {
          matched = true;
        }

        // Check initials e.g. "p. j", "pj", "p j"
        if (!matched) {
          const parts = cName.split(/[\s-]+/);
          if (parts.length >= 2) {
            const inits = parts.map(p => p.charAt(0).toLowerCase()).join('');
            if (inits.startsWith(qClean) || inits === qClean) {
              matched = true;
            }
          }
        }

        // Check Alternate Names / Aliases
        if (!matched && emp.alternateNames.length > 0) {
          for (const alt of emp.alternateNames) {
            const aLower = alt.toLowerCase();
            if (aLower.includes(q) || aLower.replace(/[^a-z0-9]/g, '').includes(qClean)) {
              matched = true;
              matchedAlias = alt;
              displayPreferred = alt;
              break;
            }
            // Check alias initials
            const altParts = alt.split(/[\s-]+/);
            if (altParts.length >= 2) {
              const altInits = altParts.map(p => p.charAt(0).toLowerCase()).join('');
              if (altInits.startsWith(qClean) || altInits === qClean) {
                matched = true;
                matchedAlias = alt;
                displayPreferred = alt;
                break;
              }
            }
          }
        }
      }

      if (matched && !seenNames.has(displayPreferred)) {
        seenNames.add(displayPreferred);
        results.push({
          name: displayPreferred,
          canonicalName: emp.canonicalName,
          subText: `📍 ${emp.location}${emp.classification ? ` • ${emp.classification}` : ''}`,
          aliasMatch: matchedAlias ? `(aka: ${cName !== displayPreferred ? cName : matchedAlias})` : (emp.alternateNames.length ? `(aka: ${emp.alternateNames.join(', ')})` : ''),
          icon: '👤',
          isStatus: false,
          location: emp.location,
          employee: emp
        });
      }
    }

    return results.slice(0, limit);
  }
}

// Attach globally for browser and node
if (typeof window !== 'undefined') {
  window.EmployeeNameResolver = EmployeeNameResolver;
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = EmployeeNameResolver;
}
