# Crew Import Flow — Import Crew Makeup Dialog

**File:** `src/CrewImport.html`  
**Menu:** `Glove Manager → 📥 Import Crew Makeup → 👥 Import Crew Makeup`  
**Used In:** Monday workflow Step 1

---

## Overview

The Import Crew Makeup dialog reads the superintendent's weekly Excel spreadsheet and updates the **Employees sheet** with:
- **Location** — mapped from the job header (e.g., "Belgrade Dock" → "Bozeman")
- **Job Number** — base job + position suffix (e.g., `013-26.1`, `013-26.2`)
- **Job Classification** — F, JRY, AP 1-7, JRY OP, GTO, GTO F, EO 2, WT, etc.

All changes are logged to Employee History.

---

## 8-Step Wizard Flow

The dialog uses a visible **step progress bar** at the top. Each circle turns **green** when that step is complete and **blue** for the currently active step.

```
① Upload → ② Choose Tab → ③ New Jobs → ④ New Employees
    → ⑤ Unmatched + Duplicates → [Continue →]
    → ⑥ Special Circumstances → [Continue →]
    → ⑦ Crew Cards + Lead Selection
    → ⑧ Preview + Apply
```

### Step Gating Logic

| From Step | To Step | Trigger |
|---|---|---|
| 1 → 2 | Upload complete | Auto when SheetJS finishes parsing tabs |
| 2 → 3 | Tab clicked | Auto when `parseCrewCards()` completes |
| 3 → 4 | New jobs handled | Auto when last new-job card is confirmed or skipped |
| 4 → 5 | New employees handled | Auto when `refreshEmployeesAndContinue()` completes |
| 5 → 6 | Unmatched + dupes resolved | **Auto** if both sections are empty; **Manual "Continue →" button** if any remain |
| 6 → 7 | Special circumstances handled | Always **manual "Continue to Crew Cards →" button** (server calls involved) |
| 7 → 8 | All lead dialogs resolved | Auto when `displayPreview()` fires |
| 8 → done | Apply Changes clicked | Manual — user reviews preview table, clicks green Apply button |

**Why two explicit Continue buttons?**
- **Step 5→6:** Gives the user a moment to verify all unmatched names are resolved before committing to special circumstances processing (server calls)
- **Step 6→7:** Special circumstance cards each make individual server calls; user confirms all are done before crew cards render (prevents partial state)

### Step 1 — Upload Excel File

- Drag & drop or click to select the superintendent's `.xlsx` / `.xls` file
- SheetJS parses the workbook client-side (no server upload required)
- File info shown (name, sheet count)
- Step bar appears; moves to Step 2

### Step 2 — Choose Week Tab

- All sheet tabs are displayed (e.g., "5.18.26", "5.25.26")
- **No tab is auto-selected** — user must deliberately click the correct week
- Prompt: *"Click a tab above to load that week's crew data"*
- **Switching tabs resets all downstream sections** (fresh start)
- Clicking a tab → parses that sheet → advances to Step 3+

### Step 3 — Add New Jobs *(conditional)*

- **Triggered when:** A job number in the Excel file is not found in the Job Tracking sheet
- User provides: **Job Name** (project/site), **Location** (city dropdown)
- Buttons: **Add to Job Tracking & Continue** | **Skip**
- After handling → moves to Step 4

**Skipped automatically if:** all job numbers are already in Job Tracking.

### Step 4 — Add New Employees *(conditional)*

- **Triggered when:** An employee is marked `NEW HIRE` in the Excel file
- Shows hire card with pre-filled glove/sleeve/phone if employee is a **rehire** (found in Employee History)
- Buttons: **Add All New Hires** | **Skip**
- Adding creates the employee on the Employees sheet with hire date and location
- After all added → refreshes `currentEmployees` from sheet → moves to Step 5

**Skipped automatically if:** no NEW HIRE entries detected.

### Step 5 — Unmatched + Duplicates *(conditional)*

This step resolves **name matching** before crew cards render.

#### Unmatched Employees
- Employees in the Excel file whose names couldn't be fuzzy-matched to the Employees sheet
- Each card shows: original text, location, job#, potential matches (ranked by similarity)
- Actions per card: **Select a match** | **Search existing** | **Add as new employee** | **Skip**
- **Skip All Unmatched** button skips the whole section

#### Duplicate Employees (Multiple Crews)
- Employees who appear in more than one crew card in the same Excel sheet
- System auto-selects the most likely **primary** job (M-Th > M-F > Tue-Fri > partial week)
- Saved selections from previous imports are remembered and auto-applied
- User can override the auto-selection
- **"Confirm Selections & Continue"** button finalizes and advances

