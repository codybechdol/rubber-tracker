# Employee Sheet Integration Analysis

## Overview

The **Employees sheet** is the central data source for the entire Rubber Tracker system. Almost every feature reads from it to determine:
- Who to generate swaps for
- What location employees are at
- What sizes employees need
- Who to send notifications to
- Who to include in scheduling

This document analyzes the impact of the **Crew Import** and **Expiring Certs Import** features on the system.

---

## Employees Sheet Column Structure

| Column | Header | Used By |
|--------|--------|---------|
| A | Name | Everything - primary key for matching |
| B | Location | Swaps, Reclaims, Smart Scheduling, Location Approvals |
| C | Job Number | Smart Scheduling (crew grouping), Task assignments |
| D | Phone Number | Smart Scheduling (contact info on tasks) |
| E | Notification Emails | Email Reports |
| F | MP Email | (Mobile phone email for alerts) |
| G | Email Address | Employee contact |
| H | Glove Size | Swap generation, Purchase Needs |
| I | Sleeve Size | Swap generation, Purchase Needs |
| J | Hire Date | Employee History |
| K | Last Day | Employee lifecycle, "Previous Employee" tracking |
| L | Last Day Reason | Employee History |
| M | Job Classification | (NEW) Crew roles: Foreman, JL, Apprentice, etc. |

---

## What Each Import Modifies

### Crew Import (Phase 1) - Modifies:
1. **Location (Column B)** - Maps from superintendent's spreadsheet
2. **Job Number (Column C)** - Full job number with position (e.g., 013-26.1)
3. **Job Classification (Column N)** - Role mapped to standard values:
   - F (Foreman) → F
   - JL (Journeyman Lineman) → JRY
   - 1-7 ap → AP 1-7
   - Jry Op → JRY OP
   - GTO → GTO, GTO F → GTO F
   - EO2 → EO 2

### Expiring Certs Import - Modifies:
1. **Adds NEW employees** if they don't exist (via "Add New Employee" button)
2. When adding new employees, sets: Name, Class, Location, Job Number, Phone, Email, Glove Size, Sleeve Size, Hire Date

---

## Systems That READ from Employees Sheet

### 1. Swap Generation (`generateSwaps`)
**Reads:** Name, Location, Glove Size, Sleeve Size, Job Number
**Impact:** 
- Location determines which class swaps an employee appears in (via Location Approvals)
- Size determines what pick list items to suggest
- **Safe:** Crew Import updates Location which is CORRECT behavior - employees should move to their new location's swap list

### 2. Reclaims Check (`runReclaimsCheck`)
**Reads:** Name, Location
**Impact:**
- Employees in locations NOT approved for their current class items appear in Reclaims
- **Safe:** If an employee moves to a non-approved location, they SHOULD appear in Reclaims

### 3. Smart Scheduling (`collectAndGroupTasks`)
**Reads:** Name, Location, Job Number, Phone Number
**Impact:**
- Tasks are grouped by Location
- Crew members are grouped by Job Number
- Foreman is identified by Job Classification
- **Safe:** Crew Import keeps Location and Job Number current, improving schedule accuracy

### 4. Email Reports
**Reads:** Notification Emails column
**Impact:** None - Crew Import doesn't touch this column

### 5. Purchase Needs
**Reads:** Glove Size, Sleeve Size (indirectly via Swaps)
**Impact:** None - Crew Import doesn't touch size columns

### 6. New Employee Dialog
**Writes:** All columns when adding a new employee
**Impact:** None - separate workflow

---

## Potential Conflicts Between Imports

### Scenario: Same employee in both Crew Import and Expiring Certs Import

**Expiring Certs Import** might add a new employee with:
- Location: "Helena" (from Excel)
- Job Number: empty

**Crew Import** (run later) would update:
- Location: "Bozeman" (from superintendent)  
- Job Number: "013-26.1"

**Result:** ✅ CORRECT - Crew Import has more recent/accurate data and should win

### Scenario: Employee name spelling differences

**Expiring Certs Import:** "Massen Worl" (misspelled in certs Excel)
**Crew Import:** "Mason Worl" (correct spelling)

**Current Behavior:**
- Expiring Certs Import: Would prompt to add as new employee OR match via Metaphone
- Crew Import: Uses fuzzy matching to find "Mason Worl"

**Potential Issue:** If Expiring Certs added "Massen Worl" as a new employee, Crew Import would update "Mason Worl" but NOT "Massen Worl" - you'd have duplicate employees.

**Mitigation:** 
1. Expiring Certs Import uses Metaphone matching to suggest "Mason Worl" as a match
2. User should select the match rather than adding new employee
3. If duplicate created, manually merge in Employees sheet

---

## Safety Guarantees

### ✅ Neither Import Can Delete Employees
Both imports only UPDATE or ADD - they never remove rows from Employees sheet.

### ✅ Both Imports Log to Employee History
Every change is recorded with:
- Date
- What changed (Location, Job Number, Classification)
- Old value → New value

### ✅ Both Imports Require User Confirmation
- Preview screen shows all proposed changes
- Checkboxes allow selecting/deselecting individual changes
- Final confirmation before applying

### ✅ Location Mapping is Consistent
Crew Import uses a standard location mapping table:
- "Belgrade Dock" → "Bozeman"
- "Helena Trans Dock" → "Helena"
- etc.

This ensures Location values match what other systems expect.

---

## Recommended Workflow

1. **Friday:** Superintendent sends crew makeup spreadsheet
2. **Run Crew Import** → Updates Location, Job Number, Job Classification
3. **When Certs Excel arrives:** Run Expiring Certs Import
   - Existing employees: Matched and certs added to tracking
   - New employees: Prompted to add (or match to similar name)
4. **Generate Swaps, Reclaims, Smart Schedule** → All use updated employee data

---

## Edge Cases to Watch

### 1. New Hire in Certs but not in Crew Makeup
- Expiring Certs would prompt to add new employee
- User must manually enter Location (may not know current assignment)
- Next Crew Import will update their correct Location

### 2. Employee Terminated (no longer in Crew Makeup)
- Crew Import won't update them (they're not in the spreadsheet)
- Must manually set Last Day on Employees sheet
- Location should be changed to "Previous Employee"

### 3. Employee Moves Mid-Week
- Crew Import reflects Friday's snapshot
- If employee moves Tuesday, their Location won't update until next Friday import
- This is expected behavior - matches superintendent's update cycle

---

## Conclusion

The two imports are **COMPATIBLE** and serve different purposes:

| Feature | Purpose | When to Use |
|---------|---------|-------------|
| Crew Import | Keep Location/Job Number current | Weekly (Fridays) |
| Expiring Certs Import | Track certification expiration dates | When certs Excel updated |

The key safeguards in place:
1. User confirmation before any changes
2. Full history logging
3. Fuzzy matching to prevent duplicates
4. Neither can delete employees

The system is designed so that Crew Import's Location updates flow correctly through Swaps, Reclaims, and Scheduling.
