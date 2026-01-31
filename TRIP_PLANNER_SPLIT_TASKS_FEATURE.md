# Trip Planner: Split Tasks Feature

**Date:** January 27, 2026  
**Feature:** Split tasks for the same location across multiple days

## Problem Solved

Previously, the Trip Planner grouped **all tasks for a location together** as one unit. If you had multiple tasks at Eliston, they all had to be scheduled for the same day. You couldn't split them across multiple visits.

### Example Scenario
- **5 tasks at Eliston:**
  - 3 glove swaps (can be done anytime)
  - 1 training session (must be done on 02/02)
  - 1 reclaim (can wait until 02/05)

**Old behavior:** All 5 tasks had to be on the same day  
**New behavior:** You can split them - 4 tasks on 02/02, 1 task on 02/05

## How It Works

### Method 1: Click to Split (Recommended)

1. **Open Trip Planner** (Glove Manager → Schedule → 🗺️ Trip Planner)
2. **Click on a location card** that has multiple tasks (e.g., "Eliston - 5 tasks")
3. Task details popup appears showing all tasks
4. **Click "✂️ Split Tasks..." button** at the bottom
5. Split dialog appears with:
   - Checkboxes for each task
   - Dropdown to select target day
6. **Select which tasks to move** to a different day
7. **Choose the target day** from the dropdown
8. **Click "✓ Split Tasks"**
9. The location now appears on **both days** with different task counts

### Method 2: Right-Click Menu (Alternative)

1. **Right-click on a location card** with multiple tasks
2. Context menu appears (if 2+ tasks)
3. Select "Split Tasks..."
4. Follow steps 5-9 above

## Features

### Smart Merging
- If the target day **already has that location**, the tasks are **merged** together
- Example: Eliston already on Monday with 2 tasks → Move 3 more tasks → Monday now shows "Eliston - 5 tasks"

### Automatic Cleanup
- If you move **all tasks** from the original day, the location card is **removed** from that day
- Example: Eliston on Monday with 3 tasks → Move all 3 to Wednesday → Eliston removed from Monday

### Task Count Updates
- Task counts automatically update on both days
- Estimated crew time recalculates based on new task count
- Urgency badges update to reflect most urgent task in each group

### Visual Feedback
- Selected tasks highlight in blue
- "X selected" counter updates as you check/uncheck tasks
- "Split Tasks" button is disabled until you select at least one task
- Success message shows: "Split 3 task(s) from Eliston to Wed Feb 5"

## Use Cases

### Use Case 1: Spread Out Work
**Scenario:** Too many tasks at one location for a single visit  
**Solution:** Split across 2 days to keep each day under 10 hours

**Example:**
- Bozeman has 8 tasks (est. 2 hrs 35 min with crew)
- Split: 5 tasks on Monday, 3 tasks on Thursday
- Each visit is now ~1-1.5 hours

### Use Case 2: Time-Sensitive Tasks
**Scenario:** Some tasks are urgent, others can wait  
**Solution:** Move urgent tasks to earlier day, non-urgent to later day

**Example:**
- Eliston has 5 tasks: 2 overdue, 3 can wait
- Split: 2 overdue tasks on 02/02, 3 others on 02/05

### Use Case 3: Combine with Other Locations
**Scenario:** Want to pair specific tasks with nearby locations  
**Solution:** Split tasks to match efficient trip routes

**Example:**
- Livingston has 4 tasks + Bozeman nearby
- Split: 2 Livingston tasks with Bozeman on Monday
- Other 2 Livingston tasks with Ennis on Wednesday (same direction)

### Use Case 4: Separate Training from Swaps
**Scenario:** Training requires longer crew time, separate from quick swaps  
**Solution:** Schedule training on dedicated training day

**Example:**
- Great Falls: 3 swaps + 1 training
- Split: Training on Tuesday (dedicated training day)
- Swaps on Thursday (quick field trip)

## Technical Details

### Data Structure
Each location card contains:
```javascript
{
  location: "Eliston",
  direction: "Southwest",
  tasks: [
    { taskType: "Swap", employee: "Cody Lund", ... },
    { taskType: "Reclaim", employee: "John Doe", ... },
    // ... more tasks
  ],
  taskCount: 5,
  maxUrgency: 80,
  estimatedTime: 65 // minutes
}
```

After split, the location appears on multiple days with different `tasks` arrays.

### Persistence
- Split task assignments are stored in the local `tripPlan` object
- Changes are **not saved to To Do List** until you click "Apply to Schedule"
- You can split, re-arrange, and experiment - nothing is permanent until you apply

### Applying to Schedule
When you click "Apply to Schedule":
- Each location instance (on each day) updates its tasks' scheduled dates
- Tasks are assigned to their respective days in the To Do List
- Start times are calculated based on route order

## Limitations

### Cannot Split Manual Tasks
- Manual tasks (from Manual Tasks sheet) cannot be split
- They are single-entry items, not task collections
- You can move the entire manual task to a different day, but not split it

### Cannot Split Single Task
- If a location has only 1 task, the Split button is disabled
- No reason to split - just drag the location card to a different day

### Target Day Must Be Different
- Cannot split to the same day (no point)
- Dialog will alert you if you try

## UI Elements

### Split Tasks Button
- **Icon:** ✂️ Split Tasks...
- **Location:** Task details popup footer
- **Enabled when:** Location has 2+ tasks and is not a manual task
- **Style:** Gray button, white text

### Split Tasks Dialog
- **Title:** ✂️ Split Tasks - [Location Name]
- **Checkboxes:** One per task with task icon, type, employee
- **Dropdown:** Target day selector (shows all work days)
- **Selected Counter:** "X selected" (updates live)
- **Buttons:**
  - "Cancel" - Close without changes
  - "✓ Split Tasks" - Apply the split (disabled until 1+ task selected)

