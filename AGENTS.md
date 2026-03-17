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
22-EmployeeValidation.gs → Job Tracking functions, Employee validation
...
51-EmployeeHistory.gs → Employee lifecycle, restore deleted employees
76-SmartScheduling.gs → Task collection, getDriveTimeMap()
85-DataImport.gs → Crew Import, Job Tracking sync
86-TimeTracking.gs → Daily Accomplishments
87-RoutePlanner.gs → Trip Planner
88-SafetyReports.gs → Gmail processing, Safety Compliance (~13k lines)
Code.gs          → loads LAST, contains ALL working implementations (~17k lines)
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
| `Code.gs` | Main file - ALL working functions go here (~17k lines) |
| `00-Constants.gs` | Sheet names, column indices, business constants |
| `22-EmployeeValidation.gs` | Job Tracking sheet functions, employee validation (~2k lines) |
| `51-EmployeeHistory.gs` | Employee lifecycle tracking, restore deleted employees (~1.4k lines) |
| `76-SmartScheduling.gs` | Task collection, `getDriveTimeMap()` |
| `85-DataImport.gs` | Crew Import from Excel, Job Tracking sync |
| `87-RoutePlanner.gs` | Trip planning and route optimization |
| `88-SafetyReports.gs` | Gmail processing, Safety Compliance tracking (~13k lines) |
| `ToDoSchedule.html` | Task List dialog |
| `TripPlanner.html` | Trip Planner / Scheduler (primary scheduling interface) |
| `CrewImport.html` | Excel crew import with SheetJS |
| `QuickActions.html` | Monday workflow sidebar |

## Key Sheets (Data Architecture)
| Sheet | Purpose |
|-------|---------|
| Task Metadata | Single source of truth for task state |
| Job Tracking | Crew lifecycle (Active, Pending Start, Completed) |
| Employees | Employee info, location, job numbers, sizes |
| Training Tracking | Monthly training compliance per crew |
| Training Config | Crews to track, monthly training topics |
| Expiring Certs | Employee certification expiration tracking |
| Safety Compliance | Weekly JHA/Meeting tracking per crew |
| Safety Compliance Config | Crew exclusion settings, work schedules |
| JHA Log | Audit trail for Job Hazard Analyses |
| Weekly Safety Log | Audit trail for Safety Meetings |
| Monthly Checklist Log | Audit trail for Fleet Checklists |
| Safety Equipment Needs | Equipment issues (fire extinguishers, etc.) |
| Locations | Drive times from Helena for route planning |

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
- Current week: Only Safety Compliance Config crews appear
- Past weeks: Existing data is preserved (historical crews not removed)
- `loadExistingComplianceForWeek()` preserves past week N/A values when recalculating

## Debugging
1. Check Apps Script execution log: Extensions → Apps Script → Executions
2. Capture clasp errors: `clasp push > push_output.txt 2>&1`
3. Common issues:
   - Duplicate `*/` in JSDoc comments
   - Return data > 50KB (use ScriptProperties pattern)
   - Function not found (check if in Code.gs, not module file)
   - Gmail permissions revoked → Run `authorizeGmailAccess()` from menu: 🛡️ Safety → 🔑 Authorize Gmail Access

## Menu System
Menu defined in `Code.gs` `onOpen()` function. Key submenus:
- **📅 Schedule & To-Do** - Task management, Trip Planner
- **🛡️ Safety** - Gmail processing, compliance tracking
- **🔧 Utilities** - Job Tracking, imports, maintenance

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

