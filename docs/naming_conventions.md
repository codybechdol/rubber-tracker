# Naming Conventions

## Functions
- Use camelCase for function names (e.g., processEdit, generateGloveSwaps).
- Prefix event handlers with the event type (e.g., onEdit, onOpen).
- Use descriptive names that reflect the function's purpose.

## Tabs
- Use Title Case for tab names (e.g., Gloves, Employees, Glove Swaps).
- Tab names should be singular or plural as appropriate to their content.

## Columns
- Use clear, concise names for columns (e.g., Status, Date Assigned, Picked).
- For workflow columns, use prefixes to indicate stage (e.g., Stage1_Status, Stage2_AssignedTo).

## Documentation Files
- Function documentation: /docs/functions/functionName.md
- Tab documentation: /docs/tabs/tabName.md
- Naming conventions: /docs/naming_conventions.md

## Examples
- Function: processEdit
- Tab: Gloves
- Column: Date Assigned
- Documentation file: /docs/functions/processEdit.md

## Rationale
Consistent naming improves readability, maintainability, and helps agents and developers quickly understand the codebase and data structure.
