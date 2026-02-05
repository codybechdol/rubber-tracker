# Fix: Crew Import Now Searches Employee History for Previous Employees

**Date:** February 2, 2026  
**Issue:** Riley Pfrimmer and Zachary Smith showing as "unmatched" in Crew Import despite being known employees

## Problem

After implementing the Previous Employee deletion feature, employees like Riley Pfrimmer and Zachary Smith were marked as terminated and **removed from the Employees sheet**. When uploading the Excel crew structure, these employees appeared as "unmatched" because:

1. The Crew Import `getEmployeeNamesForMatching()` function only searched the **Employees sheet**
2. It explicitly **skipped** employees with Location = "Previous Employee" (line 1863-1866)
3. It did NOT search the **Employee History sheet** for terminated employees

Result: Previously terminated employees who return to work showed as unmatched, requiring manual data entry instead of automatic rehiring.

## Root Cause

**File:** `src/Code.gs` - `getEmployeeNamesForMatching()` function (line 1828-1881)

```javascript
// Old logic - ONLY searched Employees sheet
for (var i = 1; i < data.length; i++) {
  var row = data[i];
  if (row[nameCol]) {
    var location = locationCol !== -1 ? String(row[locationCol] || '') : '';
    // Skip employees marked as "Previous Employee"
    if (location.toLowerCase() === 'previous employee') {
      continue; // ❌ SKIP - this was the bug
    }
    employees.push({ ... });
  }
}
return employees; // ❌ Missing terminated employees from Employee History
```

## Solution

### 1. Modified `getEmployeeNamesForMatching()` Function
**File:** `src/Code.gs` (line 1828-1941)

The function now searches **TWO sources**:

#### Part 1: Active Employees (Employees sheet)
- Reads all employees from Employees sheet
- **Includes** employees with Location = "Previous Employee" (removed the skip logic)
- Marks each employee with `source: 'Employees'`

#### Part 2: Terminated Employees (Employee History sheet)
- Searches Employee History for employees with Last Day + Last Day Reason filled in
- **Groups all entries by employee name**
- **Finds the MOST RECENT entry per employee by comparing the Date column**
- Only includes employee if their **most recent entry** has Last Day + Last Day Reason (is a termination)
- Handles multiple termination/rehire cycles correctly - only looks at most recent status
- Marks each employee with `source: 'Employee History'`
- Sets `rowIndex: -1` (indicates not on Employees sheet)

```javascript
// NEW: Two-phase search with chronological date checking
var employees = [];

// PART 1: Read from Employees sheet
// ...existing code for Employees sheet...

// PART 2: Read from Employee History (terminated employees)
var historySheet = ss.getSheetByName('Employee History');
if (historySheet && historySheet.getLastRow() >= 3) {
  // Find column indices including Date column
  
  // Group all entries by employee name
  var employeeEntries = {};
  
  for (var hi = 2; hi < histData.length; hi++) {
    var empName = String(histRow[histNameCol] || '').trim();
    if (!empName) continue;
    
    var empKey = empName.toLowerCase();
    if (!employeeEntries[empKey]) {
      employeeEntries[empKey] = [];
    }
    
    employeeEntries[empKey].push({
      name: empName,
      date: entryDate,
      lastDay: lastDay,
      lastDayReason: lastDayReason
    });
  }
  
  // For each employee, find MOST RECENT entry by Date
  var terminatedEmployees = {};
  
  for (var empKey in employeeEntries) {
    var entries = employeeEntries[empKey];
    
    // Find most recent entry by Date (chronologically latest)
    var mostRecentEntry = null;
    var mostRecentDate = null;
    
    for (var ei = 0; ei < entries.length; ei++) {
      var parsedDate = new Date(entry.date);
      if (parsedDate && !isNaN(parsedDate.getTime())) {
        if (!mostRecentDate || parsedDate > mostRecentDate) {
          mostRecentDate = parsedDate;
          mostRecentEntry = entry;
        }
      }
    }
    
    // Check if MOST RECENT entry is a termination (has Last Day + Last Day Reason)
    if (mostRecentEntry && mostRecentEntry.lastDay && mostRecentEntry.lastDayReason) {
      terminatedEmployees[empKey] = {
        name: mostRecentEntry.name,
        location: 'Previous Employee',
        source: 'Employee History',
        rowIndex: -1,
        lastDay: mostRecentEntry.lastDay,
        lastDayReason: mostRecentEntry.lastDayReason
      };
    }
  }
  
  // Add terminated employees to results
  for (var termKey in terminatedEmployees) {
    employees.push(terminatedEmployees[termKey]);
  }
}

return employees; // ✅ Now includes both active AND terminated employees (based on most recent status)
```

