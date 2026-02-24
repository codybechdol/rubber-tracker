# Legacy Code Consolidation - February 18, 2026

## Summary

Investigated moving legacy code from Code.gs to a separate file. After careful analysis, decided to:

1. **Create `98-LegacyArchive.gs`** - A clean, well-documented archive of legacy functions
2. **Keep legacy code in Code.gs** - With clear warning comments pointing to the archive
3. **NOT remove legacy code from Code.gs** - Too risky due to complex interleaved code structure

## Why This Approach?

### Initial Plan
Move all `_OLD` functions from Code.gs to 98-LegacyArchive.gs to clean up the codebase.

### What We Found
The legacy code in Code.gs is heavily interleaved with active code. Multiple attempts to remove it resulted in:
- Brace mismatches (orphaned `}` and `{`)
- Partial function definitions
- Mixed code from different functions

### Risk Assessment
- **High risk** of breaking working code by removing legacy functions
- **Low benefit** since `_OLD` functions are never called
- **Better alternative** is to create clean archive and add clear documentation

## Files Changed

### New File: `src/98-LegacyArchive.gs` (616 lines)
Contains clean, documented versions of:
- `updatePurchaseNeeds_OLD()` - Legacy purchase needs report
- `updateInventoryReports_OLD()` - Legacy inventory reports
- `normalizeStatusForReport_LEGACY()` - Helper function
- `getStatusColorForReport_LEGACY()` - Helper function
- `writeStatusTableForInventory_LEGACY()` - Helper function

### Modified: `src/Code.gs`
Added comment block at line 10209:
```javascript
// ============================================================================
// ⚠️ LEGACY CODE BELOW - DO NOT MODIFY
// ============================================================================
// The following _OLD functions are deprecated and kept only for reference.
// Clean, documented versions have been moved to: 98-LegacyArchive.gs
//
// Active implementations:
// - updatePurchaseNeeds() → 60-PurchaseNeeds.gs
// - updateInventoryReports() → 61-InventoryReports.gs
// ============================================================================
```

## Why Keep Both Copies?

1. **98-LegacyArchive.gs** - Clean reference for understanding legacy behavior
2. **Code.gs legacy code** - Preserved to avoid any risk of breakage

The `_OLD` suffix on all functions ensures they're never accidentally called. Google Apps Script uses "last definition wins" so even if there were naming conflicts, the module files would take precedence.

## Recommendations for Future Cleanup

If someone wants to fully remove the legacy code from Code.gs in the future:

1. Create a full backup first
2. Work on a branch
3. Remove code in small, verifiable chunks
4. Run `node validate-syntax.js` after each change
5. Test all menu functions after deployment

## Related Files

- `ARCHITECTURE.md` - Explains the duplicate function architecture
- `REVERT_SUMMARY.md` - Documents the January 2026 override bug
- `98-LegacyArchive.gs` - Clean legacy code archive

