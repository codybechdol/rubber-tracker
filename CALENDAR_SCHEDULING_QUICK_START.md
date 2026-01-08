# 📅 Calendar Scheduling - Quick Start Guide

**Last Updated**: January 7, 2026

---

## 🚀 QUICK SETUP (5 Minutes)

### ⚡ NEW: Smart Scheduling (Recommended!)
**Best for**: Task-driven planning based on actual swaps and training needs

1. Open your spreadsheet
2. **Glove Manager → Schedule → 🎯 Generate Smart Schedule**
3. System automatically:
   - Groups tasks by location (e.g., all Butte tasks together)
   - Prioritizes by due date (overdue first)
   - Suggests efficient visit schedules
   - Flags overnight requirements

**See**: `SMART_SCHEDULING_GUIDE.md` for complete documentation

---

### 📅 Alternative: Monthly Crew Visit Schedule
**Best for**: Regular crew check-ins on a recurring schedule

### Step 1: Create Crew Visit Config
1. Open your spreadsheet
2. **Glove Manager → Schedule → Setup Crew Visit Config**
3. System automatically pulls data from Employees sheet:
   - ✅ Job Numbers (all active crews)
   - ✅ Locations (from crew members)
   - ✅ Crew Leads (auto-detected foremen)
   - ✅ Crew Sizes (counted automatically)
   - ✅ Estimated Visit Times (calculated by crew size)
   - ✅ Drive Times (estimated by location)

### Step 2: Review and Customize
The Crew Visit Config sheet is now populated! Review these columns and adjust as needed:

| Column | Auto-Populated? | What to Review | Example |
|--------|----------------|----------------|---------|
| Job Number | ✅ Yes | Already set from Employees | 009-26 |
| Location | ✅ Yes | Already set from Employees | Big Sky |
| Crew Lead | ✅ Yes | Auto-detected foreman | John Smith |
| Crew Size | ✅ Yes | Counted from Employees | 8 |
| Visit Frequency | ⚠️ Defaults to Monthly | **Change if needed** | Weekly/Bi-Weekly/Monthly |
| Est. Visit Time | ✅ Yes (calculated) | Adjust if needed | 55 min |
| Last Visit Date | ⚠️ Defaults to last week | **Update to actual date** | 1/1/2026 |
| Next Visit Date | ✅ Auto-calculated | Don't change | 1/8/2026 |
| Drive Time From Helena | ⚠️ Estimated | **Verify accuracy** | 90 min |
| Priority | ⚠️ Defaults Medium | Adjust if needed | High/Medium/Low |
| Notes | ❌ Empty | Add any notes | Special equipment |

**What You Need to Adjust:**
1. **Visit Frequency** - Change from Monthly if crews need Weekly or Bi-Weekly visits
2. **Last Visit Date** - Update to the actual last visit (defaults to 7 days ago)
3. **Drive Times** - Verify the estimated drive times are accurate
4. **Priority** - Adjust priorities as needed (Helena crews default to High)

### Step 3: Generate Monthly Schedule
1. **Glove Manager → Schedule → Generate Monthly Schedule**
2. Click "Yes" to confirm
3. System schedules all visits for the month

### Step 4: View Your Calendar
1. **Glove Manager → To-Do List → Generate To-Do List**
2. See calendar at top with all tasks below
3. Crew visits show scheduled dates, times, and overnight flags

---

## 📱 DAILY USE

### Starting Your Day
1. Open To-Do List
2. Look at calendar to see today's tasks
3. Check Overnight Required column for any flagged tasks
4. Note Drive Times and Estimated Times

### After Completing a Visit
1. Select the crew visit task row
2. **Glove Manager → Schedule → Mark Visit Complete**
3. System updates:
   - Last Visit Date → Today
   - Next Visit Date → Auto-calculated
   - Task marked complete

### When Things Change
- Crew size changes? Update Crew Visit Config
- New crew? Add row to Crew Visit Config
- Schedule changed? Run **Refresh Calendar**

---

## 🎯 UNDERSTANDING THE COLUMNS

### To-Do List New Columns

**Scheduled Date**  
📅 When the task is scheduled (auto-filled for crew visits)

**Estimated Time (min)**  
⏱️ How long the task will take
- Crew visits: 15 + (5 × crew size)
- Training: 60 minutes default
- Swaps: 10 minutes
- Reclaims: 15 minutes
- Purchases: 30 minutes

**Start Location**  
📍 Where you begin (usually Helena)

**End Location**  
📍 Where the task ends

**Drive Time (min)**  
🚗 One-way drive time from Helena

**Overnight Required**  
🏨 Checkbox flagged when:
- Total day time > 8 hours, OR
- Location is Kalispell, Missoula, Miles City, Sidney, or Glendive

---

## ⏰ VISIT FREQUENCY EXPLAINED