### Task Item Display
- **Icon:** Task type icon (🔄 swap, 📚 training, ♻️ reclaim, etc.)
- **Title:** Task type (e.g., "Glove Swap", "Monthly Training")
- **Employee:** 👤 Employee name
- **Urgency:** 🔴 Overdue, 🟠 Due Soon, etc.
- **Click to select:** Entire row is clickable (not just checkbox)
- **Visual feedback:** Selected items highlight in light blue

## Workflow Example

### Real-World Scenario: Eliston Visit Planning

**Initial State:**
- Eliston appears in "Unassigned Locations" with 5 tasks
- Drag Eliston to Monday 02/02

**Current Plan:**
- Monday 02/02: Eliston (5 tasks, est. 1 hr 5 min)

**Realize you need 2 visits:**
1. Click on Eliston card
2. Task popup shows all 5 tasks
3. Click "✂️ Split Tasks..."
4. Check 2 tasks: Cody Lund glove swap, John Doe reclaim
5. Select "Wed Feb 5" from dropdown
6. Click "✓ Split Tasks"

**New Plan:**
- Monday 02/02: Eliston (3 tasks, est. 45 min)
- Wednesday 02/05: Eliston (2 tasks, est. 35 min)

**Apply to Schedule:**
- Click "Apply to Schedule"
- 3 tasks get scheduled for 02/02 with arrival time
- 2 tasks get scheduled for 02/05 with arrival time

## Tips & Tricks

### Tip 1: Preview Before Splitting
- Click location card to see all tasks **before** splitting
- Review urgency, employees, task types
- Decide which tasks make sense together

### Tip 2: Split by Urgency
- Sort mentally: overdue vs. can wait
- Move urgent tasks to earlier days
- Keep routine tasks for later

### Tip 3: Split by Task Type
- Group similar tasks: all swaps on one day, training on another
- Training requires more crew time - schedule on dedicated day
- Quick swaps can be combined with other locations

### Tip 4: Use Unassigned Sidebar
- After splitting, remaining tasks stay on original day
- If you remove all tasks, location goes back to "Unassigned"
- Drag from unassigned to any day to start fresh

### Tip 5: Experiment Freely
- Split, merge, re-split - nothing is saved until you click "Apply to Schedule"
- Use "Refresh Tasks" to reset to original state if needed

## Keyboard Shortcuts

- **Click checkbox** - Select/deselect task
- **Click anywhere on row** - Toggle selection
- **Escape** - Close dialog (cancel)
- **Enter** - Apply split (when enabled)

## Related Features

### Drag & Drop
- Still works! Drag entire location cards between days
- Split is for **dividing tasks within a location**
- Drag is for **moving entire location groups**

### Complete Tasks
- Mark tasks complete directly from the task details popup
- "✓ Mark Selected Complete" or "✓ Complete All"
- Completed tasks are removed from the trip plan

### Refresh Tasks
- Click "Refresh Tasks" to pull latest from To Do List
- Shows new tasks with 🆕 badge
- **Warning:** Refreshing resets custom splits (they're lost unless saved)

## Future Enhancements

Potential improvements for future versions:

1. **Save Split Preferences**
   - Remember how you split locations between sessions
   - Quick "Apply Last Split" button

2. **Auto-Split Suggestions**
   - System suggests optimal splits based on urgency + time constraints
   - "Too many tasks for one day - suggest split?"

3. **Split by Employee**
   - Quick buttons: "Split by crew", "Split by task type"
   - One-click organization

4. **Visual Split Indicator**
   - Show "1 of 2" badge on split location cards
   - Dotted lines connecting split instances across days

## Files Modified

- `src/TripPlanner.html`
  - Added `showSplitTasksDialog()` function
  - Added `applySplit()` function
  - Added `updateSplitSelectedCount()` function
  - Added `closeSplitDialog()` function
  - Added `getDayLabel()` helper function
  - Updated `showTaskDetails()` to accept `currentDayIndex` parameter
  - Updated `createLocationCard()` to add right-click context menu
  - Added CSS for `.split-task-item`, `.split-task-checkbox`, `.btn-split`, `.btn-cancel`, `.btn-apply`

## Deployment

- ✅ Deployed with `.\push.bat` on January 27, 2026
- ✅ No errors found
- ✅ Ready for testing

## Testing Checklist

- [ ] Open Trip Planner with location that has 2+ tasks
- [ ] Click location card → Task details popup appears
- [ ] Click "✂️ Split Tasks..." button
- [ ] Split dialog appears with all tasks listed
- [ ] Select 1+ tasks with checkboxes
- [ ] Verify "X selected" counter updates
- [ ] Select target day from dropdown
- [ ] Click "✓ Split Tasks"
- [ ] Verify location appears on both days with correct task counts
- [ ] Verify estimated time recalculates correctly
- [ ] Click "Apply to Schedule"
- [ ] Verify To Do List shows correct scheduled dates for each task
- [ ] Test right-click context menu (if location has 2+ tasks)
- [ ] Test merging: split tasks to day that already has that location
- [ ] Test cleanup: move all tasks from original day → location removed

## Known Issues

None at this time.

## Support

If you encounter issues:
1. Check console (F12) for JavaScript errors
2. Check Apps Script logs (Extensions → Apps Script → Executions)
3. Try "Refresh Tasks" to reload data
4. Close and reopen Trip Planner dialog

## Related Documentation

- `TRIP_PLANNER_FIX_SCHEDULED_TASKS.md` - Fix for preserving already-scheduled tasks
- `.github/copilot-instructions.md` - Phase 2B: Smart Route Optimizer
- `src/87-RoutePlanner.gs` - Backend route planning logic
- `src/TripPlanner.html` - Frontend Trip Planner UI
