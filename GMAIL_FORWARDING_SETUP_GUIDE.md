# Gmail Auto-Forward Setup Guide for Safety Reports

**Date:** February 4, 2026  
**From:** codyb@mountainpower.com  
**To:** codybechdol@gmail.com  
**Goal:** Auto-forward JHAs, Safety Meetings, and Fleet Checklists to personal Gmail with folder organization

---

## 🎯 What We're Setting Up

Automatically forward these emails from your work account to your personal Gmail:
- **JHAs** - Subject: "Job Hazard Report"
- **Safety Meetings** - Subject: "Safety Meeting Report"
- **Fleet Checklists** - Subject: "Weekly Safety Repairs"

All forwarded emails will go into a dedicated **"Safety Reports"** folder in codybechdol@gmail.com, keeping your inbox clean.

---

## 📋 Step-by-Step Setup Instructions

### **PART 1: Enable Forwarding in Work Gmail (codyb@mountainpower.com)**

#### **Step 1: Add Forwarding Address**

1. **Open Gmail** at work account: codyb@mountainpower.com
2. Click the **⚙️ Gear icon** (top right) → **"See all settings"**
3. Click the **"Forwarding and POP/IMAP"** tab
4. In the **"Forwarding"** section, click **"Add a forwarding address"**
5. Enter: **codybechdol@gmail.com**
6. Click **"Next"** → **"Proceed"**
7. Gmail sends a confirmation email to codybechdol@gmail.com

#### **Step 2: Confirm Forwarding (in Personal Gmail)**

1. **Open Gmail** at personal account: codybechdol@gmail.com
2. Look for email from **"Gmail Team"** with subject: **"Gmail Forwarding Confirmation"**
3. Click the **confirmation link** in the email
4. You'll see: **"You've confirmed that messages sent to codyb@mountainpower.com can be forwarded to codybechdol@gmail.com"**

#### **Step 3: Verify Forwarding is Enabled**

1. Go back to **codyb@mountainpower.com** Gmail settings
2. Reload the **"Forwarding and POP/IMAP"** tab
3. You should now see:
   ```
   Forward a copy of incoming mail to: codybechdol@gmail.com
   ○ disable forwarding
   ○ forward a copy of incoming mail to codybechdol@gmail.com and keep Gmail's copy in the Inbox
   ○ forward a copy of incoming mail to codybechdol@gmail.com and mark Gmail's copy as read
   ○ forward a copy of incoming mail to codybechdol@gmail.com and delete Gmail's copy
   ```
4. **DO NOT enable forwarding here yet** - we'll do it via filters in Part 2

---

### **PART 2: Create Gmail Filters for Selective Forwarding (codyb@mountainpower.com)**

We'll create 3 filters - one for each email type.

---

#### **Filter 1: JHAs (Job Hazard Reports)**

1. In **codyb@mountainpower.com** Gmail, click the **search box** at the top
2. Click the **filter icon** (slider icon) on the right side of search box
3. Fill in the filter criteria:
   - **From:** `mptablets@mountainpower.com`
   - **Subject:** `Job Hazard Report`
4. Click **"Create filter"** (bottom right)
5. Check these boxes:
   - ☑️ **Forward it to:** `codybechdol@gmail.com`
   - ☑️ **Mark as read** (optional - keeps work inbox clean)
6. Click **"Create filter"**
7. ✅ **JHA forwarding active!**

---

#### **Filter 2: Safety Meetings**

1. Click the **search box** → **filter icon** again
2. Fill in:
   - **From:** `mptablets@mountainpower.com`
   - **Subject:** `Safety Meeting Report`
3. Click **"Create filter"**
4. Check:
   - ☑️ **Forward it to:** `codybechdol@gmail.com`
   - ☑️ **Mark as read** (optional)
5. Click **"Create filter"**
6. ✅ **Safety Meeting forwarding active!**

---

#### **Filter 3: Fleet Checklists**

1. Click the **search box** → **filter icon** again
2. Fill in:
   - **From:** `fleet@mountainpower.com`
   - **Subject:** `Weekly Safety Repairs`
3. Click **"Create filter"**
4. Check:
   - ☑️ **Forward it to:** `codybechdol@gmail.com`
   - ☑️ **Mark as read** (optional)
