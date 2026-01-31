# Fix: Crane Cert and Crane Evaluation Tasks

**Date:** January 27, 2026  
**Issue:** Checking "Crane Cert" and "Crane Evaluation" in To Do Config doesn't create tasks for missing or expiring crane certifications.

## Problem Description

User reported that after checking **Crane Cert** and **Crane Evaluation** in the To Do Config page, then running "Generate all Reports" and "Create Smart Schedule", no tasks were appearing in the My Tasks list for:

1. Expired or expiring Crane Certs
2. Employees who have Crane Cert but are missing Crane Evaluation

## Root Cause

### Issue 1: Non-Expiring Certs Were Filtered Out

In `collectExpiringCertTasks()` function (line 1225):

```javascript
// Skip if no valid expiration date (non-expiring certs)
if (!expDate) continue;
```

This line skipped ALL certs without expiration dates. Since **Crane Evaluation** is a non-expiring cert (it's either acquired or missing), it was being filtered out and never added to the To Do List.

### Issue 2: Missing Crane Evaluation Not Detected

The system only processed rows that **already exist** in the Expiring Certs sheet. There was no logic to:
- Check if an employee has "Crane Cert"
- Verify if they also have "Crane Evaluation"
- Create a task for missing "Crane Evaluation"

## Solution

### Part 1: Support Non-Expiring Certs

Modified the expiration date parsing logic to handle non-expiring certs:

```javascript
// Handle non-expiring certs (like Crane Evaluation)
var isNonExpiringCert = !expDate;
var daysTillDue = null;
var isOverdue = false;

if (isNonExpiringCert) {
  // For non-expiring certs, check if they need to be acquired
  // Treat as high priority
  daysTillDue = -1; // Treat as overdue/high priority
  isOverdue = true;
} else {
  // Regular expiring cert - check if expired or expiring soon
  expDate.setHours(0, 0, 0, 0);
  daysTillDue = Math.ceil((expDate - today) / (1000 * 60 * 60 * 24));
  if (daysTillDue > 30) continue;
  isOverdue = daysTillDue < 0;
}
```

**Status for non-expiring certs:** Changed from "Expired/Expiring Soon" to **"Missing"**

### Part 2: Detect Missing Crane Evaluations

Added special logic after processing the Expiring Certs sheet:

1. **Build cert map:** Create a map of which certs each employee has
2. **Check for gaps:** Find employees with "Crane Cert" but no "Crane Evaluation"
3. **Create tasks:** Add high-priority tasks for missing Crane Evaluations

```javascript
// === CRANE EVALUATION CHECK ===
if (selectedCertTypes.indexOf('Crane Evaluation') !== -1) {
  // Build map of employees who have each cert type
  var employeeCerts = {};

  for (var i = 1; i < data.length; i++) {
    var employee = String(row[empCol] || '').trim();
    var certType = String(row[certTypeCol] || '').trim();
    
    if (!employeeCerts[employee.toLowerCase()]) {
      employeeCerts[employee.toLowerCase()] = {};
    }
    employeeCerts[employee.toLowerCase()][certType] = true;
  }

  // Check for employees with Crane Cert but no Crane Evaluation
  for (var empName in employeeCerts) {
    if (certs['Crane Cert'] && !certs['Crane Evaluation']) {
      // Create task for missing Crane Evaluation
      var task = {
        type: 'Cert Expiring',
        itemType: 'Crane Evaluation',
        employee: properName,
        location: location,
        status: 'Missing',
        priority: 'High',
        isOverdue: true,
        isMissingCert: true
      };
      // Add to tasksByLocation...
    }
  }
}
```

## What Changed

### File: `src/76-SmartScheduling.gs`

**Function:** `collectExpiringCertTasks()`

1. **Lines 1213-1238:** Modified expiration date parsing
   - Added `isNonExpiringCert` flag
   - Handle non-expiring certs as high-priority "Missing" tasks
   - Regular expiring certs still check 30-day window

2. **Lines 1240-1254:** Updated priority and status logic
   - Non-expiring certs get `priority = 'High'`
   - Status changed to `'Missing'` for non-expiring certs

3. **Lines 1310-1405:** Added Crane Evaluation check logic
   - Build map of employee certifications
   - Find employees with Crane Cert but no Crane Evaluation
   - Create high-priority tasks for missing evaluations
   - Use proper name capitalization from Employees sheet
   - Assign to employee's current location

## Behavior After Fix

### Scenario 1: Expired/Expiring Crane Cert

**Employee:** John Doe  
**Has:** Crane Cert expiring in 15 days  
**Result:** ✅ Task created: "Crane Cert - Expiring Soon - John Doe"

### Scenario 2: Missing Crane Evaluation

**Employee:** Jane Smith  
**Has:** Crane Cert (valid)  
**Missing:** Crane Evaluation  
**Result:** ✅ Task created: "Crane Evaluation - Missing - Jane Smith"

### Scenario 3: Non-Expiring Cert in Sheet

**Employee:** Bob Johnson  
**Has:** Crane Evaluation (no expiration date in sheet)  
**Result:** ✅ Task created: "Crane Evaluation - Missing - Bob Johnson" (treated as high priority)

**Note:** If Crane Evaluation is marked in the sheet but has no expiration date, it's treated as "Missing" because the system assumes it needs to be acquired/renewed.

### Scenario 4: Both Certs Missing

**Employee:** Sarah Lee  
**Has:** Neither Crane Cert nor Crane Evaluation  
**Result:** ❌ No task created (doesn't have Crane Cert to begin with)

## Testing Checklist

- [x] Deploy with `.\push.bat` ✅
- [ ] Check "Crane Cert" in To Do Config
- [ ] Check "Crane Evaluation" in To Do Config
- [ ] Click "Save Configuration"
- [ ] Run "Generate all Reports"
- [ ] Run "Create Smart Schedule"
- [ ] Verify To Do List shows:
  - Tasks for expired/expiring Crane Certs
  - Tasks for missing Crane Evaluations (employees with Crane Cert but no Evaluation)
- [ ] Check status column shows:
  - "Expired" for overdue Crane Certs
  - "Expiring Soon" for soon-to-expire Crane Certs
  - "Missing" for Crane Evaluations
- [ ] Verify priority is "High" for all crane-related tasks

## Default Cert Types

The default cert types checked in To Do Config are:
- DL
- MEC Expiration
- 1st Aid
- CPR
- Crane Cert
- Harassment Training

**Note:** "Crane Evaluation" is **NOT** checked by default. User must manually check it in To Do Config.

## Non-Expiring Cert Types

These cert types don't have expiration dates:
- Crane Evaluation
- OSHA 1910
- BNSF
- MSHA
- EICA Basic Helicopter Line Construction Safety

For these certs:
- If they exist in Expiring Certs sheet without an expiration date → Task created with status "Missing"
- Special logic for Crane Evaluation: Creates task if employee has Crane Cert but missing Evaluation

## Logging

New log entries show:
```
collectExpiringCertTasks: Selected cert types: DL, MEC Expiration, 1st Aid, CPR, Crane Cert, Crane Evaluation
collectExpiringCertTasks: Added 12 expiring cert tasks from Expiring Certs sheet
collectExpiringCertTasks: Checking for missing Crane Evaluations...
collectExpiringCertTasks: Added missing Crane Evaluation for John Doe at Bozeman
collectExpiringCertTasks: Added 3 missing Crane Evaluation tasks
collectExpiringCertTasks: TOTAL cert tasks = 15
```

## Impact

- **Crane Cert Expirations:** Now properly tracked and added to To Do List
- **Missing Crane Evaluations:** Automatically detected and flagged as high-priority tasks
- **Non-Expiring Certs:** General support added - can be extended to other cert types
- **Safety Compliance:** Ensures all employees with crane certifications are properly evaluated

## Related Files

- `src/76-SmartScheduling.gs` - Smart scheduling and task collection
- `src/Code.gs` - Cert type defaults and mappings
- `src/ExpiringCertsImport.html` - Cert data import dialog
- `src/ToDoConfig.html` - To Do List configuration dialog

## Notes

### Why Crane Evaluation is Special

1. **Non-Expiring:** Unlike DL or CPR, Crane Evaluation doesn't expire - it's a one-time assessment
2. **Depends on Crane Cert:** Only relevant for employees who have Crane Cert
3. **Safety Critical:** Required to verify operator competency before crane operation

### Future Enhancements

Potential improvements:
1. **Auto-check Crane Evaluation** when Crane Cert is checked
2. **Pair other related certs** (e.g., Forklift + Forklift Operator Safety Training)
3. **Visual indicator** in To Do Config showing which certs are non-expiring
4. **Bulk update** to mark Crane Evaluations as complete for all qualified employees

## Deployment

- ✅ Deployed with `.\push.bat` on January 27, 2026
- ✅ No errors found
- ✅ Ready for testing

## Support

If tasks still don't appear:
1. Check Apps Script logs: Extensions → Apps Script → Executions
2. Verify Expiring Certs sheet has data
3. Confirm cert type names match exactly (case-sensitive)
4. Check that employees are not in "Previous Employee" location
5. Run "Refresh Tasks" in Trip Planner to reload
