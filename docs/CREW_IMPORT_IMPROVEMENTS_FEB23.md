# Crew Import Improvements - February 23, 2026

## Overview
Major enhancements to the Crew Import function based on testing session:
1. **Locations Sheet** - Single source of truth for drive times (replacing hardcoded values)
2. **Review All Matches** - Show ALL employee matches with confidence scores before applying
3. **Previous Employee Confirmation** - Distinguish rehires from new employees with same name
4. **Bug Fixes from Testing** - Various issues discovered during import testing

---

## FIXES IMPLEMENTED (Session 3 - Feb 23, 2026) ✅ ACTUALLY DEPLOYED

### Fix 1: Dawson Marcil (Previous Employee) Still Appearing
- **Problem:** "Dawson Marcil fired" still appeared in Special Circumstances even though he's already terminated
- **Root Causes:**
  1. `parseSpecialEmployee()` didn't detect "fired" as a status keyword
  2. `filterSpecialCircumstancesAlreadyMatched()` used exact name matching but "Dawson Marcil fired" ≠ "Dawson Marcil"
- **Fixes Applied:**
  1. Added "Fired/Terminated" status detection in `parseSpecialEmployee()` (line ~1282)
  2. Enhanced `filterSpecialCircumstancesAlreadyMatched()` to:
     - Clean status words from names before comparison ("fired", "quit", "resigned", etc.)
     - Check if employee name is contained within special circumstance name
     - Check both Employee History AND Employees sheet for Previous Employee status
  3. Added early exit for termination statuses in `filterSpecialCircumstancesAlreadyMatched()` - if status is Fired/Quit/etc., auto-skip
- **Status:** ✅ DEPLOYED

### Fix 2: Skip Button Shows Popup for Temporary "Time Off" Situations
- **Problem:** Clicking Skip on Tristin Lowell (temporary Friday-only Time Off) showed "Remember this?" popup
- **Root Cause:** `skipSpecialEmployee()` always showed the remember confirmation for ALL statuses
- **Fix Applied:** Changed `skipSpecialEmployee()` to only show remember popup for **long-term statuses**:
  - **Long-term statuses (shows popup):** Light Duty, Layoff, Fired, Quit, Resigned, Terminated
  - **Temporary statuses (no popup):** Time Off, Vacation, Leave - just skips silently
- **User Experience:**
  - Tristin Lowell (Time Off): Click Skip → card removed immediately, no popup
  - JT Kale (Light Duty): Click Skip → popup asks "Remember for future imports?"
- **Status:** ✅ DEPLOYED

### Fix 2: Rapelje Shows as Two Crews with Duplicate Job Numbers
- **Problem:** Rapelje 039-26 appears in two separate Excel blocks, resulting in duplicate job numbers
- **Root Cause:** No logic to merge crews with the same job number
- **Fix Applied:** Added `mergeCrewsByJobNumber()` function (lines ~968-1048) that:
  1. Groups crews by job number after initial parsing
  2. For crews with same job number: merges employee lists, skips duplicates by name
  3. Re-sorts combined employees using `getEffectiveRole()` for proper classification hierarchy
  4. Re-assigns position numbers after merge (1, 2, 3, etc.)
  5. Logs merge statistics to console
- **Status:** ✅ DEPLOYED

### Fix 3: Chad Cliff Missing GF Classification in Sort Order
- **Problem:** Chad Cliff is GF on Employees sheet but appears at bottom because Excel doesn't have his role
- **Root Cause:** Sorting used `emp.role` (from Excel) which was empty → priority 999 (last)
- **Fixes Applied:**
  1. Created `getEffectiveRole(emp)` function (lines ~925-952) that:
     - First checks `emp.role` from Excel parsing
     - If empty, looks up employee in `currentEmployees` (Google Sheet) by name
     - Returns `jobClassification` from Google Sheet if found
     - Stores as `emp.classificationFromSheet` for display
  2. Updated employee sort (line ~867) to use `getEffectiveRole()` instead of just `emp.role`
  3. Updated crew card display (lines ~1726-1739) to show classification from sheet with different color badge
- **Status:** ✅ DEPLOYED

---

