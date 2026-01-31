# Testing Guide: Phase 2.1 - ToDoSchedule using Task Metadata

**Date:** January 31, 2026  
**Change:** ToDoSchedule.html now uses `getTasksWithMetadata()` instead of `getScheduleTasks()`  
**Status:** ✅ Deployed and ready to test

---

## What Changed

**Before (Phase 1):**
- ToDoSchedule called `google.script.run.getScheduleTasks()`
- Returned simple array of tasks
- Read from To Do List sheet

**After (Phase 2.1):**
- ToDoSchedule calls `google.script.run.getTasksWithMetadata()`
- Returns object: `{tasks: [...], lastGenerated: date, totalTasks: number}`
- Reads from Task Metadata + source sheets
- Better error handling for missing/empty metadata

---

## How to Test

### Step 1: Refresh Your Spreadsheet
1. Close any open ToDoSchedule dialogs
2. **Hard refresh:** `Ctrl + Shift + R` (or `Cmd + Shift + R`)
3. Wait for spreadsheet to fully reload (10-15 seconds)

**⚠️ IMPORTANT - If Menu Item Not Showing:**
If you don't see "Tasks & Calendar" in the menu, the menu needs to be refreshed:
- **Best fix:** Close the spreadsheet tab completely, wait 10 seconds, then reopen it
- **Alternative:** See MENU_FIX_TasksCalendar.md for detailed solutions
- The menu item DOES exist in the code, it just needs Google Sheets to reload the menu

### Step 2: Open Tasks & Calendar Dialog
1. Click **Glove Manager** → **📋 Tasks & Calendar**
2. Wait for dialog to open (5-10 seconds)
3. **Watch for:** Loading indicator, then tasks appear

### Step 3: Test All 4 Tabs

#### Tab 1: 📅 Calendar
**What to check:**
- [ ] Calendar displays with current month
- [ ] Tasks show on their scheduled dates
- [ ] Can click on dates to see task details
- [ ] Task dots show correct priority colors (red/yellow/green)
- [ ] "My Tasks" (tasks in My Checklist) show in blue

**Expected:** Calendar should look exactly the same as before

#### Tab 2: 📋 Task List  
**What to check:**
- [ ] All tasks display in list format
- [ ] Tasks show employee, location, type, due date
- [ ] Can filter by location
- [ ] Can change scheduled dates
- [ ] Priority colors showing (red/yellow/green borders)

**Expected:** Task list should function identically

#### Tab 3: ✓ My Checklist
**What to check:**
- [ ] Personal checklist items display
- [ ] Tasks grouped by category
- [ ] Can complete tasks (checkbox)
- [ ] Can send SMS notifications
- [ ] Can register for classes
- [ ] Badge shows count of items

**Expected:** Checklist should work exactly as before

#### Tab 4: 🔴 Expiring Certs
**What to check:**
- [ ] Certification tasks display
- [ ] Shows employee, cert type, expiration date
- [ ] Color-coded by urgency (overdue red, due soon orange)
- [ ] Can send notifications
- [ ] Can schedule classes

**Expected:** Cert tracking should function normally

### Step 4: Verify Data Accuracy

Pick 2-3 tasks and verify:
1. **Compare with Glove Swaps sheet:**
   - Employee name matches
   - Due date matches (Change Out Date column)
   - Location correct

2. **Compare with Task Metadata sheet:**
   - Scheduled date matches (if set)
   - Status shows correctly
   - Phone number populated

---

## Success Criteria

✅ **All 4 tabs load without errors**  
✅ **Tasks display correctly in each tab**  
✅ **Data matches source sheets**  
✅ **All interactive features work** (change dates, complete tasks, etc.)  
✅ **No console errors** (check browser DevTools)

---

## If Something Goes Wrong

### Scenario A: "Task Metadata Not Found" Warning

**Message:**
```
Task Metadata Not Found
Please run Glove Manager → Schedule & To-Do → Generate Task Metadata first.
```

