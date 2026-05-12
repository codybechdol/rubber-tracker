# AGENTS.md - AI Coding Agent Guide for Rubber Tracker

## Project Overview
Google Apps Script-based inventory management system for tracking rubber gloves/sleeves (PPE) for electrical workers. Deployed to Google Sheets via `clasp`.

## Critical Deployment Rule
**ALWAYS use `.\push.bat`** to deploy - NEVER use `clasp push` directly.
- `push.bat` runs `validate-syntax.js` first to catch errors
- Validates: duplicate `*/` closers, ES6 syntax (not allowed), unmatched braces
- Auto-removes duplicate `.js` files (only `.gs` files should exist in `src/`)

## Architecture: File Load Order & Function Ownership
Google Apps Script loads files **alphabetically**. Numbered prefixes control load order:
```
00-Constants.gs  → loads FIRST (defines COLS, SHEET_* constants, STATUS_LOCATIONS, incl. Blankets/HV Testers/Phasing Sets/AED) (~249 lines)
01-Utilities.gs  → utility functions (logEvent, normalizeApprovalValue, isStatusLocation, isEmployeePending, parseDateNoon) (~135 lines)
10-Menu.gs       → archived (menu now in Code.gs) (~19 lines)
11-Triggers.gs   → edit/change triggers, auto change-out dates (Gloves, Sleeves, Blankets, HV Testers, Phasing Sets, AED) (~2.2k lines)
20-InventoryHandlers.gs → inventory status/assignment handlers (~215 lines)
21-ChangeOutDate.gs → change-out date calculation logic (~220 lines)
22-EmployeeValidation.gs → Job Tracking functions, Employee validation, training sync (~3.2k lines)
22-LocationSync.gs → Inventory location sync with Employees (Gloves, Sleeves, Blankets, HV Testers, Phasing Sets, AED) (~186 lines)
30-SwapGeneration.gs → Swap report generation (~1.4k lines)
31-SwapHandlers.gs → Swap stage handling (Stage 1/2/3 workflows) (~515 lines)
32-SwapPreservation.gs → Swap checkbox/data preservation between regenerations (~151 lines)
40-Reclaims.gs   → Reclaims logic and pick list generation (~1.1k lines)
50-History.gs    → Item history (Gloves/Sleeves History), DEPRECATED by saveHistoryFast() in Code.gs (~265 lines)
51-EmployeeHistory.gs → Employee lifecycle, restore deleted employees (~1.5k lines)
60-PurchaseNeeds.gs → Purchase Needs 3-tier priority report (High/Medium/Low with class grouping) (~832 lines)
61-InventoryReports.gs → Inventory Reports with charts (~1.5k lines)
62-PurchaseOrders.gs → PO generation, vendor catalog and management (~917 lines)
70-ToDoList.gs   → archived (To Do List functionality now in Code.gs) (~52 lines)
75-Scheduling.gs → Crew visit scheduling, training calendar, attendee management (~3.6k lines)
76-SmartScheduling.gs → Task collection (incl. equipment swaps), getDriveTimeMap() (~2.5k lines)
76-EmployeeClassifications.gs → Job classification dropdowns (~152 lines)
80-EmailReports.gs → Weekly HTML email reports (~1.5k lines)
85-DataImport.gs → Crew Import, Job Tracking sync, new hire/rehire, job activation scheduling, fiscal year transition (~3.5k lines)
86-TimeTracking.gs → Daily Accomplishments (~1.1k lines)
87-RoutePlanner.gs → Trip Planner (~2.5k lines)
88-SafetyReports.gs → Gmail processing, Safety Compliance (~16.6k lines)
90-Backup.gs     → Google Drive backup snapshot (~108 lines)
95-BuildSheets.gs → Sheet creation/setup utilities (~92 lines)
95-DiagnosticTools.gs → Pick list diagnostics (~631 lines)
98-LegacyArchive.gs → Archived legacy functions (DO NOT USE) (~615 lines)
99-MenuFix.gs    → Full menu backup (mirrors Code.gs onOpen()), menu fix/reset (~284 lines)
Code.gs          → loads LAST, contains ALL working implementations (~24.6k lines)
TestRunner.gs    → Basic integration tests, run via Apps Script editor (~190 lines)
```