### 2. Modified `applyCrewChanges()` to Handle Rehiring
**File:** `src/85-DataImport.gs` (line 82-126)

Added logic to detect and rehire Previous Employees:

```javascript
// Check if this is a Previous Employee being rehired (rowIndex = -1)
if (rowIndex === -1) {
  // This employee exists only in Employee History - REHIRE them
  Logger.log('Rehiring Previous Employee: ' + change.employeeName);
  
  // Add new row to Employees sheet
  var newRow = [];
  for (var col = 0; col < headers.length; col++) {
    var header = String(headers[col]).toLowerCase().trim();
    if (col === nameCol) newRow.push(change.employeeName);
    else if (header === 'location') newRow.push(change.newLocation || '');
    else if (header === 'job number') newRow.push(change.newJobNumber || '');
    else if (header === 'job classification') newRow.push(change.newClassification || '');
    else newRow.push(''); // Empty for other columns
  }
  
  employeesSheet.appendRow(newRow);
  
  // Log rehire to Employee History
  var historyRow = [
    todayStr,                    // Date
    change.employeeName,         // Employee Name
    'Rehired',                   // Event Type
    change.newLocation || '',    // Location
    change.newJobNumber || '',   // Job Number
    '',                          // Hire Date
    '',                          // Last Day
    '',                          // Last Day Reason
    todayStr,                    // Rehire Date
    'Crew Makeup Import: Rehired from Previous Employee...',
    // ...rest of columns...
  ];
  historySheet.appendRow(historyRow);
}
```

### 3. Added Visual Indicator for Rehires
**File:** `src/CrewImport.html` (line 2187-2191)

The changes preview now shows a **green "🔄 REHIRE" badge** for employees being rehired from Employee History:

```html
<!-- Show badge if employee is being rehired from Employee History -->
if (ch.match.source === 'Employee History') {
  html += ' <span class="badge bg-success" title="Rehiring from Employee History">🔄 REHIRE</span>';
}
```

## Behavior After Fix

### Scenario: Riley Pfrimmer Marked as Layoff, Now Returning to Work

#### Before Fix (❌ Broken):
1. Upload Excel crew structure
2. Riley shows in "Unmatched Employees" section
3. User must manually add Riley as new employee
4. Loses connection to previous employment history

#### After Fix (✅ Working):
1. Upload Excel crew structure
2. System searches **both** Employees sheet AND Employee History
3. Finds Riley in Employee History (Last Day = 01/26/2026, Last Day Reason = Layoff)
4. Shows Riley in "Proposed Changes" with **🔄 REHIRE** badge (green)
5. User confirms changes
6. System:
   - ✅ Adds Riley back to Employees sheet with new Location + Job Number
   - ✅ Logs "Rehired" entry to Employee History with Rehire Date
   - ✅ Maintains full employment history (original termination + rehire)

### Example Output:

**Proposed Changes Preview:**
```
✓ Riley Pfrimmer 🔄 REHIRE | AP 1 | Bozeman | 013-26.1
✓ Zachary Smith 🔄 REHIRE | AP 5 | Helena | 031-26.5
```

**After Applying Changes:**
- Both employees added back to Employees sheet
- Employee History shows two entries per employee:
  - Original: "LAYOFF" event with Last Day = 01/26/2026
  - New: "Rehired" event with Rehire Date = 02/02/2026

## Testing Steps

1. **Setup:**
   - Ensure Riley Pfrimmer and Zachary Smith are in Employee History (not on Employees sheet)
   - Verify they have Last Day and Last Day Reason filled in

2. **Test Crew Import:**
   - Open: Glove Manager → Data Import → Import Crew Makeup
   - Upload Excel crew structure with Riley and Zack listed

