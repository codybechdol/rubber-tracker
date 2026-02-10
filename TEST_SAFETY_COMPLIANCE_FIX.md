# Testing Guide: Safety Compliance Fix

**Date:** February 9, 2026  
**What Was Fixed:** Safety Compliance items now properly create tasks in Task Metadata

---

## Quick Test (5 minutes)

### Step 1: Delete Old Tasks
1. Open your Google Sheet
2. Go to **Task Metadata** sheet
3. Filter Column E (TaskType) for "Missing Safety Report"
4. Select and delete all rows with this task type
5. Save the sheet

### Step 2: Process Safety Emails
1. In Google Sheets: **Glove Manager** → **🛡️ Safety Reports** → **📥 Process Safety Emails**
2. Select date range: **"Last 14 days"** (to capture last week's data)
3. Check **"Only process new emails since last run"**
4. Click **"Process Emails"**
5. Wait for processing to complete

### Step 3: Check Task Metadata
1. Go to **Task Metadata** sheet
2. Look for rows where:
   - Column B (SourceSheet) = "Safety Compliance"
   - Column E (TaskType) = "Missing Safety Report"
3. **Expected:** You should see tasks with:
   - Column A: TaskID like "SafetyCompliance_013-26_2026-02-02"
   - Column D: Employee name (foreman)
   - Column F: ItemType like "JHA + Weekly Meeting"
   - Column K: DueDate (Saturday of the week)
   - Column W: Notes with specific missing dates

### Step 4: View in Task List
1. **Glove Manager** → **Schedule & To-Do** → **📅 Tasks & Calendar**
2. Click **Task List** tab
3. Find **🛡️ Safety Compliance** category
4. Expand it
5. **Expected:** See locations with consolidated tasks (one per foreman/week)

### Step 5: Test SMS Button
1. Find Ben Lapka's task (should be under Elliston)
2. Click the **💬** SMS button
3. **Expected:** SMS message should show:
   - Specific missing dates (e.g., "JHA - 02/02/2026, 02/04/2026")
   - Week of date for Weekly Meeting
   - No blank dates

---

## What to Look For

### ✅ Success Indicators
- **ONE task per crew** (not 6+ separate tasks)
- **Due date is Saturday of the week** (e.g., 02/08/2026)
- **Details show summary** like "JHA: 4 days, Meeting: 02/08/2026"
- **SMS has specific dates** in the message
- **Category is "Safety Compliance"** (not "Other")

### ❌ Failure Indicators
- Multiple tasks for same crew/week
- Due date is today's date (02/09/2026)
- Details say just "Due: 2/9/2026"
- SMS message has blank spots "for ____"
- Tasks appear under "Other" category

---

## Detailed Test (15 minutes)

### Test 1: Verify Functions Exist
1. Open Google Apps Script Editor
2. Search for: `function calculateSafetyCompliance`
3. **Expected:** Function exists at line ~2100 in 88-SafetyReports.gs
4. Search for: `function getWeekBoundaries`
5. **Expected:** Function exists at line ~2140 in 88-SafetyReports.gs

### Test 2: Check Logs
1. After processing emails, go to **Extensions** → **Apps Script**
2. Click **Executions** (left sidebar)
3. Find your recent execution
4. Click to view logs
5. **Expected logs:**
   ```
   calculateSafetyCompliance for week: 02/02/2026, isPastDeadline: true
   updateComplianceSheet for week: 02/02/2026
   Created missing report task for Benjamin Lapka (013-26): JHA + Weekly Meeting
   createMissingReportTasks: Created X tasks
   ```
6. **Should NOT see:**
   ```
   calculateSafetyCompliance is not defined
   TypeError: Cannot read property...
   ```

### Test 3: Verify Data in Safety Compliance Sheet
1. Go to **Safety Compliance** sheet
2. Find the row for week 02/02/2026 (last week)
3. For crew 013-26 (Ben Lapka):
   - **Columns E-K** (JHA Sun-Sat): Should show ✅/❌/N/A/⏳
   - **Column L** (Weekly Meeting): Should show ✅ or ❌
   - **Column N** (Status): Should show "Missing Reports" or "Complete"

### Test 4: Verify Config Sheet
1. Go to **Safety Compliance Config** sheet
2. Check that all active crews are listed
3. Default should be:
   - Skip Sun: ✓ (checked)
   - Skip Mon-Fri: ☐ (unchecked)
   - Skip Sat: ✓ (checked)

### Test 5: Test Manual Finalization
1. **Glove Manager** → **🛡️ Safety Reports** → **✅ Finalize Past Weeks**
2. Click to run
3. **Expected:** Dialog showing "Finalized X past week(s)" or "All past weeks are already finalized"

---

## Common Issues

### Issue: "No tasks created"
**Cause:** Week deadline hasn't passed yet (it's still Saturday or earlier)  
**Solution:** Tasks only create after Saturday 11:59 PM. Test with older data or wait until next Sunday.

### Issue: "Duplicate tasks appearing"
**Cause:** Old tasks weren't deleted before regenerating  
**Solution:** Delete all old "Missing Safety Report" tasks from Task Metadata, then reprocess.

### Issue: "calculateSafetyCompliance is not defined"
**Cause:** Deployment didn't succeed  
**Solution:** Run `.\push.bat` again from PowerShell

### Issue: "Tasks show under 'Other' category"
**Cause:** Category detection logic not updated  
**Solution:** Already fixed in previous deployment. Refresh the Tasks & Calendar dialog.

---

## Expected Results for Ben Lapka (Example)

### Before Fix
```
📍 Elliston (6 tasks)
  👤 Benjamin Lapka (6 tasks)
    ⚠️ Missing: JHA - Due: 2/9/2026
    ⚠️ Missing: JHA - Due: 2/9/2026
    ⚠️ Missing: JHA - Due: 2/9/2026
    ⚠️ Missing: JHA - Due: 2/9/2026
    ⚠️ Missing: Weekly Meeting - Due: 2/9/2026
    ⚠️ Missing: Monthly Checklist - Due: 2/9/2026
```

### After Fix
```
📍 Elliston (1 task)
  👤 Benjamin Lapka (1 task)
    🛡️ Safety Compliance
      📋 Safety Compliance
      👤 Benjamin Lapka
          JHA: 4 days, Meeting: 02/08/2026, Checklist
      [💬 Send SMS] [✅ Mark Complete]
```

### SMS Message After Fix
```
We did not receive JHAs or a Weekly Safety Meeting from your crew for the entire week of 02/02/2026. This is just a reminder not to miss them this week. Was there an issue turning them in that you need help with?
```

---

## Rollback Plan (If Needed)

If something goes wrong:

1. **Stop using the feature temporarily**
2. **Report the error logs** to developer
3. **Keep old Task Metadata backup** (don't delete permanently)
4. **Wait for next fix deployment**

No data will be lost - everything is stored in Google Sheets.

---

## Success Checklist

- [ ] Old tasks deleted from Task Metadata
- [ ] Safety emails processed successfully
- [ ] New tasks appear in Task Metadata with correct structure
- [ ] Task List shows one task per crew/week
- [ ] Due dates show Saturday of the reporting week
- [ ] SMS messages have specific dates filled in
- [ ] Tasks appear under "Safety Compliance" category
- [ ] No error messages in execution logs

---

**Status:** Ready to test  
**Deployment:** February 9, 2026  
**Files Modified:** src/88-SafetyReports.gs, src/ToDoSchedule.html

