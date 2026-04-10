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

### March 17, 2026
- ✅ **Cleanup Pending Training for Completed Jobs**
  - **New Feature:** Utility to remove ALL Pending training rows for jobs that are marked as Completed in Job Tracking
  - **Problem:** Job 052-25 was marked Completed in Job Tracking, but its March training (with status "Pending") still appeared in Training Tracking
  - **Solution:** New `cleanupPendingTrainingForCompletedJobs()` function that:
    1. Finds ALL jobs with status "Completed" in Job Tracking (regardless of end date)
    2. Scans Training Tracking for rows belonging to those jobs
    3. DELETES rows where training status is "Pending", "N/A", or empty
    4. KEEPS rows where training status is "Complete" (historical record)
  - **How to Use:**
    1. Menu: Glove Manager → 🔧 Utilities → 🧹 Cleanup Pending Training for Completed Jobs
    2. Review the summary of rows to be deleted
    3. Click "Yes" to confirm deletion
  - **Difference from `syncCompletedJobsToTraining()`:**
    - `syncCompletedJobsToTraining()` only removes FUTURE training months (after job end date)
    - `cleanupPendingTrainingForCompletedJobs()` removes ANY pending training regardless of month
  - **Files Modified:**
    - `src/22-EmployeeValidation.gs` - Added `cleanupPendingTrainingForCompletedJobs()` function (~130 lines)
    - `src/Code.gs` - Added menu item
  - **Impact:** Pending training rows for completed jobs (like 052-25) are now easily cleaned up
- ✅ **Master Recalculate Preserves Past Week N/A Values**
  - **Problem:** Master Recalculate was applying CURRENT Config settings (like skipDays) to ALL past weeks, which was wrong. For example:
    - Matt Wendt switched from Mon-Fri to Mon-Thu this week - Master Recalculate was removing Friday data from past weeks where he worked Fridays
    - Ben Lapka (052-25) and Matt Miller (015-26) were being removed from historical weeks even though they were the foremen at that time
  - **Root Cause:** `calculateComplianceFromLogs()` always used the current Config's `skipDays` array for all weeks, not just the current week
  - **Solution:** For PAST weeks, the system now reads and PRESERVES the existing N/A values from the Safety Compliance sheet instead of recalculating them from current Config
  - **How it works now:**
    - **CURRENT week:** Uses Config's skipDays settings (as expected)
    - **PAST weeks:** Loads existing data from sheet and preserves N/A values (work schedules can change week to week)
    - Historical crews remain in past weeks even if they're no longer in Config
    - Completed crews (052-25, 015-26) retain their historical data
  - **New Functions in `88-SafetyReports.gs`:**
    - `loadExistingComplianceForWeek()` - Loads ALL existing compliance data for a week including N/A values, foreman names, and day statuses
  - **Modified Function:**
    - `calculateComplianceFromLogs()` - Now checks `isCurrentWeek` and only applies Config skipDays to current week; past weeks use `loadExistingComplianceForWeek()` to preserve existing N/A values
  - **Files Modified:**
    - `src/88-SafetyReports.gs` - Added ~100 lines for new function and modified calculation logic
  - **Impact:** Past week data (including work schedule N/A values and historical foremen) is now properly preserved when running Master Recalculate

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
  - ****How `ensureCurrentWeekInCompliance()` works:**
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
    - `menuAddLateSubmissionFormatting()` - Adds new formatting rules to existing sheet
  - **Key Property: `affectsStatus`**
    - `affectsStatus: false` (weeks 1-2) → Monthly Checklist doesn't change crew's Status column
    - `affectsStatus: true` (week 3+) → Monthly Checklist can set Status to Pending
  - **Conditional Formatting Added:** ⚠️ (orange) and ❌⏳ (red/pink) rules
  - **New Menu Item:** Glove Manager → Safety Reports → 🎨 Add Monthly Checklist Formatting
  - **Files Modified:**
    - `src/88-SafetyReports.gs` - Added ~100 lines: `getWeekOfMonth()`, `getMonthlyChecklistStatus()`, updated `calculateSafetyCompliance()`
    - `src/Code.gs` - Updated menu item name
