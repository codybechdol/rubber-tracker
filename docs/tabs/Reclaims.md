# Reclaims Sheet

## Purpose
Manages and tracks items that need to be reclaimed or replaced based on compliance rules, employee status, and location approval requirements.

## Sheet Structure

The Reclaims sheet contains four main sections:

### 1. Previous Employee Reclaims
Items assigned to employees who have left the company (terminated, marked as "Previous Employee").

### 2. Class Location Approvals
Configurable table showing which rubber classes are approved for each work location.

### 3. Class 3 Reclaims - Need Downgrade to Class 2
Class 3 items assigned to employees in locations where only Class 2 is approved.

### 4. Class 2 Reclaims - Need Upgrade to Class 3
Class 2 items assigned to employees in locations where only Class 3 is approved.

### 5. Lost Items - Need to Locate
Items marked with "LOST-LOCATE" in the Notes column that need to be physically located.

## Section Details

### Previous Employee Reclaims
**Columns (A-J):**
- A: Item Type (Glove/Sleeve)
- B: Item #
- C: Size
- D: Class
- E: Location
- F: Status
- G: Assigned To (Previous employee name)
- H: Date Assigned
- I: Last Day (from Employee History)
- J: (Empty - for alignment)

**Purpose:** Track all items that need to be collected from former employees.

**Action Required:** Physically reclaim these items and update their status to "On Shelf" in the Gloves/Sleeves sheets.

---

### Class Location Approvals
**Columns:**
- A: Location name
- B: Approval (dropdown: None, CL2, CL3, CL2 & CL3)

**Purpose:** Define which rubber classes are approved for each work location based on operational requirements.

**Approval Options:**
- **None** - No rubber approved for this location
- **CL2** - Only Class 2 rubber approved
- **CL3** - Only Class 3 rubber approved
- **CL2 & CL3** - Both classes approved

**Default Approvals:**
- Big Sky: CL3
- Bozeman, Butte, CA Sub, Ennis, Helena, Missoula, Northern Lights, South Dakota Dock, Stanford: CL2
- Great Falls, Livingston: CL2 & CL3

**New Locations:** System prompts for approval class when new locations are detected.

---

### Class 3 Reclaims - Need Downgrade to Class 2

**Purpose:** Identify Class 3 items in non-approved locations that must be downgraded to Class 2 for compliance.

**Visible Columns (A-J):**
- A: Employee
- B: Item Type (Glove/Sleeve)
- C: Item # (the Class 3 item to reclaim)
- D: Size
- E: Class (always 3)
- F: Location
- G: Pick List Item # (replacement Class 2 item)
- H: Pick List Status
- I: Picked (checkbox)
- J: Date Changed (date field)

**Hidden Columns (K-W):** STAGE 1/2/3 data for workflow tracking (same as Swap sheets)

**Pick List Status Values:**
- **In Stock ✅** - Class 2 replacement available on shelf
- **In Stock (Size Up) ⚠️** - Class 2 replacement available, half size larger (gloves only)
- **Ready For Delivery 🚚** - Class 2 replacement already picked/packed
- **In Testing ⏳** - Class 2 replacement in testing phase
- **Reclaim Only - Has CL2 ✅** - Employee already has a Class 2 item, just reclaim the CL3 (no replacement needed)
- **Need to Purchase ❌** - No Class 2 replacement available in inventory

**Note:** Items with "LOST-LOCATE" marker are excluded from pick lists. See [LOST_LOCATE_EXCLUSION_POLICY.md](../LOST_LOCATE_EXCLUSION_POLICY.md)

---

### Class 2 Reclaims - Need Upgrade to Class 3

**Purpose:** Identify Class 2 items in Class 3-only locations that must be upgraded to Class 3 for compliance.

**Visible Columns (A-J):** Same structure as Class 3 Reclaims
- A: Employee
- B: Item Type
- C: Item # (the Class 2 item to reclaim)
- D: Size
- E: Class (always 2)
- F: Location
- G: Pick List Item # (replacement Class 3 item)
- H: Pick List Status
- I: Picked (checkbox)
- J: Date Changed (date field)

**Hidden Columns (K-W):** STAGE 1/2/3 data for workflow tracking

**Pick List Status Values:** Same as Class 3 Reclaims but for Class 3 items

**Note:** Items with "LOST-LOCATE" marker are excluded from pick lists.

---

### Lost Items - Need to Locate

**Columns:**
- A: Item Type
- B: Item #
- C: Size
- D: Class
- E: Last Location
- F: Last Assigned To
- G: Date Assigned
- H: Notes (shows LOST-LOCATE marker)

**Purpose:** Track items marked as lost/missing that need to be physically located.

**How Items Appear Here:** When "LOST-LOCATE" is added to the Notes column in Gloves/Sleeves sheets, the item automatically appears in this table.

**Resolution:** 
1. Locate the physical item
2. Remove "LOST-LOCATE" from Notes column
3. Update Status/Location appropriately
4. Run "Generate All Reports"

---

## Workflow: Class Reclaims (Picked & Date Changed)

The Class 3 and Class 2 Reclaims tables use the same workflow as Glove/Sleeve Swaps:

### Stage 1: Pick Replacement Item
1. System auto-generates pick list (column G) with available replacement item
2. Pick List Status (column H) shows availability
3. Check **Picked** checkbox (column I) when item is physically picked
4. System sets "Picked For" in inventory sheet

