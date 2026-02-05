# Enable Drive API for PDF Extraction

**IMPORTANT:** You need to enable the Drive API in Google Cloud Console for PDF extraction to work!

---

## Quick Setup Steps

### Step 1: Open Apps Script Project Settings
1. Open your Google Sheet
2. **Extensions → Apps Script**
3. Click the **⚙️ Settings** icon (left sidebar)
4. Scroll down to "Google Cloud Platform (GCP) Project"
5. Click the project number link (or note it down)

### Step 2: Open Google Cloud Console
1. Go to: https://console.cloud.google.com
2. Select your project (should auto-select if you clicked the link)
3. Or manually select the project number from Step 1

### Step 3: Enable Drive API
1. In the search bar at top, type: **"Drive API"**
2. Click **"Google Drive API"** from results
3. Click **"ENABLE"** button
4. Wait ~30 seconds for it to enable

### Step 4: Enable Docs API
1. In the search bar at top, type: **"Docs API"**
2. Click **"Google Docs API"** from results
3. Click **"ENABLE"** button
4. Wait ~30 seconds for it to enable

### Step 5: Enable Advanced Services in Apps Script
1. Back in Apps Script Editor
2. Click **⚙️ Settings** (left sidebar)
3. Scroll to **"Services"**
4. Click **"+ Add a service"**
5. Find **"Drive API"** → Select **v2** → Click **"Add"**

---

## Alternative: Simple Enable Method

If the processing is currently running and you see an error like:
- "Drive API has not been used in project..."
- "Drive API is not enabled..."

**Do this:**

1. **Click the error link** in the error message (it usually has a direct link to enable)
2. Click **"Enable API"**
3. Wait 30 seconds
4. **Re-run** Process Safety Emails

---

## Expected Error Messages

### Before Enabling Drive API:
```
Exception: Drive API has not been used in project 123456789 
before or it is disabled. Enable it by visiting 
https://console.developers.google.com/apis/api/drive.googleapis.com/...
```

### After Enabling Drive API:
```
Email body is short (234 chars), checking for PDF attachments...
Found PDF attachment: Week of 01-05-2026.pdf
Extracted 4823 chars from PDF
```

---

## What If Processing Fails Right Now?

### Option 1: Let it finish, then enable APIs
- Current batch will complete (finding 0 issues because PDF extraction fails)
- Enable APIs following steps above
- Run again with same date range
- Will skip already-processed emails (by Source Email ID)
- Will re-process PDFs successfully this time

### Option 2: Stop and enable now
- Close the Process Safety Emails dialog
- Enable APIs following steps above
- Run again
- Will start fresh

---

## Verification

After enabling APIs, run a test:

### Test Function (Run in Apps Script Editor):
```javascript
function testDriveAPIEnabled() {
  try {
    // Try to list files (simple Drive API call)
    var files = DriveApp.getRootFolder().getFiles();
    Logger.log("✅ Drive API is working!");
    
    // Try to use Drive advanced service
    var about = Drive.About.get();
    Logger.log("✅ Drive API v2 advanced service is working!");
    Logger.log("User: " + about.name);
    
    return "✅ All APIs enabled successfully!";
  } catch (e) {
    Logger.log("❌ Error: " + e.toString());
    return "❌ APIs not enabled: " + e.toString();
  }
}
```

**Run this function:**
1. Apps Script Editor
2. Select function: `testDriveAPIEnabled`
3. Click **Run** (▶️)
4. Check logs: View → Logs

**Expected output:**
```
✅ Drive API is working!
✅ Drive API v2 advanced service is working!
User: Cody Bechdol
```

---

## Full Setup Checklist

- [ ] Enable Drive API in Google Cloud Console
- [ ] Enable Docs API in Google Cloud Console
- [ ] Add Drive API v2 service in Apps Script Settings
- [ ] Grant permissions when running Process Safety Emails
- [ ] Test with testDriveAPIEnabled() function
- [ ] Re-run Process Safety Emails (7 days test)

---

## Expected Timeline

1. **Enable APIs:** 2 minutes
2. **Grant permissions:** 30 seconds (when prompted)
3. **Test processing:** 1-2 minutes (7 days)
4. **Verify data:** 30 seconds (check Safety Reports sheet)

**Total:** ~5 minutes to full working state

---

## What Happens Without APIs Enabled?

The code will still run but:
- ✅ Email searching works
- ✅ Subject line parsing works
- ✅ Job number extraction works
- ❌ **PDF extraction fails** (silently logs error)
- ❌ **0 issues found** (because equipment details are in PDF)
- ✅ Code continues without crashing

**Result:** Processed > 0, but Issues = 0 (PDF extraction failed)

---

## Need Help?

If you see errors after enabling APIs:

1. **Check Apps Script Logs:**
   - Extensions → Apps Script
   - View → Executions
   - Click most recent execution
   - Look for "PDF extraction error: [details]"

2. **Check Cloud Console Logs:**
   - https://console.cloud.google.com/logs
   - Filter: "Drive API"
   - Look for 403 or 401 errors

3. **Common issues:**
   - APIs enabled but permissions not granted → Run Process Safety Emails again, click "Allow"
   - Wrong project selected → Verify project number matches Apps Script settings
   - Billing required → Some GCP projects need billing enabled (unlikely for Apps Script)

---

## Quick Access Links

- **Google Cloud Console:** https://console.cloud.google.com
- **Apps Script Editor:** Extensions → Apps Script (from your Google Sheet)
- **API Library:** https://console.cloud.google.com/apis/library

---

**Enable the APIs now, then re-run Process Safety Emails to see PDF extraction in action!** 🚀
