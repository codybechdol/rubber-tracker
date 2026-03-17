# Testing Guide - March 17, 2026 Changes

## Features to Test

1. Mark Job Completed from Crew Import
2. Auto-Complete when Actual End Date is set
3. Schedule History Columns in Job Tracking
4. Click-to-Edit on Safety Compliance sheet
5. Config edits syncing to Job Tracking

---

## Prerequisites

Before testing, refresh your spreadsheet (Ctrl+Shift+R) to load the new code.

---

## Test 1: Mark Job Completed from Crew Import

### Steps:
1. Go to **Glove Manager → Utilities → Import Crew Makeup**
2. Upload a crew structure Excel file (or use a recent one)
3. In the preview, find any crew card with the dropdown (⋮ icon)
4. Click the dropdown and look for **"Mark Job Completed..."** option
5. Click it
6. A dialog should appear asking for completion date
7. Click "Mark Completed"

### Expected Results:
- ✅ Toast notification: "✅ [Job#] marked as Completed"
- ✅ Crew card should update to show completed state
- ✅ Open Job Tracking sheet - row should have:
  - Status = "Completed"
  - Actual End Date = the date you entered
  - Last Updated = current timestamp
  - Notes = "Marked Completed via Crew Import..."

### If it fails:
- Check Extensions → Apps Script → Executions for errors
- Look for `markJobCompletedFromImport` in the logs

---

## Test 2: Auto-Complete on Actual End Date

### Steps:
1. Open the **Job Tracking** sheet
2. Find any row with Status = "Active"
3. In the **Actual End Date** column (G), enter today's date
4. Press Enter

### Expected Results:
- ✅ Status column (H) should automatically change to "Completed"
- ✅ Toast notification: "🔄 Job Tracking Sync" with "Status auto-set to Completed"
- ✅ Training Tracking may show rows removed for this job (if any future rows exist)

### If it fails:
- Check if the onEdit trigger is running (Extensions → Apps Script → Executions)
- Look for `handleJobTrackingEdit` in the logs

---

## Test 3: Schedule History Columns in Job Tracking

### Setup (one-time):
1. Go to **Glove Manager → Utilities → Add Schedule History Columns**
2. This adds hidden columns K-N to Job Tracking
3. To view: Select columns K-N, right-click, "Unhide columns"

### Steps to test sync from Config:
1. Go to **Glove Manager → Utilities → Sync Config to Job Tracking Schedules**
2. Open Job Tracking sheet
3. Unhide columns K-N
4. Check that Work Schedule, Skip Days, and Schedule Effective are populated

### Expected Results:
- ✅ Column K (Work Schedule): Shows "Mon-Thu", "Tue-Fri", "Mon-Fri", or "Custom"
- ✅ Column L (Skip Days): Shows comma-separated days like "Sat,Sun,Fri"
- ✅ Column M (Schedule Effective): Shows today's date
- ✅ Column N (Schedule History): Shows "[]" (empty array initially)

### If it fails:
- Run the migration first: Glove Manager → Utilities → Add Schedule History Columns
- Check if Safety Compliance Config sheet exists and has data

---

## Test 4: Click-to-Edit on Safety Compliance Sheet

### Setup:
Make sure you have at least one row in Safety Compliance sheet.

### Test 4a: Change Day Status to ✅
1. Open **Safety Compliance** sheet
2. Find a row with ❌ in any day column (Mon-Sat)
3. Click on the ❌ cell
4. Type `✅` (or copy-paste it)
5. Press Enter

### Expected Results:
- ✅ Toast: "🛡️ [Job#] [Day] marked received"
- ✅ If Task Metadata has a Missing Safety Report task for this job/week, it should be marked Complete
- ✅ Status column may update to "Complete" if all days are now ✅
- ✅ Updated column (N) should show current timestamp

### Test 4b: Change Day Status to ❌
1. Find a row with ✅ or ⏳ in a day column
2. Change it to `❌`
3. Press Enter

### Expected Results:
- ✅ Toast: "🛡️ [Job#] [Day] marked missing"
- ✅ If no task exists, a new "Missing Safety Report" task is created in Task Metadata
- ✅ If task exists and was Complete, it's reverted to Pending
- ✅ Status column updates to "Missing Reports"

