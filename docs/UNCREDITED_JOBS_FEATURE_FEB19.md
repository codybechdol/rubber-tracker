# Feature: Uncredited Job Numbers Display After Processing

## Date: February 19, 2026

## Purpose
After processing safety emails, you need to know which job numbers found in Gmail could NOT be credited to any tracked crew in the Safety Compliance sheet. This allows you to:
1. See what reports are being ignored
2. Assign individual reports to specific crews AND missing days
3. Optionally save permanent mappings for future processing

## Auto-Correction of Past Week Compliance (Option B - Implemented Feb 19, 2026)

### The Problem
When a JHA email is received in the **current week** but the PDF contains JHAs with "Date Completed" from a **past week**, the compliance tracking was not correctly crediting the past week.

**Example:**
- Email received: 02/17/2026 (week of 02/15)
- Email subject shows: "Job Hazard Report 02-17-2026..."
- PDF contains JHAs with Date Completed:
  - 02/09/2026 (week of 02/08) ← PAST WEEK
  - 02/10/2026 (week of 02/08) ← PAST WEEK
  - 02/11/2026 (week of 02/08) ← PAST WEEK

### The Solution (Auto-Correction)
After writing compliance records to the Safety Reports sheet, the system now automatically checks if any JHA dates belong to **past weeks** and corrects the Safety Compliance sheet accordingly.

**What happens automatically:**
1. When compliance records are written, the system scans for JHA records
2. For each JHA, it checks if the report date falls in a **past week** (before current week)
3. If the past week row exists in Safety Compliance:
   - Finds the correct day column (Mon, Tue, etc.) based on report date
   - If that cell shows ❌ (missing) or ⏳ (pending), updates it to ✅ (or ✅L if late)
   - If all required reports are now received, updates the crew's status to "Complete"

**Key Function:** `autoCorrectPastWeekCompliance(complianceRecords, currentWeekStart)`

### Example Correction Flow

**Before Processing:**
```
Safety Compliance sheet for week 02/08/2026:
| Crew    | Sun | Mon | Tue | Wed | Thu | Fri | Sat | Status        |
|---------|-----|-----|-----|-----|-----|-----|-----|---------------|
| 038-26  | N/A | ❌  | ❌  | ❌  | ✅  | ✅  | N/A | Missing Reports|
```

**Email received 02/17/2026 contains PDF with:**
- Date Completed: 02/09/2026 (Monday)
- Date Completed: 02/10/2026 (Tuesday)  
- Date Completed: 02/11/2026 (Wednesday)

**After Auto-Correction:**
```
Safety Compliance sheet for week 02/08/2026:
| Crew    | Sun | Mon  | Tue  | Wed  | Thu | Fri | Sat | Status   |
|---------|-----|------|------|------|-----|-----|-----|----------|
| 038-26  | N/A | ✅L  | ✅L  | ✅L  | ✅  | ✅  | N/A | Complete |
```

Notes:
- Mon/Tue/Wed show ✅L (late) because they were received after week deadline
- Status automatically updated to "Complete" because all required days now have reports

### Late Submission Handling
Reports received after their work week ended are marked with ✅L:
- Shows the report **was received** (compliance met)
- Indicates it was **submitted late** (after Saturday 11:59 PM of that week)
- Yellow styling distinguishes from on-time ✅ (green)

## How It Works

### 1. During Compliance Tracking
When `calculateSafetyCompliance()` scans the Safety Reports sheet:
- Each JHA, Weekly Meeting, and Monthly Checklist is checked
- The job number is extracted and resolved to a tracked crew
- If resolution fails, the job and individual reports are tracked as "uncredited"

### 2. Resolution Logic
A job number is resolved by:
1. **Direct match** - Job is already a tracked crew (e.g., 009-26 exists in crew list)
2. **Foreman lookup** - Job maps to a foreman whose primary crew is tracked
3. **Custom mapping** - Job is in your saved custom mappings from the dialog

### 3. What Gets Tracked as "Uncredited"
Jobs that fail resolution are tracked with:
- **Job Number** - The unrecognized job (e.g., 054-26, 038-26)
- **Reason** - Why it failed:
  - "No foreman mapping found" - Job not on Employees sheet
  - "Foreman found (X) but no tracked primary crew" - Foreman has no .1 position job
- **Individual Reports** - Each report with:
  - Report Type (JHA, Safety Meeting)
  - Report Date (when the work was done)
  - Received Date (when the email was received)
  - Day Name (Mon, Tue, etc.)

