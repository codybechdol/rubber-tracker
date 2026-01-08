# 🎯 Smart Scheduling System - Complete Guide

**Last Updated**: January 7, 2026

---

## 📋 OVERVIEW

The Smart Scheduling System automatically groups tasks by location and prioritizes them by due date to optimize your field visits. Instead of manually planning which tasks to do when, the system analyzes all pending swaps and training, groups them by location, and suggests efficient visit schedules.

### Key Features
- **🗺️ Location Grouping**: Automatically clusters tasks by geographic location
- **📅 Due Date Prioritization**: Overdue tasks first, then earliest due dates
- **🚗 Drive Time Optimization**: Calculates round-trip times and overnight needs
- **⚡ One-Click Scheduling**: Generates complete visit plan in seconds

---

## 🚀 QUICK START

### Step 1: Run Smart Schedule
1. Open your spreadsheet
2. **Glove Manager → Schedule → 🎯 Generate Smart Schedule**
3. System analyzes all tasks and creates optimized schedule

### Step 2: Review the To-Do List
The system creates a new To-Do List with:
- Tasks grouped by **Location Visit** (📍 marker)
- Sorted by priority (Overdue first)
- Complete visit details (drive time, overnight flags, estimated time)

### Example Output

```
Location Visit    | Priority | Task Type | Employee        | Due Date    | Days Till Due | Scheduled Date
📍 Butte          | High     | Swap      | Joe Piazzola    | 12/11/2025  | OVERDUE       | 1/8/2026
📍 Butte          | High     | Swap      | Chad Lovdahl    | 1/6/2026    | OVERDUE       | 1/8/2026
📍 Butte          | Medium   | Swap      | Kyle Romerio    | 1/14/2026   | 7             | 1/8/2026
📍 Butte          | Low      | Swap      | Cody Schoonover | 1/15/2026   | 8             | 1/8/2026
📍 Butte          | Medium   | Training  | Colton Walter   |             |               | 1/8/2026
```

**Result**: 5 tasks in Butte - schedule ONE visit to handle them all!

---

## 🎯 HOW IT WORKS

### 1. Task Collection

The system scans three sources:

**Glove Swaps Sheet**
- Finds all unpicked swaps
- Extracts: Employee, Location, Due Date, Item details
- Calculates days until due

**Sleeve Swaps Sheet**
- Same process as glove swaps
- Includes sleeve-specific information

**Training Tracking Sheet**
- Finds incomplete training
- Includes crew location and training topic
- Flags overdue training

### 2. Location Grouping

Tasks are grouped by employee/crew location from Employees sheet:
```
Helena → [5 tasks]
Butte → [8 tasks]
Bozeman → [3 tasks]
Kalispell → [2 tasks]
```

### 3. Priority Sorting

Within each location, tasks are sorted:
1. **Overdue tasks** (marked OVERDUE in Days Till Due)
2. **Due within 7 days** (Medium priority)
3. **Due later** (Low priority)
4. **No due date** (Training tasks)

### 4. Schedule Date Calculation

System suggests visit dates based on urgency:
- **Any overdue task**: Schedule tomorrow
- **Due within 7 days**: Schedule 2-3 days before due date
- **No urgent tasks**: Schedule within next week

### 5. Overnight Detection

Automatically flags overnight requirements based on:
- **Time**: Total day time > 8 hours (round trip drive + all task times)
- **Location**: Hardcoded locations (Kalispell, Missoula, Miles City, Sidney, Glendive)

---

## 📊 TO-DO LIST COLUMNS

| Column | Description | Example |
|--------|-------------|---------|
| **Location Visit** | Location with 📍 marker | 📍 Butte |
| **Priority** | Task urgency | High/Medium/Low |
| **Task Type** | Swap or Training | Swap |
| **Employee/Crew** | Who needs the task | Joe Piazzola |
| **Location** | Where they are | Butte |
| **Current Item** | Item being replaced | 1046 |
| **Pick List Item** | New item assigned | 1043 |
| **Item Type** | Glove/Sleeve/Training topic | Glove |
| **Size** | Item size | 2 |
| **Due Date** | When swap is due | 12/11/2025 |
| **Days Till Due** | Days remaining or OVERDUE | OVERDUE |
| **Status** | Current status | Picked - Ready to Deliver |
| **Scheduled Date** | Suggested visit date | 1/8/2026 |
| **Estimated Time** | Minutes for this task | 10 |
| **Start Location** | Where you're coming from | Helena |
| **End Location** | Where task is | Butte |
| **Drive Time** | One-way drive time (min) | 90 |
| **Overnight Required** | Checkbox if overnight needed | ☑ |
| **Completed** | Mark when done | ☐ |

