# processSwapTab

## Purpose
Processes swap tab data for gloves or sleeves, updating workflow states and assignments.

## How it Works
- Receives tab name, item type, and all rows.
- Updates workflow columns and assignments based on user actions.

## Example Usage
Called during swap tab edits or workflow transitions.

## Inputs
- tabName: String
- itemType: String
- allRows: Array

## Outputs
Swap tab updated.

## Side Effects
May update Gloves/Sleeves tabs and workflow columns.
