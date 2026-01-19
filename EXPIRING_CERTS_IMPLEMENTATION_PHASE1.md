# Expiring Certs Implementation - Phase 1 Complete

## Date: January 17, 2026

## Summary

Successfully implemented the foundation for the Excel Certification Import system with integrated To Do task management and configuration options.

## Files Created

### 1. ExpiringCertsChoice.html
- Initial choice dialog with two options:
  - 📤 Import New Excel Data
  - 🔄 Refresh from Completed Tasks
- Clean, user-friendly interface
- Routes to appropriate workflow

### 2. ExpiringCertsImport.html
- Full-featured import dialog with:
  - Certification type checkboxes (15 cert types)
  - Excel data paste area (tab-separated)
  - Column mapping configurator (advanced option)
  - Live preview with employee matching
  - Summary statistics panel
  - Validation warnings display
- Default checked certs: DL, MEC Expiration, 1st Aid, CPR, Crane Cert
- Non-expiring certs marked: Crane Evaluation, OSHA 1910, BNSF, MSHA, EICA Basic Helo

## Files Modified

### 1. Code.gs
Added comprehensive backend functions:

#### Dialog Functions
- `showExpiringCertsChoiceDialog()` - Opens choice dialog
- `showExpiringCertsImportDialog()` - Opens import dialog

#### Data Functions
- `getCertTypeDefaults()` - Returns cert types, defaults, and column mappings
- `getEmployeeNamesForMatching()` - Gets employee list for fuzzy matching
- `parseExcelCertDataMultiRow()` - Parses Excel data with name conversion and date parsing
- `fuzzyMatchEmployeeName()` - Matches names using Levenshtein distance algorithm
- `levenshteinDistance()` - Calculates edit distance between strings

#### Import Processing
- `processExpiringCertsImportMultiRow()` - Main import function that:
  - Clears and rebuilds Expiring Certs sheet
  - Adds formulas for Days Until Expiration and Status
  - Sorts by employee name then days
  - Applies conditional formatting (7 status colors)
  - Creates collapsed row groups by employee

#### Helper Functions
- `applyExpiringCertsFormatting()` - Applies conditional formatting rules
- `createEmployeeGroups()` - Creates and collapses employee row groups
- `refreshCertsFromCompletedTasks()` - Placeholder for refresh workflow

#### Config Functions
- `getExpiringCertsConfig()` - Gets cert type configuration
- `saveExpiringCertsConfig()` - Saves selected cert types
- `getExpiringCertsForConfig()` - Gets cert data for To Do Config display

### 2. ToDoConfig.html
Added new "Expiring Certs" tab with:
- Cert type checkbox configuration (controls which certs create To Do tasks)
- Employee certification status view (expandable/collapsible cards)
- Summary statistics (Total Cert Holders, Priority Items, Expired)
- Real-time loading from Expiring Certs sheet
- Grouped by employee with cert counts and badges

### 3. QuickActions.html
- Updated "Expiring Certs" button to "Manage Certs"
- Changed onclick to call `showExpiringCertsChoiceDialog()`

## Features Implemented

### ✅ Phase 1 Complete

1. **Excel Data Import**
   - Tab-separated paste format
   - Name conversion: "LastName, FirstName" → "FirstName LastName"
   - Date parsing: "M.D.YY" → "MM/DD/20YY"
   - Column mapping: D-R to 15 certification types
   - "Need Copy" priority detection

2. **Fuzzy Name Matching**
   - Levenshtein distance algorithm
   - Special cases: exact match (100%), reversed names (98%), substrings (90%)
   - Confidence scoring with 70% threshold
   - Top 3 suggestions for variants

3. **Non-Expiring Certs**
   - 5 cert types marked as non-expiring
   - Dates ignored during import
   - Status shown as "Non-Expiring"

4. **Expiring Certs Sheet**
   - Headers: Employee Name, Item Type, Expiration Date, Location, Job #, Days Until Expiration, Status
   - Formulas for automatic calculation
   - 7 status levels with conditional formatting
   - Grouped and collapsed by employee

5. **To Do Config Integration**
   - New Expiring Certs tab
   - Cert type checkbox selection
   - Employee cert status display
   - Summary statistics

## Workflow Implemented

