# History Tab

## Purpose
Tracks the history of changes and actions taken in the spreadsheet for auditing and review.

## Columns
- **A: Timestamp** - Date and time of the change.
- **B: User** - User who made the change.
- **C: Action** - Description of the action taken.
- **D: Details** - Additional details about the change.

## Interactions
- Populated by logEvent and viewHistory functions.
- Used for audits and troubleshooting.

## Example
| Timestamp           | User      | Action         | Details                |
|---------------------|-----------|---------------|------------------------|
| 2025-12-24 10:00:00 | John Doe  | Assigned Glove| G123 to John Doe       |
| 2025-12-24 10:05:00 | Jane Doe  | Picked Sleeve | S789 for Jane Doe      |

## Cross-Tab Dependencies
- Functions that log or review history (logEvent, viewHistory).
