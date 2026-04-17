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
- **Work Schedule Options:** Configurable via dropdown in Trip Planner header
  - **Mon-Thu (default):** Monday-Thursday work days, Tuesday must return to Helena
  - **Tue-Fri:** Tuesday-Friday work days, Friday must return to Helena
- **Must return day:** Varies by schedule - no overnight allowed
- **Other days:** Overnight OK if saves significant time
- **Avoid day:** Friday (Mon-Thu schedule only)
- **Preferences:** No overnight > Overnight, Shorter days > Longer days

**Work Schedule Configuration (NEW - March 16, 2026):**
- **Dropdown selector** in Trip Planner header: "📅 Work Schedule: [Mon–Thu / Tue–Fri]"
- **Persisted in ScriptProperties** - Setting saved via `setWorkSchedule()`, retrieved via `getWorkSchedule()`
- **Regenerates plan on change** - Changing schedule clears saved plan and regenerates
- **Schedule-aware rules:**
  - `Mon-Thu`: Mon/Tue/Wed/Thu work days, Tuesday must return, Friday avoided
  - `Tue-Fri`: Tue/Wed/Thu/Fri work days, Friday must return, no avoid day
- **Dynamic day highlighting:** "Must Return" badge shows on the designated return day
- **Functions:**
  - `getWorkSchedule()` - Returns current setting ('Mon-Thu' or 'Tue-Fri')
  - `setWorkSchedule(schedule)` - Saves new schedule setting
  - `getScheduleConfig(schedule)` - Returns workDays, skipDays, mustReturnDay, avoidDay

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
- `VendorConfig.html` - Vendor catalog management (unified item list)

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

**Vendors Sheet Structure (8-column combined format):**
| Vendor Name | Contact Name | Email | Phone | Notes | Item | Item Number | Price |
- Each row = one catalog item for a vendor (vendor info repeated per row)
- All items (gloves, sleeves, custom) stored uniformly in `customItems` array

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

### April 17, 2026
- ✅ **Fixed New Item Dialog Not Appearing When Adding Inventory**
  - **Problem:** Entering a new glove number on the Gloves sheet did not show the New Item dialog popup
  - **Root Cause:** `handleDuplicateItemNumber()` and `checkDuplicateItemNumber()` were accidentally removed from `61-InventoryReports.gs` during the April 17 ESL ID cleanup (~894 lines removed). The `onEditHandler` trigger called `handleDuplicateItemNumber` which threw `ReferenceError: handleDuplicateItemNumber is not defined`, aborting before `promptNewItemSource()` could run.
  - **Solution:** Restored both functions to `61-InventoryReports.gs`
  - **Files Modified:** `src/61-InventoryReports.gs`

- ✅ **Fixed Timezone Date Shifting Project-Wide (Off-By-One Day)**
  - **Problem:** Dates entered via HTML date inputs (YYYY-MM-DD) were saved one day earlier than expected (e.g., entering 04/13/2026 saved as 04/12/2026)
  - **Root Cause:** `new Date(year, month, day)` creates dates at midnight. Google Apps Script runs server-side (UTC), but the spreadsheet renders in US Mountain Time (UTC-6/7). Midnight UTC = 6 PM previous day in Mountain Time → date displays one day earlier.
  - **Solution:** Added `parseDateNoon(dateStr)` utility in `01-Utilities.gs` that creates dates at noon instead of midnight, preventing timezone shift. Updated 10 date parsing locations across 4 files.
  - **Files Modified:**
    - `src/01-Utilities.gs` — Added `parseDateNoon()` function
    - `src/61-InventoryReports.gs` — 4 fixes (HV Tester/Phasing Set calibration, AED pad expiration, Gloves/Sleeves test date)
    - `src/85-DataImport.gs` — 3 fixes (activation date, completion date, start date)
    - `src/Code.gs` — 3 fixes (week date parsing x2, hire date comparison)
  - **Impact:** All dates from HTML dialogs now save correctly in all US timezones