3. **Verify Matching:**
   - ✅ Riley and Zack should appear in "Proposed Changes" (NOT "Unmatched")
   - ✅ Each should have green **🔄 REHIRE** badge
   - ✅ Should show new Location and Job Number from Excel

4. **Apply Changes:**
   - Click "Apply All Changes"
   - Verify success message

5. **Verify Results:**
   - ✅ Check Employees sheet - Riley and Zack should be present with new data
   - ✅ Check Employee History - should have new "Rehired" entries with Rehire Date
   - ✅ Original termination entries should still exist (preserved history)

## Files Changed

1. **src/Code.gs**
   - `getEmployeeNamesForMatching()` - Now searches both Employees sheet AND Employee History
   - Removed skip logic for "Previous Employee" location
   - Added source tracking (`source: 'Employees'` or `'Employee History'`)
   - Added `rowIndex: -1` for terminated employees not on Employees sheet

2. **src/85-DataImport.gs**
   - `applyCrewChanges()` - Added rehiring logic for employees with `rowIndex = -1`
   - Creates new row on Employees sheet
   - Logs "Rehired" event to Employee History with Rehire Date

3. **src/CrewImport.html**
   - Added green "🔄 REHIRE" badge for employees from Employee History
   - Visual indicator helps user understand these are returning employees

## Edge Cases Handled

### 1. Employee Terminated and Rehired Multiple Times
- **Scenario:** Employee has multiple entries in Employee History:
  - 01/15/2025 - "LAYOFF" - Last Day: 01/15/2025
  - 03/01/2025 - "Rehired" - Rehire Date: 03/01/2025
  - 01/26/2026 - "LAYOFF" - Last Day: 01/26/2026 ← **Most Recent**
- **Solution:** System groups all entries by employee name
- Compares Date column chronologically to find MOST RECENT entry
- Checks if most recent entry has Last Day + Last Day Reason (is a termination)
- Employee included in "Previous Employee" results only if most recent status is terminated
- Example: If most recent entry is "Rehired" (no Last Day), employee NOT treated as Previous Employee

### 2. Employee Exists in Both Sheets
- **Scenario:** Employee marked as "Previous Employee" but not yet deleted from Employees sheet
- **Solution:** Both entries found, but Employees sheet entry takes precedence (added first)
- No duplicate processing

### 3. Partial Match for Terminated Employee
- **Solution:** Standard fuzzy matching still applies
- Confidence score shown (e.g., 85%)
- User can confirm or select different match

### 4. Employee with Same Name as Current Employee
- **Solution:** Duplicate detection UI handles this
- User selects which occurrence is correct
- Prevents accidental double-hiring

## Benefits

✅ **Seamless Rehiring** - Previous employees automatically recognized and rehired  
✅ **History Preservation** - Full employment timeline maintained (termination + rehire dates)  
✅ **Reduced Manual Entry** - No need to manually add returning employees  
✅ **Clear Visual Feedback** - 🔄 REHIRE badge shows user what's happening  
✅ **Audit Trail** - Employee History tracks every separation and rehire  

## Deployment

✅ **Successfully deployed** via `.\push.bat` on February 2, 2026

## Related Documentation

- **FIX_PREVIOUS_EMPLOYEE_DELETION.md** - Previous Employees now removed from Employees sheet
- **FIX_FIRED_DROPDOWN_COMPLETE.md** - Added "Fired" termination reason
- **FIX_LAYOFF_VALIDATION.md** - Last Day Reason validation
- **.github/copilot-instructions.md** - System architecture

## Important Notes

### Employment History Tracking

The system now maintains **complete employment lifecycle**:

1. **Initial Hire** - Employee added to Employees sheet
2. **Employment Changes** - Location, Job Number updates logged to Employee History
3. **Termination** - Marked with Last Day + Last Day Reason, removed from Employees sheet
4. **Rehire** - Automatically detected via Employee History search, added back to Employees sheet
5. **Repeat** - Cycle can repeat indefinitely with full history preserved

### Why Search Employee History?

Searching Employee History allows the system to:
- Recognize returning employees automatically
- Maintain connection to previous employment data
- Provide seamless rehiring workflow
- Preserve complete employment timeline
- Reduce data entry errors and duplicates

This aligns with real-world employment scenarios where seasonal workers, contractors, or employees on layoff return to work after periods of separation.
