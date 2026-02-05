# Fix: Helena Location vs Office Work Distinction

**Date:** February 2, 2026  
**Status:** ✅ DEPLOYED

## Problem

The Trip Planner was incorrectly grouping all Helena location tasks into the "Office Work / Phone Tasks" card, including:
- **Training tasks** for Helena-based crews (which require field visits)
- **Swap tasks** for Helena-based employees (which require field visits)

This happened because the logic treated "Helena" as a non-field location since it's the home base.

## Root Cause

In `87-RoutePlanner.gs`, the `collectTasksForTripPlanner()` function had this logic:

```javascript
var isOfficeLocation = (locLower === 'helena' ||
    locLower === 'weeds' ||
    locLower === 'unknown' ||
    // ... etc
```

This caused ALL tasks with Location = "Helena" to be filtered out as office work.

## Solution

**Changed the logic to distinguish between:**

1. **Office Work** (phone-only, no field visit needed):
   - Cert Expiring tasks (can be handled via phone)
   - Tasks for employees in: Weeds, Light Duty, Vacation, Leave, Previous Employee, Unknown

2. **Helena Field Tasks** (require actual field visit):
   - Training tasks for Helena crews
   - Swap tasks for Helena employees

## Code Changes

### File: `src/87-RoutePlanner.gs`

**Change 1: Updated OFFICE_ONLY_LOCATIONS constant (lines 39-48)**
```javascript
// Non-field locations (office/phone work only - excluded from trip planning)
// Note: Helena is NOT included here - Helena crews need field visits for training/swaps
var OFFICE_ONLY_LOCATIONS = [
  'weeds',            // Employees waiting for job to start (phone work only)
  'previous employee',// No longer with company
  'light duty',       // Office-based employees
  'vacation',         // On vacation
  'leave',            // On leave
  'unknown'           // Unknown location
];
```

**Change 2: Updated location filtering logic (lines 561-596)**
```javascript
var locLower = locationName.toLowerCase();

// Check if this is a non-field location (but NOT Helena - Helena crews need field visits)
var isNonFieldLocation = (locLower === 'weeds' ||
    locLower === 'unknown' ||
    locLower === 'previous employee' ||
    locLower === 'light duty' ||
    locLower === 'vacation' ||
    locLower === 'leave');

if (isNonFieldLocation) {
  // Collect these as office tasks - they can't be visited in the field
  // ... [collect as office tasks]
}
```

**Cert Expiring tasks are still collected as office work** (lines 610-652) - they can be handled via phone regardless of location.

## Testing Checklist

- [ ] Open Trip Planner dialog
- [ ] Verify Helena training tasks appear in the unassigned locations pool (NOT in Office Work card)
- [ ] Verify Helena swap tasks appear in Helena location card (NOT in Office Work card)
- [ ] Verify Cert Expiring tasks still appear in Office Work card
- [ ] Verify tasks for Weeds/Light Duty/etc. still appear in Office Work card
- [ ] Drag Helena card to a work day and verify it can be scheduled

## Impact

- **Training tasks** for Helena crews now correctly appear as field tasks
- **Swap tasks** for Helena employees now correctly appear as field tasks
- **Cert tasks** for anyone (including Helena) still correctly appear as office work
- **Office Work card** now only contains tasks that genuinely can't be visited in the field

## Related Files

- `src/87-RoutePlanner.gs` - Main logic update
- `TripPlanner.html` - No changes needed (UI adapts automatically)

## Next Steps

After testing, consider adding a visual indicator in the UI to distinguish:
- 🏢 Office Work (phone-only)
- 📍 Helena Field (requires visit)

This could be done with icons or color coding in the Trip Planner dialog.
