# Gloves Tab
- Location is synced with Employees tab.
- Glove Swaps tab for workflow updates.
- Employees tab for location and assignment.
## Cross-Tab Dependencies

| G123  | 9    | 2     | 2025-01-01| 2025-02-01   | Site A   | Assigned| John Doe    | 2025-08-01      | John Doe  | -     |
|-------|------|-------|-----------|--------------|----------|--------|-------------|-----------------|------------|-------|
| Glove | Size | Class | Test Date | Date Assigned | Location | Status | Assigned To | Change Out Date | Picked For | Notes |
## Example
- "Picked For" is updated by Glove Swaps tab.
- Status, Location, and Change Out Date are auto-updated by assignment changes and swap workflows.
## Interactions

- **K: Notes** - Freeform notes.
- **J: Picked For** - Notes about who picked the glove and when (updated by swaps).
- **I: Change Out Date** - Next required change/test date.
- **H: Assigned To** - Employee or status.
- **G: Status** - Current status (Assigned, On Shelf, Ready For Delivery, etc.).
- **F: Location** - Location, auto-updated from Employees tab.
- **E: Date Assigned** - Date assigned to employee.
- **D: Test Date** - Last test date.
- **C: Class** - Glove class (0, 2, 3).
- **B: Size** - Glove size.
- **A: Glove** - Unique glove identifier.
## Columns

Tracks all gloves in inventory, their assignment, status, and workflow state.
## Purpose


