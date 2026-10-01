/**
 * weekly-summary.js - Weekly Safety Assistant Executive Summary & Monday Morning Briefing
 * 
 * Replaces the retired Google Sheets Monday morning email with a powerful, 
 * offline-first executive briefing engine inside the Safety Assistant Desktop App.
 *
 * Core Capabilities:
 * - Aggregates live data across Safety Compliance, PPE & Equipment Swaps, Expiring Certs,
 *   Training Classes, Trip Planner Field Itinerary, Incident Reports, and DOT Drug Testing.
 * - Interactive multi-level filtering by Physical Location and Reporting Week.
 * - Executive KPI stat cards with drill-down navigation into app workspaces.
 * - Notification Recipient Management: dynamically pulls from the "Notification Emails"
 *   column on the Employees table.
 * - Automated Weekly PDF Archival: natively renders and saves high-res PDF via Electron printToPDF.
 * - Foreman Tailgate Printouts: generates individual 1-page crew tailgate briefing packets with
 *   per-crew compliance, equipment swaps, expiring certs, and pre-filled attendance sign-off rosters.
 * - One-click "Copy Email HTML" (formatted inline CSS email template for Outlook/Gmail).
 * - One-click "Open in Gmail" (pre-filled subject & clean executive plain text summary with BCC distro).
 * - "Print / Save PDF" with high-definition, print-optimized stylesheet.
 * - Auto-detects Monday morning and displays a friendly executive briefing alert.
 */

class WeeklySummaryEngine {
  constructor(db) {
    this.db = db;
    this.selectedLocation = 'all';
    this.selectedWeek = 'current';
    this.cachedData = null;
    this.selectedRecipients = new Set();
    window.weeklySummaryEngine = this;
  }

  init() {
    console.log('WeeklySummaryEngine initialized');
    this.checkMondayMorningPrompt();
  }

  /**
   * Checks if today is Monday and shows an informative banner/toast if not dismissed today.
   */
  checkMondayMorningPrompt() {
    try {
      const today = new Date();
      // Monday = 1
      if (today.getDay() === 1) {
        const dateKey = today.toISOString().split('T')[0];
        const dismissedKey = 'sa_monday_briefing_seen_' + dateKey;
        if (!localStorage.getItem(dismissedKey)) {
          setTimeout(() => {
            this.showMondayToast(dateKey);
          }, 1200);
        }
      }
    } catch (e) {
      console.warn('Monday prompt error:', e);
    }
  }

  showMondayToast(dateKey) {
    const toast = document.createElement('div');
    toast.id = 'monday-briefing-toast';
    toast.style.cssText = `
      position: fixed;
      bottom: 24px;
      right: 24px;
      background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%);
      border: 1px solid #3b82f6;
      border-radius: 10px;
      padding: 16px 20px;
      box-shadow: 0 10px 25px rgba(0, 0, 0, 0.5), 0 0 15px rgba(59, 130, 246, 0.3);
      z-index: 10000;
      color: #f8fafc;
      max-width: 380px;
      display: flex;
      flex-direction: column;
      gap: 10px;
      animation: toastSlideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1);
    `;

    toast.innerHTML = `
      <div style="display: flex; align-items: center; justify-content: space-between;">
        <div style="display: flex; align-items: center; gap: 8px;">
          <span style="font-size: 20px;">🛡️</span>
          <span style="font-weight: 700; font-size: 14px; color: #93c5fd;">Monday Morning Briefing</span>
        </div>
        <button onclick="document.getElementById('monday-briefing-toast').remove()" style="background: none; border: none; color: #94a3b8; font-size: 16px; cursor: pointer; padding: 2px;">✕</button>
      </div>
      <div style="font-size: 12.5px; color: #cbd5e1; line-height: 1.4;">
        Good morning! Your weekly safety compliance, PPE swaps due, and certification forecast are ready.
      </div>
      <div style="display: flex; gap: 8px; justify-content: flex-end; margin-top: 4px;">
        <button class="btn btn-secondary" onclick="localStorage.setItem('${dateKey}', '1'); document.getElementById('monday-briefing-toast').remove();" style="font-size: 11px; padding: 4px 10px;">Dismiss</button>
        <button class="btn btn-primary" onclick="if(window.navigateToView){window.navigateToView('weekly-summary-view');} document.getElementById('monday-briefing-toast').remove();" style="font-size: 11px; font-weight: 700; padding: 4px 12px; background: #2563eb; color: #fff;">View Briefing →</button>
      </div>
    `;

    document.body.appendChild(toast);
  }

  /**
   * Reads and parses all unique recipient email addresses from the
   * "Notification Emails" column on the Employees table.
   */
  getNotificationRecipients() {
    const empTable = this.db ? this.db.getTable('employees') : null;
    if (!empTable || !empTable.rows) return { emails: [], details: [] };

    const emailMap = new Map(); // email -> Set of employee names

    empTable.rows.forEach(r => {
      const empName = String(r['Employee Name'] || r['Name'] || '').trim();
      const raw = String(r['Notification Emails'] || r['Notification Email'] || '').trim();

      if (raw) {
        // Split by comma, semicolon, or whitespace
        const parts = raw.split(/[,;\s]+/);
        parts.forEach(p => {
          const clean = p.trim().toLowerCase();
          if (clean && clean.includes('@') && clean.includes('.')) {
            if (!emailMap.has(clean)) {
              emailMap.set(clean, new Set());
            }
            if (empName) {
              emailMap.get(clean).add(empName);
            }
          }
        });
      }
    });

    const details = [];
    emailMap.forEach((emps, email) => {
      details.push({
        email,
        employees: Array.from(emps)
      });
    });

    details.sort((a, b) => a.email.localeCompare(b.email));
    const emails = details.map(d => d.email);

    return { emails, details };
  }

