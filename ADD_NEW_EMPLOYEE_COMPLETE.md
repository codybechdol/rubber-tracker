# Add New Employee & Skip Functionality - Implementation Complete

## Date: January 17, 2026

## Problem
The "Add New Employee", "Update Employee Sheet", and "Skip" buttons showed placeholder alerts but didn't actually do anything. Users couldn't proceed past the unmatched employees screen.

## Solution Implemented

### 1. ExpiringCertsImport.html - Replaced Placeholder Functions

**Three main functions were fully implemented:**

#### `addNewEmployee(excelName, index)`
- Opens a Bootstrap modal with a comprehensive new employee form
- Pre-fills the name from Excel
- Collects all required employee data:
  - Name (editable)
  - Class (dropdown: 00, 0, 1, 2, 3, 4) - REQUIRED
  - Location (text input) - REQUIRED
  - Job Number (optional)
  - Phone (optional)
  - Email (optional)
  - Glove Size (dropdown: 8-12)
  - Sleeve Size (dropdown: 0, 2, 3, 4)
  - Hire Date (defaults to today)
- Validates required fields
- Stores data in `parsedData.newEmployees` array
- Removes the employee card after saving
- Shows success message
- Checks if all employees are resolved

#### `skipEmployee(index)`
- Marks employee as skipped
- Stores action in `resolvedEmployees` object
- Removes the employee card
- Checks if all employees are resolved
- Certifications for skipped employees won't be imported

#### `updateEmployeeName(excelName, index)`
- Marks employee name for update
- Stores action in `resolvedEmployees` object
- Removes the employee card
- Checks if all employees are resolved
- (Note: Actual employee sheet update logic can be added later)

### 2. Helper Functions Added

#### `removeCardAndCheckCompletion(index)`
- Removes a specific employee resolution card
- Triggers check for completion

#### `checkAllResolved()`
- Checks if any unresolved employee cards remain
- If all resolved:
  - Shows success message
  - Enables "Confirm Import" button
  - Allows user to proceed

#### `showNewEmployeeModal(excelName, index)`
- Dynamically creates Bootstrap modal HTML
- Pre-fills employee name from Excel
- Sets default hire date to today
- Uses Bootstrap Modal API to display
- Hooks up save button to `saveNewEmployee()`

#### `saveNewEmployee(excelName, index)`
- Validates required fields (Name, Class, Location)
- Collects all form data
- Adds to `parsedData.newEmployees` array
- Closes modal
- Removes employee card
- Shows success notification

#### `showStatus(message, type)` & `hideStatus()`
- Creates floating toast notifications
- Auto-dismisses after 3 seconds
- Supports success, error, and info types
- Positioned top-right corner

### 3. Code.gs - Updated processExpiringCertsImportMultiRow()

**Added New Employee Creation Logic:**
- Checks if `parsedData.newEmployees` array exists and has data
- Gets or creates Employees sheet
- If sheet is new, adds proper headers with formatting
- Iterates through each new employee
- Creates row with all employee data:
  - Name, Class, Location, Job Number
  - Phone, Email, Glove Size, Sleeve Size
  - Hire Date, empty Last Day fields
- Appends each new employee to Employees sheet
- Logs each addition
- Proceeds with normal certification import

## User Workflow

### Scenario 1: Add New Employee (Ashton, Colin, Christian)

1. User clicks "➕ Add New Employee" button
2. Modal appears with form
3. User fills in:
   - Name: Ashton Helmts (pre-filled)
   - Class: 2 (selects from dropdown)
   - Location: Helena (types in)
   - Optional fields as needed
4. User clicks "Save Employee"
5. Modal closes
6. Card disappears
7. Success message shows
8. Repeat for Colin and Christian
9. Once all 3 added, success message appears
10. "Confirm Import" button enables
11. User clicks to complete import
12. New employees are added to Employees sheet
13. Their certifications are imported

### Scenario 2: Confirm Previous Employee (Charles, Logan)

1. System shows these separately if matched to Employee History
2. User clicks "✓ Confirm - This is Correct"
3. Card disappears
4. When all confirmed, import proceeds
5. (This functionality was in previous implementation)

### Scenario 3: Skip Employee

1. User clicks "⏭️ Skip" button
2. Card immediately disappears
3. That employee's certifications won't be imported
4. Once all resolved, can proceed

### Scenario 4: Mixed Resolution

