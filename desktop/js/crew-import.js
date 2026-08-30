/**
 * crew-import.js - Comprehensive Crew Makeup Import & Job Tracking Engine for Desktop App
 * Fully client-side Excel/CSV parsing, crew card extraction, classification-based foreman hierarchy,
 * change delta computation, and atomic multi-table synchronization (Employees, Job Tracking, History, Training).
 */

class CrewImportEngine {
  constructor(db) {
    this._db = db;
    this.workbook = null;
    this.selectedSheet = null;
    this.rosterDate = null;
    this.rosterDateFormatted = null;
    this.newHireConfigs = {};
    this.parsedCrews = [];
    this.specialCircumstances = [];
    this.unknownLocations = [];
    this.computedDeltas = null;
    this.savedLeadSelections = {};
    this.manualLeadOverrides = {};
    this.activeStep = 1; // 1: Upload, 2: Review Crews, 3: Configure New Hires, 4: Review Changes & Apply
  }

  get db() {
    return this._db || window.localDB;
  }

  set db(val) {
    this._db = val;
  }

  init() {
    this.loadSavedSettings();
  }

  loadSavedSettings() {
    try {
      const saved = localStorage.getItem('CREW_IMPORT_LEAD_SELECTIONS');
      if (saved) {
        this.savedLeadSelections = JSON.parse(saved) || {};
      }
    } catch (e) {
      console.warn('Could not load saved crew lead selections:', e);
    }
  }

  saveLeadSelection(jobNumber, leadName) {
    if (!jobNumber) return;
    this.savedLeadSelections[jobNumber] = leadName;
    try {
      localStorage.setItem('CREW_IMPORT_LEAD_SELECTIONS', JSON.stringify(this.savedLeadSelections));
    } catch (e) {
      console.warn('Could not save crew lead selection:', e);
    }
  }

  parseRosterDate(sheetName) {
    if (!sheetName) {
      const d = new Date();
      const dayOfWeek = d.getDay();
      const distanceToMon = (dayOfWeek === 1) ? 0 : ((8 - dayOfWeek) % 7);
      d.setDate(d.getDate() + distanceToMon);
      return d.toISOString().split('T')[0];
    }
    const s = String(sheetName).trim();
    const m = s.match(/(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{2,4})/);
    if (m) {
      let month = parseInt(m[1], 10);
      let day = parseInt(m[2], 10);
      let year = parseInt(m[3], 10);
      if (year < 100) year += 2000;
      const mStr = String(month).padStart(2, '0');
      const dStr = String(day).padStart(2, '0');
      return `${year}-${mStr}-${dStr}`;
    }
    // Default to next Monday
    const d = new Date();
    const dayOfWeek = d.getDay();
    const distanceToMon = (dayOfWeek === 1) ? 0 : ((8 - dayOfWeek) % 7);
    d.setDate(d.getDate() + distanceToMon);
    return d.toISOString().split('T')[0];
  }

  formatDateForSheet(isoDateStr) {
    if (!isoDateStr) return '';
    const parts = String(isoDateStr).trim().split('-');
    if (parts.length === 3) {
      return `${parts[1]}/${parts[2]}/${parts[0]}`;
    }
    return isoDateStr;
  }

  escapeJsString(str) {
    if (!str) return '';
    return String(str).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  }

  getNewHireConfig(empName, nh = null) {
    if (!this.newHireConfigs[empName]) {
      const defaultHireDate = this.rosterDate || this.parseRosterDate(this.selectedSheet);
      const gloveDefault = nh?.historyRecord ? (nh.historyRecord['Glove Size'] || '10') : '10';
      const sleeveDefault = nh?.historyRecord ? (nh.historyRecord['Sleeve Size'] || 'Regular') : 'Regular';
      const phoneDefault = nh?.historyRecord ? (nh.historyRecord['Phone Number'] || '') : '';
      const classDefault = nh?.classification || nh?.role || '1 AP';

      this.newHireConfigs[empName] = {
        name: empName,
        hireDate: defaultHireDate,
        gloveSize: gloveDefault,
        sleeveSize: sleeveDefault,
        phone: phoneDefault,
        email: '',
        classification: classDefault
      };
    }
    return this.newHireConfigs[empName];
  }

  updateNewHireConfig(empName, field, value) {
    const cfg = this.getNewHireConfig(empName);
    cfg[field] = value;
  }

  // ==========================================================================
  // 1. CLASSIFICATION HIERARCHY & FOREMAN RANKING
  // SUP(1) > GF(2) > F(3) > GTO F(4) > JRY(5) > JRY OP(6) > WT(7) > GTO(8) > EO 1(9) > EO 2(10) > AP 7-1(11-17)
  // ==========================================================================

  getRolePriority(role) {
    if (!role) return 999;
    const r = String(role).toUpperCase().trim();

    const priorities = {
      'SUP': 1,
      'SUPERINTENDENT': 1,
      'GF': 2,
      'GENERAL FOREMAN': 2,
      'F': 3,
      'FOREMAN': 3,
      'GTO F': 4,
      'GTO FOREMAN': 4,
      'JL': 5,
      'JRY': 5,
      'JOURNEYMAN': 5,
      'JOURNEYMAN LINEMAN': 5,
      'JRY OP': 6,
      'JOURNEYMAN OPERATOR': 6,
      'WT': 7,
      'WORKING TECH': 7,
      'WORKING TECHNICIAN': 7,
      'GTO': 8,
      'GAS TECH OPERATOR': 8,
      'EO 1': 9,
      'EO1': 9,
      'EQUIPMENT OPERATOR 1': 9,
      'EO 2': 10,
      'EO2': 10,
      'EQUIPMENT OPERATOR 2': 10,
      'AP 7': 11, '7 AP': 11, 'ST 7': 11, '7 ST': 11,
      'AP 6': 12, '6 AP': 12, 'ST 6': 12, '6 ST': 12,
      'AP 5': 13, '5 AP': 13, 'ST 5': 13, '5 ST': 13,
      'AP 4': 14, '4 AP': 14, 'ST 4': 14, '4 ST': 14,
      'AP 3': 15, '3 AP': 15, 'ST 3': 15, '3 ST': 15,
      'AP 2': 16, '2 AP': 16, 'ST 2': 16, '2 ST': 16,
      'AP 1': 17, '1 AP': 17, 'ST 1': 17, '1 ST': 17
    };

    if (priorities[r] !== undefined) return priorities[r];

    if (r.startsWith('SUP')) return 1;
    if (r === 'GF') return 2;
    if (r === 'F' || (r.includes('FOREMAN') && !r.includes('GTO'))) return 3;
    if (r.includes('GTO') && r.includes('F')) return 4;
    if (r === 'JL' || r === 'JRY' || (r.includes('JOURNEY') && !r.includes('OP'))) return 5;
    if (r.includes('JRY') && r.includes('OP')) return 6;
    if (r === 'WT') return 7;
    if (r === 'GTO') return 8;
    if (r.includes('EO') && r.includes('1')) return 9;
    if (r.includes('EO') && r.includes('2')) return 10;
    if (r.match(/(\d)\s*AP/i) || r.match(/AP\s*(\d)/i)) {
      const m = r.match(/\d/);
      const digit = m ? parseInt(m[0], 10) : 1;
      return 18 - digit; // AP 7 -> 11, AP 1 -> 17
    }

    return 999;
  }

  detectCrewLead(crewNumber, employees) {
    if (!employees || employees.length === 0) return null;

    // Check manual override from current import session
    if (this.manualLeadOverrides[crewNumber]) {
      const match = employees.find(e => e.name.toLowerCase() === this.manualLeadOverrides[crewNumber].toLowerCase());
      if (match) return match;
    }

    // Check saved preference from previous imports
    if (this.savedLeadSelections[crewNumber]) {
      const match = employees.find(e => e.name.toLowerCase() === this.savedLeadSelections[crewNumber].toLowerCase());
      if (match) return match;
    }

    // Select candidate with highest classification rank (lowest priority number)
    let bestCandidate = null;
    let bestPriority = 999;

    for (const emp of employees) {
      const priority = this.getRolePriority(emp.classification || emp.role);
      if (priority < bestPriority) {
        bestPriority = priority;
        bestCandidate = emp;
      }
    }

    return bestCandidate || employees[0];
  }

  // ==========================================================================
  // 2. EXCEL & SCHEDULE PARSING ENGINE
  // ==========================================================================

