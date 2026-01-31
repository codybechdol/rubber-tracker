# Fix: Crane Cert Tasks Not Showing in Task List

## Problem
Not all expired crane cert holders were showing on the Task List in the Schedule dialog. The "Crane Cert - Expired" popup showed 6 expired certifications, but only those with manually scheduled dates appeared in the Task List.

## Root Cause
In the `getScheduleTasks()` function (Code.gs, lines 315-318), there was a filter that excluded all certification tasks without a scheduled date:

```javascript
// Only add cert tasks to the calendar if they have a scheduled date
if (taskSource === 'Expiring Certs' && !scheduledDate) {
  continue; // Skip cert tasks with no scheduled date
}
```

This filter was intentional because most certifications (DL, CPR, 1st Aid, etc.) can be handled over the phone and don't need to appear on the physical task schedule. However, **Crane Cert** tasks require physical evaluation and cannot be completed remotely.

## Who Was Affected
Based on the logs from `generateSmartSchedule`, these crane cert holders were NOT showing in the Task List:

- **Matthew Miller** - Crane Cert expired 10/26/2025 (93 days overdue) - Big Sky
- **Cody Lund** - Crane Cert expired 8/13/2025 (167 days overdue) - Elliston  
- **Emery DeWitt** - Crane Cert expired 8/13/2025 (167 days overdue) - Helena
- **Erik Davis** - Crane Cert expired 4/30/2022 (1368 days overdue) - South Dakota

These were showing because they had scheduled dates:
- **Taylor Goff** - Crane Cert expired 2/10/2025 (351 days overdue) - Helena (scheduled 1/29)
- **Matthew Wendt** - Crane Cert expired 8/12/2025 (168 days overdue) - Livingston (scheduled 2/04)

## Solution
Modified the filter to **always show Crane Cert and Crane Evaluation tasks**, even without a scheduled date:

```javascript
// Only add cert tasks to the calendar if they have a scheduled date
// EXCEPTION: Crane Cert tasks should always be visible (they require physical evaluation)
var isCraneCert = String(itemType).toLowerCase().indexOf('crane') !== -1;
if (taskSource === 'Expiring Certs' && !scheduledDate && !isCraneCert) {
  continue; // Skip non-crane cert tasks with no scheduled date (phone reminders)
}
```

## Result
All 6 expired crane cert holders now appear in the Task List, regardless of whether they have a scheduled date. This includes:
- Crane Cert (expiring/expired certifications)
- Crane Evaluation (missing evaluations for cert holders)

Other certification types (DL, CPR, 1st Aid, MEC, etc.) continue to be filtered out unless scheduled, since they can be handled remotely.

## Testing Steps
1. Open the Rubber Tracker spreadsheet
2. Go to **Glove Manager → Schedule & To-Do → 📅 Schedule**
3. Click on the **Tasks** tab
4. Verify all 6 crane cert holders appear in the task list (even those without scheduled dates)
5. Check that other cert types (CPR, 1st Aid, etc.) still require scheduled dates to appear

## Deployment
✅ Deployed via `.\push.bat` on January 27, 2026
- File: `src\Code.gs`
- Lines modified: 315-318

## Related Code
- **Function**: `getScheduleTasks()` in `Code.gs`
- **Related**: `collectExpiringCertTasks()` in `76-SmartScheduling.gs` (generates the tasks)
- **User interface**: `Schedule.html` (Tasks tab), `ToDoSchedule.html` (legacy)
