/**
 * certs-import.js - Excel / CSV Expiring Certifications Matrix Importer
 * 
 * Provides interactive file parsing via SheetJS, comprehensive column auto-mapping
 * across all 17+ certification types, multi-row diff comparison against the 9-column
 * expiring_certs table, and local database updating with sync queue mutations.
 */

class CertsImportEngine {
  constructor(db) {
    this.db = db;
    this.parsedRows = [];
    this.mappedData = [];
    this.fileName = '';
    this.preserveNewerDates = true;
    this.ignoreHiddenRows = true; // Automatically skip hidden cells/rows from Excel by default
    this.hiddenRowCount = 0;
    this.hiddenColCount = 0;
    this.currentWorkbook = null;
    this.currentSheetName = '';
    this.overriddenPreservedKeys = new Set();

    // Get supported certification types dynamically from CertsConfigEngine
    this.refreshCertDefinitions();
  }

  refreshCertDefinitions() {
    if (window.certsConfigEngine && typeof window.certsConfigEngine.getCertDefinitions === 'function') {
      this.certDefinitions = window.certsConfigEngine.getCertDefinitions();
    } else {
      this.certDefinitions = {
        '1st Aid': { key: '1st Aid', label: '1st Aid / First Aid', nonExpiring: false },
        'CPR': { key: 'CPR', label: 'CPR / AED', nonExpiring: false },
        'DL': { key: 'DL', label: "Driver's License (DL)", nonExpiring: false },
        'MEC Expiration': { key: 'MEC Expiration', label: 'MEC Expiration (Medical Card)', nonExpiring: false },
        'Crane Cert': { key: 'Crane Cert', label: 'Crane Certification', nonExpiring: false },
        'Crane Evaluation': { key: 'Crane Evaluation', label: 'Crane Evaluation', nonExpiring: true, isIssuedDate: true },
        'OSHA 1910': { key: 'OSHA 1910', label: 'OSHA 1910 / 10 / 30', nonExpiring: true, isIssuedDate: true },
        'BNSF': { key: 'BNSF', label: 'BNSF Rail Safety', nonExpiring: true, isIssuedDate: true },
        'MSHA': { key: 'MSHA', label: 'MSHA Mine Safety', nonExpiring: true, isIssuedDate: true },
        'OSHA Trench Comp Person': { key: 'OSHA Trench Comp Person', label: 'OSHA Trench Competent Person', nonExpiring: true, isIssuedDate: true },
        'Forklift': { key: 'Forklift', label: 'Forklift Certification', nonExpiring: false },
        'Forklift Operator Safety Training': { key: 'Forklift Operator Safety Training', label: 'Forklift Safety Training', nonExpiring: true, isIssuedDate: true },
        'Rigging & Signaling/Signalperson & Spotter Cert': { key: 'Rigging & Signaling/Signalperson & Spotter Cert', label: 'Rigging & Signaling', nonExpiring: false },
        'Harassment Training': { key: 'Harassment Training', label: 'Harassment Prevention', nonExpiring: false },
        'EICA Basic Helicopter Line Construction Safety': { key: 'EICA Basic Helicopter Line Construction Safety', label: 'EICA Basic Helicopter Safety', nonExpiring: true, isIssuedDate: true },
        'Pole Top Rescue': { key: 'Pole Top Rescue', label: 'Pole Top Rescue', nonExpiring: false },
        'Dig Safe': { key: 'Dig Safe', label: 'Dig Safe / 811', nonExpiring: false }
      };
    }
  }

  /**
   * Normalizes any cert string for comparison (handling aliases like "First Aid" vs "1st Aid" and dynamic custom certs).
   */
  normalizeCertKey(cType) {
    if (!cType) return '';
    const clean = String(cType).toLowerCase().trim();
    if (clean.includes('1st aid') || clean.includes('first aid') || clean === 'fa') return '1st aid';
    if (clean.includes('medical') || clean.includes('med card') || clean.includes('mec') || clean.includes('dot')) return 'mec expiration';
    if (clean.includes('rigging') || clean.includes('rigger') || clean.includes('signalperson') || clean.includes('spotter')) return 'rigging & signaling/signalperson & spotter cert';
    if (clean.includes('helo') || clean.includes('helicopter') || clean.includes('eica')) return 'eica basic helicopter line construction safety';
    if (clean.includes('crane eval') || clean.includes('crane evaluation')) return 'crane evaluation';
    if (clean.includes('crane')) return 'crane cert';
    if (clean.includes('forklift') && (clean.includes('safety') || clean.includes('operator') || clean.includes('training') || clean.includes('eval'))) return 'forklift operator safety training';
    if (clean.includes('forklift') || clean === 'pit') return 'forklift';
    if (clean.includes('trench') || clean.includes('excavation')) return 'osha trench comp person';
    if (clean.includes('osha 1910') || clean.includes('osha 10') || clean.includes('osha 30') || clean.includes('osha') || clean.includes('et&d')) return 'osha 1910';
    if (clean.includes('bnsf')) return 'bnsf';
    if (clean.includes('msha')) return 'msha';
    if (clean.includes('pole top') || clean.includes('poletop') || clean.includes('bucket rescue')) return 'pole top rescue';
    if (clean.includes('harassment')) return 'harassment training';
    if (clean.includes('dig safe') || clean.includes('digsafe') || clean.includes('811')) return 'dig safe';
    if (clean === 'dl' || clean.includes('driver') || clean === 'cdl') return 'dl';
    if (clean === 'cpr' || clean.includes('cpr')) return 'cpr';

    // Match dynamic custom certs
    if (this.certDefinitions) {
      for (let k of Object.keys(this.certDefinitions)) {
        if (clean === k.toLowerCase() || clean.includes(k.toLowerCase())) {
          return k.toLowerCase();
        }
      }
    }

    return clean;
  }

  /**
   * Opens the Certifications Import modal.
   */
  openImportModal() {
    this.parsedRows = [];
    this.mappedData = [];
    this.preservedRecords = [];
    this.unmatchedEmployees = [];
    this.overriddenPreservedKeys = new Set();
    this.activeDiscrepancyTab = 'all';
    this.fileName = '';

    const modal = document.getElementById('certs-import-modal');
    if (!modal) return;

    modal.style.display = 'flex';
    this.renderUploadView();
  }

  /**
   * Closes the modal.
   */
  closeImportModal() {
    const modal = document.getElementById('certs-import-modal');
    if (modal) modal.style.display = 'none';
  }

  /**
   * Renders the initial drag-and-drop file upload screen.
   */
  renderUploadView() {
    const body = document.getElementById('certs-import-modal-body');
    const footer = document.getElementById('certs-import-modal-footer');
    if (!body) return;

    body.innerHTML = `
      <div style="display: flex; flex-direction: column; gap: 16px;">
        <!-- Banner -->
        <div style="background: linear-gradient(135deg, rgba(59, 130, 246, 0.12) 0%, rgba(37, 99, 235, 0.05) 100%); border: 1px solid rgba(59, 130, 246, 0.3); border-radius: 8px; padding: 14px 18px;">
          <div style="font-size: 14px; font-weight: 700; color: #93c5fd; margin-bottom: 3px; display: flex; align-items: center; gap: 8px;">
            <span>📥</span> Import Employee Certifications Matrix
          </div>
          <div style="font-size: 12px; color: var(--text-secondary); line-height: 1.5;">
            Upload your company certification spreadsheet (Excel <code>.xlsx</code>, <code>.xls</code> or <code>.csv</code>) to update First Aid, CPR, OSHA, Driver's License, Medical Card, Crane, Forklift, Rigging, and other safety records.
          </div>
        </div>

        <!-- Drag & Drop Upload Box -->
        <div id="certs-drop-zone" style="border: 2px dashed #3b82f6; border-radius: 10px; background: rgba(15, 23, 42, 0.6); padding: 36px 20px; text-align: center; cursor: pointer; transition: all 0.2s ease;">
          <input type="file" id="certs-file-input" accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv,*/*" style="display: none;" onchange="window.certsImportEngine.handleFileSelected(this.files[0])" />
          <div style="font-size: 38px; margin-bottom: 8px;">📁</div>
          <div style="font-size: 14px; font-weight: 700; color: #f8fafc; margin-bottom: 4px;">Click to Browse or Drag & Drop File Here</div>
          <div style="font-size: 11.5px; color: var(--text-muted);">Supports .xlsx, .xls, and .csv formats</div>
        </div>

        <!-- Import Options -->
        <div style="background: var(--bg-primary); border: 1px solid var(--border-color); border-radius: 8px; padding: 12px 16px;">
          <label style="display: flex; align-items: center; gap: 10px; font-size: 12.5px; color: #f8fafc; cursor: pointer;">
            <input type="checkbox" id="certs-preserve-newer" ${this.preserveNewerDates ? 'checked' : ''} style="accent-color: #3b82f6;" onchange="window.certsImportEngine.preserveNewerDates = this.checked">
            <div>
              <div style="font-weight: 700;">🔒 Preserve newer expiration dates</div>
              <div style="font-size: 11px; color: var(--text-muted);">If existing records already have a newer expiration date than the Excel file, keep the newer date.</div>
            </div>
          </label>
        </div>
      </div>
    `;

    // Setup drag-and-drop events
    const dropZone = document.getElementById('certs-drop-zone');
    if (dropZone) {
      dropZone.onclick = () => document.getElementById('certs-file-input').click();
      dropZone.ondragover = (e) => { e.preventDefault(); dropZone.style.borderColor = '#60a5fa'; dropZone.style.background = 'rgba(59, 130, 246, 0.15)'; };
      dropZone.ondragleave = () => { dropZone.style.borderColor = '#3b82f6'; dropZone.style.background = 'rgba(15, 23, 42, 0.6)'; };
      dropZone.ondrop = (e) => {
        e.preventDefault();
        dropZone.style.borderColor = '#3b82f6';
        dropZone.style.background = 'rgba(15, 23, 42, 0.6)';
        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
          this.handleFileSelected(e.dataTransfer.files[0]);
        }
      };
    }

