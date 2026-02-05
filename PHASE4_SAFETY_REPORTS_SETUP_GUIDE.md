# Phase 4: Gmail Safety Report Processing - Setup Guide

**Date:** February 4, 2026  
**Status:** ✅ Deployed - Ready for Testing

---

## 📋 Overview

This feature automatically processes safety-related emails from Gmail:
- **JHAs** (Job Hazard Analyses)
- **Weekly Safety Meetings**
- **Fleet Safety Checklists**

It extracts equipment issues (fire extinguishers, hot sticks, rubber goods, etc.) and logs them to a "Safety Reports" sheet for tracking and task creation.

---

## 🚀 Step-by-Step Setup Instructions

### **STEP 1: Grant Gmail Permissions** 🔐

1. **Open your Google Sheet** (Rubber Tracker spreadsheet)
2. **Reload the page** to load the new menu items
3. Click **Glove Manager → 🛡️ Safety Reports → ⚙️ Setup Safety Reports Sheet**
4. You will see a **permission prompt** asking for access to:
   - ✅ View your spreadsheets
   - ✅ Read your Gmail messages
   - ✅ Send email on your behalf
5. Click **"Review Permissions"**
6. Select your Google account
7. Click **"Allow"** to grant permissions
8. ✅ **Permission granted!**

> **Note:** This is a one-time authorization. The script will only access emails matching specific subject lines (JHAs, Safety Meetings, Fleet Checklists).

---

### **STEP 2: Create the Safety Reports Sheet** 📊

1. Click **Glove Manager → 🛡️ Safety Reports → ⚙️ Setup Safety Reports Sheet**
2. A new sheet named **"Safety Reports"** will be created with 11 columns:
   - Report Date
   - Report Type
   - Job Number
   - Foreman
   - Vehicle Number
   - Equipment Type
   - Issue Description
   - Status (dropdown: Needs Attention, Resolved, Ordered, Replaced)
   - FE Test Date
   - Source Email ID
   - Notes
3. ✅ **Sheet created successfully!**

---

### **STEP 3: Process Your First Batch of Emails** 📥

1. Click **Glove Manager → 🛡️ Safety Reports → 📥 Process Safety Emails**
2. A dialog appears asking how far back to search:
   - **7 days** (default - good for initial test)
   - **14 days**
   - **30 days**
   - **60 days**
   - **90 days**
3. Click **"Process Emails"**
4. The system will:
   - Search Gmail for matching emails
   - Parse each email for equipment issues
   - Extract job numbers, foreman names, dates
   - Log issues to the Safety Reports sheet
5. A confirmation message shows:
   - **Processed:** X new emails
   - **Skipped:** Y duplicates (already processed)
   - **Issues found:** Z equipment issues

---

### **STEP 4: Review the Safety Reports Sheet** 👀

1. Click **Glove Manager → 🛡️ Safety Reports → 📊 View Safety Reports**
2. The Safety Reports sheet opens with all extracted issues
3. Review each row:
   - **Red background** = "Needs Attention"
   - **Yellow background** = "Ordered"
   - **Green background** = "Resolved"
   - **Blue background** = "Replaced"

---

### **STEP 5: Create Tasks from Issues** ✅

1. Review the Safety Reports sheet
2. For any items with **Status = "Needs Attention"**:
   - Click **Glove Manager → 🛡️ Safety Reports → 📋 Create Tasks from Issues**
3. The system will:
   - Find all "Needs Attention" items
   - Create tasks in the **Manual Tasks** sheet
   - Tasks include: Foreman name, Job number, Equipment type, Description
   - Estimated time: 30 minutes per task
4. These tasks will now appear in:
   - **Tasks & Calendar** dialog (Schedule tab)
   - **Trip Planner** (for scheduling field visits)

---

## 📧 Email Subject Line Patterns

The system searches for these specific patterns:

### **JHA (Job Hazard Analysis)**
- **Subject:** `Job Hazard Report  02-04-2026_009-26_24193847_HEL EZ 1210 WINSTON ST A,B,C HSE CC CUTT (Modified-1)`
- **Sender:** `mptablets@mountainpower.com`
- **Extracts:** Job number (009-26), Report date, Equipment issues

### **Safety Meeting**
- **Subject:** `Safety Meeting Report  Week of 02-02-2026 Safety Topic 015-26`
- **Sender:** `mptablets@mountainpower.com`
- **Extracts:** Job number (015-26), Report date, Equipment issues

### **Fleet Checklist**
- **Subject:** `Weekly Safety Repairs 12.12.25`
- **Sender:** `fleet@mountainpower.com`
- **Extracts:** Vehicle number, Report date, Equipment issues

