# Late Submission Tracking for JHA/Safety Meeting Reports

**Implemented:** February 16, 2026

## Overview

This feature detects and tracks late submissions of JHA (Job Hazard Analysis) and Weekly Safety Meeting reports. A report is considered "late" if the email containing it was received in a different (later) week than the report date.

## Example

- **Report Date:** February 13, 2026 (Thursday, week of 02/08/2026)
- **Email Received:** February 16, 2026 (Monday, week of 02/15/2026)
- **Result:** ⚠️ LATE - The JHA was received after its week ended

## How It Works

### Detection Logic

```javascript
function isReportLate(reportDate, receivedDate) {
  var reportWeek = getWeekBoundaries(reportDate);   // Sunday-Saturday
  var receivedWeek = getWeekBoundaries(receivedDate);
  
  // Late if received after the report's week ended
  return receivedWeek.weekStart > reportWeek.weekStart;
}
```

### Visual Indicators

| Symbol | Meaning | Color |
|--------|---------|-------|
| ✅ | Report received on time | Green background |
| ✅L | Report received LATE | Yellow background, amber text |
| ❌ | Report missing | Red background |
| ⏳ | Pending (week not ended) | Yellow background |
| N/A | Day/item skipped | Gray background |

## Safety Compliance Sheet Changes

When you run "Process Safety Emails", the system now:

1. **Detects late submissions** by comparing report date vs email received date
2. **Marks in Safety Reports sheet** - Notes column shows "LATE SUBMISSION - Received MM/DD/YYYY"
3. **Shows in Safety Compliance sheet** - ✅L instead of ✅ for late items
4. **Tracks late count** - `lateCount` property in compliance data

## SMS Messaging

When sending SMS notifications, the message now distinguishes between:

### Missing Reports (not received at all)
> "Hi [Name], we did not receive a JHA for 02/03/2026, 02/04/2026 from your crew. This is just a reminder not to miss them this week. Was there an issue turning them in that you need help with?"

### Late Reports (received after deadline)
> "Hi [Name], the JHA for 02/13/2026 was received late. Be sure to submit them in the same week that they are due."

### Combined (some missing, some late)
> "Hi [Name], We did not receive a JHA for 02/03/2026 from your crew. Also, the JHA for 02/13/2026 was received late. Be sure to submit them in the same week that they are due. Was there an issue that you need help with?"

## New Menu Item

**Location:** Glove Manager → 🛡️ Safety → 🎨 Add Late Submission Formatting

Use this to add the ✅L formatting rule to existing Safety Compliance sheets that were created before this update.

## Functions Added

### 88-SafetyReports.gs

```javascript
// Check if a report was submitted late
isReportLate(reportDate, receivedDate)

// Add ✅L formatting to existing Safety Compliance sheet
addLateSubmissionFormatting()

// Menu function wrapper
menuAddLateSubmissionFormatting()
```

### ToDoSchedule.html

```javascript
// Build SMS message for late submissions
buildLateSubmissionMessage(task)

// Updated to handle late items
buildMissingSafetyReportMessage(task)
```

## Technical Details

### Data Flow

1. **Email Processing** (`processSafetyEmails`)
   - Parses email date (when received)
   - Parses report date (from subject line)
   - Calls `isReportLate()` to determine late status
   - Sets `reportMeta.isLate = true` if late

2. **Compliance Records** (saved to Safety Reports sheet)
   - Notes column: "LATE SUBMISSION - Received [date]"
   - Issue Description: "Report received LATE - submitted after week deadline"

3. **Compliance Calculation** (`calculateSafetyCompliance`)
   - Reads Safety Reports and checks Notes for "LATE SUBMISSION"
   - Tracks `jhaLateByDay[]` array per crew
   - Tracks `weeklyMeetingLate` flag per crew
   - Sets cell value to "✅L" for late items

4. **Sheet Update** (`updateComplianceSheet`)
   - Writes compliance data with ✅L where applicable
   - Conditional formatting shows yellow/amber for ✅L cells

### Week Boundaries

Weeks run Sunday (00:00:00) to Saturday (23:59:59)

```javascript
function getWeekBoundaries(date) {
  var day = date.getDay(); // 0 = Sunday
  var weekStart = new Date(date);
  weekStart.setDate(date.getDate() - day);
  weekStart.setHours(0, 0, 0, 0);
  
  var weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);
  weekEnd.setHours(23, 59, 59, 999);
  
  return { weekStart, weekEnd };
}
```

## Backward Compatibility

- Existing Safety Compliance sheets will continue to work
- Run "Add Late Submission Formatting" menu item to add ✅L formatting
- Already-processed emails won't be retroactively marked as late (re-process to detect)

