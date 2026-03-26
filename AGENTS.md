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
00-Constants.gs  → loads FIRST (defines COLS, SHEET_* constants)
01-Utilities.gs  → utility functions (logEvent, normalizeApprovalValue)
10-Menu.gs       → archived (menu now in Code.gs)
11-Triggers.gs   → edit/change triggers, auto change-out dates (~2k lines)
22-EmployeeValidation.gs → Job Tracking functions, Employee validation (~3k lines)
22-LocationSync.gs → Inventory location sync with Employees (~175 lines)
30-SwapGeneration.gs → Swap report generation (~1.4k lines)
51-EmployeeHistory.gs → Employee lifecycle, restore deleted employees (~1.5k lines)
62-PurchaseOrders.gs → PO generation and vendor management (~700 lines)
75-Scheduling.gs → Crew visit scheduling, training calendar (~3.5k lines)
76-SmartScheduling.gs → Task collection, getDriveTimeMap() (~2.3k lines)
76-EmployeeClassifications.gs → Job classification dropdowns (~150 lines)
80-EmailReports.gs → Weekly HTML email reports (~1.5k lines)
85-DataImport.gs → Crew Import, Job Tracking sync (~2.4k lines)
86-TimeTracking.gs → Daily Accomplishments (~1k lines)
87-RoutePlanner.gs → Trip Planner (~2.5k lines)
88-SafetyReports.gs → Gmail processing, Safety Compliance (~15.9k lines)
95-DiagnosticTools.gs → Pick list diagnostics (~630 lines)
Code.gs          → loads LAST, contains ALL working implementations (~22.2k lines)
```

**Key Rule:** When functions appear in multiple files, **Code.gs always wins** (loads last).
- Module files (20-90) contain stubs/deprecated code
- **DO NOT add complete implementations to module files** - add to `Code.gs` only
- Functions suffixed `_INCOMPLETE_DEPRECATED` are intentional placeholders

## ES6/Modern JavaScript Restrictions
Google Apps Script V8 supports ES6, but this project uses ES5-style for consistency:
- Use `var` not `const`/`let` (validation warns on ES6)
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

### Logging
```javascript
logEvent('Task completed successfully', 'INFO');  // Levels: INFO, ERROR, WARNING, DEBUG
Logger.log('Debug output');  // For quick debugging
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
- **Source Sheets** (Glove Swaps, Sleeve Swaps, Reclaims, etc.) → `generateTaskMetadata()` → Task Metadata
- Client dialogs call `getTasksWithMetadata()` which joins source data with metadata
- **~50KB return limit** - Large data stored in ScriptProperties, client fetches separately
- **Standardized Statuses:** Unassigned, Assigned, Complete, Overdue, Deferred

## Key Files
| File | Purpose |
|------|---------|
| `Code.gs` | Main file - ALL working functions go here (~22.2k lines) |
| `00-Constants.gs` | Sheet names, column indices (`COLS`), business constants |
| `11-Triggers.gs` | Edit triggers, auto change-out date recalculation (~2k lines) |
| `22-EmployeeValidation.gs` | Job Tracking sheet functions, employee validation, training sync (~3k lines) |
| `51-EmployeeHistory.gs` | Employee lifecycle tracking, restore deleted employees (~1.5k lines) |
| `75-Scheduling.gs` | Crew visit scheduling, training calendar (~3.5k lines) |
| `76-SmartScheduling.gs` | Task collection, `getDriveTimeMap()` (~2.3k lines) |
| `85-DataImport.gs` | Crew Import from Excel, Job Tracking sync (~2.4k lines) |
| `87-RoutePlanner.gs` | Trip planning and route optimization (~2.5k lines) |
| `88-SafetyReports.gs` | Gmail processing, Safety Compliance tracking (~15.9k lines) |
| `ToDoSchedule.html` | Task List dialog (~6.5k lines) |
| `TripPlanner.html` | Trip Planner / Scheduler (primary scheduling interface, ~5k lines) |
| `CrewImport.html` | Excel crew import with SheetJS (~6.1k lines) |
| `QuickActions.html` | Monday workflow sidebar |
| `ProcessSafetyEmailsDialog.html` | Safety email processing dialog (~1.5k lines) |

## Key Sheets (Data Architecture)
| Sheet | Purpose |
|-------|---------|
| Task Metadata | Single source of truth for task state |
| Task Metadata Archive | Archived completed tasks (via garbage collection) |
| Job Tracking | Crew lifecycle (Active, Pending Start, Completed) with schedule history and compliance config (columns L-T) |
| Employees | Employee info, location, job numbers, sizes |
| Training Tracking | Monthly training compliance per crew |
| Training Config | Crews to track, monthly training topics |
| Expiring Certs | Employee certification expiration tracking |
| Safety Compliance | Weekly JHA/Meeting tracking per crew |
| JHA Log | Audit trail for Job Hazard Analyses |
| Weekly Safety Log | Audit trail for Safety Meetings |
| Monthly Checklist Log | Audit trail for Fleet Checklists |
| Safety Equipment Needs | Equipment issues (fire extinguishers, etc.) |
| Locations | Drive times from Helena for route planning |
| Blankets | Rubber blankets - 1-year test cycle |
| Blanket Swaps | Blankets approaching test date |
| HV Testers | High Voltage Testers - 10-year calibration/replacement cycle |
| HV Tester Swaps | HV Testers approaching replacement date |
| Phasing Sets | Phasing Sets - 10-year calibration/replacement cycle |
| Phasing Set Swaps | Phasing Sets approaching replacement date |

> **Note:** Safety Compliance Config was migrated into Job Tracking columns L-T (see Job Tracking Integration section). The separate sheet no longer exists.

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
`generateAllReports()` calls `syncCrews(true)` for foreman updates (not `refreshJobTrackingForemenSilent`).

Key functions in `22-EmployeeValidation.gs`:
- `setupJobTrackingSheet()` - Creates sheet with all 25 columns
- `migrateJobTrackingForComplianceConfig()` - Adds columns L-T to existing sheets
- `syncCrews(silent)` - Syncs foremen from Employees, applies default schedules
- `syncCompletedJobsToTraining()` - Removes FUTURE training months after job end date
- `cleanupPendingTrainingForCompletedJobs()` - Removes ANY pending training for completed jobs
- `getCrewScheduleForWeek()` - Gets historical schedule for a week (supports schedule changes)

Key functions in `88-SafetyReports.gs`:
- `loadComplianceConfig()` - NOW reads from Job Tracking columns L-T (not Safety Compliance Config)
- `migrateConfigToJobTracking()` - One-time migration from old Config sheet to Job Tracking

**Migration workflow:**
1. Run "Migrate Job Tracking for Compliance" to add columns L-T
2. Run "Migrate Config to Job Tracking" to copy settings and delete old sheet
3. Use "Sync Crews" to update foremen and apply default schedules

## Debugging
1. Check Apps Script execution log: Extensions → Apps Script → Executions
2. Capture clasp errors: `clasp push > push_output.txt 2>&1`
3. Common issues:
   - Duplicate `*/` in JSDoc comments
   - Return data > 50KB (use ScriptProperties pattern)
   - Function not found (check if in Code.gs, not module file)
   - Gmail permissions revoked → Run `authorizeGmailAccess()` from menu: 🛡️ Process Safety Emails → 🔧 Utilities → 🔑 Authorize Gmail Access

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
│   ├── Generate Glove/Sleeve/Blanket/HV Tester/Phasing Set Swaps
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

**Important:** There is NO "🛡️ Safety" top-level menu. The safety section is called **"🛡️ Process Safety Emails"**.

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