**Solution:**
1. Close the dialog
2. Run: **Glove Manager** → **Schedule & To-Do** → **🎯 Generate Task Metadata**
3. Wait for success message
4. Reopen Tasks & Calendar dialog

---

### Scenario B: "Task Metadata Empty" Warning

**Message:**
```
Task Metadata Empty
Please run Glove Manager → Schedule & To-Do → Generate Task Metadata to populate data.
```

**Solution:**
- Same as Scenario A - run Generate Task Metadata

---

### Scenario C: Dialog Loads But No Tasks Show

**Possible Causes:**
1. Task Metadata sheet has no data
2. All tasks are filtered out
3. Data loading issue

**Debug Steps:**
1. Check Task Metadata sheet - does it have data rows?
2. Check browser console for errors (F12 → Console tab)
3. Try removing filters in Task List tab
4. Try regenerating metadata

**What to check:**
- Open browser DevTools (F12)
- Go to Console tab
- Look for error messages starting with `loadTasks:`
- Send me the error messages

---

### Scenario D: Tasks Show But Data Looks Wrong

**Examples:**
- Wrong due dates
- Wrong locations
- Missing phone numbers

**Solution:**
1. First verify: Task Metadata sheet has correct data
2. If metadata wrong: Regenerate it
3. If metadata correct but dialog wrong: Report which specific data is incorrect

---

## How to Check Console for Errors

1. **Open dialog:** Tasks & Calendar
2. **Open DevTools:** Press `F12` (Windows) or `Cmd+Option+I` (Mac)
3. **Go to Console tab**
4. **Look for messages:**
   ```
   loadTasks: Starting (using Task Metadata)...
   loadTasks: Received data: {tasks: Array(29), lastGenerated: ..., totalTasks: 29}
   loadTasks: Total tasks loaded: 29
   ```

**If you see errors:**
- Red text = errors
- Yellow text = warnings
- Copy and send to me

---

## Expected Console Output (Normal)

```
loadTasks: Starting (using Task Metadata)...
loadTasks: Received data: {tasks: Array(29), lastGenerated: "2026-01-31", totalTasks: 29}
loadTasks: Total tasks loaded: 29
loadTasks: Built phone map with 74 entries
loadTasks: renderTasks completed
loadTasks: renderCalendar completed
loadTasks: renderPersonalChecklist completed
```

**Key things:**
- "using Task Metadata" confirms new architecture
- "Received data" shows object with tasks array
- All render functions complete without errors

---

## What to Report Back

After testing, please tell me:

### ✅ If Everything Works:
"All 4 tabs working! Tasks loading correctly from Task Metadata."

### ⚠️ If Partial Issues:
"Calendar and Task List work, but My Checklist has issue: [describe]"

### ❌ If Major Problems:
"Dialog shows error: [exact error message]"

**Include:**
- Which tabs work / don't work
- Any error messages (exact text)
- Console errors (if you can check)
- Screenshots if helpful

---

## Why This Matters

This is a **critical milestone**:
- ✅ We've moved from old To Do List architecture
- ✅ Now using new Task Metadata infrastructure
- ✅ Foundation for all future Phase 2+ work

If this works, we can:
- Continue removing old To Do List dependencies
- Implement task state updates
- Move to Phase 3 (state management)

---

## Quick Test Checklist

- [ ] Dialog opens without errors
- [ ] Calendar tab shows tasks
- [ ] Task List tab shows tasks
- [ ] My Checklist tab shows items
- [ ] Expiring Certs tab shows certs
- [ ] Can change scheduled dates
- [ ] Can complete tasks
- [ ] Data matches source sheets

---

**Ready to Test!** 🚀

1. Refresh spreadsheet
2. Open Tasks & Calendar
3. Check all 4 tabs
4. Report back!

If everything works, we'll continue with Phase 2.2-2.7!