**Auto-progression:** If both sections are empty (no unmatched, no duplicates) → automatically advances to Step 6.  
**Manual gate:** If either section has items → **"Continue to Special Circumstances →"** button appears when user is ready.

### Step 6 — Special Circumstances *(conditional)*

- **Triggered when:** The Excel has a "Time off/Quit/Other" or similar section with employees flagged for special status
- Status types detected: `Light Duty`, `Time Off`, `Vacation`, `Leave`, `FMLA`, `Weeds`, `Layoff`, `Fired`, `Quit`, `Resigned`
- Each card shows the employee, their status from Excel, and a form to:
  - Confirm or change Location, Classification, Status, Date, Job Number, Notes
  - Or: **Skip** (no change applied)
  - Or: **Add as New Employee** (if not found on Employees sheet)
- Each card's **Apply** button makes an immediate server call (updates Employees sheet + logs to History)
- **Skip All Special Cases** → skips entire section
- When all cards are handled → green **"All special circumstances handled"** bar appears
- **"Continue to Crew Cards →"** button (explicit gate) → advances to Step 7

**Note:** Employees with temporary statuses (Time Off, Vacation) may still appear in their crew card this week. The system detects this and shows a warning: *"listed in crew X — likely partial-week."*

**Skipped automatically if:** no special circumstances detected.

### Step 7 — Crew Cards + Lead Selection

- Crew cards now render, showing all active crews from the Excel sheet
- Each card displays: Job Name, Job Number, City, Schedule badge, Employee list with roles and position suffixes
- **Crew Lead Selection** fires automatically as a blocking modal for any crew with multiple lead-tier employees (SUP, GF, F, GTO F)

#### Absent Lead Support
- If an employee is the established lead on the **Employees sheet** (`.1` position) but absent from the Excel this week (e.g., on Time Off), they still appear in the lead selection dialog with an **"On Time Off"** badge
- This allows Tony Harmon to remain selectable as 039-26 lead even when listed in the Time Off section

#### Crew Card Actions (per card dropdown)
- Set schedule type (Primary M-Th / M-F / Tue-Fri, Secondary, Split)
- Change crew lead (if multiple leads present)
- Set as Pending Start (with start date)
- Set as On Hold
- Mark Active Now
- Schedule Activation Date
- Mark Job Completed
- Exclude Crew from import

After all lead dialogs are resolved → automatically shows Step 8.

### Step 8 — Preview + Apply

- **Summary bar:** Crews, Employees, Matched, Changes, Unmatched, No Change
- **Changes table:** One row per employee with a change. Checkboxes to include/exclude individual rows. "Select All" toggle.
- **Apply Changes** button (green, top-right header) — now enabled
- Confirmation dialog before writing

**If no crew changes detected:** Button shows **"Finish & Sync"** — still syncs Job Tracking (foremen, schedules, job activation dates).

**Post-apply — Pending Jobs dialog:** If any imported crew matches a Pending Start or On Hold job, a dialog asks which jobs to activate:
- Checked = Confirm Return / Activate Now
- Unchecked = Keep as-is (auto-activates on scheduled date)

---

## Section Reset on Tab Switch

Switching to a different Excel tab resets:
- New Jobs section
- New Hires section
- Unmatched section
- Duplicate section
- Special Circumstances section
- Crew Cards
- Preview table
- Continue buttons
- Apply button (re-disabled)

This prevents stale data from a previous tab's parse from mixing with the new tab's data.

---

## Key Data Structures

