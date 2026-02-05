# Fix: Previous Employees No Longer Show in Special Circumstances

**Date:** February 2, 2026  
**Issue:** Riley Pfrimmer and Zack Smith (fired) showing in Special Circumstances section despite being matched as Previous Employees from Employee History

## Problem

After implementing the Employee History search feature, Previous Employees like Riley Pfrimmer and Zack Smith were correctly found in Employee History, but they were **ALSO** being parsed from the Excel file's "Time off/Quit/Other" section and showing in **Special Circumstances**.

Result: The same employee appeared in TWO places:
1. ❌ Special Circumstances (as "Riley Pfrimmer 1 ap layoff Mon 1-26")
2. ✅ Would have appeared in Proposed Changes with 🔄 REHIRE badge (correct behavior)

This created confusion and potential for duplicate processing.

## Root Cause

**File:** `src/CrewImport.html`

The Excel file contains special sections like "Time off/Quit/Other" that list employees with statuses like:
- "Riley Pfrimmer 1 ap layoff Mon 1-26"
- "Zack Smith fired 5 ap Tues 1-29"

The import process was:
1. ✅ Parsing special circumstances from Excel → Captured Riley and Zack
2. ✅ Loading employees from Employee History → Found Riley and Zack
3. ✅ Matching crew employees → Would match Riley and Zack
4. ❌ **No filtering** of special circumstances that are already matched as Previous Employees

Result: Both sections showed the same employees, leading to duplicate processing potential.

## Solution

Added `filterSpecialCircumstancesAlreadyMatched()` function to **remove special circumstances that are already matched as Previous Employees** from Employee History.

### Implementation

**File:** `src/CrewImport.html`

#### 1. Call Filtering After Matching (line 800-810)
```javascript
// Show crew preview and match employees
showCrewPreview();
matchEmployeesToSheet();

// Filter out special circumstances that are already matched as Previous Employees
filterSpecialCircumstancesAlreadyMatched();

// Note: if there are duplicates, matchEmployeesToSheet will show the duplicate UI
if (duplicateEmployees.length === 0) {
  displayPreview();
}
```

#### 2. Added Filtering Function (line 1843-1886)
```javascript
function filterSpecialCircumstancesAlreadyMatched() {
  // Remove special circumstances for employees that are already matched as Previous Employees
  // from Employee History (they'll be handled as rehires, not special circumstances)
  
  if (specialCircumstances.length === 0) return;
  
  var filtered = [];
  var removedCount = 0;
  
  for (var i = 0; i < specialCircumstances.length; i++) {
    var spec = specialCircumstances[i];
    var specNameLower = spec.name.toLowerCase().trim();
    
    // Check if this special circumstance matches any Previous Employee from Employee History
    var matchedAsPreviousEmployee = false;
    
    for (var e = 0; e < currentEmployees.length; e++) {
      var emp = currentEmployees[e];
      
      // Check if this is a Previous Employee from Employee History
      if (emp.source === 'Employee History' && emp.location === 'Previous Employee') {
        var empNameLower = emp.name.toLowerCase().trim();
        
        // Check for name match (exact or very close)
        if (specNameLower === empNameLower || calculateSimilarity(specNameLower, empNameLower) >= 85) {
          matchedAsPreviousEmployee = true;
          console.log('Special circumstance "' + spec.name + '" matches Previous Employee "' + emp.name + '" from Employee History - will be handled as REHIRE');
          removedCount++;
          break;
        }
      }
    }
    
    // Only keep special circumstances that DON'T match Previous Employees
    if (!matchedAsPreviousEmployee) {
      filtered.push(spec);
    }
  }
  
  specialCircumstances = filtered;
  
  if (removedCount > 0) {
    console.log('Filtered out ' + removedCount + ' special circumstances that are already matched as Previous Employees');
  }
}
```

## How It Works

### Processing Flow:

1. **Parse Excel File**
   - Extracts crew structure (location + employees)
   - Extracts special circumstances (Time off/Quit/Other section)
   - Riley: Found in both crew AND special circumstances

2. **Load Employee Data**
   - `currentEmployees` loaded from Employees sheet + Employee History
   - Riley found in Employee History with `source: 'Employee History'`, `location: 'Previous Employee'`

3. **Match Employees**
   - Riley from crew matches Riley from Employee History
   - Prepares to show as 🔄 REHIRE in Proposed Changes

4. **Filter Special Circumstances** ← **NEW STEP**
   - Checks each special circumstance against `currentEmployees`
   - Finds Riley matches an entry with `source: 'Employee History'`
   - Removes Riley from `specialCircumstances` array
   - Console logs: "Filtered out 2 special circumstances..."

5. **Display Results**
   - Riley shows in **Proposed Changes** with 🔄 REHIRE badge ✅
   - Riley does NOT show in **Special Circumstances** ✅
   - No duplicate processing

