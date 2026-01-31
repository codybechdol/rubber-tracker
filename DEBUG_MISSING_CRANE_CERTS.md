# Debug Guide: Missing Crane Cert Tasks

**Issue:** Not all 6 expired Crane Cert holders are showing in the To Do Schedule.

**Expected:** 6 employees with expired Crane Certs:
1. Erik Davis - expired 1363 days ago
2. Taylor Goff - expired 351 days ago  
3. Matthew Wendt - expired 351 days ago
4. Cody Lund - expired 351 days ago
5. Emery DeWitt - expired 351 days ago
6. Matthew Miller - expired 93 days ago

## How to Debug

### Step 1: Check the Apps Script Logs

1. Open your Google Sheet
2. Go to **Extensions → Apps Script**
3. Click **Executions** (on the left sidebar)
4. Find the most recent "generateSmartSchedule" execution
5. Click on it to view the logs

### Step 2: Look for These Log Entries

**Look for lines starting with:**
```
collectExpiringCertTasks: Processing Crane Cert for [Employee Name]
```

**You should see 6 lines like this:**
- `collectExpiringCertTasks: Processing Crane Cert for Erik Davis, expiration: [date]`
- `collectExpiringCertTasks: Processing Crane Cert for Taylor Goff, expiration: [date]`
- ... etc for all 6 employees

**If you DON'T see all 6, check for:**
```
collectExpiringCertTasks: Skipping Crane Cert for previous employee: [Name]
```

This means the employee is marked as "Previous Employee" and is being excluded.

### Step 3: Check Location Assignment

**Look for lines like:**
```
collectExpiringCertTasks: Crane Cert for [Name] - Location: [Location], Days till due: -XXX, Overdue: true
```

**Check if all 6 employees have valid locations:**
- ✅ Valid: Helena, Bozeman, Great Falls, Livingston, etc.
- ❌ Invalid: Unknown, Previous Employee, empty string

### Step 4: Check Summary Count

**Look for the summary line:**
```
collectExpiringCertTasks: Added XX expiring cert tasks from Expiring Certs sheet (including 6 Crane Cert tasks)
```

**This should say "including 6 Crane Cert tasks"**

If it says fewer than 6, then some employees are being filtered out during processing.

## Possible Causes

### Cause 1: Employee Not in Employees Sheet

**Symptom:** Log shows `Location: Unknown` or empty  
**Solution:** Add the employee to the Employees sheet with their proper location

### Cause 2: Employee Marked as "Previous Employee"

**Symptom:** Log shows "Skipping Crane Cert for previous employee: [Name]"  
**Solution:** 
- Check the Employees sheet - is their Location set to "Previous Employee"?
- Check Employee History sheet - is there a TERMINATED event for them?
- If they're still active, update their location

### Cause 3: Name Mismatch Between Sheets

**Symptom:** Log shows `Location: Unknown` but employee IS in Employees sheet  
**Solution:** Name in Expiring Certs might not match Employees sheet exactly
- Check for extra spaces, different capitalization, or typos
- Example: "Erik Davis" vs "Erik  Davis" (extra space)

### Cause 4: Tasks Created But Not Visible in UI

**Symptom:** Log shows all 6 tasks added, but not all visible in To Do Schedule  
**Solution:** Tasks are grouped by location - you need to scroll through ALL locations to see them all

## What to Report Back

Please run "Generate all Reports" and "Create Smart Schedule" again, then:

1. Go to Extensions → Apps Script → Executions
2. Find the latest execution
3. Copy all lines containing:
   - "Processing Crane Cert for"
   - "Crane Cert for" (the detailed location line)
   - The summary line with "including X Crane Cert tasks"
4. Send me those log lines

This will tell us exactly what's happening with each of the 6 employees.

## Quick Test

### Option A: Check To Do List Sheet Directly

1. Go to the **To Do List** sheet (not the To Do Schedule dialog)
2. Scroll through all rows starting at row 14
3. Count how many rows have "Cert Expiring" in the Task Type column AND "Crane Cert" in the Item Type column
4. Should be 6 total

**If you see all 6 in the sheet, then the issue is just UI display (they're grouped by location)**

**If you see fewer than 6, then the issue is in the task collection logic**

### Option B: Search in To Do List Sheet

1. Go to To Do List sheet
2. Press Ctrl+F (Find)
3. Search for "Crane Cert"
4. Count how many results you get
5. Should be 6 (one for each expired cert holder)

## Expected Behavior After Fix

Once we identify the issue:
- All 6 employees with expired Crane Certs should appear in the To Do List
- They'll be grouped by their location (Helena, Great Falls, Livingston, etc.)
- Each should show:
  - Task Type: "Cert Expiring"
  - Item Type: "Crane Cert"
  - Employee: [Name]
  - Status: "Expired"
  - Priority: "High"

## Next Steps

Run the reports again and send me:
1. The Apps Script execution logs (specifically the Crane Cert lines)
2. OR: The count from searching "Crane Cert" in the To Do List sheet

This will tell us exactly what's wrong and how to fix it.
