# Agent Fix Plan - Missing Safety Report Tasks in Task List

## Date: February 11, 2026

## Problem Summary
Matthew Miller and other foremen have Missing Safety Report tasks in Task Metadata (e.g., row 57) but they're NOT appearing in the Task List dialog.

## Root Cause Analysis

### Issue 1: Malformed Data in Task Metadata
The Safety Compliance tasks have **shifted columns** - data is in wrong columns:
- Column D (Employee) contains "Missing Safety Report" instead of foreman name
- Column E (TaskType) contains "JHA" instead of "Missing Safety Report"
- Column K (DueDate) contains "1900-01-14" (date parsing error)

### Issue 2: `getMissingSafetyReportTasks` Not Found Error
The console shows: `getMissingSafetyReportTasks is not a function`
This means the function in 88-SafetyReports.gs either:
- Wasn't pushed to Google Apps Script
- OR there's a syntax error earlier in the file preventing it from registering

### Issue 3: Previous Week Filter May Be Too Strict
The `collectMissingSafetyReportTasks()` function only collects tasks from the PREVIOUS week. If data is older, it won't show.

---

## Fix Steps (For Agent Mode)

### Step 1: Run Existing Menu Fix
**Instructions for user (manual):**
1. In Google Sheets: **Glove Manager → 🛡️ Safety Reports → 🛠️ Fix Shifted Safety Tasks**
2. Click Yes when prompted to delete the malformed rows

### Step 2: Regenerate Previous Week Tasks
**Instructions for user (manual):**
1. In Google Sheets: **Glove Manager → 🛡️ Safety Reports → 📅 Regenerate Previous Week Tasks**
2. This will recalculate compliance for week of Feb 1-7 and create proper tasks

### Step 3: Deploy Latest Code
**For agent mode:**
Run: `.\push.bat` to deploy the latest code including:
- The `getMissingSafetyReportTasks()` function in 88-SafetyReports.gs
- The enhanced `fixMalformedSafetyComplianceTasks()` function

### Step 4: Add Menu Item (Already Done)
The menu item "🛠️ Fix Shifted Safety Tasks" already exists at:
`Glove Manager → 🛡️ Safety Reports → 🛠️ Fix Shifted Safety Tasks`

### Step 5: Verify Fix
After running steps 1-3:
1. Open Tasks & Calendar dialog
2. Expand "Safety Compliance" category
3. Matthew Miller's Missing JHA task should appear with:
   - Week of 02/01/2026
   - Missing: JHA: 02/02/2026
   - SMS button (💬)
   - Complete button (✓)

---

## Files Modified

| File | Change |
|------|--------|
| `src/88-SafetyReports.gs` | Added `fixMalformedSafetyComplianceTasks()` and `getMissingSafetyReportTasks()` |
| `src/Code.gs` | Menu item already exists |

---

## Expected Task Metadata Structure (Correct)

For a Missing Safety Report task, columns should be:
- A (TaskID): `SafetyCompliance_015-26_02-01-2026`
- B (SourceSheet): `Safety Compliance`
- C (SourceRow): `015-26` (job number)
- D (Employee): `Matthew Miller` (foreman name)
- E (TaskType): `Missing Safety Report`
- F (ItemType): `JHA` or `Weekly Meeting` or `JHA + Weekly Meeting`
- G (CurrentItem): (empty)
- H (Location): `Big Sky`
- I (Foreman): `Matthew Miller`
- J (PhoneNumber): `(406) 220-2297`
- K (DueDate): `2026-02-07` (Saturday of that week)
- O (Status): `Pending`
- W (Notes): `Missing JHA: 02/02/2026`

---

## Quick Manual Fix (If Agent Mode Not Available)

1. **Delete malformed rows in Task Metadata:**
   - Open Task Metadata sheet
   - Find rows where TaskID starts with "SafetyCompliance_"
   - Check if Column D = "Missing Safety Report" (WRONG - should be foreman name)
   - Delete those rows

2. **Regenerate:**
   - Glove Manager → 🛡️ Safety Reports → 📅 Regenerate Previous Week Tasks

3. **Refresh Task List:**
   - Close and reopen Tasks & Calendar dialog
   - Click "Refresh" button

---

## Console Errors Explained

### Error: `getMissingSafetyReportTasks is not a function`
- This function IS in 88-SafetyReports.gs (line ~3295)
- Likely cause: Code wasn't pushed OR syntax error earlier in file
- Solution: Run `.\push.bat` to deploy

### The `1900-01-14` Date
- This is JavaScript's epoch date (Jan 1, 1900)
- Caused by parsing errors when the code tried to read malformed data
- Will be fixed when tasks are regenerated with correct structure

