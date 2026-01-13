# Employee History Enhancement - Additional Fields Added

## Summary
Updated the Employee History sheet to retain **Phone Number**, **Email Address**, **Glove Size**, and **Sleeve Size** information when employees are moved from the Employees sheet to the Employee History sheet.

## Changes Made

### 1. Updated Employee History Sheet Structure (Code.gs)
**File:** `src/Code.gs` - `setupEmployeeHistorySheet()` function

Added 4 new columns to the Employee History sheet:
- **Column K:** Phone Number
- **Column L:** Email Address  
- **Column M:** Glove Size
- **Column N:** Sleeve Size

The sheet now has 14 columns total (previously 10):
1. Date
2. Employee Name
3. Event Type
4. Location
5. Job Number
6. Hire Date
7. Last Day
8. Last Day Reason
9. Rehire Date
10. Notes
11. **Phone Number** (NEW)
12. **Email Address** (NEW)
13. **Glove Size** (NEW)
14. **Sleeve Size** (NEW)

### 2. Updated Termination Handler (51-EmployeeHistory.gs)
**File:** `src/51-EmployeeHistory.gs` - `handleLastDayChange()` function

Updated to capture and save the 4 additional fields when an employee is terminated:
- Reads Phone Number, Email Address, Glove Size, and Sleeve Size from the Employees sheet
- Includes these values in the history row when adding the "Terminated" entry

### 3. Updated All History Entry Functions
Updated all functions that add entries to the Employee History sheet to maintain the 14-column structure:

**In 51-EmployeeHistory.gs:**
- `handleRehireDateChange()` - Adds 4 empty columns for rehire entries
- `trackEmployeeChange()` - Adds 4 empty columns for location/job number changes
- `saveEmployeeHistory()` - Adds 4 empty columns for current state and change tracking

**In Code.gs:**
- `archivePreviousEmployees()` - Adds 4 empty columns when archiving
- `addTerminationToHistory()` - Adds 4 empty columns for termination entries
- `saveEmployeeHistory()` (duplicate function) - Adds 4 empty columns

## How It Works

### When an Employee is Terminated
1. User enters a "Last Day" date in the Employees sheet
2. `handleLastDayChange()` function is triggered
3. The function captures all employee data including:
   - Name, Location, Job Number, Hire Date, Last Day, Last Day Reason (existing)
   - **Phone Number, Email Address, Glove Size, Sleeve Size** (new)
4. A "Terminated" entry is added to Employee History with all this information
5. The employee's location is changed to "Previous Employee"
6. The employee row is deleted from the Employees sheet

### Historical Data Preservation
The terminated employee's contact information and equipment sizes are now permanently stored in the Employee History sheet, allowing you to:
- Reference their phone number and email if you need to contact them later
- Know what glove and sleeve sizes they used (helpful for inventory tracking)
- Have a complete record when an employee is rehired

### Other History Events
For non-termination events (location changes, job number changes, rehires, etc.), the 4 new columns are added but left empty since these events don't typically require this information.

## Testing Recommendations

1. **Test Termination Flow:**
   - Add a test employee with Phone Number, Email Address, Glove Size, and Sleeve Size
   - Enter a Last Day date
   - Verify the Employee History entry contains all 4 fields

2. **Verify Existing Functionality:**
   - Location changes should still work
   - Job number changes should still work
   - Rehire process should still work

3. **Check Sheet Structure:**
   - Open Employee History sheet
   - Verify 14 columns exist with proper headers
   - Column widths should be appropriate

## Benefits

✅ **Complete Employee Records** - Never lose contact information when employees leave  
✅ **Equipment History** - Know what sizes were issued to terminated employees  
✅ **Rehire Efficiency** - Quickly reference previous equipment sizes for rehired employees  
✅ **Audit Trail** - Complete historical record of employee information  
✅ **Backward Compatible** - Existing history entries are not affected  

## Notes

- The new columns are only populated for **Terminated** entries (when Last Day is entered)
- For other event types (Location Change, Job Number Change, Current State, Rehired), these columns remain empty
- Existing Employee History entries are not retroactively updated
- The sheet structure automatically updates when the script runs

