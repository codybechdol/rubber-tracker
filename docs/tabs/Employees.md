# Employees Tab

## Purpose
Stores employee information, including glove and sleeve size, location, contact details, and job classification.

## Columns
- **A: Name** - Employee name.
- **B: Class** - Employee class.
- **C: Location** - Work location.
- **D: Job Number** - Job number (format: XXX-YY.Z, e.g., 009-26.1).
- **E: Phone Number** - Contact phone.
- **F: Notification Emails** - Emails for notifications.
- **G: MP Email** - MP email.
- **H: Email Address** - Main email.
- **I: Glove Size** - Preferred glove size.
- **J: Sleeve Size** - Preferred sleeve size.
- **K: Hire Date** - Date employee was hired.
- **L: Last Day** - Date employee left (if applicable).
- **M: Last Day Reason** - Reason for leaving.
- **N: Job Classification** - Employee role (e.g., "Foreman", "Lead", "Supervisor", "Journeyman", "Apprentice").

## Interactions
- Location is referenced by Gloves and Sleeves tabs to auto-update item location when assigned.
- Glove/Sleeve size is used for assignment and swap logic.
- Job Number is used for crew-based training tracking (crew extracted by removing suffix after last dot).
- Job Classification identifies crew leads for scheduling and training compliance.

## Example
| Name     | Class | Location | Job Number | Phone Number | Notification Emails | MP Email | Email Address | Glove Size | Sleeve Size | Hire Date | Last Day | Last Day Reason | Job Classification |
|----------|-------|----------|------------|--------------|---------------------|----------|---------------|------------|-------------|-----------|----------|-----------------|-------------------|
| John Doe | 2     | Site A   | 009-26.1   | 555-1234     | john@company.com    | mp@company.com | john@company.com | 9          | L           | 01/01/2020 |          |                 | Foreman          |
| Jane Smith | 2   | Site A   | 009-26.2   | 555-1235     | jane@company.com    | mp@company.com | jane@company.com | 8          | M           | 03/15/2021 |          |                 | Journeyman       |

## Cross-Tab Dependencies
- Gloves and Sleeves tabs for assignment and location updates.
- Training Tracking for crew-based compliance reporting.