5. Click **"Create filter"**
6. ✅ **Fleet Checklist forwarding active!**

---

### **PART 3: Create "Safety Reports" Folder in Personal Gmail (codybechdol@gmail.com)**

Now we'll organize forwarded emails into a dedicated folder.

#### **Step 1: Create the Label (Folder)**

1. **Open Gmail** at: codybechdol@gmail.com
2. On the left sidebar, scroll down and click **"+ Create new label"**
3. Enter label name: **Safety Reports**
4. Click **"Create"**
5. ✅ **Folder created!**

---

#### **Step 2: Create Auto-Filing Filters in Personal Gmail**

We'll create 3 filters to automatically move forwarded emails into the "Safety Reports" folder.

---

##### **Filter 1: Auto-file JHAs**

1. In **codybechdol@gmail.com** Gmail, click the **search box** → **filter icon**
2. Fill in:
   - **From:** `mptablets@mountainpower.com`
   - **Subject:** `Job Hazard Report`
3. Click **"Create filter"**
4. Check:
   - ☑️ **Skip the Inbox (Archive it)**
   - ☑️ **Apply the label:** `Safety Reports`
   - ☑️ **Also apply filter to matching conversations** (catches any already received)
5. Click **"Create filter"**
6. ✅ **JHAs will go directly to "Safety Reports" folder!**

---

##### **Filter 2: Auto-file Safety Meetings**

1. Click **search box** → **filter icon**
2. Fill in:
   - **From:** `mptablets@mountainpower.com`
   - **Subject:** `Safety Meeting Report`
3. Click **"Create filter"**
4. Check:
   - ☑️ **Skip the Inbox (Archive it)**
   - ☑️ **Apply the label:** `Safety Reports`
   - ☑️ **Also apply filter to matching conversations**
5. Click **"Create filter"**
6. ✅ **Safety Meetings will go directly to "Safety Reports" folder!**

---

##### **Filter 3: Auto-file Fleet Checklists**

1. Click **search box** → **filter icon**
2. Fill in:
   - **From:** `fleet@mountainpower.com`
   - **Subject:** `Weekly Safety Repairs`
3. Click **"Create filter"**
4. Check:
   - ☑️ **Skip the Inbox (Archive it)**
   - ☑️ **Apply the label:** `Safety Reports`
   - ☑️ **Also apply filter to matching conversations**
5. Click **"Create filter"**
6. ✅ **Fleet Checklists will go directly to "Safety Reports" folder!**

---

## 🎊 Setup Complete!

### **What Happens Now:**

1. **New safety emails arrive** at codyb@mountainpower.com
2. Gmail **auto-forwards** them to codybechdol@gmail.com
3. Gmail **auto-files** them into "Safety Reports" folder
4. Your **inbox stays clean** - no clutter!
5. You can access safety emails from the **"Safety Reports"** label in left sidebar

---

## 🧪 Test the Setup

### **Send a Test Email:**

1. From any email account, send yourself an email:
   - **To:** codyb@mountainpower.com
   - **From:** mptablets@mountainpower.com (if possible) OR just use test subject
   - **Subject:** `Test - Job Hazard Report`
   - **Body:** "This is a test fire extinguisher issue"

2. Check **codybechdol@gmail.com**:
   - Should appear in **"Safety Reports"** folder (not inbox)
   - Should NOT clutter your inbox

3. If it works, you're all set! ✅

---

## 📊 Verify Filters are Active

### **Check Work Gmail Filters (codyb@mountainpower.com):**

1. Click **⚙️ Gear icon** → **"See all settings"** → **"Filters and Blocked Addresses"** tab
2. You should see **3 filters**:
   - From: mptablets@mountainpower.com, Subject: Job Hazard Report → Forward to codybechdol@gmail.com
   - From: mptablets@mountainpower.com, Subject: Safety Meeting Report → Forward to codybechdol@gmail.com
   - From: fleet@mountainpower.com, Subject: Weekly Safety Repairs → Forward to codybechdol@gmail.com

### **Check Personal Gmail Filters (codybechdol@gmail.com):**

