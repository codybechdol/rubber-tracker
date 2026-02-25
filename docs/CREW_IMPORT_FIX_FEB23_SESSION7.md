# Crew Import Fixes - February 23, 2026 (Session 7)

## Issues Fixed

### Issue 1: Green Names Not Showing for Pending Changes
**Status:** ✅ FIXED

**Problem:** Employees in the Proposed Changes list (like JT Kale and Tristin) should have green names on the crew cards to indicate pending changes, but the green styling wasn't appearing.

**Root Cause:** The `updateCrewCardStyling()` function was marking ALL employees with proposed changes as green, regardless of whether the checkbox was checked (approved) or unchecked (pending).

**Solution:** Updated `updateCrewCardStyling()` to track two separate states:
- `pendingChangeNames` - Employees with unchecked (unapproved) changes → Show in GREEN
- `approvedChangeNames` - Employees with checked (approved) changes → Show in NORMAL color

**Files Modified:** `CrewImport.html` - `updateCrewCardStyling()` function (~45 lines changed)

---

### Issue 2: Employee Not Removed from Vacation Card When Approved
**Status:** ✅ FIXED

**Problem:** When user checks the checkbox to approve a change (e.g., Tristin Lowell from Vacation → Bozeman), the employee's name remained on the Vacation card.

**Root Cause:** The `removeEmployeeFromSpecialLocationCards()` function was using exact string matching, which failed when names had slight variations.

**Solution:** Enhanced `removeEmployeeFromSpecialLocationCards()` with fuzzy matching:
1. Exact match
2. Contains match (one name contains the other)
3. Similarity match (≥80% similarity using `calculateSimilarity()`)

Also updated `updateCrewCardEmployeeColor()` with the same fuzzy matching logic.

**Files Modified:** `CrewImport.html` - Two functions updated (~30 lines changed)

---

### Issue 3: Employees Already on Weeds Showing in Special Circumstances
**Status:** ✅ FIXED

**Problem:** Nick Camp (matching to Nicholas Camp), Josh Arredondo, and John Carmack were showing in the Special Circumstances section even though they're already assigned to Weeds location on the Employees sheet.

**Root Cause:** The `showSpecialSection()` function was not checking if an employee is ALREADY in their target special location. If detected as "Weeds" but already on "Weeds" sheet location - no change needed.

**Solution:** Added early detection in `showSpecialSection()`:
1. Map status to expected location (Weeds→Weeds, Light Duty→Light Duty, etc.)
2. Look up employee's current location from Employees sheet (with fuzzy name matching)
3. If already at target location, auto-skip and add to "no change" list
4. Clean name before matching - strip suffixes like "F", "JL", "AP #", etc.

**New Status-to-Location Mapping:**
```javascript
var statusToLocationMap = {
  'weeds': 'weeds',
  'light duty': 'light duty',
  'vacation': 'vacation',
  'time off': 'vacation',
  'leave': 'leave',
  'fmla': 'leave'
};
```

**Files Modified:** `CrewImport.html` - `showSpecialSection()` function (~50 lines added)

---

### Issue 4: Brian Dixon F Not Matching to Brian Dixon
**Status:** ✅ FIXED

**Problem:** "Brian Dixon F off wk 2-23" in the Time Off section was being flagged as NEW employee instead of matching to existing "Brian Dixon" on the Employees sheet.

**Root Cause:** The first-pass matching in `parseSpecialSection()` uses `findBestMatchInCell()` which has nickname support but wasn't stripping role suffixes like "F" and "off wk..." phrases.

**Solution:** Added second-pass matching in `showSpecialSection()` for unmatched special circumstances:
1. Clean name by removing:
   - "off wk ..." phrases
   - "wk 2-23" date patterns
   - "No CDL" suffix
   - Single-letter roles (F, JL, JRY, GTO, WT, SUP, GF)
   - AP #, EO # patterns
   - "Jry Op" suffix
   - Anything after comma
2. Try fuzzy matching against currentEmployees with 75% similarity threshold
3. If match found, update spec.name to exact sheet name

**Example Transformations:**
- "Brian Dixon F off wk 2-23" → "brian dixon" → matches "Brian Dixon"
- "Matt Miller F Tues-Thurs, Crane 2-27" → "matt miller" → matches "Matthew Miller" (via nickname)

**Files Modified:** `CrewImport.html` - Added second-pass matching block (~40 lines)

---

### Issue 5: Dusty Hendrickson Missing Classification on Vacation Card
**Status:** ✅ PARTIALLY ADDRESSED

**Problem:** When Dusty Hendrickson is added to the Vacation card (either from proposed changes or auto-apply), his job classification badge wasn't showing.

**Root Cause:** The classification is extracted during parsing in `parseSpecialEmployee()`, but it's only passed to `addToSpecialLocation()` when the employee data includes it.

**What Was Already Working:**
- The `addToSpecialLocation()` function DOES include classification when provided
- The `renderSpecialLocationCards()` function DOES display the badge when classification exists

**What's Happening:**
- When Dusty is parsed from "Dusty Hendrickson F", the classification "F" should be captured
- The issue may be that when employees come from the "Time off upcoming" section, the parsing extracts "Foreman" role but the badge display expects "F"

**Verification Needed:** Check if `spec.classification` is populated correctly when Dusty is parsed. The system already has:
```javascript
addToSpecialLocation(displayLoc, {
  name: spec.name,
  classification: spec.classification || '',  // This should include the classification
  notes: spec.notes || ''
});
```

---

## Summary of All Changes to `CrewImport.html`

1. **`updateCrewCardStyling()`** - Now tracks pending vs approved changes separately, only colors unchecked items green
2. **`removeEmployeeFromSpecialLocationCards()`** - Added fuzzy matching for name comparison
3. **`updateCrewCardEmployeeColor()`** - Added fuzzy matching for name comparison  
4. **`showSpecialSection()` - Early detection block** - Added check to skip employees already at target location, with improved name cleaning:
   - Strips `/EO2`, `/GTO`, etc. patterns (slash prefix)
   - Strips single-letter roles (F, JL, JRY, GTO, WT, SUP, GF)
   - Strips apprentice patterns (AP 1-7, EO 1-2)
   - Strips "Jry Op" suffix
   - Strips "No CDL" suffix
5. **`showSpecialSection()` - Second-pass matching block** - Added fallback matching for unmatched employees with cleaner name parsing

---

## Testing Checklist

After deployment, test the following:

- [ ] **Green names:** Unchecked proposed changes should show employee names in green on crew cards
- [ ] **Removal on approval:** When checking a proposed change, employee should be removed from Vacation/Light Duty/Weeds card
- [ ] **No-change detection:** Employees already on Weeds should NOT appear in Special Circumstances (should show "no change - already Weeds")
- [ ] **Brian Dixon matching:** "Brian Dixon F off wk..." should match to "Brian Dixon" (not show as NEW)
- [ ] **Classification badges:** Check if job classification badges appear on Vacation/Weeds cards

---

## Deployment

**Deployed via:** `.\push.bat`  
**Date/Time:** February 23, 2026  
**Files Pushed:** 52 files  
**Status:** ✅ SUCCESS