- ✅ **Fixed Received Date Column Truncation in Safety Reports**
  - **Problem:** Compliance records were written with only 12 columns, but the array has 13 elements (including Received Date at index 12)
  - **Root Cause:** Code used `.setValues(complianceRecords)` with column count of 12, truncating the Received Date column
  - **Impact:** Received Date column (M) in Safety Reports sheet was always empty
  - **Solution:** Changed column count from 12 to 13 in both locations:
    - `processSafetyEmails()` line 871
    - `applyJobNumberCorrections()` line 1327
  - **Files Modified:** `src/88-SafetyReports.gs` - 2 lines changed
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
- ✅ **Crew Import - Secondary Job Number Support**
  - When an employee appears in multiple crews:
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
    - `src/QuickActions.html` - Complete redesign (~1450 lines)
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
  - **Key Benefits:**
    - Complete audit trail - every email is logged even if job is unknown
    - Reliable compliance calculation from logged data
    - Easy debugging - can see exactly why a report wasn't credited
    - Manual fixes possible by editing Credited To column
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
  - **Files Modified:**
    - `src/88-SafetyReports.gs` - Added `autoCorrectPastWeekCompliance()` function (~110 lines)
    - `src/Code.gs` - Added call after compliance record writing in two locations
  - **Documentation:** `docs/PDF_PROCESSING_IMPROVEMENTS_FEB19.md` (updated with Option B section)
- ✅ **Simplified JHA Tracking - Only Date Completed & Date Received**
  - **Problem:** Safety Reports sheet was cluttered with hundreds of "No Issues" compliance tracking rows
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
  - **New Functions in `88-SafetyReports.gs`:**
    - `setupJHALogSheet()`, `setupWeeklySafetyLogSheet()`, `setupMonthlyChecklistLogSheet()` - Create log sheets
    - `setupAllSafetyLogSheets()` - Menu function to create all 3 sheets
    - `logJHAEmail()`, `logWeeklySafetyEmail()`, `logMonthlyChecklistEmail()` - Log to appropriate sheet
    - `logParsedSafetyEmail()` - Central function that routes parsed emails to correct log sheet
    - `calculateComplianceFromLogs()` - Calculates compliance by reading log sheets (replaces old method)
    - `updateComplianceSheetFromLogs()` - Updates Safety Compliance from calculated data
    - `recalculateComplianceFromLogs()` - Menu function to recalculate compliance from logs
    - `cleanupOldLogEntries()` - Auto-cleans entries older than 90 days
    - `emailExistsInLog()` - Deduplication check
  - **Integration with `processSafetyEmails()`:**
    - After email processing completes, compliance is automatically calculated
    - Safety Compliance sheet updated with ✅/❌/N/A/⏳ status per day per crew
    - If past deadline, missing report tasks created in Task Metadata
    - Dialog shows compliance grid after processing
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

### March 27, 2026
- ✅ **New Hires Flow in Crew Import**
  - **Goal:** Detect NEW HIRE employees in Excel file and add them to Employees sheet before crew matching
  - **What was built:**
    1. **`checkForNewHires()`** - Scans parsed crews for employees flagged as NEW HIRE
    2. **`searchEmployeeHistoryBatch(namesJson)`** - Batch searches Employee History to detect rehires
    3. **`addNewEmployeeFromImport(employeeData)`** - Adds brand new employee to Employees sheet
    4. **`rehireEmployeeFromImport(employeeData)`** - Updates existing "Previous Employee" record for rehires
    5. **New Hires UI Section** - Cards for each new hire with rehire detection, history data, individual/bulk add
    6. **Sequential processing** - `addAllNewHires()` adds one at a time to avoid race conditions
    7. **`refreshEmployeesAndContinue()`** - Reloads employee data after adding, then continues flow
  - **Flow:** Parse Excel → Detect new jobs → **Detect new hires** → Match employees → Preview → Apply
  - **Rehire detection:** If employee has Employee History AND current location is "Previous Employee", uses rehire flow (preserves sizes, phone, etc.)
  - **Files Modified:**
    - `src/85-DataImport.gs` - Added ~350 lines (searchEmployeeHistoryBatch, addNewEmployeeFromImport, rehireEmployeeFromImport)
    - `src/CrewImport.html` - Added ~400 lines (new hires section, cards, sequential add, refresh flow)

- ✅ **Job Activation Scheduling (On Hold / Pending Start Auto-Activation)**
  - **Goal:** Schedule future activation dates for On Hold and Pending Start jobs; auto-activate when date arrives
  - **What was built:**
    1. **`setJobActivationDate(jobNumber, activationDateStr)`** - Saves activation date to Job Tracking
       - On Hold jobs: saves to "Estimated Return" (column G)
       - Pending Start jobs: saves to "Start Date" (column E)
    2. **`checkAndActivateScheduledJobs()`** - Scans all On Hold/Pending Start jobs, auto-activates when date arrives
       - Called automatically during `syncJobTrackingAfterImport()` and `generateAllReports()`
       - Clears On Hold fields (Put On Hold Date, Estimated Return) when activating from On Hold
       - Adds note with activation details
    3. **`activatePendingJobs()`** - Updated to handle both On Hold and Pending Start statuses
  - **Files Modified:**
    - `src/85-DataImport.gs` - Added ~160 lines (setJobActivationDate, checkAndActivateScheduledJobs)
    - `src/Code.gs` - Added auto-activation call in generateAllReports()

