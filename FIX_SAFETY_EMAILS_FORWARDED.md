# Fix: Safety Emails Not Processing (Forwarded Emails Issue)

**Date:** February 4, 2026  
**Issue:** Found 184 emails but processed 0  
**Root Cause:** Gmail search queries were filtering by sender, but forwarded emails show "Cody Bechdol" as sender

---

## The Problem

### Original Search Queries (WRONG)
```javascript
'subject:"Job Hazard Report" from:mptablets@mountainpower.com newer_than:7d'
'subject:"Safety Meeting Report" from:mptablets@mountainpower.com newer_than:7d'
'subject:"Weekly Safety Repairs" from:fleet@mountainpower.com newer_than:7d'
```

**Why it failed:**
- Forwarded emails show sender = "Cody Bechdol" (you)
- Original sender (`mptablets@mountainpower.com`) is not visible in search
- Gmail's `from:` operator only matches the visible sender field

### Your Gmail Reality
All 195 emails in the Safety Reports folder are **forwarded** from `codyb@mountainpower.com` to `codybechdol@gmail.com`:

**Subject format:**
```
Fwd: Safety Meeting Report Week of 01-05-2026 Safety Topic 005-26
Fwd: Job Hazard Report 02-04-2026_009-26_24193847...
Fwd: Weekly Safety Repairs 12.12.25
```

**Visible sender:** Cody Bechdol (you, not Mountain Power)

---

## The Fix

### New Search Queries (CORRECT)
```javascript
'subject:"Job Hazard Report" newer_than:7d'
'subject:"Safety Meeting Report" newer_than:7d'
'subject:"Weekly Safety Repairs" newer_than:7d'
```

**Why it works:**
- Searches by **subject keywords only**, ignoring sender
- Matches both original emails AND forwarded emails
- Works with "Fwd:" prefix (because we use `indexOf` to check subject)

### Code Changed
**File:** `src/88-SafetyReports.gs`  
**Lines:** 101-106  
**Change:** Removed `from:` filters from Gmail search queries

---

## Why the Parse Still Works

The `parseSafetyEmail()` function uses `indexOf` to check subject keywords:

```javascript
if (subject.indexOf("Job Hazard Report") !== -1) reportType = "JHA";
else if (subject.indexOf("Safety Meeting Report") !== -1) reportType = "Safety Meeting";
else if (subject.indexOf("Weekly Safety Repairs") !== -1) reportType = "Fleet Checklist";
```

**This works for:**
- `"Job Hazard Report 02-04-2026_009-26..."` ✅
- `"Fwd: Job Hazard Report 02-04-2026_009-26..."` ✅

The job number extraction also works:
```javascript
var jobMatch = subject.match(/(\d{3}-\d{2})/);
```

**Extracts from:**
- `"Safety Meeting Report Week of 01-05-2026 Safety Topic 005-26"` → `"005-26"` ✅
- `"Fwd: Safety Meeting Report Week of 01-05-2026 Safety Topic 005-26"` → `"005-26"` ✅

---

## Testing Steps

### 1. Reset Batch Progress (Optional)
Since the first run found 184 emails but processed 0, you may want to start fresh.

**Option A: Automatic reset on next run**
- The system will skip already-processed emails (using Source Email ID)
- Since 0 were processed, all 184 will be reprocessed on next run

**Option B: Manual reset**
1. Open Apps Script Editor (Extensions → Apps Script)
2. Run function: `resetSafetyEmailBatchProgress()`
3. Confirms: "✅ Batch progress reset. Next run will start from the beginning."

### 2. Run Process Safety Emails Again
**Menu:** Glove Manager → 🛡️ Safety Reports → 📥 Process Safety Emails

**Steps:**
1. Select **7 days** (test with smaller batch first)
2. Click **Start Processing**
3. Wait for "Batch 1 of X Complete"
4. **Check the counts:**
   - Processed: Should be > 0 (not 0 anymore!)
   - Skipped: Should be 0 (since none were processed before)
   - Issues: Should be > 0 (equipment issues found)

### 3. Verify Data in Safety Reports Sheet
**Expected results:**
- New rows added with Report Date, Report Type, Job Number
- Equipment Type populated (Fire Extinguisher, Hot Stick, etc.)
- Issue Description filled in
- Status = "Needs Attention" (red)

### 4. Process Remaining Emails (30 days)
Once 7-day test works:
1. Select **30 days**
2. Click **Start Processing**
3. Click **Continue Processing** for each batch
4. Repeat until "✅ All Complete!"

---

## Expected Outcome

### Before Fix
```
Found 184 emails
Processed: 0
Skipped: 0
Issues: 0
```

### After Fix (7 days)
```
Found 15-25 emails
Processed: 10-20
Skipped: 0 (or small number if duplicates)
Issues: 5-15
```

### After Fix (30 days)
```
Found 184 emails
Processed: 100-150
Skipped: 34-84 (duplicates or non-equipment issues)
Issues: 50-100
```

---

## What If It Still Doesn't Work?

### Check Gmail Search Manually
1. Open Gmail
2. Search: `subject:"Safety Meeting Report"`
3. Verify you see results (should show your 195 forwarded emails)

If Gmail search shows results but script doesn't process them:

### Option 1: Check Apps Script Logs
1. Apps Script Editor → View → Logs
2. Look for: "Parsed [Type] - Job: [Number] - Issues: [Count]"
3. If no "Parsed" logs, the issue is in `parseSafetyEmail()`

### Option 2: Test Single Email
Add this test function in Apps Script Editor:

```javascript
function testParseOneEmail() {
  var threads = GmailApp.search('subject:"Safety Meeting Report"', 0, 1);
  if (threads.length > 0) {
    var message = threads[0].getMessages()[0];
    Logger.log("Subject: " + message.getSubject());
    Logger.log("Body preview: " + message.getPlainBody().substring(0, 500));
    
    var parsed = parseSafetyEmail(message);
    Logger.log("Issues found: " + parsed.issues.length);
    
    parsed.issues.forEach(function(issue) {
      Logger.log("Issue: " + JSON.stringify(issue));
    });
  }
}
```

Run this and check logs to see what's being extracted.

### Option 3: Check Email Body Format
If emails are heavily formatted (HTML tables, images), the `getPlainBody()` method might not extract text correctly.

**Solution:** Use `getBody()` for HTML parsing:
```javascript
var body = message.getBody(); // Get HTML
var plainText = body.replace(/<[^>]*>/g, ''); // Strip HTML tags
```

---

## Deployment Status

✅ **Code deployed:** February 4, 2026 (2nd deployment)  
✅ **Search queries fixed:** Removed sender filters  
✅ **Ready to test:** Run Process Safety Emails with 7 days  

---

## Next Steps After Successful Processing

1. **Review extracted data quality**
   - Job numbers correct?
   - Foreman names matched?
   - Equipment types categorized properly?

2. **Create tasks from issues**
   - Menu: 🛡️ Safety Reports → 📋 Create Tasks from Issues

3. **Weekly routine**
   - Process last 7 days every Monday
   - Should find 5-10 new emails per week
   - 1 batch, no "Continue" needed

---

## Summary

**Problem:** Search queries filtered by sender, but forwarded emails don't match original sender.  
**Solution:** Search by subject keywords only, ignore sender.  
**Result:** All 195 forwarded emails should now be found and processed correctly.  

**Test now:** Glove Manager → 🛡️ Safety Reports → 📥 Process Safety Emails (7 days)
