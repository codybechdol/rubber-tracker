# LOST-LOCATE Exclusion Policy

## Overview
Items marked with "LOST-LOCATE" in the Notes column are automatically excluded from all auto-generated pick lists across the system.

## Purpose
The LOST-LOCATE marker indicates that an item's physical location is unknown or the item is missing. These items should not be assigned to employees until they are physically located and verified.

## Where It Applies

### 1. Glove Swaps & Sleeve Swaps Pick Lists
- **Function:** `generateSwaps()` in `30-SwapGeneration.gs`
- **Behavior:** Items with LOST-LOCATE in Notes column are filtered out during pick list generation
- **Debug Logging:** Yes - logs when items are filtered

### 2. Class 3 Reclaims Pick Lists
- **Function:** `findReclaimPickListItem()` in `Code.gs`
- **Behavior:** Items with LOST-LOCATE in Notes column are excluded from downgrade replacements
- **Debug Logging:** Yes - logs when items are filtered
- **Result:** Shows "Need to Purchase ❌" if no other items available

### 3. Class 2 Reclaims Pick Lists
- **Function:** `findReclaimPickListItem()` in `Code.gs`
- **Behavior:** Items with LOST-LOCATE in Notes column are excluded from upgrade replacements
- **Debug Logging:** Yes - logs when items are filtered
- **Result:** Shows "Need to Purchase ❌" if no other items available

## How It Works

### Detection Logic
```javascript
var isLostLocate = function(item) {
  var notes = (item[10] || '').toString().trim().toUpperCase();
  return notes.indexOf('LOST-LOCATE') !== -1;
};
```

The system checks column K (Notes) for:
- "LOST-LOCATE" (exact match, case-insensitive)
- Any text containing "LOST-LOCATE" as a substring

### Filter Application
Items are checked against the `isLostLocate()` function in all pick list search priorities:
1. Exact size On Shelf
2. Size up On Shelf (gloves only)
3. Ready For Delivery
4. In Testing

An item will be **skipped** if:
- ✅ All other criteria match (class, size, status)
- ❌ Notes contain "LOST-LOCATE"

### Debug Logging
When an item is filtered due to LOST-LOCATE, the system logs:
```
findReclaimPickListItem: Filtered item #[ItemNum] for [EmployeeName] - LOST-LOCATE marker found
```

View logs: **Cloud Logs** in Google Sheets Apps Script execution history

## Lost Items Tracking

### Lost Items Table
Items with LOST-LOCATE markers appear in the **"Lost Items - Need to Locate"** table on the Reclaims sheet:
- Shows all gloves and sleeves marked as lost
- Includes: Item Type, Item #, Size, Class, Last Location, Last Assigned To, Date Assigned, Notes
- Highlighted in orange for visibility

### Resolution Process
1. **Physical Search:** Locate the missing item
2. **Update Status:** Remove "LOST-LOCATE" from Notes column in Gloves/Sleeves sheet
3. **Regenerate Reports:** Run "Generate All Reports" to make item available for pick lists
4. **Verification:** Item will now appear in pick lists and Lost Items table will be cleared

## Related Markers

### Similar Markers (NOT excluded from pick lists)
- **"LOST"** status - Items confirmed lost/destroyed, should be at "Lost" or "Destroyed" location
- **Other notes** - General notes don't affect pick list eligibility

### Only Excluded By
- **LOST-LOCATE** marker in Notes column (column K)

## Impact

### Positive
- ✅ Prevents assignment of missing items
- ✅ Forces proper item location verification
- ✅ Maintains inventory accuracy
- ✅ Reduces confusion for field operations

### Considerations
- ⚠️ May show "Need to Purchase ❌" even when items exist on paper
- ⚠️ Requires manual Notes column cleanup after items are located
- ⚠️ System can't distinguish between "lost" and "temporarily misplaced"

## Best Practices

### When to Use LOST-LOCATE
1. Item is missing from expected location
2. Item hasn't been seen in multiple weeks
3. Employee reports they don't have the item
4. Physical inventory audit reveals discrepancy

### When NOT to Use LOST-LOCATE
1. Item is temporarily at another location (use proper Status/Location instead)
2. Item is being cleaned or repaired (use "In Testing" or appropriate status)
3. Item is packed for delivery (use "Packed For Delivery" status)

### Clearing LOST-LOCATE
1. Physically verify item is found
2. Update Status and Location to reflect current state
3. Remove "LOST-LOCATE" from Notes column
4. Run "Generate All Reports" to update system

## Implementation Details

### Added: January 8, 2026
- **Files Modified:**
  - `src/Code.gs` - `findReclaimPickListItem()` function
  - `src/30-SwapGeneration.gs` - Already had LOST-LOCATE filtering
  
### Bug Fix Context
Prior to January 8, 2026, reclaim pick lists did NOT filter LOST-LOCATE items, causing the system to assign missing items (e.g., Item #1053 for Masen Worl's Class 3 reclaim). This has been corrected.

## Testing

### Verification Steps
1. Add "LOST-LOCATE" to an item's Notes column
2. Run "Generate All Reports"
3. Verify item appears in Lost Items table
4. Verify item does NOT appear in any pick lists
5. Check logs for filter confirmation

### Test Cases
- ✅ Glove with LOST-LOCATE excluded from swap pick list
- ✅ Sleeve with LOST-LOCATE excluded from swap pick list
- ✅ Class 2 item with LOST-LOCATE excluded from Class 3 reclaim pick list
- ✅ Class 3 item with LOST-LOCATE excluded from Class 2 reclaim pick list
- ✅ Item appears in Lost Items table when marked
- ✅ Debug logs confirm filtering

---

**Documentation Version:** 1.0  
**Last Updated:** January 8, 2026  
**Maintained By:** Glove Manager System

