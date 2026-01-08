# Debug: "Need to Purchase" Issue Investigation

## Issue Description
Waco Worts (and potentially other employees) are showing "Need to Purchase ❌" status in the Sleeve Swaps sheet, even though there are correct class and size items available on the shelf.

## Changes Made

### Added Debug Logging to `30-SwapGeneration.gs`

I've added comprehensive debug logging to help diagnose why items aren't being found:

1. **Employee Detection** (Line ~241):
   - Detects when processing employees with "waco" in their name
   - Logs the class, size, and item type being searched for

2. **Search Progress** (Line ~289-308):
   - Logs each item checked during the "On Shelf" exact size search
   - Shows all matching criteria: Status, Size, Class, sizeMatch, notAssigned, pickedFor, isReservedForOther, notLost
   - Logs when a match is found OR when no match is found

3. **Final Result** (Line ~352):
   - Logs when "Need to Purchase" is determined

## How to Use Debug Logging

1. Open the Google Apps Script editor for your Rubber Tracker spreadsheet
2. Run "Generate All Reports" or "Generate Sleeve Swaps"
3. Open View → Logs (or Ctrl+Enter)
4. Look for lines starting with "=== DEBUG for Waco Worts ==="
5. Review the detailed output to see why items aren't matching

## Common Reasons for "Need to Purchase"

The debug logs will reveal which of these conditions is preventing a match:

1. **No items with correct Status**
   - Item must be "On Shelf", "Ready for Delivery", or "In Testing"
   
2. **Class Mismatch**
   - Item class doesn't match employee's approved class
   
3. **Size Mismatch**
   - For sleeves: size string doesn't match exactly (case-insensitive)
   - For gloves: numeric size doesn't match (or +0.5 for size-up)
   
4. **Item Already Assigned**
   - Item is already in the `assignedItemNums` Set (picked for another employee earlier in the process)
   
5. **Reserved for Someone Else**
   - Item has a "Picked For" value with a different employee's name
   
6. **LOST-LOCATE Marker**
   - Item has "LOST-LOCATE" in the Notes column (Column K)

## Next Steps

1. Run the report and check the logs for Waco Worts
2. Share the debug output to identify which condition is causing the issue
3. Once identified, we can implement the appropriate fix

## Example Debug Output

```
=== DEBUG for Waco Worts ===
Looking for Class 2, Size: X-Large
Item type: Sleeves
Checking item 108: Status=On Shelf, Size=X-Large, Class=2, sizeMatch=true, notAssigned=true, pickedFor="", isReservedForOther=false, notLost=true
FOUND On Shelf match: 108
```

OR if not found:

```
=== DEBUG for Waco Worts ===
Looking for Class 2, Size: X-Large
Item type: Sleeves
Checking item 108: Status=On Shelf, Size=X-Large, Class=2, sizeMatch=false, notAssigned=true, pickedFor="", isReservedForOther=false, notLost=true
Checking item 109: Status=On Shelf, Size=Large, Class=2, sizeMatch=false, notAssigned=true, pickedFor="", isReservedForOther=false, notLost=true
No On Shelf exact size match found
RESULT: Need to Purchase - no matches found in any search
```

## Important Notes

- **"In Testing" is VALID**: Items with "In Testing" status CAN be assigned to pick lists
- **Picked Warning is Correct**: The popup warning when checking "Picked" on an "In Testing" item is working as intended
- **LOST-LOCATE Filter**: Already implemented and working - items with "LOST-LOCATE" in notes are excluded

