# Fix: SMS Message Format for Missing Safety Reports

## Date: February 12, 2026

## Issue Reported
User reports that the SMS message for Darrell Swann (missing 2 JHAs for last week) is "still wrong".

## Changes Made

### Enhanced `buildMissingSafetyReportSmsMessage()` in `88-SafetyReports.gs`

Added fallback date calculation when notes don't contain dates in expected format:

1. **Primary Extraction**: Parse dates from notes field
   - Format: `"Missing JHA: 02/03/2026, 02/04/2026"`
   - Regex: `/Missing JHA:\s*([^;]+)/i`

2. **NEW Fallback**: Calculate dates from day names in notes
   - If notes contain day names like "Mon", "Tue", etc.
   - Extract week start date from TaskID (e.g., `SafetyCompliance_013-26_02-02-2026`)
   - Calculate actual dates for each missing day

3. **Last Resort**: Use week date from TaskID
   - Message will say "for the week of 02/02/2026"

## Expected SMS Message Formats

### For JHA Only (1 day missing):
```
Hi Darrell, we did not receive a JHA for 02/03/2026 from your crew. Was there an issue turning it in that you need help with?
```

### For JHA Only (multiple days missing):
```
Hi Darrell, we did not receive a JHA for 02/03/2026, 02/04/2026 from your crew. Was there an issue turning them in that you need help with?
```

### For Weekly Meeting Only:
```
Hi Darrell, we did not receive a Weekly Safety Meeting for the week of 02/02/2026 from your crew. Was there an issue turning it in that you need help with?
```

### For Both JHA and Weekly Meeting:
```
Hi Darrell, we did not receive a JHA for 02/03/2026, 02/04/2026 or a Weekly Safety Meeting for the week of 02/02/2026 from your crew. Was there an issue turning them in that you need help with?
```

### Fallback (no dates available):
```
Hi Darrell, we did not receive a JHA for the week of 02/02/2026 from your crew. Was there an issue turning it in that you need help with?
```

## How to Verify

1. Open Tasks & Calendar dialog (Step 5 in Quick Actions)
2. Find Darrell Swann in the Safety Compliance section
3. Click the SMS button (💬 chat icon)
4. Check the message that opens in your messaging app
5. The message should include the specific dates of the missing JHAs

## If SMS Message Is Still Wrong

Please check the following:

1. **What does the Notes field contain in Task Metadata?**
   - Open the Task Metadata sheet
   - Find the row for Darrell Swann's task (TaskID starts with `SafetyCompliance_`)
   - Check column W (Notes) - what text is there?

2. **Check the Apps Script logs:**
   - Go to Extensions → Apps Script
   - Click "Executions" in the left sidebar
   - Find recent execution of `buildMissingSafetyReportSmsMessage`
   - Check the logged values for:
     - `notes = "..."`
     - `itemType = "..."`
     - `jhaDates = "..."`
     - `weekOf = "..."`

3. **Regenerate the task:**
   - If the Notes field is empty or malformed, delete the task row
   - Re-run "Process Safety Emails" to create a fresh task with correct notes

## Files Modified
- `src/88-SafetyReports.gs` - Enhanced `buildMissingSafetyReportSmsMessage()` function

## Deployment
Code pushed via `clasp push` on February 12, 2026

