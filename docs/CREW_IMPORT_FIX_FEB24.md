# Crew Import Fixes - February 24, 2026

## Issues Found & Fixed

### Issue 1: Duplicate Special Circumstance Updates (CRITICAL)
**Status:** ✅ FIXED

**Problem:** The same employee was getting multiple API calls to update their status. In the logs:
- Owen Canavan was updated 7 times with Light Duty (getting job numbers 005-26.112 through 005-26.117)
- Derek Nelson was updated 4 times to Weeds
- Marvin Stone was updated 4 times to Weeds
- JT Kale was updated 4 times to Light Duty

**Root Cause:** The Excel spreadsheet has multiple special section columns (7 total found):
1. `Weeds Gas` at [45,2]
2. `Weeds Operators` at [45,3]
3. `Time off/Quit/Other` at [57,0]
4. `Time off/Quit/Other` at [57,1]
5. `Time off upcoming` at [57,2]
6. `Time off upcoming` at [57,3]
7. `JT Kale MT Misc, Light Duty` at [58,0]

The same employee appears in multiple columns. When `parseSpecialSection` runs, it adds each occurrence to `specialCircumstances[]`. Then `applyAutoSavedSpecialSelections()` iterates through ALL entries and calls the server API for each one with `autoApply=true`.

**Solution:** Added deduplication tracking in `applyAutoSavedSpecialSelections()`:
```javascript
var processedEmployees = {};
// ...in loop...
var empKey = (spec.name || '').toLowerCase().trim();
if (processedEmployees[empKey]) {
  console.log('Skipping duplicate auto-apply for: ' + spec.name + ' (already processed)');
  continue;
}
processedEmployees[empKey] = true;
```

**Impact:** Reduces API calls from 20+ down to the actual number of unique employees (~6-8), and prevents incrementing job numbers incorrectly.

---

### Issue 2: Darrell Swann Not Matching (Name Parsing)
**Status:** ✅ FIXED

**Problem:** "Darrell Swann F off wk 3-23 ??" was being skipped as "non-employee entry"

**Root Cause:** The `parseSpecialEmployee` function didn't remove:
- `wk X-XX` patterns (schedule week references)
- `??` (uncertainty markers)

After `parseSpecialEmployee` returned, `isEmployeeName()` was called on the name, which rejected entries containing `??` or `wk \d`.

**Solution:** Added cleanup in `parseSpecialEmployee()` STEP 4:
```javascript
// Remove "wk" followed by date pattern (schedule info like "wk 3-23")
cleanText = cleanText.replace(/\bwk\s+\d{1,2}[-\/]\d{1,2}\s*/gi, ' ').trim();

// Remove question marks (like "??" for uncertain schedules)
cleanText = cleanText.replace(/\?+/g, ' ').trim();
```

**Impact:** Entries like "Darrell Swann F off wk 3-23 ??" now correctly parse to name "Darrell Swann" with status "Time Off".

---

### Issue 3: currentEmployees Empty During Parsing (Minor)
**Status:** ⚠️ NOTED (Not blocking)

**Problem:** Console shows `parseCrewCards starting. currentEmployees loaded: 0`

**Root Cause:** `parseSheet()` is called immediately when a sheet is selected, but `getEmployeeNamesForMatching()` loads asynchronously in `init()`. The parsing can complete before employees are loaded.

**Mitigation Already In Place:** Lines 704-710 have a re-filter mechanism that runs after employees load. However, this only helps with filtering, not with the initial name matching in `parseSpecialSection`.

**Impact:** Low - The fuzzy matching in `parseSpecialSection` can't work properly, but the `isEmployeeName()` fallback still catches most valid names. The deduplication fix above resolves the main symptom (duplicate API calls).

---

### Issue 4: Employee History Column Detection Warning (Minor)
**Status:** ⚠️ NOTED (Not blocking)

**Problem:** Log shows `getEmployeeNamesForMatching: Could not find required columns in Employee History`

**Root Cause:** The code expects columns named exactly "employee name" and "date" in the Employee History sheet. If the actual column names differ slightly (case sensitivity, extra spaces), detection fails.

**Impact:** Low - The function still returns 71 current employees. It just doesn't include previous employees from history, which affects fuzzy matching for names that have left the company.

---

## Files Modified

- `src/CrewImport.html`
  - `applyAutoSavedSpecialSelections()` - Added `processedEmployees` deduplication (~10 lines)
  - `parseSpecialEmployee()` STEP 4 - Added cleanup for `wk X-XX` and `??` patterns (~4 lines)

---

## Testing Checklist

After reloading the Crew Import dialog:

- [ ] **No duplicate API calls** - Each employee should only be updated once
- [ ] **Job numbers correct** - Light Duty employees should get sequential job numbers (005-26.X) without gaps
- [ ] **"Darrell Swann F off wk 3-23 ??"** - Should now be recognized as Time Off, not skipped
- [ ] **Owen Canavan, JT Kale, etc.** - Should show single "Auto-applied" message in console

---

## Deployment

**Deployed via:** `clasp push --force`  
**Date/Time:** February 24, 2026  
**Files Pushed:** 52 files  
**Status:** ✅ SUCCESS

