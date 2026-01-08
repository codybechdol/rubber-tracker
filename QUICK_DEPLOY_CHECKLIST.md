# 🚀 QUICK DEPLOYMENT CHECKLIST

## Current Situation
Your swap sheet output shows Waco Worts is still getting "Need to Purchase ❌", which means:
- ✅ Local code is fixed
- ❌ Google Apps Script is still running OLD code
- ⏳ Need to deploy the updated code

---

## ⚡ 5-Minute Deployment

### Step 1: Open Apps Script Editor
```
1. Open your Rubber Tracker spreadsheet
2. Click: Extensions → Apps Script
```

### Step 2: Update the File
```
3. In left sidebar, click: 30-SwapGeneration.gs
4. Select ALL text (Ctrl+A)
5. Delete it
6. Open local file: C:\Users\codyb\WebstormProjects\Rubber Tracker\src\30-SwapGeneration.gs
7. Copy ALL text (Ctrl+A, Ctrl+C)
8. Paste into Apps Script (Ctrl+V)
9. Click Save icon 💾 (or Ctrl+S)
10. Wait for "Saved" message
```

### Step 3: Test
```
11. Go back to your spreadsheet
12. Click: Glove Manager → Generate All Reports
13. Open Sleeve Swaps sheet
14. Find Waco Worts row
```

### Step 4: Verify ✅
Expected result:
```
OLD: Waco Worts	...	—	Need to Purchase ❌
NEW: Waco Worts	...	104	In Stock ✅
```

---

## Checklist

- [ ] Opened Apps Script Editor
- [ ] Found 30-SwapGeneration.gs file
- [ ] Deleted old content
- [ ] Pasted new content from local file
- [ ] Saved (saw "Saved" confirmation)
- [ ] Ran "Generate All Reports"
- [ ] Waco Worts shows "In Stock ✅" with item number 104 or 2050

---

## If It Doesn't Work

1. **Hard Refresh**: Press Ctrl+Shift+R in Google Sheets
2. **Check Deployment**: Look at line 15 in Apps Script - should see `function normalizeSleeveSize`
3. **Run Again**: Try running "Generate All Reports" one more time
4. **Clear Cache**: Close spreadsheet completely and reopen

---

## Success Indicators

✅ Waco Worts: Item 104 or 2050, "In Stock ✅"
✅ Chandler Reel: Also should have an item assigned (he has "XL" too)
✅ No "Need to Purchase" for employees with available items

---

**Need help?** Check `DEPLOYMENT_INSTRUCTIONS.md` for detailed instructions with troubleshooting.

