# Consolidate Safety Compliance Config into Job Tracking

**Implemented:** March 26, 2026  
**Status:** ✅ COMPLETE - Deployed to Google Apps Script

---

## Overview

Merged the Safety Compliance Config sheet functionality into the Job Tracking sheet. Job Tracking is now the **single source of truth** for crew schedules, foremen, and compliance settings.

### Key Changes

1. **Job Tracking now has 25 columns** (was 16)
   - Added 9 visible schedule columns (L-T)
   - Hidden schedule history columns shifted from M-P to V-Y

2. **`loadComplianceConfig()` reads from Job Tracking**
   - No longer reads from Safety Compliance Config sheet
   - Auto-creates Job Tracking if missing
   - Shows migration alert if Job Tracking columns don't exist

3. **New `syncCrews()` function**
   - Syncs foremen from Employees sheet using classification hierarchy
   - Applies default Mon-Thu schedule to new crews
   - Called automatically after Crew Import

4. **Safety Compliance Config sheet can be deleted**
   - Use "Migrate Config to Job Tracking" to copy settings first

---

## New Job Tracking Column Structure

| Col | Header | Type | Default | Notes |
|-----|--------|------|---------|-------|
| A | Job Number | Text | — | Primary key |
| B | Location | Text | — | From Employees |
| C | Foreman | Text | — | From `getCrewLead()` |
| D | Crew Size | Number | — | Count of employees |
| E | Start Date | Date | — | Job start |
| F | Put On Hold Date | Date | — | If On Hold |
| G | Estimated Return | Date | — | If On Hold |
| H | Est. End Date | Date | — | Projected end |
| I | Actual End Date | Date | — | When completed |
| J | Status | Dropdown | Active | Active/Pending Start/Completed/On Hold |
| K | Notes | Text | — | Free text |
| **L** | **Skip Sun** | **Checkbox** | **✓** | **NEW** |
| **M** | **Skip Mon** | **Checkbox** | — | **NEW** |
| **N** | **Skip Tue** | **Checkbox** | — | **NEW** |
| **O** | **Skip Wed** | **Checkbox** | — | **NEW** |
| **P** | **Skip Thu** | **Checkbox** | — | **NEW** |
| **Q** | **Skip Fri** | **Checkbox** | **✓** | **NEW** |
| **R** | **Skip Sat** | **Checkbox** | **✓** | **NEW** |
| **S** | **Skip Weekly Meeting** | **Checkbox** | — | **NEW** |
| **T** | **Skip Monthly Checklist** | **Checkbox** | — | **NEW** |
| U | Last Updated | DateTime | — | Auto-updated |
| V | Work Schedule | Text | Mon-Thu | Hidden |
| W | Skip Days | Text | Sun,Fri,Sat | Hidden |
| X | Schedule Effective | Date | — | Hidden |
| Y | Schedule History | JSON | [] | Hidden |

---

## Migration Steps

### For Existing Sheets

1. **Add new columns to Job Tracking:**
   - Menu: Glove Manager → 📥 Import Crew Makeup → 🔧 Utilities → 📋 Migrate Job Tracking for Compliance
   - This adds columns L-T with checkboxes and defaults

2. **Copy settings from Safety Compliance Config:**
   - Menu: Glove Manager → 📥 Import Crew Makeup → 🔧 Utilities → 📋 Migrate Config to Job Tracking
   - This copies skip days to Job Tracking and deletes the old sheet

3. **Sync foremen and schedules:**
   - Menu: Glove Manager → 📥 Import Crew Makeup → 🔄 Sync Crews
   - Or use Quick Actions sidebar

### For New Sheets

New Job Tracking sheets automatically include all 25 columns with defaults.

---

## New Functions

### In `22-EmployeeValidation.gs`

- `setupJobTrackingSheet()` - Updated with 25 columns
- `migrateJobTrackingForComplianceConfig()` - Adds columns L-T to existing sheets
- `syncCrews(silent)` - Syncs foremen and applies default schedules
- `menuSyncCrews()` - Menu wrapper for syncCrews
- `populateJobTrackingFromEmployees()` - Updated to include schedule columns

### In `88-SafetyReports.gs`

- `loadComplianceConfig()` - **Rewritten** to read from Job Tracking
- `migrateConfigToJobTracking()` - One-time migration function

### In `85-DataImport.gs`

- `syncJobTrackingAfterImport()` - Now calls `syncCrews()` after crew import

---

## Menu Changes

### Added
- **📥 Import Crew Makeup → 🔄 Sync Crews** - Syncs foremen and schedules
- **📥 Import Crew Makeup → 🔧 Utilities → 📋 Migrate Job Tracking for Compliance**
- **📥 Import Crew Makeup → 🔧 Utilities → 📋 Migrate Config to Job Tracking**
- **🛡️ Process Safety Emails → 🔧 Utilities → 🔄 Sync Crews**
- **🛡️ Process Safety Emails → ⚙️ Manage Schedules (Job Tracking)** - Opens Job Tracking sheet

### Removed
- **🛡️ Process Safety Emails → ⚙️ Configure Crew Exclusions** - Replaced by Job Tracking
- **🛡️ Process Safety Emails → 🔧 Utilities → 👥 Populate Crew Config** - Replaced by Sync Crews
- **🛡️ Process Safety Emails → 🔧 Utilities → 🔧 Add Monthly Checklist Column** - No longer needed

### Quick Actions Sidebar
- Step 1 now includes "🔄 Sync Crews" button
- "Compliance Config" replaced with "Manage Schedules" (opens Job Tracking)

---

## Default Schedule

All new crews get the **Mon-Thu** schedule by default:
- ✅ Skip Sun
- ❌ Skip Mon (work day)
- ❌ Skip Tue (work day)
- ❌ Skip Wed (work day)
- ❌ Skip Thu (work day)
- ✅ Skip Fri
- ✅ Skip Sat
- ❌ Skip Weekly Meeting
- ❌ Skip Monthly Checklist

---

## Benefits

1. **Single source of truth** - No more sync issues between Config and Job Tracking
2. **Simpler management** - Edit schedules directly in Job Tracking
3. **Automatic foreman detection** - `syncCrews()` uses classification hierarchy
4. **Better integration** - Crew Import automatically syncs schedules
5. **Cleaner menu** - Fewer redundant options

---

## Files Modified

| File | Changes |
|------|---------|
| `src/22-EmployeeValidation.gs` | Added columns L-T to setup, migration function, syncCrews, updated getCrewScheduleForWeek indices |
| `src/88-SafetyReports.gs` | Rewrote loadComplianceConfig, added migrateConfigToJobTracking, updated calculateSafetyCompliance |
| `src/85-DataImport.gs` | Added syncCrews call to syncJobTrackingAfterImport |
| `src/Code.gs` | Updated menus |
| `src/QuickActions.html` | Added Sync Crews button, updated Manage Schedules |
| `AGENTS.md` | Documented new structure |