**Key Rule:** When functions appear in multiple files, **Code.gs always wins** (loads last).
- Module files (20-90) contain stubs/deprecated code
- **DO NOT add complete implementations to module files** - add to `Code.gs` only
- Functions suffixed `_INCOMPLETE_DEPRECATED` are intentional placeholders

## ES6/Modern JavaScript Restrictions
Google Apps Script V8 supports ES6, but this project uses ES5-style for consistency:
- Use `var` not `const`/`let` (pre-push validation rejects ES6 syntax)
- Use `function(){}` not arrow functions
- Use string concatenation not template literals

## Key Patterns

### Sheet Access
```javascript
var ss = SpreadsheetApp.getActiveSpreadsheet();
var sheet = ss.getSheetByName(SHEET_GLOVES);  // Use constants from 00-Constants.gs
```

### Column References
Use `COLS` constants for fixed column positions:
```javascript
var itemNum = row[COLS.INVENTORY.ITEM_NUM - 1];  // -1 for array index
var status = row[COLS.INVENTORY.STATUS - 1];
```

Available `COLS` namespaces: `INVENTORY` (Gloves/Sleeves — 12-column layout with ESL_ID), `BLANKETS`, `HV_TESTERS`, `PHASING_SETS`, `AED`, `SWAPS`, `BLANKET_SWAPS`, `SWAPS_HIDDEN`, `EMPLOYEES`, `EMPLOYEE_HISTORY`.

**Note:** `HV_TESTERS` and `PHASING_SETS` share the same 12-column layout (A-L): Item#, Model, KV, Serial#, Calibration Date, Date Assigned, Location, Status, Assigned To, Change Out Date, Picked For, Notes.

**Note:** `INVENTORY` (Gloves/Sleeves) uses a 12-column layout (A-L): Item#, ESL ID, Size, Class, Test Date, Date Assigned, Location, Status, Assigned To, Change Out Date, Picked For, Notes. The ESL ID column (B=2) was added April 2026 via `migrateGlovesSleevesSheetsForESLID()`. **BLANKETS** does NOT have ESL ID — uses the old 11-column layout. **All Gloves/Sleeves code MUST use `COLS.INVENTORY.*` constants** — never hardcode indices like `row[5]` or `getRange(..., 11)`. As of April 17, 2026 all known hardcoded references have been updated.

### Logging
```javascript
logEvent('Task completed successfully', 'INFO');  // Levels: INFO, ERROR, WARNING, DEBUG
Logger.log('Debug output');  // For quick debugging
```

### Date Parsing (YYYY-MM-DD from HTML inputs)
**ALWAYS use `parseDateNoon(dateStr)` from `01-Utilities.gs`** when parsing YYYY-MM-DD strings from HTML date inputs. Never use `new Date(year, month, day)` — it creates midnight UTC which shifts back one day in US Mountain Time.
```javascript
var date = parseDateNoon('2026-04-13');  // Returns Apr 13 at noon — correct in all timezones
// WRONG: var date = new Date(2026, 3, 13);  // Midnight UTC = Apr 12 in Mountain Time
```

### HTML Dialogs
```javascript
function showMyDialog() {
  var html = HtmlService.createHtmlOutputFromFile('MyDialog')
    .setWidth(1400).setHeight(900);
  SpreadsheetApp.getUi().showModalDialog(html, 'Dialog Title');
}
```

## Data Flow Architecture
- **Task Metadata Sheet** - Single source of truth for task scheduling state
- **Source Sheets** (Glove Swaps, Sleeve Swaps, Blanket Swaps, HV Tester Swaps, Phasing Set Swaps, AED Swaps, Reclaims, etc.) → `generateTaskMetadata()` → Task Metadata
- Client dialogs call `getTasksWithMetadata()` which joins source data with metadata
- **~50KB return limit** - Large data stored in ScriptProperties, client fetches separately
- **Standardized Statuses:** Unassigned, Assigned, Complete, Overdue, Deferred

