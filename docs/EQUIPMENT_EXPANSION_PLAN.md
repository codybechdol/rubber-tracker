# Equipment Expansion Plan

## Adding New Equipment Types: Blankets, HV Testers, Phasing Sets, AED

**Created:** March 17, 2026  
**Last Updated:** March 17, 2026  
**Status:** 🚧 In Progress - Phase 1

---

## Overview

Expanding the Rubber Tracker system to track additional electrical safety equipment beyond gloves and sleeves. Each new equipment type will follow the established pattern with inventory sheets, swap sheets, and history tracking.

### Equipment Types to Add

| Equipment | Test/Calibration Interval | Naming Convention | Key Date Field |
|-----------|---------------------------|-------------------|----------------|
| **Blankets** | 1 year (test date) | B### (Regular), S### (Split) | Test Date → Change Out Date |
| **HV Testers** | 10 years (calibration) | TBD | Calibration Date → Replacement Date |
| **Phasing Sets** | 10 years (calibration) | TBD | Calibration Date → Replacement Date |
| **AED** | Pad expiration varies | TBD | Pad Expiration Date |

---

## Implementation Phases

### Phase 1: Blankets ⬅️ CURRENT
**Target:** March 2026  
**Rationale:** Most similar to existing Gloves/Sleeves pattern (has test date, class, change out)

### Phase 2: HV Testers & Phasing Sets
**Target:** After Phase 1 validated  
**Rationale:** Both share calibration/replacement pattern, can implement together

### Phase 3: AED
**Target:** After Phase 2 complete  
**Rationale:** Simplest structure (pad expiration only), no change out workflow

---

## Phase 1: Blankets - Detailed Implementation

