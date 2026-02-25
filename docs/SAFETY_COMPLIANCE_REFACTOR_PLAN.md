# Safety Compliance System Refactor - Option B Implementation Plan

**Created:** February 24, 2026  
**Status:** ✅ IMPLEMENTATION COMPLETE  
**Priority:** Critical - Crews not being credited for submitted JHAs/Safety Meetings

---

## Problem Statement

Crews are submitting JHAs and Safety Meetings via Gmail, but the Safety Compliance sheet is not crediting them. The current system has multiple issues:

1. **Data Source Problem**: `calculateSafetyCompliance()` reads from "Safety Reports" sheet, but JHA/Safety Meeting compliance records are no longer written there (removed to reduce clutter)
2. **Complex Mapping Logic**: Job→Foreman→Primary Crew resolution is complex and error-prone
3. **Unclear Data Flow**: Compliance tracking happens in one place, data lives in another
4. **PDF Date Extraction Issues**: Dates from PDFs may not match email subject dates

---

## Solution Implemented

### New Architecture: Direct Gmail → Safety Compliance

```
Gmail (JHAs, Safety Meetings)
         ↓
    parseSafetyEmail() 
         ↓
    [In-Memory Compliance Records]
         ↓
    updateComplianceFromParsedRecords()  ← NEW FUNCTION
         ↓
    Safety Compliance Sheet (✅/❌ grid)
         
Safety Equipment Needs Sheet ← Only actual equipment issues
```

**Key Changes Made:**
1. ✅ **Renamed** "Safety Reports" → "Safety Equipment Needs" (clarity of purpose)
2. ✅ **Calculate compliance directly from parsed emails** via new `updateComplianceFromParsedRecords()` function
3. ✅ **Removed intermediary storage** of JHA/Safety Meeting records in Safety Reports
4. ✅ **Unified job resolution** via new `resolveJobToCrew()` function
5. ✅ **Backward compatibility** - `getSafetyEquipmentSheet()` checks both old and new names

---

## Implementation Tasks

### Phase 1: Rename Safety Reports Sheet

**File: `88-SafetyReports.gs`**

1. Add migration function to rename sheet:
   ```javascript
   function renameSafetyReportsSheet() {
     var ss = SpreadsheetApp.getActiveSpreadsheet();
     var sheet = ss.getSheetByName("Safety Reports");
     if (sheet) {
       sheet.setName("Safety Equipment Needs");
     }
   }
   ```

2. Update all references from "Safety Reports" to "Safety Equipment Needs":
   - `setupSafetyReportsSheet()` → `setupSafetyEquipmentSheet()`
   - `openSafetyReports()` → `openSafetyEquipmentNeeds()`
   - `cleanupSafetyReportsSheet()` → UPDATE sheet name reference

3. Keep backward compatibility - check for both sheet names

---

### Phase 2: Refactor processSafetyEmails() for Direct Compliance Tracking

**Current Flow:**
```
processSafetyEmails()
  → parseSafetyEmail() returns issues + reportMeta
  → Write equipment issues to Safety Reports
  → Write compliance records to Safety Reports
  → calculateSafetyCompliance() reads Safety Reports
  → Update Safety Compliance sheet
```

**New Flow:**
```
processSafetyEmails()
  → parseSafetyEmail() returns issues + reportMeta
  → Write equipment issues to Safety Equipment Needs (only actual issues)
  → Build in-memory compliance data directly from parsed emails
  → Update Safety Compliance sheet directly
  → Auto-purge old compliance records from Safety Equipment Needs
```

**Changes to make:**

1. **In `processSafetyEmails()`:**
   - Create `inMemoryComplianceData` object to track JHA/Meeting receipts
   - After parsing each email, update `inMemoryComplianceData` directly
   - Remove writing of "No Issues" compliance records to Safety Reports
   - Call new `updateComplianceFromInMemory(inMemoryComplianceData)` instead of `calculateSafetyCompliance()`

2. **New helper function: `updateComplianceFromInMemory()`**
   ```javascript
   function updateComplianceFromInMemory(complianceData, weekBounds) {
     // Takes in-memory parsed compliance data
     // Merges with existing Safety Compliance sheet data
     // Updates ✅/❌ statuses directly
   }
   ```

---

### Phase 3: Simplify Job Number Resolution

**Current Problem:** Complex chain of lookups that often fails silently

**New Approach:**

1. **Single `resolveJobToCrew()` function** with clear logging:
   ```javascript
   function resolveJobToCrew(jobNumber, customMappings) {
     // 1. Check if job is directly a tracked crew
     // 2. Check custom mappings (user-configured)
     // 3. Check Employees sheet (primary + secondary job)
     // 4. Log result with source for debugging
     // Returns: { crew: string, foreman: string, source: string, found: boolean }
   }
   ```

2. **Better error reporting:**
   - Track all unresolved jobs during processing
   - Show summary at end: "X jobs credited, Y jobs unresolved"
   - List unresolved jobs with what was tried

---

### Phase 4: Real-Time Compliance Updates

**Make compliance update happen incrementally as emails are processed:**

1. Load existing Safety Compliance data at start of processing
2. For each parsed email with JHA/Safety Meeting:
   - Resolve job → crew
   - Update in-memory compliance state
   - Mark cell as ✅ or ✅L (late)
