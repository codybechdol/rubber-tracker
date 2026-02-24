# Fix: Crew Visit Config & Training - Job Prefix Exclusion

**Date:** February 12, 2026

## Problem

JT Kale (and other Light Duty employees) were incorrectly appearing in:
1. **Crew Visit Config** - Job 005-26 showed as an active crew with JT Kale as crew lead
2. **Training Tasks** - JT Kale's training tasks appeared under "Unknown" location in the Task List

This happened because:
- `getActiveCrews()` didn't filter by job number prefix
- `getCrewLead()` returned JT Kale even though he was on Light Duty (005-26.27)
- Training task collection used the crew lead name from Training Tracking sheet without checking their current job status

## Solution

Implemented **job prefix-based exclusion** for Crew Visits and Training:
- Employees with job numbers starting with excluded prefixes (default: 002, 005) are excluded
- When JT moves to Light Duty (005-26.27), he's automatically excluded
- When JT returns to a field crew (e.g., 013-26.1), he's automatically included
- No manual exclusion lists needed - it's all based on job number

### Excluded Prefixes

| Prefix | Meaning |
|--------|---------|
| 002 | Lost/Destroyed/In Testing equipment (not real employees) |
| 005 | Light Duty employees (office-based, no field visits needed) |

### What's Affected

| Feature | Excluded? |
|---------|-----------|
| Crew Visit Config | ✅ Yes - Light Duty crews won't appear |
| Training Tasks | ✅ Yes - Light Duty employees won't get training tasks |
| Glove/Sleeve Swaps | ❌ No - Still managed normally |
| Expiring Certs | ❌ No - Certs still tracked |

## Files Modified

### `src/75-Scheduling.gs`
- Added `DEFAULT_EXCLUDED_JOB_PREFIXES` constant
- Added `getExcludedJobPrefixesInternal()` function
- Added `isExcludedJobPrefix(jobNumber)` helper function
- Modified `getActiveCrews()` to skip excluded job prefixes
- Modified `getCrewLead()` to skip excluded job prefixes
- Modified `getCrewSize()` to skip excluded job prefixes
- Added `refreshCrewVisitConfig()` function (preserves user data while updating)

### `src/76-SmartScheduling.gs`
- Modified `collectTrainingTasks()` to:
  - Build employee name → job number map
  - Check assignee's current job number before creating training task
  - Skip training tasks for employees with excluded job prefixes

### `src/Code.gs`
- Added `getExcludedJobPrefixes()` API function
- Added `saveExcludedJobPrefixes()` API function
- Added menu item: "🔄 Refresh Crew Visit Config"

### `src/ToDoConfig.html`
- Added "🚫 Exclude Job Prefixes" section in Settings tab
- Added JavaScript functions to load/save/manage excluded prefixes
- Visual display of excluded prefixes with add/remove capabilities

## How to Use

### Configure Excluded Prefixes
1. Go to **Glove Manager → Schedule & To-Do → ⚙️ Schedule Config**
2. Scroll to **🚫 Exclude Job Prefixes** section
3. Current excluded prefixes show as red badges
4. Click X to remove a prefix
5. Enter a new 3-digit prefix and click Add

### Refresh Crew Visit Config
1. Go to **Glove Manager → Schedule & To-Do → 🔄 Refresh Crew Visit Config**
2. This updates crew membership while preserving your customizations:
   - ✅ Preserved: Notes, Visit Frequency, Last Visit Date, Priority
   - 🔄 Updated: Crew Lead, Crew Size, Location, Drive Time
3. Crews with no field employees (all on Light Duty) are removed
4. New crews are added automatically

## Example: JT Kale Scenario

| State | Job Number | Prefix | In Crew Visits? | In Training Tasks? |
|-------|------------|--------|-----------------|-------------------|
| Light Duty | 005-26.27 | 005 | ❌ No | ❌ No |
| Returns to field | 013-26.5 | 013 | ✅ Yes | ✅ Yes |

When JT returns from Light Duty:
1. Run Crew Import with the new week's schedule
2. JT's job number updates to his new crew (e.g., 013-26.5)
3. Run "Refresh Crew Visit Config"
4. JT automatically appears in crew visits and training tasks

## Testing

1. **Verify Crew Visit Config:**
   - Run "Refresh Crew Visit Config"
   - Check that 005-26 crew is NOT in the list
   - Check that JT Kale doesn't appear as crew lead for any crew

2. **Verify Training Tasks:**
   - Generate Task Metadata
   - Open Tasks & Calendar
   - JT Kale should NOT appear under any location with training tasks

3. **Test Adding/Removing Prefixes:**
   - Go to Schedule Config
   - Try adding a test prefix (e.g., "999")
   - Try removing it
   - Changes should persist after dialog close/reopen

