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
- `ToDoSchedule.html` - Tasks & Calendar dialog (main scheduling interface)
- `ToDoConfig.html` - Schedule Configuration dialog
- `TripPlanner.html` - Trip Planner dialog (route planning)
- `Schedule.html` - Legacy unified dialog (no longer used in menus)

## Conventions
- Use `Logger.log()` for debugging in Google Apps Script
- Task types include: Swap, Reclaim, Training, Cert Expiring
- Item types are: Glove, Sleeve

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

### February 9, 2026
- ✅ **Compliance Config Save Fix - Auto-Recalculate Current Week**
  - **Problem:** When saving Compliance Config (e.g., unchecking Monday for crew 039-26), changes saved to config sheet but Safety Compliance sheet was not updated
  - **Solution:** `saveComplianceConfigData()` now automatically recalculates current week's compliance after saving
  - **Behavior:**
    - When you uncheck a day (e.g., Monday), it immediately shows N/A in Safety Compliance sheet for current week only
    - Past weeks remain unchanged (preserves historical data)
    - Success message: "Configuration saved & current week updated!"
  - **Technical Changes:**
    - Added auto-recalculation in `saveComplianceConfigData()` function
    - Calls `calculateSafetyCompliance()` + `updateComplianceSheet()` for current week
    - Wrapped in try-catch to ensure config save succeeds even if recalculation fails
  - **Files Modified:**
    - `src/88-SafetyReports.gs` - Added recalculation logic, fixed syntax error (removed stray `?)` on line 1811)
    - `src/ComplianceConfig.html` - Updated success message
  - See: `FIX_COMPLIANCE_CONFIG_SAVE.md` for detailed documentation

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
  - Modified ToDoSchedule.html `renderExpiringCerts()` function
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

### January 26, 2026
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

### January 22, 2026
- ✅ Added Harassment Training to default cert types (now shows with SMS notification)
- ✅ ExpiringCertsImport.html now supports file upload (like CrewImport.html)
  - Drag & drop or click to select Excel file
  - Sheet tab selection for multi-sheet workbooks
  - Can still use paste method as alternative
  - Consistent workflow with Crew Import
- ✅ Fixed Previous Employees showing in To Do Config cert status
  - Now only shows employees currently on Employees sheet (not "Previous Employee" location)
- ✅ Monthly Training tasks now show "Monthly Training: [Topic]" prefix
  - Distinguishes from cert expiration tasks
- ✅ Training tasks now assign to first crew employee when no foreman is listed
  - Looks up employees by job number to find crew members
  - Falls back to first employee found for that crew
  - Skips crew if no foreman AND no employees found
- ✅ **Crew Import Special Circumstances** - Handle Layoff, Resigned, Light Duty, Vacation, etc.
  - Detects "Time off/Quit/Other" sections in Excel
  - Parses messy text (e.g., "Jorden Cumer 3 apMon 1-12") into name, classification, status, date
  - Fully editable form: Name, Location, Classification, Status, Date picker, Job Number, Notes
  - Auto-assigns Light Duty job number (005-26.#) to next available position
  - Special locations: Previous Employee, Vacation, Light Duty, Leave
  - Logs all changes to Employee History
- ✅ **Add New Employee from Import** - Unmatched employees can be added as new hires directly
- ✅ **Monthly Training Exclusions** - Employees with job numbers starting with 002 or 005 are excluded
  - 002-xx = Safety Manager (you)
  - 005-xx = Light Duty employees
- ✅ **Fiscal Year Configuration** - Manage job number transitions between fiscal years
  - Menu: Glove Manager → Utilities → Fiscal Year Config
  - Set current/new fiscal year suffix (e.g., "26" → "27")
  - Select which crews should transition vs. stay on current FY
  - Preview shows all crews with employee counts
  - Apply transition updates all employee job numbers
  - Also updates Training Tracking sheet
  - Logs all changes to Employee History as FISCAL_YEAR_TRANSITION

### January 21, 2026
- ✅ Double Metaphone phonetic matching for Excel import
- ✅ NAME_CORRECTED and NEW_EMPLOYEE_IMPORT event types
- ✅ Enhanced fuzzy name matching (Levenshtein + Metaphone)
- ✅ Confirmation dialogs for all Employees/History changes
- ✅ logNameCorrection() and logNewEmployeeFromImport() functions
