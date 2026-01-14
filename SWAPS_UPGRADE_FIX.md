# Swaps Upgrade Fix - Pick List Item Optimization

## Date: January 14, 2026

## Problem
When "Generate All Reports" was run, pick list items with "In Testing" status were not being upgraded to available "On Shelf" items, even when matching items were available in inventory.

Example: Darrell Swann was assigned pick list item #1033 (In Testing) when there were multiple matching "On Shelf" items available (e.g., #1011, #1019).

## Root Cause (FOUND!)

### Primary Issue: New Item Dialog Setting Wrong Status
The `processNewItemDialogSubmit()` function in `61-InventoryReports.gs` was setting Status = "Assigned" for ALL items that had an "Assigned To" value, even when "Assigned To" was set to "On Shelf".

**Example of bad data:**
- Item #1011: Status = "Assigned", Assigned To = "On Shelf" ❌
- Should be: Status = "On Shelf", Assigned To = "On Shelf" ✅

This caused items that were physically on the shelf to be invisible to the pick list generation because it only looked for `status === 'on shelf'`.

### Secondary Issues in upgradePickListItems()
1. Only checked for "In Testing" items, not "Need to Purchase"
2. Didn't check for the "Picked" checkbox - would potentially override items already processed
3. Didn't detect manual edits (light blue background)
4. Didn't support size+0.5 fallback for gloves
5. Redundant upgrade logic existed in Code.gs that ran during initial generation

## Solution

### 1. Fixed processNewItemDialogSubmit() (61-InventoryReports.gs)
When "Assigned To" is a status value (On Shelf, In Testing, etc.) rather than an employee name:
- Set Status to match the Assigned To value
- Set Location from form or default to Helena for On Shelf items
- Don't treat it as an employee assignment

**Status values detected:** On Shelf, In Testing, Ready For Delivery, Ready For Test, Lost, Failed Rubber

### 2. Fixed Swap Generation to Handle Data Inconsistency (Code.gs & 30-SwapGeneration.gs)
Added fallback logic to find items where:
- Status = "On Shelf" (correct) OR
- Status = "Assigned" AND Assigned To = "On Shelf" (data inconsistency)

This ensures existing bad data is still usable until corrected.

### 3. Added STATUS_PRIORITY Constants (30-SwapGeneration.gs)
```javascript
var STATUS_PRIORITY = {
  'on shelf': 1,
  'in testing': 2
};
```

### 4. Rewrote upgradePickListItems() Function
**New Upgrade Rules:**
- Only upgrades items that do NOT have the "Picked" checkbox marked (column I)
- Only upgrades items that were NOT manually added (no light blue background #e3f2fd)
- Priority: On Shelf (1) > In Testing (2)
- Does NOT upgrade "Ready For Delivery" items
- Follows same pick list rules: exact size first, then size+0.5 for gloves

### 5. Removed Redundant Code from Code.gs
Deleted ~45 lines of inline upgrade check logic since `upgradePickListItems()` handles upgrades post-generation.

## Files Modified
- `src/61-InventoryReports.gs` - Fixed processNewItemDialogSubmit to handle status values in Assigned To
- `src/30-SwapGeneration.gs` - Added constants, helper function, rewrote upgrade function, added fallback for bad data
- `src/Code.gs` - Removed redundant upgrade logic, added fallback for bad data

## Testing Instructions
1. Run "Glove Manager → Generate All Reports"
2. Check Glove Swaps sheet for employees with "In Testing" status
3. Verify they get upgraded to "On Shelf" items when available
4. Items with:
   - "Picked" checkbox checked should NOT change
   - Light blue background should NOT change
   - "Ready For Delivery" status should NOT change

## Expected Results
- Darrell Swann (size 9.5, Class 2): Should get item #1011 or #1019 (On Shelf)
- Ben Lapka (size 9.5, Class 2): Should get item #1011 or #1019 (On Shelf)  
- Taylor Goff (size 10, Class 2): Should get item #1004 or #1009 (if On Shelf)
- Jordan Peterson (size 10, Class 2): Should get item #1004 or #1009 (if On Shelf)
- Items already marked as picked or manually edited should remain unchanged

## Data Cleanup Recommended
For existing items with Status = "Assigned" but Assigned To = "On Shelf", manually update the Status column to "On Shelf" to ensure data consistency going forward.

