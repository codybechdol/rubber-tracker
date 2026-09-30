/**
 * Safety Assistant Desktop - Incident Reports Engine
 * 
 * Manages incident reports received from mptablets@mountainpower.com.
 * Organizes reports by yearly quarter (Q1: Jan-Mar, Q2: Apr-Jun, Q3: Jul-Sep, Q4: Oct-Dec),
 * splits incident types into filterable tags, cross-references foremen with Job Tracking,
 * and provides high-res photo gallery lightboxes & inline PDF viewing.
 */

class IncidentReportsEngine {
  constructor(db) {
    this.db = db;
    this.selectedYear = new Date().getFullYear().toString();
    this.selectedQuarter = 'all'; // 'all', 'Q1', 'Q2', 'Q3', 'Q4'
    this.selectedTag = 'all';
    this.searchQuery = '';
    this.isScanning = false;
    this.attachmentsCache = new Map(); // emailId -> { pdf, photos }
    this.lightboxState = {
      isOpen: false,
      photos: [],
      currentIndex: 0,
      incident: null
    };

    window.incidentReportsEngine = this;
  }

  init() {
    console.log('IncidentReportsEngine initialized');
  }

  /**
   * Helper to normalize date strings to Date object
   */
  parseDate(val) {
    if (!val || val === 'N/A' || val === '—') return null;
    if (val instanceof Date) return isNaN(val.getTime()) ? null : val;
    const s = String(val).trim();
    if (s.includes('/')) {
      const parts = s.split(' ')[0].split('/');
      if (parts.length === 3) {
        const m = parseInt(parts[0], 10) - 1;
        const d = parseInt(parts[1], 10);
        let y = parseInt(parts[2], 10);
        if (y < 100) y += 2000;
        const dt = new Date(y, m, d, 12, 0, 0);
        return isNaN(dt.getTime()) ? null : dt;
      }
    }
    if (s.includes('-')) {
      const parts = s.split(' ')[0].split('-');
      if (parts.length === 3) {
        const y = parseInt(parts[0], 10);
        const m = parseInt(parts[1], 10) - 1;
        const d = parseInt(parts[2], 10);
        const dt = new Date(y, m, d, 12, 0, 0);
        return isNaN(dt.getTime()) ? null : dt;
      }
    }
    const dt = new Date(s);
    return isNaN(dt.getTime()) ? null : dt;
  }

  /**
   * Splits a comma or slash-separated incident type string into clean individual tags
   */
  splitIncidentTags(rawType) {
    if (!rawType || rawType === '—' || rawType === 'N/A') return ['General Incident'];
    const parts = String(rawType)
      .split(/[,;/+]+/)
      .map(t => t.trim())
      .filter(t => t.length > 0);
    return parts.length > 0 ? parts : ['General Incident'];
  }

  /**
   * Returns a representative emoji for an incident type tag
   */
  getTagIcon(tag) {
    const t = String(tag).toLowerCase();
    if (t.includes('vehicle') || t.includes('truck') || t.includes('trailer') || t.includes('car')) return '🚗';
    if (t.includes('property') || t.includes('building') || t.includes('fence')) return '💥';
    if (t.includes('utility') || t.includes('strike') || t.includes('power') || t.includes('electric') || t.includes('gas')) return '⚡';
    if (t.includes('injury') || t.includes('medical') || t.includes('first aid')) return '🩹';
    if (t.includes('near miss') || t.includes('hazard')) return '⚠️';
    if (t.includes('equipment') || t.includes('tool') || t.includes('rig') || t.includes('bucket')) return '🛠️';
    if (t.includes('spill') || t.includes('environmental') || t.includes('oil')) return '🛢️';
    return '📋';
  }

  /**
   * Returns visual styling for an incident type tag
   */
  getTagStyle(tag) {
    const t = String(tag).toLowerCase();
    if (t.includes('injury') || t.includes('medical')) {
      return { bg: 'rgba(239, 68, 68, 0.15)', text: '#fca5a5', border: 'rgba(239, 68, 68, 0.35)' };
    }
    if (t.includes('vehicle') || t.includes('property') || t.includes('trailer')) {
      return { bg: 'rgba(245, 158, 11, 0.15)', text: '#fcd34d', border: 'rgba(245, 158, 11, 0.35)' };
    }
    if (t.includes('utility') || t.includes('strike') || t.includes('electric')) {
      return { bg: 'rgba(168, 85, 247, 0.15)', text: '#d8b4fe', border: 'rgba(168, 85, 247, 0.35)' };
    }
    if (t.includes('near miss')) {
      return { bg: 'rgba(59, 130, 246, 0.15)', text: '#93c5fd', border: 'rgba(59, 130, 246, 0.35)' };
    }
    if (t.includes('equipment')) {
      return { bg: 'rgba(20, 184, 166, 0.15)', text: '#5eead4', border: 'rgba(20, 184, 166, 0.35)' };
    }
    return { bg: 'rgba(148, 163, 184, 0.15)', text: '#cbd5e1', border: 'rgba(148, 163, 184, 0.3)' };
  }