1. User clicks "Manage Certs" in Quick Actions
2. Choice dialog appears: Import or Refresh
3. If Import:
   - Opens import dialog
   - User selects cert types for To Do tasks
   - User pastes Excel data
   - System parses and matches employees
   - Preview shows matches with confidence scores
   - User confirms import
   - System creates/updates Expiring Certs sheet
4. To Do Config shows cert status by employee

## Next Phase: To-Do Items

### Phase 2: Employee Name Resolution & New Employee Creation

1. **Unmatched Employee Dialog**
   - Show detailed resolution options for low-confidence matches
   - "Update Employee Sheet" with impact warning
   - "Match to Selected" dropdown
   - "Add as New Employee" modal form
   - "Skip" option

2. **Bulk Name Standardization**
   - Update Employee sheet Column A
   - Update Gloves sheet Column H (Assigned To)
   - Update Sleeves sheet Column H
   - Update Gloves History Column B
   - Update Sleeves History Column B
   - Update Employee History Column B
   - Show confirmation: "This will update X items, Y records, Z entries"

3. **New Employee Creation**
   - Modal form with all required fields
   - Append to Employees sheet
   - Return employee data to import process

### Phase 3: To Do Task Completion Integration

1. **Task Completion Popup**
   - Modify ToDoSchedule.html checkbox click handler
   - Detect cert renewal tasks
   - Show popup: "Enter new expiration date for [Employee] - [Cert Type]"
   - Date picker with smart defaults (1yr, 2yr, 3yr based on cert type)
   - Update Expiring Certs sheet immediately
   - Recalculate Days Until and Status

2. **Refresh from Completed Tasks**
   - Scan To Do Schedule completed checkboxes
   - Extract employee name and cert type
   - Match to Expiring Certs sheet
   - Update expiration dates
   - Show summary

### Phase 4: Enhanced Features

1. **Email Reports**
   - Use existing email configuration
   - Send certification summary to manager
   - Include expired, critical, and warning items

2. **To Do Task Generation**
   - Filter by selected cert types
   - Create tasks for isPriority OR daysUntil <= 30
   - Add to Manual Tasks sheet
   - Set priority based on days until expiration

3. **Column Mapper Persistence**
   - Save custom column mappings to Script Properties
   - Allow future changes if Excel format changes

## Testing Checklist

- [ ] Test Excel paste with tab-separated data
- [ ] Verify name conversion works correctly
- [ ] Test date parsing for various formats
- [ ] Verify fuzzy matching finds variants
- [ ] Check non-expiring certs are handled correctly
- [ ] Test Expiring Certs sheet creation
- [ ] Verify conditional formatting appears
- [ ] Test employee grouping and collapse
- [ ] Check To Do Config displays cert data
- [ ] Test cert type checkbox persistence

## Known Limitations

1. Unmatched employee resolution not yet implemented (placeholder alerts)
2. New employee creation not yet implemented (placeholder alerts)
3. Task completion popup not yet implemented
4. Refresh from completed tasks returns placeholder message
5. To Do task generation not yet implemented
6. Bulk name standardization confirmation not yet implemented

## Database Schema

### Expiring Certs Sheet Structure
```
Column A: Employee Name (String)
Column B: Item Type (String)
Column C: Expiration Date (Date)
Column D: Location (String)
Column E: Job # (String)
Column F: Days Until Expiration (Formula)
Column G: Status (Formula)
```

### Status Levels
- PRIORITY - Need Copy (Purple)
- EXPIRED (Red)
- CRITICAL ≤7 days (Orange)
- WARNING ≤30 days (Yellow)
- UPCOMING ≤60 days (Blue)
- OK >60 days (Green)
- Non-Expiring (Gray)
- No Date Set (Gray)

### Script Properties
- `selectedCertTypes`: JSON array of cert types that create To Do tasks

## Notes

- All 15 certification types supported
- Column mapping defaults to D-R positions
- Employee matching uses 70% confidence threshold
- Row groups auto-collapse by employee
- Non-expiring certs can still create To Do tasks if checkbox selected
- Import replaces all existing certification data (clear then populate)

## Next Steps

1. Implement unmatched employee resolution dialog
2. Add new employee creation modal
3. Implement bulk name standardization across all sheets
4. Add task completion popup in ToDoSchedule.html
5. Complete refresh from completed tasks workflow
6. Add To Do task generation during import
7. Test complete workflow end-to-end
