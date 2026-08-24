# 🗺️ Safety Assistant Project Roadmap

> **Living Project Document**  
> Tracks completed milestones, active implementations, and future architectural phases across Google Sheets (Apps Script Backend) and the Standalone Desktop Field App.

---

## 📊 Phase Overview & Progress Summary

| Phase | Description | Status | Progress |
| :--- | :--- | :---: | :---: |
| **Phase 1** | Foundation & Core PPE Tracking (Gloves & Sleeves) | ✅ Completed | 100% |
| **Phase 2** | Multi-Stage Swap Workflows & Audit Trail History | ✅ Completed | 100% |
| **Phase 3** | Extended Rubber & Test Equipment (Blankets, Testers, Phasing, AED) | ✅ Completed | 100% |
| **Phase 4** | Rigging & Hot Line Tools (Grounds & Hot Sticks) | 🔄 In Progress | 85% |
| **Phase 5** | Heavy Apparatus & Mechanical Jumpers (MACKs) | ✅ Completed | 100% |
| **Phase 6** | Safety Compliance Engine & Gmail AI Ingestion | ✅ Completed | 100% |
| **Phase 7** | Training Tracking, Attendee Sync & Expiration Matrix | ✅ Completed | 100% |
| **Phase 8** | Smart Trip Planner, Routing & Schedule Optimization | ✅ Completed | 100% |
| **Phase 9** | Standalone Desktop Application (Offline-First Architecture) | ✅ Completed | 95% |
| **Phase 10** | High-Performance Two-Way Sync & Data Integrity | ✅ Completed | 95% |
| **Phase 11** | Advanced Field Features, Mobile Web & Enterprise Tools | ⏳ Planned | 20% |

---

## 🛠️ Phase Details & Checklist

### Phase 1: Foundation & Core PPE Tracking (Gloves & Sleeves)
*Core system architecture for tracking rubber insulating gloves and sleeves with automated change-out dates.*
- [x] ✅ Custom Google Sheets menu system (`Glove Manager` / `Safety Assistant`)
- [x] ✅ 12-column layout with ESL ID and full inventory tracking
- [x] ✅ Glove Swaps and Sleeve Swaps automatic report generation
- [x] ✅ Change-out date automation (+3 mo for field gloves, +6 mo Northern Lights, +12 mo On Shelf & Sleeves)
- [x] ✅ Purchase Needs report generation and sizing breakdown
- [x] ✅ Inventory Reports with visual breakdown charts
- [x] ✅ Class 0, Class 2, and Class 3 support with upsizing logic
- [x] ✅ Automated syntax validation and `clasp` deployment pipeline (`push.bat`)

---

### Phase 2: Multi-Stage Swap Workflows & Audit Trail History
*Complete lifecycle management for equipment swaps from picking to field completion.*
- [x] ✅ Three-Stage Swap Workflow:
  - [x] ✅ **Stage 1 (Pick Checkbox):** Sets status to `Ready For Delivery 🚚` and assigns truck location
  - [x] ✅ **Stage 2 (Field Delivery):** Records `Date Changed`, completes the physical swap, and updates employee inventory
  - [x] ✅ **Stage 3 (Test Rotation):** Rotates returned equipment into `In Testing` / `Arnett / JM Test`
- [x] ✅ Dedicated History Sheets (`Gloves History`, `Sleeves History`) with automated transition logs
- [x] ✅ Fast batched audit logger (`saveHistoryFast()`)
- [x] ✅ Class Reclaims & Previous Employee equipment reclaims system
- [x] ✅ Employee Lifecycle Management (`51-EmployeeHistory.gs`) with restore capabilities

---

### Phase 3: Extended Rubber & Test Equipment
*Expanding tracking to rubber blankets, high-voltage diagnostic tools, and emergency equipment.*
- [x] ✅ **Rubber Blankets (`SHEET_BLANKETS`):** 1-year testing interval, blanket swap sheet, and companion history
- [x] ✅ **HV Testers (`SHEET_HV_TESTERS`):** Calibration date tracking, swap reports, and companion history
- [x] ✅ **Phasing Sets (`SHEET_PHASING_SETS`):** Model, KV, and annual calibration lifecycle tracking
- [x] ✅ **AED Units (`SHEET_AED`):** Battery and pad expiration tracking with automatic alert thresholds
- [x] ✅ Companion sheet builders and unified location synchronization (`22-LocationSync.gs`)

---

