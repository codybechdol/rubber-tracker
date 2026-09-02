/**
 * drug-testing.js - Random DOT Drug Testing & Clinic Scheduling Workspace for Desktop App
 * Manages quarterly random testing pools, clinic appointments, mobile collector dispatch,
 * meeting addresses, and one-click completion.
 */

class DrugTestingEngine {
  constructor(db) {
    this.db = db;
    this.currentQuarter = this.getDefaultQuarter();
    this.statusFilter = 'all';
    this.typeFilter = 'all'; // 'all', 'Drug Only', 'Drug & Alcohol'
    this.classFilter = 'all'; // 'all', 'FMCSA', 'PHMSA', 'Non-DOT'
    this.searchTerm = '';
    this.activeTab = 'pool'; // 'pool' or 'clinics'
    this.clinicFilter = 'all'; // 'all', 'mobile', 'walkin', 'appt'
    this.defaultClinics = [
      { name: "First Choice - Butte", isMobile: false, address: "2929 Phillips Ave", city: "Butte", state: "MT", zip: "59701", phone: "406-494-0137", hours: "M-F 8am-5pm", apptReq: "No", paperwork: "Has generic CCFs, eCCF", notes: "No appointment needed" },
      { name: "Frontier Medicine - Helena", isMobile: false, address: "1930 N Sanders St", city: "Helena", state: "MT", zip: "59601", phone: "406-444-2454", hours: "M-F 8am-4:30pm", apptReq: "No", paperwork: "Has generic CCFs, eCCF", notes: "Walk-in welcome" },
      { name: "Great Falls Occupational Health", isMobile: false, address: "1400 29th St S", city: "Great Falls", state: "MT", zip: "59405", phone: "406-454-2171", hours: "M-F 7:30am-4:30pm", apptReq: "No", paperwork: "eCCF & paper CCF", notes: "Walk-in welcome" },
      { name: "Bozeman Health Occupational Health", isMobile: false, address: "931 Highland Blvd, Ste 3210", city: "Bozeman", state: "MT", zip: "59715", phone: "406-414-4800", hours: "M-F 8am-4:30pm", apptReq: "Yes", paperwork: "eCCF / Form Fox", notes: "Appt recommended" },
      { name: "Billings Clinic Occupational Medicine", isMobile: false, address: "1020 N 27th St", city: "Billings", state: "MT", zip: "59101", phone: "406-238-2500", hours: "M-F 8am-5pm", apptReq: "No", paperwork: "eCCF available", notes: "Walk-in welcome" },
      { name: "Missoula Occupational Health", isMobile: false, address: "2827 Fort Missoula Rd", city: "Missoula", state: "MT", zip: "59804", phone: "406-327-4400", hours: "M-F 8am-4:30pm", apptReq: "No", paperwork: "eCCF", notes: "Walk-ins accepted" },
      { name: "Kalispell Regional Occupational Health", isMobile: false, address: "350 Sunnyview Ln", city: "Kalispell", state: "MT", zip: "59901", phone: "406-752-5111", hours: "M-F 8am-5pm", apptReq: "No", paperwork: "eCCF", notes: "Walk-ins accepted" },
      { name: "Glendive Medical Center", isMobile: false, address: "202 Prospect Dr", city: "Glendive", state: "MT", zip: "59330", phone: "406-345-3306", hours: "M-F 8am-4pm", apptReq: "Yes", paperwork: "Bring paper CCF & kit", notes: "Call ahead for appointment" },
      { name: "Miles City Occupational Health", isMobile: false, address: "2600 Wilson St", city: "Miles City", state: "MT", zip: "59301", phone: "406-233-2600", hours: "M-F 8am-4:30pm", apptReq: "Yes", paperwork: "Split kit required", notes: "Appt required" },
      { name: "Sidney Health Center Lab", isMobile: false, address: "216 14th Ave SW", city: "Sidney", state: "MT", zip: "59270", phone: "406-488-2100", hours: "M-F 8am-4pm", apptReq: "Yes", paperwork: "Bring CCF & chain of custody", notes: "Appointment required" },
      { name: "Valley Workforce Mobile Collector", isMobile: true, address: "Mobile Dispatch", city: "Helena / Bozeman", state: "MT", zip: "59601", phone: "406-439-5512", hours: "By Dispatch", apptReq: "Yes", paperwork: "Mobile collector provides kits", notes: "Meets crew on site/yard" },
      { name: "Drug Information Systems Mobile", isMobile: true, address: "Mobile Dispatch", city: "Billings / Statewide", state: "MT", zip: "59101", phone: "406-248-1818", hours: "By Dispatch", apptReq: "Yes", paperwork: "Mobile collector brings chain of custody", notes: "Meets crew on site/yard" },
      { name: "Bitterroot Valley Mobile Collections", isMobile: true, address: "Mobile Dispatch", city: "Missoula / Bitterroot", state: "MT", zip: "59840", phone: "406-363-2211", hours: "By Dispatch", apptReq: "Yes", paperwork: "Full mobile dispatch", notes: "Meets crew on site/yard" },
      { name: "Rapid City Occupational Health", isMobile: false, address: "640 Flormann St", city: "Rapid City", state: "SD", zip: "57701", phone: "605-755-1000", hours: "M-F 8am-5pm", apptReq: "No", paperwork: "eCCF", notes: "Walk-ins welcome" },
      { name: "Sanford Health Occ Med - Sioux Falls", isMobile: false, address: "1305 W 18th St", city: "Sioux Falls", state: "SD", zip: "57104", phone: "605-333-1000", hours: "M-F 7:30am-5pm", apptReq: "No", paperwork: "eCCF available", notes: "Walk-in welcome" },
      { name: "Avera Occupational Medicine", isMobile: false, address: "3900 W Avera Dr", city: "Sioux Falls", state: "SD", zip: "57108", phone: "605-322-5100", hours: "M-F 8am-4:30pm", apptReq: "No", paperwork: "eCCF", notes: "Walk-in welcome" },
      { name: "Spearfish Regional Clinic", isMobile: false, address: "1445 North Ave", city: "Spearfish", state: "SD", zip: "57783", phone: "605-644-4170", hours: "M-F 8am-4:30pm", apptReq: "Yes", paperwork: "Paper CCF recommended", notes: "Appt recommended" },
      { name: "CareNow Urgent Care - Dallas", isMobile: false, address: "14856 Preston Rd", city: "Dallas", state: "TX", zip: "75254", phone: "972-980-0084", hours: "M-Sat 8am-8pm, Sun 8am-5pm", apptReq: "No", paperwork: "eCCF / Web CCF", notes: "Walk-in or online check-in" },
      { name: "Nova Medical Centers - Houston", isMobile: false, address: "9000 Southwest Fwy", city: "Houston", state: "TX", zip: "77074", phone: "713-988-4448", hours: "M-F 8:30am-5pm", apptReq: "No", paperwork: "eCCF", notes: "Walk-in welcome" },
      { name: "Concentra Urgent Care - Austin", isMobile: false, address: "10001 N IH-35", city: "Austin", state: "TX", zip: "78753", phone: "512-837-9990", hours: "M-F 8am-5pm", apptReq: "No", paperwork: "eCCF", notes: "Walk-in welcome" },
      { name: "Occucare International - Midland", isMobile: false, address: "3300 N A St, Bldg 5", city: "Midland", state: "TX", zip: "79705", phone: "432-570-0016", hours: "M-F 8am-5pm", apptReq: "No", paperwork: "eCCF", notes: "Walk-in welcome" },
      { name: "Texas MedClinic - San Antonio", isMobile: false, address: "6530 W Loop 1604 N", city: "San Antonio", state: "TX", zip: "78254", phone: "210-476-5577", hours: "Open 24/7", apptReq: "No", paperwork: "eCCF", notes: "24/7 walk-in" },
      { name: "Concentra Urgent Care - Bakersfield", isMobile: false, address: "1800 Westwind Dr", city: "Bakersfield", state: "CA", zip: "93301", phone: "661-327-9617", hours: "M-F 7am-5pm", apptReq: "No", paperwork: "eCCF", notes: "Walk-in welcome" },
      { name: "Kaiser On-the-Job - Sacramento", isMobile: false, address: "1650 Response Rd", city: "Sacramento", state: "CA", zip: "95815", phone: "916-614-4040", hours: "M-F 8am-5pm", apptReq: "Yes", paperwork: "Authorization letter required", notes: "Call for appointment" },
      { name: "US HealthWorks - Fresno", isMobile: false, address: "2555 S E Ave", city: "Fresno", state: "CA", zip: "93725", phone: "559-498-8591", hours: "M-F 8am-5pm", apptReq: "No", paperwork: "eCCF", notes: "Walk-in welcome" },
      { name: "Concentra Urgent Care - San Jose", isMobile: false, address: "1901 Monterey Rd", city: "San Jose", state: "CA", zip: "95112", phone: "408-453-5030", hours: "M-F 8am-5pm", apptReq: "No", paperwork: "eCCF", notes: "Walk-in welcome" },
      { name: "Concentra Urgent Care - Las Vegas Central", isMobile: false, address: "3900 Paradise Rd", city: "Las Vegas", state: "NV", zip: "89169", phone: "702-369-0560", hours: "M-F 7am-5pm", apptReq: "No", paperwork: "eCCF", notes: "Walk-in welcome" },
      { name: "Concentra Urgent Care - Reno", isMobile: false, address: "255 Glendale Ave", city: "Sparks", state: "NV", zip: "89431", phone: "775-356-8181", hours: "M-F 7:30am-5pm", apptReq: "No", paperwork: "eCCF", notes: "Walk-in welcome" },
      { name: "ARC Health & Wellness - Reno", isMobile: false, address: "2205 Glendale Ave", city: "Sparks", state: "NV", zip: "89431", phone: "775-331-3361", hours: "M-F 8am-5pm", apptReq: "No", paperwork: "eCCF / paper CCF", notes: "Walk-in welcome" },
      { name: "Elko Clinic Occupational Health", isMobile: false, address: "1995 Errecart Blvd", city: "Elko", state: "NV", zip: "89801", phone: "775-738-3111", hours: "M-F 8am-4:30pm", apptReq: "Yes", paperwork: "Bring kit & CCF", notes: "Appointment required" }
    ];
  }

