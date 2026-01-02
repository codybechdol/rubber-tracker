# getInventoryData

## Purpose
Retrieves inventory data from a given sheet and item type for reporting and analysis.

## How it Works
- Receives a sheet object and item type (glove or sleeve).
- Extracts relevant inventory data for summary and reporting.

## Example Usage
Called by buildInventoryReportsTab to aggregate data.

## Inputs
- sheet: Sheet object
- type: String ("Glove" or "Sleeve")

## Outputs
Inventory data array.

## Side Effects
None.