## Key Files
| File | Purpose |
|------|---------|
| `Code.gs` | Main file - ALL working functions go here (~24.6k lines) |
| `00-Constants.gs` | Sheet names, column indices (`COLS`), `STATUS_LOCATIONS`, business constants (~249 lines) |
| `11-Triggers.gs` | Edit triggers, auto change-out date recalculation (~2.2k lines) |
| `22-EmployeeValidation.gs` | Job Tracking sheet functions, employee validation, training sync (~3.2k lines) |
| `51-EmployeeHistory.gs` | Employee lifecycle tracking, restore deleted employees (~1.5k lines) |
| `75-Scheduling.gs` | Crew visit scheduling, training calendar, attendee management (~3.6k lines) |
| `76-SmartScheduling.gs` | Task collection, `getDriveTimeMap()` (~2.5k lines) |
| `85-DataImport.gs` | Crew Import from Excel, Job Tracking sync, new hire/rehire, job activation scheduling, fiscal year transition (~3.5k lines) |
| `87-RoutePlanner.gs` | Trip planning and route optimization (~2.5k lines) |
| `88-SafetyReports.gs` | Gmail processing, Safety Compliance tracking (~16.6k lines) |
| `99-MenuFix.gs` | Full menu backup (run `forceCreateMenu` if menu missing) (~284 lines) |
| `TestRunner.gs` | Integration tests - run `runAllTests()` in Apps Script editor (~190 lines) |
| `ToDoSchedule.html` | Task List dialog (~6.5k lines) |
| `TripPlanner.html` | Trip Planner / Scheduler (primary scheduling interface, ~5k lines) |
| `CrewImport.html` | Excel crew import with SheetJS (~7.8k lines) |
| `QuickActions.html` | Monday workflow sidebar (~375 lines) |
| `ProcessSafetyEmailsDialog.html` | Safety email processing dialog (~1.5k lines) |
| `ToDoConfig.html` | Schedule configuration dialog (~2.3k lines) |
| `PurchaseOrderDialog.html` | Purchase order creation dialog (~943 lines) |
| `VendorConfig.html` | Vendor management with unified catalog (~450 lines) |
| `ComplianceConfig.html` | Safety Compliance configuration (~200 lines) |
| `AssignCrewLeads.html` | Crew lead assignment dialog (~540 lines) |
| `LookupDialog.html` | Employee & item lookup dialog, all assignments view (~520 lines) |
| `NewItemDialog.html` | New inventory item dialog (Gloves, Sleeves, HV Testers, Phasing Sets) (~407 lines) |
| `NewEmployeeDialog.html` | New employee creation dialog with pending new hire support (~507 lines) |
| `Dashboard.html` | Task dashboard display (~710 lines) |
| `ExpiringCertsImport.html` | Expiring certs import dialog (~1.1k lines) |
| `ExpiringCertsChoice.html` | Cert management choice dialog (Import / Refresh / Scan) (~95 lines) |
| `TimeBreakdown.html` | Daily Accomplishments / time tracking dialog (~500 lines) |
| `FiscalYearConfig.html` | Fiscal year configuration dialog (~342 lines) |

## Trip Planner Work Schedule
The Trip Planner supports configurable work schedules:
- **Mon-Thu** (default): Monday-Thursday work days, Tuesday must return to Helena
- **Tue-Fri**: Tuesday-Friday work days, Friday must return to Helena

Key functions in `87-RoutePlanner.gs`:
- `getWorkSchedule()` - Returns current schedule ('Mon-Thu' or 'Tue-Fri')
- `setWorkSchedule(schedule)` - Saves schedule preference to ScriptProperties
- `getScheduleConfig(schedule)` - Returns workDays, skipDays, mustReturnDay, avoidDay

## Safety Compliance System
Gmail is processed to track JHA/Safety Meeting compliance per crew:
- **Log Sheets** (JHA Log, Weekly Safety Log, Monthly Checklist Log) store raw email data
- `calculateComplianceFromLogs()` builds compliance from log sheets
- Safety Compliance sheet shows ✅/❌/⏳ per day per crew
- `processSafetyEmails()` is the main entry point
- `masterRecalculateCompliance()` - Fixes logs, removes non-config crews, recalculates all weeks
- `autoComplianceCleanup()` - Runs automatically at end of `processSafetyEmails()` to keep data clean

**Key Behavior:**
- Current week: Only Job Tracking active crews appear
- Past weeks: Existing data is preserved (historical crews not removed)
- `loadExistingComplianceForWeek()` preserves past week N/A values when recalculating

## Job Tracking Integration
Job Tracking sheet manages crew lifecycle, schedules, and Safety Compliance settings:
- **Statuses:** Active, Pending Start, Completed, On Hold
- **Pending Start jobs** excluded from Safety Compliance tracking until start date
- **Completed jobs** auto-sync to Training (removes future pending training rows)
- **Job Name** (col Z): Descriptive site/project name from Excel crew import (e.g., "Belgrade Dock", "Office/Management")