- ✅ **Purchase Order System - Vendor Catalog & Custom Items**
  - **Goal:** Redesign vendor management to support arbitrary items (not just glove/sleeve classes) and streamline PO creation
  - **What was built:**
    1. **Combined Vendor Sheet Format** - 8 columns: Vendor Name, Contact, Email, Phone, Notes, Item, Item Number, Price
       - Each row = one item for a vendor (vendor info repeated per row)
       - Replaces old 17-column fixed format + separate Vendor Items sheet
       - Auto-migrates from old format via `migrateVendorSheets()`
    2. **Vendor Catalog in PO Dialog** - Selecting a vendor auto-loads their catalog items
       - Items shown as unchecked rows, user selects what to order
       - "Add from Vendor Catalog" button for additional items
       - "Add Custom Line" for freeform items with editable name and price
    3. **VendorConfig.html Redesign** - Unified catalog-only view (removed legacy glove/sleeve pricing grid)
       - All items managed through single catalog table
       - Add/remove items with name, item number, and price
    4. **PurchaseOrderDialog.html Enhancements** - Category-based item display
       - Vendor catalog items shown with item numbers
       - Inline editing for custom line items
       - Remove button for vendor catalog and custom items
    5. **Email sending** - `sendPurchaseOrderEmail()` sends PO directly from dialog
  - **Files Modified:**
    - `src/62-PurchaseOrders.gs` - Added ~400 lines (migrateVendorSheets, combined format CRUD, email sending)
    - `src/PurchaseOrderDialog.html` - Added ~270 lines (catalog items, custom lines, inline editing)
    - `src/VendorConfig.html` - Added ~230 lines (item numbers, custom items section)

- ✅ **Reclaim Pick List Bug Fixes**
  - **Problems Fixed:**
    1. **Date objects in Class column** - Google Sheets sometimes stores small numbers (0, 2, 3) as serial dates (Dec 31 1899, Jan 1 1900, etc.). `parseInt()` returned NaN.
    2. **Sleeve size matching** - "XL" vs "X-Large" not matching; now uses `normalizeSleeveSize()` from 30-SwapGeneration.gs
    3. **Logic bug** - `!notAssigned` should have been `notAssigned` (double negation was inverted)
    4. **N/A preferred size** - Employee's preferred size of "N/A" fell through instead of using actual item size
  - **What was built:**
    - `safeParseClass(val)` helper - Handles Date objects, converts serial dates back to class numbers
    - `sleeveSizeMatch(itemSizeRaw)` helper - Normalizes both sides before comparing
    - N/A preferred size detection - Falls back to item's actual size when employee's preferred size is "N/A" or empty
  - **Files Modified:**
    - `src/Code.gs` - Updated `findReclaimPickListItem()` (~100 lines changed)

- ✅ **HV Tester & Phasing Set Trigger Enhancements**
  - Auto-set defaults when new item number entered (Location=Helena, Status=On Shelf, Assigned To=On Shelf)
  - NewItemDialog.html updated with HV Tester and Phasing Set field layouts (Model, Serial #, Calibration Date, KV)
  - **Files Modified:**
    - `src/11-Triggers.gs` - Added ~50 lines (auto-defaults for HV Testers and Phasing Sets)
    - `src/NewItemDialog.html` - Added ~90 lines (HV Tester and Phasing Set form fields)

- ✅ **Purchase Needs - "Size Up" Category & Better Matching**
  - Added "SIZE UP ASSIGNMENTS" category to purchase needs tables
  - Improved item matching with sleeve size normalization
  - **Files Modified:**
    - `src/60-PurchaseNeeds.gs` - Updated ~40 lines

- ✅ **Crew Import Parser Improvements**
  - Break on special section headers (Time Off, Quit, Layoff, Resign, etc.) during employee parsing
  - Break on "Crew Here" placeholders (e.g., "Crew Here Wed 4-1 thru Thurs 4-9")
  - Prevents these entries from being treated as employee names
  - **Files Modified:**
    - `src/CrewImport.html` - Updated `parseCrewCards()` employee scanning logic

- ✅ **ES6 Syntax Fix - const to var**
  - Fixed `const` usage in `writeSwapTableHeadersDynamic()` function to use `var` per project convention
  - **Files Modified:**
    - `src/Code.gs` - 2 lines changed (const → var)
