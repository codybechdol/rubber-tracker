# Rubber Tracker - Workflow & Sheet Expectations

> **Reference File**: Always compare against `Old Versions/Last_Good.gs` before approving any code changes to ensure functionality is preserved.

> **Code Refactoring (Jan 2026)**: Dead code was removed and column constants (`COLS`) were added. See `src/Code.gs` for the `COLS` object that documents all fixed column positions.

---

## Table of Contents
1. [Overview](#overview)
2. [Sheet Structures](#sheet-structures)
   - [Gloves Sheet](#gloves-sheet)
   - [Sleeves Sheet](#sleeves-sheet)
   - [Employees Sheet](#employees-sheet)
   - [Glove Swaps Sheet](#glove-swaps-sheet)
   - [Sleeve Swaps Sheet](#sleeve-swaps-sheet)
   - [Reclaims Sheet](#reclaims-sheet)
   - [To-Do List Sheet](#to-do-list-sheet)
3. [Change Out Date Rules](#change-out-date-rules)
4. [Swap Workflow Stages](#swap-workflow-stages)
5. [Cell Interactions & Triggers](#cell-interactions--triggers)
6. [Pick List Logic](#pick-list-logic)
7. [Reclaims Auto Pick List](#reclaims-auto-pick-list)
8. [Status Values](#status-values)
9. [Location Handling](#location-handling)
10. [To-Do List](#to-do-list)
11. [Lost Items - Need to Locate](#lost-items---need-to-locate-feature)

---

## Overview

The Rubber Tracker system manages the lifecycle of rubber gloves and sleeves used by employees. It tracks:
- Inventory of gloves and sleeves
- Assignment to employees
- Testing cycles
- Change-out schedules
- Swap workflows when items need replacement
- Reclaims (class downgrades) when location approval changes
- Consolidated To-Do List for weekly planning

---

## Sheet Structures

### Gloves Sheet

**Purpose**: Master inventory of all gloves.

| Column | Header | Description |
|--------|--------|-------------|
| A | Item # | Unique identifier for the glove |
| B | Size | Glove size (e.g., 9, 9.5, 10, 10.5, 11) |
| C | Class | Safety class (0, 2, or 3) |
| D | Test Date | Date of last electrical test |
| E | Date Assigned | Date the glove was assigned to current holder |
| F | Location | Physical location (Helena, Butte, Bozeman, etc.) |
| G | Status | Current status (Assigned, On Shelf, In Testing, etc.) |
| H | Assigned To | Employee name or status holder (On Shelf, Packed For Delivery, etc.) |
| I | Change Out Date | Calculated date when glove needs replacement |
| J | Picked For | Employee name when item is picked for a swap (format: "Employee Name Picked On YYYY-MM-DD") |
| K | Notes | Optional notes |

**Key Behaviors**:
- When **Assigned To** is changed:
  - Status updates automatically based on the value
  - Location updates based on employee's location (from Employees sheet)
  - Change Out Date recalculates based on Date Assigned + interval rules
- When **Date Assigned** is changed:
  - Change Out Date recalculates automatically

---

### Sleeves Sheet

**Purpose**: Master inventory of all sleeves.

| Column | Header | Description |
|--------|--------|-------------|
| A | Item # | Unique identifier for the sleeve |
| B | Size | Sleeve size |
| C | Class | Safety class (2 or 3) |
| D | Test Date | Date of last electrical test |
| E | Date Assigned | Date the sleeve was assigned to current holder |
| F | Location | Physical location |
| G | Status | Current status |
| H | Assigned To | Employee name or status holder |
| I | Change Out Date | Calculated date when sleeve needs replacement |
| J | Picked For | Employee name when item is picked for a swap |
| K | Notes | Optional notes |

**Key Behaviors**: Same as Gloves sheet.

---

### Employees Sheet

**Purpose**: Master list of employees and their rubber equipment preferences.

| Column | Header | Description |
|--------|--------|-------------|
| A | Name | Employee full name |
| B | Class | Employee's approved class level |
| C | Location | Employee's work location |
| D | Job Number | Employee's job number |
| E | Phone Number | Contact phone |
| F | Notification Emails | Email addresses for notifications |
| G | MP Email | MP email |
| H | Email Address | Primary email |
| I | Glove Size | Preferred glove size |
| J | Sleeve Size | Preferred sleeve size |
| K | Hire Date | Date employee was hired |
| L | Last Day | Date employee left (triggers auto-archive) |
| M | Last Day Reason | Dropdown: Quit, Fired, Laid Off |

**Key Behaviors**:
- Used to look up employee locations when assigning items
- Used to determine preferred sizes for Pick List matching
- When **Last Day** is filled in:
  1. Creates a "Terminated" entry in Employee History
  2. Changes Location to "Previous Employee"
  3. Removes the employee row from the Employees sheet
- Missing headers are automatically added by Build Sheets

---

### Employee History Sheet

**Purpose**: Tracks the complete lifecycle of ALL employees - from hire date through location/job changes to termination and potential rehire. Every current and previous employee should have entries here.

| Column | Header | Description |
|--------|--------|-------------|
| A | Date | Date of the event |
| B | Employee Name | Employee full name |
| C | Event Type | Type of event: Current State, Location Change, Job Number Change, Location & Job # Change, Terminated, Rehired |
| D | Location | Location at time of event |
| E | Job Number | Job number at time of event |
| F | Hire Date | Employee's original hire date |
| G | Last Day | Employee's last day (only for Terminated events) |
| H | Last Day Reason | Quit, Fired, or Laid Off (only for Terminated events) |
| I | Rehire Date | Date employee was rehired (triggers re-add to Employees sheet) |
| J | Notes | Additional notes (e.g., "From: Helena → Butte") |

**Event Types**:
- **Current State** - Initial entry when employee is first tracked (created automatically before first change is logged)
- **Location Change** - When employee's location changes
- **Job Number Change** - When employee's job number changes (only significant changes - see below)
- **Location & Job # Change** - When both location and job number change
- **Terminated** - When employee leaves (Last Day filled in or archived)
- **Rehired** - When a terminated employee is rehired (Rehire Date filled in)

**Job Number Change Tracking**:
- Only the significant portion of job numbers is tracked (###-## or ###.## format)
- Changes to the suffix (e.g., `.1` to `.2`) are NOT logged
- Example: `002-26.1` → `002-26.2` = NOT logged (same significant portion)
- Example: `002-26` → `005-26` = LOGGED (different significant portion)

**Key Behaviors**:
- **Automatic Tracking on Edit**: When Location or Job Number is edited on Employees sheet:
  1. If employee has no history, creates "Current State" entry with pre-change values
  2. Creates appropriate change entry (Location Change, Job Number Change)
- **handleLastDayChange**: When Last Day is filled in on Employees sheet:
  1. Creates "Terminated" entry in Employee History
  2. **Removes employee from Employees sheet**
- **Archive Previous Employees** (menu option):
  1. Archives employees with "Previous Employee" location
  2. **Removes them from Employees sheet**
- **handleRehireDateChange**: When Rehire Date is filled in on a Terminated row:
  1. Prompts for new Location
  2. Prompts for new Job Number
  3. Creates new row on Employees sheet with rehire date as new Hire Date
  4. Adds "Rehired" entry to Employee History
- History entries are never deleted - complete audit trail

---

### Glove Swaps Sheet

**Purpose**: Tracks gloves that need to be swapped out and the swap workflow.

#### Visible Columns (A-J)

| Column | Header | Description |
|--------|--------|-------------|
| A | Employee | Employee name who needs a swap |
| B | Current Glove # | Item number of their current glove |
| C | Size | Size of current glove |
| D | Date Assigned | When current glove was assigned |
| E | Change Out Date | When current glove needs replacement |
| F | Days Left | Days until change out (or "OVERDUE") |
| G | Pick List Item # | Item number of replacement glove (auto or manual) |
| H | Status | Status of the Pick List item |
| I | Picked | Checkbox - TRUE when item is physically picked |
| J | Date Changed | Date the swap was completed (MM/DD/YYYY format) |

#### Hidden Columns (K-W) - Stage Data

| Columns | Stage | Header | Description |
|---------|-------|--------|-------------|
| K-M | Stage 1 | Pick List Glove Before Check | Original state of Pick List item before picking |
| K | | Status | Original status (e.g., "On Shelf") |
| L | | Assigned To | Original assigned to (e.g., "On Shelf") |
| M | | Date Assigned | Original date assigned |
| N-P | Stage 1 | Old Glove Assignment | Current glove's assignment info |
| N | | Status | Current glove status (e.g., "Assigned") |
| O | | Assigned To | Current glove assigned to (employee name) |
| P | | Date Assigned | Current glove date assigned |
| Q-T | Stage 2 | Pick List Glove After Check | State after Picked checkbox is checked |
| Q | | Status | New status (e.g., "Ready For Delivery") |
| R | | Assigned To | New assigned to (e.g., "Packed For Delivery") |
| S | | Date Assigned | Date of picking |
| T | | Picked For | "Employee Name Picked On YYYY-MM-DD" |
| U-W | Stage 3 | Pick List Glove New Assignment | Final state after swap completion |
| U | | Assigned To | Employee name |
| V | | Date Assigned | Date Changed value |
| W | | Change Out Date | Calculated new change out date |

#### Row Types
- **Class Header**: "Class 0 Glove Swaps", "Class 2 Glove Swaps", "Class 3 Glove Swaps"
- **Stage Headers**: "STAGE 1", "STAGE 2", "STAGE 3" labels
- **Column Headers**: "Employee", "Current Glove #", etc.
- **Location Sub-headers**: "📍 Helena", "📍 Butte", etc.
- **Data Rows**: Actual swap entries

---

### Sleeve Swaps Sheet

**Purpose**: Same structure as Glove Swaps but for sleeves.

- Same column layout (A-W)
- Classes: 2 and 3 only (no Class 0 sleeves)
- Same stage workflow

---

### Reclaims Sheet

**Purpose**: Tracks items that need to be reclaimed based on location approval changes.

#### Tables on Reclaims Sheet

1. **Previous Employee Reclaims** - Items assigned to employees who have left
2. **Approved Class 3 Locations** - Location approval settings (None, CL2, CL3, CL2 & CL3)
3. **Class 3 Reclaims** - Class 3 items that need to be downgraded to Class 2
4. **Class 2 Reclaims** - Class 2 items that need to be UPGRADED to Class 3
5. **Lost Items - Need to Locate** - Items marked with LOST-LOCATE in Notes

#### Class 3/2 Reclaims Table Columns

| Column | Header | Description |
|--------|--------|-------------|
| A | Employee | Employee who has the item |
| B | Item Type | Glove or Sleeve |
| C | Item # | Item number to reclaim |
| D | Size | Item size |
| E | Class | Current class (3 or 2) |
| F | Location | Employee's location |
| G | Pick List Item # | Auto-assigned replacement item |
| H | Pick List Status | Status of replacement item (includes Size Up info) |

**Key Behaviors**:
- Sorted by Location, then Employee name (for route planning)
- Auto Pick List runs AFTER swap pick lists (swaps get priority)
- **Class 3 Reclaims** (employee has CL3 in non-approved location):
  - Needs DOWNGRADE to Class 2
  - If employee already has a CL2 item assigned → "Already Has CL2 ✅"
- **Class 2 Reclaims** (employee has CL2 in CL3-only location):
  - Needs UPGRADE to Class 3
  - If employee already has a CL3 item assigned → "Already Has CL3 ✅"
- Size Up rules apply (like swaps): Status shows "(Size Up) ⚠️" if needed

---

### To-Do List Sheet

**Purpose**: Consolidated action list for weekly planning, combining tasks from Swaps and Reclaims.

| Column | Header | Description |
|--------|--------|-------------|
| A | ☑ Done | Checkbox - mark when task is complete |
| B | Priority | 1=High (red), 2=Medium (orange), 3=Low |
| C | Task Type | Swap, Reclaim CL3→CL2, Reclaim CL2→CL3 |
| D | Employee | Who needs the item |
| E | Location | Employee's location (for route planning) |
| F | Current Item # | Item to replace/reclaim |
| G | Pick List # | Replacement item number |
| H | Item Type | Glove or Sleeve |
| I | Class | Safety class |
| J | Due Date | Change Out Date or "ASAP" for reclaims |
| K | Days Left | Days until due (OVERDUE if past) |
| L | Status | Pending, Picked, Item Assigned, etc. |
| M | Notes | User notes (preserved on regeneration) |

**Key Features**:
- **Grouped by Location** - For efficient route planning
- **Sorted by Priority** - Overdue items first, then urgent items
- **Preserved Data** - Done checkmarks and Notes survive regeneration
- **Color Coding**:
  - Green row = Task completed
  - Red Priority cell = High priority (overdue or ≤7 days)
  - Orange Priority cell = Medium priority (≤14 days)
  - Red Days Left = OVERDUE
  - Orange Days Left = ≤7 days

**Menu**: Glove Manager → 📝 To-Do List → Generate To-Do List

---

## Change Out Date Rules

### Gloves

| Assigned To | Location | Interval | Example |
|-------------|----------|----------|---------|
| Employee | Northern Lights | **6 months** | 01/01/2025 → 07/01/2025 |
| Employee | All other locations | **3 months** | 01/01/2025 → 04/01/2025 |
| On Shelf | Any | **12 months** | 01/01/2025 → 01/01/2026 |
| In Testing | Any | **3 months** (counts toward employee period) | Same as assigned |
| Packed For Delivery | Any | **3 months** (counts toward employee period) | Same as assigned |
| Packed For Testing | Any | **3 months** (counts toward employee period) | Same as assigned |
| Lost | Any | **N/A** | N/A |
| Failed Rubber | Any | **N/A** | N/A |

### Sleeves

| Assigned To | Location | Interval | Example |
|-------------|----------|----------|---------|
| Employee | Any | **12 months** | 01/01/2025 → 01/01/2026 |
| On Shelf | Any | **12 months** | 01/01/2025 → 01/01/2026 |
| Lost | Any | **N/A** | N/A |
| Failed Rubber | Any | **N/A** | N/A |

### Automatic Calculation

Change Out Date is automatically recalculated when:
1. **Date Assigned** column is edited (via installable trigger)
2. **Assigned To** column is edited (via installable trigger)
3. **Build Sheets** is run (automatic fix for all rows)
4. **Generate All Reports** is run (automatic fix for all rows)
5. **Fix All Change Out Dates** utility is run manually

> **Note**: If the edit trigger doesn't fire (e.g., paste operations), the Change Out Date will be corrected automatically when you run Build Sheets or Generate All Reports.

---

## Swap Workflow Stages

### Stage 1: Initial State (Swap Generated)

**Trigger**: Build Sheets or Generate Swaps is run

**What Happens**:
1. System identifies employees with items approaching change out (≤31 days or overdue)
2. For each employee needing a swap:
   - Searches for available replacement item (see [Pick List Logic](#pick-list-logic))
   - Stores original state of Pick List item in columns K-M
   - Stores current item assignment info in columns N-P
3. Picked checkbox = FALSE
4. Date Changed = empty

**Visible State**:
- Status shows availability: "In Stock ✅", "Ready For Delivery 🚚", "Need to Purchase ❌", etc.
- Picked = FALSE

### Stage 2: Item Picked

**Trigger**: User checks the Picked checkbox (column I)

**What Happens**:
1. Pick List item in Gloves/Sleeves sheet is updated:
   - Status → "Ready For Delivery"
   - Assigned To → "Packed For Delivery"
   - Date Assigned → Today's date
   - Change Out Date → Calculated (3 months for gloves, 12 months for sleeves)
   - Location → "Cody's Truck"
   - Picked For → "Employee Name Picked On YYYY-MM-DD"
2. Stage 2 columns (Q-T) are populated with new state
3. Swap sheet Status updates to "Ready For Delivery 🚚"

**Visible State**:
- Picked = TRUE ✓
- Status = "Ready For Delivery 🚚"
- Date Changed = still empty

**Preservation**: Items with Picked=TRUE survive Build Sheets/Generate Reports because:
- The **Picked For** column (Column J) in Gloves/Sleeves sheet stores "Employee Name Picked On YYYY-MM-DD"
- When `generateSwaps()` runs, it:
  1. Pre-collects all items with Picked For values from the inventory sheet
  2. For each employee needing a swap, FIRST checks if they have a Picked For item
  3. If found, uses that item and sets Picked=TRUE, preserving Stage 2 data
  4. Only searches for new items if no Picked For match exists
- This ensures that once an item is physically picked, it stays assigned even after regenerating reports

**Location Sorting**: Swap sheets are sorted by:
1. Class (Class 0, then Class 2, then Class 3 for gloves; Class 2, then Class 3 for sleeves)
2. Location (alphabetically within each class) - displayed with 📍 headers
3. Change Out Date (within each location)

**Important**: The Gloves/Sleeves sheets are the **source of truth** for picked items. The swap sheets are regenerated from this data.

### Stage 3: Swap Completed

**Trigger**: User enters a date in Date Changed column (column J)

**What Happens**:
1. **Pick List item** (NEW glove/sleeve) in inventory:
   - Status → "Assigned"
   - Assigned To → Employee name
   - Date Assigned → Date Changed value
   - Change Out Date → Calculated based on employee location and item type
   - Location → Employee's location
   - Picked For → Cleared

2. **Old item** (employee's CURRENT glove/sleeve) in inventory:
   - Status → "Ready For Test"
   - Assigned To → "Packed For Testing"
   - Date Assigned → Date Changed value
   - Change Out Date → Calculated (3 months for gloves, 12 months for sleeves)
   - Location → "Cody's Truck"

3. Stage 3 columns (U-W) populated with final assignment info

4. Swap sheet visible columns updated:
   - Status → "Assigned"
   - Days Left → "Assigned"

**Visible State**:
- Picked = TRUE ✓
- Date Changed = MM/DD/YYYY
- Status = "Assigned"
- Days Left = "Assigned"

### Stage 4: Revert (Date Changed Cleared)

**Trigger**: User clears the Date Changed value

**What Happens**:
1. **Pick List item** reverts to Stage 2 state:
   - Status → "Ready For Delivery"
   - Assigned To → "Packed For Delivery"
   - Date Assigned → Original Stage 2 date
   - Change Out Date → Recalculated (3 months for gloves, 12 months for sleeves)
   - Location → "Cody's Truck"
   - Picked For → Restored
   
2. **Old item** reverts to Stage 1 state:
   - Status → Original status (e.g., "Assigned")
   - Assigned To → Employee name
   - Date Assigned → Original date
   - Change Out Date → Recalculated based on employee location
   - Location → Employee's location
   
3. Stage 3 columns (U-W) cleared
4. Swap visible columns revert to Stage 2 display

### Stage 5: Unpick (Picked Unchecked)

**Trigger**: User unchecks the Picked checkbox

**What Happens**:
1. Pick List item reverts to Stage 1 state in inventory:
   - Status → Original status (e.g., "On Shelf")
   - Assigned To → Original value (e.g., "On Shelf")
   - Date Assigned → Original date from Stage 1 columns
   - Change Out Date → Recalculated based on reverted assignment
   - Location → "Helena" (default for On Shelf items)
   - Picked For → Cleared
2. Stage 2 columns (Q-T) cleared
3. Stage 3 columns (U-W) cleared (if Date Changed was set)
4. Date Changed column cleared
5. Swap visible columns revert to Stage 1 display

---

## Cell Interactions & Triggers

### Gloves/Sleeves Sheet Triggers

| Column Edited | Action |
|---------------|--------|
| Assigned To (H) | Updates Status, Location, and Change Out Date |
| Date Assigned (E) | Recalculates Change Out Date |

### Glove/Sleeve Swaps Sheet Triggers

| Column Edited | Action |
|---------------|--------|
| Pick List Item # (G) | Updates Status, applies light blue background, stores Stage 1 data |
| Picked (I) | Triggers Stage 2 (checked) or Stage 5 (unchecked) |
| Date Changed (J) | Triggers Stage 3 (date entered) or Stage 4 (cleared) |

---

## Pick List Logic

When generating swaps, the system searches for replacement items in this order:

### Search Priority (Gloves)

1. **Exact size, On Shelf** - Best match
2. **Size up (+0.5), On Shelf** - Acceptable if exact not available
3. **Exact size, Ready For Delivery or In Testing** - In pipeline
4. **Size up (+0.5), Ready For Delivery or In Testing** - In pipeline, larger

### Search Priority (Sleeves)

1. **Exact size, On Shelf** - Best match
2. **Exact size, Ready For Delivery or In Testing** - In pipeline

### Reservation System

Items with a **Picked For** value are reserved:
- Only the named employee can be assigned that item
- Other employees' searches skip reserved items
- Prevents conflicts when regenerating reports

### Manual Override

Users can manually enter any item number in Pick List column (G):
- **Visual Indicator**: Cell gets light blue background (#e3f2fd) to indicate manual entry
- **Status Marker**: "(Manual)" is appended to the Status column (H) if not already present
- **Preservation**: Manual entries are preserved when regenerating swap sheets:
  - Before regeneration: System collects all manually-edited Pick List items (identified by light blue background)
  - After regeneration: System restores manual entries to matching employee rows
  - This ensures manual picks survive the "Generate All Reports" process
- **How to manually edit**:
  1. Type or paste an item number in the Pick List column (G)
  2. The cell will automatically turn light blue and Status will show "(Manual)"
  3. Manual entry remains even after running Generate All Reports

---

## Reclaims Auto Pick List

Reclaims use a pick list system to find replacement items when employees need class changes.

### How It Works

1. **Runs After Swaps** - Reclaims pick list runs AFTER Glove/Sleeve Swaps to respect their priority
2. **Collects Reserved Items** - Gathers all items already assigned in swaps (including Picked For)
3. **Checks Existing Assignments First** - Before searching for items, checks if employee already has the target class
4. **Searches for Replacements** using same priority as swaps (exact size On Shelf, size up, etc.)

### Reclaim Types

| Reclaim Type | Situation | Action | Target Class |
|--------------|-----------|--------|--------------|
| **Class 3 Reclaims** | Employee has CL3 item in location NOT approved for CL3 | DOWNGRADE | Class 2 |
| **Class 2 Reclaims** | Employee has CL2 item in location approved for CL3 ONLY | UPGRADE | Class 3 |

### Smart Skip Logic

Before searching for a replacement item, the system checks if the employee already has the target class:
- **Class 3 Reclaim**: If employee already has a Class 2 item → "Reclaim Only - Has CL2 ✅" (just reclaim the CL3, no replacement needed)
- **Class 2 Reclaim**: If employee already has a Class 3 item → "Reclaim Only - Has CL3 ✅" (just reclaim the CL2, no replacement needed)

This prevents unnecessary item assignments when the employee already has the appropriate class item.

### Reclaim Pick List Status Values

| Status | Meaning |
|--------|---------|
| In Stock ✅ | Target class item available on shelf |
| In Stock (Size Up) ⚠️ | Target class item available, +0.5 size |
| Ready For Delivery 🚚 | Target class item in transit |
| Ready For Delivery (Size Up) ⚠️ | Target class item in transit, +0.5 size |
| In Testing ⏳ | Target class item being tested |
| In Testing (Size Up) ⚠️ | Target class item being tested, +0.5 size |
| Reclaim Only - Has CL2 ✅ | Employee already has a Class 2 item (just reclaim the CL3) |
| Reclaim Only - Has CL3 ✅ | Employee already has a Class 3 item (just reclaim the CL2) |
| Need to Purchase ❌ | No suitable target class item found |

---

## Status Values

### Inventory Status (Gloves/Sleeves)

| Status | Description | Location |
|--------|-------------|----------|
| Assigned | Assigned to an employee | Employee's location |
| On Shelf | Available in stock | Storage location |
| In Testing | Currently being tested | Testing facility |
| Ready For Delivery | Packed and ready to ship | Cody's Truck |
| Ready For Test | Returned, awaiting testing | Cody's Truck |
| Packed For Delivery | (Assigned To value) | Cody's Truck |
| Packed For Testing | (Assigned To value) | Cody's Truck |
| Failed Rubber | Failed electrical test | N/A |
| Lost | Item is lost | N/A |

### Swap Status Display

| Display | Meaning |
|---------|---------|
| In Stock ✅ | Pick List item is On Shelf, exact size |
| In Stock (Size Up) ⚠️ | Pick List item is On Shelf, +0.5 size |
| Ready For Delivery 🚚 | Pick List item is Ready For Delivery |
| Ready For Delivery (Size Up) ⚠️ | Ready For Delivery, +0.5 size |
| In Testing ⏳ | Pick List item is In Testing |
| In Testing (Size Up) ⚠️ | In Testing, +0.5 size |
| Need to Purchase ❌ | No suitable item available |
| Item Not Found ❓ | Manually entered item doesn't exist |
| Already Assigned ⚠️ | Item is already assigned to someone |

---

## Location Handling

### Employee Location Lookup

When an item is assigned to an employee:
1. System looks up employee in Employees sheet
2. Gets their Location value
3. Sets item's Location to match

### Special Locations

| Assigned To | Location Set To |
|-------------|-----------------|
| On Shelf | Storage location (Helena, etc.) |
| Packed For Delivery | Cody's Truck |
| Packed For Testing | Cody's Truck |
| In Testing | Testing facility |
| Employee Name | Employee's location from Employees sheet |

### Location-Based Intervals

| Location | Glove Interval |
|----------|---------------|
| Northern Lights | 6 months |
| All others | 3 months |

---

## Days Left Styling

| Condition | Style |
|-----------|-------|
| OVERDUE (< 0 days) | Bold, Red (#ff5252) |
| ≤ 14 days | Bold, Orange (#ff9800) |
| > 14 days | Normal, Green (#388e3c) |
| "Assigned" | Bold, Green (#2e7d32) |

---

## To-Do List

The To-Do List is a consolidated action sheet for weekly planning that combines tasks from:
- Glove Swaps
- Sleeve Swaps  
- Reclaims (Class 3 and Class 2)

### Generating the To-Do List

**Menu**: Glove Manager → 📝 To-Do List → Generate To-Do List

This will:
1. Collect all pending swap tasks (items not yet completed with Date Changed)
2. Collect all reclaim tasks from Reclaims sheet
3. Group items by **Location** for efficient route planning
4. Sort by **Priority** within each location (overdue first)
5. Preserve any existing **Done checkmarks** and **Notes**

### Priority Levels

| Priority | Criteria | Color |
|----------|----------|-------|
| 1 - High | OVERDUE or ≤7 days left | Red |
| 2 - Medium | 8-14 days left, or reclaims with item available | Orange |
| 3 - Low | >14 days left, or reclaims needing purchase | None |

### Task Statuses

| Status | Meaning |
|--------|---------|
| Pending | Task not started |
| Item Assigned | Pick List item has been assigned |
| Picked - Ready to Deliver | Picked checkbox is checked |
| Need to Order | No Pick List item available |
| Reclaim Pending | Reclaim task not started |
| Replacement Available | Reclaim has lower-class item available |
| Complete | Task marked as Done |

### Using the To-Do List

1. **Generate** the list using the menu
2. **Plan your week** - Items are grouped by location
3. **Mark tasks done** - Check the ☑ Done checkbox when complete
4. **Add notes** - Use the Notes column for additional info
5. **Clear completed** - Use "Clear Completed Tasks" to remove done items
6. **Regenerate** - Your Done marks and Notes are preserved

### Clear Completed Tasks

**Menu**: Glove Manager → 📝 To-Do List → Clear Completed Tasks

Removes all rows where ☑ Done is checked.

---

## Utility Functions

### Create Backup Snapshot

**Menu**: Glove Manager → 🔧 Utilities → 💾 Create Backup Snapshot

Creates a complete copy of the entire workbook and saves it to Google Drive.

**Features**:
- Saves to a folder called "Glove Manager Backups" in your Google Drive
- Filename format: `[Workbook Name] - Backup YYYY-MM-DD_HH-mm-ss`
- Shows a dialog with links to the backup and backup folder
- Logged in History

### View Backup Folder

**Menu**: Glove Manager → 🔧 Utilities → 📂 View Backup Folder

Opens the "Glove Manager Backups" folder in Google Drive in a new tab.

### Auto Backup (Time-Driven)

You can set up automatic backups using Google Apps Script triggers:

1. Go to Extensions → Apps Script
2. Click the clock icon (Triggers) in the left sidebar
3. Click "Add Trigger"
4. Configure:
   - Function: `autoBackup`
   - Event source: Time-driven
   - Type: Day timer (or your preference)
   - Time: Select preferred time

The `autoBackup` function:
- Creates a backup snapshot
- Automatically deletes old backups (keeps the 10 most recent)

### Fix All Change Out Dates

**Menu**: Glove Manager → 🔧 Utilities → Fix All Change Out Dates

Recalculates ALL Change Out Dates in Gloves and Sleeves sheets based on current rules.

### Build Sheets

**Menu**: Glove Manager → Build Sheets

Regenerates Glove Swaps and Sleeve Swaps sheets, preserving picked items.

### Generate All Reports

**Menu**: Glove Manager → Generate All Reports

Runs all report generation functions:
- Generate Glove Swaps
- Generate Sleeve Swaps
- Update Purchase Needs
- Update Inventory Reports
- Update Reclaims Sheet

### Update Purchase Needs

**Menu**: Glove Manager → Update Purchase Needs

Generates a comprehensive report of items that need to be ordered. Pulls data from:
- **Glove Swaps** - Items with "Need to Purchase ❌" status
- **Sleeve Swaps** - Items with "Need to Purchase ❌" status  
- **Reclaims** - Items with "Need to Purchase ❌" status

#### Purchase Needs Sheet Sections

1. **Summary Stats** - Quick counts: Need to Order, Size Up, Low Stock
2. **Items to Order** - Consolidated list by Item Type, Class, Size
3. **Reclaim Replacements Needed** - Detailed list of reclaim items needing replacement
4. **Low Stock Warning** - Sizes/classes with 0 items on shelf
5. **Size Up Details** - Items where employee is getting a larger size than preferred

#### Reclaim Integration

When reclaim items have "Need to Purchase ❌" status, they are:
- Added to the main "Need to Order" count
- Listed separately in "Reclaim Replacements Needed" section with:
  - Employee name
  - Item type (Glove/Sleeve)
  - Size
  - Current class (the class they have)
  - Target class (the class they need)
  - Reclaim type (CL3→CL2 or CL2→CL3)

---

## Lost Items - Need to Locate Feature

### Purpose
Track items that have been misplaced or cannot be located. Rather than changing the item's Status to "Lost" (which implies it's permanently gone), users can mark an item as needing to be located while preserving its current assignment information.

### How to Mark an Item for Locate

1. **In Gloves or Sleeves sheet**, find the item you can't locate
2. **In the Notes column (Column K)**, type one of the following (case-insensitive):
   - `LOST-LOCATE`
   - `LOST LOCATE`
   - `LOCATE`

### Visual Highlighting
When an item is marked with the LOST-LOCATE marker:
- **Entire row** gets a light orange/red background (#ffccbc)
- **Notes cell** gets bold red text
- This makes it easy to spot items that need to be located when scanning the sheet

### Reclaims Sheet Integration
Items marked with LOST-LOCATE will automatically appear in the **"🔍 Lost Items - Need to Locate"** section on the Reclaims sheet when you run:
- **Generate All Reports**
- **Update Reclaims Sheet**

The table shows:
| Column | Description |
|--------|-------------|
| Item Type | Glove or Sleeve |
| Item # | The item number |
| Size | Item size |
| Class | Safety class |
| Last Location | Where the item was last known to be |
| Last Assigned To | Who had it last |
| Date Assigned | When it was assigned |
| Notes | The full notes content |

### Clearing the Marker
To remove an item from the Lost Items list:
1. **Clear or modify the Notes column** to remove the LOST-LOCATE marker
2. The row highlighting will automatically clear
3. The item will no longer appear on the Reclaims Lost Items table after next report generation

### Important Notes
- This feature **preserves** the item's Status, Location, and Assignment
- It does NOT change the item to "Lost" status
- Use this for items you're actively trying to locate
- Use Status = "Lost" only for items that are permanently gone

---

## Reference File

**Always compare against**: `Old Versions/Last_Good.gs`

Before approving any code changes:
1. Review the proposed changes
2. Compare against Last_Good.gs for functionality preservation
3. Test all affected workflows
4. Update Last_Good.gs after successful testing

---

## Troubleshooting

### Pick List Not Preserving After Regeneration
- Check that Picked For column in Gloves/Sleeves sheet has correct value
- Format should be: "Employee Name Picked On YYYY-MM-DD"

### Change Out Date Wrong
- Run "Fix All Change Out Dates" utility
- Verify Location is correct
- Verify Date Assigned is correct

### Status Not Updating
- Check that onEdit trigger is installed
- Check script execution logs for errors

### Days Left Showing as Date
- Run "Build Sheets" to regenerate with correct formatting
- Days Left column should have plain text format (@)

---

*Last Updated: December 31, 2025*
