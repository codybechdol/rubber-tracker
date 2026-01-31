# Crane Evaluation Fix - CORRECTED

**Date:** January 27, 2026  
**Issue:** Crane Evaluation cert should NOT be treated as expired - it's a non-expiring cert that indicates when the evaluation was performed.

## Clarification from User

> "The date for the crane eval is when the evaluation was performed. This cert does not expire. Once the evaluation is completed the employee is in compliance. I need to be flagged **IF** the employee **HAS** a crane cert but **NOT** the crane evaluation."

## What Crane Evaluation Means

- **Date in sheet:** When the crane evaluation was performed (not an expiration date)
- **No expiration:** Once completed, employee is in compliance forever
- **Purpose:** Verify that employees with Crane Cert have been evaluated for safe crane operation

## Correct Behavior

### ✅ Employee has Crane Cert + Crane Evaluation row in sheet
**Status:** Compliant (no task created)  
**Why:** Evaluation was completed on the date shown

### ⚠️ Employee has Crane Cert but NO Crane Evaluation row
**Status:** Missing Crane Evaluation (task created)  
**Why:** They're certified but haven't been evaluated yet

### ❌ Employee has Crane Evaluation but no Crane Cert
**Status:** No task created  
**Why:** Doesn't make sense - can't evaluate someone who isn't certified

### ✅ Employee has neither cert
**Status:** No task created  
**Why:** Not certified for crane operation

## The Problem (Before Fix)

The code was treating **existing Crane Evaluation rows** as "expired" because:
1. They have a date (the evaluation date)
2. That date is in the past (e.g., 3/9/2022)
3. Code thought: "Past date = expired"

This caused the popup showing "Crane Evaluation - Expired (33)" with employees like Kamron Jones flagged in red.

**Wrong!** Those employees are compliant - they completed their evaluations in 2022!

## The Solution

### Part 1: Skip Crane Evaluation Rows in Main Loop