  getDefaultQuarter() {
    const now = new Date();
    const m = now.getMonth();
    const q = Math.floor(m / 3) + 1;
    return `Q${q} ${now.getFullYear()}`;
  }

  init() {
    this.bindEvents();
  }

  bindEvents() {
    // Delegated click handling or global hooks can be registered here
  }

  getTestsTable() {
    let t = this.db.getTable('dot_drug_tests');
    if (!t || !t.rows) {
      t = { name: 'DOT Drug Tests', headers: ['Quarter', 'Employee Name', 'Location', 'Job Number', 'Phone Number', 'Test Type', 'Classification', 'Collection Type', 'Clinic Name', 'Clinic City / State', 'Appt Required', 'Scheduled Date', 'Scheduled Time', 'Meeting / Collection Address', 'Status', 'Date Completed', 'Paperwork / Kit Notes', 'Notes', 'Date Added'], rows: [], rawGrid: [] };
    }
    return t;
  }

  getClinicsList() {
    const t = this.db.getTable('drug_test_clinics');
    const list = [];
    if (t && t.rows && t.rows.length > 0) {
      t.rows.forEach(r => {
        const name = String(r['Firm / Clinic Name'] || r['Firm'] || r[0] || '').trim();
        if (name && name.toLowerCase() !== 'firm / clinic name') {
          list.push({
            name: name,
            isMobile: String(r['Is Mobile'] || r[1] || '').toLowerCase() === 'true' || /mobile/i.test(name),
            address: String(r['Street Address'] || r[2] || ''),
            city: String(r['City'] || r[3] || ''),
            state: String(r['State'] || r[4] || ''),
            zip: String(r['Zip'] || r[5] || ''),
            phone: String(r['Phone Number'] || r[6] || ''),
            hours: String(r['Hours'] || r[7] || ''),
            apptReq: String(r['Appt Required'] || r[8] || 'No'),
            paperwork: String(r['Paperwork Required'] || r[9] || ''),
            notes: String(r['Notes / Lab Instructions'] || r[10] || '')
          });
        }
      });
    }

    // If local table is empty, merge default clinics
    if (list.length === 0) {
      return this.defaultClinics;
    }
    return list;
  }

  getActiveEmployees() {
    const t = this.db.getTable('employees');
    const emps = [];
    if (t && t.rows) {
      t.rows.forEach(r => {
        const name = String(r['Employee Name'] || r['Name'] || r[0] || '').trim();
        const loc = String(r['Location'] || r[1] || '').trim();
        const job = String(r['Job Number'] || r[2] || '').trim();
        const phone = String(r['Phone Number'] || r['Phone'] || r[3] || '').trim();
        if (name && name.toLowerCase() !== 'employee name' && name.toLowerCase() !== 'active') {
          emps.push({ name, location: loc, jobNumber: job, phone });
        }
      });
    }
    emps.sort((a, b) => a.name.localeCompare(b.name));
    return emps;
  }

  getJobSiteSuggestions() {
    const jt = this.db.getTable('job_tracking');
    const sites = {};
    if (jt && jt.rows) {
      jt.rows.forEach(r => {
        const jobNum = String(r['Job Number'] || r[0] || '').trim();
        const city = String(r['Location'] || r[1] || '').trim();
        const name = String(r['Job Name'] || r[2] || '').trim();
        if (jobNum) {
          sites[jobNum] = name ? `${name} (${city})` : `${city} Job Site`;
        }
      });
    }
    return sites;
  }

