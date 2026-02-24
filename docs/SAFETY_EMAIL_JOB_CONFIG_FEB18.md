# Process Safety Emails - Job Number Configuration

**Date:** February 18, 2026

## Summary

Enhanced the Process Safety Emails dialog with a job number configuration section that allows users to:
1. See all foremen/crew leads with their assigned job numbers
2. Add unexpected/temporary job numbers before processing
3. Handle unknown job numbers during processing with a popup prompt

## Changes Made

### 1. Added "Secondary Job Number" Column to Employees Sheet

**File:** `src/22-EmployeeValidation.gs`

- Added `addSecondaryJobNumberColumn()` function
- Adds column at the END of existing columns (no column shifting)
- Automatically formats to match Job Number column
- Menu: **Glove Manager → 🔧 Utilities → 📋 Add Secondary Job Column**

**Why at the end?** This is the safest approach - all existing code uses dynamic header lookup, so adding a column at the end doesn't break anything.

### 2. Updated New Sheet Creation

**File:** `src/Code.gs` (line 2967)

- Updated `empHeaders` array to include 'Secondary Job Number' for new Employees sheets

### 3. Added Job→Foreman Mapping Functions

**File:** `src/88-SafetyReports.gs`

New functions added:
- `getJobForemanMappingsForDialog()` - Returns all job→foreman mappings from Employees sheet
- `getCustomJobForemanMappings()` - Gets saved custom mappings from ScriptProperties
- `saveCustomJobForemanMappings(mappingsJson)` - Saves custom job→foreman mappings
- `clearCustomJobForemanMappings()` - Clears all custom mappings
- `lookupForemanWithCustomMapping(jobNumber, dialogMappings)` - Looks up foreman, checking custom mappings first
- `getLastSafetyEmailProcessedTime()` - Gets last processed timestamp
- `storeUnknownJobsForPrompt(unknownJobs)` - Stores unknown jobs for user prompt
- `getPendingUnknownJobs()` - Gets pending unknown jobs
- `clearPendingUnknownJobs()` - Clears pending unknown jobs
- `applyUnknownJobDecisions(decisionsJson)` - Applies user decisions for unknown jobs
- `getTempJobForemanMappings()` - Gets temporary session mappings
- `getSkippedUnknownJobs()` - Gets skipped job numbers
- `clearTempProcessingData()` - Clears all temporary session data

### 4. Redesigned Process Safety Emails Dialog

**File:** `src/ProcessSafetyEmailsDialog.html`

**New Features:**
- **Job Configuration Section** (collapsible)
  - Table with columns: Foreman/Crew Lead | Job 1 | Job 2 | Job 3 | Remove
  - Pre-populated with existing foremen from Employees sheet
  - "Custom" badge for user-added rows
  - "+ Add Row" button to add new foreman→job mappings
  - Foreman dropdown populated with all employees
  
- **Unknown Jobs Modal**
  - Shows when processing encounters job numbers not in configuration
  - For each unknown job: dropdown to assign to foreman OR checkbox to skip
  - "Apply & Continue" to proceed with assignments
  - "Skip All" to skip all unknown jobs and continue

**Dialog Size:** Increased from 500x550 to 550x700 pixels

## Usage

### Before Processing (First Time Setup)

1. Open **Glove Manager → 🔧 Utilities → 📋 Add Secondary Job Column**
2. This adds the Secondary Job Number column to your Employees sheet

### Using the Dialog

1. Open **Glove Manager → 🛡️ Safety Reports → 📥 Process Safety Emails**
2. Click "📋 Job Number Configuration" to expand the section
3. Review the existing foreman→job mappings
4. If needed, click "+ Add Row" to add temporary job numbers
5. Click "Start Processing"

### When Unknown Jobs Are Found

If the system encounters a job number that's not in your configuration:

1. A popup appears showing the unknown job numbers
2. For each, either:
   - Select a foreman from the dropdown to assign it temporarily
   - Check "Skip this report" to ignore it
3. Click "Apply & Continue" to proceed

### Persistence

- **Custom mappings are saved** between sessions (stored in ScriptProperties)
- **Unknown job assignments are temporary** - only apply to the current processing session

## Files Modified

| File | Changes |
|------|---------|
| `src/22-EmployeeValidation.gs` | Added migration function for Secondary Job Number column |
| `src/Code.gs` | Updated empHeaders array, added menu item |
| `src/88-SafetyReports.gs` | Added ~350 lines of job mapping functions |
| `src/ProcessSafetyEmailsDialog.html` | Complete redesign with job config section |
| `src/85-DataImport.gs` | Updated to write secondary job numbers |
| `src/CrewImport.html` | Updated to capture secondary jobs from duplicate employees |

## Crew Import - Secondary Job Number Support

When importing crew makeup, if an employee appears in multiple crews:
1. The **primary** job (selected by user or auto-detected) is saved to "Job Number"
2. The **secondary** job (non-selected occurrence) is saved to "Secondary Job Number"

**Example:** If an employee works M-Th on crew 013-26 and Fri-Sat on crew 015-26:
- Primary (M-Th) → Job Number: `013-26.1`
- Secondary (Fri-Sat) → Secondary Job Number: `015-26`

The secondary job number is then used by Process Safety Emails to look up foremen correctly.

## Completed ✅

~~## Next Steps (Future Enhancement)~~

~~1. **Update Crew Import** to save secondary job numbers when employees work multiple crews~~
~~2. **Integrate with Safety Compliance Config** to sync job→foreman mappings~~

Both enhancements have been implemented.

