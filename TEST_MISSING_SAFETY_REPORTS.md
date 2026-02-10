# Quick Test Guide: Missing Safety Report Tasks

## Verify the Fix is Working

### Expected Result
Benjamin Lapka's missing JHA/Weekly Meeting tasks should now appear in the Task List dialog.

### Test Steps

1. **Open Google Sheet**
   - Go to your Rubber Tracker spreadsheet

2. **Refresh the Application**
   - Press F5 or reload the page
   - Wait for menu to fully load

3. **Open Task List**
   - Click: **Glove Manager → Schedule & To-Do → 📅 Tasks & Calendar**
   - Click: **Task List** tab

4. **Look for Elliston**
   - Scroll down to "Elliston" location group
   - Should see a dropdown header with task count

5. **Verify Benjamin Lapka's Tasks**
   - Expand Elliston location
   - Should see: **Benjamin Lapka** with 2 tasks:
     - Row 10: Missing Safety Report (JHA + Weekly Meeting)
     - Row 11: Missing Safety Report (JHA + Weekly Meeting)
     - Row 12: Missing Safety Report (JHA + Weekly Meeting)
     - Row 13: Missing Safety Report (JHA + Weekly Meeting)

6. **Check Task Details**
   - Each task should show:
     - 🔴 **High** priority badge (red)
     - ItemType: "JHA + Weekly Meeting" or "JHA"
     - Employee: Benjamin Lapka
     - Location: Elliston
     - Phone: (406) 370-0421
     - Notes showing missing dates

7. **Verify Buttons**
   - Should see:
     - 💬 **Send SMS** button (if phone exists)
     - ✅ **Mark Complete** button
     - 📅 **Schedule** button

8. **Test SMS Button** (Optional)
   - Click the 💬 SMS button
   - Should open SMS dialog with pre-filled message:
     ```
     We did not receive a JHA for [dates] or a Weekly Safety Meeting 
     for the week of [date] from your crew. This is just a reminder 
     not to miss them this week. Was there an issue turning them in 
     that you need help with?
     ```

9. **Test Calendar View**
   - Click **Calendar** tab
   - Look for dates where tasks are due
   - Should see small colored dots indicating tasks

10. **Test Trip Planner**
    - Click: **Glove Manager → Schedule & To-Do → 🗺️ Trip Planner**
    - Look in "Unassigned Locations" panel
    - Should see Elliston with task count if tasks are unscheduled

## What If Tasks Still Don't Show?

### Check Task Metadata
1. Open **Task Metadata** sheet
2. Look for rows with:
   - TaskType = "Missing Safety Report"
   - Employee = "Benjamin Lapka"
   - Status = "Pending" (not "Complete")

### Check Safety Compliance
1. Open **Safety Compliance** sheet
2. Look for week 01/31/2026
3. Find Benjamin Lapka's row
4. Should show ❌ for missing items

### Regenerate Task Metadata
1. Click: **Glove Manager → Schedule & To-Do → Generate Task Metadata**
2. Wait for completion (may take 30-60 seconds)
3. Reopen Task List dialog

### Check Logger Output
1. Press `Ctrl+Shift+C` (or Cmd+Option+C on Mac)
2. Go to **Extensions → Apps Script**
3. Click **View → Logs**
4. Look for:
   ```
   collectMissingSafetyReportTasks: Added X missing safety report tasks total
   ```

## Success Criteria

✅ Tasks appear in Task List grouped by location  
✅ Task details show correct foreman name  
✅ Task details show correct phone number  
✅ SMS button appears and opens dialog  
✅ Tasks show as High priority if overdue  
✅ Tasks show itemType (JHA, Weekly Meeting, or both)  
✅ Notes show specific missing dates  

## If Issue Persists

Contact support with:
- Screenshot of Task Metadata sheet (rows with Missing Safety Report)
- Screenshot of Task List dialog showing no tasks
- Logger output from Apps Script
- Date and time of last "Process Safety Emails" run

