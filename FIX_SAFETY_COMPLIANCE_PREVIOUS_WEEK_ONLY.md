# Fix: Safety Compliance Tasks - Previous Week Only

**Date:** February 9, 2026

## Problem

The Missing Safety Report tasks were being created for ALL historical weeks with missing items, resulting in:
- Multiple tasks per foreman (one for each week with missing reports)
- Ben Lapka had 10+ tasks instead of 1
- Task List was cluttered with old weeks that should have been archived

Additionally, Monthly Checklist was being included in task creation, but it should be ignored for Task List purposes.

## Expected Behavior

1. **Only PREVIOUS work week** creates tasks (e.g., week of 02/01/2026)
2. **Current week** (02/08/2026) is NOT added to Task List
3. **Older weeks** (01/25/2026 and earlier) are archived when "Archive Metadata" is run
4. **Monthly Checklist** is tracked but does NOT create tasks - only JHAs and Weekly Meeting

## Changes Made

### 1. `finalizePastWeeksCompliance()` in `88-SafetyReports.gs`

**Before:** Looped through ALL past weeks with "Pending" status and created tasks for each

**After:** 
- Calculates PREVIOUS work week boundaries (Sunday-Saturday that just ended)
- Only processes that specific week
- Ignores all other weeks (they get archived instead)

### 2. `createMissingReportTasks()` in `88-SafetyReports.gs`

**Before:** Created tasks for missing JHAs + Weekly Meeting + Monthly Checklist

**After:**
- Removed Monthly Checklist from `itemTypeParts` and `notesParts`
- Only creates tasks for missing JHAs and Weekly Meeting
- Skip condition now: `if (missingJHAs.length === 0 && !missingWeekly) continue;`

### 3. `buildMissingSafetyReportSmsMessage()` in `88-SafetyReports.gs`

**Before:** Included Monthly Checklist in SMS message

**After:** 
- Removed Monthly Checklist references
- SMS only mentions JHAs and Weekly Safety Meeting

### 4. `archiveOldCompletedTasks()` in `Code.gs`

**Before:** Only archived completed tasks older than X days

**After:**
- Also archives Safety Compliance tasks (`TaskType = "Missing Safety Report"`) that are from weeks OLDER than the previous work week
- This cleans up old safety compliance tasks regardless of completion status
- Returns breakdown of archived counts by type

### 5. `collectMissingSafetyReportTasks()` in `76-SmartScheduling.gs`

**Before:** Collected ALL Missing Safety Report tasks from Task Metadata

**After:**
- Calculates previous work week boundaries
- Only collects tasks where `DueDate` falls within the previous week
- Silently skips tasks from other weeks

## How to Clean Up Existing Duplicate Tasks

1. Go to **Glove Manager → Schedule & To-Do → 🗄️ Archive Metadata**
2. Enter any number of days (even 0 will work)
3. This will:
   - Archive completed tasks older than X days
   - Archive ALL Safety Compliance tasks older than previous week
4. The Task List will then only show tasks from the previous work week

## Expected Result After Fix

For today (February 9, 2026):
- **Previous week:** 02/01/2026 - 02/07/2026 (Saturday)
- **Current week:** 02/08/2026 - 02/14/2026 (not added to Task List)

Each foreman with missing items from the previous week (02/01/2026) will have **ONE task** showing:
- Darrell Swann - 1 task
- Matt Miller - 1 task  
- Corey Allen - 1 task
- Waco Worts - 1 task
- Tony Harmon - 1 task
- Kameron Jones - 1 task
- Keenan O'Keefe - 1 task
- Ben Lapka - 1 task (instead of 10+)

## SMS Message Format

The SMS now only mentions JHAs and Weekly Meeting:

**If missing specific JHA days + Weekly Meeting:**
```
We did not receive JHAs or Weekly Safety Meeting from your crew for the week of 02/01/2026. Here are the items we are missing: JHA - 02/03/2026, 02/04/2026. Safety Meeting - 02/01/2026. This is just a reminder not to miss them this week. Was there an issue turning them in that you need help with?
```

**If missing entire week of JHAs + Weekly Meeting:**
```
We did not receive JHAs or Weekly Safety Meeting from your crew for the entire week of 02/01/2026. This is just a reminder not to miss them this week. Was there an issue turning them in that you need help with?
```

## Files Modified

1. `src/88-SafetyReports.gs`
   - `finalizePastWeeksCompliance()` - Only process previous week
   - `createMissingReportTasks()` - Exclude Monthly Checklist
   - `buildMissingSafetyReportSmsMessage()` - Remove Monthly Checklist from SMS

2. `src/Code.gs`
   - `archiveOldCompletedTasks()` - Also archive old Safety Compliance tasks
   - `getTasksWithMetadata()` - Phase 5 now filters Missing Safety Report tasks to only include previous week

3. `src/76-SmartScheduling.gs`
   - `collectMissingSafetyReportTasks()` - Filter to previous week only

4. `src/ToDoSchedule.html`
   - Improved display of Missing Safety Report tasks to show "Week of MM/DD/YYYY" prominently
   - Shows what's missing: "Missing: JHA: 3 days missing, Weekly Meeting"

## Display Improvements

Each Missing Safety Report task now shows:
- **Week of 02/01/2026** (in blue, with calendar icon) - Identifies which week
- **Missing: JHA: Full week, Weekly Meeting** - Shows what's missing

This makes it clear which week each task is for and what items are missing.

