# Fix: Safety Compliance Task Consolidation and Date Display

**Date:** February 9, 2026  
**Issue:** Multiple separate tasks were being created for each missing item instead of ONE consolidated task per crew/week. Due dates showed today's date instead of actual report dates.

## Problems Identified

1. **Too Many Tasks** - Ben Lapka had 6+ separate tasks when he should have 1 task combining all missing items
2. **Wrong Due Dates** - All tasks showed "Due: 2/9/2026" (today) instead of actual report dates
3. **Missing Function** - `createMissingReportTasks()` was being called but didn't exist
4. **Incomplete SMS** - SMS messages had blank dates and didn't list specific missing items

## Solution Implemented

### 1. Created `createMissingReportTasks()` Function
**File:** `src/88-SafetyReports.gs` (added after `openComplianceSheet()`)

**What it does:**
- Creates **ONE task per crew/week** combining all missing items
- Sets due date to the **Saturday of the week** (week end date)
- Stores all missing dates in the notes field
- Prevents duplicate tasks

**Task Structure:**
```javascript
{
  TaskID: "SafetyCompliance_013-26_2026-02-02",
  TaskType: "Missing Safety Report",
  ItemType: "JHA + Weekly Meeting + Monthly Checklist",
  Employee: "Benjamin Lapka",
  DueDate: "02/08/2026", // Saturday of the week
  Notes: "Missing JHA: 02/02/2026, 02/03/2026, 02/04/2026, 02/05/2026; Missing Weekly Safety Meeting for week of 02/02/2026; Missing Monthly Checklist",
  IsOffice: true // Phone call task
}
```

**Key Logic:**
- Checks JHA status for Mon-Fri (skips Sun/Sat)
- Calculates actual dates for each missing JHA
- Checks Weekly Meeting status
- Checks Monthly Checklist status
- Combines all into one task with detailed notes

### 2. Updated SMS Message Builder
**File:** `src/88-SafetyReports.gs` - `buildMissingSafetyReportSmsMessage()`

**New Logic:**
- Parses notes to extract all missing items and dates
- Detects if entire week is missing vs. specific days
- Lists specific dates when 3 or fewer items missing
- Summarizes as "X days" when more than 3 items

**Example Messages:**

**Entire Week Missing:**
```
We did not receive JHAs or Weekly Safety Meeting from your crew for the entire week of 02/02/2026. This is just a reminder not to miss them this week. Was there an issue turning them in that you need help with?
```

**Specific Days Missing:**
```
We did not receive JHAs or Weekly Safety Meeting from your crew for the week of 02/02/2026. Here are the items we are missing: JHA - 02/02/2026, 02/04/2026. Safety Meeting - 02/05/2026. This is just a reminder not to miss them this week. Was there an issue turning them in that you need help with?
```

### 3. Updated Due Date Display
**File:** `src/ToDoSchedule.html` - `renderTaskRow()` function

**New Display Logic:**
- Parses notes field to extract missing items
- Shows summary of missing items instead of just a due date

**Display Format:**
- Full week: "JHA: Full week, Meeting: 02/08/2026"
- Specific days (2 or fewer): "JHA: 02/02/2026, 02/04/2026, Meeting: 02/08/2026"
- Multiple days (3+): "JHA: 4 days, Meeting: 02/08/2026, Checklist"

**Color Coding:**
- Red (#d32f2f) if overdue
- Gray (#5f6368) if current/future

## Data Structure Changes

### Task Metadata Format
```
TaskID: SafetyCompliance_[JobNumber]_[WeekStartDate]
Example: SafetyCompliance_013-26_2026-02-02

SourceSheet: "Safety Compliance"
SourceRow: (empty)
Employee: Foreman name
TaskType: "Missing Safety Report"
ItemType: "JHA" OR "Weekly Meeting" OR "JHA + Weekly Meeting + Monthly Checklist"
DueDate: Saturday of the week (e.g., 02/08/2026)
Notes: "Missing JHA: 02/02/2026, 02/03/2026; Missing Weekly Safety Meeting for week of 02/02/2026"
IsOffice: TRUE (phone call task)
```

### Notes Field Format
```
Missing JHA: [date1], [date2], [date3]; Missing Weekly Safety Meeting for week of [weekStart]; Missing Monthly Checklist
```

## Testing Steps

1. **Delete Old Tasks**
   - Open Task Metadata sheet
   - Delete all rows where TaskType = "Missing Safety Report"
   - Save the sheet

2. **Process Safety Emails**
   - Glove Manager → 🛡️ Safety Reports → 📥 Process Safety Emails
   - Select appropriate date range
   - Click "Process"
   - System will run compliance calculation and create new consolidated tasks

3. **Verify in Task List**
   - Open: Glove Manager → Schedule & To-Do → 📅 Tasks & Calendar
   - Click **Task List** tab
   - Find Elliston location
   - Expand Benjamin Lapka foreman group
   - Should see **ONE** Safety Compliance task showing:
     - **Employee:** Benjamin Lapka
     - **Details:** "JHA: Full week, Meeting: 02/08/2026, Checklist" (or similar)
     - Only ONE row instead of 6+ separate rows

4. **Test SMS Message**
   - Click the 💬 SMS button on the task
   - Verify message shows specific missing dates
   - Check formatting matches examples above

## Expected Results

### Before
```
📍 Elliston (6 tasks)
  👤 Benjamin Lapka (6 tasks)
    🛡️ Safety Compliance (6)
      ⚠️ Missing: JHA
      Due: 2/9/2026
      
      ⚠️ Missing: JHA
      Due: 2/9/2026
      
      ⚠️ Missing: JHA
      Due: 2/9/2026
      
      (... 3 more similar tasks)
```

### After
```
📍 Elliston (1 task)
  👤 Benjamin Lapka (1 task)
    🛡️ Safety Compliance (1)
      ⚠️ Missing: JHA + Weekly Meeting + Monthly Checklist
      📋 Safety Compliance
      👤 Benjamin Lapka
          JHA: 4 days, Meeting: 02/08/2026, Checklist
```

## Files Modified

1. **src/88-SafetyReports.gs** (~200 lines added)
   - Added `createMissingReportTasks()` function
   - Rewrote `buildMissingSafetyReportSmsMessage()` function

2. **src/ToDoSchedule.html** (~30 lines modified)
   - Updated due date display logic in `renderTaskRow()`
   - Parses notes to show summary of missing items

## Deployment

✅ Successfully deployed via `.\push.bat` on February 9, 2026
- All 50 files pushed
- No syntax errors
- Warnings are pre-existing

## Important Notes

- **One Task Per Crew/Week:** System now creates a single consolidated task
- **Week End Due Date:** Due date is set to Saturday (last day of work week)
- **Detailed Notes:** All specific dates stored in notes field for SMS
- **Phone Task:** Tasks marked as IsOffice = TRUE (no travel required)
- **Duplicate Prevention:** Uses TaskID format to prevent duplicates
- **Auto-Creation:** Tasks created automatically when compliance is calculated after Saturday deadline

## Next Steps

1. Delete existing duplicate tasks from Task Metadata
2. Run "Process Safety Emails" to regenerate clean consolidated tasks
3. Verify Task List shows one task per crew/week
4. Test SMS messages have correct dates

## Related Documentation

- `FIX_MISSING_SAFETY_REPORTS_NOT_SHOWING.md` - Original collection fix
- `FIX_SAFETY_COMPLIANCE_CATEGORY.md` - Category and display fix
- `SAFETY_COMPLIANCE_TRACKING.md` - System overview