3. Write all updates at end of batch

**Benefits:**
- Immediate visibility of what's being credited
- Can show live progress: "Credited JHA for crew 013-26 (Mon)"
- Easier to debug - can see exactly which email credited which cell

---

### Phase 5: Auto-Purge Compliance Records

**On each processing run, automatically remove old compliance-only records:**

1. At start of `processSafetyEmails()`:
   ```javascript
   function purgeOldComplianceRecords() {
     // Remove "No Issues" rows older than 30 days
     // Keep actual equipment issues indefinitely
   }
   ```

2. This ensures the Safety Equipment Needs sheet stays focused

---

### Phase 6: Logging and Debugging Improvements

1. **Add structured logging:**
   ```javascript
   var complianceLog = {
     emailsProcessed: 0,
     jhasFound: 0,
     meetingsFound: 0,
     crewsCredited: {},
     jobsUnresolved: []
   };
   ```

2. **Return detailed results to dialog:**
   ```javascript
   return {
     success: true,
     credited: {
       "013-26": { jha: ["Mon", "Tue"], meeting: true },
       "015-26": { jha: ["Mon", "Wed", "Thu"], meeting: false }
     },
     unresolved: [
       { job: "054-26", reason: "No foreman mapping", emailCount: 3 }
     ]
   };
   ```

---

## File Changes Summary

### Modified Files:

1. **`src/88-SafetyReports.gs`** - Major refactor
   - Rename functions and sheet references
   - Refactor `processSafetyEmails()` for direct compliance tracking
   - Add `resolveJobToCrew()` unified lookup
   - Add `updateComplianceFromInMemory()`
   - Add `purgeOldComplianceRecords()`

2. **`src/Code.gs`** - Menu updates
   - Update menu items for renamed functions
   - Add new menu item for "Safety Equipment Needs"

3. **`src/ProcessSafetyEmailsDialog.html`** - Better UI feedback
   - Show credited crews in real-time
   - Show unresolved jobs with reasons
   - Add "Retry Unresolved" option

### New Functions:

| Function | Purpose |
|----------|---------|
| `renameSafetyReportsSheet()` | Migration - rename sheet |
| `resolveJobToCrew()` | Unified job→crew resolution |
| `updateComplianceFromInMemory()` | Direct compliance sheet update |
| `purgeOldComplianceRecords()` | Cleanup old No Issues rows |
| `buildComplianceStateFromEmails()` | Build state from parsed emails |

### Deprecated Functions:

| Function | Replacement |
|----------|-------------|
| `calculateSafetyCompliance()` (mostly) | `buildComplianceStateFromEmails()` |
| Writing compliance to Safety Reports | Direct Safety Compliance update |

---

## Data Migration

### Sheet Rename:
- "Safety Reports" → "Safety Equipment Needs"
- No data loss - just rename
- Old compliance data stays in Safety Compliance sheet

### Column Structure (Safety Equipment Needs):
Unchanged - still tracks actual equipment issues:
```
Report Date | Report Type | Job Number | Foreman | Vehicle | Equipment Type | Issue | Status | FE Test Date | Email ID | Notes | Email Subject | Received Date
```

---

## Testing Checklist

After implementation:

- [ ] Run "Process Safety Emails" with 7-day lookback
- [ ] Verify JHAs credit correct crews (check via logs)
- [ ] Verify Safety Meetings credit correct crews
- [ ] Verify late submissions show ✅L
- [ ] Verify unresolved jobs are listed in dialog
- [ ] Verify Safety Compliance sheet updates correctly
- [ ] Verify Safety Equipment Needs only has actual issues
- [ ] Verify Task Dashboard shows correct counts

---

## Configuration Decisions

Based on user input:

1. ✅ **Sheet rename:** "Safety Equipment Needs" (no data loss)
2. ✅ **No caching:** Start without, add if performance is issue
3. ✅ **Keep existing `isReportLate()` logic:** Works correctly
4. ✅ **No data migration needed:** Compliance data stays in Safety Compliance
5. ✅ **Real-time updates:** Update compliance as emails are processed
6. ✅ **Auto-purge:** Clean old compliance records on each run
7. ✅ **Continue logging:** Show partial success counts

---

## Implementation Order

1. **Phase 1:** Rename sheet (low risk, clear win)
2. **Phase 2:** Refactor `processSafetyEmails()` (core fix)
3. **Phase 3:** Simplify job resolution (debugging improvement)
4. **Phase 4:** Real-time updates (UX improvement)
5. **Phase 5:** Auto-purge (cleanup)
6. **Phase 6:** Logging improvements (maintenance)

---

## Estimated Effort

- Phase 1: 15 minutes
- Phase 2: 2 hours
- Phase 3: 1 hour
- Phase 4: 30 minutes
- Phase 5: 30 minutes
- Phase 6: 30 minutes

**Total: ~5 hours**

---

## Success Criteria

1. JHAs from Gmail appear as ✅ in Safety Compliance within same processing run
2. Unresolved jobs clearly reported with reasons
3. Safety Equipment Needs sheet contains only actual equipment issues
4. No more "crews not getting credited" reports

