# Quick Start: Investigating "Need to Purchase" Issues

## The Problem
You see "Need to Purchase ❌" on the Swap sheets, but you can see matching items in the Gloves/Sleeves sheets that are "On Shelf" or "In Testing".

## Quick Answer
**This is usually correct!** The item is available, but it's already been assigned to a different employee in the same swap generation. The system prevents assigning the same item twice.

**IMPORTANT:** Only employees within 31 days (or overdue) of their change-out date are included in swap generation. Employees outside this window will NOT appear on swap sheets and will NOT be assigned items.

## 3 Ways to Investigate

### Method 1: Check Who Got The Item (Easiest)
1. Open your Google Sheet
2. Click **Glove Manager → 🔍 Debug → 📊 Show All Sleeve Swaps** (or Glove Swaps)
3. Click OK on the popup
4. Go to **Extensions → Apps Script → View → Logs** (or Ctrl+Enter)
5. Find your employee in the logs
6. See which other employee got assigned the item you expected

**What you'll see:**
```
=== CLASS 2 ===

✓ John Smith → 104 (X-Large) - In Stock ✅
❌ Waco Worts - Size X-Large
   Current: 108
   Status: Need to Purchase ❌
   Available in inventory: 1
     • Item #2050 - Status: On Shelf

NOTE: Randy Dean (Item #107, change-out 3/25/26) is NOT shown because 
      he is outside the 31-day window and not eligible for swaps yet.
```

This shows you that John Smith got Item #104, and Item #2050 needs investigation.

### Method 2: Look at the Swap Sheet Directly
1. Open the **Sleeve Swaps** (or Glove Swaps) sheet
2. Find the location section with your employee
3. Look at OTHER employees in the same section
4. Check their "Pick List Item #" column (G)
5. See if they got the item you expected

### Method 3: Use Detailed Diagnostic (For Deep Dive)
1. Open **Extensions → Apps Script**
2. Find file **95-DiagnosticTools.gs**
3. Edit the `runDiagnostic()` function:
   ```javascript
   function runDiagnostic() {
     var employeeName = 'Waco Worts';  // ← Change this
     var itemType = 'Sleeves';          // ← 'Gloves' or 'Sleeves'
     
     diagnosePurchaseNeed(employeeName, itemType);
     // ...
   }
   ```
4. Click the Run button (▶)
5. View logs: **View → Logs** (or Ctrl+Enter)

**What you'll see:**
- Employee's current items
- Exact size being searched
- Every item that matches (exact size, size up)
- Why each item is filtered out:
  - "ALREADY USED" - assigned to someone else this generation
  - "PICKED FOR: [Name]" - reserved for that person
  - "LOST-LOCATE" - marked as lost in Notes
- Final conclusion explaining the issue

## Common Causes & Fixes

### Cause 1: Another Employee Got It First ✓ EXPECTED
**What happened:**
- Multiple employees need the same size
- First employee (by location/date sort) gets the available item
- Subsequent employees show "Need to Purchase"

**Fix:** 
- If this is wrong, manually override (see below)
- If this is right, you actually need to purchase more

### Cause 2: Item Is Reserved (Picked For)
**What happened:**
- Item has "John Smith Picked On 01/05/2026" in Picked For column
- Item is reserved for John Smith only

**Fix:**
1. Go to Gloves/Sleeves sheet
2. Find the item
3. Check column J (Picked For)
4. If swap is complete, clear the Picked For value
5. Re-run **Glove Manager → Generate All Reports**

### Cause 3: Item Marked LOST-LOCATE
**What happened:**
- Item has "LOST-LOCATE" in Notes column
- System excludes it from searches

**Fix:**
1. Go to Gloves/Sleeves sheet
2. Find the item
3. Check column K (Notes)
4. If item is found, remove "LOST-LOCATE"
5. Re-run **Glove Manager → Generate All Reports**

## Manual Override

If you want to assign a specific item to a specific employee:

1. Go to **Sleeve Swaps** (or Glove Swaps) sheet
2. Find the employee's row
3. In column G (Pick List Item #), type the item number (e.g., "104")
4. Press Enter
5. The cell turns **light blue** and Status shows "(Manual)"
6. This assignment survives "Generate All Reports"

## Menu Shortcuts

All diagnostic tools are in: **Glove Manager → 🔍 Debug**

- **🔍 Diagnose Employee Pick List** - Detailed analysis for one employee (edit code first)
- **📊 Show All Sleeve Swaps** - Overview of all sleeve swap assignments
- **📊 Show All Glove Swaps** - Overview of all glove swap assignments

## Example Output

```
========================================
ALL SWAP ASSIGNMENTS - Sleeves
========================================

=== CLASS 2 ===

✓ John Smith → 104 (X-Large) - In Stock ✅
❌ Waco Worts - Size X-Large
   Current: 108
   Status: Need to Purchase ❌
   Available in inventory: 1
     • Item #2050 - Status: On Shelf

NOTE: Randy Dean is NOT shown - his change-out date (3/25/26) is 
      outside the 31-day window, so he doesn't affect item assignment.

========================================
SUMMARY BY SIZE/CLASS
========================================

Class 2 Size X-Large:
  Total needing swaps: 2
  Successfully assigned: 1
  Need to Purchase: 1
  Employees needing purchase: Waco Worts
```

**Interpretation:** John Smith was processed first and got Item #104. Item #2050 exists but needs verification why it wasn't assigned to Waco. Randy Dean is not in the swap process yet (78 days until change-out), so his current sleeve (#107) has no impact.

## Key Takeaway

"Need to Purchase ❌" usually means:
- ✅ **Working as designed** - Item assigned to someone else
- ✅ **Actually need more** - All matching items are in use
- ⚠️ **Check reservation** - Item has Picked For value
- ⚠️ **Check notes** - Item marked LOST-LOCATE

The diagnostic tools will tell you which one!

---

**For more details, see:** `TROUBLESHOOTING_PICK_LIST.md`

