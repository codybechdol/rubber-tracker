# Calendar-Based Task Scheduling Implementation

**Date**: January 7, 2026  
**Status**: ✅ IMPLEMENTED  
**Feature**: Calendar with automated task scheduling, route optimization, and overnight stay detection

---

## 🎯 OVERVIEW

Added a comprehensive calendar system to the To-Do List that automatically schedules crew visits, optimizes routes, calculates drive times, and flags overnight stays when the end location is not Helena.

---

## ✅ FEATURES IMPLEMENTED

### 1. Calendar Section in To-Do List
- **Mini calendar display** showing current month (rows 1-12)
- Week view grid with day numbers
- Current day highlighting
- Monthly title with month/year
- Instructions for users

### 2. Enhanced To-Do List Columns
Added 6 new columns:
- **Scheduled Date** - When task is scheduled (date format)
- **Estimated Time (min)** - Duration in minutes
- **Start Location** - Where to start (default: Helena)
- **End Location** - Where task ends
- **Drive Time (min)** - Travel time to location
- **Overnight Required** - Checkbox flagging overnight stays

### 3. Automated Crew Visit Scheduling
- `getScheduledTasksForCurrentMonth()` - Pulls crew visits from Crew Visit Config
- Reads visit frequency (Weekly, Bi-Weekly, Monthly)
- Calculates all visit dates for the month based on last visit date
- Auto-populates task details (job #, location, crew lead, crew size)

### 4. Overnight Stay Detection
- `detectOvernightRequirement()` - Analyzes each task
- Checks if end location ≠ Helena
- Calculates total day time: (drive time × 2) + visit time
- Flags overnight if total time > 8 hours (480 min)
- Hardcoded overnight locations: Kalispell, Missoula, Miles City, Sidney, Glendive

### 5. Route Optimization
- `optimizeMonthlyRoutes()` - Groups visits by date
- `optimizeDailyRoute()` - Orders visits by proximity (drive time from Helena)
- Calculates total drive time (includes return to Helena)
- Calculates total visit time
- Determines if overnight required for the day

### 6. Crew Visit Time Estimation
- `calculateCrewVisitTime()` - Estimates visit duration
- Formula: Base time (15 min) + (5 min × crew size)
- Can be configured or use manual estimates from Crew Visit Config

### 7. Menu Functions
Added 3 new menu items under **Glove Manager → Schedule**:
- **📅 Generate Monthly Schedule** - Auto-schedules all crew visits for current month
- **🔄 Refresh Calendar** - Regenerates To-Do List with updated schedule
- **✅ Mark Visit Complete** - Updates last visit date, calculates next visit, marks task complete

---

## 📋 FILE CHANGES

### Modified Files

**src/70-ToDoList.gs**
- Updated `generateToDoList()` - Added calendar section and 6 new columns
- Updated `clearCompletedTasks()` - Works with new row structure (row 14+ data, column 12 for Completed)
- Added `buildToDoListCalendar()` - Creates mini calendar at top of sheet
- Added `getScheduledTasksForCurrentMonth()` - Fetches crew visit tasks
- Added `detectOvernightRequirement()` - Flags overnight stays
- All existing tasks (Reclaims, Purchase Needs, Swaps, Training) now include scheduling columns

**src/75-Scheduling.gs**
- Added `generateMonthlySchedule()` - Main menu function for monthly scheduling
- Added `optimizeMonthlyRoutes()` - Groups visits by date and optimizes
- Added `optimizeDailyRoute()` - Orders visits by proximity
- Added `calculateCrewVisitTime()` - Estimates visit duration based on crew size
- Added `markVisitComplete()` - Marks visit complete and updates next visit date
- Added `refreshCalendar()` - Menu function to regenerate To-Do List

**src/Code.gs**
- Updated `onOpen()` menu - Added 3 new menu items to Schedule submenu

---

## 📊 SHEET STRUCTURE CHANGES

### To-Do List Sheet (New Structure)

**Rows 1-12: Calendar Section**
```
Row 1:  Title "📅 Monthly Schedule - [Month Year]"
Row 3:  Week headers (Sun, Mon, Tue, Wed, Thu, Fri, Sat)
Row 4-9: Calendar grid (6 weeks max)
Row 10: Info text
Row 11: Blank separator
Row 12: Instructions
```

**Row 13: Headers**
```
A: Priority
B: Task
C: Details
D: Sheet
E: Status
F: Scheduled Date
G: Estimated Time (min)
H: Start Location
I: End Location
J: Drive Time (min)
K: Overnight Required
L: Completed
```

**Row 14+: Task Data**

---

## 🚀 USAGE

### Setup (One-Time)
1. Run **Glove Manager → Schedule → Setup Crew Visit Config**
2. Fill in crew visit data:
   - Job Number
   - Location
   - Crew Lead
   - Crew Size
   - Visit Frequency (Weekly/Bi-Weekly/Monthly)
   - Est. Visit Time (minutes)
   - Drive Time From Helena (minutes)
   - Priority (High/Medium/Low)

### Monthly Workflow
1. Run **Glove Manager → Schedule → Generate Monthly Schedule**
   - Schedules all crew visits for current month
   - Optimizes routes by location
   - Flags overnight stays
2. Run **Glove Manager → To-Do List → Generate To-Do List**
   - Creates full To-Do List with calendar
   - Shows scheduled crew visits
   - Shows all other tasks (swaps, reclaims, training, purchases)
3. When completing a crew visit:
   - Select the task row
   - Run **Glove Manager → Schedule → Mark Visit Complete**
   - Last Visit Date updates
   - Next Visit Date calculates
   - Task marked as completed

### Refreshing
- Run **Glove Manager → Schedule → Refresh Calendar** anytime to update

---

## 🔧 CONFIGURATION

### Overnight Detection Settings
Adjust in `detectOvernightRequirement()` function:
- **Time threshold**: Currently 480 minutes (8 hours)
- **Hardcoded overnight locations**: Kalispell, Missoula, Miles City, Sidney, Glendive
- **Start location**: Default is Helena

### Crew Visit Time Estimation
Adjust in `calculateCrewVisitTime()` function:
- **Base time**: Currently 15 minutes
- **Time per employee**: Currently 5 minutes
- Formula: `baseTime + (timePerEmployee × crewSize)`

### Route Optimization
Currently sorts by drive time from Helena (closest first). Can be enhanced to:
- Group nearby locations together
- Calculate inter-location drive times
- Create multi-day trip optimizations

---

## 💡 BENEFITS

1. **Automated Scheduling** - No manual date entry needed
2. **Route Optimization** - Minimizes drive time
3. **Overnight Planning** - Flags trips requiring hotel stays
4. **Time Estimation** - Predicts total day duration
5. **Visual Calendar** - Easy month-at-a-glance view
6. **Integration** - Combines crew visits with other tasks
7. **Tracking** - Automatically updates visit dates

---

## 🧪 TESTING INSTRUCTIONS

### Test 1: Calendar Display
1. Run **Glove Manager → To-Do List → Generate To-Do List**
2. ✅ Verify: Calendar shows current month with today highlighted
3. ✅ Verify: Headers start at row 13, data at row 14

### Test 2: Crew Visit Scheduling
1. Run **Glove Manager → Schedule → Setup Crew Visit Config** (if not done)
2. Add a sample crew visit (e.g., Job #12345, Big Sky, Weekly, 90 min drive)
3. Run **Glove Manager → Schedule → Generate Monthly Schedule**
4. Run **Glove Manager → To-Do List → Generate To-Do List**
5. ✅ Verify: Crew visit task appears with scheduled date
6. ✅ Verify: Drive time populated (90 min)
7. ✅ Verify: Overnight Required checkbox

### Test 3: Overnight Detection
1. Check task for Big Sky (90 min drive, 45 min visit):
   - Total day time = (90 × 2) + 45 = 225 min (3.75 hrs)
   - ✅ Verify: Overnight Required = FALSE (under 8 hrs)
2. Check task for Kalispell (180 min drive, 45 min visit):
   - Total day time = (180 × 2) + 45 = 405 min (6.75 hrs)
   - ✅ Verify: Overnight Required = TRUE (hardcoded location)

### Test 4: Route Optimization
1. Add multiple crew visits on same day with different drive times
2. Run **Glove Manager → Schedule → Generate Monthly Schedule**
3. ✅ Verify: Visits are ordered by drive time (closest first)

### Test 5: Mark Visit Complete
1. Select a crew visit task row in To-Do List
2. Run **Glove Manager → Schedule → Mark Visit Complete**
3. ✅ Verify: Completed checkbox is checked
4. Open Crew Visit Config sheet
5. ✅ Verify: Last Visit Date updated to today
6. ✅ Verify: Next Visit Date calculated based on frequency

### Test 6: Refresh Calendar
1. Modify a crew visit in Crew Visit Config
2. Run **Glove Manager → Schedule → Refresh Calendar**
3. ✅ Verify: To-Do List regenerates with updated data

---

## 🔗 RELATED FEATURES

- **Crew Visit Config Sheet** - Master crew visit configuration
- **Training Tracking** - Training tasks also include scheduling columns
- **Reclaims/Swaps** - Can be bundled with crew visits to same location
- **Route Optimization** - Future enhancement: inter-location routing

---

## 📝 FUTURE ENHANCEMENTS

1. **Multi-Day Trip Optimization**
   - Group distant locations into multi-day trips
   - Minimize repeated long drives

2. **Inter-Location Drive Times**
   - Add lookup table for drive times between all locations
   - Optimize sequence beyond just Helena-based routing

3. **Automatic Task Bundling**
   - Bundle pending swaps/reclaims with crew visits at same location
   - One trip handles multiple tasks

4. **Calendar Interactivity**
   - Click calendar day to see tasks for that date
   - Drag/drop tasks between dates

5. **Mobile Optimization**
   - Dashboard integration for mobile viewing
   - Route directions integration

6. **Historical Tracking**
   - Track actual vs estimated times
   - Improve time estimates based on history

---

## ✅ DEPLOYMENT

**Deployed**: January 7, 2026  
**Method**: `clasp push`  
**Files Modified**: 3 files
- src/70-ToDoList.gs
- src/75-Scheduling.gs
- src/Code.gs

---

## 🐛 KNOWN LIMITATIONS

1. **Route optimization is basic** - Only sorts by drive time from Helena, doesn't calculate optimal inter-location routing
2. **Overnight locations are hardcoded** - Should eventually be configurable
3. **No multi-day trip optimization** - Each day planned independently
4. **Calendar is auto-generated only** - Can't manually drag/drop tasks between dates
5. **Crew visit time estimation is simple** - Doesn't account for task complexity

---

**Status**: ✅ Feature Complete and Deployed  
**Next Steps**: Test in production, gather user feedback, plan enhancements

