/**
 * certs-config.js - Certification Requirements & Role Matrix Manager
 * 
 * Provides interactive configuration of certification expectations per job classification,
 * dynamic "Add New Certification" management, persistence to local database/storage,
 * and automatic synchronization with the expiring_certs matrix and Excel import engine.
 */

class CertsConfigEngine {
  constructor(db) {
    this.db = db;
    this.storageKey = 'EXPIRING_CERTS_CONFIG';

    // Standard available job classifications for role selection
    this.jobRoleGroups = [
      {
        groupName: 'Foremen & Leadership',
        roles: [
          { id: 'F', label: 'Foreman (F)' },
          { id: 'GF', label: 'General Foreman (GF)' },
          { id: 'SUP', label: 'Supervisor (SUP)' },
          { id: 'GTO F', label: 'GTO Foreman (GTO F)' }
        ]
      },
      {
        groupName: 'Journeymen & Linemen',
        roles: [
          { id: 'JRY', label: 'Journeyman Lineman (JRY)' },
          { id: 'WT', label: 'White Ticket (WT)' }
        ]
      },
      {
        groupName: 'Equipment Operators',
        roles: [
          { id: 'JRY OP', label: 'Journeyman Operator (JRY OP)' },
          { id: 'OP', label: 'Operator (OP)' },
          { id: 'EO 1', label: 'Equipment Operator 1 (EO 1)' },
          { id: 'EO 2', label: 'Equipment Operator 2 (EO 2)' },
          { id: 'GTO', label: 'General Trade Operator (GTO)' }
        ]
      },
      {
        groupName: 'Apprentices & Substation Techs',
        roles: [
          { id: 'AP 1-7', label: 'Apprentices (AP 1 – AP 7)' },
          { id: 'ST 1-7', label: 'Sub Techs (ST 1 – ST 7)' }
        ]
      }
    ];

    // Default canonical certification definitions
    this.defaultCerts = [
      { key: '1st Aid', name: '1st Aid', label: '1st Aid / First Aid', termMonths: 24, requirementScope: 'all', requiredJobClasses: [], isIssuedDate: false, custom: false },
      { key: 'CPR', name: 'CPR', label: 'CPR / AED', termMonths: 24, requirementScope: 'all', requiredJobClasses: [], isIssuedDate: false, custom: false },
      { key: 'DL', name: 'DL', label: "Driver's License (DL)", termMonths: 0, requirementScope: 'all', requiredJobClasses: [], isIssuedDate: false, custom: false },
      { key: 'MEC Expiration', name: 'MEC Expiration', label: 'MEC Expiration (Medical Card)', termMonths: 24, requirementScope: 'all', requiredJobClasses: [], isIssuedDate: false, custom: false },
      { key: 'Harassment Training', name: 'Harassment Training', label: 'Harassment Training', termMonths: 12, requirementScope: 'all', requiredJobClasses: [], isIssuedDate: false, custom: false },
      { key: 'Pole Top Rescue', name: 'Pole Top Rescue', label: 'Pole Top Rescue', termMonths: 12, requirementScope: 'job_class', requiredJobClasses: ['F', 'GF', 'SUP', 'GTO F', 'JRY', 'WT', 'GTO', 'AP 1-7', 'ST 1-7'], isIssuedDate: false, custom: false },
      { key: 'OSHA 1910', name: 'OSHA 1910', label: 'OSHA 1910 / 10 / 30', termMonths: 0, requirementScope: 'all', requiredJobClasses: [], isIssuedDate: true, custom: false },
      { key: 'OSHA Trench Comp Person', name: 'OSHA Trench Comp Person', label: 'OSHA Trench Competent Person', termMonths: 36, requirementScope: 'job_class', requiredJobClasses: ['F', 'GF', 'SUP', 'GTO F'], isIssuedDate: true, custom: false },
      { key: 'Crane Cert', name: 'Crane Cert', label: 'Crane Certification', termMonths: 60, requirementScope: 'job_class', requiredJobClasses: ['F', 'GF', 'SUP', 'JRY OP', 'OP', 'EO 1', 'EO 2'], isIssuedDate: false, custom: false },
      { key: 'Crane Evaluation', name: 'Crane Evaluation', label: 'Crane Evaluation', termMonths: 0, requirementScope: 'job_class', requiredJobClasses: ['F', 'GF', 'SUP', 'JRY OP', 'OP', 'EO 1', 'EO 2'], isIssuedDate: true, custom: false },
      { key: 'Forklift', name: 'Forklift', label: 'Forklift Certification', termMonths: 36, requirementScope: 'job_class', requiredJobClasses: ['F', 'GF', 'SUP', 'JRY OP', 'OP', 'EO 1', 'EO 2', 'WT'], isIssuedDate: false, custom: false },
      { key: 'Forklift Operator Safety Training', name: 'Forklift Operator Safety Training', label: 'Forklift Operator Safety Training', termMonths: 36, requirementScope: 'job_class', requiredJobClasses: ['F', 'GF', 'SUP', 'JRY OP', 'OP', 'EO 1', 'EO 2', 'WT'], isIssuedDate: true, custom: false },
      { key: 'Rigging & Signaling/Signalperson & Spotter Cert', name: 'Rigging & Signaling/Signalperson & Spotter Cert', label: 'Rigging & Signaling / Signalperson', termMonths: 36, requirementScope: 'job_class', requiredJobClasses: ['F', 'GF', 'SUP', 'JRY', 'JRY OP'], isIssuedDate: false, custom: false },
      { key: 'Dig Safe', name: 'Dig Safe', label: 'Dig Safe (811)', termMonths: 24, requirementScope: 'job_class', requiredJobClasses: ['F', 'GF', 'SUP', 'JRY', 'EO 1', 'EO 2'], isIssuedDate: false, custom: false },
      { key: 'BNSF', name: 'BNSF', label: 'BNSF Rail Safety', termMonths: 0, requirementScope: 'optional', requiredJobClasses: [], isIssuedDate: true, custom: false },
      { key: 'MSHA', name: 'MSHA', label: 'MSHA Mine Safety', termMonths: 0, requirementScope: 'optional', requiredJobClasses: [], isIssuedDate: true, custom: false },
      { key: 'EICA Basic Helicopter Line Construction Safety', name: 'EICA Basic Helicopter Line Construction Safety', label: 'EICA Helicopter Safety', termMonths: 0, requirementScope: 'optional', requiredJobClasses: [], isIssuedDate: true, custom: false }
    ];

    this.certs = this.loadConfig();
  }

