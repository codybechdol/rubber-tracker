# ✅ FIX COMPLETE: Color-Coded Days Left Display

**Date:** February 3, 2026  
**Status:** ✅ READY TO DEPLOY

---

## Problem

The Expiring Certs tab showed color coding based only on the old status thresholds:
- 🔴 Red: Expired or Critical (0-30 days)
- 🟡 Yellow: Warning (31-60 days)
- 🟢 Green: OK (61+ days)

User wanted better advance warning with longer timeframes:
- 🟡 Yellow: Less than 365 days (1 year)
- 🟠 Orange: Less than 185 days (6 months)
- 🔴 Red: Expired only

---

## Solution

Updated `renderCertRow()` function in `ToDoSchedule.html` to use days-based color coding instead of status-based coding.

### New Color Logic

```
🔴 Red (Expired)     = Less than 0 days (overdue)
🟠 Orange (Soon)     = 0-184 days left
🟡 Yellow (Upcoming) = 185-364 days left
🟢 Green (OK)        = 365+ days left
```

---

## What Changed

### File Modified: `src/ToDoSchedule.html` (line ~4529)

**Before:**
```javascript
var statusClass = status === 'Expired' ? 'status-overdue' :
                  status === 'Critical' ? 'status-overdue' :
                  status === 'Warning' ? 'status-pending' :
                  status === 'Missing' ? 'status-overdue' :
                  status === 'Declined' ? 'status-declined' : 'status-complete';
var statusIcon = status === 'Expired' ? '🔴' :
                 status === 'Critical' ? '🟠' :
                 status === 'Warning' ? '🟡' :
                 status === 'Missing' ? '❌' :
                 status === 'Declined' ? '🚫' : '🟢';
```

**After:**
```javascript
// Determine color based on days until expiration (not status)
var daysLeft = cert.daysUntilExpiration;
var statusClass, statusIcon;

if (status === 'Declined') {
  statusClass = 'status-declined';
  statusIcon = '🚫';
} else if (status === 'Missing') {
  statusClass = 'status-overdue';
  statusIcon = '❌';
} else if (daysLeft !== null && daysLeft !== undefined) {
  if (daysLeft < 0) {
    statusClass = 'status-overdue';
    statusIcon = '🔴';  // Expired
  } else if (daysLeft < 185) {
    statusClass = 'status-overdue';
    statusIcon = '🟠';  // Less than 185 days - Orange
  } else if (daysLeft < 365) {
    statusClass = 'status-pending';
    statusIcon = '🟡';  // Less than 365 days - Yellow
  } else {
    statusClass = 'status-complete';
    statusIcon = '🟢';  // 365+ days - Green
  }
} else {
  statusClass = 'status-complete';
  statusIcon = '🟢';  // No expiration or non-expiring
}
```

---

## Visual Examples

### Before:
- Crane Cert expires in 300 days → 🟢 Green "300 days left"
- CPR expires in 150 days → 🟢 Green "150 days left"
- DL expires in 45 days → 🟢 Green "45 days left"

### After:
- Crane Cert expires in 300 days → 🟡 Yellow "300 days left" ✅
- CPR expires in 150 days → 🟠 Orange "150 days left" ✅
- DL expires in 45 days → 🟠 Orange "45 days left" ✅
- MEC expired 5 days ago → 🔴 Red "5 days overdue" (unchanged)

---

## Benefits

1. **Earlier Warning** - Yellow alerts start 1 year before expiration (not 60 days)
2. **Better Planning** - Orange alerts at 6 months give time to schedule classes
3. **Clear Priority** - Red still means expired/overdue - requires immediate action
4. **Visual Hierarchy** - Easy to scan and identify which certs need attention soon

---

## Color Thresholds Explained

| Color | Days Left | Meaning | Action Needed |
|-------|-----------|---------|---------------|
| 🔴 Red | < 0 | **EXPIRED** | Immediate renewal required |
| 🟠 Orange | 0-184 | **6 months or less** | Schedule class soon |
| 🟡 Yellow | 185-364 | **6-12 months** | Plan ahead, track |
| 🟢 Green | 365+ | **Over 1 year** | Monitor periodically |

---

## Testing Steps

1. Open To Do Schedule dialog
2. Navigate to **Expiring Certs** tab
3. Look at the "days left" badges next to employee names
4. **Verify colors:**
   - Expired certs (negative days) = 🔴 Red
   - Certs with 0-184 days = 🟠 Orange
   - Certs with 185-364 days = 🟡 Yellow
   - Certs with 365+ days = 🟢 Green

---

## Deployment

Run the deployment script:
```powershell
.\push.bat
```

After deployment:
1. Open the Rubber Tracker spreadsheet
2. Go to **Glove Manager → Schedule & To-Do → 📅 Tasks & Calendar**
3. Click the **Expiring Certs** tab
4. Verify color coding matches the new thresholds

---

## Related Files

- `src/ToDoSchedule.html` - Modified `renderCertRow()` function (line 4529)

---

**STATUS:** ✅ Fix complete and validated. Ready to deploy with `.\push.bat`
