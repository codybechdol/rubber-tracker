# Enhanced Task Details in Trip Planner Location Popup
**Date:** February 28, 2026

## Problem
When viewing tasks for a location (like Great Falls) in the Trip Planner, tasks showed generic labels:
- "Training" for all training tasks (couldn't distinguish between different trainings)
- "Safety Equipment" for all safety equipment tasks (couldn't see which equipment or vehicle)
- "Swap" for glove/sleeve swaps (couldn't tell which type)

**Example:** Chandler Reel had 2 "Training" tasks listed but no way to tell which training topic each was.

## Solution
Enhanced the location popup AND the sidebar unassigned tasks to show detailed task information:

### Swap Tasks (Glove/Sleeve)
- **Before:** `Swap` or just employee name
- **After:** 
  - Shows `🔄` swap icon
  - Subtitle shows `Glove Swap` or `Sleeve Swap`
  - Due date displayed

### Training Tasks
- **Before:** `Training`
- **After:** `Training: Job Briefings/ JHA's/ Emergency Action Plans`
  - Shows the actual training topic from the Training Tracking sheet
  - Subtitle shows the month: `📅 February training`

### Safety Equipment Tasks  
- **Before:** `Safety Equipment`
- **After:** `Fire Extinguisher - Vehicle #X1`
  - Shows the equipment type + vehicle number
  - Subtitle shows the issue description (truncated to 60 chars): `⚠️ Fire extinguisher needs inspection`

### Cert Expiring Tasks (unchanged)
- Shows: `Renew CPR` or `Renew MEC`
- Shows expiration date: `📅 Expires: 03/15/2026`

## Technical Changes

### TripPlanner.html - `showTaskDetails()` function

**1. Enhanced `preparedTasks` data (added more properties):**
```javascript
preparedTasks.push({
  source: task.source || task.sheetName || 'To Do List',
  rowIndex: task.rowIndex,
  taskType: task.taskType || task.type,
  employee: task.employee,
  itemType: task.itemType,
  location: task.location,
  urgencyLabel: task.urgencyLabel,
  dueDate: task.dueDate,
  // Additional detail fields
  topic: task.topic,                   // Training topic
  month: task.month,                   // Training month
  vehicleNumber: task.vehicleNumber,   // Safety Equipment vehicle
  currentItem: task.currentItem,       // Safety Equipment issue description
  notes: task.notes,                   // General notes
  crew: task.crew                      // Crew number for Training
});
```

**2. Enhanced task title display:**
```javascript
// Training task
if (task.taskType === 'Training' || task.type === 'Training') {
  if (task.topic) {
    taskTitle = 'Training: ' + task.topic;
  }
  if (task.month) {
    taskSubtitle = '📅 ' + task.month + ' training';
  }
}

// Safety Equipment task
else if (task.taskType === 'Safety Equipment') {
  taskTitle = task.itemType || 'Safety Equipment';
  if (task.vehicleNumber) {
    taskTitle += ' - Vehicle #' + task.vehicleNumber;
  }
  if (task.currentItem) {
    taskSubtitle = '⚠️ ' + (task.currentItem.length > 60 ? task.currentItem.substring(0, 60) + '...' : task.currentItem);
  }
}
```

## Files Modified
- `src/TripPlanner.html` - Enhanced `showTaskDetails()` function (~40 lines changed)

## Source Data Fields

### Training Tasks (from 76-SmartScheduling.gs `collectTrainingTasks`)
- `topic` - The training topic (e.g., "Job Briefings/ JHA's/ Emergency Action Plans")
- `month` - The training month (e.g., "February")
- `itemType` - Pre-formatted as "Monthly Training: [topic]"

### Safety Equipment Tasks (from 76-SmartScheduling.gs `collectSafetyReportsTasks`)
- `itemType` - Equipment type (e.g., "Fire Extinguisher", "Mileage Books", "Cones")
- `vehicleNumber` - Vehicle number (e.g., "123", "X1")
- `currentItem` - Issue description (the full text of what's wrong)

## Visual Example

**Before:**
```
📋 Training
👤 Chandler Reel
🔴 Overdue

📋 Training
👤 Chandler Reel
🟢 Later
```

**After:**
```
📋 Training: Job Briefings/ JHA's/ Emergency Action Plans
👤 Chandler Reel
📅 February training
🔴 Overdue

📋 Training: CPR/First Aid/AED Refresher
👤 Chandler Reel
📅 March training
🟢 Later
```

