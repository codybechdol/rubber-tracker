# Missing Report Resolution Dialog Feature

## Date: February 12, 2026

## Overview

This feature replaces the "Send Class Schedule" button (Stage 2) for Missing Safety Report tasks with a new "Record Resolution" dialog. The dialog allows you to record why each missing day's JHA or Weekly Safety Meeting report was not received, and updates the Safety Compliance sheet with visual status indicators.

## Problem Solved

Previously, after sending an SMS notification (Stage 1) for a Missing Safety Report task, the UI showed a "Send Class Schedule" button (Stage 2). This was incorrect because:
- Class scheduling is for cert renewals (1st Aid/CPR, etc.)
- Missing Safety Reports need a different workflow - recording why the report was missing

## New Workflow

1. **Missing Safety Report task appears in Task List** (under Safety Compliance category)
2. **Click SMS button (Stage 1)** → Opens notification SMS with pre-filled message
   - After sending, Safety Compliance sheet ❌ cells turn to ❌🔔 (orange = notified)
3. **Click clipboard button (Stage 2)** → Opens new "Record Resolution" dialog
4. **Select a reason for each missing day:**
   - **Did Not Do** (❌D) - Crew didn't perform the JHA/Meeting (serious)
   - **Complete But Forgot to Send** (❌F) - They did it but forgot to submit (excusable)
   - **App Didn't Send** (❌A) - Technical issue, not their fault
   - **Did Not Work** (❌W) - Crew wasn't working that day (equivalent to N/A)
5. **Click "Save Resolutions"** → Updates Safety Compliance sheet and auto-completes the task

## Visual Status Indicators on Safety Compliance Sheet

| Status Code | Meaning | Color |
|-------------|---------|-------|
| ✅ | Received | Green |
| ❌ | Missing (unresolved) | Red |
| ❌🔔 | Notified (awaiting response) | Orange |
| ❌D | Did Not Do | Dark Red (bold) |
| ❌F | Forgot to Send | Yellow |
| ❌A | App Issue | Light Orange |
| ❌W | Did Not Work | Gray |
| N/A | Not Applicable (weekend, etc.) | Light Gray |

## How to Apply Formatting to Existing Sheet

If you already have a Safety Compliance sheet, run:

**Menu:** Glove Manager → 🛡️ Safety Reports → 🎨 Add Resolution Formatting

This adds the conditional formatting rules for the new status codes.

## Files Modified

- `src/ToDoSchedule.html` - New modal HTML, JavaScript functions
- `src/88-SafetyReports.gs` - Backend functions for recording resolutions
- `src/Code.gs` - Menu item

## New Functions

### ToDoSchedule.html (JavaScript)
- `openMissingReportResolutionModal(task, index)` - Opens the resolution dialog
- `getDayNameFromDate(dateStr)` - Converts date to day name
- `saveResolutions()` - Collects selections and calls server

### 88-SafetyReports.gs (Server)
- `recordMissingReportResolutions(taskId, weekOf, resolutions)` - Updates Safety Compliance sheet with resolution codes
- `getDayColumnFromDate(dateStr)` - Maps date to sheet column (Mon, Tue, etc.)
- `completeTaskByTaskId(taskId, notes)` - Marks Task Metadata entry as complete
- `markSafetyReportNotified(taskId)` - Updates ❌ cells to ❌🔔 when SMS sent
- `addResolutionFormattingRules()` - Adds conditional formatting for new status codes
- `menuAddResolutionFormatting()` - Menu function for above

## Example

**Before Resolution:**
```
Week Start | Job Number | Foreman | Mon | Tue | Wed | Thu | Fri | Weekly Meeting | Status
02/01/2026 | 013-26     | Darrell | ✅   | ❌   | ❌   | ✅   | ✅   | ❌              | Missing Reports
```

**After SMS Sent:**
```
Week Start | Job Number | Foreman | Mon | Tue | Wed | Thu | Fri | Weekly Meeting | Status
02/01/2026 | 013-26     | Darrell | ✅   | ❌🔔 | ❌🔔 | ✅   | ✅   | ❌🔔            | Missing Reports
```

**After Resolution Recorded:**
```
Week Start | Job Number | Foreman | Mon | Tue | Wed | Thu | Fri | Weekly Meeting | Status
02/01/2026 | 013-26     | Darrell | ✅   | ❌F  | ❌D  | ✅   | ✅   | ❌F             | Resolved
```

(Tue: Forgot to send, Wed: Did Not Do, Weekly Meeting: Forgot to send)

## Code Pushed

Deployed via `.\push.bat` on February 12, 2026

