# 📅 CREW VISIT SCHEDULING & TRAINING SYSTEM - Implementation Plan

**Date**: January 4, 2026  
**Feature**: Add monthly calendar with crew visit schedule and training tasks  
**Status**: Planning Phase

---

## 🎯 FEATURE OVERVIEW

Add comprehensive scheduling functionality to track:
1. **Monthly crew visits by job number**
2. **Monthly training schedule** 
3. **Calendar view** showing daily schedule
4. **Time estimates** for crew visits and drive time
5. **Integration with To-Do List** for task management

---

## 📋 NEW SHEET: "Schedule"

### **Purpose**
Central calendar view showing monthly schedule for crew visits and training

### **Layout Structure**

#### **Section 1: Monthly Calendar (Rows 1-35)**
Visual calendar showing:
- Days of the month (7 columns for days of week)
- Daily tasks: crew visits, training sessions
- Color coding by task type
- Location indicators

#### **Section 2: Crew Visit Configuration (Rows 37+)**
Define crew visit tasks:
- Job Number
- Location
- Crew Name/Lead
- Estimated Visit Time (minutes)
- Last Visit Date
- Next Visit Date (auto-calculated)
- Visit Frequency (weekly, bi-weekly, monthly)
- Priority

#### **Section 3: Training Schedule (Below Crew Visits)**
Define monthly training tasks:
- Training Topic
- Required Attendees (by location or all)
- Duration (hours)
- Frequency (monthly, quarterly, annual)
- Last Training Date
- Next Training Date
- Completion Status

---

## 🗂️ NEW SHEET: "Crew Visit Config"

### **Purpose**
Master list of all crews/job numbers to visit

### **Columns**
| Column | Header | Description |
|--------|--------|-------------|
| A | Job Number | Unique identifier for crew/job |
| B | Location | Work location (matches Employees sheet) |
| C | Crew Lead | Primary contact name |
| D | Crew Size | Number of workers |
| E | Visit Frequency | Weekly, Bi-Weekly, Monthly |
| F | Est. Visit Time | Minutes spent with crew |
| G | Last Visit Date | Most recent visit |
| H | Next Visit Date | Calculated next visit |
| I | Drive Time From Helena | Minutes (for routing) |
| J | Priority | High, Medium, Low |
| K | Notes | Special instructions |

**Key Features:**
- Data validation for Frequency dropdown
- Auto-calculation of Next Visit Date
- Integration with Employees sheet locations

---

## 🗂️ NEW SHEET: "Training Config"

### **Purpose**
Master list of required training sessions

### **Columns**
| Column | Header | Description |
|--------|--------|-------------|
| A | Training Topic | Name of training |
| B | Required For | Locations or "All" |
| C | Duration | Hours |
| D | Frequency | Monthly, Quarterly, Annual |
| E | Last Training Date | Most recent session |
| F | Next Training Date | Calculated next date |
| G | Required Attendees | Count or list |
| H | Completion Status | % complete |
| I | Notes | Additional info |

**Key Features:**
- Auto-calculation of Next Training Date based on Frequency
- Integration with Employees sheet for attendee counts
- Status tracking

---

## 📊 ENHANCED: "To Do List" Sheet

### **New Features**

#### **Add Calendar Section Above To-Do List**
```
Row 1-3:   Title: "Monthly Schedule - [Month Year]"
Row 4-10:  Calendar Week View (mini calendar)
Row 11:    Navigation: << Previous Month | Current Month | Next Month >>
Row 12:    Blank separator
Row 13+:   Existing To-Do List (enhanced with schedule tasks)
```

#### **Enhanced To-Do List Columns**
Add new columns:
- **Scheduled Date** - When task is scheduled
- **Estimated Time** - Duration in minutes
- **Task Type** - Crew Visit, Training, Swap, Reclaim, Purchase
- **Job Number** - For crew visits
- **Location** - Where task occurs
- **Drive Time** - Travel time to location

#### **New Task Categories**
1. **Crew Visit Tasks**
   - Visit crew at [Location] - Job #[Number]
   - Check gloves/sleeves
   - Deliver swaps
   - Collect reclaims

2. **Training Tasks**
   - Conduct [Training Topic] at [Location]
   - Duration: [X] hours
   - Attendees: [Count] employees

---

## 🔧 NEW MODULE: 75-Scheduling.gs

### **Functions to Create**