| Variable | Type | Description |
|---|---|---|
| `parsedCrews` | Array | All crew objects from the current tab parse |
| `specialCircumstances` | Array | Employees with special status (may contain `null` holes — always guard `if (!spec) continue`) |
| `currentEmployees` | Array | Loaded from Employees sheet via `getEmployeeNamesForMatching()` |
| `jobTrackingData` | Object | `{jobNumber: {location, status, isPendingStart, isOnHold, ...}}` |
| `duplicateEmployees` | Array | Employees appearing in multiple crews |
| `proposedChanges` | Array | Final list of changes to apply (location, job#, classification) |
| `crewLeadSelections` | Object | `{jobNumber: selectedEmployeeName}` — remembered across tab switches |
| `savedDuplicateSelections` | Object | Persisted to server via `saveCrewImportDuplicateSelections()` |

---

## Key Functions

| Function | Where | Description |
|---|---|---|
| `processFile(file)` | Step 1 | Reads Excel via SheetJS, shows tab list |
| `showSheetSelection()` | Step 2 | Renders tab buttons, NO auto-select |
| `selectSheet(name, el)` | Step 2 | Resets all sections, parses chosen tab |
| `parseSheet(name)` | Step 2 | Converts Excel to 2D array, calls `parseCrewCards()` |
| `parseCrewCards(data)` | Step 2 | Main parser — finds crew headers, employees, special sections |
| `runNewJobsDetection()` | Step 3 | Detects job numbers not in Job Tracking |
| `showNewJobsSection()` | Step 3 | Renders new job cards with name/location inputs |
| `confirmNewJobs()` | Step 3 | Calls `addNewJobsToTracking()`, continues |
| `checkForNewHires()` | Step 4 | Scans `parsedCrews` for NEW HIRE entries |
| `showNewHiresSection()` | Step 4 | Renders hire cards, history lookup |
| `refreshEmployeesAndContinue()` | Step 4 | Reloads employees after adding → `continueAfterNewJobs()` |
| `continueAfterNewJobs()` | Step 5 | Runs `filterSpecialCircumstancesAlreadyMatched()` + `preResolveObviousDuplicates()` + `matchEmployeesToSheet()` |
| `matchEmployeesToSheet()` | Step 5 | Fuzzy-matches names, finds duplicates/unmatched |
| `showDuplicateSelectionUI()` | Step 5 | Renders duplicate resolution cards |
| `resolveDuplicates()` | Step 5 | Saves selections, calls `finishMatching()` → `checkAutoProgressToSpecial()` |
| `checkAutoProgressToSpecial()` | Step 5→6 | If 0 unmatched + 0 dupes → auto-advance; else show Continue button |
| `continueToSpecial()` | Step 6 | Hides resolution section; shows Special if any; else skips to Step 7 |
| `showSpecialSection()` | Step 6 | Renders special circumstance cards |
| `removeSpecialCard(i)` | Step 6 | Removes card; shows "all done" bar when last card resolved |
| `skipAllSpecial()` | Step 6 | Clears special array, calls `continueToCrewCards()` |
| `continueToCrewCards()` | Step 7 | Shows crew cards, runs `checkAndHandleMultipleLeads()` → `displayPreview()` |
| `showCrewPreview()` | Step 7 | Renders all crew cards (filters completed jobs) |
| `detectCrewsWithMultipleLeads()` | Step 7 | Finds crews with 2+ lead-tier employees (incl. absent leads from sheet) |
| `showLeadSelectionDialog()` | Step 7 | Blocking modal to pick the `.1` crew lead |
| `displayPreview()` | Step 8 | Shows stats + changes table, enables Apply button |
| `applyChanges()` | Step 8 | Validates, confirms, calls `doApplyChanges()` |
| `doApplyChanges()` | Step 8 | Calls `applyCrewChanges()` server function |

---

## Parsing Rules (Excel Grid Format)

The superintendent's spreadsheet uses a **grid layout** with crew cards in columns A–D.

### Crew Header Detection
- Cells matching pattern `{Location Text} {XXX-XX}` (e.g., "Belgrade Dock 013-26 5 8's M-F")
- Greyed-out cells → skipped (inactive/future jobs)
- BID items → included only if they have employee rows below them

### Employee Row Parsing (`parseEmployeeName()`)
- Role suffixes stripped: `F`, `GF`, `SUP`, `JL`, `1-7 ap`, `Jry Op`, `GTO`, `GTO F`, `EO2`, `WT`
- Schedule annotations stripped: "Crew to 5 10's this wk", "M-F", etc.
- Trailing annotations stripped: "Hot", "Cold", "Weeds?", etc.
- `NEW HIRE` prefix stripped → employee flagged as `isNewHire: true`
- Empty names (role-only entries like "NEW HIRE JL") → `isEmployeeName()` returns `false`, skipped

### Special Section Detection
- Cells matching: `Light Duty`, `Time off`, `Quit`, `Other`, `Layoff`, `Resign`, `Leave`, `Vacation`, `MT Misc`, `Weeds`
- **Special section boundaries are column-specific** — a "Weeds Gas" header in column C does NOT truncate employee lists in columns A or B
- **Cross-column header rows** (new row of crew headers) DO act as a boundary for all columns

### `specialCircumstances` Array Safety
`removeSpecialCard()` sets entries to `null` (not splice) to preserve DOM card IDs.  
**Every loop over `specialCircumstances` MUST guard:** `if (!spec) continue;`

---

## Location Mapping Priority

1. **Job Tracking sheet** (by job number) — most authoritative
2. **Default location mappings** (hardcoded fallback)
3. **Unknown** — shown in Unknown Locations section for user to map

Key mappings:
- Belgrade Dock → Bozeman
- Helena Trans Dock / Helena Dock → Helena
- Great Falls Dock / G Falls → Great Falls
- Butte Dock → Butte
- Livingston Dock → Livingston
- Msla / Msla ZIPLY Poles → Missoula
- Lolo Sub Dock → Lolo
- CA Sub Foundation → California

---

## Classification Hierarchy (Crew Lead Priority)

Used by `getClassificationPriority()` and `detectCrewsWithMultipleLeads()`:

| Priority | Classification | Role |
|---|---|---|
| 1 | SUP | Supervisor |
| 2 | GF | General Foreman |
| 3 | F | Foreman |
| 4 | GTO F | GTO Foreman |
| 5 | JRY / JL | Journeyman Lineman |
| 6 | WT | Wire Technician |
| 7 | JRY OP | Journey Operator |
| 8 | GTO | Gas Tech Operator |
| 9 | EO 1 | Equipment Operator 1 |
| 10 | EO 2 | Equipment Operator 2 |
| 11–17 | AP 7–AP 1 | Apprentice (descending) |

Position suffixes are assigned by this priority order: lead gets `.1`, remaining by classification then alphabetical.

---

## Special Status Behaviors

| Status | Location Written | Job Number | Notes |
|---|---|---|---|
| Light Duty | Helena | 005-26.N | New hires: Location=Helena. Existing: Location="Light Duty" (backwards compat) |
| Weeds | Weeds | Cleared | Waiting for work to start |
| Vacation | Vacation | Unchanged | Temporary — may still appear in crew card this week |
| Time Off | Unchanged | Unchanged | Single-week absence, employee stays on crew |
| Leave / FMLA | Leave | Unchanged | Extended absence |
| Layoff / Fired / Quit / Resigned | Previous Employee | Cleared | Triggers Employee History archive |

---

## Troubleshooting

| Symptom | Likely Cause | Fix |
|---|---|---|
| Employee not appearing in crew lead dialog | They're in Time Off section (absent this week) but established lead on sheet | Fixed: `detectCrewsWithMultipleLeads()` now includes absent leads from Employees sheet |
| Auto-applied special cards repeating on tab switch | `_autoSelectionsAppliedForTab` guard was not tab-aware | Fixed: guard checks both flag AND current tab name |
| Light Duty job numbers incrementing on each parse | `applySpecialCircumstanceUpdate()` allocated new 005- number each call | Fixed: checks if employee already has 005- prefix job before allocating |
| 026-26 not added to Job Tracking | `insertCheckboxes()` inside main try/catch caused silent failure | Fixed: wrapped in own try/catch; post-write verification read added |
| Crew cards showing inside Special Circumstances section | Old flow rendered crew cards before special | Fixed: crew cards now render ONLY after Step 6 (Special) is complete |

---

## Version History

| Date | Change |
|---|---|
| **May 17, 2026** | Persistent crew lead selections: saved to ScriptProperties (`CREW_IMPORT_LEAD_SELECTIONS`), auto-applied on next import, "Remember" checkbox in dialog. Nickname/variant deduplication for absent leads. `_currentWizardStep` tracking to guard against backwards wizard reset. "Not an Employee" button replaces "Skip" for unmatched rows. Expanded `isEmployeeName()` to reject more "Crew in/at/to/from" annotations. Menu cleanup: removed legacy one-time migration items from all submenus. |
| **May 16, 2026** | Redesigned as 8-step wizard. Removed auto-tab-select. Reordered sections: Unmatched → Special → Crew Cards (was: Crew Cards → Special → Unmatched). Added tab-reset on re-selection. Added absent-lead support in crew lead dialog. Added two explicit Continue buttons (Step 5→6, Step 6→7). |
| **April 2026** | Added null-guard fixes for `specialCircumstances` array. Added `_autoSelectionsAppliedForTab` guard for tab-aware auto-apply. Fixed Light Duty job number increments. |
| **March 2026** | Added Pending Start job filtering (completed jobs excluded from crew preview). Added activation dialog for pending jobs detected in Excel. Added "Set as Pending Start" dropdown option on crew cards. |
| **February 2026** | Initial implementation. SheetJS file parsing, crew card grid layout, fuzzy name matching, special circumstances handling, position suffix assignment. |