### April 13, 2026
- ✅ **Fixed Crew Import Crash After Auto-Apply Special Circumstances**
  - **Problem:** `filterSpecialCircumstancesAlreadyMatched()` crashed with `TypeError: Cannot read properties of null (reading 'name')` on second pass (after new hires check)
  - **Root Cause:** `removeSpecialCard()` sets `specialCircumstances[specIndex] = null` (not splice) when auto-applying saved selections. On the second call to `filterSpecialCircumstancesAlreadyMatched()`, the loop hit null entries and crashed trying to access `.name`.
  - **Solution:** Added null guards (`if (!spec) continue;`) in all loops that iterate `specialCircumstances` array:
    - `filterSpecialCircumstancesAlreadyMatched()` main loop
    - `showSpecialSection()` auto-apply saved selections loop
    - `showSpecialSection()` card rendering loop
    - `applyAutoSelections()` auto-apply loop
    - Special circumstance deduplication loop in `parseCrewCards()`
  - **Files Modified:** `src/CrewImport.html` — 5 null guards added
  - **Impact:** Crew Import no longer crashes when auto-applied special circumstances are followed by new hire detection

### April 10, 2026
- ✅ **Purchase Needs Simplification - 3-Tier Priority System with Class Grouping**
  - **Goal:** Replace the complex 5-table swap-status-based Purchase Needs report with a simpler 3-tier priority system
  - **New Priority Tiers:**
    1. **🔴 HIGH PRIORITY - LOW SHELF STOCK** — Less than 2 of any size/class on shelf in Gloves or Sleeves inventory. Also checks Employees sheet for needed sizes that might not exist in inventory.
    2. **🟠 MEDIUM PRIORITY - SWAP SHORTAGES** — Items on Glove Swaps, Sleeve Swaps, or Reclaims sheets where the pick list status is "Need to Purchase" (no availability) or "Size Up" (only half-size-up available).
    3. **🟢 LOW PRIORITY - CONSIDER ORDERING** — Currently assigned (In Service) gloves or sleeves where the item size is larger than the employee's preferred size. Flags the preferred size as needed.
  - **Class Grouping (visual distinction):**
    - Each priority table has class sub-headers with distinct colors:
      - ⚡ **Class 0** — Blue sub-header (`#e3f2fd`) + light blue row banding (`#f5f9ff`)
      - ⚡⚡ **Class 2** — Orange sub-header (`#fff3e0`) + light orange row banding (`#fffaf3`)
      - ⚡⚡⚡ **Class 3** — Red/pink sub-header (`#fce4ec`) + light pink row banding (`#fdf2f4`)
    - Items sorted by Class → Item Type → Size within each table
  - **Deduplication:** Low priority items that already appear in Medium priority (same size+class+type) are automatically removed
  - **Columns:** Priority, Item Type, Size, Class, On Shelf, Qty to Order, Reason, Status, In Testing, Notes
  - **In Testing column:** Shows count of items currently "In Testing" for that size/class and the soonest expected return date (Date Assigned + 3 weeks). Flags overdue items.
  - **Summary By Priority table:** Includes description column explaining each tier (e.g., "Less than 2 on shelf", "Swap needed, none or only size-up available", "Currently assigned a size up")
  - **New functions:** `buildInTestingMap()` scans Gloves/Sleeves for In Testing items, `formatInTestingInfo()` formats count + return date
  - **PO Dialog compatibility:** `getItemsToOrder()` in `62-PurchaseOrders.gs` updated to parse the new section headers (`HIGH PRIORITY`, `MEDIUM PRIORITY`, `LOW PRIORITY`) and skip class sub-header rows
  - **Email Reports compatibility:** `buildPurchaseNeedsSection()` in `80-EmailReports.gs` updated to use new `NEED TO ORDER` / `CONSIDER ORDERING` status values
  - **Files Modified:**
    - `src/60-PurchaseNeeds.gs` — Complete rewrite (~710 lines). New functions: `collectHighPriorityItems()`, `collectMediumPriorityItems()`, `processSwapTabForMedium()`, `processReclaimsForMedium()`, `collectLowPriorityItems()`, `capitalizeSleeveSize()`
    - `src/62-PurchaseOrders.gs` — Updated `getItemsToOrder()` section matching for new header names
    - `src/80-EmailReports.gs` — Updated status detection in email report builder
    - `src/PurchaseOrderDialog.html` — Updated category display for new priority tier names