  /**
   * Helper to normalize date strings to Date object
   */
  parseDate(val) {
    if (!val || val === 'N/A' || val === '—' || val === '-') return null;
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

  formatDateOnly(dt) {
    if (!dt) return '—';
    const m = dt.getMonth() + 1;
    const d = dt.getDate();
    const y = dt.getFullYear();
    return `${m}/${d}/${y}`;
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
    return String(str).replace(/'/g, "\\'").replace(/"/g, '\\"').replace(/\\/g, '\\\\');
  }

  /**
   * Collects and computes the comprehensive weekly status dataset.
   */
  collectWeeklyData() {
    const today = new Date();
    today.setHours(12, 0, 0, 0);

    // Compute Monday of current week
    const dayOfWeek = today.getDay(); // 0 is Sun, 1 is Mon
    const diffToMon = (dayOfWeek === 0 ? -6 : 1) - dayOfWeek;
    const currentMon = new Date(today);
    currentMon.setDate(today.getDate() + diffToMon);
    currentMon.setHours(12, 0, 0, 0);

    const nextSun = new Date(currentMon);
    nextSun.setDate(currentMon.getDate() + 6);
    nextSun.setHours(23, 59, 59, 999);

    // 1. Employee & Crew Maps
    const empTable = this.db ? this.db.getTable('employees') : null;
    const empMap = new Map();
    const activeLocations = new Set(['Helena', 'Bozeman', 'Great Falls', 'Billings', 'Butte', 'Missoula']);
    const crewMembersMap = new Map(); // job -> Array of employee rows

    if (empTable && empTable.rows) {
      empTable.rows.forEach(r => {
        const name = String(r['Employee Name'] || r['Name'] || '').trim();
        const loc = String(r['Location'] || '').trim();
        const crew = String(r['Job Number'] || r['Job #'] || '').trim();
        const title = String(r['Classification'] || r['Role'] || '').trim();

        if (name) {
          empMap.set(name.toLowerCase(), { name, loc, crew, title });
        }
        if (crew) {
          if (!crewMembersMap.has(crew)) crewMembersMap.set(crew, []);
          crewMembersMap.get(crew).push({ name, loc, crew, title });
        }
        if (loc && !loc.toLowerCase().includes('vacation') && !loc.toLowerCase().includes('light duty') && !loc.toLowerCase().includes('weeds')) {
          const cleanLoc = loc.replace(/\s*\(.*?\)\s*/g, '').trim();
          if (cleanLoc) activeLocations.add(cleanLoc);
        }
      });
    }

    // 2. Safety Compliance Analysis
    const compTable = this.db ? this.db.getTable('safety_compliance') : null;
    const compWeeks = [];
    const complianceByCrew = [];
    let compStats = {
      totalCrews: 0,
      completeCount: 0,
      missingCount: 0,
      pendingCount: 0,
      ratePercent: 100,
      missingDetails: []
    };

    if (compTable && compTable.rows && compTable.rows.length > 0) {
      const weekSet = new Set();
      compTable.rows.forEach(r => {
        const wk = String(r['Week Start'] || r['Week'] || '').trim();
        if (wk) weekSet.add(wk);
      });
      compWeeks.push(...Array.from(weekSet));

      // Choose selected week or latest week
      let targetWeek = this.selectedWeek;
      if (targetWeek === 'current' || !compWeeks.includes(targetWeek)) {
        targetWeek = compWeeks[compWeeks.length - 1] || 'Current';
      }

      const rowsInWeek = compTable.rows.filter(r => String(r['Week Start'] || r['Week'] || '').trim() === targetWeek);

      rowsInWeek.forEach(r => {
        const job = String(r['Job Number'] || r['Crew'] || r['Job #'] || '').trim();
        const foreman = String(r['Foreman'] || r['Crew Lead'] || r['Lead'] || '—').trim();
        const loc = String(r['Location'] || '').trim();
        const status = String(r['Status'] || 'Pending').trim();

        // Apply Location filter
        if (this.selectedLocation !== 'all') {
          const cleanLoc = loc.toLowerCase().replace(/\s*\(.*?\)\s*/g, '').trim();
          if (!cleanLoc.includes(this.selectedLocation.toLowerCase())) return;
        }

        const mon = String(r['Mon'] || '⏳').trim();
        const tue = String(r['Tue'] || '⏳').trim();
        const wed = String(r['Wed'] || '⏳').trim();
        const thu = String(r['Thu'] || '⏳').trim();
        const fri = String(r['Fri'] || '—').trim();
        const meeting = String(r['Weekly Meeting'] || '⏳').trim();
        const checklist = String(r['Monthly Checklist'] || '⏳').trim();

        const isComplete = status.toLowerCase() === 'complete' || status.toLowerCase() === 'resolved';
        const isMissing = status.toLowerCase().includes('missing') || [mon, tue, wed, thu, meeting].some(v => v.includes('❌'));

        complianceByCrew.push({
          job, foreman, loc, status,
          mon, tue, wed, thu, fri, meeting, checklist,
          isComplete, isMissing
        });

        compStats.totalCrews++;
        if (isComplete) compStats.completeCount++;
        else if (isMissing) {
          compStats.missingCount++;
          compStats.missingDetails.push({ job, foreman, loc, status });
        } else {
          compStats.pendingCount++;
        }
      });

      if (compStats.totalCrews > 0) {
        compStats.ratePercent = Math.round((compStats.completeCount / compStats.totalCrews) * 100);
      }
    }

    // 3. Multi-Category PPE & Equipment Swaps Analysis
    const swapSheets = [
      { key: 'glove_swaps', label: 'Rubber Gloves', icon: '🧤', cat: 'PPE' },
      { key: 'sleeve_swaps', label: 'Rubber Sleeves', icon: '🦾', cat: 'PPE' },
      { key: 'blanket_swaps', label: 'Insulating Blankets', icon: '🛏️', cat: 'PPE' },
      { key: 'mack_swaps', label: 'MACKs', icon: '⚡', cat: 'Equipment' },
      { key: 'hv_tester_swaps', label: 'HV Testers', icon: '⚡', cat: 'Equipment' },
      { key: 'phasing_set_swaps', label: 'Phasing Sets', icon: '⚡', cat: 'Equipment' },
      { key: 'ground_swaps', label: 'Grounds', icon: '🧰', cat: 'Equipment' },
      { key: 'hot_stick_swaps', label: 'Hot Sticks', icon: '🔴', cat: 'Equipment' }
    ];

    const swapsDueThisWeek = [];
    const swapsOverdue = [];
    const swapsCountsByCategory = {};

    swapSheets.forEach(sw => {
      swapsCountsByCategory[sw.key] = { label: sw.label, icon: sw.icon, total: 0, overdue: 0, dueThisWeek: 0 };
      const tbl = this.db ? this.db.getTable(sw.key) : null;
      if (tbl && tbl.rows) {
        tbl.rows.forEach(r => {
          const employee = String(r['Employee'] || r['Assigned To'] || r['Name'] || '').trim();
          const currentItem = String(r['Current Glove #'] || r['Current Sleeve #'] || r['Current Item #'] || r['Serial #'] || r['Item #'] || '').trim();
          const pickItem = String(r['Pick List Item #'] || r['Pick List Glove #'] || r['Pick List Sleeve #'] || r['Pick List Blanket #'] || r['Pick List MACK #'] || r['Pick List'] || '').trim();
          const loc = String(r['Location'] || '').trim();
          const stage = String(r['Status'] || r['Stage'] || '').trim();

          // Skip if already swapped/archived
          if (stage.toLowerCase().includes('complete') || stage.toLowerCase().includes('archived') || stage.toLowerCase().includes('swapped')) {
            return;
          }

          // Apply Location filter
          if (this.selectedLocation !== 'all') {
            const cleanLoc = loc.toLowerCase().replace(/\s*\(.*?\)\s*/g, '').trim();
            if (!cleanLoc.includes(this.selectedLocation.toLowerCase())) return;
          }

          const dueDateRaw = r['Change Out Date'] || r['Due Date'] || r['Test Date'];
          const dueDt = this.parseDate(dueDateRaw);

          const empInfo = empMap.get(employee.toLowerCase()) || {};
          const crew = empInfo.crew || String(r['Job Number'] || r['Job #'] || '').trim();

          const itemRecord = {
            categoryKey: sw.key,
            categoryLabel: sw.label,
            icon: sw.icon,
            employee,
            crew,
            currentItem,
            pickItem: (pickItem && pickItem !== '—' && pickItem !== '-') ? pickItem : null,
            location: loc || empInfo.loc || '—',
            size: r['Size'] || r['KV'] || r['Model'] || r['Class'] || '—',
            dueDate: dueDt ? this.formatDateOnly(dueDt) : String(dueDateRaw || '—'),
            dueDt,
            isOverdue: false,
            isDueThisWeek: false
          };

          if (dueDt) {
            if (dueDt < today) {
              itemRecord.isOverdue = true;
              swapsOverdue.push(itemRecord);
              swapsCountsByCategory[sw.key].overdue++;
              swapsCountsByCategory[sw.key].total++;
            } else if (dueDt >= currentMon && dueDt <= nextSun) {
              itemRecord.isDueThisWeek = true;
              swapsDueThisWeek.push(itemRecord);
              swapsCountsByCategory[sw.key].dueThisWeek++;
              swapsCountsByCategory[sw.key].total++;
            }
          } else {
            // No date or pending
            itemRecord.isDueThisWeek = true;
            swapsDueThisWeek.push(itemRecord);
            swapsCountsByCategory[sw.key].dueThisWeek++;
            swapsCountsByCategory[sw.key].total++;
          }
        });
      }
    });

    // 4. Expiring Certifications Analysis
    const certTable = this.db ? this.db.getTable('expiring_certs') : null;
    const certsUrgent = [];   // < 30 days or expired
    const certsUpcoming = []; // 30 - 60 days
    const certsFuture = [];   // 60 - 90 days

    if (certTable && certTable.rows) {
      certTable.rows.forEach(r => {
        const emp = String(r['Employee Name'] || r['Name'] || '').trim();
        const cert = String(r['Item Type'] || r['Cert Type'] || '').trim();
        const expRaw = r['Expiration Date'] || r['Expires'];
        const loc = String(r['Location'] || '').trim();
        const status = String(r['Status'] || '').trim();

        if (!emp || !cert || !expRaw || expRaw === 'N/A' || expRaw === 'No Date Set') return;

        // Apply Location filter
        if (this.selectedLocation !== 'all') {
          const cleanLoc = loc.toLowerCase().replace(/\s*\(.*?\)\s*/g, '').trim();
          if (!cleanLoc.includes(this.selectedLocation.toLowerCase())) return;
        }

        const expDt = this.parseDate(expRaw);
        if (!expDt) return;

        const diffDays = Math.round((expDt.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
        const empInfo = empMap.get(emp.toLowerCase()) || {};
        const crew = empInfo.crew || String(r['Job Number'] || r['Job #'] || '').trim();

        const certObj = {
          employee: emp,
          crew,
          cert,
          location: loc || empInfo.loc || '—',
          expirationDate: this.formatDateOnly(expDt),
          diffDays,
          status
        };

        if (diffDays <= 30) {
          certsUrgent.push(certObj);
        } else if (diffDays <= 60) {
          certsUpcoming.push(certObj);
        } else if (diffDays <= 90) {
          certsFuture.push(certObj);
        }
      });

      // Sort by urgency (lowest days remaining first)
      certsUrgent.sort((a, b) => a.diffDays - b.diffDays);
      certsUpcoming.sort((a, b) => a.diffDays - b.diffDays);
    }

    // 5. Training Classes Scheduled for This Week
    const trainTable = this.db ? this.db.getTable('training_tracking') : null;
    const trainingThisWeek = [];

    if (trainTable && trainTable.rows) {
      trainTable.rows.forEach(r => {
        const title = String(r['Class'] || r['Training Topic'] || r['Course'] || r['Title'] || '').trim();
        const dateRaw = r['Date'] || r['Scheduled Date'];
        const loc = String(r['Location'] || '').trim();
        const instructor = String(r['Instructor'] || r['Lead'] || '—').trim();
        const attendees = String(r['Attendees'] || r['Crew'] || '').trim();
        const status = String(r['Status'] || '').trim();

        if (!title && !dateRaw) return;

        const dt = this.parseDate(dateRaw);
        if (dt && dt >= currentMon && dt <= nextSun) {
          if (this.selectedLocation !== 'all') {
            const cleanLoc = loc.toLowerCase().replace(/\s*\(.*?\)\s*/g, '').trim();
            if (!cleanLoc.includes(this.selectedLocation.toLowerCase())) return;
          }

          trainingThisWeek.push({
            title: title || 'Scheduled Safety Training',
            date: this.formatDateOnly(dt),
            location: loc || '—',
            instructor,
            attendees: attendees ? attendees.split(',').length : 0,
            status: status || 'Scheduled'
          });
        }
      });
    }

    // 6. Recent Incident Reports (past 14 days)
    const recentIncidents = [];
    const fourteenDaysAgo = new Date(today);
    fourteenDaysAgo.setDate(today.getDate() - 14);

    if (window.incidentReportsEngine && Array.isArray(window.incidentReportsEngine.incidents)) {
      window.incidentReportsEngine.incidents.forEach(inc => {
        const dt = inc.date instanceof Date ? inc.date : this.parseDate(inc.date);
        if (dt && dt >= fourteenDaysAgo) {
          recentIncidents.push({
            date: this.formatDateOnly(dt),
            job: inc.jobNumber || '—',
            foreman: inc.foreman || '—',
            type: Array.isArray(inc.tags) ? inc.tags.join(', ') : (inc.incidentType || 'Incident'),
            description: inc.description || 'Incident report received via tablet',
            hasPhotos: (inc.photos && inc.photos.length > 0)
          });
        }
      });
    }

    // 7. Notification Recipients (from Notification Emails column on Employees page)
    const recipientsData = this.getNotificationRecipients();

    return {
      today,
      currentMon,
      nextSun,
      weekRangeStr: `${this.formatDateOnly(currentMon)} – ${this.formatDateOnly(nextSun)}`,
      locations: Array.from(activeLocations).sort(),
      recipients: recipientsData,
      crewMembersMap,
      compliance: {
        weeks: compWeeks,
        stats: compStats,
        crews: complianceByCrew
      },
      swaps: {
        dueThisWeek: swapsDueThisWeek,
        overdue: swapsOverdue,
        byCategory: swapsCountsByCategory,
        totalActionRequired: swapsDueThisWeek.length + swapsOverdue.length
      },
      certs: {
        urgent: certsUrgent,
        upcoming: certsUpcoming,
        future: certsFuture,
        totalExpiring: certsUrgent.length + certsUpcoming.length
      },
      training: trainingThisWeek,
      incidents: recentIncidents
    };
  }

  /**
   * Main render function that outputs the rich interactive workspace.
   */
  render() {
    const container = document.getElementById('weekly-summary-content');
    if (!container) return;

    const data = this.collectWeeklyData();
    this.cachedData = data;

    const badgeEl = document.getElementById('weekly-summary-badge');
    if (badgeEl) {
      badgeEl.textContent = `Week of ${this.formatDateOnly(data.currentMon)}`;
    }

    container.innerHTML = `
      <div style="padding: 20px; display: flex; flex-direction: column; gap: 20px; max-width: 1300px; margin: 0 auto; color: var(--text-primary);">
        
        <!-- Filter and View Controls Bar -->
        <div style="display: flex; justify-content: space-between; align-items: center; background: var(--bg-card); border: 1px solid var(--border-color); border-radius: 8px; padding: 12px 18px; flex-wrap: wrap; gap: 12px;">
          <div style="display: flex; align-items: center; gap: 12px; flex-wrap: wrap;">
            <div style="display: flex; align-items: center; gap: 6px;">
              <span style="font-size: 12px; font-weight: 700; color: #94a3b8; text-transform: uppercase;">Location:</span>
              <select id="weekly-summary-loc-select" onchange="window.weeklySummaryEngine.setLocationFilter(this.value)" style="background: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: 6px; padding: 6px 12px; color: #60a5fa; font-size: 13px; font-weight: 700; outline: none; cursor: pointer;">
                <option value="all" ${this.selectedLocation === 'all' ? 'selected' : ''}>🌐 All Physical Locations</option>
                ${data.locations.map(loc => `<option value="${this.escapeHtml(loc)}" ${this.selectedLocation === loc ? 'selected' : ''}>📍 ${this.escapeHtml(loc)}</option>`).join('')}
              </select>
            </div>

            <div style="display: flex; align-items: center; gap: 6px;">
              <span style="font-size: 12px; font-weight: 700; color: #94a3b8; text-transform: uppercase;">Week:</span>
              <select id="weekly-summary-week-select" onchange="window.weeklySummaryEngine.setWeekFilter(this.value)" style="background: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: 6px; padding: 6px 12px; color: #34d399; font-size: 13px; font-weight: 700; outline: none; cursor: pointer;">
                <option value="current">Current Week (${data.weekRangeStr})</option>
                ${data.compliance.weeks.map(wk => `<option value="${this.escapeHtml(wk)}" ${this.selectedWeek === wk ? 'selected' : ''}>Week of ${this.escapeHtml(wk)}</option>`).join('')}
              </select>
            </div>

            <!-- Recipient Distro Badge (from Notification Emails column on Employees page) -->
            <button class="btn btn-secondary" onclick="window.weeklySummaryEngine.openRecipientsModal()" style="font-size: 12px; font-weight: 600; display: inline-flex; align-items: center; gap: 6px; border-color: rgba(59, 130, 246, 0.4); background: rgba(59, 130, 246, 0.12); color: #93c5fd;" title="View management recipient list detected from the Notification Emails column on the Employees page">
              <span>👥</span> ${data.recipients.emails.length} Notification Emails
            </button>
          </div>

          <!-- Quick Action Buttons -->
          <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
            <button class="btn btn-secondary" onclick="window.weeklySummaryEngine.openTailgateModal()" style="font-size: 12px; font-weight: 700; display: inline-flex; align-items: center; gap: 6px; border-color: #f59e0b; color: #fbbf24;" title="Generate per-crew 1-page Foreman Tailgate packets with compliance, swaps, and attendance sign-off">
              <span>👷</span> Foreman Tailgate Sheets
            </button>
            <button class="btn btn-secondary" onclick="window.weeklySummaryEngine.archiveWeeklyPdf()" style="font-size: 12px; font-weight: 600; display: inline-flex; align-items: center; gap: 6px; border-color: #3b82f6; color: #93c5fd;" title="Directly archive weekly report to PDF via Electron printToPDF">
              <span>💾</span> Archive PDF
            </button>
            <button class="btn btn-secondary" onclick="window.weeklySummaryEngine.copyEmailHtml()" style="font-size: 12px; font-weight: 600; display: inline-flex; align-items: center; gap: 6px; border-color: #3b82f6; color: #93c5fd;" title="Copy styled executive HTML summary to clipboard for Outlook / Gmail">
              <span>📋</span> Copy HTML
            </button>
            <button class="btn btn-secondary" onclick="window.weeklySummaryEngine.openInGmail()" style="font-size: 12px; font-weight: 600; display: inline-flex; align-items: center; gap: 6px; border-color: #10b981; color: #34d399;" title="Draft new Gmail message with summary and BCC Notification Emails">
              <span>📧</span> Open in Gmail
            </button>
            <button class="btn btn-secondary" onclick="window.weeklySummaryEngine.printSummary()" style="font-size: 12px; font-weight: 600; display: inline-flex; align-items: center; gap: 6px;" title="Print executive briefing or save as PDF">
              <span>🖨️</span> Print
            </button>
            <button class="btn btn-primary" onclick="window.weeklySummaryEngine.render()" style="font-size: 12px; font-weight: 700; background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%); display: inline-flex; align-items: center; gap: 6px;" title="Refresh live snapshot metrics">
              <span>🔄</span> Refresh
            </button>
          </div>
        </div>

        <!-- Executive KPI Stat Cards Bar -->
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 14px;">
          <!-- Compliance Card -->
          <div onclick="if(window.navigateToView){window.navigateToView('safety-compliance-view');}" style="background: var(--bg-card); border: 1px solid var(--border-color); border-radius: 8px; padding: 14px 16px; cursor: pointer; transition: transform 0.15s, border-color 0.15s;" onmouseover="this.style.borderColor='#3b82f6'" onmouseout="this.style.borderColor='var(--border-color)'">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
              <span style="font-size: 11px; font-weight: 700; color: #94a3b8; text-transform: uppercase;">Safety Compliance</span>
              <span style="font-size: 16px;">🛡️</span>
            </div>
            <div style="font-size: 24px; font-weight: 800; color: ${data.compliance.stats.ratePercent >= 90 ? '#34d399' : (data.compliance.stats.ratePercent >= 75 ? '#fbbf24' : '#ef4444')};">
              ${data.compliance.stats.ratePercent}%
            </div>
            <div style="font-size: 11px; color: #64748b; margin-top: 4px;">
              ${data.compliance.stats.completeCount} of ${data.compliance.stats.totalCrews} crews complete
            </div>
          </div>

          <!-- PPE & Equipment Swaps Card -->
          <div onclick="if(window.navigateToView){window.navigateToView('sheets-view');}" style="background: var(--bg-card); border: 1px solid var(--border-color); border-radius: 8px; padding: 14px 16px; cursor: pointer; transition: transform 0.15s, border-color 0.15s;" onmouseover="this.style.borderColor='#3b82f6'" onmouseout="this.style.borderColor='var(--border-color)'">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
              <span style="font-size: 11px; font-weight: 700; color: #94a3b8; text-transform: uppercase;">Equipment Swaps</span>
              <span style="font-size: 16px;">🔄</span>
            </div>
            <div style="font-size: 24px; font-weight: 800; color: ${data.swaps.overdue.length > 0 ? '#ef4444' : (data.swaps.dueThisWeek.length > 0 ? '#fbbf24' : '#34d399')};">
              ${data.swaps.totalActionRequired} Due
            </div>
            <div style="font-size: 11px; color: #64748b; margin-top: 4px;">
              ${data.swaps.overdue.length > 0 ? `🔴 ${data.swaps.overdue.length} overdue · ` : ''}${data.swaps.dueThisWeek.length} due this week
            </div>
          </div>

          <!-- Expiring Certs Card -->
          <div onclick="if(window.navigateToView){window.navigateToView('expiring-certs-view');}" style="background: var(--bg-card); border: 1px solid var(--border-color); border-radius: 8px; padding: 14px 16px; cursor: pointer; transition: transform 0.15s, border-color 0.15s;" onmouseover="this.style.borderColor='#3b82f6'" onmouseout="this.style.borderColor='var(--border-color)'">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
              <span style="font-size: 11px; font-weight: 700; color: #94a3b8; text-transform: uppercase;">Certs Expiring</span>
              <span style="font-size: 16px;">📜</span>
            </div>
            <div style="font-size: 24px; font-weight: 800; color: ${data.certs.urgent.length > 0 ? '#f87171' : (data.certs.upcoming.length > 0 ? '#fbbf24' : '#34d399')};">
              ${data.certs.totalExpiring}
            </div>
            <div style="font-size: 11px; color: #64748b; margin-top: 4px;">
              ${data.certs.urgent.length} urgent (&lt; 30d) · ${data.certs.upcoming.length} upcoming
            </div>
          </div>

          <!-- Training Classes Card -->
          <div onclick="if(window.navigateToView){window.navigateToView('training-view');}" style="background: var(--bg-card); border: 1px solid var(--border-color); border-radius: 8px; padding: 14px 16px; cursor: pointer; transition: transform 0.15s, border-color 0.15s;" onmouseover="this.style.borderColor='#3b82f6'" onmouseout="this.style.borderColor='var(--border-color)'">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
              <span style="font-size: 11px; font-weight: 700; color: #94a3b8; text-transform: uppercase;">Training Classes</span>
              <span style="font-size: 16px;">🎓</span>
            </div>
            <div style="font-size: 24px; font-weight: 800; color: #60a5fa;">
              ${data.training.length}
            </div>
            <div style="font-size: 11px; color: #64748b; margin-top: 4px;">
              Scheduled safety courses this week
            </div>
          </div>

          <!-- Recent Incidents Card -->
          <div onclick="if(window.navigateToView){window.navigateToView('incident-reports-view');}" style="background: var(--bg-card); border: 1px solid var(--border-color); border-radius: 8px; padding: 14px 16px; cursor: pointer; transition: transform 0.15s, border-color 0.15s;" onmouseover="this.style.borderColor='#3b82f6'" onmouseout="this.style.borderColor='var(--border-color)'">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
              <span style="font-size: 11px; font-weight: 700; color: #94a3b8; text-transform: uppercase;">Recent Incidents</span>
              <span style="font-size: 16px;">⚠️</span>
            </div>
            <div style="font-size: 24px; font-weight: 800; color: ${data.incidents.length > 0 ? '#fb923c' : '#34d399'};">
              ${data.incidents.length}
            </div>
            <div style="font-size: 11px; color: #64748b; margin-top: 4px;">
              Past 14 days (tablet reports)
            </div>
          </div>
        </div>

        <!-- Section 1: Safety Compliance Pulse -->
        <div style="background: var(--bg-card); border: 1px solid var(--border-color); border-radius: 8px; overflow: hidden;">
          <div style="padding: 14px 18px; background: rgba(30, 41, 59, 0.7); border-bottom: 1px solid var(--border-color); display: flex; justify-content: space-between; align-items: center;">
            <div style="display: flex; align-items: center; gap: 8px;">
              <span style="font-size: 16px;">🛡️</span>
              <h3 style="font-size: 14px; font-weight: 700; margin: 0; color: #f8fafc;">Safety Compliance Pulse</h3>
              <span class="brand-badge" style="background: rgba(59, 130, 246, 0.2); color: #93c5fd; border: 1px solid rgba(59, 130, 246, 0.4);">
                ${data.compliance.stats.totalCrews} Active Crews Tracked
              </span>
            </div>
            <div style="font-size: 12px; color: #94a3b8;">
              Target Week: <strong style="color: #60a5fa;">${data.weekRangeStr}</strong>
            </div>
          </div>

          <div style="padding: 16px;">
            ${this.renderComplianceSectionHtml(data.compliance)}
          </div>
        </div>

        <!-- Section 2: Full-Fleet PPE & Equipment Readiness -->
        <div style="background: var(--bg-card); border: 1px solid var(--border-color); border-radius: 8px; overflow: hidden;">
          <div style="padding: 14px 18px; background: rgba(30, 41, 59, 0.7); border-bottom: 1px solid var(--border-color); display: flex; justify-content: space-between; align-items: center;">
            <div style="display: flex; align-items: center; gap: 8px;">
              <span style="font-size: 16px;">🧤</span>
              <h3 style="font-size: 14px; font-weight: 700; margin: 0; color: #f8fafc;">PPE & Equipment Swaps Required</h3>
              <span class="brand-badge" style="background: ${data.swaps.totalActionRequired > 0 ? 'rgba(239, 68, 68, 0.2)' : 'rgba(16, 185, 129, 0.2)'}; color: ${data.swaps.totalActionRequired > 0 ? '#fca5a5' : '#4ade80'}; border: 1px solid ${data.swaps.totalActionRequired > 0 ? 'rgba(239, 68, 68, 0.4)' : 'rgba(16, 185, 129, 0.4)'};">
                ${data.swaps.totalActionRequired} Action Items
              </span>
            </div>
            <div style="font-size: 12px; color: #94a3b8;">
              Gloves, Sleeves, Blankets, MACKs, Grounds, Hot Sticks, Testers
            </div>
          </div>

          <div style="padding: 16px;">
            ${this.renderSwapsSectionHtml(data.swaps)}
          </div>
        </div>

        <!-- Two Column Grid: Certifications & Training Forecast -->
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px;">
          
          <!-- Column A: Expiring Certifications -->
          <div style="background: var(--bg-card); border: 1px solid var(--border-color); border-radius: 8px; overflow: hidden;">
            <div style="padding: 14px 18px; background: rgba(30, 41, 59, 0.7); border-bottom: 1px solid var(--border-color); display: flex; justify-content: space-between; align-items: center;">
              <div style="display: flex; align-items: center; gap: 8px;">
                <span style="font-size: 16px;">📜</span>
                <h3 style="font-size: 14px; font-weight: 700; margin: 0; color: #f8fafc;">Expiring Certifications</h3>
              </div>
              <span style="font-size: 12px; color: #f87171; font-weight: 700;">${data.certs.urgent.length} &lt; 30 Days</span>
            </div>
            <div style="padding: 16px;">
              ${this.renderCertsSectionHtml(data.certs)}
            </div>
          </div>

          <!-- Column B: Training Schedule This Week -->
          <div style="background: var(--bg-card); border: 1px solid var(--border-color); border-radius: 8px; overflow: hidden;">
            <div style="padding: 14px 18px; background: rgba(30, 41, 59, 0.7); border-bottom: 1px solid var(--border-color); display: flex; justify-content: space-between; align-items: center;">
              <div style="display: flex; align-items: center; gap: 8px;">
                <span style="font-size: 16px;">🎓</span>
                <h3 style="font-size: 14px; font-weight: 700; margin: 0; color: #f8fafc;">Scheduled Safety Training</h3>
              </div>
              <span style="font-size: 12px; color: #60a5fa; font-weight: 700;">${data.training.length} Classes</span>
            </div>
            <div style="padding: 16px;">
              ${this.renderTrainingSectionHtml(data.training)}
            </div>
          </div>

        </div>

        <!-- Section 4: Recent Incident Reports Digest -->
        <div style="background: var(--bg-card); border: 1px solid var(--border-color); border-radius: 8px; overflow: hidden;">
          <div style="padding: 14px 18px; background: rgba(30, 41, 59, 0.7); border-bottom: 1px solid var(--border-color); display: flex; justify-content: space-between; align-items: center;">
            <div style="display: flex; align-items: center; gap: 8px;">
              <span style="font-size: 16px;">⚠️</span>
              <h3 style="font-size: 14px; font-weight: 700; margin: 0; color: #f8fafc;">Recent Incident Reports (Past 14 Days)</h3>
              <span class="brand-badge" style="background: rgba(245, 158, 11, 0.2); color: #fcd34d; border: 1px solid rgba(245, 158, 11, 0.4);">
                ${data.incidents.length} Reported
              </span>
            </div>
            <div style="font-size: 12px; color: #94a3b8;">
              Logged via mptablets@mountainpower.com
            </div>
          </div>

          <div style="padding: 16px;">
            ${this.renderIncidentsSectionHtml(data.incidents)}
          </div>
        </div>

      </div>
    `;
  }

  renderComplianceSectionHtml(compliance) {
    if (!compliance.crews || compliance.crews.length === 0) {
      return `<div style="text-align: center; padding: 24px; color: #94a3b8; font-size: 13px;">No compliance data found for the selected location or week.</div>`;
    }

    let html = `
      <div style="overflow-x: auto;">
        <table style="width: 100%; border-collapse: collapse; font-size: 12.5px; text-align: left;">
          <thead>
            <tr style="border-bottom: 2px solid var(--border-color); color: #94a3b8; font-weight: 700; text-transform: uppercase; font-size: 11px;">
              <th style="padding: 8px 12px;">Crew / Job</th>
              <th style="padding: 8px 12px;">Foreman</th>
              <th style="padding: 8px 12px;">Location</th>
              <th style="padding: 8px 8px; text-align: center;">Mon</th>
              <th style="padding: 8px 8px; text-align: center;">Tue</th>
              <th style="padding: 8px 8px; text-align: center;">Wed</th>
              <th style="padding: 8px 8px; text-align: center;">Thu</th>
              <th style="padding: 8px 8px; text-align: center;">Weekly Mtg</th>
              <th style="padding: 8px 8px; text-align: center;">Monthly Check</th>
              <th style="padding: 8px 12px; text-align: right;">Status</th>
            </tr>
          </thead>
          <tbody>
    `;

    compliance.crews.forEach(c => {
      const isMissing = c.isMissing;
      const rowBg = isMissing ? 'rgba(239, 68, 68, 0.08)' : 'transparent';

      html += `
        <tr style="border-bottom: 1px solid var(--border-color); background: ${rowBg};">
          <td style="padding: 10px 12px; font-weight: 700; color: #60a5fa;">
            <a href="javascript:void(0)" onclick="if(window.navigateToView){window.navigateToView('safety-compliance-view');}" style="color: #60a5fa; text-decoration: none;">${this.escapeHtml(c.job)}</a>
          </td>
          <td style="padding: 10px 12px; font-weight: 600; color: #f8fafc;">${this.escapeHtml(c.foreman)}</td>
          <td style="padding: 10px 12px; color: #94a3b8;">${this.escapeHtml(c.loc)}</td>
          <td style="padding: 10px 8px; text-align: center;">${c.mon}</td>
          <td style="padding: 10px 8px; text-align: center;">${c.tue}</td>
          <td style="padding: 10px 8px; text-align: center;">${c.wed}</td>
          <td style="padding: 10px 8px; text-align: center;">${c.thu}</td>
          <td style="padding: 10px 8px; text-align: center;">${c.meeting}</td>
          <td style="padding: 10px 8px; text-align: center;">${c.checklist}</td>
          <td style="padding: 10px 12px; text-align: right;">
            <span style="display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 700; ${c.isComplete ? 'background: rgba(16, 185, 129, 0.2); color: #34d399; border: 1px solid rgba(16, 185, 129, 0.4);' : (isMissing ? 'background: rgba(239, 68, 68, 0.25); color: #fca5a5; border: 1px solid rgba(239, 68, 68, 0.5);' : 'background: rgba(245, 158, 11, 0.2); color: #fcd34d; border: 1px solid rgba(245, 158, 11, 0.4);')}">
              ${this.escapeHtml(c.status)}
            </span>
          </td>
        </tr>
      `;
    });

    html += `
          </tbody>
        </table>
      </div>
    `;

    return html;
  }

  renderSwapsSectionHtml(swaps) {
    const allSwaps = [...swaps.overdue, ...swaps.dueThisWeek];

    if (allSwaps.length === 0) {
      return `
        <div style="text-align: center; padding: 28px; color: #34d399; font-size: 13px; font-weight: 600;">
          ✅ All electrical PPE and safety equipment are fully up-to-date for this location. Zero swaps overdue or due this week!
        </div>
      `;
    }

    let html = `
      <!-- Category Counts Summary Pills -->
      <div style="display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 16px;">
    `;

    Object.values(swaps.byCategory).forEach(cat => {
      if (cat.total > 0) {
        html += `
          <div style="display: flex; align-items: center; gap: 6px; padding: 6px 12px; background: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: 6px; font-size: 12px;">
            <span>${cat.icon}</span>
            <span style="font-weight: 600; color: #cbd5e1;">${cat.label}:</span>
            <span style="font-weight: 800; color: ${cat.overdue > 0 ? '#f87171' : '#fbbf24'};">${cat.total}</span>
          </div>
        `;
      }
    });

    html += `
      </div>

      <div style="overflow-x: auto;">
        <table style="width: 100%; border-collapse: collapse; font-size: 12.5px; text-align: left;">
          <thead>
            <tr style="border-bottom: 2px solid var(--border-color); color: #94a3b8; font-weight: 700; text-transform: uppercase; font-size: 11px;">
              <th style="padding: 8px 12px;">Type</th>
              <th style="padding: 8px 12px;">Assigned To</th>
              <th style="padding: 8px 12px;">Crew</th>
              <th style="padding: 8px 12px;">Current Item #</th>
              <th style="padding: 8px 12px;">Size / KV</th>
              <th style="padding: 8px 12px;">Location</th>
              <th style="padding: 8px 12px;">Change-Out Date</th>
              <th style="padding: 8px 12px;">Ready Replacement</th>
              <th style="padding: 8px 12px; text-align: right;">Urgency</th>
            </tr>
          </thead>
          <tbody>
    `;

    allSwaps.forEach(item => {
      html += `
        <tr style="border-bottom: 1px solid var(--border-color); background: ${item.isOverdue ? 'rgba(239, 68, 68, 0.08)' : 'transparent'};">
          <td style="padding: 10px 12px; font-weight: 600; color: #93c5fd;">
            ${item.icon} ${this.escapeHtml(item.categoryLabel)}
          </td>
          <td style="padding: 10px 12px; font-weight: 700; color: #f8fafc;">
            <a href="javascript:void(0)" onclick="if(window.employeeProfileEngine){window.employeeProfileEngine.openProfile('${this.escapeJs(item.employee)}');}" style="color: #f8fafc; text-decoration: none;">
              ${this.escapeHtml(item.employee)}
            </a>
          </td>
          <td style="padding: 10px 12px; color: #60a5fa; font-weight: 600;">${this.escapeHtml(item.crew || '—')}</td>
          <td style="padding: 10px 12px; font-family: monospace; font-weight: 700; color: #cbd5e1;">${this.escapeHtml(item.currentItem)}</td>
          <td style="padding: 10px 12px; color: #94a3b8;">${this.escapeHtml(item.size)}</td>
          <td style="padding: 10px 12px; color: #94a3b8;">${this.escapeHtml(item.location)}</td>
          <td style="padding: 10px 12px; color: ${item.isOverdue ? '#f87171' : '#fbbf24'}; font-weight: 700;">${this.escapeHtml(item.dueDate)}</td>
          <td style="padding: 10px 12px;">
            ${item.pickItem ? `<span style="background: rgba(16, 185, 129, 0.2); color: #34d399; padding: 2px 6px; border-radius: 4px; font-size: 11px; font-weight: 700; border: 1px solid rgba(16, 185, 129, 0.4);">📦 Picked: ${this.escapeHtml(item.pickItem)}</span>` : '<span style="color: #64748b; font-size: 11px;">Needed from Stock</span>'}
          </td>
          <td style="padding: 10px 12px; text-align: right;">
            <span style="display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 700; ${item.isOverdue ? 'background: #ef4444; color: #fff;' : 'background: rgba(245, 158, 11, 0.2); color: #fcd34d; border: 1px solid rgba(245, 158, 11, 0.4);'}">
              ${item.isOverdue ? 'OVERDUE' : 'Due This Week'}
            </span>
          </td>
        </tr>
      `;
    });

    html += `
          </tbody>
        </table>
      </div>
    `;

    return html;
  }

  renderCertsSectionHtml(certs) {
    const list = [...certs.urgent, ...certs.upcoming];
    if (list.length === 0) {
      return `<div style="text-align: center; padding: 24px; color: #34d399; font-size: 13px;">✅ Zero certifications expiring in the next 60 days.</div>`;
    }

    let html = `
      <div style="overflow-x: auto; max-height: 380px;">
        <table style="width: 100%; border-collapse: collapse; font-size: 12px; text-align: left;">
          <thead>
            <tr style="border-bottom: 2px solid var(--border-color); color: #94a3b8; font-weight: 700; text-transform: uppercase; font-size: 10.5px;">
              <th style="padding: 6px 10px;">Employee</th>
              <th style="padding: 6px 10px;">Crew</th>
              <th style="padding: 6px 10px;">Certification</th>
              <th style="padding: 6px 10px;">Location</th>
              <th style="padding: 6px 10px;">Expires</th>
              <th style="padding: 6px 10px; text-align: right;">Days Left</th>
            </tr>
          </thead>
          <tbody>
    `;

    list.slice(0, 15).forEach(c => {
      const isUrgent = c.diffDays <= 30;
      html += `
        <tr style="border-bottom: 1px solid var(--border-color); background: ${isUrgent ? 'rgba(239, 68, 68, 0.08)' : 'transparent'};">
          <td style="padding: 8px 10px; font-weight: 700; color: #f8fafc;">
            <a href="javascript:void(0)" onclick="if(window.employeeProfileEngine){window.employeeProfileEngine.openProfile('${this.escapeJs(c.employee)}');}" style="color: #f8fafc; text-decoration: none;">
              ${this.escapeHtml(c.employee)}
            </a>
          </td>
          <td style="padding: 8px 10px; color: #60a5fa; font-weight: 600;">${this.escapeHtml(c.crew || '—')}</td>
          <td style="padding: 8px 10px; color: #93c5fd; font-weight: 600;">${this.escapeHtml(c.cert)}</td>
          <td style="padding: 8px 10px; color: #94a3b8;">${this.escapeHtml(c.location)}</td>
          <td style="padding: 8px 10px; color: ${isUrgent ? '#f87171' : '#fbbf24'}; font-weight: 700;">${this.escapeHtml(c.expirationDate)}</td>
          <td style="padding: 8px 10px; text-align: right;">
            <span style="padding: 2px 6px; border-radius: 4px; font-size: 11px; font-weight: 700; ${isUrgent ? 'background: #ef4444; color: white;' : 'background: rgba(245, 158, 11, 0.2); color: #fcd34d;'}">
              ${c.diffDays <= 0 ? 'EXPIRED' : `${c.diffDays}d`}
            </span>
          </td>
        </tr>
      `;
    });

    html += `
          </tbody>
        </table>
      </div>
    `;

    return html;
  }

  renderTrainingSectionHtml(training) {
    if (!training || training.length === 0) {
      return `<div style="text-align: center; padding: 24px; color: #94a3b8; font-size: 13px;">No safety training sessions scheduled for this week.</div>`;
    }

    let html = `
      <div style="display: flex; flex-direction: column; gap: 10px;">
    `;

    training.forEach(t => {
      html += `
        <div style="background: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: 6px; padding: 12px 14px; display: flex; justify-content: space-between; align-items: center;">
          <div style="display: flex; flex-direction: column; gap: 3px;">
            <div style="font-weight: 700; font-size: 13px; color: #f8fafc;">${this.escapeHtml(t.title)}</div>
            <div style="font-size: 11.5px; color: #94a3b8;">
              📍 ${this.escapeHtml(t.location)} · 👨‍🏫 Instructor: <strong style="color: #cbd5e1;">${this.escapeHtml(t.instructor)}</strong>
            </div>
          </div>
          <div style="text-align: right;">
            <div style="font-size: 12px; font-weight: 700; color: #60a5fa;">📅 ${this.escapeHtml(t.date)}</div>
            <div style="font-size: 11px; color: #34d399; font-weight: 600;">👥 ${t.attendees} Enrolled</div>
          </div>
        </div>
      `;
    });

    html += `</div>`;
    return html;
  }

  renderIncidentsSectionHtml(incidents) {
    if (!incidents || incidents.length === 0) {
      return `<div style="text-align: center; padding: 24px; color: #34d399; font-size: 13px; font-weight: 600;">✅ Clean Safety Record: Zero incident reports submitted in the past 14 days.</div>`;
    }

    let html = `
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 12px;">
    `;

    incidents.forEach(inc => {
      html += `
        <div style="background: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: 6px; padding: 12px 14px; border-left: 3px solid #f97316;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
            <span style="font-size: 11px; font-weight: 700; color: #fb923c;">⚠️ ${this.escapeHtml(inc.type)}</span>
            <span style="font-size: 11.5px; color: #94a3b8;">${this.escapeHtml(inc.date)}</span>
          </div>
          <div style="font-size: 13px; font-weight: 700; color: #f8fafc; margin-bottom: 4px;">Job ${this.escapeHtml(inc.job)} · Foreman ${this.escapeHtml(inc.foreman)}</div>
          <div style="font-size: 12px; color: #cbd5e1; line-height: 1.4;">${this.escapeHtml(inc.description)}</div>
          ${inc.hasPhotos ? '<div style="margin-top: 6px; font-size: 11px; color: #60a5fa; font-weight: 600;">📷 High-Res Photos Attached</div>' : ''}
        </div>
      `;
    });

    html += `</div>`;
    return html;
  }

  setLocationFilter(loc) {
    this.selectedLocation = loc;
    this.render();
  }

  setWeekFilter(wk) {
    this.selectedWeek = wk;
    this.render();
  }

  /**
   * Modal to inspect all detected recipients from the Notification Emails column.
   */
  openRecipientsModal() {
    const existingModal = document.getElementById('weekly-recipients-modal');
    if (existingModal) existingModal.remove();

    const data = this.cachedData || this.collectWeeklyData();
    const recipients = data.recipients;

    const modal = document.createElement('div');
    modal.id = 'weekly-recipients-modal';
    modal.style.cssText = 'position: fixed; inset: 0; background: rgba(0,0,0,0.75); backdrop-filter: blur(4px); z-index: 10000; display: flex; align-items: center; justify-content: center; padding: 20px;';

    let listHtml = '';
    if (recipients.details.length === 0) {
      listHtml = `
        <div style="text-align: center; padding: 30px; color: #94a3b8; font-size: 13px;">
          No notification email addresses found in the <strong>Notification Emails</strong> column on the Employees page.
          <br><br>
          <span style="font-size: 12px; color: #64748b;">Add emails to employees on the Employees table or their Employee Profile to build your distribution list.</span>
        </div>
      `;
    } else {
      listHtml = `
        <div style="max-height: 380px; overflow-y: auto; display: flex; flex-direction: column; gap: 8px;">
          ${recipients.details.map(d => `
            <div style="background: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: 6px; padding: 10px 14px; display: flex; justify-content: space-between; align-items: center;">
              <div>
                <div style="font-size: 13px; font-weight: 700; color: #60a5fa;">${this.escapeHtml(d.email)}</div>
                <div style="font-size: 11px; color: #94a3b8; margin-top: 2px;">
                  Listed for: <strong style="color: #cbd5e1;">${this.escapeHtml(d.employees.join(', ') || 'Employee')}</strong>
                </div>
              </div>
              <span style="font-size: 10px; font-weight: 700; background: rgba(16, 185, 129, 0.2); color: #34d399; padding: 2px 6px; border-radius: 4px; border: 1px solid rgba(16, 185, 129, 0.4);">ACTIVE</span>
            </div>
          `).join('')}
        </div>
      `;
    }

    modal.innerHTML = `
      <div style="background: var(--bg-card); border: 1px solid var(--border-color); border-radius: 10px; width: 100%; max-width: 580px; box-shadow: 0 10px 30px rgba(0,0,0,0.5); overflow: hidden; display: flex; flex-direction: column;">
        
        <div style="padding: 16px 20px; background: rgba(30, 41, 59, 0.8); border-bottom: 1px solid var(--border-color); display: flex; justify-content: space-between; align-items: center;">
          <div style="display: flex; align-items: center; gap: 8px;">
            <span style="font-size: 18px;">👥</span>
            <h3 style="font-size: 15px; font-weight: 700; margin: 0; color: #f8fafc;">Notification Email Distribution</h3>
            <span class="brand-badge" style="background: rgba(59, 130, 246, 0.2); color: #93c5fd;">${recipients.emails.length} Addresses</span>
          </div>
          <button onclick="document.getElementById('weekly-recipients-modal').remove()" style="background: none; border: none; color: #94a3b8; font-size: 18px; cursor: pointer;">✕</button>
        </div>

        <div style="padding: 18px 20px;">
          <p style="font-size: 12px; color: #94a3b8; margin-top: 0; margin-bottom: 14px;">
            These addresses are dynamically pulled from the <strong>Notification Emails</strong> column on the Employees table. When drafting via Gmail or copying summary text, this distribution list is automatically pre-filled into BCC.
          </p>

          ${listHtml}
        </div>

        <div style="padding: 12px 20px; background: rgba(15, 23, 42, 0.5); border-top: 1px solid var(--border-color); display: flex; justify-content: space-between; align-items: center;">
          <button class="btn btn-secondary" onclick="navigator.clipboard.writeText('${this.escapeJs(recipients.emails.join(', '))}'); alert('📋 ${recipients.emails.length} emails copied to clipboard!');" style="font-size: 12px;">
            📋 Copy All Emails
          </button>
          <button class="btn btn-primary" onclick="document.getElementById('weekly-recipients-modal').remove()" style="font-size: 12px; font-weight: 700;">
            Close
          </button>
        </div>

      </div>
    `;

    document.body.appendChild(modal);
  }

  /**
   * Modal to generate and print individual Foreman Tailgate Packets.
   */
  openTailgateModal() {
    const existingModal = document.getElementById('tailgate-sheets-modal');
    if (existingModal) existingModal.remove();

    const data = this.cachedData || this.collectWeeklyData();
    const activeCrews = data.compliance.crews || [];

    const modal = document.createElement('div');
    modal.id = 'tailgate-sheets-modal';
    modal.style.cssText = 'position: fixed; inset: 0; background: rgba(0,0,0,0.75); backdrop-filter: blur(4px); z-index: 10000; display: flex; align-items: center; justify-content: center; padding: 20px;';

    modal.innerHTML = `
      <div style="background: var(--bg-card); border: 1px solid var(--border-color); border-radius: 10px; width: 100%; max-width: 620px; box-shadow: 0 10px 30px rgba(0,0,0,0.5); overflow: hidden; display: flex; flex-direction: column;">
        
        <div style="padding: 16px 20px; background: rgba(30, 41, 59, 0.8); border-bottom: 1px solid var(--border-color); display: flex; justify-content: space-between; align-items: center;">
          <div style="display: flex; align-items: center; gap: 8px;">
            <span style="font-size: 18px;">👷</span>
            <h3 style="font-size: 15px; font-weight: 700; margin: 0; color: #f8fafc;">Foreman Tailgate Sheets Generator</h3>
          </div>
          <button onclick="document.getElementById('tailgate-sheets-modal').remove()" style="background: none; border: none; color: #94a3b8; font-size: 18px; cursor: pointer;">✕</button>
        </div>

        <div style="padding: 20px;">
          <p style="font-size: 12.5px; color: #cbd5e1; margin-top: 0; line-height: 1.4;">
            Generate printable 1-page tailgate briefing packets customized for each field foreman. Includes crew safety compliance, PPE change-out dates due, expiring crew certifications, and a <strong>pre-filled crew attendance sign-off log</strong>.
          </p>

          <div style="margin: 16px 0;">
            <label style="display: block; font-size: 12px; font-weight: 700; color: #94a3b8; margin-bottom: 6px; text-transform: uppercase;">Select Crew / Scope:</label>
            <select id="tailgate-crew-select" style="width: 100%; background: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: 6px; padding: 8px 12px; color: #60a5fa; font-size: 13px; font-weight: 700; outline: none;">
              <option value="all">📦 All Active Crews (${activeCrews.length} Packets — 1 page per crew)</option>
              ${activeCrews.map(c => `
                <option value="${this.escapeHtml(c.job)}">Crew ${this.escapeHtml(c.job)} — Foreman ${this.escapeHtml(c.foreman)} (${this.escapeHtml(c.loc)})</option>
              `).join('')}
            </select>
          </div>

          <div style="background: rgba(59, 130, 246, 0.1); border: 1px solid rgba(59, 130, 246, 0.3); border-radius: 6px; padding: 12px 14px; font-size: 12px; color: #93c5fd; line-height: 1.4;">
            💡 <strong>Tailgate Ready:</strong> Sheets are formatted with CSS page breaks so printing "All Active Crews" produces clean, separate 1-page handouts ready for field delivery.
          </div>
        </div>

        <div style="padding: 14px 20px; background: rgba(15, 23, 42, 0.5); border-top: 1px solid var(--border-color); display: flex; justify-content: flex-end; gap: 10px;">
          <button class="btn btn-secondary" onclick="document.getElementById('tailgate-sheets-modal').remove()">Cancel</button>
          <button class="btn btn-primary" onclick="window.weeklySummaryEngine.printTailgateSheets()" style="font-weight: 700; background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); color: #000; border: none;">
            🖨️ Generate & Print Tailgate Sheets
          </button>
        </div>

      </div>
    `;

    document.body.appendChild(modal);
  }

  /**
   * Generates the inner HTML for a single crew's 1-page Tailgate Briefing Sheet.
   */
  generateTailgateSheetHtml(crew, data) {
    // 1. Crew PPE Swaps
    const crewSwaps = [...data.swaps.overdue, ...data.swaps.dueThisWeek].filter(
      s => s.crew === crew.job || (s.location && crew.loc && s.location.toLowerCase().includes(crew.loc.toLowerCase()))
    );

    // 2. Crew Expiring Certs
    const crewCerts = [...data.certs.urgent, ...data.certs.upcoming].filter(c => c.crew === crew.job);

    // 3. Crew Members Roster
    const members = (data.crewMembersMap && data.crewMembersMap.get(crew.job)) || [];

    return `
      <!-- Header -->
      <div style="border: 2px solid #000; padding: 12px 16px; margin-bottom: 14px; display: flex; justify-content: space-between; align-items: center; background: #fff;">
        <div>
          <div style="font-size: 16px; font-weight: 900; letter-spacing: -0.5px; color: #000;">MOUNTAIN POWER · SAFETY TAILGATE BRIEFING</div>
          <div style="font-size: 13px; font-weight: 700; margin-top: 3px; color: #000;">
            CREW ${this.escapeHtml(crew.job)} · FOREMAN: ${this.escapeHtml(crew.foreman).toUpperCase()} (${this.escapeHtml(crew.loc)})
          </div>
        </div>
        <div style="text-align: right; font-size: 12px; font-weight: 700; color: #000;">
          WEEK: ${this.escapeHtml(data.weekRangeStr)}<br>
          <span style="font-size: 10px; font-weight: 500; color: #475569;">Safety Assistant Field Edition</span>
        </div>
      </div>

      <!-- Section 1: Crew Compliance -->
      <div style="font-size: 12.5px; font-weight: 800; text-transform: uppercase; border-bottom: 2px solid #000; padding-bottom: 3px; margin: 12px 0 8px 0; color: #000;">
        1. Crew Safety Compliance Tracker
      </div>
      <table style="width: 100%; border-collapse: collapse; font-size: 11px; margin-bottom: 10px; color: #000;">
        <thead>
          <tr style="background: #f1f5f9;">
            <th style="border: 1px solid #000; padding: 5px 8px; text-align: center; font-weight: 800;">Monday JHA</th>
            <th style="border: 1px solid #000; padding: 5px 8px; text-align: center; font-weight: 800;">Tuesday JHA</th>
            <th style="border: 1px solid #000; padding: 5px 8px; text-align: center; font-weight: 800;">Wednesday JHA</th>
            <th style="border: 1px solid #000; padding: 5px 8px; text-align: center; font-weight: 800;">Thursday JHA</th>
            <th style="border: 1px solid #000; padding: 5px 8px; text-align: center; font-weight: 800;">Weekly Safety Mtg</th>
            <th style="border: 1px solid #000; padding: 5px 8px; text-align: center; font-weight: 800;">Monthly Inspection</th>
            <th style="border: 1px solid #000; padding: 5px 8px; text-align: right; font-weight: 800;">Status</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style="border: 1px solid #000; padding: 5px 8px; text-align: center; font-weight: 700;">${crew.mon}</td>
            <td style="border: 1px solid #000; padding: 5px 8px; text-align: center; font-weight: 700;">${crew.tue}</td>
            <td style="border: 1px solid #000; padding: 5px 8px; text-align: center; font-weight: 700;">${crew.wed}</td>
            <td style="border: 1px solid #000; padding: 5px 8px; text-align: center; font-weight: 700;">${crew.thu}</td>
            <td style="border: 1px solid #000; padding: 5px 8px; text-align: center; font-weight: 700;">${crew.meeting}</td>
            <td style="border: 1px solid #000; padding: 5px 8px; text-align: center; font-weight: 700;">${crew.checklist}</td>
            <td style="border: 1px solid #000; padding: 5px 8px; text-align: right; font-weight: 800;">${this.escapeHtml(crew.status)}</td>
          </tr>
        </tbody>
      </table>

      <!-- Section 2: PPE & Equipment Swaps -->
      <div style="font-size: 12.5px; font-weight: 800; text-transform: uppercase; border-bottom: 2px solid #000; padding-bottom: 3px; margin: 12px 0 8px 0; color: #000;">
        2. PPE & Equipment Change-Outs Due (${crewSwaps.length})
      </div>
      ${crewSwaps.length === 0 ? `
        <div style="font-size: 11px; padding: 6px 10px; border: 1px solid #000; margin-bottom: 10px; font-weight: 600; background: #f8fafc; color: #000;">
          ✓ All electrical PPE (gloves, sleeves, blankets, MACKs, grounds, hot sticks) are current for this crew.
        </div>
      ` : `
        <table style="width: 100%; border-collapse: collapse; font-size: 11px; margin-bottom: 10px; color: #000;">
          <thead>
            <tr style="background: #f1f5f9;">
              <th style="border: 1px solid #000; padding: 5px 8px; font-weight: 800;">Type</th>
              <th style="border: 1px solid #000; padding: 5px 8px; font-weight: 800;">Assigned Employee</th>
              <th style="border: 1px solid #000; padding: 5px 8px; font-weight: 800;">Current Item #</th>
              <th style="border: 1px solid #000; padding: 5px 8px; font-weight: 800;">Size / Class</th>
              <th style="border: 1px solid #000; padding: 5px 8px; font-weight: 800;">Change-Out Date</th>
              <th style="border: 1px solid #000; padding: 5px 8px; font-weight: 800;">Replacement Status</th>
            </tr>
          </thead>
          <tbody>
            ${crewSwaps.map(s => `
              <tr>
                <td style="border: 1px solid #000; padding: 5px 8px; font-weight: 700;">${this.escapeHtml(s.categoryLabel)}</td>
                <td style="border: 1px solid #000; padding: 5px 8px; font-weight: 800;">${this.escapeHtml(s.employee)}</td>
                <td style="border: 1px solid #000; padding: 5px 8px; font-family: monospace;">${this.escapeHtml(s.currentItem)}</td>
                <td style="border: 1px solid #000; padding: 5px 8px;">${this.escapeHtml(s.size)}</td>
                <td style="border: 1px solid #000; padding: 5px 8px; font-weight: 800; color: ${s.isOverdue ? '#b91c1c' : '#000'};">${this.escapeHtml(s.dueDate)} ${s.isOverdue ? '(OVERDUE)' : ''}</td>
                <td style="border: 1px solid #000; padding: 5px 8px;">${s.pickItem ? `✅ Replacement Picked: ${this.escapeHtml(s.pickItem)}` : '⚠️ Needed from Stock'}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `}

      <!-- Section 3: Expiring Certifications -->
      <div style="font-size: 12.5px; font-weight: 800; text-transform: uppercase; border-bottom: 2px solid #000; padding-bottom: 3px; margin: 12px 0 8px 0; color: #000;">
        3. Crew Member Certifications Expiring &lt; 60 Days (${crewCerts.length})
      </div>
      ${crewCerts.length === 0 ? `
        <div style="font-size: 11px; padding: 6px 10px; border: 1px solid #000; margin-bottom: 10px; font-weight: 600; background: #f8fafc; color: #000;">
          ✓ All crew member credentials (CPR, First Aid, OSHA 10/30, Crane, Diggers) are up to date.
        </div>
      ` : `
        <table style="width: 100%; border-collapse: collapse; font-size: 11px; margin-bottom: 10px; color: #000;">
          <thead>
            <tr style="background: #f1f5f9;">
              <th style="border: 1px solid #000; padding: 5px 8px; font-weight: 800;">Crew Member</th>
              <th style="border: 1px solid #000; padding: 5px 8px; font-weight: 800;">Certification</th>
              <th style="border: 1px solid #000; padding: 5px 8px; font-weight: 800;">Expiration Date</th>
              <th style="border: 1px solid #000; padding: 5px 8px; text-align: right; font-weight: 800;">Days Remaining</th>
            </tr>
          </thead>
          <tbody>
            ${crewCerts.map(c => `
              <tr>
                <td style="border: 1px solid #000; padding: 5px 8px; font-weight: 800;">${this.escapeHtml(c.employee)}</td>
                <td style="border: 1px solid #000; padding: 5px 8px;">${this.escapeHtml(c.cert)}</td>
                <td style="border: 1px solid #000; padding: 5px 8px; font-weight: 700;">${this.escapeHtml(c.expirationDate)}</td>
                <td style="border: 1px solid #000; padding: 5px 8px; text-align: right; font-weight: 800; color: ${c.diffDays <= 30 ? '#b91c1c' : '#000'};">${c.diffDays} Days</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `}

      <!-- Section 4: Tailgate Topic & Attendance Sign-Off -->
      <div style="font-size: 12.5px; font-weight: 800; text-transform: uppercase; border-bottom: 2px solid #000; padding-bottom: 3px; margin: 12px 0 8px 0; color: #000;">
        4. Safety Tailgate Meeting Sign-Off & Attendance
      </div>
      <div style="border: 1px solid #000; padding: 8px 10px; margin-bottom: 10px; min-height: 48px; font-size: 11px; background: #fff; color: #000;">
        <strong>Topic / Hazard Discussion Notes:</strong>
      </div>

      <table style="width: 100%; border-collapse: collapse; font-size: 11px; margin-bottom: 10px; color: #000;">
        <thead>
          <tr style="background: #f1f5f9;">
            <th style="border: 1px solid #000; padding: 5px 8px; width: 35%; font-weight: 800;">Employee Name</th>
            <th style="border: 1px solid #000; padding: 5px 8px; width: 25%; font-weight: 800;">Classification</th>
            <th style="border: 1px solid #000; padding: 5px 8px; width: 25%; font-weight: 800;">Signature</th>
            <th style="border: 1px solid #000; padding: 5px 8px; width: 15%; font-weight: 800;">Date</th>
          </tr>
        </thead>
        <tbody>
          ${members.length > 0 ? members.map(m => `
            <tr style="height: 28px;">
              <td style="border: 1px solid #000; padding: 5px 8px; font-weight: 700;">${this.escapeHtml(m.name)}</td>
              <td style="border: 1px solid #000; padding: 5px 8px;">${this.escapeHtml(m.title || 'Lineman / Operator')}</td>
              <td style="border: 1px solid #000; padding: 5px 8px;"></td>
              <td style="border: 1px solid #000; padding: 5px 8px;"></td>
            </tr>
          `).join('') : `
            <tr style="height: 28px;"><td style="border: 1px solid #000; padding: 5px 8px;">${this.escapeHtml(crew.foreman)}</td><td style="border: 1px solid #000; padding: 5px 8px;">Foreman</td><td style="border: 1px solid #000; padding: 5px 8px;"></td><td style="border: 1px solid #000; padding: 5px 8px;"></td></tr>
            <tr style="height: 28px;"><td style="border: 1px solid #000; padding: 5px 8px;"></td><td style="border: 1px solid #000; padding: 5px 8px;">Lineman</td><td style="border: 1px solid #000; padding: 5px 8px;"></td><td style="border: 1px solid #000; padding: 5px 8px;"></td></tr>
            <tr style="height: 28px;"><td style="border: 1px solid #000; padding: 5px 8px;"></td><td style="border: 1px solid #000; padding: 5px 8px;">Apprentice</td><td style="border: 1px solid #000; padding: 5px 8px;"></td><td style="border: 1px solid #000; padding: 5px 8px;"></td></tr>
            <tr style="height: 28px;"><td style="border: 1px solid #000; padding: 5px 8px;"></td><td style="border: 1px solid #000; padding: 5px 8px;">Groundman</td><td style="border: 1px solid #000; padding: 5px 8px;"></td><td style="border: 1px solid #000; padding: 5px 8px;"></td></tr>
          `}
        </tbody>
      </table>

      <div style="margin-top: 14px; padding-top: 8px; font-size: 10px; color: #475569; display: flex; justify-content: space-between; border-top: 1px solid #cbd5e1;">
        <span>Foreman Sign-off: _______________________________</span>
        <span>Date: _______________</span>
        <span>Safety Assistant Field Edition</span>
      </div>
    `;
  }

  /**
   * Generates the complete HTML document containing tailgate sheets for the specified crews.
   */
  generateTailgateFullHtml(crewsToPrint, data, isPrint = false) {
    return `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="utf-8">
        <title>Mountain Power — Safety Tailgate Briefing Packets</title>
        <style>
          * { box-sizing: border-box; }
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; margin: 0; padding: 20px; color: #000; background: #fff; }
          .tailgate-sheet { page-break-after: always; padding: 10px 0; min-height: 98vh; display: flex; flex-direction: column; }
          .tailgate-sheet:last-child { page-break-after: auto; }
          @media print {
            body { padding: 0 !important; }
            .tailgate-sheet { page-break-after: always !important; }
          }
        </style>
      </head>
      <body>
        ${crewsToPrint.map(crew => `
          <div class="tailgate-sheet">
            ${this.generateTailgateSheetHtml(crew, data)}
          </div>
        `).join('')}
        ${isPrint ? `
          <script>
            window.onload = function() {
              window.print();
            };
          </script>
        ` : ''}
      </body>
      </html>
    `;
  }

  /**
   * Dedicated Workspace renderer for the full Tailgate Generator view.
   */
  renderTailgateWorkspace(targetScope = null) {
    const container = document.getElementById('tailgate-workspace-content');
    if (!container) return;

    const data = this.cachedData || this.collectWeeklyData();
    this.cachedData = data;
    const activeCrews = data.compliance.crews || [];

    // Populate or sync the workspace crew selector
    const select = document.getElementById('tailgate-workspace-crew-select');
    if (select) {
      const currentVal = targetScope !== null ? targetScope : (select.value || 'all');
      select.innerHTML = `
        <option value="all" ${currentVal === 'all' ? 'selected' : ''}>📦 All Active Crews (${activeCrews.length} Packets — 1 Page Per Crew)</option>
        ${activeCrews.map(c => `
          <option value="${this.escapeHtml(c.job)}" ${currentVal === c.job ? 'selected' : ''}>
            Crew ${this.escapeHtml(c.job)} — Foreman ${this.escapeHtml(c.foreman)} (${this.escapeHtml(c.loc)})
          </option>
        `).join('')}
      `;
      targetScope = select.value;
    } else if (targetScope === null) {
      targetScope = 'all';
    }

    const crewsToDisplay = targetScope === 'all' ? activeCrews : activeCrews.filter(c => c.job === targetScope);

    // Update badge
    const badge = document.getElementById('tailgate-badge');
    if (badge) {
      badge.textContent = targetScope === 'all' ? `${activeCrews.length} Packets` : `Crew ${targetScope}`;
    }

    if (crewsToDisplay.length === 0) {
      container.innerHTML = `
        <div style="text-align: center; padding: 60px 20px; color: #94a3b8;">
          <div style="font-size: 40px; margin-bottom: 12px;">👷</div>
          <h3 style="font-size: 16px; color: #f8fafc; margin-bottom: 8px;">No Active Crews Found</h3>
          <p style="font-size: 13px; max-width: 450px; margin: 0 auto;">
            Ensure crew assignments are imported and active in Job Tracking to generate customized Foreman Tailgate packets.
          </p>
        </div>
      `;
      return;
    }

    // Render briefing sheet preview container
    let html = `
      <div style="max-width: 900px; margin: 0 auto; display: flex; flex-direction: column; gap: 20px;">
        
        <!-- Live Workspace Header Banner -->
        <div style="background: rgba(30, 41, 59, 0.7); border: 1px solid rgba(245, 158, 11, 0.3); border-radius: 8px; padding: 14px 18px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px;">
          <div>
            <div style="font-size: 13px; font-weight: 700; color: #fbbf24; display: flex; align-items: center; gap: 6px;">
              <span>👷</span> Live Tailgate Packet Preview
            </div>
            <div style="font-size: 11.5px; color: #94a3b8; margin-top: 2px;">
              Showing ${crewsToDisplay.length} of ${activeCrews.length} crew packet(s) · Formatted with CSS page breaks for 1-page per crew printing.
            </div>
          </div>
          <div style="display: flex; gap: 8px;">
            <button class="btn btn-secondary" onclick="window.weeklySummaryEngine.archiveTailgatePdf()" style="font-size: 12px; font-weight: 600; border-color: #3b82f6; color: #93c5fd;">
              💾 Save PDF
            </button>
            <button class="btn btn-primary" onclick="window.weeklySummaryEngine.printTailgateSheets()" style="font-size: 12px; font-weight: 700; background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); color: #000; border: none;">
              🖨️ Print Sheets
            </button>
          </div>
        </div>

        <!-- Rendered Sheet Pages (White Paper Appearance on Dark Canvas) -->
        <div style="display: flex; flex-direction: column; gap: 24px;">
          ${crewsToDisplay.map(crew => `
            <div style="background: #ffffff; color: #000000; border-radius: 6px; box-shadow: 0 8px 30px rgba(0,0,0,0.5); padding: 32px 36px; border: 1px solid #e2e8f0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
              ${this.generateTailgateSheetHtml(crew, data)}
            </div>
          `).join('')}
        </div>

      </div>
    `;

    container.innerHTML = html;
  }

  onTailgateCrewChange(scope) {
    this.renderTailgateWorkspace(scope);
  }

  /**
   * Generates and prints the Foreman Tailgate Packet.
   */
  printTailgateSheets() {
    const modalSelect = document.getElementById('tailgate-crew-select');
    const workspaceSelect = document.getElementById('tailgate-workspace-crew-select');
    const targetScope = (modalSelect && modalSelect.offsetParent !== null)
      ? modalSelect.value
      : (workspaceSelect ? workspaceSelect.value : (modalSelect ? modalSelect.value : 'all'));

    const data = this.cachedData || this.collectWeeklyData();
    const activeCrews = data.compliance.crews || [];
    const crewsToPrint = targetScope === 'all' ? activeCrews : activeCrews.filter(c => c.job === targetScope);

    if (crewsToPrint.length === 0) {
      alert('⚠️ No crews selected for printing.');
      return;
    }

    const printWin = window.open('', '_blank', 'width=900,height=800');
    if (!printWin) {
      alert('⚠️ Popup blocked. Please allow popups to print tailgate sheets.');
      return;
    }

    const sheetsHtml = this.generateTailgateFullHtml(crewsToPrint, data, true);

    printWin.document.open();
    printWin.document.write(sheetsHtml);
    printWin.document.close();

    const m = document.getElementById('tailgate-sheets-modal');
    if (m) m.remove();
  }

  /**
   * Automatically archives the Foreman Tailgate sheets as a PDF using Electron printToPDF.
   */
  async archiveTailgatePdf() {
    const modalSelect = document.getElementById('tailgate-crew-select');
    const workspaceSelect = document.getElementById('tailgate-workspace-crew-select');
    const targetScope = (modalSelect && modalSelect.offsetParent !== null)
      ? modalSelect.value
      : (workspaceSelect ? workspaceSelect.value : (modalSelect ? modalSelect.value : 'all'));

    const data = this.cachedData || this.collectWeeklyData();
    const activeCrews = data.compliance.crews || [];
    const crewsToPrint = targetScope === 'all' ? activeCrews : activeCrews.filter(c => c.job === targetScope);

    if (crewsToPrint.length === 0) {
      alert('⚠️ No crews selected for archiving.');
      return;
    }

    const html = this.generateTailgateFullHtml(crewsToPrint, data, false);
    const dateStr = data.today.toISOString().split('T')[0];
    const defaultFilename = targetScope === 'all'
      ? `Foreman_Tailgate_Packets_All_Crews_${dateStr}.pdf`
      : `Foreman_Tailgate_Crew_${targetScope.replace(/[^a-zA-Z0-9_-]/g, '_')}_${dateStr}.pdf`;

    if (window.desktopAPI && typeof window.desktopAPI.saveHtmlToPdf === 'function') {
      try {
        const res = await window.desktopAPI.saveHtmlToPdf(html, defaultFilename);
        if (res.canceled) return;
        if (res.success) {
          alert(`✅ Foreman Tailgate PDF archived successfully!\n\nSaved to: ${res.filePath}`);
        } else {
          alert(`⚠️ PDF Archival failed: ${res.error || 'Unknown error'}`);
        }
      } catch (err) {
        alert('⚠️ PDF Archival error: ' + err.message);
      }
    } else {
      this.printTailgateSheets();
    }
  }

  /**
   * Automatically archives the weekly briefing as a PDF using Electron's native printToPDF.
   */
  async archiveWeeklyPdf() {
    const data = this.cachedData || this.collectWeeklyData();
    const html = this.generateEmailHtml();
    const dateStr = data.today.toISOString().split('T')[0];
    const defaultFilename = `Safety_Assistant_Weekly_Summary_${dateStr}.pdf`;

    // 1. If running inside Electron desktop app with desktopAPI
    if (window.desktopAPI && typeof window.desktopAPI.saveHtmlToPdf === 'function') {
      try {
        const res = await window.desktopAPI.saveHtmlToPdf(html, defaultFilename);
        if (res.canceled) return;
        if (res.success) {
          alert(`✅ Weekly Summary PDF archived successfully!\n\nSaved to: ${res.filePath}`);
        } else {
          alert(`⚠️ PDF Archival failed: ${res.error || 'Unknown error'}`);
        }
      } catch (err) {
        alert('⚠️ PDF Archival error: ' + err.message);
      }
    } else {
      // 2. Web browser fallback: trigger standard print dialog
      this.printSummary();
    }
  }

  /**
   * Generates a beautifully formatted inline CSS email template.
   */
  generateEmailHtml() {
    const data = this.cachedData || this.collectWeeklyData();
    const distroEmails = data.recipients.emails;

    let emailHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Safety Assistant Weekly Status Briefing</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f1f5f9; margin: 0; padding: 20px; color: #1e293b;">
  <div style="max-width: 800px; margin: 0 auto; background: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.05); border: 1px solid #e2e8f0;">
    
    <!-- Header Banner -->
    <div style="background: linear-gradient(135deg, #1e3a8a 0%, #2563eb 100%); color: #ffffff; padding: 24px 30px;">
      <h1 style="margin: 0; font-size: 22px; font-weight: 800; letter-spacing: -0.5px;">🛡️ SAFETY ASSISTANT — WEEKLY STATUS BRIEFING</h1>
      <div style="font-size: 13px; opacity: 0.9; margin-top: 4px;">Mountain Power Safety & Compliance Department · Week of ${this.escapeHtml(data.weekRangeStr)}</div>
      ${distroEmails.length > 0 ? `<div style="font-size: 11px; opacity: 0.8; margin-top: 6px;">Distribution List (${distroEmails.length} recipients): ${this.escapeHtml(distroEmails.join(', '))}</div>` : ''}
    </div>

    <!-- Quick Stats Bar -->
    <div style="display: flex; background: #f8fafc; border-bottom: 1px solid #e2e8f0; padding: 14px 20px; justify-content: space-around; text-align: center;">
      <div style="flex: 1;">
        <div style="font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase;">Compliance</div>
        <div style="font-size: 20px; font-weight: 800; color: ${data.compliance.stats.ratePercent >= 90 ? '#16a34a' : '#ea580c'};">${data.compliance.stats.ratePercent}%</div>
      </div>
      <div style="flex: 1; border-left: 1px solid #e2e8f0;">
        <div style="font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase;">Swaps Due</div>
        <div style="font-size: 20px; font-weight: 800; color: ${data.swaps.totalActionRequired > 0 ? '#ea580c' : '#16a34a'};">${data.swaps.totalActionRequired}</div>
      </div>
      <div style="flex: 1; border-left: 1px solid #e2e8f0;">
        <div style="font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase;">Expiring Certs</div>
        <div style="font-size: 20px; font-weight: 800; color: ${data.certs.urgent.length > 0 ? '#dc2626' : '#16a34a'};">${data.certs.urgent.length}</div>
      </div>
      <div style="flex: 1; border-left: 1px solid #e2e8f0;">
        <div style="font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase;">Classes</div>
        <div style="font-size: 20px; font-weight: 800; color: #2563eb;">${data.training.length}</div>
      </div>
    </div>

    <div style="padding: 24px;">
      
      <!-- Compliance Section -->
      <h2 style="font-size: 15px; font-weight: 700; color: #0f172a; border-bottom: 2px solid #2563eb; padding-bottom: 6px; margin-top: 0;">🛡️ 1. Safety Compliance Pulse</h2>
      <p style="font-size: 12.5px; color: #475569; margin: 6px 0 12px 0;">Active crews completion of daily JHAs, weekly safety meeting, and monthly checklist:</p>
      
      <table style="width: 100%; border-collapse: collapse; font-size: 12px; margin-bottom: 24px;">
        <thead>
          <tr style="background: #f1f5f9; color: #334155; font-weight: 700; text-align: left;">
            <th style="padding: 8px 10px; border: 1px solid #cbd5e1;">Crew</th>
            <th style="padding: 8px 10px; border: 1px solid #cbd5e1;">Foreman</th>
            <th style="padding: 8px 10px; border: 1px solid #cbd5e1;">Location</th>
            <th style="padding: 8px 6px; border: 1px solid #cbd5e1; text-align: center;">M</th>
            <th style="padding: 8px 6px; border: 1px solid #cbd5e1; text-align: center;">T</th>
            <th style="padding: 8px 6px; border: 1px solid #cbd5e1; text-align: center;">W</th>
            <th style="padding: 8px 6px; border: 1px solid #cbd5e1; text-align: center;">Th</th>
            <th style="padding: 8px 6px; border: 1px solid #cbd5e1; text-align: center;">Mtg</th>
            <th style="padding: 8px 10px; border: 1px solid #cbd5e1; text-align: right;">Status</th>
          </tr>
        </thead>
        <tbody>
    `;

    data.compliance.crews.forEach(c => {
      emailHtml += `
        <tr style="background: ${c.isMissing ? '#fef2f2' : '#ffffff'};">
          <td style="padding: 6px 10px; border: 1px solid #e2e8f0; font-weight: 700; color: #2563eb;">${this.escapeHtml(c.job)}</td>
          <td style="padding: 6px 10px; border: 1px solid #e2e8f0;">${this.escapeHtml(c.foreman)}</td>
          <td style="padding: 6px 10px; border: 1px solid #e2e8f0; color: #64748b;">${this.escapeHtml(c.loc)}</td>
          <td style="padding: 6px 6px; border: 1px solid #e2e8f0; text-align: center;">${c.mon}</td>
          <td style="padding: 6px 6px; border: 1px solid #e2e8f0; text-align: center;">${c.tue}</td>
          <td style="padding: 6px 6px; border: 1px solid #e2e8f0; text-align: center;">${c.wed}</td>
          <td style="padding: 6px 6px; border: 1px solid #e2e8f0; text-align: center;">${c.thu}</td>
          <td style="padding: 6px 6px; border: 1px solid #e2e8f0; text-align: center;">${c.meeting}</td>
          <td style="padding: 6px 10px; border: 1px solid #e2e8f0; text-align: right; font-weight: 700; color: ${c.isComplete ? '#16a34a' : (c.isMissing ? '#dc2626' : '#d97706')};">${this.escapeHtml(c.status)}</td>
        </tr>
      `;
    });

    emailHtml += `
        </tbody>
      </table>

      <!-- Equipment Swaps Section -->
      <h2 style="font-size: 15px; font-weight: 700; color: #0f172a; border-bottom: 2px solid #2563eb; padding-bottom: 6px;">🧤 2. PPE & Equipment Swaps Required (${data.swaps.totalActionRequired})</h2>
    `;

    const allSwaps = [...data.swaps.overdue, ...data.swaps.dueThisWeek];
    if (allSwaps.length === 0) {
      emailHtml += `<p style="font-size: 12.5px; color: #16a34a; font-weight: 600;">✅ Zero swaps overdue or due this week across all tracked equipment types.</p>`;
    } else {
      emailHtml += `
        <table style="width: 100%; border-collapse: collapse; font-size: 12px; margin-bottom: 24px;">
          <thead>
            <tr style="background: #f1f5f9; color: #334155; font-weight: 700; text-align: left;">
              <th style="padding: 8px 10px; border: 1px solid #cbd5e1;">Type</th>
              <th style="padding: 8px 10px; border: 1px solid #cbd5e1;">Assigned To</th>
              <th style="padding: 8px 10px; border: 1px solid #cbd5e1;">Current Item</th>
              <th style="padding: 8px 10px; border: 1px solid #cbd5e1;">Location</th>
              <th style="padding: 8px 10px; border: 1px solid #cbd5e1;">Due Date</th>
              <th style="padding: 8px 10px; border: 1px solid #cbd5e1;">Ready Pick</th>
            </tr>
          </thead>
          <tbody>
      `;
      allSwaps.forEach(item => {
        emailHtml += `
          <tr style="background: ${item.isOverdue ? '#fef2f2' : '#ffffff'};">
            <td style="padding: 6px 10px; border: 1px solid #e2e8f0; font-weight: 600;">${this.escapeHtml(item.categoryLabel)}</td>
            <td style="padding: 6px 10px; border: 1px solid #e2e8f0; font-weight: 700;">${this.escapeHtml(item.employee)}</td>
            <td style="padding: 6px 10px; border: 1px solid #e2e8f0; font-family: monospace;">${this.escapeHtml(item.currentItem)}</td>
            <td style="padding: 6px 10px; border: 1px solid #e2e8f0; color: #64748b;">${this.escapeHtml(item.location)}</td>
            <td style="padding: 6px 10px; border: 1px solid #e2e8f0; font-weight: 700; color: ${item.isOverdue ? '#dc2626' : '#d97706'};">${this.escapeHtml(item.dueDate)}</td>
            <td style="padding: 6px 10px; border: 1px solid #e2e8f0;">${item.pickItem ? `✅ ${this.escapeHtml(item.pickItem)}` : 'Stock needed'}</td>
          </tr>
        `;
      });
      emailHtml += `
          </tbody>
        </table>
      `;
    }

    emailHtml += `
      <!-- Certifications & Training -->
      <h2 style="font-size: 15px; font-weight: 700; color: #0f172a; border-bottom: 2px solid #2563eb; padding-bottom: 6px;">📜 3. Urgent Certifications & Training</h2>
      <p style="font-size: 12px; color: #475569;">Employees with credentials expiring within 30 days:</p>
    `;

    if (data.certs.urgent.length === 0) {
      emailHtml += `<p style="font-size: 12.5px; color: #16a34a; font-weight: 600;">✅ Zero employee certifications expiring in the next 30 days.</p>`;
    } else {
      emailHtml += `
        <table style="width: 100%; border-collapse: collapse; font-size: 12px; margin-bottom: 20px;">
          <thead>
            <tr style="background: #f1f5f9; color: #334155; font-weight: 700; text-align: left;">
              <th style="padding: 8px 10px; border: 1px solid #cbd5e1;">Employee</th>
              <th style="padding: 8px 10px; border: 1px solid #cbd5e1;">Certification</th>
              <th style="padding: 8px 10px; border: 1px solid #cbd5e1;">Location</th>
              <th style="padding: 8px 10px; border: 1px solid #cbd5e1;">Expiration</th>
              <th style="padding: 8px 10px; border: 1px solid #cbd5e1; text-align: right;">Days</th>
            </tr>
          </thead>
          <tbody>
      `;
      data.certs.urgent.forEach(c => {
        emailHtml += `
          <tr style="background: #fef2f2;">
            <td style="padding: 6px 10px; border: 1px solid #e2e8f0; font-weight: 700;">${this.escapeHtml(c.employee)}</td>
            <td style="padding: 6px 10px; border: 1px solid #e2e8f0; color: #2563eb;">${this.escapeHtml(c.cert)}</td>
            <td style="padding: 6px 10px; border: 1px solid #e2e8f0; color: #64748b;">${this.escapeHtml(c.location)}</td>
            <td style="padding: 6px 10px; border: 1px solid #e2e8f0; font-weight: 700; color: #dc2626;">${this.escapeHtml(c.expirationDate)}</td>
            <td style="padding: 6px 10px; border: 1px solid #e2e8f0; text-align: right; font-weight: 700; color: #dc2626;">${c.diffDays}d</td>
          </tr>
        `;
      });
      emailHtml += `
          </tbody>
        </table>
      `;
    }

    emailHtml += `
      <div style="margin-top: 30px; padding-top: 16px; border-top: 1px solid #e2e8f0; font-size: 11px; color: #94a3b8; text-align: center;">
        Generated on demand by Safety Assistant Desktop Edition · All data originates from the offline-first repository.
      </div>

    </div>
  </div>
</body>
</html>
    `;

    return emailHtml;
  }

  generatePlainTextSummary() {
    const data = this.cachedData || this.collectWeeklyData();
    let text = `SAFETY ASSISTANT — WEEKLY STATUS BRIEFING\n`;
    text += `Week of: ${data.weekRangeStr}\n`;
    if (data.recipients.emails.length > 0) {
      text += `Notification Distribution: ${data.recipients.emails.join(', ')}\n`;
    }
    text += `\nKEY METRICS:\n`;
    text += `- Safety Compliance Rate: ${data.compliance.stats.ratePercent}% (${data.compliance.stats.completeCount}/${data.compliance.stats.totalCrews} crews complete)\n`;
    text += `- Equipment Swaps Action Required: ${data.swaps.totalActionRequired} (${data.swaps.overdue.length} overdue, ${data.swaps.dueThisWeek.length} due this week)\n`;
    text += `- Urgent Cert Expirations (< 30d): ${data.certs.urgent.length}\n`;
    text += `- Scheduled Training Sessions: ${data.training.length}\n`;
    text += `- Incidents Reported (Past 14d): ${data.incidents.length}\n\n`;

    if (data.swaps.overdue.length > 0) {
      text += `OVERDUE SWAPS:\n`;
      data.swaps.overdue.forEach(s => {
        text += `• [${s.categoryLabel}] ${s.employee} (Crew ${s.crew || '—'}) — Item #${s.currentItem} (${s.location}) Due: ${s.dueDate}\n`;
      });
      text += `\n`;
    }

    if (data.certs.urgent.length > 0) {
      text += `URGENT CERTIFICATIONS EXPIRING:\n`;
      data.certs.urgent.forEach(c => {
        text += `• ${c.employee} (Crew ${c.crew || '—'}): ${c.cert} expires ${c.expirationDate} (${c.diffDays} days remaining)\n`;
      });
      text += `\n`;
    }

    text += `Generated by Safety Assistant Desktop App.`;
    return text;
  }

  async copyEmailHtml() {
    const html = this.generateEmailHtml();
    const plain = this.generatePlainTextSummary();
    const data = this.cachedData || this.collectWeeklyData();
    const recipients = data.recipients.emails;

    try {
      if (navigator.clipboard && window.ClipboardItem) {
        const item = new ClipboardItem({
          'text/html': new Blob([html], { type: 'text/html' }),
          'text/plain': new Blob([plain], { type: 'text/plain' })
        });
        await navigator.clipboard.write([item]);
      } else if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(html);
      }
      alert(`📋 Executive Email Summary copied to clipboard!\n\n${recipients.length > 0 ? `Notification Recipients (${recipients.length} addresses from Employees table) are ready for BCC.` : ''}\n\nYou can now paste directly into Outlook or Gmail.`);
    } catch (err) {
      console.warn('Clipboard write error:', err);
      const ta = document.createElement('textarea');
      ta.value = html;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      alert('📋 HTML copied to clipboard!');
    }
  }

  openInGmail() {
    const data = this.cachedData || this.collectWeeklyData();
    const subject = `🛡️ Safety Assistant Weekly Briefing - ${data.weekRangeStr}`;
    const body = this.generatePlainTextSummary();
    const bcc = data.recipients.emails.join(',');

    let gmailUrl = `https://mail.google.com/mail/?view=cm&fs=1&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    if (bcc) {
      gmailUrl += `&bcc=${encodeURIComponent(bcc)}`;
    }

    window.open(gmailUrl, '_blank');
  }

  printSummary() {
    const data = this.cachedData || this.collectWeeklyData();
    const html = this.generateEmailHtml();

    const printWin = window.open('', '_blank', 'width=900,height=750');
    if (!printWin) {
      alert('⚠️ Popup blocked. Please allow popups to print the summary.');
      return;
    }

    printWin.document.open();
    printWin.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Safety Assistant Weekly Executive Briefing</title>
        <style>
          @media print {
            body { background: white !important; color: black !important; padding: 0 !important; }
            div[style*="box-shadow"] { box-shadow: none !important; border: none !important; }
          }
        </style>
      </head>
      <body>
        ${html}
        <script>
          window.onload = function() {
            window.print();
          };
        </script>
      </body>
      </html>
    `);
    printWin.document.close();
  }
}

window.WeeklySummaryEngine = WeeklySummaryEngine;
