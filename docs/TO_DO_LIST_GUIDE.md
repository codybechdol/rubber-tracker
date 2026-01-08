# 📋 To-Do List Sheet - User Guide & Specifications

**Last Updated**: January 7, 2026 (Updated with one-location-per-day scheduling)  
**Module**: Smart Scheduling System  
**Files**: `src/76-SmartScheduling.gs`, `src/75-Scheduling.gs`

---

## 🎯 Purpose

The **To-Do List** sheet is the central scheduling hub that:
1. Shows a **monthly calendar** at the top for visual scheduling
2. Displays **all pending tasks** grouped by location
3. Prioritizes tasks by **due date** (overdue items first)
4. Calculates **drive times** and flags **overnight stays**
5. Schedules **ONE location per day** (no stacking)
6. **Preserves user-edited scheduled dates** on refresh
7. Uses **10-hour workday** (7am-5pm) for overnight calculations

---

## 📊 Sheet Structure

### **Layout Overview**

| Rows | Content |
|------|---------|
| 1-2 | Title: "📅 Monthly Schedule - [Month Year]" |
| 3 | Day headers (Sun, Mon, Tue, etc.) |
| 4-9 | Calendar grid (6 weeks) |
| 10-11 | Instructions and separator |
| 12 | Empty separator |
| 13 | **Column Headers** |
| 14+ | **Task Data** (sorted by location and due date) |

---

## 📅 Calendar Section (Rows 1-12)

### **Features**
- ✅ Displays current month calendar
- ✅ Highlights scheduled visit dates (blue background)
- ✅ Shows notes on hover with visit count
- ✅ Color coding: Yellow = same day, Red = overnight required

### **Calendar Grid**
```
📅 Monthly Schedule - January 2026

Sun   Mon   Tue   Wed   Thu   Fri   Sat
                   1     2     3
 4     5     6     7     8     9    10
11    12    [13]  14    15    16    17
18    19    20    21    22    23    24
25    26    27    28    29    30    31

📊 Use "Generate Monthly Schedule" to auto-schedule crew visits
```

*Note: [13] = Highlighted date with scheduled visits*

---

## 📋 Task Table (Row 13+)

### **Column Definitions**

| Column | Header | Description | Example |
|--------|--------|-------------|---------|
| A | Location Visit | Location indicator with emoji | `📍 Butte` |
| B | Priority | Task urgency level | `High`, `Medium`, `Low` |
| C | Task Type | Category of task | `Swap`, `Training`, `Reclaim` |
| D | Employee/Crew | Person or crew name | `Joe Piazzola` |
| E | Location | Work location | `Butte` |
| F | Current Item | Item being replaced | `1046` |
| G | Pick List Item | New item to deliver | `1043` |
| H | Item Type | Equipment category OR Training topic | `Glove`, `Sleeve`, `Respectful Workplace...` |
| I | Size | Equipment size | `2`, `10` |
| J | Due Date | When task is due | `01/31/2026` |
| K | Days Till Due | Days remaining (negative = overdue) | `-5`, `OVERDUE`, `7` |
| L | Status | Current task status | `Pending`, `Picked - Ready to Deliver` |
| M | Scheduled Date | When visit is planned | `01/13/2026` |
| N | Estimated Time (min) | Task duration | `60` |
| O | Start Location | Trip origin | `Helena` |
| P | End Location | Trip destination | `Butte` |
| Q | Drive Time (min) | One-way travel time | `90` |
| R | Overnight Required | Flag for overnight stay | `TRUE`, `FALSE` |
| S | Completed | Checkbox when done | `☐`, `☑` |

---

## 🔄 Task Types

### **1. Swap Tasks** (from Glove Swaps & Sleeve Swaps sheets)
**Source**: Glove Swaps sheet, Sleeve Swaps sheet

| Field | Value |
|-------|-------|
| Task Type | `Swap` |
| Item Type | `Glove` or `Sleeve` |
| Current Item | Item # being replaced |
| Pick List Item | New item # to deliver |
| Due Date | Change Out Date from swap sheet |
| Status | From swap sheet (Ready For Delivery, etc.) |

**Rules**:
- Only shows items where `Picked` = TRUE (item has been picked)
- Only shows items where `Date Changed` is empty (not yet delivered)
- These are items "Ready For Delivery" that need to be delivered to the employee
- Parses multiple class sections (Class 0, 2, 3)
- Skips location sub-headers (📍 Location)

### **2. Training Tasks** (from Training Tracking sheet)
**Source**: Training Tracking sheet

| Field | Value |
|-------|-------|
| Task Type | `Training` |
| Item Type | Training topic name |
| Employee/Crew | Crew Lead name or Crew # |
| Due Date | Last day of training month (e.g., Jan 31 for January training) |
| Status | From Training Tracking (Pending, Overdue, etc.) |

**Rules**:
- Only shows current month and past months (not future)
- Skips if `Status` = Complete or N/A
- Skips if `Completion Date` is filled
- Due date is calculated as end of the scheduled month

