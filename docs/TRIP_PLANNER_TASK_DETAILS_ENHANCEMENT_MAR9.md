# Trip Planner Task Details Enhancement

**Date:** March 9, 2026

## Overview

Enhanced the Trip Planner to display more detailed information about tasks on location cards and in the task details popup, including:
- Training topic for training tasks
- Cert type for certification expiring tasks
- Employee phone numbers

## Changes Made

### Backend Changes

#### 1. `76-SmartScheduling.gs` - Pass phone numbers to collection functions

**`collectAndGroupTasks()`:**
- Now passes `employeePhones` map to `collectSwapTasks()` and `collectTrainingTasks()`

**`collectSwapTasks()`:**
- Updated function signature to accept `employeePhones` parameter
- Now sets `phoneNumber` property on swap task objects

**`collectTrainingTasks()`:**
- Updated function signature to accept `employeePhones` parameter  
- Now sets `phoneNumber` property on training task objects

#### 2. `Code.gs` - Enhanced task enrichment

**`getTasksWithMetadata()`:**
- Added `topic`, `month`, `crew`, and `certType` properties to enriched tasks
- Changed `phoneNumber` to prefer task data over metadata (fresher data from Employees sheet)
- Both metadata-enriched and non-metadata cases now include all task detail fields

#### 3. `87-RoutePlanner.gs` - Pass through all task details

**`collectTasksForTripPlanner()`:**
- Fixed task objects to include `phoneNumber`, `topic`, `month`, `certType`
- Applied fix to ALL task creation points:
  - Regular field tasks
  - Office tasks (non-field locations)
  - Cert expiring tasks
  - Scheduled tasks

### Frontend Changes

#### 4. `TripPlanner.html` - Enhanced task card display

**`createUnassignedTaskCard()`:**
- Training tasks now show `📚 [topic] (month)` instead of just "Training"
- Cert expiring tasks now show `🎓 Renew: [certType]`
- Swap tasks show `🔄 [Glove/Sleeve] Swap`
- Reclaim tasks show `♻️ Reclaim [itemType]`
- Missing Safety Report tasks show `🛡️ Missing: [reportType]`

**`showTaskDetails()` (task popup):**
- Added phone number display with formatted number (`📞 (406) 555-1234`)
- Training tasks show the topic with `📚` icon
- Cert tasks show `🎓 Renew [certType]`
- Swap tasks show `🔄 [itemType] Swap`
- All tasks show due dates

**`showOfficeTaskDetail()` (single task detail popup):**
- Fixed to properly detect training tasks and show `📚 [topic] (month)`
- Fixed to properly detect cert tasks and show `🎓 Renew: [certType]`
- Now formats phone numbers using `formatPhoneNumber()` helper
- SMS button disabled if no phone number available

**New helper function:**
- `formatPhoneNumber(phone)` - Formats phone numbers as `(XXX) XXX-XXXX`

## Task Card Display Examples

### Training Task
```
👤 Dusty Hendrickson
📚 Job Briefings/ JHA's/ Emergency Ac... (March)
📅 Due: 2026-03-31
```

### Cert Expiring Task
```
👤 Chris Adams
🎓 Renew: CPR
📅 Expires: 2026-04-15
```

### Swap Task
```
👤 Cody Lund
🔄 Glove Swap
📅 Due: 2026-03-20
```

## Task Popup Display

When clicking on a location card, the popup now shows:
- Task type icon and formatted title
- Employee name
- Phone number (if available)
- Subtitles with additional context
- Due/Expiration dates
- Urgency indicators

## Testing

1. Open Trip Planner from Glove Manager → Schedule & To-Do → 🗺️ Trip Planner
2. Click on a location card to see the task details popup
3. Verify:
   - Training tasks show the actual training topic
   - Cert tasks show the cert type being renewed
   - Phone numbers appear for employees who have them
4. Check unassigned task cards in the sidebar for enhanced display
5. Click on Office/Phone tasks in the right sidebar to verify detail popup shows topic/cert type

## Files Modified

- `src/76-SmartScheduling.gs` - Phone number collection for swaps and training
- `src/Code.gs` - Task enrichment with topic, month, crew, certType
- `src/87-RoutePlanner.gs` - Pass through phoneNumber, topic, month, certType to all task types
- `src/TripPlanner.html` - Enhanced card display, office task detail popup, phone formatting

