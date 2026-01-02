# sendEmailReport

## Purpose
Sends a comprehensive HTML email report containing To-Do List, Glove Swaps, Sleeve Swaps, Reclaims, Purchase Needs, and Inventory Reports to all recipients listed in the "Notification Emails" column of the Employees sheet.

## How it Works
1. Calls `getNotificationRecipients()` to retrieve unique email addresses from the Employees sheet
2. Silently skips if no recipients are configured (no error shown)
3. Calls `buildEmailReportHtml()` to generate styled HTML content from all 6 report sheets
4. Sends the email via `MailApp.sendEmail()` with subject "Rubber Tracker Weekly Report - [date]"
5. Shows confirmation alert if called manually from the menu

## Example Usage
- **Manual:** Glove Manager → 📧 Email Reports → Send Report Now
- **Automated:** Weekly trigger on Monday at 12 PM (via `createWeeklyEmailTrigger()`)

## Inputs
None (reads from sheets and Employees "Notification Emails" column)

## Outputs
- HTML email sent to all configured recipients
- Log entries for each sent email
- UI confirmation alert (if called manually)

## Side Effects
- Sends email via Google Apps Script MailApp service
- Logs events to Logger

## Related Functions
- `getNotificationRecipients()` - Retrieves email list
- `buildEmailReportHtml()` - Generates HTML content
- `createWeeklyEmailTrigger()` - Sets up automated Monday 12 PM trigger
- `removeEmailTrigger()` - Removes the scheduled trigger

## Email Content Sections
1. **📊 Inventory Reports** - Summary dashboard with totals and status breakdowns
2. **🛒 Purchase Needs** - Items needing order by priority/timeframe
3. **📋 To-Do List** - Tasks grouped by location with status
4. **🧤 Glove Swaps** - Employees needing glove swaps by class and location
5. **💪 Sleeve Swaps** - Employees needing sleeve swaps by class and location
6. **🔄 Reclaims** - Class compliance reclaims and previous employee items

## Recipient Configuration
Add email addresses to the "Notification Emails" column (F) in the Employees sheet. Multiple emails can be separated by commas or semicolons.

