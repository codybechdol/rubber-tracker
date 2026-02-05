# JHA/Weekly Safety Meeting Compliance Tracking System

**Created:** February 4, 2026

## Overview

This feature tracks daily JHA (Job Hazard Analysis) submissions and weekly Safety Meeting compliance for each crew. Statistics update every time "Process Safety Emails" runs. Missing reports after the week deadline become tasks with SMS notification buttons.

## Report Types Processed

### 1. Job Hazard Report (JHA)
- Subject: `Job Hazard Report  02-04-2026_009-26_24193847_...`
- **Daily submission required** (Mon-Fri by default)
- Tracks: Report date, Job number

### 2. Weekly Safety Meeting
- Subject: `Safety Meeting Report  Week of 02-02-2026 Safety Topic 015-26`
- **Weekly submission required**
- Tracks: Week of date, Job number

### 3. Safety Checklist Report (NEW)
- Subject: `Safety Checklist Report 578-033-26 01-15-2026` or `Fwd: Safety Checklist Report...`
- Format: `Safety Checklist Report {Equipment#}-{JobNumber} {Date}`
- **Valid senders:** codyb@, mptablets@, fleet@, janw@mountainpower.com
- **Contains PDF attachment** with equipment inspection details
- **Equipment tracked (Column F):**
  - First Aid Kit (Fully stocked?)
  - Cones (Good condition?)
  - Triangles (Good condition? Need more?)
  - Signs (Good condition? Full set?)
  - Hot Sticks (Good condition?)
  - Insulated Jumpers (Good condition?)
  - Fire Extinguisher (Properly charged? Monthly inspection? Tag signed off? Test date?)
  - AED (Damage visible? 2 sets of pads?)
  - Fall Protection (Good condition?)
  - Harnesses/Lanyards (Good condition?)
  - Crane Log Books (Log book in unit?)
  - Mileage Books (Need new book?)
  - Hot Hoist (Good condition?)
  - Chains/Chokers/Slings (Tagged?)
  - Barriers (Good condition?)
  - **Trucks Section:** Wipers, Horn, Reflectors, Warning Lights, Brakes, Lights, Mirrors, Windshield, Defrost, Windows, Heater, Seat Belts
  - Misc Comment (any written notes)

### 4. Fleet Checklist (Weekly Safety Repairs)
- Subject: `Weekly Safety Repairs 12.12.25`
- **Compilation email** from fleet@mountainpower.com
- Used as comparison/backup to Safety Checklist Reports

## Crew Leader Priority

When determining who is in charge of a crew (for task assignment and SMS notifications), the system uses this priority order:

| Priority | Classification | Description |
|----------|---------------|-------------|
| 1 | SUP | Superintendent (highest) |
| 2 | GF | General Foreman |
| 3 | F | Foreman |
| 4 | GTO F | GTO Foreman |
| 5 | GTO | Gas Tech Operator |
| 5 | JRY OP | Journey Operator (equal to GTO) |
| 6 | AP 7 | 7th Year Apprentice |
| 7 | AP 6 | 6th Year Apprentice |
| 8 | AP 5 | 5th Year Apprentice |
| 9 | AP 4 | 4th Year Apprentice |
| 10 | AP 3 | 3rd Year Apprentice |
| 11 | AP 2 | 2nd Year Apprentice |
| 12 | AP 1 | 1st Year Apprentice (lowest) |

The system finds all employees with the same job number prefix and assigns the task/SMS to the person with the highest priority classification.

## Key Concepts

### Week Definition
- **Start:** Sunday 12:00 AM
- **End:** Saturday 11:59:59 PM
- **Deadline:** Saturday 11:59 PM of the same week
- **Late Detection Starts:** Sunday after the week ends