- ✅ **Vendor Catalog Simplification - Remove Legacy Glove/Sleeve Pricing Fields**
  - **Goal:** Remove the old hard-coded glove/sleeve pricing fields (`class0GlovePrice`, `class2GloveItemNum`, etc.) and use the unified `customItems` catalog for everything
  - **What changed:**
    1. **`getVendors()`** - Removed `KNOWN_MAP` that mapped glove/sleeve items to legacy fields. All items now flow into `customItems` array uniformly.
    2. **`saveVendors()`** - Removed `KNOWN_ITEMS` array that wrote legacy glove/sleeve items separately. All items written from `customItems`.
    3. **`findCatalogMatch()`** (new, PO Dialog) - Smart catalog matching that finds vendor items by class, type, and size. Two-pass search: exact match (class+type+size) then class+type-only for one-size-fits-all items.
    4. **Catalog item numbers shown on PO** - Purchase Needs items now display matched vendor item numbers (`#RB-100`) inline and in PO text output.
    5. **VendorConfig.html** - Removed old 2-column glove/sleeve pricing grid, now catalog-only view with taller dialog (900px).
    6. **CSS fix** - Fixed `sh` typo prefix on `.add-item-bar` CSS rule in PurchaseOrderDialog.html.
  - **Files Modified:**
    - `src/62-PurchaseOrders.gs` — Removed ~60 lines of legacy pricing fields, dialog height 650→900
    - `src/PurchaseOrderDialog.html` — Added `findCatalogMatch()` (~80 lines), catalog item number display, fixed CSS
    - `src/VendorConfig.html` — Removed legacy pricing grid (~50 lines), updated labels to "catalog"