---

## 🔍 What Gets Detected

### **Equipment Keywords (INCLUDED):**
- Fire extinguisher / extinguisher
- Hot stick / hotstick
- Rubber goods / rubber glove / rubber sleeve
- Signs / sign
- Wheel chock / chock
- Inspection tag / tag
- Any safety equipment mentions

### **Mechanical Issues (IGNORED):**
- brake, brakes
- engine, oil
- tire, tires
- battery, transmission
- clutch, alternator
- starter, radiator
- suspension, exhaust
- fuel, coolant, filter

The system **automatically skips** mechanical issues so you only see safety equipment problems.

---

## 🔄 Ongoing Workflow

### **Weekly Routine:**
1. **Every Monday morning:**
   - Click **Glove Manager → 🛡️ Safety Reports → 📥 Process Safety Emails**
   - Select "7 days" to process last week's emails
2. **Review new issues:**
   - Open the Safety Reports sheet
   - Check for red "Needs Attention" items
3. **Create tasks:**
   - Click **Create Tasks from Issues**
   - Tasks added to Manual Tasks sheet
4. **Schedule field visits:**
   - Open **Trip Planner** to schedule equipment replacements
5. **Update status:**
   - As you resolve issues, change Status to "Ordered" → "Replaced" → "Resolved"

---

## 🛠️ Troubleshooting

### **Problem: No emails found**
- **Check Gmail:** Make sure you have received safety emails with the correct subject lines
- **Check date range:** Try extending to 14 or 30 days
- **Check sender:** Emails must come from `mptablets@mountainpower.com` or `fleet@mountainpower.com`

### **Problem: Permission denied error**
- **Re-authorize:** Click **Glove Manager → 🛡️ Safety Reports → ⚙️ Setup Safety Reports Sheet** again
- Follow the permission prompts
- Make sure you're logged in with the correct Google account

### **Problem: Foreman name not showing**
- **Check Employees sheet:** The foreman must be listed with:
  - Correct job number (e.g., "009-26")
  - Job Classification = "F" (Foreman)
- The system looks up foreman by job number automatically

### **Problem: Duplicate issues appearing**
- The system tracks by **Source Email ID** to prevent duplicates
- If you see duplicates, they may be from different emails
- Check the "Source Email ID" column to verify

---

## 📊 Example Output

Here's what a processed safety report looks like:

| Report Date | Report Type | Job Number | Foreman | Vehicle Number | Equipment Type | Issue Description | Status | FE Test Date | Source Email ID | Notes |
|-------------|-------------|------------|---------|----------------|----------------|-------------------|--------|---------------------|-----------------|-------|
| 02/04/2026 | Fleet Checklist | 013-26 | John Smith | 1084 | Fire Extinguisher | Fire extinguisher last tested 01.01.24 | Needs Attention | 01/01/2024 | 18d3f5a6b2c4e789 | |
| 02/03/2026 | Safety Meeting | 009-26 | Mike Jones | | Hot Stick | Hot stick inspection tag missing | Needs Attention | | 17c2e4b5a1d3f678 | |
| 02/02/2026 | JHA | 015-26 | Dave Brown | | Rubber Goods | Rubber gloves expired, need replacement | Ordered | 12/15/2025 | 16b1d3c4e2f5a789 | Ordered 02/04 |

---

## 🎯 Future Enhancements (Phase 2)

Coming soon:
- **AI-powered summaries** - "Crew 009-26 has had 3 fire extinguisher issues this quarter"
- **Pattern detection** - Automatic alerts for recurring problems
- **Crew safety scorecards** - Track safety compliance by crew
- **Automated replacement scheduling** - Auto-create purchase orders for expired equipment

---

## 📞 Need Help?

If you encounter issues:
1. Check the **Logger** in Apps Script:
   - Extensions → Apps Script → Executions
2. Look for error messages
3. Check that email subject lines match the expected patterns
4. Verify Employees sheet has correct job numbers and classifications

---

## ✅ Checklist for Go-Live

- [ ] Grant Gmail permissions
- [ ] Create Safety Reports sheet
- [ ] Process test batch (7 days)
- [ ] Review extracted issues
- [ ] Verify foreman names are correct
- [ ] Create test tasks from issues
- [ ] Update a task status to "Resolved" to test workflow
- [ ] Set up weekly Monday routine

---

**Ready to go!** 🚀

The Safety Reports module is now deployed and ready for use. Start with Step 1 above to begin processing your safety emails.