**Location vs Employee Status (Important!)**
The `Location` column on the Employees sheet currently serves double duty:
- **Physical city** (Bozeman, Helena, Great Falls) — used for drive times, change-out dates, Trip Planner
- **Employee status** (Light Duty, Weeds, Vacation, Leave) — used as exclusion signals

**⚠️ Status Location Filtering (April 2026 fix):**
`STATUS_LOCATIONS` constant in `00-Constants.gs` lists values that are statuses, NOT physical cities:
```javascript
var STATUS_LOCATIONS = ['vacation', 'light duty', 'weeds', 'leave', 'previous employee', 'unknown'];
```
Use `isStatusLocation(location)` from `01-Utilities.gs` to check if a location is a status value.
**All functions that determine crew location for Job Tracking MUST filter out status locations.** Otherwise, if the first employee processed for a crew has Location="Vacation", the entire crew gets "Vacation" as its location in Job Tracking. Functions already fixed:
- `syncJobTrackingAfterImport()` in `85-DataImport.gs`
- `refreshJobTrackingFromEmployees()` in `22-EmployeeValidation.gs`
- `populateJobTrackingFromEmployees()` in `22-EmployeeValidation.gs`
- `syncCrews()` in `22-EmployeeValidation.gs`

**Current state (April 2026):**
- "Light Duty", "Weeds", "Vacation", "Leave" are still valid Location values for backwards compatibility
- New Light Duty employees via Crew Import get **Location = "Helena"** + **Job Number = 005-26.#** (the 005- prefix handles exclusion)
- All filter/skip lists still include "Light Duty" for existing data
- **Future plan:** Add proper "Employee Status" column to separate location from condition. Needs planning.

**Differentiating crews in same city (e.g., multiple Helena crews):**
- Use `Location` = city name (Helena) for ALL crews in that city
- Use `Job Name` (col Z in Job Tracking) for descriptive labels (e.g., "Office/Management", "Helena Dock A", "Montana Ave Rebuild")
- Use `Job Number` prefix for exclusion logic (005- = office/light duty, 002- = lost/destroyed)

**Job prefix exclusions:**
- `DEFAULT_EXCLUDED_JOB_PREFIXES = ['002', '005']` in `75-Scheduling.gs`
- 002-: Lost/Destroyed/In Testing equipment records
- 005-: Office/Management/Light Duty employees

**Consolidated Safety Compliance Config (March 2026)**
Job Tracking now includes 9 visible schedule columns (L-T) that replace the separate "Safety Compliance Config" sheet:
- **L-R:** Skip Sun, Skip Mon, Skip Tue, Skip Wed, Skip Thu, Skip Fri, Skip Sat (checkboxes)
- **S-T:** Skip Weekly Meeting, Skip Monthly Checklist (checkboxes)
- **Default schedule:** Mon-Thu (Sun, Fri, Sat checked to skip)
- **Hidden columns V-Y:** Work Schedule, Skip Days, Schedule Effective, Schedule History

**⚠️ Classification Hierarchy (foreman detection):**
All functions that determine crew foreman MUST use this priority (lower = higher rank):
```
SUP(1) > GF(2) > F(3) > GTO F(4) > JRY(5) > JRY OP(6) > WT(7) > GTO(8) > EO 1(9) > EO 2(10) > AP 7-1(11-17)
```
Canonical source: `getCrewLead()` in `75-Scheduling.gs`. Also used by `syncCrews()` and `refreshJobTrackingForemenSilent()`.

**`generateAllReports()` pipeline** (Code.gs):
1. `checkAndActivateScheduledJobs()` — auto-activates On Hold/Pending Start jobs
2. `fixChangeOutDatesSilent()` + `fixBlanketChangeOutDatesSilent()`
3. `syncInventoryLocations()` — syncs equipment locations with Employees
4. Generate all swap reports (Gloves, Sleeves, Blankets, HV Testers, Phasing Sets, AED)
5. `updateReclaimsSheet()`, `updatePurchaseNeeds()`, `updateInventoryReports()`
6. `updateTrainingTrackingCrewLeadsSilent()` — updates crew leads for current/future months
7. `addMissingCrewsToTrainingTracking()` — adds new crew rows to Training Tracking (reads Training Config for topics/hours, excludes 005- prefix crews)
8. `refreshTrainingAttendeesSilent()` — refreshes crew member lists and sizes for current/future months
9. `syncCrews(true)` — syncs foremen and schedules in Job Tracking

