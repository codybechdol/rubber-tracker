# onEditHandler

## Purpose
Handles all edit events in the spreadsheet, routing them to the appropriate logic based on the tab and column edited.

## How it Works
- Receives the event object from Google Sheets.
- Determines which tab and column was edited.
- Calls specific logic for Gloves, Sleeves, Glove Swaps, Sleeve Swaps, etc.

## Example Usage
Automatically invoked when a user edits any cell in the spreadsheet.

## Inputs
- Event object (e)

## Outputs
Processes the edit and updates relevant cells/tabs.

## Side Effects
May trigger workflow changes, status updates, or cross-tab updates.
