/**
 * employee-profile.js - Comprehensive Employee Profile, Assignments & Certifications Dossier Engine
 */

class EmployeeProfileEngine {
  constructor(db) {
    this.db = db;
    this.currentActiveTab = 'equipment'; // 'equipment' | 'certs' | 'history'
    this.currentEmployeeData = null;
  }

  init() {
    // Escape key closes modal
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        this.closeProfileModal();
      }
    });
  }

  /**
   * Flexible name normalization
   */
  normalizeName(name) {
    if (!name) return '';
    return String(name).toLowerCase().replace(/[^a-z0-9]/g, ' ').replace(/\s+/g, ' ').trim();
  }

  /**
   * Matches employee name across different formats (e.g. "Darrell Swann" vs "Swann, Darrell" vs "Darrell Swann (Bozeman)")
   */
  isNameMatch(nameA, nameB) {
    if (!nameA || !nameB) return false;
    const normA = this.normalizeName(nameA);
    const normB = this.normalizeName(nameB);
    if (!normA || !normB) return false;

    if (normA === normB) return true;

    // Remove parenthesized status/city if present
    const cleanA = this.normalizeName(String(nameA).replace(/\(.*?\)/g, ''));
    const cleanB = this.normalizeName(String(nameB).replace(/\(.*?\)/g, ''));
    if (cleanA === cleanB) return true;

    // Check reversed "Last First" vs "First Last"
    const partsA = cleanA.split(' ').filter(Boolean);
    const partsB = cleanB.split(' ').filter(Boolean);

    if (partsA.length >= 2 && partsB.length >= 2) {
      if (partsA[0] === partsB[partsB.length - 1] && partsA[partsA.length - 1] === partsB[0]) return true;
      if (partsA.join(' ') === partsB.reverse().join(' ')) return true;
    }

    // Check containment if length is sufficient
    if (cleanA.length > 5 && cleanB.length > 5) {
      if (cleanA.includes(cleanB) || cleanB.includes(cleanA)) return true;
    }

    return false;
  }

  /**
   * Opens the Employee Profile & Certifications Modal
   */
  openProfileModal(employeeName) {
    const modal = document.getElementById('employee-profile-modal');
    const body = document.getElementById('employee-profile-modal-body');
    const titleEl = document.getElementById('employee-profile-modal-title');
    if (!modal || !body) return;

    const snap = this.db.getSnapshot();
    if (!snap || !snap.tables) return;

    const rawEmpName = String(employeeName || '').trim();
    if (!rawEmpName) return;

    // 1. Locate Employee Record in Employees table
    const empTable = snap.tables['employees'];
    let empRow = null;
    if (empTable && empTable.rows) {
      empRow = empTable.rows.find(r => {
        const rName = r['Name'] || r['Employee Name'] || r['Employee'] || '';
        return this.isNameMatch(rName, rawEmpName);
      });
    }

    const displayName = empRow ? (empRow['Name'] || empRow['Employee Name'] || rawEmpName) : rawEmpName;
    const location = empRow ? (empRow['Location'] || 'Unknown') : 'Unknown';
    const jobNumber = empRow ? (empRow['Job Number'] || empRow['Job #'] || 'N/A') : 'N/A';
    const secondaryJob = empRow ? (empRow['Secondary Job Number'] || '') : '';
    const role = empRow ? (empRow['Job Classification'] || empRow['Classification'] || 'Lineman') : 'Lineman';
    const phone = empRow ? (empRow['Phone Number'] || empRow['Phone'] || 'N/A') : 'N/A';
    const email = empRow ? (empRow['Email Address'] || empRow['Email'] || '') : '';
    const mpEmail = empRow ? (empRow['MP Email'] || '') : '';
    const notifEmail = empRow ? (empRow['Notification Emails'] || '') : '';

    // 2. Scan ALL equipment sheets for items currently assigned to this employee
    const equipmentSheets = [
      { key: 'gloves', title: 'Rubber Gloves', icon: '🧤', histKey: 'gloves_history' },
      { key: 'sleeves', title: 'Rubber Sleeves', icon: '🦾', histKey: 'sleeves_history' },
      { key: 'blankets', title: 'Rubber Blankets', icon: '🔲', histKey: 'blankets_history' },
      { key: 'macks', title: 'MACKs (Equipotential)', icon: '🧱', histKey: 'macks_history' },
      { key: 'hv_testers', title: 'HV Testers', icon: '⚡', histKey: 'hv_testers_history' },
      { key: 'phasing_sets', title: 'Phasing Sets', icon: '⚡', histKey: 'phasing_sets_history' },
      { key: 'aed', title: 'AED Units', icon: '🏥', histKey: 'aed_history' },
      { key: 'grounds', title: 'Grounds', icon: '⚡', histKey: 'grounds_history' },
      { key: 'hot_sticks', title: 'Hot Sticks', icon: '🔴', histKey: 'hot_sticks_history' }
    ];

    const assignedEquipment = [];

    equipmentSheets.forEach(eq => {
      const t = snap.tables[eq.key];
      if (t && t.rows) {
        t.rows.forEach(item => {
          const assignedTo = String(item['Assigned To'] || item['Assigned'] || item['Holder'] || '').trim();
          if (this.isNameMatch(assignedTo, displayName)) {
            const itemNum = String(item['Item #'] || item['Glove'] || item['Sleeve'] || item['Blanket'] || item['Serial #'] || item['ESL ID'] || Object.values(item)[0] || 'N/A').trim();
            const eslId = String(item['ESL ID'] || '').trim();
            const size = String(item['Size'] || '').trim();
            const classVal = String(item['Class'] || '').trim();
            const kv = String(item['KV'] || '').trim();
            const type = String(item['Type'] || item['Model'] || '').trim();
            const length = String(item['Length'] || '').trim();
            const dateAssigned = String(item['Date Assigned'] || item['Date'] || 'N/A').trim();
            const changeOutDate = String(item['Change Out Date'] || item['Changeout Date'] || item['Pad Expiration'] || 'N/A').trim();
            const testDate = String(item['Test Date'] || item['Calibration Date'] || 'N/A').trim();
            const status = String(item['Status'] || 'Assigned').trim();
            const itemLoc = String(item['Location'] || location).trim();

            let specs = [];
            if (size) specs.push(`Size: ${size}`);
            if (classVal) specs.push(`Class: ${classVal}`);
            if (kv) specs.push(`KV: ${kv}`);
            if (type) specs.push(`Type: ${type}`);
            if (length) specs.push(`Len: ${length}`);

            assignedEquipment.push({
              eqType: eq.title,
              eqIcon: eq.icon,
              eqKey: eq.key,
              histKey: eq.histKey,
              itemNum: itemNum,
              eslId: eslId,
              specs: specs.join(' · ') || 'Standard',
              dateAssigned: dateAssigned,
              changeOutDate: changeOutDate,
              testDate: testDate,
              status: status,
              location: itemLoc
            });
          }
        });
      }
    });

    // 3. Scan Expiring Certs table for this employee
    const certsTable = snap.tables['expiring_certs'];
    const certifications = [];
    if (certsTable && certsTable.rows) {
      certsTable.rows.forEach(c => {
        const cEmp = String(c['Employee'] || c['Name'] || c['Employee Name'] || '').trim();
        if (this.isNameMatch(cEmp, displayName)) {
          const certType = String(c['Cert Type'] || c['Type'] || c['Certification'] || 'General Cert').trim();
          const expDate = String(c['Expiration Date'] || c['Expiration'] || c['Change Out Date'] || 'N/A').trim();
          const testDate = String(c['Test Date'] || c['Date'] || 'N/A').trim();
          const daysLeftStr = String(c['Days Left'] || c['Days'] || '').trim();
          const daysLeft = parseFloat(daysLeftStr);
          const status = String(c['Status'] || 'OK').trim();
          const smsStatus = String(c['SMS Sent'] || c['SMS'] || '').trim();
          const notes = String(c['Notes'] || '').trim();

          certifications.push({
            certType: certType,
            expDate: expDate,
            testDate: testDate,
            daysLeft: isNaN(daysLeft) ? null : daysLeft,
            status: status,
            smsStatus: smsStatus,
            notes: notes
          });
        }
      });
    }

    // 4. Scan Training Tracking for this employee / crew
    const trainingTable = snap.tables['training_tracking'];
    const trainingList = [];
    if (trainingTable && trainingTable.rows) {
      trainingTable.rows.forEach(tr => {
        const lead = String(tr['Lead'] || tr['Crew Lead'] || tr['Foreman'] || '').trim();
        const crew = String(tr['Crew'] || tr['Job #'] || tr['Job Number'] || '').trim();
        const attendees = String(tr['Attendees'] || tr['Crew Members'] || '').trim();

        const isLeadMatch = this.isNameMatch(lead, displayName);
        const isAttendeeMatch = attendees && this.isNameMatch(attendees, displayName);
        const isCrewMatch = jobNumber && jobNumber !== 'N/A' && crew === jobNumber;

        if (isLeadMatch || isAttendeeMatch || isCrewMatch) {
          trainingList.push({
            month: String(tr['Month'] || tr['Scheduled Month'] || 'N/A').trim(),
            topic: String(tr['Topic'] || tr['Training Topic'] || tr['Training'] || 'Safety Training').trim(),
            crew: crew,
            lead: lead,
            status: String(tr['Status'] || tr['Training Status'] || 'Scheduled').trim(),
            hours: String(tr['Hours'] || '1.0').trim()
          });
        }
      });
    }

    // 5. Scan Employee History
    const historyTable = snap.tables['employee_history'];
    const employeeHistory = [];
    if (historyTable && historyTable.rows) {
      historyTable.rows.forEach(h => {
        const hName = String(h['Employee Name'] || h['Name'] || h['Employee'] || '').trim();
        if (this.isNameMatch(hName, displayName)) {
          employeeHistory.push({
            date: String(h['Date'] || h['Date Changed'] || 'N/A').trim(),
            event: String(h['Event'] || h['Event Type'] || h['Action'] || 'Assignment Change').trim(),
            details: String(h['Details'] || h['Notes'] || h['Description'] || '').trim(),
            location: String(h['Location'] || '').trim(),
            job: String(h['Job Number'] || '').trim()
          });
        }
      });
    }

    // Store state for tab switching
    this.currentEmployeeData = {
      displayName,
      location,
      jobNumber,
      secondaryJob,
      role,
      phone,
      email,
      mpEmail,
      notifEmail,
      assignedEquipment,
      certifications,
      trainingList,
      employeeHistory
    };

    if (titleEl) {
      titleEl.innerHTML = `<span style="font-size: 18px;">👤</span> Employee Profile: <strong>${this.escapeHtml(displayName)}</strong>`;
    }

    this.renderModalContent(body);
    modal.classList.add('active');
  }

  closeProfileModal() {
    const modal = document.getElementById('employee-profile-modal');
    if (modal) modal.classList.remove('active');
  }

  setTab(tabKey) {
    this.currentActiveTab = tabKey;
    const body = document.getElementById('employee-profile-modal-body');
    if (body && this.currentEmployeeData) {
      this.renderModalContent(body);
    }
  }

  /**
   * Renders the complete profile modal UI
   */
  renderModalContent(container) {
    const data = this.currentEmployeeData;
    if (!data) return;

    // Calculate quick stats
    const totalEquipment = data.assignedEquipment.length;
    const okCerts = data.certifications.filter(c => c.status.toLowerCase() === 'ok').length;
    const warnCerts = data.certifications.filter(c => ['warning', 'upcoming', 'critical'].includes(c.status.toLowerCase())).length;
    const expCerts = data.certifications.filter(c => ['expired', 'missing'].includes(c.status.toLowerCase())).length;
    const totalCerts = data.certifications.length;

    // Find earliest upcoming due date
    let earliestDueDate = 'None pending';
    let earliestTime = Infinity;

    data.assignedEquipment.forEach(eq => {
      const parsed = this.parseDate(eq.changeOutDate);
      if (parsed && parsed.getTime() < earliestTime) {
        earliestTime = parsed.getTime();
        earliestDueDate = `${eq.eqIcon} ${eq.eqType}: ${eq.changeOutDate}`;
      }
    });

    data.certifications.forEach(c => {
      const parsed = this.parseDate(c.expDate);
      if (parsed && parsed.getTime() < earliestTime) {
        earliestTime = parsed.getTime();
        earliestDueDate = `📜 ${c.certType}: ${c.expDate}`;
      }
    });

    let html = `
      <!-- Employee Profile Header Card -->
      <div style="background-color: var(--bg-primary); border: 1px solid var(--border-color); border-radius: 10px; padding: 18px; margin-bottom: 20px;">
        <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 14px; margin-bottom: 14px;">
          
          <div style="display: flex; align-items: center; gap: 14px;">
            <div style="width: 52px; height: 52px; border-radius: 50%; background: linear-gradient(135deg, #3b82f6 0%, #1e40af 100%); display: flex; align-items: center; justify-content: center; font-size: 26px; box-shadow: 0 4px 10px rgba(59, 130, 246, 0.3);">
              👤
            </div>
            <div>
              <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                <h2 style="font-size: 20px; font-weight: 800; color: var(--text-primary); margin: 0;">${this.escapeHtml(data.displayName)}</h2>
                <span class="brand-badge" style="background: rgba(99, 102, 241, 0.2); color: #a5b4fc; border: 1px solid rgba(99, 102, 241, 0.4); font-size: 11px; font-weight: 700;">
                  ⚡ ${this.escapeHtml(data.role)}
                </span>
                <span class="brand-badge" style="background: rgba(139, 92, 246, 0.2); color: #c4b5fd; border: 1px solid rgba(139, 92, 246, 0.4); font-size: 11px; font-weight: 700;">
                  📍 ${this.escapeHtml(data.location)}
                </span>
                <span class="brand-badge" style="background: rgba(59, 130, 246, 0.2); color: #93c5fd; border: 1px solid rgba(59, 130, 246, 0.4); font-size: 11px; font-weight: 700; font-family: monospace;">
                  🔢 Crew ${this.escapeHtml(data.jobNumber)}
                </span>
                ${data.secondaryJob ? `
                  <span class="brand-badge" style="background: rgba(100, 116, 139, 0.2); color: #cbd5e1; border: 1px solid rgba(100, 116, 139, 0.4); font-size: 11px;">
                    Secondary: ${this.escapeHtml(data.secondaryJob)}
                  </span>
                ` : ''}
              </div>

              <!-- Contact Bar -->
              <div style="display: flex; align-items: center; gap: 14px; margin-top: 8px; font-size: 12px; color: var(--text-secondary); flex-wrap: wrap;">
                ${data.phone && data.phone !== 'N/A' ? `
                  <span style="display: inline-flex; align-items: center; gap: 4px; color: #60a5fa; font-weight: 600;">
                    <span>📞</span> ${this.escapeHtml(data.phone)}
                  </span>
                ` : '<span style="color: var(--text-muted);">📞 No phone</span>'}

                ${data.email ? `
                  <span style="display: inline-flex; align-items: center; gap: 4px;">
                    <span>✉️</span> ${this.escapeHtml(data.email)}
                  </span>
                ` : ''}

                ${data.mpEmail && data.mpEmail !== data.email ? `
                  <span style="display: inline-flex; align-items: center; gap: 4px; color: #93c5fd;">
                    <span>🏢</span> ${this.escapeHtml(data.mpEmail)}
                  </span>
                ` : ''}
              </div>
            </div>
          </div>

        </div>

        <!-- 4-Card Quick KPI Grid -->
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 10px; margin-top: 14px;">
          
          <div style="background-color: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: 8px; padding: 10px 14px;">
            <div style="font-size: 11px; color: var(--text-muted); text-transform: uppercase; font-weight: 700; margin-bottom: 2px;">Assigned Equipment</div>
            <div style="font-size: 17px; font-weight: 800; color: ${totalEquipment > 0 ? '#38bdf8' : '#94a3b8'};">
              📦 ${totalEquipment} Item${totalEquipment === 1 ? '' : 's'}
            </div>
            <div style="font-size: 11px; color: var(--text-secondary); margin-top: 2px;">Active PPE & Safety gear</div>
          </div>

          <div style="background-color: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: 8px; padding: 10px 14px;">
            <div style="font-size: 11px; color: var(--text-muted); text-transform: uppercase; font-weight: 700; margin-bottom: 2px;">Certifications Status</div>
            <div style="font-size: 17px; font-weight: 800; color: ${expCerts > 0 ? '#ef4444' : (warnCerts > 0 ? '#f59e0b' : '#10b981')};">
              ${expCerts > 0 ? `🔴 ${expCerts} Expired` : (warnCerts > 0 ? `🟡 ${warnCerts} Expiring` : `🟢 ${okCerts} Valid`)}
            </div>
            <div style="font-size: 11px; color: var(--text-secondary); margin-top: 2px;">${totalCerts} Total Certs Tracked</div>
          </div>

          <div style="background-color: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: 8px; padding: 10px 14px;">
            <div style="font-size: 11px; color: var(--text-muted); text-transform: uppercase; font-weight: 700; margin-bottom: 2px;">Training History</div>
            <div style="font-size: 17px; font-weight: 800; color: #a78bfa;">
              🎓 ${data.trainingList.length} Module${data.trainingList.length === 1 ? '' : 's'}
            </div>
            <div style="font-size: 11px; color: var(--text-secondary); margin-top: 2px;">Scheduled & Completed</div>
          </div>

          <div style="background-color: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: 8px; padding: 10px 14px;">
            <div style="font-size: 11px; color: var(--text-muted); text-transform: uppercase; font-weight: 700; margin-bottom: 2px;">Earliest Due Date</div>
            <div style="font-size: 13px; font-weight: 700; color: #fbbf24; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${this.escapeHtml(earliestDueDate)}">
              ⏳ ${this.escapeHtml(earliestDueDate)}
            </div>
            <div style="font-size: 11px; color: var(--text-secondary); margin-top: 2px;">Next changeout or expiry</div>
          </div>

        </div>
      </div>

      <!-- Navigation Tabs inside Profile -->
      <div style="display: flex; gap: 8px; border-bottom: 2px solid var(--border-color); margin-bottom: 16px; padding-bottom: 2px;">
        <button class="btn ${this.currentActiveTab === 'equipment' ? 'btn-primary' : 'btn-secondary'}" 
                style="padding: 7px 14px; font-size: 12px; font-weight: 700;" 
                onclick="window.employeeProfileEngine.setTab('equipment')">
          📦 Assigned Equipment (${data.assignedEquipment.length})
        </button>
        <button class="btn ${this.currentActiveTab === 'certs' ? 'btn-primary' : 'btn-secondary'}" 
                style="padding: 7px 14px; font-size: 12px; font-weight: 700;" 
                onclick="window.employeeProfileEngine.setTab('certs')">
          📜 Certifications & Matrix (${data.certifications.length})
        </button>
        <button class="btn ${this.currentActiveTab === 'history' ? 'btn-primary' : 'btn-secondary'}" 
                style="padding: 7px 14px; font-size: 12px; font-weight: 700;" 
                onclick="window.employeeProfileEngine.setTab('history')">
          🎓 Training & Lifecycle (${data.trainingList.length + data.employeeHistory.length})
        </button>
      </div>

      <!-- Tab Content Area -->
      <div style="min-height: 260px;">
        ${this.renderActiveTabContent()}
      </div>
    `;

    container.innerHTML = html;
  }

  /**
   * Renders the current selected tab body
   */
  renderActiveTabContent() {
    const data = this.currentEmployeeData;
    if (!data) return '';

    if (this.currentActiveTab === 'equipment') {
      if (data.assignedEquipment.length === 0) {
        return `
          <div style="padding: 40px; text-align: center; color: var(--text-muted); background: var(--bg-primary); border-radius: 8px; border: 1px dashed var(--border-color);">
            <div style="font-size: 32px; margin-bottom: 10px;">📦</div>
            <h4 style="color: var(--text-primary); font-size: 15px; margin-bottom: 6px;">No Equipment Currently Assigned</h4>
            <p style="font-size: 13px;">This employee does not have any gloves, sleeves, blankets, or safety equipment checked out in active inventory.</p>
          </div>
        `;
      }

      let html = `
        <div style="overflow-x: auto;">
          <table class="data-table" style="width: 100%; font-size: 12.5px;">
            <thead>
              <tr>
                <th style="text-align: left;">Equipment Type</th>
                <th style="text-align: center;">Item # / Tag</th>
                <th style="text-align: left;">Specifications</th>
                <th style="text-align: center;">Test / Cal Date</th>
                <th style="text-align: center;">Date Assigned</th>
                <th style="text-align: center;">Change Out Date</th>
                <th style="text-align: center;">Location</th>
                <th style="text-align: center;">Status</th>
                <th style="text-align: center;">Action</th>
              </tr>
            </thead>
            <tbody>
      `;

      data.assignedEquipment.forEach(item => {
        html += `
          <tr>
            <td style="font-weight: 700; text-align: left;">
              <span style="margin-right: 6px;">${item.eqIcon}</span> ${this.escapeHtml(item.eqType)}
            </td>
            <td style="text-align: center; font-family: monospace; font-weight: 800; color: #60a5fa;">
              ${this.escapeHtml(item.itemNum)}
              ${item.eslId ? `<div style="font-size: 10px; color: #94a3b8; font-weight: normal;">ESL: ${this.escapeHtml(item.eslId)}</div>` : ''}
            </td>
            <td style="text-align: left; color: var(--text-secondary); font-size: 11.5px;">
              ${this.escapeHtml(item.specs)}
            </td>
            <td style="text-align: center; color: var(--text-secondary);">
              ${this.escapeHtml(item.testDate)}
            </td>
            <td style="text-align: center; color: var(--text-secondary);">
              ${this.escapeHtml(item.dateAssigned)}
            </td>
            <td style="text-align: center; font-weight: 700; color: #facc15;">
              ${this.escapeHtml(item.changeOutDate)}
            </td>
            <td style="text-align: center;">
              <span class="badge" style="background: rgba(139, 92, 246, 0.2); color: #c4b5fd; padding: 2px 6px; border-radius: 4px; font-size: 11px;">
                📍 ${this.escapeHtml(item.location)}
              </span>
            </td>
            <td style="text-align: center;">
              <span class="badge" style="background: #16a34a; color: #fff; padding: 2px 8px; border-radius: 4px; font-weight: 700; font-size: 11px;">
                ✅ ${this.escapeHtml(item.status)}
              </span>
            </td>
            <td style="text-align: center;">
              <button class="btn btn-secondary" style="padding: 2px 8px; font-size: 11px;" title="Inspect item lifecycle dossier" onclick="if(window.itemStatsEngine){window.itemStatsEngine.openDossierModal('${this.escapeHtml(item.itemNum)}', '${this.escapeHtml(item.histKey)}');}">
                📊 Dossier
              </button>
            </td>
          </tr>
        `;
      });

      html += `</tbody></table></div>`;
      return html;
    }

    if (this.currentActiveTab === 'certs') {
      if (data.certifications.length === 0) {
        return `
          <div style="padding: 40px; text-align: center; color: var(--text-muted); background: var(--bg-primary); border-radius: 8px; border: 1px dashed var(--border-color);">
            <div style="font-size: 32px; margin-bottom: 10px;">📜</div>
            <h4 style="color: var(--text-primary); font-size: 15px; margin-bottom: 6px;">No Certification Records Found</h4>
            <p style="font-size: 13px;">No expiring certs or qualification entries are currently mapped for this employee name.</p>
          </div>
        `;
      }

      let html = `
        <div style="overflow-x: auto;">
          <table class="data-table" style="width: 100%; font-size: 12.5px;">
            <thead>
              <tr>
                <th style="text-align: left;">Certification / License</th>
                <th style="text-align: center;">Expiration Date</th>
                <th style="text-align: center;">Days Remaining</th>
                <th style="text-align: center;">Status</th>
                <th style="text-align: center;">Test / Issued Date</th>
                <th style="text-align: center;">SMS Notification</th>
                <th style="text-align: left;">Notes</th>
              </tr>
            </thead>
            <tbody>
      `;

      data.certifications.forEach(c => {
        let statusBadge = `<span class="badge" style="background-color: #15803d; color: #fff; padding: 2px 8px; border-radius: 4px; font-weight: 700;">🟢 OK</span>`;
        const sLower = c.status.toLowerCase();

        if (sLower === 'upcoming') {
          statusBadge = `<span class="badge" style="background-color: #0284c7; color: #fff; padding: 2px 8px; border-radius: 4px; font-weight: 700;">🔵 Upcoming</span>`;
        } else if (sLower === 'warning') {
          statusBadge = `<span class="badge" style="background-color: #d97706; color: #fff; padding: 2px 8px; border-radius: 4px; font-weight: 700;">🟡 Warning</span>`;
        } else if (sLower === 'critical') {
          statusBadge = `<span class="badge" style="background-color: #ea580c; color: #fff; padding: 2px 8px; border-radius: 4px; font-weight: 700;">🟠 Critical</span>`;
        } else if (sLower === 'expired') {
          statusBadge = `<span class="badge" style="background-color: #dc2626; color: #fff; padding: 2px 8px; border-radius: 4px; font-weight: 700;">🔴 Expired</span>`;
        } else if (sLower === 'missing') {
          statusBadge = `<span class="badge" style="background-color: #991b1b; color: #fff; padding: 2px 8px; border-radius: 4px; font-weight: 700;">❌ Missing</span>`;
        } else if (sLower === 'declined') {
          statusBadge = `<span class="badge" style="background-color: #475569; color: #fff; padding: 2px 8px; border-radius: 4px; font-weight: 700;">🚫 Declined</span>`;
        } else if (sLower.includes('not req')) {
          statusBadge = `<span class="badge" style="background-color: #334155; color: #94a3b8; padding: 2px 8px; border-radius: 4px; font-weight: 600;">⚪ Not Required</span>`;
        }

        let daysHtml = '—';
        if (c.daysLeft !== null) {
          if (c.daysLeft <= 0) {
            daysHtml = `<span style="color: #ef4444; font-weight: 800;">${c.daysLeft}d (Expired)</span>`;
          } else if (c.daysLeft <= 30) {
            daysHtml = `<span style="color: #f97316; font-weight: 700;">${c.daysLeft}d</span>`;
          } else if (c.daysLeft <= 60) {
            daysHtml = `<span style="color: #eab308; font-weight: 600;">${c.daysLeft}d</span>`;
          } else {
            daysHtml = `<span style="color: #4ade80;">${c.daysLeft}d</span>`;
          }
        }

        html += `
          <tr>
            <td style="font-weight: 700; text-align: left; color: #f8fafc;">
              📜 ${this.escapeHtml(c.certType)}
            </td>
            <td style="text-align: center; font-weight: 700;">
              ${this.escapeHtml(c.expDate)}
            </td>
            <td style="text-align: center;">
              ${daysHtml}
            </td>
            <td style="text-align: center;">
              ${statusBadge}
            </td>
            <td style="text-align: center; color: var(--text-secondary);">
              ${this.escapeHtml(c.testDate)}
            </td>
            <td style="text-align: center;">
              ${c.smsStatus && c.smsStatus !== 'FALSE' && c.smsStatus !== 'false' ? `
                <span class="badge" style="background: rgba(59, 130, 246, 0.2); color: #60a5fa; border: 1px solid rgba(59, 130, 246, 0.4); padding: 2px 6px; font-size: 11px;">
                  📱 ${this.escapeHtml(c.smsStatus)}
                </span>
              ` : '<span style="color: var(--text-muted); font-size: 11px;">—</span>'}
            </td>
            <td style="text-align: left; font-size: 11px; color: var(--text-muted);">
              ${this.escapeHtml(c.notes || '')}
            </td>
          </tr>
        `;
      });

      html += `</tbody></table></div>`;
      return html;
    }

    if (this.currentActiveTab === 'history') {
      return `
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px;">
          
          <!-- Column 1: Scheduled Training Modules -->
          <div>
            <h4 style="font-size: 13px; font-weight: 700; margin-bottom: 10px; color: #a78bfa; display: flex; align-items: center; gap: 6px;">
              <span>🎓</span> Scheduled & Completed Training (${data.trainingList.length})
            </h4>
            ${data.trainingList.length === 0 ? `
              <div style="padding: 20px; text-align: center; color: var(--text-muted); background: var(--bg-primary); border-radius: 6px; border: 1px dashed var(--border-color); font-size: 12px;">
                No training modules found for this crew.
              </div>
            ` : `
              <div style="display: flex; flex-direction: column; gap: 8px;">
                ${data.trainingList.map(tr => `
                  <div style="background: var(--bg-primary); border: 1px solid var(--border-color); border-radius: 6px; padding: 10px 12px; font-size: 12px;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
                      <span style="font-weight: 700; color: #f8fafc;">${this.escapeHtml(tr.topic)}</span>
                      <span class="badge" style="background: ${tr.status.toLowerCase().includes('comp') ? '#15803d' : '#d97706'}; color: #fff; padding: 1px 6px; border-radius: 3px; font-size: 10px;">
                        ${this.escapeHtml(tr.status)}
                      </span>
                    </div>
                    <div style="color: var(--text-secondary); font-size: 11px;">
                      📅 Month: <strong>${this.escapeHtml(tr.month)}</strong> &nbsp;|&nbsp; Crew: <strong>${this.escapeHtml(tr.crew)}</strong> (${this.escapeHtml(tr.lead || 'Lead')})
                    </div>
                  </div>
                `).join('')}
              </div>
            `}
          </div>

          <!-- Column 2: Employee Lifecycle Milestones -->
          <div>
            <h4 style="font-size: 13px; font-weight: 700; margin-bottom: 10px; color: #60a5fa; display: flex; align-items: center; gap: 6px;">
              <span>📋</span> Career Milestones & History (${data.employeeHistory.length})
            </h4>
            ${data.employeeHistory.length === 0 ? `
              <div style="padding: 20px; text-align: center; color: var(--text-muted); background: var(--bg-primary); border-radius: 6px; border: 1px dashed var(--border-color); font-size: 12px;">
                No employee history events logged.
              </div>
            ` : `
              <div style="display: flex; flex-direction: column; gap: 8px;">
                ${data.employeeHistory.map(h => `
                  <div style="background: var(--bg-primary); border: 1px solid var(--border-color); border-radius: 6px; padding: 10px 12px; font-size: 12px;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
                      <span style="font-weight: 700; color: #f8fafc;">${this.escapeHtml(h.event)}</span>
                      <span style="color: #60a5fa; font-size: 11px; font-weight: 600;">${this.escapeHtml(h.date)}</span>
                    </div>
                    <div style="color: var(--text-secondary); font-size: 11px;">
                      ${h.details ? this.escapeHtml(h.details) : `Location: ${this.escapeHtml(h.location || 'N/A')} · Job: ${this.escapeHtml(h.job || 'N/A')}`}
                    </div>
                  </div>
                `).join('')}
              </div>
            `}
          </div>

        </div>
      `;
    }

    return '';
  }

  parseDate(str) {
    if (!str || str === 'N/A') return null;
    if (str.includes('/')) {
      const parts = str.split('/');
      if (parts.length === 3) {
        const m = parseInt(parts[0], 10) - 1;
        const d = parseInt(parts[1], 10);
        const y = parseInt(parts[2], 10);
        return new Date(y, m, d, 12, 0, 0);
      }
    }
    const d = new Date(str);
    return isNaN(d.getTime()) ? null : d;
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
}

window.employeeProfileEngine = new EmployeeProfileEngine(window.localDB);