1. Click **⚙️ Gear icon** → **"See all settings"** → **"Filters and Blocked Addresses"** tab
2. You should see **3 filters**:
   - From: mptablets@mountainpower.com, Subject: Job Hazard Report → Skip Inbox, Apply label "Safety Reports"
   - From: mptablets@mountainpower.com, Subject: Safety Meeting Report → Skip Inbox, Apply label "Safety Reports"
   - From: fleet@mountainpower.com, Subject: Weekly Safety Repairs → Skip Inbox, Apply label "Safety Reports"

---

## 🔧 Troubleshooting

### **Problem: Emails not forwarding**

**Check:**
1. Forwarding address confirmed in work Gmail? (Part 1, Step 2)
2. Filters created correctly in work Gmail? (Part 2)
3. Check work Gmail spam folder - might be blocking sender

**Solution:**
- Go to work Gmail → Settings → Forwarding and POP/IMAP
- Verify codybechdol@gmail.com shows as confirmed
- Re-create filters if needed

---

### **Problem: Emails forwarding but cluttering inbox**

**Check:**
1. Personal Gmail filters created? (Part 3, Step 2)
2. "Skip the Inbox" checked on filters?

**Solution:**
- Go to personal Gmail → Settings → Filters and Blocked Addresses
- Edit filters and check "Skip the Inbox (Archive it)"

---

### **Problem: Can't find forwarded emails**

**Check:**
1. Personal Gmail left sidebar → Click **"Safety Reports"** label
2. Search: `label:safety-reports` in search box

**Solution:**
- Emails are there, just archived (not in inbox)
- Click the "Safety Reports" label to see them

---

## 📱 Accessing Safety Reports from Phone

### **Gmail Mobile App:**

1. Open Gmail app
2. Tap **☰ menu** (three lines, top left)
3. Scroll down to **"Safety Reports"**
4. Tap to view all safety emails

---

## 🔄 Now Run the Script in Google Sheet

**Now that forwarding is set up:**

1. Go back to your **Google Sheet** (Rubber Tracker)
2. Click **Glove Manager → 🛡️ Safety Reports → 📥 Process Safety Emails**
3. The permission error should be **FIXED** ✅
4. Select **"90 days"** to process all recent emails
5. The script will now read from **codybechdol@gmail.com** (the Google account the sheet is in)

---

## ✅ Checklist

### **Work Gmail (codyb@mountainpower.com):**
- [ ] Forwarding address added: codybechdol@gmail.com
- [ ] Forwarding confirmed (clicked link in confirmation email)
- [ ] Filter 1: JHA forwarding
- [ ] Filter 2: Safety Meeting forwarding
- [ ] Filter 3: Fleet Checklist forwarding

### **Personal Gmail (codybechdol@gmail.com):**
- [ ] "Safety Reports" label created
- [ ] Filter 1: JHA auto-filing to Safety Reports folder
- [ ] Filter 2: Safety Meeting auto-filing to Safety Reports folder
- [ ] Filter 3: Fleet Checklist auto-filing to Safety Reports folder
- [ ] Test email sent and received in correct folder

### **Google Sheet:**
- [ ] Permission error fixed (clasp push completed)
- [ ] Reload Google Sheet page
- [ ] Re-run Process Safety Emails - should work now!

---

## 📝 Notes

- **Forwarding is instant** - emails arrive in personal Gmail within seconds
- **Filters apply immediately** - new emails go straight to Safety Reports folder
- **Old emails are NOT auto-forwarded** - only new emails from now on
- **To process old emails:** The script can still read them from work Gmail if you grant additional permissions, OR you can manually forward a batch of old emails to yourself

---

## 🎓 Optional: Forward Old Emails (Backfill)

If you want to process safety emails from the past 90 days:

1. In **work Gmail** (codyb@mountainpower.com):
2. Search: `from:mptablets@mountainpower.com OR from:fleet@mountainpower.com`
3. Select all matching emails (checkbox at top)
4. Click **"More"** (three dots) → **"Forward as attachment"**
5. To: `codybechdol@gmail.com`
6. Click **"Send"**
7. These will now appear in your personal Gmail "Safety Reports" folder
8. Run the script to process them

---

**All set! Follow the checklist above to complete setup.** 🚀
