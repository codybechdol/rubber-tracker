# Testing Guide: setupTaskMetadataSheet() Function

**Date:** January 31, 2026  
**Function:** `setupTaskMetadataSheet()`  
**Status:** ✅ Deployed and ready to test

---

## 📋 Step-by-Step Testing Instructions

### Step 1: Refresh Your Spreadsheet

1. **Open** your Rubber Tracker spreadsheet in Google Sheets
2. **Hard refresh** to load the new code:
   - Windows: Press `Ctrl + Shift + R`
   - Mac: Press `Cmd + Shift + R`
3. Wait for the spreadsheet to fully reload

### Step 2: Access the Menu

1. Look at the top menu bar
2. Click **"Glove Manager"** menu
3. Hover over **"🔧 Utilities"** submenu
4. Look for **"📋 Setup Task Metadata Sheet"** (should be near the bottom of Utilities)

**Expected:** You should see this menu item

**If not visible:**
- Try refreshing again (Ctrl + Shift + R)
- Wait 30 seconds and check again (Apps Script can take time to update)
- Check the Apps Script editor to verify deployment

### Step 3: Run the Setup Function

1. Click **"Glove Manager" → "🔧 Utilities" → "📋 Setup Task Metadata Sheet"**
2. **Wait** - The function may take 5-10 seconds to run
3. You should see a dialog appear

