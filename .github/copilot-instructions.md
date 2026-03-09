# Copilot Instructions for Rubber Tracker

## Deployment
- **ALWAYS use `.\push.bat`** to deploy changes to Google Apps Script
- Do NOT use `clasp push` directly - use the batch file instead
- The project uses clasp for Google Apps Script deployment
- **push.bat now includes automatic syntax validation** (added Feb 1, 2026)

### Pre-Push Validation (NEW - Feb 1, 2026)
The `push.bat` script now runs `validate-syntax.js` BEFORE pushing to catch errors early:
1. **Duplicate JSDoc closers** - Catches `*/` appearing twice (the Feb 1 bug)
2. **Duplicate .js/.gs files** - Auto-removes .js files if .gs exists
3. **ES6+ syntax warnings** - Warns about `const`, `let`, arrow functions, template literals
4. **Unmatched braces** - Warns about mismatched `{}`, `[]`, `()`

To run validation manually: `node validate-syntax.js`

### Troubleshooting Clasp Issues
If clasp appears to hang or fail silently:
1. **Check for syntax errors** - Most "clasp issues" are actually code syntax errors
2. Run `clasp push > push_output.txt 2>&1` to capture the real error message
3. Common causes: duplicate `*/` in JSDoc comments, missing semicolons, invalid JS syntax
4. Google Apps Script doesn't support modern ES6+ features (no `const`, `let`, arrow functions, template literals in .gs files)

