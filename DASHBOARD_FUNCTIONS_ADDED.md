# Dashboard Functions Added - January 8, 2026

## Summary
The HTML Dashboard (`Dashboard.html`) existed in the project but the backend functions to support it were missing from `Code.gs`. These functions have now been added.

## Functions Added to Code.gs

### 1. `openDashboardSidebar()`
Opens the Dashboard.html in a sidebar panel within Google Sheets.
- Width: 450px
- Title: "Rubber Tracker Dashboard"
- Menu location: Glove Manager → 📱 Open Dashboard

### 2. `openDashboardDialog()`
Opens the Dashboard.html in a larger modal dialog for better viewing.
- Width: 1200px
- Height: 800px

### 3. `getDashboardData()`
Main function called by Dashboard.html via `google.script.run`. Returns a comprehensive data object containing:

**Summary Object:**
- `totalGloves` - Total count of gloves
- `totalSleeves` - Total count of sleeves
- `totalAssigned` - Count of assigned items
- `totalOnShelf` - Count of items on shelf
- `totalTesting` - Count of items in testing
- `totalOverdue` - Count of overdue items
- `assignedByClass` - Breakdown by class {0, 2, 3}
- `onShelfByClass` - Breakdown by class
- `testingByClass` - Breakdown by class

**Status Data:**
- `gloves` - Array of {status, count, percent}
- `sleeves` - Array of {status, count, percent}

**Class Data:**
- Array of {class, gloves, sleeves, total} for Class 0, 2, 3

**Location Data:**
- Top 10 locations by item count

**Swaps Data:**
- `gloveSwaps` - Up to 20 upcoming/overdue glove swaps
- `sleeveSwaps` - Up to 20 upcoming/overdue sleeve swaps

**Purchase Needs:**
- Simplified summary of items needing purchase

**NEW - Reclaims Summary:**
- `class3` - Count of Class 3 reclaims
- `class2` - Count of Class 2 reclaims
- `prevEmployee` - Count of Previous Employee items
- `lost` - Count of lost items
- `total` - Total reclaims

**NEW - To-Do Summary:**
- `high` - High priority tasks
- `medium` - Medium priority tasks
- `low` - Low priority tasks
- `completed` - Completed tasks
- `total` - Total incomplete tasks

**Raw Data:**
- `rawGloves` - Full gloves array for detail views
- `rawSleeves` - Full sleeves array for detail views

### 4. `getSwapsDataForDashboard(swapSheet)`
Helper function to read swap data from a swap sheet and format it for dashboard display.

### 5. `getPurchaseNeedsForDashboard()`
Helper function to count items needing purchase from swap sheets and reclaims.

### 6. `getReclaimsSummaryForDashboard(reclaimsSheet)`
NEW helper function to get reclaims summary by section.

### 7. `getTodoSummaryForDashboard(todoSheet)`
NEW helper function to get to-do list summary by priority.

## Menu Integration
The menu item "📱 Open Dashboard" was already in the `onOpen()` function and is now functional.

## Dashboard Features
The Dashboard.html provides:
- Summary cards showing totals and class breakdowns
- Status breakdown tables with bar charts
- Inventory by class and location
- Upcoming and overdue swaps
- Purchase needs summary
- Click-through to detailed views
- Auto-refresh every 5 minutes
- Manual refresh button

## How to Use
1. Deploy the updated Code.gs to Google Apps Script
2. Reload the spreadsheet
3. Click Glove Manager → 📱 Open Dashboard
4. The dashboard will load in a sidebar

## Notes
- The dashboard reads live data from the spreadsheet
- No additional setup required
- Works with existing sheet structure
- Uses existing helper functions like `normalizeStatusForReport()` and `formatDateForDisplay()`

