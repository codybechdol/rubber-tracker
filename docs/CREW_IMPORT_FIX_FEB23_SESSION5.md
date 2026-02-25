# Crew Import Fixes - February 23, 2026 (Session 5)

## Issues Fixed

### Issue 1: Green Text for Employees in Proposed Changes
**Status:** ✅ FIXED

**Problem:** JT Kale and Triston Lowell were in the Proposed Changes section but their names were NOT shown in green on the crew location cards.

**Root Cause:** The `showCrewPreview()` function was called BEFORE `matchEmployeesToSheet()` populated the `proposedChanges` array. So when rendering crew cards, `proposedChanges` was empty.

**Solution:** Added `updateCrewCardStyling()` function that:
1. Is called from `displayPreview()` AFTER matching is complete
2. Builds a set of employee names from `proposedChanges`
3. Finds all `.crew-card-employee` DOM elements
4. Updates styling to green (#198754) for employees with pending changes

**Files Modified:** `CrewImport.html` - Added ~45 lines for `updateCrewCardStyling()` function

---

### Issue 2: Dusty Hendrickson Not Showing Up for Vacation
**Status:** ✅ FIXED

**Problem:** Dusty Hendrickson was on the Excel file as "Time off upcoming" (vacation this week) but was not appearing on the Helena crew card, Vacation card, or Proposed Changes list.

**Console log showed:** `Will auto-skip Dusty Hendrickson`

**Root Cause:** Dusty had a saved "skip" selection from a previous import session. The system was auto-skipping him regardless of what his CURRENT status was.

**Solution:** Updated `showSpecialSection()` to be smarter about when to auto-skip:
1. **Temporary statuses** (Time Off, Vacation) - Can be auto-skipped if previously skipped
2. **Non-temporary statuses** - Should be shown for user review, even if previously skipped

The new logic:
- Only auto-apply saved selections if the CURRENT status matches the SAVED status
- Only auto-skip if the current status is a temporary one (Time Off, Vacation)
- Show for user review if status changed or if it's a non-temporary status

**Files Modified:** `CrewImport.html` - ~35 lines updated in auto-apply logic

---

### Issue 3: Nick Camp Name Mismatch Error
**Status:** ✅ FIXED

**Problem:** When trying to assign Nick Camp to Weeds location, got error: "Employee 'Nick Camp' not found on Employees sheet" because the sheet has "Nicholas Camp".

**Root Cause:** Backend `applySpecialCircumstanceUpdate()` used exact name matching only.

**Solution:** Added fuzzy name matching with nickname support:
1. First tries exact match
2. If not found, performs fuzzy matching with:
   - Nickname mappings: Nick/Nicholas, Matt/Matthew, Jim/James, Jimmy/James, Bob/Robert, Mike/Michael, Chris/Christopher
   - Prefix matching (Nick → Nicholas because "Nicholas".startsWith("Nick"))
   - Scoring: 40 points for first name match, 60 points for last name match
   - Match accepted if score >= 80 (both names match)

**Files Modified:** `85-DataImport.gs` - ~60 lines added for fuzzy matching

---

### Issue 4 & 5: Josh Arredondo & John Carmack - New Employees
**Status:** ✅ FIXED

**Problem:** Josh Arredondo and John Carmack were in the "Weeds" section of the Excel file but when trying to assign them, got errors because they don't exist on the Employees sheet. User wanted a popup to add them as new employees.

**Solution:** Updated Special Circumstances section to detect NEW employees (not found on sheet):
1. Added `NEW` badge (yellow) next to unmatched employee names
2. Added info alert explaining they need to be added
3. Changed "Apply Changes" button to "Add New Employee" button
4. Created `addNewEmployeeFromSpecial()` function that:
   - Opens the existing Add New Employee modal
   - Pre-fills location based on status (Weeds, Light Duty, Vacation, Leave)
   - Sets job number field as optional for special locations
   - After adding, removes the special circumstance card

**Additional Fix:** Job number is now **optional** for employees in special locations:
- Weeds
- Light Duty
- Vacation
- Leave

The placeholder text for job number field changes to "Optional - Weeds employees typically have no job#" when Weeds is selected.

**Files Modified:** 
- `CrewImport.html` - ~100 lines for new employee detection UI
- `CrewImport.html` - ~100 lines for `addNewEmployeeFromSpecial()` function
- `CrewImport.html` - ~15 lines updating `submitNewEmployee()` validation

---

## Summary of All Changes

### `CrewImport.html` Changes:
1. **`updateCrewCardStyling()`** - New function to apply green styling to pending changes
2. **`displayPreview()`** - Added call to `updateCrewCardStyling()`
3. **`showSpecialSection()`** - Smarter auto-skip logic based on status matching
4. **New Employee Detection** - Show "NEW" badge and "Add New Employee" button for unmatched employees
5. **`addNewEmployeeFromSpecial()`** - New function to add new employees from Special Circumstances
6. **`submitNewEmployee()`** - Job number now optional for special locations

### `85-DataImport.gs` Changes:
1. **`applySpecialCircumstanceUpdate()`** - Added fuzzy name matching with nickname support

---

## Testing Checklist

After deployment, test the following:

- [ ] JT Kale and Triston Lowell names should be **green** on crew cards when in Proposed Changes
- [ ] Dusty Hendrickson should appear in Vacation card or Proposed Changes (not auto-skipped)
- [ ] Nick Camp should be matchable (fuzzy match to Nicholas Camp)
- [ ] Josh Arredondo and John Carmack should show "NEW" badge with "Add New Employee" button
- [ ] Adding new Weeds employee should work without requiring job number
- [ ] After adding new employee from Special Circumstances, card should disappear

---

## Deployment

**Deployed via:** `.\push.bat`  
**Date/Time:** February 23, 2026  
**Files Pushed:** 52 files  
**Status:** ✅ SUCCESS