  render() {
    const container = document.getElementById('drug-testing-view');
    if (!container) return;

    const testsTable = this.getTestsTable();
    const clinics = this.getClinicsList();
    const employees = this.getActiveEmployees();
    const siteSuggestions = this.getJobSiteSuggestions();

    // Extract all unique quarters
    const quartersSet = new Set([this.currentQuarter]);
    (testsTable.rows || []).forEach(r => {
      const q = String(r['Quarter'] || r[0] || '').trim();
      if (q) quartersSet.add(q);
    });
    const quarters = Array.from(quartersSet);

    // Filter tests for current quarter
    const quarterTests = (testsTable.rows || []).filter(r => {
      const q = String(r['Quarter'] || r[0] || '').trim();
      return q === this.currentQuarter;
    });

    // Compute metrics
    const totalCount = quarterTests.length;
    const completedCount = quarterTests.filter(r => String(r['Status'] || r[12] || '').toLowerCase() === 'completed').length;
    const scheduledCount = quarterTests.filter(r => String(r['Status'] || r[12] || '').toLowerCase() === 'scheduled').length;
    const pendingCount = quarterTests.filter(r => {
      const s = String(r['Status'] || r[12] || '').toLowerCase();
      return !s || s === 'pending' || s === 'unassigned';
    }).length;
    const mobileCount = quarterTests.filter(r => {
      const type = String(r['Collection Type'] || r[5] || '').toLowerCase();
      const clinic = String(r['Clinic Name'] || r[6] || '').toLowerCase();
      return type.includes('mobile') || clinic.includes('mobile');
    }).length;
    const pct = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

    // Build HTML layout
    container.innerHTML = `
      <div class="sheet-toolbar" style="display: flex; flex-direction: column; gap: 10px; padding: 12px 20px; background: #1e293b; border-bottom: 1px solid var(--border-color);">
        <!-- Top Title & Navigation Row -->
        <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px;">
          <div style="display: flex; align-items: center; gap: 12px;">
            <span style="font-size: 22px;">🧪</span>
            <div>
              <h2 style="font-size: 16px; margin: 0; font-weight: 800; color: #f8fafc;">DOT Drug Testing & Clinic Scheduling</h2>
              <div style="font-size: 11px; color: var(--text-muted);">Quarterly Random Testing Pool, Clinic Appointments & Mobile Collectors</div>
            </div>
          </div>

          <div style="display: flex; align-items: center; gap: 10px; flex-wrap: wrap;">
            <div style="display: flex; align-items: center; gap: 6px; background: var(--bg-primary); padding: 4px 8px; border-radius: 6px; border: 1px solid var(--border-color);">
              <span style="font-size: 11px; font-weight: 700; color: #93c5fd;">QUARTER:</span>
              <select id="dt-quarter-select" style="padding: 3px 8px; font-size: 12px; font-weight: 700; background: transparent; border: none; color: #fff; outline: none; cursor: pointer;">
                ${quarters.map(q => `<option value="${q}" ${q === this.currentQuarter ? 'selected' : ''} style="background: #1e293b;">${q}</option>`).join('')}
              </select>
              <button class="btn btn-secondary" style="padding: 2px 6px; font-size: 10.5px; margin-left: 4px;" onclick="window.drugTestingEngine.promptNewQuarter()" title="Start a new quarterly testing pool">+ New</button>
            </div>

            <div style="display: flex; background: var(--bg-primary); border-radius: 6px; padding: 2px; border: 1px solid var(--border-color);">
              <button class="btn btn-secondary ${this.activeTab === 'pool' ? 'active' : ''}" style="font-size: 11.5px; padding: 5px 12px; border: none; font-weight: 700;" onclick="window.drugTestingEngine.switchTab('pool')">📋 Test Pool (${totalCount})</button>
              <button class="btn btn-secondary ${this.activeTab === 'clinics' ? 'active' : ''}" style="font-size: 11.5px; padding: 5px 12px; border: none; font-weight: 700;" onclick="window.drugTestingEngine.switchTab('clinics')">🏥 Clinics Directory (${clinics.length})</button>
            </div>

            <button class="btn btn-primary" style="font-size: 11.5px; font-weight: 700; background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%); display: inline-flex; align-items: center; gap: 6px;" onclick="window.drugTestingEngine.openBulkPasteModal()">
              <span>📋</span> Bulk Paste Roster
            </button>
          </div>
        </div>

        <!-- KPI Metric Cards -->
        <div style="display: flex; flex-direction: row; gap: 12px; width: 100%; align-items: stretch;">
          <div style="flex: 1; min-width: 0; background: rgba(15, 23, 42, 0.6); border: 1px solid var(--border-color); border-radius: 6px; padding: 8px 12px;">
            <div style="font-size: 10.5px; color: var(--text-muted); font-weight: 600;">Selected Roster</div>
            <div style="font-size: 17px; font-weight: 800; color: #93c5fd; font-family: monospace; margin-top: 2px;">${totalCount} <span style="font-size: 11px; font-weight: normal; color: var(--text-muted);">employees</span></div>
          </div>
          <div style="flex: 1; min-width: 0; background: rgba(15, 23, 42, 0.6); border: 1px solid rgba(234, 179, 8, 0.3); border-radius: 6px; padding: 8px 12px;">
            <div style="font-size: 10.5px; color: #fde047; font-weight: 600;">⏳ Pending Schedule</div>
            <div style="font-size: 17px; font-weight: 800; color: #facc15; font-family: monospace; margin-top: 2px;">${pendingCount}</div>
          </div>
          <div style="flex: 1; min-width: 0; background: rgba(15, 23, 42, 0.6); border: 1px solid rgba(59, 130, 246, 0.3); border-radius: 6px; padding: 8px 12px;">
            <div style="font-size: 10.5px; color: #93c5fd; font-weight: 600;">📅 Scheduled</div>
            <div style="font-size: 17px; font-weight: 800; color: #60a5fa; font-family: monospace; margin-top: 2px;">${scheduledCount}</div>
          </div>
          <div style="flex: 1; min-width: 0; background: rgba(15, 23, 42, 0.6); border: 1px solid rgba(168, 85, 247, 0.3); border-radius: 6px; padding: 8px 12px;">
            <div style="font-size: 10.5px; color: #c084fc; font-weight: 600;">🚚 Mobile Dispatch</div>
            <div style="font-size: 17px; font-weight: 800; color: #a855f7; font-family: monospace; margin-top: 2px;">${mobileCount}</div>
          </div>
          <div style="flex: 1.2; min-width: 0; background: rgba(15, 23, 42, 0.6); border: 1px solid rgba(34, 197, 94, 0.3); border-radius: 6px; padding: 8px 12px;">
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <span style="font-size: 10.5px; color: #86efac; font-weight: 600;">✅ Completed (${pct}%)</span>
              <span style="font-size: 11px; color: #4ade80; font-weight: 700;">${completedCount} / ${totalCount}</span>
            </div>
            <div style="background: rgba(255,255,255,0.1); height: 6px; border-radius: 3px; margin-top: 6px; overflow: hidden;">
              <div style="background: linear-gradient(90deg, #10b981, #34d399); height: 100%; width: ${pct}%;"></div>
            </div>
          </div>
        </div>

        <!-- Filter & Add Employee Bar -->
        ${this.activeTab === 'pool' ? `
          <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px; border-top: 1px solid rgba(255,255,255,0.06); padding-top: 8px;">
            <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
              <span style="font-size: 11.5px; color: var(--text-muted); font-weight: 600;">Status:</span>
              <button class="btn btn-secondary ${this.statusFilter === 'all' ? 'active' : ''}" style="padding: 2px 8px; font-size: 11px;" onclick="window.drugTestingEngine.setStatusFilter('all')">All</button>
              <button class="btn btn-secondary ${this.statusFilter === 'pending' ? 'active' : ''}" style="padding: 2px 8px; font-size: 11px; color: #facc15;" onclick="window.drugTestingEngine.setStatusFilter('pending')">⏳ Pending</button>
              <button class="btn btn-secondary ${this.statusFilter === 'scheduled' ? 'active' : ''}" style="padding: 2px 8px; font-size: 11px; color: #60a5fa;" onclick="window.drugTestingEngine.setStatusFilter('scheduled')">📅 Scheduled</button>
              <button class="btn btn-secondary ${this.statusFilter === 'completed' ? 'active' : ''}" style="padding: 2px 8px; font-size: 11px; color: #4ade80;" onclick="window.drugTestingEngine.setStatusFilter('completed')">✅ Completed</button>

              <select style="padding: 3px 8px; font-size: 11px; background: var(--bg-primary); border: 1px solid var(--border-color); border-radius: 4px; color: #fff;" onchange="window.drugTestingEngine.setTypeFilter(this.value)">
                <option value="all" ${this.typeFilter === 'all' ? 'selected' : ''}>All Types</option>
                <option value="Drug Only" ${this.typeFilter === 'Drug Only' ? 'selected' : ''}>💊 Drug Only</option>
                <option value="Drug & Alcohol" ${this.typeFilter === 'Drug & Alcohol' ? 'selected' : ''}>🍷💊 Drug & Alcohol</option>
              </select>

              <select style="padding: 3px 8px; font-size: 11px; background: var(--bg-primary); border: 1px solid var(--border-color); border-radius: 4px; color: #fff;" onchange="window.drugTestingEngine.setClassFilter(this.value)">
                <option value="all" ${this.classFilter === 'all' ? 'selected' : ''}>All Agencies</option>
                <option value="FMCSA" ${this.classFilter === 'FMCSA' ? 'selected' : ''}>FMCSA</option>
                <option value="PHMSA" ${this.classFilter === 'PHMSA' ? 'selected' : ''}>PHMSA</option>
                <option value="Non-DOT" ${this.classFilter === 'Non-DOT' ? 'selected' : ''}>Non-DOT</option>
              </select>
              
              <input type="text" id="dt-search-input" value="${this.searchTerm}" placeholder="🔍 Search employee, clinic, city..." style="padding: 4px 10px; font-size: 11.5px; background: var(--bg-primary); border: 1px solid var(--border-color); border-radius: 6px; color: #fff; width: 190px;" oninput="window.drugTestingEngine.setSearchTerm(this.value)">
            </div>

            <div style="display: flex; align-items: center; gap: 8px;">
              <select id="dt-add-emp-select" style="padding: 5px 10px; font-size: 11.5px; background: var(--bg-primary); border: 1px solid var(--border-color); border-radius: 6px; color: #fff; max-width: 250px;">
                <option value="">+ Select Employee to Add...</option>
                ${employees.map(e => `<option value="${e.name}" data-loc="${e.location}" data-job="${e.jobNumber}" data-phone="${e.phone}">${e.name} (${e.location || 'Unknown'})</option>`).join('')}
              </select>
              <button class="btn btn-secondary" style="font-size: 11.5px; font-weight: 700; color: #38bdf8;" onclick="window.drugTestingEngine.addSelectedEmployee()">➕ Add to Pool</button>
            </div>
          </div>
        ` : `
          <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px; border-top: 1px solid rgba(255,255,255,0.06); padding-top: 8px;">
            <div style="display: flex; align-items: center; gap: 8px;">
              <span style="font-size: 11.5px; color: var(--text-muted); font-weight: 600;">Filter Clinics:</span>
              <button class="btn btn-secondary ${this.clinicFilter === 'all' ? 'active' : ''}" style="padding: 2px 8px; font-size: 11px;" onclick="window.drugTestingEngine.setClinicFilter('all')">All (${clinics.length})</button>
              <button class="btn btn-secondary ${this.clinicFilter === 'mobile' ? 'active' : ''}" style="padding: 2px 8px; font-size: 11px; color: #c084fc;" onclick="window.drugTestingEngine.setClinicFilter('mobile')">🚚 Mobile Collectors</button>
              <button class="btn btn-secondary ${this.clinicFilter === 'walkin' ? 'active' : ''}" style="padding: 2px 8px; font-size: 11px; color: #4ade80;" onclick="window.drugTestingEngine.setClinicFilter('walkin')">🟢 Walk-In</button>
              <button class="btn btn-secondary ${this.clinicFilter === 'appt' ? 'active' : ''}" style="padding: 2px 8px; font-size: 11px; color: #f87171;" onclick="window.drugTestingEngine.setClinicFilter('appt')">🔴 Appt Required</button>
            </div>
            <button class="btn btn-secondary" style="font-size: 11.5px; font-weight: 700; color: #34d399;" onclick="window.drugTestingEngine.openAddClinicModal()">➕ Add New Clinic / Collector</button>
          </div>
        `}
      </div>

      <!-- Main Tab Content Body -->
      <div style="flex: 1; overflow-y: auto; padding: 16px 20px; background: #0f172a;">
        ${this.activeTab === 'pool' ? this.renderPoolTable(quarterTests, clinics, siteSuggestions) : this.renderClinicsTable(clinics)}
      </div>

      <!-- Modals Injection -->
      <div id="dt-modal-container"></div>
    `;

    // Re-attach quarter select change listener
    const qSelect = document.getElementById('dt-quarter-select');
    if (qSelect) {
      qSelect.addEventListener('change', (e) => {
        this.currentQuarter = e.target.value;
        this.render();
      });
    }
  }

