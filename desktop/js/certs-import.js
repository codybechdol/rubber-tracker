/**
 * certs-import.js - Excel / CSV Expiring Certifications Matrix Importer
 * 
 * Provides interactive file parsing via SheetJS, column auto-mapping,
 * diff comparison, and local database updating with sync queue mutations.
 */

class CertsImportEngine {
  constructor(db) {
    this.db = db;
    this.parsedRows = [];
    this.mappedData = [];
    this.fileName = '';
    this.preserveNewerDates = true;
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
            Upload your company certification spreadsheet (Excel <code>.xlsx</code>, <code>.xls</code> or <code>.csv</code>) to update First Aid, CPR, OSHA, Driver's License, Medical Card, Crane, Forklift, and Rigging records.
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
            <input type="checkbox" id="certs-preserve-newer" checked style="accent-color: #3b82f6;" onchange="window.certsImportEngine.preserveNewerDates = this.checked">
            <div>
              <div style="font-weight: 700;">🔒 Preserve newer expiration dates</div>
              <div style="font-size: 11px; color: var(--text-muted);">If local records already have a newer expiration date than the Excel file, keep the newer date.</div>
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
        
        // Pick first worksheet
        const sheetName = workbook.SheetNames[0];
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
   * Normalizes spreadsheet rows, locates header row and maps cert columns.
   */
  processRawSheetData(rows) {
    if (!rows || rows.length < 2) {
      alert('⚠️ The selected file contains no data rows.');
      return;
    }

    // Find header row (search first 10 rows for 'Name' or 'Employee')
    let headerIdx = -1;
    for (let r = 0; r < Math.min(15, rows.length); r++) {
      const row = rows[r].map(c => String(c || '').toLowerCase().trim());
      if (row.some(c => c === 'name' || c.includes('employee') || c === 'first name' || c === 'last name')) {
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
      // Default standard positional mapping (A=Name, B=Job#, C=Location, D=DL, E=Med, F=1st Aid, G=CPR...)
      headers = ['Name', 'Job Number', 'Location', 'DL', 'Medical Card', '1st Aid', 'CPR', 'Crane Cert', 'Crane Evaluation', 'OSHA 10/30', 'Forklift', 'Rigging'];
      dataRows = rows;
    }

    // Identify column indices
    const colMap = {};
    headers.forEach((h, idx) => {
      const hLow = h.toLowerCase();
      if (hLow.includes('employee') || hLow === 'name' || hLow.includes('full name')) colMap.name = idx;
      else if (hLow.includes('first name')) colMap.firstName = idx;
      else if (hLow.includes('last name')) colMap.lastName = idx;
      else if (hLow.includes('1st aid') || hLow.includes('first aid')) colMap.firstAid = idx;
      else if (hLow.includes('cpr')) colMap.cpr = idx;
      else if (hLow.includes('dl') || hLow.includes('driver')) colMap.dl = idx;
      else if (hLow.includes('med') || hLow.includes('dot')) colMap.med = idx;
      else if (hLow.includes('crane cert')) colMap.craneCert = idx;
      else if (hLow.includes('crane eval')) colMap.craneEval = idx;
      else if (hLow.includes('osha')) colMap.osha = idx;
      else if (hLow.includes('forklift')) colMap.forklift = idx;
      else if (hLow.includes('rigging')) colMap.rigging = idx;
      else if (hLow.includes('harassment')) colMap.harassment = idx;
      else if (hLow.includes('pole top')) colMap.poleTop = idx;
      else if (hLow.includes('dig safe')) colMap.digSafe = idx;
    });

    if (colMap.name === undefined && (colMap.firstName === undefined || colMap.lastName === undefined)) {
      colMap.name = 0; // Default column 0
    }

    // Map existing records from local DB
    const certsTable = this.db.getTable('expiring_certs');
    const existingMap = {};
    if (certsTable && certsTable.rows) {
      certsTable.rows.forEach(r => {
        const name = String(r['Employee Name'] || r['Name'] || '').toLowerCase().trim();
        if (name) existingMap[name] = r;
      });
    }

    this.mappedData = [];

    dataRows.forEach(row => {
      let empName = '';
      if (colMap.name !== undefined && row[colMap.name]) {
        empName = String(row[colMap.name]).trim();
      } else if (colMap.firstName !== undefined && colMap.lastName !== undefined) {
        empName = `${row[colMap.firstName]} ${row[colMap.lastName]}`.trim();
      }

      if (!empName) return;

      const normName = empName.toLowerCase();
      const existing = existingMap[normName] || {};

      // Extract dates
      const certChanges = {};
      const checkDateChange = (key, rawVal) => {
        if (!rawVal) return;
        const formatted = this.formatDateStr(rawVal);
        if (!formatted) return;

        const oldDateStr = existing[key] || '';
        if (this.preserveNewerDates && oldDateStr) {
          const oldD = new Date(oldDateStr);
          const newD = new Date(formatted);
          if (!isNaN(oldD.getTime()) && !isNaN(newD.getTime()) && oldD > newD) {
            return; // Keep existing newer date
          }
        }

        if (oldDateStr !== formatted) {
          certChanges[key] = { oldDate: oldDateStr, newDate: formatted };
        }
      };

      if (colMap.firstAid !== undefined) checkDateChange('1st Aid', row[colMap.firstAid]);
      if (colMap.cpr !== undefined) checkDateChange('CPR', row[colMap.cpr]);
      if (colMap.dl !== undefined) checkDateChange('DL', row[colMap.dl]);
      if (colMap.med !== undefined) checkDateChange('Medical Card', row[colMap.med]);
      if (colMap.craneCert !== undefined) checkDateChange('Crane Cert', row[colMap.craneCert]);
      if (colMap.craneEval !== undefined) checkDateChange('Crane Evaluation', row[colMap.craneEval]);
      if (colMap.osha !== undefined) checkDateChange('OSHA 10/30', row[colMap.osha]);
      if (colMap.forklift !== undefined) checkDateChange('Forklift', row[colMap.forklift]);
      if (colMap.rigging !== undefined) checkDateChange('Rigging & Signaling', row[colMap.rigging]);

      const changeKeys = Object.keys(certChanges);
      if (changeKeys.length > 0) {
        this.mappedData.push({
          employeeName: empName,
          changes: certChanges,
          isNewEmployee: !existingMap[normName],
          existingRecord: existing
        });
      }
    });

    this.renderPreviewScreen();
  }

  formatDateStr(val) {
    if (!val) return '';
    if (val instanceof Date) {
      if (isNaN(val.getTime())) return '';
      const yyyy = val.getFullYear();
      const mm = String(val.getMonth() + 1).padStart(2, '0');
      const dd = String(val.getDate()).padStart(2, '0');
      return `${yyyy}-${mm}-${dd}`;
    }
    const str = String(val).trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(str)) return str.substring(0, 10);
    const d = new Date(str);
    if (!isNaN(d.getTime())) {
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      return `${yyyy}-${mm}-${dd}`;
    }
    return str;
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
              Found <strong>${this.mappedData.length}</strong> employee(s) with <strong>${totalUpdatedCerts}</strong> new or updated certification dates.
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
                <th style="width: 220px;">Employee</th>
                <th>Certification Type</th>
                <th style="width: 120px;">Current Date</th>
                <th style="width: 40px; text-align: center;">→</th>
                <th style="width: 130px;">New Date</th>
                <th style="width: 90px; text-align: center;">Action</th>
              </tr>
            </thead>
            <tbody>
              ${this.mappedData.length === 0 ? `
                <tr><td colspan="6" style="padding: 32px 16px; text-align: center; color: var(--text-muted);">No new date changes detected in this file.</td></tr>
              ` : this.mappedData.map(emp => {
                const changeKeys = Object.keys(emp.changes);
                return changeKeys.map((cKey, idx) => {
                  const ch = emp.changes[cKey];
                  return `
                    <tr>
                      ${idx === 0 ? `<td rowspan="${changeKeys.length}" style="font-weight: 700; color: #f8fafc; border-right: 1px solid var(--border-color);">${this.escapeHtml(emp.employeeName)}</td>` : ''}
                      <td style="font-weight: 600; color: #93c5fd;">${this.escapeHtml(cKey)}</td>
                      <td style="color: var(--text-muted); font-family: monospace;">${this.escapeHtml(ch.oldDate || '—')}</td>
                      <td style="text-align: center; color: #34d399; font-weight: bold;">→</td>
                      <td style="font-weight: 700; color: #34d399; font-family: monospace;">${this.escapeHtml(ch.newDate)}</td>
                      <td style="text-align: center;">
                        <span class="badge" style="background: rgba(16, 185, 129, 0.2); color: #6ee7b7; border: 1px solid rgba(16, 185, 129, 0.4); font-size: 10.5px;">
                          ${ch.oldDate ? '🔄 Update' : '✨ New'}
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
          <span>🚀</span> Apply & Sync ${totalUpdatedCerts} Cert Updates
        </button>
      `;
    }
  }

  /**
   * Applies changes to local database and queues outbox mutations for cloud sync.
   */
  async confirmImport() {
    if (this.mappedData.length === 0) return;

    let certsTable = this.db.getTable('expiring_certs');
    if (!certsTable) {
      certsTable = { name: 'Expiring Certs', headers: ['Employee Name', '1st Aid', 'CPR', 'DL', 'Medical Card', 'Crane Cert', 'Crane Evaluation', 'OSHA 10/30', 'Forklift', 'Rigging & Signaling'], rows: [] };
    }

    let appliedCount = 0;

    this.mappedData.forEach(item => {
      let row = certsTable.rows.find(r => String(r['Employee Name'] || r['Name'] || '').toLowerCase().trim() === item.employeeName.toLowerCase().trim());
      if (!row) {
        row = { 'Employee Name': item.employeeName };
        certsTable.rows.push(row);
      }

      Object.keys(item.changes).forEach(cKey => {
        row[cKey] = item.changes[cKey].newDate;
        appliedCount++;
      });
    });

    // Save updated table locally
    this.db.saveTable('expiring_certs', certsTable);

    // Queue mutation for two-way sync
    if (window.syncEngine) {
      window.syncEngine.queueMutation({
        type: 'UPDATE_TABLE',
        sheet: 'Expiring Certs',
        data: certsTable.rows,
        timestamp: Date.now()
      });
    }

    this.closeImportModal();

    // Refresh views
    if (window.sheetNavigator) {
      window.sheetNavigator.renderExpiringCerts();
    }

    alert(`🎉 Successfully imported ${appliedCount} certification updates!\n\nChanges have been saved locally and will synchronize with Google Sheets.`);
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
window.CertsImportEngine = CertsImportEngine;
