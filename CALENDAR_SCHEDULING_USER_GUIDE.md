# 📅 Calendar Scheduling - Quick Start Guide

**Updated**: January 7, 2026

---

## 🚀 Two-Step Process

### **Step 1: Generate Smart Schedule**
```
Menu: Glove Manager → Schedule → 🎯 Generate Smart Schedule
```
**What it does:**
- ✅ Collects all pending glove swaps
- ✅ Collects all pending sleeve swaps
- ✅ Collects all pending training
- ✅ Groups by location (Butte, Bozeman, etc.)
- ✅ Creates To-Do List with calendar at top

### **Step 2: Generate Monthly Schedule**
```
Menu: Glove Manager → Schedule → 📅 Generate Monthly Schedule
```
**What it does:**
- ✅ Auto-creates Crew Visit Config from To-Do List
- ✅ Defaults all visits to **Monthly** frequency
- ✅ Schedules visits based on due dates
- ✅ Highlights dates on calendar (blue = scheduled)
- ✅ Flags overnight requirements

---

## 📊 What You'll See

### **Calendar at Top of To-Do List**
```
📅 Monthly Schedule - January 2026
──────────────────────────────────
Sun  Mon  Tue  Wed  Thu  Fri  Sat
           1    2    3    4    5
 6    7   [8]   9   10   11   12   ← Blue = scheduled visit
13   14   15   16   17   18   19
20   21   22   23   24   25   26
27   28   29   30   31
```

### **Task List Below Calendar**
```
📍 Butte - 10 tasks, 2 OVERDUE
├── Joe Piazzola: Glove swap - OVERDUE (red row)
├── Chad Lovdahl: Sleeve swap - OVERDUE (red row)
├── Kyle Romerio: Glove swap - 7 days (white row)
└── ...

📍 Bozeman - 3 tasks
├── ...
```

---

## 🎯 Your Butte Example

### **Input Data**
```
Joe Piazzola - Butte - Glove #1046→1043 - OVERDUE
Chad Lovdahl - Butte - Sleeve #100→103 - OVERDUE
Kyle Romerio - Butte - Glove #772→1124 - 7 days
Cody Schoonover - Butte - Glove #338→1048 - 8 days
... (more Butte employees)
```

### **After Step 1 (Smart Schedule)**
✅ All Butte tasks grouped together  
✅ Sorted by due date (overdue first)  
✅ Total time estimated: ~100 minutes  
✅ Drive time: 90 minutes each way  

### **After Step 2 (Monthly Schedule)**
✅ Crew Visit Config created:
```
AUTO-BUT | Butte | Joe Piazzola | 10 | Monthly | 100 min | Tomorrow | 90 min | High
```
✅ Calendar shows tomorrow (January 8) highlighted  
✅ Overnight flagged: YES  

---

## 💡 Key Features

### **Automation**
- ✅ No manual entry needed
- ✅ Frequency defaults to Monthly
- ✅ Drive times auto-looked up
- ✅ Overnight auto-detected

### **Intelligent Scheduling**
- ✅ Overdue tasks → Schedule ASAP (tomorrow)
- ✅ Due soon → Schedule before due date
- ✅ Not urgent → Schedule within week
- ✅ Location grouping → One trip per location

### **Visual Calendar**
- ✅ Highlights scheduled dates
- ✅ Hover shows visit count
- ✅ Current month auto-displayed
- ✅ Updates each time you run schedule

---

## ⚙️ Customization (Optional)

After auto-generation, you can customize in **Crew Visit Config** sheet:

### **Change Visit Frequency**
- Weekly (for local Helena crews)
- Bi-Weekly
- Monthly (default)

### **Adjust Times**
- Estimated Visit Time
- Drive Time

### **Set Priority**
- High (urgent)
- Medium (default)
- Low (when convenient)

---

## 📅 Monthly Workflow

### **Week 1 (Monday Morning)**
1. Run: Generate Smart Schedule
2. Run: Generate Monthly Schedule
3. Review: Calendar for scheduled dates
4. Note: Red rows (overdue) - do first!

### **Week 2-4 (Execute)**
1. Complete visits on scheduled dates
2. Check off tasks as done
3. Update status in swap sheets