  renderPoolTable(tests, clinics, siteSuggestions) {
    // Apply filters
    let filtered = tests.filter(r => {
      const hasNewCols = r['Test Type'] !== undefined || (Array.isArray(r) && r.length >= 19);
      const status = String(r['Status'] || (hasNewCols ? r[14] : r[12]) || 'Pending').toLowerCase();
      if (this.statusFilter === 'pending' && status !== 'pending' && status !== 'unassigned') return false;
      if (this.statusFilter === 'scheduled' && status !== 'scheduled') return false;
      if (this.statusFilter === 'completed' && status !== 'completed') return false;

      const testType = String(r['Test Type'] || (hasNewCols ? r[5] : 'Drug Only') || 'Drug Only');
      const classification = String(r['Classification'] || (hasNewCols ? r[6] : 'FMCSA') || 'FMCSA');
      if (this.typeFilter !== 'all' && testType !== this.typeFilter) return false;
      if (this.classFilter !== 'all' && classification !== this.classFilter) return false;

      if (this.searchTerm) {
        const q = this.searchTerm.toLowerCase();
        const str = Object.values(r).join(' ').toLowerCase();
        if (!str.includes(q)) return false;
      }
      return true;
    });

    if (filtered.length === 0) {
      return `
        <div style="text-align: center; padding: 50px 20px; background: #1e293b; border-radius: 8px; border: 1px dashed var(--border-color);">
          <div style="font-size: 40px; margin-bottom: 12px;">🧪</div>
          <h3 style="margin: 0 0 6px 0; font-size: 16px; color: #f8fafc;">No Drug Test Records for ${this.currentQuarter}</h3>
          <p style="font-size: 12px; color: var(--text-muted); max-width: 450px; margin: 0 auto 16px auto;">
            No employees match the active filters for this quarter yet. Add employees individually using the dropdown above or paste a full roster list.
          </p>
          <button class="btn btn-primary" onclick="window.drugTestingEngine.openBulkPasteModal()">📋 Paste Quarterly Roster</button>
        </div>
      `;
    }

    return `
      <div style="background: #1e293b; border-radius: 8px; border: 1px solid var(--border-color); overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.25);">
        <table style="width: 100%; border-collapse: collapse; font-size: 12px; color: #f8fafc; text-align: left;">
          <thead>
            <tr style="background: #0f172a; border-bottom: 1px solid var(--border-color); color: var(--text-muted); font-size: 11px; text-transform: uppercase;">
              <th style="padding: 10px 14px; width: 115px;">Status</th>
              <th style="padding: 10px 14px; min-width: 150px;">Employee</th>
              <th style="padding: 10px 14px; min-width: 140px;">Test Option & Agency</th>
              <th style="padding: 10px 14px; min-width: 90px;">Type</th>
              <th style="padding: 10px 14px; min-width: 250px;">Clinic / Collector</th>
              <th style="padding: 10px 14px; min-width: 230px;">Meeting Address / Location</th>
              <th style="padding: 10px 14px; width: 140px;">Date / Time</th>
              <th style="padding: 10px 14px; text-align: right; width: 90px;">Actions</th>
            </tr>
          </thead>
          <tbody>
            ${filtered.map((r, idx) => {
              const hasNewCols = r['Test Type'] !== undefined || (Array.isArray(r) && r.length >= 19);
              const empName = String(r['Employee Name'] || r[1] || 'Unknown');
              const loc = String(r['Location'] || r[2] || '—');
              const jobNum = String(r['Job Number'] || r[3] || '—');
              const phone = String(r['Phone Number'] || r[4] || '');
              const testType = String(r['Test Type'] || (hasNewCols ? r[5] : 'Drug Only') || 'Drug Only');
              const classification = String(r['Classification'] || (hasNewCols ? r[6] : 'FMCSA') || 'FMCSA');
              const type = String(r['Collection Type'] || (hasNewCols ? r[7] : r[5]) || 'Clinic Visit');
              const isMobile = type.toLowerCase().includes('mobile');
              const clinicName = String(r['Clinic Name'] || (hasNewCols ? r[8] : r[6]) || '');
              const apptReq = String(r['Appt Required'] || (hasNewCols ? r[10] : r[8]) || 'No');
              const schedDate = String(r['Scheduled Date'] || (hasNewCols ? r[11] : r[9]) || '');
              const schedTime = String(r['Scheduled Time'] || (hasNewCols ? r[12] : r[10]) || '');
              const meetingAddr = String(r['Meeting / Collection Address'] || (hasNewCols ? r[13] : r[11]) || '');
              const status = String(r['Status'] || (hasNewCols ? r[14] : r[12]) || 'Pending');
              const dateCompleted = String(r['Date Completed'] || (hasNewCols ? r[15] : r[13]) || '');
              const paperwork = String(r['Paperwork / Kit Notes'] || (hasNewCols ? r[16] : r[14]) || '');

              // Matching clinic info
              const matchedClinic = clinics.find(c => c.name.toLowerCase() === clinicName.toLowerCase());

              return `
                <tr style="border-bottom: 1px solid rgba(255,255,255,0.05); background: ${idx % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.015)'};">
                  <!-- Status Column -->
                  <td style="padding: 10px 14px; vertical-align: top;">
                    <select style="padding: 4px 8px; font-size: 11px; font-weight: 700; border-radius: 4px; border: 1px solid var(--border-color); background: ${this.getStatusBg(status)}; color: ${this.getStatusColor(status)}; cursor: pointer;" onchange="window.drugTestingEngine.updateTestStatus('${empName}', this.value)">
                      <option value="Pending" ${status.toLowerCase() === 'pending' ? 'selected' : ''}>⏳ Pending</option>
                      <option value="Scheduled" ${status.toLowerCase() === 'scheduled' ? 'selected' : ''}>📅 Scheduled</option>
                      <option value="Completed" ${status.toLowerCase() === 'completed' ? 'selected' : ''}>✅ Completed</option>
                      <option value="Excused" ${status.toLowerCase() === 'excused' ? 'selected' : ''}>⚪ Excused</option>
                    </select>
                    ${status.toLowerCase() === 'completed' && dateCompleted ? `
                      <div style="font-size: 10px; color: #4ade80; margin-top: 3px;">Done: ${dateCompleted}</div>
                    ` : ''}
                  </td>

                  <!-- Employee Column -->
                  <td style="padding: 10px 14px; vertical-align: top;">
                    <div style="font-weight: 800; font-size: 13px; color: #f8fafc;">${empName}</div>
                    <div style="font-size: 11px; color: var(--text-muted); margin-top: 2px;">
                      📍 ${loc} &bull; Job: <span style="font-family: monospace; color: #93c5fd;">${jobNum}</span>
                    </div>
                    ${phone ? `<div style="font-size: 10.5px; color: #a5b4fc; margin-top: 2px;">📞 ${phone}</div>` : ''}
                  </td>

                  <!-- Test Option & Agency -->
                  <td style="padding: 10px 14px; vertical-align: top;">
                    <select style="width: 100%; box-sizing: border-box; padding: 3px 6px; font-size: 11px; font-weight: 600; background: var(--bg-primary); border: 1px solid var(--border-color); border-radius: 4px; color: #fff; margin-bottom: 4px;" onchange="window.drugTestingEngine.updateTestType('${empName}', this.value)">
                      <option value="Drug Only" ${testType === 'Drug Only' ? 'selected' : ''}>💊 Drug Only</option>
                      <option value="Drug & Alcohol" ${testType === 'Drug & Alcohol' ? 'selected' : ''}>🍷💊 Drug & Alcohol</option>
                    </select>
                    <select style="width: 100%; box-sizing: border-box; padding: 3px 6px; font-size: 11px; font-weight: 700; background: var(--bg-primary); border: 1px solid var(--border-color); border-radius: 4px; ${this.getClassBadgeStyle(classification)}" onchange="window.drugTestingEngine.updateClassification('${empName}', this.value)">
                      <option value="FMCSA" ${classification === 'FMCSA' ? 'selected' : ''}>FMCSA</option>
                      <option value="PHMSA" ${classification === 'PHMSA' ? 'selected' : ''}>PHMSA</option>
                      <option value="Non-DOT" ${classification === 'Non-DOT' ? 'selected' : ''}>Non-DOT</option>
                    </select>
                  </td>

                  <!-- Collection Type Toggle -->
                  <td style="padding: 10px 14px; vertical-align: top;">
                    <button class="btn btn-secondary" style="font-size: 11px; padding: 4px 8px; border-color: ${isMobile ? '#a855f7' : '#3b82f6'}; color: ${isMobile ? '#c084fc' : '#93c5fd'};" onclick="window.drugTestingEngine.toggleCollectionType('${empName}', '${isMobile ? 'Clinic Visit' : 'Mobile Collector'}')">
                      ${isMobile ? '🚚 Mobile' : '🏥 Clinic'}
                    </button>
                  </td>

                  <!-- Clinic / Collector Selection & Badges -->
                  <td style="padding: 10px 14px; vertical-align: top;">
                    <select style="width: 100%; box-sizing: border-box; padding: 5px 8px; font-size: 11.5px; background: var(--bg-primary); border: 1px solid var(--border-color); border-radius: 5px; color: #fff; margin-bottom: 5px;" onchange="window.drugTestingEngine.updateTestClinic('${empName}', this.value)">
                      <option value="">Select Clinic or Collector...</option>
                      ${clinics.map(c => `<option value="${c.name}" ${c.name === clinicName ? 'selected' : ''}>${c.name} (${c.city}, ${c.state})</option>`).join('')}
                    </select>

                    <div style="display: flex; flex-wrap: wrap; gap: 4px;">
                      ${matchedClinic ? `
                        ${matchedClinic.apptReq.toLowerCase() === 'yes' ? `
                          <span style="font-size: 10px; font-weight: 700; background: rgba(239, 68, 68, 0.2); color: #f87171; border: 1px solid rgba(239, 68, 68, 0.4); padding: 2px 6px; border-radius: 4px;">🔴 Appt Required</span>
                        ` : `
                          <span style="font-size: 10px; font-weight: 700; background: rgba(34, 197, 94, 0.2); color: #4ade80; border: 1px solid rgba(34, 197, 94, 0.4); padding: 2px 6px; border-radius: 4px;">🟢 Walk-In</span>
                        `}
                        ${matchedClinic.phone ? `<span style="font-size: 10px; color: var(--text-muted); background: rgba(255,255,255,0.05); padding: 2px 6px; border-radius: 4px;">📞 ${matchedClinic.phone}</span>` : ''}
                        ${matchedClinic.hours ? `<span style="font-size: 10px; color: var(--text-muted); background: rgba(255,255,255,0.05); padding: 2px 6px; border-radius: 4px;">🕒 ${matchedClinic.hours}</span>` : ''}
                      ` : ''}
                      ${paperwork ? `<div style="width: 100%; font-size: 10.5px; color: #fde047; margin-top: 3px;">📋 ${paperwork}</div>` : ''}
                    </div>
                  </td>

                  <!-- Meeting Address / Collection Address -->
                  <td style="padding: 10px 14px; vertical-align: top;">
                    ${isMobile ? `
                      <div style="display: flex; gap: 4px; margin-bottom: 3px;">
                        <input type="text" value="${meetingAddr}" placeholder="Crew site / yard address..." style="flex: 1; padding: 4px 8px; font-size: 11px; background: rgba(168, 85, 247, 0.1); border: 1px solid rgba(168, 85, 247, 0.4); border-radius: 4px; color: #fff;" onchange="window.drugTestingEngine.updateMeetingAddress('${empName}', this.value)">
                        ${siteSuggestions[jobNum] ? `
                          <button class="btn btn-secondary" style="padding: 2px 6px; font-size: 10px; color: #c084fc;" onclick="window.drugTestingEngine.updateMeetingAddress('${empName}', '${siteSuggestions[jobNum].replace(/'/g, "\\'")}')" title="Auto-fill with job site location">📍 Auto</button>
                        ` : ''}
                      </div>
                      <div style="font-size: 10px; color: #c084fc;">🚚 Mobile Collector meets crew here</div>
                    ` : `
                      <div style="font-size: 11px; color: var(--text-muted);">
                        ${matchedClinic ? `📍 ${matchedClinic.address}, ${matchedClinic.city}, ${matchedClinic.state}` : 'Clinic visit on-site'}
                      </div>
                    `}
                  </td>

