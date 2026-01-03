# Deploy Split Files to Apps Script

**The refactored files exist in Git but need to be deployed to Apps Script**

---

## 🚨 Critical Fix Applied

✅ **SCHEMA error fixed!** - Removed remaining SCHEMA references from Code.gs

The `ReferenceError: SCHEMA is not defined` error has been resolved. You need to deploy the updated Code.gs to Apps Script.

---

## 📂 Files That Need Deployment

These files are in your Git repo but not yet in Apps Script:

1. ✅ `00-Constants.gs` (134 lines)
2. ✅ `01-Utilities.gs` (91 lines)
3. ✅ `10-Menu.gs` (129 lines)
4. ✅ `21-ChangeOutDate.gs` (221 lines)
5. ✅ `90-Backup.gs` (110 lines)
6. ✅ `Code.gs` (updated - SCHEMA references removed)

---

## 🚀 Deployment Methods

### Method 1: Using Clasp (Automated)

```powershell
# From project root
cd "C:\Users\codyb\WebstormProjects\Rubber Tracker"

# Push all files to Apps Script
npx @google/clasp push
```

### Method 2: Manual Copy-Paste (Reliable)

1. **Open Apps Script Editor**
   - Go to your Google Sheet
   - Click **Extensions → Apps Script**

2. **For Each New File** (00-Constants.gs, 01-Utilities.gs, 10-Menu.gs, 21-ChangeOutDate.gs, 90-Backup.gs):
   
   a. Click **➕** (plus icon) next to "Files"
   b. Select **Script**
   c. Name it exactly (e.g., `00-Constants`)
   d. Open the file in your local editor (VS Code/WebStorm)
   e. Copy ALL content
   f. Paste into Apps Script
   g. Click **Save** (Ctrl+S)

3. **Update Code.gs**:
   - Open `Code.gs` in Apps Script
   - Open `src/Code.gs` in your local editor
   - **Copy ALL content** from local file
   - **Paste into Apps Script** (replace everything)
   - Click **Save** (Ctrl+S)

---

## ✅ Verification Steps

After deploying, verify:

1. **Files Panel** (left sidebar in Apps Script):
   ```
   ✅ 00-Constants.gs
   ✅ 01-Utilities.gs
   ✅ 10-Menu.gs
   ✅ 21-ChangeOutDate.gs
   ✅ 90-Backup.gs
   ✅ Code.gs
   ✅ Dashboard.html
   ✅ TestRunner.gs
   ```

2. **Test Generate All Reports**:
   - Go to Google Sheet
   - Click **Glove Manager → Generate All Reports**
   - Should work WITHOUT the SCHEMA error
   - Should generate all reports successfully

3. **Test Menu**:
   - Close and reopen sheet
   - Verify **Glove Manager** menu appears
   - All items and submenus present

---

## 🐛 If Clasp Doesn't Work

**Problem**: Clasp might not be configured or authenticated

**Solution**: Use Manual Method (Method 2 above)

**Why Manual is Better**:
- ✅ More reliable
- ✅ Can see exactly what's deployed
- ✅ No authentication issues
- ✅ Direct control

---

## 📝 Quick Copy-Paste Guide

### File Order (for manual deployment):

1. **00-Constants.gs** → Copy from `src/00-Constants.gs`
2. **01-Utilities.gs** → Copy from `src/01-Utilities.gs`
3. **10-Menu.gs** → Copy from `src/10-Menu.gs`
4. **21-ChangeOutDate.gs** → Copy from `src/21-ChangeOutDate.gs`
5. **90-Backup.gs** → Copy from `src/90-Backup.gs`
6. **Code.gs** → Copy from `src/Code.gs` (REPLACE existing)

**Time needed**: ~5 minutes

---

## ⚠️ Important Notes

1. **Don't delete Code.gs** - Update it, don't delete
2. **Save each file** - Click Save or Ctrl+S after pasting
3. **Keep exact names** - Use `00-Constants` not `00-Constants.gs` in Apps Script
4. **Test after deployment** - Run Generate All Reports to verify

---

## 🎯 Expected Result

After deployment:

✅ **Generate All Reports works** (no SCHEMA error)  
✅ **All menu items function**  
✅ **Backup creates successfully**  
✅ **Change out dates auto-update**  
✅ **Fix All Change Out Dates works**  

---

## 🚨 What Got Fixed

**Before**:
```
Error: ReferenceError: SCHEMA is not defined
```

**After** (with updated Code.gs):
```
✅ All reports generate successfully
```

**Changed**:
- Removed `SCHEMA = null;` from line 537
- Removed `if (SCHEMA && SCHEMA[swapSheetName]) { delete SCHEMA[swapSheetName]; }` from line 2478

---

## 📞 Need Help?

If deployment fails:
1. Check you're in correct Apps Script project (scriptId: `12U9JReRFpWfYVAx7jLuK7n-RyIT2Gb28I_hBKzm-vsh1bgbxRZFN0Doq`)
2. Try manual copy-paste method
3. Report any error messages from Apps Script

---

**After deployment, test using MENU_TESTING_CHECKLIST.md**