### March 26, 2026
- ✅ **Job Name Column - Backfill Utility & Auto-Fill During Crew Import**
  - **Goal:** Populate empty Job Name values in Job Tracking sheet (col Z) for existing jobs
  - **What was built:**
    1. **`backfillJobNames()` utility** - One-click backfill using reverse location mapping
       - Bozeman → "Belgrade Dock", Lolo → "Lolo Sub Dock", etc.
       - Skips completed jobs, shows results summary
       - Also reads custom location mappings from ScriptProperties
       - Menu: Glove Manager → 📥 Import Crew Makeup → 🔧 Utilities → 📝 Backfill Job Names
    2. **`backfillJobNamesFromImport()` auto-fill** - During Crew Import
       - Client sends `jobNameMap` (job# → Excel header text) with change data
       - `syncJobTrackingAfterImport()` calls backfill for existing jobs with empty Job Name
       - Result message shows "X Job Name(s) backfilled"
  - **Files Modified:**
    - `src/85-DataImport.gs` - Added `backfillJobNames()` (~120 lines), `backfillJobNamesFromImport()` (~40 lines), updated `applyCrewChanges()` and `syncJobTrackingAfterImport()`
    - `src/CrewImport.html` - Builds `jobNameMap` from `parsedCrews` and sends with changes
    - `src/Code.gs` - Added menu item

- ✅ **Light Duty Location Normalization (Forward-Only, Backwards Compatible)**
  - **Goal:** Light Duty is a STATUS, not a location. New Light Duty employees should get Location = "Helena" (actual city) with 005-26 job prefix handling exclusion.
  - **Problem:** The `Location` column on Employees sheet serves double duty: physical city (for drive times, change-out dates) AND employee status (Light Duty, Weeds, Vacation). This breaks when multiple crew types exist in the same city (e.g., Helena has office, dock, and bid job crews).
  - **Solution (forward-only):**
    1. **Crew Import** - When setting someone as "Light Duty", system now writes `Location = "Helena"` + `Job Number = 005-26.#`
    2. **All filter/skip lists** - Still include "Light Duty" for backwards compatibility with existing data
    3. **Dropdown** - Shows "Light Duty (→ Helena, 005-26)" to indicate the mapping
    4. **Special location cards** - Also detect 005- job prefix as Light Duty (since new ones have Location = Helena)
    5. **Job Tracking differentiation** - Use Job Name (col Z) to distinguish crews in same city:
       - 005-26: Job Name = "Office/Management", Location = "Helena"
       - Dock crews: Job Name = "Helena Dock A", Location = "Helena"
       - Bid jobs: Job Name = "Montana Ave Rebuild", Location = "Helena"
  - **What did NOT change (backwards compatible):**
    - Existing employees with `Location = "Light Duty"` still filtered correctly everywhere
    - "Weeds", "Vacation", "Leave" completely untouched
    - Change-out dates unaffected (Helena = 3 months, same as before)
    - Trip Planner, Training, Safety Compliance exclusions all work via both old Location value AND 005- prefix
  - **Future plan:** Add proper "Employee Status" column to fully separate location from condition (Light Duty, Weeds, Vacation, Leave). Needs planning session.
  - **Files Modified:**
    - `src/85-DataImport.gs` - `applySpecialCircumstanceUpdate()` converts Light Duty → Helena
    - `src/87-RoutePlanner.gs` - Updated OFFICE_ONLY_LOCATIONS comments (kept Light Duty for compat)
    - `src/Code.gs` - Updated comments on skip lists (kept Light Duty for compat)
    - `src/CrewImport.html` - Updated dropdown label, statusToLocationMap, special card detection for 005- prefix, add-as-new-employee flow
    - `AGENTS.md` - Added Location vs Employee Status documentation

### March 19, 2026
- ✅ **Phase 2: HV Testers & Phasing Sets Equipment Tracking**
  - **Goal:** Track HV Testers and Phasing Sets with 10-year replacement cycles
  - **What was built:**
    1. **HV Tester Swaps Generation**
       - `generateHVTesterSwaps(silent)` - Scans HV Testers sheet for items approaching 10-year replacement date
       - Shows items due within 365 days (1 year)
       - Color-coded urgency: 🔴 OVERDUE (red), 🟠 Due Soon ≤90 days (orange), 🟡 Upcoming ≤180 days (yellow)
       - Creates "HV Tester Swaps" sheet with replacement recommendations
       - Tracks available testers "On Shelf" for replacements
    2. **Phasing Set Swaps Generation**
       - `generatePhasingSetSwaps(silent)` - Same logic as HV Testers
       - Creates "Phasing Set Swaps" sheet
       - Tracks available sets "On Shelf"
    3. **Replacement Date Calculation**
       - `calculateReplacementDate(calibrationDate)` - Adds 10 years to calibration date
       - Uses `INTERVAL_CALIBRATION_YEARS = 10` constant from 00-Constants.gs
       - Auto-updates Replacement Date column when generating swaps
    4. **Sheet Navigation Functions**
       - `openHVTestersSheet()` - Opens HV Testers sheet
       - `openPhasingSetsSheet()` - Opens Phasing Sets sheet
  - **Menu Items Added:**
    - Glove Manager → 📊 Generate All Reports → ⚡ Generate HV Tester Swaps
    - Glove Manager → 📊 Generate All Reports → ⚡ Generate Phasing Set Swaps
    - Glove Manager → 🔧 Maintenance → 📦 Inventory → ⚡ View HV Testers
    - Glove Manager → 🔧 Maintenance → 📦 Inventory → ⚡ View Phasing Sets
  - **Sheet Structure (both HV Testers and Phasing Sets):**
    | Item # | Model | Serial # | Calibration Date | Date Assigned | Location | Status | Assigned To | Replacement Date | Picked For | Notes |
    - **Status values:** On Shelf, In Service
    - **Replacement Date:** Auto-calculated as Calibration Date + 10 years
  - **Constants Used (from 00-Constants.gs):**
    - `SHEET_HV_TESTERS = 'HV Testers'`
    - `SHEET_HV_TESTER_SWAPS = 'HV Tester Swaps'`
    - `SHEET_HV_TESTERS_HISTORY = 'HV Testers History'`
    - `SHEET_PHASING_SETS = 'Phasing Sets'`
    - `SHEET_PHASING_SET_SWAPS = 'Phasing Set Swaps'`
    - `SHEET_PHASING_SETS_HISTORY = 'Phasing Sets History'`
    - `INTERVAL_CALIBRATION_YEARS = 10`
    - `COLS.HV_TESTERS.*` and `COLS.PHASING_SETS.*` - Column indices
  - **Files Modified:**
    - `src/Code.gs` - Added ~400 lines of HV Tester and Phasing Set functions
    - `src/Code.gs` - Added menu items to onOpen()
  - **Impact:** 10-year replacement cycles for calibrated test equipment are now tracked automatically

- ✅ **Menu Restructure - Monday Workflow Organization**
  - **Goal:** Reorganize Glove Manager menu to match the Monday workflow steps from Quick Actions
  - **New Menu Structure:**
    1. 📱 Quick Actions (sidebar)
    2. 📥 Import Crew Makeup (submenu with utilities)
    3. 📊 Generate All Reports (submenu with utilities)
    4. 🛡️ Process Safety Emails (submenu with utilities, logs, debug, cleanup)
    5. 🎯 Generate Task Metadata (submenu with utilities)
    6. 📅 Review & Schedule (submenu with training, crew visit, utilities)
    7. 💾 Save & Backup (submenu with history, email reports)
    8. 🔧 Maintenance (inventory, purchase orders, employees, sheets setup)
    9. 🔍 Debug (diagnostic tools)
  - **Key Changes:**
    - Each workflow step now has its own top-level submenu
    - Related functions grouped under 🔧 Utilities submenus
    - Debug/diagnostic functions grouped under 🔍 Debug submenus
    - Safety cleanup functions grouped under 🧹 Cleanup submenu
    - Rarely-used functions moved to 🔧 Maintenance
  - **Files Modified:**
    - `src/Code.gs` - Complete rewrite of `onOpen()` menu structure (~200 lines)
  - **Impact:** Menu now mirrors the 6-step Monday workflow, making it easier to find functions

- ✅ **Training Tracking Crew Leads - Auto-Update in Generate All Reports**
  - **Goal:** Automatically update Training Tracking crew leads when running Generate All Reports
  - **Problem:** When a crew's foreman changed, Training Tracking still showed the old name until manually updated
  - **Solution:** Added crew lead update step to `generateAllReports()` function
  - **Key Features:**
    - Only updates CURRENT and FUTURE months (March forward for March 2026)
    - Preserves historical data - January/February crew leads are NOT changed
    - Uses `getCrewLead()` function to determine current crew lead by job classification hierarchy
    - Shows count of updated rows in success message
  - **New Functions:**
    - `updateTrainingTrackingCrewLeadsSilent()` - Silent version for batch operations
    - `updateTrainingTrackingCrewLeads()` - Menu version with UI feedback
  - **Menu Item:** Glove Manager → 📊 Generate All Reports → 🔧 Utilities → 🔄 Update Training Tracking Crew Leads
  - **Files Modified:**
    - `src/Code.gs` - Added both crew lead update functions (~150 lines)
    - `src/Code.gs` - Modified `generateAllReports()` to call `updateTrainingTrackingCrewLeadsSilent()`
  - **Impact:** Training Tracking crew leads now stay in sync with Employees sheet automatically

- ✅ **Fixed Duplicate generateAllReports Function**
  - **Problem:** Crew lead update wasn't running during Generate All Reports
  - **Root Cause:** Two `generateAllReports()` functions existed - one in `30-SwapGeneration.gs` and one in `Code.gs`. Since Code.gs loads last alphabetically, its version (without crew lead update) was being used.
  - **Solution:** Added crew lead update to the `Code.gs` version of `generateAllReports()`
  - **Files Modified:**
    - `src/Code.gs` - Updated `generateAllReports()` to include crew lead update step

### March 13, 2026
- ✅ **Stale Cert Tasks Cleanup - Auto-Complete When Expiration Updated to Far Future**
  - **Problem:** When Nick Camp's DL expiration date was updated from near-term to far in the future (> 365 days), the old Task Metadata record persisted with the OLD date. Running "Generate All Task Metadata" didn't remove or update it because:
    1. `collectExpiringCertTasks()` skips certs > 365 days out (so no NEW task is created)
    2. BUT the OLD task record still exists in Task Metadata with Status='Pending'
    3. `generateTaskMetadata()` updates existing records but NEVER removes stale ones
  - **Solution:** Added `cleanupStaleCertTasks()` function that runs automatically at the start of `generateTaskMetadata()`:
    1. Reads current cert expiration dates from Expiring Certs sheet
    2. Compares against Cert Expiring tasks in Task Metadata
    3. If cert is now > 365 days out (no longer expiring): marks task as Complete with note "Auto-completed: expiration updated to X days out"
    4. If cert no longer exists in source sheet: marks task as Complete with note "Auto-completed: cert no longer in Expiring Certs"
  - **New Functions in `Code.gs`:**
    - `cleanupStaleCertTasks()` - Cleans up stale Cert Expiring tasks (~120 lines)
    - `menuCleanupStaleCertTasks()` - Menu function for manual cleanup
  - **Menu Item:** Glove Manager → 🔧 Utilities → 📜 Cleanup Stale Cert Tasks
  - **How it works now:**
    1. User updates cert expiration date to far future (e.g., 2028)
    2. User runs "Generate All Task Metadata" (Quick Actions Step 4)
    3. `cleanupStaleCertTasks()` runs automatically at start
    4. Old cert task is marked Complete (removed from Task List and Trip Planner)
    5. Fresh task collection proceeds without creating duplicates
  - **Files Modified:**
    - `src/Code.gs` - Added `cleanupStaleCertTasks()` and `menuCleanupStaleCertTasks()` functions
    - `src/Code.gs` - Modified `generateTaskMetadata()` to call cleanup at start
    - `src/Code.gs` - Added menu item
  - **Impact:** Cert tasks now properly disappear when the expiration date is updated to far in the future

### March 12, 2026
- ✅ **Cert Expiring Tasks - Stop Reappearing After Completion**
  - **Problem:** Nick Camp's DL (and other cert tasks) kept reappearing in Task List and Trip Planner even after updating the expiration date and marking complete
  - **Root Cause:** `collectExpiringCertTasks()` read directly from the Expiring Certs sheet without checking if the task was already marked Complete in Task Metadata
  - **Solution:** Added check at start of `collectExpiringCertTasks()` that:
    1. Reads Task Metadata sheet for Cert Expiring tasks with Status='Complete'
    2. Builds lookup of completed certs by row number AND by employee+certType combo
    3. Skips any cert that matches either key during collection
  - **How it works now:**
    1. User updates cert expiration date via Task List or Trip Planner
    2. `updateCertExpirationFromTask()` updates Expiring Certs sheet AND marks task Complete in Task Metadata
    3. Next time `collectExpiringCertTasks()` runs (via generateTaskMetadata or getTasksWithMetadata), it checks Task Metadata first
    4. Completed certs are skipped - they don't reappear in Task List or Trip Planner
  - **Files Modified:**
    - `src/76-SmartScheduling.gs` - Added ~50 lines to `collectExpiringCertTasks()`:
      - Build `completedCerts` lookup from Task Metadata
      - Check both `row_{rowNum}` and `emp_{employee}_{certType}` keys
      - Skip certs matching either key
      - Updated log to show skipped count
  - **Impact:** Cert renewal tasks now properly disappear after completion
- ✅ **Safety Equipment Tasks - Vehicle/Truck Number Display**
  - **Problem:** Safety Equipment Need tasks from the Safety Equipment Needs sheet didn't display the vehicle/truck number, making it hard to know where to deliver replacement items
  - **Solution:** Added `vehicleNumber` and `currentItem` fields to task objects throughout the Trip Planner data flow
  - **Where it now shows:**
    - **Task List (ToDoSchedule.html):** Shows vehicle number in parentheses after equipment type (e.g., "🔧 Fire Extinguisher (#1234)")
    - **Trip Planner Sidebar:** Shows vehicle number in task subtitle for Safety Equipment tasks
    - **Trip Planner Task Details Popup:** Shows "Vehicle #[number]" when viewing task details
  - **Files Modified:**
    - `src/87-RoutePlanner.gs` - Added `vehicleNumber` and `currentItem` fields to:
      - `collectTasksForTripPlanner()` → regular task object
      - `collectTasksForTripPlanner()` → scheduled task object
      - `collectTasksForTripPlanner()` → office task object
      - `suggestOptimalTrips()` → cleanUnassigned tasks array
  - **Data Flow:** Safety Equipment Needs sheet "Vehicle Number" column (E) → `collectSafetyReportsTasks()` → Task Metadata enrichment → Trip Planner UI display
  - **Impact:** Users can now see which truck/vehicle needs the replacement safety equipment when planning trips

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

### April 17, 2026
- ✅ **ESL ID Column Added to Gloves/Sleeves Sheets**
  - **Goal:** Add ESL ID column (B) to Gloves and Sleeves sheets for external system linking
  - **What was built:**
    1. **`migrateGlovesSleevesSheetsForESLID()`** - Migration function that inserts column B ("ESL ID") and shifts existing data right. Safe to run multiple times (skips if already migrated).
    2. **Updated `COLS.INVENTORY`** - All column indices shifted +1: ESL_ID=2, SIZE=3, CLASS=4, TEST_DATE=5, DATE_ASSIGNED=6, LOCATION=7, STATUS=8, ASSIGNED_TO=9, CHANGE_OUT_DATE=10, PICKED_FOR=11, NOTES=12
    3. **Updated all hardcoded column references** to use `COLS.INVENTORY` constants:
       - `11-Triggers.gs` — onEdit/onEditHandler Date Assigned and Change Out Date handling
       - `Code.gs` — handlePickListManualEdit(), auto-set defaults for new items
       - `40-Reclaims.gs` — Reclaim pick list column references
       - `50-History.gs` — History logging column awareness
    4. **Auto-set defaults** for new Gloves/Sleeves items: Location=Helena, Status=On Shelf, Assigned To=On Shelf
    5. **61-InventoryReports.gs** — Major cleanup (~894 lines removed), updated for new column layout
    6. **LookupDialog.html** — ESL ID displayed in item lookup results
    7. **NewItemDialog.html** — ESL ID field added to new item creation dialog
  - **Menu Item:** Glove Manager → 🔧 Maintenance → 🏗️ Sheets Setup → Add ESL ID Column (Gloves/Sleeves)
  - **IMPORTANT:** `BLANKETS` does NOT have ESL ID — still uses the old 11-column layout
  - **Files Modified:** `src/00-Constants.gs`, `src/11-Triggers.gs`, `src/40-Reclaims.gs`, `src/50-History.gs`, `src/Code.gs`, `src/NewItemDialog.html`

- ✅ **Code Review: Fix Remaining Hardcoded Column Indices After ESL ID Migration**
  - **Problem:** Several functions still used old 11-column layout indices (pre-ESL ID) causing **live bugs** — reading wrong columns for Location, Status, AssignedTo, PickedFor in Gloves/Sleeves data
  - **Critical Bug Fixed:** `updateReclaimsSheet()` in Code.gs was reading `row[5]` as Location (actually DateAssigned), `row[7]` as AssignedTo (actually Status), `row[6]` as Status (actually Location) — all reclaim detection for Previous Employee items and Class 2/3 reclaims was broken
  - **What was fixed:**
    1. **`Code.gs` `saveHistoryFast()`** — Gloves/Sleeves: range width `11`→`COLS.INVENTORY.NOTES` (12), all array indices updated to `COLS.INVENTORY.*` constants, reduced 2 API calls to 1 (`getValues()` only)
    2. **`Code.gs` `updateReclaimsSheet()`** — Range width `11`→`12`, all 4 `forEach` blocks (Previous Employee collection, Class 2/3 reclaims, Pick List previous employee check) updated with `COLS.INVENTORY.*` constants, 2 `oldItemData[4]` → `COLS.INVENTORY.DATE_ASSIGNED - 1`
    3. **`Code.gs` `handleNotesChange()`** — Three hardcoded `11` → `COLS.INVENTORY.NOTES`
    4. **`40-Reclaims.gs`** — Range width `11`→`COLS.INVENTORY.NOTES` for both Gloves/Sleeves reads
    5. **`50-History.gs`** — Updated to use `COLS.INVENTORY.*` constants, single API call, added deprecation note
    6. **`Code.gs` `saveHistory()`** — Marked as `DEPRECATED` (active version is `saveHistoryFast()`)
  - **Files Modified:** `src/00-Constants.gs`, `src/20-InventoryHandlers.gs`, `src/40-Reclaims.gs`, `src/50-History.gs`, `src/Code.gs`, `src/NewItemDialog.html`

- ✅ **Quick Actions Audit - Batch 1 Bug Fixes (5 Critical Issues)**
  - **Context:** Systematic audit of all 8 Quick Actions steps revealed 19 issues. Batch 1 fixes the 5 most critical bugs.
  - **Fix 1: Task List rendered 3× per load (ToDoSchedule.html)**
    - **Problem:** `renderPersonalChecklist()` was called synchronously in `processTaskData()` AND asynchronously from `getMissingSafetyReportTasks` callback, plus once from initial empty state — 3 renders total, ~69 debug log blocks
    - **Solution:** Removed the synchronous call; the async callback is the authoritative render (has safety compliance data)
  - **Fix 2: Crew Import special circumstances auto-applied twice on sheet tab switch (CrewImport.html)**
    - **Problem:** `_autoSelectionsAlreadyApplied` guard was reset in `parseCrewCards()` on every tab parse. Switching to a different sheet tab and back re-triggered auto-apply, duplicating Light Duty assignments etc.
    - **Solution:** Added `_autoSelectionsAppliedForTab` tracking variable. Guard now checks both the flag AND whether the current tab matches the previously applied tab.
  - **Fix 3: Light Duty job numbers incrementing on every auto-apply (85-DataImport.gs)**
    - **Problem:** `applySpecialCircumstanceUpdate()` allocated a new 005-26.N number every time it was called for the same Light Duty employee (e.g., 005-26.249, .250, .251)
    - **Solution:** Added check for existing `005-` prefix job number on the employee's row. If already has one, keeps it instead of allocating a new one.
  - **Fix 4: Date object in Gloves Assigned To column sets location to "Unknown" (22-LocationSync.gs)**
    - **Problem:** A Date object in the Assigned To column (row 9, "Wed Jan 27 2027...") was being `.toString()`'d and looked up as an employee name, failing and setting location to "Unknown"
    - **Solution:** Added `instanceof Date` check in `syncSheetLocations()` that skips Date objects with a WARNING log
  - **Fix 5: Safety Email processing — 14 batches × 4 Gmail queries for 2 new emails (88-SafetyReports.gs)**
    - **Problem:** When all emails in a batch were already logged (skipped), the continuation loop still processed all remaining batches (14 × 4 queries = ~56 Gmail API calls for 0 new results)
    - **Solution:** Added early exit detection: if a continuation batch processes 0 new emails (`totalNewThisBatch === 0` and `!isFirstBatch`), marks processing as complete and stops further batches
  - **Files Modified:**
    - `src/ToDoSchedule.html` — Removed duplicate synchronous `renderPersonalChecklist()` call
    - `src/CrewImport.html` — Tab-aware auto-apply guard with `_autoSelectionsAppliedForTab`
    - `src/85-DataImport.gs` — Skip Light Duty job allocation if employee already has 005-26 prefix
    - `src/22-LocationSync.gs` — Skip Date objects in Assigned To column during location sync
    - `src/88-SafetyReports.gs` — Early exit on all-skipped continuation batch
  - **Remaining audit items (not yet fixed):**
    - 🟡 041-26 (Completed job) still in training selectedCrews
    - 🟡 267→230 tasks: 37 dropped silently (no metadata records)
    - 🟡 Special circumstance names not cleaned ("Joe Piazzola awhile", "James Eide CDL-B 3 wks")
    - 🟡 `addMissingCrewsToTrainingTracking` slow (~1s per crew)
    - 🟡 005-26 office crew tracked in Safety Compliance
    - 🟡 JHA Log full scan done twice per run
    - 🟡 Special circumstance deduplication (parseCrewCards) not applied
    - 🟢 Stale "Dawson" saved selection, hyphenated name matching, excessive debug logging