                  <!-- Scheduled Date & Time -->
                  <td style="padding: 10px 14px; vertical-align: top;">
                    <input type="date" value="${this.formatInputDate(schedDate)}" style="width: 100%; box-sizing: border-box; padding: 3px 6px; font-size: 11px; background: var(--bg-primary); border: 1px solid var(--border-color); border-radius: 4px; color: #fff; margin-bottom: 3px;" onchange="window.drugTestingEngine.updateScheduleDate('${empName}', this.value)">
                    <input type="time" value="${schedTime}" style="width: 100%; box-sizing: border-box; padding: 3px 6px; font-size: 11px; background: var(--bg-primary); border: 1px solid var(--border-color); border-radius: 4px; color: #fff;" onchange="window.drugTestingEngine.updateScheduleTime('${empName}', this.value)">
                  </td>

                  <!-- Action Buttons -->
                  <td style="padding: 10px 14px; vertical-align: top; text-align: right;">
                    <div style="display: flex; justify-content: flex-end; gap: 4px;">
                      <button class="btn btn-primary" style="padding: 4px 8px; font-size: 11px; background: #10b981; border: none;" onclick="window.drugTestingEngine.markDone('${empName}')" title="Mark test completed today">
                        ✅ Done
                      </button>
                      <button class="btn btn-secondary" style="padding: 4px 6px; font-size: 11px; color: #f87171;" onclick="window.drugTestingEngine.removeEmployee('${empName}')" title="Remove employee from testing pool">
                        🗑️
                      </button>
                    </div>
                  </td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  renderClinicsTable(clinics) {
    let filtered = clinics.filter(c => {
      if (this.clinicFilter === 'mobile' && !c.isMobile) return false;
      if (this.clinicFilter === 'walkin' && c.apptReq.toLowerCase() === 'yes') return false;
      if (this.clinicFilter === 'appt' && c.apptReq.toLowerCase() !== 'yes') return false;
      return true;
    });

    return `
      <div style="background: #1e293b; border-radius: 8px; border: 1px solid var(--border-color); overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.25);">
        <table style="width: 100%; border-collapse: collapse; font-size: 12px; color: #f8fafc; text-align: left;">
          <thead>
            <tr style="background: #0f172a; border-bottom: 1px solid var(--border-color); color: var(--text-muted); font-size: 11px; text-transform: uppercase;">
              <th style="padding: 10px 14px; min-width: 220px;">Clinic / Provider</th>
              <th style="padding: 10px 14px; width: 100px;">Type</th>
              <th style="padding: 10px 14px; min-width: 200px;">Location</th>
              <th style="padding: 10px 14px; min-width: 120px;">Phone & Hours</th>
              <th style="padding: 10px 14px; width: 130px;">Appointment</th>
              <th style="padding: 10px 14px; min-width: 220px;">Paperwork & Notes</th>
            </tr>
          </thead>
          <tbody>
            ${filtered.map((c, idx) => `
              <tr style="border-bottom: 1px solid rgba(255,255,255,0.05); background: ${idx % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.015)'};">
                <td style="padding: 10px 14px; font-weight: 700; color: #f8fafc;">${c.name}</td>
                <td style="padding: 10px 14px;">
                  <span style="font-size: 10.5px; font-weight: 700; padding: 2px 6px; border-radius: 4px; ${c.isMobile ? 'background: rgba(168, 85, 247, 0.2); color: #c084fc; border: 1px solid rgba(168, 85, 247, 0.4);' : 'background: rgba(59, 130, 246, 0.2); color: #93c5fd; border: 1px solid rgba(59, 130, 246, 0.4);'}">
                    ${c.isMobile ? '🚚 Mobile' : '🏥 Clinic'}
                  </span>
                </td>
                <td style="padding: 10px 14px; font-size: 11.5px; color: var(--text-muted);">
                  ${c.address ? `${c.address}<br>` : ''}
                  <span style="color: #cbd5e1;">${c.city}, ${c.state} ${c.zip}</span>
                </td>
                <td style="padding: 10px 14px; font-size: 11px;">
                  ${c.phone ? `<div style="color: #93c5fd; font-weight: 600;">📞 ${c.phone}</div>` : ''}
                  ${c.hours ? `<div style="color: var(--text-muted); margin-top: 2px;">🕒 ${c.hours}</div>` : ''}
                </td>
                <td style="padding: 10px 14px;">
                  ${c.apptReq.toLowerCase() === 'yes' ? `
                    <span style="font-size: 10.5px; font-weight: 700; background: rgba(239, 68, 68, 0.2); color: #f87171; border: 1px solid rgba(239, 68, 68, 0.4); padding: 2px 6px; border-radius: 4px;">🔴 Required</span>
                  ` : `
                    <span style="font-size: 10.5px; font-weight: 700; background: rgba(34, 197, 94, 0.2); color: #4ade80; border: 1px solid rgba(34, 197, 94, 0.4); padding: 2px 6px; border-radius: 4px;">🟢 Walk-In</span>
                  `}
                </td>
                <td style="padding: 10px 14px; font-size: 11px;">
                  ${c.paperwork ? `<div style="color: #fde047; margin-bottom: 2px;">📋 ${c.paperwork}</div>` : ''}
                  ${c.notes ? `<div style="color: var(--text-muted); font-style: italic;">${c.notes}</div>` : ''}
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  setTypeFilter(val) {
    this.typeFilter = val;
    this.render();
  }

  setClassFilter(val) {
    this.classFilter = val;
    this.render();
  }

  getClassBadgeStyle(cls) {
    if (cls === 'PHMSA') return 'color: #c084fc; border-color: rgba(192, 132, 252, 0.5);';
    if (cls === 'Non-DOT') return 'color: #2dd4bf; border-color: rgba(45, 212, 191, 0.5);';
    return 'color: #60a5fa; border-color: rgba(96, 165, 250, 0.5);'; // FMCSA default
  }

  async updateTestType(empName, newType) {
    const row = this.findTestRow(empName);
    if (row) {
      row['Test Type'] = newType;
      if (row[5] !== undefined) row[5] = newType;
      await this.saveTable(this.getTestsTable());
      this.render();
    }
  }

  async updateClassification(empName, newClass) {
    const row = this.findTestRow(empName);
    if (row) {
      row['Classification'] = newClass;
      if (row[6] !== undefined) row[6] = newClass;
      await this.saveTable(this.getTestsTable());
      this.render();
    }
  }

  // --- Mutation & Update Helpers ---

  async saveTable(table) {
    if (!this.db.snapshot) this.db.snapshot = { tables: {}, configs: {} };
    if (!this.db.snapshot.tables) this.db.snapshot.tables = {};
    this.db.snapshot.tables.dot_drug_tests = table;
    await this.db.setSnapshot(this.db.snapshot);
    if (window.syncEngine && typeof window.syncEngine.renderOutboxBadge === 'function') {
      window.syncEngine.renderOutboxBadge();
    }
  }

  findTestRow(empName) {
    const t = this.getTestsTable();
    return (t.rows || []).find(r => {
      const q = String(r['Quarter'] || r[0] || '').trim();
      const n = String(r['Employee Name'] || r[1] || '').trim();
      return q === this.currentQuarter && n.toLowerCase() === empName.toLowerCase();
    });
  }

  async updateTestStatus(empName, newStatus) {
    const row = this.findTestRow(empName);
    if (row) {
      row['Status'] = newStatus;
      if (row[12] !== undefined) row[12] = newStatus;
      if (row[14] !== undefined) row[14] = newStatus;
      if (newStatus.toLowerCase() === 'completed' && !row['Date Completed'] && !row[13] && !row[15]) {
        const today = new Date().toLocaleDateString();
        row['Date Completed'] = today;
        if (row[13] !== undefined) row[13] = today;
        if (row[15] !== undefined) row[15] = today;
      }
      await this.saveTable(this.getTestsTable());
      this.render();
    }
  }

  async toggleCollectionType(empName, newType) {
    const row = this.findTestRow(empName);
    if (row) {
      row['Collection Type'] = newType;
      if (row[5] !== undefined) row[5] = newType;
      if (row[7] !== undefined) row[7] = newType;
      await this.saveTable(this.getTestsTable());
      this.render();
    }
  }

  async updateTestClinic(empName, clinicName) {
    const row = this.findTestRow(empName);
    if (row) {
      row['Clinic Name'] = clinicName;
      if (row[6] !== undefined) row[6] = clinicName;

      const clinic = this.getClinicsList().find(c => c.name === clinicName);
      if (clinic) {
        row['Clinic City / State'] = `${clinic.city}, ${clinic.state}`;
        if (row[7] !== undefined) row[7] = `${clinic.city}, ${clinic.state}`;
        row['Appt Required'] = clinic.apptReq;
        if (row[8] !== undefined) row[8] = clinic.apptReq;
        row['Paperwork / Kit Notes'] = clinic.paperwork;
        if (row[14] !== undefined) row[14] = clinic.paperwork;
        if (clinic.isMobile) {
          row['Collection Type'] = 'Mobile Collector';
          if (row[5] !== undefined) row[5] = 'Mobile Collector';
        }
      }
      await this.saveTable(this.getTestsTable());
      this.render();
    }
  }

  async updateMeetingAddress(empName, addr) {
    const row = this.findTestRow(empName);
    if (row) {
      row['Meeting / Collection Address'] = addr;
      if (row[11] !== undefined) row[11] = addr;
      await this.saveTable(this.getTestsTable());
      this.render();
    }
  }

  async updateScheduleDate(empName, dateVal) {
    const row = this.findTestRow(empName);
    if (row) {
      row['Scheduled Date'] = dateVal;
      if (row[9] !== undefined) row[9] = dateVal;
      if (dateVal && (!row['Status'] || row['Status'].toLowerCase() === 'pending')) {
        row['Status'] = 'Scheduled';
        if (row[12] !== undefined) row[12] = 'Scheduled';
      }
      await this.saveTable(this.getTestsTable());
      this.render();
    }
  }

  async updateScheduleTime(empName, timeVal) {
    const row = this.findTestRow(empName);
    if (row) {
      row['Scheduled Time'] = timeVal;
      if (row[10] !== undefined) row[10] = timeVal;
      await this.saveTable(this.getTestsTable());
    }
  }

  async markDone(empName) {
    const today = new Date().toLocaleDateString();
    const row = this.findTestRow(empName);
    if (row) {
      row['Status'] = 'Completed';
      if (row[12] !== undefined) row[12] = 'Completed';
      row['Date Completed'] = today;
      if (row[13] !== undefined) row[13] = today;
      await this.saveTable(this.getTestsTable());
      this.render();
    }
  }

  async removeEmployee(empName) {
    if (!confirm(`Are you sure you want to remove ${empName} from ${this.currentQuarter}?`)) return;
    const t = this.getTestsTable();
    t.rows = (t.rows || []).filter(r => {
      const q = String(r['Quarter'] || r[0] || '').trim();
      const n = String(r['Employee Name'] || r[1] || '').trim();
      return !(q === this.currentQuarter && n.toLowerCase() === empName.toLowerCase());
    });
    t.rowCount = t.rows.length;
    await this.saveTable(t);
    this.render();
  }

  async addSelectedEmployee() {
    const select = document.getElementById('dt-add-emp-select');
    if (!select || !select.value) return;
    const opt = select.options[select.selectedIndex];
    const name = opt.value;
    const loc = opt.dataset.loc || '';
    const job = opt.dataset.job || '';
    const phone = opt.dataset.phone || '';

    const existing = this.findTestRow(name);
    if (existing) {
      alert(`${name} is already in the testing pool for ${this.currentQuarter}.`);
      return;
    }

    const t = this.getTestsTable();
    const newRow = {
      'Quarter': this.currentQuarter,
      'Employee Name': name,
      'Location': loc,
      'Job Number': job,
      'Phone Number': phone,
      'Test Type': 'Drug Only',
      'Classification': 'FMCSA',
      'Collection Type': 'Clinic Visit',
      'Clinic Name': '',
      'Clinic City / State': '',
      'Appt Required': 'No',
      'Scheduled Date': '',
      'Scheduled Time': '',
      'Meeting / Collection Address': '',
      'Status': 'Pending',
      'Date Completed': '',
      'Paperwork / Kit Notes': '',
      'Notes': '',
      'Date Added': new Date().toLocaleDateString()
    };
    t.rows.push(newRow);
    t.rowCount = t.rows.length;
    await this.saveTable(t);
    select.value = '';
    this.render();
  }

  promptNewQuarter() {
    const nextQ = prompt('Enter Quarter Name (e.g. Q4 2026, Q1 2027):', this.currentQuarter);
    if (nextQ && nextQ.trim()) {
      this.currentQuarter = nextQ.trim();
      this.render();
    }
  }

  openBulkPasteModal() {
    const modal = document.getElementById('dt-modal-container');
    if (!modal) return;
    modal.innerHTML = `
      <div style="position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.7); display: flex; align-items: center; justify-content: center; z-index: 9999;">
        <div style="background: #1e293b; border: 1px solid var(--border-color); border-radius: 8px; width: 550px; max-width: 90%; padding: 24px; box-shadow: 0 10px 25px rgba(0,0,0,0.5);">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
            <h3 style="margin: 0; font-size: 16px; color: #f8fafc;">📋 Bulk Paste Employee Roster</h3>
            <button style="background: transparent; border: none; font-size: 18px; color: var(--text-muted); cursor: pointer;" onclick="document.getElementById('dt-modal-container').innerHTML=''">✕</button>
          </div>
          <p style="font-size: 11.5px; color: var(--text-muted); margin: 0 0 12px 0;">
            Paste employee names from your notification email (one per line). Names will be automatically matched to active employees. Auto-detects lines containing "Alcohol", "PHMSA", or "Non-DOT".
          </p>

          <div style="display: flex; gap: 12px; margin-bottom: 12px;">
            <div style="flex: 1;">
              <label style="display: block; font-size: 11px; font-weight: 600; color: var(--text-muted); margin-bottom: 4px;">Default Test Type:</label>
              <select id="dt-bulk-test-type" style="width: 100%; box-sizing: border-box; background: var(--bg-primary); border: 1px solid var(--border-color); border-radius: 4px; color: #fff; padding: 6px 8px; font-size: 11.5px;">
                <option value="Drug Only" selected>💊 Drug Only</option>
                <option value="Drug & Alcohol">🍷💊 Drug & Alcohol</option>
              </select>
            </div>
            <div style="flex: 1;">
              <label style="display: block; font-size: 11px; font-weight: 600; color: var(--text-muted); margin-bottom: 4px;">Default Classification:</label>
              <select id="dt-bulk-classification" style="width: 100%; box-sizing: border-box; background: var(--bg-primary); border: 1px solid var(--border-color); border-radius: 4px; color: #fff; padding: 6px 8px; font-size: 11.5px;">
                <option value="FMCSA" selected>FMCSA</option>
                <option value="PHMSA">PHMSA</option>
                <option value="Non-DOT">Non-DOT</option>
              </select>
            </div>
          </div>

          <textarea id="dt-bulk-textarea" rows="10" placeholder="John Doe&#10;Jane Smith&#10;Robert Johnson" style="width: 100%; box-sizing: border-box; background: var(--bg-primary); border: 1px solid var(--border-color); border-radius: 6px; color: #fff; padding: 10px; font-family: monospace; font-size: 12px;"></textarea>
          <div style="display: flex; justify-content: flex-end; gap: 8px; margin-top: 16px;">
            <button class="btn btn-secondary" onclick="document.getElementById('dt-modal-container').innerHTML=''">Cancel</button>
            <button class="btn btn-primary" onclick="window.drugTestingEngine.processBulkRoster()">Add Roster to ${this.currentQuarter}</button>
          </div>
        </div>
      </div>
    `;
  }

  async processBulkRoster() {
    const text = document.getElementById('dt-bulk-textarea')?.value || '';
    const defaultTestType = document.getElementById('dt-bulk-test-type')?.value || 'Drug Only';
    const defaultClassification = document.getElementById('dt-bulk-classification')?.value || 'FMCSA';

    const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    if (lines.length === 0) return;

    const activeEmps = this.getActiveEmployees();
    const t = this.getTestsTable();
    let addedCount = 0;

    lines.forEach(line => {
      const lineLower = line.toLowerCase();
      let testType = defaultTestType;
      if (lineLower.includes('alcohol')) testType = 'Drug & Alcohol';

      let classification = defaultClassification;
      if (lineLower.includes('phmsa') || lineLower.includes('phsma')) classification = 'PHMSA';
      else if (lineLower.includes('non-dot') || lineLower.includes('nondot')) classification = 'Non-DOT';
      else if (lineLower.includes('fmcsa')) classification = 'FMCSA';

      // Clean up punctuation or leading numbers
      const cleanName = line.split('\t')[0].replace(/^\d+[\.\-\)]\s*/, '').trim();
      if (!cleanName) return;

      // Find match
      const matched = activeEmps.find(e => e.name.toLowerCase() === cleanName.toLowerCase() || e.name.toLowerCase().includes(cleanName.toLowerCase()));
      const finalName = matched ? matched.name : cleanName;
      const loc = matched ? matched.location : '';
      const job = matched ? matched.jobNumber : '';
      const phone = matched ? matched.phone : '';

      // Check if already in this quarter
      const exists = (t.rows || []).some(r => {
        const q = String(r['Quarter'] || r[0] || '').trim();
        const n = String(r['Employee Name'] || r[1] || '').trim();
        return q === this.currentQuarter && n.toLowerCase() === finalName.toLowerCase();
      });

      if (!exists) {
        t.rows.push({
          'Quarter': this.currentQuarter,
          'Employee Name': finalName,
          'Location': loc,
          'Job Number': job,
          'Phone Number': phone,
          'Test Type': testType,
          'Classification': classification,
          'Collection Type': 'Clinic Visit',
          'Clinic Name': '',
          'Clinic City / State': '',
          'Appt Required': 'No',
          'Scheduled Date': '',
          'Scheduled Time': '',
          'Meeting / Collection Address': '',
          'Status': 'Pending',
          'Date Completed': '',
          'Paperwork / Kit Notes': '',
          'Notes': '',
          'Date Added': new Date().toLocaleDateString()
        });
        addedCount++;
      }
    });

    t.rowCount = t.rows.length;
    await this.saveTable(t);
    document.getElementById('dt-modal-container').innerHTML = '';
    this.render();
    alert(`🎉 Successfully added ${addedCount} employee(s) to ${this.currentQuarter}!`);
  }

