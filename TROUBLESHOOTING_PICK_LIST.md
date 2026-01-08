# Troubleshooting Pick List Issues

## Problem: "Need to Purchase ❌" Shows When Items Are Available

### Understanding the Issue

The swap generation system shows "Need to Purchase ❌" even when items exist in inventory for several valid reasons:

1. **Multiple employees need the same size (Most Common)**
   - When swap generation runs, employees are processed in order (sorted by location, then change-out date)
   - The FIRST employee to be processed gets the available item
   - That item is marked as "used" for this generation cycle
   - SUBSEQUENT employees needing the same size will show "Need to Purchase"
   - **This is intentional** to prevent assigning the same item to multiple people

2. **Items Reserved for Other Employees**
   - Items with "Picked For" values for different employees are skipped
   - Example: Item has "John Smith Picked On 01/05/2026" in the Picked For column

3. **LOST-LOCATE Marker**
   - Items with "LOST-LOCATE" in the Notes column are completely excluded
   - Even if their status is "On Shelf" or "In Testing"

4. **Wrong Status**
   - Only items with these statuses are considered available:
     - "On Shelf"
     - "In Testing"
     - "Ready For Delivery"
   - Items with other statuses (Assigned, Failed Rubber, Lost, etc.) are not searched

## Diagnostic Tools

Three diagnostic functions are available in `src/95-DiagnosticTools.gs`:

### 1. runDiagnostic()
**Purpose:** Investigate why a specific employee shows "Need to Purchase"

**How to use:**
1. Open Google Apps Script editor
2. Open `src/95-DiagnosticTools.gs`
3. Edit the `runDiagnostic()` function:
   ```javascript
   function runDiagnostic() {
     var employeeName = 'Waco Worts';  // ← Change this
     var itemType = 'Sleeves';          // ← Change to 'Gloves' or 'Sleeves'
     
     diagnosePurchaseNeed(employeeName, itemType);
     SpreadsheetApp.getUi().alert('Diagnostic complete...');
   }
   ```
4. Run the function (play button or `Ctrl+R`)
5. View logs: `View → Logs` or `Ctrl+Enter`

**Output shows:**
- Employee's current items
- Their swap entry details
- Available items in inventory by category:
  - On Shelf (Exact Size)
  - On Shelf (Size Up) - for gloves only
  - In Testing (Exact Size)
  - In Testing (Size Up) - for gloves only
  - Ready For Delivery (Exact Size)
  - Ready For Delivery (Size Up) - for gloves only
- Items reserved for other employees
- Items marked LOST-LOCATE
- **Conclusion:** Explains why items are filtered out

### 2. runSleeveSwapDiagnostic()
**Purpose:** Show overview of ALL sleeve swaps and identify patterns

**How to use:**
1. Open `src/95-DiagnosticTools.gs`
2. Run `runSleeveSwapDiagnostic()` function
3. View logs

**Output shows:**
- All sleeve swap assignments by class
- For each "Need to Purchase" case:
  - Employee name
  - Current item number
  - Size needed
  - **Available items in inventory** with their:
    - Item numbers
    - Status
    - Picked For values
    - Notes
- Summary by Size/Class showing:
  - Total employees needing each size
  - Successfully assigned
  - Need to Purchase count

### 3. runGloveSwapDiagnostic()
Same as `runSleeveSwapDiagnostic()` but for gloves.

## Example: Waco Worts Sleeve Issue

Based on your data:
```
Item #104 - X-Large Class 2 - On Shelf
Item #2050 - X-Large Class 2 - On Shelf
Waco Worts - X-Large Class 2 - Need to Purchase ❌
```

**Likely causes:**

1. **Another employee was processed first**
   - If Randy Dean (or another employee) also needs X-Large Class 2 sleeves
   - AND Randy Dean appears earlier in the sort order (alphabetically by location, then by change-out date)
   - Randy Dean would get Item #104 or #2050
   - Waco Worts would show "Need to Purchase"

2. **Items are reserved**
   - Check Items #104 and #2050 for "Picked For" values
   - If they say "Randy Dean Picked On...", they're reserved for him

3. **Items marked LOST-LOCATE**
   - Check the Notes column for Items #104 and #2050
   - If either has "LOST-LOCATE" in Notes, it's excluded

## How to Fix

### Solution 1: Check Who Got the Item First
Run `runSleeveSwapDiagnostic()` to see:
- Which employee was assigned Item #104 or #2050
- The order of processing

**If another employee legitimately needs it:**
- This is correct behavior
- You actually need to purchase more inventory

### Solution 2: Clear Old "Picked For" Reservations
If swaps were completed but "Picked For" wasn't cleared:

1. Open the Sleeves (or Gloves) sheet
2. Find the items showing "Need to Purchase"
3. Check column J (Picked For)
4. If the swap is complete and the item is On Shelf, clear the Picked For value
5. Re-run "Generate All Reports"

### Solution 3: Remove LOST-LOCATE Markers
If items have been found:

1. Open the Sleeves (or Gloves) sheet
2. Check column K (Notes) for "LOST-LOCATE"
3. Remove the marker if items are no longer lost
4. Re-run "Generate All Reports"

### Solution 4: Manual Pick List Override
If you know which item should go to which employee:

1. Go to the Sleeve Swaps (or Glove Swaps) sheet
2. Manually enter the item number in the Pick List column (G)
3. The cell will turn light blue and show "(Manual)"
4. This manual assignment survives regeneration

## Understanding Sort Order

Employees are processed in this order:
1. **Location** (alphabetically)
2. **Change Out Date** (earliest first within each location)

Example sort order:
- Bozeman employees (by change-out date)
- Butte employees (by change-out date)
- Great Falls employees (by change-out date)
- Helena employees (by change-out date)

The FIRST employee in this order gets the available item.

## Enhanced Logging

The swap generation code now includes enhanced logging. When you run "Generate All Reports", check the execution logs to see:

```
RESULT: Need to Purchase for [Employee] - Filtered out: 
  2 already used in other swaps, 1 reserved for others
```

This tells you exactly why items were filtered out.

## Common Scenarios

### Scenario 1: Multiple Employees, One Available Item
- 3 employees need Size 10 Class 2 gloves
- Only 1 is On Shelf
- Result: First employee gets it, other 2 show "Need to Purchase" ✓ CORRECT

### Scenario 2: Item Available But Reserved
- Item #104 is On Shelf
- Item #104 has "John Smith Picked On 01/05/2026" in Picked For
- Jane Doe needs same size
- Result: Jane shows "Need to Purchase" ✓ CORRECT (item reserved for John)

### Scenario 3: Item On Shelf But Marked LOST-LOCATE
- Item #2050 is On Shelf
- Item #2050 has "LOST-LOCATE" in Notes
- Employee needs that size
- Result: Employee shows "Need to Purchase" ✓ CORRECT (item flagged as lost)

### Scenario 4: Item Actually Available But Filtered
- Item #104 is On Shelf
- No Picked For value
- No LOST-LOCATE marker
- Employee shows "Need to Purchase"
- Result: Run diagnostic to see who got the item first

## Summary

The "Need to Purchase" status is usually correct. It means:
- All available items of this size/class are already assigned to other employees in this swap cycle
- OR items are reserved/lost/wrong status

Use the diagnostic tools to verify and identify the actual cause.

