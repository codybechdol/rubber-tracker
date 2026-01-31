# Testing Guide: generateTaskMetadata() Function

**Date:** January 31, 2026  
**Function:** `generateTaskMetadata()`  
**Status:** ✅ Deployed and ready to test

---

## 📋 Quick Test Steps

1. **Refresh spreadsheet:** `Ctrl + Shift + R`
2. **Click:** Glove Manager → 📅 Schedule & To-Do → 🎯 Generate Task Metadata
3. **Wait:** Progress dialog appears, then success message (30-60 seconds)
4. **Check:** Task Metadata sheet now has data rows below the header
5. **Verify:** Statistics shown in success dialog

---

## What This Function Does

`generateTaskMetadata()` reads from ALL your source sheets and creates metadata records:

**Source Sheets Read:**
- Glove Swaps
- Sleeve Swaps
- Training Tracking
- Reclaims
- Expiring Certs
- Manual Tasks

**For Each Task, It Creates:**
- Unique TaskID
- Reference to source sheet + row
- Employee info (name, location, foreman, phone)
- Task details (type, item, due date)
- Initial status (Pending or Overdue)
- Timestamps (created, last modified)

---

## Step-by-Step Testing

### Step 1: Refresh and Find Menu Item

1. **Hard refresh:** `Ctrl + Shift + R` (or `Cmd + Shift + R`)
2. **Click:** Glove Manager → 📅 Schedule & To-Do
3. **Look for:** 🎯 Generate Task Metadata (should be at top, before Generate Smart Schedule)

### Step 2: Run the Function

1. **Click:** 🎯 Generate Task Metadata
2. **Wait for progress dialog:**
   ```
   ⏳ Generating Task Metadata
   
   This may take 30-60 seconds.
   Reading from source sheets and creating metadata records...
   ```
3. **Wait** - Don't close the dialog, it's working!

### Step 3: Review Success Message

You should see a detailed success message like:

```
✅ Task Metadata Generated!

📊 Statistics:
• Total tasks found: 45
• New metadata records: 45
• Duplicates skipped: 0

📍 Sources:
• Glove Swaps: 15
• Sleeve Swaps: 8
• Training Tracking: 12
• Expiring Certs: 10

✅ Task Metadata sheet is ready for scheduling!
```

**Your numbers will be different** based on your actual data.

### Step 4: Verify the Data

1. **Click** on the "Task Metadata" tab at the bottom
2. **Scroll down** - you should now see data rows (not just headers)
3. **Check these columns:**

#### Column A (TaskID):
- Should have values like: `GloveSwaps_15_20260131`
- Format: `{SourceSheet}_{RowNumber}_{Date}`

#### Column B (SourceSheet):
- Should show: Glove Swaps, Sleeve Swaps, Training Tracking, etc.

#### Column C (SourceRow):
- Should show row numbers: 15, 23, 7, etc.

#### Column D (Employee):
- Should show employee names from your source sheets

#### Column H (Location):
- Should show locations: Bozeman, Helena, Missoula, etc.

#### Column I (Foreman):
- Should show foreman names (if available)

#### Column J (PhoneNumber):
- Should show formatted phone numbers: (406) 123-4567

#### Column K (DueDate):
- Should show dates in YYYY-MM-DD format

#### Column O (Status):
- Should show: Pending or Overdue

#### Column X (CreatedDate):
- Should show today's date: 2026-01-31

### Step 5: Test Duplicate Prevention

1. **Run the function AGAIN:** Glove Manager → Generate Task Metadata
2. **Look at success message**
3. **Expected:**
   ```
   • New metadata records: 0
   • Duplicates skipped: 45
   ```
   This proves the duplicate detection works!

### Step 6: Verify Data Accuracy

Pick a few random tasks and verify:

1. **Find a task** in Glove Swaps sheet (note employee name and row number)
2. **Go to Task Metadata sheet**
3. **Filter** by SourceSheet = "Glove Swaps"
4. **Find** the matching row (SourceRow column should match)
5. **Verify:**
   - Employee name matches
   - Location is correct
   - Phone number is correct (if employee has one)
   - Due date matches

---

## ✅ Success Criteria

**You have successfully tested if:**

- [x] Menu item appears: Glove Manager → Schedule & To-Do → Generate Task Metadata
- [x] Progress dialog shows while running
- [x] Success message appears with statistics
- [x] Task Metadata sheet now has data rows (not just header)
- [x] TaskID column has unique IDs (format: Sheet_Row_Date)
- [x] SourceSheet column shows correct sources
- [x] SourceRow column has row numbers
- [x] Employee names populated correctly
- [x] Locations populated correctly
- [x] Phone numbers populated (for employees that have them)
- [x] Status shows Pending or Overdue
- [x] CreatedDate shows today's date
- [x] Running twice shows "Duplicates skipped" message

---

## 🐛 Troubleshooting

### Problem: "No Tasks Found" message

**Possible Causes:**
1. No pending glove/sleeve swaps
2. No upcoming training scheduled
3. No expiring certifications
4. Source sheets are empty

**Solution:**
- Check your source sheets have data
- Make sure there are pending tasks (not all completed)
- Try running "Generate All Reports" first to create swaps

### Problem: "Task Metadata Sheet Not Found"

**Solution:**
1. Click "Yes" when prompted to create it
2. Or manually run: Glove Manager → Utilities → Setup Task Metadata Sheet

### Problem: Phone numbers show blank

**Possible Causes:**
- Employee doesn't have phone number in Employees sheet
- Name mismatch between source and Employees sheet

**Solution:**
- Check Employees sheet has phone numbers
- Run: Glove Manager → Utilities → Format Phone Numbers
- Verify employee names match exactly

### Problem: No foreman names showing

**This is NORMAL if:**
- Your Employees sheet doesn't have foreman data yet
- This will be populated as we continue implementation

**Not a blocker** - foreman column can be populated later

### Problem: Function runs very slowly

**Normal if:**
- You have 100+ pending tasks
- Many source sheets with data
- Should complete within 2 minutes

**Action:**
- Just wait - it's processing
- Check execution log if takes > 5 minutes

---

## 📸 What to Check (Screenshot Locations)

If documenting:

1. Menu: Glove Manager → Schedule & To-Do → Generate Task Metadata
2. Success dialog with statistics
3. Task Metadata sheet with populated rows
4. Sample TaskID showing correct format
5. Sample row showing all data populated

---

## 🎯 What This Accomplishes

This function:
- **Reads** all your source data (swaps, training, certs, etc.)
- **Creates** structured metadata records for scheduling
- **Prevents duplicates** (won't create same record twice)
- **Enriches data** with phone numbers from Employees sheet
- **Separates** foreman from location (cleaner structure)
- **Timestamps** everything for audit trail

**Next Step After This Test:**
Once confirmed working, we'll implement `getTasksWithMetadata()` to JOIN this metadata with source data for display in dialogs.

---

## 📝 Report Back

After testing, please report:

1. ✅ **Success** - Generated X tasks, data looks correct
2. ⚠️ **Partial Success** - Generated but some data missing (specify)
3. ❌ **Failure** - Error occurred (provide error message)

**Include:**
- Number of tasks generated (from success dialog)
- Which sources had tasks (Glove Swaps: X, Sleeve Swaps: Y, etc.)
- Any columns showing blank that shouldn't be
- Screenshots if helpful

---

**Ready to Test!** 🚀

Follow the steps above and let me know:
1. Did it run successfully?
2. How many tasks were generated?
3. Does the data look accurate?