```javascript
// === MAIN FUNCTIONS ===

function generateMonthlySchedule(year, month)
// Generates complete schedule for specified month
// - Creates calendar grid
// - Populates crew visits
// - Adds training sessions
// - Calculates drive times
// - Integrates with To-Do List

function updateScheduleSheet()
// Updates the Schedule sheet with current data
// - Refreshes crew visit dates
// - Updates training schedules
// - Recalculates next visit dates

function getCrewVisitsForMonth(year, month)
// Returns all crew visits scheduled for the month
// - Based on visit frequency
// - Considers last visit date
// - Returns array of visit objects

function getTrainingForMonth(year, month)
// Returns all training sessions for the month
// - Based on training frequency
// - Considers last training date
// - Returns array of training objects

// === CREW VISIT FUNCTIONS ===

function addCrewVisit(jobNumber, location, frequency, visitTime)
// Adds a new crew visit configuration

function updateCrewVisit(jobNumber, visitDate)
// Updates last visit date and calculates next visit

function calculateNextVisitDate(lastVisitDate, frequency)
// Calculates next visit date based on frequency
// - Weekly: +7 days
// - Bi-Weekly: +14 days
// - Monthly: +30 days

function getCrewVisitsByLocation()
// Returns crew visits grouped by location
// - For optimizing daily routes

function calculateDailyRoute(date, location)
// Calculates optimal route for crew visits in a location
// - Orders visits by proximity
// - Calculates total drive time
// - Returns route object

// === TRAINING FUNCTIONS ===

function addTraining(topic, requiredFor, duration, frequency)
// Adds a new training configuration

function updateTrainingCompletion(topic, completionDate, attendees)
// Records training completion

function calculateNextTrainingDate(lastDate, frequency)
// Calculates next training date
// - Monthly: +30 days
// - Quarterly: +90 days
// - Annual: +365 days

function getTrainingByLocation(location)
// Returns required training for a location

// === CALENDAR FUNCTIONS ===

function buildMonthlyCalendar(year, month)
// Builds visual calendar grid
// - 7 columns (days of week)
// - 5-6 rows (weeks)
// - Populates with tasks

function addTaskToCalendar(date, taskType, description)
// Adds a task to specific calendar date
// - Color codes by type
// - Shows time estimate
// - Links to task details

function getTasksForDate(date)
// Returns all tasks scheduled for a date
// - Crew visits
// - Training sessions
// - Swap deliveries
// - Reclaim pickups

// === INTEGRATION FUNCTIONS ===

function integrateScheduleWithToDo()
// Adds scheduled tasks to To-Do List
// - Crew visits become delivery tasks
// - Training becomes preparation tasks
// - Auto-prioritizes by date

function syncCrewVisitsWithSwaps()
// Links crew visits with pending swaps
// - Identifies swaps to deliver on visit
// - Optimizes delivery routes

function syncCrewVisitsWithReclaims()
// Links crew visits with reclaims to pickup
// - Identifies reclaims at location
// - Adds to visit task list

// === UTILITY FUNCTIONS ===

function getDriveTime(fromLocation, toLocation)
// Calculates drive time between locations
// - Uses configuration table
// - Returns minutes

function formatTimeEstimate(minutes)
// Formats time display
// - "1h 30m" format

function getMonthName(monthNumber)
// Returns month name from number

function getWeekdayName(date)
// Returns day of week name
```

---

## 📊 DATA STRUCTURES

### **Crew Visit Object**
```javascript
{
  jobNumber: "12345",
  location: "Big Sky",
  crewLead: "John Smith",
  crewSize: 8,
  frequency: "Weekly",
  estimatedTime: 45, // minutes
  lastVisit: new Date("2026-01-02"),
  nextVisit: new Date("2026-01-09"),
  driveTimeFromHelena: 90, // minutes
  priority: "High",
  pendingSwaps: ["667", "2097"], // Item numbers to deliver
  pendingReclaims: ["1041"], // Item numbers to pickup
  notes: "Check testing equipment"
}
```

### **Training Session Object**
```javascript
{
  topic: "Arc Flash Safety",
  requiredFor: "All",
  duration: 2, // hours
  frequency: "Quarterly",
  lastTraining: new Date("2025-10-15"),
  nextTraining: new Date("2026-01-15"),
  requiredAttendees: 87,
  completedAttendees: 0,
  completionPercent: 0,
  locations: ["Helena", "Missoula", "Big Sky"],
  notes: "Annual requirement"
}
```