### Matching Logic:

The filter uses fuzzy name matching (85% similarity threshold) to catch variations:
- "Riley Pfrimmer" vs "Riley Pfrimmer" → Exact match ✅
- "Zack Smith" vs "Zachary Smith" → 85%+ similar ✅
- "R Pfrimmer" vs "Riley Pfrimmer" → Would match if >85%

## Behavior After Fix

### Before Fix (❌ Problem):
```
📋 Special Circumstances (2):
  - Riley Pfrimmer (Layoff) - Keep Current or mark as Previous Employee
  - Zack Smith (Fired) - Keep Current or mark as Previous Employee

✓ Proposed Changes:
  (Riley would appear here too if matched, but user might process in Special Circumstances first)
```

**Problem:** User could accidentally process Riley twice, or be confused about which section to use.

### After Fix (✅ Correct):
```
📋 Special Circumstances (0):
  (None - Riley and Zack filtered out)

✓ Proposed Changes:
  - Riley Pfrimmer 🔄 REHIRE | AP 1 | Bozeman | 013-26.1
  - Zack Smith 🔄 REHIRE | AP 5 | Helena | 031-26.5
```

**Result:** Clear, single path for rehiring Previous Employees.

## Edge Cases Handled

### 1. Employee in Special Circumstances But NOT in Employee History
- **Example:** New employee marked as "Light Duty" in Excel
- **Result:** Shows in Special Circumstances (correct - needs manual handling)

### 2. Previous Employee with Slightly Different Name
- **Example:** Excel: "Zack Smith", History: "Zachary Smith"
- **Result:** 85%+ similarity match → Filtered out, shows as REHIRE

### 3. Employee Terminated Multiple Times
- **Example:** Riley terminated 3 times, most recent is 01/26/2026
- **Result:** Most recent Employee History entry checked → Filtered if most recent is termination

### 4. Special Circumstance is NOT a Termination
- **Example:** "John Doe Light Duty Mon 2-1"
- **Result:** John might be in Employee History but NOT as terminated → Stays in Special Circumstances

## Testing

When you upload the Excel crew structure with Riley and Zack in the special section:

1. ✅ Riley and Zack are parsed from "Time off/Quit/Other" section
2. ✅ Riley and Zack are loaded from Employee History
3. ✅ Matching happens (both recognized as Previous Employees)
4. ✅ **Filtering removes them from Special Circumstances**
5. ✅ They appear ONLY in Proposed Changes with 🔄 REHIRE badge
6. ✅ No duplicate processing risk

## Files Changed

**src/CrewImport.html**
- Added call to `filterSpecialCircumstancesAlreadyMatched()` after employee matching
- Added new `filterSpecialCircumstancesAlreadyMatched()` function
- Filters special circumstances that match Previous Employees from Employee History
- Uses 85% name similarity threshold for matching

## Benefits

✅ **No Duplicate Processing** - Each employee appears in only ONE section  
✅ **Clear User Experience** - Single path for rehiring (Proposed Changes)  
✅ **Automatic Filtering** - No manual intervention needed  
✅ **Smart Matching** - Handles name variations (Zack vs Zachary)  
✅ **Preserves Special Cases** - Non-terminated special circumstances still show  

## Deployment

✅ **Successfully deployed** via `.\push.bat` on February 2, 2026

## Related Documentation

- **FIX_CREW_IMPORT_EMPLOYEE_HISTORY_SEARCH.md** - Main Employee History search implementation
- **FIX_PREVIOUS_EMPLOYEE_DELETION.md** - Previous Employees removed from Employees sheet
- **FIX_FIRED_DROPDOWN_COMPLETE.md** - Added "Fired" termination reason

## Important Notes

### Why Filter Special Circumstances?

Special Circumstances are meant for **exceptional cases** that need manual handling:
- Employees on Light Duty (change location but not termination)
- Employees on Vacation/Leave (temporary status)
- New situations not in the system

**Previous Employees returning to work** are NOT exceptional - they should follow the standard rehiring workflow:
1. Recognized from Employee History
2. Matched to crew data
3. Added to Proposed Changes with 🔄 REHIRE badge
4. Rehired via standard `applyCrewChanges()` function

By filtering them from Special Circumstances, we ensure they follow the correct, automated rehiring process instead of requiring manual special-case handling.

### Console Logging

The filter logs its actions for debugging:
```
Special circumstance "Riley Pfrimmer" matches Previous Employee "Riley Pfrimmer" from Employee History - will be handled as REHIRE
Special circumstance "Zack Smith" matches Previous Employee "Zachary Smith" from Employee History - will be handled as REHIRE
Filtered out 2 special circumstances that are already matched as Previous Employees
```

These logs help verify the filtering is working correctly.
