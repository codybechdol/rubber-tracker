# Deployment Instructions - Waco Investigation Enhancements

## Files Modified

### 1. src/Code.gs
**Location:** Lines 100-105 (Debug submenu)

**Changes:** Added three diagnostic menu items to the Debug submenu

**What to do:**
1. Open Apps Script Editor
2. Find the `onOpen()` function
3. Locate the Debug submenu section (around line 100)
4. Replace the Debug submenu code with:

```javascript
.addSubMenu(ui.createMenu('🔍 Debug')
  .addItem('Test Edit Trigger', 'testEditTrigger')
  .addItem('Recalc Current Row', 'recalcCurrentRow')
  .addSeparator()
  .addItem('🔍 Diagnose Employee Pick List', 'runDiagnostic')
  .addItem('📊 Show All Sleeve Swaps', 'runSleeveSwapDiagnostic')
  .addItem('📊 Show All Glove Swaps', 'runGloveSwapDiagnostic'))
```

---

### 2. src/30-SwapGeneration.gs
**Location:** Lines 257-290 (Enhanced Waco debug logging)

**Changes:** Enhanced debug logging for Waco to show ALL matching items in inventory

**What to do:**
1. Open Apps Script Editor
2. Find file `30-SwapGeneration.gs`
3. Locate the section with `var debugEmployee = (employeeName.toLowerCase().indexOf('waco') !== -1);`
4. Replace from that line through the closing brace with:

```javascript
// Debug logging for problematic cases
var debugEmployee = (employeeName.toLowerCase().indexOf('waco') !== -1);
if (debugEmployee) {
  Logger.log('=== DEBUG for ' + employeeName + ' ===');
  Logger.log('Item type: ' + itemType);
  Logger.log('meta.empPreferredSize (raw from employee): "' + meta.empPreferredSize + '"');
  Logger.log('meta.itemSize (from current item): "' + meta.itemSize + '"');
  Logger.log('useSize (what we will search for): "' + useSize + '"');
  Logger.log('useSize normalized: "' + normalizeSleeveSize(useSize) + '"');
  Logger.log('Looking for Class ' + meta.itemClass);
  
  // Show all items of this class and size in inventory
  Logger.log('\n--- ALL Class ' + meta.itemClass + ' items in inventory (size matching) ---');
  var debugCount = 0;
  inventoryData.forEach(function(item) {
    if (parseInt(item[2], 10) !== meta.itemClass) return;
    var itemSize = item[1];
    var sizeMatch = false;
    if (isGloves) {
      sizeMatch = parseFloat(itemSize) === useSize || parseFloat(itemSize) === useSize + 0.5;
    } else {
      sizeMatch = normalizeSleeveSize(itemSize) === normalizeSleeveSize(useSize);
    }
    if (sizeMatch) {
      debugCount++;
      var pickedFor = (item[9] || '').toString().trim();
      var notes = (item[10] || '').toString().trim();
      var isInAssignedSet = assignedItemNums.has(item[0]);
      Logger.log('  [' + debugCount + '] Item #' + item[0] + 
                 ' | Size: "' + itemSize + '"' +
                 ' | Status: "' + item[6] + '"' + 
                 ' | Assigned To: "' + item[7] + '"' +
                 (pickedFor ? ' | Picked For: "' + pickedFor + '"' : '') +
                 (notes ? ' | Notes: "' + notes + '"' : '') +
                 (isInAssignedSet ? ' | [ALREADY IN assignedItemNums]' : ''));
    }
  });
  Logger.log('--- Total matching items found: ' + debugCount + ' ---\n');
}
```

**Also:** There's enhanced "Need to Purchase" reason logging around lines 396-442 that was already added.

---

## New File to Add

### 3. src/95-DiagnosticTools.gs
**Status:** NEW FILE - Must be created