### Phase 4: Rigging & Hot Line Tools (Grounds & Hot Sticks)
*Grounding clusters and hot stick live-line tool certification tracking.*
- [x] ✅ Sheet schemas, constants, and column namespaces in `00-Constants.gs`:
  - `COLS.GROUNDS` (13-column layout: Serial#, Type OH/UG, Size, KV, Length, Test Date...)
  - `COLS.HOT_STICKS` (11-column layout: Item#, Type, Length, Test Date, 24-month OSHA interval...)
- [x] ✅ Task collection integration in `76-SmartScheduling.gs`
- [x] ✅ Desktop App offline tables and inventory cards for Grounds & Hot Sticks
- [ ] ⬜ Finalize swap generation menu handlers in Apps Script backend (`menuGenerateGroundSwaps`, `menuGenerateHotStickSwaps`)

---

### Phase 5: Heavy Apparatus & Mechanical Jumpers (MACKs)
*Phase 6 jumper apparatus tracking with ESL identification.*
- [x] ✅ **MACKs Inventory (`SHEET_MACKS`):** 12-column layout (ESL ID, KV, Size, Length, Test Date...)
- [x] ✅ **MACK Swaps (`SHEET_MACK_SWAPS`):** Automated 1-year swap generation and pick list integration
- [x] ✅ Change-out date recalculation and trigger handlers (`fixMackChangeOutDates`)
- [x] ✅ Full integration in Smart Scheduling and Desktop App

---

### Phase 6: Safety Compliance Engine & Gmail AI Ingestion
*Automated parsing of safety documentation, daily JHAs, and weekly crew meetings.*
- [x] ✅ Automated Gmail processing for incoming safety emails (`88-SafetyReports.gs`)
- [x] ✅ Log sheets: `JHA Log`, `Weekly Safety Log`, `Monthly Checklist Log`
- [x] ✅ Dynamic matrix generation on `Safety Compliance` sheet (✅ Complete, ❌ Missing, ⏳ Pending, N/A Excused)
- [x] ✅ Consolidated crew schedules in `Job Tracking` (Skip Sun-Sat checkboxes, Skip Weekly Meeting, Skip Checklist)
- [x] ✅ Master recalculation and automated cleanup pipelines (`masterRecalculateCompliance`, `autoComplianceCleanup`)
- [x] ✅ Holiday/Blackout day awareness (excuses individual JHA days without excusing weekly meetings)

---

### Phase 7: Training Tracking, Attendee Sync & Expiration Matrix
*Tracking certifications, annual refreshers, CPR/First Aid, and monthly training rosters.*
- [x] ✅ `Training Tracking` sheet with dynamic header discovery
- [x] ✅ Automated attendee list synchronization based on active crew rosters (`refreshTrainingAttendeesSilent`)
- [x] ✅ Job Tracking completion sync (auto-removes future training rows when jobs complete)
- [x] ✅ `Expiring Certs` matrix with visual traffic-light indicators (Red < 30 days, Yellow < 60 days)
- [x] ✅ SMS notification dialog for expiring certifications (`DashboardSMSDialog.html`)
- [x] ✅ Red Cross CPR CSV import and compliance verification

---

### Phase 8: Smart Trip Planner, Routing & Schedule Optimization
*Intelligent route planning, crew visit scheduling, and travel optimization across Montana.*
- [x] ✅ Interactive visual Trip Planner (`TripPlanner.html` and desktop `trip-planner.js`)
- [x] ✅ Configurable work schedules (`Mon-Thu` 4x10s vs `Tue-Fri` 4x10s)
- [x] ✅ Montana drive-time matrix and return-to-Helena constraint solver (`getDriveTimeMap`)
- [x] ✅ Holiday / Blackout Day system with drag-and-drop protection
- [x] ✅ Daily Accomplishments / Time Breakdown tracking (`86-TimeTracking.gs` / `TimeBreakdown.html`)

---

### Phase 9: Standalone Desktop Application (Offline-First Architecture)
*High-performance local desktop app with offline capability, instant responsiveness, and modern UI.*
- [x] ✅ Standalone Chromium/Node desktop runtime (`desktop/`)
- [x] ✅ Dark glassmorphic interface with real-time UI components
- [x] ✅ Excel Crew Import module with SheetJS, automatic roster diffing, and new hire onboarding (`desktop/js/crew-import.js`)
- [x] ✅ Full interactive spreadsheets with inline editing, smart dropdowns, and batch mutation queuing
- [x] ✅ Interactive Employee Profile view with certification timeline, equipment history, and career milestones
- [x] ✅ Live item statistics and warehouse inventory breakdowns (`desktop/js/item-stats.js`)

---

### Phase 10: High-Performance Two-Way Sync & Data Integrity
*Robust offline-to-cloud synchronization engine between Desktop App and Google Sheets.*
- [x] ✅ Web App HTTP REST API endpoint (`89-SyncAPI.gs`) with auto-redeploying `push.bat`
- [x] ✅ Chunked payload transfer to bypass Google Apps Script ScriptProperties limits
- [x] ✅ Split synchronization actions:
  - `Push Changes to Sheets`: Sends local mutations
  - `Download Snapshot`: Pulls fresh cloud state
  - `🧹 Overwrite Sheets with Clean Local Tables`: Direct whole-table reconstruction
- [x] ✅ Data validation guards (auto-normalizes `Last Day Reason` and typed Google Table columns)
- [x] ✅ Automatic sheet organization and visual dividers by Location & Crew (`organizeAndFormatEmployeesSheet`)

---

### Phase 11: Advanced Field Features & Future Enhancements
*Next-generation capabilities, mobile field tools, and enterprise integrations.*
- [x] ✅ Desktop App offline database caching
- [ ] ⬜ Mobile Progressive Web App (PWA) / responsive tablet interface
- [ ] ⬜ Barcode / QR Code scanning for ESL IDs using device cameras
- [ ] ⬜ Automated vendor catalog price scraping and 1-click PO transmission
- [ ] ⬜ Role-based authentication (Admin vs Field Inspector)
- [ ] ⬜ Offline GPS location check-in for completed field swaps

---

## 📌 How to Update This Roadmap
1. Open this file: [`ROADMAP.md`](file:///c:/Users/codyb/WebstormProjects/Safety%20Assistant/ROADMAP.md)
2. Change any completed item from `- [ ] ⬜` to `- [x] ✅`
3. Update the **Phase Overview** summary percentage as phases progress.