Key functions in `22-EmployeeValidation.gs`:
- `setupJobTrackingSheet()` - Creates sheet with all 25 columns
- `migrateJobTrackingForComplianceConfig()` - Adds columns L-T to existing sheets
- `syncCrews(silent)` - Syncs foremen from Employees, applies default schedules. **Automatically calls** (in order): `renumberAllCrewPositions()`, `addMissingCrewsToTrainingTracking()`, `refreshTrainingAttendeesSilent()`, `cleanupTrainingTrackingOnHoldRows()`
- `syncCompletedJobsToTraining()` - Removes FUTURE training months after job end date
- `cleanupPendingTrainingForCompletedJobs()` - Removes ANY pending training for completed jobs
- `getCrewScheduleForWeek()` - Gets historical schedule for a week (supports schedule changes)
- `renumberAllCrewPositions()` - Batch renumbers all crew position suffixes (.1=lead, .2-.N by classification hierarchy then alpha); single `setValues` write

Key functions in `Code.gs` (Training Tracking):
- `addMissingCrewsToTrainingTracking()` - Reconciles Training Tracking against active Job Tracking crews. **Rules**: (1) Active crew = must have rows for current month onward; (2) Complete rows are NEVER touched; (3) Foreman-level deduplication — if a foreman already has Complete for a month in ANY crew, no new row added for other crews they lead; (4) **Always sorts the entire data range** (Jan→Dec, then alpha by crew) to consolidate all rows into one contiguous block.
- `refreshTrainingAttendeesSilent()` - Updates attendees/size/lead for Pending rows; marks On Hold/Completed crew Pending rows as N/A; uses per-crew caches for performance
- `cleanupTrainingTrackingOnHoldRows()` - Deletes N/A rows for On Hold/Completed crews and exact duplicate rows (same crew+month). Safe to run any time.

Key functions in `88-SafetyReports.gs`:
- `loadComplianceConfig()` - NOW reads from Job Tracking columns L-T (not Safety Compliance Config)
- `migrateConfigToJobTracking()` - One-time migration from old Config sheet to Job Tracking

**Migration workflow:**
1. Run "Migrate Job Tracking for Compliance" to add columns L-T
2. Run "Migrate Config to Job Tracking" to copy settings and delete old sheet
3. Use "Sync Crews" to update foremen and apply default schedules

## Pending New Hire Employees (April 2026)
Employees with a **future Hire Date** (col K on Employees sheet) are "pending new hires". They exist on the Employees sheet so equipment can be pre-assigned, but are excluded from active reporting until their start date.

**How it works:**
- `isEmployeePending(hireDate)` in `01-Utilities.gs` — single source of truth. Returns `true` if Hire Date > today.
- `checkAndActivatePendingEmployees()` in `85-DataImport.gs` — auto-activates employees when Hire Date arrives. Called inside `checkAndActivateScheduledJobs()` which runs during `generateAllReports()` and Crew Import sync.
- `getPendingEmployeeSet(ss)` in `76-SmartScheduling.gs` — returns a map of pending employee names (lowercase) for batch filtering.

**What pending employees are excluded from:**
- Swap generation (Gloves, Sleeves, Blankets, HV Testers, Phasing Sets, AED) — `generateSwaps()` and equipment-specific generators skip them
- Task collection — `collectExpiringCertTasks()` skips pending employees
- Reclaims — pending employees are treated as active (equipment is intentionally pre-staged, not reclaimed)

**What pending employees are NOT excluded from:**
- Location sync — equipment shows the correct future location
- Lookup Dialog — you can see what's been pre-assigned
- Equipment assignment via edit triggers — you can assign equipment normally
- History logging — events are tracked with `NEW_EMPLOYEE_PENDING` type

**NewEmployeeDialog.html** shows a yellow "Pending New Hire" badge when Hire Date is in the future. Location should be the **real physical city** (Helena, Bozeman, etc.) or "Unknown" if not yet determined.

**Employee History event types:**
- `NEW_EMPLOYEE_PENDING` — new hire added with future Hire Date
- `PENDING_ACTIVATED` — auto-logged when Hire Date is reached (within 30-day lookback window)

