# Fix: Repeated Unknown Jobs Popup in Process Safety Emails

## Date: February 19, 2026

## Problem
When processing safety emails, the "Unknown Job Numbers Found" popup kept appearing repeatedly for the same job numbers (e.g., 037-26, 001-26), even after the user assigned them to a foreman or clicked "Skip".

## Root Cause
The system was saving the user's decisions (assign or skip) to ScriptProperties (`TEMP_JOB_FOREMAN_MAPPINGS` and `SKIPPED_UNKNOWN_JOBS`), and `lookupForemanWithCustomMapping()` was correctly checking these.

However, when a job was **explicitly skipped** by the user, `lookupForemanWithCustomMapping()` returned:
```javascript
{ name: '', jobExists: false, source: 'skipped' }
```

Then `parseSafetyEmail()` saw `jobExists: false` and returned:
```javascript
{ skippedReason: "Job not on Employee sheet", ... }
```

The main processing loop checked `if (parsed.skippedReason === "Job not on Employee sheet")` and added the job to `unknownJobsEncountered` again - even though the user had already decided to skip it!

## Solution
1. **Differentiate skip reasons**: `parseSafetyEmail()` now returns different skip reasons:
   - `"User skipped"` - When the job was explicitly skipped by the user in a previous batch
   - `"Job not on Employee sheet"` - When the job is genuinely unknown (not in Employees sheet AND not in temp mappings)

2. **Only track genuinely unknown jobs**: The main processing loop now only adds jobs to `unknownJobsEncountered` when `skippedReason === "Job not on Employee sheet"`.

3. **Silently skip user-skipped jobs**: Jobs that were user-skipped are now silently ignored and counted as `skippedCount`.

## Code Changes

### `88-SafetyReports.gs` - `parseSafetyEmail()` (~line 1621-1628)
```javascript
// Before:
if (jobNumber && !foremanResult.jobExists) {
  Logger.log("Skipping report - Job " + jobNumber + " not found on Employees sheet");
  return { issues: [], skippedReason: "Job not on Employee sheet", ... };
}

// After:
if (jobNumber && !foremanResult.jobExists) {
  var skippedReason = foremanResult.source === 'skipped' ?
    "User skipped" :
    "Job not on Employee sheet";
  Logger.log("Skipping report - Job " + jobNumber + ": " + skippedReason);
  return { issues: [], skippedReason: skippedReason, ... };
}
```

### `88-SafetyReports.gs` - Main processing loop (~line 647-670)
```javascript
// Added handling for user-skipped jobs:
} else if (parsed.skippedReason === "User skipped") {
  // User already decided to skip this job - log it but don't prompt again
  Logger.log("Silently skipping user-skipped job: " + (parsed.reportMeta ? parsed.reportMeta.jobNumber : 'unknown'));
  skippedCount++;
}
```

## Testing
1. Open Process Safety Emails dialog
2. Click "Start Processing"
3. When "Unknown Job Numbers Found" popup appears:
   - Assign job 037-26 to a foreman (e.g., "Keenan O'Keefe")
   - Check "Skip this report" for job 001-26
   - Click "Apply & Continue"
4. Processing should continue WITHOUT showing the popup again for 037-26 or 001-26
5. If those job numbers appear in later batches, they should be:
   - 037-26: Processed with the assigned foreman
   - 001-26: Silently skipped

## Logs to Look For
- `lookupForemanWithCustomMapping: FOUND in temp mappings -> [foreman name]` - Job was assigned
- `lookupForemanWithCustomMapping: Job [xxx-xx] was explicitly skipped` - Job was skipped
- `Silently skipping user-skipped job: [xxx-xx]` - Confirmation that user-skipped jobs aren't prompting again

## Impact
- Users no longer get stuck in a loop of assigning/skipping the same jobs
- Skipped jobs are remembered for the entire processing session
- Assigned jobs are properly processed with the assigned foreman

