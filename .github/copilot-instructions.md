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
- `ToDoSchedule.html` - To Do Schedule dialog UI
- `ToDoConfig.html` - Configuration dialog UI

## Conventions
- Use `Logger.log()` for debugging in Google Apps Script
- Task types include: Swap, Reclaim, Training, Cert Expiring
- Item types are: Glove, Sleeve

---

# Feature Development Roadmap

## Current Phase: Phase 1

---

## Phase 1: Crew Makeup Spreadsheet Import
**Status:** 🔄 IN PROGRESS

**Goal:** Import superintendent's weekly crew structure spreadsheet to update Employees sheet.

**What it does:**
- Import superintendent's weekly crew structure spreadsheet
- Match employees by name (using existing Metaphone matching)
- Update Location, Job Number, and Crew/Foreman assignments on Employees sheet
- Show confirmation for each change before applying
- Log changes to Employee History

**Key files to create/modify:**
- `85-DataImport.gs` - Add crew import functions ✅
- `51-EmployeeHistory.gs` - Log location/job changes ✅
- NEW: `CrewImport.html` - UI for importing crew data ✅

**Spreadsheet Format (from superintendent):**
- Excel spreadsheet, weekly update
- Header format: `Belgrade Dock 013-26 5 8's M-F` where:
  - `Belgrade Dock` = Location name (maps to `Bozeman` in Google Sheet)
  - `013-26` = Job Number
  - `5 8's M-F` = Schedule info
- Employee rows under each job header:
  - `F` suffix = Foreman
  - `JL` suffix = Journeyman Lineman
  - `# ap` suffix = Apprentice (e.g., `5 ap` = 5th year)
  - `Jry Op` = Journey Operator
  - `GTO` = Gas Tech Operator
  - `EO2` = Equipment Operator 2
  - `WT` = Working Tech
- Job number assignment: First employee = `.1`, second = `.2`, etc.

**Location Mappings:**
- Belgrade Dock → Bozeman
- Helena Trans Dock → Helena
- Great Falls Dock → Great Falls
- Butte Dock → Butte
- Livingston Dock → Livingston
- Ennis Dock → Ennis
- Msla → Missoula
- (more in CrewImport.html)

**Questions to resolve:**
- [x] What format is the superintendent's spreadsheet? (columns, structure) ✅ ANSWERED
- [x] What fields need updating? (Location, Job Number) ✅ ANSWERED

**Implementation tasks:**
- [x] Create CrewImport.html dialog ✅
- [x] Add parseCrewSpreadsheet() function ✅
- [x] Add matchCrewToEmployees() using name matching ✅
- [x] Add confirmation UI for changes ✅
- [x] Add applyCrewChanges() function ✅
- [x] Log changes to Employee History ✅
- [x] Add menu item ✅
- [ ] Test with real data
- [ ] Deploy with push.bat

---

## Phase 2: Daily Accomplishment Breakdown
**Status:** 🔲 NOT STARTED

**Goal:** Generate formatted daily breakdown of completed tasks for timesheet copy/paste.

**What it does:**
- Scan completed tasks from To-Do List, Manual Tasks, Calendar items
- Group by date, then by category (Swaps, Training, Travel, Admin, etc.)
- Generate formatted text output ready for copy/paste into timesheet
- Option to add notes per item

**Key files to create/modify:**
- NEW: `86-TimeTracking.gs` - Time tracking functions
- NEW: `TimeBreakdown.html` - UI for viewing/copying breakdown

**Questions to resolve:**
- [ ] What categories for timesheet? (Travel, Swaps, Training, Admin, Meetings, Field Work?)
- [ ] What date range? (Today, This Week, Custom?)
- [ ] What format for output?

**Implementation tasks:**
- [ ] Create TimeBreakdown.html dialog
- [ ] Add collectCompletedTasks() function
- [ ] Add categorizeTask() function
- [ ] Add formatForTimesheet() function
- [ ] Add copy-to-clipboard functionality
- [ ] Add menu item

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

### January 21, 2026
- ✅ Double Metaphone phonetic matching for Excel import
- ✅ NAME_CORRECTED and NEW_EMPLOYEE_IMPORT event types
- ✅ Enhanced fuzzy name matching (Levenshtein + Metaphone)
- ✅ Confirmation dialogs for all Employees/History changes
- ✅ logNameCorrection() and logNewEmployeeFromImport() functions

