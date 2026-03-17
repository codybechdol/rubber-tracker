# Rubber Tracker System Architecture

## Complete Documentation of Sheets, HTML Dialogs, and Data Flow

**Last Updated:** March 11, 2026

---

# Table of Contents

1. [System Overview](#system-overview)
2. [Sheet Descriptions](#sheet-descriptions)
   - [Core Inventory Sheets](#core-inventory-sheets)
   - [Employee & HR Sheets](#employee--hr-sheets)
   - [Swap & Transaction Sheets](#swap--transaction-sheets)
   - [Scheduling & Task Sheets](#scheduling--task-sheets)
   - [Safety & Compliance Sheets](#safety--compliance-sheets)
   - [Reporting & History Sheets](#reporting--history-sheets)
   - [Configuration Sheets](#configuration-sheets)
3. [HTML Dialog Descriptions](#html-dialog-descriptions)
4. [Data Flow Diagrams](#data-flow-diagrams)
5. [Function Reference](#function-reference)

---

# System Overview

Rubber Tracker is a Google Sheets-based inventory and safety compliance management system for electrical safety equipment (rubber gloves and sleeves). The system:

- Tracks rubber gloves and sleeves inventory
- Manages employee assignments and certifications
- Generates swap schedules based on testing intervals
- Processes safety emails (JHAs, Safety Meetings, Fleet Checklists)
- Tracks compliance status per crew
- Plans trips and schedules tasks
- Generates purchase orders

## Architecture Principles

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           USER INTERFACE LAYER                               │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │ Quick Actions│  │  Task List   │  │ Trip Planner │  │  Dialogs     │     │
│  │  Sidebar     │  │   Dialog     │  │   Dialog     │  │  (Various)   │     │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘     │
└─────────┼──────────────────┼──────────────────┼──────────────────┼───────────┘
          │                  │                  │                  │
          │    google.script.run (Server Calls)                    │
          │                  │                  │                  │
┌─────────▼──────────────────▼──────────────────▼──────────────────▼───────────┐
│                         SERVER LAYER (Apps Script)                           │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │   Code.gs    │  │76-SmartSched │  │87-RoutePlan  │  │88-SafetyRpts │     │
│  │  (Core)      │  │  (Tasks)     │  │  (Trips)     │  │ (Compliance) │     │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘     │
└─────────┼──────────────────┼──────────────────┼──────────────────┼───────────┘
          │                  │                  │                  │
          │    SpreadsheetApp (Sheet Access)                       │
          │                  │                  │                  │
┌─────────▼──────────────────▼──────────────────▼──────────────────▼───────────┐
│                         DATA LAYER (Google Sheets)                           │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │  Gloves │ Sleeves │ Employees │ Swaps │ Task Metadata │ Compliance  │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

# Sheet Descriptions

## Core Inventory Sheets

### 1. Gloves
**Purpose:** Master inventory of all rubber gloves

| Column | Name | Description |
|--------|------|-------------|
| A | Item # | Unique glove identifier |
| B | Size | Glove size (8, 8.5, 9, 9.5, 10, 10.5, 11, 12) |
| C | Class | Protection class (0, 2, 3) |
| D | Test Date | Last testing/certification date |
| E | Date Assigned | When assigned to current employee |
| F | Location | Work location |
| G | Status | In Stock, Assigned, Testing, Lost, etc. |
| H | Assigned To | Employee name |
| I | Change Out Date | Calculated due date for swap |
| J | Picked For | Reserved for which employee |
| K | Notes | Additional notes |

**Data Sources:** Manual entry, Import
**Data Consumers:** Glove Swaps, Purchase Needs, Inventory Reports, Task Metadata

---

### 2. Sleeves
**Purpose:** Master inventory of all rubber sleeves

| Column | Name | Description |
|--------|------|-------------|
| A | Item # | Unique sleeve identifier |
| B | Size | Sleeve size (18, 20, 22, 24, 26) |
| C | Class | Protection class (0, 2, 3) |
| D | Test Date | Last testing/certification date |
| E | Date Assigned | When assigned to current employee |
| F | Location | Work location |
| G | Status | In Stock, Assigned, Testing, Lost, etc. |
| H | Assigned To | Employee name |
| I | Change Out Date | Calculated due date for swap |
| J | Picked For | Reserved for which employee |
| K | Notes | Additional notes |

**Data Sources:** Manual entry, Import
**Data Consumers:** Sleeve Swaps, Purchase Needs, Inventory Reports, Task Metadata

---

## Employee & HR Sheets

### 3. Employees
**Purpose:** Master list of all employees with their details and certifications

| Column | Name | Description |
|--------|------|-------------|
| A | Name | Employee full name |
| B | Location | Work location |
| C | Job Number | Crew job number (e.g., 013-26) |
| D | Job Classification | F, JRY, AP 1-7, GTO, etc. |
| E | Phone Number | Contact phone |
| F | Email Address | Contact email |
| G | Glove Size | Required glove size |
| H | Sleeve Size | Required sleeve size |
| I | Hire Date | Employment start date |
| J | CPR | CPR certification expiration |
| K | First Aid | First Aid cert expiration |
| L | Forklift | Forklift cert expiration |
| M-Z | Other Certs | Various certification dates |
| AA | Last Day | Termination date (if applicable) |
| AB | Last Day Reason | Quit, Fired, Layoff, Retired |
| AC | Secondary Job Number | Secondary crew assignment |

**Data Sources:** Manual entry, Crew Import, History restoration
**Data Consumers:** All swap generation, Training Tracking, Compliance Config, Task Metadata

---

### 4. Employee History
**Purpose:** Audit trail of all employee changes

| Column | Name | Description |
|--------|------|-------------|
| A | Timestamp | When change occurred |
| B | Employee Name | Who was changed |
| C | Change Type | Location Change, Job Change, Hire, Terminate, etc. |
| D | Old Value | Previous value |
| E | New Value | New value |
| F | Changed By | Who made the change (if available) |
| G | Column Changed | Which column was modified |
| H | Notes | Additional context |
| I | Rehire Date | For rehire tracking |

**Data Sources:** Automatic triggers on Employees sheet edits
**Data Consumers:** Historical reporting, Restore Employee function

---

### 5. Job Tracking
**Purpose:** Track job/crew lifecycle (start, end, status)

| Column | Name | Description |
|--------|------|-------------|
| A | Job Number | Crew job number |
| B | Location | Work location |
| C | Foreman | Crew foreman name |
| D | Crew Size | Number of employees |
| E | Start Date | When job becomes active |
| F | Est. End Date | Projected completion |
| G | Actual End Date | When completed |
| H | Status | Active, Pending Start, Completed, On Hold |
| I | Notes | Additional info |
| J | Last Updated | Timestamp |

**Data Sources:** Manual entry, Crew Import sync
**Data Consumers:** Crew Visit Config, Training Tracking, Safety Compliance Config (filters active crews only)

---

## Swap & Transaction Sheets

### 6. Glove Swaps
**Purpose:** Track pending and completed glove swaps

| Column | Name | Description |
|--------|------|-------------|
| A | Employee | Employee needing swap |
| B | Current Glove | Currently assigned glove # |
| C | Size | Required size |
| D | Date Assigned | When current glove was assigned |
| E | Change Out Date | Due date for swap |
| F | Days Left | Calculated days until due |
| G | Pick List | New glove # to issue |
| H | Status | Pending, Complete |
| I | Picked | Checkbox - item picked from inventory |
| J | Date Changed | When swap was completed |
| K-W | Hidden | Stage tracking columns |

**Data Sources:** `generateGloveSwaps()` function
**Data Consumers:** Task Metadata, Trip Planner, Inventory Reports

---

### 7. Sleeve Swaps
**Purpose:** Track pending and completed sleeve swaps

(Same structure as Glove Swaps)

**Data Sources:** `generateSleeveSwaps()` function
**Data Consumers:** Task Metadata, Trip Planner, Inventory Reports

---

### 8. Reclaims
**Purpose:** Track items returned from employees for testing/replacement

| Column | Name | Description |
|--------|------|-------------|
| A | Section | Header row for type |
| B | Item Type | Glove or Sleeve |
| C | Employee | Returning employee |
| D | Item # | Item being returned |
| E | Location | Employee's location |
| F | Size | Item size |
| G | Pick List Item # | Replacement item |
| H | Status | Pending, Picked, Complete |
| I | Picked | Checkbox |
| J | Date Changed | Completion date |

**Data Sources:** `updateReclaimsSheet()` function
**Data Consumers:** Task Metadata, Inventory Reports

---

## Scheduling & Task Sheets

### 9. Task Metadata ⭐ (Central Hub)
**Purpose:** Single source of truth for ALL task scheduling state

| Column | Name | Description |
|--------|------|-------------|
| A | TaskID | Unique identifier (SourceSheet_RowIndex_Date) |
| B | SourceSheet | Origin: Glove Swaps, Training Tracking, etc. |
| C | SourceRow | Row number in source sheet |
| D | Employee | Person assigned |
| E | TaskType | Swap, Training, Cert Expiring, Missing Safety Report |
| F | ItemType | Glove, Sleeve, CPR, Forklift, JHA, etc. |
| G | CurrentItem | Current item # (for swaps) |
| H | Location | Work location |
| I | Foreman | Crew foreman |
| J | PhoneNumber | Contact phone |
| K | DueDate | When task is due |
| L | ScheduledDate | Planned completion date |
| M | StartTime | Scheduled start time |
| N | EndTime | Scheduled end time |
| O | Status | Unassigned, Assigned, Complete, Overdue, Deferred |
| P | Priority | High, Medium, Low |
| Q | EstimatedTime | Minutes expected |
| R | Notes | Additional notes |
| S | CreatedDate | When record was created |
| T | CompletedDate | When marked complete |
| U | NotifiedDate | When notification sent |
| V | ScheduledClass | Training class info |
| W | ClassDate | Training class date |
| X | IsOffice | Boolean - office/phone task |
| Y | LastSyncDate | Last data refresh |
| Z | InMyChecklist | Boolean - in personal checklist |

**Data Sources:** `generateTaskMetadata()` reads from:
- Glove Swaps
- Sleeve Swaps
- Reclaims
- Training Tracking
- Employees (for cert expiration)
- Manual Tasks

**Data Consumers:** 
- ToDoSchedule.html (Task List)
- TripPlanner.html (Trip Planning)
- TimeBreakdown.html (Daily Accomplishments)
- Task Dashboard

---

### 10. Task Metadata Archive
**Purpose:** Store completed tasks older than X days

(Same structure as Task Metadata)

**Data Sources:** `archiveOldCompletedTasks()` function
**Data Consumers:** Historical reporting

---

### 11. Manual Tasks
**Purpose:** User-created tasks not from automatic generation

| Column | Name | Description |
|--------|------|-------------|
| A | Task Description | What needs to be done |
| B | Employee | Assigned employee |
| C | Location | Where |
| D | Due Date | When due |
| E | Status | Pending, Complete |
| F | Notes | Additional info |
| G | Created Date | When created |
| H | Locked | Cannot be moved |
| I | Allow Day Change | Flexibility flag |
| J | Allow Week Change | Flexibility flag |
| K | Allow Time Change | Flexibility flag |

**Data Sources:** TripPlanner.html, ToDoSchedule.html
**Data Consumers:** Task Metadata, Trip Planner

---

### 12. Training Tracking
**Purpose:** Track monthly training completion per crew

| Column | Name | Description |
|--------|------|-------------|
| A | Job Number | Crew identifier |
| B | Location | Crew location |
| C | Foreman | Crew lead name |
| D | Crew Size | Number of employees |
| E | Jan | January training status |
| F | Feb | February training status |
| ... | ... | One column per month |
| P | Dec | December training status |
| Q | Completion % | Annual completion percentage |

**Status Values:** Pending, Complete, Scheduled, N/A

**Data Sources:** Setup from Employees, updated via ToDoConfig.html
**Data Consumers:** Task Metadata, Training reports

---

### 13. Training Config
**Purpose:** Configure which training topics are required each month

| Column | Name | Description |
|--------|------|-------------|
| A | Month | January - December |
| B | Topic | Training topic name |
| C | Required | Checkbox - is this required |
| D | Crews Completed | Count of crews done |
| E | Total Crews | Total active crews |

**Data Sources:** Setup function, ToDoConfig.html
**Data Consumers:** Training Tracking, Task generation

---

### 14. Crew Visit Config
**Purpose:** Configure crew visit scheduling parameters

| Column | Name | Description |
|--------|------|-------------|
| A | Job Number | Crew identifier |
| B | Location | Crew location |
| C | Foreman | Crew lead |
| D | Crew Size | Number of employees |
| E | Visit Frequency | Weekly, Monthly, Quarterly |
| F | Estimated Time | Minutes per visit |
| G | Last Visit | Date of last visit |
| H | Next Visit | Scheduled next visit |
| I | Drive Time | Minutes from Helena |
| J | Priority | High, Medium, Low |
| K | Notes | Additional info |

**Data Sources:** Setup from Employees, refreshed automatically when Job Tracking changes
**Data Consumers:** Trip Planner route optimization

---

## Safety & Compliance Sheets

### 15. Safety Compliance
**Purpose:** Track JHA and Safety Meeting submissions per crew per week

| Column | Name | Description |
|--------|------|-------------|
| A | Week | Week start date (Sunday) |
| B | Job Number | Crew identifier |
| C | Foreman | Crew foreman |
| D | Sun | Sunday JHA status |
| E | Mon | Monday JHA status |
| F | Tue | Tuesday JHA status |
| G | Wed | Wednesday JHA status |
| H | Thu | Thursday JHA status |
| I | Fri | Friday JHA status |
| J | Sat | Saturday JHA status |
| K | Weekly Meeting | Weekly safety meeting status |
| L | Monthly Checklist | Monthly checklist status |
| M | Status | Complete, Missing Reports, Pending |

**Status Icons:**
- ✅ = Received on time
- ✅L = Received late
- ❌ = Missing
- ⏳ = Pending (week not over)
- N/A = Skipped per config

**Data Sources:** `calculateComplianceFromLogs()` reads from log sheets
**Data Consumers:** Compliance Dashboard, Missing Report Tasks

---

### 16. Safety Compliance Config
**Purpose:** Configure which days to skip for each crew

| Column | Name | Description |
|--------|------|-------------|
| A | Job Number | Crew identifier |
| B | Foreman | Crew foreman |
| C | Skip Sun | Checkbox |
| D | Skip Mon | Checkbox |
| E | Skip Tue | Checkbox |
| F | Skip Wed | Checkbox |
| G | Skip Thu | Checkbox |
| H | Skip Fri | Checkbox |
| I | Skip Sat | Checkbox |
| J | Skip Weekly | Skip weekly meeting |
| K | Skip Monthly | Skip monthly checklist |
| L | Notes | Additional info |

**Data Sources:** Manual configuration, auto-populated from Employees
**Data Consumers:** Safety Compliance calculations

---

### 17. Safety Equipment Needs
**Purpose:** Track equipment issues found in safety reports

| Column | Name | Description |
|--------|------|-------------|
| A | Report Date | Date of the report |
| B | Report Type | JHA, Safety Meeting, Fleet Checklist |
| C | Job Number | Crew identifier |
| D | Foreman | Crew foreman |
| E | Vehicle Number | Vehicle (for fleet checklists) |
| F | Equipment Type | Fire Extinguisher, Hot Stick, etc. |
| G | Issue Description | What's wrong |
| H | Status | Needs Attention, Ordered, Resolved |
| I | FE Test Date | Fire extinguisher test date |
| J | Source Email ID | Gmail message ID |
| K | Notes | Additional info |
| L | Email Subject | Original email subject |
| M | Received Date | When email was received |

**Data Sources:** `processSafetyEmails()` function
**Data Consumers:** Task creation, equipment tracking

---

### 18. JHA Log
**Purpose:** Audit log of all JHA emails processed

| Column | Name | Description |
|--------|------|-------------|
| A | Date Received | When email arrived |
| B | Report Date | JHA date from PDF |
| C | Job Number | Crew identifier |
| D | Foreman | Crew foreman |
| E | Status | Logged, Credited, Skipped |
| F | Email ID | Gmail message ID |
| G | Credited To | Which crew got credit |
| H | Notes | Late submission, etc. |

**Data Sources:** `processSafetyEmails()` via `logJHAEmail()`
**Data Consumers:** `calculateComplianceFromLogs()`

---

### 19. Weekly Safety Log
**Purpose:** Audit log of all Weekly Safety Meeting emails

(Similar structure to JHA Log)

**Data Sources:** `processSafetyEmails()` via `logWeeklySafetyEmail()`
**Data Consumers:** `calculateComplianceFromLogs()`

---

### 20. Monthly Checklist Log
**Purpose:** Audit log of all Monthly Fleet Checklist emails

| Column | Name | Description |
|--------|------|-------------|
| A | Date Received | When email arrived |
| B | Report Date | Report date |
| C | Job Number | Crew identifier |
| D | Foreman | Crew foreman |
| E | Vehicle Number | Vehicle # |
| F | Status | Logged, Credited |
| G | Email ID | Gmail message ID |
| H | Credited To | Which crew got credit |
| I | Notes | Additional info |

**Data Sources:** `processSafetyEmails()` via `logMonthlyChecklistEmail()`
**Data Consumers:** `calculateComplianceFromLogs()`

---

## Reporting & History Sheets

### 21. Purchase Needs
**Purpose:** Track items that need to be ordered

| Section | Description |
|---------|-------------|
| NEED TO ORDER | Items ready to purchase |
| READY FOR DELIVERY (SIZE UP) | Items picked, need sizing |
| IN TESTING | Items out for testing |
| IN TESTING (SIZE UP) | Testing items need sizing |
| SIZE UP ASSIGNMENTS | Pending size assignments |

**Data Sources:** `updatePurchaseNeeds()` function analyzes inventory
**Data Consumers:** PurchaseOrderDialog.html

---

### 22. Inventory Reports
**Purpose:** Summary statistics and status reports

| Section | Description |
|---------|-------------|
| Summary Statistics | Total counts by status |
| Glove Inventory | Detailed glove breakdown |
| Sleeve Inventory | Detailed sleeve breakdown |
| New Items Log | Recently added items |

**Data Sources:** `updateInventoryReports()` function
**Data Consumers:** Email reports, dashboards

---

### 23. Item History Lookup
**Purpose:** Search and display history for specific items

**Data Sources:** User queries, Gloves/Sleeves History
**Data Consumers:** LookupDialog.html

---

### 24. Gloves History / Sleeves History
**Purpose:** Historical record of all item changes

| Column | Name | Description |
|--------|------|-------------|
| A | Timestamp | When recorded |
| B | Item # | Item identifier |
| C | Change Type | Assignment, Status Change, etc. |
| D | Old Value | Previous state |
| E | New Value | New state |
| F | Employee | Related employee |

**Data Sources:** `saveHistory()` function snapshots
**Data Consumers:** Item History Lookup

---

## Configuration Sheets

### 25. Vendors
**Purpose:** Vendor contact info and pricing

| Column | Name | Description |
|--------|------|-------------|
| A | Vendor Name | Company name |
| B | Contact Name | Sales rep |
| C | Email | Contact email |
| D | Phone | Contact phone |
| E | Notes | Preferences, terms |
| F-K | Pricing | Class 0/2/3 Glove/Sleeve prices |

**Data Sources:** VendorConfig.html
**Data Consumers:** PurchaseOrderDialog.html

---

### 26. Purchase Orders
**Purpose:** Log of all purchase orders created

| Column | Name | Description |
|--------|------|-------------|
| A | Date | Order date |
| B | PO Number | 002-XX format |
| C | Vendor | Vendor name |
| D | Items | What was ordered |
| E | Total Price | Order total |
| F | Expected Delivery | When expected |
| G | Status | Ordered, Shipped, Received |
| H | Notes | Tracking info |

**Data Sources:** PurchaseOrderDialog.html
**Data Consumers:** Order history, reporting

---

### 27. Email Report Config
**Purpose:** Configure which report sections each recipient gets

| Column | Name | Description |
|--------|------|-------------|
| A | Email Address | Recipient |
| B | Inventory | Include inventory section |
| C | Purchase Needs | Include purchase section |
| D | Glove Swaps | Include glove swaps |
| E | Sleeve Swaps | Include sleeve swaps |
| F | Certs | Include expiring certs |
| G | Training | Include training status |
| H | Tasks | Include task summary |
| I | Calendar | Include 2-week calendar |
| J | Charts | Include charts |

**Data Sources:** Manual configuration
**Data Consumers:** `sendEmailReport()` function

---

### 28. Locations
**Purpose:** Master list of valid locations with drive times

| Column | Name | Description |
|--------|------|-------------|
| A | Location Name | Location identifier |
| B | Drive Time | Minutes from Helena |
| C | Direction | E, N, W, SW, Far |
| D | Can Overnight | Boolean |

**Data Sources:** Setup function
**Data Consumers:** Route optimization, Trip Planner

---

### 29. Expiring Certs
**Purpose:** Temporary sheet for cert task generation

**Data Sources:** Employees sheet cert columns
**Data Consumers:** Task Metadata generation

---

# HTML Dialog Descriptions

## Primary Interfaces

### QuickActions.html (Sidebar)
**Purpose:** Monday workflow - 6-step process for weekly tasks

**Steps:**
1. 📥 Import Crew Makeup
2. 📊 Generate All Reports
3. 🛡️ Process Safety Emails
4. 🎯 Generate Task Metadata
5. 📅 Review & Schedule
6. 💾 Save & Backup

**Server Functions Called:**
- `showCrewImportDialog()`
- `generateAllReports()`
- `showProcessSafetyEmailsDialog()`
- `generateTaskMetadata()`
- `showToDoSchedule()`
- `showTripPlannerDialog()`
- `saveAndBackup()`

---

### ToDoSchedule.html
**Purpose:** View and manage tasks across multiple categories

**Tabs:**
- My Tasks - Personal checklist
- Rubber Changes - Glove/Sleeve swaps
- Expiring Certs - Certification renewals
- Safety Compliance - Missing report tasks

**Server Functions Called:**
- `getTasksWithMetadata()` - Load all tasks
- `markTaskComplete()` - Complete a task
- `saveScheduleTaskDateChanges()` - Update task scheduling
- `recordTaskNotification()` - Mark as notified
- `toggleTaskChecklist()` - Add/remove from checklist

---

### TripPlanner.html
**Purpose:** Visual trip planning with drag-and-drop scheduling

**Features:**
- 2-week calendar view (Mon-Thu primary)
- Drag locations between days
- Individual task scheduling
- Route optimization
- Overtime tracking

**Server Functions Called:**
- `suggestOptimalTrips()` - Get trip suggestions
- `applyTripToSchedule()` - Save trip plan
- `getDriveTimeMap()` - Get travel times

---

### ProcessSafetyEmailsDialog.html
**Purpose:** Process Gmail for JHAs, Safety Meetings, Fleet Checklists

**Features:**
- Job number configuration
- Batch processing with progress
- Unknown job handling
- Late submission detection

**Server Functions Called:**
- `processSafetyEmails()` - Process emails
- `getJobForemanMappingsForDialog()` - Load job configs
- `applyUnknownJobDecisions()` - Handle unknown jobs

---

### ToDoConfig.html
**Purpose:** Configure scheduling settings

**Tabs:**
- Crew Visit Config
- Training Config
- Expiring Certs Config
- Excluded Job Prefixes

**Server Functions Called:**
- `getCrewVisitConfig()` / `saveCrewVisitConfig()`
- `getTrainingConfig()` / `saveTrainingConfig()`
- `getExpiringCertsConfig()` / `saveExpiringCertsConfig()`
- `getExcludedJobPrefixes()` / `saveExcludedJobPrefixes()`

---

## Secondary Dialogs

### CrewImport.html
**Purpose:** Import weekly crew makeup from Excel

**Features:**
- Drag-and-drop Excel upload
- Automatic crew detection
- Duplicate employee handling
- Secondary job tracking
- Job Tracking sync

**Server Functions Called:**
- `applyCrewChanges()` - Apply import changes
- `getCrewImportSettings()` - Load saved preferences
- `syncJobTrackingAfterImport()` - Update Job Tracking

---

### PurchaseOrderDialog.html
**Purpose:** Generate purchase orders

**Features:**
- Select items from Purchase Needs
- Choose vendor with pricing
- Generate PO text for email
- Send email directly

**Server Functions Called:**
- `getPurchaseOrderDialogData()` - Load items/vendors
- `processPurchaseOrder()` - Create and log PO
- `sendPurchaseOrderEmail()` - Send via Gmail

---

### TimeBreakdown.html
**Purpose:** Generate daily accomplishment summaries

**Features:**
- Date range selection
- Group by day and crew
- Calculate drive times
- Copy to clipboard

**Server Functions Called:**
- `getCompletedTasksForPeriod()` - Load completed tasks
- `getDriveTimeMap()` - Get travel times

---

### VendorConfig.html
**Purpose:** Manage vendor contact info and pricing

**Server Functions Called:**
- `getVendors()` / `saveVendors()`

---

### LookupDialog.html
**Purpose:** Search item history

**Server Functions Called:**
- `lookupItemHistory()` - Search by item #

---

### Other Dialogs
- `NewEmployeeDialog.html` - Add new employee
- `NewItemDialog.html` - Add new inventory item
- `FiscalYearConfig.html` - Configure fiscal year
- `ExpiringCertsImport.html` - Import cert dates
- `ExpiringCertsChoice.html` - Choose import method
- `ComplianceConfig.html` - Safety compliance settings
- `Dashboard.html` - Task statistics dashboard

---

# Data Flow Diagrams

## Master Data Flow

```
                              ┌─────────────────┐
                              │     GMAIL       │
                              │  (JHA, Safety   │
                              │   Meetings)     │
                              └────────┬────────┘
                                       │
                                       ▼
┌─────────────────┐           ┌─────────────────┐
│  EXCEL IMPORT   │           │ processSafety   │
│  (Crew Makeup)  │           │   Emails()      │
└────────┬────────┘           └────────┬────────┘
         │                             │
         ▼                             ▼
┌─────────────────┐           ┌─────────────────┐
│   Employees     │◄──────────│   Log Sheets    │
│    Sheet        │           │ (JHA, Weekly,   │
└────────┬────────┘           │  Monthly)       │
         │                    └────────┬────────┘
         │                             │
         ▼                             ▼
┌─────────────────┐           ┌─────────────────┐
│   Job Tracking  │           │    Safety       │
│    Sheet        │           │  Compliance     │
└────────┬────────┘           └─────────────────┘
         │                             │
         │◄────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────┐
│              REPORT GENERATION                  │
│  generateGloveSwaps() / generateSleeveSwaps()   │
│  updatePurchaseNeeds() / updateReclaimsSheet()  │
└────────────────────────┬────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────┐
│                 SOURCE SHEETS                   │
│  Glove Swaps │ Sleeve Swaps │ Reclaims │ etc.  │
└────────────────────────┬────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────┐
│            generateTaskMetadata()               │
│     Reads all sources → Creates Task Metadata   │
└────────────────────────┬────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────┐
│              TASK METADATA SHEET                │
│           (Single Source of Truth)              │
└────────────────────────┬────────────────────────┘
                         │
         ┌───────────────┼───────────────┐
         │               │               │
         ▼               ▼               ▼
┌─────────────┐  ┌─────────────┐  ┌─────────────┐
│  Task List  │  │Trip Planner │  │   Daily     │
│   Dialog    │  │   Dialog    │  │Accomplish.  │
└─────────────┘  └─────────────┘  └─────────────┘
```

---

## Swap Workflow Data Flow

```
┌─────────────┐
│  Employees  │ ──► Who needs equipment?
└──────┬──────┘
       │
       ▼
┌─────────────┐
│Gloves/Sleeves│ ──► What's assigned? When due?
└──────┬──────┘
       │
       ▼
┌─────────────────────────────────────┐
│      generateGloveSwaps()           │
│      generateSleeveSwaps()          │
│  Calculates who needs swaps based   │
│  on Change Out Date vs Today        │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│    Glove Swaps / Sleeve Swaps       │
│  Lists employees needing swaps      │
│  Status: Pending → Complete         │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│      generateTaskMetadata()         │
│  Creates tasks from swap sheets     │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│         Task Metadata               │
│  - ScheduledDate (when planned)     │
│  - Status (Assigned/Complete)       │
│  - CompletedDate (when done)        │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│         User Actions                │
│  - Schedule via Trip Planner        │
│  - Mark Complete in Task List       │
│  - Updates both Task Metadata       │
│    AND original Swap sheet          │
└─────────────────────────────────────┘
```

---

## Safety Compliance Data Flow

```
┌─────────────────────────────────────┐
│              GMAIL                  │
│  - Job Hazard Report emails         │
│  - Safety Meeting Report emails     │
│  - Weekly Safety Repairs emails     │
└──────────────┬──────────────────────┘
               │
               │ processSafetyEmails()
               ▼
┌─────────────────────────────────────┐
│         Parse Each Email            │
│  - Extract job number               │
│  - Extract report date (from PDF)   │
│  - Extract received date            │
│  - Detect late submissions          │
└──────────────┬──────────────────────┘
               │
       ┌───────┴───────┐
       │               │
       ▼               ▼
┌─────────────┐  ┌─────────────┐
│  JHA Log    │  │Weekly Safety│
│   Sheet     │  │    Log      │
└──────┬──────┘  └──────┬──────┘
       │               │
       └───────┬───────┘
               │
               │ calculateComplianceFromLogs()
               ▼
┌─────────────────────────────────────┐
│       Safety Compliance Sheet       │
│  Per crew per week:                 │
│  ✅ Mon │ ✅ Tue │ ❌ Wed │ ...     │
│  Creates ✅/❌/⏳ grid               │
└──────────────┬──────────────────────┘
               │
               │ createMissingReportTasks()
               ▼
┌─────────────────────────────────────┐
│         Task Metadata               │
│  TaskType: Missing Safety Report    │
│  ItemType: JHA, Weekly Meeting      │
│  → Appears in Task List             │
└─────────────────────────────────────┘
```

---

## Trip Planning Data Flow

```
┌─────────────────────────────────────┐
│       collectTasksForTripPlanner()  │
│  Reads from:                        │
│  - Task Metadata                    │
│  - Glove Swaps / Sleeve Swaps       │
│  - Reclaims                         │
│  - Training Tracking                │
│  - Manual Tasks                     │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│      suggestOptimalTrips()          │
│  - Groups by location               │
│  - Calculates urgency scores        │
│  - Considers drive times            │
│  - Suggests optimal route order     │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│       TripPlanner.html              │
│  - 2-week calendar view             │
│  - Drag/drop locations              │
│  - See drive times + crew times     │
│  - Manage overtime                  │
└──────────────┬──────────────────────┘
               │
               │ applyTripToSchedule()
               ▼
┌─────────────────────────────────────┐
│         Task Metadata               │
│  Updates:                           │
│  - ScheduledDate                    │
│  - StartTime / EndTime              │
│  - Status → Assigned                │
└─────────────────────────────────────┘
```

---

# Function Reference

## Core Report Generation

| Function | Purpose | Reads From | Writes To |
|----------|---------|------------|-----------|
| `generateGloveSwaps()` | Create glove swap list | Employees, Gloves | Glove Swaps |
| `generateSleeveSwaps()` | Create sleeve swap list | Employees, Sleeves | Sleeve Swaps |
| `updatePurchaseNeeds()` | Update purchase report | Gloves, Sleeves | Purchase Needs |
| `updateReclaimsSheet()` | Update reclaim list | Gloves, Sleeves | Reclaims |
| `updateInventoryReports()` | Update inventory summary | All inventory | Inventory Reports |
| `generateAllReports()` | Run all above | All | All |

## Task Management

| Function | Purpose | Reads From | Writes To |
|----------|---------|------------|-----------|
| `generateTaskMetadata()` | Create/update all tasks | All source sheets | Task Metadata |
| `getTasksWithMetadata()` | Load tasks for UI | Task Metadata | (returns data) |
| `markTaskComplete()` | Complete a task | Task Metadata | Task Metadata + Source |
| `saveScheduleTaskDateChanges()` | Update scheduling | (from UI) | Task Metadata |

## Safety Compliance

| Function | Purpose | Reads From | Writes To |
|----------|---------|------------|-----------|
| `processSafetyEmails()` | Process Gmail | Gmail API | Log sheets, Equipment |
| `calculateComplianceFromLogs()` | Calculate status | Log sheets | Safety Compliance |
| `createMissingReportTasks()` | Create missing report tasks | Safety Compliance | Task Metadata |

## Trip Planning

| Function | Purpose | Reads From | Writes To |
|----------|---------|------------|-----------|
| `collectTasksForTripPlanner()` | Gather all tasks | All source sheets | (returns data) |
| `suggestOptimalTrips()` | Optimize routes | Tasks, Locations | (returns suggestions) |
| `applyTripToSchedule()` | Save trip plan | (from UI) | Task Metadata |

---

# Appendix: Sheet Tab Colors

| Sheet | Color | Category |
|-------|-------|----------|
| Employees | Blue | Core |
| Gloves | Green | Inventory |
| Sleeves | Green | Inventory |
| Glove Swaps | Orange | Transactions |
| Sleeve Swaps | Orange | Transactions |
| Task Metadata | Purple | Scheduling |
| Safety Compliance | Red | Safety |
| Training Tracking | Yellow | Training |
| Purchase Needs | Teal | Reporting |

---

*This document was auto-generated from the Rubber Tracker codebase.*
*For questions, contact the system administrator.*