**First Time (Sheet Doesn't Exist):**
- Function will create the sheet automatically
- You'll see a success message:
  ```
  ✅ Task Metadata Sheet Setup Complete!
  
  Sheet created with 25 columns.
  Ready to generate task metadata.
  
  Next step: Click "Generate Task Metadata" to populate from source sheets.
  ```

**If Sheet Already Exists:**
- You'll see a warning dialog:
  ```
  Task Metadata Sheet Exists
  
  Sheet already exists. Do you want to reset it? (This will clear all data)
  ```
- Click **"No"** for now (we want to keep the test)
- Or click **"Yes"** if you want to reset and try again

### Step 4: Verify the Sheet Structure

1. Look at the **tabs** at the bottom of your spreadsheet
2. Find the new **"Task Metadata"** tab
3. Click on it to view the sheet

**What You Should See:**

#### Header Row (Row 1):
Should have these 25 columns with **blue background** and **white text**:

| A | B | C | D | E | F | G | H | I | J | K | L | M |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| TaskID | SourceSheet | SourceRow | Employee | TaskType | ItemType | CurrentItem | Location | Foreman | PhoneNumber | DueDate | ScheduledDate | StartTime |

| N | O | P | Q | R | S | T | U | V | W | X | Y |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| EndTime | Status | NotifiedDate | ScheduledClassDate | ClassType | IsOffice | IsRegistered | IsDeclined | CompletedDate | Notes | CreatedDate | LastModified |

#### Column Widths:
- TaskID column should be wide (~200 pixels)
- Most columns should be readable without horizontal scrolling
- Some columns like Notes should be wider

#### Formatting:
- **Header row:** Blue background (#4285f4), white text, bold, centered
- **Header row frozen:** Should stay visible when scrolling down
- **Filter buttons:** Small dropdown arrows on each header
- **Protected columns:** TaskID, SourceSheet, SourceRow (columns A, B, C) should have a light gray shield icon when you hover

### Step 5: Test Column Validations

Try these tests to verify data validation works:

#### Test 1: Status Column (Column O)
1. Click on cell **O2** (Status, row 2)
2. You should see a **dropdown arrow** appear
3. Click the dropdown
4. **Expected:** See options: Pending, Scheduled, Complete, Overdue, Declined
5. Try typing "Invalid" → Should reject it

#### Test 2: ClassType Column (Column R)
1. Click on cell **R2** (ClassType, row 2)
2. Click the dropdown
3. **Expected:** See options: Online, InPersonMPC, InPersonMSLCAT, (blank)

#### Test 3: Boolean Columns (Columns S, T, U)
1. Click on cell **S2** (IsOffice, row 2)
2. Click the dropdown
3. **Expected:** See options: TRUE, FALSE, (blank)

#### Test 4: Protected Columns
1. Try to edit cell **A2** (TaskID)
2. **Expected:** You should see a warning:
   ```
   This range is protected.
   System-managed fields - do not edit manually
   ```
3. You can still edit if you want (warning only), but it warns you

### Step 6: Check Formatting

#### Date Columns (K, L, P, Q, V, X, Y):
1. Click on cell **K2** (DueDate)
2. Type a date: `2026-02-15`
3. Press Enter
4. **Expected:** Date should format as `2026-02-15`

#### Time Columns (M, N):
1. Click on cell **M2** (StartTime)
2. Type a time: `9:00`
3. Press Enter
4. **Expected:** Time should format as `09:00`

### Step 7: Test Filter

1. Click on the **filter icon** in the header row
2. Click the dropdown on **Status** column (O1)
3. **Expected:** See filter options (even though no data yet)
4. Click "OK" to close

---

## ✅ Success Criteria

**You have successfully tested if:**

- [x] Menu item appears: "Glove Manager → Utilities → Setup Task Metadata Sheet"
- [x] Function runs without errors
- [x] Success dialog appears
- [x] Task Metadata sheet tab appears at bottom
- [x] Sheet has 25 columns with correct headers
- [x] Header row is blue with white text
- [x] Header row stays visible when scrolling (frozen)
- [x] Status column has dropdown validation (5 options)
- [x] ClassType column has dropdown validation (4 options)
- [x] Boolean columns have TRUE/FALSE/blank validation
- [x] TaskID, SourceSheet, SourceRow show protection warning
- [x] Filter buttons appear on all headers
- [x] Date columns format correctly
- [x] Time columns format correctly

---

## 🐛 Troubleshooting

### Problem: Menu item doesn't appear

**Solution:**
1. Hard refresh: `Ctrl + Shift + R`
2. Wait 30 seconds
3. Close and reopen the spreadsheet
4. Check Apps Script editor: Extensions → Apps Script → Run → onOpen

### Problem: Function runs but sheet not created

**Solution:**
1. Check for error message in dialog
2. Open Apps Script editor
3. View → Execution log
4. Look for error messages
5. Report error to developer

### Problem: "Permission denied" error

**Solution:**
1. You may need to re-authorize the script
2. When prompted, click "Review Permissions"
3. Select your Google account
4. Click "Allow"

### Problem: Columns look wrong

**Solution:**
1. Run the function again
2. When prompted "Sheet already exists", click "Yes" to reset
3. This will recreate with correct formatting

### Problem: Validation not working

**Solution:**
1. Check that you're in row 2 or below (row 1 is headers)
2. Validation only applies to data rows
3. Try running setup function again to reset

---

## 📸 Screenshots to Take (Optional)

If you want to document the test:

1. Screenshot of menu: Glove Manager → Utilities → Setup Task Metadata Sheet
2. Screenshot of success dialog
3. Screenshot of Task Metadata sheet showing all 25 column headers
4. Screenshot of Status dropdown showing 5 options
5. Screenshot of protected column warning

---

## 🎯 What This Accomplishes

This setup function:
- Creates the **foundation** for the new architecture
- Replaces the old "To Do List" sheet approach
- Provides a **structured** way to store task scheduling state
- Sets up **validation** to prevent data entry errors
- Adds **protection** to system-managed fields

**Next Step After This Test:**
Once confirmed working, we'll implement `generateTaskMetadata()` to populate this sheet with actual task data from your source sheets (Glove Swaps, Sleeve Swaps, etc.).

---

## 📝 Report Back

After testing, please report:

1. ✅ **Success** - Everything works as described
2. ⚠️ **Partial Success** - Some things work, some don't (specify which)
3. ❌ **Failure** - Errors occurred (provide error message)

**Include:**
- Which step you got to
- Any error messages you saw
- Screenshots if possible
- Any unexpected behavior

---

**Ready to Test!** 🚀

Follow the steps above and let me know how it goes!
