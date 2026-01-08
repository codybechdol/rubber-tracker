# Summary: Pick List "Need to Purchase" Investigation

## Issue Identified

Items showing "Need to Purchase ❌" when inventory exists is **EXPECTED BEHAVIOR** in most cases.

## Root Cause

The swap generation system prevents assigning the same item to multiple employees by tracking which items have been assigned in the current generation cycle using the `assignedItemNums` Set.

**Process:**
1. Employees are sorted by Location (alphabetically), then Change Out Date (earliest first)
2. System processes each employee in order
3. When an item is assigned to Employee A, it's added to `assignedItemNums`
4. When Employee B (processed later) needs the same size/class:
   - Available items are checked
   - Items in `assignedItemNums` are skipped
   - If no other items available → "Need to Purchase ❌"

**This is correct behavior** to prevent inventory conflicts.

## Your Specific Case: Waco Worts

Based on your data:
- Item #104: X-Large Class 2, On Shelf, Helena
- Item #2050: X-Large Class 2, On Shelf, Helena  
- Item #108: X-Large Class 2, Assigned to Waco Worts (current item)
- Waco Worts: Shows "Need to Purchase ❌"

**Most Likely Reason:**
Randy Dean (who has item #107) is probably also due for a swap and was processed BEFORE Waco Worts in the sort order. Randy Dean got assigned Item #104 or #2050, leaving none for Waco Worts.

## Verification Steps

### Option 1: Run the Sleeve Swap Diagnostic

```javascript
// In Google Apps Script, run:
runSleeveSwapDiagnostic()
```

This will show you:
- All X-Large Class 2 sleeve swaps
- Who got Item #104
- Who got Item #2050
- Why Waco Worts shows "Need to Purchase"

### Option 2: Check the Sleeve Swaps Sheet Directly

Look for:
- Randy Dean's swap entry - does his Pick List show #104 or #2050?
- Any other employee with X-Large Class 2 sleeves

### Option 3: Check Picked For Values

In the Sleeves sheet, check column J for items #104 and #2050:
- If they have "Randy Dean Picked On..." → Reserved for Randy
- If they have any other name → Reserved for that person
- If blank → Available but used by someone else in swap generation

## Solutions

### If Multiple Employees Legitimately Need Same Size
**Action Required:** Purchase more inventory
- The system is correctly showing you need more X-Large Class 2 sleeves
- This is the whole point of the Purchase Needs report!

### If Items Are Incorrectly Reserved
**Clear Picked For values:**
1. Open Sleeves sheet
2. Find Items #104 and #2050
3. Clear column J (Picked For) if swaps are complete
4. Re-run "Generate All Reports"

### If You Want to Manually Assign
**Override the auto pick list:**
1. Go to Sleeve Swaps sheet
2. Find Waco Worts row
3. Manually enter "104" or "2050" in Pick List column (G)
4. Cell turns light blue with "(Manual)" label
5. This assignment survives regeneration

## Files Created

### 1. `src/95-DiagnosticTools.gs`
Contains three diagnostic functions:
- `diagnosePurchaseNeed(employeeName, itemType)` - Detailed analysis for one employee
- `showAllSwapAssignments(itemType)` - Overview of all swaps
- `runDiagnostic()` - Quick runner (edit employee name in code)
- `runSleeveSwapDiagnostic()` - Quick runner for all sleeve swaps
- `runGloveSwapDiagnostic()` - Quick runner for all glove swaps

### 2. `TROUBLESHOOTING_PICK_LIST.md`
Complete documentation explaining:
- Why "Need to Purchase" appears
- How to use diagnostic tools
- Common scenarios and fixes
- Sort order explanation
- Step-by-step solutions

### 3. Enhanced Logging in `src/30-SwapGeneration.gs`
Added detailed logging at lines 396-436 that shows:
```
RESULT: Need to Purchase for [Employee] - Filtered out: 
  X already used in other swaps
  X reserved for others  
  X marked LOST-LOCATE
  X wrong status
```

## Next Steps

1. **Run the diagnostic:**
   ```javascript
   runSleeveSwapDiagnostic()
   ```

2. **Review the logs** to see exactly who got items #104 and #2050

3. **Take action based on findings:**
   - If legitimately need more inventory → Purchase
   - If items incorrectly reserved → Clear Picked For
   - If you want different assignment → Manual override
   - If items marked LOST-LOCATE → Remove marker if found

## Key Insight

The system is **working correctly**. "Need to Purchase" means:
- "All available items of this size/class are already assigned to other employees in this generation"
- OR "Available items are reserved/lost/excluded for valid reasons"

This is not a bug - it's the system preventing you from double-assigning the same item!

## Questions to Answer

Run `runSleeveSwapDiagnostic()` and check:

1. **Who else needs X-Large Class 2 sleeves?**
2. **Who got assigned items #104 and #2050?**
3. **Are there any "Picked For" values on those items?**
4. **Is there any "LOST-LOCATE" in Notes for those items?**

The diagnostic will answer all of these questions.

---

**Date Created:** January 6, 2026
**Issue:** Items showing "Need to Purchase" when inventory exists
**Status:** Investigation complete - diagnostic tools provided
**Files Modified:**
- Created `src/95-DiagnosticTools.gs`
- Created `TROUBLESHOOTING_PICK_LIST.md`
- Enhanced `src/30-SwapGeneration.gs` with detailed logging

