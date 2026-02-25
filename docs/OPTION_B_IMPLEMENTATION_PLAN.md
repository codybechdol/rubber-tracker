# Option B Implementation Plan: Raw Data Logging Sheets

**Date:** February 24, 2026
**Status:** ✅ IMPLEMENTED

---

## Overview

This plan addresses the fundamental issue with safety compliance tracking: **crews are not getting credited for JHAs and Safety Meetings** despite emails being present in Gmail.

### Root Cause Analysis

After extensive debugging, we identified multiple failure points in the current flow:

1. **PDF extraction is slow and unreliable** (~5-10 seconds per PDF, sometimes fails)
2. **Subject line parsing is inconsistent** - date formats vary, job numbers malformed
3. **Job resolution is complex** - secondary jobs, custom mappings, all happening inline
4. **No audit trail** - when something fails, we can't see WHY a report wasn't credited
5. **Compliance data gets overwritten** - calculateSafetyCompliance() may reset ✅ to ⏳

### The Solution: Raw Data Logging + Calculation Phase

**Phase 1: Log every email to dedicated sheets (audit trail)**
**Phase 2: Calculate compliance from logged data (reliable, reproducible)**

---

## New Sheet Structure

### 1. "JHA Log" Sheet (NEW)

| Column | Name | Description |
|--------|------|-------------|
| A | Date Received | When email arrived in Gmail |
| B | Date Created | JHA work date (from PDF or subject) |
| C | Job Number | Raw job number from email |
| D | Foreman | Resolved foreman name (or "UNKNOWN") |
| E | Email Subject | Full subject line for debugging |
| F | Email ID | Gmail message ID (deduplication) |
| G | Source | "Subject" or "PDF" - where date came from |
| H | Status | "Credited", "Unknown Job", "Duplicate", "Error" |
| I | Credited To | Which tracked crew got credit (or blank) |
| J | Notes | Any additional info or error messages |

### 2. "Weekly Safety Log" Sheet (NEW)

| Column | Name | Description |
|--------|------|-------------|
| A | Date Received | When email arrived in Gmail |
| B | Week Of | Week date from subject line |
| C | Job Number | Raw job number from email |
| D | Foreman | Resolved foreman name (or "UNKNOWN") |
| E | Email Subject | Full subject line |
| F | Email ID | Gmail message ID |
| G | Status | "Credited", "Unknown Job", "Duplicate" |
| H | Credited To | Which tracked crew got credit |
| I | Notes | Additional info |

### 3. "Monthly Checklist Log" Sheet (NEW)

| Column | Name | Description |
|--------|------|-------------|
| A | Date Received | When email arrived |
| B | Report Date | Date of checklist |
| C | Job Number | Raw job number |
| D | Foreman | Resolved foreman name |
| E | Vehicle Number | Extracted vehicle # |
| F | Email Subject | Full subject |
| G | Email ID | Gmail message ID |
| H | Status | "Credited", "Unknown Job", "Duplicate" |
| I | Credited To | Which crew got credit |
| J | Has Equipment Issues | "Yes" or "No" |
| K | Notes | Additional info |

### Existing Sheets (Updated)

- **Safety Compliance** - Keep as-is (the ✅/❌ grid) - will be POPULATED from log sheets
- **Safety Equipment Needs** - Keep as-is - only actual equipment issues (NOT compliance tracking)

---

