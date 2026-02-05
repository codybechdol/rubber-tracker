# Enable Drive API - No GCP Link Method

**Your Situation:** Apps Script shows "Default" GCP project with no link to click

---

## Solution: Enable Drive API Through Apps Script Services

### Step 1: Add Drive API Service in Apps Script

**Services is on the Editor page (left sidebar), not Settings!**

1. **Click the Editor icon** (< >) in the left sidebar
2. **Look for "Services"** section in the left panel (below "Files")
3. **Click the "+ Add a service"** button (next to "Services" heading)
4. A popup will appear with a list of Google services
5. **Find "Drive API"** in the list (should be near the top)
6. **Version:** Select **"v2"** from dropdown
7. Click **"Add"** button

**Result:** Drive API v2 will appear in your Services list with identifier "Drive"

---

## Step 2: Verify Drive API Was Added

After adding, you should see in the Services section:
```
Drive API v2
Identifier: Drive
```

---

## Step 3: Grant Permissions

Now that the service is added, you need to grant permissions:

### Option A: Through the Processing Dialog (Easiest)
1. Go back to your Google Sheet
2. Close the current "Process Safety Emails" dialog if still open
3. **Menu:** Glove Manager → 🛡️ Safety Reports → 📥 Process Safety Emails
4. Select **7 days**
5. Click **Start Processing**
6. **You'll see a permission prompt** - Click "Review Permissions"
7. Choose your account
8. Click "Advanced" → "Go to Rubber Tracker (unsafe)"
9. Click **"Allow"**
10. Processing will start with Drive API enabled

### Option B: Through Apps Script Editor
1. In Apps Script, click the **< >** (Editor) icon in left sidebar
2. Find function: `setupSafetyReportsSheet`
3. Click **Run** (▶️ button)
4. Permission prompt appears
5. Click "Review Permissions" → Allow
6. Now Drive API is authorized

---

## Step 4: Reset Batch Progress

Before processing again, reset the progress to reprocess all emails:

1. In Apps Script Editor
2. Change the function dropdown to: **resetSafetyEmailBatchProgress**
3. Click **Run** (▶️)
4. Check Execution log - should say "Batch progress reset"

---

## Step 5: Process Emails Again

1. Back to Google Sheet
2. **Menu:** Glove Manager → 🛡️ Safety Reports → 📥 Process Safety Emails
3. Select **7 days** (test first)
4. Click **Start Processing**
5. **This time you should see issues found!**

---

## Verification: Check the Logs

To see if PDF extraction is working:

1. Apps Script Editor
2. Click the **⏱️ Executions** icon (left sidebar)
3. Click the most recent execution
4. Expand the log entries
5. **Look for:**
   ```
   Email body is short (234 chars), checking for PDF attachments...
   Found PDF attachment: Week of 01-05-2026.pdf
   Extracted 4823 chars from PDF
   Parsed Safety Meeting - Job: 005-26 - Issues: 4
   ```

**If you see these logs = SUCCESS! PDF extraction is working**

---

## Troubleshooting

### "Drive API not found in services"
**Solution:**
- Services section is on the **Editor page** (< > icon in left sidebar)
- Look in the left panel below "Files"
- Should see "Services" heading with "+ Add a service" button

### "Can't find + Add a service button"
**Check:**
- Are you on the **Editor page** (< > icon)?
- Look at the LEFT PANEL (where your .gs files are listed)
- Below "Files" section, you should see "Services"
- The "+ Add a service" button is small, next to the "Services" heading

### "Drive API already added but still getting errors"
**Try:**
1. Remove Drive API service (click trash icon)
2. Wait 10 seconds
3. Add it again (v2)
4. Run `resetSafetyEmailBatchProgress()`
5. Try processing again

### "Permission denied when running functions"
**Grant permissions:**
1. Apps Script → Run any function
2. Click "Review Permissions"
3. Allow all requested permissions
4. Try again

---

## Alternative: Use a Specific GCP Project

If you want more control, you can create and link a specific GCP project:

1. Go to: https://console.cloud.google.com
2. Click "Select a project" → "New Project"
3. Name: "Rubber Tracker APIs"
4. Click "Create"
5. Note the project number (e.g., 123456789)
6. Go back to Apps Script Settings
7. Under "Google Cloud Platform (GCP) Project"
8. Click "Change project"
9. Enter your project number
10. Click "Set project"

**Then:**
- Go to Cloud Console → APIs & Services → Library
- Enable "Google Drive API"
- Enable "Google Docs API"
- Come back and process emails

**But this is MORE COMPLEX - the Services method above is easier!**

---

## Quick Checklist

- [ ] In Apps Script **Editor page** (< > icon) → Services section (left panel)
- [ ] Click "+ Add a service"
- [ ] Select "Drive API" v2 → Add
- [ ] Verify it appears in Services list
- [ ] Run `resetSafetyEmailBatchProgress()` in Apps Script
- [ ] Process Safety Emails (7 days)
- [ ] Grant permissions when prompted
- [ ] Check logs for "Extracted X chars from PDF"
- [ ] Check Safety Reports sheet for issues

---

## Expected Result After Setup

**Before (Current State):**
- Found: 184 emails
- Processed: 184 emails  
- Issues: 0

**After (Drive API Enabled):**
- Found: 184 emails
- Processed: 184 emails
- Issues: **50-100** ✅

---

## Next Steps

1. **Right now:** Add Drive API v2 service (see Step 1 above)
2. **Then:** Reset batch progress
3. **Then:** Process 7 days (test)
4. **If successful:** Process 30 days (full backfill)

---

**Start with Step 1 above - click the Editor icon (< >) to find the Services section in the left panel!**
