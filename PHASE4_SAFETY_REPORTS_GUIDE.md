# Phase 4: Gmail Safety Report Processing - Setup Guide

**Status:** ✅ **DEPLOYED** - Ready for Testing  
**Date:** February 4, 2026

---

## 🎯 What This Does

Automatically processes Gmail for safety equipment issues from:
- **JHAs** (Job Hazard Analyses)
- **Weekly Safety Meetings**
- **Fleet Safety Checklists**

Extracts equipment problems like:
- Fire extinguisher test dates
- Hot stick expiration dates
- Rubber goods issues
- Missing inspection tags
- Wheel chocks needed
- Signs needing replacement

All data is logged to a **Safety Reports** sheet with foreman, job number, vehicle, and status tracking.

---

## 📋 Step-by-Step Setup Instructions

### STEP 1: Grant Gmail Permissions (⚠️ CRITICAL)

**You MUST do this first or nothing will work!**

1. Open your Google Sheet (Rubber Tracker)
2. Click **Glove Manager** menu → **🛡️ Safety Reports** → **⚙️ Setup Safety Reports Sheet**
3. You'll see a dialog: **"Setup Safety Reports sheet created successfully!"** → Click OK
4. Click **Glove Manager** menu → **🛡️ Safety Reports** → **📥 Process Safety Emails**
5. **GOOGLE WILL ASK FOR PERMISSIONS:**
   - Click **"Review Permissions"**
   - Select your Google account
   - Click **"Advanced"** (bottom left)
   - Click **"Go to [Your Project Name] (unsafe)"** (don't worry, it's your own script!)
   - Scroll down and click **"Allow"**
   - You'll see permissions requested:
     - ✅ View and manage spreadsheets
     - ✅ **Read your email** (this is the new Gmail permission)
     - ✅ Send email on your behalf
   - Click **"Allow"**
6. **You only need to do this once!** Google remembers your permission.

---

### STEP 2: Run Initial Email Scan

1. Open your Google Sheet
2. Click **Glove Manager** menu → **🛡️ Safety Reports** → **📥 Process Safety Emails**
3. A dialog appears asking **"Search last:"**
   - **For first run:** Select **90 days** (to catch all recent emails)
   - **For weekly runs:** Select **7 days**
4. Click **"Process Emails"**
5. Wait 10-30 seconds (depending on email volume)
6. You'll see a success message:
   ```
   ✅ Processing Complete
   
   Processed: 15 new emails
   Skipped: 0 duplicates
   Issues found: 23
   ```
7. Click OK

---

### STEP 3: Review the Safety Reports Sheet

1. Click **Glove Manager** menu → **🛡️ Safety Reports** → **📊 View Safety Reports**
2. You'll see a new sheet called **"Safety Reports"** with columns:
   - **Report Date** - When the email was sent
   - **Report Type** - JHA, Safety Meeting, or Fleet Checklist
   - **Job Number** - Crew job number (e.g., "013-26")
   - **Foreman** - Name auto-looked up from Employees sheet
   - **Vehicle Number** - Extracted from fleet checklists
   - **Equipment Type** - Fire Extinguisher, Hot Stick, Rubber Goods, etc.
   - **Issue Description** - Full text of what was reported
   - **Status** - Dropdown: Needs Attention, Resolved, Ordered, Replaced
   - **FE Test Date** - Fire Extinguisher test date (if found in report)
   - **Source Email ID** - Gmail message ID for reference
   - **Notes** - Your comments

3. **Color-Coded Status:**
   - 🔴 Red = Needs Attention
   - 🟡 Yellow = Ordered
   - 🟢 Green = Resolved
   - 🔵 Blue = Replaced

---

### STEP 4: Create Tasks from Safety Issues

1. In the **Safety Reports** sheet, review items with status **"Needs Attention"**
2. Click **Glove Manager** menu → **🛡️ Safety Reports** → **📋 Create Tasks from Issues**
3. The system will:
   - Find all "Needs Attention" items
   - Create entries in **Manual Tasks** sheet
   - Assign to the foreman for that crew
   - Include job number and equipment type
   - Prevent duplicates
4. Success message: **"✅ Created 5 safety equipment tasks in Manual Tasks sheet."**
5. These tasks now appear in:
   - **Tasks & Calendar** dialog (for scheduling)
   - **Trip Planner** (if they have a location)
   - **Daily Accomplishments** (when completed)

---

### STEP 5: Weekly Workflow (Recommended)

**Every Monday morning:**

1. Click **Glove Manager** → **🛡️ Safety Reports** → **📥 Process Safety Emails**
2. Select **7 days**
3. Click **Process Emails**
4. Review new issues in the **Safety Reports** sheet
5. Update statuses (Ordered, Resolved, Replaced) as you handle them
6. Click **📋 Create Tasks from Issues** to add new "Needs Attention" items to your schedule

---

## 📧 Email Patterns Detected

### JHA (Job Hazard Analyses)
- **Subject:** `Job Hazard Report  02-04-2026_009-26_24193847_HEL EZ 1210 WINSTON ST A,B,C HSE CC CUTT (Modified-1)`
- **Sender:** `mptablets@mountainpower.com`
- **What's extracted:** Job number (009-26), foreman, equipment issues

### Weekly Safety Meetings
- **Subject:** `Safety Meeting Report  Week of 02-02-2026 Safety Topic 015-26`
- **Sender:** `mptablets@mountainpower.com`
- **What's extracted:** Job number (015-26), foreman, equipment issues

