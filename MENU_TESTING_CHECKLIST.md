# Glove Manager Menu - Complete Testing Checklist

**Use this to verify all menu items are present and functional**

---

## 🎯 Main Menu Items (Top Level)

- [ ] **Build Sheets** - Rebuilds all swap and report sheets
- [ ] **Generate All Reports** - Runs all report generation functions
- [ ] _(separator)_
- [ ] **📱 Open Dashboard** - Opens the dashboard sidebar
- [ ] _(separator)_
- [ ] **Generate Glove Swaps** - Creates glove swap recommendations
- [ ] **Generate Sleeve Swaps** - Creates sleeve swap recommendations
- [ ] **Update Purchase Needs** - Updates purchase needs report
- [ ] **Update Inventory Reports** - Updates inventory statistics
- [ ] **Run Reclaims Check** - Checks for items needing class changes
- [ ] **Update Reclaims Sheet** - Updates the reclaims sheet
- [ ] _(separator)_

---

## 📋 History Submenu

**Glove Manager → History →**

- [ ] **Save Current State to History** - Saves snapshot of gloves/sleeves
- [ ] **Import Legacy History** - Imports old history data
- [ ] **Item History Lookup** - Search for item history
- [ ] **View Full History** - Opens history sheets

---

## 📝 To-Do List Submenu

**Glove Manager → To-Do List →**

- [ ] **Generate To-Do List** - Creates consolidated task list
- [ ] **Clear Completed Tasks** - Removes checked-off tasks

---

## 🔧 Utilities Submenu

**Glove Manager → Utilities →**

- [ ] **Fix All Change Out Dates** - Recalculates all change out dates
- [ ] **⚡ Setup Auto Change Out Dates** - Installs edit triggers
- [ ] **📤 Archive Previous Employees** - Moves terminated employees to history
- [ ] _(separator)_
- [ ] **💾 Create Backup Snapshot** - Creates timestamped backup
- [ ] **📂 View Backup Folder** - Opens backup folder in Drive

---

## 📧 Email Reports Submenu

**Glove Manager → Email Reports →**

- [ ] **Send Report Now** - Sends email report immediately
- [ ] **Set Up Weekly Email (Mon 12 PM)** - Schedules automatic weekly emails
- [ ] **Remove Scheduled Email** - Cancels scheduled emails

---

## 🔍 Debug Submenu

**Glove Manager → Debug →**

- [ ] **Test Edit Trigger** - Shows trigger status (should show 3 triggers)
- [ ] **Recalc Current Row** - Manually recalculates selected row's change out date

---

## 🔚 Final Menu Item

- [ ] _(separator)_
- [ ] **Close & Save History** - Saves history before closing

---

## ✅ Expected Trigger Status

When you click **Debug → Test Edit Trigger**, you should see:

```
Installed triggers: 4
- onChangeHandler (ON_CHANGE)
- dailyHistoryBackup (CLOCK)
- sendEmailReport (CLOCK)
- onEditHandler (ON_EDIT)

Simple onEdit function exists: YES
COLS.INVENTORY.DATE_ASSIGNED = 5
COLS.INVENTORY.ASSIGNED_TO = 8
```

✅ **This is correct!** All 4 triggers are installed:
- **onEditHandler** - Auto-updates change out dates when you edit cells
- **onChangeHandler** - Backup trigger for catching other changes
- **dailyHistoryBackup** - Automatically saves history daily
- **sendEmailReport** - Sends weekly email reports (if configured)

---

## 🧪 Priority Tests

### Critical Functions to Test:

1. **✅ FIXED: Generate All Reports** 
   - Should now work without SCHEMA error
   - Generates: Glove Swaps, Sleeve Swaps, Purchase Needs, Inventory Reports, Reclaims

2. **Create Backup Snapshot**
   - Should create backup in Google Drive
   - Should show success dialog

3. **Fix All Change Out Dates**
   - Should recalculate all dates in Gloves and Sleeves sheets
   - Should show count of fixed dates

4. **Edit Date Assigned**
   - Go to Gloves or Sleeves sheet
   - Edit any Date Assigned cell
   - Change Out Date should auto-update

---

## 🐛 Known Issue - FIXED

**Issue**: Generate All Reports failed with `SCHEMA is not defined`  
**Status**: ✅ **FIXED** - SCHEMA references removed from Code.gs  
**Action**: Push updated code to Apps Script and test again

---

## 📌 Note About Missing Files

The files `10-Menu.gs` and `21-ChangeOutDate.gs` exist in your local Git repository but need to be deployed to Apps Script.

**To Deploy**:
```powershell
# Option 1: Use clasp (if configured)
npx @google/clasp push

# Option 2: Manual deployment
# Copy contents of each file and paste into Apps Script editor
```

---

## ✅ Test Results Template

Copy and fill this out:

```
MENU STRUCTURE: ✅ All items present / ❌ Missing: ___________
BUILD SHEETS: ✅ Works / ❌ Error: ___________
GENERATE ALL REPORTS: ✅ Works / ❌ Error: ___________
CREATE BACKUP: ✅ Works / ❌ Error: ___________
FIX CHANGE OUT DATES: ✅ Works / ❌ Error: ___________
AUTO DATE UPDATE: ✅ Works / ❌ Error: ___________
TRIGGER STATUS: ✅ Shows 4 triggers / ❌ Shows: ___________
```

---

**After testing, report back with filled template or just say "Tests passed"**