---

## 💡 USE CASES

### Use Case 1: Butte Example (From Your Data)

**Scenario**: You have 8 tasks in Butte, 2 are overdue

**Without Smart Scheduling**:
- See scattered tasks across Glove Swaps, Sleeve Swaps, Training
- Might miss overdue items
- Could make multiple trips
- Manual planning required

**With Smart Scheduling**:
- One button click
- All 8 Butte tasks grouped together
- Overdue items flagged in red
- System suggests: Schedule ONE visit on 1/8/2026
- Total estimated time: 80 minutes + 90 min drive each way
- Result: Complete all tasks in one 4.2 hour trip

**Savings**: 7 avoided trips × 3 hours each = **21 hours saved**

### Use Case 2: Monthly Planning

**Scenario**: Start of month, want to plan all field visits

**Steps**:
1. Run **Generate Smart Schedule**
2. Review grouped locations
3. Schedule high-priority locations first (overdue/red rows)
4. Plan route: Helena → Big Sky → Bozeman → Helena (one day)
5. Mark overnight stays for distant locations

**Result**: Complete monthly plan in 5 minutes vs. 2 hours of manual planning

### Use Case 3: Urgent Overdue Response

**Scenario**: Joe Piazzola's glove change in Butte is overdue

**Problem**: You don't know what else needs done in Butte

**Solution**:
1. Run **Generate Smart Schedule**
2. See all Butte tasks grouped
3. System shows:
   - Joe (OVERDUE)
   - Chad (OVERDUE)
   - Kyle (due in 7 days)
   - 3 others coming up soon

**Action**: Make ONE trip, handle all 6 tasks at once

---

## 🔧 ADVANCED FEATURES

### Custom Drive Times

Drive times are pre-configured for common locations:

| Location | Drive Time (Minutes) |
|----------|---------------------|
| Helena | 0 |
| Ennis | 60 |
| Butte | 90 |
| Big Sky | 90 |
| Bozeman | 90 |
| Great Falls | 90 |
| Missoula | 120 |
| Kalispell | 180 |
| Billings | 180 |
| Miles City | 240 |
| Glendive | 270 |
| Sidney | 300 |

**To add/modify**: Edit `getDriveTimeMap()` in `76-SmartScheduling.gs`

### Overnight Location List

These locations always require overnight:
- Kalispell
- Missoula
- Miles City
- Sidney
- Glendive

**To modify**: Edit `detectOvernightRequirement()` in `70-ToDoList.gs`

### Estimated Task Times

Default time estimates:
- **Swap**: 10 minutes per employee
- **Training**: 60 minutes per session

**To modify**: Edit time values in `collectSwapTasks()` and `collectTrainingTasks()`

---

## 📅 WORKFLOW INTEGRATION

### Weekly Routine

**Monday Morning**:
1. Run **Generate Smart Schedule**
2. Review priority locations (red = overdue)
3. Plan week's visits

**During the Week**:
1. Complete visits
2. Check **Completed** box for each task
3. Update Glove/Sleeve Swaps as delivered

**End of Week**:
1. Run **Generate Smart Schedule** again
2. See updated priorities
3. Plan next week

### Monthly Routine

**First of Month**:
1. Run **Generate Smart Schedule**
2. Print or export To-Do List
3. Book hotels for overnight locations
4. Plan entire month's routes

**Mid-Month Check**:
1. Re-run **Generate Smart Schedule**
2. Adjust for new swaps/training
3. Handle urgent/overdue items

---

## 🎨 VISUAL INDICATORS

### Color Coding

- **Red Background** (🔴): OVERDUE tasks - handle ASAP
- **Yellow Background** (🟡): High priority - due soon
- **White Background**: Low priority - scheduled but not urgent

### Icons

- **📍**: Location marker - groups tasks by visit
- **☑**: Overnight required
- **☐**: Not completed yet
- **✓**: Completed checkbox

---

## 🔄 COMPARISON: Smart vs. Monthly Schedule

