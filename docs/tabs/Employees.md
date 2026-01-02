# Employees Tab

## Purpose
Stores employee information, including glove and sleeve size, location, and contact details.

## Columns
- **A: Name** - Employee name.
- **B: Class** - Employee class.
- **C: Location** - Work location.
- **D: Job Number** - Job number.
- **E: Phone Number** - Contact phone.
- **F: Notification Emails** - Emails for notifications.
- **G: MP Email** - MP email.
- **H: Email Address** - Main email.
- **I: Glove Size** - Preferred glove size.
- **J: Sleeve Size** - Preferred sleeve size.

## Interactions
- Location is referenced by Gloves and Sleeves tabs to auto-update item location when assigned.
- Glove/Sleeve size is used for assignment and swap logic.

## Example
| Name     | Class | Location | Job Number | Phone Number | Notification Emails | MP Email | Email Address | Glove Size | Sleeve Size |
|----------|-------|----------|------------|--------------|---------------------|----------|---------------|------------|-------------|
| John Doe | 2     | Site A   | 12345      | 555-1234     | john@company.com    | mp@company.com | john@company.com | 9          | L           |

## Cross-Tab Dependencies
- Gloves and Sleeves tabs for assignment and location updates.
