# Fix: Secondary/Custom Job Reports Now Credit Foreman's Primary Crew

## Date: February 18, 2026

## Problem
When processing safety emails, JHAs and Weekly Meetings submitted on secondary/custom job numbers (like 006-26 for Benjamin Lapka) were being correctly logged to the Safety Reports sheet but were NOT being credited to the foreman's primary crew (052-25) in the Safety Compliance tracking.

**Example from logs:**
```
lookupForemanWithCustomMapping: Looking up job 006-26
lookupForemanWithCustomMapping: FOUND in saved custom -> Benjamin Lapka
Job 006-26 lookup result: name=Benjamin Lapka, jobExists=true, source=saved_custom
Parsed JHA - Job: 006-26 - Issues: 0
Added 1 compliance records (no-issue reports)
```

The JHA was logged successfully, but when `calculateSafetyCompliance()` ran, it only tracked reports for crews in `getActiveCrews()` (from the Employees sheet). Job 006-26 wasn't in that list, so the report wasn't counted.

## Solution
Modified `calculateSafetyCompliance()` in `88-SafetyReports.gs` to:

1. **Build foreman → primary crew mapping** from Employees sheet
   - Identifies foremen by Job Classification (F, GTO F) or by having .1 position suffix
   - Maps each foreman's name to their primary job number

2. **Build job → foreman mapping** that includes:
   - Primary jobs from Employees sheet
   - Secondary jobs from Employees sheet (new "Secondary Job Number" column)
   - Custom job mappings from Process Safety Emails dialog configuration

3. **Add `resolveToPrimaryCrew()` helper function** that:
   - If job is directly tracked, returns it
   - Otherwise, looks up the foreman and returns their primary crew
   - Returns null for unresolvable jobs

4. **Update both scan passes** (Monthly Checklist + JHA/Weekly Meeting) to use `resolveToPrimaryCrew()`

## Code Changes

### `88-SafetyReports.gs` - `calculateSafetyCompliance()` function

Added ~60 lines to build mappings:
```javascript
// Build mappings for secondary/custom jobs → primary crew
var foremanToPrimaryCrew = {};  // foreman name → primary job number
var jobToForeman = {};          // job number → foreman name (includes secondary jobs)

// Load custom job mappings from dialog configuration
var customMappings = getCustomJobForemanMappings() || {};

// Build from Employees sheet (primary + secondary jobs)
// ... scanning logic ...

// Add custom mappings (these override Employees sheet mappings)
for (var customJob in customMappings) {
  var customForeman = customMappings[customJob];
  jobToForeman[customJob] = customForeman;
}
```

Added helper function:
```javascript
function resolveToPrimaryCrew(baseJob) {
  if (crewReports[baseJob]) return baseJob;
  
  var foreman = jobToForeman[baseJob];
  if (foreman) {
    var primaryCrew = foremanToPrimaryCrew[foreman.toLowerCase()];
    if (primaryCrew && crewReports[primaryCrew]) {
      return primaryCrew;
    }
  }
  return null;
}
```

Updated scan passes to use the helper:
```javascript
var targetCrew = resolveToPrimaryCrew(baseJob);
if (!targetCrew) continue;
// Use targetCrew instead of baseJob for credit
```

## Result
Now when Benjamin Lapka submits JHAs on job 006-26:
1. Email is parsed and logged to Safety Reports with job 006-26
2. Compliance tracking maps 006-26 → Benjamin Lapka → 052-25 (primary crew)
3. JHAs are credited to crew 052-25 in the Safety Compliance sheet

## Testing
Run "Process Safety Emails" with 7 days and check:
- Safety Reports sheet should show JHAs for 006-26
- Safety Compliance sheet should show ✅ marks for crew 052-25 (not 006-26)
- Log should show: `Credited JHA from 006-26 to primary crew 052-25`

## Files Modified
- `src/88-SafetyReports.gs` - ~100 lines added to `calculateSafetyCompliance()`