### **Week 4 (Friday)**
1. Review: Completed tasks
2. Preview: Next month's needs

---

## 🔍 Understanding the Calendar

### **Color Coding**
- 🟦 **Blue highlight** = Visit scheduled for this date
- 🟨 **Yellow** = Today's date
- ⚪ **White** = No visits scheduled

### **Hover Tooltips**
Hover over highlighted dates to see:
```
Scheduled: 2 visit(s)
```

### **Task Row Colors**
- 🔴 **Red background** = OVERDUE tasks
- 🟡 **Yellow background** = High priority (due soon)
- ⚪ **White background** = Normal priority

---

## 🗺️ Route Planning

### **Same Day Trips**
Can complete and return to Helena same day:
- Helena (0 min drive)
- Ennis (60 min drive)
- Butte (90 min drive)
- Bozeman (90 min drive)
- Big Sky (90 min drive)
- Great Falls (90 min drive)

### **Overnight Required**
Too far or too much time for same day:
- Missoula (120 min drive)
- Kalispell (180 min drive)
- Billings (180 min drive)
- Miles City (240 min drive)
- Sidney (300 min drive)
- Glendive (270 min drive)

### **Smart Grouping**
Consider combining nearby locations:
- Butte + Bozeman = One overnight trip
- Big Sky + Bozeman = One day trip
- Great Falls area = Multiple crews, one trip

---

## 🆘 Troubleshooting

### **Problem: "No tasks found"**
**Solution**: Run "Generate Smart Schedule" first

### **Problem: "No crew visits scheduled"**
**Cause**: To-Do List is empty  
**Solution**: 
1. Check Glove Swaps sheet has pending swaps
2. Check Sleeve Swaps sheet has pending swaps
3. Check Training Tracking has pending training
4. Run Generate Smart Schedule again

### **Problem: Calendar not showing scheduled dates**
**Cause**: Visits scheduled for different month  
**Solution**: Check "Next Visit Date" in Crew Visit Config

### **Problem: Drive time is wrong**
**Cause**: Location name typo  
**Solution**: Fix location in Employees sheet (exact spelling matters)

### **Problem: Want different frequency than Monthly**
**Solution**: Edit Crew Visit Config sheet after auto-generation

---

## 📞 Need Help?

1. **Read full documentation**: `CALENDAR_SCHEDULING_AUTO_IMPLEMENTATION.md`
2. **Check guides folder**: More detailed instructions
3. **Ask IT support**: For technical issues

---

## ✨ Pro Tips

### **Tip 1: Run Every Monday**
Start each week with fresh schedule to catch new overdue items

### **Tip 2: Print for Field Use**
Print To-Do List as checklist for on-site visits

### **Tip 3: Book Hotels Early**
When overnight flag is checked, book hotel immediately

### **Tip 4: Batch Nearby Locations**
If Butte and Bozeman both need visits, do both in one trip

### **Tip 5: Check Weather**
Montana winter → verify road conditions before long drives

---

## 🎯 Your Use Case Summary

**Scenario**: Joe Piazzola needs glove change in Butte (overdue)

**Old Way**:
1. ❌ Notice overdue in Glove Swaps sheet
2. ❌ Check other Butte employees manually
3. ❌ Plan route manually
4. ❌ Calculate drive time manually
5. ❌ Book overnight manually

**New Way**:
1. ✅ Run Generate Smart Schedule (30 sec)
2. ✅ Run Generate Monthly Schedule (30 sec)
3. ✅ See calendar: Butte scheduled for tomorrow
4. ✅ See task list: All Butte employees grouped
5. ✅ See overnight flag: Already marked
6. ✅ Book hotel and go!

**Time saved**: 15-20 minutes per location per month

---

## 🎉 You're Ready!

**Next Step**: Open your spreadsheet and try it:

1. Click: **Glove Manager → Schedule → 🎯 Generate Smart Schedule**
2. Click: **Glove Manager → Schedule → 📅 Generate Monthly Schedule**
3. Look at the calendar at the top of To-Do List
4. See your visits highlighted in blue!

**That's it!** 🚀

---

*Updated: January 7, 2026*  
*System Version: Auto-populated Calendar Scheduling*

