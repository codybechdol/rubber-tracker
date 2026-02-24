# Crew Lead Classification Hierarchy Fix

**Date:** February 12, 2026  
**Status:** ✅ DEPLOYED

## Problem

When no Foreman (F) or GTO F is assigned to a crew, the system was returning the "first employee" in the crew list instead of the highest-ranked employee by job classification.

**Example - Crew 039-26 (Rapelje):**

| Employee | Job Number | Classification | Position |
|----------|------------|----------------|----------|
| Kamron Jones | 039-26.4 | JRY OP | **Should be crew lead** |
| Dawson Marcil | 039-26.5 | AP 4 | Apprentice |

The old code was showing **Dawson Marcil** as crew lead because he was listed first, but **Kamron Jones** should be the crew lead because JRY OP outranks AP 4.

## Solution

Rewrote `getCrewLead()` function in `75-Scheduling.gs` to use a classification hierarchy when selecting the crew lead.

### Classification Priority (lower number = higher rank)

| Priority | Classification | Description |
|----------|---------------|-------------|
| 1 | F | Foreman - Primary crew lead |
| 2 | GTO F | Gas Tech Operator - Foreman |
| 3 | GF | General Foreman |
| 4 | SUP | Superintendent |
| 5 | JRY | Journeyman Lineman |
| 6 | JRY OP | Journeyman Operator |
| 7 | WT | Working Technician |
| 8 | GTO | Gas Tech Operator |
| 9 | EO 1 | Equipment Operator 1 |
| 10 | EO 2 | Equipment Operator 2 |
| 11 | AP 7 | 7th Year Apprentice (most senior) |
| 12 | AP 6 | 6th Year Apprentice |
| 13 | AP 5 | 5th Year Apprentice |
| 14 | AP 4 | 4th Year Apprentice |
| 15 | AP 3 | 3rd Year Apprentice |
| 16 | AP 2 | 2nd Year Apprentice |
| 17 | AP 1 | 1st Year Apprentice (least senior) |
| 999 | (other) | First employee fallback |

## How It Works

The new `getCrewLead()` function:

1. **Scans all employees** in the specified crew
2. **Skips excluded employees** (Light Duty, Lost/Destroyed, etc.)
3. **Tracks the best candidate** based on classification priority
4. **Returns the highest-ranked employee** instead of just the first one

```javascript
// Example logic:
for each employee in crew:
    priority = classificationPriority[employee.classification]
    if priority < bestPriority:
        bestCandidate = employee
        bestPriority = priority

return bestCandidate || firstEmployee  // Fallback if no classification matches
```

## Files Modified

- `src/75-Scheduling.gs` - Rewrote `getCrewLead()` function (~70 lines)

## How to Update Existing Data

After deploying, the **existing sheets still have cached data**. Run these menu items to refresh:

### For Training Tracking Sheet:
**Glove Manager → Schedule & To-Do → 🔄 Refresh Training Tracking Crew Leads**

This will:
- Scan all rows in Training Tracking
- Look up the current crew lead for each crew (using the new hierarchy)
- Update the Crew Lead column
- Preserve all user data (completion dates, status, attendees, etc.)

### For Crew Visit Config Sheet:
**Glove Manager → Schedule & To-Do → 🔄 Refresh Crew Visit Config**

This will:
- Update Crew Leads with proper classification hierarchy
- Update Crew Sizes
- Preserve user customizations (Visit Frequency, Priority, Notes)

## Testing

After refreshing, verify:

1. **Crew 039-26** should now show **Kamron Jones** (JRY OP) as Crew Lead, not Dawson Marcil (AP 4)
2. Any crew without F or GTO F should show the highest-ranked employee
3. Crews with F or GTO F should still show the foreman

## Related Functions

- `getCrewLead(crewNumber)` - Returns highest-ranked employee in crew
- `getCrewSize(crewNumber)` - Returns count of active employees (excludes Light Duty)
- `refreshTrainingTrackingCrewLeads()` - Updates Training Tracking sheet
- `refreshCrewVisitConfig()` - Updates Crew Visit Config sheet

