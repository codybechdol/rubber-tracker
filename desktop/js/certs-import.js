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

    // Supported certification types definition lookup (exact Google Sheets keys)
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

  /**
   * Normalizes any cert string for comparison (handling aliases like "First Aid" vs "1st Aid").
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
    return clean;
  }

  /**
   * Opens the Certifications Import modal.
   */
  openImportModal() {
    this.parsedRows = [];
    this.mappedData = [];
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
          <input type="file" id="certs-file-input" accept=".xlsx, .xls, .csv" style="display: none;" onchange="window.certsImportEngine.handleFileSelected(this.files[0])" />
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
        const workbook = XLSX.read(data, { type: 'array', cellDates: true });
        
        // Scan all sheets and select the one with the highest number of matched cert headers
        let bestSheetName = workbook.SheetNames[0];
        let maxCertScore = -1;

        for (const sName of workbook.SheetNames) {
          const ws = workbook.Sheets[sName];
          if (!ws || !ws['!ref']) continue;
          const sampleGrid = this.extractGridFromWorksheet(ws, 15);
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

        const worksheet = workbook.Sheets[bestSheetName];
        const grid = this.extractGridFromWorksheet(worksheet);

        this.processRawSheetData(grid);
      } catch (err) {
        console.error('Failed to parse Excel file:', err);
        alert('❌ Error reading file: ' + err.message);
      }
    };
    reader.readAsArrayBuffer(file);
  }

  /**
   * Robust cell extraction handling SheetJS text, date objects, and Excel serial numbers.
   */
  extractGridFromWorksheet(worksheet, maxRows = Infinity) {
    if (!worksheet || !worksheet['!ref']) return [];
    const range = XLSX.utils.decode_range(worksheet['!ref']);
    const grid = [];
    const endRow = Math.min(range.e.r, range.s.r + maxRows - 1);

    for (let r = range.s.r; r <= endRow; r++) {
      const row = [];
      let hasData = false;

      for (let c = range.s.c; c <= range.e.c; c++) {
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
    const empLookup = {};
    empList.forEach(e => {
      const n = String(e['Name'] || e['Employee Name'] || '').toLowerCase().trim();
      if (n) empLookup[n] = e;
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
      if (['name', 'employee', 'employee name', 'location', 'total', 'active', 'inactive', 'subtotal', 'department'].includes(rawLower)) return;

      // Convert "LastName, FirstName" -> "FirstName LastName"
      let formattedName = rawName;
      if (rawName.includes(',')) {
        const parts = rawName.split(',').map(p => p.trim());
        if (parts.length >= 2) formattedName = `${parts[1]} ${parts[0]}`.trim();
      }

      const normName = formattedName.toLowerCase();

      // Find matched employee from DB (to resolve proper casing and location)
      const matchedEmp = empLookup[normName] || Object.values(empLookup).find(e => {
        const dbName = String(e['Name'] || e['Employee Name'] || '').toLowerCase().trim();
        return dbName.includes(normName) || normName.includes(dbName);
      });

      const finalEmpName = matchedEmp ? String(matchedEmp['Name'] || matchedEmp['Employee Name'] || formattedName).trim() : formattedName;
      const empLocation = (locCol !== -1 && row[locCol]) ? String(row[locCol]).trim() : (matchedEmp ? (matchedEmp['Location'] || 'Helena') : 'Helena');
      const empJobNum = (jobCol !== -1 && row[jobCol]) ? String(row[jobCol]).trim() : (matchedEmp ? (matchedEmp['Job Number'] || '') : '');

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
    const slashMatch = str.match(/^(\d{1,2})[\/\.-](\d{1,2})[\/\.-](\d{2,4})$/);
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

    // Filter employees and changes according to search term and selected cert types
    const filteredEmployees = [];
    let selectedUpdatesCount = 0;

    this.mappedData.forEach(emp => {
      if (this.previewSearchTerm) {
        const matchName = emp.employeeName.toLowerCase().includes(this.previewSearchTerm);
        const matchLoc = (emp.location || '').toLowerCase().includes(this.previewSearchTerm);
        if (!matchName && !matchLoc) return;
      }

      const matchingChanges = {};
      Object.keys(emp.changes).forEach(cKey => {
        if (this.selectedImportCertTypes.has(cKey)) {
          matchingChanges[cKey] = emp.changes[cKey];
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

    body.innerHTML = `
      <div style="display: flex; flex-direction: column; gap: 12px;">
        
        <!-- Summary Banner -->
        <div style="background: linear-gradient(135deg, rgba(16, 185, 129, 0.15) 0%, rgba(5, 150, 105, 0.05) 100%); border: 1px solid rgba(16, 185, 129, 0.35); border-radius: 8px; padding: 12px 18px; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 10px;">
          <div>
            <div style="font-size: 14px; font-weight: 800; color: #6ee7b7; display: flex; align-items: center; gap: 8px;">
              <span>✅</span> Import Preview: <code>${this.escapeHtml(this.fileName)}</code>
            </div>
            <div style="font-size: 12px; color: var(--text-secondary); margin-top: 2px;">
              Detected <strong>${this.mappedData.length}</strong> employee(s) with <strong>${selectedUpdatesCount}</strong> selected update(s) across <strong>${(this.availableImportCertTypes || []).length}</strong> certification types.
            </div>
          </div>
          <button class="btn btn-secondary" onclick="window.certsImportEngine.renderUploadView()" style="font-size: 11.5px;">
            📁 Choose Different File
          </button>
        </div>

        <!-- Interactive Cert Types Selector Bar -->
        ${(this.availableImportCertTypes && this.availableImportCertTypes.length > 0) ? `
          <div style="background: var(--bg-primary); border: 1px solid var(--border-color); border-radius: 8px; padding: 10px 14px; display: flex; flex-direction: column; gap: 8px;">
            <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px;">
              <span style="font-size: 12px; font-weight: 700; color: #93c5fd; display: flex; align-items: center; gap: 6px;">
                <span>📜</span> Select Certification Types to Import:
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
        <div style="display: flex; align-items: center; justify-content: space-between; gap: 10px;">
          <input type="text" placeholder="🔍 Search employee name or location..." value="${this.escapeHtml(this.previewSearchTerm)}" style="width: 100%; max-width: 320px; padding: 6px 12px; font-size: 12px; background: var(--bg-primary); border: 1px solid var(--border-color); border-radius: 6px; color: var(--text-primary);" oninput="window.certsImportEngine.setPreviewSearch(this.value)">
          <div style="font-size: 12px; color: var(--text-muted);">Showing <strong>${filteredEmployees.length}</strong> employee(s)</div>
        </div>

        <!-- Diff Preview Table -->
        <div style="max-height: 380px; overflow-y: auto; border: 1px solid var(--border-color); border-radius: 8px; background: var(--bg-primary);">
          <table class="data-table" style="width: 100%; border-collapse: collapse; font-size: 12px;">
            <thead>
              <tr style="position: sticky; top: 0; background: #1e293b; z-index: 5; border-bottom: 2px solid #334155;">
                <th style="width: 200px; padding: 8px 12px;">Employee</th>
                <th style="padding: 8px 12px;">Certification Type</th>
                <th style="width: 120px; padding: 8px 12px;">Current Date</th>
                <th style="width: 30px; text-align: center; padding: 8px 4px;">→</th>
                <th style="width: 120px; padding: 8px 12px;">New Date</th>
                <th style="width: 90px; text-align: center; padding: 8px 12px;">Action</th>
              </tr>
            </thead>
            <tbody>
              ${filteredEmployees.length === 0 ? `
                <tr><td colspan="6" style="padding: 36px 16px; text-align: center; color: var(--text-muted);">No matching certification updates found. Check your filters above.</td></tr>
              ` : filteredEmployees.map(emp => {
                const changeKeys = Object.keys(emp.changes);
                return changeKeys.map((cKey, idx) => {
                  const ch = emp.changes[cKey];
                  return `
                    <tr style="border-bottom: 1px solid rgba(255,255,255,0.05);">
                      ${idx === 0 ? `<td rowspan="${changeKeys.length}" style="font-weight: 700; color: #f8fafc; border-right: 1px solid var(--border-color); padding: 8px 12px; vertical-align: top;">${this.escapeHtml(emp.employeeName)}</td>` : ''}
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
        </div>
      </div>
    `;

    if (footer) {
      footer.innerHTML = `
        <button class="btn btn-secondary" onclick="window.certsImportEngine.closeImportModal()">Cancel</button>
        <button class="btn btn-primary" onclick="window.certsImportEngine.confirmImport()" style="font-weight: 700; background: linear-gradient(135deg, #10b981 0%, #059669 100%); border: none; display: flex; align-items: center; gap: 6px; box-shadow: 0 2px 8px rgba(16, 185, 129, 0.4);" ${selectedUpdatesCount === 0 ? 'disabled' : ''}>
          <span>🚀</span> Apply & Save ${selectedUpdatesCount} Cert Updates
        </button>
      `;
    }
  }

  /**
   * Applies changes to local database and queues outbox mutations for cloud sync.
   */
  async confirmImport() {
    if (this.mappedData.length === 0) return;

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
                oldValue: oldVal
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
                oldValue: oldVal
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
              rowData: newRow
            });
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