### **Daily Schedule Object**
```javascript
{
  date: new Date("2026-01-15"),
  tasks: [
    {
      type: "Crew Visit",
      time: "08:00",
      duration: 45, // minutes
      jobNumber: "12345",
      location: "Big Sky",
      description: "Visit Big Sky Crew",
      swapsToDeliver: ["667"],
      reclaimsToPickup: ["1041"],
      driveTime: 90
    },
    {
      type: "Training",
      time: "14:00",
      duration: 120, // minutes
      topic: "Arc Flash Safety",
      location: "Helena",
      attendees: 25
    }
  ],
  totalDriveTime: 180, // minutes (to/from locations)
  totalWorkTime: 165 // minutes (visits + training)
}
```

---

## 🎨 UI ENHANCEMENTS

### **Menu Additions**
Add to Glove Manager menu:
```
Glove Manager
├── ... existing items ...
├── Schedule
│   ├── View Monthly Schedule
│   ├── Update Schedule
│   ├── Add Crew Visit
│   ├── Add Training Session
│   └── Generate Route Plan
└── ... existing items ...
```

### **Calendar Formatting**
- **Headers**: Bold, colored by day of week
- **Current Date**: Highlighted in yellow
- **Crew Visits**: Light blue background
- **Training**: Light green background
- **Multiple Tasks**: Darker shade
- **Past Dates**: Grey out
- **Future Dates**: White/normal

### **Time Display**
- Use "HH:MM" format for times
- Show duration as "Xh Ym" 
- Total daily time at bottom
- Drive time in italics

---

## 🔄 WORKFLOW INTEGRATION

### **When Generate All Reports Runs**
1. Generate swaps (existing)
2. Generate reclaims (existing)
3. **NEW: Update crew visit schedules**
4. **NEW: Sync pending swaps with crew visits**
5. **NEW: Sync reclaims with crew visits**
6. Generate To-Do List (enhanced with schedule)

### **When To-Do List Generated**
1. Get existing tasks (swaps, reclaims, purchases)
2. **NEW: Get scheduled crew visits for next 7 days**
3. **NEW: Get scheduled training for next 7 days**
4. **NEW: Group tasks by location**
5. **NEW: Calculate daily routes**
6. **NEW: Add time estimates**
7. Display consolidated list

### **When Crew Visit Completed**
1. Mark visit as complete in To-Do List
2. Update Last Visit Date in Crew Visit Config
3. Calculate Next Visit Date
4. Mark delivered swaps as "Assigned" with Date Changed
5. Mark picked-up reclaims as reclaimed

---

## 📅 IMPLEMENTATION PHASES

### **Phase 1: Data Structure (Week 1)**
- Create Crew Visit Config sheet
- Create Training Config sheet
- Add configuration tables
- Set up data validation

### **Phase 2: Core Functions (Week 1-2)**
- Create 75-Scheduling.gs module
- Implement crew visit functions
- Implement training functions
- Implement date calculations

### **Phase 3: Calendar View (Week 2)**
- Build monthly calendar generator
- Add task placement logic
- Implement formatting
- Add navigation

### **Phase 4: Integration (Week 3)**
- Enhance To-Do List with schedule
- Sync with swaps
- Sync with reclaims
- Add menu items

### **Phase 5: Route Optimization (Week 3-4)**
- Calculate optimal daily routes
- Add drive time estimates
- Group by location
- Display route plan

### **Phase 6: Testing & Refinement (Week 4)**
- Test all functions
- Verify date calculations
- Test integrations
- User feedback

---

## 🧪 TESTING CHECKLIST

- [ ] Crew visit dates calculate correctly
- [ ] Training dates calculate correctly
- [ ] Calendar displays current month
- [ ] Calendar navigation works (prev/next month)
- [ ] Tasks appear on correct dates
- [ ] Time estimates are accurate
- [ ] Drive times calculate correctly
- [ ] Integration with swaps works
- [ ] Integration with reclaims works
- [ ] To-Do List shows schedule tasks
- [ ] Marking visit complete updates dates
- [ ] Route optimization orders logically

---

## 📝 CONFIGURATION NEEDED

**From User:**
1. List of all job numbers/crews to visit
2. Visit frequency for each crew
3. Estimated visit time for each crew
4. Drive times between locations
5. Required training topics
6. Training frequencies
7. Training durations

---

## 🚀 NEXT STEPS

**Immediate Actions:**
1. Review this plan with user
2. Gather configuration data
3. Create Phase 1 data structure
4. Begin implementing core functions

**Questions for User:**
1. How many crews/job numbers need visits?
2. What training topics are required?
3. Should calendar be read-only or editable?
4. Do you want route optimization or manual scheduling?
5. Should system auto-schedule or suggest dates?

---

**Status**: Planning Complete - Ready for Implementation  
**Estimated Time**: 3-4 weeks for full implementation  
**Priority**: Define requirements and gather configuration data

Would you like me to proceed with implementation? 🚀

