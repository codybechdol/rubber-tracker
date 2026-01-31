# Fix: Task Metadata Preservation - January 31, 2026

## 🐛 Bug Description

**Issue:** When you manually edited scheduled dates and times in the Tasks & Calendar dialog, those changes were lost when you regenerated Task Metadata.

**Root Cause:** The `generateTaskMetadata()` function was checking for existing tasks and **skipping them entirely** to avoid duplicates. This meant:
- Your manual edits (scheduled dates/times) stayed in the metadata sheet ✅
- BUT source-derived data (employee names, locations, due dates) never got updated ❌
- No way to refresh stale data without losing your scheduling work

---

## ✅ Fix Applied

Modified `generateTaskMetadata()` in `src/Code.gs` to use **smart update logic**:

### Before (Lines 6502-6540):
```javascript
// Old behavior:
if (existingKeys[recKey]) {
  skippedCount++;  // ❌ Skip entirely - no updates!
} else {
  newRecords.push(rec);
}
```

### After (Lines 6500-6628):
```javascript
// New behavior:
if (existingMap[recKey]) {
  // ✅ UPDATE existing record
  // Preserve columns L-X (user-edited scheduling state)
  // Update columns A-K (source-derived data) and Y (LastModified)
  updateRecords.push({...});
} else {
  // ✅ INSERT new record
  newRecords.push(rec);
}
```

---

## 📋 What Gets Preserved vs Updated

### ✅ PRESERVED (User Edits):
- **Column L:** ScheduledDate - Your manual schedule
- **Column M:** StartTime - When task starts
- **Column N:** EndTime - When task ends
- **Column O:** Status - Pending/Scheduled/Complete
- **Column P:** NotifiedDate - SMS notification tracking
- **Column Q:** ScheduledClassDate - Class registration date
- **Column R:** ClassType - Type of class scheduled
- **Column S:** IsOffice - Office work flag
- **Column T:** IsRegistered - Registration status
- **Column U:** IsDeclined - Declined status
- **Column V:** CompletedDate - When task was completed
- **Column W:** Notes - User notes (preserved if exist)
- **Column X:** CreatedDate - Original creation date

### 🔄 UPDATED (Source Data):
- **Column A:** TaskID - Regenerated
- **Column B:** SourceSheet - Source sheet name
- **Column C:** SourceRow - Row in source sheet
- **Column D:** Employee - Current employee name from source
- **Column E:** TaskType - Current task type from source
- **Column F:** ItemType - Current item type from source
- **Column G:** CurrentItem - Current item number from source
- **Column H:** Location - Current location from Employees sheet
- **Column I:** Foreman - Current foreman from source
- **Column J:** PhoneNumber - Current phone from Employees sheet
- **Column K:** DueDate - Current due date from source (cert expiration, changeout date)
- **Column Y:** LastModified - New timestamp

---

## 🧪 Testing Instructions

### Test 1: Manual Edits Preserved
1. **Open Tasks & Calendar dialog**
   - Menu: Glove Manager → Schedule & To-Do → 📅 Tasks & Calendar
2. **Schedule a task for future date**
   - Find a task in Task List tab
   - Change scheduled date to 3 days from now
   - Set start time to 9:00 AM
   - Set end time to 11:00 AM
   - Click "💾 Save Changes"
3. **Generate Task Metadata**
   - Menu: Glove Manager → Schedule & To-Do → Generate Task Metadata
   - Wait for completion message
4. **✅ Verify Edits Preserved**
   - Open Task Metadata sheet
   - Find your task (search by employee name)
   - Check Column L (ScheduledDate) - should still be your future date
   - Check Column M (StartTime) - should still be 9:00 AM
   - Check Column N (EndTime) - should still be 11:00 AM

### Test 2: Source Data Updates
1. **Change employee location**
   - Open Employees sheet
   - Find an employee with a pending glove swap
   - Change their Location (e.g., Helena → Bozeman)
2. **Generate Task Metadata**
   - Menu: Glove Manager → Schedule & To-Do → Generate Task Metadata
3. **✅ Verify Location Updated**
   - Open Task Metadata sheet
   - Find the employee's swap task
   - Column H (Location) should show new location (Bozeman)
   - If you had scheduled this task, Column L should still have your date

### Test 3: Completion Status Preserved
1. **Mark a task complete**
   - Open Tasks & Calendar dialog
   - Mark a cert renewal task complete
   - Enter new expiration date
2. **Generate Task Metadata**
   - Run Generate Task Metadata again
3. **✅ Verify Completion Preserved**
   - Open Task Metadata sheet
   - Find the completed task
   - Column O (Status) should still say "Complete"
   - Column V (CompletedDate) should still have completion date
   - Task should NOT reappear in Tasks & Calendar dialog