### **3. Reclaim Tasks** (from Reclaims sheet)
**Source**: Reclaims sheet (Class 3 Reclaims and Class 2 Reclaims sections)

| Field | Value |
|-------|-------|
| Task Type | `Reclaim CL3→CL2` or `Reclaim CL2→CL3` |
| Item Type | `Glove` or `Sleeve` |
| Current Item | Item # to reclaim |
| Pick List Item | Replacement item # |
| Due Date | Empty (Reclaims are ASAP) |
| Status | From Reclaims sheet (or "Pending") |
| Priority | Always `High` |

**Rules**:
- **Class 3 Reclaims**: Employee has Class 3 item in non-approved location → needs downgrade to Class 2
- **Class 2 Reclaims**: Employee has Class 2 item in Class 3-only location → needs upgrade to Class 3
- Skips if status shows "Already Has CL2 ✅" or "Already Has CL3 ✅"
- All reclaims are High priority (ASAP)
- Estimated time: 10 minutes per reclaim

---

## 🚗 Drive Time & Overnight Logic

### **Drive Times from Helena**
| Location | Drive Time (min) | Overnight Required |
|----------|------------------|-------------------|
| Helena | 0 | No |
| Ennis | 60 | No (same day possible) |
| Livingston | 60 | Yes* |
| Butte | 90 | Yes |
| Bozeman | 90 | Yes |
| Big Sky | 90 | Yes |
| Great Falls | 90 | Yes |
| Stanford | 120 | Yes |
| Missoula | 120 | Yes |
| Northern Lights (Bonners Ferry, ID) | 420 | Yes |
| South Dakota Dock | 600 | Yes |
| CA Sub (California) | 960 | Yes |

*Overnight determination based on total drive time + visit time*

### **Overnight Logic**
```
IF End Location ≠ Helena AND total trip time > 8 hours THEN
   Overnight Required = TRUE
   Row highlighted RED
ELSE IF End Location ≠ Helena THEN
   Row highlighted YELLOW (long day trip)
ELSE
   Overnight Required = FALSE
```

---

## 🎯 Priority Calculation

Tasks are prioritized as follows:

| Priority | Criteria |
|----------|----------|
| **High** | Overdue (Days Till Due < 0) |
| **High** | Due within 7 days |
| **Medium** | Due within 30 days |
| **Low** | Due more than 30 days out |

### **Sort Order**
1. Locations with overdue tasks first
2. Within location: Overdue tasks first
3. Then by earliest due date
4. Then alphabetically by employee name

---

## 🔧 How to Use

### **Generate Tasks**
1. Menu: **Glove Manager → Schedule → 🎯 Generate Smart Schedule**
   - OR: **Glove Manager → To-Do List → Generate To-Do List** (both do the same thing now)
2. Collects all pending tasks from:
   - Glove Swaps (picked but not delivered)
   - Sleeve Swaps (picked but not delivered)
   - Training Tracking (current month pending training)
   - Reclaims (class changes needed)
3. Groups by location
4. Creates To-Do List with calendar

> **Note**: `Generate To-Do List` and `Generate Smart Schedule` now produce identical results. 
> The old legacy functions have been consolidated into `generateSmartSchedule()` for consistency.

### **Generate Monthly Schedule**
1. Menu: **Glove Manager → Schedule → 📅 Generate Monthly Schedule**
2. Creates Crew Visit Config from To-Do List
3. Calculates visit dates for current month
4. Highlights calendar with scheduled dates
5. Shows summary of visits and overnight stays

### **Mark Task Complete**
1. Select task row
2. Check the "Completed" checkbox (Column S)
3. Or use: **Glove Manager → Schedule → Mark Visit Complete**

---

## ✅ Current Implementation Status

Based on the specifications in `SCHEDULING_IMPLEMENTATION_PLAN.md` and `Workflow_and_Sheet_Expectations.md`:

