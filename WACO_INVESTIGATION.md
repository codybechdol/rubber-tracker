# Waco Worts Specific Investigation

## Date: January 6, 2026

## Facts
- **Waco Worts:** Change-out date 2/4/26 (30 days away) - **IN 31-day window** ✓
- **Randy Dean:** Change-out date 3/25/26 (78 days away) - **OUTSIDE 31-day window** ✓
- **Item #104:** X-Large Class 2, On Shelf, Helena
- **Item #2050:** X-Large Class 2, On Shelf, Helena
- **Item #107:** X-Large Class 2, Assigned to Randy Dean (not in swap process)
- **Item #108:** X-Large Class 2, Assigned to Waco Worts (current item)

## Confirmed Logic

Code at line 208 of `src/30-SwapGeneration.gs`:
```javascript
if (dateAssigned && changeOutDate && daysLeft !== '' && 
    ((typeof daysLeft === 'number' && daysLeft < 32) || daysLeft === 'OVERDUE')) {
```

This confirms:
- **daysLeft < 32** means ≤31 days
- Randy Dean (78 days) is **NOT** in the swap process
- Randy's Item #107 is **NOT** competing for assignment
- Waco Worts (30 days) **IS** in the swap process

## What To Check

Since Randy is NOT affecting Waco's assignment, we need to find out why Items #104 and #2050 aren't being assigned to Waco:

### Check 1: Run the Diagnostic
```javascript
// In Apps Script, edit runDiagnostic() function:
function runDiagnostic() {
  var employeeName = 'Waco Worts';
  var itemType = 'Sleeves';
  
  diagnosePurchaseNeed(employeeName, itemType);
  SpreadsheetApp.getUi().alert('Diagnostic complete...');
}
```

This will show:
- Waco's current sleeve (should be #108)
- Waco's preferred size (should be X-Large)
- All X-Large Class 2 sleeves in inventory
- **Why each item is filtered:**
  - Item #104 - check for: ALREADY USED, PICKED FOR, LOST-LOCATE
  - Item #2050 - check for: ALREADY USED, PICKED FOR, LOST-LOCATE

### Check 2: Who Else Needs X-Large Class 2 in 31-Day Window?

Run the sleeve swap diagnostic:
```javascript
runSleeveSwapDiagnostic()
```

Look for:
- **Other employees** with X-Large Class 2 sleeves
- **Within 31 days** of change-out
- Who got assigned Items #104 or #2050

### Check 3: Verify Item Status

In the **Sleeves** sheet, check these columns for Items #104 and #2050:

| Item # | Col G: Status | Col H: Assigned To | Col J: Picked For | Col K: Notes |
|--------|---------------|-------------------|-------------------|--------------|
| 104    | ?             | ?                 | ?                 | ?            |
| 2050   | ?             | ?                 | ?                 | ?            |

Look for:
- ❌ **Status** ≠ "On Shelf" (should be "On Shelf" to be available)
- ❌ **Picked For** has another employee's name
- ❌ **Notes** contains "LOST-LOCATE"

### Check 4: Size Matching

The diagnostic will show:
```
Employee preferred size: X-Large
Search size: X-Large
Normalized search size: X-LARGE
```

Then for each item:
```
Checking item 104: Size="X-Large"
  Item normalized: "X-LARGE" vs useSize normalized: "X-LARGE"
  sizeMatch=true
```

If `sizeMatch=false`, there's a formatting issue with the size values.

## Possible Causes (In Order of Likelihood)

### 1. Another Employee Got Them First (Most Likely)
- Another employee in Bozeman (or earlier alphabetically)
- Also needs X-Large Class 2 sleeves
- Also within 31 days
- Processed before Waco in sort order
- Got assigned Item #104 and/or #2050

**How to verify:** Run `runSleeveSwapDiagnostic()` and look at ALL Class 2 X-Large entries.

### 2. Items Have "Picked For" Values
- Item #104 has "John Smith Picked On 01/05/2026"
- Item #2050 has "Jane Doe Picked On 01/04/2026"
- Both reserved for others

**How to verify:** Check column J in Sleeves sheet.

### 3. Items Marked LOST-LOCATE
- Notes column has "LOST-LOCATE" flag
- System excludes them completely

**How to verify:** Check column K in Sleeves sheet.

### 4. Size Normalization Issue
- Waco's preferred size: "XL" or "X-L" or "XLarge"
- Item sizes: "X-Large"
- Normalization should handle this, but verify

**How to verify:** Run `runDiagnostic()` and check the normalized sizes in logs.

### 5. Wrong Status
- Items show "On Shelf" in your view
- But actually are "Assigned" or another status
- Unlikely if you copied from sheet

**How to verify:** Check column G in Sleeves sheet.

## Next Steps

1. **Run the diagnostic** (2 minutes):
   ```javascript
   runSleeveSwapDiagnostic()
   ```

2. **Look at the logs** and find:
   - Who got Item #104?
   - Who got Item #2050?
   - Are there other X-Large Class 2 employees in the swap list?

3. **Check the Sleeves sheet** for Items #104 and #2050:
   - Column J (Picked For) - should be blank
   - Column K (Notes) - should NOT have "LOST-LOCATE"

4. **Report back** with:
   - What the diagnostic shows
   - Who (if anyone) got Items #104 and #2050
   - The Picked For and Notes values

## Expected Resolution

Most likely scenario: There's another employee (not Randy!) who:
- Needs X-Large Class 2 sleeves
- Is within 31 days of change-out
- Is in Bozeman (same location as Waco)
- OR is in an earlier location alphabetically (like "Billings" or "Butte")
- Got processed first and was assigned Item #104 or #2050

If that's the case, the system is working correctly and you actually need more X-Large Class 2 inventory.

---

## Summary

✅ **Randy Dean is NOT affecting Waco** - confirmed by code review
✅ **31-day window logic is correct** - Randy is excluded at 78 days
❓ **Need to find who/what IS affecting Waco** - use diagnostics

Run the diagnostics and let's find out what's really happening!