### Test 4c: Change to N/A (skip day)
1. Change any day to `N/A`
2. Press Enter

### Expected Results:
- ✅ Toast shows "marked N/A (skipped)"
- ✅ Associated task is marked Complete with note "day was skipped"
- ✅ N/A days don't count against completion

### Test 4d: Invalid Value Rejection
1. Try typing an invalid value like "x" or "done"
2. Press Enter

### Expected Results:
- ✅ Toast: "⚠️ Invalid - Invalid value. Use: ✅, ✅L, ❌, N/A, or ⏳"
- ✅ Cell reverts to previous value

### If it fails:
- Check Extensions → Apps Script → Executions for `handleSafetyComplianceEdit`
- Make sure you're editing columns D-M (days, weekly meeting, monthly, or status)

---

## Test 5: Config Changes Sync to Job Tracking

### Prerequisites:
- Run "Add Schedule History Columns" first (Test 3 setup)

### Steps:
1. Open **Safety Compliance Config** sheet
2. Find any crew row
3. Check/uncheck one of the Skip Day checkboxes (e.g., Skip Fri)
4. Press Enter or click away

### Expected Results:
- ✅ Toast: "📅 Schedule Synced - Schedule updated for [Job#]: [Schedule Type]"
- ✅ Open Job Tracking, unhide columns K-N
- ✅ Work Schedule column should show updated value (e.g., "Mon-Thu" if Fri is skipped)
- ✅ Skip Days should show updated list
- ✅ Schedule History (column N) should contain the OLD schedule in JSON format

### Example Schedule History JSON:
```json
[{"schedule":"Mon-Fri","skipDays":"Sat,Sun","startDate":"03/01/2026","endDate":"03/17/2026"}]
```

### If it fails:
- Make sure Job Tracking has the hidden columns K-N
- Check for `handleSafetyComplianceConfigEdit` in execution logs

---

## Test 6: Verify Task List and Trip Planner Updates

### After doing Test 4 (clicking in Safety Compliance):

### Test 6a: Task List
1. Go to **Glove Manager → Schedule & To-Do → Task List**
2. Look for "Missing Safety Report" tasks

### Expected:
- ✅ Tasks you marked ✅ in Safety Compliance should NOT appear (or show as Complete)
- ✅ Tasks you marked ❌ should appear as Pending

### Test 6b: Trip Planner
1. Go to **Glove Manager → Schedule & To-Do → Trip Planner / Scheduler**
2. Look at the unassigned tasks sidebar

### Expected:
- ✅ Completed Missing Safety Report tasks should NOT appear in the sidebar
- ✅ Pending Missing Safety Report tasks SHOULD appear

---

## Troubleshooting Common Issues

### Issue: No toast notification appears
- The onEdit trigger may not be installed
- Run: Glove Manager → Utilities → Install Edit Trigger (if available)
- Or manually run `createEditTrigger()` from Apps Script

### Issue: Task Metadata not updating
- Check if Task Metadata sheet exists
- Check the TaskID format matches: `SafetyCompliance_{jobNumber}_{MM-dd-yyyy}`
- Look at execution logs for errors

### Issue: Schedule columns not appearing in Job Tracking
- Run "Add Schedule History Columns" from Utilities menu
- If already run, unhide columns K-N (they're hidden by default)

### Issue: Config changes not syncing
- Make sure you're editing columns D-J (Skip Sun through Skip Sat)
- Check execution logs for `handleSafetyComplianceConfigEdit`

---

## Reporting Bugs

When reporting issues, please include:
1. What you did (exact steps)
2. What you expected
3. What actually happened
4. Screenshot if helpful
5. Error messages from Extensions → Apps Script → Executions

---

## Quick Reference: Valid Values for Safety Compliance

| Value | Meaning |
|-------|---------|
| ✅ | Received on time |
| ✅L | Received late (after deadline) |
| ❌ | Missing (deadline passed) |
| ⏳ | Pending (not yet due) |
| N/A | Skipped (crew doesn't work this day) |
| ⚠️ | Warning (Monthly Checklist - week 3) |
| ❌⏳ | Urgent (Monthly Checklist - week 4) |

