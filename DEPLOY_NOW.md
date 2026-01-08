# IMMEDIATE ACTION REQUIRED - Deploy Fixes to Google Sheets

**Date**: January 8, 2026  
**Status**: 🔴 Code updated locally, needs deployment to Google Apps Script

---

## Problem

You're seeing two issues:
1. ❌ Jesse Lockett still shows "Need to Purchase ❌" in Reclaims
2. ❌ "Build Sheets" still appears in Glove Manager menu

## Why

The fixes were committed to your local Git repository but **NOT YET DEPLOYED** to your Google Sheets Apps Script. You need to copy the updated code files to Google Apps Script.

---

## SOLUTION - 2 Steps

### Step 1: Deploy Updated Code to Google Apps Script

#### Option A: Copy Individual Files (RECOMMENDED)

1. **Open your Google Sheet** (Rubber Tracker)
2. **Go to Extensions → Apps Script**
3. **Update these 2 files**:

**File 1: Code.gs** (Remove "Build Sheets" from menu)
- In Apps Script editor, find the `onOpen()` function (around line 50)
- Verify it does NOT have this line: `.addItem('Build Sheets', 'buildSheets')`
- If it does, delete that line
- The menu should start with: `.addItem('Generate All Reports', 'generateAllReports')`

**File 2: 40-Reclaims.gs** (Fix auto pick list)
- In Apps Script editor, open file named `40-Reclaims` or `Reclaims`
- Find the function `updateReclaimsSheet()` (around line 31)
- Change the function name to: `updateReclaimsSheet_INCOMPLETE_DEPRECATED()`
- This prevents it from overriding the complete version

4. **Click "Save project" (Ctrl+S)**

#### Option B: Deploy All Files (COMPLETE)

If you want to deploy ALL changes from the clean-up branch:

1. Open `Extensions → Apps Script` in your Google Sheet
2. For each file in `src/` folder, copy content to corresponding .gs file in Apps Script
3. Files to update:
   - `Code.gs` (menu changes)
   - `40-Reclaims.gs` (function rename)
   - `30-SwapGeneration.gs` (ensurePickedForColumn added)
   - `95-BuildSheets.gs` (deprecated wrapper)
   - `99-MenuFix.gs` (menu changes)

---

### Step 2: Run Generate All Reports

After deploying the code:

1. **Refresh your Google Sheet** (F5 or Ctrl+R)
2. **Check the menu**: Glove Manager menu should NOT show "Build Sheets"
3. **Run**: Glove Manager → Generate All Reports
4. **Wait** for it to complete
5. **Go to Reclaims sheet**
6. **Check row 32** (Jesse Lockett):
   - Pick List Item # should show a number (e.g., 573, 558, 103, etc.)
   - Pick List Status should show "In Stock ✅"

---

## Quick Fix Commands (If Using clasp)

If you're using `clasp` to deploy:

```bash
# Deploy from project root
cd "C:\Users\codyb\WebstormProjects\Rubber Tracker"

# Push to Google Apps Script
clasp push

# Or if you need to login first
clasp login
clasp push
```

---

## Manual Quick Fix (5 minutes)

If you just want to fix the immediate issues without full deployment:

### Fix 1: Remove "Build Sheets" from Menu

1. Open Apps Script editor
2. Find `onOpen()` function in Code.gs
3. Delete this line (if present):
   ```javascript
   .addItem('Build Sheets', 'buildSheets')
   ```
4. Save

### Fix 2: Fix Reclaims Auto Pick List

1. In Apps Script editor, find `40-Reclaims` file
2. Find line that says: `function updateReclaimsSheet() {`
3. Change to: `function updateReclaimsSheet_INCOMPLETE_DEPRECATED() {`
4. Save

### Fix 3: Run Generate All Reports

1. Refresh your spreadsheet (F5)
2. Run: Glove Manager → Generate All Reports
3. Check Reclaims sheet

---

## Expected Results After Deployment

### Issue 1: Jesse Lockett Reclaim - FIXED ✅

**Before**:
```
Row 32: Jesse Lockett
Pick List Item #: —
Pick List Status: Need to Purchase ❌
```

**After**:
```
Row 32: Jesse Lockett
Pick List Item #: 573 (or another available sleeve)
Pick List Status: In Stock ✅
```

### Issue 2: Menu - FIXED ✅

**Before**:
```
Glove Manager menu:
- Build Sheets          ← REMOVED
- Generate All Reports
- ...
```

**After**:
```
Glove Manager menu:
- Generate All Reports  ← ONLY THIS
- Open Dashboard
- ...
```

---

## Verification Checklist

After deployment:

- [ ] Refresh Google Sheet (F5)
- [ ] Check menu - "Build Sheets" should be GONE
- [ ] Menu should show "Generate All Reports" as first item
- [ ] Run "Generate All Reports"
- [ ] Go to Reclaims sheet
- [ ] Row 32 (Jesse Lockett) should have Pick List Item # with actual number
- [ ] Pick List Status should show "In Stock ✅"
- [ ] Cross-check: Go to Sleeves sheet, find that item number
- [ ] Verify it's marked "On Shelf" with Class 2, Size Large

---

## Important Notes

### Why This Happened

The code fixes were committed to your local Git repository (clean-up branch) but:
- ❌ NOT copied to Google Apps Script yet
- ❌ Your Google Sheet is still running the OLD code

### The Fix

You need to **copy the updated code TO Google Apps Script** where your sheet actually runs the code.

### Git vs Google Apps Script

- **Git repository** = Your local code storage (on your computer)
- **Google Apps Script** = Where the code actually RUNS in your spreadsheet
- Changes in Git don't automatically appear in Google Sheets
- You must manually copy/deploy the code

---

## Need Help?

### If Deployment Doesn't Work

1. **Verify you have editor access** to the Apps Script project
2. **Check that Apps Script editor opens** (Extensions → Apps Script)
3. **Look for error messages** when saving
4. **Try closing and reopening** Apps Script editor

### If Menu Still Shows "Build Sheets"

1. **Hard refresh** your Google Sheet (Ctrl+Shift+R)
2. **Clear browser cache** for docs.google.com
3. **Open sheet in incognito mode** to test
4. **Verify Code.gs was saved** in Apps Script editor

### If Reclaims Still Shows "Need to Purchase"

1. **Verify function was renamed** in 40-Reclaims.gs
2. **Run "Generate All Reports"** again
3. **Check Apps Script execution log** for errors:
   - In Apps Script editor: View → Logs
   - Look for errors during updateReclaimsSheet execution

---

## Next Steps

1. ⏳ **YOU**: Deploy code to Google Apps Script (5 minutes)
2. ⏳ **YOU**: Refresh spreadsheet
3. ⏳ **YOU**: Run "Generate All Reports"
4. ⏳ **YOU**: Verify both issues are fixed
5. ⏳ **YOU**: Report back if still not working

---

*Created: January 8, 2026*  
*Status: Awaiting deployment to Google Apps Script*