  /**
   * Loads saved certification rules from localStorage or returns defaults.
   */
  loadConfig() {
    try {
      const raw = localStorage.getItem(this.storageKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          // Merge with defaults to guarantee all standard certs exist
          const merged = [...parsed];
          const existingKeys = new Set(merged.map(c => String(c.key || c.name || '').toLowerCase().trim()));
          this.defaultCerts.forEach(dc => {
            if (!existingKeys.has(dc.key.toLowerCase())) {
              merged.push(dc);
            }
          });
          return merged;
        }
      }
    } catch (e) {
      console.warn('Could not parse saved certs config:', e);
    }
    return JSON.parse(JSON.stringify(this.defaultCerts));
  }

  /**
   * Saves certification rules to localStorage and syncs with Google Apps Script properties.
   */
  saveConfig() {
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(this.certs));
      console.log('Saved certification requirements config locally.');
    } catch (e) {
      console.error('Error saving certs config:', e);
    }
  }

  /**
   * Returns a key-value dictionary for the Excel Importer and matrix lookup.
   */
  getCertDefinitions() {
    const dict = {};
    this.certs.forEach(c => {
      const key = c.key || c.name;
      dict[key] = {
        key: key,
        label: c.label || key,
        nonExpiring: c.isIssuedDate || c.termMonths === 0,
        isIssuedDate: !!c.isIssuedDate,
        termMonths: c.termMonths || 0,
        requirementScope: c.requirementScope || 'all',
        requiredJobClasses: Array.isArray(c.requiredJobClasses) ? c.requiredJobClasses : []
      };
    });
    return dict;
  }

  /**
   * Checks whether a specific employee (given their job classification) requires a certification.
   */
  isCertRequiredForEmployee(certKey, jobClass) {
    const cert = this.certs.find(c => (c.key || c.name).toLowerCase() === String(certKey).toLowerCase());
    if (!cert) return false;

    if (cert.requirementScope === 'all') return true;
    if (cert.requirementScope === 'optional') return false;

    if (cert.requirementScope === 'job_class') {
      if (!jobClass) return false;
      const normalizedClass = String(jobClass).toUpperCase().trim();
      const requiredList = (cert.requiredJobClasses || []).map(r => String(r).toUpperCase().trim());

      // Check direct match or apprentice/subtech ranges
      for (let req of requiredList) {
        if (req === normalizedClass) return true;
        if (req === 'AP 1-7' && (normalizedClass.startsWith('AP') || normalizedClass.startsWith('APP'))) return true;
        if (req === 'ST 1-7' && (normalizedClass.startsWith('ST') || normalizedClass.startsWith('SUB'))) return true;
      }
    }
    return false;
  }

  /**
   * Opens the Configuration Modal.
   */
  openConfigModal() {
    const modal = document.getElementById('certs-config-modal');
    if (!modal) return;

    this.renderConfigModal();
    modal.style.display = 'flex';
  }

  /**
   * Closes the Configuration Modal.
   */
  closeConfigModal() {
    const modal = document.getElementById('certs-config-modal');
    if (modal) modal.style.display = 'none';
  }

  /**
   * Renders the full interactive configuration modal.
   */
  renderConfigModal() {
    const container = document.getElementById('certs-config-modal-body');
    if (!container) return;

    let html = `
      <div style="display: flex; flex-direction: column; gap: 16px;">
        <!-- Banner & Quick Action Buttons -->
        <div style="display: flex; justify-content: space-between; align-items: center; background: linear-gradient(135deg, rgba(59, 130, 246, 0.12) 0%, rgba(37, 99, 235, 0.05) 100%); border: 1px solid rgba(59, 130, 246, 0.3); border-radius: 8px; padding: 14px 18px;">
          <div>
            <div style="font-size: 14px; font-weight: 700; color: #93c5fd; margin-bottom: 2px;">
              ⚙️ Certification Requirements & Job Role Matrix
            </div>
            <div style="font-size: 11.5px; color: var(--text-secondary);">
              Configure which job classifications require each certification, set validity terms, or add custom certs.
            </div>
          </div>
          <div style="display: flex; gap: 8px;">
            <button class="btn btn-primary" onclick="window.certsConfigEngine.openAddCertModal()" style="font-size: 12px; font-weight: 700; background: #2563eb; display: flex; align-items: center; gap: 6px; padding: 6px 14px;">
              <span>➕</span> Add New Cert
            </button>
            <button class="btn btn-secondary" onclick="window.certsConfigEngine.applyRequirementsToMatrix(true)" style="font-size: 12px; font-weight: 600; border-color: #10b981; color: #34d399; display: flex; align-items: center; gap: 6px; padding: 6px 14px;" title="Scan active roster and add any missing required certification rows">
              <span>⚡</span> Apply to Matrix
            </button>
          </div>
        </div>

        <!-- Certifications List Cards -->
        <div style="display: flex; flex-direction: column; gap: 12px; max-height: 58vh; overflow-y: auto; padding-right: 4px;">
    `;

    this.certs.forEach((cert, idx) => {
      const isCustom = !!cert.custom;
      const scope = cert.requirementScope || 'all';
      const termMonths = cert.termMonths !== undefined ? cert.termMonths : 12;
      const isIssueDate = !!cert.isIssuedDate;

      html += `
        <div style="background: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: 8px; padding: 14px 16px; display: flex; flex-direction: column; gap: 10px;">
          <!-- Card Header -->
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <div style="display: flex; align-items: center; gap: 10px;">
              <span style="font-size: 18px;">📜</span>
              <div>
                <span style="font-size: 13.5px; font-weight: 700; color: #f8fafc;">${this.escapeHtml(cert.label || cert.name)}</span>
                ${isCustom ? '<span style="font-size: 10px; background: rgba(168, 85, 247, 0.2); color: #c084fc; border: 1px solid rgba(168, 85, 247, 0.4); padding: 1px 6px; border-radius: 4px; margin-left: 6px; font-weight: 700;">CUSTOM</span>' : ''}
                <div style="font-size: 11px; color: var(--text-muted); font-family: monospace;">Sheet Key: "${this.escapeHtml(cert.key || cert.name)}"</div>
              </div>
            </div>

            <div style="display: flex; align-items: center; gap: 12px;">
              <!-- Expiration Term Select -->
              <div style="display: flex; align-items: center; gap: 6px;">
                <label style="font-size: 11px; color: var(--text-muted); font-weight: 600;">Validity:</label>
                <select class="form-select" style="font-size: 11.5px; padding: 4px 8px; background: var(--bg-primary); border: 1px solid var(--border-color); border-radius: 6px; color: #fff;" onchange="window.certsConfigEngine.updateCertField(${idx}, 'termMonths', this.value)">
                  <option value="12" ${termMonths === 12 && !isIssueDate ? 'selected' : ''}>1 Year (12 mo)</option>
                  <option value="24" ${termMonths === 24 && !isIssueDate ? 'selected' : ''}>2 Years (24 mo)</option>
                  <option value="36" ${termMonths === 36 && !isIssueDate ? 'selected' : ''}>3 Years (36 mo)</option>
                  <option value="60" ${termMonths === 60 && !isIssueDate ? 'selected' : ''}>5 Years (60 mo)</option>
                  <option value="0" ${isIssueDate || termMonths === 0 ? 'selected' : ''}>Non-Expiring (Issue Date)</option>
                </select>
              </div>

              <!-- Scope Select -->
              <div style="display: flex; align-items: center; gap: 6px;">
                <label style="font-size: 11px; color: var(--text-muted); font-weight: 600;">Required For:</label>
                <select class="form-select" style="font-size: 11.5px; padding: 4px 8px; background: var(--bg-primary); border: 1px solid var(--border-color); border-radius: 6px; color: #fff;" onchange="window.certsConfigEngine.updateCertScope(${idx}, this.value)">
                  <option value="all" ${scope === 'all' ? 'selected' : ''}>👥 All Active Employees</option>
                  <option value="job_class" ${scope === 'job_class' ? 'selected' : ''}>👷 Specific Job Roles</option>
                  <option value="optional" ${scope === 'optional' ? 'selected' : ''}>⭐ Optional / As-Acquired</option>
                </select>
              </div>

              ${isCustom ? `
                <button class="btn btn-secondary" style="color: #f87171; padding: 4px 8px; font-size: 11px;" onclick="window.certsConfigEngine.deleteCustomCert(${idx})" title="Delete Custom Certification">🗑️</button>
              ` : ''}
            </div>
          </div>

          <!-- Role Checkboxes (Only shown if scope === 'job_class') -->
          ${scope === 'job_class' ? `
            <div style="background: rgba(15, 23, 42, 0.6); border: 1px dashed rgba(59, 130, 246, 0.4); border-radius: 6px; padding: 10px 14px; margin-top: 4px;">
              <div style="font-size: 11px; font-weight: 700; color: #93c5fd; margin-bottom: 8px;">
                Select Required Job Classifications:
              </div>
              <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 10px;">
                ${this.renderRoleCheckboxes(idx, cert.requiredJobClasses || [])}
              </div>
            </div>
          ` : ''}
        </div>
      `;
    });

    html += `
        </div>
      </div>
    `;

    container.innerHTML = html;
  }

  /**
   * Helper to render role checkboxes grouped logically.
   */
  renderRoleCheckboxes(certIdx, selectedRoles) {
    const selectedSet = new Set(selectedRoles.map(r => String(r).toUpperCase().trim()));

    return this.jobRoleGroups.map(group => {
      const checks = group.roles.map(r => {
        const isChecked = selectedSet.has(r.id.toUpperCase());
        return `
          <label style="display: flex; align-items: center; gap: 6px; font-size: 11px; color: var(--text-secondary); cursor: pointer;">
            <input type="checkbox" ${isChecked ? 'checked' : ''} style="accent-color: #3b82f6;" onchange="window.certsConfigEngine.toggleRoleRequirement(${certIdx}, '${r.id}', this.checked)" />
            <span>${r.label}</span>
          </label>
        `;
      }).join('');

      return `
        <div style="display: flex; flex-direction: column; gap: 4px;">
          <div style="font-size: 10.5px; font-weight: 700; color: #cbd5e1; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 1px solid rgba(255,255,255,0.06); padding-bottom: 2px;">
            ${group.groupName}
          </div>
          ${checks}
        </div>
      `;
    }).join('');
  }

  /**
   * Updates a certification's requirement scope.
   */
  updateCertScope(idx, newScope) {
    if (this.certs[idx]) {
      this.certs[idx].requirementScope = newScope;
      if (newScope === 'job_class' && (!Array.isArray(this.certs[idx].requiredJobClasses) || this.certs[idx].requiredJobClasses.length === 0)) {
        // Default to Foremen & Journeymen if empty
        this.certs[idx].requiredJobClasses = ['F', 'GF', 'SUP', 'JRY'];
      }
      this.saveConfig();
      this.renderConfigModal();
    }
  }

  /**
   * Updates validity or non-expiring property.
   */
  updateCertField(idx, field, value) {
    if (this.certs[idx]) {
      const numVal = parseInt(value, 10);
      if (field === 'termMonths') {
        this.certs[idx].termMonths = numVal;
        this.certs[idx].isIssuedDate = (numVal === 0);
      } else {
        this.certs[idx][field] = value;
      }
      this.saveConfig();
      this.renderConfigModal();
    }
  }

  /**
   * Toggles role checkbox requirement for a cert.
   */
  toggleRoleRequirement(certIdx, roleId, isChecked) {
    const cert = this.certs[certIdx];
    if (!cert) return;

    if (!Array.isArray(cert.requiredJobClasses)) cert.requiredJobClasses = [];
    const rUpper = roleId.toUpperCase().trim();

    if (isChecked) {
      if (!cert.requiredJobClasses.some(r => r.toUpperCase().trim() === rUpper)) {
        cert.requiredJobClasses.push(roleId);
      }
    } else {
      cert.requiredJobClasses = cert.requiredJobClasses.filter(r => r.toUpperCase().trim() !== rUpper);
    }

    this.saveConfig();
  }

  /**
   * Opens the "Add New Certification" modal.
   */
  openAddCertModal() {
    const modal = document.getElementById('add-cert-modal');
    if (!modal) return;

    document.getElementById('new-cert-name').value = '';
    document.getElementById('new-cert-label').value = '';
    document.getElementById('new-cert-term').value = '12';
    document.getElementById('new-cert-scope').value = 'all';

    modal.style.display = 'flex';
  }

  /**
   * Closes the "Add New Certification" modal.
   */
  closeAddCertModal() {
    const modal = document.getElementById('add-cert-modal');
    if (modal) modal.style.display = 'none';
  }

  /**
   * Submits and creates a new custom certification.
   */
  submitNewCert() {
    const nameInput = document.getElementById('new-cert-name');
    const labelInput = document.getElementById('new-cert-label');
    const termInput = document.getElementById('new-cert-term');
    const scopeInput = document.getElementById('new-cert-scope');

    const name = (nameInput.value || '').trim();
    const label = (labelInput.value || name).trim();
    const termMonths = parseInt(termInput.value, 10) || 0;
    const scope = scopeInput.value || 'all';

    if (!name) {
      alert('Please enter a certification name.');
      return;
    }

    // Check duplicate
    const exists = this.certs.some(c => (c.key || c.name).toLowerCase() === name.toLowerCase());
    if (exists) {
      alert(`A certification named "${name}" already exists!`);
      return;
    }

    const newCertObj = {
      key: name,
      name: name,
      label: label,
      termMonths: termMonths,
      requirementScope: scope,
      requiredJobClasses: scope === 'job_class' ? ['F', 'GF', 'SUP', 'JRY'] : [],
      isIssuedDate: (termMonths === 0),
      custom: true
    };

    this.certs.push(newCertObj);
    this.saveConfig();
    this.closeAddCertModal();
    this.renderConfigModal();

    // Re-apply to matrix immediately
    this.applyRequirementsToMatrix(false);
    alert(`✅ "${name}" added successfully!`);
  }

  /**
   * Deletes a custom certification.
   */
  deleteCustomCert(idx) {
    const cert = this.certs[idx];
    if (!cert || !cert.custom) return;

    if (confirm(`Are you sure you want to delete the custom certification "${cert.label || cert.name}"?`)) {
      this.certs.splice(idx, 1);
      this.saveConfig();
      this.renderConfigModal();
    }
  }

  /**
   * Scans active employees against configured certification requirements and creates any missing matrix rows.
   */
  async applyRequirementsToMatrix(showAlert = true) {
    const empTable = this.db.getTable('employees');
    const certTable = this.db.getTable('expiring_certs');
    if (!empTable || !certTable) return;

    const activeEmployees = (empTable.rows || []).filter(e => {
      const name = String(e['Employee Name'] || e['Name'] || Object.values(e)[0] || '').trim();
      const loc = String(e['Location'] || '').trim().toLowerCase();
      const status = String(e['Status'] || '').trim().toLowerCase();
      const job = String(e['Job Number'] || e['Job #'] || '').trim().toLowerCase();
      return name && loc !== 'previous employee' && !loc.includes('previous') &&
             status !== 'previous employee' && !status.includes('inactive') && !status.includes('terminated') &&
             !name.toLowerCase().includes('former') && !job.startsWith('002-') && !job.includes('previous');
    });

    // Ensure certTable headers exist
    if (!certTable.headers || certTable.headers.length === 0) {
      certTable.headers = ['Employee Name', 'Item Type', 'Date Acquired', 'Expiration Date', 'Location', 'Job #', 'Days Until Expiration', 'Status', 'SMS'];
    }
    if (!certTable.rows) certTable.rows = [];
    if (!certTable.rawGrid) certTable.rawGrid = [certTable.headers];

    // Build existing employee|cert map
    const existingMap = new Set();
    (certTable.rows || []).forEach(r => {
      const eName = String(r['Employee Name'] || r['Name'] || Object.values(r)[0] || '').trim().toLowerCase();
      const cType = String(r['Item Type'] || r['Certification'] || r['Cert Type'] || '').trim().toLowerCase();
      if (eName && cType) {
        existingMap.add(`${eName}|${cType}`);
      }
    });

    const newRowsToAdd = [];

    for (let emp of activeEmployees) {
      const empName = String(emp['Employee Name'] || emp['Name'] || Object.values(emp)[0] || '').trim();
      const empLoc = String(emp['Location'] || 'Helena').trim();
      const empJob = String(emp['Job Number'] || emp['Job #'] || '').trim();
      const jobClass = String(emp['Job Classification'] || emp['Classification'] || emp['Role'] || '').trim();

      for (let cert of this.certs) {
        const certKey = cert.key || cert.name;
        const lookupKey = `${empName.toLowerCase()}|${certKey.toLowerCase()}`;

        // If required and not yet in matrix, add row!
        if (!existingMap.has(lookupKey)) {
          const isRequired = this.isCertRequiredForEmployee(certKey, jobClass);
          if (isRequired) {
            const isNonExp = cert.isIssuedDate || cert.termMonths === 0;
            const newRow = {
              'Employee Name': empName,
              'Item Type': certKey,
              'Date Acquired': '',
              'Expiration Date': '',
              'Location': empLoc,
              'Job #': empJob,
              'Days Until Expiration': isNonExp ? '' : 'MISSING',
              'Status': isNonExp ? 'OK' : 'MISSING',
              'SMS': ''
            };
            newRowsToAdd.push(newRow);
            existingMap.add(lookupKey);
          }
        }
      }
    }

    if (newRowsToAdd.length > 0) {
      console.log(`Adding ${newRowsToAdd.length} missing required cert rows to local database...`);
      for (let newRow of newRowsToAdd) {
        certTable.rows.push(newRow);
        if (certTable.rawGrid && certTable.headers) {
          const gridArr = certTable.headers.map(h => newRow[h] !== undefined ? newRow[h] : '');
          certTable.rawGrid.push(gridArr);
          certTable.maxRows = certTable.rawGrid.length;
        }
        // Queue for sync to Google Sheets
        if (this.db && typeof this.db.addMutation === 'function') {
          await this.db.addMutation({
            action: 'ADD_ROW',
            sheetName: 'Expiring Certs',
            tableKey: 'expiring_certs',
            rowData: newRow
          });
        }
      }
      certTable.rowCount = certTable.rows.length;
      if (typeof this.db.setSnapshot === 'function' && this.db.snapshot) {
        await this.db.setSnapshot(this.db.snapshot);
      }
      if (window.sheetNavigator && (window.sheetNavigator.currentSheetKey === 'expiring_certs' || document.getElementById('expiring-certs-view')?.classList.contains('active'))) {
        window.sheetNavigator.renderExpiringCerts();
      }
    }

    if (showAlert) {
      alert(`✅ Certification Requirements Applied!\n\n• ${newRowsToAdd.length} missing required rows created across ${activeEmployees.length} active employees.\n• All requirements are now up to date.`);
    }
  }

  escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
}

// Global initialization
window.certsConfigEngine = new CertsConfigEngine(window.db || { getTable: () => null, saveTable: () => null });
