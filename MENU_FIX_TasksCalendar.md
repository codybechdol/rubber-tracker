# Quick Fix: Tasks & Calendar Menu Item Not Showing

**Issue:** Menu shows "Schedule & To-Do" but "Tasks & Calendar" item is missing inside  
**Cause:** Menu needs to be refreshed after deployment  
**Solution:** Use Quick Actions or force menu reload

---

## 🎯 FASTEST Solution: Use Quick Actions (Works Immediately!)

**No waiting for menu refresh - this works right now:**

1. Click **Glove Manager** → **📱 Quick Actions**
2. In the sidebar (right side), under **"Step 2: Organize..."**
3. Click the **"📅 Schedule"** button
4. This opens Tasks & Calendar directly!

**This bypasses the menu issue completely and works immediately.**

---

## Solution 1: Close and Reopen Spreadsheet (For Menu Fix)

1. **Close the entire spreadsheet tab** in your browser
2. **Wait 10 seconds**
3. **Reopen** from Google Drive or recent files
4. **Check menu:** Glove Manager → Schedule & To-Do → 📋 Tasks & Calendar should be there

---

## Solution 2: Hard Refresh (If Solution 1 doesn't work)

1. **Hard refresh:** `Ctrl + Shift + R` (Windows) or `Cmd + Shift + R` (Mac)
2. **Wait** for spreadsheet to reload (15-20 seconds)
3. **Check menu:** Glove Manager → Schedule & To-Do

---

## Solution 3: Run onOpen Manually (Advanced)

If the above don't work:

1. Click **Extensions** → **Apps Script**
2. In the editor, find the function dropdown (top center)
3. Select **`onOpen`** from the dropdown
4. Click the **Run** button (▶ play icon)
5. Wait for it to complete
6. Go back to your spreadsheet
7. Menu should be refreshed

---

## Verify It's There

The menu structure should be:

```
Glove Manager
├─ Generate All Reports
├─ Quick Actions
├─ ...
└─ 📅 Schedule & To-Do
   ├─ 📋 Tasks & Calendar  ← THIS IS WHAT YOU'RE LOOKING FOR
   ├─ 🗺️ Trip Planner
   ├─ ⚙️ Schedule Config
   ├─ ───────────
   ├─ 🎯 Generate Task Metadata
   ├─ 🎯 Generate Smart Schedule
   └─ ...
```

---

## Why This Happens

Google Sheets caches menu items aggressively. After deployment:
- New menu items can take 30-60 seconds to appear
- Sometimes requires closing/reopening the spreadsheet
- The `onOpen()` trigger only runs when the sheet opens

---

## If Still Not Showing

**Check deployment succeeded:**
1. The last push.bat showed "SUCCESS! Files pushed to Apps Script"
2. This means the code IS deployed
3. The menu just needs to refresh

**Confirm the function exists:**
1. Extensions → Apps Script
2. Search for `showToDoSchedule` (Ctrl+F)
3. Should find it at line ~62 in Code.gs

**The menu item exists at line 4619 in Code.gs**

---

## Alternative: Use Quick Actions Instead

While waiting for menu to refresh, you can access it from:

**Quick Actions Sidebar:**
1. Click **Glove Manager** → **📱 Quick Actions**
2. Look in the sidebar (right side)
3. Under **"Workflow Steps"** → **Step 2**
4. Should see **"Schedule"** button
5. Click it to open Tasks & Calendar

---

**Try Solution 1 first (close and reopen spreadsheet) - this works 95% of the time!**
