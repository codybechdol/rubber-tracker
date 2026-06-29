# Weekly Workflow Guide

## 🧤 Monday Morning Workflow

Complete these 8 steps every Monday to start your week organized and up-to-date.

**Access the Workflow:** `Glove Manager` → `📱 Quick Actions` (opens sidebar)

---

## Step 1: 📥 Import Crew Makeup

**What it does:** Updates employee locations and job numbers based on the superintendent's weekly crew assignment spreadsheet.

**How to do it:**

The dialog uses an **8-step wizard** with a visible progress bar at the top:

1. Click **Step 1: Import Crew Makeup** in the sidebar
2. Drag & drop or select the Excel file from the superintendent
3. **Click the correct week tab** (tabs are listed — no auto-select, pick deliberately)
4. **Step 3 (New Jobs):** If any job numbers are new, provide job name + city → "Add to Job Tracking"
5. **Step 4 (New Employees):** If NEW HIRE entries found, fill in details and add them
6. **Step 5 (Unmatched + Duplicates):** Resolve employees that couldn't be auto-matched or appear in multiple crews → "Continue to Special Circumstances"
7. **Step 6 (Special Circumstances):** Handle Time Off, Light Duty, Layoffs, etc. → "Continue to Crew Cards"
8. **Step 7 (Crew Cards + Lead Selection):** Review crew cards; select crew lead when a crew has multiple Foremen/GFs
9. **Step 8 (Preview):** Review the proposed changes table → click **Apply Changes**

**Expected outcome:**
- Employee locations updated to match crew assignments
- Job numbers assigned with positions (e.g., 013-26.1, 013-26.2)
- Job Classification updated (F, JRY, AP 1-7, etc.)
- Changes logged to Employee History

**Notes:**
- Switching to a different week tab resets all sections (safe to re-pick)
- Absent leads (e.g., employee on Time Off who is the established crew lead) still appear in the crew lead selection dialog
- Hidden rows and greyed-out cells in Excel are automatically skipped
- Special statuses (Vacation, Light Duty, Layoff) are detected and handled in Step 6

**Full documentation:** `docs/CREW_IMPORT_FLOW.md`

---

## Step 2: 🔄 Sync Crews

**What it does:** Updates foremen and default schedules in the Job Tracking sheet.

**How to do it:**
1. Click **Step 2: Sync Crews** in the sidebar.
2. Wait for completion (usually 5-10 seconds).

**Expected outcome:**
- Syncs foremen from Employees.
- Renumbers crew position suffixes (e.g., `.1` for lead, `.2` to `.N` based on classification rank).
- Synchronizes monthly training tracking crew lists and size calculations.

---

## Step 3: 📊 Generate All Reports

**What it does:** Updates all swap reports and purchase needs based on current inventory and employee assignments.

**How to do it:**
1. Click **Step 2: Generate All Reports** in the sidebar
2. Wait for completion (usually 10-30 seconds)

**Expected outcome:**
- Glove Swaps sheet updated with upcoming changeouts
- Sleeve Swaps sheet updated with upcoming changeouts
- Purchase Needs calculated based on inventory levels
- Reclaims checked for returned items

**Sub-actions available:**
- 🧤 **Gloves** - Run only glove swaps report
- 💪 **Sleeves** - Run only sleeve swaps report
- 🛒 **Purchase** - Run only purchase needs calculation

---

## Step 4: 🛡️ Process Safety Emails

**What it does:** Scans Gmail for JHAs, Safety Meeting Reports, and Fleet Checklists. Extracts equipment issues and tracks crew compliance.

**How to do it:**
1. Click **Step 3: Process Safety Emails** in the sidebar
2. Select date range (default: 7 days, or use "Only new emails since last run")
3. Click **Process Emails**
4. Review the compliance grid that appears

**Expected outcome:**
- Safety Reports sheet updated with equipment issues (fire extinguishers, hot sticks, etc.)
- Safety Compliance sheet updated with ✅/❌ for each crew's JHAs and weekly meetings
- Missing report tasks created in Task Metadata for crews past deadline

**Sub-actions available:**
- 📊 **Compliance Dashboard** - View current week + 4-week compliance trends

**First-time setup:**
- Run `Glove Manager → 🛡️ Safety Reports → ⚙️ Setup Safety Reports Sheet` first
- Grant Gmail and Drive permissions when prompted

---

## Step 5: 🎯 Generate Task Metadata

**What it does:** Consolidates all pending tasks from multiple sources into the Task Metadata sheet - your single source of truth.

**How to do it:**
1. Click **Step 4: Generate Task Metadata** in the sidebar
2. Wait for completion (usually 5-15 seconds)

**Expected outcome:**
- Task Metadata sheet updated with tasks from:
  - Glove Swaps (pending changeouts)
  - Sleeve Swaps (pending changeouts)
  - Reclaims (pending pickups)
  - Training Tracking (monthly training)
  - Manual Tasks (your custom tasks)
  - Expiring Certs (certifications needing renewal)
  - Safety Reports (equipment issues)
- Existing scheduled dates/times preserved
- Phone numbers enriched from Employees sheet

