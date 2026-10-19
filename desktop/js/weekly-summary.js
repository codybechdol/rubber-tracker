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
    this.selectedWeek = 'previous';
    this.tasksWeekOffset = 0;
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
    let targetWeek = 'Previous';
    let targetWeekRangeStr = '';
    let isPreviousWeek = true;

    if (compTable && compTable.rows && compTable.rows.length > 0) {
      const weekSet = new Set();
      compTable.rows.forEach(r => {
        const wk = String(r['Week Start'] || r['Week'] || '').trim();
        if (wk) weekSet.add(wk);
      });
      // Sort weeks chronologically descending (newest first)
      const sortedWeeks = Array.from(weekSet).sort((a, b) => {
        const da = new Date(a);
        const db = new Date(b);
        return db.getTime() - da.getTime();
      });
      compWeeks.push(...sortedWeeks);

      // Determine previous week vs current week
      let prevWeekStr = sortedWeeks.length > 1 ? sortedWeeks[1] : (sortedWeeks[0] || 'Previous');
      if (sortedWeeks.length > 0) {
        const newestDt = new Date(sortedWeeks[0]);
        if (!isNaN(newestDt.getTime()) && newestDt < new Date(currentMon.getTime() - 2 * 86400000)) {
          prevWeekStr = sortedWeeks[0];
        }
      }

      if (this.selectedWeek === 'previous' || !this.selectedWeek) {
        targetWeek = prevWeekStr;
        isPreviousWeek = true;
      } else if (this.selectedWeek === 'current') {
        targetWeek = sortedWeeks[0] || 'Current';
        isPreviousWeek = false;
      } else if (compWeeks.includes(this.selectedWeek)) {
        targetWeek = this.selectedWeek;
        isPreviousWeek = (targetWeek === prevWeekStr);
      } else {
        targetWeek = prevWeekStr;
        isPreviousWeek = true;
      }

      const twDt = this.parseDate(targetWeek);
      if (twDt) {
        const monDt = new Date(twDt);
        if (twDt.getDay() === 0) monDt.setDate(twDt.getDate() + 1);
        const sunDt = new Date(monDt);
        sunDt.setDate(monDt.getDate() + 6);
        targetWeekRangeStr = `${this.formatDateOnly(monDt)} – ${this.formatDateOnly(sunDt)}`;
      } else {
        targetWeekRangeStr = targetWeek;
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
          const employee = String(
            r['Crew Lead / Employee'] || 
            r['Employee / Crew Lead'] || 
            r['Employee'] || 
            r['Assigned To'] || 
            r['Crew Lead'] || 
            r['Lead'] || 
            r['Name'] || 
            ''
          ).trim();

          const currentItem = String(
            r['Current HV Tester #'] || 
            r['Current Phasing Set #'] || 
            r['Current Glove #'] || 
            r['Current Sleeve #'] || 
            r['Current Blanket #'] || 
            r['Current MACK #'] || 
            r['Current AED #'] || 
            r['Current Hot Stick #'] || 
            r['Current Item #'] || 
            r['HVT #'] || 
            r['Item #'] || 
            r['Serial #'] || 
            ''
          ).trim();

          const pickItem = String(
            r['Pick List HV Tester #'] || 
            r['Pick List Phasing Set #'] || 
            r['Pick List Glove #'] || 
            r['Pick List Sleeve #'] || 
            r['Pick List Blanket #'] || 
            r['Pick List MACK #'] || 
            r['Pick List AED #'] || 
            r['Pick List Serial #'] || 
            r['Pick List Item #'] || 
            r['Pick List'] || 
            ''
          ).trim();

          const loc = String(r['Location'] || '').trim();
          const stage = String(r['Status'] || r['Stage'] || '').trim();

          // Skip if already swapped/archived
          if (stage.toLowerCase().includes('complete') || stage.toLowerCase().includes('archived') || stage.toLowerCase().includes('swapped')) {
            return;
          }

          const empInfo = empMap.get(employee.toLowerCase()) || {};
          const crew = empInfo.crew || String(r['Job Number'] || r['Job #'] || r['Crew'] || '').trim();
          const resolvedLoc = loc || empInfo.loc || '—';

          // Apply Location filter
          if (this.selectedLocation !== 'all') {
            const cleanLoc = resolvedLoc.toLowerCase().replace(/\s*\(.*?\)\s*/g, '').trim();
            if (!cleanLoc.includes(this.selectedLocation.toLowerCase())) return;
          }

          const dueDateRaw = r['Change Out Date'] || r['Due Date'] || r['Test Date'] || r['Pad Expiration'];
          const dueDt = this.parseDate(dueDateRaw);

          const dl = String(r['Days Left'] || '').toUpperCase();
          const isReclaim = dl.includes('PREV') || stage.toLowerCase().includes('return to shelf') || resolvedLoc.toLowerCase().includes('previous');

          const itemRecord = {
            categoryKey: sw.key,
            categoryLabel: sw.label,
            icon: sw.icon,
            isReclaim,
            employee: employee || 'On Shelf',
            crew,
            currentItem,
            pickItem: (pickItem && pickItem !== '—' && pickItem !== '-') ? pickItem : null,
            location: resolvedLoc,
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

    // 5. Training Classes & Monthly Safety Training Scheduled / In-Progress
    const trainTable = this.db ? this.db.getTable('training_tracking') : null;
    const trainingThisWeek = [];

    // A. Check for scheduled classroom cert courses from manual_tasks (Trip Planner)
    const manualTasks = (this.db && typeof this.db.getManualTasks === 'function')
      ? this.db.getManualTasks()
      : (this.db?.snapshot?.configs?.manual_tasks || []);

    const upcomingCutoff = new Date(currentMon);
    upcomingCutoff.setDate(currentMon.getDate() + 14);

    if (Array.isArray(manualTasks)) {
      manualTasks.forEach(task => {
        if (task.taskCategory === 'cert_class' || !!task.certType) {
          const rawDate = task.dateKey || task.date;
          const dt = this.parseDate(rawDate);
          if (dt && dt >= currentMon && dt <= upcomingCutoff) {
            if (this.selectedLocation !== 'all') {
              const loc = String(task.location || '').toLowerCase();
              if (!loc.includes(this.selectedLocation.toLowerCase())) return;
            }
            const attendeesCount = Array.isArray(task.assignedEmployees)
              ? task.assignedEmployees.length
              : (task.employee ? 1 : 0);

            trainingThisWeek.push({
              title: task.title || task.certType || 'Scheduled Training Class',
              date: this.formatDateOnly(dt),
              location: task.location || '—',
              instructor: task.instructor || 'Instructor',
              attendees: attendeesCount,
              attendeesLabel: `${attendeesCount} Enrolled`,
              status: task.status || 'Scheduled',
              isMonthlyTopic: false
            });
          }
        }
      });
    }

    // B. Check training_tracking for completions this week or current month curriculum
    if (trainTable && trainTable.rows) {
      const curMonthName = today.toLocaleString('en-US', { month: 'long' }).toLowerCase();
      let pendingMonthCrews = [];
      let monthTopic = '';

      trainTable.rows.forEach(r => {
        const title = String(r['Class'] || r['Training Topic'] || r['Topic'] || r['Course'] || r['Title'] || '').trim();
        const dateRaw = r['Completion Date'] || r['Date'] || r['Scheduled Date'];
        const rowMonth = String(r['Month'] || '').trim().toLowerCase();
        const loc = String(r['Location'] || '').trim();
        const instructor = String(r['Trainer'] || r['Instructor'] || r['Lead'] || '—').trim();
        const attendees = String(r['Attendees'] || r['Crew'] || '').trim();
        const status = String(r['Status'] || '').trim();

        // Check if completed this week
        if (dateRaw) {
          const dt = this.parseDate(dateRaw);
          if (dt && dt >= currentMon && dt <= nextSun) {
            if (this.selectedLocation !== 'all') {
              const cleanLoc = loc.toLowerCase().replace(/\s*\(.*?\)\s*/g, '').trim();
              if (!cleanLoc.includes(this.selectedLocation.toLowerCase())) return;
            }

            trainingThisWeek.push({
              title: title || 'Completed Safety Training',
              date: this.formatDateOnly(dt),
              location: loc || '—',
              instructor,
              attendees: attendees ? attendees.split(',').length : 1,
              attendeesLabel: `${attendees ? attendees.split(',').length : 1} Attendees`,
              status: status || 'Completed',
              isMonthlyTopic: false
            });
          }
        }

        // Check if assigned for current month and pending
        if (rowMonth === curMonthName && status.toLowerCase() === 'pending') {
          if (!monthTopic && title) monthTopic = title;
          const lead = String(r['Crew Lead'] || r['Lead'] || '').trim();
          const emp = empMap.get(lead.toLowerCase());
          const crewLoc = loc || (emp && emp.loc) || '';
          
          if (this.selectedLocation === 'all' || crewLoc.toLowerCase().includes(this.selectedLocation.toLowerCase())) {
            pendingMonthCrews.push(r);
          }
        }
      });

      // If active monthly topic exists and has pending crews, include as featured curriculum
      if (pendingMonthCrews.length > 0 && monthTopic) {
        const capMonth = today.toLocaleString('en-US', { month: 'long' });
        const locLabel = this.selectedLocation !== 'all' ? `${this.selectedLocation} (${pendingMonthCrews.length} Crews)` : 'Company-Wide Field Delivery';
        trainingThisWeek.push({
          title: `${capMonth} Curriculum: ${monthTopic}`,
          date: `${capMonth} ${today.getFullYear()}`,
          location: locLabel,
          instructor: 'Safety Dept / Crew Leads',
          attendees: pendingMonthCrews.length,
          attendeesLabel: `${pendingMonthCrews.length} Crews Pending`,
          status: 'In Progress',
          isMonthlyTopic: true
        });
      }
    }

    // 6. Recent Incident Reports (past 14 days)
    const recentIncidents = [];
    const fourteenDaysAgo = new Date(today);
    fourteenDaysAgo.setDate(today.getDate() - 14);

    const incTable = this.db ? this.db.getTable('incident_reports') : null;
    let incidentRows = (incTable && incTable.rows && incTable.rows.length > 0) ? incTable.rows : [];

    if (incidentRows.length === 0 && window.incidentReportsEngine) {
      if (typeof window.incidentReportsEngine.loadIncidents === 'function') {
        const loaded = window.incidentReportsEngine.loadIncidents();
        if (Array.isArray(loaded) && loaded.length > 0) incidentRows = loaded;
      } else if (Array.isArray(window.incidentReportsEngine.incidents)) {
        incidentRows = window.incidentReportsEngine.incidents;
      }
    }

    if (Array.isArray(incidentRows)) {
      incidentRows.forEach(inc => {
        const rawDate = inc['Date of Incident'] || inc['Date Received'] || inc['Date'] || inc.date || inc.incidentDate;
        const dt = rawDate instanceof Date ? rawDate : this.parseDate(rawDate);
        if (dt && dt >= fourteenDaysAgo) {
          const rawJob = inc['Job #'] || inc['Job Number'] || inc.jobNumber || inc.job || '—';
          const rawForeman = inc['Foreman'] || inc.foreman || '—';
          const rawType = inc['Incident Type'] || inc.incidentType || (Array.isArray(inc.tags) ? inc.tags.join(', ') : 'General Incident');
          const desc = inc['Brief Explanation'] || inc['Explanation'] || inc.description || 'Incident report received via tablet email.';
          const photoCount = inc['Photo Count'] || (Array.isArray(inc.photos) ? inc.photos.length : 0);

          recentIncidents.push({
            date: this.formatDateOnly(dt),
            dt,
            job: String(rawJob).replace(/^job\s*#?\s*/i, '').trim(),
            foreman: String(rawForeman).trim(),
            type: String(rawType).trim(),
            description: String(desc).trim(),
            hasPhotos: (photoCount > 0)
          });
        }
      });
      recentIncidents.sort((a, b) => b.dt.getTime() - a.dt.getTime());
    }

    // 7. Notification Recipients (from Notification Emails column on Employees page)
    const recipientsData = this.getNotificationRecipients();

    // 8. Planned Tasks & Field Itinerary for the Week (from Trip Planner)
    const tasksMon = new Date(currentMon);
    tasksMon.setDate(currentMon.getDate() + (this.tasksWeekOffset * 7));
    tasksMon.setHours(12, 0, 0, 0);

    const tasksSun = new Date(tasksMon);
    tasksSun.setDate(tasksMon.getDate() + 6);
    tasksSun.setHours(23, 59, 59, 999);

    const rawManualTasks = (window.tripPlanner && Array.isArray(window.tripPlanner.manualTasks))
      ? window.tripPlanner.manualTasks
      : ((this.db && typeof this.db.getManualTasks === 'function')
          ? this.db.getManualTasks()
          : (() => {
              try {
                return JSON.parse(localStorage.getItem('TRIP_PLANNER_MANUAL_TASKS') || '[]');
              } catch {
                return (this.db?.snapshot?.configs?.manual_tasks || []);
              }
            })());

    const rawPlannedTrips = (window.tripPlanner && window.tripPlanner.plannedTrips)
      ? window.tripPlanner.plannedTrips
      : ((this.db && typeof this.db.getPlannedTrips === 'function')
          ? this.db.getPlannedTrips()
          : (() => {
              try {
                return JSON.parse(localStorage.getItem('TRIP_PLANNER_PLANNED_TRIPS') || '{}');
              } catch {
                return (this.db?.snapshot?.configs?.plannedTrips || {});
              }
            })());

    const rawScheduledSwaps = (window.tripPlanner && window.tripPlanner.scheduledSwaps)
      ? window.tripPlanner.scheduledSwaps
      : ((this.db && typeof this.db.getScheduledSwaps === 'function')
          ? this.db.getScheduledSwaps()
          : (() => {
              try {
                return JSON.parse(localStorage.getItem('TRIP_PLANNER_SCHEDULED_SWAPS') || localStorage.getItem('sa_trip_scheduled_swaps') || '{}');
              } catch {
                return (this.db?.snapshot?.configs?.scheduled_swaps || {});
              }
            })());

    const rawScheduledTraining = (window.tripPlanner && window.tripPlanner.scheduledTrainingNeeds)
      ? window.tripPlanner.scheduledTrainingNeeds
      : (() => {
          try {
            return JSON.parse(localStorage.getItem('TRIP_PLANNER_SCHEDULED_TRAINING') || localStorage.getItem('sa_trip_scheduled_training') || '{}');
          } catch {
            return (this.db?.snapshot?.configs?.scheduled_training || {});
          }
        })();

    const rawScheduledEquipment = (window.tripPlanner && window.tripPlanner.scheduledEquipmentNeeds)
      ? window.tripPlanner.scheduledEquipmentNeeds
      : (() => {
          try {
            return JSON.parse(localStorage.getItem('TRIP_PLANNER_SCHEDULED_EQUIPMENT') || localStorage.getItem('sa_trip_scheduled_equipment') || '{}');
          } catch {
            return (this.db?.snapshot?.configs?.scheduled_equipment || {});
          }
        })();

    const allPickedItems = (window.tripPlanner && typeof window.tripPlanner.getPickedSwapsData === 'function')
      ? (window.tripPlanner.getPickedSwapsData().items || [])
      : [];

    const plannedDays = [];
    const dayNames = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    const dayAbbrs = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

    let weekTotalTasks = 0;
    let weekPendingTasks = 0;
    let weekCompletedTasks = 0;
    let weekFieldDaysCount = 0;
    let weekTotalTrips = 0;
    let weekTotalSwaps = 0;
    let weekTotalReclaims = 0;
    let weekTotalTrainings = 0;
    let weekTotalEquipment = 0;

    const swapIcons = {
      glove_swaps: '🧤',
      sleeve_swaps: '🦾',
      blanket_swaps: '🛏️',
      mack_swaps: '⚡',
      hv_tester_swaps: '⚡',
      phasing_set_swaps: '⚡',
      ground_swaps: '🧰',
      hot_stick_swaps: '🔴'
    };

    for (let i = 0; i < 7; i++) {
      const d = new Date(tasksMon);
      d.setDate(tasksMon.getDate() + i);
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      const dateKey = `${yyyy}-${mm}-${dd}`;

      const isToday = (dateKey === `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`);

      // 1. Trips
      const dayTripsRaw = rawPlannedTrips[dateKey];
      let trips = Array.isArray(dayTripsRaw) ? dayTripsRaw : (dayTripsRaw ? [dayTripsRaw] : []);
      if (this.selectedLocation !== 'all') {
        trips = trips.filter(t => t.location && t.location.toLowerCase().includes(this.selectedLocation.toLowerCase()));
      }
      if (trips.length > 0) {
        weekFieldDaysCount++;
        weekTotalTrips += trips.length;
      }

      // 2. Scheduled Training (Classes Cody teaches + Scheduled Monthly Crew Trainings)
      const dayTrainings = [];

      // a) Scheduled Monthly Crew Trainings (from Training Needs sidebar / scheduledTrainingNeeds)
      if (rawScheduledTraining) {
        Object.keys(rawScheduledTraining).forEach(trKey => {
          const entry = rawScheduledTraining[trKey];
          const trDate = typeof entry === 'object' ? entry.dateKey : entry;
          if (trDate === dateKey && entry && entry.training) {
            const trLoc = (entry.training.location || '').toLowerCase();
            if (this.selectedLocation !== 'all' && !trLoc.includes(this.selectedLocation.toLowerCase())) {
              return;
            }
            let isDone = !!(entry.completed || entry.isCompleted || (entry.training && (entry.training.isCompleted || entry.training.completed)));
            if (trainTable && trainTable.rows) {
              const trItem = entry.training;
              const targetRow = trainTable.rows.find(r => {
                if (trItem.rowIdx && (r._rowIdx === trItem.rowIdx || trainTable.rows.indexOf(r) + 2 === trItem.rowIdx)) return true;
                const cRaw = String(r['Crew #'] || r['Crew'] || r['Job Number'] || r['Job #'] || '').trim();
                const cSig = window.tripPlanner ? window.tripPlanner.getSignificantJobNumber(cRaw).toLowerCase() : cRaw.toLowerCase();
                const tSig = window.tripPlanner ? window.tripPlanner.getSignificantJobNumber(trItem.crewId || '').toLowerCase() : (trItem.crewId || '').toLowerCase();
                const crewMatches = (tSig && cSig === tSig) || (cRaw.toLowerCase() === String(trItem.crewId || '').trim().toLowerCase());
                const rTopic = String(r['Topic'] || r['Training Topic'] || r['Training'] || '').trim().toLowerCase();
                const topicTarget = String(trItem.topic || '').trim().toLowerCase();
                const topicMatches = rTopic && topicTarget && (rTopic === topicTarget || rTopic.includes(topicTarget) || topicTarget.includes(rTopic));
                return crewMatches && topicMatches;
              });
              if (targetRow) {
                const s = String(targetRow['Status'] || targetRow['Training Status'] || '').trim().toLowerCase();
                isDone = (s === 'completed' || s === 'complete' || s === 'done');
              }
            }
            dayTrainings.push({
              _trKey: trKey,
              topic: entry.training.topic || 'Crew Safety Training',
              crewId: entry.training.crewId || '',
              lead: entry.training.lead || '',
              location: entry.training.location || '',
              month: entry.training.month || '',
              attendees: entry.training.attendees || '',
              isCompleted: isDone,
              isCrewTraining: true
            });
            weekTotalTrainings++;
            weekTotalTasks++;
            if (isDone) weekCompletedTasks++;
            else weekPendingTasks++;
          }
        });
      }

      // b) Cert Classes scheduled via "+ Class" or manual tasks
      const certClasses = rawManualTasks.filter(t => (t.dateKey === dateKey || t.date === dateKey) && (t.taskCategory === 'cert_class' || !!t.certType));
      certClasses.forEach(t => {
        const cLoc = (t.location || '').toLowerCase();
        if (this.selectedLocation !== 'all' && !cLoc.includes(this.selectedLocation.toLowerCase())) {
          return;
        }
        const isDone = (t.status === 'Complete');
        dayTrainings.push({
          id: t.id,
          topic: t.title || t.certType || 'Certification Class',
          crewId: t.crewId || '',
          lead: t.instructor || '',
          location: t.location || '',
          time: t.time || '',
          notes: t.notes || '',
          priority: t.priority || '',
          isCompleted: isDone,
          isCertClass: true
        });
        weekTotalTrainings++;
        weekTotalTasks++;
        if (isDone) weekCompletedTasks++;
        else weekPendingTasks++;
      });

      // 3. Scheduled Equipment Deliveries (checklist defects / supplies)
      const dayEquipment = [];
      if (rawScheduledEquipment) {
        Object.keys(rawScheduledEquipment).forEach(eqKey => {
          const entry = rawScheduledEquipment[eqKey];
          const eqDate = typeof entry === 'object' ? entry.dateKey : entry;
          if (eqDate === dateKey && entry && entry.item) {
            const eqLoc = (entry.item.location || '').toLowerCase();
            if (this.selectedLocation !== 'all' && !eqLoc.includes(this.selectedLocation.toLowerCase())) {
              return;
            }
            const eqType = entry.item.equipmentType || 'Equipment Need';
            const isAed = eqType.toLowerCase().includes('aed');
            const isFe = eqType.toLowerCase().includes('extinguisher') || eqType.toLowerCase().includes('fire');
            const isFa = eqType.toLowerCase().includes('aid') || eqType.toLowerCase().includes('eye');
            const icon = isAed ? '⚡' : (isFe ? '🧯' : (isFa ? '🩹' : '🚗'));
            const isDone = !!(entry.completed || entry.isCompleted || (entry.item && (entry.item.resolved || entry.item.isResolved || entry.item.completed)));

            dayEquipment.push({
              _eqKey: eqKey,
              icon,
              equipmentType: (eqType === 'AED' && (/needs\s*aed\s*pads/i.test(entry.item.notes || '') || (entry.item.desc || '').toLowerCase() === 'needs aed pads')) ? 'Needs AED Pads' : eqType,
              notes: entry.item.notes || entry.item.desc || '',
              vehicleNumber: entry.item.vehicleNumber || '',
              crewId: entry.item.crewId || '',
              location: entry.item.location || '',
              foreman: entry.item.foreman || '',
              isResolved: isDone,
              item: entry.item
            });
            weekTotalEquipment++;
            weekTotalTasks++;
            if (isDone) weekCompletedTasks++;
            else weekPendingTasks++;
          }
        });
      }

      // 4. Scheduled Swaps and Reclaims (Categorized Accurately)
      const daySwaps = [];
      const dayReclaims = [];

      if (rawScheduledSwaps) {
        Object.keys(rawScheduledSwaps).forEach(sKey => {
          const s = rawScheduledSwaps[sKey];
          if (!s) return;
          const sDate = typeof s === 'object' ? (s.dateKey || s.date) : s;
          if (sDate !== dateKey) return;

          const matchedPicked = (allPickedItems || []).find(p => (window.tripPlanner && typeof window.tripPlanner.getSwapKey === 'function' ? window.tripPlanner.getSwapKey(p) === sKey : false)) || (s && s.swap ? s.swap : null);
          const sObj = matchedPicked || s.swap || (typeof s === 'object' ? s : {});
          const parts = sKey.split('|');
          const catKey = parts[0] || (sObj.tableKey || 'glove_swaps');
          const rawEmp = sObj.employeeName || s.employeeName || parts[1] || 'Lineman';
          const rawType = sObj.type || s.type || parts[2] || 'Item';
          const rawItemNum = sObj.currentItem || s.currentItem || parts[3] || '';

          // Determine if Reclaim vs Swap
          const isReclaim = !!(
            s.isReclaim ||
            sObj.isReclaim ||
            (sObj.daysLeft && String(sObj.daysLeft).toUpperCase().includes('PREV')) ||
            (s.daysLeft && String(s.daysLeft).toUpperCase().includes('PREV')) ||
            (sObj.status && String(sObj.status).toLowerCase().includes('return to shelf')) ||
            (s.status && String(s.status).toLowerCase().includes('return to shelf')) ||
            (sObj.location && String(sObj.location).toLowerCase().includes('previous')) ||
            (s.location && String(s.location).toLowerCase().includes('previous'))
          );

          // Item Kind & Class
          let itemType = sObj.type || rawType;
          if (itemType.toLowerCase() === 'glove') itemType = 'Glove';
          else if (itemType.toLowerCase() === 'sleeve') itemType = 'Sleeve';
          else if (itemType.toLowerCase() === 'blanket') itemType = 'Blanket';
          else if (itemType.toLowerCase() === 'mack') itemType = 'MACK';
          else if (itemType.toLowerCase() === 'hv_tester' || itemType.toLowerCase() === 'hvt') itemType = 'HV Tester';
          else if (itemType.toLowerCase() === 'phasing_set') itemType = 'Phasing Set';

          const itemClassRaw = sObj.itemClass || sObj.class || sObj.Class || s.itemClass || '';
          let itemClassStr = '';
          if (itemClassRaw) {
            const cleanCl = String(itemClassRaw).replace(/^(class|cl)\s*/i, '').trim();
            itemClassStr = `CL ${cleanCl}`;
          }

          const sizeStr = sObj.size || sObj.Size || s.size || '';
          let kindLabel = itemType;
          if (itemClassStr) {
            kindLabel = `${itemType} (${itemClassStr})`;
          }

          const currentItem = String(sObj.currentItem || rawItemNum || '').trim();
          const pickItem = String(sObj.pickItem || s.pickItem || '').trim();

          // Resolve Town
          let town = sObj.location || s.location || '';
          if (town) town = town.replace(/\s*\(.*?\)\s*/g, '').trim();
          if (!town || town.toLowerCase() === 'helena' || town.toLowerCase() === 'unknown' || town === '—') {
            const empData = empMap.get(rawEmp.toLowerCase());
            if (empData && empData.loc && !empData.loc.toLowerCase().includes('vacation') && !empData.loc.toLowerCase().includes('light duty')) {
              town = empData.loc.replace(/\s*\(.*?\)\s*/g, '').trim();
            }
          }
          if (!town) town = 'Helena';

          // Apply Location filter
          if (this.selectedLocation !== 'all' && !town.toLowerCase().includes(this.selectedLocation.toLowerCase())) {
            return;
          }

          const isDone = !!(s.completed || sObj.completed || sObj.isCompleted);
          const completedDate = s.completedDate || sObj.completedDate || '';
          const icon = (itemType.toLowerCase().includes('glove')) ? '🧤' : ((itemType.toLowerCase().includes('sleeve')) ? '🦾' : (swapIcons[catKey] || '🔄'));

          const itemPayload = {
            key: sKey,
            catKey,
            icon,
            isReclaim,
            employee: rawEmp,
            classification: sObj.classification || '',
            crewId: sObj.crewId || s.crewId || '',
            foreman: sObj.foreman || s.foreman || '',
            itemType,
            itemClass: itemClassStr,
            kindLabel,
            size: sizeStr,
            currentItem,
            pickItem: (pickItem && pickItem !== '—' && pickItem !== '-') ? pickItem : '',
            location: town,
            isCompleted: isDone,
            completedDate,
            rawSwap: sObj
          };

          if (isReclaim) {
            dayReclaims.push(itemPayload);
            weekTotalReclaims++;
            weekTotalTasks++;
            if (isDone) weekCompletedTasks++;
            else weekPendingTasks++;
          } else {
            daySwaps.push(itemPayload);
            weekTotalSwaps++;
            weekTotalTasks++;
            if (isDone) weekCompletedTasks++;
            else weekPendingTasks++;
          }
        });
      }

      // 5. Personal Tasks (Manually added office/field tasks excluding cert classes)
      let dayPersonalTasks = rawManualTasks.filter(t => (t.dateKey === dateKey || t.date === dateKey) && t.taskCategory !== 'cert_class' && !t.certType);
      if (this.selectedLocation !== 'all') {
        dayPersonalTasks = dayPersonalTasks.filter(t => {
          const loc = (t.location || '').toLowerCase();
          return loc.includes(this.selectedLocation.toLowerCase()) || (this.selectedLocation.toLowerCase() === 'helena' && (!loc || loc.includes('office') || loc.includes('base')));
        });
      }

      // Sort day tasks chronologically by time
      dayPersonalTasks.sort((a, b) => {
        const parseTime = (tStr) => {
          if (!tStr) return 9999;
          const m = String(tStr).toLowerCase();
          if (m === 'morning') return 480;
          if (m === 'noon') return 720;
          if (m === 'afternoon') return 780;
          const match = m.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/);
          if (!match) return 9999;
          let h = parseInt(match[1], 10);
          const min = match[2] ? parseInt(match[2], 10) : 0;
          const mod = match[3];
          if (mod === 'pm' && h < 12) h += 12;
          if (mod === 'am' && h === 12) h = 0;
          return h * 60 + min;
        };
        const tA = parseTime(a.time);
        const tB = parseTime(b.time);
        if (tA !== tB) return tA - tB;
        const aDone = a.status === 'Complete' ? 1 : 0;
        const bDone = b.status === 'Complete' ? 1 : 0;
        if (aDone !== bDone) return aDone - bDone;
        return (a.title || '').localeCompare(b.title || '');
      });

      dayPersonalTasks.forEach(t => {
        weekTotalTasks++;
        if (t.status === 'Complete') weekCompletedTasks++;
        else weekPendingTasks++;
      });

      plannedDays.push({
        dateKey,
        dayName: dayNames[i],
        dayAbbr: dayAbbrs[i],
        formattedDate: `${d.getMonth() + 1}/${d.getDate()}`,
        fullDateLabel: `${dayNames[i]}, ${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`,
        isToday,
        isWeekend: (i >= 5),
        trips,
        trainings: dayTrainings,
        equipment: dayEquipment,
        reclaims: dayReclaims,
        swaps: daySwaps,
        tasks: dayPersonalTasks,
        hasContent: (trips.length > 0 || dayTrainings.length > 0 || dayEquipment.length > 0 || dayReclaims.length > 0 || daySwaps.length > 0 || dayPersonalTasks.length > 0)
      });
    }

    const plannedWeek = {
      offset: this.tasksWeekOffset,
      monday: tasksMon,
      sunday: tasksSun,
      weekRangeStr: `${this.formatDateOnly(tasksMon)} – ${this.formatDateOnly(tasksSun)}`,
      days: plannedDays,
      totalTasks: weekTotalTasks,
      pendingTasks: weekPendingTasks,
      completedTasks: weekCompletedTasks,
      fieldDaysCount: weekFieldDaysCount,
      totalTrips: weekTotalTrips,
      totalSwaps: weekTotalSwaps,
      totalReclaims: weekTotalReclaims,
      totalTrainings: weekTotalTrainings,
      totalEquipment: weekTotalEquipment
    };

    return {
      today,
      currentMon,
      nextSun,
      weekRangeStr: `${this.formatDateOnly(currentMon)} – ${this.formatDateOnly(nextSun)}`,
      locations: Array.from(activeLocations).sort(),
      recipients: recipientsData,
      crewMembersMap,
      plannedWeek,
      compliance: {
        weeks: compWeeks,
        targetWeek,
        targetWeekRangeStr,
        isPreviousWeek,
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
              <span style="font-size: 12px; font-weight: 700; color: #94a3b8; text-transform: uppercase;">Compliance Week:</span>
              <select id="weekly-summary-week-select" onchange="window.weeklySummaryEngine.setWeekFilter(this.value)" style="background: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: 6px; padding: 6px 12px; color: #34d399; font-size: 13px; font-weight: 700; outline: none; cursor: pointer;">
                <option value="previous" ${this.selectedWeek === 'previous' ? 'selected' : ''}>Previous Week (${this.escapeHtml(data.compliance.targetWeekRangeStr || 'Previous')})</option>
                <option value="current" ${this.selectedWeek === 'current' ? 'selected' : ''}>Current Week (${data.weekRangeStr})</option>
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
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 14px;">
          <!-- Planned Tasks Card -->
          <div onclick="document.getElementById('weekly-planned-tasks-section')?.scrollIntoView({ behavior: 'smooth' });" style="background: var(--bg-card); border: 1px solid var(--border-color); border-radius: 8px; padding: 14px 16px; cursor: pointer; transition: transform 0.15s, border-color 0.15s;" onmouseover="this.style.borderColor='#38bdf8'" onmouseout="this.style.borderColor='var(--border-color)'" title="Scroll to Planned Tasks & Itinerary">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
              <span style="font-size: 11px; font-weight: 700; color: #94a3b8; text-transform: uppercase;">Planned Tasks</span>
              <span style="font-size: 16px;">📋</span>
            </div>
            <div style="font-size: 24px; font-weight: 800; color: ${data.plannedWeek.pendingTasks > 0 ? '#38bdf8' : '#34d399'};">
              ${data.plannedWeek.totalTasks > 0 ? `${data.plannedWeek.pendingTasks} Pending` : '0 Tasks'}
            </div>
            <div style="font-size: 11px; color: #64748b; margin-top: 4px;">
              ${data.plannedWeek.completedTasks} done · ${data.plannedWeek.fieldDaysCount} travel day${data.plannedWeek.fieldDaysCount === 1 ? '' : 's'}
            </div>
          </div>

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

        <!-- Section 0: Planned Tasks & Field Itinerary (Trip Planner) -->
        <div id="weekly-planned-tasks-section" style="background: var(--bg-card); border: 1px solid var(--border-color); border-radius: 8px; overflow: hidden; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.12);">
          <div style="padding: 14px 18px; background: rgba(30, 41, 59, 0.7); border-bottom: 1px solid var(--border-color); display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px;">
            <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
              <span style="font-size: 16px;">📋</span>
              <h3 style="font-size: 14px; font-weight: 700; margin: 0; color: #f8fafc;">Planned Tasks & Field Itinerary</h3>
              <span class="brand-badge" style="background: rgba(56, 189, 248, 0.18); color: #38bdf8; border: 1px solid rgba(56, 189, 248, 0.35);">
                Trip Planner
              </span>
              <span style="font-size: 12px; color: #94a3b8; font-weight: 600;">
                Week: <strong style="color: #60a5fa;">${data.plannedWeek.weekRangeStr}</strong>
              </span>
              ${data.plannedWeek.totalTasks > 0 ? `
                <span class="brand-badge" style="background: ${data.plannedWeek.pendingTasks > 0 ? 'rgba(245, 158, 11, 0.2)' : 'rgba(16, 185, 129, 0.2)'}; color: ${data.plannedWeek.pendingTasks > 0 ? '#fbbf24' : '#34d399'}; border: 1px solid ${data.plannedWeek.pendingTasks > 0 ? 'rgba(245, 158, 11, 0.4)' : 'rgba(16, 185, 129, 0.4)'};">
                  ${data.plannedWeek.pendingTasks} Pending · ${data.plannedWeek.completedTasks} Complete
                </span>
              ` : ''}
              ${data.plannedWeek.fieldDaysCount > 0 ? `
                <span class="brand-badge" style="background: rgba(139, 92, 246, 0.18); color: #c084fc; border: 1px solid rgba(139, 92, 246, 0.35);">
                  🚗 ${data.plannedWeek.fieldDaysCount} Field Trip Days
                </span>
              ` : ''}
            </div>

            <!-- Week Navigation & Actions -->
            <div style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">
              <div style="display: inline-flex; border: 1px solid var(--border-color); border-radius: 6px; overflow: hidden; background: var(--bg-secondary);">
                <button onclick="window.weeklySummaryEngine.setTasksWeekOffset(${data.plannedWeek.offset - 1})" class="btn btn-secondary" style="border: none; border-radius: 0; padding: 4px 8px; font-size: 11px; font-weight: 700; color: #94a3b8; cursor: pointer;" title="Previous Week">
                  ◀ Prev
                </button>
                <button onclick="window.weeklySummaryEngine.setTasksWeekOffset(0)" class="btn btn-secondary" style="border: none; border-left: 1px solid var(--border-color); border-right: 1px solid var(--border-color); border-radius: 0; padding: 4px 10px; font-size: 11px; font-weight: 700; cursor: pointer; ${data.plannedWeek.offset === 0 ? 'background: #2563eb; color: #ffffff;' : 'color: #94a3b8;'}" title="Current Week">
                  This Week
                </button>
                <button onclick="window.weeklySummaryEngine.setTasksWeekOffset(${data.plannedWeek.offset + 1})" class="btn btn-secondary" style="border: none; border-radius: 0; padding: 4px 8px; font-size: 11px; font-weight: 700; color: #94a3b8; cursor: pointer;" title="Next Week">
                  Next ▶
                </button>
              </div>

              <button class="btn btn-secondary" onclick="window.weeklySummaryEngine.openAddTaskModal('${data.plannedWeek.days[0].dateKey}')" style="font-size: 11.5px; font-weight: 700; display: inline-flex; align-items: center; gap: 5px; border-color: rgba(56, 189, 248, 0.4); color: #38bdf8; background: rgba(56, 189, 248, 0.1);" title="Schedule new personal task or training class">
                <span>➕</span> Add Task
              </button>

              <button class="btn btn-secondary" onclick="window.weeklySummaryEngine.openTripPlanner('${data.plannedWeek.days[0].dateKey}')" style="font-size: 11.5px; font-weight: 600; display: inline-flex; align-items: center; gap: 5px;" title="Open full Trip Planner workspace">
                <span>🗓️</span> Open Trip Planner
              </button>
            </div>
          </div>

          <div style="padding: 16px;">
            ${this.renderPlannedTasksSectionHtml(data.plannedWeek)}
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
              Target Week: <strong style="color: #60a5fa;">${data.compliance.targetWeekRangeStr || data.weekRangeStr}</strong>
              ${data.compliance.isPreviousWeek ? '<span style="margin-left: 6px; padding: 1px 6px; border-radius: 4px; font-size: 10px; font-weight: 700; background: rgba(59, 130, 246, 0.2); color: #93c5fd; border: 1px solid rgba(59, 130, 246, 0.3);">Previous Week</span>' : ''}
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

  renderPlannedTasksSectionHtml(plannedWeek) {
    if (!plannedWeek || !plannedWeek.days) {
      return `<div style="text-align: center; padding: 20px; color: #94a3b8; font-size: 12.5px;">No planned task data available.</div>`;
    }

    const hasAnyContent = plannedWeek.days.some(d => d.hasContent);
    if (!hasAnyContent) {
      return `
        <div style="text-align: center; padding: 28px 16px; background: var(--bg-secondary); border: 1px dashed var(--border-color); border-radius: 8px;">
          <div style="font-size: 28px; margin-bottom: 8px;">🗓️</div>
          <div style="font-weight: 700; font-size: 14px; color: #f8fafc; margin-bottom: 4px;">No Planned Tasks or Travel Scheduled for ${this.escapeHtml(plannedWeek.weekRangeStr)}</div>
          <div style="font-size: 12px; color: #94a3b8; max-width: 480px; margin: 0 auto 14px auto;">
            Use the Trip Planner to schedule field visits, equipment deliveries, personal tasks, or certification training classes.
          </div>
          <div style="display: flex; gap: 8px; justify-content: center; flex-wrap: wrap;">
            <button class="btn btn-primary" onclick="window.weeklySummaryEngine.openAddTaskModal('${plannedWeek.days[0]?.dateKey || ''}')" style="font-size: 12px; font-weight: 700; background: #2563eb; color: #fff;">
              ➕ Schedule Task
            </button>
            <button class="btn btn-secondary" onclick="window.weeklySummaryEngine.openTripPlanner('${plannedWeek.days[0]?.dateKey || ''}')" style="font-size: 12px; font-weight: 600;">
              🗓️ Open Trip Planner
            </button>
          </div>
        </div>
      `;
    }

    // Include Saturday / Sunday only if they have content
    const displayDays = plannedWeek.days.filter((d, idx) => idx < 5 || d.hasContent);

    let html = `<div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 12px;">`;

    displayDays.forEach(day => {
      const isToday = day.isToday;
      const todayBorder = isToday ? 'border: 1px solid #3b82f6; box-shadow: 0 0 10px rgba(59, 130, 246, 0.25);' : 'border: 1px solid var(--border-color);';
      const todayHeaderBg = isToday ? 'background: rgba(59, 130, 246, 0.18); border-bottom: 1px solid rgba(59, 130, 246, 0.4);' : 'background: rgba(15, 23, 42, 0.6); border-bottom: 1px solid var(--border-color);';

      html += `
        <div style="background: var(--bg-secondary); ${todayBorder} border-radius: 8px; overflow: hidden; display: flex; flex-direction: column; min-height: 220px;">
          
          <!-- Day Header -->
          <div style="padding: 8px 10px; ${todayHeaderBg} display: flex; justify-content: space-between; align-items: center;">
            <div style="display: flex; align-items: center; gap: 6px;">
              <span style="font-weight: 800; font-size: 13px; color: ${isToday ? '#60a5fa' : '#f8fafc'};">${day.dayName}</span>
              <span style="font-size: 11px; color: #94a3b8; font-weight: 600;">${day.formattedDate}</span>
              ${isToday ? '<span style="font-size: 9px; font-weight: 800; background: #2563eb; color: #fff; padding: 1px 5px; border-radius: 3px;">TODAY</span>' : ''}
            </div>
            <div style="display: flex; align-items: center; gap: 4px;">
              <button onclick="window.weeklySummaryEngine.openTripPlanner('${day.dateKey}')" style="background: none; border: none; color: #94a3b8; font-size: 12px; cursor: pointer; padding: 0 3px; line-height: 1;" onmouseover="this.style.color='#60a5fa'" onmouseout="this.style.color='#94a3b8'" title="Open in Trip Planner">🗓️</button>
              <button onclick="window.weeklySummaryEngine.openAddTaskModal('${day.dateKey}')" style="background: none; border: none; color: #94a3b8; font-size: 13px; cursor: pointer; padding: 0 3px; line-height: 1;" onmouseover="this.style.color='#38bdf8'" onmouseout="this.style.color='#94a3b8'" title="Add task on ${day.dayName}">➕</button>
            </div>
          </div>

          <!-- Travel Bar (if trips planned) -->
          ${day.trips.length > 0 ? `
            <div style="padding: 6px 10px; background: rgba(245, 158, 11, 0.12); border-bottom: 1px solid rgba(245, 158, 11, 0.25); font-size: 11px; font-weight: 700; color: #fbbf24; display: flex; align-items: center; gap: 6px;">
              <span>🚗</span>
              <span style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${this.escapeHtml(day.trips.map(t => t.location).join(' → '))}">${this.escapeHtml(day.trips.map(t => t.location).join(' → '))}</span>
            </div>
          ` : ''}

          <!-- Content List -->
          <div style="padding: 8px; display: flex; flex-direction: column; gap: 6px; flex: 1;">
      `;

      if (!day.hasContent) {
        html += `
          <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; min-height: 90px; color: #64748b; font-size: 11.5px; text-align: center; gap: 6px;">
            <span>No tasks or travel</span>
            <button class="btn btn-secondary" onclick="window.weeklySummaryEngine.openAddTaskModal('${day.dateKey}')" style="font-size: 10px; padding: 2px 8px; color: #94a3b8;">+ Add</button>
          </div>
        `;
      } else {
        // 1. Scheduled Trainings (Crew Trainings + Cert Classes Cody teaches)
        if (day.trainings && day.trainings.length > 0) {
          const pendingTrainings = day.trainings.filter(t => !t.isCompleted).length;
          html += `
            <div style="background: rgba(16, 185, 129, 0.08); border: 1px solid rgba(16, 185, 129, 0.28); border-left: 4px solid #10b981; border-radius: 6px; padding: 6px 8px;">
              <div style="font-size: 10.5px; font-weight: 800; color: #34d399; margin-bottom: 5px; display: flex; align-items: center; justify-content: space-between;">
                <span style="display: flex; align-items: center; gap: 4px;">
                  <span>🎓</span>
                  <span>Training (${pendingTrainings}/${day.trainings.length})</span>
                </span>
                <span style="font-size: 9px; color: #6ee7b7; cursor: pointer;" onclick="window.weeklySummaryEngine.openTripPlanner('${day.dateKey}')" title="View in Trip Planner">Trip Planner ➔</span>
              </div>
              <div style="display: flex; flex-direction: column; gap: 5px;">
                ${day.trainings.map(tr => {
                  const isDone = !!tr.isCompleted;
                  return `
                    <div style="background: var(--bg-primary); border: 1px solid ${isDone ? 'rgba(16, 185, 129, 0.2)' : 'rgba(52, 211, 153, 0.3)'}; border-radius: 5px; padding: 5px 7px; opacity: ${isDone ? '0.75' : '1'};">
                      <div style="display: flex; align-items: center; gap: 4px; margin-bottom: 2px; flex-wrap: wrap;">
                        <span class="badge" style="background: rgba(16, 185, 129, 0.18); color: #34d399; font-size: 9px; font-weight: 800; padding: 1px 4px; border-radius: 3px;">
                          ${tr.isCrewTraining ? '🎓 Crew Training' : '🎓 Cert Class'}
                        </span>
                        ${tr.crewId ? `<span class="badge" style="background: rgba(59, 130, 246, 0.15); color: #60a5fa; font-size: 9px; font-weight: 700; padding: 1px 4px; border-radius: 3px;">🚚 Crew ${this.escapeHtml(tr.crewId)}</span>` : ''}
                        ${tr.month ? `<span class="badge" style="background: rgba(168, 85, 247, 0.15); color: #c084fc; font-size: 9px; padding: 1px 4px; border-radius: 3px;">📅 ${this.escapeHtml(tr.month)}</span>` : ''}
                        <span class="badge" style="background: ${isDone ? 'rgba(16, 185, 129, 0.25)' : 'rgba(234, 179, 8, 0.2)'}; color: ${isDone ? '#a7f3d0' : '#facc15'}; font-size: 8.5px; font-weight: 700; padding: 1px 4px; margin-left: auto;">
                          ${isDone ? '✅ Done' : '⏳ Scheduled'}
                        </span>
                      </div>
                      <div style="font-size: 11.5px; font-weight: 800; color: ${isDone ? '#94a3b8' : '#f8fafc'}; text-decoration: ${isDone ? 'line-through' : 'none'}; line-height: 1.25;">
                        ${this.escapeHtml(tr.topic)}
                      </div>
                      <div style="font-size: 10px; color: #cbd5e1; margin-top: 2px; display: flex; align-items: center; gap: 5px; flex-wrap: wrap;">
                        ${tr.lead ? `<span>👤 <strong>Lead:</strong> ${this.escapeHtml(tr.lead)}</span>` : ''}
                        ${tr.location ? `<span style="color: #93c5fd;">📍 ${this.escapeHtml(tr.location)}</span>` : ''}
                        ${tr.time ? `<span style="color: #6ee7b7;">🕒 ${this.escapeHtml(tr.time)}</span>` : ''}
                      </div>
                      ${tr.attendees ? `
                        <div style="font-size: 9.5px; color: #94a3b8; margin-top: 2px; line-height: 1.2; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${this.escapeHtml(tr.attendees)}">
                          👥 ${this.escapeHtml(tr.attendees)}
                        </div>
                      ` : ''}
                    </div>
                  `;
                }).join('')}
              </div>
            </div>
          `;
        }

        // 2. Scheduled Equipment Deliveries (supplies, AED pads, extinguishers)
        if (day.equipment && day.equipment.length > 0) {
          html += `
            <div style="background: rgba(245, 158, 11, 0.08); border: 1px solid rgba(245, 158, 11, 0.3); border-left: 4px solid #f59e0b; border-radius: 6px; padding: 6px 8px;">
              <div style="font-size: 10.5px; font-weight: 800; color: #fbbf24; margin-bottom: 5px; display: flex; align-items: center; justify-content: space-between;">
                <span style="display: flex; align-items: center; gap: 4px;">
                  <span>🧰</span>
                  <span>Equipment Deliveries (${day.equipment.length})</span>
                </span>
                <span style="font-size: 9px; color: #fde047;">Supplies</span>
              </div>
              <div style="display: flex; flex-direction: column; gap: 4px;">
                ${day.equipment.map(eq => {
                  const isDone = !!eq.isResolved;
                  return `
                    <div style="background: var(--bg-primary); border: 1px solid ${isDone ? 'rgba(16, 185, 129, 0.25)' : 'rgba(245, 158, 11, 0.25)'}; border-radius: 5px; padding: 5px 7px; opacity: ${isDone ? '0.72' : '1'};">
                      <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 2px;">
                        <span style="font-weight: 700; font-size: 11px; color: ${isDone ? '#94a3b8' : '#f8fafc'}; text-decoration: ${isDone ? 'line-through' : 'none'}; display: flex; align-items: center; gap: 4px;">
                          <span>${eq.icon}</span> ${this.escapeHtml(eq.equipmentType)}
                        </span>
                        ${eq.vehicleNumber ? `<span class="badge" style="background: rgba(234, 179, 8, 0.2); color: #fde047; font-size: 8.5px; font-weight: 700; padding: 1px 4px; border-radius: 3px;">🚛 Unit ${this.escapeHtml(eq.vehicleNumber)}</span>` : ''}
                      </div>
                      ${eq.notes ? `<div style="font-size: 10px; color: ${isDone ? '#94a3b8' : '#cbd5e1'}; text-decoration: ${isDone ? 'line-through' : 'none'}; line-height: 1.25; margin-bottom: 2px;">${this.escapeHtml(eq.notes)}</div>` : ''}
                      <div style="font-size: 9.5px; color: #94a3b8; display: flex; align-items: center; gap: 5px; flex-wrap: wrap;">
                        ${eq.crewId ? `<span style="color: #60a5fa;">👷 Crew ${this.escapeHtml(eq.crewId)}</span>` : ''}
                        ${eq.location ? `<span style="color: #93c5fd;">📍 ${this.escapeHtml(eq.location)}</span>` : ''}
                        ${isDone ? '<span style="color: #34d399; font-weight: 700; margin-left: auto;">✅ Delivered</span>' : '<span style="color: #fbbf24; margin-left: auto;">⏳ Pending</span>'}
                      </div>
                    </div>
                  `;
                }).join('')}
              </div>
            </div>
          `;
        }

        // 3. Field Reclaims (from employees that quit - SEPARATE from Swaps Due!)
        if (day.reclaims && day.reclaims.length > 0) {
          html += `
            <div style="background: rgba(245, 158, 11, 0.09); border: 1px solid rgba(245, 158, 11, 0.35); border-left: 4px solid #f59e0b; border-radius: 6px; padding: 6px 8px;">
              <div style="font-size: 10.5px; font-weight: 800; color: #fbbf24; margin-bottom: 5px; display: flex; align-items: center; justify-content: space-between;">
                <span style="display: flex; align-items: center; gap: 4px;">
                  <span>📦</span>
                  <span>Reclaims Due (${day.reclaims.length})</span>
                </span>
                <span style="font-size: 9px; color: #f87171; font-weight: 700;">Former Employees</span>
              </div>
              <div style="display: flex; flex-direction: column; gap: 4px;">
                ${day.reclaims.map(r => {
                  const isDone = !!r.isCompleted;
                  return `
                    <div style="background: var(--bg-primary); border: 1px solid ${isDone ? 'rgba(16, 185, 129, 0.25)' : 'rgba(245, 158, 11, 0.3)'}; border-radius: 5px; padding: 5px 7px; opacity: ${isDone ? '0.72' : '1'};">
                      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 2px;">
                        <span style="font-weight: 700; font-size: 11.5px; color: ${isDone ? '#94a3b8' : '#f8fafc'}; text-decoration: ${isDone ? 'line-through' : 'none'}; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                          ${this.escapeHtml(r.employee)}
                          <span style="font-size: 9px; color: #f87171; font-weight: 700; margin-left: 3px;">(Prev Emp)</span>
                        </span>
                        <span class="badge" style="background: rgba(59, 130, 246, 0.15); color: #93c5fd; font-size: 9px; padding: 1px 4px; border-radius: 3px;">
                          📍 ${this.escapeHtml(r.location)}
                        </span>
                      </div>
                      <div style="display: flex; justify-content: space-between; align-items: center; font-size: 10.5px; color: #cbd5e1; margin-top: 2px;">
                        <span class="badge" style="background: rgba(245, 158, 11, 0.18); color: #fbbf24; border: 1px solid rgba(245, 158, 11, 0.35); font-size: 9px; font-weight: 700; padding: 1px 4px; border-radius: 3px;">
                          📦 Reclaim ${r.icon} ${this.escapeHtml(r.kindLabel)}
                        </span>
                        <span>
                          ${isDone ? `
                            <strong style="color: #94a3b8; text-decoration: line-through;">#${this.escapeHtml(r.currentItem || '—')}</strong> ➔ <strong style="color: #34d399;">Helena 🏢</strong>
                          ` : `
                            <strong style="color: #fca5a5;">#${this.escapeHtml(r.currentItem || '—')}</strong> ➔ <strong style="color: #fbbf24;">Helena 🏢</strong>
                          `}
                          ${r.size ? `<span style="color: #94a3b8; font-size: 9px;"> (${this.escapeHtml(r.size)})</span>` : ''}
                        </span>
                      </div>
                      ${isDone ? `<div style="font-size: 9px; color: #34d399; font-weight: 700; margin-top: 2px; text-align: right;">✅ Reclaimed to Shelf</div>` : ''}
                    </div>
                  `;
                }).join('')}
              </div>
            </div>
          `;
        }

        // 4. Regular Swaps Due (with Item Kind, Town, and Replacement Pick)
        if (day.swaps && day.swaps.length > 0) {
          const pendingSwaps = day.swaps.filter(s => !s.isCompleted).length;
          html += `
            <div style="background: rgba(139, 92, 246, 0.08); border: 1px solid rgba(139, 92, 246, 0.3); border-left: 4px solid #8b5cf6; border-radius: 6px; padding: 6px 8px;">
              <div style="font-size: 10.5px; font-weight: 800; color: #c084fc; margin-bottom: 5px; display: flex; align-items: center; justify-content: space-between;">
                <span style="display: flex; align-items: center; gap: 4px;">
                  <span>🔄</span>
                  <span>Swaps Due (${pendingSwaps}/${day.swaps.length})</span>
                </span>
                <span style="font-size: 9px; color: #a78bfa;">PPE Swaps</span>
              </div>
              <div style="display: flex; flex-direction: column; gap: 4px;">
                ${day.swaps.map(s => {
                  const isDone = !!s.isCompleted;
                  return `
                    <div style="background: var(--bg-primary); border: 1px solid ${isDone ? 'rgba(16, 185, 129, 0.25)' : 'rgba(139, 92, 246, 0.3)'}; border-radius: 5px; padding: 5px 7px; opacity: ${isDone ? '0.72' : '1'};">
                      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 2px;">
                        <span style="font-weight: 700; font-size: 11.5px; color: ${isDone ? '#94a3b8' : '#f8fafc'}; text-decoration: ${isDone ? 'line-through' : 'none'}; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                          ${this.escapeHtml(s.employee)}
                          ${s.classification ? `<span style="font-size: 9px; color: #94a3b8; font-weight: normal; margin-left: 3px;">[${this.escapeHtml(s.classification)}]</span>` : ''}
                        </span>
                        <div style="display: flex; gap: 3px; align-items: center;">
                          <span class="badge" style="background: rgba(59, 130, 246, 0.15); color: #93c5fd; font-size: 9px; padding: 1px 4px; border-radius: 3px;">
                            📍 ${this.escapeHtml(s.location)}
                          </span>
                          ${s.crewId ? `<span class="badge" style="background: rgba(148, 163, 184, 0.15); color: #cbd5e1; font-size: 9px; padding: 1px 4px; border-radius: 3px;">Crew ${this.escapeHtml(s.crewId)}</span>` : ''}
                        </div>
                      </div>
                      <div style="display: flex; justify-content: space-between; align-items: center; font-size: 10.5px; color: #cbd5e1; margin-top: 2px;">
                        <span class="badge" style="background: rgba(59, 130, 246, 0.15); color: #93c5fd; border: 1px solid rgba(59, 130, 246, 0.3); font-size: 9px; font-weight: 700; padding: 1px 4px; border-radius: 3px;">
                          ${s.icon} ${this.escapeHtml(s.kindLabel)}
                        </span>
                        <span>
                          ${isDone ? `
                            <strong style="color: #94a3b8; text-decoration: line-through;">#${this.escapeHtml(s.currentItem || '—')}</strong> ➔ Assigned: <strong style="color: #34d399;">#${this.escapeHtml(s.pickItem || '—')}</strong>
                          ` : `
                            Current: <strong style="color: #fca5a5;">#${this.escapeHtml(s.currentItem || '—')}</strong> ➔ Pick: <strong style="color: #34d399;">#${this.escapeHtml(s.pickItem || '—')}</strong>
                          `}
                          ${s.size ? `<span style="color: #94a3b8; font-size: 9px;"> (${this.escapeHtml(s.size)})</span>` : ''}
                        </span>
                      </div>
                      ${isDone ? `<div style="font-size: 9px; color: #34d399; font-weight: 700; margin-top: 2px; text-align: right;">✅ Completed${s.completedDate ? ` (${this.escapeHtml(s.completedDate)})` : ''}</div>` : ''}
                    </div>
                  `;
                }).join('')}
              </div>
            </div>
          `;
        }

        // 5. Personal / Office Tasks (manually added)
        if (day.tasks && day.tasks.length > 0) {
          html += `
            <div style="display: flex; flex-direction: column; gap: 4px;">
              ${day.tasks.map(t => {
                const isDone = (t.status === 'Complete');
                const isHighPrio = (t.priority === 'High' || t.priority === 'Urgent');
                let cardBorder = isDone ? 'border-left: 3px solid #10b981; opacity: 0.65;' : (isHighPrio ? 'border-left: 3px solid #ef4444;' : 'border-left: 3px solid #3b82f6;');

                return `
                  <div style="background: var(--bg-card); border: 1px solid var(--border-color); ${cardBorder} border-radius: 6px; padding: 6px 8px; display: flex; flex-direction: column; gap: 3px;">
                    <div style="display: flex; align-items: flex-start; gap: 6px;">
                      <input type="checkbox" ${isDone ? 'checked' : ''} onchange="window.weeklySummaryEngine.togglePlannedTask('${this.escapeJs(t.id)}')" style="cursor: pointer; width: 13px; height: 13px; accent-color: #10b981; margin-top: 2px;" title="${isDone ? 'Mark as Pending' : 'Mark as Complete'}">
                      <div style="flex: 1; min-width: 0;">
                        <div style="font-size: 11.5px; font-weight: 700; color: ${isDone ? '#94a3b8' : '#f8fafc'}; line-height: 1.3; ${isDone ? 'text-decoration: line-through;' : ''} word-break: break-word;">
                          ${this.escapeHtml(t.title || 'Task')}
                        </div>
                      </div>
                      <button onclick="window.weeklySummaryEngine.openEditTaskModal('${this.escapeJs(t.id)}')" style="background: none; border: none; color: #64748b; font-size: 10px; cursor: pointer; padding: 0 2px; line-height: 1;" onmouseover="this.style.color='#93c5fd'" onmouseout="this.style.color='#64748b'" title="Edit Task">✏️</button>
                    </div>

                    <div style="display: flex; align-items: center; gap: 5px; flex-wrap: wrap; font-size: 9.5px; margin-top: 1px;">
                      ${t.time ? `<span style="color: #60a5fa; font-weight: 700;">🕒 ${this.escapeHtml(t.time)}</span>` : ''}
                      ${t.location ? `<span style="color: #94a3b8;">📍 ${this.escapeHtml(t.location)}</span>` : ''}
                      ${t.crewId ? `<span style="color: #cbd5e1; font-weight: 600;">🚚 Crew ${this.escapeHtml(t.crewId)}</span>` : ''}
                      ${isHighPrio ? `<span style="background: rgba(239, 68, 68, 0.2); color: #f87171; padding: 1px 3px; border-radius: 2px; font-weight: 700;">${this.escapeHtml(t.priority)}</span>` : ''}
                    </div>

                    ${t.notes ? `<div style="font-size: 10px; color: #64748b; line-height: 1.2; font-style: italic; margin-top: 2px;">${this.escapeHtml(t.notes)}</div>` : ''}
                  </div>
                `;
              }).join('')}
            </div>
          `;
        }
      }

      html += `
          </div>
        </div>
      `;
    });

    html += `</div>`;
    return html;
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
            ${item.isReclaim ? '<span class="badge" style="background: rgba(245, 158, 11, 0.2); color: #fbbf24; font-size: 9px; padding: 1px 5px; border-radius: 3px; font-weight: 700; margin-left: 4px; border: 1px solid rgba(245, 158, 11, 0.4);">📦 Reclaim</span>' : ''}
          </td>
          <td style="padding: 10px 12px; font-weight: 700; color: #f8fafc;">
            <a href="javascript:void(0)" onclick="if(window.employeeProfileEngine){window.employeeProfileEngine.openProfile('${this.escapeJs(item.employee)}');}" style="color: #f8fafc; text-decoration: none;">
              ${this.escapeHtml(item.employee)}
            </a>
            ${item.isReclaim ? '<span style="color: #f87171; font-size: 9.5px; font-weight: 700; margin-left: 4px;">(Prev Emp)</span>' : ''}
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
            <div style="font-weight: 700; font-size: 13px; color: #f8fafc; display: flex; align-items: center; gap: 6px;">
              <span>${t.isMonthlyTopic ? '📚' : '🎓'}</span>
              <span>${this.escapeHtml(t.title)}</span>
              ${t.isMonthlyTopic ? '<span style="padding: 1px 6px; border-radius: 4px; font-size: 10px; font-weight: 700; background: rgba(59, 130, 246, 0.2); color: #93c5fd; border: 1px solid rgba(59, 130, 246, 0.35);">Curriculum</span>' : ''}
            </div>
            <div style="font-size: 11.5px; color: #94a3b8;">
              📍 ${this.escapeHtml(t.location)} · 👨‍🏫 Instructor: <strong style="color: #cbd5e1;">${this.escapeHtml(t.instructor)}</strong>
            </div>
          </div>
          <div style="text-align: right;">
            <div style="font-size: 12px; font-weight: 700; color: #60a5fa;">📅 ${this.escapeHtml(t.date)}</div>
            <div style="font-size: 11px; color: #34d399; font-weight: 600;">👥 ${this.escapeHtml(t.attendeesLabel || `${t.attendees} Enrolled`)}</div>
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

  setTasksWeekOffset(offset) {
    this.tasksWeekOffset = offset;
    this.render();
  }

  async togglePlannedTask(taskId) {
    try {
      if (window.tripPlanner && typeof window.tripPlanner.toggleManualTask === 'function') {
        await window.tripPlanner.toggleManualTask(taskId);
      } else {
        const tasks = (this.db && typeof this.db.getManualTasks === 'function')
          ? this.db.getManualTasks()
          : (this.db?.snapshot?.configs?.manual_tasks || []);
        const task = tasks.find(t => t.id === taskId);
        if (task) {
          task.status = (task.status === 'Complete') ? 'Pending' : 'Complete';
          task.completedAt = (task.status === 'Complete') ? new Date().toISOString() : null;
          if (this.db && typeof this.db.saveManualTasks === 'function') {
            await this.db.saveManualTasks(tasks);
          }
        }
      }
    } catch (e) {
      console.warn('Error toggling planned task:', e);
    }
    this.render();
  }

  openAddTaskModal(dateKey) {
    if (window.tripPlanner && typeof window.tripPlanner.openAddManualTaskModal === 'function') {
      window.tripPlanner.openAddManualTaskModal(dateKey || '', '', 'personal_task');
    } else if (window.navigateToView) {
      window.navigateToView('trip-planner-view');
    }
  }

  openEditTaskModal(taskId) {
    if (window.tripPlanner && typeof window.tripPlanner.openEditManualTaskModal === 'function') {
      window.tripPlanner.openEditManualTaskModal(taskId);
    }
  }

  openTripPlanner(dateKey) {
    if (window.navigateToView) {
      window.navigateToView('trip-planner-view');
      if (dateKey && window.tripPlanner && typeof window.tripPlanner.goToDate === 'function') {
        window.tripPlanner.goToDate(dateKey);
      }
    }
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
        <div style="font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase;">Planned Tasks</div>
        <div style="font-size: 20px; font-weight: 800; color: #0284c7;">${data.plannedWeek.totalTasks}</div>
      </div>
      <div style="flex: 1; border-left: 1px solid #e2e8f0;">
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
      
      <!-- Planned Tasks & Field Itinerary Section -->
      <h2 style="font-size: 15px; font-weight: 700; color: #0f172a; border-bottom: 2px solid #2563eb; padding-bottom: 6px; margin-top: 0;">📋 1. Planned Tasks & Field Itinerary (${this.escapeHtml(data.plannedWeek.weekRangeStr)})</h2>
      <p style="font-size: 12.5px; color: #475569; margin: 6px 0 12px 0;">Scheduled personal tasks, safety training classes, and field travel from the Trip Planner:</p>
      
      ${(() => {
        const hasAny = data.plannedWeek.days.some(d => d.hasContent);
        if (!hasAny) {
          return `<p style="font-size: 12px; color: #64748b; font-style: italic; margin-bottom: 24px;">No field travel or manual tasks scheduled for this week.</p>`;
        }
        let tbl = `
          <table style="width: 100%; border-collapse: collapse; font-size: 12px; margin-bottom: 24px;">
            <thead>
              <tr style="background: #f1f5f9; color: #334155; font-weight: 700; text-align: left;">
                <th style="padding: 8px 10px; border: 1px solid #cbd5e1; width: 16%;">Day / Date</th>
                <th style="padding: 8px 10px; border: 1px solid #cbd5e1; width: 18%;">Field Travel</th>
                <th style="padding: 8px 10px; border: 1px solid #cbd5e1; width: 34%;">Planned Tasks & Courses</th>
                <th style="padding: 8px 10px; border: 1px solid #cbd5e1; width: 32%;">Swaps & Reclaims</th>
              </tr>
            </thead>
            <tbody>
        `;
        const activeDays = data.plannedWeek.days.filter((d, idx) => idx < 5 || d.hasContent);
        activeDays.forEach(d => {
          let tasksHtml = '';
          const taskItems = [];

          // Scheduled Training
          if (d.trainings && d.trainings.length > 0) {
            d.trainings.forEach(tr => {
              const isDone = !!tr.isCompleted;
              const mark = isDone ? '✅' : '⏳';
              taskItems.push(`
                <div style="margin-bottom: 3px; font-size: 11px; ${isDone ? 'color: #64748b;' : 'color: #065f46; font-weight: 600;'}">
                  ${mark} 🎓 <strong>${this.escapeHtml(tr.topic)}</strong>${tr.crewId ? ` · Crew ${this.escapeHtml(tr.crewId)}` : ''}${tr.lead ? ` (Lead: ${this.escapeHtml(tr.lead)})` : ''}${tr.location ? ` [📍 ${this.escapeHtml(tr.location)}]` : ''}
                </div>
              `);
            });
          }

          // Equipment Deliveries
          if (d.equipment && d.equipment.length > 0) {
            d.equipment.forEach(eq => {
              const isDone = !!eq.isResolved;
              taskItems.push(`
                <div style="margin-bottom: 3px; font-size: 11px; ${isDone ? 'color: #64748b; text-decoration: line-through;' : 'color: #92400e;'}">
                  ${isDone ? '✅' : '⏳'} 🧰 <strong>${this.escapeHtml(eq.equipmentType)}</strong>${eq.vehicleNumber ? ` (Unit ${this.escapeHtml(eq.vehicleNumber)})` : ''}${eq.crewId ? ` · Crew ${this.escapeHtml(eq.crewId)}` : ''}${eq.location ? ` [📍 ${this.escapeHtml(eq.location)}]` : ''}
                </div>
              `);
            });
          }

          // Personal / Office Tasks
          if (d.tasks && d.tasks.length > 0) {
            d.tasks.forEach(t => {
              const mark = t.status === 'Complete' ? '✅' : '⏳';
              const isDone = t.status === 'Complete';
              const timeStr = t.time ? ` (${this.escapeHtml(t.time)})` : '';
              const locStr = t.location ? ` [${this.escapeHtml(t.location)}]` : '';
              taskItems.push(`
                <div style="margin-bottom: 3px; font-size: 11px; ${isDone ? 'color: #64748b; text-decoration: line-through;' : 'color: #0f172a; font-weight: 600;'}">
                  ${mark} ${this.escapeHtml(t.title || 'Task')}${timeStr}${locStr}
                </div>
              `);
            });
          }

          tasksHtml = taskItems.length > 0 ? taskItems.join('') : '<span style="color: #94a3b8; font-style: italic;">No tasks scheduled</span>';

          // Field Travel
          const travelHtml = d.trips.length > 0
            ? `<span style="font-weight: 700; color: #d97706;">🚗 ${this.escapeHtml(d.trips.map(t => t.location).join(' → '))}</span>`
            : '<span style="color: #94a3b8;">—</span>';

          // Swaps & Reclaims
          const swapItems = [];
          if (d.reclaims && d.reclaims.length > 0) {
            d.reclaims.forEach(r => {
              swapItems.push(`
                <div style="margin-bottom: 3px; font-size: 11px; color: #b45309;">
                  ${r.isCompleted ? '✅' : '📦'} <strong>Reclaim:</strong> ${this.escapeHtml(r.kindLabel)} #${this.escapeHtml(r.currentItem)} ➔ Helena · <strong>${this.escapeHtml(r.employee)}</strong> (Prev Emp) · 📍 ${this.escapeHtml(r.location)}
                </div>
              `);
            });
          }
          if (d.swaps && d.swaps.length > 0) {
            d.swaps.forEach(s => {
              swapItems.push(`
                <div style="margin-bottom: 3px; font-size: 11px; color: #6b21a8;">
                  ${s.isCompleted ? '✅' : '🔄'} <strong>Swap:</strong> ${this.escapeHtml(s.kindLabel)} #${this.escapeHtml(s.currentItem)} ➔ #${this.escapeHtml(s.pickItem || 'Needed')} · <strong>${this.escapeHtml(s.employee)}</strong> · 📍 ${this.escapeHtml(s.location)}${s.crewId ? ` (Crew ${this.escapeHtml(s.crewId)})` : ''}
                </div>
              `);
            });
          }
          const swapsHtml = swapItems.length > 0 ? swapItems.join('') : '<span style="color: #94a3b8;">—</span>';

          tbl += `
            <tr style="background: ${d.isToday ? '#eff6ff' : '#ffffff'};">
              <td style="padding: 6px 10px; border: 1px solid #e2e8f0; font-weight: 700; color: #0f172a;">${d.dayName} <span style="font-weight: normal; color: #64748b;">(${d.formattedDate})</span></td>
              <td style="padding: 6px 10px; border: 1px solid #e2e8f0;">${travelHtml}</td>
              <td style="padding: 6px 10px; border: 1px solid #e2e8f0;">${tasksHtml}</td>
              <td style="padding: 6px 10px; border: 1px solid #e2e8f0;">${swapsHtml}</td>
            </tr>
          `;
        });
        tbl += `
            </tbody>
          </table>
        `;
        return tbl;
      })()}

      <!-- Compliance Section -->
      <h2 style="font-size: 15px; font-weight: 700; color: #0f172a; border-bottom: 2px solid #2563eb; padding-bottom: 6px; margin-top: 24px;">🛡️ 2. Safety Compliance Pulse</h2>
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
      <h2 style="font-size: 15px; font-weight: 700; color: #0f172a; border-bottom: 2px solid #2563eb; padding-bottom: 6px;">🧤 3. PPE & Equipment Swaps Required (${data.swaps.totalActionRequired})</h2>
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
      <h2 style="font-size: 15px; font-weight: 700; color: #0f172a; border-bottom: 2px solid #2563eb; padding-bottom: 6px;">📜 4. Urgent Certifications & Training</h2>
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
      <!-- Training Section -->
      <h2 style="font-size: 15px; font-weight: 700; color: #0f172a; border-bottom: 2px solid #2563eb; padding-bottom: 6px; margin-top: 24px;">🎓 5. Scheduled Safety Training (${data.training.length})</h2>
    `;

    if (data.training.length === 0) {
      emailHtml += `<p style="font-size: 12.5px; color: #64748b;">No safety training sessions scheduled for this week.</p>`;
    } else {
      emailHtml += `
        <table style="width: 100%; border-collapse: collapse; font-size: 12px; margin-bottom: 24px;">
          <thead>
            <tr style="background: #f1f5f9; color: #334155; font-weight: 700; text-align: left;">
              <th style="padding: 8px 10px; border: 1px solid #cbd5e1;">Topic / Course</th>
              <th style="padding: 8px 10px; border: 1px solid #cbd5e1;">Date / Timing</th>
              <th style="padding: 8px 10px; border: 1px solid #cbd5e1;">Location</th>
              <th style="padding: 8px 10px; border: 1px solid #cbd5e1;">Instructor</th>
              <th style="padding: 8px 10px; border: 1px solid #cbd5e1; text-align: right;">Status / Enrolled</th>
            </tr>
          </thead>
          <tbody>
      `;
      data.training.forEach(t => {
        emailHtml += `
          <tr>
            <td style="padding: 6px 10px; border: 1px solid #e2e8f0; font-weight: 700; color: #0f172a;">${t.isMonthlyTopic ? '📚 ' : '🎓 '}${this.escapeHtml(t.title)}</td>
            <td style="padding: 6px 10px; border: 1px solid #e2e8f0; color: #2563eb; font-weight: 600;">${this.escapeHtml(t.date)}</td>
            <td style="padding: 6px 10px; border: 1px solid #e2e8f0; color: #64748b;">${this.escapeHtml(t.location)}</td>
            <td style="padding: 6px 10px; border: 1px solid #e2e8f0;">${this.escapeHtml(t.instructor)}</td>
            <td style="padding: 6px 10px; border: 1px solid #e2e8f0; text-align: right; font-weight: 700; color: #16a34a;">${this.escapeHtml(t.attendeesLabel || `${t.attendees} Enrolled`)}</td>
          </tr>
        `;
      });
      emailHtml += `
          </tbody>
        </table>
      `;
    }

    emailHtml += `
      <!-- Incident Reports Section -->
      <h2 style="font-size: 15px; font-weight: 700; color: #0f172a; border-bottom: 2px solid #2563eb; padding-bottom: 6px;">⚠️ 6. Recent Incident Reports (Past 14 Days: ${data.incidents.length})</h2>
    `;

    if (data.incidents.length === 0) {
      emailHtml += `<p style="font-size: 12.5px; color: #16a34a; font-weight: 600;">✅ Clean Safety Record: Zero incident reports submitted in the past 14 days.</p>`;
    } else {
      emailHtml += `
        <table style="width: 100%; border-collapse: collapse; font-size: 12px; margin-bottom: 20px;">
          <thead>
            <tr style="background: #f1f5f9; color: #334155; font-weight: 700; text-align: left;">
              <th style="padding: 8px 10px; border: 1px solid #cbd5e1;">Date</th>
              <th style="padding: 8px 10px; border: 1px solid #cbd5e1;">Job / Crew</th>
              <th style="padding: 8px 10px; border: 1px solid #cbd5e1;">Foreman</th>
              <th style="padding: 8px 10px; border: 1px solid #cbd5e1;">Incident Type</th>
              <th style="padding: 8px 10px; border: 1px solid #cbd5e1;">Description</th>
            </tr>
          </thead>
          <tbody>
      `;
      data.incidents.forEach(inc => {
        emailHtml += `
          <tr style="background: #fffbeb;">
            <td style="padding: 6px 10px; border: 1px solid #e2e8f0; font-weight: 700; color: #ea580c;">${this.escapeHtml(inc.date)}</td>
            <td style="padding: 6px 10px; border: 1px solid #e2e8f0; font-weight: 700;">${this.escapeHtml(inc.job)}</td>
            <td style="padding: 6px 10px; border: 1px solid #e2e8f0;">${this.escapeHtml(inc.foreman)}</td>
            <td style="padding: 6px 10px; border: 1px solid #e2e8f0; color: #d97706; font-weight: 600;">${this.escapeHtml(inc.type)}</td>
            <td style="padding: 6px 10px; border: 1px solid #e2e8f0; color: #334155;">${this.escapeHtml(inc.description)}</td>
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
    text += `- Planned Tasks & Field Travel: ${data.plannedWeek.totalTasks} tasks (${data.plannedWeek.pendingTasks} pending, ${data.plannedWeek.completedTasks} completed) across ${data.plannedWeek.fieldDaysCount} field travel days [Week: ${data.plannedWeek.weekRangeStr}]\n`;
    text += `- Safety Compliance Rate: ${data.compliance.stats.ratePercent}% (${data.compliance.stats.completeCount}/${data.compliance.stats.totalCrews} crews complete) [Target: ${data.compliance.targetWeekRangeStr || data.weekRangeStr}]\n`;
    text += `- Equipment Swaps Action Required: ${data.swaps.totalActionRequired} (${data.swaps.overdue.length} overdue, ${data.swaps.dueThisWeek.length} due this week)\n`;
    text += `- Urgent Cert Expirations (< 30d): ${data.certs.urgent.length}\n`;
    text += `- Scheduled Training Sessions: ${data.training.length}\n`;
    text += `- Incidents Reported (Past 14d): ${data.incidents.length}\n\n`;

    text += `PLANNED TASKS & FIELD ITINERARY (${data.plannedWeek.weekRangeStr}):\n`;
    let hasAnyPlanned = false;
    data.plannedWeek.days.forEach(d => {
      if (d.hasContent) {
        hasAnyPlanned = true;
        text += `• ${d.dayName} (${d.formattedDate}):\n`;
        if (d.trips.length > 0) {
          text += `   🚗 Travel: ${d.trips.map(t => t.location).join(' → ')}\n`;
        }
        if (d.trainings && d.trainings.length > 0) {
          d.trainings.forEach(tr => {
            text += `   🎓 Training: ${tr.topic}${tr.crewId ? ` — Crew ${tr.crewId}` : ''}${tr.lead ? ` (Lead: ${tr.lead})` : ''} [📍 ${tr.location}] ${tr.isCompleted ? '[Done]' : '[Scheduled]'}\n`;
          });
        }
        if (d.equipment && d.equipment.length > 0) {
          d.equipment.forEach(eq => {
            text += `   🧰 Equipment: ${eq.equipmentType}${eq.vehicleNumber ? ` (Unit ${eq.vehicleNumber})` : ''}${eq.crewId ? ` — Crew ${eq.crewId}` : ''} [📍 ${eq.location}] ${eq.isResolved ? '[Delivered]' : '[Pending]'}\n`;
          });
        }
        if (d.reclaims && d.reclaims.length > 0) {
          d.reclaims.forEach(r => {
            text += `   📦 Reclaim: ${r.kindLabel} #${r.currentItem} ➔ Helena — ${r.employee} (Prev Emp) [📍 ${r.location}] ${r.isCompleted ? '[Done]' : ''}\n`;
          });
        }
        if (d.swaps && d.swaps.length > 0) {
          d.swaps.forEach(s => {
            text += `   🔄 Swap: ${s.kindLabel} #${s.currentItem} ➔ #${s.pickItem || 'Needed'} — ${s.employee} [📍 ${s.location}]${s.crewId ? ` (Crew ${s.crewId})` : ''} ${s.isCompleted ? '[Done]' : ''}\n`;
          });
        }
        if (d.tasks && d.tasks.length > 0) {
          d.tasks.forEach(t => {
            const mark = t.status === 'Complete' ? '[✓]' : '[ ]';
            const timeStr = t.time ? ` (${t.time})` : '';
            const locStr = t.location ? ` [${t.location}]` : '';
            text += `   ${mark} ${t.title || 'Task'}${timeStr}${locStr}\n`;
          });
        }
      }
    });
    if (!hasAnyPlanned) {
      text += `  No field travel or manual tasks scheduled in the Trip Planner for this week.\n`;
    }
    text += `\n`;

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

    if (data.training.length > 0) {
      text += `SCHEDULED SAFETY TRAINING:\n`;
      data.training.forEach(t => {
        text += `• ${t.title} — ${t.date} (${t.location}) | Instructor: ${t.instructor} | ${t.attendeesLabel || `${t.attendees} Enrolled`}\n`;
      });
      text += `\n`;
    }

    if (data.incidents.length > 0) {
      text += `RECENT INCIDENT REPORTS (PAST 14d):\n`;
      data.incidents.forEach(inc => {
        text += `• [${inc.type}] Job #${inc.job} (Foreman: ${inc.foreman}) — ${inc.date}: ${inc.description}\n`;
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