### Duplicate File Errors
If you see "A file with this name already exists" error:
1. **Check for duplicate .js and .gs files** - The src folder should only have `.gs` files, not both `.js` and `.gs` with the same name
2. Run `Remove-Item src/*.js -Force` to delete all .js files (they're auto-generated and not needed)
3. Ensure `.clasp.json` only has `.gs` in `scriptExtensions`, not both `.js` and `.gs`
4. After cleaning, run `clasp push` again

### Data Transfer Limit Issues (NULL Response)
If the dialog receives `null` from server but logs show function completed:
1. **Google Apps Script has ~50KB return limit** - Large data sets fail silently
2. **Solution:** Store data in ScriptProperties (500KB limit), return small confirmation, then client fetches separately
3. The `getTasksWithMetadata()` function uses this pattern - stores in `TASKS_DATA` property, client calls `getStoredTasks()`
4. If client gets `null`, it should fallback to calling `getStoredTasks()` directly

## Project Structure
- Source files are in the `src/` folder
- `.gs` files are Google Apps Script files
- `.html` files are HTML templates for dialogs/sidebars

## Key Files
- `Code.gs` - Main code file with core functions, including Task Metadata functions
- `76-SmartScheduling.gs` - Smart scheduling and task collection
- `87-RoutePlanner.gs` - Trip planning and route optimization (reads directly from source sheets)
- `98-LegacyArchive.gs` - Archived legacy functions (DO NOT USE - for reference only)
- `ToDoSchedule.html` - Task List dialog (Calendar tab removed Feb 18, 2026)
- `ToDoConfig.html` - Schedule Configuration dialog
- `TripPlanner.html` - **Trip Planner / Scheduler** (primary scheduling interface - replaces Calendar)
- `Schedule.html` - Legacy unified dialog (no longer used in menus)

## Conventions
- Use `Logger.log()` for debugging in Google Apps Script
- Task types include: Swap, Reclaim, Training, Cert Expiring, Missing Safety Report
- Item types are: Glove, Sleeve
- **Standardized Statuses:** Unassigned, Assigned, Complete, Overdue, Deferred (as of Feb 18, 2026)

## Architecture (February 2026)
**Option A Implementation - Phase 6 COMPLETE**
- **Task Metadata Sheet** - Single source of truth for task scheduling state (COMPLETE ✅)
- **Eliminated To Do List Sheet** - Trip Planner and Time Tracking now use Task Metadata (Phase 6 COMPLETE ✅)
- **No localStorage** - State stored server-side in ScriptProperties or Task Metadata (COMPLETE ✅)
- **To Do List archived** - Legacy sheet can be archived via menu, no longer needed
- **Phase 7 Optimization** - Garbage collection, caching, dashboard, health checks (COMPLETE ✅)

---

# Feature Development Roadmap

## Current Status: All Phases Complete ✅ (Feb 7, 2026)

All major development phases are complete. See "Completed Features Log" for recent enhancements.

## COMPLETED PHASES ✅

### Phase 7: Cleanup & Optimization (COMPLETE - Feb 3, 2026)
**Status:** ✅ COMPLETE

**Goal:** Performance optimization, garbage collection, and maintenance tools.

**What was built:**

1. **Garbage Collection (Task 7.1)**
   - `archiveOldCompletedTasks(daysOld)` - Archives completed tasks to "Task Metadata Archive" sheet
   - `showArchiveCompletedTasksDialog()` - Menu UI for archiving
   - `cleanupOrphanedTaskMetadata()` - Removes orphaned metadata records
   - Menu: Glove Manager → Schedule & To-Do → 🗄️ Archive Completed Tasks
   - Menu: Glove Manager → Utilities → 🧽 Cleanup Orphaned Metadata

2. **Phone Number Caching (Task 7.2)**
   - `getEmployeePhonesCached(forceRefresh)` - 6-hour cache for employee phones
   - `clearPhoneCache()` - Clears cache when data changes
   - `getEmployeePhoneCached(employeeName)` - Single lookup with cache
   - Cache Key: `EMPLOYEE_PHONES`, TTL: 6 hours

3. **Task State Dashboard (Task 7.3)**
   - `getTaskStatistics()` - Returns comprehensive metrics
   - `showTaskDashboard()` - Interactive dashboard dialog
   - Menu: Glove Manager → Schedule & To-Do → 📊 Task Dashboard
   - Shows: Total tasks, pending, overdue, scheduled this week, completed this week
   - Breakdowns by status, type, and location

4. **Health Check & Cleanup (Task 7.4)**
   - `performTaskMetadataHealthCheck()` - Analyzes Task Metadata for issues
   - `showTaskMetadataHealthCheck()` - Menu UI for health check
   - `removeDuplicateTaskMetadata()` - Removes duplicate records
   - Menu: Glove Manager → Utilities → 🏥 Task Metadata Health Check
   - Menu: Glove Manager → Utilities → 🧹 Remove Duplicate Task Metadata

**Key files modified:**
- `Code.gs` - Added ~500 lines of Phase 7 functions
- Menu structure updated with new items

### Phase 6: Remove To Do List Sheet Dependencies (COMPLETE - Feb 1, 2026)
**Status:** ✅ COMPLETE

**Goal:** Eliminate dependency on the To Do List sheet - use Task Metadata as single source of truth.

**What was changed:**
1. **87-RoutePlanner.gs** - `collectTasksForTripPlanner()` now uses `getTasksWithMetadata()`
2. **86-TimeTracking.gs** - `getCompletedTasksForPeriod()` now uses Task Metadata first
3. **Code.gs** - Added `archiveToDoListSheet()` function
4. **Menu** - Replaced "Generate Smart Schedule" with "Archive Old To Do List (Legacy)"
5. **QuickActions.html** - Step 2 now uses `generateTaskMetadata`
6. **TripPlanner.html** - Empty state button uses `generateTaskMetadata`

**Functions available:**
- `archiveToDoListSheet()` - Menu: Glove Manager → Schedule & To-Do → Archive Old To Do List (Legacy)

### Phase 1: Task Metadata Infrastructure (COMPLETE - Jan 31, 2026)
**Status:** ✅ COMPLETE (85% done, remaining 15% are documentation tasks)

**Goal:** Create Task Metadata sheet and core infrastructure functions.

**What was built:**
1. **setupTaskMetadataSheet()** - Creates 25-column Task Metadata sheet with validations
2. **generateTaskMetadata()** - Reads from 6 source sheets, creates metadata records
3. **getTasksWithMetadata()** - Joins source data with metadata for dialog consumption

**Key achievements:**
- ✅ Task Metadata sheet structure designed (25 columns)
- ✅ Data collection from all sources working
- ✅ Due dates extracting correctly from Glove/Sleeve Swaps
- ✅ Duplicate prevention working
- ✅ Phone number enrichment working
- ✅ Fixed duplicate column header bug (Change Out Date index 4 vs 22)

**Functions available:**
- `setupTaskMetadataSheet()` - Menu: Glove Manager → Utilities → Setup Task Metadata Sheet
- `generateTaskMetadata()` - Menu: Glove Manager → Schedule & To-Do → Generate Task Metadata
- `getTasksWithMetadata()` - Returns: `{tasks: [...], lastGenerated: date, totalTasks: number}`

**Documentation:**
- IMPLEMENTATION_TRACKER.md - Master implementation plan
- PHASE1_COMPLETE.md - Comprehensive Phase 1 summary
- SESSION_SUMMARY_Jan31.md - Detailed session notes
- DATA_FLOW_ANALYSIS.md - Architecture analysis

---

## ADDITIONAL COMPLETED PHASES ✅

### Phase 1.5: Crew Makeup Spreadsheet Import (COMPLETE - Feb 7, 2026)
**Status:** ✅ COMPLETE

**Goal:** Import superintendent's weekly crew structure spreadsheet to update Employees sheet.

**What it does:**
- **Upload Excel file directly** (not copy/paste) using SheetJS library
- Read each crew "card" - a header cell with location + job number, and employees listed below it in the same column
- Match employees by name (using existing fuzzy matching)
- Update Location and Job Number on Employees sheet
- Show visual preview of detected crews before applying
- Log changes to Employee History

**Key files:**
- `85-DataImport.gs` - Backend apply function ✅
- `CrewImport.html` - UI with file upload and SheetJS parsing ✅

**How it works:**
1. User uploads Excel file (drag & drop or click to select)
2. Select the sheet tab for current week (e.g., "1.19.26")
3. System finds all "crew cards" - cells containing job numbers (XXX-XX pattern)
4. For each card, reads employees in the same column below the header
5. Maps location names (Belgrade Dock → Bozeman)
6. Assigns job numbers with positions (013-26.1, 013-26.2, etc.)
7. Shows preview of detected crews and proposed changes
8. User confirms and applies changes

**Spreadsheet Format (from superintendent):**
- Excel spreadsheet, weekly update
- Each sheet tab = a week (e.g., "1.19.26")
- Crew "cards" arranged in columns A-D
- Header format: `Belgrade Dock 013-26 5 8's M-F` where:
  - `Belgrade Dock` = Location name (maps to `Bozeman` in Google Sheet)
  - `013-26` = Job Number
  - `5 8's M-F` = Schedule info
- Employee rows directly below header in same column:
  - `F` suffix = Foreman
  - `JL` suffix = Journeyman Lineman
  - `# ap` suffix = Apprentice (e.g., `5 ap` = 5th year)
  - `Jry Op` = Journey Operator
  - `GTO` = Gas Tech Operator
  - `EO2` = Equipment Operator 2
- Job number assignment: First employee = `.1`, second = `.2`, etc.

**Location Mappings:**
- Belgrade Dock → Bozeman
- Helena Trans Dock / Helena Dock → Helena
- Great Falls Dock / G Falls → Great Falls
- Butte Dock → Butte
- Livingston Dock → Livingston
- Ennis Dock → Ennis
- Stanford Trans Dock → Stanford
- South Dakota Dock → South Dakota
- Msla / Msla ZIPLY Poles → Missoula
- Lolo Sub Dock → Lolo
- CA Sub Foundation → California

**What it updates (only these 2 columns):**
- **Location** - Mapped from job header
- **Job Number** - Full job number with position (e.g., 013-26.1)
- **Job Classification** - Mapped from Excel role to Google Sheet value

**What it does NOT update (preserves existing values):**
- Glove Size, Sleeve Size, Phone, Email, etc.

**Role to Classification Mapping:**
- F (Foreman) → F
- JL (Journeyman Lineman) → JRY
- 1 ap, 2 ap... 7 ap → AP 1, AP 2... AP 7
- Jry Op → JRY OP
- GTO → GTO
- GTO F → GTO F
- EO2 → EO 2

**Implementation tasks:**
- [x] Create CrewImport.html dialog with file upload ✅
- [x] Add SheetJS library for Excel parsing ✅
- [x] Add parseCrewCards() function - card-based approach ✅
- [x] Add matchEmployeesToSheet() using name matching ✅
- [x] Add visual crew card preview ✅
- [x] Add confirmation UI for changes ✅
- [x] Add applyCrewChanges() function (Location + Job Number only) ✅
- [x] Log changes to Employee History ✅
- [x] Add menu item ✅
- [x] Test with real Excel file ✅
- [x] Deploy with push.bat ✅

---

## Phase 2: Daily Accomplishment Breakdown
**Status:** ✅ COMPLETE

**Goal:** Generate formatted daily breakdown of completed tasks for timesheet copy/paste.

**What it does:**
- Scan completed tasks from To-Do List, Manual Tasks, Training Tracking
- Group by date, then by crew/location visited
- Auto-calculate travel time between locations using existing drive time map
- Generate plain-language summary with hours - ready to paste into timesheet
- Editable textarea so you can tweak wording before copying

**Key files to create/modify:**
- NEW: `86-TimeTracking.gs` - Time tracking functions ✅
- NEW: `TimeBreakdown.html` - UI for viewing/copying breakdown ✅

**Output Format Example:**
```
Thursday, Jan 23:
- Crew 013-26 (Bozeman) - 1 hr 40 min total:
  • Delivered gloves (2), sleeves (1)
  • Monthly Training - CPR
- Drove to Livingston - 30 min
- Crew 015-26 (Livingston) - 20 min total:
  • Delivered gloves to Chris Adams
- Drove back to Helena - 1 hr

Day Total: 3 hrs 30 min

=== WEEK SUMMARY ===
Total Field Time: 12 hrs 30 min
Total Drive Time: 8 hrs 45 min
Total Office Time: 4 hrs
Crews Visited: 013-26, 009-26, 015-26, 011-26
Tasks Completed: 23 swaps, 2 trainings, 5 reclaims
```

**Time Duration Logic:**
1. IF Start Time AND End Time are filled in → Use actual duration
2. ELSE IF estimatedTime is set → Use that estimate
3. ELSE → Use defaults:
   - Swap: 10 min each
   - Training: 1 hr
   - Cert task: 15 min
   - Manual task: 30 min
   - Reclaim: 15 min

**Features:**
- **Office Work Detection** - Helena-only days auto-labeled as "Office Day"
- **Smart Crew Consolidation** - Groups swaps by crew with counts (e.g., "Delivered gloves (3), sleeves (2)")
- **Week Summary Totals** - Field time, drive time, office time, crews visited, task counts
- **"What's Missing" Alert** - Flags days with tasks but no start/end times entered
- **Favorite/Template Phrases** - Save common timesheet phrases for quick insertion
- **Export Options** - Copy as plain text, bullet list, or table format

**Date Range Options:**
- Quick buttons: Today, Yesterday, This Week, Last Week
- Custom date range picker

**Implementation tasks:**
- [x] Create `86-TimeTracking.gs` with core functions ✅
- [x] Create `TimeBreakdown.html` dialog ✅
- [x] Add `showTimeBreakdownDialog()` function ✅
- [x] Add menu item: Glove Manager → Reports → 📝 Daily Accomplishments ✅
- [x] Test with completed tasks ✅
- [x] Deploy with `.\push.bat` ✅

---

## Phase 2B: Smart Route Optimizer
**Status:** ✅ COMPLETE

**Goal:** Calculate optimal travel routes based on pending tasks, due dates, and work schedule constraints (10-hr days Mon-Thu, Tuesday must-return, avoid Fridays).

**What it does:**
- Analyze all pending tasks with due dates and locations
- Group tasks by direction from Helena (5 clusters)
- Simulate each day: start location → travel → crew time → travel → end location
- Suggest optimal multi-day route plan to minimize drive time while hitting deadlines
- **Respect manual tasks** - Tasks added manually have scheduling constraints
- Drag-and-drop "what-if" mode to move tasks between days
- Handle overnight stays with manual city override
- Output suggested "Trip Plan" with apply-to-schedule functionality

**Key files to create:**
- NEW: `87-RoutePlanner.gs` - Route planning backend ✅
- NEW: `TripPlanner.html` - Interactive trip planner dialog ✅

**Manual Task Flexibility Options:**
Manual Tasks sheet now has 4 columns to control scheduling flexibility:
- **Locked** - Task cannot be moved at all (default TRUE for new tasks)
- **Allow Day Change** - Can move within the same week
- **Allow Week Change** - Can move to a different week
- **Allow Time Change** - Can adjust start/end time within scheduled day

When a manual task is:
- **Locked (default):** Shows 🔒 icon, cannot be dragged, optimizer builds around it
- **Flexible:** Can be dragged to other days based on allowed changes

**Overtime Approval Workflow:**
- Days exceeding 10 hours show ⚠️ warning
- Must click "Approve Overtime" button before applying to schedule
- Approved days show ✅ OT Approved badge

**Scheduling Constraints:**
- **Work hours:** 7am - 5pm (10 hrs max per day)
- **Primary days:** Monday - Thursday
- **Tuesday:** MUST return to Helena (no overnight)
- **Mon/Wed/Thu:** Overnight OK if saves significant time
- **Friday:** Avoid if possible (only for overdue tasks)
- **Preferences:** No overnight > Overnight, Shorter days > Longer days

**Office-Only Locations (excluded from trip planning):**
These locations are NOT physical destinations - tasks here are handled via phone/office work:
- **Helena** - Home base
- **Weeds** - Employees waiting for job to start (phone work for cert tracking)
- **Previous Employee** - No longer with company
- **Light Duty** - Office-based employees
- **Vacation** - On vacation
- **Leave** - On leave
- **Unknown** - Unknown location

**Task Types Excluded from Trip Planning:**
- **Cert Expiring** - All cert expiration tasks can be handled over the phone, no travel needed

**Start Location Options:**
Each day in Trip Planner has a dropdown to choose how to start:
- **Leave Helena @ 7am** - Normal mode, leave Helena at 7am
- **Arrive [Location] @ 7am (drive before)** - "Early bird" mode:
  - You drive from Helena BEFORE 7am to arrive at the first location at 7am
  - Drive time IS tracked (for your records/timesheet)
  - Drive time does NOT count against the 10-hour workday limit
  - This is "free" time you give the company
  - Shows leave time (e.g., "Leave Helena ~5:30am, 1 hr 30 min drive")

**Location Direction Groups:**
- **East/Southeast:** Bozeman, Livingston, Big Sky, Ennis
- **North:** Great Falls, Stanford
- **West:** Missoula, Lolo
- **Southwest:** Butte
- **Far:** Kalispell, Billings, South Dakota, California, Northern Lights

**Urgency Scoring:**
- Overdue = 100 points
- Due within 3 days = 80 points
- Due this week = 50 points
- Due next week = 20 points
- Later = 10 points

**Day Simulation Engine:**
- Input: Start time (7am), start location, destinations with task counts
- Crew time estimate: `15 min base + (10 min × task count)` per location
- Output: Route order, cumulative time, end location, overnight flag, exceeds-10-hr warning

**Trip Planner Dialog Features:**
- 2-week calendar view (Mon-Thu primary, Fri grayed "avoid")
- Draggable location cards between days (HTML5 drag-and-drop)
- **Locked tasks show 🔒 icon and cannot be dragged**
- **Manual tasks show "Manual" badge with scheduled time**
- Day timeline: 7am start → crew stops → end location → total hours
- Overnight indicator (🏨) with dropdown to override city (Bozeman, Billings, Great Falls, etc.)
- Tuesday highlighted "Must return to Helena"
- Urgency badges: 🔴 Overdue, 🟠 This Week, 🟡 Next Week, 🟢 Later
- Combined trip savings callouts: "Combine Bozeman + Livingston → Save 1 hr"
- Connected multi-day visualization (dotted line between overnight days)
- Real-time recalculation on drag
- **Overtime warning** with approval workflow for days > 10 hours
- "Refresh Tasks" button - pulls latest pending, shows new tasks as 🆕, preserves manual adjustments
- "Save Plan" button - persists to UserProperties for mid-week updates
- "Apply to Schedule" button - creates "🗺️ Trip: Location1 + Location2 - X tasks" entries

**Example Output:**
```
=== SUGGESTED TRIP PLAN ===

Monday, Jan 27 (Start: Helena 7am):
📍 Bozeman - 3 swaps, 1 training (Est. 55 min with crew)
📍 Livingston - 2 swaps (Est. 35 min with crew)
🏠 Return to Helena
⏱️ Total: 4 hrs 30 min | Drive: 2 hrs 30 min
💡 Savings: Combined trip saves 1 hr vs separate days

Tuesday, Jan 28 (Start: Helena 7am):
📍 Great Falls - 2 cert renewals 🔴, 1 swap (Est. 45 min)
🏠 Return to Helena (REQUIRED)
⏱️ Total: 3 hrs 45 min | Drive: 3 hrs

Wednesday, Jan 29 (Start: Helena 7am):
📍 Missoula - 4 swaps (Est. 55 min)
📍 Lolo - 1 training (Est. 1 hr 15 min)
🏨 Overnight in Missoula (optional)
⏱️ Total: 5 hrs 30 min | Drive: 2 hrs 30 min
```

**Implementation tasks:**
- [x] Create `87-RoutePlanner.gs` with core functions ✅
- [x] Add `getLocationDirectionGroups()` - 5 direction clusters ✅
- [x] Add `getPendingTasksWithLocations()` - pull incomplete tasks from To Do List ✅
- [x] Add `scoreTripUrgency(tasks)` - urgency scoring ✅
- [x] Add `calculateDayPlan(startLocation, destinations, startTime)` - day simulation ✅
- [x] Add `suggestOptimalTrips(daysAhead)` - 2-week plan generator ✅
- [x] Add `applyTripToSchedule(tripDays)` - create Manual Task entries ✅
- [x] Add `saveTripPlan()` / `loadTripPlan()` - persistence for mid-week updates ✅
- [x] Create `TripPlanner.html` dialog ✅
- [x] Add 2-week calendar grid with Mon-Thu focus ✅
- [x] Add drag-and-drop location cards (HTML5) ✅
- [x] Add overnight city dropdown override ✅
- [x] Add real-time recalculation on drag ✅
- [x] Add "Refresh Tasks" with 🆕 indicators ✅
- [x] Add connected multi-day visualization ✅
- [x] Add `showTripPlannerDialog()` function ✅
- [x] Add menu item: Glove Manager → Schedule → 🗺️ Trip Planner ✅
- [x] Add `getManualTasksWithFlexibility()` - reads manual tasks with lock/flexibility options ✅
- [x] Add Manual Tasks sheet flexibility columns (Allow Day Change, Allow Week Change, Allow Time Change, Locked) ✅
- [x] Update `suggestOptimalTrips()` to respect locked manual tasks ✅
- [x] Add 🔒 locked indicator for non-draggable tasks ✅
- [x] Add "Manual" badge and scheduled time display ✅
- [x] Add overtime warning with approval workflow ✅
- [x] Update `migrateManualTasksSheet()` to add flexibility columns ✅
- [x] Add "Office" card to unassigned pool for office work tracking ✅
- [x] Office tasks dialog with description, start/end time fields ✅
- [x] Office tasks saved to Manual Tasks sheet and appear in Daily Accomplishments ✅
- [x] Test with pending tasks ✅
- [x] Deploy with `.\push.bat` ✅

**Office Card Feature:**
- **Office** card always appears in unassigned locations pool (green styling with 🏢 icon)
- Drag Office card to any day to log office work for that date
- Dialog prompts for task descriptions with optional start/end times
- Tasks saved as "Office Work" type in Manual Tasks sheet with Location = Helena
- Completed office tasks automatically appear in Daily Accomplishments report
- Multiple office tasks can be added per day
- Use case: Track administrative work like "Updated inventory records", "Processed purchase orders", "Responded to emails"

---

## Phase 3: Enhanced HTML Email Reports
**Status:** ✅ COMPLETE (Feb 3, 2026)

**Goal:** Create premium HTML email reports with Google Charts visualizations and admin-controlled per-recipient customization.

**What it does:**
- **Admin-controlled recipient configuration** - You choose which report sections each recipient receives
- **Premium HTML email template** with gradient headers, card-based sections, shadow effects
- **Google Charts visualizations** - Pie charts, bar charts rendered as embedded images (flashiest option)
- **Personalized emails** - Each recipient only gets the sections you've enabled for them
- **Weekly schedule** - Monday 12 PM using existing trigger system

**Report Sections Available:**
1. **📊 Inventory Summary** - Stock levels by size, status breakdown
2. **🛒 Purchase Needs** - Items needing order, quantities
3. **🧤 Glove Swaps** - Upcoming swaps, overdue count
4. **💪 Sleeve Swaps** - Upcoming swaps, overdue count
5. **📜 Expiring Certs** - Color-coded urgency (red/orange/yellow/green)
6. **📅 Training** - Upcoming training, completion rates
7. **✅ Task Summary** - Pending/overdue counts by type
8. **🗓️ 2-Week Calendar** - Visual calendar grid with task indicators
9. **📈 Charts** - Pie chart (task status), bar chart (tasks by location)

**Key files to create/modify:**
- `80-EmailReports.gs` - Enhance with new section builders and config support
- NEW: "Email Report Config" sheet - Admin config for recipient preferences

**Email Report Config Sheet Structure:**
| Email Address | Inventory | Purchase Needs | Glove Swaps | Sleeve Swaps | Certs | Training | Tasks | Calendar | Charts |
|---------------|-----------|----------------|-------------|--------------|-------|----------|-------|----------|--------|
| boss@company.com | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| manager@company.com | | | ✓ | ✓ | ✓ | | | | |
| safety@company.com | | | | | ✓ | ✓ | | | |

**Implementation tasks:**
- [x] Create `setupEmailReportConfig()` - Creates config sheet, auto-imports existing Notification Emails with all sections enabled
- [x] Create `buildPremiumEmailHtml(recipientEmail)` - Builds personalized email based on config
- [x] Implement `buildInventorySummarySection(styles)` - Stock levels with color coding
- [x] Implement `buildPurchaseNeedsSection(styles)` - Items to order
- [x] Implement `buildSwapsSummarySection(sheetName, styles)` - Glove/Sleeve swaps
- [x] Implement `buildExpiringCertsSection(styles)` - Certs with urgency colors
- [x] Implement `buildTrainingSummarySection(styles)` - Training status
- [x] Implement `buildTaskSummarySection(styles)` - Task counts from Task Metadata
- [x] Implement `buildCalendarSection(styles)` - 2-week HTML calendar grid
- [x] Implement `buildChartsSection()` - Google Charts pie/bar charts as images
- [x] Update `sendEmailReport()` - Loop through config, send personalized emails
- [x] Add menu item: "⚙️ Configure Email Reports" - Opens config sheet
- [x] Add menu item: "👁️ Preview My Report" - Shows what your email looks like

**Google Charts Approach:**
- Use `Charts.newPieChart()` and `Charts.newBarChart()` from Apps Script Charts service
- Render charts as Blob images
- Embed in email as base64 data URLs or CID attachments
- Maximum visual impact with gradients, shadows, 3D effects

---

## Phase 4: Gmail Safety Report Processing
**Status:** ✅ COMPLETE (Feb 7, 2026)

**Goal:** Automatically filter and process Gmail for JHAs, Safety Meetings, and Fleet Checklists. Extract equipment issues (fire extinguishers, hot sticks, rubber goods, etc.) and track in Safety Reports sheet.

**What it does:**
- Search Gmail for:
  - **JHAs** (Job Hazard Analyses) - Subject: "Job Hazard Report" from mptablets@mountainpower.com
  - **Weekly Safety Meetings** - Subject: "Safety Meeting Report" from mptablets@mountainpower.com
  - **Fleet Safety Checklists** - Subject: "Weekly Safety Repairs" from fleet@mountainpower.com
- **PDF Attachment Processing** - Extracts text from PDF attachments using Drive API + OCR (most reports are PDFs)
- Extract key information:
  - Job number (e.g., "013-26")
  - Foreman name (looked up from Employees sheet)
  - Vehicle number (from fleet checklists)
  - Equipment issues (fire extinguishers, hot sticks, rubber goods, signs, wheel chocks, inspection tags)
  - Test/expiration dates
- Log to "Safety Reports" sheet with status tracking
- Auto-create tasks in Manual Tasks sheet for "Needs Attention" items
- Ignore mechanical issues (brakes, engine, etc.)

**Key files created:**
- NEW: `88-SafetyReports.gs` - Complete Gmail processing, PDF extraction, and parsing logic (700+ lines)
- NEW: "Safety Reports" sheet - Tracks equipment issues with 11 columns

**Safety Reports Sheet Structure:**
1. **Report Date** - Date of safety meeting/fleet checklist
2. **Report Type** - "JHA" | "Safety Meeting" | "Fleet Checklist"
3. **Job Number** - Extracted from subject line (e.g., "013-26")
4. **Foreman** - Name of foreman (looked up from Employees sheet)
5. **Vehicle Number** - Extracted from fleet checklist
6. **Equipment Type** - "Fire Extinguisher" | "Hot Stick" | "Rubber Goods" | "Signs" | "Wheel Chocks" | "Inspection Tag"
7. **Issue Description** - Full text of issue reported
8. **Status** - "Needs Attention" | "Resolved" | "Ordered" | "Replaced"
9. **Test/Expiration Date** - Extracted date when applicable
10. **Source Email ID** - Gmail message ID for reference
11. **Notes** - Additional context

**Email Subject Line Patterns:**
- JHA: `Job Hazard Report  02-04-2026_009-26_24193847_HEL EZ 1210 WINSTON ST A,B,C HSE CC CUTT (Modified-1)`
- Safety Meeting: `Safety Meeting Report  Week of 02-02-2026 Safety Topic 015-26`
- Fleet Checklist: `Weekly Safety Repairs 12.12.25`

**Equipment Keywords Detected:**
- Fire extinguisher / extinguisher
- Hot stick / hotstick
- Rubber goods / rubber glove / rubber sleeve
- Signs / sign
- Wheel chock / chock
- Inspection tag / tag

**Mechanical Keywords Ignored:**
- brake, brakes, engine, oil, tire, tires, battery, transmission, clutch, alternator, starter, radiator, suspension, exhaust, fuel, coolant, filter

**Functions Available:**
- `setupSafetyReportsSheet()` - Creates/recreates Safety Reports sheet
- `processSafetyEmails(daysBack)` - Searches and processes emails from last X days
- `showProcessSafetyEmailsDialog()` - UI to select date range (7/14/30/60/90 days)
- `createTasksFromSafetyIssues()` - Creates Manual Tasks for "Needs Attention" items
- `openSafetyReports()` - Opens Safety Reports sheet

**Menu Items:**
- Glove Manager → 🛡️ Safety Reports → ⚙️ Setup Safety Reports Sheet
- Glove Manager → 🛡️ Safety Reports → 📥 Process Safety Emails
- Glove Manager → 🛡️ Safety Reports → 📋 Create Tasks from Issues
- Glove Manager → 🛡️ Safety Reports → 📊 View Safety Reports

**Implementation tasks:**
- [x] Create `88-SafetyReports.gs` with all functions ✅
- [x] Add Gmail API scope to `appsscript.json` ✅
- [x] Add Drive API scope for PDF extraction ✅
- [x] Add Safety Reports submenu to main menu ✅
- [x] Implement email parsing with job number extraction ✅
- [x] Implement PDF attachment text extraction using Drive API + OCR ✅
- [x] Implement foreman lookup by job number ✅
- [x] Implement vehicle number extraction ✅
- [x] Implement equipment keyword detection ✅
- [x] Implement date extraction from text ✅
- [x] Implement duplicate prevention ✅
- [x] Implement conditional formatting for status ✅
- [x] Implement task creation from issues ✅
- [x] Implement batch processing (50 per batch) ✅
- [x] Fix forwarded email sender issue (search by subject only) ✅
- [x] **Deployed with `clasp push`** 🚀 (3 deployments Feb 4, 2026)
- [x] **Test with real emails** ✅
- [x] **Grant Gmail + Drive permissions** ✅

**Future Enhancements (Phase 2):**
- AI-powered summary generation (Google Gemini API)
- Crew-specific safety issue tracking
- Pattern detection (e.g., "Crew 009-26 has had 3 fire extinguisher issues this quarter")
- Automated equipment replacement scheduling

---


## Phase 5: Purchase Order Generation
**Status:** ✅ COMPLETE (Feb 5, 2026)

**Goal:** Generate purchase orders from Purchase Needs and track order status.

**What it does:**
- Read "NEED TO ORDER" items from Purchase Needs sheet
- Manage vendors with contact info and item pricing
- Generate plain text PO for copy/paste into email
- Track PO number `002-##` (based on fiscal year, e.g., 002-26)
- Log orders to Purchase Orders sheet for history
- Update Purchase Needs status to "ORDERED! Est. Receive date (MM/DD/YYYY)"

**Key files created:**
- `62-PurchaseOrders.gs` - Backend PO functions (~600 lines)
- `PurchaseOrderDialog.html` - Main PO creation dialog
- `VendorConfig.html` - Vendor management with pricing

**PO Text Format:**
```
I need to Order the following:

- (2) Class 2 Gloves, Size 10 @ $45.00
- (1) Class 2 Sleeves, Size 18 @ $65.00
- (3) Class 0 Gloves, Size 9.5 @ $35.00

Are these prices still correct?

Expected Delivery: ???

Notes: [Any notes]
```

**Vendors Sheet Structure:**
| Vendor Name | Contact Name | Email | Phone | Notes | Class 0 Glove | Class 2 Glove | Class 3 Glove | Class 0 Sleeve | Class 2 Sleeve | Class 3 Sleeve |

**Purchase Orders Sheet Structure:**
| Date | PO Number | Vendor | Items | Total Price | Expected Delivery | Status | Notes |

**Menu Items:**
- Glove Manager → 🛒 Purchase Orders → 📝 Create Purchase Order
- Glove Manager → 🛒 Purchase Orders → 📋 Order History
- Glove Manager → 🛒 Purchase Orders → ⚙️ Manage Vendors

**Functions Available:**
- `showPurchaseOrderDialog()` - Opens main PO creation dialog
- `showVendorConfigDialog()` - Opens vendor management dialog
- `openPurchaseOrdersSheet()` - Opens Purchase Orders sheet
- `setupPurchaseOrdersSheet()` - Creates Purchase Orders sheet structure
- `setupVendorsSheet()` - Creates Vendors sheet structure
- `getPurchaseOrderNumber()` - Returns `002-##` based on fiscal year
- `getVendors()` / `saveVendors()` - CRUD for vendor data
- `getItemsToOrder()` - Reads "NEED TO ORDER" items from Purchase Needs
- `generatePurchaseOrderText()` - Creates plain text PO for email
- `logPurchaseOrder()` - Logs order to Purchase Orders sheet
- `markItemsAsOrdered()` - Updates Purchase Needs status column
- `processPurchaseOrder()` - Combined function for dialog (logs + marks ordered)
- `getPurchaseOrderDialogData()` - Returns data for dialog initialization

**Implementation tasks:**
- [x] Create Purchase Orders sheet structure
- [x] Create Vendors sheet structure with pricing columns
- [x] Create PurchaseOrderDialog.html
- [x] Create VendorConfig.html
- [x] Add PO number generation (002-## format)
- [x] Add vendor management with CRUD
- [x] Add item price lookup from vendor
- [x] Add PO text generation for email copy/paste
- [x] Add status tracking (Ordered, Shipped, Received)
- [x] Update Purchase Needs with "ORDERED!" status
- [x] Add menu items
- [x] Deploy with `.\push.bat`

---

## Completed Features Log

### March 9, 2026
- ✅ **Job/Crew Tracking Sheet - Lifecycle Management**
  - **New Feature:** Track job/crew start dates, end dates, and status to manage crew lifecycle
  - **Problem Solved:** 
    - Secondary job numbers were being used for future jobs (not actual concurrent work)
    - No way to track when jobs start or end
    - No way to exclude future/pending jobs from Safety Compliance tracking
  - **New Sheet: "Job Tracking"** with columns:
    - Job Number (e.g., 013-26)
    - Location
    - Foreman
    - Crew Size
    - Start Date (when job becomes active)
    - Est. End Date (projected completion)
    - Actual End Date (when completed)
    - Status (Active, Pending Start, Completed, On Hold)
    - Notes
    - Last Updated
  - **How it works:**
    - Jobs with "Pending Start" status are excluded from Safety Compliance tracking
    - Jobs with future Start Date are also excluded
    - Jobs with "Completed" status are excluded
    - Only "Active" jobs with past/current Start Date are tracked
  - **New Functions in `22-EmployeeValidation.gs`:**
    - `setupJobTrackingSheet()` - Creates and sets up the Job Tracking sheet
    - `populateJobTrackingFromEmployees()` - Populates from Employees sheet
    - `refreshJobTrackingFromEmployees()` - Refreshes while preserving dates/status
    - `markJobComplete()` - Sets status to Completed and Actual End Date to today
    - `addFutureJob()` - Adds a new job with future start date
    - `getActiveJobNumbers()` - Returns only active job numbers (for Safety Compliance)
    - `isJobActive(jobNumber)` - Checks if a specific job is active
    - `openJobTrackingSheet()` - Opens the sheet
  - **New Menu Items (Glove Manager → 🔧 Utilities):**
    - 📋 Setup Job Tracking Sheet - Creates the sheet
    - 🔄 Refresh Job Tracking - Updates from Employees sheet
    - ✅ Mark Job Complete - Closes out a finished job
    - ➕ Add Future Job - Adds job with future start date
    - 📂 View Job Tracking - Opens the sheet
  - **Use Cases:**
    - Track when a job/crew started and when it's expected to end
    - Mark jobs as "Pending Start" for future assignments (employees assigned but job hasn't started)
    - Mark jobs as "Completed" when crew finishes and moves to new job
    - Future jobs don't appear in Safety Compliance until their start date
  - **Secondary Job Number Clarification:**
    - If employee's secondary job is actually a FUTURE job, add it to Job Tracking as "Pending Start"
    - The secondary job won't appear in Safety Compliance until it becomes Active
    - When old job completes, mark it "Completed" and change employee's primary job
  - **Crew Import Integration:**
    - After uploading crew makeup Excel file, Job Tracking is automatically synced
    - **Completed jobs are filtered out** from the crew preview - they won't show in the import
    - **Pending Start jobs** with employees assigned trigger an **activation dialog**
    - Dialog shows each pending job with checkbox - checked = activate, unchecked = keep pending
    - Shows job number, location, foreman, crew size, and planned start date
    - **Pending Start jobs show location from Job Tracking sheet** (not from Excel)
    - User can selectively activate jobs that are actually starting now
    - Jobs kept as "Pending Start" stay in future planning mode (not tracked for compliance)
    - New jobs that appear in the import are automatically added to Job Tracking
    - Jobs with no employees after import are flagged for review
    - Import completion message shows Job Tracking sync results
  - **Pending Start jobs excluded from "Employees in Multiple Crews":**
    - If an employee appears in both an Active job AND a Pending Start job, they are NOT flagged as duplicates
    - Only active job assignments count as duplicates
    - This allows future planning (assigning employees to jobs that haven't started yet) without triggering duplicate warnings
  - **Set as Pending Start from Crew Card:**
    - Each crew card dropdown has "📅 Set as Pending Start..." option
    - Opens dialog to set estimated start date
    - Adds job to Job Tracking sheet with Pending Start status
    - Immediately refreshes the preview and duplicate detection
  - **Mark Job Active:**
    - For jobs already marked as Pending Start, dropdown shows "✅ Mark as Active Now"
    - Changes status from Pending Start to Active in Job Tracking
  - **Files Modified:**
    - `src/22-EmployeeValidation.gs` - Added ~750 lines of job tracking functions
    - `src/85-DataImport.gs` - Added `syncJobTrackingAfterImport()`, `getJobTrackingForCrewImport()`, and `addOrUpdateJobTracking()` functions
    - `src/CrewImport.html` - Added jobTrackingData loading, filtering, Pending Start display, duplicate filtering, and Set Pending Start dialog
    - `src/Code.gs` - Added 5 new menu items

### March 3, 2026
- ✅ **Auto-Cleanup at End of Process Safety Emails**
  - **New Feature:** Automatic compliance cleanup runs silently at end of `processSafetyEmails()`
  - **What it does:**
    1. Auto-populates Safety Compliance Config with current crews from Employees sheet
    2. Fixes log entries (Credited To values) for current + previous week only
    3. Removes non-config crews from current week only (preserves historical data)
  - **Benefits:**
    - No more manual "Recalculate" needed after processing emails
    - Config stays in sync with employee changes
    - Non-config crews (typos, temporary jobs) automatically cleaned up
  - **New Functions in `88-SafetyReports.gs`:**
    - `autoComplianceCleanup()` - Lightweight cleanup, runs silently without UI
    - `fixLogEntriesForWeeks(weeks)` - Fixes logs for specific weeks only
    - `resolveJobToTrackedCrew(jobNumber)` - Resolves job to tracked crew
  - **Impact:** Process Safety Emails now auto-cleans compliance data - no manual intervention needed
- ✅ **Restore Deleted Employee Utility**
  - **New Feature:** Dialog to restore accidentally deleted employees from Employee History data
  - **How to Access:** Glove Manager → 🔧 Utilities → 🔄 Restore Deleted Employee
  - **What it does:**
    1. Search for employee by name in Employee History
    2. Shows matching employees NOT currently in Employees sheet
    3. Reconstructs employee data from all their history entries (most recent values)
    4. Preview and edit data before restoring (can update location, job number, etc.)
    5. Adds employee back to Employees sheet
    6. Logs "Restored" event to Employee History
  - **Data Restored:**
    - Name, Location, Job Number, Job Classification
    - Phone Number, Email Address
    - Glove Size, Sleeve Size
    - Hire Date
  - **New Functions in `51-EmployeeHistory.gs`:**
    - `showRestoreEmployeeDialog()` - Opens the restore dialog
    - `buildRestoreEmployeeHtml()` - Builds the dialog HTML
    - `searchEmployeeHistory(query)` - Searches history for matching employees
    - `restoreEmployeeToSheet(dataJson)` - Restores employee to Employees sheet
  - **Use Case:** Cody Schoonover was accidentally deleted from Employees sheet - use this utility to restore him
  - **Files Modified:**
    - `src/51-EmployeeHistory.gs` - Added ~350 lines of restore functions
    - `src/Code.gs` - Added menu item
- ✅ **Gmail Authorization Fix - Process Safety Emails Permission Error**
  - **Problem:** Process Safety Emails showing "The script does not have permission to perform that action" error for all Gmail searches. No new JHAs being logged since 02/27/2026.
  - **Root Cause:** Gmail permissions were revoked or expired - the OAuth token needed to be refreshed
  - **Solution:** Added Gmail authorization functions to test and fix permissions
  - **New Functions in `88-SafetyReports.gs`:**
    - `authorizeGmailAccess()` - Forces Gmail authorization, shows prompt to grant access
    - `testGmailAccess()` - Returns true/false for Gmail access status
    - `showGmailStatus()` - Shows current Gmail status with email counts found
  - **New Menu Items (Glove Manager → 🛡️ Safety):**
    - 🔑 Authorize Gmail Access - Run this to fix permission issues
    - 📊 Gmail Status - Check if Gmail is working and see email counts
  - **How to Fix Permission Issues:**
    1. Go to Glove Manager → 🛡️ Safety → 🔑 Authorize Gmail Access
    2. If prompted, click "Allow" to grant Gmail access
    3. You should see "✅ Gmail Access Authorized" message
    4. Now run "Process Safety Emails" as normal
  - **If Authorization Prompt Doesn't Appear:**
    1. Go to Extensions → Apps Script
    2. Find and run `authorizeGmailAccess` function directly
    3. Accept permissions when prompted
    4. Return to spreadsheet and try again
  - **Files Modified:**
    - `src/88-SafetyReports.gs` - Added ~100 lines of authorization functions
    - `src/Code.gs` - Added 2 new menu items at top of Safety submenu
  - **Impact:** Users can now easily diagnose and fix Gmail permission issues
- ✅ **Safety Compliance Config as Authoritative Crew Source**
  - **Problem:** Non-config job numbers (like 006-26, 053-25) were creating separate rows in Safety Compliance instead of crediting to the foreman's primary crew (052-25)
  - **Root Cause:** `calculateComplianceFromLogs()` was using `getActiveCrews()` from Employees sheet, which includes ALL job numbers
  - **Solution:** Config is authoritative for CURRENT week only; past weeks preserve existing crews
  - **Changes Made:**
    1. **Auto-populate Config** - `processSafetyEmails()` now calls `populateComplianceConfigSilent()` at the start to add any new crews from Employees sheet
    2. **Config-based tracking for current week** - Current week compliance ONLY shows crews in Config
    3. **Past weeks preserved** - Past weeks use `getExistingCrewsForWeek()` to keep whatever crews already exist in the sheet
  - **New Functions:**
    - `populateComplianceConfigSilent()` - Silently adds new crews to Config (no UI alerts)
    - `getExistingCrewsForWeek()` - Gets crews that already exist in Safety Compliance for a given week
    - `removeNonConfigCrewsFromCompliance()` - Removes non-config crews from CURRENT WEEK ONLY
  - **Behavior:**
    - **Current week:** Only Config crews appear in Safety Compliance
    - **Past weeks:** Existing crews are preserved (historical data NOT changed)
    - **When JHA for non-config job (006-26) is assigned to foreman:** Credits the foreman's primary crew (052-25) via "Credited To" column
    - **Recalculate ALL weeks:** Preserves past week crews (uses existing data from sheet)
  - **Files Modified:**
    - `src/88-SafetyReports.gs` - Updated `calculateComplianceFromLogs()`, added helper functions
  - **New Menu Items:**
    - 🧹 Remove Non-Config Crews - Removes non-config crews from CURRENT WEEK ONLY
- ✅ **One-Time Fix: Ben Lapka Weeks (02/15 and 02/22)**
  - **Problem:** Ben Lapka had multiple rows (006-26, 053-25, 052-25) instead of just his primary crew
  - **Solution:** Created one-time fix function to clean up those specific weeks
  - **New Menu Item:** Glove Manager → 🛡️ Safety → 🔧 Fix Ben Lapka Weeks
  - **What it does:**
    1. Removes rows for 006-26 and 053-25 from weeks 02/15/2026 and 02/22/2026
    2. Updates JHA Log and Weekly Safety Log entries to credit 052-25
    3. Recalculates compliance for those weeks
  - **Files Modified:**
    - `src/88-SafetyReports.gs` - Added `fixBenLapkaWeeks()` function
    - `src/Code.gs` - Added menu item
- ✅ **Consolidated Master Recalculate Compliance Function**
  - **Problem:** There were 3 separate compliance recalculate functions with overlapping functionality:
    - `recalculateComplianceFromLogs()` - Recalculates ONLY current + previous week
    - `recalculateAllComplianceFromLogs()` - Recalculates ALL weeks in Safety Compliance sheet
    - `menuFixAndRecalculateCompliance()` - Fixes log entries THEN recalculates all weeks
  - **Solution:** Created `masterRecalculateCompliance()` that combines ALL functionality:
    1. Fixes all log entries (Credited To values)
    2. Removes non-config crews from CURRENT WEEK ONLY (preserves historical data)
    3. Recalculates ALL weeks from log data
    4. Refreshes all tooltips
  - **New Menu Item:** Glove Manager → 🛡️ Safety → 🔄 Master Recalculate
  - **Replaced Menu Items:** The three separate items were consolidated into one
  - **Helper Functions Added:**
    - `findNonConfigCrewsInCurrentWeek()` - Identifies crews not in Config for current week
    - `removeNonConfigCrewsFromCurrentWeekSilent()` - Removes non-config crews (no UI prompts)
  - **Files Modified:**
    - `src/88-SafetyReports.gs` - Added `masterRecalculateCompliance()` and helper functions (~200 lines)
    - `src/Code.gs` - Replaced 3 menu items with single "🔄 Master Recalculate"
  - **Impact:** Users now have ONE button that does everything needed to fix compliance issues

### March 2, 2026
- ✅ **Safety Compliance - Ensure Current Week Exists**
  - **Problem:** When Process Safety Emails times out or there are no new emails, the current week doesn't get added to the Safety Compliance sheet, leaving gaps
  - **Solution:** Added utility functions to manually ensure weeks exist in compliance sheet
  - **New Functions:**
    - `ensureCurrentWeekInCompliance()` - Calculates compliance for current AND previous week from log data
    - `quickGmailCheck()` - Quick diagnostic showing what emails are in Gmail vs already logged (no processing)
    - `addJobMappingManually(jobNumber, foremanName)` - Programmatic way to add job→foreman mappings
  - **New Menu Items (Glove Manager → 🛡️ Safety):**
    - 🗓️ Ensure Current Week Exists - Adds current and previous week to compliance sheet from logs
    - 🔎 Quick Gmail Check - Shows Gmail search results vs what's already logged
  - **How `ensureCurrentWeekInCompliance()` works:**
    1. Calculates week boundaries for current and previous week
    2. Runs `calculateComplianceFromLogs()` for previous week (can create tasks if past deadline)
    3. Runs `calculateComplianceFromLogs()` for current week
    4. Updates Safety Compliance sheet with both weeks
    5. Formats and sorts the sheet
  - **Use Case:** If processing times out, run "Ensure Current Week Exists" to manually add the missing weeks
  - **Files Modified:**
    - `src/88-SafetyReports.gs` - Added ~200 lines of new utility functions
    - `src/Code.gs` - Added 2 new menu items
  - **Impact:** Users can now manually add weeks to compliance sheet without reprocessing all emails

### February 19, 2026
- ✅ **Fixed Repeated Unknown Jobs Popup in Process Safety Emails**
  - **Problem:** When processing safety emails, the "Unknown Job Numbers Found" popup kept appearing repeatedly for the same job numbers (e.g., 037-26, 001-26), even after the user assigned them to a foreman or clicked "Skip"
  - **Root Cause:** When a job was explicitly skipped by the user:
    1. `lookupForemanWithCustomMapping()` correctly returned `{ jobExists: false, source: 'skipped' }`
    2. But `parseSafetyEmail()` only returned `skippedReason: "Job not on Employee sheet"` for ALL failed lookups
    3. The main processing loop then added the job to `unknownJobsEncountered` again - even though user already decided to skip it
  - **Solution:**
    1. `parseSafetyEmail()` now returns different skip reasons:
       - `"User skipped"` - Job was explicitly skipped in a previous batch
       - `"Job not on Employee sheet"` - Job is genuinely unknown
    2. Main processing loop only adds jobs to `unknownJobsEncountered` when `skippedReason === "Job not on Employee sheet"`
    3. User-skipped jobs are silently ignored and counted as `skippedCount`
  - **Files Modified:**
    - `src/88-SafetyReports.gs` - Updated `parseSafetyEmail()` (~line 1621-1628), added handling for user-skipped jobs in main loop (~line 647-670)
  - **Impact:** Users no longer get stuck in a loop of assigning/skipping the same job numbers

### February 18, 2026
- ✅ **Option C Implementation - Unassigned Tasks & Status Standardization**
  - **Major Changes:**
    1. **Renamed Trip Planner → "Trip Planner / Scheduler"** - Now the primary scheduling interface
    2. **Renamed "Unassigned Locations" → "📋 Unassigned Tasks"** - Shows individual tasks under location headers
    3. **Removed Calendar tab from Task List** - Use Trip Planner / Scheduler for scheduling
    4. **Standardized status values** across entire system
  - **New Standardized Statuses:**
    - `Unassigned` - No scheduled date (replaces "Pending")
    - `Assigned` - Has scheduled date (replaces "Scheduled")
    - `Complete` - Task finished
    - `Overdue` - Past due date, not complete
    - `Deferred` - Intentionally postponed (new)
  - **Unassigned Tasks Sidebar:**
    - Collapsible location headers (📍 Bozeman, 📍 Livingston, etc.)
    - Individual task cards under each location (draggable)
    - Each task shows: icon, employee name, task type, due date, urgency dot
    - Right-click context menu for quick actions
  - **Right-Click Context Menu:**
    - 📅 Schedule Next Week - Assigns to Monday of next week
    - 📅 Schedule in 2 Weeks - Assigns to Monday 2 weeks out
    - ⏸️ Defer Task - Sets status to Deferred (shows badge)
    - ↩️ Remove Deferred Status - Removes deferred status
    - 👁️ View Details - Shows full task info popup
  - **Individual Task Dragging:**
    - Drag single task to calendar day (not entire location)
    - If location exists on day, merges task into it
    - If not, creates new location entry
    - Task removed from unassigned sidebar
  - **Migration Function:**
    - `menuMigrateTaskStatuses()` - Converts old statuses to new format
    - Mapping: Pending→Unassigned, Scheduled→Assigned, Declined→Deferred
    - Menu: Glove Manager → Maintenance → 🔄 Migrate Task Statuses
  - **Files Modified:**
    - `src/TripPlanner.html` - Complete sidebar rewrite, individual task cards, context menu, drag handling
    - `src/ToDoSchedule.html` - Removed Calendar tab, added status CSS, stub renderCalendar()
    - `src/Code.gs` - Status migration function, updated status validation
    - `src/87-RoutePlanner.gs` - Updated default status to 'Unassigned'
  - **Impact:** Trip Planner is now the central scheduling interface, task assignment is more granular
- ✅ **Trip Planner UI Redesign - Separate Field Locations from Office Tasks**
  - **Problem:** Grey dot (office/phone) tasks were mixed with field trip locations in the Trip Planner sidebar
  - **Solution:** Split the sidebar into two sections:
    1. **📋 Unassigned Tasks** - Field trip tasks (draggable to calendar days)
    2. **📞 Office/Phone Tasks** - Cert expiring, Weeds, Light Duty tasks (no travel needed)
  - **Office Tasks Section Features:**
    - Grouped by task type (Cert Renewals, Other)
    - Collapsible groups with count badges
    - Click task to see detail popup with:
      - Employee name & location
      - Task type & due date
      - Phone number (if available)
      - Quick "Send SMS" button
    - Summary count at bottom
  - **Files Modified:**
    - `src/TripPlanner.html` - New sidebar layout, `renderUnassigned()` and `renderOfficeTasks()` functions
  - **Impact:** Cleaner separation between field work and phone work
- ✅ **Fixed Trip Planner "getDriveTimeMap is not defined" Error (Redeployed)**
  - **Problem:** Trip Planner was returning null due to `getDriveTimeMap` not being found
  - **Root Cause:** The function was added Feb 17 but may not have been deployed
  - **Solution:** Redeployed with `.\push.bat` to ensure `getDriveTimeMap()` from `76-SmartScheduling.gs` is available
- ✅ **Office Tasks Now Schedulable via Drag-and-Drop**
  - **Problem:** Office/phone tasks (cert renewals, etc.) couldn't be scheduled to specific days in Trip Planner
  - **Solution:** Made office task cards draggable to calendar days
  - **How it works:**
    1. Office tasks in the "📞 Office/Phone Tasks" sidebar show "⬆️ Drag to schedule" hint
    2. Drag any office task to a calendar day
    3. Creates "Helena Office" location on that day with the task
    4. Multiple office tasks dragged to same day merge into single "Helena Office" entry
    5. Drag "Helena Office" card back to sidebar to unschedule (returns tasks to Office/Phone section)
    6. When "Apply to Schedule" is clicked, office tasks update Task Metadata with scheduled date
  - **Helena Office Location Features:**
    - Shows green styling with 🏢 icon
    - Badge shows "Office" to distinguish from field locations
    - Tasks within show employee name and cert type
    - Time estimate: 15 minutes per office task
  - **Backend Changes:**
    - `applyTripToSchedule()` now handles "Helena Office" locations
    - Matches tasks by source sheet + row index (not by location)
    - Updates Task Metadata with scheduled date, start time, and "Scheduled" status
  - **Files Modified:**
    - `src/TripPlanner.html` - Draggable office tasks, `handleOfficeTaskDragStart()`, updated `handleDrop()`, `createLocationCard()` with helena-office class
    - `src/87-RoutePlanner.gs` - Special handling in `applyTripToSchedule()` for Helena Office
  - **Impact:** All tasks (field and office) can now be scheduled via Trip Planner
- ✅ **Unassigned Locations Split: Urgent vs Backlog**
  - **Problem:** All unassigned field locations were shown together regardless of urgency
  - **Solution:** Split into two sections:
    1. **📍 Unassigned Locations** - Urgent tasks only (overdue, due soon, this week)
    2. **📋 Unscheduled (Backlog)** - Non-urgent tasks that can be scheduled when convenient
  - **Features:**
    - Backlog section only appears when there are non-urgent tasks
    - Grey styling to indicate lower priority
    - Both sections support drag-and-drop
    - Urgency threshold: maxUrgency >= 50 = urgent, < 50 = backlog
  - **Files Modified:**
    - `src/TripPlanner.html` - New `renderUnscheduledBacklog()` function, updated `renderUnassigned()`, new sidebar section HTML
  - **Impact:** Better visual prioritization of what needs to be scheduled first

### February 17, 2026
- ✅ **Fixed Trip Planner "getDriveTimeMap is not defined" Error**
  - **Problem:** Trip Planner returned null/failed with error `ReferenceError: getDriveTimeMap is not defined`
  - **Root Cause:** The `getDriveTimeMap()` function was referenced in `87-RoutePlanner.gs` and `86-TimeTracking.gs` but never defined anywhere in the codebase
  - **Solution:** Added `getDriveTimeMap()` function to `76-SmartScheduling.gs`
  - **What the function does:**
    - Returns a map of drive times (in minutes) from Helena to various locations
    - Used by Trip Planner for route optimization and Time Tracking for daily accomplishments
  - **Drive times included:**
    - Helena: 0, Ennis: 60, Butte: 90, Big Sky: 90, Bozeman: 90, Livingston: 90
    - Great Falls: 90, Missoula: 120, Lolo: 130, Stanford: 120, Rapelje: 120
    - Elliston: 45, Gold Creek: 75, Kalispell: 180, Billings: 180
    - Miles City: 240, Sidney: 300, Glendive: 270, South Dakota: 420
    - Northern Lights: 420, California: 960, Weeds/Light Duty/Unknown: 0 (office-based)
  - **Files Modified:**
    - `src/76-SmartScheduling.gs` - Added `getDriveTimeMap()` function (~40 lines)
  - **Impact:** Trip Planner now loads correctly and can calculate route times
- ✅ **Fixed Duplicate Safety Compliance Tasks in UI (Client-Side Deduplication)**
  - **Problem:** Safety Compliance tasks appeared multiple times in the Task List, even after server-side fixes. Same job+week showed up twice with slightly different TaskID date formats.
  - **Root Cause 1:** Tasks were loaded from TWO sources simultaneously:
    1. `allTasks` from `getTasksWithMetadata()` → `collectMissingSafetyReportTasks()`
    2. `safetyComplianceTasks` from `getMissingSafetyReportTasks()` (separate call)
  - **Root Cause 2:** Different date formats in TaskID weren't being normalized:
    - `SafetyCompliance_013-26_02-08-2026` (MM-DD-YYYY)
    - `SafetyCompliance_013-26_20260208` (YYYYMMDD)
    - `SafetyCompliance_013-26_02/08/2026` (MM/DD/YYYY)
  - **Solution 1:** Added deduplication in `processTaskData()` after date normalization
    - Normalizes all date formats to MM-DD-YYYY before comparing
    - Keeps only first occurrence of each job+week combination
    - Logs: `processTaskData: Removed X duplicate Safety Compliance tasks`
  - **Solution 2:** Added deduplication in `renderPersonalChecklist()` to skip safetyComplianceTasks already in allTasks
    - Builds set of existing taskIds from allTasks
    - Skips any safetyComplianceTasks that match (including normalized date formats)
    - Logs: `renderPersonalChecklist: Skipping duplicate safety task X`
  - **Files Modified:**
    - `src/ToDoSchedule.html` - Added ~70 lines of deduplication logic in two functions
  - **How to Test:** Open Tasks & Calendar → Safety Compliance tasks should appear only once per job+week
  - **Documentation:** See `FIX_DUPLICATE_SAFETY_TASKS_FEB17.md`
- ✅ **Fixed "Last Processed: Loading..." in Process Safety Emails Dialog**
  - **Problem:** The "Last processed" timestamp always showed "Loading..." instead of actual date
  - **Root Cause:** No failure handler on `getLastSafetyEmailProcessedTime()` call - if call failed, UI stayed at "Loading..."
  - **Solution:** Added `.withFailureHandler()` to show "Unknown" if call fails
  - **Files Modified:** `src/ProcessSafetyEmailsDialog.html` - Added 4 lines
- ✅ **Fixed Duplicate Safety Compliance Tasks in Task List (Improved)**
  - **Problem:** After recording a resolution for a Missing Safety Report task, the task would return when "Process Safety Emails" ran again. Also, duplicate tasks with different date formats in TaskID were not being detected.
  - **Root Cause 1:** `collectMissingSafetyReportTasks()` used simple string comparison for job+week deduplication but didn't normalize date formats (YYYYMMDD, MM-DD-YYYY, MM/DD/YYYY)
  - **Root Cause 2:** When duplicates were found, it was keeping the first one found instead of the newest (with Complete/Resolved status)
  - **Solution:**
    1. Added `normalizeDateString()` helper in `cleanupDuplicateSafetyComplianceTasks()` to normalize YYYYMMDD, MM-DD-YYYY, MM/DD/YYYY, and YYYY-MM-DD to consistent MM-DD-YYYY format
    2. Updated `collectMissingSafetyReportTasks()` to track tasks by job+week and keep the NEWEST when duplicates found (compares CreatedDate)
    3. Improved cleanup function to properly identify and remove duplicates using normalized date keys
  - **Date Format Normalization:**
    - `20260208` → `02-08-2026`
    - `02/08/2026` → `02-08-2026`
    - `2026-02-08` → `02-08-2026`
  - **Deduplication Priority:**
    - Status: Complete > Resolved > Pending > others
    - If same status, newer row (higher rowIndex) is kept
  - **Files Modified:**
    - `src/76-SmartScheduling.gs` - Enhanced deduplication logic in `collectMissingSafetyReportTasks()` (~40 lines added)
    - `src/88-SafetyReports.gs` - Added `normalizeDateString()` helper, improved `cleanupDuplicateSafetyComplianceTasks()` (~50 lines added)
  - **Menu Item:** Glove Manager → 🛡️ Safety Reports → 🧹 Cleanup Duplicate Safety Tasks (existing, improved)
  - **Impact:** Resolved Safety Compliance tasks now stay resolved, duplicates with different date formats properly detected and removed

### February 16, 2026
- ✅ **Late Submission Tracking for JHA/Safety Meeting**
  - **Problem:** JHA for 02/13/2026 (week of 02/08) received on 02/16/2026 (week of 02/15) was counting as on-time but should be marked as LATE
  - **Solution:** Added late submission detection and tracking throughout the system
  - **How it works:**
    - `isReportLate(reportDate, receivedDate)` - Compares report date week vs received date week
    - If email received in a LATER week than the report date → marked as LATE
    - Late submissions now show **✅L** in Safety Compliance sheet (yellow background, amber text)
    - On-time submissions show **✅** (green background)
  - **Safety Reports Sheet:**
    - Notes column now includes "LATE SUBMISSION - Received MM/DD/YYYY" for late reports
    - Issue Description shows "Report received LATE - submitted after week deadline"
  - **SMS Messages:**
    - Updated `buildMissingSafetyReportMessage()` to handle late submissions
    - Late submission message: "The JHA for [date] was received late. Be sure to submit them in the same week that they are due."
  - **New Menu Item:**
    - Glove Manager → 🛡️ Safety → 🎨 Add Late Submission Formatting
    - Adds ✅L formatting rule to existing Safety Compliance sheets
  - **New Functions in `88-SafetyReports.gs`:**
    - `isReportLate(reportDate, receivedDate)` - Determines if report was submitted late
    - `addLateSubmissionFormatting()` - Adds ✅L formatting to existing sheet
    - `menuAddLateSubmissionFormatting()` - Menu function
  - **Changes to `calculateSafetyCompliance()`:**
    - Now tracks `jhaLateByDay[]` and `weeklyMeetingLate` per crew
    - Shows ✅L instead of ✅ for late submissions
    - Tracks `lateCount` in compliance data for reporting
  - **Files Modified:**
    - `src/88-SafetyReports.gs` - Late detection, tracking, formatting (~200 lines added)
    - `src/ToDoSchedule.html` - Updated SMS message builder for late submissions
    - `src/Code.gs` - Added menu item
- ✅ **Menu Cleanup & Legacy Code Archival**
  - **Streamlined Glove Manager menu** - Reduced from 10+ submenus to 8 organized categories
  - **Quick Actions is now first item** - Primary entry point for daily workflow
  - **New menu structure:**
    - 📱 Quick Actions (primary)
    - 📊 Reports (generate reports)
    - 📅 Scheduling (tasks, trip planner, config)
    - 🛡️ Safety (safety emails, compliance)
    - 🛒 Purchase Orders
    - 📧 Email Reports
    - 📋 History
    - ⚙️ Setup & Admin
    - 🧹 Maintenance
    - 🔧 Advanced (cleanup/debug)
  - **Removed legacy items:**
    - "Generate To-Do List" → redirects to generateTaskMetadata
    - "Clear Completed Tasks" → redirects to archiveOldCompletedTasks
    - "Archive Old To Do List" → one-time migration, done
    - Debug menu → moved to Advanced submenu
  - **Archived legacy files:**
    - `70-ToDoList.gs` - Now contains only stub redirects
    - `10-Menu.gs` - Archived, all code moved to Code.gs
  - **Documentation:** See `docs/MENU_CLEANUP_PLAN.md` for full details
- ✅ **Fixed Safety Compliance Sheet Not Showing Current Week**
  - **Problem:** After running "Process Safety Emails", the Safety Compliance sheet wasn't showing the current week (02/15/2026) - only the previous week was visible
  - **Root Cause:** `processSafetyEmails()` was updating compliance data correctly (logs showed "Updated 15 crew records for week of 02/15/2026"), but new week rows were appended at the **bottom** of the sheet. The `formatComplianceSheetByWeek()` function that sorts and formats the sheet was **not being called** after processing.
  - **Solution:** Added `formatComplianceSheetByWeek()` call after `finalizePastWeeksCompliance()` in the compliance tracking section of `processSafetyEmails()`
  - **What it does:**
    - Sorts Safety Compliance sheet by week (newest at top)
    - Applies alternating row colors for different weeks
    - Adds blue border separators between weeks
  - **Files Modified:**
    - `src/88-SafetyReports.gs` - Added `formatComplianceSheetByWeek()` call (~line 520)
  - **Impact:** Current week now appears at the top of Safety Compliance sheet after processing safety emails

### February 15, 2026
- ✅ **Fixed Duplicate Safety Compliance Tasks**
  - **Problem:** Matt Miller (and others) showed 2 duplicate tasks for the same week - one with "Missing: JHA" and one with "Missing: JHA & Weekly Meeting"
  - **Root Cause:** The `generateTaskMetadata()` function was creating duplicate Safety Compliance tasks with a different TaskID format (`SafetyCompliance_[rowIndex]_[date]`) than the original format (`SafetyCompliance_[jobNumber]_[week]`), bypassing duplicate detection
  - **Solution 1:** Skip Safety Compliance tasks in `generateTaskMetadata()` - they're already managed by `createMissingReportTasks()` with proper TaskIDs
  - **Solution 2:** Preserve "Resolved" status in `updateComplianceSheet()` - prevents overwriting resolved status when reprocessing emails
  - **Solution 3:** Add deduplication tracking in `collectMissingSafetyReportTasks()` - tracks seen job+week combinations to prevent showing duplicates in Task List
  - **Solution 4:** Add cleanup function `cleanupDuplicateSafetyComplianceTasks()` to remove existing duplicates
  - **New Menu Item:** Glove Manager → 🛡️ Safety Reports → 🧹 Cleanup Duplicate Safety Tasks
  - **Files Modified:**
    - `src/Code.gs` - Skip Safety Compliance tasks in generateTaskMetadata(), added menu item
    - `src/88-SafetyReports.gs` - Preserve "Resolved" status, added cleanup function (~150 lines)
    - `src/76-SmartScheduling.gs` - Added seenJobWeeks tracking in collectMissingSafetyReportTasks()
  - **Task Completion After Resolution:** When you record a resolution via the Resolution dialog, the task is now properly:
    1. Marked as "Complete" in Task Metadata (Status + CompletedDate)
    2. Safety Compliance sheet status set to "Resolved"
    3. Excluded from future Task List displays (collectMissingSafetyReportTasks skips completed tasks)
    4. NOT recreated when processSafetyEmails runs again (duplicate detection + Resolved status preserved)

### February 12, 2026
- ✅ **Crew Lead Classification Hierarchy**
  - **Problem:** When no Foreman (F) or GTO F is assigned to a crew, the system was returning the "first employee" instead of the highest-ranked employee by classification
  - **Example:** Crew 039-26 had Kamron Jones (JRY OP) and Dawson Marcil (AP 4), but Dawson was showing as crew lead because he was listed first
  - **Solution:** Updated `getCrewLead()` to use a classification hierarchy when selecting crew lead
  - **Classification Priority (lower = higher rank):**
    1. F (Foreman) - Primary crew lead
    2. GTO F (Gas Tech Operator - Foreman)
    3. GF (General Foreman)
    4. SUP (Superintendent)
    5. JRY (Journeyman Lineman)
    6. JRY OP (Journeyman Operator) ← Now correctly selected over apprentices
    7. WT (Working Technician)
    8. GTO (Gas Tech Operator)
    9. EO 1, EO 2 (Equipment Operators)
    10. AP 7 → AP 1 (Apprentices by year, 7 is most senior)
    11. First employee (fallback if no classification matches)
  - **Files Modified:**
    - `src/75-Scheduling.gs` - Rewrote `getCrewLead()` function (~70 lines)
  - **To Update Existing Data:**
    - Run: Glove Manager → Schedule & To-Do → 🔄 Refresh Training Tracking Crew Leads
    - Run: Glove Manager → Schedule & To-Do → 🔄 Refresh Crew Visit Config
- ✅ **Monthly Checklist Progressive Deadline Status**
  - **Problem:** Monthly Checklist was treated like weekly reports - showing ❌ (red) as soon as the week passed, but it's actually due once per MONTH with deadline on the last work day
  - **Solution:** Implemented progressive deadline status with graduated urgency colors
  - **How it works:**
    - **Weeks 1-2:** ⏳ (yellow/pending) - Plenty of time, no urgency
    - **Week 3:** ⚠️ (orange/warning) - Getting close, should submit soon
    - **Week 4/Final week:** ❌⏳ (red hourglass) - Urgent but still has time before month ends
    - **After month ends:** ❌ (red missing) - Deadline passed, task created
  - **Status Column Logic (UPDATED):**
    - If ONLY Monthly Checklist is ⏳ (weeks 1-2) but ALL other reports are ✅ → Status = **Complete**
    - If Monthly Checklist is ⚠️ or ❌⏳ (week 3+) → Status = **Pending** (unless worse)
    - If ANY required JHA or Weekly Meeting is missing → Status = **Missing Reports** or **Pending**
    - Example: Dusty Hendrickson has all JHAs and Weekly Meeting ✅, only Monthly ⏳ → **Complete**
  - **Task Creation:** Tasks are ONLY created when the month has ended and checklist wasn't received (prevents premature task creation during the month)
  - **New Functions in `88-SafetyReports.gs`:**
    - `getWeekOfMonth(date)` - Calculates which week of the month (1-4+) a date falls into
    - `getMonthlyChecklistStatus(weekStartDate, hasSubmitted, isSkipped)` - Returns `{status, cssClass, shouldCreateTask, affectsStatus}`
    - `menuAddMonthlyChecklistFormatting()` - Adds new formatting rules to existing sheet
  - **Key Property: `affectsStatus`**
    - `affectsStatus: false` (weeks 1-2) → Monthly Checklist doesn't change crew's Status column
    - `affectsStatus: true` (week 3+) → Monthly Checklist can set Status to Pending
  - **Conditional Formatting Added:** ⚠️ (orange) and ❌⏳ (red/pink) rules
  - **New Menu Item:** Glove Manager → Safety Reports → 🎨 Add Monthly Checklist Formatting
  - **Files Modified:**
    - `src/88-SafetyReports.gs` - Added ~100 lines: `getWeekOfMonth()`, `getMonthlyChecklistStatus()`, updated `calculateSafetyCompliance()`
    - `src/Code.gs` - Updated menu item name
- ✅ **ToDoConfig Dialog Loading Fixes**
  - **Problem 1:** Close button was opening Schedule Hub instead of closing to spreadsheet
  - **Problem 2:** Settings tab sections stuck on "Loading..." spinners (Crew Visit Config, Training: Select Crews, Certifications: Select Types)
  - **Root Cause:** JavaScript error `Cannot read properties of null (reading 'addEventListener')` caused by orphaned event listener for non-existent `schedule-tab` element. This error stopped all subsequent JavaScript from executing.
  - **Solution:**
    1. Fixed `closeDialog()` to call `google.script.host.close()` directly
    2. Removed orphaned event listener for non-existent `schedule-tab`
    3. Added console logging to all loading functions for debugging
    4. Added 10-second timeout handling with Retry buttons
    5. Added error handling with Retry buttons
  - **Loading Functions Updated:**
    - `loadCrewVisitConfig()` - 10 sec timeout, retry button
    - `loadTrainingConfig()` - 10 sec timeout, retry button
    - `loadExpiringCertsConfig()` - 10 sec timeout, retry button
    - `loadExcludedPrefixes()` - console logging
    - `loadEmployeeCertsData()` - 15 sec timeout, retry button
    - `loadTrainingConfigData()` - 10 sec timeout, retry button
    - `loadTrainingTrackingData()` - 10 sec timeout, retry button
  - **Files Modified:**
    - `src/ToDoConfig.html` - All loading functions updated, removed orphan event listener
- ✅ **Crew Visit Config & Training - Job Prefix Exclusion**
  - **Problem:** JT Kale (Light Duty, job 005-26.27) was appearing in Crew Visit Config and Training tasks even though Light Duty employees shouldn't need field visits or training
  - **Solution:** Implemented job prefix-based exclusion for Crew Visits and Training
  - **How it works:**
    - Employees with job numbers starting with excluded prefixes are automatically excluded
    - Default excluded prefixes: `002` (Lost/Destroyed), `005` (Light Duty)
    - When employee moves to Light Duty (job 005-xx), they're excluded automatically
    - When employee returns to field crew (job 013-xx), they're included automatically
  - **What's excluded:**
    - Crew Visit Config - Light Duty crews won't appear
    - Training Tasks - Light Duty employees won't get training tasks
  - **What's NOT excluded:**
    - Glove/Sleeve Swaps - Still managed normally
    - Expiring Certs - Certs still tracked
  - **New Functions:**
    - `isExcludedJobPrefix(jobNumber)` - Checks if job should be excluded
    - `getExcludedJobPrefixesInternal()` - Gets exclusion list from config
    - `refreshCrewVisitConfig()` - Updates crews while preserving user data
    - `getExcludedJobPrefixes()` / `saveExcludedJobPrefixes()` - API functions
  - **Modified Functions:**
    - `getActiveCrews()` - Now skips excluded job prefixes
    - `getCrewLead()` - Now skips excluded job prefixes
    - `getCrewSize()` - Now skips excluded job prefixes
    - `collectTrainingTasks()` - Now checks assignee's current job number
  - **New UI:** Schedule Config → "🚫 Exclude Job Prefixes" section
    - View current excluded prefixes as red badges
    - Add/remove prefixes
  - **New Menu Item:** Glove Manager → Schedule & To-Do → 🔄 Refresh Crew Visit Config
  - **Files Modified:**
    - `src/75-Scheduling.gs` - Added exclusion functions, modified crew functions
    - `src/76-SmartScheduling.gs` - Modified collectTrainingTasks()
    - `src/Code.gs` - Added API functions and menu item
    - `src/ToDoConfig.html` - Added excluded prefixes UI
- ✅ **Missing Report Resolution Dialog (Stage 2 for Safety Compliance)**
  - **Problem:** After sending SMS notification (Stage 1), the "Send Class Schedule" button (Stage 2) was showing for Missing Safety Report tasks - but class scheduling doesn't apply to safety compliance, it's for cert renewals
  - **Solution:** Created new "Record Resolution" dialog for Safety Compliance tasks that allows recording why each missing day's report was not received
  - **What Was Added:**
    - **New Modal:** `missingReportResolutionModal` in ToDoSchedule.html
      - Shows foreman name, week date, and list of missing days
      - For each missing day, dropdown with reasons: "Did Not Do", "Complete But Forgot to Send", "App Didn't Send", "Did Not Work"
      - Weekly Meeting section if that's also missing
      - Legend showing status code meanings
    - **New Backend Function:** `recordMissingReportResolutions()` in 88-SafetyReports.gs
      - Updates Safety Compliance sheet cells with resolution codes (❌D, ❌F, ❌A, ❌W)
      - Auto-completes the Task Metadata entry when all resolutions are recorded
      - Updates row status to "Resolved"
    - **SMS Notification Updates Sheet:** `markSafetyReportNotified()` function
      - When Stage 1 SMS is sent, all ❌ cells turn to ❌🔔 (orange/notified)
      - Called automatically from `sendNotifySMS()` for safety compliance tasks
    - **New Conditional Formatting:** `addResolutionFormattingRules()` function
      - ❌D = Did Not Do → Red background, bold red text
      - ❌F = Forgot to Send → Yellow background
      - ❌A = App Issue → Light orange background
      - ❌W = Did Not Work → Gray background (similar to N/A)
      - ❌🔔 = Notified → Orange background
  - **UI Changes:**
    - Stage 2 button for Safety Compliance tasks now shows clipboard icon and "Record resolution" title
    - Button changes to "Edit resolutions" after recording
    - `openScheduledModal()` now redirects to new modal for Missing Safety Report tasks
  - **New Menu Item:**
    - Glove Manager → 🛡️ Safety Reports → 🎨 Add Resolution Formatting
  - **Files Modified:**
    - `src/ToDoSchedule.html` - New modal HTML, new JS functions, modified button rendering
    - `src/88-SafetyReports.gs` - Added ~350 lines of resolution functions
    - `src/Code.gs` - Added menu item
  - **Workflow:**
    1. Missing Safety Report task appears in Task List
    2. Click SMS button (Stage 1) → sends notification, sheet updates to ❌🔔 (orange)
    3. Click clipboard button (Stage 2) → opens Resolution dialog
    4. Select reason for each missing day → Save
    5. Sheet updates with codes (❌D, ❌F, etc.), task auto-completes

### February 10, 2026
- ✅ **Fixed Process Safety Emails - Job Number Normalization**
  - **Problem 1:** `testDate is not defined` runtime error caused by duplicate code block (lines 1096-1107 were copy of 1083-1094)
  - **Problem 2:** Malformed job numbers from OCR errors (e.g., `332-6` instead of `033-26`) caused reports to be skipped
  - **Solution:** 
    1. Removed duplicate code block and fixed indentation
    2. Added job number normalization with interactive approval dialog
  - **New Functions in `88-SafetyReports.gs`:**
    - `normalizeJobNumber(jobNumber)` - Auto-corrects malformed job numbers (NNN-YY format)
    - `getSavedJobNumberCorrections()` - Gets remembered corrections from ScriptProperties
    - `saveJobNumberCorrection(original, corrected)` - Saves correction for future auto-apply
    - `clearJobNumberCorrections()` - Menu function to clear saved corrections
    - `applyJobNumberNormalization(jobNumber)` - Checks saved corrections first, then auto-normalizes
    - `applyJobNumberCorrections(approvalsJson)` - Applies user-approved corrections and logs to sheet
    - `cancelPendingCorrections()` - Cancels batch and discards pending data
  - **Normalization Examples:**
    - `332-6` → `033-26` (missing leading zero, truncated year)
    - `33-26` → `033-26` (missing leading zero)
    - `013-6` → `013-26` (truncated year)
  - **Interactive Approval Dialog:**
    - Shows when corrections are detected (not remembered)
    - Table with: Report Type | Original (red) | Corrected (editable) | Remember? | Skip?
    - "Remember" checkbox saves correction for future auto-apply
    - "Cancel" discards entire batch (safe option)
    - If NO corrections needed → logs immediately (no dialog)
  - **New Menu Item:** Glove Manager → 🛡️ Safety Reports → 🧹 Clear Saved Job Corrections
  - **Files Modified:**
    - `src/88-SafetyReports.gs` - Added ~250 lines of normalization and approval functions
    - `src/Code.gs` - Added menu item
  - **Documentation:** `FIX_SAFETY_EMAILS_JOB_NORMALIZATION.md`

### February 9, 2026
- ✅ **Fixed Missing Safety Report Tasks Not Appearing in Task List**
  - **Problem:** Tasks were created in Task Metadata but didn't show in Task List dialog
  - **Root Cause:** `collectAndGroupTasks()` had no collection function for Missing Safety Report tasks
  - **Solution:** Added `collectMissingSafetyReportTasks()` function to read tasks from Task Metadata
  - **What Was Added:**
    - New function in `76-SmartScheduling.gs`: `collectMissingSafetyReportTasks()` (~140 lines)
    - Collection call added to `collectAndGroupTasks()` pipeline
    - Reads TaskType = "Missing Safety Report" from Task Metadata
    - Filters out completed tasks
    - Groups by location like other task types
  - **Task Properties:**
    - TaskType: "Missing Safety Report"
    - ItemType: "JHA", "Weekly Meeting", or "JHA + Weekly Meeting"
    - Employee: Foreman name
    - Priority: High if overdue, Medium otherwise
    - EstimatedTime: 15 minutes (phone call)
    - Source: "Safety Compliance"
  - **Files Modified:**
    - `src/76-SmartScheduling.gs` - Added collection function and pipeline call
  - **Documentation:**
    - `FIX_MISSING_SAFETY_REPORTS_NOT_SHOWING.md` - Detailed fix explanation
    - `TEST_MISSING_SAFETY_REPORTS.md` - Testing guide
  - **Impact:** Missing Safety Report tasks now appear in Task List, Calendar, and Trip Planner views
- ✅ **Fixed Safety Compliance Category and Due Date Display**
  - **Problem:** Missing Safety Report tasks showed under "Other" category instead of "Safety Compliance", and lacked due date display
  - **Solution:** Added proper category detection and due date formatting
  - **What Was Changed:**
    - Added "Safety Compliance" category detection in `getTaskCategory()`
    - Added "Safety Equipment" category for Safety Reports equipment issues
    - Updated category order, icons, and colors
    - Added due date display under employee name for Safety Compliance tasks
    - Due dates show in red if overdue, gray if current/future
  - **New Categories:**
    - 🛡️ Safety Compliance (amber #f9ab00) - Missing Safety Reports
    - 🔧 Safety Equipment (orange #ff6d00) - Safety Reports equipment issues
  - **Category Order:** Training → Rubber Changes → Certs → Safety Compliance → Safety Equipment → Manual Tasks → Other
  - **Files Modified:**
    - `src/ToDoSchedule.html` - Category detection, configuration, and due date display (~30 lines)
  - **Documentation:**
    - `FIX_SAFETY_COMPLIANCE_CATEGORY.md` - Detailed fix explanation
  - **Visual Changes:** Tasks now properly grouped under Safety Compliance with amber header, showing "Due: MM/DD/YYYY" below employee name

### February 10, 2026
- ✅ **Fixed Safety Compliance Task Details Not Showing**
  - **Problem:** Ben Lapka had 3 Safety Compliance tasks but no identification of what items were missing (JHA dates, Weekly Meeting)
  - **Root Cause:** Line 1929 in `ToDoSchedule.html` was checking `if (weekOfMatch)` (the week date string) instead of checking if notes contained "Missing Weekly Safety Meeting"
  - **Solution:** Changed to check `notes.indexOf('Missing Weekly Safety Meeting') !== -1`
  - **What Tasks Show Now:**
    - Employee Name in bold
    - Week of MM/DD/YYYY (blue text with calendar icon 📅)
    - Missing: [Details] showing what's missing:
      - JHA: Full week (if all 5 days)
      - JHA: 02/03, 02/04 (specific dates if 2 or fewer)
      - JHA: 3 days missing (count if more than 2)
      - Weekly Meeting (if meeting is missing)
  - **Example Display:** "Ben Lapka | 📅 Week of 02/01/2026 | Missing: JHA: 02/03/2026, 02/04/2026, Weekly Meeting"
  - **Files Modified:**
    - `src/ToDoSchedule.html` - Line 1929 - Fixed Weekly Meeting detection
  - **Documentation:**
    - `FIX_SAFETY_TASK_DETAILS_DISPLAY.md` - Technical explanation
    - `SAFETY_COMPLIANCE_TASK_DISPLAY_FIXED.md` - User-facing summary
  - **Note:** Modified emails (Modified-##) were already being handled correctly by the system - no changes needed

### February 8, 2026
- ✅ **Expiring Certs Tab - Work Week Grouping**
  - **Change:** Expiring Certs now organized with TWO levels of dropdowns:
    1. **Outer dropdown:** Work weeks (e.g., "Week of Feb 10 - Feb 14, 2026")
    2. **Inner dropdown:** Cert types within each week (e.g., "CPR", "Forklift")
  - **Week Organization:**
    - 🔴 EXPIRED / OVERDUE - Red header, all expired certs grouped first
    - Future weeks shown in blue headers, sorted chronologically
    - Each week shows total cert count + expired/critical badges
  - **Benefits:**
    - Plan training by week - see what's due each week at a glance
    - Batch similar certs in the same week for efficiency
    - Easier to schedule classes for multiple employees needing same cert
  - **All groups collapsed by default** - click to expand
  - **Color coding:**
    - Week headers: Dark red (expired), Orange (critical), Blue (future)
    - Cert type headers: Red/Orange/Yellow/Green based on urgency
  - Modified `src/ToDoSchedule.html`:
    - Rewrote `renderExpiringCerts()` with week-based grouping
    - Added `getWorkWeekInfo()` helper to calculate week boundaries
    - Added `getWeekNumber()` helper for ISO week numbering
    - Added `toggleWeekGroup()` for outer dropdown
    - Updated `toggleCertTypeGroup()` to handle nested IDs
- ✅ **Safety Compliance Dashboard - Work Week Improvements**
  - **Change:** Compliance Dashboard now shows work weeks as collapsible cards
  - **New Layout:**
    - **Current Week** - Blue header, expanded by default with crew grid
    - **Previous Weeks** - Collapsible cards, sorted most recent first
    - Each week card shows: date range, compliant/missing counts, color-coded header
  - **Visual Improvements:**
    - Card-based UI with shadow effects and rounded corners
    - Week headers: 🟢 Green (all compliant), 🔴 Red (has missing), ⚪ Gray (past)
    - Click to expand/collapse week to see crew-by-crew breakdown
    - Trend analysis section at bottom for 4-week overview
  - **New Function:** `getComplianceHistoryByWeek(weeksBack)` - Retrieves historical compliance data organized by week
  - Modified `src/88-SafetyReports.gs`:
    - Rewrote `showComplianceDashboard()` with collapsible week cards
    - Added JavaScript `toggleWeek()` function for expand/collapse
    - Improved styling with gradients, badges, and modern card layout
- ✅ **Safety Compliance Sheet - Work Week Formatting**
  - **Change:** Safety Compliance sheet now has visual formatting to separate work weeks
  - **Formatting applied:**
    - **Alternating row colors** - White and light blue backgrounds for alternating weeks
    - **Blue separator lines** - Thick blue border between each week for easy visual scanning
    - **Auto-sorted** - Most recent week at top, then by job number within each week
  - **Auto-applied** when compliance data is updated via `updateComplianceSheet()`
  - **Manual reformat option:** Glove Manager → 🛡️ Safety Reports → 🎨 Reformat by Week
  - **New Functions:**
    - `formatComplianceSheetByWeek()` - Applies alternating colors and week separators
    - `applyWeekColorsAfterSort()` - Re-applies colors after sorting
    - `reformatSafetyComplianceSheet()` - Menu function for manual reformatting
    - `finalizePastWeeksCompliance()` - Scans for past weeks with "Pending" status, updates to ❌, creates tasks
    - `menuFinalizePastWeeks()` - Menu function to manually run finalization
  - **New Menu Items:**
    - Glove Manager → 🛡️ Safety Reports → 🎨 Reformat by Week
    - Glove Manager → 🛡️ Safety Reports → ✅ Finalize Past Weeks
  - **Auto-finalization:** Past weeks are now automatically finalized when processing safety emails
  - Modified `src/88-SafetyReports.gs` - Added ~200 lines of formatting and finalization functions
  - Modified `src/Code.gs` - Added menu items

### February 7, 2026
- ✅ **Expiring Certs Tab - Reorganized by Cert Type**
  - **Change:** Expiring Certs tab now groups by CERT TYPE instead of LOCATION
  - **Benefits:**
    - Easier to see all employees needing same certification at a glance
    - Employees sorted by expiration date within each cert type (most urgent first)
    - Better for batch scheduling same-type training sessions
  - **Visual Changes:**
    - Header icon changed from 📍 (location) to 🏆 (award/cert)
    - Header color based on urgency: 🔴 Red (expired), 🟠 Orange (critical), 🟡 Yellow (warning), 🟢 Green (OK)
    - Badge shows counts: "3 expired", "2 critical" next to cert type name
    - Each employee row now shows their LOCATION below their name
  - **Sorting:** Within each cert type, employees sorted by expiration date (soonest first)
  - Modified `src/ToDoSchedule.html`:
    - Rewrote `renderExpiringCerts()` to group by `cert.certType` instead of `cert.location`
    - Added sorting by expiration date within groups
    - Added `toggleCertTypeGroup()` function
    - Updated `renderCertRow()` to display location for each employee
- ✅ **Crew Import - Auto-Select Primary Job for Duplicate Employees**
  - When an employee appears in multiple crews, system now auto-selects the primary job assignment
  - **Primary Job Detection Logic:**
    - M-Th or M-F schedules = Primary (+100 points)
    - Standard workweek patterns (4 10's, 5 8's) without weekend mention = Primary (+50 points)
    - Fri & Sat schedules = Secondary (-100 points)
    - Weekend work = Secondary (-50 points)
    - Partial weeks (Mon-Wed) = Split (+30 points)
    - Partial weeks (Thu-Fri) = Split (+20 points)
    - Tie-breaker: More employees in crew = higher score (+1 per employee, max 10)
  - **UI Enhancements:**
    - Shows "Auto-selected" badge on cards with auto-selection
    - Schedule type badges: 🟢 Primary (M-Th), 🟢 Primary (M-F), 🟡 Secondary (Fri-Sat), 🔵 Split (Mon-Wed)
    - User can still override auto-selection by clicking different radio button
  - **New Functions:**
    - `selectPrimaryJob(occurrences)` - Scores each job and returns index of primary
  - Modified `src/CrewImport.html`:
    - Added `selectPrimaryJob()` function (~50 lines)
    - Updated `matchEmployeesToSheet()` to call `selectPrimaryJob()` instead of defaulting to index 0
    - Updated `showDuplicateSelectionUI()` to display schedule type badges and auto-selected indicator
  - **Use Case:** Employee works M-Th on crew 013-26 and Fri-Sat on crew 015-26 → System auto-selects 013-26
- ✅ **Crew Import - Interactive Schedule Type Marking**
  - **Detected Crews Section:** Each crew card now has a dropdown to mark Primary/Secondary/Split schedule
    - Dropdown button shows current schedule type with color badge
    - Options: Primary (M-Th), Primary (M-F), Secondary (Fri-Sat), Secondary (Weekend), Split (Mon-Wed), Split (Thu-Fri)
    - Changes persist to parsedCrews array for accurate duplicate detection
  - **Employees in Multiple Crews Section:** Each occurrence has its own schedule dropdown
    - Allows marking specific crew assignments as Primary/Secondary
    - When user marks an occurrence as "Primary", that option is auto-selected
    - Dropdown shows current schedule type with appropriate color
  - **New Functions:**
    - `getScheduleTypeFromHeader(headerText)` - Detects schedule from crew header text
    - `setCrewSchedule(crewIndex, scheduleType, scheduleLabel)` - Updates crew schedule
    - `setDuplicateSchedule(dupIndex, occIndex, scheduleType, badgeColor)` - Updates occurrence schedule
  - **Use Case:** User can manually correct schedule detection when auto-detection is wrong

### February 6, 2026
- ✅ **Crew Import - Employee Ordering by Classification**
  - Employees are now sorted by classification hierarchy BEFORE assigning job number suffixes
  - Order: SUP → GF → F → JRY/JL → WT → JRY OP → OP → AP 7→1 (7 ap first, 1 ap last) → GTO F → GTO → EO1/EO2
  - Job numbers now correctly reflect crew positions (e.g., Foreman gets .1, not the first person listed in Excel)
  - Added `getRolePriority(role)` function to define classification hierarchy
  - Modified `src/CrewImport.html` - Added sorting before position assignment
- ✅ **Purchase Order Dialog - All Sections Support**
  - PO dialog now shows items from ALL Purchase Needs sections, not just "Need to Order"
  - Sections displayed: 🛒 NEED TO ORDER, 📦⚠️ READY FOR DELIVERY (SIZE UP), ⏳ IN TESTING, ⏳⚠️ IN TESTING (SIZE UP), ⚠️ SIZE UP ASSIGNMENTS
  - Items grouped by category with colored header rows
  - Timeframe badges: Immediate (red), In 2 Weeks (green), In 3 Weeks (orange), Consider (gray)
  - "NEED TO ORDER" items checked by default, other sections unchecked
  - User can check/uncheck any item to include in PO
  - Use case: Order items in testing now to have them ready when testing completes
  - Modified `src/62-PurchaseOrders.gs` - `getItemsToOrder()` now reads all sections
  - Modified `src/PurchaseOrderDialog.html` - New grouped table layout with category headers
- ✅ **Send Email Directly from PO Dialog**
  - New "📧 Send Email" button appears after generating PO text (if vendor has email)
  - Sends email directly to vendor via Gmail
  - Confirmation prompt shows vendor name, email, and item count
  - Auto-logs order and marks items as ordered after sending
  - New function: `sendPurchaseOrderEmail(emailData)` in `62-PurchaseOrders.gs`
  - Modified `src/PurchaseOrderDialog.html` - Added sendEmail() function and button
- ✅ **Create PO Button in Quick Actions**
  - Added "📝 Create PO" sub-button under Step 2 (Generate All Reports)
  - Quick access to Purchase Order dialog from Monday workflow sidebar
  - Modified `src/QuickActions.html`

### February 5, 2026
- ✅ **Phase 5: Purchase Order Generation - COMPLETE**
  - Generate purchase orders from Purchase Needs "NEED TO ORDER" items
  - Manage vendors with contact info and item pricing (Class 0/2/3 Glove/Sleeve prices)
  - Generate plain text PO for copy/paste into email with pricing and "Are these prices still correct?" prompt
  - PO number format: `002-##` based on fiscal year (e.g., 002-26)
  - Log orders to Purchase Orders sheet for history tracking
  - Update Purchase Needs status to "ORDERED! Est. Receive date (MM/DD/YYYY)"
  - New files created:
    - `src/62-PurchaseOrders.gs` - Backend PO functions (~600 lines)
    - `src/PurchaseOrderDialog.html` - Main PO creation dialog
    - `src/VendorConfig.html` - Vendor management with pricing
  - New menu items:
    - Glove Manager → 🛒 Purchase Orders → 📝 Create Purchase Order
    - Glove Manager → 🛒 Purchase Orders → 📋 Order History
    - Glove Manager → 🛒 Purchase Orders → ⚙️ Manage Vendors
- ✅ **Safety Report Completion Sync**
  - When Safety Equipment tasks are marked complete in Task List, Safety Reports sheet status is automatically updated to "Resolved"
  - `syncSafetyReportCompletion(taskKey)` - Syncs individual task completion to Safety Reports sheet
  - `syncAllCompletedSafetyTasks()` - Bulk sync all completed safety tasks (for fixing mismatches)
  - `refreshSafetySheets()` - Combined function that syncs completed tasks AND recalculates current week's Safety Compliance
  - Modified `markTaskComplete()` in Code.gs to auto-sync Safety Equipment tasks
  - New Menu: Glove Manager → Safety Reports → 🔄 Refresh Safety Sheets
  - Modified `src/88-SafetyReports.gs` - Added ~200 lines of sync functions
  - Modified `src/Code.gs` - Updated markTaskComplete() and added menu item
- ✅ **Smart Email Processing (Only New Emails)**
  - `processSafetyEmails()` now supports `newOnlyMode` parameter (default: true)
  - Stores `LAST_SAFETY_EMAIL_DATE` in ScriptProperties after successful processing
  - On next run, uses Gmail `after:YYYY/MM/DD` filter to only fetch emails since last run
  - Dialog shows "Last processed: [date]" and checkbox "Only process new emails since last run"
  - Unchecking the box uses the day range dropdown instead (for full rescan)
  - Dramatically reduces processing time on subsequent runs
  - Modified `src/88-SafetyReports.gs` - Updated dialog UI and processSafetyEmails function
- ✅ **X# Vehicle Number Format Support**
  - `extractVehicleNumber()` now recognizes "X1", "X2", "X3" format vehicle numbers
  - Returns full format "X1" (not just "1") for clarity
  - Common for spare/extra vehicles in fleet
  - Modified `src/88-SafetyReports.gs` - Updated extractVehicleNumber() function

### February 3, 2026
- ✅ **Phase 3: Enhanced HTML Email Reports - COMPLETE**
  - Premium HTML email reports with Google Charts visualizations
  - Admin-controlled per-recipient customization (you choose which reports each person gets)
  - 9 report sections: Inventory, Purchase Needs, Glove Swaps, Sleeve Swaps, Certs, Training, Tasks, Calendar, Charts
  - New "Email Report Config" sheet - checkboxes to control which sections each recipient receives
  - Auto-imports existing Notification Emails with all sections enabled by default
  - Google Charts integration: 3D pie charts, bar charts embedded as images
  - Quick stats summary bar at top: Pending Tasks, Overdue, Swaps Due, Certs Expiring
  - 2-week calendar grid showing scheduled tasks
  - Color-coded urgency indicators throughout (red=expired, orange=soon, green=ok)
  - New menu items:
    - Glove Manager → Email Reports → 📤 Send Report Now
    - Glove Manager → Email Reports → 👁️ Preview My Report
    - Glove Manager → Email Reports → ⚙️ Configure Email Reports
  - Modified `src/80-EmailReports.gs` - Complete rewrite (~1450 lines)
  - See: copilot-instructions.md Phase 3 section for full details
- ✅ **Phase 7: Cleanup & Optimization - COMPLETE**
  - **Task 7.1: Garbage Collection**
    - `archiveOldCompletedTasks(daysOld)` - Archives completed tasks older than X days to "Task Metadata Archive" sheet
    - `showArchiveCompletedTasksDialog()` - Menu UI for archiving with customizable days
    - `cleanupOrphanedTaskMetadata()` - Removes metadata records where source task no longer exists
    - Menu: Glove Manager → Schedule & To-Do → 🗄️ Archive Completed Tasks
    - Menu: Glove Manager → Utilities → 🧽 Cleanup Orphaned Metadata
  - **Task 7.2: Phone Number Caching**
    - `getEmployeePhonesCached(forceRefresh)` - 6-hour cache for employee phone numbers
    - `clearPhoneCache()` - Clears cache when employee data is updated
    - `getEmployeePhoneCached(employeeName)` - Single employee lookup with caching
    - Cache Key: `EMPLOYEE_PHONES`, TTL: 6 hours (21600 seconds)
  - **Task 7.3: Task State Dashboard**
    - `getTaskStatistics()` - Returns comprehensive task metrics
    - `showTaskDashboard()` - Interactive dashboard dialog with stats
    - `buildTaskDashboardHtml(stats)` - HTML builder for dashboard
    - Menu: Glove Manager → Schedule & To-Do → 📊 Task Dashboard
    - Shows: Total tasks, pending, overdue, scheduled/completed this week, breakdowns by status/type/location
  - **Task 7.4: Health Check & Performance**
    - `performTaskMetadataHealthCheck()` - Analyzes Task Metadata for issues
    - `showTaskMetadataHealthCheck()` - Menu UI for health check results
    - `removeDuplicateTaskMetadata()` - Removes duplicate records (keeps newest)
    - Menu: Glove Manager → Utilities → 🏥 Task Metadata Health Check
    - Menu: Glove Manager → Utilities → 🧹 Remove Duplicate Task Metadata
  - Modified `src/Code.gs` - Added ~500 lines of Phase 7 functions
  - Modified menu structure to include new items
- ✅ **Trip Planner Drag-and-Drop Fixes**
  - **Issue 1:** Could not drag location cards from Unassigned to days or between days
  - **Issue 2:** Not all unassigned locations were showing in the Unassigned Locations panel
  - **Issue 3:** Unassigned locations list was too small to scroll through all items
  - **ROOT CAUSE:** Data structure inconsistency - unassigned cards used `loc.name` while assigned cards used `loc.location`
  - **SOLUTION:**
    1. Standardized `cleanUnassigned` in `suggestOptimalTrips()` to use `location` property (keeping `name` for backward compatibility)
    2. Added minimal `tasks` array to unassigned locations for drag-drop completion data
    3. Fixed `handleUnassignedDragStart()` to ensure `location` property exists
    4. Fixed `handleDrop()` to prefer `location` over `name` when getting location name
    5. Updated `renderUnassigned()` to use standardized `location` property
    6. Increased `.unassigned-list` max-height from 200px to 400px for better scrollability
  - Modified `src/87-RoutePlanner.gs` - `cleanUnassigned` mapping (lines 1649-1667)
  - Modified `src/TripPlanner.html` - `handleUnassignedDragStart()`, `handleDrop()`, `renderUnassigned()`, CSS
  - **Workflow Verified:**
    - Step 1: Generate Task Metadata → populates Task Metadata sheet
    - Step 2: Tasks & Calendar pulls from Task Metadata
    - Step 3: Tasks without dates → Unassigned; Tasks with dates → Calendar + Trip Planner
    - Step 4: Assign dates via Task List OR drag in Trip Planner
    - Step 5: Task List auto-saves; Trip Planner uses Apply button for batch updates
    - Step 6: Completions set CompletedDate → flows to Daily Accomplishments
- ✅ **Crew Import Remembers Previous Selections**
  - **Problem:** When importing weekly crew makeup, duplicate employee selections (employees in multiple crews) were not saved between sessions
  - **Solution:** Added server-side persistence using ScriptProperties
  - **What's saved:**
    - **Location Mappings** - Custom mappings for unknown locations (e.g., "New Location Dock" → "New Location")
    - **Duplicate Selections** - Which crew assignment to use when an employee appears in multiple crews
    - **Special Circumstance Selections** - Employees in Time off/Quit/Other sections (JT = Light Duty, Owen = Light Duty, etc.)
  - **New Functions in `85-DataImport.gs`:**
    - `saveCrewImportLocationMappings(customMappings)` - Saves custom location mappings
    - `getCrewImportLocationMappings()` - Loads saved location mappings
    - `saveCrewImportDuplicateSelections(selections)` - Saves duplicate employee selections
    - `getCrewImportDuplicateSelections()` - Loads saved selections
    - `saveCrewImportSpecialSelections(selections)` - Saves special circumstance selections
    - `getCrewImportSpecialSelections()` - Loads saved special selections
    - `getCrewImportSettings()` - Returns all settings for dialog init
    - `clearCrewImportSettings()` - Clears all saved settings
  - **UI Enhancements:**
    - **Duplicate Employees:** Remembered selections are auto-applied and skipped (not shown in UI)
    - **Special Circumstances:** Remembered selections are auto-applied and skipped
    - Shows green alert: "X employee(s) had remembered settings and were auto-applied: JT Kale (Light Duty), Owen Canavan (Light Duty)"
    - Duplicate employee selection now shows clear **PRIMARY** (green) vs **Secondary** (yellow) labels
    - Selecting a different radio button refreshes UI to update Primary/Secondary labels
  - **Storage Keys:**
    - `CREW_IMPORT_LOCATION_MAPPINGS` - JSON object of custom location mappings
    - `CREW_IMPORT_DUPLICATE_SELECTIONS` - JSON object with employee name → { selectedJobNumber, scheduleType, savedAt }
    - `CREW_IMPORT_SPECIAL_SELECTIONS` - JSON object with employee name → { status, location, skip, savedAt }
  - Modified `src/CrewImport.html` - Added init loading, save functions, auto-apply logic
  - Modified `src/85-DataImport.gs` - Added ~150 lines of persistence functions
- ✅ **Crew Import Cross-References Employee Sheet for Name Matching**
  - **Problem:** Excel cells in "Time off/Quit/Other" sections contain employee names mixed with random info (e.g., "JT Kale , MT Misc, Light Duty")
  - **Solution:** Cross-reference cell text against Employees sheet to find exact name matches
  - **How it works:**
    1. For each cell in special sections, scan for any employee name from Employees sheet
    2. If found (confidence ≥70%), use the exact name from sheet (not parsed text)
    3. If no match and doesn't look like a name, skip the entry
  - **Benefits:**
    - "JT Kale ," → becomes "JT Kale" (exact match from sheet)
    - "Owen Canavan with injury" → becomes "Owen Canavan" (matched)
    - "Next Appointment 9am" → No match → Skipped automatically
  - **New Function:**
    - `findBestMatchInCell(cellText, employees)` - Finds best employee match within cell text
  - Modified `src/CrewImport.html` - Added cross-reference in parseSpecialSection()
- ✅ **Crew Import Injury Detection**
  - Text containing "with injury", "injured", or "injury" now sets status to **Light Duty**
  - Adds "Injury" to notes field
  - Example: "Owen Canavan JL off with injury" → Status: Light Duty, Notes: "Injury"
- ✅ **Crew Import Improved Name Cleanup**
  - Removes trailing commas and punctuation
  - Removes "with" leftover from "with injury"
  - Skips entries containing "Appointment", "Meeting", "Call"
  - Skips time patterns like "9am", "10:30am"
  - Skips text starting with "Next"
- ✅ **Color-Coded Days Left Display with Extended Thresholds**
  - GOAL: Provide better advance warning for upcoming cert expirations
  - Updated color thresholds for "days left" badges in Expiring Certs tab:
    - 🔴 Red: Expired (< 0 days)
    - 🟠 Orange: Less than 185 days (6 months)
    - 🟡 Yellow: Less than 365 days (1 year)
    - 🟢 Green: 365+ days
  - Previously: Red/Orange/Yellow were only for 0-60 day range
  - Benefits: Earlier visibility, better planning window, clear priority hierarchy
  - Modified `src/ToDoSchedule.html` - `renderCertRow()` function (line 4529)
  - See: FIX_CERT_COLOR_THRESHOLDS.md for details
- ✅ **All Certs Now Actionable in Expiring Certs Tab**
  - ROOT CAUSE: Only expired/expiring certs (status !== 'OK') showed SMS and "Add to Task List" buttons
  - SOLUTION: Removed the `status !== 'OK'` condition in `renderCertRow()` function
  - ALL certs now show action buttons regardless of expiration status:
    - 💬 Send SMS Notification (if phone number exists)
    - 📅 Send Class Schedule (after Stage 1 notification, except MEC certs)
    - ➕ Add to Task List
    - ✅ Mark Complete
  - Benefits: Proactive planning, consistent UI, can schedule renewals months in advance
  - Modified `src/ToDoSchedule.html` - line 4633
  - See: FIX_ALL_CERTS_ACTIONABLE.md for details

### February 5, 2026
- ✅ **Quick Actions Sidebar Redesign - Monday Workflow**
  - **Goal:** Create a clear, sequential 6-step workflow for every Monday
  - **New Workflow Steps:**
    1. 📥 **Import Crew Makeup** - Upload weekly crew assignments (was sub-action, now Step 1)
    2. 📊 **Generate All Reports** - Swaps, Purchase Needs, Reclaims
    3. 🛡️ **Process Safety Emails** - JHAs, Meetings, Fleet Checklists (NEW step)
    4. 🎯 **Generate Task Metadata** - Build task database
    5. 📅 **Review & Schedule** - Tasks & Trip Planner
    6. 💾 **Save & Backup** - History + Drive backup (combined from 2 separate steps)
  - **New Sub-Actions:**
    - Step 2: 🧤 Gloves, 💪 Sleeves, 🛒 Purchase
    - Step 3: 📊 Compliance Dashboard
    - Step 5: 📋 Tasks & Calendar, 🗺️ Trip Planner
    - Step 6: 📧 Send Email Report
  - **"As Needed (Monthly/Setup)" Section:**
    - 📜 Manage Certs (moved from weekly workflow - monthly task)
    - 👷 Crew Visit Config
    - 📚 Training Config
    - 📋 Training Tracking
    - 🛡️ Compliance Config (NEW)
  - **"Quick Actions" Section:**
    - 🔍 Item Lookup
    - 📊 Task Dashboard
    - 📝 Accomplishments
  - **New Functions:**
    - `saveAndBackup()` - Combined function for Step 6 (calls saveHistory + createBackupSnapshot)
  - **Modified Files:**
    - `src/QuickActions.html` - Complete redesign with 6-step workflow
    - `src/Code.gs` - Added saveAndBackup() function
  - **New Documentation:**
    - `WEEKLY_WORKFLOW.md` - Step-by-step user guide for Monday workflow
- ✅ **Safety Report Completion Sync**
  - When Safety Equipment tasks are marked complete in Task List, Safety Reports sheet status is automatically updated to "Resolved"
  - `syncSafetyReportCompletion(taskKey)` - Syncs individual task completion to Safety Reports sheet
  - `syncAllCompletedSafetyTasks()` - Bulk sync all completed safety tasks (for fixing mismatches)
  - `refreshSafetySheets()` - Combined function that syncs completed tasks AND recalculates current week's Safety Compliance
  - Modified `markTaskComplete()` in Code.gs to auto-sync Safety Equipment tasks
  - New Menu: Glove Manager → Safety Reports → 🔄 Refresh Safety Sheets
  - Modified `src/88-SafetyReports.gs` - Added ~200 lines of sync functions
  - Modified `src/Code.gs` - Updated markTaskComplete() and added menu item
- ✅ **Smart Email Processing (Only New Emails)**
  - `processSafetyEmails()` now supports `newOnlyMode` parameter (default: true)
  - Stores `LAST_SAFETY_EMAIL_DATE` in ScriptProperties after successful processing
  - On next run, uses Gmail `after:YYYY/MM/DD` filter to only fetch emails since last run
  - Dialog shows "Last processed: [date]" and checkbox "Only process new emails since last run"
  - Unchecking the box uses the day range dropdown instead (for full rescan)
  - Dramatically reduces processing time on subsequent runs
  - Modified `src/88-SafetyReports.gs` - Updated dialog UI and processSafetyEmails function
- ✅ **X# Vehicle Number Format Support**
  - `extractVehicleNumber()` now recognizes "X1", "X2", "X3" format vehicle numbers
  - Returns full format "X1" (not just "1") for clarity
  - Common for spare/extra vehicles in fleet
  - Modified `src/88-SafetyReports.gs` - Updated extractVehicleNumber() function

### February 4, 2026
- ✅ **JHA/Safety Meeting Compliance Tracking System**
  - **Goal:** Track daily JHA submissions and weekly Safety Meeting compliance per crew
  - **Week:** Sunday to Saturday, Deadline: Saturday 11:59 PM
  - **New Sheets Created:**
    - **Safety Compliance** - Historical tracking of each crew's JHA/Weekly Meeting submissions per week
    - **Safety Compliance Config** - Configure which days/crews to skip (Sat/Sun default to N/A)
  - **New Functions in `88-SafetyReports.gs`:**
    - `setupSafetyComplianceSheet()` - Creates compliance tracking sheet
    - `setupSafetyComplianceConfig()` - Creates exclusion config sheet with all active crews
    - `extractReportDateFromSubject(subject, reportType)` - Parses date from JHA/Safety Meeting email subjects
    - `getWeekBoundaries(date)` - Returns Sunday/Saturday boundaries for any date
    - `isReportLate(message, reportDate, isForwarded)` - Detects late submissions (after Saturday 11:59 PM)
    - `loadComplianceConfig()` - Loads exclusion settings
    - `calculateSafetyCompliance(weekStartDate)` - Calculates compliance for all crews for a week
    - `updateComplianceSheet(complianceData)` - Upserts compliance data to sheet
    - `createMissingReportTasks(complianceData)` - Creates Task Metadata entries for missing reports
    - `getCrewComplianceTrend(jobNumber, weeksBack)` - Gets 4-week trend stats for a crew
    - `getAllCrewComplianceTrends(weeksBack)` - Gets trends for all crews (sorted by worst compliance first)
    - `showComplianceDashboard()` - Interactive dashboard with current week + 4-week trends
    - `buildMissingSafetyReportSmsMessage(task)` - Builds SMS message for missing reports
  - **Integration with `processSafetyEmails()`:**
    - After email processing completes, compliance is automatically calculated
    - Safety Compliance sheet updated with ✅/❌/N/A/⏳ status per day per crew
    - If past deadline, missing report tasks created in Task Metadata
    - Dialog shows compliance grid after processing
  - **Missing Report Tasks in Task Metadata:**
    - TaskType: `Missing Safety Report`
    - ItemType: `JHA`, `Weekly Meeting`, or `JHA + Weekly Meeting` (combined if crew missing both)
    - SMS button on Task List with appropriate message:
      - JHA only: "We did not receive a JHA for [dates] from your crew..."
      - Weekly Meeting only: "We did not receive a Weekly Safety Meeting..."
      - Both: Combined message mentioning both missing items
  - **Late Detection Logic:**
    - JHA email received after Saturday 11:59 PM of report's week = LATE (doesn't count)
    - Forwarded emails (subject starts with "Fwd:") = assumed on time (can't detect actual received date)
  - **New Menu Items (Glove Manager → 🛡️ Safety Reports):**
    - "📊 Compliance Dashboard" - Visual grid + 4-week trends
    - "⚙️ Configure Exclusions" - Opens config sheet
    - "📈 Compliance History" - Opens compliance sheet
  - **Modified Files:**
    - `src/88-SafetyReports.gs` - Added ~700 lines of compliance tracking code
    - `src/ToDoSchedule.html` - Added SMS handling for Missing Safety Report tasks
    - `src/Code.gs` - Added 3 menu items under Safety Reports submenu

### February 2, 2026
- ✅ **Fixed Last Day Reason validation (Layoff issue)**
  - ROOT CAUSE: `handleLastDayChange()` was not validating that Last Day Reason was filled in before proceeding
  - SOLUTION: Added validation checks to require Last Day Reason and validate it's one of 4 allowed values
  - Created `fixLastDayReasonValidation()` utility function to fix dropdown validation
  - Added menu item: Glove Manager → 🔧 Utilities → ✅ Fix Last Day Reason Dropdown
  - Standardized all documentation to use "Layoff" (not "Laid Off")
  - Modified `src/51-EmployeeHistory.gs` - Added validation before termination confirmation
  - Created `src/22-EmployeeValidation.gs` - New utility file for employee sheet validation
  - See: FIX_LAYOFF_VALIDATION.md and LAYOFF_USER_GUIDE.md for details
- ✅ **Fixed Trip Planner Breaking After Reset Button**
  - ROOT CAUSE: When `suggestOptimalTrips()` called `getTasksWithMetadata()` from server-side, it received a confirmation object `{stored: true}` instead of actual tasks
  - SOLUTION: Added logic to detect confirmation response and fetch actual data via `getStoredTasks()`, then deserialize compressed task format
  - Modified `87-RoutePlanner.gs` - `collectTasksForTripPlanner()` now handles both client and server-side calls
  - Added deserialization for abbreviated field names (emp→employee, loc→location, type→taskType, etc.)
  - Trip Planner now correctly loads 45 tasks after reset instead of showing "No Pending Tasks"
  - See: FIX_TRIP_PLANNER_RESET.md for detailed breakdown
- ✅ **Fixed Helena Location vs Office Work Distinction**
  - ROOT CAUSE: Trip Planner was treating ALL Helena location tasks as "Office Work / Phone Tasks", including training and swap tasks that require field visits
  - SOLUTION: Removed Helena from non-field locations list - Helena crews need actual field visits for training/swaps
  - **Office Work now includes:** Cert Expiring tasks (phone-only) + employees in Weeds/Light Duty/Vacation/Leave/Previous Employee/Unknown
  - **Helena Field Tasks now include:** Training tasks for Helena crews + Swap tasks for Helena employees
  - Modified `87-RoutePlanner.gs` - Updated `OFFICE_ONLY_LOCATIONS` constant and `collectTasksForTripPlanner()` logic
  - Training tasks for Helena-based crews now correctly appear as draggable location cards in Trip Planner
  - See: FIX_HELENA_OFFICE_DISTINCTION.md for detailed breakdown

### February 1, 2026
- ✅ **Fixed clasp deployment issue**
  - ROOT CAUSE: Not a clasp issue - syntax error in Code.gs at line 7046 (duplicate `*/` comment closer)
  - SOLUTION: Removed duplicate `*/` in updateTaskMetadata() JSDoc comment
  - Updated push.bat to capture stderr (`2>&1`) so syntax errors are visible
  - Added troubleshooting section to copilot-instructions.md
- ✅ **Fixed duplicate .js/.gs file conflict**
  - ROOT CAUSE: src/ folder had both `.js` and `.gs` files with same names (e.g., `00-Constants.js` AND `00-Constants.gs`)
  - SOLUTION: Removed all `.js` files from src/ folder, updated `.clasp.json` to only use `.gs` extension
  - The `.js` files were auto-generated residuals that conflicted with clasp push
  - Command to fix: `Remove-Item src/*.js -Force`
- ✅ **Fixed Schedule dialog returning NULL on second open**
  - ROOT CAUSE: Google Apps Script has ~50KB return limit - `getTasksWithMetadata()` was failing to return data to client
  - SOLUTION: Added fallback in ToDoSchedule.html - when server returns `null`, client automatically calls `getStoredTasks()` to fetch from ScriptProperties
  - Server stores data in ScriptProperties (500KB limit) which is more reliable than direct return
  - This two-step approach bypasses the transfer limit issue
- ✅ **Fixed date showing wrong on dialog reopen**
  - ROOT CAUSE: Date parsing was using local timezone, causing off-by-one-day errors
  - SOLUTION: Parse date strings as UTC to avoid timezone shifts
  - Modified `getTasksWithMetadata()` to use UTC parsing for scheduled dates
  - Dates now correctly persist and display across dialog close/reopen cycles
- ✅ **Fixed time showing wrong on dialog reopen**
  - ROOT CAUSE: Time strings being converted to Date objects then back to time strings caused 2-hour offset
  - SOLUTION: Store and retrieve time as HH:MM strings, never convert to Date objects
  - Server returns times in 24-hour format (13:00), client formats for display
  - Times now correctly persist across dialog close/reopen cycles
- ✅ **Added 12-hour time format display**
  - Time inputs now display in 12-hour format with AM/PM (e.g., "1:30 PM" instead of "13:30")
  - Added `formatTimeFor12Hour()` function to convert 24-hour to 12-hour format
  - Task List and Calendar both now show times in user-friendly format
- ✅ **Phase 4: Migrated localStorage to Task Metadata (IN PROGRESS)**
  - Added `InMyChecklist` column to Task Metadata schema (column Z)
  - Created `toggleTaskChecklist()` function - sets InMyChecklist flag in Task Metadata
  - Created `toggleTaskOffice()` function - sets IsOffice flag in Task Metadata
  - Created `getChecklistTasks()` function - retrieves all tasks where InMyChecklist=TRUE
  - Updated `isTaskNotified()` to check Task Metadata NotifiedDate first
  - Updated `isTaskOffice()` to check Task Metadata IsOffice first
  - Updated `isTaskInChecklist()` to check Task Metadata InMyChecklist first
  - Updated `addToChecklist()` to call server `toggleTaskChecklist()`
  - Updated `toggleNotified()` to call server `recordTaskNotification()`
  - Updated `toggleOffice()` to call server `toggleTaskOffice()`
  - State now persists in Task Metadata sheet instead of localStorage
  - Migration function `migrateTaskMetadataAddChecklistColumn()` available for existing sheets

### January 31, 2026 (Session 2)
- ✅ **Fixed task save operations not persisting**
  - ROOT CAUSE: saveScheduleTaskDateChanges() was using array indices to identify tasks - unreliable when tasks are sorted/filtered
  - SOLUTION: Changed to key-based identification using "SourceSheet_RowIndex" format (e.g., "Glove Swaps_15")
  - Client now sends taskKey in addition to index for reliable server-side updates
  - Server directly updates Task Metadata by key, no longer needs to reload entire task list
  - 10x faster saves, 100% reliable, eliminates race conditions
  - Modified src/Code.gs saveScheduleTaskDateChanges() and src/ToDoSchedule.html update functions
- ✅ **Fixed metadata regeneration losing manual edits**
  - ROOT CAUSE: generateTaskMetadata() was skipping existing tasks to avoid duplicates
  - SOLUTION: Changed to "smart update" logic that preserves user edits (dates/times) while updating source data (locations/phones)
  - Now supports weekly metadata refresh without losing scheduling work
  - PRESERVES: ScheduledDate, StartTime, EndTime, Status, Completion (columns L-X)
  - UPDATES: Employee, Location, PhoneNumber, DueDate from source sheets (columns A-K, Y)
  - Modified src/Code.gs generateTaskMetadata() function (lines 6500-6628)

### January 30, 2026
- ✅ **Fixed Crane Evaluation showing as "Expired" incorrectly**
  - ROOT CAUSE: Crane Evaluation is a NON-EXPIRING cert - the date is when evaluation was PERFORMED, not when it expires
  - Logic: If employee has Crane Cert → they MUST have Crane Evaluation. If no Crane Cert → ignore Crane Evaluation
  - Fixed `getExpiringCertsForConfig()` in Code.gs to show Crane Evaluation as "OK" if date exists
  - Fixed `getExpiringCertsForSchedule()` in Code.gs - same fix
  - Fixed `getCertStatus()` in ToDoSchedule.html - returns "OK" for Crane Evaluation with date, "Missing" if no date
  - Updated display in Expiring Certs tab to show "✓ [date]" for completed Crane Evaluations instead of implying expiration
- ✅ **Fixed "In Checklist" badge not clearing after task completion**
  - ROOT CAUSE: The checklist check wasn't filtering out completed items
  - Now checks `item.completed === true` or `item.status === 'completed'` and excludes those
  - After completing a cert task, the "Add to My Checklist" button appears again
  - Modified ToDoSchedule.html `renderPersonalChecklist()` function
- ✅ **Office Work Card in Trip Planner**
  - Added "🏢 Office Work" card to the unassigned locations panel
  - Shows count of office/phone tasks (cert expiring tasks + Helena location tasks)
  - Click to view all office tasks in a popup with due dates and urgency
  - Popup shows employee names, locations, and due dates
  - "Open My Checklist" button navigates to ToDoSchedule.html for task completion
  - Office tasks collected from: Cert Expiring tasks (handled via phone), Helena/Weeds/Light Duty location tasks
  - Office card has green styling to distinguish from field trip locations
- ✅ **Removed Office Card from Trip Planner**
  - Office work is tracked separately in My Checklist (ToDoSchedule.html)
  - Trip Planner now focuses exclusively on field trips
  - Removed Office card from unassigned locations pool
  - Removed `isOfficeCard` property handling from UI
  - Office functions remain in backend but are no longer called from Trip Planner
  - Use case: My Checklist → Expiring Certs tab handles cert tasks via phone (office work)
- ✅ **Fixed Trip Planner missing function errors**
  - Added `calculateTripSavings()` function - calculates time savings from combining trips
  - Added `calculateManualTaskDuration()` function - calculates task duration from times or defaults
- ✅ **Fixed training tasks not appearing in Trip Planner**
  - ROOT CAUSE: Property mismatch - `collectTasksForTripPlanner()` was reading `sourceTask.taskType` but training tasks use `sourceTask.type`
  - Fixed to read from both: `sourceTask.type || sourceTask.taskType`
  - Also fixed source tracking to use `sourceTask.sheetName || sourceTask.source`
  - Added `trainingCount` logging to track how many training tasks are collected
  - Training tasks (e.g., "Job Briefings/ JHA's/ Emergency Action Plans" for February) now appear correctly

### January 29, 2026
- ✅ **Task Management System Refactoring (3 Phases)**
  - **Phase A: Critical Bug Fixes**
    - Added missing `findBestDayForLocation()` function in 87-RoutePlanner.gs
    - Fixed Trip Planner failing with "No Pending Tasks" due to undefined function
    - Fixed Close button in ToDoSchedule.html - now closes directly instead of trying to open Schedule Hub
    - Fixed Close button in TripPlanner.html - now closes directly
  - **Phase B: Direct Source Reading**
    - Created `collectTasksForTripPlanner()` function that reads directly from source sheets
    - Refactored `getPendingTasksWithLocations()` to use direct source reading
    - Trip Planner no longer depends on To Do List sheet being populated first
    - Eliminates need for "Generate Smart Schedule" before using Trip Planner
    - Tasks are read live from Glove Swaps, Sleeve Swaps, Reclaims, Training, Manual Tasks sheets
  - **Phase C: Simplified UI Navigation**
    - Updated menu to provide direct access: Tasks & Calendar, Trip Planner, Schedule Config
    - Removed Schedule Hub as navigation middleman
    - QuickActions sidebar now calls showToDoSchedule() directly
    - Each dialog closes to spreadsheet (no dialog-to-dialog navigation)
    - Schedule.html kept as legacy fallback but not used in menus
- ✅ **Fixed cert task duplication in My Tasks/Expiring Certs tab**
  - ROOT CAUSE: `renderPersonalChecklist()` was checking for duplicates by serverIndex only, not by employee+certType combo
  - Added proper deduplication in `ToDoSchedule.html` using employee+certType key tracking
  - Also added deduplication in `collectExpiringCertTasks()` as a secondary safeguard
  - Prevents same employee+cert from appearing multiple times in Expiring Certs section
  - Modified `ToDoSchedule.html` renderPersonalChecklist() function
  - Modified `76-SmartScheduling.gs` collectExpiringCertTasks() function
- ✅ **Fixed Trip Planner "getDayName is not defined" error**
  - ROOT CAUSE: Missing `getDayName()` helper function in 87-RoutePlanner.gs
  - Added `DAY_NAMES` array constant and `getDayName(dayOfWeek)` function
  - Trip Planner now properly generates day names for work day cards
  - Modified `87-RoutePlanner.gs` - added function at line 49-58
- ✅ **Trip Planner auto-generates Smart Schedule when To Do List is empty**
  - When Trip Planner detects empty/missing To Do List (lastRow < 14), it automatically runs `generateSmartSchedule()`
  - Shows progress indicator: "Analyzing pending tasks... (Generating schedule if needed)"
  - After 10 seconds updates to: "Generating Smart Schedule and analyzing tasks... This may take a moment."
  - Retries reading tasks after generation
  - Falls back to error message if generation fails or produces no tasks
  - Modified `87-RoutePlanner.gs` getPendingTasksWithLocations() function
  - Modified `TripPlanner.html` loading indicators

### January 28, 2026
- ✅ **Excel Import now skips hidden rows and columns**
  - Fixed ExpiringCertsImport.html to skip hidden rows (old/inactive employees)
  - Fixed CrewImport.html to skip hidden rows and columns
  - Added `isRowHidden(sheet, rowIndex)` helper function - checks `sheet['!rows'][row].hidden`
  - Added `isColHidden(sheet, colIndex)` helper function - checks `sheet['!cols'][col].hidden`
  - Replaced `XLSX.utils.sheet_to_json()` with manual iteration in ExpiringCertsImport
  - Updated `parseSheet()` in CrewImport to filter hidden rows/cols before processing
  - Console logs now show count of hidden rows/cols skipped for debugging
  - Prevents old employees stored in hidden Excel rows from appearing in import preview
  - **Added `cellStyles: true` option** to `XLSX.read()` - required to populate `!rows` and `!cols` metadata
- ✅ **Excel Import now skips header rows**
  - Added header detection in `parseExcelCertDataMultiRow()` function
  - Skips rows where column A contains header keywords: "Name", "Expires", "Job #", "Location", "Issued", etc.
  - Prevents header text from appearing as unmatched employees
  - Logs skipped header rows for debugging

### January 27, 2026
- ✅ **Fixed changeout date not showing for swap tasks**
  - Column header detection was looking for exact match "change out date"
  - Actual header is "Change Out Date Assigned" 
  - Changed to partial match: `header.indexOf('change out date') !== -1`
  - Added debug logging to show detected column index and date values
  - Now correctly reads changeout dates from Glove Swaps / Sleeve Swaps column E
  - Modified `76-SmartScheduling.gs` collectSwapTasks() function
- ✅ **Swap task employee names now bold and green with changeout dates**
  - Employee names for glove/sleeve swap tasks display in bold green text (cert tasks remain blue)
  - Changeout date (from column E of swap sheets) now displays under employee name
  - Format: "Change Out: MM/DD/YYYY" with red text if overdue
  - Provides visual consistency with cert task formatting while distinguishing task types
  - Modified `ToDoSchedule.html` employee name and due date display logic
- ✅ **MEC Expiration certs excluded from "Send Class Schedule" action**
  - MEC (Medical Examiner's Certificate) certs now skip the Stage 2 SMS button
  - They only show Stage 1 "Send notification" button
  - Reason: MEC certs are renewed via DOT physical, not class attendance
  - Modified `ToDoSchedule.html` to check cert category before showing schedule button
- ✅ **Manage Certs button relocated in Quick Actions sidebar**
  - Moved from "As Needed" section to be a sub-action under Step 1 "Generate All Reports"
  - Now appears alongside "Import Crew Makeup" button
  - More logical placement since cert management relates to report generation workflow
- ✅ **Split Tasks Feature** - Divide tasks for the same location across multiple days
  - Click location card with multiple tasks → "✂️ Split Tasks..." button in footer
  - Select which tasks to move to a different day with checkboxes
  - Choose target day from dropdown
  - Tasks are split - location appears on both days with different task subsets
  - Smart merging if location already exists on target day
  - Automatic cleanup if all tasks moved from original day
  - Real-time task count and estimated time updates
  - Right-click context menu as alternative access method
  - Use case: Schedule 3 urgent swaps for Monday, 2 non-urgent swaps for Thursday
- ✅ **Fixed tasks already scheduled for future dates showing in Trip Planner**
  - Tasks with a Scheduled Date in the future are now filtered out of the pending tasks list
  - Urgency calculation now uses actual Due Date (cert expiration/change out date) instead of Scheduled Date
  - This prevents scheduled tasks like Tristin and Logan's CPR on 01/29 from showing as "due today"
- ✅ **Made cert holder names bold in task list**
  - Employee names for cert tasks now display in bold blue text with filled person icon
  - Makes it easier to identify who the cert holder is at a glance
- ✅ **Added due date display for all tasks**
  - Cert tasks show "Expires: MM/DD/YYYY" 
  - Swap tasks show "Due: MM/DD/YYYY" (the change out date)
  - Displayed below employee name in task row
- ✅ **Unified Schedule Dialog** - Combined ToDoSchedule, TripPlanner, and ToDoConfig into one tabbed interface
  - New file: `Schedule.html` with 3 tabs: Tasks, Trip Planner, Config
  - Accessible via: Glove Manager → Schedule & To-Do → 📅 Schedule
  - Also from QuickActions sidebar under Step 2
  - Lazy-loads each tab content for optimal performance
  - Context-aware "Apply" button changes based on active tab
  - Legacy dialogs (ToDoSchedule, ToDoConfig, TripPlanner) still available
- ✅ **Apply Trip to Schedule** - Now updates existing tasks in To-Do List with dates AND times
  - No longer creates duplicate trip summary entries in Manual Tasks
  - Uses arrival times from route calculation for each location
  - Updates both Scheduled Date and Start Time columns
- ✅ **Trip Planner UI improvements**
  - Changed "Start:" to "Start from:" for clarity
  - Changed "End:" to "End at:" for clarity  
  - Overnight checkbox now shows location name: "🏨 Overnight in [Location]"
  - Better flow between End location and Overnight selection
- ✅ **Office Card in Trip Planner & Daily Accomplishments Integration**
  - Added a special "Office" card to the unassigned pool in Trip Planner (green styling, 🏢 icon)
  - Dragging Office to a day opens a dialog to enter office work tasks (with optional start/end times)
  - Office tasks are saved as "Office Work" in the Manual Tasks sheet (Location = Helena)
  - Completed office tasks automatically appear in the Daily Accomplishments report
  - Multiple office tasks can be added per day
  - Prevents duplicate logging of completed tasks
  - Use case: Track administrative work like "Updated inventory records", "Processed purchase orders", "Responded to emails"

### January 25, 2026
- ✅ **Unified Schedule Dialog** - Combined ToDoSchedule, TripPlanner, and ToDoConfig into one tabbed interface
  - New file: `Schedule.html` with 3 tabs: Tasks, Trip Planner, Config
  - Accessible via: Glove Manager → Schedule & To-Do → 📅 Schedule
  - Also from QuickActions sidebar under Step 2
  - Lazy-loads each tab content for optimal performance
  - Context-aware "Apply" button changes based on active tab
  - Legacy dialogs (ToDoSchedule, ToDoConfig, TripPlanner) still available
- ✅ **Apply Trip to Schedule** - Now updates existing tasks in To-Do List with dates AND times
  - No longer creates duplicate trip summary entries in Manual Tasks
  - Uses arrival times from route calculation for each location
  - Updates both Scheduled Date and Start Time columns
- ✅ **Trip Planner UI improvements**
  - Changed "Start:" to "Start from:" for clarity
  - Changed "End:" to "End at:" for clarity  
  - Overnight checkbox now shows location name: "🏨 Overnight in [Location]"
  - Better flow between End location and Overnight selection

### February 16, 2026
- ✅ **Menu Cleanup & Legacy Code Archival**
  - **Streamlined Glove Manager menu** - Reduced from 10+ submenus to 8 organized categories
  - **Quick Actions is now first item** - Primary entry point for daily workflow
  - **New menu structure:**
    - 📱 Quick Actions (primary)
    - 📊 Reports (generate reports)
    - 📅 Scheduling (tasks, trip planner, config)
    - 🛡️ Safety (safety emails, compliance)
    - 🛒 Purchase Orders
    - 📧 Email Reports
    - 📋 History
    - ⚙️ Setup & Admin
    - 🧹 Maintenance
    - 🔧 Advanced (cleanup/debug)
  - **Removed legacy items:**
    - "Generate To-Do List" → redirects to generateTaskMetadata
    - "Clear Completed Tasks" → redirects to archiveOldCompletedTasks
    - "Archive Old To Do List" → one-time migration, done
    - Debug menu → moved to Advanced submenu
  - **Archived legacy files:**
    - `70-ToDoList.gs` - Now contains only stub redirects
    - `10-Menu.gs` - Archived, all code moved to Code.gs
  - **Documentation:** See `docs/MENU_CLEANUP_PLAN.md` for full details

### February 18, 2026
- ✅ **Option C Implementation - Unassigned Tasks & Status Standardization**
  - **Major Changes:**
    1. **Renamed Trip Planner → "Trip Planner / Scheduler"** - Now the primary scheduling interface
    2. **Renamed "Unassigned Locations" → "📋 Unassigned Tasks"** - Shows individual tasks under location headers
    3. **Removed Calendar tab from Task List** - Use Trip Planner / Scheduler for scheduling
    4. **Standardized status values** across entire system
  - **New Standardized Statuses:**
    - `Unassigned` - No scheduled date (replaces "Pending")
    - `Assigned` - Has scheduled date (replaces "Scheduled")
    - `Complete` - Task finished
    - `Overdue` - Past due date, not complete
    - `Deferred` - Intentionally postponed (new)
  - **Unassigned Tasks Sidebar:**
    - Collapsible location headers (📍 Bozeman, 📍 Livingston, etc.)
    - Individual task cards under each location (draggable)
    - Each task shows: icon, employee name, task type, due date, urgency dot
    - Right-click context menu for quick actions
  - **Right-Click Context Menu:**
    - 📅 Schedule Next Week - Assigns to Monday of next week
    - 📅 Schedule in 2 Weeks - Assigns to Monday 2 weeks out
    - ⏸️ Defer Task - Sets status to Deferred (shows badge)
    - ↩️ Remove Deferred Status - Removes deferred status
    - 👁️ View Details - Shows full task info popup
  - **Individual Task Dragging:**
    - Drag single task to calendar day (not entire location)
    - If location exists on day, merges task into it
    - If not, creates new location entry
    - Task removed from unassigned sidebar
  - **Migration Function:**
    - `menuMigrateTaskStatuses()` - Converts old statuses to new format
    - Mapping: Pending→Unassigned, Scheduled→Assigned, Declined→Deferred
    - Menu: Glove Manager → Maintenance → 🔄 Migrate Task Statuses
  - **Files Modified:**
    - `src/TripPlanner.html` - Complete sidebar rewrite, individual task cards, context menu, drag handling
    - `src/ToDoSchedule.html` - Removed Calendar tab, added status CSS, stub renderCalendar()
    - `src/Code.gs` - Status migration function, updated status validation
    - `src/87-RoutePlanner.gs` - Updated default status to 'Unassigned'
  - **Impact:** Trip Planner is now the central scheduling interface, task assignment is more granular
  - **Documentation:** See `docs/OPTION_C_IMPLEMENTATION.md` for full details
- ✅ **Fixed Task Metadata Data Validation Error**
  - **Problem:** Error when saving tasks: "The data you entered in cell O2 violates the data validation rules"
  - **Cause:** Old validation rules (Pending, Scheduled, etc.) still in place on existing Task Metadata sheet
  - **Solution:** Migration function now:
    1. Clears old data validation FIRST (prevents write errors)
    2. Updates all status values using mapping
    3. Re-applies new validation rules
  - **Files Modified:** `src/Code.gs` - Updated `migrateTaskMetadataStatuses()`
- ✅ **Fixed `resolvedCrews is not defined` Error**
  - **Problem:** Safety compliance tracking failed with "ReferenceError: resolvedCrews is not defined"
  - **Location:** `88-SafetyReports.gs` in `calculateSafetyCompliance()` function
  - **Cause:** Variable used but never initialized
  - **Solution:** Added initialization code to load resolved crews from Safety Compliance sheet
  - **Files Modified:** `src/88-SafetyReports.gs` - Added ~30 lines to load resolved crews

### February 17, 2026
- ✅ **Duplicate Function Cleanup - Code.gs Refactoring**
  - **Problem:** Multiple duplicate function definitions across .gs files causing potential conflicts
  - **Solution:** Consolidated duplicates, kept canonical versions in appropriate domain modules
  - **Changes Made:**
    1. **`getActiveCrews()`** - REMOVED from `88-SafetyReports.gs` (lines 2009-2048)
       - Canonical version in `75-Scheduling.gs:264` now used everywhere
       - Uses `isExcludedJobPrefix()` for consistent crew filtering
    2. **`getEmployeePhoneMap()`** - Renamed in `76-SmartScheduling.gs`
       - Renamed to `getEmployeePhoneMapInternal(ss)` to avoid conflict
       - `Code.gs` wrapper calls the canonical version
       - Removed `getEmployeePhoneMapForTasks()` from Code.gs (75 lines)
    3. **`formatDateForDisplay()`** - REMOVED duplicate from `Code.gs:13059`
       - Canonical version at `Code.gs:6514` (Item Lookup section) remains
       - Was duplicate in legacy TO-DO LIST section
    4. **`formatDateForHistory()`** - REMOVED from `Code.gs:12440`
       - Canonical version in `50-History.gs:176` now used
       - Includes `parseDateFlexible()` for robust date parsing
  - **Files Modified:**
    - `src/Code.gs` - Removed ~95 lines of duplicate code
    - `src/76-SmartScheduling.gs` - Renamed function to avoid conflict
    - `src/88-SafetyReports.gs` - Removed duplicate, uses 75-Scheduling version
  - **Impact:** Reduced Code.gs from 15,091 to 14,994 lines (~97 lines removed)
  - **Testing:** Deployed successfully via `.\push.bat`, all 51 files pushed
- ✅ **Fixed Missing Safety Report Tasks Not Auto-Completing on Resolution**
  - **Problem:** When recording resolutions via the Resolution dialog, tasks were marked Complete but would return when "Process Safety Emails" ran again
  - **Root Cause:** Multiple issues in the compliance tracking flow:
    1. `updateComplianceSheet()` was preserving "Resolved" status but overwriting the resolution codes (❌D, ❌F, etc.) with newly calculated ❌ values
    2. `calculateSafetyCompliance()` was recalculating all crews from scratch, not checking for already-resolved crews
  - **Solution:** Three-part fix:
    1. **`calculateSafetyCompliance()`** - Now loads resolved statuses from Safety Compliance sheet at start, skips crews with "Resolved" status entirely (adds them with `status: 'Resolved'` to prevent task creation)
    2. **`updateComplianceSheet()`** - Now fully skips rows with "Resolved" status instead of just preserving the status column (preserves all data including resolution codes)
    3. **`createMissingReportTasks()`** - Already correctly skips crews with status !== 'Missing Reports', now works properly since resolved crews have `status: 'Resolved'`
  - **Files Modified:**
    - `src/88-SafetyReports.gs` - Added ~30 lines to `calculateSafetyCompliance()`, modified `updateComplianceSheet()`
  - **Resolution Workflow Now:**
    1. User clicks "Record Resolution" for Missing Safety Report task
    2. `recordMissingReportResolutions()` updates Safety Compliance cells with codes (❌D, ❌F, etc.) and sets row Status = "Resolved"
    3. Task Metadata entry marked Complete
    4. On next "Process Safety Emails" run:
       - `calculateSafetyCompliance()` sees crew is "Resolved" → skips recalculation
       - `updateComplianceSheet()` sees "Resolved" status → skips row entirely (preserves resolution codes)
       - `createMissingReportTasks()` sees `status: 'Resolved'` → doesn't create new task
    5. Task stays completed, doesn't return
- ✅ **Fixed "Last Processed: Loading..." in Process Safety Emails Dialog**
  - **Problem:** Dialog always showed "Loading..." instead of actual last processed timestamp
  - **Root Cause:** Function `getLastSafetyEmailProcessedTime()` called by dialog didn't exist
  - **Solution:** Added the missing function to `88-SafetyReports.gs`
  - **Files Modified:** `src/88-SafetyReports.gs` - Added ~15 lines

### February 18, 2026 (Session 2)
- ✅ **Process Safety Emails - Job Number Configuration**
  - **Goal:** Allow users to pre-configure job→foreman mappings and handle unknown job numbers during processing
  - **New Features:**
    1. **Job Configuration Section** in Process Safety Emails dialog
       - Collapsible table showing all foremen with their job numbers (up to 3 per row)
       - Pre-populated from Employees sheet (primary + secondary job columns)
       - "+ Add Row" button to add temporary/unexpected job numbers
       - "Custom" badge for user-added rows
       - Custom mappings persist between sessions (ScriptProperties)
    2. **Unknown Jobs Popup** during processing
       - When job number not in configuration or Employees sheet, shows modal
       - Options: Assign to foreman (dropdown) OR skip this report
       - "Apply & Continue" or "Skip All" buttons
       - Temporary assignments only apply to current batch
  - **Secondary Job Number Column Migration:**
    - New `addSecondaryJobNumberColumn()` function in `22-EmployeeValidation.gs`
    - Adds column at END of Employees sheet (safe - no column shifting)
    - Menu: Glove Manager → 🔧 Utilities → 📋 Add Secondary Job Column
    - New Employees sheets now include "Secondary Job Number" in headers
  - **New Functions in `88-SafetyReports.gs`:**
    - `getJobForemanMappingsForDialog()` - Returns foremen with all their job numbers
    - `saveCustomJobForemanMappings()` / `getCustomJobForemanMappings()` - Persist custom mappings
    - `lookupForemanWithCustomMapping()` - Check custom mappings first, then Employees
    - `applyUnknownJobDecisions()` - Handle user's assign/skip decisions
    - `storeUnknownJobsForPrompt()` / `getPendingUnknownJobs()` - Track unknown jobs
  - **Dialog Changes in `ProcessSafetyEmailsDialog.html`:**
    - Added collapsible "📋 Job Number Configuration" section
    - Added "Unknown Jobs Modal" for runtime prompts
    - Dialog size increased from 500x550 to 550x700
    - Custom mappings saved before processing starts
  - **Files Modified:**
    - `src/22-EmployeeValidation.gs` - Added ~100 lines (migration function)
    - `src/Code.gs` - Updated empHeaders array, added menu item
    - `src/88-SafetyReports.gs` - Added ~350 lines (job mapping functions)
    - `src/ProcessSafetyEmailsDialog.html` - Complete redesign with job config
    - `src/85-DataImport.gs` - Added secondary job number support in applyCrewChanges()
    - `src/CrewImport.html` - Captures secondary jobs from duplicate employee selections
  - **Documentation:** `docs/SAFETY_EMAIL_JOB_CONFIG_FEB18.md`
- ✅ **Crew Import - Secondary Job Number Support**
  - When an employee appears in multiple crews during import:
    - Primary job (selected) → saved to "Job Number" column
    - Secondary job (non-selected) → saved to "Secondary Job Number" column
  - Example: Employee works M-Th on 013-26, Fri-Sat on 015-26
    - Job Number: `013-26.1` (primary)
    - Secondary Job Number: `015-26` (secondary)
  - Changes logged to Employee History with "Secondary Job" notation
  - Prerequisite: Run "Add Secondary Job Column" from Utilities menu first
  - **Files Modified:**
    - `src/85-DataImport.gs` - Added secondaryJobNumCol lookup and update logic
    - `src/CrewImport.html` - Builds secondaryJobMap from duplicate employee selections

### February 19, 2026
- ✅ **Fixed Received Date Column Truncation in Safety Reports**
  - **Problem:** Compliance records were written with only 12 columns, but the array has 13 elements (including Received Date at index 12)
  - **Root Cause:** Code used `.setValues(complianceRecords)` with column count of 12, truncating the Received Date column
  - **Impact:** 
    - Received Date column (M) in Safety Reports sheet was always empty
    - Late submission detection failed because received dates weren't stored
    - Uncredited jobs display showed incorrect dates
  - **Solution:** Changed column count from 12 to 13 in both locations:
    - `processSafetyEmails()` line 871
    - `applyJobNumberCorrections()` line 1327
  - **Files Modified:** `src/88-SafetyReports.gs` - 2 lines changed
  - **Documentation:** `docs/PDF_PROCESSING_IMPROVEMENTS_FEB19.md`
- ✅ **Uncredited Jobs Display After Safety Email Processing - ENHANCED**
  - **Goal:** After processing emails, show which job numbers in Gmail were NOT credited to any tracked crew, and allow assigning individual reports to specific crews and missing days
  - **New Features:**
    - After compliance tracking completes, dialog shows "⚠️ Uncredited Job Numbers Found"
    - Each uncredited job shows individual report cards with:
      - Report type (JHA, Safety Meeting) and day name (Mon, Tue, etc.)
      - Report Date (when the work was done)
      - Received Date (when the email was received)
      - Crew dropdown to select target crew
      - Day dropdown showing ONLY missing days for selected crew
      - "Credit" button to assign the report
      - "Remember" checkbox to save as permanent mapping
  - **How Jobs Become Uncredited:**
    - Not a direct tracked crew (e.g., 054-26 not in Employees sheet)
    - No foreman mapping found (neither primary/secondary job, nor custom mapping)
    - Foreman found but has no primary crew tracked
  - **Individual Report Assignment Flow:**
    1. Select target crew from dropdown
    2. System loads that crew's missing days for the report's week
    3. Day dropdown shows options like "JHA - Mon (02/17/2026)" or "Weekly Meeting (week of 02/15/2026)"
    4. Select the appropriate missing day
    5. Click "Credit" to:
       - Update Safety Reports sheet (change job number to target crew)
       - Mark the day as ✅ in Safety Compliance sheet
       - Optionally save a permanent mapping (if "Remember" is checked)
  - **New Backend Functions:**
    - `creditUncreditedReport(assignmentDataJson)` - Credits a report to a specific crew/day
    - `getMissingDaysForCrew(crewJob, weekStart)` - Returns missing days for a crew in a week
    - `getTrackedCrewsForAssignment()` - Returns list of tracked crews for dropdown
    - `resolveToPrimaryCrew()` - Enhanced to track individual reports with full details
  - **Technical Changes:**
    - `calculateSafetyCompliance()` - Tracks uncredited jobs with `reports` array containing full details
    - Each report tracks: reportType, reportDate, receivedDate, dayOfWeek, dayName, emailSubject
    - Dialog shows new individual report cards with crew/day assignment UI
  - **Files Modified:**
    - `src/88-SafetyReports.gs` - ~250 lines for enhanced uncredited tracking and creditUncreditedReport function
    - `src/ProcessSafetyEmailsDialog.html` - ~200 lines for individual report cards UI
  - **Documentation:** `docs/UNCREDITED_JOBS_FEATURE_FEB19.md`
- ✅ **Fixed Task Metadata Data Validation Error**
  - **Problem:** `generateTaskMetadata()` failed with "The data you entered in cell O59 violates the data validation rules"
  - **Cause:** Existing rows had old status values (e.g., "Pending") that failed new validation (Unassigned, Assigned, Complete, Overdue, Deferred)
  - **Solution:** `generateTaskMetadata()` now:
    1. Clears data validation on Status column (O) before writing
    2. Writes all records
    3. Reapplies validation with standardized values
  - **Files Modified:** `src/Code.gs` - ~15 lines added
- ✅ **Late Submission Detection - Now Uses PDF Date Completed**
  - **Problem:** Late submission detection was using the email subject date, but the actual "Date Completed" in the JHA PDF is more accurate (and can differ from subject date)
  - **Example:** Email subject shows "02-17-2026" but PDF contains JHAs for 02/09, 02/10, 02/11 - these should be marked LATE
  - **New Late Detection Rule:** If Date Received week ≠ Date Completed week → LATE
  - **New Features:**
    1. **PDF Date Extraction** - Extracts "Date Completed" from JHA PDF text
    2. **Multiple JHAs Per Email** - Handles PDFs with multiple JHAs (one per page, different dates)
    3. **Independent Late Detection** - Each JHA is independently checked for late submission
  - **PDF Date Extraction Patterns:**
    - `Date Completed: 02/09/2026`
    - `Date Completed 02-09-2026`
    - `Completed: 02/09/26`
    - Various date formats (MM/DD/YYYY, MM-DD-YYYY, MM/DD/YY)
  - **Compliance Record Notes:**
    - Single JHA: "Date from PDF Date Completed field"
    - Multiple JHAs: "Date from PDF (1 of 3 JHAs in email)"
    - Late submission: "LATE SUBMISSION - Received MM/DD/YYYY"
  - **New Functions in `88-SafetyReports.gs`:**
    - `extractDatesCompletedFromJHAPDF(pdfText)` - Extracts all Date Completed values from PDF
    - `parseFlexibleDate(dateStr)` - Parses dates in various formats
  - **Modified:**
    - `parseSafetyEmail()` - Now extracts PDF for JHAs and reads Date Completed
    - Compliance record creation - Now handles multiple JHAs per email
    - `isReportLate()` - Now compares PDF Date Completed vs Received Date
  - **Impact:** More accurate late submission tracking, correct handling of batched JHAs
- ✅ **Auto-Correction of Past Week Compliance Data (Option B)**
  - **Problem:** When a JHA email is received in the **current week** but the PDF contains JHAs with "Date Completed" from a **past week**, the compliance tracking was not correctly crediting the past week
  - **Example:**
    - Email received: 02/17/2026 (week of 02/15)
    - PDF contains JHAs with Date Completed: 02/09, 02/10, 02/11 (week of 02/08) ← PAST WEEK
    - Safety Compliance for week 02/08 still showed ❌ for Mon/Tue/Wed
  - **Solution:** `autoCorrectPastWeekCompliance()` function now runs after compliance records are written
    - Scans newly written compliance records for JHAs
    - For each JHA, checks if report date falls in a **past week** (before current processing week)
    - If past week row exists in Safety Compliance sheet:
      - Finds correct day column (Mon, Tue, etc.) based on report date
      - Updates ❌ or ⏳ cells to ✅ (or ✅L if late submission)
      - Updates crew status to "Complete" if all required reports now received
  - **Where it runs:**
    - After `complianceRecords` are written in `processSafetyEmails()`
    - After `finalCompliance` records are written in `applyJobNumberCorrections()`
  - **Example Flow:**
    - **Before:** Week 02/08: Mon ❌, Tue ❌, Wed ❌, Status: "Missing Reports"
    - **After auto-correction:** Week 02/08: Mon ✅L, Tue ✅L, Wed ✅L, Status: "Complete"
  - **Files Modified:**
    - `src/88-SafetyReports.gs` - Added `autoCorrectPastWeekCompliance()` function (~110 lines)
    - `src/88-SafetyReports.gs` - Added call after compliance record writing in two locations
  - **Documentation:** `docs/UNCREDITED_JOBS_FEATURE_FEB19.md` (updated with Option B section)
- ✅ **Simplified JHA Tracking - Only Date Completed & Date Received**
  - **Problem:** Safety Reports sheet was cluttered with hundreds of "No Issues" compliance tracking rows
  - **Solution:** JHA/Safety Meeting compliance tracking now ONLY goes to Safety Compliance sheet - NOT Safety Reports
  - **New Architecture:**
    - **Safety Compliance sheet** - ✅/❌ grid per crew per day (JHA tracking)
    - **Safety Reports sheet** - ONLY actual equipment issues (fire extinguishers, hot sticks, etc.)
  - **Changes Made:**
    1. **Stopped writing JHA "No Issues" records to Safety Reports**
       - Modified `processSafetyEmails()` to NOT write compliance records to Safety Reports
       - Modified `applyJobNumberCorrections()` same fix
       - Compliance records still processed for auto-correction, just not stored in Safety Reports
    2. **Added cleanup function** `cleanupSafetyReportsSheet()` to remove existing "No Issues" rows
       - Menu: Glove Manager → 🛡️ Safety Reports → 🧹 Cleanup Safety Reports
       - Removes all rows where Equipment Type = "No Issues"
  - **Files Modified:**
    - `src/88-SafetyReports.gs` - Added cleanupSafetyReportsSheet(), modified compliance record writing
    - `src/Code.gs` - Added menu item
  - **Documentation:** `docs/PDF_PROCESSING_IMPROVEMENTS_FEB19.md` (updated with cleanup section)

### February 24, 2026
- ✅ **MAJOR REFACTOR: Option B - Raw Data Logging Sheets for Safety Compliance**
  - **Problem:** Crews were not getting credited for JHAs and Safety Meetings despite emails being present in Gmail. Complex inline processing with multiple failure points and no audit trail.
  - **Solution:** Implemented Option B - Raw Data Logging approach with three audit trail sheets
  - **New Sheets Created:**
    1. **JHA Log** - Logs every JHA email with Date Received, Date Created, Job Number, Foreman, Status, Credited To
    2. **Weekly Safety Log** - Logs every Safety Meeting email
    3. **Monthly Checklist Log** - Logs every Fleet Checklist email
  - **Key Benefits:**
    - Complete audit trail - every email is logged even if job is unknown
    - Reliable compliance calculation from logged data
    - Easy debugging - can see exactly why a report wasn't credited
    - Manual fixes possible by editing Credited To column
  - **New Functions:**
    - `setupJHALogSheet()`, `setupWeeklySafetyLogSheet()`, `setupMonthlyChecklistLogSheet()` - Create log sheets
    - `setupAllSafetyLogSheets()` - Menu function to create all 3 sheets
    - `logJHAEmail()`, `logWeeklySafetyEmail()`, `logMonthlyChecklistEmail()` - Log to appropriate sheet
    - `logParsedSafetyEmail()` - Central function that routes parsed emails to correct log sheet
    - `calculateComplianceFromLogs()` - Calculates compliance by reading log sheets (replaces old method)
    - `updateComplianceSheetFromLogs()` - Updates Safety Compliance from calculated data
    - `recalculateComplianceFromLogs()` - Menu function to recalculate compliance from logs
    - `cleanupOldLogEntries()` - Auto-cleans entries older than 90 days
    - `emailExistsInLog()` - Deduplication check
  - **New Menu Items (Glove Manager → 🛡️ Safety):**
    - 📋 Setup Log Sheets - Creates all 3 log sheets
    - 📄 View JHA Log - Opens JHA Log sheet
    - 📄 View Weekly Safety Log - Opens Weekly Safety Log sheet  
    - 📄 View Monthly Checklist Log - Opens Monthly Checklist Log sheet
    - 🔄 Recalculate Compliance - Recalculates compliance from log data
  - **Modified `processSafetyEmails()`:**
    - Now builds job resolution context at start (tracked crews, custom mappings, employee data)
    - Auto-cleans old log entries (>90 days) on first batch
    - Calls `logParsedSafetyEmail()` for each email processed
    - At completion, calls `calculateComplianceFromLogs()` instead of old `calculateSafetyCompliance()`
    - Returns `logsCreated: { jha, weekly, monthly }` in result
  - **Files Modified:**
    - `src/88-SafetyReports.gs` - Added ~900 lines (Option B functions)
    - `src/Code.gs` - Added 5 new menu items
  - **Documentation:** `docs/OPTION_B_IMPLEMENTATION_PLAN.md`
  - **Impact:** Safety compliance tracking now has complete audit trail and reliable calculation
- ✅ **MAJOR REFACTOR: Safety Compliance Direct Tracking from Gmail**
  - **Problem:** JHA/Safety Meeting records were no longer being written to "Safety Reports" sheet, so `calculateSafetyCompliance()` couldn't find them - crews weren't getting credited for submitted reports
  - **Solution:** Direct compliance tracking from parsed email data to Safety Compliance sheet
  - **Key Changes:**
    1. **Renamed "Safety Reports" → "Safety Equipment Needs"**
       - Sheet now only contains actual equipment issues (fire extinguishers, hot sticks, etc.)
       - JHA/Meeting compliance lives in Safety Compliance sheet
       - New `migrateSafetyReportsToEquipmentNeeds()` function for one-click migration
       - `getSafetyEquipmentSheet()` helper checks both old and new names for compatibility
    2. **New Direct Compliance Update Function**
       - `updateComplianceFromParsedRecords(complianceRecords)` - Updates Safety Compliance sheet directly during email processing
       - Called BEFORE `calculateSafetyCompliance()` so data is available
       - Updates specific ✅/✅L cells as emails are parsed
       - Creates new rows for new crews/weeks as needed
    3. **Unified Job Resolution**
       - `resolveJobToCrew(jobNumber, context)` - Single function for all job→crew resolution
       - Checks: direct match → custom mappings → Employees sheet (primary + secondary)
       - Returns detailed result with source and reason for debugging
    4. **calculateSafetyCompliance() Refactored**
       - Now loads existing JHA/Meeting data from Safety Compliance sheet itself
       - No longer depends on Safety Reports/Equipment Needs for JHA/Meeting data
       - Only scans Safety Equipment Needs for Monthly Checklist (Fleet Checklists)
    5. **Real-time State Building**
       - `buildComplianceStateFromEmails()` - Builds compliance state from parsed emails
       - `mergeAndUpdateComplianceSheet()` - Merges new state with existing data
  - **New Functions:**
    - `getSafetyEquipmentSheet()` - Gets sheet (checks both old/new names)
    - `migrateSafetyReportsToEquipmentNeeds()` - Migration function
    - `resolveJobToCrew()` - Unified job resolution
    - `updateComplianceFromParsedRecords()` - Direct compliance update
    - `buildComplianceStateFromEmails()` - Build state from parsed data
    - `mergeAndUpdateComplianceSheet()` - Merge and update compliance
  - **Menu Changes:**
    - Renamed "🛡️ Safety Reports" → "🛡️ Safety"
    - Changed "📊 View Safety Reports" → "📊 View Equipment Needs"
    - Added "🔄 Migrate Safety Reports Sheet" menu item
    - Added "🧹 Cleanup Equipment Sheet" menu item
  - **Files Modified:**
    - `src/88-SafetyReports.gs` - Major refactor (~500 lines added/changed)
    - `src/Code.gs` - Updated menu items
  - **Documentation:** `docs/SAFETY_COMPLIANCE_REFACTOR_PLAN.md`
  - **Impact:** JHAs from Gmail now immediately appear as ✅ in Safety Compliance sheet
- ✅ **Crew Import Duplicate Fixes (from earlier today)**
  - Fixed duplicate API calls when same employee appears in multiple special sections
  - Added name parsing improvements for "wk X-XX" and "??" patterns
  - See `docs/CREW_IMPORT_FIX_FEB24.md` for details
- ✅ **Fixed Invalid Crew Numbers in Tracked Crews List**
  - **Problem:** Invalid job numbers like "N/A", "000", "000-26" were appearing in tracked crews list, causing issues with compliance tracking and diagnostics
  - **Root Cause:** `extractCrewNumber()` function didn't validate job number format - it just split on `.` and returned whatever was before it
  - **Solution:** Added format validation to `extractCrewNumber()`:
    - Must match pattern `NNN-YY` (3 digits, dash, 2 digits)
    - Excludes placeholder jobs like `000-XX`
    - Returns empty string for invalid formats (skips them)
  - **Files Modified:**
    - `src/75-Scheduling.gs` - Updated `extractCrewNumber()` function with regex validation
  - **Impact:** Tracked crews list now only shows valid crew numbers
- ✅ **Fixed Diagnostic Function to Show Foreman Names**
  - **Problem:** `diagnoseSafetyCompliance()` showed "Foreman=NOT FOUND" for all crews
  - **Root Cause:** The diagnostic function had its own inline code to read crews from Employees sheet, which didn't use the `getCrewLead()` function that properly looks up foremen by classification
  - **Solution:** Refactored diagnostic section 4 to use shared functions:
    - Now calls `getActiveCrews()` (which validates job number format)
    - Now calls `getCrewLead()` (which uses classification hierarchy to find foreman)
    - Now calls `getCrewSize()` (which correctly counts active employees)
  - **Files Modified:**
    - `src/88-SafetyReports.gs` - Updated `diagnoseSafetyCompliance()` section 4
  - **Impact:** Diagnostic now correctly shows foreman names and crew sizes
- ✅ **Fixed Duplicate Variable Declaration**
  - Fixed duplicate `var secondaryJobCol = -1;` line in `getActiveCrews()` function
  - **Files Modified:** `src/75-Scheduling.gs`

### February 26, 2026
- ✅ **Safety Compliance Tooltips/Cell Notes**
  - **Goal:** Add hover tooltips to Safety Compliance sheet showing detailed date info for each JHA day, Weekly Meeting, and Monthly Checklist
  - **What Was Added:**
    - `buildComplianceCellNote()` - Creates formatted tooltip text with day name, date, created date, received date, and icon legend
    - Enhanced `calculateComplianceFromLogs()` to track `jhaDetails`, `weeklyMeetingDetails`, `monthlyChecklistDetails` from log sheets
    - `updateComplianceSheetFromLogs()` now sets cell notes via `setNote()` for columns D-L
    - `showComplianceDashboard()` now includes `title` attributes (HTML tooltips) on table cells
  - **Tooltip Format:**
    ```
    📅 Monday, Feb 17, 2026
    ✏️ Created: 02/17/2026
    📥 Received: 02/17/2026 3:45 PM
    
    Icon Legend:
    ✅ = Received on time
    ✅L = Received late (after deadline)
    ❌ = Missing/not received
    ⏳ = Pending (week not over)
    N/A = Skipped (per config)
    ```
  - **Files Modified:** `src/88-SafetyReports.gs` - ~300 lines added
  - **Documentation:** `docs/SAFETY_COMPLIANCE_TOOLTIPS_FEB26.md`
- ✅ **Fixed Monthly Checklist Icon (✓02/06 → ✅)**
  - **Problem:** Monthly Checklist was showing `✓02/06` format instead of standard `✅` icon
  - **Solution:** Updated `getMonthlyChecklistStatus()` to return `✅` for all weeks after receipt in the same month
  - The received date is now shown in the tooltip instead of the cell text
  - **Files Modified:** `src/88-SafetyReports.gs`
- ✅ **Monthly Checklist Carry-Over Across Weeks**
  - **Problem:** Monthly Checklist received on 02/06 only showed for week of 02/01, not subsequent weeks in February
  - **Solution:** `calculateComplianceFromLogs()` now finds the newest checklist received in the same month and shows ✅ for all weeks
  - **Files Modified:** `src/88-SafetyReports.gs`
- ✅ **Safety Compliance Config - Current Week Only**
  - **Problem:** Changing skip day checkboxes in Safety Compliance Config would affect past weeks, potentially corrupting historical data
  - **Solution:** Config changes now only affect the current week
    - Added `isCurrentWeek` flag in `calculateComplianceFromLogs()`
    - Past weeks retain their original N/A vs ⏳/❌ values
  - **Files Modified:** `src/88-SafetyReports.gs`
- ✅ **Added Monthly Column to Compliance Dashboard**
  - **Problem:** Compliance Dashboard was missing Monthly Checklist column
  - **Solution:** Added Monthly Checklist column (L) to the dashboard table with appropriate tooltips and coloring
  - Added legend row at bottom of dashboard
  - Increased dialog size to 800x600
  - **Files Modified:** `src/88-SafetyReports.gs`
- ✅ **Fixed Safety Compliance Week Matching Bug**
  - **Problem:** Weekly Safety Meeting reports were being credited to the wrong week. Example: Chandler Reel's meeting for "Week of 02-09-2026" was being credited to week of 02/15/2026 instead of 02/08/2026
  - **Root Cause:** The week matching logic used `daysDiff <= 6` which allowed a report from week of 02/09 to match compliance week of 02/15 (exactly 6 days apart)
  - **Solution:** Changed to proper boundary check: `if (meetingWeekDate < weekBounds.weekStart || meetingWeekDate > weekBounds.weekEnd) continue;`
  - **Week Logic:**
    - Compliance week: Sunday to Saturday (e.g., 02/08/2026 - 02/14/2026)
    - Email subject: "Week of 02-09-2026" (Monday, since crews get report Monday morning)
    - Credit rule: If "Week of" date falls within compliance week boundaries, credit it
  - **New Function:** `recalculateAllComplianceFromLogs()` - Recalculates ALL weeks in compliance sheet from log data
  - **New Menu Item:** Glove Manager → 🛡️ Safety → 🔄 Recalculate ALL Weeks
  - **Files Modified:**
    - `src/88-SafetyReports.gs` - Fixed week matching logic, added recalculate all function
    - `src/Code.gs` - Added menu item
  - **Documentation:** `docs/FIX_SAFETY_COMPLIANCE_WEEK_MATCHING_FEB26.md`