### Test 4: New Tasks Added
1. **Add new glove swap**
   - Open Gloves sheet
   - Assign a glove to a new employee (set Date Assigned)
2. **Generate Task Metadata**
3. **✅ Verify New Task Created**
   - Open Task Metadata sheet
   - New row should exist for the swap
   - Should have all source data (employee, location, due date)
   - ScheduledDate should be empty (not scheduled yet)

---

## 📊 Success Message

After running Generate Task Metadata, you'll now see:

```
✅ Task Metadata Generated!

📊 Statistics:
• Total tasks found: 45
• New metadata records: 8
• Updated existing records: 37

📍 Sources:
• Glove Swaps: 15
• Sleeve Swaps: 8
• Expiring Certs: 12
• Training Tracking: 5
• Manual Tasks: 5

✅ Task Metadata sheet is ready for scheduling!

💡 Note: Existing tasks were updated with fresh source data while preserving 
your scheduled dates, times, and completion status.
```

---

## 🚀 Deployment

```powershell
cd "C:\Users\codyb\WebstormProjects\Rubber Tracker"
.\push.bat
```

---

## 📝 Commit Message

```
Fix: Preserve manual edits when regenerating Task Metadata

PROBLEM:
- When user edited scheduled dates/times in Tasks & Calendar dialog
- Then regenerated Task Metadata
- Manual edits were lost OR source data never updated

ROOT CAUSE:
- generateTaskMetadata() was skipping existing tasks entirely
- No way to refresh stale source data without losing scheduling work

SOLUTION:
- Changed from "skip duplicates" to "smart update"
- Now UPDATES existing tasks with two-phase logic:
  - PRESERVE user edits (columns L-X): dates, times, status, completion
  - UPDATE source data (columns A-K, Y): employee, location, due date
- Success message now shows "Updated existing records" count

BENEFITS:
- Can safely regenerate metadata to get latest source data
- Scheduled dates/times are never lost
- Completion status is preserved
- Employee location/phone changes flow through
- Due date changes from source sheets are reflected

FILES CHANGED:
- src/Code.gs - generateTaskMetadata() function (lines 6500-6628)

TESTING:
- See FIX_METADATA_PRESERVATION.md for 4 test scenarios
```

---

## 🎯 Use Cases

### Use Case 1: Employee Changed Crews
**Scenario:** Employee moved from Bozeman crew to Great Falls crew
- You already scheduled their glove swap for next Tuesday in Bozeman
- Generate Task Metadata picks up new location (Great Falls)
- **Result:** Location updates to Great Falls, scheduled date stays Tuesday
- **Action:** You notice trip is now inefficient, use Trip Planner to reschedule

### Use Case 2: Cert Expiration Date Extended
**Scenario:** Employee renewed cert early, expiration pushed out 1 year
- You had scheduled renewal task for this week
- Generate Task Metadata picks up new expiration (1 year out)
- **Result:** Due date updates, but scheduled date stays this week
- **Action:** You can unschedule or delete the task since it's no longer urgent

### Use Case 3: Weekly Refresh Workflow
**Scenario:** Every Monday morning, you regenerate metadata
- Updates all employee locations/phones from Employees sheet
- Updates due dates from source sheets (changeout dates, cert expirations)
- Preserves all your scheduling work from previous week
- **Result:** Fresh data without losing your schedule

---

## 🔍 Related Files

- **PHASE2_PROGRESS.md** - Current phase progress tracker
- **IMPLEMENTATION_TRACKER.md** - Overall Option A implementation plan
- **PHASE1_COMPLETE.md** - Phase 1 completion summary
- **.github/copilot-instructions.md** - Project architecture documentation

---

## ✅ Status

**Fixed:** January 31, 2026  
**Tested:** Pending user testing  
**Deployed:** Pending .\push.bat  

---

## 📖 Phase Context

This fix is part of **Phase 2: Update Dialogs to Use Task Metadata**

### Phase 2 Progress:
- [x] 2.1: Update `getScheduleTasks()` to call `getTasksWithMetadata()` ✅
- [x] 2.2: Remove dual-path logic (To Do List fallback) ✅
- [x] 2.3: Update task object structure (add metadataRow reference) ✅
- [x] 2.4: Fix metadata preservation on regeneration ✅ **← THIS FIX**
- [ ] 2.5: User testing of full workflow

### Next: Phase 3
Once Phase 2 testing is complete, move to Phase 3: Task State Updates
- Already implemented all Phase 3 functions
- Need to test state updates persist correctly