## New Data Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                    PROCESS SAFETY EMAILS                         │
└───────────────────────────┬─────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│  STEP 1: READ EMAILS & LOG TO RAW SHEETS                         │
│  - Parse subject line (job #, date)                              │
│  - Try PDF extraction (if not fast mode)                         │
│  - Look up foreman (Employees sheet + custom mappings)           │
│  - If job unknown → Log with Status="Unknown Job"                │
│  - If resolved → Log with Status="Credited", Credited To=[crew]  │
│                                                                  │
│  OUTPUT:                                                         │
│  - JHA Log gets JHA records                                      │
│  - Weekly Safety Log gets meeting records                        │
│  - Monthly Checklist Log gets checklist records                  │
│  - Safety Equipment Needs gets ONLY equipment issues             │
└───────────────────────────┬─────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│  STEP 2: CALCULATE COMPLIANCE FROM LOGS                          │
│  - For each tracked crew + week:                                 │
│    - Scan JHA Log for "Credited To" = this crew                  │
│    - For each JHA found, mark that day ✅ or ✅L                  │
│    - Scan Weekly Safety Log for meeting                          │
│    - Scan Monthly Checklist Log for checklist                    │
│  - Update Safety Compliance sheet with results                   │
│  - Create tasks for "Missing Reports" status                     │
└───────────────────────────┬─────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│  STEP 3: SHOW RESULTS                                            │
│  - Display compliance grid                                       │
│  - Show unknown jobs that need assignment                        │
│  - Show any errors for manual review                             │
└─────────────────────────────────────────────────────────────────┘
```

---

## Implementation Tasks

### Task 1: Create Log Sheet Setup Functions

```javascript
function setupJHALogSheet()
function setupWeeklySafetyLogSheet()  
function setupMonthlyChecklistLogSheet()
function setupAllSafetyLogSheets() // Menu function - creates all 3
```

Each function:
- Creates sheet if not exists
- Sets headers with formatting
- Adds Email ID column as data validation for uniqueness

### Task 2: Create Unified Email Logging Function

```javascript
/**
 * Logs a parsed email to the appropriate log sheet
 * This is THE ONLY place emails get recorded
 * 
 * @param {Object} parsed - Parsed email from parseSafetyEmail()
 * @param {string} reportType - "JHA", "Safety Meeting", or "Monthly Checklist"
 * @returns {Object} - { success: boolean, status: string, creditedTo: string|null }
 */
function logSafetyEmail(parsed, reportType)
```

Key behaviors:
- **Always logs** - even if job unknown (Status = "Unknown Job")
- **Deduplicates** - checks Email ID column before adding
- **Resolves job** - uses new unified `resolveJobToCrew()` function
- **Records source** - "Subject" or "PDF" so we know where date came from

### Task 3: Refactor processSafetyEmails()

Current flow (broken):
```
1. Parse email
2. Build compliance record in memory
3. Try to resolve job inline
4. Write to Safety Reports (NO LONGER DOING THIS)
5. At end, call calculateSafetyCompliance() (reads from Safety Reports - EMPTY!)
```

New flow (reliable):
```
1. Parse email
2. Log to appropriate sheet (JHA Log, Weekly Safety Log, etc.)
3. Continue to next email
4. At end, call calculateComplianceFromLogs()
```

### Task 4: Create calculateComplianceFromLogs()

```javascript
/**
 * Calculates Safety Compliance from the raw log sheets
 * This is called AFTER all emails are logged
 * 
 * @param {Date} weekStartDate - Sunday of week to calculate
 * @returns {Object} - Compliance data for UI display
 */
function calculateComplianceFromLogs(weekStartDate) {
  // 1. Get all crews from getActiveCrews()
  // 2. Read JHA Log - filter by week, group by "Credited To"
  // 3. Read Weekly Safety Log - filter by week
  // 4. Read Monthly Checklist Log - filter by month
  // 5. Build compliance state for each crew
  // 6. Update Safety Compliance sheet
  // 7. Return data for UI
}
```

### Task 5: Unknown Jobs Manual Assignment

When a job can't be resolved, it's logged with Status="Unknown Job".

New UI workflow:
1. After processing, check for "Unknown Job" rows in log sheets
2. Show dialog with unknown jobs
3. User assigns each to a foreman/crew OR marks as "Skip"
4. Update log row: Status → "Credited" or "Skipped", Credited To → [crew]
5. Re-run `calculateComplianceFromLogs()` to update compliance

### Task 6: Auto-Cleanup on Each Run

Before logging new emails:
```javascript
function cleanupOldLogEntries() {
  // Remove log entries older than 90 days
  // Keeps the sheets manageable
  // Compliance data in Safety Compliance sheet is preserved
}
```

### Task 7: PDF Extraction Fallback

When PDF extraction fails:
```javascript
// If PDF extraction fails but subject has valid date/job:
// - Still log the record
// - Source = "Subject date (PDF failed)"  
// - Notes = "PDF extraction failed: [error]"
```

---

## Key Benefits of This Approach

### 1. **Complete Audit Trail**
Every email is logged. If a crew doesn't get credit, you can see WHY:
- Was email logged? → Check log sheet
- Was job resolved? → Check "Credited To" column
- Was it marked as duplicate? → Check "Status" column

### 2. **Reliable Compliance Calculation**
Compliance is calculated from logged data, not from inline processing.
This means:
- Consistent results every time
- Can re-run compliance calculation without re-processing emails
- No data loss during processing errors

### 3. **Easy Manual Fixes**
If a job was logged as "Unknown Job":
- Find it in the log sheet
- Manually enter the correct crew in "Credited To"
- Run "Recalculate Compliance" from menu
- Crew now gets credit

### 4. **Debugging Capability**
Each log sheet shows exactly what happened:
- Date Received vs Date Created → detect late submissions
- Source (Subject/PDF) → see where date came from
- Notes → see any errors or edge cases

### 5. **Performance**
- Logging is FAST (simple append operation)
- Compliance calculation runs ONCE at end
- No repeated lookups during email processing

---

## Migration Plan

### Phase 1: Create New Sheets (No Data Loss)
1. Add "JHA Log", "Weekly Safety Log", "Monthly Checklist Log" sheets
2. Existing Safety Compliance data is preserved
3. New logs start fresh - compliance grid will be rebuilt from logs going forward

### Phase 2: Update processSafetyEmails()
1. Replace inline compliance building with logging calls
2. Add `calculateComplianceFromLogs()` call at end
3. Existing unknown job handling redirects to log-based approach

### Phase 3: Add Menu Items
- "🛡️ Safety → Setup Log Sheets" - creates the 3 new sheets
- "🛡️ Safety → Recalculate Compliance" - re-runs calculation from logs
- "🛡️ Safety → View JHA Log" - opens JHA Log sheet
- "🛡️ Safety → View Weekly Safety Log" - opens Weekly Safety Log sheet

---

## Configuration Decisions (Approved)

1. **Keep existing Safety Compliance data, new logs start fresh** - compliance grid will be rebuilt from logs going forward
2. **Keep log sheets visible** for debugging and manual inspection - can hide later if desired
3. **If PDF extraction fails but subject has valid date/job** - still log the record with "Subject date (PDF failed)" in Notes column

---

## Testing Plan

### Test 1: Fresh Processing
1. Clear all log sheets
2. Run "Process Safety Emails" for 14 days
3. Verify:
   - JHA Log has JHA records
   - Weekly Safety Log has meeting records
   - Safety Compliance shows ✅ for credited crews

### Test 2: Unknown Job Assignment
1. Find an "Unknown Job" row in JHA Log
2. Manually enter a valid crew in "Credited To"
3. Run "Recalculate Compliance"
4. Verify that crew now shows ✅

### Test 3: Duplicate Prevention
1. Run "Process Safety Emails" twice
2. Verify no duplicate entries (same Email ID)

### Test 4: Late Submission Detection
1. Find a JHA where Date Received week ≠ Date Created week
2. Verify it shows ✅L (late indicator)

---

## Files to Modify

1. **src/88-SafetyReports.gs** - Major refactor
   - Add setup functions for new sheets
   - Add `logSafetyEmail()` function
   - Refactor `processSafetyEmails()` to use logging
   - Add `calculateComplianceFromLogs()` function
   - Add `cleanupOldLogEntries()` function

2. **src/Code.gs** - Menu updates
   - Add menu items for new functions

3. **src/ProcessSafetyEmailsDialog.html** - Minor updates
   - Update result display to show log counts

---

## Estimated Changes

- **New code:** ~400-500 lines
- **Modified code:** ~200-300 lines  
- **Risk level:** Medium (core compliance logic changes)
- **Rollback:** Easy (log sheets can be deleted, old code still in version control)

---

## Ready for Agent Mode Implementation

All decisions approved. Key points:

1. Create 3 new log sheets: JHA Log, Weekly Safety Log, Monthly Checklist Log
2. Log every email to appropriate sheet (even if job unknown)
3. Calculate compliance from logs at end of processing
4. Auto-cleanup old entries (>90 days) on each run
5. PDF extraction failure → still log with subject date, note the failure
6. Log sheets stay visible for debugging
7. Existing Safety Compliance data preserved, new compliance calculated from logs