### Fleet Checklists
- **Subject:** `Weekly Safety Repairs 12.12.25`
- **Sender:** `fleet@mountainpower.com`
- **What's extracted:** Vehicle number, equipment issues, test dates

---

## 🔍 What Gets Detected

### ✅ Equipment Keywords (EXTRACTED):
- Fire extinguisher / extinguisher
- Hot stick / hotstick
- Rubber goods / rubber glove / rubber sleeve
- Signs / sign
- Wheel chock / chock
- Inspection tag / tag

### ❌ Mechanical Keywords (IGNORED):
- brake, brakes, engine, oil, tire, tires
- battery, transmission, clutch, alternator
- starter, radiator, suspension, exhaust
- fuel, coolant, filter

This prevents mechanical vehicle issues from cluttering your safety equipment tracking.

---

## 🛠️ Troubleshooting

### Problem: "No new safety issues found"
**Causes:**
- No emails matching the subject lines in the date range
- All emails already processed (prevents duplicates)
- Gmail permissions not granted

**Solution:**
1. Check your Gmail inbox manually - search for "Job Hazard Report"
2. Try a longer date range (30 or 60 days)
3. Re-grant permissions (Step 1)

---

### Problem: Foreman column is blank
**Cause:** Job number not found in Employees sheet, or no foreman assigned

**Solution:**
1. Open **Employees** sheet
2. Find the employee with that job number (Column G)
3. Make sure their **Job Classification** (Column H) = "F" (Foreman)
4. Re-run **Process Safety Emails** - foreman will populate

---

### Problem: FE Test Date not extracted
**Cause:** Date format not recognized

**Current formats supported:**
- `01.01.24`
- `1/1/2024`
- `01-01-2024`

**Solution:** Manually enter the date in the sheet if auto-detection misses it.

---

### Problem: Equipment not detected
**Cause:** Text doesn't contain exact keywords

**Example:**
- ❌ "extinguish" (missing "er")
- ✅ "fire extinguisher"
- ✅ "extinguisher"

**Solution:** Manually add a row in Safety Reports sheet for that issue.

---

## 📊 Menu Reference

All safety report functions are under **Glove Manager → 🛡️ Safety Reports**:

| Menu Item | What It Does | When to Use |
|-----------|--------------|-------------|
| ⚙️ **Setup Safety Reports Sheet** | Creates the Safety Reports sheet structure | First time setup only |
| 📥 **Process Safety Emails** | Scans Gmail for JHAs/Safety Meetings/Fleet Checklists | Weekly (every Monday) |
| 📋 **Create Tasks from Issues** | Creates Manual Tasks for "Needs Attention" items | After reviewing new issues |
| 📊 **View Safety Reports** | Opens the Safety Reports sheet | To review/update issue statuses |

---

## 🎓 Advanced Tips

### 1. Search by Crew
Click the filter icon in **Job Number** column header → Select "013-26" to see only that crew's issues.

### 2. Find Overdue Equipment Tests
Sort by **FE Test Date** column (click header) → Fire extinguishers with dates in the past need immediate attention.

### 3. Track Trends
Count how many times a crew appears with same equipment issue:
1. Click **Job Number** column
2. Click **Data** menu → **Pivot Table**
3. Rows = Job Number, Columns = Equipment Type, Values = Count

### 4. Email Integration
The **Source Email ID** column links to the original Gmail message:
- Copy the email ID
- Search Gmail with `rfc822msgid:[paste ID here]`
- Opens the original email for full context

---

## 🚀 Future Enhancements (Phase 2)

Planned features:
- **AI Summary** - "Crew 009-26 has had 3 fire extinguisher issues this quarter"
- **Gemini API Integration** - Auto-summarize safety patterns
- **Automated Equipment Replacement** - Suggest purchase orders for recurring issues
- **Crew Safety Score** - Track which crews have most/least issues

---

## 📝 Notes for Cody

- **Duplicate Prevention:** The system tracks Gmail message IDs - same email won't be processed twice
- **Phone Integration:** Foreman names are pulled from Employees sheet (same as cert notifications)
- **Manual Edits:** You can manually add/edit rows in Safety Reports sheet anytime
- **Task Sync:** Tasks created from safety issues use the same flow as Manual Tasks
- **Status Workflow:**
  1. "Needs Attention" → Create task
  2. "Ordered" → Equipment on order
  3. "Replaced" → New equipment delivered
  4. "Resolved" → Issue fixed (no equipment replacement needed)

---

## ✅ Deployment Checklist

- [x] Created `88-SafetyReports.gs` (550+ lines)
- [x] Added Gmail API scope to `appsscript.json`
- [x] Added Safety Reports submenu to main menu
- [x] Deployed with `clasp push --force`
- [x] 46 files pushed successfully
- [ ] **YOU: Grant Gmail permissions** (Step 1 above)
- [ ] **YOU: Run initial 90-day scan** (Step 2 above)
- [ ] **YOU: Test with real emails** (Step 3 above)
- [ ] **YOU: Verify foreman lookup works** (Step 4 above)
- [ ] **YOU: Create tasks from test issues** (Step 5 above)

---

## 🆘 Need Help?

1. Check the **Logger** (View → Logs in Apps Script editor) for detailed processing info
2. Look for lines starting with "Parsed JHA - Job: 013-26 - Issues: 3"
3. If no issues are being extracted, share a sample email body (copy/paste) so we can tune the keyword detection

---

**Ready to test!** Start with Step 1 above. 🚀