### Default Exclusions
- **Saturday/Sunday** - Skipped by default (most crews don't work weekends)
- **Configurable** - Uncheck in Config sheet if crew works weekends

## New Sheets

### 1. Safety Compliance
Historical tracking of compliance per crew per week.

| Column | Description |
|--------|-------------|
| Week Start | Sunday date |
| Week End | Saturday date |
| Job Number | Crew job number (e.g., 009-26) |
| Foreman | Crew foreman name |
| JHA Sun-Sat | Status for each day: ✅/❌/N/A/⏳ |
| Weekly Meeting | Status: ✅/❌/N/A/⏳ |
| Status | Complete/Missing Reports/Pending |
| Created Date | When record was created/updated |

### 2. Safety Compliance Config
Configure which crews/days to skip.

| Column | Description |
|--------|-------------|
| Job Number | Crew job number |
| Foreman | Auto-populated foreman name |
| Skip Sun | Checkbox (✓ default) |
| Skip Mon-Fri | Checkboxes (unchecked by default) |
| Skip Sat | Checkbox (✓ default) |
| Skip Weekly Meeting | Checkbox (unchecked by default) |
| Notes | Optional notes |

## Status Icons

| Icon | Meaning |
|------|---------|
| ✅ | Received on time |
| ❌ | Missing/Late (past deadline) |
| N/A | Skipped (weekend or excluded in config) |
| ⏳ | Pending (week not over yet) |

## Email Subject Parsing

### JHA Format
```
Job Hazard Report  02-04-2026_009-26_24193847_HEL EZ 1210 WINSTON ST...
```
- Date: `02-04-2026` (report date)
- Job Number: `009-26`

### Weekly Safety Meeting Format
```
Safety Meeting Report  Week of 02-02-2026 Safety Topic 015-26
```
- Week of: `02-02-2026` (week start date)
- Job Number: `015-26`

## Late Detection Logic

### JHA
- Extract report date from subject
- Get week boundaries for that date (Sun-Sat)
- Compare email received date vs Saturday 11:59 PM
- If received after deadline → LATE → doesn't count for compliance

### Weekly Safety Meeting
- Extract "Week of" date from subject
- Get week boundaries for that date
- Compare email received date vs Saturday 11:59 PM
- If received after deadline → LATE → doesn't count for compliance

### Forwarded Emails
- Subject starts with "Fwd:"
- **Always assumed on time** (can't detect actual received date)
- This prevents false positives for forwarded reports

## Missing Report Tasks

When a crew has missing JHA(s) and/or Weekly Meeting after the deadline:

### Task Metadata Entry
- **TaskType:** `Missing Safety Report`
- **ItemType:** 
  - `JHA` - Missing JHA only
  - `Weekly Meeting` - Missing Weekly Meeting only
  - `JHA + Weekly Meeting` - Missing both (combined into one task)
- **Employee:** Foreman name
- **PhoneNumber:** Foreman phone
- **IsOffice:** TRUE (phone task)
- **Notes:** Details of what's missing

### SMS Messages

#### Missing JHA (1 date)
```
We did not receive a JHA for 02/03/2026 from your crew. This is just a reminder not to miss it this week. Was there an issue turning it in that you need help with?
```

#### Missing JHA (multiple dates)
```
We did not receive a JHA for 02/03/2026, 02/04/2026, and 02/05/2026 from your crew. This is just a reminder not to miss them this week. Was there an issue turning them in that you need help with?
```

#### Missing Weekly Safety Meeting
```
We did not receive a Weekly Safety Meeting for the week of 02/02/2026 from your crew. This is just a reminder not to miss it this week. Was there an issue turning it in that you need help with?
```

#### Missing Both
```
We did not receive a JHA for 02/03/2026, 02/04/2026 or a Weekly Safety Meeting for the week of 02/02/2026 from your crew. This is just a reminder not to miss them this week. Was there an issue turning them in that you need help with?
```

## Menu Items

**Glove Manager → 🛡️ Safety Reports**

| Menu Item | Function |
|-----------|----------|
| 📊 Compliance Dashboard | Shows current week status + 4-week trends |
| ⚙️ Configure Exclusions | Opens Safety Compliance Config sheet |
| 📈 Compliance History | Opens Safety Compliance sheet |

## Compliance Dashboard

Shows:
1. **Summary Boxes:** Compliant / Missing / Total crews
2. **Current Week Grid:** All crews with ✅/❌/N/A/⏳ for each day
3. **4-Week Trend Table:** Crews with issues, showing missed JHAs, missed meetings, compliance rate

## How to Use

### Initial Setup
1. Run **Process Safety Emails** at least once
2. Compliance sheets will be auto-created
3. Go to **Configure Exclusions** to adjust weekend settings if needed

### Daily/Weekly Workflow
1. Run **Process Safety Emails** → See compliance grid in results
2. Check **Compliance Dashboard** for overview
3. After week ends → Missing report tasks appear in Task List
4. Use SMS button to notify foremen about missing reports
5. Mark task complete after resolving

### Configuring Exclusions
1. Open **Safety Compliance Config** sheet
2. Find the crew's row
3. Check/uncheck day columns to skip JHA requirement
4. Check "Skip Weekly Meeting" if crew doesn't need to submit

## Technical Details

### Key Functions

| Function | Purpose |
|----------|---------|
| `calculateSafetyCompliance(weekStart)` | Main calculation engine |
| `isReportLate(message, reportDate, isForwarded)` | Detects late submissions |
| `createMissingReportTasks(complianceData)` | Creates Task Metadata entries |
| `getCrewComplianceTrend(jobNumber, weeks)` | 4-week trend analysis |
| `buildMissingSafetyReportSmsMessage(task)` | Generates SMS text |

### Files Modified
- `src/88-SafetyReports.gs` - ~700 lines added
- `src/ToDoSchedule.html` - SMS handling for missing reports
- `src/Code.gs` - 3 menu items

## Troubleshooting

### No crews showing in compliance grid
- Run **Configure Exclusions** to create the config sheet
- Ensure there are active crews in Employees sheet with job numbers

### Reports not being detected
- Check Gmail for emails with correct subject format
- Verify subject contains job number in XXX-XX format
- Check if date format matches MM-DD-YYYY

### False "missing" reports
- Check if email was received before Saturday 11:59 PM
- Check if crew is excluded in Config sheet
- Forwarded emails are always counted as on-time

### Tasks not appearing
- Missing report tasks only create after week deadline (Sunday+)
- Check Task Metadata sheet for existing tasks
- Duplicate tasks are prevented (same crew+week combo)
