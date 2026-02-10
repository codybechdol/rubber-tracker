# Fix: Safety Task Details Not Showing

**Date:** February 10, 2026

## Problem

Ben Lapka had 3 Safety Compliance tasks in the Task List, but there was no identification on the tasks to show what items were missing (JHA dates, Weekly Meeting, etc.).

## Root Cause

In `ToDoSchedule.html` at line 1929, the code was checking `if (weekOfMatch)` to determine if Weekly Meeting was missing. However, `weekOfMatch` contains the week date string (e.g., "02/01/2026"), NOT a boolean indicating if the meeting is missing.

This meant:
- If the task notes contained "week of MM/DD/YYYY", the code would ALWAYS add "Weekly Meeting" to the display
- This was adding misleading info even when Weekly Meeting wasn't actually missing

## Solution

Changed line 1929 from:
```javascript
if (weekOfMatch) {
```

To:
```javascript
if (notes.indexOf('Missing Weekly Safety Meeting') !== -1) {
```

Now the code properly checks for the actual text "Missing Weekly Safety Meeting" in the notes to determine if it should be displayed.

## What Gets Displayed Now

Each Missing Safety Report task in the Task List shows:

1. **Week of MM/DD/YYYY** - Blue text with calendar icon, identifies which week
2. **Missing:** section with details:
   - **JHA: Full week** (if all 5 days missing)
   - **JHA: 02/03/2026, 02/04/2026** (if 2 or fewer specific dates)
   - **JHA: 3 days missing** (if more than 2 but less than 5)
   - **Weekly Meeting** (if weekly meeting is missing)

## Example Display

```
Ben Lapka
📅 Week of 02/01/2026
Missing: JHA: 02/03/2026, 02/04/2026, Weekly Meeting
```

## Files Modified

- `src/ToDoSchedule.html` - Line 1929 - Fixed Weekly Meeting detection logic

## Related Files

The task creation logic in `88-SafetyReports.gs` was already correct - it creates proper notes in format:
- `Missing JHA: 02/03/2026, 02/04/2026; Missing Weekly Safety Meeting for week of 02/01/2026`

The display logic was just misinterpreting the notes.

## Testing

1. Generate Task Metadata (creates Missing Safety Report tasks)
2. Open Tasks & Calendar
3. Each Safety Compliance task should now show:
   - Week of date
   - Which items are missing (JHA dates, Weekly Meeting)
4. Information should match what's shown on Safety Compliance sheet

## Notes About Modified Emails

Regarding the user's concern about "(Modified-##)" emails:

**The system ALREADY handles Modified emails correctly:**

1. Email parsing (line 739 in 88-SafetyReports.gs):
   - Comment explicitly states: "Also handles: Job Hazard Report 02-09-2026_015-26_24193885_560 huckleberry...(Modified-23)"
   - Regex extracts date and job number, ignoring the (Modified-##) suffix
   - Logs show "Modified version" when detected

2. Compliance tracking:
   - Modified emails are written to Safety Reports sheet with correct Report Date
   - `calculateSafetyCompliance()` reads the Report Date and marks day as ✅
   - No special handling needed - Modified versions use same date as original

3. Example:
   - Original: "Job Hazard Report 02-09-2026_015-26_..."
   - Modified: "Job Hazard Report 02-09-2026_015-26_...(Modified-23)"
   - Both extract date: 02/09/2026 and job: 015-26
   - Both mark Monday as ✅ for crew 015-26

**No code changes needed for Modified emails - already working as designed.**

If a Modified email isn't marking a day as received:
1. Check the Safety Reports sheet - is the email listed there?
2. Check the Report Date column - does it match the expected date?
3. Check the Job Number column - does it match the crew?
4. If yes to all above, the compliance tracking should work correctly

Most likely issue would be:
- Email not being found (check Gmail search filters)
- Job number not recognized (crew not in Safety Compliance Config)
- Date parsing issue (check format in subject line)