### 4. Display in Dialog
After processing completes, if uncredited jobs were found:
- Yellow warning section appears below the compliance grid
- Each uncredited job shows:
  - Job number in red
  - Reason for failure
  - **Individual report cards** with:
    - Report type and day name (e.g., "JHA - Mon")
    - Report date and received date
    - Crew dropdown to select target crew
    - Day dropdown showing missing days for selected crew
    - "Credit" button to assign
    - "Remember" checkbox to save as permanent mapping

### 5. Assigning Individual Reports to Missing Days
When you select a crew in the dropdown:
1. System loads that crew's missing days for the report's week
2. Day dropdown populates with options like:
   - "JHA - Mon (02/17/2026)"
   - "JHA - Tue (02/18/2026)"
   - "Weekly Meeting (week of 02/15/2026)"
3. Select the appropriate missing day
4. Click "Credit" to:
   - Update Safety Reports sheet (change job number)
   - Mark the day as ✅ in Safety Compliance sheet
   - Optionally save a permanent mapping

### 6. Example Scenario

**Before Processing:**
```
Safety Reports sheet has:
- Job 006-26: JHA for 02/17, JHA for 02/18
- Job 038-26: JHA for 02/17

Tracked crews: 052-25, 009-26, 013-26
Custom mappings: { "006-26": "Benjamin Lapka" }

Safety Compliance for 052-25 shows:
- Mon: ❌, Tue: ❌, Wed: ✅, Thu: ✅, Fri: ✅
```

**After Processing:**
Dialog shows:
```
⚠️ Uncredited Job Numbers Found in Safety Reports

Job: 038-26 (❓ No foreman mapping found)
┌──────────────────────────────────────────────┐
│ JHA - Mon                                     │
│ 📅 Report: 02/17/2026 | 📩 Received: 02/17/2026 │
│ [Select Crew... ▼] [Select Day... ▼] [Credit] │
│ ☐ Remember                                   │
└──────────────────────────────────────────────┘
```

**User selects:**
- Crew: "052-25 (Benjamin Lapka)"
- Day: "JHA - Mon (02/17/2026)"
- ☑️ Remember

**Result:**
- Safety Reports row updated: Job changed to 052-25
- Safety Compliance: Mon cell changed from ❌ to ✅
- Custom mapping saved: 038-26 → Benjamin Lapka

## Technical Details

### New Functions in `88-SafetyReports.gs`

#### `resolveToPrimaryCrew(baseJob, reportType, reportDate, receivedDate, emailSubject)`
Enhanced to track individual reports with full details when resolution fails.

#### `creditUncreditedReport(assignmentDataJson)`
Credits an uncredited report to a specific crew and day:
- Updates Safety Reports sheet job number
- Updates Safety Compliance sheet cell
- Optionally saves permanent custom mapping

Parameters (JSON):
```javascript
{
  originalJobNumber: "038-26",
  reportType: "JHA",
  reportDate: "02/17/2026",
  targetCrew: "052-25",
  targetForeman: "Benjamin Lapka",
  targetDay: "Mon",  // or empty for Weekly Meeting
  saveMapping: true
}
```

#### `getMissingDaysForCrew(crewJobNumber, weekStartDate)`
Returns missing days for a crew in a specific week:
```javascript
{
  success: true,
  missingDays: [
    { dayName: "Mon", date: "02/17/2026" },
    { dayName: "Tue", date: "02/18/2026" }
  ],
  weeklyMeetingMissing: true
}
```

#### `getTrackedCrewsForAssignment()`
Returns list of all tracked crews for dropdown:
```javascript
{
  success: true,
  crews: [
    { jobNumber: "009-26", foreman: "Corey Allen" },
    { jobNumber: "013-26", foreman: "Dusty Hendrickson" }
  ]
}
```

### Frontend Changes (ProcessSafetyEmailsDialog.html)

- Enhanced `showUncreditedJobs()` to display individual report cards
- Added `loadTrackedCrews()` to populate crew dropdowns
- Added `loadMissingDays(reportKey)` to populate day dropdown when crew is selected
- Added `creditReport()` to call backend and update UI on success

### Data Flow

1. `processSafetyEmails()` → parses emails, logs to Safety Reports
2. `calculateSafetyCompliance()` → scans Safety Reports, tracks uncredited jobs with individual reports
3. Dialog displays uncredited jobs with individual report cards
4. User selects crew and missing day for each report
5. `creditUncreditedReport()` → updates both sheets
6. UI shows success, optionally saves permanent mapping

## Files Modified
- `src/88-SafetyReports.gs` - Enhanced uncredited tracking, added creditUncreditedReport function
- `src/ProcessSafetyEmailsDialog.html` - Complete rewrite of uncredited jobs UI with individual report cards