## Debugging
1. Check Apps Script execution log: Extensions → Apps Script → Executions
2. Capture clasp errors: `clasp push > push_output.txt 2>&1`
3. Common issues:
   - Duplicate `*/` in JSDoc comments
   - Return data > 50KB (use ScriptProperties pattern)
   - Function not found (check if in Code.gs, not module file)
   - Gmail permissions revoked → Run `authorizeGmailAccess()` from menu: 🛡️ Process Safety Emails → 🔧 Utilities → 🔑 Authorize Gmail Access

**⚠️ CrewImport.html `specialCircumstances` Array Pattern:**
`removeSpecialCard()` sets entries to `null` (not splice) to preserve indices for DOM card IDs. **All loops iterating `specialCircumstances` MUST check `if (!spec) continue;`** to skip nulled entries.

**⚠️ CrewImport.html Grid Layout Parsing Rules:**
The Excel crew structure uses a grid layout with crew "cards" arranged in columns A-D. Key parsing rules:
- **Crew header boundaries are cross-column** — a new row of crew headers marks a visual band break for ALL columns (correct for grid layout)
- **Special section boundaries are column-specific** — `findNextHeaderRow()` only uses special section headers from the SAME column as the crew being parsed. A "Weeds Gas" header in column C should NOT truncate employee lists in columns A or B.
- **`isEmployeeName()` rejects placeholders** — cells like "NEW HIRE JL" (no actual name) and "Need Guy Here With CDL" return `false`
- **Schedule annotations stripped** — `parseEmployeeName()` strips "Crew to X XX's..." and standalone schedule patterns (e.g., "5 10's this wk") before role detection. Without this, "Waco Worts F Crew to 5 10's this wk" would fail the Foreman check since "F" must be at end of string.
- **Trailing annotations stripped** — `parseEmployeeName()` strips trailing words like Hot, Cold, Weeds?, etc. before role detection

## Inventory Location Sync
`syncInventoryLocations()` in `22-LocationSync.gs` keeps all equipment sheet locations in sync with the Employees sheet:
- Called automatically during `generateAllReports()`
- Processes: Gloves, Sleeves, Blankets, HV Testers, Phasing Sets, AED
- Uses header-name-based column detection (`syncSheetLocations()`) — works for all sheet layouts
- Builds `nameToLocation` map from Employees sheet + special assignments (On Shelf → Helena, etc.)
- Also checks Employee History for "Previous Employee" status
- Skips Date objects in Assigned To column (guards against corrupted data setting location to "Unknown")

## Lookup Dialog
`LookupDialog.html` with backend functions in `Code.gs`:
- **Employee tab**: Searches by name (best-match scoring), returns employee info + all assigned equipment (Gloves, Sleeves, Blankets, HV Testers, Phasing Sets, AED) with phone/email. Shows **past assignment history** from History sheets (collapsible per equipment type, max 25 entries).
- **Item tab**: Searches by item number across 6 equipment types: glove, sleeve, blanket, hv_tester, phasing_set, aed. Uses `COLS` constants for correct column mapping per equipment type. Includes assignment history from corresponding History sheets.
- **All Assignments tab**: Lists every employee with equipment in expandable accordion rows. Color-coded: 🟢 green for foremen (SUP, GF, F, GTO F), gray for standard, 🔴 red name if any item is on a swap sheet. Uses ScriptProperties pattern (`ALL_ASSIGNMENTS_DATA`) for data transfer. Lazy-loads on first tab switch. Client-side name filter.

Key backend functions:
- `lookupEmployee(name)` - Smart name matching with scoring (exact > contains > partial)
- `lookupEmployeeHistory(name)` - Loads past assignment history from all History sheets (called separately to avoid timeout)
- `lookupItem(itemType, itemNum)` - Multi-type item search with COLS constants
- `getEquipmentHistoryForEmployee(ss, sheetName, name)` - Scans History sheets for past assignments
- `getAllEmployeeAssignments()` - Builds all-employee equipment map with swap detection, stores in ScriptProperties. Falls back to `directData` in response if ScriptProperties storage fails.
- `getStoredAllAssignments()` - Retrieves stored data for client

## Menu System
Menu defined in `Code.gs` `onOpen()` function. Organized as a 6-step Monday workflow under **Glove Manager**:

