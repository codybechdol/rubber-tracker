# Fix: Trip Planner getDriveTimeMap Error

**Date:** February 17, 2026

## Problem

Trip Planner was returning `null` and showing "No Pending Tasks" even when tasks existed. The console logs showed:

```
generateNewPlan called
Calling google.script.run.suggestOptimalTrips(14)...
SUCCESS HANDLER CALLED
Trip plan result received
Result type: object
Result is null/undefined
```

The server-side logs revealed:
```
ERROR in getPendingTasksWithLocations: ReferenceError: getDriveTimeMap is not defined
```

## Root Cause

The `getDriveTimeMap()` function was referenced in multiple places:
- `87-RoutePlanner.gs` (lines 999, 1153, 1270)
- `86-TimeTracking.gs` (lines 518, 753)

But the function was **never defined** anywhere in the codebase. It was declared in a `/* global */` comment but never implemented.

## Solution

Added the `getDriveTimeMap()` function to `76-SmartScheduling.gs`:

```javascript
/**
 * Returns a map of drive times from Helena to various locations.
 * Drive times are in minutes. Used by Trip Planner and Time Tracking.
 *
 * @return {Object} Map of location (lowercase) to drive time in minutes
 */
function getDriveTimeMap() {
  return {
    'helena': 0,
    'ennis': 60,
    'butte': 90,
    'big sky': 90,
    'bozeman': 90,
    'livingston': 90,
    'great falls': 90,
    'missoula': 120,
    'lolo': 130,
    'stanford': 120,
    'rapelje': 120,
    'elliston': 45,
    'gold creek': 75,
    'kalispell': 180,
    'billings': 180,
    'miles city': 240,
    'sidney': 300,
    'glendive': 270,
    'south dakota': 420,
    'northern lights': 420,
    'california': 960,
    'weeds': 0,         // Office-based (not a real location)
    'light duty': 0,    // Office-based
    'unknown': 0        // Default
  };
}
```

## Files Modified

- `src/76-SmartScheduling.gs` - Added `getDriveTimeMap()` function (~40 lines)

## Verification

After deployment, the Trip Planner should:
1. Load without errors
2. Show pending tasks grouped by location
3. Calculate drive times correctly for route optimization
4. Allow drag-and-drop scheduling

## Console Warnings (Not Errors)

The following console messages are **normal Google infrastructure warnings** and do not affect functionality:
- "service worker navigation preload request was cancelled"
- "Unrecognized feature: 'ambient-light-sensor', 'speaker', 'vibrate', 'vr'"
- "Net state changed from IDLE to BUSY / BUSY to IDLE"

These are browser-level warnings from Google's systems, not issues with the Trip Planner code.

## To Add New Locations

Edit the `getDriveTimeMap()` function in `src/76-SmartScheduling.gs`:
1. Add the location name in lowercase as the key
2. Add the drive time in minutes as the value
3. Deploy with `.\push.bat`

Example:
```javascript
'new location': 120,  // 2 hours from Helena
```

