# Fix: ToDoConfig Dialog Loading Issues

**Date:** February 12, 2026

## Problems Fixed

### 1. Close Button Opens Schedule Hub (Wrong Behavior)
When closing the Schedule Config dialog, it was opening the old "Schedule Hub" dialog instead of just closing to the spreadsheet.

**Root Cause:** The `closeDialog()` function was calling `showScheduleDialog()` which opens Schedule.html (the legacy Schedule Hub).

**Solution:** Changed `closeDialog()` to call `google.script.host.close()` directly.

### 2. Settings Tab Sections Stuck on "Loading..."
Several sections in the Settings tab never finished loading:
- Crew Visit Schedule
- Training: Select Crews
- Certifications: Select Types

**Root Cause:** A JavaScript error was stopping all subsequent code from executing:
```
Uncaught TypeError: Cannot read properties of null (reading 'addEventListener')
```

This error occurred because the code was trying to add an event listener to `document.getElementById('schedule-tab')`, but that element doesn't exist in the HTML. The actual tabs are: `locations-tab`, `settings-tab`, and `certs-tab`.

**Solution:** 
1. Removed the orphaned event listener for the non-existent `schedule-tab`
2. Added console logging and timeout handling with retry buttons to all loading functions for better debugging

## Changes Made

### `src/ToDoConfig.html`

1. **Fixed `closeDialog()`** (around line 563):
   - Now closes directly to spreadsheet instead of opening Schedule Hub
   - Simple: `google.script.host.close()`

2. **Updated `loadCrewVisitConfig()`** (around line 1466):
   - Added `console.log('loadCrewVisitConfig: Starting...')`
   - Added 10-second timeout with retry button
   - Added success logging: `console.log('loadCrewVisitConfig: SUCCESS, got X crews')`
   - Added error logging: `console.error('loadCrewVisitConfig: ERROR', error)`

3. **Updated `loadTrainingConfig()`** (around line 1358):
   - Added console logging
   - Added 10-second timeout with retry button
   - Added error handling with retry button

4. **Updated `loadExpiringCertsConfig()`** (around line 814):
   - Added console logging
   - Added 10-second timeout with retry button
   - Added error handling with retry button

5. **Updated `loadExcludedPrefixes()`** (around line 1293):
   - Added console logging
   - Already had error handling (falls back to defaults)

6. **Updated `loadEmployeeCertsData()`** (around line 871):
   - Added better console logging
   - Added retry buttons to timeout and error messages
   - Already had 15-second timeout

7. **Updated `loadTrainingConfigData()`** (around line 1635):
   - Added console logging
   - Added 10-second timeout with retry button
   - Added error handling with retry button

8. **Updated `loadTrainingTrackingData()`** (around line 1797):
   - Added console logging
   - Added 10-second timeout with retry button
   - Added error handling with retry button

## How to Debug Loading Issues

After this fix, open the browser developer tools (F12) and look at the Console tab when opening Schedule Config.

You should see messages like:
```
loadCrewVisitConfig: Starting...
loadTrainingConfig: Starting...
loadExpiringCertsConfig: Starting...
loadExcludedPrefixes: Starting...
loadTrainingConfigData: Starting...
loadTrainingTrackingData: Starting...
```

And then either:
- `loadCrewVisitConfig: SUCCESS, got 15 crews`
- `loadCrewVisitConfig: ERROR: [error message]`

If a function times out (takes > 10 seconds), a yellow warning message appears with a "Retry" button.

## Testing

1. **Close button test:**
   - Open Schedule Config (Glove Manager → Schedule & To-Do → ⚙️ Schedule Config)
   - Click the X or Close button
   - Dialog should close directly to spreadsheet (NOT open Schedule Hub)

2. **Loading test:**
   - Open Schedule Config
   - Go to Settings tab
   - All sections should load within a few seconds
   - If any section shows "Loading is taking longer than expected", click Retry
   - Check browser console (F12) for error messages

3. **Expiring Certs tab test:**
   - Go to Expiring Certs tab
   - Data should load within 15 seconds
   - If timeout, retry button appears