## Session 2 Fixes (Earlier Feb 23, 2026) ✅ ALL COMPLETE

### Issue 1: Job 002-26 Employees Showing Red (Corey, Brendan, Dillon)
- **Problem:** Employees from 022-26 appear with 002-26 job number badges
- **Root Cause:** Job numbers starting with 002 are administrative job numbers (Cody's), not field crews
- **Fix:** ✅ Added exclusion for 002-XX job numbers in parseCrewCards()
- **Status:** COMPLETE - Deployed

### Issue 2: Schedule Dropdown Not Closing After Selection
- **Problem:** The schedule type dropdown stays open after user selects an option
- **Fix:** ✅ Added Bootstrap dropdown.hide() call after selection
- **Status:** COMPLETE - Deployed

### Issue 3: Ashton Helmts - No Secondary Job Option
- **Problem:** When employee appears in 2 crews (one greyed out), no way to choose secondary job or exclude the closed crew
- **Fix:** ✅ Added "Exclude Crew" option to crew card dropdown menu
- **How it works:**
  - Click dropdown on crew card → "Exclude Crew" option at bottom
  - Confirms exclusion with alert
  - Crew is removed from display
  - Duplicate detection re-runs to update red highlighting
  - Excluded crews are not included in changes
- **Status:** COMPLETE - Deployed

### Issue 4: Dawson Marcil "fired" - Previous Employee Not Detected
- **Problem:** Dawson Marcil was already terminated (02/17/2026) but still appears in Special Circumstances
- **Root Cause:** Code checks Employees sheet but not Employee History for terminated employees
- **Fix:** ✅ Added `isAlreadyTerminated()` function that checks:
  - `source: 'Employee History'` with `lastDay` + `lastDayReason` = terminated
  - `source: 'Employees'` with `location: 'Previous Employee'` = terminated
  - Supports both exact and fuzzy name matching
- **UI Feedback:** Shows grey alert "X employee(s) already terminated (Previous Employee) - skipped: [names]"
- **Status:** COMPLETE - Deployed (enhanced in Session 3)

### Issue 5: Confidence Score Display
- **Problem:** Scores showing >99% look odd (e.g., 100%)
- **Fix:** ✅ Cap displayed confidence at 99% (internal calculation unchanged)
- **Status:** COMPLETE - Deployed

---

## Implementation Checklist

### Step 1: Create "Locations" Sheet Infrastructure
- [x] Create `setupLocationsSheet()` function in Code.gs
- [x] Migrate hardcoded drive times to new function
- [x] Update `getDriveTimeMap()` in 76-SmartScheduling.gs to read from Locations sheet
- [x] Add `addLocationWithDriveTime()` function
- [x] Add `getLocationsSheetData()` function for dropdowns
- [x] Add menu items for Location management
- [x] Test: Verify Locations sheet created with all 30 locations
- [x] Test: Verify `getDriveTimeMap()` reads from sheet correctly

### Step 2: Update Crew Import - New Location Popup with Drive Time
- [x] Add "Drive Time from Helena (minutes)" field to unknown location UI
- [x] Update `saveUnknownMapping()` to save drive time to Locations sheet
- [x] Call `addLocationWithDriveTime()` when saving new location

### Step 3: Add "Review All Matches" Step
- [x] Create `matchedEmployees` array to track all matches (not just changes)
- [x] Create `showMatchReviewSection()` function
- [x] Add HTML section for review table
- [x] Add "Change Match" dropdown with alternative matches
- [x] Add "Skip" button per row
- [x] Add "Confirm All Matches" button
- [x] Highlight <90% confidence matches in yellow with ⚠️
- [x] Disable "Apply Changes" until matches confirmed

### Step 4: Add Previous Employee Confirmation Dialog
- [x] Create `previousEmployeeMatches` array in matching logic
- [x] Create `showPreviousEmployeeConfirmation()` function
- [x] Add confirmation card UI with employee history info
- [x] Add "Yes, Rehire" button that opens full employee form
- [x] Add "No, Different Person" button that opens new employee form
- [x] Pre-fill form fields from Excel data
- [x] Create `rehireEmployeeFromImport()` server function
- [x] Update Employee History with proper Rehire Date handling

### Step 5: Session 2 Fixes ✅ COMPLETE
- [x] Fix 1: Exclude 002-XX job numbers (administrative, not crews)
- [x] Fix 2: Close schedule dropdown after selection using Bootstrap API
- [x] Fix 3: Add "Exclude Crew" option to remove closed/greyed-out crews from import
- [x] Fix 4: Check Employee History for terminated employees using `isAlreadyTerminated()`
- [x] Fix 5: Cap confidence score display at 99%

### Step 6: Session 3 Fixes ✅ COMPLETE
- [x] Fix 1: Add "Fired/Terminated" status detection in parseSpecialEmployee()
- [x] Fix 2: Add early termination check in parseSpecialSection() for Previous Employees
- [x] Fix 3: Add mergeCrewsByJobNumber() to combine crews with same job number
- [x] Fix 4: Add getEffectiveRole() to use Google Sheet classification when Excel role is empty
- [x] Fix 5: Update sort functions to use getEffectiveRole() for proper GF ranking

### Step 7: Final Testing & Deployment ✅ COMPLETE
- [x] Run `.\push.bat` to deploy all changes
- [ ] Test complete workflow with this week's Excel
- [ ] Verify no regressions in existing functionality

---

## Files Modified

| File | Status | Changes |
|------|--------|---------|
| `src/Code.gs` | ✅ Deployed | Add `setupLocationsSheet()`, `addLocationWithDriveTime()`, `getLocationsSheetData()`, `openLocationsSheet()`, menu items |
| `src/76-SmartScheduling.gs` | ✅ Deployed | Update `getDriveTimeMap()` to read from Locations sheet |
| `src/85-DataImport.gs` | ✅ Deployed | Add `rehireEmployeeFromImport()` for handling Previous Employee rehires |
| `src/CrewImport.html` | ✅ Deployed | Drive time field, Review Matches section, Previous Employee confirmation, **Session 2 fixes:** 002-XX exclusion, dropdown close, exclude crew, terminated employee detection, confidence cap, **Session 3 fixes:** Fired status detection, early Previous Employee skip, mergeCrewsByJobNumber(), getEffectiveRole() |

---

## Locations Sheet Structure

| Column | Header | Description |
|--------|--------|-------------|
| A | Location | Location name (primary key) |
| B | Drive Time (min) | Minutes from Helena |
| C | Direction | Optional: East/North/West/Southwest |
| D | Overnight City | Optional: Nearest city for overnight stays |

**Initial Data (30 locations):**
- Active Locations: Helena, Ennis, Butte, Big Sky, Bozeman, Livingston, Great Falls, Missoula, Lolo, Stanford, Rapelje, Elliston, Gold Creek, Kalispell, Billings, Miles City, Sidney, Glendive, South Dakota, Northern Lights, California, Arnett / JM Test, Cody's Truck, Destroyed, Lost
- Non-Field Locations: Weeds, Light Duty, Vacation, Previous Employee, Leave, Unknown

---

## Testing Log

### Session 2: February 23, 2026 (COMPLETE)

| Time | Issue | Fix | Status |
|------|-------|-----|--------|
| - | Job 002-26 (admin job) included in import | Added exclusion for 002-XX job numbers | ✅ |
| - | Schedule dropdown not closing | Added Bootstrap dropdown.hide() | ✅ |
| - | No way to exclude closed crews (040-26) | Added "Exclude Crew" menu option | ✅ |
| - | Dawson Marcil (terminated) still showing | Added isAlreadyTerminated() check | ✅ |
| - | Confidence scores > 99% | Capped display at 99% | ✅ |
| 3:00 PM | Deployed 52 files to Google Apps Script | - | ✅ Success |

### Session 1: February 23, 2026

| Time | Issue | Fix | Status |
|------|-------|-----|--------|
| 12:30 PM | Deployed 52 files to Google Apps Script | - | ✅ Success |

---

## Rollback Plan

If critical issues are found:
1. The hardcoded `getDriveTimeMap()` values are preserved in comments
2. Can revert to hardcoded by checking if Locations sheet exists
3. CrewImport changes are additive - existing functionality preserved