  getScheduleTypeFromHeader(headerText) {
    if (!headerText) return { type: '', label: 'Mon-Thu (4 10s)', badgeColor: '#3b82f6' };
    const text = String(headerText);

    if (text.match(/\b(Mon\s*Only|Monday\s*Only)\b/i)) {
      return { type: 'Split', label: 'Mon Only', badgeColor: '#f59e0b' };
    }
    if (text.match(/5\s*10'?s/i) || text.match(/(M-F|Mon-Fri|Monday.*Friday).*(5\s*10|10\s*hr)/i)) {
      return { type: 'Primary', label: 'Mon-Fri (5 10s)', badgeColor: '#10b981' };
    }
    if (text.match(/5\s*8'?s/i) || text.match(/(M-F|Mon-Fri|Monday.*Friday).*(5\s*8|8\s*hr)/i)) {
      return { type: 'Primary', label: 'Mon-Fri (5 8s)', badgeColor: '#10b981' };
    }
    if (text.match(/M-F|Mon-Fri|Monday.*Friday/i)) {
      return { type: 'Primary', label: 'Mon-Fri (5 10s)', badgeColor: '#10b981' };
    }
    if (text.match(/T-F\b|Tu-F\b|Tue-F\b|Tue-Fri|Tues-Fri|T-Fri|Tu-Fri|Tuesday.*Friday|\d+\s*10'?s?\s*T-?F/i)) {
      return { type: 'Primary', label: 'Tue-Fri (4 10s)', badgeColor: '#10b981' };
    }
    if (text.match(/M-Sat|Mon-Sat|Monday.*Saturday|6\s*10'?s/i)) {
      return { type: 'Primary', label: 'Mon-Sat (6 10s)', badgeColor: '#10b981' };
    }
    if (text.match(/Fri\s*&\s*Sat|Fri.*Sat|Friday.*Saturday|Fri\s*-\s*Sat/i)) {
      return { type: 'Secondary', label: 'Fri & Sat (Weekend)', badgeColor: '#f59e0b' };
    }
    if (text.match(/Sat\s*&\s*Sun|weekend|Saturday.*Sunday/i)) {
      return { type: 'Secondary', label: 'Sat & Sun (Weekend)', badgeColor: '#f59e0b' };
    }
    if (text.match(/Mon-Wed|Monday.*Wednesday/i)) {
      return { type: 'Split', label: 'Mon-Wed', badgeColor: '#06b6d4' };
    }
    if (text.match(/Thu-Fri|Thursday.*Friday/i)) {
      return { type: 'Split', label: 'Thu-Fri', badgeColor: '#06b6d4' };
    }
    if (text.match(/4\s*10'?s|M-Th|M-T\b|Mon-Thu|Mon-Thurs|Monday.*Thursday/i)) {
      return { type: 'Primary', label: 'Mon-Thu (4 10s)', badgeColor: '#10b981' };
    }

    return { type: 'Primary', label: 'Mon-Thu (4 10s)', badgeColor: '#3b82f6' };
  }

  getScheduleFlags(label) {
    const s = String(label || '').toLowerCase();
    if (s.includes('mon only') || s.includes('monday only') || s.includes('mon-only')) {
      return { label: 'Mon Only', skipSun: true, skipMon: false, skipTue: true, skipWed: true, skipThu: true, skipFri: true, skipSat: true, skipMeeting: false, skipChecklist: false };
    }
    if (s.includes('5 10') || s.includes('5-10') || s.includes('5/10') || s.includes('5 10s')) {
      return { label: 'Mon-Fri (5 10s)', skipSun: true, skipMon: false, skipTue: false, skipWed: false, skipThu: false, skipFri: false, skipSat: true, skipMeeting: false, skipChecklist: false };
    }
    if (s.includes('5 8') || s.includes('5-8') || s.includes('5/8') || s.includes('5 8s')) {
      return { label: 'Mon-Fri (5 8s)', skipSun: true, skipMon: false, skipTue: false, skipWed: false, skipThu: false, skipFri: false, skipSat: true, skipMeeting: false, skipChecklist: false };
    }
    if (s.includes('mon-fri') || s.includes('m-f') || s.includes('monday-friday') || s.includes('monday - friday')) {
      return { label: 'Mon-Fri (5 10s)', skipSun: true, skipMon: false, skipTue: false, skipWed: false, skipThu: false, skipFri: false, skipSat: true, skipMeeting: false, skipChecklist: false };
    }
    if (s.includes('tue-fri') || s.includes('tues-fri') || s.includes('t-f') || s.includes('tu-f') || s.includes('tuesday-friday')) {
      return { label: 'Tue-Fri (4 10s)', skipSun: true, skipMon: true, skipTue: false, skipWed: false, skipThu: false, skipFri: false, skipSat: true, skipMeeting: false, skipChecklist: false };
    }
    if (s.includes('mon-sat') || s.includes('6 10') || s.includes('6-10') || s.includes('6/10') || s.includes('6 10s')) {
      return { label: 'Mon-Sat (6 10s)', skipSun: true, skipMon: false, skipTue: false, skipWed: false, skipThu: false, skipFri: false, skipSat: false, skipMeeting: false, skipChecklist: false };
    }
    if (s.includes('fri-sat') || s.includes('fri & sat') || s.includes('fri/sat') || s.includes('friday & saturday')) {
      return { label: 'Fri & Sat (Weekend)', skipSun: true, skipMon: true, skipTue: true, skipWed: true, skipThu: true, skipFri: false, skipSat: false, skipMeeting: false, skipChecklist: false };
    }
    if (s.includes('weekend') || s.includes('sat & sun') || s.includes('sat/sun') || s.includes('saturday & sunday')) {
      return { label: 'Sat & Sun (Weekend)', skipSun: false, skipMon: true, skipTue: true, skipWed: true, skipThu: true, skipFri: true, skipSat: false, skipMeeting: false, skipChecklist: false };
    }
    if (s.includes('mon-wed') || s.includes('mon - wed') || s.includes('monday-wednesday')) {
      return { label: 'Mon-Wed', skipSun: true, skipMon: false, skipTue: false, skipWed: false, skipThu: true, skipFri: true, skipSat: true, skipMeeting: false, skipChecklist: false };
    }
    // Default Mon-Thu (4 10s)
    return { label: 'Mon-Thu (4 10s)', skipSun: true, skipMon: false, skipTue: false, skipWed: false, skipThu: false, skipFri: true, skipSat: true, skipMeeting: false, skipChecklist: false };
  }

  isEmployeeName(cellText) {
    if (!cellText || typeof cellText !== 'string') return false;
    const clean = cellText.trim();
    if (clean.length < 2 || clean.length > 80) return false;

    // Ignore pure job numbers (e.g. "013-26", "Helena Dock 009-26 4 10's M-Th")
    if (clean.match(/\d{3}-\d{2}/)) return false;

    // Ignore committee & non-crew sections
    if (clean.match(/\b(Safety\s*Committ?ee|MSLCAT|Subcommittee|Committee|Safety\s*Meeting|Interviews|St\s*Regis|Facility|Shop|Yard|Office\s*Notes)\b/i)) return false;

    // Ignore note continuations, appointments, and delegates
    if (clean.match(/^(&|and\b|off\b|back\b|wks?\b|as\b|next\b|appointment|due\b|baby\b|resume\b|on hold\b|starting\b|tentative\b|shop\s*note)/i)) return false;
    if (clean.match(/\b(Appointment|Delegate|Convention|shoulder\s*recovery)\b/i)) return false;

    // Ignore date announcements & notes (e.g. "February 2027, possibly sooner", "Starts 8-31 Mon", "TBD")
    if (clean.match(/\b(January|February|March|April|May|June|July|August|September|October|November|December)\b.*\b(202\d|sooner|later|possibly|tentative|TBD)\b/i)) return false;
    if (clean.match(/^(\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4}|TBD|Pending|N\/A)$/i)) return false;

    // Ignore dock / sub dock / bid header titles
    if (clean.match(/\b(Dock|Sub\s*Dock|Tran\s*Dock|Bid)\b/i)) return false;

    // Ignore known headers and non-employee announcements
    if (clean.match(/^(NWE|Aprox|Tentative|Completed|On Hold|Schedule|Released|Layoff|Dock|Sub|Trans)\b/i)) return false;
    if (clean.match(/^(Set Basements|Starts?\s+|Approved\s+|Waiting\s+|Fly\s+poles|Week\s+of|Total\s+Crews)/i)) return false;
    if (clean.match(/^(Light\s*Duty|Time\s*off|Quits?|Other|Layoffs?|Resigns?|Leave|Vacations?|MT\s*Misc|Weeds)/i)) return false;
    if (clean.match(/^(Time\s*off\s*upcoming|Time\s*off\/Quit\/Other|Upcoming\s*Time\s*off)/i)) return false;

    // Recognize if it contains recognized roles, apprentices, operators, or annotations
    if (clean.match(/\b(SUP|GF|F|GTO\s*F|GTO|JL|JRY|WT|EO\s*[12]|EO[12]|\d+\s*ap|\d+\s*st|Op|Operator|Apprentice|Trainee|NEW\s*HIRE|NEWHIRE)\b/i)) {
      const firstWord = clean.split(/\s+/)[0];
      if (firstWord.match(/^(off|back|next|wks?|as|due|baby|starts?|on|resume|set|fly|approved|to|from)$/i)) return false;
      return true;
    }

    // Name pattern: At least two words (First Last)
    const words = clean.split(/\s+/).filter(w => /^[A-Za-z]/.test(w));
    if (words.length < 2) return false;
    if (words[0].match(/^(off|back|next|wks?|as|due|baby|starts?|on|resume|set|fly|approved|meeting|shop|to|from)$/i)) return false;
    return true;
  }

  parseEmployeeCell(cellText) {
    if (!cellText) return null;
    let clean = String(cellText).trim();

    // 1. Detect NEW HIRE flag
    const isNewHire = /\b(NEW\s*HIRE|NEWHIRE)\b/i.test(clean);
    clean = clean.replace(/\b(NEW\s*HIRE|NEWHIRE)\b/gi, '').trim();

    let role = '';
    let classification = '';
    let isForeman = false;
    let namePart = clean;
    let notesPart = '';

    // 2. Tokenize by matching the role pattern anywhere after the employee's name
    const roleDefinitions = [
      { regex: /\b(GTO\s*F|GTO\s*Foreman)\b/i, role: 'GTO Foreman', class: 'GTO F', foreman: true },
      { regex: /\b(SUP|Supervisor)\b/i, role: 'Supervisor', class: 'SUP', foreman: true },
      { regex: /\b(GF|General\s*Foreman)\b/i, role: 'General Foreman', class: 'GF', foreman: true },
      { regex: /\b(Foreman)\b/i, role: 'Foreman', class: 'F', foreman: true },
      { regex: /\bF\b/, role: 'Foreman', class: 'F', foreman: true },
      { regex: /\b(Jry\s*Op|Journey\s*Op|Journeyman\s*Operator)\b/i, role: 'Jry Op', class: 'JRY OP', foreman: false },
      { regex: /\b(JL|JRY|Journeyman)\b/i, role: 'JL', class: 'JRY', foreman: false },
      { regex: /\b(\d+)\s*ap\b/i, role: m => `${m[1]} ap`, class: m => `AP ${m[1]}`, foreman: false },
      { regex: /\bAP\s*(\d+)\b/i, role: m => `${m[1]} ap`, class: m => `AP ${m[1]}`, foreman: false },
      { regex: /\b(\d+)\s*st\b/i, role: m => `ST ${m[1]}`, class: m => `ST ${m[1]}`, foreman: false },
      { regex: /\bST\s*(\d+)\b/i, role: m => `ST ${m[1]}`, class: m => `ST ${m[1]}`, foreman: false },
      { regex: /\b(EO\s*2|EO2)\b/i, role: 'EO2', class: 'EO 2', foreman: false },
      { regex: /\b(EO\s*1|EO1)\b/i, role: 'EO1', class: 'EO 1', foreman: false },
      { regex: /\bWT\b/i, role: 'WT', class: 'WT', foreman: false },
      { regex: /\bGTO\b/i, role: 'GTO', class: 'GTO', foreman: false },
      { regex: /\bGas\s*Trainee\s*(\d+)\b/i, role: m => `Gas Trainee ${m[1]}`, class: m => `Gas Trainee ${m[1]}`, foreman: false },
      { regex: /\b(Mech|Mechanic)\b/i, role: 'Mech', class: 'Mech', foreman: false },
      { regex: /\b(Op|Operator)\b/i, role: 'Op', class: 'OP', foreman: false },
      { regex: /\b(Trainee|Apprentice|Truck\s*Driver)\b/i, role: m => m[1], class: m => m[1], foreman: false }
    ];

    for (const def of roleDefinitions) {
      const match = clean.match(def.regex);
      if (match && match.index !== undefined) {
        const potentialName = clean.substring(0, match.index).trim();
        // Ensure there is a valid name before the role token (at least 2 characters)
        if (potentialName.length >= 2) {
          namePart = potentialName;
          notesPart = clean.substring(match.index + match[0].length).trim();
          role = typeof def.role === 'function' ? def.role(match) : def.role;
          classification = typeof def.class === 'function' ? def.class(match) : def.class;
          isForeman = def.foreman;
          break;
        }
      }
    }

    // 3. Clean Name
    const name = namePart
      .replace(/\b(TEMP|TEMPORARY|CONTRACTOR)\b/gi, '')
      .replace(/[\*#\(\)]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    // 4. Secondary / Split / Bid note detection
    const hasSecondaryNote = /\b(Crew\s+\d+[-\/]\d+|\bMon\s*Only\b|\bTue\s*Only\b|\bWed\s*Only\b|\bThu\s*Only\b|\bFri\s*Only\b|\bSat\s*Only\b|\bSun\s*Only\b|Mon\s*-\s*Wed|Thurs?\s*&\s*Fri|Fri\s*&\s*Sat|Secondary|Split|Temp|Covering)\b/i.test(notesPart);

    return {
      originalText: cellText,
      name: name,
      role: role,
      classification: classification,
      isForeman: isForeman,
      isNewHire: isNewHire,
      notes: notesPart,
      hasSecondaryNote: hasSecondaryNote
    };
  }

  /**
   * Reads raw ArrayBuffer or File and parses with SheetJS
   */
  async readWorkbook(fileOrBuffer) {
    if (typeof XLSX === 'undefined') {
      throw new Error('SheetJS (XLSX) library is not loaded.');
    }

    let data;
    if (fileOrBuffer instanceof ArrayBuffer) {
      data = new Uint8Array(fileOrBuffer);
    } else if (fileOrBuffer instanceof Blob || (typeof File !== 'undefined' && fileOrBuffer instanceof File)) {
      const buffer = await fileOrBuffer.arrayBuffer();
      data = new Uint8Array(buffer);
    } else {
      data = fileOrBuffer;
    }

    this.workbook = XLSX.read(data, { type: 'array', cellStyles: true });
    return this.workbook.SheetNames;
  }

  /**
   * Parses the selected sheet into structured crew cards & special sections
   */
  parseSheet(sheetName) {
    if (!this.workbook || !this.workbook.Sheets[sheetName]) {
      throw new Error(`Sheet "${sheetName}" not found in workbook.`);
    }

    this.selectedSheet = sheetName;
    this.rosterDate = this.parseRosterDate(sheetName);
    this.rosterDateFormatted = this.formatDateForSheet(this.rosterDate);
    const sheet = this.workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

    this.parsedCrews = [];
    this.specialCircumstances = [];
    this.unknownLocations = [];

    const crewHeaders = [];
    const specialHeaders = [];

    // 1. Scan for Crew Headers (pattern XXX-XX) & Special Section Headers
    for (let r = 0; r < data.length; r++) {
      for (let c = 0; c < (data[r] || []).length; c++) {
        const cell = String(data[r][c] || '').trim();
        if (!cell) continue;

        // Special sections (Light Duty, Weeds, Vacation, Leave, Time Off, Quit, Safety Committee)
        const isSpecialHeader = (cell.match(/^(Time\s*off|Quits?|Other|Layoffs?|Resigns?|Leave|Vacations?|MT\s*Misc|Weeds|Safety\s*Committ?ee|Committee|St\s*Regis|February\s*\d{4})/i) ||
                                 cell.match(/\b(Light\s*Duty|Time\s*off|Quits?|Other|Layoffs?|Resigns?|Leave|Vacations?|MT\s*Misc|Weeds|Safety\s*Committ?ee|Committee)\b/i)) &&
                                !this.isEmployeeName(cell);

        if (isSpecialHeader && !cell.match(/\d{3}-\d{2}/)) {
          specialHeaders.push({ row: r, col: c, headerText: cell });
          continue;
        }

        // Unnumbered dock headers (e.g. "Willow Crk Sub Dock")
        if (cell.match(/\b(Dock|Sub\s*Dock|Tran\s*Dock|Bid)\b/i) && !cell.match(/\d{3}-\d{2}/) && !this.isEmployeeName(cell)) {
          specialHeaders.push({ row: r, col: c, headerText: cell });
          continue;
        }

        // Crew header pattern: e.g. "Belgrade Dock 013-26 5 8's M-F", "Helena Dock 009-26 4 10's M-Th"
        const match = cell.match(/(\d{3}-\d{2})/);
        if (match) {
          const jobNum = match[1];
          let locName = cell.substring(0, cell.indexOf(jobNum)).trim();
          if (!locName) {
            locName = cell.replace(jobNum, '').trim();
          }
          crewHeaders.push({
            row: r,
            col: c,
            locationName: locName || 'Helena',
            jobNumber: jobNum,
            fullText: cell
          });
        }
      }
    }

    // 2. Parse Employees under each Crew Header
    for (const header of crewHeaders) {
      const employees = [];

      // Find the next header row in the same column
      let nextHeaderRow = data.length;
      for (const other of crewHeaders) {
        if (other.col === header.col && other.row > header.row && other.row < nextHeaderRow) {
          nextHeaderRow = other.row;
        }
      }
      for (const spec of specialHeaders) {
        if (spec.col === header.col && spec.row > header.row && spec.row < nextHeaderRow) {
          nextHeaderRow = spec.row;
        }
      }

      let crewNote = '';
      for (let r = header.row + 1; r < nextHeaderRow; r++) {
        const cell = String(data[r][header.col] || '').trim();
        if (!cell) continue;

        // Stop if hitting another job header, dock, committee, or section break
        if (cell.match(/\d{3}-\d{2}/)) break;
        if (cell.match(/\b(Dock|Sub\s*Dock|Tran\s*Dock|Bid|Safety\s*Committ?ee|Committee)\b/i)) break;
        if (cell.match(/^(Time\s*Off|Quit|Other|Layoff|Resign|Leave|Vacation|Light\s*Duty|Weeds|MT\s*Misc)\b/i)) break;

        // Check if this cell is a crew-level note / description / instruction
        if (cell.match(/^(NWE|Aprox|Tentative|Completed|On Hold|Approved|Starts?|Set Basements|Waiting|Crew\s+\d+[-\/]\d+|Shop\s*Note)/i) || !this.isEmployeeName(cell)) {
          if (!crewNote) {
            crewNote = cell;
          }
          continue;
        }

        if (this.isEmployeeName(cell)) {
          const emp = this.parseEmployeeCell(cell);
          if (emp && emp.name) {
            // If employee cell has a crew-wide prefix (e.g. "Crew 8-24 Mon Only"), elevate to crewNote
            if (emp.notes && emp.notes.match(/^Crew\s+\d+[-\/]\d+/i)) {
              if (!crewNote) {
                crewNote = emp.notes;
              }
              // Clear crew-level note from individual employee notes
              emp.notes = '';
            }
            employees.push(emp);
          }
        }
      }

      // Ignore placeholder bid cards with 0 valid employees
      if (employees.length === 0) {
        continue;
      }

      // Sort employees by classification hierarchy
      employees.sort((a, b) => {
        const pA = this.getRolePriority(a.classification || a.role);
        const pB = this.getRolePriority(b.classification || b.role);
        return pA - pB;
      });

      // Assign position numbers: e.g. 013-26.01, 013-26.02
      employees.forEach((emp, idx) => {
        emp.position = idx + 1;
        const posStr = String(idx + 1).padStart(2, '0');
        emp.fullJobNumber = `${header.jobNumber}.${posStr}`;
      });

      let sched = this.getScheduleTypeFromHeader(header.fullText);
      // If crewNote indicates a specific schedule, let crewNote override
      if (crewNote) {
        if (crewNote.match(/\b(Mon\s*Only|Monday\s*Only)\b/i)) {
          sched = { type: 'Split', label: 'Mon Only', badgeColor: '#f59e0b' };
        } else if (crewNote.match(/\b(Tue\s*Only|Tuesday\s*Only)\b/i)) {
          sched = { type: 'Split', label: 'Tue Only', badgeColor: '#f59e0b' };
        } else if (crewNote.match(/\b(Wed\s*Only|Wednesday\s*Only)\b/i)) {
          sched = { type: 'Split', label: 'Wed Only', badgeColor: '#f59e0b' };
        } else if (crewNote.match(/\b(Thu\s*Only|Thursday\s*Only)\b/i)) {
          sched = { type: 'Split', label: 'Thu Only', badgeColor: '#f59e0b' };
        } else if (crewNote.match(/\b(Fri\s*Only|Friday\s*Only)\b/i)) {
          sched = { type: 'Split', label: 'Fri Only', badgeColor: '#f59e0b' };
        } else if (crewNote.match(/Fri\s*&\s*Sat|Fri\s*-\s*Sat/i)) {
          sched = { type: 'Secondary', label: 'Fri & Sat (Weekend)', badgeColor: '#f59e0b' };
        } else if (crewNote.match(/Sat\s*&\s*Sun|weekend/i)) {
          sched = { type: 'Secondary', label: 'Sat & Sun (Weekend)', badgeColor: '#f59e0b' };
        } else if (crewNote.match(/Mon\s*-\s*Wed/i)) {
          sched = { type: 'Split', label: 'Mon-Wed', badgeColor: '#06b6d4' };
        }
      }

      const physicalLoc = this.normalizeLocation(header.locationName);
      const schedDays = this.getScheduleFlags(sched.label);

      this.parsedCrews.push({
        jobNumber: header.jobNumber,
        location: physicalLoc,
        originalLocation: header.locationName,
        fullHeaderText: header.fullText,
        crewNote: crewNote,
        scheduleType: sched.type,
        scheduleLabel: sched.label,
        scheduleBadgeColor: sched.badgeColor,
        scheduleDays: schedDays,
        status: 'Active',
        startDate: '',
        onHoldDate: '',
        estimatedReturn: '',
        actualEndDate: '',
        excluded: false,
        employees: employees
      });
    }

    // 3. Merge duplicated job number blocks (if a crew is split across two columns)
    this.mergeDuplicateCrews();

    // 4. Detect crew leads for all parsed crews
    for (const crew of this.parsedCrews) {
      crew.lead = this.detectCrewLead(crew.jobNumber, crew.employees);
      crew.crewSize = crew.employees.length;
    }

    // 5. Detect and establish Primary vs Secondary assignments for multi-crew employees
    this.detectMultiCrewAssignments();

    // 6. Parse bottom special sections (Quits, Time Off, Light Duty)
    this.specialCircumstances = this.parseSpecialSections(data, specialHeaders, crewHeaders);

    return this.parsedCrews;
  }

  parseSpecialSections(data, specialHeaders, crewHeaders) {
    const quits = [];
    const allTimeOffItems = [];
    const lightDutyAndOther = [];

    for (const header of specialHeaders) {
      let nextRow = data.length;
      for (const other of [...crewHeaders, ...specialHeaders]) {
        if (other.col === header.col && other.row > header.row && other.row < nextRow) {
          nextRow = other.row;
        }
      }

      let lastParsedItem = null;

      for (let r = header.row + 1; r < nextRow; r++) {
        const cell = String(data[r][header.col] || '').trim();
        if (!cell) continue;
        if (cell.match(/\d{3}-\d{2}/)) break;

        // Skip category / committee header rows
        if (cell.match(/^(MSLCAT|Subcommittee|Committee|Interviews|Safety\s*Meeting)/i) ||
            cell.match(/\b(MSLCAT\s*Subcommittee\/Interviews)\b/i)) {
          lastParsedItem = null;
          continue;
        }

        // If this is a note continuation line (not a new employee), merge onto last employee
        if (!this.isEmployeeName(cell)) {
          if (lastParsedItem) {
            lastParsedItem.note += ' ' + cell;
            lastParsedItem.rawText += '\n' + cell;
          }
          continue;
        }

        const isQuit = /\b(Quit|Quitting|Resign|Last day|Terminat|Fired|Layoff)\b/i.test(cell);
        const empParsed = this.parseEmployeeCell(cell);
        let name = empParsed ? empParsed.name : '';
        let note = cell;

        if (name && isQuit) {
          name = name.replace(/\b(Quit.*|Last day.*|Quitting.*|Resign.*)\b/i, '').trim();
        }

        // Check if Light Duty, Medical Recovery, or MSLCAT Committee (NOT personal time off)
        const isLightDutyOrRecovery = /\b(Light\s*Duty|shoulder\s*recovery|recovery|medical|appointment)\b/i.test(cell);
        const isCommittee = header.headerText.match(/MSLCAT|Subcommittee|Committee/i) ||
                            cell.match(/MSLCAT|Subcommittee/i) ||
                            (name && name.toLowerCase().includes('syd'));

        if (name && !isCommittee && !isLightDutyOrRecovery) {
          const item = {
            name: name,
            rawText: cell,
            header: header.headerText,
            role: empParsed.role || empParsed.classification || '',
            note: note,
            isQuit: isQuit
          };

          lastParsedItem = item;

          if (isQuit) {
            quits.push(item);
          } else {
            allTimeOffItems.push(item);
          }
        } else if (isLightDutyOrRecovery) {
          lightDutyAndOther.push({
            name: name,
            rawText: cell,
            note: cell
          });
          lastParsedItem = { note: cell, rawText: cell };
        }
      }
    }

    // Accurately categorize all time off into Current Week vs Upcoming using full merged note text
    const timeOffCurrentWeek = [];
    const timeOffUpcoming = [];

    for (const item of allTimeOffItems) {
      const fullNote = (item.note || item.rawText || '').trim();
      // Current week 8-24 (Aug 24-28, 2026):
      // Matches 8-24, 8-25, 8-26, 8-27, 8-28 or "wk 8-24"
      const isCurrentWeek = /\b(8-24|8-25|8-26|8-27|8-28|wk\s*8-24)\b/i.test(fullNote);

      if (isCurrentWeek) {
        timeOffCurrentWeek.push(item);
      } else {
        timeOffUpcoming.push(item);
      }
    }

    return {
      quits: quits,
      timeOffCurrentWeek: timeOffCurrentWeek,
      timeOffUpcoming: timeOffUpcoming,
      lightDutyAndOther: lightDutyAndOther
    };
  }

  detectMultiCrewAssignments() {
    const empMap = new Map();

    this.parsedCrews.forEach((crew, cIdx) => {
      crew.employees.forEach((emp, eIdx) => {
        const key = emp.name.toLowerCase().trim();
        if (!key) return;
        if (!empMap.has(key)) {
          empMap.set(key, []);
        }
        empMap.get(key).push({
          crewIndex: cIdx,
          empIndex: eIdx,
          crew: crew,
          emp: emp
        });
      });
    });

    this.multiCrewEmployees = [];

    for (const [nameKey, occurrences] of empMap.entries()) {
      if (occurrences.length > 1) {
        // Find which occurrence is Primary vs Secondary
        let primaryIdx = -1;

        // 1. If an occurrence has secondary note (e.g. "Crew 8-24 Mon Only", "Mon Only", "Secondary", "Split"), other is Primary
        const nonSecOccs = occurrences.filter(occ => !occ.emp.hasSecondaryNote && !occ.emp.notes.toLowerCase().includes('only'));
        if (nonSecOccs.length > 0) {
          primaryIdx = occurrences.indexOf(nonSecOccs[0]);
        }

        // 2. If neither or all have notes, check schedule type (Primary schedule e.g. Mon-Thu/Tue-Fri wins over Split/Secondary)
        if (primaryIdx === -1) {
          const primarySchedOcc = occurrences.find(occ => occ.crew.scheduleType === 'Primary');
          if (primarySchedOcc) {
            primaryIdx = occurrences.indexOf(primarySchedOcc);
          } else {
            primaryIdx = 0;
          }
        }

        occurrences.forEach((occ, idx) => {
          const isPrimary = (idx === primaryIdx);
          occ.emp.isPrimary = isPrimary;
          occ.emp.isSecondary = !isPrimary;
          const otherOcc = occurrences.find((_, oIdx) => oIdx !== idx);
          if (otherOcc) {
            occ.emp.otherJobNumber = otherOcc.crew.jobNumber;
            occ.emp.otherFullJobNumber = otherOcc.emp.fullJobNumber;
          }
        });

        this.multiCrewEmployees.push({
          employeeName: occurrences[0].emp.name,
          occurrences: occurrences,
          primaryJobNumber: occurrences[primaryIdx].crew.jobNumber
        });
      } else {
        occurrences[0].emp.isPrimary = true;
        occurrences[0].emp.isSecondary = false;
      }
    }
  }

  toggleEmployeePrimaryJob(employeeName, targetJobNumber) {
    const multi = this.multiCrewEmployees.find(m => m.employeeName.toLowerCase().trim() === employeeName.toLowerCase().trim());
    if (!multi) return;

    multi.primaryJobNumber = targetJobNumber;
    multi.occurrences.forEach(occ => {
      const isPrimary = (occ.crew.jobNumber === targetJobNumber);
      occ.emp.isPrimary = isPrimary;
      occ.emp.isSecondary = !isPrimary;
    });

    this.render();
  }

  mergeDuplicateCrews() {
    const grouped = {};
    for (const crew of this.parsedCrews) {
      if (!grouped[crew.jobNumber]) {
        grouped[crew.jobNumber] = [];
      }
      grouped[crew.jobNumber].push(crew);
    }

    const merged = [];
    for (const jn in grouped) {
      const list = grouped[jn];
      if (list.length === 1) {
        merged.push(list[0]);
      } else {
        const base = { ...list[0], employees: [] };
        const seenNames = new Set();

        for (const c of list) {
          for (const emp of c.employees) {
            const key = emp.name.toLowerCase();
            if (!seenNames.has(key)) {
              seenNames.add(key);
              base.employees.push(emp);
            }
          }
        }

        // Re-sort and renumber
        base.employees.sort((a, b) => this.getRolePriority(a.classification || a.role) - this.getRolePriority(b.classification || b.role));
        base.employees.forEach((emp, idx) => {
          emp.position = idx + 1;
          const posStr = String(idx + 1).padStart(2, '0');
          emp.fullJobNumber = `${base.jobNumber}.${posStr}`;
        });

        merged.push(base);
      }
    }
    this.parsedCrews = merged;
  }

  normalizeLocation(rawLoc) {
    if (!rawLoc) return 'Helena';
    let clean = String(rawLoc).trim();

    // Map Bozeman -> Belgrade for company roster consistency
    if (clean.toLowerCase().includes('bozeman')) {
      return 'Belgrade';
    }

    const knownCities = [
      'Big Timber', 'Three Rivers', 'Three Forks', 'Willow Creek', 'Great Falls',
      'Miles City', 'Gold Creek', 'White Sulphur', 'Cut Bank', 'Big Sky',
      'Helena', 'Belgrade', 'Billings', 'Missoula', 'Butte', 'Anaconda',
      'Kalispell', 'Livingston', 'Darby', 'Hamilton', 'Ennis',
      'Melville', 'Glendive', 'Sidney', 'Bonner', 'Lolo', 'Rapelje',
      'Stanford', 'Elliston', 'Townsend', 'Whitehall', 'Dillon', 'Polson',
      'Havre', 'Lewistown', 'Shelby', 'Conrad', 'Hardin', 'Colstrip', 'Baker',
      'St Regis', 'St. Regis', 'Columbia Falls', 'Deer Lodge', 'Stevensville',
      'Philipsburg', 'Superior', 'Plains', 'Thompson Falls', 'Eureka', 'Libby'
    ];

    const l = clean.toLowerCase();
    for (const city of knownCities) {
      if (l.includes(city.toLowerCase())) return city.replace('St. Regis', 'St Regis');
    }

    clean = clean.replace(/\b(dock|trans|tran|sub|poles|bid|facility|shop|office|gas|line|dist|distribution|transmission|substation|bid\s*job)\b/gi, '').trim();
    return clean || 'Helena';
  }

  // ==========================================================================
  // 3. CHANGE DELTA COMPUTATION & FIELD EXTRACTION HELPERS
  // ==========================================================================

  getEmpRowName(row) {
    if (!row) return '';
    for (const key of Object.keys(row)) {
      const k = key.toLowerCase().trim();
      if (k === 'name' || k === 'employee name' || k === 'employee' || k === 'emp name') {
        const val = String(row[key] || '').trim();
        if (val) return val;
      }
    }
    // Fallback: first non-underscore property with text
    for (const key of Object.keys(row)) {
      if (!key.startsWith('_')) {
        const val = String(row[key] || '').trim();
        if (val && isNaN(val)) return val;
      }
    }
    return '';
  }

  getEmpRowLocation(row) {
    if (!row) return '';
    for (const key of Object.keys(row)) {
      const k = key.toLowerCase().trim();
      if (k.startsWith('location') || k.startsWith('loc') || k.startsWith('city')) {
        return String(row[key] || '').trim();
      }
    }
    return '';
  }

  getEmpRowJobNumber(row) {
    if (!row) return '';
    for (const key of Object.keys(row)) {
      const k = key.toLowerCase().trim();
      if (k.startsWith('job number') || k.startsWith('job #') || k === 'job' || k === 'jobnum') {
        return String(row[key] || '').trim();
      }
    }
    return '';
  }

  getEmpRowClassification(row) {
    if (!row) return '';
    for (const key of Object.keys(row)) {
      const k = key.toLowerCase().trim();
      if (k.startsWith('job classification') || k === 'classification' || k === 'class' || k === 'role') {
        return String(row[key] || '').trim();
      }
    }
    return '';
  }

  getEmpRowSecJob(row) {
    if (!row) return '';
    for (const key of Object.keys(row)) {
      const k = key.toLowerCase().trim();
      if (k.includes('secondary') && (k.includes('job') || k.includes('number') || k.includes('#'))) {
        return String(row[key] || '').trim();
      }
    }
    return '';
  }

  cleanNameForMatch(name) {
    if (!name) return '';
    let str = String(name).trim();
    str = str.replace(/^active\s*\|\s*/i, '').trim();
    const nameMatch = str.match(/^([A-Za-z]+(?:\s+[A-Za-z]+)+?)(?:\s+(?:JL|JRY|F|SUP|GF|AP|\d+\s*ap|EO|WT|GTO|Last\s*day|Quit|off\b))/i);
    if (nameMatch && nameMatch[1]) {
      str = nameMatch[1];
    }
    return str
      .toLowerCase()
      .replace(/\s+(jr|sr|ii|iii|iv)\.?$/i, '')
      .replace(/[^a-z0-9]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  levenshtein(a, b) {
    if (!a || !b) return (a || b || '').length;
    const m = a.length, n = b.length;
    const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
    for (let i = 0; i <= m; i++) dp[i][0] = i;
    for (let j = 0; j <= n; j++) dp[0][j] = j;
    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
      }
    }
    return dp[m][n];
  }

  areJobNumbersEquivalent(jobA, jobB) {
    if (!jobA || !jobB) return false;
    const cleanA = String(jobA).trim();
    const cleanB = String(jobB).trim();
    if (cleanA.toLowerCase() === cleanB.toLowerCase()) return true;

    const matchA = cleanA.match(/^(\d{3}-\d{2})\.(\d+)$/);
    const matchB = cleanB.match(/^(\d{3}-\d{2})\.(\d+)$/);
    if (matchA && matchB) {
      return matchA[1] === matchB[1] && parseInt(matchA[2], 10) === parseInt(matchB[2], 10);
    }
    return false;
  }

  isCrewTransfer(oldJob, newJob) {
    if (!oldJob || !newJob) return false;
    const cleanA = String(oldJob).trim();
    const cleanB = String(newJob).trim();
    if (this.areJobNumbersEquivalent(cleanA, cleanB)) return false;

    const matchA = cleanA.match(/^(\d{3}-\d{2})/);
    const matchB = cleanB.match(/^(\d{3}-\d{2})/);
    if (matchA && matchB) {
      return matchA[1] !== matchB[1];
    }
    return cleanA !== cleanB;
  }

  findMatchingEmployee(rosterName, employeeRows) {
    if (!rosterName || !employeeRows || employeeRows.length === 0) return null;
    const cleanRoster = this.cleanNameForMatch(rosterName);
    if (!cleanRoster) return null;

    const aliases = {
      'nate': ['nathaniel', 'nathan'],
      'nathan': ['nathaniel', 'nate'],
      'nathaniel': ['nathan', 'nate'],
      'eric': ['erik', 'erick'],
      'erik': ['eric', 'erick'],
      'keenan': ['kenan'],
      'toby': ['tony'],
      'tony': ['toby', 'anthony'],
      'dillon': ['dollon', 'dillan'],
      'dollon': ['dillon', 'dillan'],
      'dave': ['david'],
      'david': ['dave'],
      'mike': ['michael'],
      'michael': ['mike'],
      'chris': ['christopher'],
      'christopher': ['chris'],
      'matt': ['matthew'],
      'matthew': ['matt'],
      'dan': ['daniel', 'danny'],
      'daniel': ['dan', 'danny'],
      'josh': ['joshua'],
      'joshua': ['josh'],
      'rob': ['robert', 'bob', 'bobby'],
      'bob': ['robert', 'rob', 'bobby'],
      'robert': ['rob', 'bob', 'bobby'],
      'tom': ['thomas', 'tommy'],
      'thomas': ['tom', 'tommy'],
      'jim': ['james', 'jimmy'],
      'jimmy': ['james', 'jim'],
      'james': ['jim', 'jimmy'],
      'joe': ['joseph', 'joey'],
      'joseph': ['joe', 'joey'],
      'tj': ['teejay', 't j'],
      'cody': ['kody'],
      'kody': ['cody'],
      'zakary': ['zachary', 'zak', 'zach'],
      'zachary': ['zakary', 'zak', 'zach'],
      'zak': ['zakary', 'zachary', 'zach'],
      'zach': ['zakary', 'zachary', 'zak'],
      'bill': ['william', 'billy', 'will'],
      'william': ['bill', 'billy', 'will'],
      'alex': ['alexander'],
      'alexander': ['alex'],
      'sam': ['samuel'],
      'samuel': ['sam'],
      'nick': ['nicholas'],
      'nicholas': ['nick'],
      'jake': ['jacob'],
      'jacob': ['jake'],
      'ben': ['benjamin'],
      'benjamin': ['ben'],
      'greg': ['gregory'],
      'gregory': ['greg'],
      'andy': ['andrew'],
      'andrew': ['andy'],
      'ken': ['kenneth', 'kenny'],
      'kenneth': ['ken', 'kenny'],
      'ron': ['ronald'],
      'ronald': ['ron'],
      'don': ['donald', 'donnie'],
      'donald': ['don', 'donnie'],
      'ed': ['edward', 'eddie'],
      'edward': ['ed', 'eddie'],
      'rick': ['richard', 'ricky', 'dick'],
      'richard': ['rick', 'ricky', 'dick'],
      'steve': ['stephen', 'steven'],
      'stephen': ['steve', 'steven'],
      'steven': ['steve', 'stephen'],
      'tim': ['timothy'],
      'timothy': ['tim'],
      'jeff': ['jeffrey', 'geoffrey'],
      'jeffrey': ['jeff'],
      'ray': ['raymond'],
      'raymond': ['ray'],
      'larry': ['lawrence'],
      'lawrence': ['larry'],
      'terry': ['terrence'],
      'terrence': ['terry'],
      'colton': ['colt'],
      'colt': ['colton'],
      'brandon': ['branden'],
      'branden': ['brandon']
    };

    // 1. Exact clean match
    for (const empRow of employeeRows) {
      const dbName = this.getEmpRowName(empRow);
      const cleanDb = this.cleanNameForMatch(dbName);
      if (cleanDb && cleanDb === cleanRoster) return empRow;
    }

    const rosterParts = cleanRoster.split(' ').filter(Boolean);
    if (rosterParts.length < 2) return null;
    const rosterFirst = rosterParts[0];
    const rosterLast = rosterParts[rosterParts.length - 1];

    // 2. Exact Last Name + First Name Nickname / Prefix Match
    for (const empRow of employeeRows) {
      const dbName = this.getEmpRowName(empRow);
      const cleanDb = this.cleanNameForMatch(dbName);
      const dbParts = cleanDb.split(' ').filter(Boolean);
      if (dbParts.length < 2) continue;
      const dbFirst = dbParts[0];
      const dbLast = dbParts[dbParts.length - 1];

      if (rosterLast === dbLast) {
        if (dbFirst === rosterFirst || dbFirst.startsWith(rosterFirst) || rosterFirst.startsWith(dbFirst)) {
          return empRow;
        }
        const rosterAliases = aliases[rosterFirst] || [];
        const dbAliases = aliases[dbFirst] || [];
        if (rosterAliases.includes(dbFirst) || dbAliases.includes(rosterFirst)) {
          return empRow;
        }
        if (this.levenshtein(rosterFirst, dbFirst) <= 2) {
          return empRow;
        }
      }
    }

    // 3. Small full-name fuzzy match (Levenshtein <= 2)
    for (const empRow of employeeRows) {
      const dbName = this.getEmpRowName(empRow);
      const cleanDb = this.cleanNameForMatch(dbName);
      if (cleanDb && this.levenshtein(cleanRoster, cleanDb) <= 2) {
        return empRow;
      }
    }

    return null;
  }

  computeChangeDeltas() {
    const empTable = this.db.getTable('employees') || { rows: [] };
    const jtTable = this.db.getTable('job_tracking') || { rows: [] };
    const histTable = this.db.getTable('employee_history') || { rows: [] };
    const activeEmps = empTable.rows || [];
    const activeJobs = jtTable.rows || [];

    const jtMap = new Map();
    activeJobs.forEach(j => {
      let jNum = '';
      for (const k of Object.keys(j)) {
        const kl = k.toLowerCase().trim();
        if (kl === 'job number' || kl === 'job #' || kl === 'job') {
          jNum = String(j[k] || '').trim();
          break;
        }
      }
      if (!jNum) jNum = String(Object.values(j)[0] || '').trim();
      if (jNum) jtMap.set(jNum, j);
    });

    const newHires = [];
    const rehires = [];
    const transfers = [];
    const roleChanges = [];
    const secondaryChanges = [];
    const newJobsDetected = [];
    const quits = [];
    const timeOff = [];
    const matchedEmployeeChanges = [];

    // 1. Detect new jobs in Job Tracking
    for (const crew of this.parsedCrews) {
      if (crew.excluded) continue;
      if (!jtMap.has(crew.jobNumber)) {
        newJobsDetected.push({
          jobNumber: crew.jobNumber,
          location: crew.location,
          suggestedForeman: crew.lead ? crew.lead.name : '',
          crewSize: crew.crewSize,
          scheduleLabel: crew.scheduleLabel || 'Mon-Thu (4 10s)'
        });
      }
    }

    // 2. Group all employees by unique name across parsed crews
    const uniqueEmployees = new Map();
    for (const crew of this.parsedCrews) {
      if (crew.excluded) continue;
      for (const emp of crew.employees) {
        const key = this.cleanNameForMatch(emp.name);
        if (!uniqueEmployees.has(key)) {
          uniqueEmployees.set(key, []);
        }
        uniqueEmployees.get(key).push({ crew, emp });
      }
    }

    // 3. Process Quits & Terminations from bottom special sections
    for (const q of (this.specialCircumstances?.quits || [])) {
      const match = this.findMatchingEmployee(q.name, activeEmps);
      const dbName = match ? (this.getEmpRowName(match) || q.name) : q.name;
      const oldLoc = match ? this.getEmpRowLocation(match) : '';
      const oldJob = match ? this.getEmpRowJobNumber(match) : '';
      
      const cleanQName = this.cleanNameForMatch(q.name);
      let crewOccurrences = uniqueEmployees.get(cleanQName) || [];
      if (crewOccurrences.length === 0) {
        for (const [k, occs] of uniqueEmployees.entries()) {
          if (occs.length > 0 && this.findMatchingEmployee(q.name, [{ 'Employee Name': occs[0].emp.name }])) {
            crewOccurrences = occs;
            break;
          }
        }
      }
      const isScheduledDeparture = crewOccurrences.length > 0;
      const primaryCrew = isScheduledDeparture ? crewOccurrences[0].crew : null;
      const primaryEmp = isScheduledDeparture ? crewOccurrences[0].emp : null;

      quits.push({
        name: dbName,
        rosterName: q.name,
        targetRow: match || null,
        oldJob: oldJob,
        oldLocation: oldLoc,
        note: q.note || q.rawText,
        rawText: q.rawText,
        isScheduledDeparture: isScheduledDeparture,
        activeCrewJob: primaryCrew ? primaryCrew.jobNumber : '',
        activeCrewRole: primaryEmp ? primaryEmp.role : ''
      });
    }

    // 4. Process Time Off for Current Week from bottom special sections
    for (const to of (this.specialCircumstances?.timeOffCurrentWeek || [])) {
      const match = this.findMatchingEmployee(to.name, activeEmps);
      const dbName = match ? (this.getEmpRowName(match) || to.name) : to.name;
      const oldLoc = match ? this.getEmpRowLocation(match) : '';
      const oldJob = match ? this.getEmpRowJobNumber(match) : '';

      const cleanTOName = this.cleanNameForMatch(to.name);
      let crewOccurrences = uniqueEmployees.get(cleanTOName) || [];
      if (crewOccurrences.length === 0) {
        for (const [k, occs] of uniqueEmployees.entries()) {
          if (occs.length > 0 && this.findMatchingEmployee(to.name, [{ 'Employee Name': occs[0].emp.name }])) {
            crewOccurrences = occs;
            break;
          }
        }
      }
      const isAlsoOnActiveCrew = crewOccurrences.length > 0;
      const primaryCrew = isAlsoOnActiveCrew ? crewOccurrences[0].crew : null;

      timeOff.push({
        name: dbName,
        rosterName: to.name,
        targetRow: match || null,
        oldJob: oldJob,
        oldLocation: oldLoc,
        note: to.note || to.rawText,
        rawText: to.rawText,
        isFullWeekOff: !isAlsoOnActiveCrew,
        activeCrewJob: primaryCrew ? primaryCrew.jobNumber : ''
      });
    }

    // 5. Process each unique employee
    for (const [nameKey, occurrences] of uniqueEmployees.entries()) {
      const primaryOcc = occurrences.find(o => o.emp.isPrimary) || occurrences[0];
      const secOccs = occurrences.filter(o => o !== primaryOcc);

      const empName = primaryOcc.emp.name;
      const primaryJob = primaryOcc.emp.fullJobNumber;
      const primaryLoc = primaryOcc.crew.location;
      const primaryClass = primaryOcc.emp.classification || 'JRY';
      const secJobNum = secOccs.map(s => s.emp.fullJobNumber).filter(Boolean).join(', ');
      const isExplicitNewHire = occurrences.some(o => o.emp.isNewHire);

      // Check if this employee has a scheduled departure in quits (e.g. Dillon Doane on 052-26 until 8/27)
      const isScheduledDeparture = quits.some(q => q.isScheduledDeparture && (
        this.cleanNameForMatch(q.name) === nameKey ||
        this.cleanNameForMatch(q.rosterName) === nameKey ||
        Boolean(this.findMatchingEmployee(empName, [{ 'Employee Name': q.name }, { 'Employee Name': q.rosterName }]))
      ));

      // Match against active Employees table in local DB
      const existing = this.findMatchingEmployee(empName, activeEmps);

      if (isExplicitNewHire) {
        // Explicitly tagged as NEW HIRE in Excel cell (e.g. "Owen Hunter 1 ap NEW HIRE")
        newHires.push({
          name: empName,
          role: primaryOcc.emp.role || primaryClass,
          classification: primaryClass,
          location: primaryLoc,
          jobNumber: primaryJob,
          secondaryJobNumber: secJobNum,
          crewNumber: primaryOcc.crew.jobNumber,
          isRehire: false,
          historyRecord: null,
          targetRow: existing || null
        });
      } else if (!existing) {
        // Not found in active Employees -> Check Employee History for rehire
        const foundHist = this.findMatchingEmployee(empName, histTable.rows || []);
        // Active scheduled departures or active employees are never rehires
        const isRehire = !isScheduledDeparture && !!foundHist;

        const newHireObj = {
          name: empName,
          role: primaryOcc.emp.role || primaryClass,
          classification: primaryClass,
          location: primaryLoc,
          jobNumber: primaryJob,
          secondaryJobNumber: secJobNum,
          crewNumber: primaryOcc.crew.jobNumber,
          isRehire: isRehire,
          historyRecord: foundHist || null,
          targetRow: null
        };

        if (newHireObj.isRehire) {
          rehires.push(newHireObj);
        } else {
          newHires.push(newHireObj);
        }
      } else {
        // Active Existing Employee -> cross-reference changes
        const dbName = this.getEmpRowName(existing) || empName;
        const oldLoc = this.getEmpRowLocation(existing);
        const oldJob = this.getEmpRowJobNumber(existing);
        const oldClass = this.getEmpRowClassification(existing);
        const oldSecJob = this.getEmpRowSecJob(existing);

        const changeItem = {
          employeeName: dbName,
          rosterName: empName,
          targetRow: existing,
          oldLocation: oldLoc,
          newLocation: oldLoc,
          oldJobNumber: oldJob,
          newJobNumber: oldJob,
          oldClassification: oldClass,
          newClassification: oldClass,
          oldSecondaryJobNumber: oldSecJob,
          newSecondaryJobNumber: oldSecJob,
          changes: [],
          type: 'Update'
        };

        let changed = false;

        // 1. Crew Transfer: only if moving to a different crew base (e.g. 013-26 -> 029-26 or 009-26 -> 056-26)
        if (this.isCrewTransfer(oldJob, primaryJob)) {
          changeItem.newJobNumber = primaryJob;
          changeItem.changes.push(`Job #: ${oldJob || 'None'} → ${primaryJob}`);
          changeItem.type = 'Transfer';
          transfers.push(changeItem);
          changed = true;
        } else if (primaryJob && !this.areJobNumbersEquivalent(oldJob, primaryJob)) {
          // Intra-crew position renumbering (e.g. 020-26.02 -> 020-26.01)
          changeItem.newJobNumber = primaryJob;
          changed = true;
        }

        // 2. Location Change
        if (primaryLoc && oldLoc && oldLoc.toLowerCase() !== primaryLoc.toLowerCase()) {
          changeItem.newLocation = primaryLoc;
          changeItem.changes.push(`Location: ${oldLoc || 'None'} → ${primaryLoc}`);
          if (changeItem.type !== 'Transfer') {
            changeItem.type = 'Location';
            transfers.push(changeItem);
          }
          changed = true;
        }

        // 3. Role / Classification Change
        if (primaryClass && oldClass && oldClass.toLowerCase() !== primaryClass.toLowerCase()) {
          changeItem.newClassification = primaryClass;
          changeItem.changes.push(`Role: ${oldClass || 'None'} → ${primaryClass}`);
          if (changeItem.type === 'Update') changeItem.type = 'Role Change';
          roleChanges.push(changeItem);
          changed = true;
        }

        // 4. Secondary Job Assignment Change
        if (secJobNum !== oldSecJob) {
          changeItem.newSecondaryJobNumber = secJobNum;
          changeItem.changes.push(`Secondary Job: ${oldSecJob || 'None'} → ${secJobNum || 'None'}`);
          secondaryChanges.push(changeItem);
          changed = true;
        }

        if (changed) {
          matchedEmployeeChanges.push(changeItem);
        }
      }
    }

    this.computedDeltas = {
      newHires: newHires,
      rehires: rehires,
      transfers: transfers,
      roleChanges: roleChanges,
      secondaryChanges: secondaryChanges,
      newJobsDetected: newJobsDetected,
      quits: quits,
      timeOff: timeOff,
      matchedEmployeeChanges: matchedEmployeeChanges,
      totalChanges: newHires.length + rehires.length + matchedEmployeeChanges.length + newJobsDetected.length + quits.length + timeOff.length
    };

    return this.computedDeltas;
  }

  // ==========================================================================
  // 4. ATOMIC DATABASE APPLY & MUTATION SYNCHRONIZATION
  // ==========================================================================

  async applyCrewChanges(options = {}) {
    if (!this.computedDeltas) {
      this.computeChangeDeltas();
    }

    const { newHires, rehires, matchedEmployeeChanges, newJobsDetected, quits, timeOff } = this.computedDeltas;
    const empTable = this.db.getTable('employees');
    const jtTable = this.db.getTable('job_tracking');
    const histTable = this.db.getTable('employee_history');
    const todayFormatted = new Date().toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' });

    let appliedCount = 0;

    const getEmpFieldKey = (headers, target) => {
      if (!headers || !headers.length) return null;
      const t = target.toLowerCase().trim();
      if (t === 'name' || t === 'employee name') {
        const found = headers.find(h => /^(employee\s*name|name|emp\s*name)$/i.test(h.trim()));
        if (found) return found;
      }
      if (t === 'location' || t === 'loc') {
        const found = headers.find(h => /^(location|loc|city)(\s*\[\d+\])?$/i.test(h.trim()));
        if (found) return found;
      }
      if (t === 'job number' || t === 'job #' || t === 'job') {
        const found = headers.find(h => /^(job\s*number|job\s*#|job|jobnum)(\s*\[\d+\])?$/i.test(h.trim()));
        if (found) return found;
      }
      if (t === 'job classification' || t === 'classification' || t === 'role') {
        const found = headers.find(h => /^(job\s*classification|classification|role|job\s*class)$/i.test(h.trim())) ||
                      headers.find(h => /^class$/i.test(h.trim()));
        if (found) return found;
      }
      if (t === 'secondary job number' || t === 'secondary job' || t === 'sec job') {
        const found = headers.find(h => /^(secondary\s*job\s*number|secondary\s*job|sec\s*job|secondary\s*job\s*#)$/i.test(h.trim()));
        if (found) return found;
      }
      if (t === 'status') {
        const found = headers.find(h => /^status$/i.test(h.trim()));
        if (found) return found;
      }
      if (t === 'hire date') {
        const found = headers.find(h => /^(hire\s*date|date\s*hired)$/i.test(h.trim()));
        if (found) return found;
      }
      if (t === 'last day') {
        const found = headers.find(h => /^(last\s*day|term\s*date)$/i.test(h.trim()));
        if (found) return found;
      }
      if (t === 'last day reason') {
        const found = headers.find(h => /^(last\s*day\s*reason|term\s*reason|reason)$/i.test(h.trim()));
        if (found) return found;
      }
      if (t === 'glove size') {
        const found = headers.find(h => /^(glove\s*size|glove)$/i.test(h.trim()));
        if (found) return found;
      }
      if (t === 'sleeve size') {
        const found = headers.find(h => /^(sleeve\s*size|sleeve)$/i.test(h.trim()));
        if (found) return found;
      }
      if (t === 'notes') {
        const found = headers.find(h => /^(notes|note|comments)$/i.test(h.trim()));
        if (found) return found;
      }
      if (t === 'phone' || t === 'phone number') {
        const found = headers.find(h => /^(phone|phone\s*number)$/i.test(h.trim()));
        if (found) return found;
      }
      if (t === 'email' || t === 'email address' || t === 'notification emails') {
        const found = headers.find(h => /^(email|email\s*address|notification\s*emails|mp\s*email)$/i.test(h.trim()));
        if (found) return found;
      }
      for (const h of headers) {
        if (h.toLowerCase().trim() === t) return h;
      }
      return null;
    };

    // 1. Process Existing Employee Updates
    if (empTable && empTable.rows) {
      const nameKey = getEmpFieldKey(empTable.headers, 'employee name');
      const locKey = getEmpFieldKey(empTable.headers, 'location');
      const jobKey = getEmpFieldKey(empTable.headers, 'job number');
      const classKey = getEmpFieldKey(empTable.headers, 'job classification');
      const secKey = getEmpFieldKey(empTable.headers, 'secondary job number');
      const statusKey = getEmpFieldKey(empTable.headers, 'status');
      const lastDayKey = getEmpFieldKey(empTable.headers, 'last day');
      const lastDayReasonKey = getEmpFieldKey(empTable.headers, 'last day reason');
      const notesKey = getEmpFieldKey(empTable.headers, 'notes');

      for (const change of matchedEmployeeChanges) {
        const row = change.targetRow || this.findMatchingEmployee(change.rosterName || change.employeeName, empTable.rows);
        if (row) {
          const updatedFields = {};
          if (change.newLocation && locKey) {
            row[locKey] = change.newLocation;
            updatedFields[locKey] = change.newLocation;
          }
          if (change.newJobNumber && jobKey) {
            row[jobKey] = change.newJobNumber;
            updatedFields[jobKey] = change.newJobNumber;
          }
          if (change.newClassification && classKey) {
            row[classKey] = change.newClassification;
            updatedFields[classKey] = change.newClassification;
          }
          if (change.newSecondaryJobNumber !== undefined && secKey) {
            row[secKey] = change.newSecondaryJobNumber;
            updatedFields[secKey] = change.newSecondaryJobNumber;
          }

          this.syncRowToRawGrid(empTable, row);
          appliedCount++;

          // Log in Employee History
          if (histTable) {
            const histRow = {
              'Date': todayFormatted,
              'Employee Name': this.getEmpRowName(row) || change.employeeName,
              'Event Type': change.changes.length > 1 ? 'Multiple Changes' : (change.changes[0] || 'Transfer'),
              'Location': change.newLocation || (locKey ? row[locKey] : ''),
              'Job Number': change.newJobNumber || (jobKey ? row[jobKey] : ''),
              'Notes': `Crew Import: ${change.changes.join(', ')}`
            };
            histTable.rows.unshift(histRow);
            histTable.rowCount = histTable.rows.length;
            this.syncRowToRawGrid(histTable, histRow, true);

            await this.db.addMutation({
              action: 'ADD_ROW',
              sheetName: histTable.name,
              tableKey: 'employee_history',
              rowData: histRow
            });
          }

          // Queue UPDATE_ROW for Employees
          await this.db.addMutation({
            action: 'UPDATE_ROW',
            sheetName: empTable.name,
            tableKey: 'employees',
            itemIdentifier: this.getEmpRowName(row) || change.employeeName,
            updatedFields: updatedFields
          });
        }
      }

      // Process Quits / Terminations
      for (const q of (quits || [])) {
        const row = q.targetRow || this.findMatchingEmployee(q.rosterName || q.name, empTable.rows);
        if (row) {
          const updatedFields = {};
          if (q.isScheduledDeparture) {
            // Employee is still actively working on a crew this week until their last day (e.g. Dillon Deane on 052-26)
            const reasonVal = (q.note && /fire/i.test(q.note)) ? 'Fired' : ((q.note && /layoff/i.test(q.note)) ? 'Layoff' : ((q.note && /resign/i.test(q.note)) ? 'Resigned' : 'Quit'));
            if (statusKey) { row[statusKey] = 'Active'; updatedFields[statusKey] = 'Active'; }
            if (lastDayKey) { row[lastDayKey] = '08/27/2026'; updatedFields[lastDayKey] = '08/27/2026'; }
            if (lastDayReasonKey) { row[lastDayReasonKey] = reasonVal; updatedFields[lastDayReasonKey] = reasonVal; }
            if (notesKey) {
              const curNote = String(row[notesKey] || '').trim();
              if (!curNote.includes('Last day')) {
                row[notesKey] = curNote ? `${curNote} | ${q.note}` : q.note;
              }
              updatedFields[notesKey] = row[notesKey];
            }
            this.syncRowToRawGrid(empTable, row);
            appliedCount++;

            if (histTable) {
              const histRow = {
                'Date': todayFormatted,
                'Employee Name': this.getEmpRowName(row) || q.name,
                'Event Type': 'Scheduled Departure',
                'Location': this.getEmpRowLocation(row) || '',
                'Job Number': this.getEmpRowJobNumber(row) || '',
                'Notes': `Scheduled Departure: ${q.note} (Active on crew ${q.activeCrewJob || ''} until last day)`
              };
              histTable.rows.unshift(histRow);
              histTable.rowCount = histTable.rows.length;
              this.syncRowToRawGrid(histTable, histRow, true);

              await this.db.addMutation({
                action: 'ADD_ROW',
                sheetName: histTable.name,
                tableKey: 'employee_history',
                rowData: histRow
              });
            }

            await this.db.addMutation({
              action: 'UPDATE_ROW',
              sheetName: empTable.name,
              tableKey: 'employees',
              itemIdentifier: this.getEmpRowName(row) || q.name,
              updatedFields: updatedFields
            });
          } else {
            // Immediate Termination: employee is not on any crew this week
            const reasonVal = (q.note && /fire/i.test(q.note)) ? 'Fired' : ((q.note && /layoff/i.test(q.note)) ? 'Layoff' : ((q.note && /resign/i.test(q.note)) ? 'Resigned' : 'Quit'));
            if (statusKey) { row[statusKey] = 'Previous Employee'; updatedFields[statusKey] = 'Previous Employee'; }
            else if (locKey) { row[locKey] = 'Previous Employee'; updatedFields[locKey] = 'Previous Employee'; }
            if (lastDayKey) { row[lastDayKey] = todayFormatted; updatedFields[lastDayKey] = todayFormatted; }
            if (lastDayReasonKey) { row[lastDayReasonKey] = reasonVal; updatedFields[lastDayReasonKey] = reasonVal; }
            this.syncRowToRawGrid(empTable, row);
            appliedCount++;

            if (histTable) {
              const histRow = {
                'Date': todayFormatted,
                'Employee Name': this.getEmpRowName(row) || q.name,
                'Event Type': 'Termination',
                'Location': this.getEmpRowLocation(row) || '',
                'Job Number': this.getEmpRowJobNumber(row) || '',
                'Notes': `Quit / Leaving: ${q.note}`
              };
              histTable.rows.unshift(histRow);
              histTable.rowCount = histTable.rows.length;
              this.syncRowToRawGrid(histTable, histRow, true);

              await this.db.addMutation({
                action: 'ADD_ROW',
                sheetName: histTable.name,
                tableKey: 'employee_history',
                rowData: histRow
              });
            }

            await this.db.addMutation({
              action: 'UPDATE_ROW',
              sheetName: empTable.name,
              tableKey: 'employees',
              itemIdentifier: this.getEmpRowName(row) || q.name,
              updatedFields: updatedFields
            });
          }
        }
      }

      // Process Full-Week Time Off (e.g. John Baker, Ben Lapka, James Erickson, Chad Cliff, Andrew West)
      for (const to of (timeOff || [])) {
        if (to.isFullWeekOff) {
          const row = to.targetRow || this.findMatchingEmployee(to.rosterName || to.name, empTable.rows);
          if (row) {
            const oldLoc = this.getEmpRowLocation(row);
            const rawCity = oldLoc ? oldLoc.replace(/\s*\([^)]*\)/g, '').trim() : 'Helena';
            const vacationLoc = `${rawCity || 'Helena'} (Vacation)`;

            const updatedFields = {};
            if (locKey) { row[locKey] = vacationLoc; updatedFields[locKey] = vacationLoc; }
            if (jobKey) { row[jobKey] = ''; updatedFields[jobKey] = ''; }
            if (notesKey) {
              row[notesKey] = to.note || 'Time Off wk 8-24';
              updatedFields[notesKey] = row[notesKey];
            }
            this.syncRowToRawGrid(empTable, row);
            appliedCount++;

            if (histTable) {
              const histRow = {
                'Date': todayFormatted,
                'Employee Name': this.getEmpRowName(row) || to.name,
                'Event Type': 'Time Off',
                'Location': vacationLoc,
                'Job Number': '',
                'Notes': `Time Off: ${to.note}`
              };
              histTable.rows.unshift(histRow);
              histTable.rowCount = histTable.rows.length;
              this.syncRowToRawGrid(histTable, histRow, true);

              await this.db.addMutation({
                action: 'ADD_ROW',
                sheetName: histTable.name,
                tableKey: 'employee_history',
                rowData: histRow
              });
            }

            await this.db.addMutation({
              action: 'UPDATE_ROW',
              sheetName: empTable.name,
              tableKey: 'employees',
              itemIdentifier: this.getEmpRowName(row) || to.name,
              updatedFields: updatedFields
            });
          }
        }
      }
    }

    // 2. Process New Hires & Rehires
    const allNewEmps = [...newHires, ...rehires];
    if (empTable && empTable.rows) {
      const nameKey = getEmpFieldKey(empTable.headers, 'employee name');
      const statusKey = getEmpFieldKey(empTable.headers, 'status');
      const locKey = getEmpFieldKey(empTable.headers, 'location');
      const jobKey = getEmpFieldKey(empTable.headers, 'job number');
      const secKey = getEmpFieldKey(empTable.headers, 'secondary job number');
      const classKey = getEmpFieldKey(empTable.headers, 'job classification');
      const hireKey = getEmpFieldKey(empTable.headers, 'hire date');
      const gloveKey = getEmpFieldKey(empTable.headers, 'glove size');
      const sleeveKey = getEmpFieldKey(empTable.headers, 'sleeve size');
      const phoneKey = getEmpFieldKey(empTable.headers, 'phone number') || getEmpFieldKey(empTable.headers, 'phone');
      const emailKey = getEmpFieldKey(empTable.headers, 'email address') || getEmpFieldKey(empTable.headers, 'email') || getEmpFieldKey(empTable.headers, 'mp email');

      for (const nh of allNewEmps) {
        const cfg = this.getNewHireConfig(nh.name, nh);
        const hireDateFormatted = cfg.hireDate ? this.formatDateForSheet(cfg.hireDate) : (this.rosterDateFormatted || todayFormatted);
        const gloveVal = cfg.gloveSize || (nh.historyRecord ? (nh.historyRecord['Glove Size'] || '10') : '10');
        const sleeveVal = cfg.sleeveSize || (nh.historyRecord ? (nh.historyRecord['Sleeve Size'] || 'Regular') : 'Regular');
        const phoneVal = cfg.phone || (nh.historyRecord ? (nh.historyRecord['Phone Number'] || '') : '');
        const emailVal = cfg.email || '';
        const classVal = cfg.classification || nh.classification || 'JRY';

        let targetEmpRow = nh.targetRow || this.findMatchingEmployee(nh.name, empTable.rows);

        if (!targetEmpRow && nh.jobNumber) {
          // If row exists with matching job number & location, but blank or corrupted name, match it!
          targetEmpRow = empTable.rows.find(r => {
            const rJob = this.getEmpRowJobNumber(r);
            const rName = this.getEmpRowName(r);
            return this.areJobNumbersEquivalent(rJob, nh.jobNumber) && (!rName || rName.toLowerCase() === 'active' || this.cleanNameForMatch(rName) === this.cleanNameForMatch(nh.name));
          });
        }

        if (targetEmpRow) {
          // Employee row already exists in Employees sheet -> update assignments & ensure name and active status
          const updatedFields = {};
          if (nameKey) { targetEmpRow[nameKey] = nh.name; updatedFields[nameKey] = nh.name; }
          if (locKey) { targetEmpRow[locKey] = nh.location || 'Helena'; updatedFields[locKey] = nh.location || 'Helena'; }
          if (jobKey) { targetEmpRow[jobKey] = nh.jobNumber; updatedFields[jobKey] = nh.jobNumber; }
          if (secKey && nh.secondaryJobNumber) { targetEmpRow[secKey] = nh.secondaryJobNumber; updatedFields[secKey] = nh.secondaryJobNumber; }
          if (classKey) { targetEmpRow[classKey] = classVal; updatedFields[classKey] = classVal; }
          if (statusKey) { targetEmpRow[statusKey] = 'Active'; updatedFields[statusKey] = 'Active'; }
          if (hireKey) {
            targetEmpRow[hireKey] = hireDateFormatted;
            updatedFields[hireKey] = hireDateFormatted;
          }
          if (gloveKey && gloveVal) { targetEmpRow[gloveKey] = gloveVal; updatedFields[gloveKey] = gloveVal; }
          if (sleeveKey && sleeveVal) { targetEmpRow[sleeveKey] = sleeveVal; updatedFields[sleeveKey] = sleeveVal; }
          if (phoneKey && phoneVal) { targetEmpRow[phoneKey] = phoneVal; updatedFields[phoneKey] = phoneVal; }
          if (emailKey && emailVal) { targetEmpRow[emailKey] = emailVal; updatedFields[emailKey] = emailVal; }

          this.syncRowToRawGrid(empTable, targetEmpRow);
          appliedCount++;

          await this.db.addMutation({
            action: 'UPDATE_ROW',
            sheetName: empTable.name,
            tableKey: 'employees',
            itemIdentifier: nh.name,
            updatedFields: updatedFields
          });
        } else {
          // Brand new employee row to insert
          const newEmpRow = {};
          for (const h of (empTable.headers || [])) {
            newEmpRow[h] = '';
          }
          if (nameKey) newEmpRow[nameKey] = nh.name;
          if (locKey) newEmpRow[locKey] = nh.location || 'Helena';
          if (jobKey) newEmpRow[jobKey] = nh.jobNumber;
          if (secKey && nh.secondaryJobNumber) newEmpRow[secKey] = nh.secondaryJobNumber;
          if (classKey) newEmpRow[classKey] = classVal;
          if (statusKey) newEmpRow[statusKey] = 'Active';
          if (hireKey) newEmpRow[hireKey] = hireDateFormatted;
          if (gloveKey) newEmpRow[gloveKey] = gloveVal;
          if (sleeveKey) newEmpRow[sleeveKey] = sleeveVal;
          if (phoneKey && phoneVal) newEmpRow[phoneKey] = phoneVal;
          if (emailKey && emailVal) newEmpRow[emailKey] = emailVal;

          empTable.rows.push(newEmpRow);
          empTable.rowCount = empTable.rows.length;
          this.syncRowToRawGrid(empTable, newEmpRow, true);
          appliedCount++;

          await this.db.addMutation({
            action: 'ADD_ROW',
            sheetName: empTable.name,
            tableKey: 'employees',
            rowData: newEmpRow
          });
        }

        // Log history entry with configured hire date
        if (histTable) {
          const histRow = {
            'Date': hireDateFormatted,
            'Employee Name': nh.name,
            'Event Type': nh.isRehire ? 'Rehire' : 'New Hire',
            'Location': locKey ? (targetEmpRow ? targetEmpRow[locKey] : (nh.location || 'Helena')) : (nh.location || 'Helena'),
            'Job Number': jobKey ? (targetEmpRow ? targetEmpRow[jobKey] : nh.jobNumber) : nh.jobNumber,
            'Hire Date': hireDateFormatted,
            'Notes': nh.isRehire ? 'Rehired via Crew Makeup Import' : 'New Hire added via Crew Makeup Import'
          };
          histTable.rows.unshift(histRow);
          histTable.rowCount = histTable.rows.length;
          this.syncRowToRawGrid(histTable, histRow, true);

          await this.db.addMutation({
            action: 'ADD_ROW',
            sheetName: histTable.name,
            tableKey: 'employee_history',
            rowData: histRow
          });
        }
      }
    }

    // 3. Synchronize Job Tracking Sheet (25 Columns)
    if (jtTable && jtTable.rows) {
      for (const crew of this.parsedCrews) {
        if (crew.excluded) continue;

        let jobRow = jtTable.rows.find(j => {
          const jn = String(j['Job Number'] || j['Job #'] || Object.values(j)[0] || '').trim();
          return jn === crew.jobNumber;
        });

        const isNewJob = !jobRow;
        const foremanName = crew.lead ? crew.lead.name : '';
        const crewSize = crew.crewSize;
        const physicalLoc = crew.location;
        const days = crew.scheduleDays || this.getScheduleFlags(crew.scheduleLabel);
        const status = crew.status || 'Active';

        if (isNewJob) {
          jobRow = {
            'Job Number': crew.jobNumber,
            'Job Name': crew.fullHeaderText || `${crew.location} ${crew.jobNumber}`,
            'Location': physicalLoc,
            'Foreman': foremanName,
            'Crew Size': crewSize,
            'Status': status,
            'Skip Sun': days.skipSun,
            'Skip Mon': days.skipMon,
            'Skip Tue': days.skipTue,
            'Skip Wed': days.skipWed,
            'Skip Thu': days.skipThu,
            'Skip Fri': days.skipFri,
            'Skip Sat': days.skipSat,
            'Skip Weekly Meeting': days.skipMeeting,
            'Skip Monthly Checklist': days.skipChecklist,
            'Work Schedule': days.label || crew.scheduleLabel || 'Mon-Thu',
            'Start Date': status === 'Pending Start' ? (crew.startDate || todayFormatted) : todayFormatted,
            'Last Updated': todayFormatted
          };
          jtTable.rows.push(jobRow);
          jtTable.rowCount = jtTable.rows.length;
          this.syncRowToRawGrid(jtTable, jobRow, true);

          await this.db.addMutation({
            action: 'ADD_ROW',
            sheetName: jtTable.name,
            tableKey: 'job_tracking',
            rowData: jobRow
          });
        } else {
          // Update existing job
          jobRow['Location'] = physicalLoc;
          jobRow['Foreman'] = foremanName;
          jobRow['Crew Size'] = crewSize;
          jobRow['Status'] = status;
          jobRow['Skip Sun'] = days.skipSun;
          jobRow['Skip Mon'] = days.skipMon;
          jobRow['Skip Tue'] = days.skipTue;
          jobRow['Skip Wed'] = days.skipWed;
          jobRow['Skip Thu'] = days.skipThu;
          jobRow['Skip Fri'] = days.skipFri;
          jobRow['Skip Sat'] = days.skipSat;
          jobRow['Skip Weekly Meeting'] = days.skipMeeting;
          jobRow['Skip Monthly Checklist'] = days.skipChecklist;
          jobRow['Work Schedule'] = days.label || crew.scheduleLabel || 'Mon-Thu';
          jobRow['Last Updated'] = todayFormatted;

          if (status === 'On Hold') {
            jobRow['Put On Hold Date'] = crew.onHoldDate || todayFormatted;
            jobRow['Estimated Return'] = crew.estimatedReturn || '';
          } else if (status === 'Pending Start') {
            jobRow['Start Date'] = crew.startDate || '';
          } else if (status === 'Completed') {
            jobRow['Actual End Date'] = crew.actualEndDate || todayFormatted;
          } else if (status === 'Active') {
            if (!jobRow['Start Date']) jobRow['Start Date'] = todayFormatted;
            jobRow['Put On Hold Date'] = '';
            jobRow['Estimated Return'] = '';
          }

          this.syncRowToRawGrid(jtTable, jobRow);

          await this.db.addMutation({
            action: 'UPDATE_ROW',
            sheetName: jtTable.name,
            tableKey: 'job_tracking',
            itemIdentifier: crew.jobNumber,
            updatedFields: {
              'Location': physicalLoc,
              'Foreman': foremanName,
              'Crew Size': crewSize,
              'Status': status,
              'Skip Sun': days.skipSun,
              'Skip Mon': days.skipMon,
              'Skip Tue': days.skipTue,
              'Skip Wed': days.skipWed,
              'Skip Thu': days.skipThu,
              'Skip Fri': days.skipFri,
              'Skip Sat': days.skipSat,
              'Skip Weekly Meeting': days.skipMeeting,
              'Skip Monthly Checklist': days.skipChecklist,
              'Work Schedule': jobRow['Work Schedule'],
              'Last Updated': todayFormatted
            }
          });
        }
      }
    }

    // Queue Full Table Replacement for Employees and Job Tracking to guarantee 100% exact sync with Sheets
    if (empTable) {
      await this.db.addMutation({
        action: 'REPLACE_TABLE_DATA',
        sheetName: empTable.name || 'Employees',
        tableKey: 'employees',
        rawGrid: empTable.rawGrid,
        headers: empTable.headers,
        rows: empTable.rows
      });
    }
    if (jtTable) {
      await this.db.addMutation({
        action: 'REPLACE_TABLE_DATA',
        sheetName: jtTable.name || 'Job Tracking',
        tableKey: 'job_tracking',
        rawGrid: jtTable.rawGrid,
        headers: jtTable.headers,
        rows: jtTable.rows
      });
    }

    // Save database state
    if (this.db && typeof this.db.setSnapshot === 'function') {
      await this.db.setSnapshot(this.db.snapshot);
    }

    return {
      success: true,
      appliedCount: appliedCount,
      totalChanges: this.computedDeltas.totalChanges,
      message: `Successfully applied ${appliedCount} updates across Employees, Job Tracking, and Employee History!`
    };
  }

  syncRowToRawGrid(table, rowObj, isNew = false) {
    if (!table || !table.rawGrid || !table.headers) return;
    const gridRow = table.headers.map(h => rowObj[h] !== undefined ? rowObj[h] : '');

    if (isNew) {
      table.rawGrid.push(gridRow);
      rowObj._rowIdx = table.rawGrid.length;
      table.maxRows = table.rawGrid.length;
      table.rowCount = table.rows ? table.rows.length : table.rawGrid.length - 1;
    } else {
      let gridIdx = -1;
      if (typeof rowObj._rowIdx === 'number' && rowObj._rowIdx >= 2 && rowObj._rowIdx <= table.rawGrid.length) {
        gridIdx = rowObj._rowIdx - 1;
      } else {
        const idKey = table.headers[0];
        const rowId = String(rowObj[idKey] || rowObj['Employee Name'] || rowObj['Name'] || rowObj['Job Number'] || '').trim().toLowerCase();
        if (rowId) {
          gridIdx = table.rawGrid.findIndex((gr, idx) => {
            if (idx === 0) return false;
            return String(gr[0] || '').trim().toLowerCase() === rowId;
          });
        }
      }
      if (gridIdx > 0 && gridIdx < table.rawGrid.length) {
        table.rawGrid[gridIdx] = gridRow;
      }
    }
  }

  // ==========================================================================
  // 5. INTERACTIVE UI WORKSPACE & MODAL RENDERING
  // ==========================================================================

  renderWorkspaceHtml() {
    const deltas = this.computedDeltas || (this.parsedCrews.length > 0 ? this.computeChangeDeltas() : null);
    const hasNewHires = deltas && deltas.newHires && deltas.newHires.length > 0;

    return `
      <div class="crew-import-container" style="padding: 24px 24px 80px 24px; max-width: 1400px; width: 100%; margin: 0 auto; box-sizing: border-box;">
        
        <!-- Header -->
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
          <div>
            <h2 style="font-size: 22px; font-weight: 800; color: var(--text-primary); margin: 0; display: flex; align-items: center; gap: 8px;">
              <span>👥</span> Crew Makeup Import
            </h2>
            <p style="font-size: 13px; color: var(--text-muted); margin: 4px 0 0 0;">
              Upload company crew rosters (.xlsx, .xls, .csv) to auto-detect foremen, renumber positions, and synchronize Job Tracking.
            </p>
          </div>
          <div style="display: flex; align-items: center; gap: 8px;">
            <button class="btn btn-secondary" onclick="window.crewImportEngine.resetImport()" style="font-size: 12px; cursor: pointer;">
              🔄 Reset
            </button>
          </div>
        </div>

        <!-- Wizard Step Bar -->
        <div class="wizard-steps" style="display: flex; gap: 12px; margin-bottom: 24px;">
          <div class="wizard-step ${this.activeStep === 1 ? 'active' : ''}" style="flex: 1; padding: 12px; background: var(--bg-secondary); border-radius: 8px; border-left: 4px solid ${this.activeStep === 1 ? '#3b82f6' : '#64748b'};">
            <div style="font-size: 11px; color: var(--text-muted); font-weight: 700;">STEP 1</div>
            <div style="font-size: 13px; font-weight: 700; color: var(--text-primary);">📁 Upload Excel File</div>
          </div>
          <div class="wizard-step ${this.activeStep === 2 ? 'active' : ''}" style="flex: 1; padding: 12px; background: var(--bg-secondary); border-radius: 8px; border-left: 4px solid ${this.activeStep === 2 ? '#3b82f6' : '#64748b'};">
            <div style="font-size: 11px; color: var(--text-muted); font-weight: 700;">STEP 2</div>
            <div style="font-size: 13px; font-weight: 700; color: var(--text-primary);">👷 Review Crews & Foremen</div>
          </div>
          ${hasNewHires ? `
            <div class="wizard-step ${this.activeStep === 3 ? 'active' : ''}" style="flex: 1; padding: 12px; background: var(--bg-secondary); border-radius: 8px; border-left: 4px solid ${this.activeStep === 3 ? '#10b981' : '#64748b'};">
              <div style="font-size: 11px; color: var(--text-muted); font-weight: 700;">STEP 3</div>
              <div style="font-size: 13px; font-weight: 700; color: var(--text-primary);">👤 Configure New Hires (${deltas.newHires.length})</div>
            </div>
            <div class="wizard-step ${this.activeStep === 4 ? 'active' : ''}" style="flex: 1; padding: 12px; background: var(--bg-secondary); border-radius: 8px; border-left: 4px solid ${this.activeStep === 4 ? '#3b82f6' : '#64748b'};">
              <div style="font-size: 11px; color: var(--text-muted); font-weight: 700;">STEP 4</div>
              <div style="font-size: 13px; font-weight: 700; color: var(--text-primary);">🔍 Review Changes & Apply</div>
            </div>
          ` : `
            <div class="wizard-step ${this.activeStep === 3 || this.activeStep === 4 ? 'active' : ''}" style="flex: 1; padding: 12px; background: var(--bg-secondary); border-radius: 8px; border-left: 4px solid ${this.activeStep === 3 || this.activeStep === 4 ? '#3b82f6' : '#64748b'};">
              <div style="font-size: 11px; color: var(--text-muted); font-weight: 700;">STEP 3</div>
              <div style="font-size: 13px; font-weight: 700; color: var(--text-primary);">🔍 Review Changes & Apply</div>
            </div>
          `}
        </div>

        <!-- Step Content Area -->
        <div id="crew-import-step-content">
          ${this.renderStepContent()}
        </div>

      </div>
    `;
  }

  renderStepContent() {
    const deltas = this.computedDeltas || (this.parsedCrews.length > 0 ? this.computeChangeDeltas() : null);
    const hasNewHires = deltas && deltas.newHires && deltas.newHires.length > 0;

    if (this.activeStep === 1) {
      return `
        <div class="upload-dropzone" id="crew-import-dropzone" style="border: 2px dashed #3b82f6; border-radius: 12px; background: rgba(59, 130, 246, 0.05); padding: 50px 20px; text-align: center; cursor: pointer; transition: all 0.2s;" onclick="document.getElementById('crew-import-file-input').click()">
          <div style="font-size: 48px; margin-bottom: 12px;">📊</div>
          <h3 style="font-size: 18px; font-weight: 800; color: var(--text-primary); margin-bottom: 6px;">
            Drag & Drop Crew Makeup Excel File
          </h3>
          <p style="font-size: 13px; color: var(--text-muted); margin-bottom: 16px;">
            Supports .xlsx, .xls, and .csv formats. Client-side processing (instant & offline).
          </p>
          <input type="file" id="crew-import-file-input" accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv,*/*" style="display: none;" onchange="window.crewImportEngine.handleFileSelected(event)">
          <button class="btn btn-primary" style="font-size: 13px; font-weight: 700; pointer-events: none;">
            Browse File
          </button>
        </div>
      `;
    }

    if (this.activeStep === 2) {
      const visibleCrews = this.parsedCrews.filter(c => !c.excluded);

      return `
        <div>
          <!-- Tab Selector if Multi-Sheet -->
          ${this.workbook && this.workbook.SheetNames.length > 1 ? `
            <div style="margin-bottom: 16px; display: flex; align-items: center; gap: 8px;">
              <span style="font-size: 12px; font-weight: 700; color: var(--text-muted);">Select Sheet Tab:</span>
              <div style="display: flex; gap: 6px; flex-wrap: wrap;">
                ${this.workbook.SheetNames.map(sn => `
                  <button class="btn ${this.selectedSheet === sn ? 'btn-primary' : 'btn-secondary'}" style="font-size: 12px; padding: 4px 10px; cursor: pointer;" onclick="window.crewImportEngine.switchSheetTab('${sn}')">
                    📄 ${sn}
                  </button>
                `).join('')}
              </div>
            </div>
          ` : ''}

          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
            <div style="font-size: 14px; font-weight: 800; color: var(--text-primary);">
              Parsed Crews (${visibleCrews.length} Active Crews Found)
            </div>
            <button class="btn btn-primary" onclick="${hasNewHires ? 'window.crewImportEngine.goToStep(3)' : 'window.crewImportEngine.goToStep(4)'}" style="font-size: 13px; font-weight: 700; display: inline-flex; align-items: center; gap: 6px; cursor: pointer;">
              ${hasNewHires ? `Configure New Hires (${deltas.newHires.length}) ➡️` : 'Proceed to Changes Preview ➡️'}
            </button>
          </div>

          <!-- Crew Cards Grid -->
          <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(380px, 1fr)); gap: 16px;">
            ${visibleCrews.map(crew => this.renderCrewCardHtml(crew)).join('')}
          </div>
        </div>
      `;
    }

    if (this.activeStep === 3 && hasNewHires) {
      return `
        <div>
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
            <div>
              <h3 style="font-size: 16px; font-weight: 800; color: var(--text-primary); margin: 0; display: flex; align-items: center; gap: 8px;">
                <span>👤</span> Configure New Hire Information (${deltas.newHires.length} New Hires Detected)
              </h3>
              <p style="font-size: 12.5px; color: var(--text-muted); margin: 4px 0 0 0;">
                Review and customize the exact Start / Hire Date, PPE Sizes, Phone Number, and Role before proceeding to approval.
              </p>
            </div>
            <div style="display: flex; gap: 8px;">
              <button class="btn btn-secondary" onclick="window.crewImportEngine.goToStep(2)" style="font-size: 13px; cursor: pointer;">
                ⬅️ Back to Crews
              </button>
              <button class="btn btn-primary" onclick="window.crewImportEngine.goToStep(4)" style="font-size: 13px; font-weight: 700; display: inline-flex; align-items: center; gap: 6px; cursor: pointer;">
                Proceed to Changes Preview ➡️
              </button>
            </div>
          </div>

          <!-- New Hires Cards List -->
          <div style="display: flex; flex-direction: column; gap: 14px; margin-bottom: 24px;">
            ${deltas.newHires.map(nh => {
              const cfg = this.getNewHireConfig(nh.name, nh);
              const gloveOptions = ['8', '8.5', '9', '9.5', '10', '10.5', '11', '11.5', '12', 'N/A'];
              const sleeveOptions = ['Regular', 'Large', 'X-Large', 'N/A'];

              return `
                <div class="new-hire-card" style="background: var(--bg-secondary); border: 1px solid var(--border-color); border-left: 4px solid #10b981; border-radius: 8px; padding: 16px; box-shadow: 0 1px 4px rgba(0,0,0,0.2);">
                  <!-- Top Row: Name, Location, Job, Badges -->
                  <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; border-bottom: 1px solid rgba(255,255,255,0.06); padding-bottom: 8px;">
                    <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                      <span style="font-size: 15px; font-weight: 800; color: #f8fafc;">👤 ${this.escapeHtml(nh.name)}</span>
                      <span class="badge" style="background: rgba(16, 185, 129, 0.2); color: #10b981; border: 1px solid rgba(16, 185, 129, 0.4); font-size: 10.5px; font-weight: 700; padding: 2px 6px; border-radius: 4px;">NEW HIRE</span>
                      <span class="badge" style="background: rgba(59, 130, 246, 0.2); color: #93c5fd; border: 1px solid rgba(59, 130, 246, 0.4); font-size: 11px; font-weight: 700; padding: 2px 6px; border-radius: 4px;">📍 ${this.escapeHtml(nh.location)} — Job ${this.escapeHtml(nh.jobNumber)}</span>
                    </div>
                    <div style="font-size: 11.5px; color: var(--text-muted);">
                      Crew: <strong style="color: #60a5fa;">${this.escapeHtml(nh.jobNumber)}</strong>
                    </div>
                  </div>

                  <!-- Inputs Form Grid -->
                  <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px;">
                    
                    <!-- Hire Date / Start Date -->
                    <div>
                      <label style="font-size: 11px; font-weight: 700; color: #94a3b8; display: block; margin-bottom: 4px;">📅 Start / Hire Date</label>
                      <input type="date" value="${cfg.hireDate}" style="width: 100%; box-sizing: border-box; padding: 6px 8px; font-size: 12px; background: var(--bg-primary); border: 1px solid var(--border-color); border-radius: 6px; color: #fff; font-weight: 700;" onchange="window.crewImportEngine.updateNewHireConfig('${this.escapeJsString(nh.name)}', 'hireDate', this.value)">
                    </div>

                    <!-- Glove Size -->
                    <div>
                      <label style="font-size: 11px; font-weight: 700; color: #94a3b8; display: block; margin-bottom: 4px;">🧤 Glove Size</label>
                      <select style="width: 100%; box-sizing: border-box; padding: 6px 8px; font-size: 12px; background: var(--bg-primary); border: 1px solid var(--border-color); border-radius: 6px; color: #fff; font-weight: 700;" onchange="window.crewImportEngine.updateNewHireConfig('${this.escapeJsString(nh.name)}', 'gloveSize', this.value)">
                        ${gloveOptions.map(s => `<option value="${s}" ${cfg.gloveSize === s ? 'selected' : ''}>${s}</option>`).join('')}
                      </select>
                    </div>

                    <!-- Sleeve Size -->
                    <div>
                      <label style="font-size: 11px; font-weight: 700; color: #94a3b8; display: block; margin-bottom: 4px;">🧥 Sleeve Size</label>
                      <select style="width: 100%; box-sizing: border-box; padding: 6px 8px; font-size: 12px; background: var(--bg-primary); border: 1px solid var(--border-color); border-radius: 6px; color: #fff; font-weight: 700;" onchange="window.crewImportEngine.updateNewHireConfig('${this.escapeJsString(nh.name)}', 'sleeveSize', this.value)">
                        ${sleeveOptions.map(s => `<option value="${s}" ${cfg.sleeveSize === s ? 'selected' : ''}>${s}</option>`).join('')}
                      </select>
                    </div>

                    <!-- Phone Number -->
                    <div>
                      <label style="font-size: 11px; font-weight: 700; color: #94a3b8; display: block; margin-bottom: 4px;">📱 Phone Number</label>
                      <input type="tel" placeholder="(xxx) xxx-xxxx" value="${this.escapeHtml(cfg.phone)}" style="width: 100%; box-sizing: border-box; padding: 6px 8px; font-size: 12px; background: var(--bg-primary); border: 1px solid var(--border-color); border-radius: 6px; color: #fff;" onchange="window.crewImportEngine.updateNewHireConfig('${this.escapeJsString(nh.name)}', 'phone', this.value)">
                    </div>

                    <!-- Email Address -->
                    <div>
                      <label style="font-size: 11px; font-weight: 700; color: #94a3b8; display: block; margin-bottom: 4px;">✉️ Email Address</label>
                      <input type="email" placeholder="name@mountainpower.com" value="${this.escapeHtml(cfg.email)}" style="width: 100%; box-sizing: border-box; padding: 6px 8px; font-size: 12px; background: var(--bg-primary); border: 1px solid var(--border-color); border-radius: 6px; color: #fff;" onchange="window.crewImportEngine.updateNewHireConfig('${this.escapeJsString(nh.name)}', 'email', this.value)">
                    </div>

                    <!-- Classification -->
                    <div>
                      <label style="font-size: 11px; font-weight: 700; color: #94a3b8; display: block; margin-bottom: 4px;">🏷️ Classification</label>
                      <input type="text" value="${this.escapeHtml(cfg.classification)}" style="width: 100%; box-sizing: border-box; padding: 6px 8px; font-size: 12px; background: var(--bg-primary); border: 1px solid var(--border-color); border-radius: 6px; color: #fff; font-weight: 700;" onchange="window.crewImportEngine.updateNewHireConfig('${this.escapeJsString(nh.name)}', 'classification', this.value)">
                    </div>

                  </div>
                </div>
              `;
            }).join('')}
          </div>

          <!-- Bottom Navigation Controls -->
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <button class="btn btn-secondary" onclick="window.crewImportEngine.goToStep(2)" style="font-size: 13px; cursor: pointer;">
              ⬅️ Back to Crews
            </button>
            <button class="btn btn-primary" onclick="window.crewImportEngine.goToStep(4)" style="font-size: 13px; font-weight: 700; display: inline-flex; align-items: center; gap: 6px; cursor: pointer;">
              Proceed to Changes Preview ➡️
            </button>
          </div>
        </div>
      `;
    }

    if (this.activeStep === 4 || (this.activeStep === 3 && !hasNewHires)) {
      return `
        <div>
          <!-- Changes Summary Stats -->
          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 10px; margin-bottom: 20px;">
            <div style="background: var(--bg-secondary); border-left: 4px solid #10b981; border-radius: 8px; padding: 10px 12px;">
              <div style="font-size: 10px; color: var(--text-muted); font-weight: 700;">NEW HIRES</div>
              <div style="font-size: 20px; font-weight: 800; color: #10b981;">${deltas ? deltas.newHires.length : 0}</div>
            </div>
            <div style="background: var(--bg-secondary); border-left: 4px solid #3b82f6; border-radius: 8px; padding: 10px 12px;">
              <div style="font-size: 10px; color: var(--text-muted); font-weight: 700;">TRANSFERS</div>
              <div style="font-size: 20px; font-weight: 800; color: #3b82f6;">${deltas ? deltas.transfers.length : 0}</div>
            </div>
            <div style="background: var(--bg-secondary); border-left: 4px solid #8b5cf6; border-radius: 8px; padding: 10px 12px;">
              <div style="font-size: 10px; color: var(--text-muted); font-weight: 700;">ROLE CHANGES</div>
              <div style="font-size: 20px; font-weight: 800; color: #8b5cf6;">${deltas ? deltas.roleChanges.length : 0}</div>
            </div>
            <div style="background: var(--bg-secondary); border-left: 4px solid #ef4444; border-radius: 8px; padding: 10px 12px;">
              <div style="font-size: 10px; color: var(--text-muted); font-weight: 700;">QUITS / LEAVING</div>
              <div style="font-size: 20px; font-weight: 800; color: #ef4444;">${deltas && deltas.quits ? deltas.quits.length : 0}</div>
            </div>
            <div style="background: var(--bg-secondary); border-left: 4px solid #f59e0b; border-radius: 8px; padding: 10px 12px;">
              <div style="font-size: 10px; color: var(--text-muted); font-weight: 700;">TIME OFF (THIS WK)</div>
              <div style="font-size: 20px; font-weight: 800; color: #f59e0b;">${deltas && deltas.timeOff ? deltas.timeOff.length : 0}</div>
            </div>
            <div style="background: var(--bg-secondary); border-left: 4px solid #f97316; border-radius: 8px; padding: 10px 12px;">
              <div style="font-size: 10px; color: var(--text-muted); font-weight: 700;">REHIRES</div>
              <div style="font-size: 20px; font-weight: 800; color: #f97316;">${deltas ? deltas.rehires.length : 0}</div>
            </div>
            <div style="background: var(--bg-secondary); border-left: 4px solid #06b6d4; border-radius: 8px; padding: 10px 12px;">
              <div style="font-size: 10px; color: var(--text-muted); font-weight: 700;">NEW JOBS</div>
              <div style="font-size: 20px; font-weight: 800; color: #06b6d4;">${deltas ? deltas.newJobsDetected.length : 0}</div>
            </div>
          </div>

          <!-- Changes Table View -->
          <div style="background: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: 8px; padding: 16px; margin-bottom: 20px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px;">
              <h3 style="font-size: 15px; font-weight: 800; color: var(--text-primary); margin: 0;">
                Detected Personnel & Crew Updates
              </h3>
              <span class="badge" style="background: var(--bg-tertiary); color: var(--text-muted); font-size: 11px; padding: 4px 8px; border-radius: 4px; font-weight: 700;">
                ${deltas ? deltas.totalChanges : 0} Total Updates
              </span>
            </div>
            
            <div style="max-height: 440px; overflow-y: auto;">
              <table style="width: 100%; border-collapse: collapse; font-size: 12px; text-align: left;">
                <thead>
                  <tr style="background: var(--bg-tertiary); color: var(--text-muted); font-size: 11px;">
                    <th style="padding: 8px 12px;">Employee / Job</th>
                    <th style="padding: 8px 12px;">Type</th>
                    <th style="padding: 8px 12px;">Changes & Assignments</th>
                  </tr>
                </thead>
                <tbody>
                  ${deltas ? deltas.newHires.map(nh => {
                    const cfg = this.getNewHireConfig(nh.name, nh);
                    const formattedDate = cfg.hireDate ? this.formatDateForSheet(cfg.hireDate) : (this.rosterDateFormatted || '');
                    return `
                      <tr style="border-bottom: 1px solid var(--border-color);">
                        <td style="padding: 8px 12px; font-weight: 700; color: #10b981;">👤 ${this.escapeHtml(nh.name)}</td>
                        <td style="padding: 8px 12px;"><span class="badge" style="background: rgba(16, 185, 129, 0.2); color: #10b981; padding: 2px 6px; border-radius: 4px; font-weight: 700;">New Hire</span></td>
                        <td style="padding: 8px 12px; color: var(--text-muted);">Location: <strong style="color: var(--text-primary);">${this.escapeHtml(nh.location)}</strong>, Job: <strong style="color: #60a5fa; font-family: monospace;">${this.escapeHtml(nh.jobNumber)}</strong>, Start: <strong style="color: #10b981;">${this.escapeHtml(formattedDate)}</strong>, Gloves: <strong style="color: #facc15;">${this.escapeHtml(cfg.gloveSize)}</strong>, Sleeves: <strong style="color: #facc15;">${this.escapeHtml(cfg.sleeveSize)}</strong>, Role: <strong style="color: var(--text-primary);">${this.escapeHtml(cfg.classification)}</strong></td>
                      </tr>
                    `;
                  }).join('') : ''}

                  ${deltas ? (deltas.quits || []).map(q => `
                    <tr style="border-bottom: 1px solid var(--border-color); background: ${q.isScheduledDeparture ? 'rgba(245, 158, 11, 0.04)' : 'rgba(239, 68, 68, 0.04)'};">
                      <td style="padding: 8px 12px; font-weight: 700; color: ${q.isScheduledDeparture ? '#f59e0b' : '#ef4444'};">
                        ${q.isScheduledDeparture ? '⏳' : '🚪'} ${this.escapeHtml(q.name)}
                      </td>
                      <td style="padding: 8px 12px;">
                        <span class="badge" style="background: ${q.isScheduledDeparture ? 'rgba(245, 158, 11, 0.2)' : 'rgba(239, 68, 68, 0.2)'}; color: ${q.isScheduledDeparture ? '#f59e0b' : '#ef4444'}; padding: 2px 6px; border-radius: 4px; font-weight: 700;">
                          ${q.isScheduledDeparture ? 'Scheduled Departure' : 'Quit / Leaving'}
                        </span>
                      </td>
                      <td style="padding: 8px 12px; color: ${q.isScheduledDeparture ? '#fbbf24' : '#f87171'}; font-weight: 600;">
                        ${this.escapeHtml(q.note)} ${q.isScheduledDeparture && q.activeCrewJob ? `<span style="color: #60a5fa; margin-left: 8px; font-weight: 700;">(Active ${q.activeCrewRole ? this.escapeHtml(q.activeCrewRole) + ' ' : ''}on ${this.escapeHtml(q.activeCrewJob)} until 8/27)</span>` : ''}
                      </td>
                    </tr>
                  `).join('') : ''}

                  ${deltas ? deltas.transfers.map(tr => `
                    <tr style="border-bottom: 1px solid var(--border-color);">
                      <td style="padding: 8px 12px; font-weight: 700; color: var(--text-primary);">👤 ${this.escapeHtml(tr.employeeName)}</td>
                      <td style="padding: 8px 12px;"><span class="badge" style="background: rgba(59, 130, 246, 0.2); color: #60a5fa; padding: 2px 6px; border-radius: 4px; font-weight: 700;">Transfer</span></td>
                      <td style="padding: 8px 12px; color: #60a5fa; font-weight: 600;">${this.escapeHtml(tr.changes.join(' | '))}</td>
                    </tr>
                  `).join('') : ''}

                  ${deltas ? (deltas.timeOff || []).map(to => `
                    <tr style="border-bottom: 1px solid var(--border-color); background: rgba(245, 158, 11, 0.04);">
                      <td style="padding: 8px 12px; font-weight: 700; color: #f59e0b;">🏖️ ${this.escapeHtml(to.name)}</td>
                      <td style="padding: 8px 12px;"><span class="badge" style="background: rgba(245, 158, 11, 0.2); color: #f59e0b; padding: 2px 6px; border-radius: 4px; font-weight: 700;">${to.isFullWeekOff ? 'Time Off (Full Wk)' : 'Time Off (Partial Wk)'}</span></td>
                      <td style="padding: 8px 12px; color: #fbbf24; font-weight: 600;">
                        ${this.escapeHtml(to.note)}
                        ${to.isFullWeekOff && to.oldJob ? `<span style="color: #60a5fa; margin-left: 8px;">(Moving off ${this.escapeHtml(to.oldJob)} → ${this.escapeHtml(to.oldLocation ? to.oldLocation.replace(/\\s*\\([^)]*\\)/g, '') : '')} (Vacation))</span>` : ''}
                        ${!to.isFullWeekOff && to.activeCrewJob ? `<span style="color: #10b981; margin-left: 8px;">(Working on ${this.escapeHtml(to.activeCrewJob)})</span>` : ''}
                      </td>
                    </tr>
                  `).join('') : ''}

                  ${deltas ? deltas.roleChanges.map(rc => `
                    <tr style="border-bottom: 1px solid var(--border-color);">
                      <td style="padding: 8px 12px; font-weight: 700; color: var(--text-primary);">👤 ${this.escapeHtml(rc.employeeName)}</td>
                      <td style="padding: 8px 12px;"><span class="badge" style="background: rgba(139, 92, 246, 0.2); color: #a78bfa; padding: 2px 6px; border-radius: 4px; font-weight: 700;">Role Change</span></td>
                      <td style="padding: 8px 12px; color: #a78bfa; font-weight: 600;">${this.escapeHtml(rc.changes.join(' | '))}</td>
                    </tr>
                  `).join('') : ''}

                  ${deltas ? deltas.rehires.map(rh => `
                    <tr style="border-bottom: 1px solid var(--border-color);">
                      <td style="padding: 8px 12px; font-weight: 700; color: #f59e0b;">👤 ${this.escapeHtml(rh.name)}</td>
                      <td style="padding: 8px 12px;"><span class="badge" style="background: rgba(245, 158, 11, 0.2); color: #f59e0b; padding: 2px 6px; border-radius: 4px; font-weight: 700;">Rehire</span></td>
                      <td style="padding: 8px 12px; color: var(--text-muted);">Rejoining at Location: <strong style="color: var(--text-primary);">${this.escapeHtml(rh.location)}</strong>, Job: <strong style="color: #60a5fa; font-family: monospace;">${this.escapeHtml(rh.jobNumber)}</strong></td>
                    </tr>
                  `).join('') : ''}

                  ${deltas ? deltas.newJobsDetected.map(nj => `
                    <tr style="border-bottom: 1px solid var(--border-color);">
                      <td style="padding: 8px 12px; font-weight: 700; color: #06b6d4; font-family: monospace;">📋 ${this.escapeHtml(nj.jobNumber)}</td>
                      <td style="padding: 8px 12px;"><span class="badge" style="background: rgba(6, 182, 212, 0.2); color: #06b6d4; padding: 2px 6px; border-radius: 4px; font-weight: 700;">New Job</span></td>
                      <td style="padding: 8px 12px; color: var(--text-muted);">New Job in ${this.escapeHtml(nj.location)} (Crew Size: ${nj.crewSize}, Lead: ${this.escapeHtml(nj.suggestedForeman || 'TBD')}, Sched: ${this.escapeHtml(nj.scheduleLabel)})</td>
                    </tr>
                  `).join('') : ''}

                  ${!deltas || deltas.totalChanges === 0 ? `
                    <tr>
                      <td colspan="3" style="padding: 24px; text-align: center; color: var(--text-muted);">
                        No changes detected. The database is already in sync with this Excel roster!
                      </td>
                    </tr>
                  ` : ''}
                </tbody>
              </table>
            </div>
          </div>

          <!-- Bottom Action Controls -->
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <button class="btn btn-secondary" onclick="window.crewImportEngine.goToStep(${hasNewHires ? 3 : 2})" style="font-size: 13px; cursor: pointer;">
              ${hasNewHires ? '⬅️ Back to New Hires' : '⬅️ Back to Crews'}
            </button>
            <button class="btn btn-primary" onclick="window.crewImportEngine.executeApply()" style="font-size: 14px; font-weight: 800; padding: 10px 24px; background: #10b981; border-color: #10b981; display: inline-flex; align-items: center; gap: 8px; box-shadow: 0 2px 8px rgba(16, 185, 129, 0.4); cursor: pointer;">
              <span>💾</span> Apply Crew Changes (${deltas ? deltas.totalChanges : 0} Updates)
            </button>
          </div>
        </div>
      `;
    }

    return '';
  }

  renderCrewCardHtml(crew) {
    if (crew.excluded) return '';
    const leadName = crew.lead ? crew.lead.name : '';
    const days = crew.scheduleDays || this.getScheduleFlags(crew.scheduleLabel);
    const status = crew.status || 'Active';

    const statusBadgeStyles = {
      'Active': { bg: 'rgba(16, 185, 129, 0.15)', color: '#10b981', border: '#10b981', label: 'Active' },
      'Pending Start': { bg: 'rgba(245, 158, 11, 0.15)', color: '#f59e0b', border: '#f59e0b', label: 'Pending Start' },
      'On Hold': { bg: 'rgba(100, 116, 139, 0.15)', color: '#94a3b8', border: '#64748b', label: 'On Hold' },
      'Completed': { bg: 'rgba(59, 130, 246, 0.15)', color: '#60a5fa', border: '#3b82f6', label: 'Completed' }
    };
    const sStyle = statusBadgeStyles[status] || statusBadgeStyles['Active'];

    // Day button pill definition
    const dayPills = [
      { key: 'skipSun', label: 'Su', isWork: !days.skipSun },
      { key: 'skipMon', label: 'M', isWork: !days.skipMon },
      { key: 'skipTue', label: 'Tu', isWork: !days.skipTue },
      { key: 'skipWed', label: 'W', isWork: !days.skipWed },
      { key: 'skipThu', label: 'Th', isWork: !days.skipThu },
      { key: 'skipFri', label: 'F', isWork: !days.skipFri },
      { key: 'skipSat', label: 'Sa', isWork: !days.skipSat }
    ];

    return `
      <div class="crew-card" id="crew-card-${crew.jobNumber}" style="background: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: 8px; padding: 14px; box-shadow: 0 1px 3px rgba(0,0,0,0.2);">
        
        <!-- Card Header -->
        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 10px; border-bottom: 1px solid var(--border-color); padding-bottom: 8px;">
          <div>
            <div style="font-weight: 800; font-size: 15px; color: var(--text-primary); display: flex; align-items: center; gap: 6px;">
              <span>${crew.location} ${crew.jobNumber}</span>
            </div>
            <div style="font-size: 11px; color: var(--text-muted); margin-top: 2px;">
              ${crew.fullHeaderText}
            </div>
          </div>
          
          <div style="display: flex; align-items: center; gap: 6px;">
            <!-- Status Dropdown -->
            <select class="form-control" style="font-size: 11px; font-weight: 700; padding: 3px 6px; background: ${sStyle.bg}; color: ${sStyle.color}; border: 1px solid ${sStyle.border}; border-radius: 4px; cursor: pointer;" onchange="window.crewImportEngine.handleStatusChange('${crew.jobNumber}', this.value)">
              <option value="Active" ${status === 'Active' ? 'selected' : ''}>🟢 Active</option>
              <option value="Pending Start" ${status === 'Pending Start' ? 'selected' : ''}>🟡 Pending Start</option>
              <option value="On Hold" ${status === 'On Hold' ? 'selected' : ''}>⏸️ On Hold</option>
              <option value="Completed" ${status === 'Completed' ? 'selected' : ''}>🏁 Completed</option>
              <option value="Exclude">❌ Exclude Crew</option>
            </select>
          </div>
        </div>

        <!-- Schedule & Workdays Bar -->
        <div style="background: var(--bg-primary); border-radius: 6px; padding: 8px 10px; margin-bottom: 10px;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
            <span style="font-size: 11px; font-weight: 700; color: var(--text-muted);">Work Schedule:</span>
            <select class="form-control" style="font-size: 11px; padding: 2px 6px; background: var(--bg-tertiary); color: var(--text-primary); border: 1px solid var(--border-color); border-radius: 4px;" onchange="window.crewImportEngine.setCrewSchedule('${crew.jobNumber}', this.value)">
              <option value="Mon-Thu (4 10s)" ${crew.scheduleLabel.includes('Mon-Thu') ? 'selected' : ''}>Mon-Thu (4 10s)</option>
              <option value="Mon-Fri (5 10s)" ${crew.scheduleLabel.includes('5 10') ? 'selected' : ''}>Mon-Fri (5 10s)</option>
              <option value="Mon-Fri (5 8s)" ${crew.scheduleLabel.includes('5 8') ? 'selected' : ''}>Mon-Fri (5 8s)</option>
              <option value="Tue-Fri (4 10s)" ${crew.scheduleLabel.includes('Tue-Fri') ? 'selected' : ''}>Tue-Fri (4 10s)</option>
              <option value="Mon-Sat (6 10s)" ${crew.scheduleLabel.includes('Mon-Sat') || crew.scheduleLabel.includes('6 10') ? 'selected' : ''}>Mon-Sat (6 10s)</option>
              <option value="Fri & Sat (Weekend)" ${crew.scheduleLabel.includes('Fri-Sat') || crew.scheduleLabel.includes('Fri & Sat') ? 'selected' : ''}>Fri & Sat (Weekend)</option>
              <option value="Sat & Sun (Weekend)" ${crew.scheduleLabel.includes('Weekend') || crew.scheduleLabel.includes('Sat & Sun') ? 'selected' : ''}>Sat & Sun (Weekend)</option>
              <option value="Mon-Wed" ${crew.scheduleLabel.includes('Mon-Wed') ? 'selected' : ''}>Mon-Wed</option>
              <option value="Mon Only" ${crew.scheduleLabel.includes('Mon Only') || crew.scheduleLabel === 'Mon Only' ? 'selected' : ''}>Mon Only (Monday Only)</option>
              <option value="Custom" ${crew.scheduleLabel === 'Custom' ? 'selected' : ''}>Custom Days</option>
            </select>
          </div>

          <!-- Day Toggles -->
          <div style="display: flex; align-items: center; gap: 4px; justify-content: space-between;">
            <div style="display: flex; gap: 3px;">
              ${dayPills.map(dp => `
                <button type="button" onclick="window.crewImportEngine.toggleCrewDay('${crew.jobNumber}', '${dp.key}')" style="width: 26px; height: 24px; font-size: 10px; font-weight: 700; border-radius: 4px; border: 1px solid ${dp.isWork ? '#10b981' : '#475569'}; background: ${dp.isWork ? '#10b981' : 'var(--bg-secondary)'}; color: ${dp.isWork ? '#ffffff' : 'var(--text-muted)'}; cursor: pointer; display: flex; align-items: center; justify-content: center;" title="${dp.isWork ? 'Working day' : 'Off day (Skip)'}">
                  ${dp.label}
                </button>
              `).join('')}
            </div>

            <!-- Skip Meeting & Checklist Toggles -->
            <div style="display: flex; gap: 4px;">
              <button type="button" onclick="window.crewImportEngine.toggleCrewSkipFlag('${crew.jobNumber}', 'skipMeeting')" style="padding: 2px 5px; font-size: 9px; font-weight: 700; border-radius: 4px; border: 1px solid ${!days.skipMeeting ? '#3b82f6' : '#475569'}; background: ${!days.skipMeeting ? '#3b82f6' : 'var(--bg-secondary)'}; color: ${!days.skipMeeting ? '#ffffff' : 'var(--text-muted)'}; cursor: pointer;" title="${!days.skipMeeting ? 'Safety Meeting Tracked' : 'Skip Safety Meeting'}">
                Mtg ${!days.skipMeeting ? '✓' : '✗'}
              </button>
              <button type="button" onclick="window.crewImportEngine.toggleCrewSkipFlag('${crew.jobNumber}', 'skipChecklist')" style="padding: 2px 5px; font-size: 9px; font-weight: 700; border-radius: 4px; border: 1px solid ${!days.skipChecklist ? '#8b5cf6' : '#475569'}; background: ${!days.skipChecklist ? '#8b5cf6' : 'var(--bg-secondary)'}; color: ${!days.skipChecklist ? '#ffffff' : 'var(--text-muted)'}; cursor: pointer;" title="${!days.skipChecklist ? 'Monthly Checklist Tracked' : 'Skip Monthly Checklist'}">
                Chk ${!days.skipChecklist ? '✓' : '✗'}
              </button>
            </div>
          </div>
        </div>

        <!-- Crew Note / Schedule Note Banner (Above Employees) -->
        ${crew.crewNote ? `
          <div style="background: rgba(245, 158, 11, 0.15); border-left: 3px solid #f59e0b; padding: 6px 10px; border-radius: 4px; font-size: 11.5px; color: #fbbf24; font-weight: 700; margin-bottom: 10px; display: flex; align-items: center; gap: 6px;">
            <span>📝</span> <span>Crew Note: ${this.escapeHtml(crew.crewNote)}</span>
          </div>
        ` : ''}

        <!-- Foreman / Crew Lead Selector -->
        <div style="margin-bottom: 10px; display: flex; align-items: center; gap: 6px;">
          <span style="font-size: 11px; font-weight: 700; color: var(--text-muted);">Foreman:</span>
          <select class="form-control" style="font-size: 11px; padding: 2px 6px; background: var(--bg-tertiary); color: var(--text-primary); border: 1px solid var(--border-color); border-radius: 4px; flex: 1;" onchange="window.crewImportEngine.setManualForeman('${crew.jobNumber}', this.value)">
            ${crew.employees.map(e => `
              <option value="${e.name}" ${e.name === leadName ? 'selected' : ''}>
                ${e.name} (${e.classification || e.role})
              </option>
            `).join('')}
          </select>
        </div>

        <!-- Status Info Bar (if not Active) -->
        ${status === 'On Hold' ? `
          <div style="background: rgba(100, 116, 139, 0.2); border-left: 3px solid #94a3b8; padding: 4px 8px; border-radius: 4px; font-size: 11px; color: #cbd5e1; margin-bottom: 8px;">
            ⏸️ <strong>On Hold:</strong> ${crew.onHoldDate || 'Today'} ${crew.estimatedReturn ? `(Returns: ${crew.estimatedReturn})` : '(Return: TBD)'}
          </div>
        ` : ''}
        ${status === 'Pending Start' ? `
          <div style="background: rgba(245, 158, 11, 0.15); border-left: 3px solid #f59e0b; padding: 4px 8px; border-radius: 4px; font-size: 11px; color: #fbbf24; margin-bottom: 8px;">
            🟡 <strong>Pending Start:</strong> Starts ${crew.startDate || 'TBD'}
          </div>
        ` : ''}
        ${status === 'Completed' ? `
          <div style="background: rgba(59, 130, 246, 0.15); border-left: 3px solid #3b82f6; padding: 4px 8px; border-radius: 4px; font-size: 11px; color: #93c5fd; margin-bottom: 8px;">
            🏁 <strong>Completed:</strong> Ended ${crew.actualEndDate || 'Today'}
          </div>
        ` : ''}

        <!-- Employee List -->
        <div style="font-size: 12px;">
          ${crew.employees.map(e => `
            <div style="display: flex; justify-content: space-between; align-items: center; padding: 4px 0; border-bottom: 1px dashed rgba(255,255,255,0.05);">
              <div style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">
                <span style="color: var(--text-muted); font-size: 10px; font-family: monospace;">${e.fullJobNumber}</span>
                <span style="color: var(--text-primary); font-weight: ${e.name === leadName ? '700' : '400'};">${this.escapeHtml(e.name)}</span>
                
                ${e.isNewHire ? '<span class="badge" style="background: rgba(16, 185, 129, 0.2); color: #10b981; font-size: 9px; padding: 1px 4px; border-radius: 3px; font-weight: 700;">NEW</span>' : ''}
                
                ${e.otherJobNumber ? `
                  <button type="button" onclick="window.crewImportEngine.toggleEmployeePrimaryJob('${this.escapeHtml(e.name)}', '${e.isPrimary ? e.otherJobNumber : crew.jobNumber}')" 
                    style="border: 1px solid ${e.isPrimary ? '#3b82f6' : '#f59e0b'}; background: ${e.isPrimary ? 'rgba(59, 130, 246, 0.15)' : 'rgba(245, 158, 11, 0.15)'}; color: ${e.isPrimary ? '#60a5fa' : '#f59e0b'}; font-size: 9px; font-weight: 700; padding: 1px 6px; border-radius: 3px; cursor: pointer;" 
                    title="Click to toggle Primary vs Secondary assignment for ${this.escapeHtml(e.name)}">
                    ${e.isPrimary ? '⭐ Primary' : `⚡ Secondary (Primary: ${e.otherJobNumber})`}
                  </button>
                ` : ''}

                ${e.notes ? `<span style="color: #f59e0b; font-size: 10px; font-weight: 600; background: rgba(245, 158, 11, 0.12); padding: 1px 5px; border-radius: 3px; border: 1px solid rgba(245, 158, 11, 0.25);">📝 ${this.escapeHtml(e.notes)}</span>` : ''}
              </div>
              <span class="badge" style="background: var(--bg-tertiary); color: var(--text-muted); font-size: 10px; padding: 1px 5px; border-radius: 3px; font-weight: 700;">
                ${e.classification || e.role || '—'}
              </span>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }

  // ==========================================================================
  // 6. EVENT HANDLERS & STEP NAVIGATION
  // ==========================================================================

  async handleFileSelected(event) {
    const file = event.target.files[0];
    if (!file) return;

    try {
      const sheetNames = await this.readWorkbook(file);
      if (sheetNames.length > 0) {
        this.parseSheet(sheetNames[0]);
        this.goToStep(2);
      }
    } catch (e) {
      alert(`Failed to parse Excel file: ${e.message}`);
      console.error(e);
    }
  }

  switchSheetTab(sheetName) {
    this.parseSheet(sheetName);
    this.render();
  }

  setManualForeman(jobNumber, leadName) {
    this.manualLeadOverrides[jobNumber] = leadName;
    this.saveLeadSelection(jobNumber, leadName);
    const crew = this.parsedCrews.find(c => c.jobNumber === jobNumber);
    if (crew) {
      crew.lead = crew.employees.find(e => e.name === leadName) || crew.lead;
    }
    this.render();
  }

  setCrewSchedule(jobNumber, presetLabel) {
    const crew = this.parsedCrews.find(c => c.jobNumber === jobNumber);
    if (!crew) return;

    if (presetLabel === 'Custom') {
      crew.scheduleLabel = 'Custom';
    } else {
      crew.scheduleLabel = presetLabel;
      crew.scheduleDays = this.getScheduleFlags(presetLabel);
    }
    this.render();
  }

  toggleCrewDay(jobNumber, dayKey) {
    const crew = this.parsedCrews.find(c => c.jobNumber === jobNumber);
    if (!crew) return;

    if (!crew.scheduleDays) {
      crew.scheduleDays = this.getScheduleFlags(crew.scheduleLabel);
    }

    // Toggle the skip boolean (true -> false, false -> true)
    crew.scheduleDays[dayKey] = !crew.scheduleDays[dayKey];
    crew.scheduleLabel = 'Custom';
    this.render();
  }

  toggleCrewSkipFlag(jobNumber, flagKey) {
    const crew = this.parsedCrews.find(c => c.jobNumber === jobNumber);
    if (!crew) return;

    if (!crew.scheduleDays) {
      crew.scheduleDays = this.getScheduleFlags(crew.scheduleLabel);
    }

    crew.scheduleDays[flagKey] = !crew.scheduleDays[flagKey];
    this.render();
  }

  handleStatusChange(jobNumber, newStatus) {
    if (newStatus === 'Exclude') {
      this.excludeCrew(jobNumber);
      return;
    }
    if (newStatus === 'On Hold') {
      this.showSetOnHoldModal(jobNumber);
      return;
    }
    if (newStatus === 'Pending Start') {
      this.showSetPendingStartModal(jobNumber);
      return;
    }
    if (newStatus === 'Completed') {
      this.showSetCompletedModal(jobNumber);
      return;
    }

    // Active
    const crew = this.parsedCrews.find(c => c.jobNumber === jobNumber);
    if (crew) {
      crew.status = 'Active';
      crew.onHoldDate = '';
      crew.estimatedReturn = '';
      crew.actualEndDate = '';
      this.render();
    }
  }

  excludeCrew(jobNumber) {
    const crew = this.parsedCrews.find(c => c.jobNumber === jobNumber);
    if (crew) {
      crew.excluded = true;
      this.render();
    }
  }

  showSetOnHoldModal(jobNumber) {
    const crew = this.parsedCrews.find(c => c.jobNumber === jobNumber);
    if (!crew) return;

    const today = new Date().toISOString().split('T')[0];
    const existingReturn = crew.estimatedReturn || '';

    const modalHtml = `
      <div id="crew-lifecycle-modal" style="position: fixed; inset: 0; background: rgba(0,0,0,0.7); z-index: 10000; display: flex; align-items: center; justify-content: center;">
        <div style="background: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: 12px; padding: 24px; max-width: 440px; width: 90%; box-shadow: 0 8px 32px rgba(0,0,0,0.5);">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
            <h3 style="font-size: 16px; font-weight: 800; color: var(--text-primary); margin: 0; display: flex; align-items: center; gap: 8px;">
              <span>⏸️</span> Put Crew On Hold
            </h3>
            <button onclick="document.getElementById('crew-lifecycle-modal').remove()" style="background: none; border: none; color: var(--text-muted); font-size: 18px; cursor: pointer;">✕</button>
          </div>

          <p style="font-size: 13px; color: var(--text-secondary); margin-bottom: 16px;">
            Set <strong>${crew.location} (${crew.jobNumber})</strong> to On Hold. Employees on this crew will be skipped from compliance until reactivated.
          </p>

          <div style="margin-bottom: 14px;">
            <label style="font-size: 12px; font-weight: 700; color: var(--text-muted); display: block; margin-bottom: 6px;">Put On Hold Date:</label>
            <input type="date" id="modal-on-hold-date" class="form-control" value="${crew.onHoldDate || today}" style="width: 100%; padding: 8px; background: var(--bg-primary); color: var(--text-primary); border: 1px solid var(--border-color); border-radius: 6px;">
          </div>

          <div style="margin-bottom: 20px;">
            <label style="font-size: 12px; font-weight: 700; color: var(--text-muted); display: block; margin-bottom: 6px;">Estimated Return Date (Optional):</label>
            <input type="date" id="modal-estimated-return" class="form-control" value="${existingReturn}" style="width: 100%; padding: 8px; background: var(--bg-primary); color: var(--text-primary); border: 1px solid var(--border-color); border-radius: 6px;">
            <div style="margin-top: 6px; display: flex; align-items: center; gap: 6px;">
              <input type="checkbox" id="modal-return-tbd" ${!existingReturn ? 'checked' : ''} onchange="document.getElementById('modal-estimated-return').disabled = this.checked; if(this.checked) document.getElementById('modal-estimated-return').value = '';">
              <label for="modal-return-tbd" style="font-size: 12px; color: var(--text-secondary); cursor: pointer;">Return date is TBD</label>
            </div>
          </div>

          <div style="display: flex; justify-content: flex-end; gap: 10px;">
            <button class="btn btn-secondary" onclick="document.getElementById('crew-lifecycle-modal').remove()">Cancel</button>
            <button class="btn btn-primary" style="background: #64748b; border-color: #64748b;" onclick="window.crewImportEngine.saveOnHoldModal('${crew.jobNumber}')">Set On Hold</button>
          </div>
        </div>
      </div>
    `;

    const oldModal = document.getElementById('crew-lifecycle-modal');
    if (oldModal) oldModal.remove();
    document.body.insertAdjacentHTML('beforeend', modalHtml);
  }

  saveOnHoldModal(jobNumber) {
    const crew = this.parsedCrews.find(c => c.jobNumber === jobNumber);
    if (!crew) return;

    const holdDate = document.getElementById('modal-on-hold-date').value;
    const isTbd = document.getElementById('modal-return-tbd').checked;
    const estReturn = isTbd ? '' : document.getElementById('modal-estimated-return').value;

    crew.status = 'On Hold';
    crew.onHoldDate = holdDate;
    crew.estimatedReturn = estReturn;

    const modal = document.getElementById('crew-lifecycle-modal');
    if (modal) modal.remove();
    this.render();
  }

  showSetPendingStartModal(jobNumber) {
    const crew = this.parsedCrews.find(c => c.jobNumber === jobNumber);
    if (!crew) return;

    const today = new Date().toISOString().split('T')[0];

    const modalHtml = `
      <div id="crew-lifecycle-modal" style="position: fixed; inset: 0; background: rgba(0,0,0,0.7); z-index: 10000; display: flex; align-items: center; justify-content: center;">
        <div style="background: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: 12px; padding: 24px; max-width: 440px; width: 90%; box-shadow: 0 8px 32px rgba(0,0,0,0.5);">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
            <h3 style="font-size: 16px; font-weight: 800; color: var(--text-primary); margin: 0; display: flex; align-items: center; gap: 8px;">
              <span>🟡</span> Set as Pending Start
            </h3>
            <button onclick="document.getElementById('crew-lifecycle-modal').remove()" style="background: none; border: none; color: var(--text-muted); font-size: 18px; cursor: pointer;">✕</button>
          </div>

          <p style="font-size: 13px; color: var(--text-secondary); margin-bottom: 16px;">
            Set <strong>${crew.location} (${crew.jobNumber})</strong> as Pending Start. The crew will be scheduled for activation on the start date.
          </p>

          <div style="margin-bottom: 20px;">
            <label style="font-size: 12px; font-weight: 700; color: var(--text-muted); display: block; margin-bottom: 6px;">Estimated Start Date:</label>
            <input type="date" id="modal-start-date" class="form-control" value="${crew.startDate || today}" style="width: 100%; padding: 8px; background: var(--bg-primary); color: var(--text-primary); border: 1px solid var(--border-color); border-radius: 6px;">
            <div style="margin-top: 6px; display: flex; align-items: center; gap: 6px;">
              <input type="checkbox" id="modal-start-tbd" onchange="document.getElementById('modal-start-date').disabled = this.checked; if(this.checked) document.getElementById('modal-start-date').value = '';">
              <label for="modal-start-tbd" style="font-size: 12px; color: var(--text-secondary); cursor: pointer;">Start date is TBD</label>
            </div>
          </div>

          <div style="display: flex; justify-content: flex-end; gap: 10px;">
            <button class="btn btn-secondary" onclick="document.getElementById('crew-lifecycle-modal').remove()">Cancel</button>
            <button class="btn btn-primary" style="background: #f59e0b; border-color: #f59e0b;" onclick="window.crewImportEngine.savePendingStartModal('${crew.jobNumber}')">Set Pending Start</button>
          </div>
        </div>
      </div>
    `;

    const oldModal = document.getElementById('crew-lifecycle-modal');
    if (oldModal) oldModal.remove();
    document.body.insertAdjacentHTML('beforeend', modalHtml);
  }

  savePendingStartModal(jobNumber) {
    const crew = this.parsedCrews.find(c => c.jobNumber === jobNumber);
    if (!crew) return;

    const isTbd = document.getElementById('modal-start-tbd').checked;
    const startDate = isTbd ? '' : document.getElementById('modal-start-date').value;

    crew.status = 'Pending Start';
    crew.startDate = startDate;

    const modal = document.getElementById('crew-lifecycle-modal');
    if (modal) modal.remove();
    this.render();
  }

  showSetCompletedModal(jobNumber) {
    const crew = this.parsedCrews.find(c => c.jobNumber === jobNumber);
    if (!crew) return;

    const today = new Date().toISOString().split('T')[0];

    const modalHtml = `
      <div id="crew-lifecycle-modal" style="position: fixed; inset: 0; background: rgba(0,0,0,0.7); z-index: 10000; display: flex; align-items: center; justify-content: center;">
        <div style="background: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: 12px; padding: 24px; max-width: 440px; width: 90%; box-shadow: 0 8px 32px rgba(0,0,0,0.5);">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
            <h3 style="font-size: 16px; font-weight: 800; color: var(--text-primary); margin: 0; display: flex; align-items: center; gap: 8px;">
              <span>🏁</span> Mark Crew as Completed
            </h3>
            <button onclick="document.getElementById('crew-lifecycle-modal').remove()" style="background: none; border: none; color: var(--text-muted); font-size: 18px; cursor: pointer;">✕</button>
          </div>

          <p style="font-size: 13px; color: var(--text-secondary); margin-bottom: 16px;">
            Mark <strong>${crew.location} (${crew.jobNumber})</strong> as Completed. This will archive the crew from active training and compliance tracking.
          </p>

          <div style="margin-bottom: 20px;">
            <label style="font-size: 12px; font-weight: 700; color: var(--text-muted); display: block; margin-bottom: 6px;">Actual End Date:</label>
            <input type="date" id="modal-end-date" class="form-control" value="${crew.actualEndDate || today}" style="width: 100%; padding: 8px; background: var(--bg-primary); color: var(--text-primary); border: 1px solid var(--border-color); border-radius: 6px;">
          </div>

          <div style="display: flex; justify-content: flex-end; gap: 10px;">
            <button class="btn btn-secondary" onclick="document.getElementById('crew-lifecycle-modal').remove()">Cancel</button>
            <button class="btn btn-primary" style="background: #3b82f6; border-color: #3b82f6;" onclick="window.crewImportEngine.saveCompletedModal('${crew.jobNumber}')">Mark Completed</button>
          </div>
        </div>
      </div>
    `;

    const oldModal = document.getElementById('crew-lifecycle-modal');
    if (oldModal) oldModal.remove();
    document.body.insertAdjacentHTML('beforeend', modalHtml);
  }

  saveCompletedModal(jobNumber) {
    const crew = this.parsedCrews.find(c => c.jobNumber === jobNumber);
    if (!crew) return;

    const endDate = document.getElementById('modal-end-date').value;

    crew.status = 'Completed';
    crew.actualEndDate = endDate;

    const modal = document.getElementById('crew-lifecycle-modal');
    if (modal) modal.remove();
    this.render();
  }

  goToStep(stepNum) {
    this.activeStep = stepNum;
    if (stepNum >= 2) {
      this.computeChangeDeltas();
    }
    this.render();
  }

  resetImport() {
    this.workbook = null;
    this.selectedSheet = null;
    this.parsedCrews = [];
    this.computedDeltas = null;
    this.activeStep = 1;
    this.render();
  }

  async executeApply() {
    if (!confirm('Are you sure you want to apply all detected changes to Employees and Job Tracking?')) {
      return;
    }

    try {
      const res = await this.applyCrewChanges();
      alert(`✅ ${res.message}`);
      if (window.sheetNavigator) {
        window.sheetNavigator.renderCurrentSheet();
      }
      this.resetImport();
    } catch (e) {
      alert(`❌ Error applying changes: ${e.message}`);
      console.error(e);
    }
  }

  escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  render() {
    const container = document.getElementById('crew-import-step-content');
    if (container) {
      container.innerHTML = this.renderStepContent();
    }
    const fullContainer = document.getElementById('crew-import-view');
    if (fullContainer) {
      fullContainer.innerHTML = this.renderWorkspaceHtml();
    }
  }
}

if (typeof window !== 'undefined') {
  window.CrewImportEngine = CrewImportEngine;
  window.crewImportEngine = new CrewImportEngine(window.localDB);
}
