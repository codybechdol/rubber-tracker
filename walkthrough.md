- **Swap Generation Engine Execution Resolution (`swaps.js`):**
  - Resolved a duplicate `const invMap` declaration in `handleDateChangedEdit()` inside [desktop/js/swaps.js](file:///c:/Users/codyb/WebstormProjects/Safety%20Assistant/desktop/js/swaps.js) that caused a browser parse failure and prevented `window.swapEngine` from initializing.
  - Verified full end-to-end execution of `generateAllSwaps()` across all 9 equipment swap sheet generators (`gloves`, `sleeves`, `blankets`, `macks`, `hv_testers`, `phasing_sets`, `aed`, `grounds`, `hot_sticks`).
  - Added safe fallback dialog handling for `showSwapSummaryModal()`.

# Walkthrough: Employee Sheet Organization & Visual Definition

## Summary of Completed Implementation

### 1. Created `organizeAndFormatEmployeesSheet()` in [22-EmployeeValidation.gs](file:///c:/Users/codyb/WebstormProjects/Safety%20Assistant/src/22-EmployeeValidation.gs)
- **Hierarchy & Ordering**:
  1. **Location**: All active physical cities sorted alphabetically (`Belgrade`, `Big Sky`, `Big Timber`, `Billings`, `Butte`, `Darby`, `Dillon`, `Ennis`, `Great Falls`, `Helena`, `Kalispell`, `Livingston`, `Melville`, `Missoula`, `Three Rivers`, etc.), followed by status/inactive locations at the bottom (`Helena (Light Duty)`, `Light Duty`, `Helena (Vacation)`, `Vacation`, `Previous Employee`, `Lost`, `Unknown`).
  2. **Job Number**: Numerical and hierarchical ordering within each city (`013-26.01`, `013-26.02`, `013-26.03`...).
  3. **Classification Rank**: Seniority hierarchy within each crew (`SUP > GF > F > GTO F > JRY > JRY OP > WT > GTO > EO > AP 7-1`).
  4. **Name**: Alphabetical tie-breaker.
- **Visual Definitions**:
  - **Location Boundary**: Prominent solid top border (`#1e293b`) separating different cities.
  - **Crew Boundary**: Subtle solid top border (`#64748b`) separating different job numbers/crews within each city.
  - Formats date columns (`MM/dd/yyyy`) and aligns columns properly without corrupting formulas or Table validations.
  - Automatically cleans any ghost rows below the active employees.

### 2. Menu Integration ([99-MenuFix.gs](file:///c:/Users/codyb/WebstormProjects/Safety%20Assistant/src/99-MenuFix.gs))
- Added to the Google Sheets menu:
  - **Glove Manager** $\rightarrow$ **🔧 Maintenance** $\rightarrow$ **👥 Employees** $\rightarrow$ **📋 Organize & Format Employees Sheet**.

### 3. Automated Post-Sync Organization ([89-SyncAPI.gs](file:///c:/Users/codyb/WebstormProjects/Safety%20Assistant/src/89-SyncAPI.gs))
- Automatically runs `organizeAndFormatEmployeesSheet(true)` whenever `Employees` is synced or overwritten from the desktop app.
- Deployed and live in Google Apps Script as **Version 70**.

---

## How to Run It Right Now

### Option A: From Google Sheets Menu
1. In Google Sheets, click **Glove Manager** (or **Safety Assistant**) in the top menu bar.
2. Select **🔧 Maintenance** $\rightarrow$ **👥 Employees** $\rightarrow$ **📋 Organize & Format Employees Sheet**.
3. The entire sheet will immediately re-sort by Location and Job Number with clean borders between locations and crews.

### Option B: From Desktop App
1. In your **Desktop App**, click **`🧹 Overwrite Sheets with Clean Local Tables`** (or click **`⬆️ Push Changes to Sheets`**).
2. The sync engine will automatically push the clean data and run the organization script on Google Sheets.