### Stage 2: Complete Reclaim
1. Physically reclaim the old item from employee
2. Deliver the replacement item to employee
3. Enter **Date Changed** (column J) to finalize the reclaim
4. System updates:
   - Old item: Status → "On Shelf", Assignment cleared
   - Replacement item: Assigned To → Employee, Status updated
   - "Picked For" cleared from replacement item

### Stage 3: Revert (if needed)
1. Remove Date Changed to undo the reclaim
2. System reverts both items to pre-reclaim state
3. "Picked For" is restored on replacement item

### Picked Item Preservation
- Checked Picked items persist through "Generate All Reports" runs
- System reads "Picked For" column from inventory sheets
- Prevents losing picked items when reports are regenerated

---

## Auto-Generation

The Reclaims sheet is automatically updated when you run:
- **Glove Manager → Generate All Reports**
- **Glove Manager → Run Reclaims Check**

### What Happens:
1. **Preserve approvals** - Existing Class Location Approvals are saved
2. **Scan inventory** - Check all Gloves and Sleeves assignments
3. **Check Employee History** - Identify Previous Employees
4. **Apply location rules** - Compare item class vs location approval
5. **Generate pick lists** - Find replacement items (respects swap priorities)
6. **Update sheet** - Rebuild all tables with current data

---

## Cross-Sheet Dependencies

### Reads From:
- **Employees** - Current employee locations, active status
- **Employee History** - Previous employees, termination dates
- **Gloves** - All glove assignments, statuses, notes
- **Sleeves** - All sleeve assignments, statuses, notes

### Writes To:
- **Gloves** - "Picked For" column when Picked is checked
- **Sleeves** - "Picked For" column when Picked is checked
- **Gloves** - Status and assignments when Date Changed is entered
- **Sleeves** - Status and assignments when Date Changed is entered

### Respects:
- **Glove Swaps** - Pick list items already assigned to swaps have higher priority
- **Sleeve Swaps** - Pick list items already assigned to swaps have higher priority

---

## Common Scenarios

### Scenario 1: Employee Moves to Different Location
**Before:** John has Class 3 gloves, works in Helena (CL2 only)  
**Action:** System adds to Class 3 Reclaims table  
**Pick List:** Finds Class 2 replacement glove  
**Resolution:** Check Picked, deliver new Class 2 gloves, enter Date Changed, reclaim old Class 3 gloves

### Scenario 2: Location Approval Changes
**Before:** Ennis approved for CL2 only  
**Change:** Manager changes Ennis approval to "CL2 & CL3"  
**Result:** Employees with CL3 items in Ennis no longer appear in reclaims  
**Note:** Run "Generate All Reports" after changing approvals

### Scenario 3: Employee Terminated
**Before:** Employee is on Employees sheet  
**Change:** Move employee to "Previous Employee" location  
**Result:** All their items appear in Previous Employee Reclaims table  
**Resolution:** Physically collect items, update to "On Shelf"

### Scenario 4: Pick List Shows "Need to Purchase ❌"
**Possible Causes:**
1. No replacement items available in inventory
2. All replacement items already assigned to swaps/other reclaims
3. Replacement items marked with "LOST-LOCATE"

**Resolution:**
1. Check inventory sheets for available items
2. Check Lost Items table for LOST-LOCATE items
3. Purchase new items if inventory is depleted
4. Manually override by typing item # in Pick List column

---

## Best Practices

### Location Approvals
1. Review approvals quarterly or when operations change
2. Document reasons for approval decisions
3. Consider operational safety requirements
4. Coordinate with safety/compliance teams

### Previous Employee Reclaims
1. Process within 2 weeks of termination
2. Physical collection before final paycheck
3. Update inventory immediately after collection
4. Document condition of returned items

### Class Reclaims
1. Process reclaims with regular crew visits
2. Combine with routine equipment swaps when possible
3. Pick replacement items before visiting location
4. Use Picked checkbox to track picking progress

### Pick List Management
1. Trust system-generated pick lists when available
2. Manual override only when system can't find match
3. Never assign LOST-LOCATE items to employees
4. Investigate "Need to Purchase" status before ordering

---

## Troubleshooting

### Reclaims Not Showing
**Check:**
- Run "Generate All Reports" to refresh data
- Verify location approvals are set correctly
- Confirm employee locations are current on Employees sheet

### Wrong Pick List Status
**Check:**
- Item status in Gloves/Sleeves sheets
- "Picked For" column for existing reservations
- Notes column for LOST-LOCATE markers

### Picked Checkbox Not Working
**Check:**
- Ensure you're editing column I (not other columns)
- Run "Generate All Reports" to see "Picked For" update
- Check execution logs for trigger errors

### Date Changed Not Completing Reclaim
**Check:**
- Date format (MM/dd/yyyy required)
- Pick List Item # is not "—"
- Both items exist in inventory sheets
- Execution logs for errors

---

## Related Documentation

- [LOST_LOCATE_EXCLUSION_POLICY.md](../LOST_LOCATE_EXCLUSION_POLICY.md) - Lost item marker behavior
- [Glove Swaps Tab](Glove%20Swaps.md) - Swap workflow (same as reclaims)
- [Sleeve Swaps Tab](Sleeve%20Swaps.md) - Swap workflow (same as reclaims)
- [Employee History](../Employee%20History.md) - Previous employee tracking

---

**Last Updated:** January 8, 2026  
**Version:** 2.0 (Added Picked/Date Changed workflow)