| Feature | Smart Schedule | Monthly Schedule |
|---------|---------------|------------------|
| **Source** | Glove Swaps, Sleeve Swaps, Training | Crew Visit Config |
| **Grouping** | By task location | By crew schedule |
| **Priority** | Due date driven | Frequency driven |
| **Best For** | Task-oriented planning | Regular crew check-ins |
| **Use When** | Responding to overdue items | Routine monthly visits |
| **Updates** | Run weekly/as needed | Run start of month |

**Recommendation**: Use **Smart Schedule** for reactive task management, **Monthly Schedule** for proactive crew visits.

---

## ⚠️ TROUBLESHOOTING

### "No Tasks Found"

**Cause**: No unpicked swaps or incomplete training

**Solutions**:
1. Run **Generate All Reports** first
2. Check Glove Swaps has unpicked items
3. Verify Training Tracking has incomplete training
4. Make sure Employees sheet has location data

### Tasks Missing Location

**Issue**: Tasks show "Unknown" location

**Fix**:
1. Open **Employees** sheet
2. Find employee name (must match exactly)
3. Fill in **Location** column
4. Re-run **Generate Smart Schedule**

### Wrong Drive Times

**Issue**: Drive time doesn't match actual

**Fix**:
1. Open `76-SmartScheduling.gs`
2. Find `getDriveTimeMap()` function
3. Update location drive time
4. Save and re-run schedule

### Overnight Not Flagged

**Check**:
1. Is End Location ≠ Helena?
2. Is (Drive Time × 2) + Task Time > 480 minutes?
3. Is location in overnight list?

**If still wrong**: Manually check Overnight Required box

---

## 📈 EFFICIENCY METRICS

### Time Saved

**Manual Planning** (per month):
- Review all swap sheets: 30 min
- Find locations: 15 min
- Group tasks: 30 min
- Plan routes: 45 min
- **Total**: ~2 hours

**With Smart Schedule**:
- One click: 10 seconds
- Review output: 10 min
- **Total**: ~10 minutes

**Savings**: **110 minutes per month** = 22 hours/year

### Trip Reduction

**Example Month** (20 pending swaps across 5 locations):

**Without Smart Schedule**: 
- 20 individual trips
- 20 × 3 hours avg = **60 hours driving**

**With Smart Schedule**:
- 5 grouped trips
- 5 × 3 hours avg = **15 hours driving**

**Savings**: **45 hours per month** = 540 hours/year

---

## 🎓 BEST PRACTICES

### 1. Run Weekly
Schedule "Monday morning Smart Schedule" routine to stay ahead of overdue items.

### 2. Color Code Priority
- Red rows = Do this week
- Yellow rows = Do next week
- White rows = Schedule within month

### 3. Bundle Nearby Locations
If Butte AND Bozeman have tasks, do both in one trip (they're only 90 min apart).

### 4. Pre-Book Hotels
When overnight flag is checked, book hotel immediately to lock in rates.

### 5. Confirm Before Travel
Call crew lead before visit to confirm they'll be on site.

### 6. Update Immediately
When task is complete, check Completed box AND update source sheet (Glove Swaps, etc.).

### 7. Print for Field Use
Print To-Do List for locations you're visiting - use as checklist on site.

---

## 📞 SUPPORT

### Need Help?

**Can't find something?**
- Check main scheduling guide: `CALENDAR_SCHEDULING_QUICK_START.md`
- Check detailed docs: `CALENDAR_SCHEDULING_IMPLEMENTATION.md`

**Feature not working?**
- Verify Employees sheet has location data
- Run **Generate All Reports** to refresh swaps
- Check ESLint errors in Apps Script editor

**Want to customize?**
- Edit drive times: `getDriveTimeMap()` in `76-SmartScheduling.gs`
- Edit overnight rules: `detectOvernightRequirement()` in `70-ToDoList.gs`
- Edit task times: Update `estimatedTime` in collection functions

---

## ✅ SUCCESS CHECKLIST

Your Smart Scheduling system is working when you can:
- [ ] Click **Generate Smart Schedule** without errors
- [ ] See tasks grouped by location (📍 markers)
- [ ] Overdue tasks appear in red
- [ ] Scheduled dates are suggested
- [ ] Drive times are populated
- [ ] Overnight flags appear for distant locations
- [ ] Multiple tasks for same location are grouped together

---

**That's it! You're ready to use Smart Scheduling to optimize your field visits!** 🎉

**Pro Tip**: Print this guide and keep near your desk for quick reference during planning sessions.