    if (footer) {
      footer.innerHTML = `
        <button class="btn btn-secondary" onclick="window.certsImportEngine.closeImportModal()">Cancel</button>
      `;
    }
  }

  /**
   * Handles user file selection and parses workbook with SheetJS.
   */
  handleFileSelected(file) {
    if (!file) return;
    this.fileName = file.name;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target.result);
        // Enable cellStyles to get hidden row/column metadata (!rows, !cols)
        const workbook = XLSX.read(data, { type: 'array', cellDates: true, cellStyles: true });
        this.currentWorkbook = workbook;
        
        // Scan all sheets and select the one with the highest number of matched cert headers
        let bestSheetName = workbook.SheetNames[0];
        let maxCertScore = -1;

        for (const sName of workbook.SheetNames) {
          const ws = workbook.Sheets[sName];
          if (!ws || !ws['!ref']) continue;
          const sampleGrid = this.extractGridFromWorksheet(ws, 15, false);
          let sheetScore = 0;
          sampleGrid.forEach(row => {
            row.forEach(cell => {
              const str = String(cell || '').toLowerCase().trim();
              if (this.matchCertHeader(str)) sheetScore++;
            });
          });
          if (sheetScore > maxCertScore) {
            maxCertScore = sheetScore;
            bestSheetName = sName;
          }
        }

        this.currentSheetName = bestSheetName;
        this.reprocessCurrentSheet();
      } catch (err) {
        console.error('Failed to parse Excel file:', err);
        alert('❌ Error reading file: ' + err.message);
      }
    };
    reader.readAsArrayBuffer(file);
  }

  /**
   * Re-extracts grid from current worksheet and re-runs discrepancy comparison.
   */
  reprocessCurrentSheet() {
    if (!this.currentWorkbook || !this.currentSheetName) return;
    const worksheet = this.currentWorkbook.Sheets[this.currentSheetName];
    const grid = this.extractGridFromWorksheet(worksheet, Infinity, this.ignoreHiddenRows);
    this.processRawSheetData(grid);
  }

  /**
   * Toggles whether hidden rows/cells from Excel are ignored or processed.
   */
  toggleIgnoreHiddenRows(ignore) {
    this.ignoreHiddenRows = !!ignore;
    this.reprocessCurrentSheet();
  }

  /**
   * Toggles whether an individual preserved record should use the Excel date instead of app date.
   */
  togglePreservedOverride(empName, certType, useExcelDate) {
    const key = `${String(empName || '').toLowerCase().trim()}_${this.normalizeCertKey(certType)}`;
    if (useExcelDate) {
      this.overriddenPreservedKeys.add(key);
    } else {
      this.overriddenPreservedKeys.delete(key);
    }
    this.renderPreviewScreen();
  }

  /**
   * Batch toggle: override ALL preserved records to use Excel date or keep all App dates.
   */
  setAllPreservedOverrides(useExcelDate) {
    if (!this.preservedRecords) return;
    if (useExcelDate) {
      this.preservedRecords.forEach(p => {
        const key = `${String(p.employeeName || '').toLowerCase().trim()}_${this.normalizeCertKey(p.certType)}`;
        this.overriddenPreservedKeys.add(key);
      });
    } else {
      this.overriddenPreservedKeys.clear();
    }
    this.renderPreviewScreen();
  }

  /**
   * Checks if a row is hidden in Excel via !rows metadata (hidden property, or zero height).
   */
  isRowHidden(sheet, rowIndex) {
    if (!sheet || !sheet['!rows']) return false;
    const rowInfo = sheet['!rows'][rowIndex];
    return !!(rowInfo && (rowInfo.hidden === true || rowInfo.hidden === 1 || rowInfo.hpt === 0 || rowInfo.hpx === 0));
  }

  /**
   * Checks if a column is hidden in Excel via !cols metadata (hidden property, or zero width).
   */
  isColHidden(sheet, colIndex) {
    if (!sheet || !sheet['!cols']) return false;
    const colInfo = sheet['!cols'][colIndex];
    return !!(colInfo && (colInfo.hidden === true || colInfo.hidden === 1 || colInfo.wpx === 0 || colInfo.width === 0));
  }

  /**
   * Robust cell extraction handling SheetJS text, date objects, Excel serial numbers,
   * and skipping hidden rows/columns when skipHidden is enabled.
   */
  extractGridFromWorksheet(worksheet, maxRows = Infinity, skipHidden = true) {
    if (!worksheet || !worksheet['!ref']) return [];
    const range = XLSX.utils.decode_range(worksheet['!ref']);
    const grid = [];
    const endRow = Math.min(range.e.r, range.s.r + maxRows - 1);
    
    if (maxRows === Infinity) {
      this.hiddenRowCount = 0;
      this.hiddenColCount = 0;
    }

    // Build visible column index list
    const visibleCols = [];
    for (let c = range.s.c; c <= range.e.c; c++) {
      if (skipHidden && this.isColHidden(worksheet, c)) {
        if (maxRows === Infinity) this.hiddenColCount++;
        continue;
      }
      visibleCols.push(c);
    }

    for (let r = range.s.r; r <= endRow; r++) {
      if (skipHidden && this.isRowHidden(worksheet, r)) {
        if (maxRows === Infinity) this.hiddenRowCount++;
        continue;
      }

      const row = [];
      let hasData = false;

      for (let i = 0; i < visibleCols.length; i++) {
        const c = visibleCols[i];
        const cellAddr = XLSX.utils.encode_cell({ r: r, c: c });
        const cell = worksheet[cellAddr];
        let val = '';

        if (cell) {
          if (cell.w) {
            val = String(cell.w).trim();
          } else if (cell.v instanceof Date) {
            val = this.formatDateObj(cell.v);
          } else if (typeof cell.v === 'number' && cell.v > 25000 && cell.v < 60000) {
            // Excel date serial number (year 1968 to 2064)
            if (XLSX.SSF && XLSX.SSF.parse_date_code) {
              const dateObj = XLSX.SSF.parse_date_code(cell.v);
              if (dateObj) {
                const mm = String(dateObj.m).padStart(2, '0');
                const dd = String(dateObj.d).padStart(2, '0');
                val = `${mm}/${dd}/${dateObj.y}`;
              }
            } else {
              const d = new Date((cell.v - 25569) * 86400 * 1000);
              val = this.formatDateObj(d);
            }
          } else if (cell.v !== undefined && cell.v !== null) {
            val = String(cell.v).trim();
          }
        }

        if (val) hasData = true;
        row.push(val);
      }

      if (hasData) {
        grid.push(row);
      }
    }
    return grid;
  }

  /**
   * Matches header string to canonical Cert Definition key.
   */
  matchCertHeader(hClean) {
    if (!hClean) return null;
    const clean = hClean.toLowerCase().replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim();

    // Skip employee name, job, location columns
    if (['name', 'employee', 'first name', 'last name', 'worker', 'lineman', 'location', 'job', 'job #', 'job#', 'crew', 'city', 'hire date', 'status', 'title', 'trade', 'class'].includes(clean)) return null;

    if (clean.includes('1st aid') || clean.includes('first aid') || clean === 'fa') return '1st Aid';
    if (clean === 'cpr' || clean.includes('cpr/aed') || clean.includes('cpr') || clean.includes('cardiopulmonary')) return 'CPR';
    if (clean === 'dl' || clean.includes("driver's license") || clean.includes('drivers license') || clean === 'driver' || clean === 'cdl') return 'DL';
    if (clean === 'med' || clean.includes('med ') || clean.includes('medical') || clean.includes('med card') || clean.includes('mec') || clean.includes('dot')) return 'MEC Expiration';
    if (clean.includes('crane eval') || clean.includes('crane assessment') || clean.includes('crane evaluation')) return 'Crane Evaluation';
    if ((clean.includes('crane') && (clean.includes('cert') || clean.includes('ncco') || clean.includes('license'))) || clean === 'crane') return 'Crane Cert';
    if (clean.includes('trench') || clean.includes('excavation') || clean.includes('comp person')) return 'OSHA Trench Comp Person';
    if (clean.includes('osha 1910') || clean.includes('osha 10') || clean.includes('osha 30') || clean.includes('osha') || clean.includes('et&d')) return 'OSHA 1910';
    if (clean.includes('bnsf')) return 'BNSF';
    if (clean.includes('msha')) return 'MSHA';
    if (clean.includes('forklift') && (clean.includes('safety') || clean.includes('training') || clean.includes('operator') || clean.includes('eval'))) return 'Forklift Operator Safety Training';
    if (clean.includes('forklift') || clean === 'pit') return 'Forklift';
    if (clean.includes('rigging') || clean.includes('rigger') || clean.includes('signalperson') || clean.includes('spotter')) return 'Rigging & Signaling/Signalperson & Spotter Cert';
    if (clean.includes('harassment')) return 'Harassment Training';
    if (clean.includes('helo') || clean.includes('helicopter') || clean.includes('eica')) return 'EICA Basic Helicopter Line Construction Safety';
    if (clean.includes('pole top') || clean.includes('poletop') || clean.includes('bucket rescue')) return 'Pole Top Rescue';
    if (clean.includes('dig safe') || clean.includes('digsafe') || clean.includes('811')) return 'Dig Safe';

    return null;
  }

  /**
   * Normalizes spreadsheet rows, locates header row and maps cert columns to 9-column expiring_certs table.
   */
  processRawSheetData(grid) {
    if (!grid || grid.length < 1) {
      alert('⚠️ The selected file contains no data rows.');
      return;
    }

    // 1. Find header row (search first 15 rows for matching cert columns)
    let headerIdx = -1;
    let colToCertMap = {};
    let nameCol = -1;
    let jobCol = -1;
    let locCol = -1;

    for (let r = 0; r < Math.min(15, grid.length); r++) {
      const row = grid[r];
      let certMatches = 0;
      const testMap = {};
      let testNameCol = -1;
      let testJobCol = -1;
      let testLocCol = -1;

      row.forEach((cell, cIdx) => {
        const cClean = String(cell || '').toLowerCase().trim();
        if (!cClean) return;

        if (cClean === 'name' || cClean === 'employee' || cClean === 'employee name' || cClean === 'full name' || cClean === 'last name, first name') {
          testNameCol = cIdx;
        } else if (cClean.includes('job') || cClean === 'crew' || cClean === 'job #') {
          testJobCol = cIdx;
        } else if (cClean.includes('location') || cClean === 'city') {
          testLocCol = cIdx;
        } else {
          const certKey = this.matchCertHeader(cClean);
          if (certKey && this.certDefinitions[certKey]) {
            testMap[cIdx] = this.certDefinitions[certKey];
            certMatches++;
          }
        }
      });

      if (certMatches >= 2) {
        headerIdx = r;
        colToCertMap = testMap;
        nameCol = testNameCol !== -1 ? testNameCol : 0;
        jobCol = testJobCol;
        locCol = testLocCol;
        break;
      }
    }

    let dataRows = [];

    if (headerIdx >= 0) {
      dataRows = grid.slice(headerIdx + 1);
    } else {
      // Standard default company positional mapping:
      // A(0)=Name, B(1)=Job#, C(2)=Location, D(3)=DL, E(4)=MEC Expiration, F(5)=1st Aid, G(6)=CPR, H(7)=Crane Cert, I(8)=Crane Eval...
      nameCol = 0;
      jobCol = 1;
      locCol = 2;
      const positionalList = [
        { col: 3, key: 'DL' },
        { col: 4, key: 'MEC Expiration' },
        { col: 5, key: '1st Aid' },
        { col: 6, key: 'CPR' },
        { col: 7, key: 'Crane Cert' },
        { col: 8, key: 'Crane Evaluation' },
        { col: 9, key: 'OSHA 1910' },
        { col: 10, key: 'BNSF' },
        { col: 11, key: 'MSHA' },
        { col: 12, key: 'OSHA Trench Comp Person' },
        { col: 13, key: 'Forklift' },
        { col: 14, key: 'Forklift Operator Safety Training' },
        { col: 15, key: 'Rigging & Signaling/Signalperson & Spotter Cert' },
        { col: 16, key: 'Harassment Training' },
        { col: 17, key: 'EICA Basic Helicopter Line Construction Safety' },
        { col: 18, key: 'Pole Top Rescue' }
      ];

      positionalList.forEach(p => {
        if (this.certDefinitions[p.key]) {
          colToCertMap[p.col] = this.certDefinitions[p.key];
        }
      });

      dataRows = grid;
    }

    // 2. Load existing Employees and existing Expiring Certs table
    if (!this.db) this.db = window.localDB || window.safetyDB;

    const employeesTable = this.db ? this.db.getTable('employees') : null;
    const empList = employeesTable && employeesTable.rows ? employeesTable.rows : [];
    
    // Build lookup of ONLY current active employees (filtering out previous employees and inactive records)
    const activeEmpLookup = {};
    const activeEmpList = [];

    empList.forEach(e => {
      const name = String(e['Name'] || e['Employee Name'] || '').trim();
      if (!name) return;

      const loc = String(e['Location'] || '').toLowerCase().trim();
      const status = String(e['Status'] || '').toLowerCase().trim();
      const job = String(e['Job Number'] || e['Job #'] || '').toLowerCase().trim();

      // Filter out Previous Employee records
      if (loc === 'previous employee' || loc.includes('previous') ||
          status === 'previous employee' || status.includes('inactive') || status.includes('terminated') ||
          job.includes('previous')) {
        return;
      }

      const norm = name.toLowerCase().replace(/\s+/g, ' ').trim();
      activeEmpLookup[norm] = e;
      activeEmpList.push({ name: name, norm: norm, obj: e });
    });

    const certsTable = this.db ? this.db.getTable('expiring_certs') : null;
    const existingCertRows = certsTable && certsTable.rows ? certsTable.rows : [];
    
    // Map: "empNameLower_certTypeNormalized" -> rowObj
    const existingCertMap = {};
    existingCertRows.forEach((r, rIdx) => {
      const eName = String(r['Employee Name'] || r['Name'] || '').toLowerCase().trim();
      const cType = this.normalizeCertKey(r['Item Type'] || r['Cert Type'] || r['Type'] || '');
      if (eName && cType) {
        existingCertMap[`${eName}_${cType}`] = { row: r, index: rIdx };
      }
    });

    this.mappedData = [];

    // 3. Process each row in Excel
    dataRows.forEach(row => {
      let rawName = nameCol !== -1 && row[nameCol] ? String(row[nameCol]).trim() : '';
      if (!rawName) return;

      // Filter out repeat header rows or section dividers
      const rawLower = rawName.toLowerCase();
      if (['name', 'employee', 'employee name', 'location', 'total', 'active', 'inactive', 'subtotal', 'department', 'previous employee', 'previous employees'].includes(rawLower)) return;

      // Convert "LastName, FirstName" -> "FirstName LastName"
      let formattedName = rawName;
      if (rawName.includes(',')) {
        const parts = rawName.split(',').map(p => p.trim());
        if (parts.length >= 2) formattedName = `${parts[1]} ${parts[0]}`.trim();
      }

      const normName = formattedName.toLowerCase().replace(/\s+/g, ' ').trim();

      // Find matched CURRENT ACTIVE employee from DB
      let matchedEmp = activeEmpLookup[normName];

      if (!matchedEmp) {
        // Try reversed name: "LastName FirstName" -> "FirstName LastName"
        const nameParts = normName.split(' ');
        if (nameParts.length >= 2) {
          const revName = `${nameParts[nameParts.length - 1]} ${nameParts.slice(0, -1).join(' ')}`;
          matchedEmp = activeEmpLookup[revName];
        }
      }

      if (!matchedEmp) {
        // Try without parentheses/nicknames (e.g. "Michael (Troy) Ramey" -> "Michael Ramey")
        const withoutParens = normName.replace(/\([^)]*\)/g, '').replace(/\s+/g, ' ').trim();
        if (withoutParens && activeEmpLookup[withoutParens]) {
          matchedEmp = activeEmpLookup[withoutParens];
        }
      }

      if (!matchedEmp) {
        // Try nickname inside parentheses as first name (e.g. "Michael (Troy) Ramey" -> "Troy Ramey")
        const parenMatch = normName.match(/\(([^)]+)\)/);
        if (parenMatch) {
          const nickName = parenMatch[1].trim();
          const cleanTokens = normName.replace(/\([^)]*\)/g, '').replace(/\s+/g, ' ').trim().split(' ');
          if (cleanTokens.length > 0) {
            const lastName = cleanTokens[cleanTokens.length - 1];
            const candidate = `${nickName} ${lastName}`.trim();
            if (activeEmpLookup[candidate]) {
              matchedEmp = activeEmpLookup[candidate];
            }
          }
        }
      }

      if (!matchedEmp) {
        // Try without middle name / middle initial (e.g. "First M. Last" -> "First Last")
        const nameParts = normName.split(' ');
        if (nameParts.length >= 3) {
          const noMiddle = `${nameParts[0]} ${nameParts[nameParts.length - 1]}`;
          if (activeEmpLookup[noMiddle]) {
            matchedEmp = activeEmpLookup[noMiddle];
          }
        }
      }

      if (!matchedEmp) {
        // Fuzzy token matching (handles minor spelling differences like Aaron vs Aarron)
        matchedEmp = activeEmpList.find(e => {
          if (e.norm === normName || e.norm.includes(normName) || normName.includes(e.norm)) return true;
          const eTokens = e.norm.split(' ');
          const nTokens = normName.split(' ');
          if (eTokens.length >= 2 && nTokens.length >= 2) {
            const eLast = eTokens[eTokens.length - 1];
            const nLast = nTokens[nTokens.length - 1];
            const eFirst = eTokens[0];
            const nFirst = nTokens[0];
            if (eLast === nLast && (eFirst.startsWith(nFirst.slice(0, 3)) || nFirst.startsWith(eFirst.slice(0, 3)))) {
              return true;
            }
          }
          return false;
        })?.obj;
      }

      // CRITICAL: If this person is NOT a current active employee on the Employees page, record discrepancy and skip
      if (!matchedEmp) {
        this.unmatchedEmployees.push({
          rawName: rawName,
          formattedName: formattedName,
          location: locCol !== -1 && row[locCol] ? String(row[locCol]).trim() : 'Unknown',
          jobNum: jobCol !== -1 && row[jobCol] ? String(row[jobCol]).trim() : ''
        });
        return; // Exclude previous employees and non-company records
      }

      const finalEmpName = String(matchedEmp['Name'] || matchedEmp['Employee Name'] || formattedName).trim();
      const empLocation = matchedEmp['Location'] || (locCol !== -1 && row[locCol] ? String(row[locCol]).trim() : 'Helena');
      const empJobNum = matchedEmp['Job Number'] || (jobCol !== -1 && row[jobCol] ? String(row[jobCol]).trim() : '');

      // Check each cert column on this row
      const certChanges = {};

      Object.keys(colToCertMap).forEach(colIdxStr => {
        const cIdx = parseInt(colIdxStr, 10);
        const certDef = colToCertMap[cIdx];
        if (!certDef) return;

        const cellVal = row[cIdx];
        if (cellVal === undefined || cellVal === null || String(cellVal).trim() === '') return;

        // Strict Date Validation (must return a valid date or 'Need Copy', not text like employee name)
        const dateStr = this.formatDateStr(cellVal);
        if (!dateStr) return;

        const lookupKey = `${finalEmpName.toLowerCase()}_${this.normalizeCertKey(certDef.key)}`;
        const existingEntry = existingCertMap[lookupKey];
        const existingRow = existingEntry ? existingEntry.row : null;

        const currentExpDate = existingRow ? (this.formatDateStr(existingRow['Expiration Date']) || '') : '';
        const currentAcqDate = existingRow ? (this.formatDateStr(existingRow['Date Acquired']) || '') : '';

        // Determine if change is needed
        let isChange = false;
        let changeOldDate = '';
        let changeNewDate = dateStr;

        if (certDef.nonExpiring) {
          // For non-expiring certs (OSHA, Crane Eval, BNSF, MSHA), compare Date Acquired
          changeOldDate = currentAcqDate;
          if (!currentAcqDate || currentAcqDate !== dateStr) {
            if (this.preserveNewerDates && currentAcqDate && currentAcqDate !== 'Need Copy' && dateStr !== 'Need Copy') {
              const oldD = new Date(currentAcqDate);
              const newD = new Date(dateStr);
              if (!isNaN(oldD.getTime()) && !isNaN(newD.getTime()) && oldD > newD) {
                this.preservedRecords.push({
                  employeeName: finalEmpName,
                  location: empLocation,
                  jobNum: empJobNum,
                  certType: certDef.key,
                  certDef: certDef,
                  appDate: currentAcqDate,
                  excelDate: dateStr,
                  reason: 'App date acquired is newer than Excel date',
                  isNonExpiring: true
                });
                return; // Keep existing newer date
              }
            }
            isChange = true;
          }
        } else {
          // For expiring certs, compare Expiration Date
          changeOldDate = currentExpDate;
          if (!currentExpDate || currentExpDate !== dateStr) {
            if (this.preserveNewerDates && currentExpDate && currentExpDate !== 'Need Copy' && dateStr !== 'Need Copy') {
              const oldD = new Date(currentExpDate);
              const newD = new Date(dateStr);
              if (!isNaN(oldD.getTime()) && !isNaN(newD.getTime()) && oldD > newD) {
                this.preservedRecords.push({
                  employeeName: finalEmpName,
                  location: empLocation,
                  jobNum: empJobNum,
                  certType: certDef.key,
                  certDef: certDef,
                  appDate: currentExpDate,
                  excelDate: dateStr,
                  reason: 'App expiration date is newer than Excel date',
                  isNonExpiring: false
                });
                return; // Keep existing newer date
              }
            }
            isChange = true;
          }
        }

        if (isChange) {
          certChanges[certDef.key] = {
            certDef: certDef,
            oldDate: changeOldDate,
            newDate: changeNewDate,
            isNewRecord: !existingRow,
            existingRowIndex: existingEntry ? existingEntry.index : -1
          };
        }
      });

      const changeKeys = Object.keys(certChanges);
      if (changeKeys.length > 0) {
        this.mappedData.push({
          employeeName: finalEmpName,
          location: empLocation,
          jobNum: empJobNum,
          changes: certChanges
        });
      }
    });

    // Extract available cert types and counts
    this.typeCountMap = {};
    this.mappedData.forEach(m => {
      Object.keys(m.changes).forEach(cKey => {
        this.typeCountMap[cKey] = (this.typeCountMap[cKey] || 0) + 1;
      });
    });
    this.availableImportCertTypes = Object.keys(this.typeCountMap).sort();
    this.selectedImportCertTypes = new Set(this.availableImportCertTypes);
    this.previewSearchTerm = '';

    this.renderPreviewScreen();
  }

  /**
   * Toggles a single certification type on/off for import.
   */
  toggleImportCertType(cKey, isChecked) {
    if (isChecked) {
      this.selectedImportCertTypes.add(cKey);
    } else {
      this.selectedImportCertTypes.delete(cKey);
    }
    this.renderPreviewScreen();
  }

  /**
   * Selects all or none of the certification types for import.
   */
  selectAllImportCertTypes(select) {
    if (select) {
      this.selectedImportCertTypes = new Set(this.availableImportCertTypes);
    } else {
      this.selectedImportCertTypes.clear();
    }
    this.renderPreviewScreen();
  }

  /**
   * Live filters preview table by employee name.
   */
  setPreviewSearch(val) {
    this.previewSearchTerm = (val || '').toLowerCase().trim();
    this.renderPreviewScreen();
  }

  /**
   * Strictly validates and formats date strings as MM/DD/YYYY or 'Need Copy'. Returns null for non-date text.
   */
  formatDateStr(val) {
    if (!val && val !== 0) return null;
    if (val instanceof Date) {
      if (isNaN(val.getTime())) return null;
      const mm = String(val.getMonth() + 1).padStart(2, '0');
      const dd = String(val.getDate()).padStart(2, '0');
      const yyyy = val.getFullYear();
      if (yyyy < 1990 || yyyy > 2100) return null;
      return `${mm}/${dd}/${yyyy}`;
    }
    const str = String(val).trim();
    if (!str) return null;

    // Handle "Need Copy"
    if (str.toLowerCase().includes('need copy')) return 'Need Copy';

    // Handle MM/DD/YYYY, MM/DD/YY, MM.DD.YYYY, MM-DD-YYYY
    const slashMatch = str.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/);
    if (slashMatch) {
      let m = parseInt(slashMatch[1], 10);
      let d = parseInt(slashMatch[2], 10);
      let y = parseInt(slashMatch[3], 10);
      if (y < 100) y += 2000;
      if (m >= 1 && m <= 12 && d >= 1 && d <= 31 && y >= 1990 && y <= 2100) {
        return `${String(m).padStart(2, '0')}/${String(d).padStart(2, '0')}/${y}`;
      }
    }

    // Handle YYYY-MM-DD
    const isoMatch = str.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (isoMatch) {
      let y = parseInt(isoMatch[1], 10);
      let m = parseInt(isoMatch[2], 10);
      let d = parseInt(isoMatch[3], 10);
      if (m >= 1 && m <= 12 && d >= 1 && d <= 31 && y >= 1990 && y <= 2100) {
        return `${String(m).padStart(2, '0')}/${String(d).padStart(2, '0')}/${y}`;
      }
    }

    const parsed = new Date(str);
    if (!isNaN(parsed.getTime())) {
      const y = parsed.getFullYear();
      if (y >= 1990 && y <= 2100) {
        const mm = String(parsed.getMonth() + 1).padStart(2, '0');
        const dd = String(parsed.getDate()).padStart(2, '0');
        return `${mm}/${dd}/${y}`;
      }
    }

    // Invalid non-date text
    return null;
  }

  formatDateObj(d) {
    if (!d || !(d instanceof Date) || isNaN(d.getTime())) return '';
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const yyyy = d.getFullYear();
    return `${mm}/${dd}/${yyyy}`;
  }

  /**
   * Calculates local status and days until expiration for UI rendering
   */
  calculateLocalCertStatus(expDateStr) {
    if (!expDateStr || expDateStr === 'Need Copy') return { daysUntil: '', status: 'MISSING' };
    const d = new Date(expDateStr);
    if (isNaN(d.getTime())) return { daysUntil: '', status: 'OK' };

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const diffDays = Math.ceil((d.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

    let status = 'OK';
    if (diffDays < 0) status = 'EXPIRED';
    else if (diffDays <= 30) status = 'CRITICAL';
    else if (diffDays <= 60) status = 'WARNING';
    else if (diffDays <= 90) status = 'UPCOMING';

    return { daysUntil: diffDays, status: status };
  }

  /**
   * Renders the diff preview screen before final confirmation.
   */
  renderPreviewScreen() {
    const body = document.getElementById('certs-import-modal-body');
    const footer = document.getElementById('certs-import-modal-footer');
    if (!body) return;

    if (!this.selectedImportCertTypes) {
      this.selectedImportCertTypes = new Set(this.availableImportCertTypes || []);
    }
    if (!this.activeDiscrepancyTab) {
      this.activeDiscrepancyTab = 'all';
    }

    // Filter employees and changes according to search term and selected cert types
    const filteredEmployees = [];
    let selectedUpdatesCount = 0;
    let totalDateMismatches = 0;
    let totalNewRecords = 0;

    this.mappedData.forEach(emp => {
      const matchingChanges = {};
      Object.keys(emp.changes).forEach(cKey => {
        const ch = emp.changes[cKey];
        if (ch.isNewRecord) totalNewRecords++;
        else totalDateMismatches++;

        if (this.selectedImportCertTypes.has(cKey)) {
          // Filter by active tab
          if (this.activeDiscrepancyTab === 'mismatches' && ch.isNewRecord) return;
          if (this.activeDiscrepancyTab === 'new' && !ch.isNewRecord) return;

          // Filter by search term
          if (this.previewSearchTerm) {
            const matchName = emp.employeeName.toLowerCase().includes(this.previewSearchTerm);
            const matchLoc = (emp.location || '').toLowerCase().includes(this.previewSearchTerm);
            const matchCert = cKey.toLowerCase().includes(this.previewSearchTerm);
            if (!matchName && !matchLoc && !matchCert) return;
          }

          matchingChanges[cKey] = ch;
          selectedUpdatesCount++;
        }
      });

      if (Object.keys(matchingChanges).length > 0) {
        filteredEmployees.push({
          employeeName: emp.employeeName,
          location: emp.location,
          jobNum: emp.jobNum,
          changes: matchingChanges
        });
      }
    });

    const preservedCount = (this.preservedRecords || []).length;
    const unmatchedCount = (this.unmatchedEmployees || []).length;

    let overriddenPreservedCount = 0;
    (this.preservedRecords || []).forEach(p => {
      const key = `${String(p.employeeName || '').toLowerCase().trim()}_${this.normalizeCertKey(p.certType)}`;
      if (this.overriddenPreservedKeys && this.overriddenPreservedKeys.has(key)) {
        overriddenPreservedCount++;
      }
    });

    const totalUpdatesToApply = selectedUpdatesCount + overriddenPreservedCount;

    // Filter preserved records by search term
    const filteredPreserved = (this.preservedRecords || []).filter(p => {
      if (!this.previewSearchTerm) return true;
      return p.employeeName.toLowerCase().includes(this.previewSearchTerm) ||
             p.certType.toLowerCase().includes(this.previewSearchTerm) ||
             (p.location || '').toLowerCase().includes(this.previewSearchTerm);
    });

    // Filter unmatched employees by search term
    const filteredUnmatched = (this.unmatchedEmployees || []).filter(u => {
      if (!this.previewSearchTerm) return true;
      return (u.formattedName || u.rawName).toLowerCase().includes(this.previewSearchTerm) ||
             (u.location || '').toLowerCase().includes(this.previewSearchTerm);
    });

    body.innerHTML = `
      <div style="display: flex; flex-direction: column; gap: 12px;">
        
        <!-- Summary Banner with Export & Audit Actions -->
        <div style="background: linear-gradient(135deg, rgba(16, 185, 129, 0.15) 0%, rgba(5, 150, 105, 0.05) 100%); border: 1px solid rgba(16, 185, 129, 0.35); border-radius: 8px; padding: 12px 18px; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 10px;">
          <div>
            <div style="font-size: 14px; font-weight: 800; color: #6ee7b7; display: flex; align-items: center; gap: 8px;">
              <span>📊</span> Discrepancy Audit: <code>${this.escapeHtml(this.fileName)}</code>
            </div>
            <div style="font-size: 12px; color: var(--text-secondary); margin-top: 2px;">
              <strong>🛡️ Audit Mode:</strong> Zero changes have been made to your database. Review differences or export report below before saving.
            </div>
          </div>
          <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
            <label style="display: inline-flex; align-items: center; gap: 6px; font-size: 11.5px; color: var(--text-secondary); cursor: pointer; user-select: none; background: rgba(255,255,255,0.06); padding: 5px 10px; border-radius: 6px; border: 1px solid var(--border-color);" title="When checked, hidden rows and columns in the Excel spreadsheet will be automatically skipped">
              <input type="checkbox" ${this.ignoreHiddenRows ? 'checked' : ''} onchange="window.certsImportEngine.toggleIgnoreHiddenRows(this.checked)" style="accent-color: #10b981;">
              <span>Ignore Hidden Excel Rows ${this.hiddenRowCount > 0 ? `<strong style="color: #6ee7b7;">(${this.hiddenRowCount} skipped)</strong>` : ''}</span>
            </label>
            <button class="btn btn-secondary" onclick="window.certsImportEngine.copyDiscrepanciesReport()" style="font-size: 11.5px; background: rgba(59, 130, 246, 0.15); color: #93c5fd; border: 1px solid rgba(59, 130, 246, 0.4); display: flex; align-items: center; gap: 5px;">
              <span>📋</span> Copy Report
            </button>
            <button class="btn btn-secondary" onclick="window.certsImportEngine.exportDiscrepancies('xlsx')" style="font-size: 11.5px; background: rgba(16, 185, 129, 0.2); color: #34d399; border: 1px solid rgba(16, 185, 129, 0.4); font-weight: 700; display: flex; align-items: center; gap: 5px;" title="Download full comparison spreadsheet as Excel">
              <span>📥</span> Export Discrepancies (.xlsx)
            </button>
            <button class="btn btn-secondary" onclick="window.certsImportEngine.renderUploadView()" style="font-size: 11.5px;">
              📁 Re-Upload
            </button>
          </div>
        </div>

        <!-- Discrepancy Category Tabs -->
        <div style="display: flex; gap: 6px; border-bottom: 2px solid var(--border-color); padding-bottom: 4px; overflow-x: auto;">
          <button type="button" class="btn btn-sm" onclick="window.certsImportEngine.setDiscrepancyTab('all')" style="padding: 5px 12px; font-size: 12px; font-weight: 700; border-radius: 6px; border: 1px solid ${this.activeDiscrepancyTab === 'all' ? '#3b82f6' : 'var(--border-color)'}; background: ${this.activeDiscrepancyTab === 'all' ? 'rgba(59, 130, 246, 0.2)' : 'transparent'}; color: ${this.activeDiscrepancyTab === 'all' ? '#93c5fd' : 'var(--text-muted)'}; cursor: pointer;">
            🔄 All Changes (${totalDateMismatches + totalNewRecords})
          </button>
          <button type="button" class="btn btn-sm" onclick="window.certsImportEngine.setDiscrepancyTab('mismatches')" style="padding: 5px 12px; font-size: 12px; font-weight: 700; border-radius: 6px; border: 1px solid ${this.activeDiscrepancyTab === 'mismatches' ? '#eab308' : 'var(--border-color)'}; background: ${this.activeDiscrepancyTab === 'mismatches' ? 'rgba(234, 179, 8, 0.2)' : 'transparent'}; color: ${this.activeDiscrepancyTab === 'mismatches' ? '#fde047' : 'var(--text-muted)'}; cursor: pointer;">
            ⚠️ Date Mismatches (${totalDateMismatches})
          </button>
          <button type="button" class="btn btn-sm" onclick="window.certsImportEngine.setDiscrepancyTab('new')" style="padding: 5px 12px; font-size: 12px; font-weight: 700; border-radius: 6px; border: 1px solid ${this.activeDiscrepancyTab === 'new' ? '#10b981' : 'var(--border-color)'}; background: ${this.activeDiscrepancyTab === 'new' ? 'rgba(16, 185, 129, 0.2)' : 'transparent'}; color: ${this.activeDiscrepancyTab === 'new' ? '#6ee7b7' : 'var(--text-muted)'}; cursor: pointer;">
            ✨ New Records (${totalNewRecords})
          </button>
          <button type="button" class="btn btn-sm" onclick="window.certsImportEngine.setDiscrepancyTab('preserved')" style="padding: 5px 12px; font-size: 12px; font-weight: 700; border-radius: 6px; border: 1px solid ${this.activeDiscrepancyTab === 'preserved' ? '#8b5cf6' : 'var(--border-color)'}; background: ${this.activeDiscrepancyTab === 'preserved' ? 'rgba(139, 92, 246, 0.2)' : 'transparent'}; color: ${this.activeDiscrepancyTab === 'preserved' ? '#c4b5fd' : 'var(--text-muted)'}; cursor: pointer;">
            🔒 Preserved in App (${preservedCount}) ${overriddenPreservedCount > 0 ? `<span style="background: rgba(234, 179, 8, 0.35); color: #fde047; padding: 1px 6px; border-radius: 10px; font-size: 10px; margin-left: 4px; border: 1px solid rgba(234, 179, 8, 0.5);">⚡ ${overriddenPreservedCount} using Excel</span>` : ''}
          </button>
          <button type="button" class="btn btn-sm" onclick="window.certsImportEngine.setDiscrepancyTab('unmatched')" style="padding: 5px 12px; font-size: 12px; font-weight: 700; border-radius: 6px; border: 1px solid ${this.activeDiscrepancyTab === 'unmatched' ? '#ef4444' : 'var(--border-color)'}; background: ${this.activeDiscrepancyTab === 'unmatched' ? 'rgba(239, 68, 68, 0.2)' : 'transparent'}; color: ${this.activeDiscrepancyTab === 'unmatched' ? '#fca5a5' : 'var(--text-muted)'}; cursor: pointer;">
            ❓ Unmatched in Excel (${unmatchedCount})
          </button>
        </div>

        <!-- Interactive Cert Types Selector Bar (only shown on change tabs) -->
        ${(this.activeDiscrepancyTab !== 'preserved' && this.activeDiscrepancyTab !== 'unmatched' && this.availableImportCertTypes && this.availableImportCertTypes.length > 0) ? `
          <div style="background: var(--bg-primary); border: 1px solid var(--border-color); border-radius: 8px; padding: 10px 14px; display: flex; flex-direction: column; gap: 8px;">
            <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px;">
              <span style="font-size: 12px; font-weight: 700; color: #93c5fd; display: flex; align-items: center; gap: 6px;">
                <span>📜</span> Certification Types Included:
              </span>
              <div style="display: flex; gap: 6px;">
                <button class="btn btn-secondary" style="padding: 2px 8px; font-size: 11px;" onclick="window.certsImportEngine.selectAllImportCertTypes(true)">Select All</button>
                <button class="btn btn-secondary" style="padding: 2px 8px; font-size: 11px;" onclick="window.certsImportEngine.selectAllImportCertTypes(false)">Deselect All</button>
              </div>
            </div>
            
            <div style="display: flex; flex-wrap: wrap; gap: 6px;">
              ${this.availableImportCertTypes.map(cKey => {
                const isChecked = this.selectedImportCertTypes.has(cKey);
                const count = (this.typeCountMap && this.typeCountMap[cKey]) || 0;
                return `
                  <label style="display: inline-flex; align-items: center; gap: 6px; padding: 4px 10px; background: ${isChecked ? 'rgba(59, 130, 246, 0.18)' : 'rgba(255,255,255,0.04)'}; border: 1px solid ${isChecked ? '#3b82f6' : 'var(--border-color)'}; border-radius: 6px; font-size: 11.5px; color: ${isChecked ? '#93c5fd' : 'var(--text-muted)'}; cursor: pointer; user-select: none;">
                    <input type="checkbox" ${isChecked ? 'checked' : ''} style="accent-color: #3b82f6;" onchange="window.certsImportEngine.toggleImportCertType('${this.escapeHtml(cKey)}', this.checked)">
                    <span style="font-weight: 600;">${this.escapeHtml(cKey)}</span>
                    <span style="background: rgba(0,0,0,0.3); padding: 1px 5px; border-radius: 4px; font-size: 10px; font-weight: 700;">${count}</span>
                  </label>
                `;
              }).join('')}
            </div>
          </div>
        ` : ''}

        <!-- Search Bar -->
        <div style="display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap;">
          <input type="text" placeholder="🔍 Filter by employee name, cert type, or location..." value="${this.escapeHtml(this.previewSearchTerm)}" style="width: 100%; max-width: 480px; padding: 8px 14px; font-size: 13px; background: var(--bg-primary); border: 1px solid var(--border-color); border-radius: 6px; color: var(--text-primary);" oninput="window.certsImportEngine.setPreviewSearch(this.value)">
          <div style="font-size: 12.5px; color: var(--text-muted);">
            ${this.activeDiscrepancyTab === 'preserved'
              ? `Showing <strong>${filteredPreserved.length}</strong> preserved cert(s)`
              : (this.activeDiscrepancyTab === 'unmatched'
                ? `Showing <strong>${filteredUnmatched.length}</strong> unmatched employee(s)`
                : `Showing <strong>${filteredEmployees.length}</strong> employee(s) with <strong>${selectedUpdatesCount}</strong> update(s)`
              )}
          </div>
        </div>

        <!-- Diff Preview Table -->
        <div style="max-height: 58vh; min-height: 480px; overflow-y: auto; border: 1px solid var(--border-color); border-radius: 8px; background: var(--bg-primary); box-shadow: inset 0 2px 6px rgba(0,0,0,0.2);">
          ${this.activeDiscrepancyTab === 'preserved' ? `
            <div style="background: rgba(139, 92, 246, 0.08); border-bottom: 1px solid rgba(139, 92, 246, 0.25); padding: 12px 16px; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 10px;">
              <div style="display: flex; align-items: center; gap: 10px;">
                <span style="font-size: 20px;">🔒</span>
                <div>
                  <div style="font-size: 13px; font-weight: 700; color: #c4b5fd;">Preserved Newer Dates in App (${preservedCount})</div>
                  <div style="font-size: 11.5px; color: var(--text-secondary); margin-top: 2px;">
                    By default, the app protects your dates when the app date is newer than the Excel date.
                    ${overriddenPreservedCount > 0 ? `<strong style="color: #fde047; margin-left: 4px;">⚡ ${overriddenPreservedCount} selected to use Excel date instead.</strong>` : 'You can optionally choose to use the Excel date instead below.'}
                  </div>
                </div>
              </div>
              <div style="display: flex; gap: 8px; align-items: center;">
                <button type="button" class="btn btn-secondary" onclick="window.certsImportEngine.setAllPreservedOverrides(true)" style="font-size: 11.5px; padding: 5px 12px; background: rgba(234, 179, 8, 0.18); color: #fde047; border: 1px solid rgba(234, 179, 8, 0.4); font-weight: 700; display: flex; align-items: center; gap: 5px;" title="Override all preserved dates to use Excel dates instead">
                  <span>⚡</span> Use All Excel Dates (${preservedCount})
                </button>
                <button type="button" class="btn btn-secondary" onclick="window.certsImportEngine.setAllPreservedOverrides(false)" style="font-size: 11.5px; padding: 5px 12px; background: rgba(139, 92, 246, 0.18); color: #c4b5fd; border: 1px solid rgba(139, 92, 246, 0.4); font-weight: 600; display: flex; align-items: center; gap: 5px;" title="Reset all to keep newer App dates">
                  <span>🔒</span> Keep All App Dates
                </button>
              </div>
            </div>
            <table class="data-table" style="width: 100%; border-collapse: collapse; font-size: 12px;">
              <thead>
                <tr style="position: sticky; top: 0; background: #1e293b; z-index: 5; border-bottom: 2px solid #334155;">
                  <th style="width: 200px; padding: 8px 12px;">Employee</th>
                  <th style="padding: 8px 12px;">Certification Type</th>
                  <th style="width: 120px; padding: 8px 12px;">Current App Date</th>
                  <th style="width: 120px; padding: 8px 12px;">Excel Date</th>
                  <th style="width: 150px; text-align: center; padding: 8px 12px;">Status</th>
                  <th style="width: 160px; text-align: center; padding: 8px 12px;">Action / Choice</th>
                </tr>
              </thead>
              <tbody>
                ${filteredPreserved.length === 0 ? `
                  <tr><td colspan="6" style="padding: 36px 16px; text-align: center; color: var(--text-muted);">No preserved records found. (No instances where the App date was newer than the Excel date).</td></tr>
                ` : filteredPreserved.map(p => {
                  const key = `${String(p.employeeName || '').toLowerCase().trim()}_${this.normalizeCertKey(p.certType)}`;
                  const isOverridden = this.overriddenPreservedKeys && this.overriddenPreservedKeys.has(key);
                  return `
                    <tr style="border-bottom: 1px solid rgba(255,255,255,0.05); ${isOverridden ? 'background: rgba(234, 179, 8, 0.08);' : ''}">
                      <td style="font-weight: 700; color: #f8fafc; padding: 8px 12px;">${this.escapeHtml(p.employeeName)} ${p.location ? `<span style="font-size: 11px; color: var(--text-muted);">(${this.escapeHtml(p.location)})</span>` : ''}</td>
                      <td style="font-weight: 600; color: #93c5fd; padding: 8px 12px;">${this.escapeHtml(p.certType)}</td>
                      <td style="font-weight: 700; color: #34d399; font-family: monospace; padding: 8px 12px;">${this.escapeHtml(p.appDate)}</td>
                      <td style="font-weight: 700; color: #fde047; font-family: monospace; padding: 8px 12px;">${this.escapeHtml(p.excelDate)}</td>
                      <td style="text-align: center; padding: 8px 12px;">
                        ${isOverridden ? `
                          <span class="badge" style="background: rgba(234, 179, 8, 0.25); color: #fde047; border: 1px solid rgba(234, 179, 8, 0.5); font-size: 10.5px; font-weight: 700;">
                            ⚡ Using Excel Date
                          </span>
                        ` : `
                          <span class="badge" style="background: rgba(139, 92, 246, 0.2); color: #c4b5fd; border: 1px solid rgba(139, 92, 246, 0.4); font-size: 10.5px;">
                            🔒 Kept Newer App Date
                          </span>
                        `}
                      </td>
                      <td style="text-align: center; padding: 8px 12px;">
                        ${isOverridden ? `
                          <button type="button" class="btn btn-secondary" onclick="window.certsImportEngine.togglePreservedOverride('${this.escapeHtml(p.employeeName)}', '${this.escapeHtml(p.certType)}', false)" style="padding: 3px 10px; font-size: 11px; background: rgba(139, 92, 246, 0.2); color: #c4b5fd; border: 1px solid rgba(139, 92, 246, 0.4); display: inline-flex; align-items: center; gap: 4px;" title="Revert to keeping the newer app date">
                            <span>🔒</span> Keep App Date
                          </button>
                        ` : `
                          <button type="button" class="btn btn-secondary" onclick="window.certsImportEngine.togglePreservedOverride('${this.escapeHtml(p.employeeName)}', '${this.escapeHtml(p.certType)}', true)" style="padding: 3px 10px; font-size: 11px; background: rgba(234, 179, 8, 0.18); color: #fde047; border: 1px solid rgba(234, 179, 8, 0.45); font-weight: 600; display: inline-flex; align-items: center; gap: 4px;" title="Use Excel date (${this.escapeHtml(p.excelDate)}) instead of app date">
                            <span>⚡</span> Use Excel Date
                          </button>
                        `}
                      </td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
          ` : (this.activeDiscrepancyTab === 'unmatched' ? `
            <div style="padding: 12px 16px; background: rgba(239, 68, 68, 0.08); border-bottom: 1px solid rgba(239, 68, 68, 0.2); font-size: 12px; color: #fca5a5; display: flex; align-items: flex-start; gap: 10px;">
              <span style="font-size: 18px; line-height: 1;">🛡️</span>
              <div style="line-height: 1.45;">
                <strong>Safe to Ignore — Zero Impact:</strong> These ${filteredUnmatched.length} names from the Excel file were not found in your active employee roster (or are from inactive/hidden rows in Excel). 
                <strong>They are completely skipped</strong> during import and no changes will be made to your app or database.
                ${this.hiddenRowCount > 0 ? `<div style="margin-top: 4px; color: #6ee7b7;">🔒 Note: <strong>${this.hiddenRowCount}</strong> hidden rows from Excel were already automatically skipped.</div>` : ''}
              </div>
            </div>
            <table class="data-table" style="width: 100%; border-collapse: collapse; font-size: 12px;">
              <thead>
                <tr style="position: sticky; top: 0; background: #1e293b; z-index: 5; border-bottom: 2px solid #334155;">
                  <th style="padding: 8px 12px;">Name in Excel Sheet</th>
                  <th style="width: 160px; padding: 8px 12px;">Location in File</th>
                  <th style="width: 140px; padding: 8px 12px;">Job in File</th>
                  <th style="width: 220px; text-align: center; padding: 8px 12px;">Status</th>
                </tr>
              </thead>
              <tbody>
                ${filteredUnmatched.length === 0 ? `
                  <tr><td colspan="4" style="padding: 36px 16px; text-align: center; color: var(--text-muted);">All employees in the Excel sheet matched active company employees. None skipped!</td></tr>
                ` : filteredUnmatched.map(u => `
                  <tr style="border-bottom: 1px solid rgba(255,255,255,0.05);">
                    <td style="font-weight: 700; color: #f87171; padding: 8px 12px;">${this.escapeHtml(u.formattedName || u.rawName)}</td>
                    <td style="color: var(--text-secondary); padding: 8px 12px;">${this.escapeHtml(u.location || '—')}</td>
                    <td style="color: var(--text-secondary); padding: 8px 12px;">${this.escapeHtml(u.jobNum || '—')}</td>
                    <td style="text-align: center; padding: 8px 12px;">
                      <span class="badge" style="background: rgba(239, 68, 68, 0.2); color: #fca5a5; border: 1px solid rgba(239, 68, 68, 0.4); font-size: 10.5px;">
                        ⚠️ Skipped / Ignored (Not in Active Roster)
                      </span>
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          ` : `
            <table class="data-table" style="width: 100%; border-collapse: collapse; font-size: 12px;">
              <thead>
                <tr style="position: sticky; top: 0; background: #1e293b; z-index: 5; border-bottom: 2px solid #334155;">
                  <th style="width: 200px; padding: 8px 12px;">Employee</th>
                  <th style="padding: 8px 12px;">Certification Type</th>
                  <th style="width: 120px; padding: 8px 12px;">Current App Date</th>
                  <th style="width: 30px; text-align: center; padding: 8px 4px;">→</th>
                  <th style="width: 120px; padding: 8px 12px;">New Excel Date</th>
                  <th style="width: 90px; text-align: center; padding: 8px 12px;">Action</th>
                </tr>
              </thead>
              <tbody>
                ${filteredEmployees.length === 0 ? `
                  <tr><td colspan="6" style="padding: 36px 16px; text-align: center; color: var(--text-muted);">No matching certification updates found for this tab. Check your filters above.</td></tr>
                ` : filteredEmployees.map(emp => {
                  const changeKeys = Object.keys(emp.changes);
                  return changeKeys.map((cKey, idx) => {
                    const ch = emp.changes[cKey];
                    return `
                      <tr style="border-bottom: 1px solid rgba(255,255,255,0.05);">
                        ${idx === 0 ? `<td rowspan="${changeKeys.length}" style="font-weight: 700; color: #f8fafc; border-right: 1px solid var(--border-color); padding: 8px 12px; vertical-align: top;">${this.escapeHtml(emp.employeeName)} ${emp.location ? `<div style="font-size: 11px; font-weight: normal; color: var(--text-muted);">${this.escapeHtml(emp.location)}</div>` : ''}</td>` : ''}
                        <td style="font-weight: 600; color: #93c5fd; padding: 8px 12px;">${this.escapeHtml(cKey)}</td>
                        <td style="color: var(--text-muted); font-family: monospace; padding: 8px 12px;">${this.escapeHtml(ch.oldDate || '—')}</td>
                        <td style="text-align: center; color: #34d399; font-weight: bold; padding: 8px 4px;">→</td>
                        <td style="font-weight: 700; color: #34d399; font-family: monospace; padding: 8px 12px;">${this.escapeHtml(ch.newDate)}</td>
                        <td style="text-align: center; padding: 8px 12px;">
                          <span class="badge" style="background: ${ch.isNewRecord ? 'rgba(59, 130, 246, 0.2)' : 'rgba(16, 185, 129, 0.2)'}; color: ${ch.isNewRecord ? '#93c5fd' : '#6ee7b7'}; border: 1px solid ${ch.isNewRecord ? 'rgba(59, 130, 246, 0.4)' : 'rgba(16, 185, 129, 0.4)'}; font-size: 10.5px;">
                            ${ch.isNewRecord ? '✨ New' : '🔄 Update'}
                          </span>
                        </td>
                      </tr>
                    `;
                  }).join('');
                }).join('')}
              </tbody>
            </table>
          `)}
        </div>
      </div>
    `;

    if (footer) {
      footer.innerHTML = `
        <div style="font-size: 11.5px; color: var(--text-muted); display: flex; align-items: center; gap: 6px;">
          <span>ℹ️</span> Changes are only committed when you click Save.
        </div>
        <div style="display: flex; gap: 8px; align-items: center;">
          <button class="btn btn-secondary" onclick="window.certsImportEngine.closeImportModal()">Cancel</button>
          <button class="btn btn-primary" onclick="window.certsImportEngine.confirmImport()" style="font-weight: 700; background: linear-gradient(135deg, #10b981 0%, #059669 100%); border: none; display: flex; align-items: center; gap: 6px; box-shadow: 0 2px 8px rgba(16, 185, 129, 0.4);" ${totalUpdatesToApply === 0 ? 'disabled' : ''}>
            <span>🚀</span> Apply & Save ${totalUpdatesToApply} Cert Updates
          </button>
        </div>
      `;
    }
  }

  setDiscrepancyTab(tabKey) {
    this.activeDiscrepancyTab = tabKey;
    this.renderPreviewScreen();
  }

  exportDiscrepancies(format = 'xlsx') {
    const rows = [];
    
    // 1. Changes (Updates & New records)
    (this.mappedData || []).forEach(emp => {
      Object.keys(emp.changes).forEach(cKey => {
        const ch = emp.changes[cKey];
        const isSelected = this.selectedImportCertTypes && this.selectedImportCertTypes.has(cKey);
        rows.push({
          'Employee Name': emp.employeeName,
          'Location': emp.location || '',
          'Job #': emp.jobNum || '',
          'Certification Type': cKey,
          'Current Date in App': ch.oldDate || '(None / Missing)',
          'New Date in Excel': ch.newDate,
          'Discrepancy Category': ch.isNewRecord ? 'New in Excel (Missing in App)' : 'Date Mismatch',
          'Import Status': isSelected ? 'Will Update' : 'Deselected by User'
        });
      });
    });

    // 2. Preserved in App
    (this.preservedRecords || []).forEach(p => {
      const key = `${String(p.employeeName || '').toLowerCase().trim()}_${this.normalizeCertKey(p.certType)}`;
      const isOverridden = this.overriddenPreservedKeys && this.overriddenPreservedKeys.has(key);
      rows.push({
        'Employee Name': p.employeeName,
        'Location': p.location || '',
        'Job #': p.jobNum || '',
        'Certification Type': p.certType,
        'Current Date in App': p.appDate,
        'New Date in Excel': p.excelDate,
        'Discrepancy Category': isOverridden ? 'Preserved in App (Overridden to Excel Date)' : 'Preserved in App (App Date Newer)',
        'Import Status': isOverridden ? 'Will Update to Excel Date (User Override)' : 'Protected / Kept Newer App Date'
      });
    });

    // 3. Unmatched employees in Excel
    (this.unmatchedEmployees || []).forEach(u => {
      rows.push({
        'Employee Name': u.formattedName || u.rawName,
        'Location': u.location || '',
        'Job #': u.jobNum || '',
        'Certification Type': '(All Certs)',
        'Current Date in App': 'N/A (Not Found in App)',
        'New Date in Excel': 'Present in File',
        'Discrepancy Category': 'Employee Not Found in Active Roster (or Hidden Row in Excel)',
        'Import Status': 'Skipped / Ignored (Zero Database Impact)'
      });
    });

    if (rows.length === 0) {
      alert('ℹ️ No discrepancies found to export.');
      return;
    }

    const timestamp = new Date().toISOString().slice(0, 10);
    const baseName = (this.fileName || 'Expiring_Certs').replace(/\.[^/.]+$/, '');
    const filename = `${baseName}_Discrepancies_${timestamp}.xlsx`;

    if (window.XLSX && typeof window.XLSX.utils !== 'undefined') {
      const ws = window.XLSX.utils.json_to_sheet(rows);
      const wb = window.XLSX.utils.book_new();
      window.XLSX.utils.book_append_sheet(wb, ws, 'Discrepancies');
      window.XLSX.writeFile(wb, filename);
    } else {
      // Fallback CSV download
      const headers = Object.keys(rows[0]);
      const csvLines = [headers.join(',')];
      rows.forEach(r => {
        csvLines.push(headers.map(h => `"${String(r[h] || '').replace(/"/g, '""')}"`).join(','));
      });
      const blob = new Blob([csvLines.join('\n')], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${baseName}_Discrepancies_${timestamp}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }
  }

  copyDiscrepanciesReport() {
    let text = `CERTIFICATIONS DISCREPANCY AUDIT REPORT\nFile: ${this.fileName}\nGenerated: ${new Date().toLocaleString()}\n`;
    text += `========================================================\n\n`;
    
    const updates = [];
    const newRecords = [];
    (this.mappedData || []).forEach(emp => {
      Object.keys(emp.changes).forEach(cKey => {
        const ch = emp.changes[cKey];
        if (ch.isNewRecord) {
          newRecords.push(`• ${emp.employeeName} (${emp.location || 'Helena'}): ${cKey} -> ${ch.newDate} [New in Excel]`);
        } else {
          updates.push(`• ${emp.employeeName} (${emp.location || 'Helena'}): ${cKey} -> App: ${ch.oldDate || 'None'} ➔ Excel: ${ch.newDate}`);
        }
      });
    });

    text += `--- DATE MISMATCHES (${updates.length}) ---\n`;
    text += updates.length ? updates.join('\n') + '\n\n' : 'None\n\n';

    text += `--- NEW RECORDS IN EXCEL (${newRecords.length}) ---\n`;
    text += newRecords.length ? newRecords.join('\n') + '\n\n' : 'None\n\n';

    if (this.preservedRecords && this.preservedRecords.length > 0) {
      text += `--- PRESERVED IN APP (App date is newer) (${this.preservedRecords.length}) ---\n`;
      text += this.preservedRecords.map(p => {
        const key = `${String(p.employeeName || '').toLowerCase().trim()}_${this.normalizeCertKey(p.certType)}`;
        const isOverridden = this.overriddenPreservedKeys && this.overriddenPreservedKeys.has(key);
        return `• ${p.employeeName}: ${p.certType} (App: ${p.appDate} vs Excel: ${p.excelDate}) [${isOverridden ? 'OVERRIDDEN -> WILL USE EXCEL DATE' : 'KEPT APP DATE'}]`;
      }).join('\n') + '\n\n';
    }

    if (this.unmatchedEmployees && this.unmatchedEmployees.length > 0) {
      text += `--- UNMATCHED EMPLOYEES IN EXCEL (${this.unmatchedEmployees.length} - SKIPPED / ZERO DATABASE IMPACT) ---\n`;
      text += this.unmatchedEmployees.map(u => `• ${u.formattedName || u.rawName} (${u.location || 'Unknown'})`).join('\n') + '\n\n';
    }

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(() => {
        alert('📋 Discrepancy report copied to clipboard!');
      }).catch(() => {
        prompt('Copy report:', text);
      });
    } else {
      prompt('Copy report:', text);
    }
  }

  /**
   * Applies changes to local database and queues outbox mutations for cloud sync.
   */
  async confirmImport() {
    const hasRegularChanges = (this.mappedData || []).some(emp => Object.keys(emp.changes || {}).length > 0);
    const hasOverrides = this.overriddenPreservedKeys && this.overriddenPreservedKeys.size > 0;
    if (!hasRegularChanges && !hasOverrides) return;

    if (!this.db) this.db = window.localDB || window.safetyDB;

    let certsTable = this.db ? this.db.getTable('expiring_certs') : null;
    const headers = ['Employee Name', 'Item Type', 'Date Acquired', 'Expiration Date', 'Location', 'Job #', 'Days Until Expiration', 'Status', 'SMS'];

    if (!certsTable || !certsTable.rows) {
      certsTable = { name: 'Expiring Certs', headers: headers, rows: [], rawGrid: [headers], rowCount: 0, _normalized: true };
      if (this.db && this.db.snapshot && this.db.snapshot.tables) {
        this.db.snapshot.tables['expiring_certs'] = certsTable;
      }
    }

    let appliedCount = 0;

    // 1. Apply regular changes
    for (const emp of this.mappedData) {
      for (const cKey of Object.keys(emp.changes)) {
        // Only apply if user kept this cert type selected
        if (this.selectedImportCertTypes && !this.selectedImportCertTypes.has(cKey)) {
          continue;
        }

        const ch = emp.changes[cKey];
        const certDef = ch.certDef;

        // Check if row already exists in table (using fuzzy/canonical key lookup)
        const targetNormalized = this.normalizeCertKey(cKey);
        let targetRowIdx = certsTable.rows.findIndex(r => {
          const rEmp = String(r['Employee Name'] || r['Name'] || '').toLowerCase().trim();
          const rType = this.normalizeCertKey(r['Item Type'] || r['Cert Type'] || r['Type'] || '');
          return rEmp === emp.employeeName.toLowerCase().trim() && rType === targetNormalized;
        });

        if (targetRowIdx !== -1) {
          // 1. UPDATE existing row in expiring_certs
          const row = certsTable.rows[targetRowIdx];
          const sheetRowNumber = targetRowIdx + 2; // Row 1 = Headers

          if (certDef.nonExpiring) {
            const oldVal = row['Date Acquired'] || '';
            row['Date Acquired'] = ch.newDate;
            if (this.db && typeof this.db.addMutation === 'function') {
              await this.db.addMutation({
                action: 'UPDATE_CELL',
                sheetName: 'Expiring Certs',
                tableKey: 'expiring_certs',
                row: sheetRowNumber,
                col: 3, // Col C: Date Acquired
                header: 'Date Acquired',
                value: ch.newDate,
                oldValue: oldVal,
                employeeName: emp.employeeName,
                certName: cKey,
                itemType: cKey
              });
            }
          } else {
            const oldVal = row['Expiration Date'] || '';
            row['Expiration Date'] = ch.newDate;
            const statusCalc = this.calculateLocalCertStatus(ch.newDate);
            row['Days Until Expiration'] = statusCalc.daysUntil;
            row['Status'] = statusCalc.status;

            if (this.db && typeof this.db.addMutation === 'function') {
              await this.db.addMutation({
                action: 'UPDATE_CELL',
                sheetName: 'Expiring Certs',
                tableKey: 'expiring_certs',
                row: sheetRowNumber,
                col: 4, // Col D: Expiration Date
                header: 'Expiration Date',
                value: ch.newDate,
                oldValue: oldVal,
                employeeName: emp.employeeName,
                certName: cKey,
                itemType: cKey
              });
            }
          }
          appliedCount++;
        } else {
          // 2. ADD new row to expiring_certs
          const newRow = {
            'Employee Name': emp.employeeName,
            'Item Type': cKey,
            'Date Acquired': certDef.nonExpiring ? ch.newDate : '',
            'Expiration Date': certDef.nonExpiring ? '' : ch.newDate,
            'Location': emp.location || 'Helena',
            'Job #': emp.jobNum || '',
            'Days Until Expiration': certDef.nonExpiring ? '' : this.calculateLocalCertStatus(ch.newDate).daysUntil,
            'Status': certDef.nonExpiring ? 'OK' : this.calculateLocalCertStatus(ch.newDate).status,
            'SMS': ''
          };

          certsTable.rows.push(newRow);
          certsTable.rowCount = certsTable.rows.length;

          if (certsTable.rawGrid) {
            const gridArr = headers.map(h => newRow[h] !== undefined ? newRow[h] : '');
            certsTable.rawGrid.push(gridArr);
            certsTable.maxRows = certsTable.rawGrid.length;
          }

          if (this.db && typeof this.db.addMutation === 'function') {
            await this.db.addMutation({
              action: 'ADD_ROW',
              sheetName: 'Expiring Certs',
              tableKey: 'expiring_certs',
              rowData: newRow,
              employeeName: emp.employeeName,
              certName: cKey,
              itemType: cKey
            });
          }

          appliedCount++;
        }
      }
    }

    // 2. Apply selected overrides from preserved records
    if (this.preservedRecords && this.overriddenPreservedKeys && this.overriddenPreservedKeys.size > 0) {
      for (const p of this.preservedRecords) {
        const key = `${String(p.employeeName || '').toLowerCase().trim()}_${this.normalizeCertKey(p.certType)}`;
        if (!this.overriddenPreservedKeys.has(key)) continue;

        const certDef = p.certDef || this.certDefinitions[p.certType] || { key: p.certType, nonExpiring: !!p.isNonExpiring };
        const targetNormalized = this.normalizeCertKey(p.certType);

        let targetRowIdx = certsTable.rows.findIndex(r => {
          const rEmp = String(r['Employee Name'] || r['Name'] || '').toLowerCase().trim();
          const rType = this.normalizeCertKey(r['Item Type'] || r['Cert Type'] || r['Type'] || '');
          return rEmp === p.employeeName.toLowerCase().trim() && rType === targetNormalized;
        });

        if (targetRowIdx !== -1) {
          const row = certsTable.rows[targetRowIdx];
          const sheetRowNumber = targetRowIdx + 2;

          if (certDef.nonExpiring) {
            const oldVal = row['Date Acquired'] || '';
            row['Date Acquired'] = p.excelDate;
            if (this.db && typeof this.db.addMutation === 'function') {
              await this.db.addMutation({
                action: 'UPDATE_CELL',
                sheetName: 'Expiring Certs',
                tableKey: 'expiring_certs',
                row: sheetRowNumber,
                col: 3,
                header: 'Date Acquired',
                value: p.excelDate,
                oldValue: oldVal,
                employeeName: p.employeeName,
                certName: p.certType,
                itemType: p.certType
              });
            }
          } else {
            const oldVal = row['Expiration Date'] || '';
            row['Expiration Date'] = p.excelDate;
            const statusCalc = this.calculateLocalCertStatus(p.excelDate);
            row['Days Until Expiration'] = statusCalc.daysUntil;
            row['Status'] = statusCalc.status;

            if (this.db && typeof this.db.addMutation === 'function') {
              await this.db.addMutation({
                action: 'UPDATE_CELL',
                sheetName: 'Expiring Certs',
                tableKey: 'expiring_certs',
                row: sheetRowNumber,
                col: 4,
                header: 'Expiration Date',
                value: p.excelDate,
                oldValue: oldVal,
                employeeName: p.employeeName,
                certName: p.certType,
                itemType: p.certType
              });
            }
          }
          appliedCount++;
        }
      }
    }

    // Save updated database snapshot
    if (this.db) {
      if (typeof this.db.setSnapshot === 'function' && this.db.snapshot) {
        await this.db.setSnapshot(this.db.snapshot);
      } else if (window.desktopAPI) {
        await window.desktopAPI.saveLocalSnapshot(this.db.snapshot);
      }
    }

    this.closeImportModal();

    // Refresh active views
    if (window.sheetNavigator) {
      if (typeof window.sheetNavigator.renderSheet === 'function') {
        window.sheetNavigator.renderSheet('expiring_certs');
      } else if (typeof window.sheetNavigator.renderActiveView === 'function') {
        window.sheetNavigator.renderActiveView();
      }
    }
    if (window.syncEngine && typeof window.syncEngine.renderOutboxBadge === 'function') {
      window.syncEngine.renderOutboxBadge();
    }

    alert(`🎉 Successfully imported ${appliedCount} certification update(s)!\n\nChanges are saved locally and queued in your Outbox to push to Google Sheets.`);
  }

  escapeHtml(str) {
    if (!str && str !== 0) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
}

// Attach globally
window.certsImportEngine = new CertsImportEngine(window.localDB || window.safetyDB || null);
window.CertsImportEngine = CertsImportEngine;
