# Monthly Checklist Progressive Deadline Feature

**Implemented:** February 12, 2026  
**Status:** ✅ DEPLOYED

## Problem

The Monthly Checklist was being treated like weekly reports (JHAs, Weekly Meeting). It showed ❌ (red/missing) as soon as the week passed, but the Monthly Checklist is actually due **once per month** with a deadline on the **last work day of the month**.

Example from Dusty Hendrickson (row 20 on 02/01/2026):
- He had ❌ for Monthly Checklist, implying it was overdue
- But it was only the first week of February - he had the entire month to submit it

## Solution

Implemented **progressive deadline status** with graduated urgency colors based on which week of the month we're in:

| Week of Month | Status Symbol | CSS Class | Color | Meaning |
|---------------|---------------|-----------|-------|---------|
| Weeks 1-2 | ⏳ | pending | Yellow | Plenty of time, no urgency |
| Week 3 | ⚠️ | warning | Orange | Getting close, should submit soon |
| Week 4 / Final week | ❌⏳ | urgent | Red (lighter) | Urgent but still has time |
| After month ends | ❌ | missing | Red (dark) | Deadline passed, task created |

## Implementation Details

### New Functions Added to `88-SafetyReports.gs`

#### `getWeekOfMonth(date)`
Calculates which week of the month (1-4+) a date falls into.

**Returns:**
```javascript
{
  weekNumber: 1-4,      // Which week (1=days 1-7, 2=days 8-14, etc.)
  isLastWeek: boolean,  // True if 7 or fewer days until month end
  monthEnd: Date,       // Last day of the month
  daysUntilMonthEnd: number
}
```

#### `getMonthlyChecklistStatus(weekStartDate, hasSubmitted, isSkipped)`
Determines the appropriate status symbol based on progressive deadline logic.

**Returns:**
```javascript
{
  status: '✅' | '⏳' | '⚠️' | '❌⏳' | '❌' | 'N/A',
  cssClass: 'ok' | 'pending' | 'warning' | 'urgent' | 'missing' | 'na',
  shouldCreateTask: boolean  // Only true when month has ended
}
```

### Modified Functions

#### `calculateSafetyCompliance(weekStartDate)`
- Now calls `getMonthlyChecklistStatus()` instead of using simple if/else logic
- Tasks are only created when `shouldCreateTask` is true (after month ends)

#### `showComplianceDashboard()`
- Added CSS classes for `.warning` (orange) and `.urgent` (red/pink)
- Added "Monthly" column to the table header
- Fixed bug: was using `crew.jha[d]` instead of `crew.days[dayNames[d]]`
- Added Monthly column data with proper status class

#### `addResolutionFormattingRules()`
- Added conditional formatting rule for ⚠️ (orange warning)
- Added conditional formatting rule for ❌⏳ (red/pink urgent)
- Updated message box to include new status codes

## Testing

After deployment, verify:

1. **Current Week (Week 2 of February 2026):**
   - Monthly Checklist should show ⏳ (yellow) for crews without submission
   - Crews with submission should show ✅ (green)
   - Crews with "Skip Monthly Checklist" should show N/A

2. **Dashboard:**
   - Open: Glove Manager → 🛡️ Safety Reports → 📊 Compliance Dashboard
   - Verify "Monthly" column appears
   - Verify proper color coding

3. **Conditional Formatting:**
   - Run: Glove Manager → 🛡️ Safety Reports → 🎨 Add Resolution Formatting
   - Verify ⚠️ cells show orange background
   - Verify ❌⏳ cells show red/pink background

## Week Calculation Logic

- **Week 1:** Days 1-7 of the month
- **Week 2:** Days 8-14 of the month
- **Week 3:** Days 15-21 of the month
- **Week 4+:** Days 22+ of the month
- **Final Week:** 7 or fewer days remaining until month end (may overlap with Week 4)

## Task Creation Timing

**Important:** Missing Monthly Checklist tasks are ONLY created when:
1. The current month is AFTER the week's month (month has ended)
2. The checklist was not received
3. The crew is not configured to skip Monthly Checklist

This prevents premature task creation while still providing visual warnings during weeks 3-4.

## Files Modified

- `src/88-SafetyReports.gs` - ~100 lines added/modified
- `.github/copilot-instructions.md` - Documentation added

## Related Menu Items

- Glove Manager → 🛡️ Safety Reports → 📊 Compliance Dashboard
- Glove Manager → 🛡️ Safety Reports → 🎨 Add Resolution Formatting