### Blanket Specifications
- **Types:** Regular (B###) and Split (S###) - auto-detected from item number prefix
- **Classes:** 2 or 4
- **Size:** Not tracked (all same size)
- **Test Interval:** 12 months from test date
- **Assigned To:** Crew Lead (by job number)
- **Workflow:** Swap with freshly-tested blanket from inventory (like gloves)
- **Statuses:** Same as gloves (In Service, Available, In Testing, Failed, Lost, Retired)

### Sheet Structures

#### Blankets Sheet (11 columns)
| Col | Header | Description | Notes |
|-----|--------|-------------|-------|
| A | Blanket | Item # | B### or S### format |
| B | Type | Regular or Split | Auto-detect from prefix |
| C | Class | 2 or 4 | Dropdown validation |
| D | Test Date | Last electrical test date | |
| E | Date Assigned | When assigned to crew | |
| F | Location | Crew location | |
| G | Status | In Service, Available, etc. | Same as gloves |
| H | Assigned To | Crew Lead name | |
| I | Change Out Date | Test Date + 12 months | Auto-calculated |
| J | Picked For | Pending assignment | |
| K | Notes | Free text | |

#### Blanket Swaps Sheet (10 visible columns + hidden)
| Col | Header | Description |
|-----|--------|-------------|
| A | Employee | Crew Lead name |
| B | Item Number | Current blanket # |
| C | Type | Regular or Split |
| D | Date Assigned | Current assignment date |
| E | Change Out Date | When swap is due |
| F | Days Left | Calculated |
| G | Pick List | New blanket to assign |
| H | Status | Pending, Ready, etc. |
| I | Picked | Checkbox |
| J | Date Changed | When swap completed |

#### Blankets History Sheet (6 columns)
| Col | Header |
|-----|--------|
| A | Date Assigned |
| B | Item # |
| C | Type |
| D | Class |
| E | Location |
| F | Assigned To |

---

## Phase 1 Checklist

### Constants & Configuration
- [x] Add `SHEET_BLANKETS`, `SHEET_BLANKET_SWAPS`, `SHEET_BLANKETS_HISTORY` to `00-Constants.gs`
- [x] Add `INTERVAL_BLANKET_TEST = 12` constant
- [x] Add `HISTORY_COLOR_BLANKET_1`, `HISTORY_COLOR_BLANKET_2` colors
- [x] Add `COLS.BLANKETS` column mapping (mirror INVENTORY structure)
- [x] Add future equipment constants as placeholders (HV Tester, Phasing Set, AED)

### Sheet Creation
- [x] Update `buildSheets()` in `Code.gs` to create Blankets sheet with headers
- [x] Update `buildSheets()` to create Blanket Swaps sheet with headers
- [x] Create `ensureBlanketHistorySheet()` function
- [x] Add dropdown validation for Type column (Regular/Split)
- [x] Add dropdown validation for Class column (2/4)
- [x] Add dropdown validation for Status column (same as gloves)

### Core Functions
- [x] Create `calculateBlanketChangeOut(testDate)` - returns testDate + 12 months
- [x] Create `fixBlanketChangeOutDates()` - recalculates all change out dates
- [x] Create `fixBlanketChangeOutDatesSilent()` - silent version for auto-fix
- [x] Create `detectBlanketType(itemNumber)` - returns 'Regular' or 'Split' from B###/S###

### Swap Generation
- [x] Create `generateBlanketSwaps()` function (mirror `generateGloveSwaps()`)
- [x] Group swaps by job number/crew lead
- [x] Support section headers for different crews
- [ ] Handle hidden columns for stage tracking (future - matches glove pattern)

### History Tracking
- [x] Create `saveBlanketAssignmentToHistory()` function
- [x] Update history on assignment changes (onEdit trigger integration added)
- [x] Alternating row colors for visual grouping

### Task Integration
- [x] Create `collectBlanketSwapTasks()` in `76-SmartScheduling.gs` (uses collectSwapTasks)
- [x] Add call to `collectAndGroupTasks()` for blanket swaps
- [x] Blanket swaps appear in Trip Planner
- [x] Blanket swaps appear in Task List dialog

### Report Integration
- [x] Update `generateAllReports()` to include blanket swaps
- [ ] Add blanket statistics to Inventory Reports (future enhancement)

### Menu Integration
- [x] Add "🧱 Generate Blanket Swaps" menu item
- [ ] Add "🧱 Blankets History" menu item (if applicable)
- [x] Add "🧱 Fix Blanket Change Out Dates" menu item

### Testing
- [ ] Test sheet creation with `buildSheets()`
- [ ] Test change out date calculation (test date + 12 months)
- [ ] Test swap generation with sample data
- [ ] Test history tracking on assignment
- [ ] Test Task List shows blanket swaps
- [ ] Test Trip Planner shows blanket swaps
- [ ] Test marking blanket swap complete

### Deployment
- [x] Run `node validate-syntax.js`
- [x] Deploy with `.\push.bat`
- [ ] Refresh spreadsheet and verify menu items
- [ ] Test full workflow end-to-end

---

## Phase 2 Checklist (HV Testers & Phasing Sets)

### Constants & Configuration
- [ ] Activate `SHEET_HV_TESTERS`, `SHEET_HV_TESTER_SWAPS`, `SHEET_HV_TESTERS_HISTORY`
- [ ] Activate `SHEET_PHASING_SETS`, `SHEET_PHASING_SET_SWAPS`, `SHEET_PHASING_SETS_HISTORY`
- [ ] Add `INTERVAL_CALIBRATION_YEARS = 10` constant
- [ ] Add `COLS.HV_TESTER` and `COLS.PHASING_SET` column mappings

### Sheet Structure (both equipment types)
| Col | Header | Description |
|-----|--------|-------------|
| A | Item # | Equipment identifier |
| B | Model | Equipment model |
| C | (unused) | — |
| D | Calibration Date | Last calibration |
| E | Date Assigned | When assigned |
| F | Location | Crew location |
| G | Status | In Service, etc. |
| H | Assigned To | Crew Lead |
| I | Replacement Date | Calibration + 10 years |
| J | Picked For | Pending assignment |
| K | Notes | Free text |

### Sheet Creation
- [ ] Update `buildSheets()` for HV Testers sheet
- [ ] Update `buildSheets()` for HV Tester Swaps sheet
- [ ] Update `buildSheets()` for Phasing Sets sheet
- [ ] Update `buildSheets()` for Phasing Set Swaps sheet
- [ ] Create history sheets for both

### Core Functions
- [ ] Create `calculateReplacementDate(calibrationDate)` - returns date + 10 years
- [ ] Create `generateHVTesterSwaps()` function
- [ ] Create `generatePhasingSetSwaps()` function
- [ ] Create history tracking functions

### Task Integration
- [ ] Add to `collectAndGroupTasks()`
- [ ] Appear in Trip Planner and Task List

### Menu Integration
- [ ] Add menu items for HV Testers
- [ ] Add menu items for Phasing Sets

### Testing & Deployment
- [ ] Test all functions
- [ ] Deploy with `.\push.bat`

---

## Phase 3 Checklist (AED)

### Constants & Configuration
- [ ] Activate `SHEET_AED`, `SHEET_AED_SWAPS`, `SHEET_AED_HISTORY`
- [ ] Add `COLS.AED` column mapping

### Sheet Structure
| Col | Header | Description |
|-----|--------|-------------|
| A | AED | Unit identifier |
| B | Model | Equipment model |
| C | (unused) | — |
| D | Pad Expiration | When pads expire |
| E | Date Assigned | When assigned |
| F | Location | Crew location |
| G | Status | In Service, etc. |
| H | Assigned To | Crew Lead |
| I | (unused) | — |
| J | Picked For | Pending assignment |
| K | Notes | Free text |

### Implementation
- [ ] Update `buildSheets()` for AED sheets
- [ ] Create pad expiration tracking (no change out cycle)
- [ ] Create `generateAEDSwaps()` for pad replacements
- [ ] Task integration
- [ ] Menu integration

### Testing & Deployment
- [ ] Test all functions
- [ ] Deploy with `.\push.bat`

---

## Running Change Log

### March 18, 2026
- **Gloves sheet error persists but is now isolated**
  - Issue: Gloves sheet keeps showing "Please make a selection within a single column" error
  - Root cause: Unknown - the error occurs even with minimal code execution
  - Solution: Added separate try-catch around header handling so if it fails, formatting still runs
  - This allows Build Sheets to complete for all other sheets while still processing Gloves as much as possible
  - Deployed to Google Apps Script ✅

- **Added Update Reclaims to Reports submenu**
  - The Reports submenu now includes: Daily Accomplishments, Update Inventory Reports, Update Reclaims, Run Reclaims Check
  - Deployed to Google Apps Script ✅

- **Fixed Gloves sheet "column level actions" error**
  - Issue: Gloves sheet consistently failed with "Please make a selection within a single column" error while other sheets processed successfully
  - Root cause: The Gloves sheet had an active multi-column selection from a previous user action, which interfered with column-level operations
  - Solution: Added `sheet.setActiveSelection('A1')` at the start of processing for existing sheets to reset any active selection
  - Also added column count check: If sheet has fewer than 11 columns, insert columns to reach 11 before formatting columns 10-11
  - Deployed to Google Apps Script ✅

- **Fixed "Please make a selection within a single column" error (second fix)**
  - Issue: After the initial fix, the error could still occur in certain edge cases
  - Root cause: Multiple potential issues:
    1. `insertRowsAfter(0, ...)` fails if blanketSheetRows is 0
    2. `getRange(1, 1, 1, getLastColumn())` fails if getLastColumn() returns 0
    3. `getRange(2, col, lastRow - 1, 1)` fails if lastRow - 1 is 0
  - Solution: Added multiple guards:
    1. Changed `insertRowsAfter(blanketSheetRows, ...)` to `insertRowsAfter(Math.max(1, blanketSheetRows), ...)`
    2. Added `employeesSheet.getLastColumn() > 0` check before reading headers
    3. Changed `lastRow - 1` to `Math.max(1, lastRow - 1)` for validation range
  - Deployed to Google Apps Script ✅

- **Fixed "Please make a selection within a single column" error**
  - Issue: When running `buildSheets()`, the Blankets dropdown validation code failed because it tried to apply validation to rows that didn't exist in a newly created sheet
  - Root cause: `blanketLastRow - 1` calculated row count but the sheet didn't have enough rows for the validation range
  - Solution: 
    1. Added check for sheet's max rows using `getMaxRows()`
    2. If sheet has fewer than 101 rows, insert additional rows using `insertRowsAfter()`
    3. Use a fixed `blanketRowCount = 100` for validation instead of calculating from last row
  - Deployed to Google Apps Script ✅

### March 17, 2026
- Created EQUIPMENT_EXPANSION_PLAN.md
- Defined Phase 1-3 implementation approach
- Documented Blanket specifications:
  - Regular (B###) and Split (S###) with auto-detection
  - Class 2 or 4
  - 12-month test interval
  - Swap workflow (like gloves)
  - Same statuses as gloves
- Created detailed checklists for all phases
- **Started Phase 1 Implementation:**
  - Updated `00-Constants.gs` with all new constants
  - Updated `buildSheets()` to create Blankets, Blanket Swaps sheets
  - Added dropdown validations (Type, Class, Status)
  - Created core functions:
    - `calculateBlanketChangeOut()` - Test Date + 12 months
    - `detectBlanketType()` - Auto-detect Regular/Split from B###/S###
    - `fixBlanketChangeOutDates()` / `fixBlanketChangeOutDatesSilent()`
    - `ensureBlanketHistorySheet()` - Creates history sheet
    - `saveBlanketAssignmentToHistory()` - Logs assignments
    - `generateBlanketSwaps()` - Creates swap report
  - Added task collection via `collectSwapTasks()` for 'Blanket Swaps'
  - Updated `generateAllReports()` to include blanket swaps
  - Added menu items for blanket operations
  - **Deployed to Google Apps Script** ✅
- **Double-check fixes:**
  - Added SHEET_BLANKETS and SHEET_BLANKET_SWAPS to sheetDefs array (was missing!)
  - Added "🏗️ Build Sheets" menu item to Utilities submenu
  - Added Blankets handling to onEdit trigger for auto-calculating Change Out Date
  - Added Blankets to onEditHandler for item number detection and Type auto-detection
  - **Re-deployed to Google Apps Script** ✅

---

## Files Modified/Created

### Phase 1 Files
| File | Status | Changes |
|------|--------|---------|
| `src/00-Constants.gs` | ✅ Complete | Add sheet names, intervals, colors, COLS |
| `src/Code.gs` | ✅ Complete | buildSheets(), swap generation, history, menu |
| `src/76-SmartScheduling.gs` | ✅ Complete | collectBlanketSwapTasks() via collectSwapTasks |
| `docs/EQUIPMENT_EXPANSION_PLAN.md` | ✅ Created | This file |

### Phase 2 Files
| File | Status | Changes |
|------|--------|---------|
| `src/00-Constants.gs` | 🔲 Pending | Activate HV/Phasing constants |
| `src/Code.gs` | 🔲 Pending | Add HV/Phasing functions |
| `src/76-SmartScheduling.gs` | 🔲 Pending | Add task collection |

### Phase 3 Files
| File | Status | Changes |
|------|--------|---------|
| `src/00-Constants.gs` | 🔲 Pending | Activate AED constants |
| `src/Code.gs` | 🔲 Pending | Add AED functions |
| `src/76-SmartScheduling.gs` | 🔲 Pending | Add task collection |

---

## Questions & Decisions

### Resolved ✅
1. **AED Tracking:** Single row per AED with Pad Expiration column ✅
2. **Blanket Types:** Regular (B###) and Split (S###) ✅
3. **Blanket Size:** Not tracked (all same size) ✅
4. **Blanket Class:** 2 or 4 ✅
5. **History Sheets:** Separate history sheet per equipment type ✅
6. **Implementation Order:** Phased approach (Blankets → HV/Phasing → AED) ✅
7. **Blanket Workflow:** Swap with freshly-tested blanket from inventory (Option B) ✅
8. **Blanket Statuses:** Same as gloves (In Service, Available, In Testing, Failed, Lost, Retired) ✅
9. **Type Auto-Detection:** Yes, detect Regular/Split from B###/S### prefix ✅
10. **History Tracking:** Part of Phase 1 ✅

### Open Questions
1. **HV Tester/Phasing Set Naming:** What naming convention for these items?
2. **AED Naming:** What naming convention for AED units?

---

## Reference: Existing Gloves/Sleeves Pattern

### Gloves Sheet Structure (for reference)
```
A: Glove (Item #)
B: Size
C: Class
D: Test Date
E: Date Assigned
F: Location
G: Status
H: Assigned To
I: Change Out Date
J: Picked For
K: Notes
```

### Key Functions to Mirror
- `calculateChangeOutDate()` → `calculateBlanketChangeOut()`
- `generateGloveSwaps()` → `generateBlanketSwaps()`
- `collectSwapTasks()` → `collectBlanketSwapTasks()`
- `ensureSeparateHistorySheets()` → include blankets

