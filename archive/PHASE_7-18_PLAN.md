# Phase 7-18 Refactor - Execution Plan

**Date**: January 3, 2026  
**Branch**: `refactor/phase-7-18`  
**Status**: 🚀 In Progress - Completing remaining modules

---

## 🎯 OBJECTIVE

Extract remaining 12 modules (~5,300 lines) to complete the refactor:
- Code.gs target: <500 lines (glue code only)
- Total modules: 18 files
- Final reduction: ~93% of original Code.gs

---

## 📋 EXTRACTION ORDER

### Phase 7: Inventory Handlers (20-InventoryHandlers.gs)
- handleInventoryAssignedToChange()
- handleDateAssignedChange()
- handleNotesChange()
- getCol() helper
**Lines**: ~500

### Phase 8: Swap Generation (30-SwapGeneration.gs)
- generateSwaps()
- generateGloveSwaps()
- generateSleeveSwaps()
- generateAllReports()
- writeSwapTableHeadersDynamic()
**Lines**: ~1,200

### Phase 9: Swap Handlers (31-SwapHandlers.gs)
- handlePickedCheckboxChange()
- handleDateChangedEdit()
- handlePickListManualEdit()
**Lines**: ~800

### Phase 10: Swap Preservation (32-SwapPreservation.gs)
- preserveManualPickLists()
- restoreManualPickLists()
**Lines**: ~200

### Phase 11: Reclaims (40-Reclaims.gs)
- updateReclaimsSheet()
- setupReclaimsSheet()
- runReclaimsCheck()
- findReclaimPickListItem()
**Lines**: ~1,000

### Phase 12: History (50-History.gs)
- saveHistory()
- viewHistory()
- viewFullHistory()
**Lines**: ~400

### Phase 13: Employee History (51-EmployeeHistory.gs)
- handleLastDayChange()
- handleRehireDateChange()
- trackEmployeeChange()
- archivePreviousEmployees()
**Lines**: ~400

### Phase 14: Purchase Needs (60-PurchaseNeeds.gs)
- updatePurchaseNeeds()
**Lines**: ~400

### Phase 15: Inventory Reports (61-InventoryReports.gs)
- updateInventoryReports()
- buildInventoryReportsTab()
**Lines**: ~500

### Phase 16: To-Do List (70-ToDoList.gs)
- generateToDoList()
- clearCompletedTasks()
**Lines**: ~200

### Phase 17: Email Reports (80-EmailReports.gs)
- sendEmailReport()
- buildEmailReportHtml()
- All section builders
**Lines**: ~700

### Phase 18: Build Sheets (95-BuildSheets.gs)
- buildSheets()
- All sheet builders
**Lines**: ~400

---

## ✅ COMPLETION CRITERIA

- All 12 modules extracted
- Code.gs < 500 lines
- All functions accessible
- No breaking changes
- Comprehensive testing guide created

---

**Status**: Starting Phase 7...