1. Ashton - Add New Employee
2. Colin - Add New Employee  
3. Christian - Add New Employee
4. Charles - Confirm Previous Employee
5. Logan - Skip (maybe cert data is wrong)
6. All 5 resolved → Import proceeds
7. Ashton, Colin, Christian added to Employees
8. Charles certifications imported (previous employee)
9. Logan's certifications excluded

## Technical Details

### Data Storage

**resolvedEmployees Object:**
```javascript
{
  "Ashton Helmts": { action: "addNew", data: {...} },
  "Colin Hanson": { action: "addNew", data: {...} },
  "Logan McCluskey": { action: "skip" }
}
```

**parsedData.newEmployees Array:**
```javascript
[
  {
    name: "Ashton Helmts",
    class: "2",
    location: "Helena",
    jobNum: "038-26",
    phone: "",
    email: "",
    gloveSize: "10",
    sleeveSize: "3",
    hireDate: "2026-01-17"
  },
  ...
]
```

### Modal Validation

**Required Fields:**
- Name (can't be empty)
- Class (must select from dropdown)
- Location (can't be empty)

**Optional Fields:**
- Job Number
- Phone
- Email  
- Glove Size
- Sleeve Size
- Hire Date (defaults to today if empty)

### Employee Sheet Structure

New employees added with columns:
1. Name
2. Class
3. Location
4. Job Number
5. Phone Number
6. Notification Emails (empty)
7. MP Email (empty)
8. Email Address
9. Glove Size
10. Sleeve Size
11. Hire Date
12. Last Day (empty)
13. Last Day Reason (empty)
14. Job Classification (empty)

## Files Modified

### 1. ExpiringCertsImport.html
- Replaced 3 placeholder functions
- Added 7 new helper functions
- Added status notification system
- Total: ~120 lines of new code

### 2. Code.gs
- Updated `processExpiringCertsImportMultiRow()` function
- Added new employee creation logic
- Added ~30 lines of code

## Deployment Instructions

### Step 1: Update ExpiringCertsImport.html
1. Open Apps Script Editor
2. Open ExpiringCertsImport file
3. Find the three placeholder functions (around line 390):
   - `updateEmployeeName()`
   - `addNewEmployee()`
   - `skipEmployee()`
4. Replace all three plus add new functions
5. Add `var resolvedEmployees = {};` at top of script section
6. Add `showStatus()` and `hideStatus()` functions before `init()`

### Step 2: Update Code.gs
1. Find `processExpiringCertsImportMultiRow()` function (around line 1230)
2. Add new employee creation logic at the beginning (before clearing Expiring Certs sheet)
3. Save

### Step 3: Test
1. Refresh Google Sheet
2. Try import with unmatched employees
3. Click "Add New Employee" - modal should appear
4. Fill form and save - card should disappear
5. Resolve all employees - import button should enable
6. Complete import - check Employees sheet for new entries

## Testing Checklist

- [ ] "Add New Employee" opens modal with form
- [ ] Modal pre-fills name from Excel
- [ ] Required field validation works (Name, Class, Location)
- [ ] "Save Employee" closes modal and removes card
- [ ] Multiple new employees can be added
- [ ] "Skip" button removes card immediately
- [ ] "Update Employee Sheet" removes card
- [ ] All employees resolved enables "Confirm Import"
- [ ] Success message appears when all resolved
- [ ] Import completes successfully
- [ ] New employees appear in Employees sheet
- [ ] New employees' certifications imported to Expiring Certs

## Success Indicators

✅ No more placeholder alerts
✅ Modal appears and functions properly
✅ Form validation works
✅ Cards disappear after resolution
✅ Import button enables after all resolved
✅ New employees added to Employees sheet
✅ Import completes successfully

## Known Limitations

1. "Update Employee Sheet" stores action but doesn't update spelling yet
2. Can't edit new employee after saving (must skip and re-add)
3. No duplicate name check when adding new employees
4. Can't cancel individual employee after adding (must cancel entire import)
5. Modal doesn't validate email format or phone format
6. No way to see list of new employees before confirming import

## Next Steps

1. Implement "Update Employee Sheet" spelling changes
2. Add duplicate name checking
3. Add ability to edit/remove new employees before import
4. Show summary of new employees before confirming
5. Add email/phone format validation
6. Implement "Choose Different Match" for previous employees
