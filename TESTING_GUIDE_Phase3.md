# Testing Phase 3: Task State Updates - Quick Guide

## Overview
Phase 3 adds functions to update task state (dates, times, completion, notifications) in the Task Metadata sheet. These functions are already implemented and need testing.

---

## Test 1: Save Scheduled Date Changes ✅

**What it tests:** `saveScheduleTaskDateChanges()` + `updateTaskMetadata()` + `scheduleTask()`

### Steps:
1. Open **Tasks & Calendar** dialog
2. In **Task List** tab, find any pending task
3. Change the scheduled date (click date input, pick new date)
4. Click **💾 Save Changes** button
5. Close dialog

### ✅ Verify:
- Open **Task Metadata** sheet
- Find the task (search by employee name or location)
- Column L (ScheduledDate) should show your new date
- Column Y (LastModified) should show current timestamp
- Column O (Status) should change from "Pending" to "Scheduled"

### Expected Result:
```
Status changed: Pending → Scheduled
ScheduledDate updated in metadata
Toast message: "✓ Changes saved successfully"
```

---

## Test 2: Save Start/End Times ✅

**What it tests:** Time field updates in Task Metadata

### Steps:
1. Open **Tasks & Calendar** dialog
2. Find a task and expand it (click to see details)
3. Set Start Time to **9:00 AM**
4. Set End Time to **11:00 AM**
5. Click **💾 Save Changes**

### ✅ Verify:
- Open **Task Metadata** sheet
- Find the task
- Column M (StartTime) should show "09:00"
- Column N (EndTime) should show "11:00"
- Column Y (LastModified) updated

---

## Test 3: Mark Task Complete ✅

**What it tests:** `markScheduleTaskComplete()` + `markTaskComplete()` + `syncTaskCompletionToSource()`

### Steps:
1. Open **Tasks & Calendar** dialog
2. Find a **simple task** (NOT a cert renewal - those have special workflow)
   - Good choices: Glove swap, sleeve swap, manual task
3. Click the **checkbox** next to the task
4. Confirm completion

### ✅ Verify:
- Task disappears from dialog (reopen to confirm)
- Open **Task Metadata** sheet
- Column O (Status) = "Complete"
- Column V (CompletedDate) = today's date
- Column Y (LastModified) updated

### Expected Result:
```
Task marked complete
Toast message: "Task marked complete"
Task removed from pending list
```

---

## Test 4: Complete Cert Renewal (Special Flow) ✅

**What it tests:** Cert expiration update workflow

### Steps:
1. Open **Tasks & Calendar** dialog
2. Go to **Expiring Certs** tab
3. Find a cert renewal task (e.g., "Renew CPR")
4. Click **Mark Complete** checkbox
5. **Modal popup appears** asking for new expiration date
6. Enter new expiration date (e.g., 1 year from today)
7. Click **Save**

### ✅ Verify:
- Task disappears from dialog
- Open **Task Metadata** sheet - task marked complete
- Open **Expiring Certs** sheet
- Employee's cert expiration date updated to new date
- Employee History logged the cert update

### Expected Result:
```
Modal: "Enter new expiration date for [Cert Type]"
On save: Updates Expiring Certs sheet + Task Metadata
Toast: "✓ Certification updated and task completed!"
```

---

## Test 5: Bulk Edit Location Tasks ✅

**What it tests:** Batch update multiple tasks

### Steps:
1. Open **Tasks & Calendar** dialog
2. In **Task List** tab, find location with multiple tasks (e.g., "Bozeman - 3 tasks")
3. Click the location to expand
4. Use **bulk edit** inputs at bottom of section:
   - Set Date: (pick a date)
   - Set Start Time: 8:00 AM
   - Set End Time: 10:00 AM
5. Click **Apply to All** button

### ✅ Verify:
- All tasks for that location updated
- Open **Task Metadata** sheet
- All tasks at that location should have:
  - Same ScheduledDate (column L)
  - Same StartTime (column M = "08:00")
  - Same EndTime (column N = "10:00")
  - Status changed to "Scheduled" (column O)

---

## Test 6: Send SMS Notification ✅

**What it tests:** `recordTaskNotification()` function

### Steps:
1. Open **Tasks & Calendar** dialog
2. Go to **Expiring Certs** tab
3. Find an employee with valid phone number
4. Click **📱 Send notification** button
5. Review SMS message in popup
6. Click **Send SMS**
7. Confirm send in confirmation dialog

### ✅ Verify:
- Toast message: "SMS sent successfully"
- Open **Task Metadata** sheet
- Find employee's cert task
- Column P (NotifiedDate) should show today's date
- Column Y (LastModified) updated
- Button should change to "✓ Notified [date]"

---

## Test 7: Schedule Class Registration ✅

**What it tests:** `markTaskRegistered()` function

### Steps:
1. Open **Tasks & Calendar** dialog
2. Go to **Expiring Certs** tab
3. Find an employee whose cert can be renewed via class (CPR, 1st Aid, etc.)
4. Click **📅 Send class schedule** button
5. Review SMS message with class date/location
6. Click **Send SMS**

### ✅ Verify:
- Open **Task Metadata** sheet
- Find employee's cert task
- Column Q (ScheduledClassDate) = class date
- Column R (ClassType) = cert type
- Column T (IsRegistered) = "TRUE"
- Column Y (LastModified) updated
- Button should change to "✓ Registered for [date]"

---

## Test 8: Decline Task ✅

**What it tests:** `markTaskDeclined()` function

