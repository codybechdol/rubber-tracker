# updateGlovesLocationsFromAssignedTo

## Purpose
Synchronizes glove locations based on the "Assigned To" field, ensuring accurate inventory tracking.

## How it Works
- Reads the "Assigned To" field for each glove.
- Updates the "Location" field accordingly, referencing the Employees tab.

## Example Usage
Called after assignment changes or during inventory updates.

## Inputs
None.

## Outputs
Glove locations updated.

## Side Effects
May update multiple rows in the Gloves tab.