```
Glove Manager
├── 📱 Quick Actions                    ← Opens sidebar
├── ─────────────────────────
├── 📥 Import Crew Makeup              ← STEP 1
│   ├── 👥 Import Crew Makeup
│   ├── 👷 Assign Crew Leads
│   ├── 🔄 Sync Crews
│   └── 🔧 Utilities →                 (Job Tracking setup, migration, refresh, etc.)
├── 📊 Generate All Reports            ← STEP 2
│   ├── ⚡ Generate All Reports
│   ├── Generate Glove/Sleeve/Blanket/HV Tester/Phasing Set/AED Swaps
│   ├── Update Purchase Needs / Inventory Reports
│   ├── Run Reclaims Check / Update Reclaims Sheet
│   └── 🔧 Utilities →                 (Fix change-out dates, training crew leads)
├── 🛡️ Process Safety Emails           ← STEP 3
│   ├── 📥 Process Safety Emails
│   ├── 📊 View Equipment Needs
│   ├── 📈 View Compliance History
│   ├── ⚙️ Manage Schedules (Job Tracking)
│   ├── 🔧 Utilities →                 (Gmail auth, sync crews, master recalculate, tooltips, etc.)
│   ├── 📄 Logs →                       (Setup/view JHA Log, Weekly Safety Log, Monthly Checklist Log)
│   ├── 🔍 Debug →                      (Diagnose compliance, trace calculations, test parsing, etc.)
│   └── 🧹 Cleanup →                   (Create tasks from issues, refresh sheets, remove duplicates, etc.)
├── 🎯 Generate Task Metadata          ← STEP 4
│   ├── 🎯 Generate Task Metadata
│   ├── 📊 Task Dashboard
│   ├── 🗄️ Archive Completed Tasks
│   └── 🔧 Utilities →                 (Setup sheet, health check, remove duplicates, cleanup orphans)
├── 📅 Review & Schedule               ← STEP 5
│   ├── 📋 Tasks & Calendar
│   ├── 🗺️ Trip Planner
│   ├── ⚙️ Schedule Config
│   ├── 📝 Daily Accomplishments
│   ├── 📚 Training →                  (Setup config/tracking, sync crews, compliance report)
│   ├── 👷 Crew Visit →                (Setup/refresh crew visit config)
│   └── 🔧 Utilities →                 (Monthly schedule, refresh calendar, migrate manual tasks)
├── 💾 Save & Backup                   ← STEP 6
│   ├── 💾 Save Current State to History
│   ├── 💾 Create Backup Snapshot
│   ├── 📂 View Backup Folder
│   ├── 📋 History →                   (Import legacy, item lookup, view full)
│   └── 📧 Email Reports →             (Send, preview, configure, schedule)
├── ─────────────────────────
├── 🔧 Maintenance                     ← RARELY USED
│   ├── 📦 Inventory →                 (Archive, restore, sync, HV testers, phasing sets)
│   ├── 🛒 Purchase Orders →           (Create PO, order history, manage vendors)
│   ├── 👥 Employees →                 (Location validation, archive, restore, phone format, etc.)
│   ├── 📋 Job Tracking →              (View, refresh, schedule history, mark complete, add future)
│   ├── 🏗️ Sheets Setup →             (Build sheets, setup locations, fiscal year, import data)
│   ├── 🔍 Diagnose Auth Issues
│   └── 🗑️ Clear Background Triggers
├── 🔍 Debug                           ← DIAGNOSTIC TOOLS
│   ├── Test Edit Trigger / Recalc Current Row
│   ├── Diagnose Pick Lists / Show Swaps
│   ├── Test Trip Planner / Debug Task List / Debug Training
│   └── Diagnose specific crews
├── ─────────────────────────
└── Close & Save History
```

**Legacy naming note:** Some older docs or notes may refer to a top-level **"🛡️ Safety"** menu. In the current menu structure, this section is named **"🛡️ Process Safety Emails"**.

After changes:
1. Run `.\push.bat`
2. Refresh spreadsheet (Ctrl+Shift+R)
3. Menu appears under "Glove Manager"

## Testing Changes
1. Run `node validate-syntax.js` locally
2. Deploy with `.\push.bat`
3. Refresh spreadsheet, check menu loads
4. Test affected feature
5. Check Extensions → Apps Script → Executions for errors