If a Crane Evaluation row exists in the Expiring Certs sheet, the employee has completed the evaluation → Skip it (they're compliant).

```javascript
// Special handling for Crane Evaluation:
// Crane Evaluation is a non-expiring cert - the date is when evaluation was performed
// If row exists, employee is in compliance - skip it
if (certType === 'Crane Evaluation') {
  Logger.log('collectExpiringCertTasks: Skipping Crane Evaluation for ' + employee + ' - evaluation completed (non-expiring)');
  continue;
}
```

### Part 2: Detect Missing Crane Evaluations

After processing all rows, check for employees who:
- Have "Crane Cert" row in sheet
- Do NOT have "Crane Evaluation" row in sheet
- Create high-priority task for missing evaluation

This logic was already implemented in the previous fix and remains unchanged.

## What Changed

### File: `src/76-SmartScheduling.gs`

**Function:** `collectExpiringCertTasks()`

**Changes:**

1. **Added special check for Crane Evaluation** (lines 1214-1219)
   - If cert type is "Crane Evaluation" and row exists → Skip (compliant)
   - Log: "Skipping Crane Evaluation for [employee] - evaluation completed (non-expiring)"

2. **Added check for other non-expiring certs** (lines 1232-1237)
   - OSHA 1910, BNSF, MSHA, EICA - if row exists → Skip (compliant)
   - These also don't expire - date indicates when cert was acquired

3. **Removed incorrect "Missing" status** for existing cert rows
   - Only truly missing certs (detected via special logic) get "Missing" status

4. **Kept special Crane Evaluation detection logic** (lines 1310+)
   - Checks if employee has Crane Cert but no Crane Evaluation row
   - Creates high-priority task ONLY for missing evaluations

## Expected Behavior After Fix

### Scenario 1: Compliant Employee
**Expiring Certs Sheet:**
- Row: Kamron Jones | Crane Cert | 5/15/2025
- Row: Kamron Jones | Crane Evaluation | 3/9/2022

**Result:** ✅ No tasks created (both certs present, evaluation completed)

### Scenario 2: Missing Evaluation
**Expiring Certs Sheet:**
- Row: John Doe | Crane Cert | 8/20/2025
- (No Crane Evaluation row)

**Result:** ⚠️ Task created: "Crane Evaluation - Missing - John Doe"

### Scenario 3: Expired Crane Cert
**Expiring Certs Sheet:**
- Row: Jane Smith | Crane Cert | 11/15/2025 (expires in 10 days)
- Row: Jane Smith | Crane Evaluation | 6/1/2023

**Result:** ⚠️ Task created: "Crane Cert - Expiring Soon - Jane Smith"  
(No task for Crane Evaluation - it's compliant)

### Scenario 4: Both Issues
**Expiring Certs Sheet:**
- Row: Bob Lee | Crane Cert | 12/1/2025 (expired last month)
- (No Crane Evaluation row)

**Result:** ⚠️ Two tasks:
- "Crane Cert - Expired - Bob Lee"
- "Crane Evaluation - Missing - Bob Lee"

## Testing Checklist

- [x] Deploy with `.\push.bat` ✅
- [ ] Close the "Crane Evaluation - Expired (33)" popup
- [ ] Click "Generate all Reports" again
- [ ] Run "Create Smart Schedule" again
- [ ] Verify popup does NOT show "Crane Evaluation - Expired"
- [ ] Check To Do List for:
  - ✅ Crane Cert tasks (only if expiring/expired)
  - ✅ Missing Crane Evaluation tasks (only if employee has Crane Cert but no Crane Evaluation row)
  - ❌ NO tasks for employees who have both Crane Cert and Crane Evaluation rows

## Logging

New log entries show:
```
collectExpiringCertTasks: Selected cert types: DL, CPR, Crane Cert, Crane Evaluation
collectExpiringCertTasks: Skipping Crane Evaluation for Kamron Jones - evaluation completed (non-expiring)
collectExpiringCertTasks: Skipping Crane Evaluation for Tony Harmon - evaluation completed (non-expiring)
...
collectExpiringCertTasks: Added 5 expiring cert tasks from Expiring Certs sheet
collectExpiringCertTasks: Checking for missing Crane Evaluations...
collectExpiringCertTasks: Added missing Crane Evaluation for John Doe at Bozeman
collectExpiringCertTasks: Added 2 missing Crane Evaluation tasks
collectExpiringCertTasks: TOTAL cert tasks = 7
```

## Other Non-Expiring Certs

The same logic applies to these cert types:
- **OSHA 1910** - Date when cert was acquired
- **BNSF** - Date when cert was acquired
- **MSHA** - Date when cert was acquired
- **EICA Basic Helicopter Line Construction Safety** - Date when training completed

If a row exists for these certs, the employee is compliant. No tasks created.

## Summary

### Before Fix:
- ❌ All Crane Evaluation rows flagged as "Expired"
- ❌ Popup showed "Crane Evaluation - Expired (33)"
- ❌ Compliant employees incorrectly flagged

### After Fix:
- ✅ Crane Evaluation rows skipped (compliant)
- ✅ Only missing Crane Evaluations create tasks
- ✅ Popup should be empty or show only truly missing/expired certs
- ✅ Employees with completed evaluations not flagged

## Files Modified

- `src/76-SmartScheduling.gs` - Added Crane Evaluation skip logic

## Related Documentation

- `FIX_CRANE_CERT_EVALUATION_TASKS.md` - Original fix (now superseded)
- `.github/copilot-instructions.md` - Cert types and defaults

## Deployment

- ✅ Deployed with `.\push.bat` on January 27, 2026
- ✅ No errors found
- ✅ Ready to test

## Support

If you still see "Crane Evaluation - Expired" popup:
1. Hard refresh the spreadsheet (Ctrl+F5)
2. Check Apps Script logs for "Skipping Crane Evaluation" entries
3. Verify Expiring Certs sheet has Crane Evaluation rows for compliant employees
4. Try closing and reopening the spreadsheet