### Steps:
1. Open **Tasks & Calendar** dialog
2. Find any task
3. Click **⏸️ Decline** button (if available)
4. Enter decline reason in popup
5. Click **Save**

### ✅ Verify:
- Task disappears from pending list
- Open **Task Metadata** sheet
- Column U (IsDeclined) = "TRUE"
- Column W (Notes) contains decline reason
- Column O (Status) = "Declined"

---

## Test 9: Regenerate After Edits (THE BIG TEST) ✅

**What it tests:** Metadata preservation fix (Phase 2.4)

### Steps:
1. **Schedule 3 tasks for future dates with specific times**
   - Task A: Glove swap for John, scheduled 2/5 @ 9:00-11:00
   - Task B: CPR renewal for Jane, scheduled 2/7 @ 1:00-3:00
   - Task C: Manual task, scheduled 2/10 @ 8:00-12:00
2. **Save changes** and close dialog
3. **Change source data:**
   - Update John's location in Employees sheet (e.g., Helena → Bozeman)
   - Update Jane's phone number
   - Add a new glove swap task
4. **Generate Task Metadata**
   - Menu: Glove Manager → Schedule & To-Do → Generate Task Metadata
5. **Reopen Tasks & Calendar dialog**

### ✅ Verify:
- **Task A:** Location updated to Bozeman, scheduled date STILL 2/5, time STILL 9:00-11:00
- **Task B:** Phone updated, scheduled date STILL 2/7, time STILL 1:00-3:00
- **Task C:** No changes, scheduled date STILL 2/10, time STILL 8:00-12:00
- **New task:** Appears in pending list with no scheduled date

### Expected Behavior:
```
Success message shows:
✅ Task Metadata Generated!
• Total tasks found: 45
• New metadata records: 1 (the new glove swap)
• Updated existing records: 44

💡 Note: Existing tasks were updated with fresh source data 
while preserving your scheduled dates, times, and completion status.
```

---

## Common Issues & Solutions

### Issue: "Task Metadata sheet not found"
**Solution:** Run "Setup Task Metadata Sheet" from menu first

### Issue: "Please run Generate Task Metadata first"
**Solution:** Generate metadata before opening Tasks & Calendar

### Issue: Task doesn't appear after scheduling
**Problem:** Task might be filtered out
**Solution:** Check filters - clear all filters and look again

### Issue: Date changes don't save
**Problem:** Forgot to click Save Changes button
**Solution:** Always click 💾 Save Changes before closing dialog

### Issue: Completed task reappears
**Problem:** Metadata might not be marked complete
**Solution:** Check Task Metadata sheet Column O (Status) and Column V (CompletedDate)

---

## Rollback (If Needed)

If testing reveals critical issues:

```powershell
cd "C:\Users\codyb\WebstormProjects\Rubber Tracker"
git checkout v1.0-phase1-complete
.\push.bat
```

This reverts to Phase 1 (Task Metadata working, but dialogs still using old logic).

---

## Success Criteria

All tests pass when:
- ✅ Manual edits (dates/times) persist across metadata regeneration
- ✅ Source data updates flow through on regeneration
- ✅ Task completion updates both metadata and source sheets
- ✅ Notification tracking works (SMS sent dates recorded)
- ✅ Class registration tracking works
- ✅ No errors in browser console or Apps Script logs
- ✅ Performance acceptable (dialog loads < 5 seconds)

---

## Next Steps After Testing

If all tests pass:
1. **Deploy to production:** `.\push.bat`
2. **Update IMPLEMENTATION_TRACKER.md:** Mark Phase 2 as 100% complete
3. **Move to Phase 4:** Migrate localStorage to ScriptProperties
4. **Document Phase 5:** Design unified Task List + My Checklist view

---

## Questions to Answer During Testing

1. ❓ Does the dual-source update (metadata + source sheet) cause any sync issues?
2. ❓ Are there any tasks that don't update correctly on regeneration?
3. ❓ Does completion workflow feel intuitive for cert renewals vs regular tasks?
4. ❓ Should we add batch complete (complete multiple tasks at once)?
5. ❓ Should we add undo/redo for accidental completions?

---

## Testing Log Template

Use this to track testing results:

```
=== PHASE 3 TESTING LOG ===
Date: _____________
Tester: ___________

Test 1: Save Dates       [ ] Pass  [ ] Fail  Notes: ________________
Test 2: Save Times       [ ] Pass  [ ] Fail  Notes: ________________
Test 3: Mark Complete    [ ] Pass  [ ] Fail  Notes: ________________
Test 4: Cert Renewal     [ ] Pass  [ ] Fail  Notes: ________________
Test 5: Bulk Edit        [ ] Pass  [ ] Fail  Notes: ________________
Test 6: SMS Notify       [ ] Pass  [ ] Fail  Notes: ________________
Test 7: Class Schedule   [ ] Pass  [ ] Fail  Notes: ________________
Test 8: Decline Task     [ ] Pass  [ ] Fail  Notes: ________________
Test 9: Regenerate       [ ] Pass  [ ] Fail  Notes: ________________

Overall Status: [ ] Ready for Production  [ ] Needs Fixes

Issues Found:
1. _____________________________________________________________
2. _____________________________________________________________
3. _____________________________________________________________

Recommendations:
________________________________________________________________
________________________________________________________________
```

---

## Related Documentation

- **FIX_METADATA_PRESERVATION.md** - Detailed fix documentation
- **PHASE2_PROGRESS.md** - Current progress status
- **IMPLEMENTATION_TRACKER.md** - Overall implementation plan
- **.github/copilot-instructions.md** - Feature development roadmap
