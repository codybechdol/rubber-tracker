# Crew Import Fixes - February 23, 2026 (Session 4)

## Issues Fixed

### Issue 1: Triston Bonser - Vacation Location Not Updating
**Status:** Needs further testing after deployment

**What was clarified:**
- When setting an employee's location to "Vacation" via Special Circumstances, it should update the Employees sheet Location column
- The backend code (`applySpecialCircumstanceUpdate`) does update the location correctly
- The "No changes" message appears when clicking the main "Apply Changes" button (which only applies crew location/job changes), not when clicking "Apply Changes" on the Special Circumstances card

**User Action Needed:**
- Click "Apply Changes" on the **specific Special Circumstances card** for Triston, NOT the main "Apply Changes" button
- The main "Apply Changes" button is only for crew membership changes (Location, Job Number changes from crew data)

### Issue 2: JT Kale Appearing in Both Crew Card AND Light Duty Card
**Status:** ✅ FIXED

**Problem:** Employee shows in Detected Crews card AND Special Locations card simultaneously

**Solution Implemented:**
- Updated `showCrewPreview()` to check if employee is in Special Circumstances with a **non-temporary** status
- Non-temporary statuses: Light Duty, Weeds, Layoff, Fired, Quit, Resigned, Leave, FMLA
- Employees in these statuses are **skipped** from crew cards (they appear in Special Locations section instead)
- Temporary statuses (Time Off, Vacation) still show in crew cards with a badge

**Files Modified:** `CrewImport.html` - ~40 lines added in `showCrewPreview()` function

### Issue 3: Proposed Changes Checkboxes Default to Unchecked
**Status:** ✅ FIXED

**Problem:** User wanted to review and approve each change individually instead of all being pre-checked

**Solution Implemented:**
- Changed `apply: true` to `apply: false` in `finishMatching()` 
- Updated checkbox HTML to reflect the `apply` state
- Updated "Select All" checkbox to be unchecked by default
- Added helper text: "Check the boxes next to the changes you want to apply"

**Files Modified:** `CrewImport.html` - 3 locations

### Issue 4: Brian Dixon, Dusty Hendrickson Missing from Detection
**Status:** ⚠️ Root cause identified - they are being AUTO-SKIPPED

**From Console Log:**
```
Will auto-skip Dusty Hendrickson
Will auto-skip Brian Dixon F
```

**Explanation:**
- These employees have **saved skip selections** from a previous import session
- The system remembers "skip" choices and auto-applies them on subsequent imports
- To include them again, clear the saved selections

**User Action Needed:**
- Go to Utilities menu → Clear Saved Crew Import Settings
- OR manually set their status in Special Circumstances section

### Issue 5: Josh Arredondo (Weeds) Not Appearing
**Status:** ✅ FIXED

**Problem:** "Weeds" was not recognized as a special section header

**Solution Implemented:**
- Added "Weeds" to the special section header regex
- Added "Weeds" to `getStatusFromSectionHeader()` function
- Added "Weeds" to status dropdown options
- Added "Weeds" to location dropdown with pre-selection
- Added Weeds card styling in Non-Field Locations section

**Files Modified:** `CrewImport.html` - 4 locations

### Issue 6: Non-Field Locations Cards Not Showing Employees Already in Those Locations
**Status:** ✅ FIXED

**Problem:** Weeds/Light Duty/Vacation cards only showed employees added during import, not employees already in those locations on the Employees sheet

**Solution Implemented:**
- Updated `renderSpecialLocationCards()` to also populate from `currentEmployees` array
- Employees with Location = "Weeds", "Light Duty", "Vacation", or "Leave" are now shown in the corresponding cards
- Existing employees show "(From Employees sheet)" note

**Files Modified:** `CrewImport.html` - ~35 lines added

### Issue 7: Unmatched Employee Click Error (Payton Johnson)
**Status:** ✅ Already fixed in current code

**Console Error:**
```
ERROR: No unmatched employee at index 2. List only has 1 items.
```

**Explanation:**
- This error came from an old version of the deployed code
- The current code uses a key-based system (`unmatchedByKey`) instead of array indices
- The fix was already in place but needed to be deployed

**After this deployment:** The error should be resolved. The system now uses unique keys for unmatched employees.

---

## Summary of All Changes

### `CrewImport.html` Changes:

1. **Special section header detection** - Added "Weeds" pattern
2. **`getStatusFromSectionHeader()`** - Added "Weeds" → "Weeds" mapping
3. **`showCrewPreview()`** - Skip employees in non-temporary special circumstances from crew cards
4. **`renderSpecialLocationCards()`** - Populate from Employees sheet, not just Special Circumstances
5. **Special circumstances UI** - Added "Weeds" status and location options
6. **Proposed Changes** - Default checkboxes to unchecked, added helper text

### No Backend Changes Needed

The `85-DataImport.gs` backend already handles all location updates correctly.

---

## Testing Checklist

After deployment, test the following:

- [ ] Upload Excel file with Weeds section - Josh Arredondo should appear
- [ ] JT Kale should NOT appear in crew card (only in Light Duty card)
- [ ] Proposed Changes checkboxes should all be unchecked by default
- [ ] Selecting "Payton Miller-Johnson" for "Payton Johnson" should work without error
- [ ] Employees already in Weeds/Light Duty/Vacation should appear in Non-Field Locations cards
- [ ] Special Circumstances "Apply Changes" button should update employee location

---

## Deployment

**Deployed via:** `.\push.bat`  
**Date/Time:** February 23, 2026  
**Files Pushed:** 52 files  
**Status:** ✅ SUCCESS

