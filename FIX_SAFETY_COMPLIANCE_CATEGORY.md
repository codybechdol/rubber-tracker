# Fix: Safety Compliance Category and Due Date Display

**Date:** February 9, 2026  
**Issue:** Missing Safety Report tasks were showing under "Other" category instead of "Safety Compliance", and they were missing the due date display.

## Changes Made

### 1. Added Safety Compliance Category Detection
**File:** `src/ToDoSchedule.html`

Added detection in `getTaskCategory()` function to properly categorize Missing Safety Report tasks:

```javascript
// Safety Compliance - Missing Safety Reports (JHA/Weekly Meeting)
if (taskType === 'missing safety report' || taskType.indexOf('missing safety') !== -1 ||
    source === 'safety compliance' || source.indexOf('safety compliance') !== -1) {
  return 'Safety Compliance';
}

// Safety Equipment - from Safety Reports sheet
if (taskType === 'safety equipment' || taskType.indexOf('safety equipment') !== -1 ||
    source === 'safety reports' || source.indexOf('safety reports') !== -1) {
  return 'Safety Equipment';
}
```

### 2. Added Category Configuration
**File:** `src/ToDoSchedule.html`

Updated category order, icons, and colors to include Safety Compliance and Safety Equipment:

```javascript
var categoryOrder = ['Training', 'Rubber Changes', 'Certs', 'Safety Compliance', 'Safety Equipment', 'Manual Tasks', 'Other'];

var categoryIcons = {
  'Training': 'bi-mortarboard',
  'Rubber Changes': 'bi-arrow-left-right',
  'Certs': 'bi-file-earmark-medical',
  'Safety Compliance': 'bi-shield-check',      // NEW
  'Safety Equipment': 'bi-wrench',              // NEW
  'Manual Tasks': 'bi-pencil-square',
  'Other': 'bi-three-dots'
};

var categoryColors = {
  'Training': '#1a73e8',
  'Rubber Changes': '#34a853',
  'Certs': '#ea4335',
  'Safety Compliance': '#f9ab00',               // NEW (amber)
  'Safety Equipment': '#ff6d00',                // NEW (orange)
  'Manual Tasks': '#9c27b0',
  'Other': '#5f6368'
};
```

### 3. Added Due Date Display for Safety Compliance Tasks
**File:** `src/ToDoSchedule.html`

Modified `renderTaskRow()` function to show due date under employee name for Missing Safety Report tasks:

```javascript
if (task.employee) {
  html += '<div class="text-muted small"><i class="bi bi-person"></i> ' + task.employee + '</div>';
  
  // Show due date for Safety Compliance tasks (Missing Safety Reports)
  var taskType = (task.taskType || '').toLowerCase();
  if (taskType === 'missing safety report' || taskType.indexOf('missing safety') !== -1) {
    if (task.dueDate) {
      var dueDateStr = formatDisplayDate(task.dueDate);
      var today = new Date();
      today.setHours(0, 0, 0, 0);
      var dueDate = new Date(task.dueDate);
      dueDate.setHours(0, 0, 0, 0);
      var isOverdue = dueDate < today;
      var dueDateColor = isOverdue ? '#d32f2f' : '#5f6368';
      html += '<div class="text-muted small" style="color: ' + dueDateColor + '; margin-left: 20px;">Due: ' + dueDateStr + '</div>';
    }
  }
}
```

## Visual Changes

### Before
- Missing Safety Report tasks appeared under "⋮ Other" category
- No due date displayed
- No visual distinction from other tasks

### After
- Missing Safety Report tasks appear under "🛡️ Safety Compliance" category (amber color)
- Due date displays under employee name with format "Due: MM/DD/YYYY"
- Overdue dates show in red (#d32f2f), current/future dates in gray (#5f6368)
- Tasks are grouped with proper icon (bi-shield-check)

## Category Hierarchy

Tasks are now organized in this order:
1. **Training** (🎓 Blue) - Training Tracking tasks
2. **Rubber Changes** (⇄ Green) - Swaps and Reclaims
3. **Certs** (📋 Red) - Expiring Certifications
4. **Safety Compliance** (🛡️ Amber) - Missing Safety Reports (JHA/Weekly Meeting)
5. **Safety Equipment** (🔧 Orange) - Safety Reports equipment issues
6. **Manual Tasks** (✏️ Purple) - User-created tasks
7. **Other** (⋮ Gray) - Everything else

## Testing Steps

1. **Refresh the application**
   - Press F5 or reload the page

2. **Open Task List**
   - Glove Manager → Schedule & To-Do → 📅 Tasks & Calendar
   - Click **Task List** tab

3. **Find Elliston location group**
   - Expand the location
   - Expand Benjamin Lapka foreman group

4. **Verify Safety Compliance section**
   - Should see "🛡️ Safety Compliance" header (amber color)
   - Should NOT see these tasks under "Other"

5. **Verify due date display**
   - Each Missing Safety Report task should show:
     - Employee: Benjamin Lapka
     - **Due: MM/DD/YYYY** (below employee name, indented)
     - Red text if overdue, gray if current/future

## Expected Display Format

```
📍 Elliston (4 tasks)
  👤 Benjamin Lapka (4 tasks)
    🛡️ Safety Compliance (4)
      ⚠️ Missing: JHA + Weekly Meeting
      📋 Safety Compliance
      👤 Benjamin Lapka
          Due: 02/08/2026  ← NEW (red if overdue)
      
      ⚠️ Missing: JHA + Weekly Meeting
      📋 Safety Compliance
      👤 Benjamin Lapka
          Due: 02/08/2026  ← NEW
```

## Files Modified

- `src/ToDoSchedule.html` (3 changes, ~30 lines added)
  - Added Safety Compliance category detection
  - Added category configuration (order, icon, color)
  - Added due date display for Safety Compliance tasks

## Deployment

✅ Successfully deployed via `.\push.bat` on February 9, 2026
- All 50 files pushed
- No syntax errors
- Warnings are pre-existing

## Related Documentation

- `FIX_MISSING_SAFETY_REPORTS_NOT_SHOWING.md` - Original fix for tasks not appearing
- `TEST_MISSING_SAFETY_REPORTS.md` - Testing guide
- `SAFETY_COMPLIANCE_TRACKING.md` - Compliance system overview

## Notes

- Safety Equipment tasks (from Safety Reports sheet) also have their own category now
- Both categories use safety-themed icons (shield and wrench)
- Color scheme: Amber for compliance (warnings/attention), Orange for equipment (maintenance)
- Due dates only show for Safety Compliance tasks, not Safety Equipment tasks
- The due date is formatted using the existing `formatDisplayDate()` function for consistency