| Feature | Specified | Implemented | Notes |
|---------|-----------|-------------|-------|
| Calendar at top (rows 1-12) | ✅ | ✅ | Working |
| Day headers | ✅ | ✅ | Sun-Sat |
| Calendar grid | ✅ | ✅ | 6 weeks |
| Month/Year title | ✅ | ✅ | Shows current month |
| Tasks below calendar (row 13+) | ✅ | ✅ | Working |
| Location Visit column | ✅ | ✅ | With emoji |
| Priority column | ✅ | ✅ | High/Medium/Low |
| Task Type column | ✅ | ✅ | Swap/Training |
| Employee/Crew column | ✅ | ✅ | Working |
| Location column | ✅ | ✅ | Working |
| Current Item column | ✅ | ✅ | For swaps |
| Pick List Item column | ✅ | ✅ | For swaps |
| Item Type column | ✅ | ✅ | Glove/Sleeve or Training Topic |
| Size column | ✅ | ✅ | Working |
| Due Date column | ✅ | ✅ | **FIXED** - Now shows dates |
| Days Till Due column | ✅ | ✅ | **FIXED** - Shows OVERDUE or days |
| Status column | ✅ | ✅ | From source sheet |
| Scheduled Date column | ✅ | ✅ | Working |
| Estimated Time column | ✅ | ✅ | In minutes |
| Start Location column | ✅ | ✅ | Helena default |
| End Location column | ✅ | ✅ | Task location |
| Drive Time column | ✅ | ✅ | Correct values |
| Overnight Required column | ✅ | ✅ | TRUE/FALSE |
| Completed column | ✅ | ✅ | Checkbox |
| Calendar highlighting | ✅ | ✅ | Blue for scheduled |
| **Swap Tasks** | ✅ | ✅ | **FIXED** - Shows picked but not delivered |
| **Training Tasks** | ✅ | ✅ | **FIXED** - Now has due dates |
| **Reclaim Tasks** | ✅ | ✅ | **NEW** - CL3→CL2 and CL2→CL3 |
| Row color coding | ✅ | ⚠️ | Partially (needs enhancement) |
| Navigation (prev/next month) | ✅ | ❌ | Not implemented |
| Crew Visit integration | ✅ | ✅ | Via Generate Monthly Schedule |

### **Summary**
- **21/23 features implemented** (91%)
- **Recent Fixes (Jan 7, 2026)**:
  - ✅ Swap tasks now show picked but not delivered items
  - ✅ Training tasks now have Due Date (end of scheduled month)
  - ✅ Only current/past month training shows (not future)
  - ✅ Date parsing fixed for Crew Visit Config
  - ✅ **NEW**: Reclaim tasks now included (CL3→CL2 and CL2→CL3)

---

## 🔧 Recent Bug Fixes (January 7, 2026)

### **1. Swap Tasks Filter Fixed**
**Problem**: Swap tasks were not appearing in To-Do List  
**Root Cause**: Filter was inverted - was skipping picked items instead of including them  
**Fix**: Now ONLY includes items where `Picked=TRUE` AND `Date Changed` is empty (ready for delivery)

### **2. Due Date Empty for Training**
**Problem**: Training tasks had `dueDate: null`  
**Root Cause**: Training Tracking doesn't have a "Due Date" column  
**Fix**: Calculate due date as last day of scheduled month (e.g., January → 01/31/2026)

### **3. Reclaim Tasks Added**
**Problem**: Reclaim tasks were not included in To-Do List  
**Fix**: Added `collectReclaimTasks()` function to collect from Reclaims sheet:
- Class 3 Reclaims (CL3→CL2 downgrades)
- Class 2 Reclaims (CL2→CL3 upgrades)
- Skips items with "Already Has" status
- All reclaims are High priority

### **4. Crew Visit Config Date Parsing**
**Problem**: Dates in Next Visit Date column not being recognized  
**Root Cause**: `instanceof Date` check failed for string dates from sheet  
**Fix**: Now handles Date objects, string dates, and numeric dates

### **5. Function Consolidation**
**Problem**: Multiple `generateToDoList()` functions in different files producing different outputs  
**Root Cause**: Code.gs, 70-ToDoList.gs, and 76-SmartScheduling.gs all had versions  
**Fix**: 
- `generateToDoList()` in 70-ToDoList.gs now calls `generateSmartSchedule()`
- Legacy function in Code.gs renamed to `generateToDoListLegacyCode()`
- Both menu items now produce identical, consistent output

---

## 🔮 Future Enhancements

### **Planned**
1. ❌ Previous/Next month navigation buttons
2. ❌ Row color coding (red = overnight, yellow = same day)
3. ❌ Automatic task completion when swap is processed
4. ❌ Calendar click to filter tasks by date

### **Potential**
- Multi-stop route optimization
- Integration with Google Calendar
- Email reminders for upcoming visits
- Mobile-friendly view

---

## 📁 Related Files

| File | Purpose |
|------|---------|
| `src/76-SmartScheduling.gs` | Main To-Do List generation |
| `src/75-Scheduling.gs` | Crew Visit Config & Monthly Schedule |
| `src/72-ToDoCalendar.gs` | Calendar building functions |
| `docs/SCHEDULING_IMPLEMENTATION_PLAN.md` | Original specifications |

---

## 🐛 Troubleshooting

### **To-Do List is Empty**
- Check if Glove Swaps has pending items
- Check if Sleeve Swaps has pending items
- Check if Training Tracking has pending items
- Verify employees have locations assigned

### **Drive Times are Wrong**
- Update `getDriveTimeMap()` in `76-SmartScheduling.gs`
- Check location spelling matches exactly

### **Calendar Not Highlighting**
- Run "Generate Monthly Schedule" after "Generate Smart Schedule"
- Check Crew Visit Config has dates in current month

---

## 📞 Support

For issues with the To-Do List:
1. Check the execution log in Apps Script
2. Run `debugAutoPopulateCrewVisitConfig()` for diagnostics
3. Review this guide for expected behavior

---

*Documentation created: January 7, 2026*

