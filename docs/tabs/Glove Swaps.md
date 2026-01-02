# Glove Swaps Tab

## Purpose
Manages the workflow for swapping gloves between employees, including tracking pick, delivery, and assignment stages.

## Layout
Items are grouped by **Class** (Class 0, Class 2, Class 3), and within each class, items are further grouped by **Location** (alphabetically sorted). Each location group has a sub-header row (e.g., "📍 Helena") to visually separate items by work location.

## Columns
- **A: Employee** - Employee name.
- **B: Current Glove #** - Glove currently assigned.
- **C: Size** - Glove size.
- **D: Date Assigned** - Date glove was assigned.
- **E: Change Out Date** - Next change/test date.
- **F: Days Left** - Days until change/test.
- **G: Pick List** - Glove to be picked for swap.
- **H: Status** - Workflow status (changes as swap progresses).
- **I: Picked** - Checkbox to indicate item picked.
- **J: Date Changed** - Date swap was completed (format: MM/dd/yyyy). **This is a date field, not a checkbox.**

#### Hidden Columns (K-W)
- **K-M:** Stage 1 - Pick List Glove Before Check (Status, Assigned To, Date Assigned)
- **N-P:** Stage 1 - Old Glove Assignment (Status, Assigned To, Date Assigned)
- **Q-T:** Stage 2 - Pick List Glove After Check (Status, Assigned To, Date Assigned, Picked For)
- **U-W:** Stage 3 - Pick List Glove New Assignment (Assigned To, Date Assigned, Change Out Date)

## Stage 1–3 Workflow

### Stage 1: Preparation (Pick List)
- User selects a glove in the "Pick List" column for swap.
- "Picked" is checked when the glove is physically picked.
- "Picked For" is set in the Gloves tab for the Pick List glove.
- Hidden columns K–M and N–P store pre-swap state.
- **Picked items are preserved across Build Sheets/Generate Swaps runs** until Date Changed is entered.

### Stage 2: Swap Completion
- "Date Changed" date is entered (e.g., 12/30/2025) to finalize the swap.
- Glove assignments and statuses are updated in both tabs.
- "Picked For" is cleared in the Gloves tab for the Pick List glove.
- Hidden columns Q–T and U–W store post-swap state.

### Stage 3: Reversion/Undo
- If "Date Changed" is removed, workflow reverts to pre-swap.
- "Picked For" is re-added in the Gloves tab for the Pick List glove.
- Status and assignments revert to Stage 1 values as needed.

## Picked Item Preservation
When "Generate Glove Swaps" or "Build Sheets" is run:
- The system checks the **Picked For** column in the Gloves inventory sheet
- If an item has a "Picked For" value containing an employee's name, that item is automatically:
  - Used as the Pick List Item # for that employee
  - Marked as Picked (checkbox = TRUE)
  - Status set to "Ready For Delivery 🚚"
  - Stage 2 hidden columns populated with the item's current state

This means picked items persist through regeneration because the source of truth is the **Gloves inventory sheet**, not the swap sheet itself.

## Manual Pick List Entry
- When you manually type an item number in the Pick List column (G):
  - The Status column automatically updates based on the item's inventory status
  - The cell is highlighted with a **light blue background** (`#e3f2fd`) to indicate a manual entry

## Interactions
- When "Picked" is checked, updates Gloves tab for Pick List glove (sets Picked For column).
- When "Date Changed" date is entered, reassigns gloves and updates workflow state.
- Unchecking "Picked" or removing "Date Changed" reverts workflow and updates Gloves tab accordingly.

## Example
| Employee | Current Glove # | Size | Date Assigned | Change Out Date | Days Left | Pick List | Status | Picked | Date Changed |
|----------|-----------------|------|---------------|-----------------|-----------|-----------|--------|--------|--------------|
| John Doe | G123            | 9    | 02/01/2025    | 08/01/2025      | 180       | G456      | Ready  | TRUE   | 03/01/2025   |

## Cross-Tab Dependencies
- Gloves tab for assignment and workflow updates.
- Employees tab for employee details and location information.
