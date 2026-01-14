# Swaps Upgrade Fix - Pick List Item Optimization

## Date: January 14, 2026

## Problem
When "Generate All Reports" was run, pick list items with "In Testing" status were not being upgraded to available "On Shelf" items, even when matching items were available in inventory.

Example: Darrell Swann was assigned pick list item #1033 (In Testing) when there were multiple matching "On Shelf" items available (e.g., #220, #584, #668).

## Root Cause
The `upgradePickListItems()` function had several issues:
1. Only checked for "In Testing" items, not "Need to Purchase"
2. Didn't check for the "Picked" checkbox - would potentially override items already processed
3. Didn't detect manual edits (light blue background)
4. Didn't support size+0.5 fallback for gloves
5. Redundant upgrade logic existed in Code.gs that ran during initial generation

## Solution

### 1. Added STATUS_PRIORITY Constants (30-SwapGeneration.gs)
```javascript
var STATUS_PRIORITY = {
  'on shelf': 1,
  'in testing': 2
};
```

### 2. Added getStatusPriority() Helper Function
Normalizes status strings with icons/modifiers to priority levels.

### 3. Rewrote upgradePickListItems() Function
**New Upgrade Rules:**
- Only upgrades items that do NOT have the "Picked" checkbox marked (column I)
- Only upgrades items that were NOT manually added (no light blue background #e3f2fd)
- Priority: On Shelf (1) > In Testing (2)
- Does NOT upgrade "Ready For Delivery" items
- Follows same pick list rules: exact size first, then size+0.5 for gloves

**Key Changes:**
- Gets background colors to detect manual edits
- Reads "Picked" checkbox (column I) to skip already-processed items
- Includes "Need to Purchase" items as upgrade candidates
- Excludes "Ready For Delivery" from upgrades
- Uses `normalizeSleeveSize()` for sleeve size matching
- Adds size+0.5 fallback for gloves (matching existing pick list rules)
- Looks backwards to find class header when item class can't be determined

### 4. Removed Redundant Code from Code.gs
Deleted ~45 lines of inline upgrade check logic (the `betterOnShelfItem` search block) since `upgradePickListItems()` handles upgrades post-generation.

## Files Modified
- `src/30-SwapGeneration.gs` - Added constants, helper function, rewrote upgrade function
- `src/Code.gs` - Removed redundant upgrade logic

## Testing Instructions
1. Run "Glove Manager → Generate All Reports"
2. Check Glove Swaps sheet for employees with "In Testing" status
3. Verify they get upgraded to "On Shelf" items when available
4. Items with:
   - "Picked" checkbox checked should NOT change
   - Light blue background should NOT change
   - "Ready For Delivery" status should NOT change

## Expected Results
- Darrell Swann (size 9.5, Class 2): Should upgrade from #1033 (In Testing) to an available On Shelf item
- Austin York (size 11, Class 2): Should upgrade from #770 (In Testing) to an available On Shelf item
- Taylor Goff (size 10, Class 2): Should upgrade from #2097 (In Testing) to an available On Shelf item
- Items already marked as picked or manually edited should remain unchanged