  openAddClinicModal() {
    const modal = document.getElementById('dt-modal-container');
    if (!modal) return;
    modal.innerHTML = `
      <div style="position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.7); display: flex; align-items: center; justify-content: center; z-index: 9999;">
        <div style="background: #1e293b; border: 1px solid var(--border-color); border-radius: 8px; width: 550px; max-width: 90%; padding: 24px; box-shadow: 0 10px 25px rgba(0,0,0,0.5);">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
            <h3 style="margin: 0; font-size: 16px; color: #f8fafc;">➕ Add New Clinic / Collector</h3>
            <button style="background: transparent; border: none; font-size: 18px; color: var(--text-muted); cursor: pointer;" onclick="document.getElementById('dt-modal-container').innerHTML=''">✕</button>
          </div>
          <div style="display: flex; flex-direction: column; gap: 10px;">
            <div>
              <label style="font-size: 11px; color: var(--text-muted); font-weight: 700;">Provider / Clinic Name *</label>
              <input type="text" id="new-c-name" placeholder="e.g. Western Occupational Medicine" style="width: 100%; box-sizing: border-box; padding: 6px 10px; background: var(--bg-primary); border: 1px solid var(--border-color); border-radius: 5px; color: #fff;">
            </div>
            <div style="display: flex; gap: 10px;">
              <div style="flex: 1;">
                <label style="font-size: 11px; color: var(--text-muted); font-weight: 700;">Provider Type</label>
                <select id="new-c-mobile" style="width: 100%; box-sizing: border-box; padding: 6px 10px; background: var(--bg-primary); border: 1px solid var(--border-color); border-radius: 5px; color: #fff;">
                  <option value="false">🏥 Standard Clinic</option>
                  <option value="true">🚚 Mobile Collector</option>
                </select>
              </div>
              <div style="flex: 1;">
                <label style="font-size: 11px; color: var(--text-muted); font-weight: 700;">Appointment Required</label>
                <select id="new-c-appt" style="width: 100%; box-sizing: border-box; padding: 6px 10px; background: var(--bg-primary); border: 1px solid var(--border-color); border-radius: 5px; color: #fff;">
                  <option value="No">No (Walk-In Welcome)</option>
                  <option value="Yes">Yes (Appointment Required)</option>
                  <option value="Suggested">Suggested</option>
                </select>
              </div>
            </div>
            <div style="display: flex; gap: 10px;">
              <div style="flex: 2;">
                <label style="font-size: 11px; color: var(--text-muted); font-weight: 700;">City</label>
                <input type="text" id="new-c-city" placeholder="City" style="width: 100%; box-sizing: border-box; padding: 6px 10px; background: var(--bg-primary); border: 1px solid var(--border-color); border-radius: 5px; color: #fff;">
              </div>
              <div style="flex: 1;">
                <label style="font-size: 11px; color: var(--text-muted); font-weight: 700;">State</label>
                <input type="text" id="new-c-state" placeholder="State (MT)" style="width: 100%; box-sizing: border-box; padding: 6px 10px; background: var(--bg-primary); border: 1px solid var(--border-color); border-radius: 5px; color: #fff;">
              </div>
              <div style="flex: 1;">
                <label style="font-size: 11px; color: var(--text-muted); font-weight: 700;">Phone</label>
                <input type="text" id="new-c-phone" placeholder="Phone #" style="width: 100%; box-sizing: border-box; padding: 6px 10px; background: var(--bg-primary); border: 1px solid var(--border-color); border-radius: 5px; color: #fff;">
              </div>
            </div>
            <div>
              <label style="font-size: 11px; color: var(--text-muted); font-weight: 700;">Paperwork / Kit Notes</label>
              <input type="text" id="new-c-paperwork" placeholder="e.g. eCCF only, bring split kit" style="width: 100%; box-sizing: border-box; padding: 6px 10px; background: var(--bg-primary); border: 1px solid var(--border-color); border-radius: 5px; color: #fff;">
            </div>
          </div>
          <div style="display: flex; justify-content: flex-end; gap: 8px; margin-top: 16px;">
            <button class="btn btn-secondary" onclick="document.getElementById('dt-modal-container').innerHTML=''">Cancel</button>
            <button class="btn btn-primary" onclick="window.drugTestingEngine.saveNewClinic()">Save Clinic</button>
          </div>
        </div>
      </div>
    `;
  }

