# 🔧 TROUBLESHOOTING: Schedule Menu Not Appearing

**Issue**: Schedule menu not visible in Glove Manager  
**Date**: January 4, 2026

---

## ✅ SOLUTION: Refresh Your Spreadsheet

After deploying code with `npx @google/clasp push`, the menu won't appear until you refresh the spreadsheet.

### **Steps to Fix:**

**Option 1: Reload the Spreadsheet** (Fastest)
1. In your Google Sheet, press **Ctrl + R** (or **Cmd + R** on Mac)
2. Or click the browser refresh button
3. Wait for the sheet to fully reload
4. Check menu: **Glove Manager** → Should now see **📅 Schedule**

**Option 2: Close and Reopen**
1. Close the spreadsheet tab completely
2. Reopen it from Google Drive or your bookmarks
3. Check menu: **Glove Manager** → Should now see **📅 Schedule**

**Option 3: Hard Refresh** (If still not appearing)
1. Press **Ctrl + Shift + R** (or **Cmd + Shift + R** on Mac)
2. This clears cache and forces full reload
3. Check menu again

---

## 📋 VERIFY DEPLOYMENT

### **Check in Apps Script Editor:**
1. Go to: https://script.google.com
2. Open: "Rubber Tracker" project
3. Verify these files exist:
   - ✅ `10-Menu.gs` (should have Schedule submenu around line 34-40)
   - ✅ `75-Scheduling.gs` (should have setup functions)
   - ✅ All 18 original module files

### **Expected Menu Structure:**
```
Glove Manager
├── Build Sheets
├── Generate All Reports
├── ─────────
├── 📱 Open Dashboard
├── ─────────
├── Generate Glove Swaps
├── Generate Sleeve Swaps
├── Update Purchase Needs
├── Update Inventory Reports
├── Run Reclaims Check
├── Update Reclaims Sheet
├── ─────────
├── 📋 History (submenu)
├── 📝 To-Do List (submenu)
├── 📅 Schedule (submenu) ⭐ THIS IS NEW
│   ├── Setup All Schedule Sheets
│   ├── ─────────
│   ├── Setup Crew Visit Config
│   ├── Setup Training Config
│   ├── Setup Training Tracking
│   ├── ─────────
│   └── 📊 Generate Compliance Report
├── 🔧 Utilities (submenu)
├── 📧 Email Reports (submenu)
├── 🔍 Debug (submenu)
├── ─────────
└── Close & Save History
```

---

## ⚠️ IF STILL NOT APPEARING

### **Issue 1: Code Didn't Deploy**
**Solution**: Redeploy the code
```powershell
npx @google/clasp push
```
Look for success message. If errors appear, share them.

### **Issue 2: Wrong Apps Script Project**
**Solution**: Verify you're editing the correct project
1. In spreadsheet: Extensions → Apps Script
2. Should open the "Rubber Tracker" project
3. Check if all 18+ files are there
4. If not, you may have the wrong project linked

### **Issue 3: Clasp Not Configured**
**Solution**: Check .clasp.json file
```json
{
  "scriptId": "your-script-id-here",
  "rootDir": "./src"
}
```
Make sure scriptId points to your spreadsheet's script.

### **Issue 4: Menu Function Not Running**
**Solution**: Manually trigger onOpen
1. In Apps Script Editor
2. Open: `10-Menu.gs`
3. Select function: `onOpen`
4. Click Run (▶️)
5. Authorize if prompted
6. Go back to spreadsheet and refresh

---

## 🧪 MANUAL TEST

If automatic menu doesn't work, run setup manually:

### **From Apps Script Editor:**
1. Open: `75-Scheduling.gs`
2. Select function: `setupAllScheduleSheets`
3. Click Run (▶️)
4. Should create the three sheets even without menu

### **Expected Result:**
Three new sheets appear:
- Crew Visit Config
- Training Config
- Training Tracking

---

## ✅ VERIFICATION CHECKLIST

After refreshing, verify:
- [ ] Glove Manager menu appears
- [ ] Schedule submenu exists
- [ ] "Setup All Schedule Sheets" option visible
- [ ] Can click the menu item
- [ ] Three sheets are created when clicked

---

## 🔄 DEPLOYMENT CONFIRMATION

**Code was pushed at**: (check terminal output time)
**Files deployed**: 
- ✅ 10-Menu.gs (with Schedule submenu)
- ✅ 75-Scheduling.gs (with setup functions)
- ✅ All 18 refactored modules

**Next Step**: **Refresh your spreadsheet** with Ctrl+R

---

## 💡 QUICK FIX SUMMARY

**99% of the time, the fix is:**
1. Close spreadsheet tab
2. Reopen spreadsheet
3. Menu will now appear

**If that doesn't work:**
1. Go to Apps Script Editor
2. Run `onOpen()` manually from 10-Menu.gs
3. Go back to spreadsheet
4. Refresh

---

**Most Common Cause**: Spreadsheet cached old menu  
**Most Common Fix**: Refresh the spreadsheet (Ctrl+R)  
**If Still Not Working**: Run onOpen() manually from Apps Script

**The code is deployed - just need to refresh!** 🔄

