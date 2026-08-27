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

    // Supported certification types and aliases
    this.certDefinitions = [
      { key: 'First Aid', label: 'First Aid / 1st Aid', aliases: ['1st aid', 'first aid', 'fa', '1st aid/cpr', 'first aid / cpr'], nonExpiring: false },
      { key: 'CPR', label: 'CPR / AED', aliases: ['cpr', 'cpr/aed', 'aed/cpr', 'cardiopulmonary'], nonExpiring: false },
      { key: 'DL', label: "Driver's License (DL)", aliases: ['dl', 'driver', 'drivers license', "driver's license", 'license', 'cdl'], nonExpiring: false },
      { key: 'Medical Card', label: 'Medical Card (DOT)', aliases: ['medical card', 'med card', 'med', 'dot', 'dot card', 'dot physical'], nonExpiring: false },
      { key: 'Crane Cert', label: 'Crane Certification', aliases: ['crane cert', 'crane certification', 'ncco', 'crane license', 'crane'], nonExpiring: false },
      { key: 'Crane Evaluation', label: 'Crane Evaluation', aliases: ['crane eval', 'crane evaluation', 'crane assessment'], nonExpiring: true, isIssuedDate: true },
      { key: 'OSHA 1910', label: 'OSHA 1910 / 10 / 30', aliases: ['osha 1910', 'osha 10', 'osha 30', 'osha 10/30', 'osha', 'et&d', 'osha etd'], nonExpiring: true, isIssuedDate: true },
      { key: 'BNSF', label: 'BNSF Rail Safety', aliases: ['bnsf', 'bnsf rail', 'bnsf safety', 'railroad'], nonExpiring: true, isIssuedDate: true },
      { key: 'MSHA', label: 'MSHA Mine Safety', aliases: ['msha', 'msha 46', 'msha 48', 'mine safety'], nonExpiring: true, isIssuedDate: true },
      { key: 'OSHA Trench Comp Person', label: 'OSHA Trench Competent Person', aliases: ['trench', 'trenching', 'trench comp person', 'trench competent', 'excavation'], nonExpiring: true, isIssuedDate: true },
      { key: 'Forklift', label: 'Forklift Certification', aliases: ['forklift', 'fork lift', 'pit', 'powered industrial truck'], nonExpiring: false },
      { key: 'Forklift Operator Safety Training', label: 'Forklift Safety Training', aliases: ['forklift operator safety training', 'forklift training', 'forklift eval'], nonExpiring: true, isIssuedDate: true },
      { key: 'Rigging & Signaling', label: 'Rigging & Signaling', aliases: ['rigging', 'rigging & signaling', 'rigging and signaling', 'rigger', 'signal person'], nonExpiring: false },
      { key: 'Harassment Training', label: 'Harassment Prevention', aliases: ['harassment', 'harassment training', 'anti-harassment', 'dei'], nonExpiring: false },
      { key: 'EICA Basic Helicopter Line Construction Safety', label: 'EICA Basic Helicopter Safety', aliases: ['eica', 'helicopter', 'helo', 'eica basic helo', 'helo safety'], nonExpiring: true, isIssuedDate: true },
      { key: 'Pole Top Rescue', label: 'Pole Top Rescue', aliases: ['pole top', 'pole top rescue', 'bucket rescue', 'tower rescue'], nonExpiring: false },
      { key: 'Dig Safe', label: 'Dig Safe / 811', aliases: ['dig safe', 'digsafe', '811', 'utility locate'], nonExpiring: false }
    ];
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
        
        // Pick first worksheet or one named Certs/Training if available
        let sheetName = workbook.SheetNames[0];
        const certSheetCandidate = workbook.SheetNames.find(s => s.toLowerCase().includes('cert') || s.toLowerCase().includes('matrix') || s.toLowerCase().includes('training'));
        if (certSheetCandidate) sheetName = certSheetCandidate;

        const worksheet = workbook.Sheets[sheetName];
        const rawJson = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });

        this.processRawSheetData(rawJson);
      } catch (err) {
        console.error('Failed to parse Excel file:', err);
        alert('❌ Error reading file: ' + err.message);
      }
    };
    reader.readAsArrayBuffer(file);
  }

  /**
   * Normalizes spreadsheet rows, locates header row and maps cert columns to 9-column expiring_certs table.
   */
  processRawSheetData(rows) {
    if (!rows || rows.length < 2) {
      alert('⚠️ The selected file contains no data rows.');
      return;
    }

    // Header keywords to search for
    const nameKeywords = ['name', 'employee', 'employee name', 'last name', 'first name', 'worker', 'lineman'];

    // 1. Find header row (search first 20 rows)
    let headerIdx = -1;
    for (let r = 0; r < Math.min(25, rows.length); r++) {
      const row = rows[r].map(c => String(c || '').toLowerCase().trim());
      if (row.some(c => nameKeywords.includes(c) || c.includes('first aid') || c.includes('1st aid') || c === 'cpr' || c === 'dl')) {
        headerIdx = r;
        break;
      }
    }

    let headers = [];
    let dataRows = [];

    if (headerIdx >= 0) {
      headers = rows[headerIdx].map(c => String(c || '').trim());
      dataRows = rows.slice(headerIdx + 1);
    } else {
      headers = rows[0].map(c => String(c || '').trim());
      dataRows = rows.slice(1);
    }

    // 2. Identify column indices for Employee Name, Job#, Location, and Certifications
    let nameCol = -1;
    let firstNameCol = -1;
    let lastNameCol = -1;
    let jobCol = -1;
    let locCol = -1;

    // Map columnIndex -> Cert Definition
    const colToCertMap = {};

    headers.forEach((h, idx) => {
      const hClean = String(h || '').toLowerCase().trim();
      if (!hClean) return;

      if (hClean === 'name' || hClean === 'employee' || hClean === 'employee name' || hClean === 'full name') {
        nameCol = idx;
      } else if (hClean === 'first name' || hClean === 'first') {
        firstNameCol = idx;
      } else if (hClean === 'last name' || hClean === 'last') {
        lastNameCol = idx;
      } else if (hClean.includes('job') || hClean === 'crew' || hClean === 'job #') {
        jobCol = idx;
      } else if (hClean.includes('location') || hClean === 'city') {
        locCol = idx;
      } else {
        // Check cert definitions
        for (const def of this.certDefinitions) {
          const isMatch = def.aliases.some(alias => {
            return hClean === alias || hClean.includes(alias) || alias.includes(hClean);
          });
          if (isMatch) {
            colToCertMap[idx] = def;
            break;
          }
        }
      }
    });

    if (nameCol === -1 && (firstNameCol === -1 || lastNameCol === -1)) {
      nameCol = 0; // Default column 0 as Name
    }

    // 3. Load existing Employees and existing Expiring Certs table
    const employeesTable = this.db ? this.db.getTable('employees') : null;
    const empList = employeesTable && employeesTable.rows ? employeesTable.rows : [];
    const empLookup = {};
    empList.forEach(e => {
      const n = String(e['Name'] || e['Employee Name'] || '').toLowerCase().trim();
      if (n) empLookup[n] = e;
    });

    const certsTable = this.db ? this.db.getTable('expiring_certs') : null;
    const existingCertRows = certsTable && certsTable.rows ? certsTable.rows : [];
    
    // Map: "empNameLower_certTypeLower" -> rowObj
    const existingCertMap = {};
    existingCertRows.forEach((r, rIdx) => {
      const eName = String(r['Employee Name'] || r['Name'] || '').toLowerCase().trim();
      const cType = String(r['Item Type'] || r['Cert Type'] || r['Type'] || '').toLowerCase().trim();
      if (eName && cType) {
        existingCertMap[`${eName}_${cType}`] = { row: r, index: rIdx };
      }
    });

    this.mappedData = [];

    // 4. Process each row in Excel
    dataRows.forEach(row => {
      let rawName = '';
      if (nameCol !== -1 && row[nameCol]) {
        rawName = String(row[nameCol]).trim();
      } else if (firstNameCol !== -1 && lastNameCol !== -1) {
        rawName = `${row[firstNameCol]} ${row[lastNameCol]}`.trim();
      }

      if (!rawName) return;

      // Filter out repeat header rows or section dividers
      const rawLower = rawName.toLowerCase();
      if (['name', 'employee', 'location', 'total', 'active', 'inactive', 'subtotal'].includes(rawLower)) return;

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

        const dateStr = this.formatDateStr(cellVal);
        if (!dateStr) return;

        const lookupKey = `${finalEmpName.toLowerCase()}_${certDef.key.toLowerCase()}`;
        const existingEntry = existingCertMap[lookupKey];
        const existingRow = existingEntry ? existingEntry.row : null;

        const currentExpDate = existingRow ? this.formatDateStr(existingRow['Expiration Date'] || '') : '';
        const currentAcqDate = existingRow ? this.formatDateStr(existingRow['Date Acquired'] || '') : '';

        // Determine if change is needed
        let isChange = false;
        let changeOldDate = '';
        let changeNewDate = dateStr;

        if (certDef.nonExpiring) {
          // For non-expiring certs (OSHA, Crane Eval, BNSF, MSHA), compare Date Acquired
          changeOldDate = currentAcqDate;
          if (!currentAcqDate || currentAcqDate !== dateStr) {
            if (this.preserveNewerDates && currentAcqDate) {
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
            if (this.preserveNewerDates && currentExpDate) {
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

    this.renderPreviewScreen();
  }

  formatDateStr(val) {
    if (!val) return '';
    if (val instanceof Date) {
      if (isNaN(val.getTime())) return '';
      const mm = String(val.getMonth() + 1).padStart(2, '0');
      const dd = String(val.getDate()).padStart(2, '0');
      const yyyy = val.getFullYear();
      return `${mm}/${dd}/${yyyy}`;
    }
    const str = String(val).trim();
    if (!str) return '';

    // Handle "Need Copy"
    if (str.toLowerCase().includes('need copy')) return 'Need Copy';

    // Handle MM/DD/YYYY or MM.DD.YYYY
    const slashMatch = str.match(/^(\d{1,2})[\/\.](\d{1,2})[\/\.](\d{2,4})/);
    if (slashMatch) {
      const mm = String(slashMatch[1]).padStart(2, '0');
      const dd = String(slashMatch[2]).padStart(2, '0');
      let yr = slashMatch[3];
      if (yr.length === 2) yr = '20' + yr;
      return `${mm}/${dd}/${yr}`;
    }

    // Handle YYYY-MM-DD
    const dashMatch = str.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (dashMatch) {
      const yyyy = dashMatch[1];
      const mm = String(dashMatch[2]).padStart(2, '0');
      const dd = String(dashMatch[3]).padStart(2, '0');
      return `${mm}/${dd}/${yyyy}`;
    }

    const d = new Date(str);
    if (!isNaN(d.getTime()) && d.getFullYear() > 1990) {
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      const yyyy = d.getFullYear();
      return `${mm}/${dd}/${yyyy}`;
    }

    return str;
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

    let totalUpdatedCerts = 0;
    this.mappedData.forEach(m => { totalUpdatedCerts += Object.keys(m.changes).length; });

    body.innerHTML = `
      <div style="display: flex; flex-direction: column; gap: 14px;">
        <!-- Summary Stats -->
        <div style="background: linear-gradient(135deg, rgba(16, 185, 129, 0.15) 0%, rgba(5, 150, 105, 0.05) 100%); border: 1px solid rgba(16, 185, 129, 0.35); border-radius: 8px; padding: 12px 18px; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 10px;">
          <div>
            <div style="font-size: 14px; font-weight: 800; color: #6ee7b7; display: flex; align-items: center; gap: 8px;">
              <span>✅</span> Ready to Import from <code>${this.escapeHtml(this.fileName)}</code>
            </div>
            <div style="font-size: 12px; color: var(--text-secondary); margin-top: 2px;">
              Found <strong>${this.mappedData.length}</strong> employee(s) with <strong>${totalUpdatedCerts}</strong> new or updated certification date(s).
            </div>
          </div>
          <button class="btn btn-secondary" onclick="window.certsImportEngine.renderUploadView()" style="font-size: 11.5px;">
            📁 Choose Different File
          </button>
        </div>

        <!-- Diff Preview Table -->
        <div style="max-height: 440px; overflow-y: auto; border: 1px solid var(--border-color); border-radius: 8px; background: var(--bg-primary);">
          <table class="data-table" style="width: 100%; border-collapse: collapse; font-size: 12px;">
            <thead>
              <tr style="position: sticky; top: 0; background: #1e293b; z-index: 5; border-bottom: 2px solid #334155;">
                <th style="width: 220px; padding: 10px 12px;">Employee</th>
                <th style="padding: 10px 12px;">Certification Type</th>
                <th style="width: 130px; padding: 10px 12px;">Current Date</th>
                <th style="width: 30px; text-align: center; padding: 10px 4px;">→</th>
                <th style="width: 130px; padding: 10px 12px;">New Date</th>
                <th style="width: 100px; text-align: center; padding: 10px 12px;">Action</th>
              </tr>
            </thead>
            <tbody>
              ${this.mappedData.length === 0 ? `
                <tr><td colspan="6" style="padding: 36px 16px; text-align: center; color: var(--text-muted);">No new date changes detected in this file. All certifications are up to date.</td></tr>
              ` : this.mappedData.map(emp => {
                const changeKeys = Object.keys(emp.changes);
                return changeKeys.map((cKey, idx) => {
                  const ch = emp.changes[cKey];
                  return `
                    <tr style="border-bottom: 1px solid rgba(255,255,255,0.05);">
                      ${idx === 0 ? `<td rowspan="${changeKeys.length}" style="font-weight: 700; color: #f8fafc; border-right: 1px solid var(--border-color); padding: 10px 12px; vertical-align: top;">${this.escapeHtml(emp.employeeName)}</td>` : ''}
                      <td style="font-weight: 600; color: #93c5fd; padding: 10px 12px;">${this.escapeHtml(cKey)}</td>
                      <td style="color: var(--text-muted); font-family: monospace; padding: 10px 12px;">${this.escapeHtml(ch.oldDate || '—')}</td>
                      <td style="text-align: center; color: #34d399; font-weight: bold; padding: 10px 4px;">→</td>
                      <td style="font-weight: 700; color: #34d399; font-family: monospace; padding: 10px 12px;">${this.escapeHtml(ch.newDate)}</td>
                      <td style="text-align: center; padding: 10px 12px;">
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
        <button class="btn btn-primary" onclick="window.certsImportEngine.confirmImport()" style="font-weight: 700; background: linear-gradient(135deg, #10b981 0%, #059669 100%); border: none; display: flex; align-items: center; gap: 6px; box-shadow: 0 2px 8px rgba(16, 185, 129, 0.4);" ${this.mappedData.length === 0 ? 'disabled' : ''}>
          <span>🚀</span> Apply & Save ${totalUpdatedCerts} Cert Updates
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
        const ch = emp.changes[cKey];
        const certDef = ch.certDef;

        // Check if row already exists in table
        let targetRowIdx = certsTable.rows.findIndex(r => {
          const rEmp = String(r['Employee Name'] || r['Name'] || '').toLowerCase().trim();
          const rType = String(r['Item Type'] || r['Cert Type'] || r['Type'] || '').toLowerCase().trim();
          return rEmp === emp.employeeName.toLowerCase().trim() && rType === cKey.toLowerCase().trim();
        });

        if (targetRowIdx !== -1) {
          // 1. UPDATE existing row in expiring_certs
          const row = certsTable.rows[targetRowIdx];
          const sheetRowNumber = targetRowIdx + 2; // Row 1 = Headers

          if (certDef.nonExpiring) {
            const oldVal = row['Date Acquired'] || '';
            row['Date Acquired'] = ch.newDate;
            if (this.db) {
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

            if (this.db) {
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

          if (this.db) {
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

    // Save updated table to IndexedDB
    if (this.db) {
      await this.db.saveTable('expiring_certs', certsTable);
    }

    this.closeImportModal();

    // Refresh active views
    if (window.sheetNavigator && typeof window.sheetNavigator.renderActiveView === 'function') {
      window.sheetNavigator.renderActiveView();
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
window.certsImportEngine = new CertsImportEngine(window.safetyDB || null);
window.CertsImportEngine = CertsImportEngine;
