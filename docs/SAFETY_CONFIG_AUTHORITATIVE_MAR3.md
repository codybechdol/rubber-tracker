# Safety Compliance Config as Authoritative Crew Source

**Date:** March 3, 2026  
**Status:** ✅ Implemented and Deployed

## Problem

Non-config job numbers (like 006-26, 053-25) were creating separate rows in the Safety Compliance sheet instead of crediting to the foreman's primary crew.

**Example:** Ben Lapka is the foreman for crew 052-25, but he also receives JHAs from job numbers 006-26 and 053-25. Instead of all crediting to 052-25, there were 3 separate rows:
- 052-25 (Benjamin Lapka)
- 006-26 (Benjamin Lapka)
- 053-25 (Benjamin Lapka)

## Root Cause

`calculateComplianceFromLogs()` was using `getActiveCrews()` which reads ALL job numbers from the Employees sheet. This included job numbers that aren't "real" tracked crews.

## Solution

### 1. Config as Authoritative Source for Current Week

The Safety Compliance Config sheet is the source for which crews appear:

**Current Week:** ONLY crews in Safety Compliance Config appear
**Past Weeks:** Preserve whatever crews already exist in the Safety Compliance sheet for that week (historical data is NOT changed)

This is important because job numbers and crew assignments change over time. A crew that was valid in January might not be in the current Config, but we don't want to lose their historical compliance data.

### 2. Auto-Populate Config

When `processSafetyEmails()` runs, it now automatically:
1. Checks Employees sheet for any new crews
2. Adds them to Safety Compliance Config with default settings
3. Logs what was added

This means you don't need to manually run "Populate Crew Config" - it happens automatically.

### 3. Crediting Non-Config Jobs

When a JHA comes in for a non-config job (like 006-26):
1. The foreman is looked up (Ben Lapka)
2. The foreman's primary crew is found (052-25)
3. The "Credited To" column is set to 052-25
4. Compliance calculation credits 052-25, not 006-26

### 4. New Helper Function

Added `getExistingCrewsForWeek()` which reads the Safety Compliance sheet to find which crews already have rows for a given week. This is used for past weeks to preserve historical data.

## Files Modified

- `src/88-SafetyReports.gs`:
  - Added `populateComplianceConfigSilent()` - Silent version that doesn't show alerts
  - Added `getExistingCrewsForWeek()` - Gets crews that already exist for a past week
  - Updated `processSafetyEmails()` to call auto-populate at start
  - Updated `calculateComplianceFromLogs()` to use Config crews for current week, existing crews for past weeks
  - Added `fixBenLapkaWeeks()` - One-time fix for Ben's issue
  - Added `removeNonConfigCrewsFromCompliance()` - Cleanup function (current week only)

- `src/Code.gs`:
  - Added menu items for Fix Ben Lapka Weeks and Remove Non-Config Crews

## One-Time Fix: Ben Lapka Weeks

To fix the existing incorrect data for weeks 02/15/2026 and 02/22/2026:

1. Go to **Glove Manager → 🛡️ Safety → 🔧 Fix Ben Lapka Weeks**
2. Click **Yes** to confirm

## Cleanup: Remove Non-Config Crews (Current Week)

To remove non-config crews from the CURRENT WEEK ONLY:

1. Go to **Glove Manager → 🛡️ Safety → 🧹 Remove Non-Config Crews**
2. This ONLY affects the current week - past weeks are preserved

## Future Behavior

Going forward:
- New crews from Employees sheet are auto-added to Config
- **Current week:** Only Config crews appear
- **Past weeks:** Existing crews are preserved (no changes to historical data)
- Assigned jobs credit the foreman's primary Config crew via "Credited To" column
- Recalculating ALL weeks will preserve past week crews (uses existing data)

## Testing

After deployment:
1. Check Safety Compliance Config has all expected crews
2. Run Process Safety Emails
3. Verify current week only shows Config crews
4. Verify past weeks still have their historical crews
5. Run "Fix Ben Lapka Weeks" to clean up that specific issue

