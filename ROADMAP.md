# 🗺️ Safety Assistant Project Roadmap

> **Living Project Document**  
> Tracks completed milestones, active implementations, and future architectural phases across Google Sheets (Apps Script Backend) and the Standalone Desktop Field App.

---

## 📊 Phase Overview & Progress Summary

| Phase | Description | Status | Progress |
| :--- | :--- | :---: | :---: |
| **Phase 1** | Foundation & Core Reports (Gloves & Sleeves) | ✅ Completed | 100% |
| **Phase 2** | Two-Stage Swaps & Audit Trail (History & Reclaims) | ✅ Completed | 100% |
| **Phase 3** | Core Enhancements & Workflow Optimization | ✅ Completed | 100% |
| **Phase 4** | Standalone Desktop App & Offline Engine | ✅ Completed | 100% |
| **Phase 5** | Extended Equipment Tracking (Blankets, MACKs, Grounds, Sticks, Testers, AED) | ✅ Completed | 100% |
| **Phase 6** | Safety Compliance Engine & Gmail Automation | ✅ Completed | 100% |
| **Phase 7** | Training Tracking, Attendee Sync & Certifications Matrix | ✅ Completed | 100% |
| **Phase 8** | Smart Trip Planner & Route Optimization | ✅ Completed | 100% |
| **Phase 9** | Mobile Field App & Enterprise Enhancements | ⏳ Planned | 10% |

---

## 🛠️ Phase Details & Checklist

### Phase 1: Foundation & Core Reports
*Core foundation for tracking rubber gloves and sleeves with automated change-out dates and basic reports.*
- [x] ✅ Custom Google Sheets menu system (`Glove Manager` / `Safety Assistant`)
- [x] ✅ 12-column layout with ESL ID and full inventory tracking
- [x] ✅ Glove Swaps and Sleeve Swaps automatic report generation
- [x] ✅ Change-out date automation (+3 mo for field gloves, +6 mo Northern Lights, +12 mo On Shelf & Sleeves)
- [x] ✅ Purchase Needs report generation and sizing breakdown
- [x] ✅ Inventory Reports with visual breakdown charts
- [x] ✅ Class 0, Class 2, and Class 3 support with upsizing logic
- [x] ✅ Clasp version control and automated syntax validation deployment (`push.bat`)

---

### Phase 2: Two-Stage Swaps & Audit Trail
*Lifecycle management for equipment swaps from picking to field delivery with full historical tracking.*
- [x] ✅ Two-stage swap workflow (Stage 1 Pick Checkbox $\rightarrow$ Stage 2 Date Changed completion)
- [x] ✅ Dedicated History sheets (`Gloves History`, `Sleeves History`) with automated transition logs
- [x] ✅ Fast batched audit logger (`saveHistoryFast()`)
- [x] ✅ Reclaims sheet and logic for Previous Employee / Class 2 / Class 3 reclaims
- [x] ✅ Employee lifecycle tracking and restore capability (`51-EmployeeHistory.gs`)

---

### Phase 3: Core Enhancements & Workflow Optimization ✅ *(Completed)*
*Advanced reporting, per-item filtering, automated notifications, and refined purchase workflows.*
- [x] ✅ Interactive Employee & Item Lookup Dialog (`LookupDialog.html`)
- [x] ✅ Employee Organization & Visual Divider Tool (`organizeAndFormatEmployeesSheet`)
- [x] ✅ Upsized notes fix and manual override capabilities
- [x] ✅ **Per-Item Drilldown & Filter Views:** Instant filtering by size, class, and warehouse location
- [x] ✅ **Automated Weekly Email Reports:** Schedule-based automated delivery of upcoming swaps
- [x] ✅ **Purchase Needs UI Redesign:** Unified procurement view with direct vendor catalog integration
- [x] ✅ **Inventory Aging Reports:** Highlighting oldest items approaching end-of-life or recertification (`aging.js`, `InventoryAgingDialog.html`, `61-InventoryReports.gs`)

---

