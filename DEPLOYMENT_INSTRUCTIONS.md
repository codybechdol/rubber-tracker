# DEPLOYMENT INSTRUCTIONS - Sleeve Size Normalization Fix

## Current Status
✅ **Local files are updated and ready**
❌ **Google Apps Script has NOT been updated yet** - still running old code

## Evidence
Your latest swap sheet output shows:
```
Waco Worts	108	X-Large	2/4/2025	2/4/2026	30	—	Need to Purchase ❌
```

This confirms the old code is still running (without normalization).

---

## How to Deploy to Google Apps Script

### Method 1: Manual Copy-Paste (Recommended for Single File)

1. **Open Google Sheets**
   - Open your Rubber Tracker spreadsheet

2. **Open Script Editor**
   - Click **Extensions** → **Apps Script**

3. **Find the File**
   - In the left sidebar, click on **30-SwapGeneration.gs**

4. **Replace Content**
   - Select ALL the content in the editor (Ctrl+A)
   - Delete it
   - Open your local file: `C:\Users\codyb\WebstormProjects\Rubber Tracker\src\30-SwapGeneration.gs`
   - Copy ALL content (Ctrl+A, Ctrl+C)
   - Paste into Google Apps Script editor (Ctrl+V)

5. **Save**
   - Click the **Save** icon (💾) or press Ctrl+S
   - Wait for "Saved" confirmation

6. **Deploy the Diagnostic Tool (Optional but Recommended)**
   - In left sidebar, click the **+** next to "Files"
   - Select **Script**
   - Name it: `99-DiagnosticTool`
   - Copy content from `C:\Users\codyb\WebstormProjects\Rubber Tracker\src\99-DiagnosticTool.gs`
   - Paste and Save

7. **Test**
   - Go back to your spreadsheet
   - Run **Glove Manager** → **Generate All Reports**
   - Check Sleeve Swaps sheet - Waco Worts should now show "In Stock ✅"

---

### Method 2: clasp Push (If You Have clasp Configured)

If you have clasp (Google's command-line tool) set up:

```powershell
cd "C:\Users\codyb\WebstormProjects\Rubber Tracker"
clasp push
```

Then refresh your Google Sheets and run the reports.

---

## Expected Result After Deployment

**Before** (current):
```
Waco Worts	108	X-Large	...	—	Need to Purchase ❌
```

**After** (with fix):
```
Waco Worts	108	X-Large	...	104	In Stock ✅
```
or
```
Waco Worts	108	X-Large	...	2050	In Stock ✅
```

---

## Verification Steps

After deployment, verify the fix worked:

1. **Run Reports**
   - In Google Sheets: **Glove Manager** → **Generate All Reports**

2. **Check Sleeve Swaps**
   - Open the "Sleeve Swaps" sheet
   - Find Waco Worts
   - Should show: "104" or "2050" in Pick List Item # column
   - Should show: "In Stock ✅" in Status column

3. **Check Chandler Reel Too**
   - He also has "XL" for sleeve size
   - Should also now match correctly

4. **Run Diagnostic (Optional)**
   - In Apps Script editor, run `diagnosePickListIssue()`
   - View → Logs
   - Should show "✓✓✓ ITEMS ARE AVAILABLE" and list item 104 or 2050

---

## Files That Need Deployment

### Required:
- ✅ `src/30-SwapGeneration.gs` - Contains the normalization fix

### Optional but Recommended:
- ✅ `src/99-DiagnosticTool.gs` - Helps diagnose future issues

### For Reference Only (Don't Deploy):
- ℹ️ `docs/Workflow_and_Sheet_Expectations.md` - Documentation
- ℹ️ `FIX_SLEEVE_SIZE_MATCHING.md` - Fix summary
- ℹ️ `SLEEVE_NORMALIZATION_SUMMARY.md` - This summary

---

## Troubleshooting

### If Still Shows "Need to Purchase" After Deployment:

1. **Clear Cache**
   - In Google Sheets, press Ctrl+Shift+R (hard refresh)
   - Close and reopen the spreadsheet

2. **Verify Deployment**
   - Open Apps Script editor
   - Check line 15-37 of `30-SwapGeneration.gs`
   - Should see `function normalizeSleeveSize(size) {`
   - If not, the deployment didn't work

3. **Check Employee Data**
   - Verify Waco Worts still has "XL" in Sleeve Size column
   - Verify items 104 and 2050 are still "On Shelf" status

4. **Run Diagnostic**
   - Run `diagnosePickListIssue()` function
   - Check logs for detailed matching information

---

## Need Help?

If you encounter issues during deployment, share:
1. Screenshot of the Apps Script editor showing the file list
2. Any error messages
3. The output of running "Generate All Reports"

