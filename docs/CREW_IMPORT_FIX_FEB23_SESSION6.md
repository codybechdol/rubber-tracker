# Crew Import Fixes - February 23, 2026 (Session 6)

## Issues Fixed

### Issue 1: Employee Not Removed from Vacation Card When Approved
**Status:** ✅ FIXED

**Problem:** When user checks the checkbox to approve a change (e.g., Tristin Lowell from Vacation → Bozeman), the employee's name remained on the Vacation card and stayed green on the crew card.

**Solution:** Enhanced `toggleChange()` function to:
1. When checkbox is CHECKED (approved): Remove employee from special location cards (Vacation, Light Duty, etc.) and reset name color to normal (black)
2. When checkbox is UNCHECKED: Keep the green pending styling

**New Functions Added:**
- `removeEmployeeFromSpecialLocationCards(empNameLower)` - Removes employee from the `specialLocationEmployees` tracking object and re-renders the cards
- `updateCrewCardEmployeeColor(empNameLower, colorType)` - Updates the color of an employee name on crew cards ('normal' or 'green')

**Files Modified:** `CrewImport.html` - ~65 lines added

---

### Issue 2: Nick Camp Not Matching to Nicholas Camp
**Status:** ✅ FIXED

**Problem:** Nick Camp was shown as "NEW" (not found on sheet) even though "Nicholas Camp" exists on the Employees sheet. The fuzzy matching didn't support nickname variations.

**Solution:** Added nickname mapping to `findBestMatchInCell()` function:
- Nick ↔ Nicholas, Nicolas
- Matt ↔ Matthew
- Jim ↔ James, Jimmy
- Bob ↔ Robert
- Mike ↔ Michael
- Chris ↔ Christopher
- Bill ↔ William
- Dan ↔ Daniel
- Tom ↔ Thomas
- Joe ↔ Joseph
- Tony ↔ Anthony

When checking if a first name matches, the function now also checks all nickname variations.

**Files Modified:** `CrewImport.html` - `findBestMatchInCell()` rewritten with nickname support (~100 lines)

---

### Issue 3: Dusty Hendrickson Being Auto-Skipped
**Status:** ✅ FIXED

**Problem:** Dusty Hendrickson was on the Excel file as "Time off upcoming" (vacation this week) but wasn't showing anywhere. Console showed: `Will auto-skip Dusty Hendrickson (temporary status: Time Off)`

**Root Cause:** Dusty was previously skipped during an import session (saved selection). The auto-skip logic was too aggressive - it auto-skipped ALL temporary statuses (Time Off, Vacation) regardless of whether the employee was actually going from a crew to vacation.

**Solution:** Updated the auto-skip logic to:
1. Check the employee's CURRENT location on the Employees sheet
2. Only auto-skip if the employee is ALREADY in a special location (Vacation, Leave, Light Duty, Weeds, etc.)
3. If the employee is currently on a regular crew (e.g., Helena), show for user review since this is a NEW vacation entry

**New Logic:**
```javascript
// Only auto-skip if:
// - Current status is temporary (Time Off, Vacation)
// - AND employee is ALREADY in a special location (not coming FROM a regular crew)
if (tempStatuses.indexOf(currentStatus) !== -1 && isAlreadyInSpecialLocation) {
  spec.autoSkip = true;
  console.log('Will auto-skip ' + spec.name + ' (already in special location: ' + currentLocationOnSheet + ')');
} else if (tempStatuses.indexOf(currentStatus) !== -1 && !isAlreadyInSpecialLocation) {
  // Employee is on a regular crew, this is a NEW vacation - show for review
  console.log('Showing ' + spec.name + ' for review - employee on crew (' + currentLocationOnSheet + ') going to ' + spec.status);
  needsSelection.push(spec);
}
```

**Files Modified:** `CrewImport.html` - ~30 lines updated in auto-skip logic

---

## Summary of Changes

### `CrewImport.html`:
1. **`toggleChange()`** - Now calls functions to remove from special cards and update colors
2. **`removeEmployeeFromSpecialLocationCards()`** - New function to remove employee from Vacation/Light Duty/etc cards
3. **`updateCrewCardEmployeeColor()`** - New function to change name color on crew cards
4. **`findBestMatchInCell()`** - Added nickname mapping for fuzzy matching
5. **Auto-skip logic in `showSpecialSection()`** - Now checks current location before auto-skipping

---

## Testing Checklist

After deployment, test the following:

- [x] **Tristin Lowell fix:** Check the box next to Tristin → his name should disappear from Vacation card and turn black on crew card
- [ ] **Nick Camp fix:** Nick Camp should now match to Nicholas Camp and show as existing employee, not NEW
- [ ] **Dusty Hendrickson fix:** Dusty should now appear in Special Circumstances for review, not auto-skipped

---

## Deployment

**Deployed via:** `.\push.bat`  
**Date/Time:** February 23, 2026  
**Files Pushed:** 52 files  
**Status:** ✅ SUCCESS