  async saveNewClinic() {
    const name = document.getElementById('new-c-name')?.value?.trim();
    if (!name) {
      alert('Please enter a clinic name.');
      return;
    }
    const isMobile = document.getElementById('new-c-mobile')?.value === 'true';
    const appt = document.getElementById('new-c-appt')?.value || 'No';
    const city = document.getElementById('new-c-city')?.value?.trim() || '';
    const state = document.getElementById('new-c-state')?.value?.trim() || 'MT';
    const phone = document.getElementById('new-c-phone')?.value?.trim() || '';
    const paperwork = document.getElementById('new-c-paperwork')?.value?.trim() || '';

    let t = this.db.getTable('drug_test_clinics');
    if (!t || !t.rows) {
      t = { name: 'Drug Test Clinics', headers: ['Firm / Clinic Name', 'Is Mobile', 'Street Address', 'City', 'State', 'Zip', 'Phone Number', 'Hours', 'Appt Required', 'Paperwork Required', 'Notes / Lab Instructions', 'Active'], rows: [] };
    }

    t.rows.push({
      'Firm / Clinic Name': name,
      'Is Mobile': isMobile ? 'TRUE' : 'FALSE',
      'Street Address': '',
      'City': city,
      'State': state,
      'Zip': '',
      'Phone Number': phone,
      'Hours': '',
      'Appt Required': appt,
      'Paperwork Required': paperwork,
      'Notes / Lab Instructions': '',
      'Active': 'TRUE'
    });

    t.rowCount = t.rows.length;
    if (!this.db.snapshot) this.db.snapshot = { tables: {}, configs: {} };
    if (!this.db.snapshot.tables) this.db.snapshot.tables = {};
    this.db.snapshot.tables.drug_test_clinics = t;
    await this.db.setSnapshot(this.db.snapshot);

    document.getElementById('dt-modal-container').innerHTML = '';
    this.render();
    alert(`✅ Added ${name} to clinics directory!`);
  }

  // --- UI Helpers ---

  switchTab(tab) {
    this.activeTab = tab;
    this.render();
  }

  setStatusFilter(status) {
    this.statusFilter = status;
    this.render();
  }

  setClinicFilter(filter) {
    this.clinicFilter = filter;
    this.render();
  }

  setSearchTerm(term) {
    this.searchTerm = term;
    this.render();
  }

  getStatusBg(status) {
    const s = String(status || '').toLowerCase();
    if (s === 'completed') return 'rgba(34, 197, 94, 0.2)';
    if (s === 'scheduled') return 'rgba(59, 130, 246, 0.2)';
    if (s === 'excused') return 'rgba(148, 163, 184, 0.2)';
    return 'rgba(234, 179, 8, 0.2)';
  }

  getStatusColor(status) {
    const s = String(status || '').toLowerCase();
    if (s === 'completed') return '#4ade80';
    if (s === 'scheduled') return '#60a5fa';
    if (s === 'excused') return '#94a3b8';
    return '#facc15';
  }

  formatInputDate(dateVal) {
    if (!dateVal) return '';
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateVal)) return dateVal;
    const d = new Date(dateVal);
    if (isNaN(d.getTime())) return '';
    return d.toISOString().split('T')[0];
  }
}
