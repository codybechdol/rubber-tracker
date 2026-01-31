# Fix: Swap Task Employee Name Formatting & Changeout Date Display

## Changes Made

### Employee Names - Bold and Color-Coded by Task Type

**Problem**: Swap task employee names were displayed in regular gray text, making them less visible than cert tasks which had bold blue names.

**Solution**: Made swap task employee names bold and green to provide visual distinction while maintaining consistency with cert task formatting.

**What Changed**:
- File: `src/ToDoSchedule.html` (lines ~1468-1510)
- Added detection for swap tasks: checks both `task.taskType` and `task.source` for "swap" keywords
- Added conditional formatting based on task type:
  - **Cert tasks**: Bold blue (#1a73e8) with filled person icon
  - **Swap tasks**: Bold green (#34a853) with filled person icon  
  - **Other tasks**: Regular gray with outline person icon

**Code Logic**:
```javascript
var isSwapTask = taskTypeLower === 'swap' || 
                 taskTypeLower.indexOf('swap') !== -1 || 
                 taskSourceLower.indexOf('glove swaps') !== -1 || 
                 taskSourceLower.indexOf('sleeve swaps') !== -1;

if (isCert) {
  // Bold blue
  html += '<div style="color: #1a73e8;"><i class="bi bi-person-fill"></i> <strong>' + task.employee + '</strong></div>';
} else if (isSwapTask) {
  // Bold green
  html += '<div style="color: #34a853;"><i class="bi bi-person-fill"></i> <strong>' + task.employee + '</strong></div>';
} else {
  // Regular gray
  html += '<div class="text-muted small"><i class="bi bi-person"></i> ' + task.employee + '</div>';
}
```

---

### Changeout Date Display - Under Employee Name

**Problem**: The changeout date (from column E "Change Out Date Assigned" in Glove Swaps / Sleeve Swaps sheets) was showing in the separate "Due Date" area, not associated with the employee name.

**Solution**: Moved the changeout date to display directly under the employee name for swap tasks, similar to how cert tasks show expiration dates.

**What Changed**:
- Changeout date now displays under employee name with left indentation
- Format: "🗓️ Change Out: MM/DD/YYYY"
- Color: Gray (normal) or Red bold (if overdue)
- Only shown for swap tasks that have both employee name AND due date
- Due date field removed from its original location for swap tasks (to avoid duplication)

**Visual Layout**:
```
Before:
  📦 Swap
  🧤 Glove Swaps
  👤 Cody Lund
  🗓️ Change Out: 2/20/2026

After:
  📦 Swap
  🧤 Glove Swaps
  👤 Cody Lund (bold green)
     🗓️ Change Out: 2/20/2026 (indented, under name)
```

---

## Task Type Formatting Summary

| Task Type | Employee Name | Icon | Color | Due Date Location |
|-----------|---------------|------|-------|-------------------|
| **Cert Expiring** | **Bold** | 👤 (filled) | Blue (#1a73e8) | Below name: "Expires: MM/DD/YYYY" |
| **Glove/Sleeve Swap** | **Bold** | 👤 (filled) | Green (#34a853) | Below name: "Change Out: MM/DD/YYYY" |
| **Training/Manual/Other** | Regular | 👤 (outline) | Gray (#5f6368) | Separate line: "Due: MM/DD/YYYY" |

---

## Visual Examples

### Cert Task (Blue)
```
┌─────────────────────────────────────┐
│ 📜 Cert Expiring                    │
│ 📋 Expiring Certs                   │
│ 👤 Taylor Goff (bold blue)          │
│    🗓️ Expires: 2/10/2025 (red)     │
├─────────────────────────────────────┤
│ Scheduled Date: [01/29/2026]       │
│ Start Time: [--:--] End: [--:--]   │
└─────────────────────────────────────┘
```

### Swap Task (Green)
```
┌─────────────────────────────────────┐
│ 📦 Swap                             │
│ 🧤 Glove Swaps                      │
│ 👤 Cody Lund (bold green)           │
│    🗓️ Change Out: 2/20/2026        │
├─────────────────────────────────────┤
│ Scheduled Date: [02/20/2026]       │
│ Start Time: [--:--] End: [--:--]   │
└─────────────────────────────────────┘
```

### Manual Task (Gray)
```
┌─────────────────────────────────────┐
│ 📝 Manual Task                      │
│ 📋 Manual Tasks                     │
│ 👤 John Smith (regular gray)        │
├─────────────────────────────────────┤
│ Scheduled Date: [01/30/2026]       │
│ Start Time: [09:00] End: [10:00]   │
└─────────────────────────────────────┘
```

---

## Data Source

The changeout date comes from:
- **Glove Swaps sheet**: Column E "Change Out Date Assigned"
- **Sleeve Swaps sheet**: Column E "Change Out Date Assigned"

This date is pulled by `collectSwapTasks()` function in `76-SmartScheduling.gs` and stored in `task.dueDate` property.

---

## Deployment

✅ **Deployed**: January 27, 2026 via `.\push.bat`

**Files Modified**:
1. `src/ToDoSchedule.html` - Employee name formatting and changeout date display logic
2. `.github/copilot-instructions.md` - Updated completed features log

---

## Testing Steps

1. Open Schedule dialog → Tasks tab
2. **Test Cert Tasks**:
   - Verify employee names are bold and blue
   - Verify "Expires: MM/DD/YYYY" shows under name
3. **Test Swap Tasks**:
   - Verify employee names are bold and green (different from certs)
   - Verify "Change Out: MM/DD/YYYY" shows under name (indented)
   - Verify overdue dates show in red
4. **Test Other Tasks**:
   - Verify employee names are regular gray (not bold)
   - Verify due dates (if any) show in separate location

---

## Color Palette

- **Cert Blue**: #1a73e8 (Google Blue)
- **Swap Green**: #34a853 (Google Green)
- **Default Gray**: #5f6368 (Google Gray)
- **Overdue Red**: #ea4335 (Google Red)

These colors are consistent with Google Material Design and the rest of the Rubber Tracker UI.

---

## Related Documentation
- See `FIX_CRANE_CERT_VISIBILITY.md` for crane cert visibility fixes
- See `FIX_MEC_SCHEDULE_BUTTON_AND_CERTS_RELOCATION.md` for MEC cert handling
- See `.github/copilot-instructions.md` for complete feature log