### Phase 4: Standalone Desktop App & Offline Engine ✅ *(Completed)*
*High-performance local desktop app with offline capability, instant responsiveness, and modern UI.*
- [x] ✅ Standalone Chromium/Node desktop runtime (`desktop/`)
- [x] ✅ Dark glassmorphic interface with real-time UI components
- [x] ✅ Excel Crew Import module with SheetJS, roster diffing, and onboarding (`desktop/js/crew-import.js`)
- [x] ✅ Two-Way Sync API with mutation batching and validation guards (`89-SyncAPI.gs`)
- [x] ✅ Interactive Employee Profile view with certification timeline and equipment history
- [x] ✅ **Offline conflict resolution prompt for simultaneous multi-user edits** (`sync.js`, `89-SyncAPI.gs`)
- [x] ✅ **Standalone installer package (.exe / installer build)** (`desktop/package.json`, `build-desktop-app.bat`)

---

### Phase 5: Extended Equipment Tracking ✅ *(Completed)*
*Expanding beyond gloves/sleeves to all field rigging, test instruments, and rescue apparatus.*
- [x] ✅ Rubber Blankets tracking, swap generation, and companion history
- [x] ✅ HV Testers & Phasing Sets calibration tracking and swap generation
- [x] ✅ AED unit pad & battery expiration tracking
- [x] ✅ MACKs (Mechanical Jumpers) 12-column layout and swap generation
- [x] ✅ Grounds & Hot Sticks sheet schemas, test intervals, and constants
- [x] ✅ **Finalize Apps Script backend swap generation menu triggers for Grounds & Hot Sticks** (`Code.gs`, `99-MenuFix.gs`)

---

### Phase 6: Safety Compliance Engine & Gmail Automation ✅ *(Completed)*
*Automated parsing of safety documentation, daily JHAs, and weekly crew meetings.*
- [x] ✅ Automated Gmail processing for incoming safety emails (`88-SafetyReports.gs`)
- [x] ✅ Log sheets: `JHA Log`, `Weekly Safety Log`, `Monthly Checklist Log`
- [x] ✅ Safety Compliance grid with ✅, ❌, ⏳, and N/A status tracking
- [x] ✅ Consolidated crew schedules in `Job Tracking` (Skip Sun-Sat, Skip Meetings, Skip Checklists)
- [x] ✅ Master recalculation and automated cleanup pipelines
- [x] ✅ **1-Click Safety Email Processing directly from Desktop App** (`safety-emails.js`, `89-SyncAPI.gs`)

---

### Phase 7: Training Tracking, Attendee Sync & Certifications Matrix
*Tracking certifications, annual refreshers, CPR/First Aid, and monthly training rosters.*
- [x] ✅ `Training Tracking` sheet with dynamic header discovery
- [x] ✅ Automated attendee list synchronization based on active crew rosters
- [x] ✅ `Expiring Certs` matrix with visual traffic-light indicators (Red < 30 days, Yellow < 60 days)
- [x] ✅ SMS notification dialog for expiring certifications (`DashboardSMSDialog.html`)
- [x] ✅ Red Cross CPR CSV import and compliance verification

---

### Phase 8: Smart Trip Planner & Route Optimization
*Intelligent route planning, crew visit scheduling, and travel optimization across Montana.*
- [x] ✅ Interactive visual Trip Planner (`TripPlanner.html` and desktop `trip-planner.js`)
- [x] ✅ Configurable work schedules (`Mon-Thu` 4x10s vs `Tue-Fri` 4x10s)
- [x] ✅ Montana drive-time matrix and return-to-Helena constraint solver
- [x] ✅ Holiday / Blackout Day system with drag-and-drop protection
- [x] ✅ Daily Accomplishments / Time Breakdown tracking

---

### Phase 9: Mobile Field App & Enterprise Enhancements
*Next-generation capabilities and field inspector tools.*
- [ ] ⬜ Mobile Progressive Web App (PWA) / responsive tablet interface
- [ ] ⬜ Barcode / QR Code scanning for ESL IDs using device cameras
- [ ] ⬜ Automated vendor catalog price scraping and 1-click PO transmission
- [ ] ⬜ Role-based authentication (Admin vs Field Inspector)
- [ ] ⬜ Offline GPS location check-in for completed field swaps

---

## 📌 How to Update This Roadmap
1. Open this file: [`ROADMAP.md`](file:///c:/Users/codyb/WebstormProjects/Safety%20Assistant/ROADMAP.md)
2. Change any completed item from `- [ ] ⬜` to `- [x] ✅`
3. Update the **Phase Overview** summary table as milestones are achieved.