**What to do:**
1. Open Apps Script Editor
2. Click the **+** button next to Files
3. Select **Script**
4. Name it: `95-DiagnosticTools`
5. Copy the entire contents from `src/95-DiagnosticTools.gs` in your local project

**Contents:** This file contains three diagnostic functions:
- `diagnosePurchaseNeed(employeeName, itemType)` - Detailed employee analysis
- `showAllSwapAssignments(itemType)` - Overview of all swaps
- `runDiagnostic()` - Quick runner (edit employee name)
- `runSleeveSwapDiagnostic()` - Quick runner for sleeves
- `runGloveSwapDiagnostic()` - Quick runner for gloves

**File is 436 lines** - You can copy it from your local `src/95-DiagnosticTools.gs`

---

## Quick Deployment Steps

### Option A: Manual Copy (Recommended if clasp isn't working)

1. **Open Apps Script Editor** from your Google Sheet:
   - Extensions → Apps Script

2. **Modify Code.gs**:
   - Find the Debug submenu in `onOpen()` function
   - Add the three new menu items (see above)

3. **Modify 30-SwapGeneration.gs**:
   - Find the Waco debug section
   - Replace with enhanced version (see above)

4. **Create 95-DiagnosticTools.gs**:
   - Click + next to Files → Script
   - Name it `95-DiagnosticTools`
   - Copy entire file contents from your local version

5. **Save** (Ctrl+S or click disk icon)

### Option B: Using clasp (If available)

```powershell
cd "C:\Users\codyb\WebstormProjects\Rubber Tracker"
npx @google/clasp push
```

If clasp prompts for login:
```powershell
npx @google/clasp login
```

---

## Verification Steps

After deployment:

1. **Refresh your Google Sheet**
2. **Check the menu**: Glove Manager → 🔍 Debug
3. **You should see**:
   - Test Edit Trigger
   - Recalc Current Row
   - --- (separator line)
   - 🔍 Diagnose Employee Pick List
   - 📊 Show All Sleeve Swaps
   - 📊 Show All Glove Swaps

4. **Run a test**: 
   - Glove Manager → Generate All Reports
   - Check Extensions → Apps Script → View → Logs
   - Look for Waco debug output

---

## What These Changes Do

### Enhanced Debug Logging
When you run "Generate All Reports", if Waco is in the swap list, the logs will automatically show:
- All X-Large Class 2 items in inventory
- Their complete status (On Shelf, Assigned, etc.)
- Picked For values
- Notes (including LOST-LOCATE markers)
- Whether they're already used in assignedItemNums

### Diagnostic Menu Items
Three new functions accessible from the Debug menu:
- **Diagnose Employee Pick List** - Deep dive for one employee (edit code to specify name)
- **Show All Sleeve Swaps** - See all sleeve assignments and who got what
- **Show All Glove Swaps** - See all glove assignments and who got what

### Result
You'll be able to immediately see:
1. **Why** Waco shows "Need to Purchase"
2. **Who** (if anyone) got Items #104 and #2050
3. **What's** filtering out available items

---

## Files Summary

**Modified:**
- ✏️ src/Code.gs (3 new menu items)
- ✏️ src/30-SwapGeneration.gs (enhanced Waco logging)

**Created:**
- ✨ src/95-DiagnosticTools.gs (436 lines - NEW FILE)

**Documentation (for reference only - not deployed to Apps Script):**
- 📄 PICK_LIST_QUICK_START.md
- 📄 TROUBLESHOOTING_PICK_LIST.md
- 📄 WACO_INVESTIGATION.md
- 📄 PICK_LIST_INVESTIGATION_SUMMARY.md
- 📄 WACO_INVESTIGATION_RESOLUTION.md

---

## Next Steps After Deployment

1. **Run:** Glove Manager → Generate All Reports
2. **Check Logs:** Extensions → Apps Script → View → Logs
3. **Find:** Waco debug section showing all X-Large Class 2 items
4. **Identify:** Which item was assigned or why none were available

This will immediately show you what's happening with Waco's pick list!

