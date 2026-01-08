# 🚨 QUICK FIX - 3 Minutes

## The Problem
Your local code is fixed, but Google Sheets is still running the OLD code.

---

## The Solution (Copy 2 Changes)

### 1️⃣ Open Apps Script Editor
1. In your Google Sheet, click: **Extensions → Apps Script**

---

### 2️⃣ Fix the Menu (Remove "Build Sheets")

**In Code.gs file:**

Find this section (around line 50-60):
```javascript
function onOpen() {
  ensurePickedForColumn();
  var ui = SpreadsheetApp.getUi();
  ui.createMenu('Glove Manager')
    .addItem('Build Sheets', 'buildSheets')     ← DELETE THIS LINE
    .addItem('Generate All Reports', 'generateAllReports')
```

**Delete the "Build Sheets" line**, should look like:
```javascript
function onOpen() {
  ensurePickedForColumn();
  var ui = SpreadsheetApp.getUi();
  ui.createMenu('Glove Manager')
    .addItem('Generate All Reports', 'generateAllReports')
```

**Click Save** (💾 icon or Ctrl+S)

---

### 3️⃣ Fix Reclaims Auto Pick List

**Find file named "40-Reclaims" or "Reclaims"**

Find this line (around line 31):
```javascript
function updateReclaimsSheet() {
```

**Change to:**
```javascript
function updateReclaimsSheet_INCOMPLETE_DEPRECATED() {
```

**Click Save** (💾 icon or Ctrl+S)

---

### 4️⃣ Test the Fixes

1. **Close Apps Script editor**
2. **Refresh your Google Sheet** (F5 or Ctrl+R)
3. **Check menu**: Click "Glove Manager" - should NOT see "Build Sheets"
4. **Run**: Glove Manager → Generate All Reports
5. **Wait** for completion message
6. **Go to Reclaims sheet**
7. **Look at row 32** (Jesse Lockett):
   - Should now show Pick List Item # with a number
   - Should show "In Stock ✅"

---

## ✅ Done!

Both issues should now be fixed:
- ✅ Menu no longer shows "Build Sheets"
- ✅ Jesse Lockett shows proper pick list item

---

## Still Not Working?

### If menu still shows "Build Sheets":
- Hard refresh: **Ctrl+Shift+R**
- Or open sheet in **incognito mode**

### If Reclaims still shows "Need to Purchase":
- Make sure you **saved** the 40-Reclaims.gs file
- Make sure you **ran "Generate All Reports"** after saving
- Check Apps Script execution log for errors

---

*Quick fix guide - January 8, 2026*