| Frequency | Means | Example |
|-----------|-------|---------|
| Weekly | Every 7 days | Jan 1 → Jan 8 → Jan 15 → Jan 22 |
| Bi-Weekly | Every 14 days | Jan 1 → Jan 15 → Jan 29 |
| Monthly | Every 30 days | Jan 1 → Jan 31 → Mar 2 |

System calculates all occurrences within the month automatically.

---

## 🏨 OVERNIGHT DETECTION

### Automatic Flags
The system checks two conditions:

**Condition 1: Time-Based**
```
Total Day Time = (Drive Time × 2) + Visit Time
If > 480 minutes (8 hours) AND end location ≠ Helena → Overnight Required
```

**Condition 2: Location-Based**  
These locations always require overnight:
- Kalispell
- Missoula
- Miles City
- Sidney
- Glendive

### Examples

**Example 1: Big Sky (No Overnight)**
- Drive: 90 min each way
- Visit: 45 min
- Total: (90 × 2) + 45 = 225 min (3.75 hrs)
- Result: ❌ No overnight needed

**Example 2: Kalispell (Overnight)**
- Drive: 180 min each way
- Visit: 45 min
- Total: (180 × 2) + 45 = 405 min (6.75 hrs)
- Result: ✅ Overnight required (hardcoded location)

**Example 3: Long Day (Overnight)**
- Drive: 200 min each way
- Visit: 90 min
- Total: (200 × 2) + 90 = 490 min (8.2 hrs)
- Result: ✅ Overnight required (over 8 hours)

---

## 🗓️ MONTHLY WORKFLOW

### Week 1 (First of Month)
1. Run **Generate Monthly Schedule**
2. Review overnight requirements
3. Book hotels if needed
4. Plan route sequences

### Week 2-4 (Ongoing)
1. Run **Generate To-Do List** weekly
2. Follow scheduled visits
3. Mark visits complete as you go
4. System auto-calculates next visits

### End of Month
1. Run **Refresh Calendar** to see next month
2. Check upcoming visits
3. Plan resources and time off

---

## 🔧 TROUBLESHOOTING

### "No crew visits scheduled"
- **Fix**: Run **Setup Crew Visit Config** first
- Add at least one crew with visit frequency

### Dates seem wrong
- **Fix**: Check Last Visit Date in Crew Visit Config
- System calculates from last visit + frequency

### Overnight flag missing
- **Check**: Drive Time is filled in
- **Check**: Location name matches (case-insensitive)
- **Verify**: Total time > 8 hours OR location in overnight list

### Tasks not showing in To-Do List
- **Fix**: Run **Generate To-Do List** again
- Make sure crew visit has valid date in current month

### Visit not marked complete
- **Check**: You selected a Crew Visit task (column D = "Crew Visit Config")
- **Check**: Task has Job Number in format "Job #XXXXX"

---

## 💡 PRO TIPS

1. **Update on Mondays** - Run Generate To-Do List every Monday morning

2. **Plan Overnight Stays Early** - Check Overnight Required column and book hotels ASAP

3. **Batch Similar Locations** - Visit nearby crews on same day to save drive time

4. **Use Priority Column** - Sort by Priority to tackle high-priority visits first

5. **Track Actual Times** - Note if visits take longer than estimated, adjust Crew Visit Config

6. **Bundle Tasks** - If multiple tasks at same location, do them all in one trip

7. **Check Before Long Trips** - Generate monthly schedule before planning time off

8. **Keep Config Updated** - Update crew sizes, leads, and frequencies as they change

---

## 📊 MENU LOCATIONS

All scheduling functions are under **Glove Manager → Schedule**:

```
Glove Manager
  └── 📅 Schedule
      ├── 🎯 Generate Smart Schedule       ← NEW! Auto-group tasks by location
      ├── 📅 Generate Monthly Schedule     ← Auto-schedule crew visits
      ├── 🔄 Refresh Calendar              ← Regenerate To-Do List
      ├── ✅ Mark Visit Complete           ← Complete a crew visit
      ├── ─────────────────────────────
      ├── Setup All Schedule Sheets
      ├── Setup Crew Visit Config
      ├── Setup Training Config
      └── ...
```

---

## 🆘 NEED HELP?

**Can't find something?**
- Check the detailed guide: `CALENDAR_SCHEDULING_IMPLEMENTATION.md`

**Feature not working?**
- Try running **Refresh Calendar** first
- Make sure Crew Visit Config is set up

**Want to change settings?**
- Overnight detection: Edit `detectOvernightRequirement()` in 70-ToDoList.gs
- Time estimation: Edit `calculateCrewVisitTime()` in 75-Scheduling.gs

---

## ✅ SUCCESS CHECKLIST

Your calendar scheduling is working when you can:
- [ ] See calendar at top of To-Do List
- [ ] Crew visits show scheduled dates
- [ ] Drive times are populated
- [ ] Overnight Required flags distant locations
- [ ] Mark Visit Complete updates dates
- [ ] Next visit dates auto-calculate
- [ ] Calendar refreshes with latest data

---

**That's it! You're ready to use the calendar scheduling system!** 🎉