**Note:** This step uses "smart update" logic - it won't overwrite your scheduling work, just refreshes source data.

---

## Step 6: 📅 Review & Schedule

**What it does:** Opens the Tasks & Calendar dialog where you can review, schedule, and manage all your tasks for the week.

**How to do it:**
1. Click **Step 5: Review & Schedule** in the sidebar
2. Use the **Task List** tab to see all pending tasks
3. Drag tasks to calendar dates or use the date picker
4. Set start/end times for scheduled tasks
5. Use the **Trip Planner** to optimize multi-location routes

**Expected outcome:**
- Tasks assigned to specific dates
- Start/end times set for day planning
- Route optimized to minimize drive time

**Sub-actions available:**
- 📋 **Tasks & Calendar** - Full scheduling interface
- 🗺️ **Trip Planner** - Route optimization for field trips

**Tips:**
- Overdue tasks show with 🔴 red indicator
- Due this week shows 🟠 orange indicator
- Use Trip Planner for days with multiple locations
- Cert tasks can be handled by phone (office work)

---

## Step 7: 🛒 Create Purchase Order

**What it does:** Allows creating and managing Purchase Orders for PPE (gloves, sleeves) and vendor configurations.

**How to do it:**
1. Click **Step 7: Create Purchase Order** in the sidebar.
2. Select outstanding items from the Purchase Needs section.
3. Configure quantities, choose a vendor (which auto-applies their catalog pricing), and generate the PO.
4. (Optional) Email the PO directly to the vendor rep using the generated draft.

**Expected outcome:**
- A new PO entry logged in the Purchase Orders sheet.
- Email drafts compiled or sent directly to vendors.

---

## Step 8: 💾 Save & Backup

**What it does:** Saves current state to history sheets and creates a backup snapshot in Google Drive.

**How to do it:**
1. Click **Step 6: Save & Backup** in the sidebar
2. Wait for completion confirmation

**Expected outcome:**
- Gloves History updated with any changes
- Sleeves History updated with any changes
- Backup file created in the Backups folder on Drive

**Sub-actions available:**
- 📧 **Send Email Report** - Manually trigger weekly email report (auto-sends Monday 12 PM if configured)

---

## "As Needed" Actions

These are monthly or setup tasks, not part of the weekly workflow:

| Action | When to Use |
|--------|-------------|
| 📜 **Manage Certs** | Monthly - Import cert expiration dates from Excel |
| 👷 **Crew Visit Config** | Setup - Configure which crews to visit and frequency |
| 📚 **Training Config** | Setup - Configure monthly training topics |
| 📋 **Training Tracking** | Setup - Initialize training tracking sheet |
| 🛡️ **Compliance Config** | Setup - Configure which crews/days to exclude from compliance |

---

## Quick Actions

Always-available utilities:

| Action | Purpose |
|--------|---------|
| 🔍 **Item Lookup** | Search for glove/sleeve history by item number |
| 📊 **Task Dashboard** | View task statistics and health metrics |
| 📝 **Accomplishments** | Generate daily/weekly accomplishment summaries for timesheets |

---

## Troubleshooting

### "Dialog shows NULL or no data"
- This usually means the data transfer limit was hit
- Click the refresh button in the dialog
- If persists, run Generate Task Metadata again

### "Clasp push hangs or fails"
1. Run `node validate-syntax.js` to check for syntax errors
2. Check for duplicate `*/` in JSDoc comments
3. Run `Remove-Item src/*.js -Force` to remove duplicate files

### "Safety emails not processing"
1. Ensure Gmail permissions are granted
2. Check that emails match expected subject patterns
3. Try increasing the date range

### "Crew import not matching employees"
1. Check for name spelling differences in Excel
2. Hidden rows in Excel are skipped - unhide if needed
3. Use the "Add New Employee" option for genuinely new hires

---

## Weekly Checklist

Copy this checklist to track your Monday workflow:

```
□ Step 1: Import Crew Makeup (upload superintendent's Excel)
□ Step 2: Sync Crews (update foremen & schedules in Job Tracking)
□ Step 3: Generate All Reports (update swaps and purchase needs)
□ Step 4: Process Safety Emails (check JHAs and compliance)
□ Step 5: Generate Task Metadata (refresh task database)
□ Step 6: Review & Schedule (plan your week)
□ Step 7: Create Purchase Order (order gloves/sleeves/supplies)
□ Step 8: Save & Backup (preserve current state)
```

---

## Version History

- **May 17, 2026** - Crew Import: persistent crew lead selections (saved to ScriptProperties, auto-applied next week); absent-lead dialog shows context-specific messaging + nickname deduplication; "Not an Employee" button for unmatched rows; wizard step guard prevents backwards reset; menu cleanup (removed legacy migration items)
- **May 16, 2026** - Step 1 (Import Crew Makeup) redesigned as 8-step wizard: explicit tab selection (no auto-parse), Unmatched+Duplicates before Special before Crew Cards, tab re-selection resets all sections, two explicit Continue buttons, absent-lead support in crew lead dialog
- **February 5, 2026** - Initial workflow documentation created
