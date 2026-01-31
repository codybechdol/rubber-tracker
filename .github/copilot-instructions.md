# Copilot Instructions for Rubber Tracker

## Deployment
- **ALWAYS use `.\push.bat`** to deploy changes to Google Apps Script
- Do NOT use `clasp push` directly - use the batch file instead
- The project uses clasp for Google Apps Script deployment

## Project Structure
- Source files are in the `src/` folder
- `.gs` files are Google Apps Script files
- `.html` files are HTML templates for dialogs/sidebars

## Key Files
- `Code.gs` - Main code file with core functions
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

---

# Feature Development Roadmap

## Current Phase: Phase 1

---

## Phase 1: Crew Makeup Spreadsheet Import
**Status:** 🔄 IN PROGRESS (Testing new file upload approach)

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
- [ ] Test with real Excel file
- [ ] Deploy with push.bat ✅

---

## Phase 2: Daily Accomplishment Breakdown
**Status:** 🔄 IN PROGRESS

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
- [ ] Test with completed tasks
- [ ] Deploy with `.\push.bat` ✅

---

## Phase 2B: Smart Route Optimizer
**Status:** 🔄 IN PROGRESS

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
- [ ] Test with pending tasks
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
**Status:** 🔲 NOT STARTED

**Goal:** Create beautiful HTML email reports with tables, charts, and task summaries.

**What it does:**
- Create HTML email templates with:
  - My Checklist items (pending/overdue)
  - Task Items by priority
  - Calendar view (upcoming 2 weeks)
  - Tables with conditional formatting
  - Charts (inventory levels, task completion trends)
- Schedule options: Daily summary, Weekly full report, On-demand

**Key files to create/modify:**
- `80-EmailReports.gs` - Enhance existing email system
- NEW: `EmailTemplates.html` - HTML email templates

**Questions to resolve:**
- [ ] Who receives reports? (Same Notification Emails column, or separate list?)
- [ ] Daily + weekly, or just one schedule?
- [ ] What charts/visualizations needed?

**Implementation tasks:**
- [ ] Design HTML email template
- [ ] Add buildChecklistSection() function
- [ ] Add buildTaskTableSection() function
- [ ] Add buildCalendarSection() function
- [ ] Add chart generation (using Google Charts or inline SVG)
- [ ] Add scheduling options
- [ ] Update menu items

---

## Phase 4: Gmail Inbox Filter/Processing
**Status:** 🔲 NOT STARTED

**Goal:** Automatically filter and process Gmail for JHAs, Safety Meetings, and Fleet Checklists.

**What it does:**
- Search Gmail for:
  - JHAs (Job Hazard Analyses)
  - Weekly Safety Meetings
  - Fleet Safety Checklists
- Auto-organize into labels/folders
- Optionally extract data and log to tracking sheet
- Create tasks for follow-ups

**Key files to create/modify:**
- NEW: `87-GmailIntegration.gs` - Gmail processing functions
- `appsscript.json` - Add Gmail API scope

**Questions to resolve:**
- [ ] What subject lines/senders identify JHAs?
- [ ] What subject lines/senders identify Safety Meetings?
- [ ] What subject lines/senders identify Fleet Checklists?
- [ ] Just label, or extract data too?

**Implementation tasks:**
- [ ] Add Gmail API scope to appsscript.json
- [ ] Create searchAndLabelEmails() function
- [ ] Create JHA processing function
- [ ] Create Safety Meeting processing function
- [ ] Create Fleet Checklist processing function
- [ ] Add tracking sheet (optional)
- [ ] Add scheduled trigger
- [ ] Add menu items

---

## Phase 5: Purchase Order Generation
**Status:** 🔲 NOT STARTED

**Goal:** Generate purchase orders from Purchase Needs and track order status.

**What it does:**
- Take "Need to Order" items from Purchase Needs sheet
- Generate formatted Purchase Order document (Google Doc or PDF)
- Track PO number, vendor, date ordered, expected delivery
- New "Purchase Orders" sheet to track status
- Update Purchase Needs when items are received

**Key files to create/modify:**
- `60-PurchaseNeeds.gs` - Link to PO system
- NEW: `62-PurchaseOrders.gs` - PO generation and tracking
- NEW: `PurchaseOrderDialog.html` - UI for creating POs

**Questions to resolve:**
- [ ] Specific vendor(s) used?
- [ ] PO number format?
- [ ] Approval workflow needed?
- [ ] Output format? (Google Doc, PDF, Email?)

**Implementation tasks:**
- [ ] Create Purchase Orders sheet structure
- [ ] Create PurchaseOrderDialog.html
- [ ] Add generatePurchaseOrder() function
- [ ] Add PO number generation
- [ ] Add Google Doc/PDF generation
- [ ] Add status tracking (Ordered, Shipped, Received)
- [ ] Add receiveItems() function to update inventory
- [ ] Add menu items

---

## Completed Features Log

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