  /**
   * Loads all incident reports from the local database snapshot
   */
  loadIncidents() {
    const snap = this.db?.getSnapshot?.();
    const table = snap?.tables?.['incident_reports'] || this.db?.getTable?.('incident_reports');
    const rows = table?.rows || [];

    // Build foreman and job city lookup map from Job Tracking
    const jtTable = snap?.tables?.['job_tracking'] || this.db?.getTable?.('job_tracking');
    const jtRows = jtTable?.rows || [];
    const jobInfoMap = new Map();

    jtRows.forEach(jr => {
      const jNum = String(jr['Job Number'] || jr['Job #'] || '').trim().replace(/^job\s*#?\s*/i, '');
      const fMan = String(jr['Foreman'] || jr['Crew Lead'] || jr['Lead'] || '').trim();
      const city = String(jr['Location'] || jr['Job Location'] || '').trim();
      const name = String(jr['Job Name'] || '').trim();
      if (jNum) {
        jobInfoMap.set(jNum, { foreman: fMan, location: city, jobName: name });
        const noZero = jNum.replace(/^0+/, '');
        if (noZero) jobInfoMap.set(noZero, { foreman: fMan, location: city, jobName: name });
      }
    });

    return rows.map((row, idx) => {
      const rawDate = row['Date of Incident'] || row['Date'] || row['Date Received'] || '';
      const dObj = this.parseDate(rawDate) || new Date();
      const year = dObj.getFullYear().toString();
      const monthIdx = dObj.getMonth();
      const qNum = Math.floor(monthIdx / 3) + 1;
      const quarterKey = `Q${qNum}`; // 'Q1', 'Q2', 'Q3', 'Q4'
      const yearQuarter = `${year}-${quarterKey}`;

      const rawJob = String(row['Job #'] || row['Job Number'] || '').trim().replace(/^job\s*#?\s*/i, '');
      const jtMatch = jobInfoMap.get(rawJob) || jobInfoMap.get(rawJob.replace(/^0+/, '')) || {};

      let foreman = String(row['Foreman'] || '').trim();
      if (!foreman || foreman.toLowerCase() === 'n/a' || foreman === '—') {
        foreman = jtMatch.foreman || '';
      }

      const rawType = String(row['Incident Type'] || 'General Incident').trim();
      const tags = this.splitIncidentTags(rawType);

      return {
        id: row.id || `inc_${idx}_${row['Email ID'] || idx}`,
        rowIndex: row._rowIdx || idx + 2,
        emailId: String(row['Email ID'] || '').trim(),
        dateReceived: String(row['Date Received'] || '').trim(),
        dateOfIncident: rawDate,
        dateObj: dObj,
        time: String(row['Time'] || '').trim(),
        year: year,
        quarter: quarterKey,
        yearQuarter: yearQuarter,
        jobNumber: rawJob,
        jobLocation: jtMatch.location || String(row['Address / Location'] || '').trim(),
        jobName: jtMatch.jobName || '',
        foreman: foreman || 'Supervisor',
        involvedEmployees: String(row['Involved Employee(s)'] || row['Involved Employees'] || '').trim(),
        incidentType: rawType,
        tags: tags,
        addressLocation: String(row['Address / Location'] || row['Location'] || '').trim(),
        unitNumber: String(row['Unit #'] || '').trim(),
        ticketNumber: String(row['Ticket #'] || '').trim(),
        explanation: String(row['Brief Explanation'] || row['Explanation'] || '').trim(),
        avoidableActions: String(row['Avoidable / Prevention'] || row['Avoidable'] || '').trim(),
        photoCount: parseInt(row['Photo Count'] || 0, 10),
        pdfFilename: String(row['PDF Filename'] || 'Incident_Report.pdf').trim(),
        status: String(row['Status'] || 'Under Review').trim(),
        notes: String(row['Notes'] || '').trim()
      };
    });
  }

  /**
   * Main render function that populates the Incident Reports view
   */
  render() {
    const container = document.getElementById('incident-reports-content');
    if (!container) return;

    const allIncidents = this.loadIncidents();

    // Collect available years
    const yearSet = new Set();
    allIncidents.forEach(inc => {
      if (inc.year) yearSet.add(inc.year);
    });
    if (!yearSet.has(new Date().getFullYear().toString())) {
      yearSet.add(new Date().getFullYear().toString());
    }
    const availableYears = Array.from(yearSet).sort((a, b) => b.localeCompare(a));
    if (this.selectedYear !== 'all' && !yearSet.has(this.selectedYear)) {
      this.selectedYear = availableYears[0] || 'all';
    }

    // Filter by Year
    let filtered = allIncidents;
    if (this.selectedYear !== 'all') {
      filtered = filtered.filter(i => i.year === this.selectedYear);
    }

    // Collect available tags across filtered year
    const tagCountMap = new Map();
    filtered.forEach(inc => {
      inc.tags.forEach(t => {
        tagCountMap.set(t, (tagCountMap.get(t) || 0) + 1);
      });
    });
    const availableTags = Array.from(tagCountMap.entries()).sort((a, b) => b[1] - a[1]);

    // Filter by Quarter
    if (this.selectedQuarter !== 'all') {
      filtered = filtered.filter(i => i.quarter === this.selectedQuarter);
    }

    // Filter by Tag
    if (this.selectedTag !== 'all') {
      filtered = filtered.filter(i => i.tags.includes(this.selectedTag));
    }

    // Filter by Search Query
    if (this.searchQuery) {
      const q = this.searchQuery.toLowerCase().trim();
      filtered = filtered.filter(i => {
        return (
          i.jobNumber.toLowerCase().includes(q) ||
          i.foreman.toLowerCase().includes(q) ||
          i.involvedEmployees.toLowerCase().includes(q) ||
          i.explanation.toLowerCase().includes(q) ||
          i.addressLocation.toLowerCase().includes(q) ||
          i.unitNumber.toLowerCase().includes(q) ||
          i.incidentType.toLowerCase().includes(q)
        );
      });
    }

    // Sort newest incident first
    filtered.sort((a, b) => b.dateObj.getTime() - a.dateObj.getTime());

    // Compute Quarter counts for badges
    const yearIncidents = (this.selectedYear === 'all') ? allIncidents : allIncidents.filter(i => i.year === this.selectedYear);
    const qCounts = {
      all: yearIncidents.length,
      Q1: yearIncidents.filter(i => i.quarter === 'Q1').length,
      Q2: yearIncidents.filter(i => i.quarter === 'Q2').length,
      Q3: yearIncidents.filter(i => i.quarter === 'Q3').length,
      Q4: yearIncidents.filter(i => i.quarter === 'Q4').length
    };

    // Update row count badge in toolbar
    const countBadge = document.getElementById('incident-reports-row-count');
    if (countBadge) {
      countBadge.textContent = `${filtered.length} report${filtered.length === 1 ? '' : 's'}`;
    }

    // Render HTML structure
    container.innerHTML = `
      <div style="display: flex; flex-direction: column; gap: 16px; padding: 18px 24px; max-width: 1500px; margin: 0 auto; width: 100%;">
        
        <!-- Top Stats / Metric Header -->
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px;">
          <div style="background: var(--bg-primary); border: 1px solid var(--border-color); border-radius: 8px; padding: 12px 16px;">
            <div style="font-size: 11px; text-transform: uppercase; font-weight: 700; color: #94a3b8;">⚠️ Total Incidents (${this.selectedYear})</div>
            <div style="font-size: 24px; font-weight: 800; color: #f87171; margin-top: 4px;">${qCounts.all}</div>
            <div style="font-size: 11px; color: #cbd5e1; margin-top: 2px;">Mountain Power Operations</div>
          </div>
          <div style="background: var(--bg-primary); border: 1px solid var(--border-color); border-radius: 8px; padding: 12px 16px;">
            <div style="font-size: 11px; text-transform: uppercase; font-weight: 700; color: #94a3b8;">🌸 Q1 (Jan – Mar)</div>
            <div style="font-size: 24px; font-weight: 800; color: #60a5fa; margin-top: 4px;">${qCounts.Q1}</div>
            <div style="font-size: 11px; color: #94a3b8; margin-top: 2px;">Winter / Early Spring</div>
          </div>
          <div style="background: var(--bg-primary); border: 1px solid var(--border-color); border-radius: 8px; padding: 12px 16px;">
            <div style="font-size: 11px; text-transform: uppercase; font-weight: 700; color: #94a3b8;">☀️ Q2 (Apr – Jun)</div>
            <div style="font-size: 24px; font-weight: 800; color: #34d399; margin-top: 4px;">${qCounts.Q2}</div>
            <div style="font-size: 11px; color: #94a3b8; margin-top: 2px;">Spring Construction</div>
          </div>
          <div style="background: var(--bg-primary); border: 1px solid var(--border-color); border-radius: 8px; padding: 12px 16px;">
            <div style="font-size: 11px; text-transform: uppercase; font-weight: 700; color: #94a3b8;">🍂 Q3 (Jul – Sep)</div>
            <div style="font-size: 24px; font-weight: 800; color: #f59e0b; margin-top: 4px;">${qCounts.Q3}</div>
            <div style="font-size: 11px; color: #94a3b8; margin-top: 2px;">Peak Summer Work</div>
          </div>
          <div style="background: var(--bg-primary); border: 1px solid var(--border-color); border-radius: 8px; padding: 12px 16px;">
            <div style="font-size: 11px; text-transform: uppercase; font-weight: 700; color: #94a3b8;">❄️ Q4 (Oct – Dec)</div>
            <div style="font-size: 24px; font-weight: 800; color: #c084fc; margin-top: 4px;">${qCounts.Q4}</div>
            <div style="font-size: 11px; color: #94a3b8; margin-top: 2px;">Fall / Early Winter</div>
          </div>
        </div>

        <!-- Quarter Navigation Tabs & Year Selector -->
        <div style="display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; background: var(--bg-primary); border: 1px solid var(--border-color); border-radius: 8px; padding: 10px 14px;">
          
          <div style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">
            <button class="quarter-tab-btn ${this.selectedQuarter === 'all' ? 'active' : ''}" onclick="window.incidentReportsEngine.setQuarter('all')">
              <span>📅 All Quarters</span>
              <span class="q-badge">${qCounts.all}</span>
            </button>
            <button class="quarter-tab-btn ${this.selectedQuarter === 'Q1' ? 'active' : ''}" onclick="window.incidentReportsEngine.setQuarter('Q1')">
              <span>🌸 Q1: Jan – Mar</span>
              <span class="q-badge">${qCounts.Q1}</span>
            </button>
            <button class="quarter-tab-btn ${this.selectedQuarter === 'Q2' ? 'active' : ''}" onclick="window.incidentReportsEngine.setQuarter('Q2')">
              <span>☀️ Q2: Apr – Jun</span>
              <span class="q-badge">${qCounts.Q2}</span>
            </button>
            <button class="quarter-tab-btn ${this.selectedQuarter === 'Q3' ? 'active' : ''}" onclick="window.incidentReportsEngine.setQuarter('Q3')">
              <span>🍂 Q3: Jul – Sep</span>
              <span class="q-badge">${qCounts.Q3}</span>
            </button>
            <button class="quarter-tab-btn ${this.selectedQuarter === 'Q4' ? 'active' : ''}" onclick="window.incidentReportsEngine.setQuarter('Q4')">
              <span>❄️ Q4: Oct – Dec</span>
              <span class="q-badge">${qCounts.Q4}</span>
            </button>
          </div>

          <div style="display: flex; align-items: center; gap: 8px;">
            <label for="inc-year-select" style="font-size: 12px; font-weight: 700; color: #94a3b8;">Year:</label>
            <select id="inc-year-select" onchange="window.incidentReportsEngine.setYear(this.value)" style="background: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: 6px; padding: 6px 12px; color: #60a5fa; font-size: 13px; font-weight: 700;">
              <option value="all" ${this.selectedYear === 'all' ? 'selected' : ''}>All Years</option>
              ${availableYears.map(yr => `<option value="${yr}" ${this.selectedYear === yr ? 'selected' : ''}>${yr}</option>`).join('')}
            </select>
          </div>

        </div>

        <!-- Incident Type Tag Filter Pills -->
        <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
          <span style="font-size: 11.5px; font-weight: 700; color: #94a3b8; text-transform: uppercase;">Incident Types:</span>
          <button class="tag-pill-btn ${this.selectedTag === 'all' ? 'active' : ''}" onclick="window.incidentReportsEngine.setTag('all')">
            <span>✨ All Types</span>
            <span style="opacity: 0.8; font-size: 10px;">(${filtered.length})</span>
          </button>
          ${availableTags.map(([tag, count]) => {
            const icon = this.getTagIcon(tag);
            const style = this.getTagStyle(tag);
            const isSelected = this.selectedTag === tag;
            return `
              <button class="tag-pill-btn ${isSelected ? 'active' : ''}" onclick="window.incidentReportsEngine.setTag('${this.escapeJs(tag)}')" style="${isSelected ? `background: ${style.text}; color: #000; border-color: ${style.text};` : `background: ${style.bg}; color: ${style.text}; border-color: ${style.border};`}">
                <span>${icon} ${this.escapeHtml(tag)}</span>
                <span style="opacity: 0.8; font-size: 10px;">(${count})</span>
              </button>
            `;
          }).join('')}
        </div>

        <!-- Incident Cards Section -->
        <div id="incident-cards-container" style="display: flex; flex-direction: column; gap: 14px;">
          ${this.renderIncidentCards(filtered)}
        </div>

      </div>
    `;
  }

  /**
   * Renders the group of incident cards, grouped by Quarter then listed with full details
   */
  renderIncidentCards(incidents) {
    if (!incidents || incidents.length === 0) {
      return `
        <div style="background: var(--bg-primary); border: 1px dashed var(--border-color); border-radius: 12px; padding: 48px 24px; text-align: center; color: var(--text-muted); margin-top: 20px;">
          <div style="font-size: 42px; margin-bottom: 12px;">🛡️</div>
          <h3 style="font-size: 16px; font-weight: 700; color: #cbd5e1; margin-bottom: 6px;">No Incident Reports Found</h3>
          <p style="font-size: 13px; max-width: 480px; margin: 0 auto 16px auto; color: #94a3b8; line-height: 1.5;">
            ${this.searchQuery ? `No incident reports match "${this.escapeHtml(this.searchQuery)}".` : 'No incident reports logged for this quarter yet. Click "Scan Gmail" to search for new reports from mptablets@mountainpower.com.'}
          </p>
          <button class="btn btn-primary" onclick="window.incidentReportsEngine.scanEmails()" style="font-weight: 700; background: linear-gradient(135deg, #ef4444 0%, #b91c1c 100%); border: none; padding: 8px 18px; border-radius: 6px; color: #fff; cursor: pointer; display: inline-flex; align-items: center; gap: 6px;">
            <span>📬</span> Scan Gmail for Incidents
          </button>
        </div>
      `;
    }

    // Group incidents by Quarter if 'all' quarters is selected
    if (this.selectedQuarter === 'all') {
      const quarters = ['Q4', 'Q3', 'Q2', 'Q1'];
      const qLabels = {
        'Q1': '🌸 Quarter 1: January – March',
        'Q2': '☀️ Quarter 2: April – June',
        'Q3': '🍂 Quarter 3: July – September',
        'Q4': '❄️ Quarter 4: October – December'
      };

      return quarters.map(qKey => {
        const qIncidents = incidents.filter(i => i.quarter === qKey);
        if (qIncidents.length === 0) return '';

        return `
          <div style="margin-bottom: 24px;">
            <div style="display: flex; align-items: center; justify-content: space-between; border-bottom: 2px solid rgba(148, 163, 184, 0.2); padding-bottom: 8px; margin-bottom: 14px;">
              <div style="display: flex; align-items: center; gap: 10px;">
                <h3 style="font-size: 16px; font-weight: 800; color: #f8fafc; margin: 0;">${qLabels[qKey]}</h3>
                <span class="badge" style="background: rgba(96, 165, 250, 0.2); color: #93c5fd; border: 1px solid rgba(96, 165, 250, 0.4); font-size: 11px; padding: 2px 8px; border-radius: 4px; font-weight: 700;">
                  ${qIncidents.length} Incident${qIncidents.length === 1 ? '' : 's'}
                </span>
              </div>
            </div>
            <div style="display: grid; grid-template-columns: 1fr; gap: 14px;">
              ${qIncidents.map(inc => this.renderSingleIncidentCard(inc)).join('')}
            </div>
          </div>
        `;
      }).join('');
    }

    // Single quarter view
    return `
      <div style="display: grid; grid-template-columns: 1fr; gap: 14px;">
        ${incidents.map(inc => this.renderSingleIncidentCard(inc)).join('')}
      </div>
    `;
  }

  /**
   * Renders a single incident card with badges, explanation block, avoidable block, and actions
   */
  renderSingleIncidentCard(inc) {
    const primaryTag = inc.tags[0] || 'General';
    const tagStyle = this.getTagStyle(primaryTag);
    const tagIcon = this.getTagIcon(primaryTag);

    return `
      <div class="incident-card" style="background: var(--bg-primary); border: 1px solid var(--border-color); border-left: 4px solid ${tagStyle.text}; border-radius: 8px; padding: 16px 20px; transition: transform 0.15s ease, box-shadow 0.15s ease; box-shadow: 0 2px 8px rgba(0,0,0,0.25);">
        
        <!-- Card Header: Date, Job #, Foreman, Tags -->
        <div style="display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; flex-wrap: wrap; margin-bottom: 12px;">
          
          <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
            <!-- Date & Time badge -->
            <span style="background: rgba(148, 163, 184, 0.12); color: #e2e8f0; border: 1px solid rgba(148, 163, 184, 0.25); font-size: 12.5px; font-weight: 800; padding: 3px 10px; border-radius: 6px; display: inline-flex; align-items: center; gap: 5px;">
              <span>🗓️</span> ${this.escapeHtml(inc.dateOfIncident)} ${inc.time ? `• ⏰ ${this.escapeHtml(inc.time)}` : ''}
            </span>

            <!-- Job Number Badge -->
            <span style="background: rgba(37, 99, 235, 0.15); color: #60a5fa; border: 1px solid rgba(37, 99, 235, 0.35); font-size: 12px; font-weight: 800; padding: 3px 10px; border-radius: 6px; display: inline-flex; align-items: center; gap: 5px;">
              <span>📍</span> Job #${this.escapeHtml(inc.jobNumber || 'N/A')}
            </span>

            <!-- City / Location if available -->
            ${inc.jobLocation ? `
              <span style="font-size: 12px; color: #94a3b8; font-weight: 600;">
                (${this.escapeHtml(inc.jobLocation)})
              </span>
            ` : ''}

            <!-- Foreman Badge -->
            <span style="background: rgba(16, 185, 129, 0.15); color: #34d399; border: 1px solid rgba(16, 185, 129, 0.35); font-size: 12px; font-weight: 700; padding: 3px 10px; border-radius: 6px; display: inline-flex; align-items: center; gap: 5px;">
              <span>👷 Foreman:</span> <strong>${this.escapeHtml(inc.foreman || 'Unassigned')}</strong>
            </span>

            <!-- Involved Employee(s) -->
            ${inc.involvedEmployees ? `
              <span style="background: rgba(245, 158, 11, 0.12); color: #fbbf24; border: 1px solid rgba(245, 158, 11, 0.3); font-size: 12px; font-weight: 600; padding: 3px 9px; border-radius: 6px; display: inline-flex; align-items: center; gap: 5px;">
                <span>👤</span> ${this.escapeHtml(inc.involvedEmployees)}
              </span>
            ` : ''}
          </div>

          <!-- Incident Type Tag Pills (Split Tags) -->
          <div style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">
            ${inc.tags.map(t => {
              const st = this.getTagStyle(t);
              const ic = this.getTagIcon(t);
              return `
                <span style="background: ${st.bg}; color: ${st.text}; border: 1px solid ${st.border}; font-size: 11.5px; font-weight: 800; padding: 3px 9px; border-radius: 6px; display: inline-flex; align-items: center; gap: 4px;">
                  <span>${ic}</span> ${this.escapeHtml(t)}
                </span>
              `;
            }).join('')}
          </div>

        </div>

        <!-- Optional Equipment / Unit / Ticket metadata bar -->
        ${(inc.unitNumber || inc.ticketNumber || inc.addressLocation) ? `
          <div style="display: flex; align-items: center; gap: 14px; flex-wrap: wrap; font-size: 12px; color: #94a3b8; background: rgba(15, 23, 42, 0.4); border: 1px solid rgba(148, 163, 184, 0.1); border-radius: 6px; padding: 6px 12px; margin-bottom: 12px;">
            ${inc.addressLocation ? `
              <div><strong>Address / Location:</strong> <span style="color: #e2e8f0;">${this.escapeHtml(inc.addressLocation)}</span></div>
            ` : ''}
            ${inc.unitNumber ? `
              <div><strong>Unit #:</strong> <span style="color: #60a5fa; font-weight: 700;">${this.escapeHtml(inc.unitNumber)}</span></div>
            ` : ''}
            ${inc.ticketNumber ? `
              <div><strong>Ticket #:</strong> <span style="color: #f59e0b; font-weight: 700;">${this.escapeHtml(inc.ticketNumber)}</span></div>
            ` : ''}
          </div>
        ` : ''}

        <!-- Explain Incident (Narrative) -->
        <div style="margin-bottom: 12px;">
          <div style="font-size: 11px; text-transform: uppercase; font-weight: 700; color: #94a3b8; margin-bottom: 4px; display: flex; align-items: center; gap: 5px;">
            <span>📝</span> Explanation of Incident:
          </div>
          <div style="font-size: 13px; color: #f1f5f9; line-height: 1.55; background: rgba(30, 41, 59, 0.4); border-left: 3px solid #60a5fa; padding: 10px 14px; border-radius: 0 6px 6px 0;">
            ${this.escapeHtml(inc.explanation || 'No explanation provided.')}
          </div>
        </div>

        <!-- Could Be Avoided / Corrective Actions -->
        ${inc.avoidableActions ? `
          <div style="margin-bottom: 14px;">
            <div style="font-size: 11px; text-transform: uppercase; font-weight: 700; color: #94a3b8; margin-bottom: 4px; display: flex; align-items: center; gap: 5px;">
              <span>🛡️</span> Avoidable / Corrective Actions:
            </div>
            <div style="font-size: 12.5px; color: #cbd5e1; line-height: 1.5; background: rgba(30, 41, 59, 0.3); border-left: 3px solid #10b981; padding: 8px 12px; border-radius: 0 6px 6px 0;">
              ${this.escapeHtml(inc.avoidableActions)}
            </div>
          </div>
        ` : ''}

        <!-- Card Footer: Action Buttons (Photos Lightbox, PDF Viewer, Gmail) -->
        <div style="display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-wrap: wrap; border-top: 1px solid rgba(148, 163, 184, 0.15); padding-top: 10px;">
          
          <div style="display: flex; align-items: center; gap: 8px;">
            <!-- Photos Button -->
            <button class="btn btn-secondary" onclick="window.incidentReportsEngine.openPhotosLightbox('${this.escapeJs(inc.emailId)}', '${this.escapeJs(inc.id)}')" style="font-size: 12px; font-weight: 700; display: inline-flex; align-items: center; gap: 6px; padding: 6px 12px; border-radius: 6px; background: rgba(30, 41, 59, 0.6); color: #cbd5e1; border: 1px solid var(--border-color);">
              <span>📷</span> View Attached Photos ${inc.photoCount > 0 ? `<span class="badge" style="background: rgba(96, 165, 247, 0.2); color: #93c5fd; padding: 1px 6px; border-radius: 4px; font-size: 10.5px; margin-left: 4px;">${inc.photoCount}</span>` : ''}
            </button>

            <!-- PDF Viewer Button -->
            <button class="btn btn-primary" onclick="window.incidentReportsEngine.openPdfViewer('${this.escapeJs(inc.emailId)}', '${this.escapeJs(inc.pdfFilename)}')" style="font-size: 12px; font-weight: 700; display: inline-flex; align-items: center; gap: 6px; padding: 6px 14px; border-radius: 6px; background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%); color: #fff; border: none; box-shadow: 0 2px 6px rgba(37, 99, 235, 0.3);">
              <span>📄</span> View Incident PDF
            </button>
          </div>

          <div style="display: flex; align-items: center; gap: 10px;">
            <!-- Status Badge -->
            <span style="font-size: 11.5px; font-weight: 700; color: #94a3b8;">
              Status: <span style="color: #60a5fa;">${this.escapeHtml(inc.status)}</span>
            </span>

            <!-- Gmail Deep Link -->
            ${inc.emailId ? `
              <button onclick="window.incidentReportsEngine.openEmailInGmail('${this.escapeJs(inc.emailId)}')" class="btn btn-secondary" style="font-size: 11.5px; font-weight: 600; padding: 5px 10px; display: inline-flex; align-items: center; gap: 4px;" title="Open original message in Gmail">
                <span>✉️</span> Gmail
              </button>
            ` : ''}
          </div>

        </div>

      </div>
    `;
  }

  /**
   * Filter controls handlers
   */
  setYear(yr) {
    this.selectedYear = yr;
    this.render();
  }

  setQuarter(q) {
    this.selectedQuarter = q;
    this.render();
  }

  setTag(tag) {
    this.selectedTag = tag;
    this.render();
  }

  onSearchInput(val) {
    this.searchQuery = val;
    this.render();
  }

  /**
   * Scans Gmail for new incident reports from mptablets@mountainpower.com
   */
  async scanEmails() {
    if (this.isScanning) return;
    this.isScanning = true;

    const scanBtn = document.getElementById('btn-scan-incident-emails');
    if (scanBtn) {
      scanBtn.disabled = true;
      scanBtn.innerHTML = `<span>⏳</span> Scanning Gmail...`;
    }

    if (typeof window.showToast === 'function') {
      window.showToast('Scanning Gmail for incident reports from mptablets@mountainpower.com...', 'info');
    }

    try {
      const syncUrl = window.syncEngine ? window.syncEngine.getSyncUrl() : '';
      if (!syncUrl) {
        throw new Error('Sync URL not configured.');
      }

      const payload = {
        action: 'scanIncidentEmails',
        daysBack: 365
      };

      let result = null;
      if (window.syncEngine && typeof window.syncEngine.executeNetworkRequest === 'function') {
        result = await window.syncEngine.executeNetworkRequest(syncUrl, 'POST', payload, 120000);
      } else {
        const resp = await fetch(syncUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        result = await resp.json();
      }

      if (result && result.success) {
        const count = result.newCount || 0;
        if (typeof window.showToast === 'function') {
          window.showToast(count > 0 ? `Successfully logged ${count} new incident report${count === 1 ? '' : 's'}!` : 'Scan complete. All incident reports are up to date.', 'success');
        }

        // Pull updated snapshot from Google Sheets to ensure local DB has the new rows
        if (window.syncEngine && typeof window.syncEngine.pullLatestSnapshot === 'function') {
          await window.syncEngine.pullLatestSnapshot(['incident_reports']);
        }
      } else {
        throw new Error((result && result.error) || 'Failed to scan incident emails.');
      }
    } catch (err) {
      console.error('scanEmails error:', err);
      if (typeof window.showToast === 'function') {
        window.showToast(`Error scanning emails: ${err.message}`, 'error');
      }
    } finally {
      this.isScanning = false;
      if (scanBtn) {
        scanBtn.disabled = false;
        scanBtn.innerHTML = `<span>📬</span> Scan Gmail for Incidents`;
      }
      this.render();
    }
  }

  /**
   * Opens the attached PDF form in the Safety PDF modal
   */
  async openPdfViewer(emailId, pdfFilename) {
    if (!emailId) {
      alert('Email ID missing for this incident report.');
      return;
    }

    const modal = document.getElementById('safety-pdf-modal');
    const titleEl = document.getElementById('safety-pdf-title');
    const subtitleEl = document.getElementById('safety-pdf-subtitle');
    const body = document.getElementById('safety-pdf-body');
    const downloadBtn = document.getElementById('safety-pdf-download');
    const popoutBtn = document.getElementById('safety-pdf-popout');
    const gmailBtn = document.getElementById('safety-pdf-gmail');

    if (!modal || !body) return;

    modal.style.display = 'flex';
    if (titleEl) titleEl.textContent = `Incident Report Form`;
    if (subtitleEl) subtitleEl.textContent = pdfFilename || 'Incident_Report.pdf';
    body.innerHTML = `
      <div style="padding: 40px; text-align: center; color: var(--text-secondary);">
        <div style="font-size: 32px; margin-bottom: 8px;">⏳</div>
        <div>Loading original Incident Report PDF from Gmail...</div>
      </div>
    `;

    try {
      const syncUrl = window.syncEngine ? window.syncEngine.getSyncUrl() : '';
      let pdfData = null;

      // Check cache
      if (this.attachmentsCache.has(emailId) && this.attachmentsCache.get(emailId).pdf) {
        pdfData = this.attachmentsCache.get(emailId).pdf;
      } else {
        const payload = {
          action: 'getIncidentEmailAttachments',
          emailId: emailId
        };

        let resJson = null;
        if (window.syncEngine && typeof window.syncEngine.executeNetworkRequest === 'function') {
          resJson = await window.syncEngine.executeNetworkRequest(syncUrl, 'POST', payload, 60000);
        } else {
          const resp = await fetch(`${syncUrl}?action=getIncidentEmailAttachments&emailId=${encodeURIComponent(emailId)}`);
          resJson = await resp.json();
        }

        if (resJson && resJson.success && resJson.pdf) {
          pdfData = resJson.pdf;
          if (!this.attachmentsCache.has(emailId)) {
            this.attachmentsCache.set(emailId, {});
          }
          this.attachmentsCache.get(emailId).pdf = pdfData;
          if (resJson.photos) {
            this.attachmentsCache.get(emailId).photos = resJson.photos;
          }
        } else {
          throw new Error((resJson && resJson.error) || 'Failed to extract PDF attachment.');
        }
      }

      // Convert base64 to Blob URL
      const byteCharacters = atob(pdfData.base64);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { type: 'application/pdf' });
      const blobUrl = URL.createObjectURL(blob);

      if (downloadBtn) {
        downloadBtn.href = blobUrl;
        downloadBtn.download = pdfData.filename || 'Incident_Report.pdf';
        downloadBtn.onclick = async (e) => {
          if (window.desktopAPI && typeof window.desktopAPI.savePdfToFile === 'function') {
            e.preventDefault();
            await window.desktopAPI.savePdfToFile(pdfData.base64, pdfData.filename || 'Incident_Report.pdf');
          }
        };
      }

      if (popoutBtn) {
        popoutBtn.href = blobUrl;
        popoutBtn.onclick = async (e) => {
          if (window.desktopAPI && typeof window.desktopAPI.openPdfExternally === 'function') {
            e.preventDefault();
            await window.desktopAPI.openPdfExternally(pdfData.base64, pdfData.filename || 'Incident_Report.pdf');
          }
        };
      }

      if (gmailBtn) {
        const gmailUrl = `https://mail.google.com/mail/u/0/#search/${encodeURIComponent(emailId)}`;
        gmailBtn.href = gmailUrl;
        gmailBtn.style.display = 'inline-flex';
        gmailBtn.onclick = (e) => {
          if (window.desktopAPI && typeof window.desktopAPI.openExternal === 'function') {
            e.preventDefault();
            window.desktopAPI.openExternal(gmailUrl);
          }
        };
      }

      body.innerHTML = `
        <object data="${blobUrl}#view=FitH&toolbar=1" type="application/pdf" style="width: 100%; height: 100%; border: none; background: #1e293b;">
          <iframe src="${blobUrl}#view=FitH" style="width: 100%; height: 100%; border: none; background: #1e293b;">
            <div style="padding: 30px; text-align: center; color: var(--text-secondary);">
              <p>Preview cannot be rendered inline in this view.</p>
              <button class="btn btn-primary" onclick="if (window.desktopAPI) window.desktopAPI.openPdfExternally('${pdfData.base64}', '${pdfData.filename || 'Incident_Report.pdf'}')">Open in System PDF Viewer</button>
            </div>
          </iframe>
        </object>
      `;
    } catch (err) {
      body.innerHTML = `
        <div style="padding: 30px; text-align: center; max-width: 500px; color: #f87171;">
          <div style="font-size: 32px; margin-bottom: 12px;">⚠️</div>
          <div style="font-size: 14px; font-weight: 700; margin-bottom: 6px;">Could not load Incident Report PDF</div>
          <div style="font-size: 12px; color: var(--text-secondary); margin-bottom: 20px; line-height: 1.5;">${this.escapeHtml(err.message || 'Unknown error')}</div>
          <button onclick="window.incidentReportsEngine.openEmailInGmail('${this.escapeJs(emailId)}')" class="btn btn-primary" style="font-weight: 700; background: #10b981; border: none; display: inline-flex; align-items: center; gap: 6px; padding: 8px 18px; cursor: pointer; color: white; border-radius: 6px;">
            <span>✉️</span> Open Email in Gmail
          </button>
        </div>
      `;
    }
  }

  /**
   * Opens high-resolution photos lightbox gallery
   */
  async openPhotosLightbox(emailId, incidentId) {
    if (!emailId) {
      alert('Email ID missing for this incident report.');
      return;
    }

    const modal = document.getElementById('incident-photos-lightbox-modal');
    if (!modal) return;

    modal.style.display = 'flex';
    const content = document.getElementById('incident-lightbox-content');
    if (content) {
      content.innerHTML = `
        <div style="padding: 60px; text-align: center; color: #94a3b8;">
          <div style="font-size: 36px; margin-bottom: 10px;">⏳</div>
          <div style="font-size: 15px; font-weight: 700; color: #f1f5f9;">Loading incident photos from Gmail...</div>
        </div>
      `;
    }

    try {
      const syncUrl = window.syncEngine ? window.syncEngine.getSyncUrl() : '';
      let photos = [];

      // Check cache for photos with base64
      if (this.attachmentsCache.has(emailId) && this.attachmentsCache.get(emailId).fullPhotos) {
        photos = this.attachmentsCache.get(emailId).fullPhotos;
      } else {
        const payload = {
          action: 'getIncidentEmailAttachments',
          emailId: emailId,
          includePhotos: true
        };

        let resJson = null;
        if (window.syncEngine && typeof window.syncEngine.executeNetworkRequest === 'function') {
          resJson = await window.syncEngine.executeNetworkRequest(syncUrl, 'POST', payload, 90000);
        } else {
          const resp = await fetch(`${syncUrl}?action=getIncidentEmailAttachments&emailId=${encodeURIComponent(emailId)}&includePhotos=true`);
          resJson = await resp.json();
        }

        if (resJson && resJson.success && resJson.photos) {
          photos = resJson.photos;
          if (!this.attachmentsCache.has(emailId)) {
            this.attachmentsCache.set(emailId, {});
          }
          this.attachmentsCache.get(emailId).fullPhotos = photos;
        } else {
          throw new Error((resJson && resJson.error) || 'Failed to extract attached photos.');
        }
      }

      if (!photos || photos.length === 0) {
        if (content) {
          content.innerHTML = `
            <div style="padding: 60px; text-align: center; color: #94a3b8;">
              <div style="font-size: 36px; margin-bottom: 10px;">📷</div>
              <div style="font-size: 15px; font-weight: 700; color: #cbd5e1;">No Attached Photos Found</div>
              <p style="font-size: 13px; margin-top: 6px;">This incident report did not contain any attached camera pictures.</p>
            </div>
          `;
        }
        return;
      }

      this.lightboxState = {
        isOpen: true,
        emailId: emailId,
        photos: photos,
        currentIndex: 0
      };

      this.renderLightboxCurrentPhoto();
    } catch (err) {
      if (content) {
        content.innerHTML = `
          <div style="padding: 40px; text-align: center; color: #f87171;">
            <div style="font-size: 32px; margin-bottom: 10px;">⚠️</div>
            <div style="font-size: 15px; font-weight: 700; margin-bottom: 6px;">Could not load photos</div>
            <div style="font-size: 12px; color: var(--text-secondary); margin-bottom: 16px;">${this.escapeHtml(err.message || 'Unknown error')}</div>
          </div>
        `;
      }
    }
  }

  /**
   * Renders the active photo in the lightbox modal
   */
  renderLightboxCurrentPhoto() {
    const { photos, currentIndex } = this.lightboxState;
    if (!photos || photos.length === 0) return;

    const curPhoto = photos[currentIndex];
    const content = document.getElementById('incident-lightbox-content');
    const counterEl = document.getElementById('incident-lightbox-counter');
    const titleEl = document.getElementById('incident-lightbox-title');

    if (counterEl) {
      counterEl.textContent = `Photo ${currentIndex + 1} of ${photos.length}`;
    }
    if (titleEl) {
      titleEl.textContent = curPhoto.filename || `Incident Photo #${currentIndex + 1}`;
    }

    const srcUrl = `data:${curPhoto.contentType || 'image/jpeg'};base64,${curPhoto.base64}`;

    if (content) {
      content.innerHTML = `
        <div style="position: relative; width: 100%; height: 100%; display: flex; align-items: center; justify-content: center;">
          <img src="${srcUrl}" alt="Incident Photo" style="max-width: 100%; max-height: 75vh; object-fit: contain; border-radius: 6px; box-shadow: 0 4px 20px rgba(0,0,0,0.5);" />
        </div>
      `;
    }

    // Thumbnail strip below main image
    const strip = document.getElementById('incident-lightbox-thumbnail-strip');
    if (strip) {
      strip.innerHTML = photos.map((p, idx) => {
        const isCur = idx === currentIndex;
        const thumbSrc = `data:${p.contentType || 'image/jpeg'};base64,${p.base64}`;
        return `
          <img src="${thumbSrc}" onclick="window.incidentReportsEngine.setLightboxIndex(${idx})" style="width: 56px; height: 56px; object-fit: cover; border-radius: 4px; cursor: pointer; border: 2px solid ${isCur ? '#3b82f6' : 'rgba(255,255,255,0.2)'}; opacity: ${isCur ? 1 : 0.6}; transition: all 0.15s ease;" />
        `;
      }).join('');
    }
  }

  setLightboxIndex(newIdx) {
    if (!this.lightboxState.photos || this.lightboxState.photos.length === 0) return;
    if (newIdx < 0) newIdx = this.lightboxState.photos.length - 1;
    if (newIdx >= this.lightboxState.photos.length) newIdx = 0;
    this.lightboxState.currentIndex = newIdx;
    this.renderLightboxCurrentPhoto();
  }

  prevLightboxPhoto() {
    this.setLightboxIndex(this.lightboxState.currentIndex - 1);
  }

  nextLightboxPhoto() {
    this.setLightboxIndex(this.lightboxState.currentIndex + 1);
  }

  closeLightbox() {
    const modal = document.getElementById('incident-photos-lightbox-modal');
    if (modal) modal.style.display = 'none';
    this.lightboxState.isOpen = false;
  }

  /**
   * Helper to open the email in Gmail Web
   */
  openEmailInGmail(emailId) {
    if (!emailId) return;
    const cleanId = String(emailId).trim().split('_')[0];
    const url = `https://mail.google.com/mail/u/0/#search/${encodeURIComponent(cleanId)}`;
    if (window.desktopAPI && typeof window.desktopAPI.openExternal === 'function') {
      window.desktopAPI.openExternal(url);
    } else {
      window.open(url, '_blank');
    }
  }

  escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  escapeJs(str) {
    if (!str) return '';
    return String(str).replace(/'/g, "\\'").replace(/"/g, '\\"');
  }
}

window.IncidentReportsEngine = IncidentReportsEngine;
