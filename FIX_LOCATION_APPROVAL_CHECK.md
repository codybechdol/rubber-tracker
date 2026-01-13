# 🔧 FIX: Location Approval Check in Swap Sheets

## Issue Found: January 8, 2026

### Problem
Employees with items that need class reclaims (e.g., Masen Worl with Class 3 gloves in Ennis which is CL2-only) were appearing in the swap sheets for that class AND getting pick list items assigned, even though they shouldn't receive items of that class.

**Example:**
- Masen Worl is in Ennis (CL2 approved only)
- He has Class 3 glove #1041 
- Glove Swaps was showing him in Class 3 section and assigning pick list item #1055
- But he should NOT get a Class 3 replacement - he needs to downgrade to Class 2

### Root Cause
The `generateSwaps()` function was NOT checking location approvals before including employees in swap lists. It simply included any employee with an item of that class that was due for swap.

### Fix Applied

#### 1. Added Location Approval Reading to generateSwaps() (lines ~2243-2267)
```javascript
// Read location approvals from Reclaims sheet to exclude employees
// whose location is not approved for a given class (they go to Reclaims instead)
var locationApprovals = {};
var reclaimsSheet = ss.getSheetByName(SHEET_RECLAIMS);
if (reclaimsSheet && reclaimsSheet.getLastRow() > 0) {
  var reclaimsData = reclaimsSheet.getDataRange().getValues();
  // ... reads the Class Location Approvals table
}
```

#### 2. Added Helper Function (lines ~2269-2289)
```javascript
function isLocationApprovedForClass(location, itemClassNum) {
  var approval = locationApprovals[location] || '';
  if (!approval || approval === 'None') return false;
  if (itemClassNum === 0) return true;  // Class 0 always allowed
  if (itemClassNum === 2) return approval === 'CL2' || approval === 'CL2 & CL3';
  if (itemClassNum === 3) return approval === 'CL3' || approval === 'CL2 & CL3';
  return false;
}
```

#### 3. Added Skip Logic in Inventory Processing (lines ~2341-2348)
```javascript
// Skip employees whose location is NOT approved for this class
// These employees will appear in the Reclaims sheet instead
if (!isLocationApprovedForClass(employeeLocation, itemClass)) {
  Logger.log('generateSwaps: Skipping ' + assignedTo + ' from Class ' + itemClass + ' swaps - location "' + employeeLocation + '" not approved');
  return;
}
```

#### 4. Added Checkboxes to Reclaims Tables (lines ~4033, ~4119)
The "Picked" column (I) now has actual checkboxes instead of just showing "FALSE" as text:
```javascript
reclaimsSheet.getRange(currentRow, 9, class3Data.length, 1).insertCheckboxes();
reclaimsSheet.getRange(currentRow, 9, class2Data.length, 1).insertCheckboxes();
```

#### 5. Added Stage 1 Column Population for Reclaims (lines ~4012-4028)
When a pick list item is found for a reclaim, Stage 1 columns (K-P) are now populated:
- K: Status (On Shelf)
- L: Assigned To (On Shelf)  
- M: Date Assigned (empty)
- N-P: Old Item Assignment (Assigned, Employee Name, empty)

---

## Expected Behavior After Fix

### Masen Worl Example:
| Sheet | Before Fix | After Fix |
|-------|------------|-----------|
| Class 3 Glove Swaps | Shows Masen with pick list #1055 | Does NOT show Masen |
| Class 3 Reclaims | Shows Masen but no pick list item | Shows Masen with CL2 pick list item |
| Reclaims Checkboxes | Shows "FALSE" as text | Shows actual checkbox ☐ |

### Flow:
1. Generate All Reports runs
2. Glove Swaps generates - Masen is SKIPPED from Class 3 section (location not approved)
3. Reclaims generates - Masen appears in "Class 3 Reclaims - Need Downgrade to Class 2"
4. `findReclaimPickListItem()` finds available Class 2 size 9 glove (e.g., #1037)
5. Reclaims shows: Masen | Glove | 1041 | 9 | 3 | Ennis | 1037 | In Stock ✅

---

## Location Approvals Reference

| Location | Approval | CL0 | CL2 | CL3 |
|----------|----------|-----|-----|-----|
| Big Sky | CL3 | ✅ | ❌ | ✅ |
| Bozeman | CL2 | ✅ | ✅ | ❌ |
| Ennis | CL2 | ✅ | ✅ | ❌ |
| Great Falls | CL2 & CL3 | ✅ | ✅ | ✅ |
| Livingston | CL2 & CL3 | ✅ | ✅ | ✅ |
| Helena | CL2 | ✅ | ✅ | ❌ |
| Missoula | CL2 | ✅ | ✅ | ❌ |

---

## Files Modified
- `src/Code.gs` - `generateSwaps()` function (location approval check)
- `src/Code.gs` - `updateReclaimsSheet()` function (checkboxes + Stage 1 columns)

---

## Deployment
Copy the updated `src/Code.gs` to Google Apps Script and run "Generate All Reports" to see the fix in action.

---

**Fixed by:** GitHub Copilot AI Assistant  
**Date:** January 8, 2026

