# writeSwapTableHeadersDynamic

## Purpose
Dynamically writes headers for swap tables (Glove Swaps, Sleeve Swaps) based on item type and workflow stages.

## How it Works
- Receives the swap sheet, current row, item type, header font, and number of workflow stages.
- Writes visible and hidden workflow headers for each stage.

## Example Usage
Called during swap tab generation to set up headers.

## Inputs
- swapSheet: Sheet object
- currentRow: Integer
- itemType: String ("Glove" or "Sleeve")
- headerFont: Font style
- numStages: Integer

## Outputs
Headers written to the swap tab.

## Side Effects
None.
