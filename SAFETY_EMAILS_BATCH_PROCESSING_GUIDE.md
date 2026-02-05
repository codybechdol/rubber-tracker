# Safety Emails Batch Processing Guide

## Overview
The system now processes safety emails in **batches of 50** to avoid timeout issues. With 195 emails in your Gmail Safety Reports folder, you'll click "Continue Processing" about 4 times total.

## How It Works

### Batch Processing
- **Batch Size:** 50 emails at a time
- **Total for 195 emails:** 4 batches (50 + 50 + 50 + 45)
- **Each batch takes:** ~30-60 seconds
- **Total time:** 2-4 minutes (with your manual clicks between batches)

### Progress Tracking
The system remembers where it left off using ScriptProperties. If you close the dialog mid-processing, the next time you open it, it will continue from where it stopped.

## Step-by-Step Instructions

### 1. Open the Dialog
**Menu:** Glove Manager → 🛡️ Safety Reports → 📥 Process Safety Emails

### 2. Select Date Range
Choose how far back to search:
- **7 days** - Just last week
- **14 days** - Last 2 weeks
- **30 days** - Last month ⭐ **Recommended for first run**
- **60 days** - Last 2 months
- **90 days** - Last 3 months

For your 195 emails, I recommend starting with **30 days** to test the workflow.

### 3. Click "Start Processing"
The dialog will show:
```
📊 Batch 1 of 4 Complete
Progress: 50 / 195 emails
This batch: 12 processed, 38 skipped, 15 issues
Remaining: 145 emails
```

### 4. Click "Continue Processing (145 left)"
The button text changes to show remaining count. Keep clicking until you see:
```
✅ All Complete!
Total emails found: 195
Processed: 48 | Skipped: 147
Issues found: 62
```

### 5. Review Safety Reports Sheet
Open: **Menu → 🛡️ Safety Reports → 📊 View Safety Reports**

You'll see all extracted equipment issues with:
- Report Date, Type (JHA/Safety Meeting/Fleet Checklist)
- Job Number, Foreman, Vehicle Number
- Equipment Type, Issue Description
- Status (Needs Attention = red, Resolved = green)
- Test/Expiration Dates
- Source Email ID (for reference)

### 6. Create Tasks from Issues
**Menu → 🛡️ Safety Reports → 📋 Create Tasks from Issues**

This creates Manual Task entries for all "Needs Attention" items, which will appear in:
- **Tasks & Calendar** dialog (Step 2 workflow)
- **Trip Planner** (for scheduling field visits)
- **Daily Accomplishments** report (after completion)

## What Gets Extracted

### Equipment Types
- 🔥 Fire Extinguisher
- ⚡ Hot Stick
- 🧤 Rubber Goods (gloves/sleeves)
- 🚧 Signs
- 🛞 Wheel Chocks
- 🏷️ Inspection Tag

### Issues Detected
- "Fire extinguisher last tested 01.01.24" → Extracts date 01/01/2024
- "Need new signs" → Logged as Signs issue
- "No inspection tag on fire extinguisher" → Logged as Inspection Tag issue
- "Hot Stick dates expired" → Logged as Hot Stick issue

### Mechanical Issues (Ignored)
These are NOT logged:
- Brakes, engine, oil, tires
- Battery, transmission, clutch
- Alternator, starter, radiator
- Suspension, exhaust, fuel, coolant

## Forwarded Email Format

Your forwarded emails work perfectly! The system handles:

**Original subject:**
```
Safety Meeting Report Week of 01-05-2026 Safety Topic 005-26
```

**Forwarded subject (what you have):**
```
Fwd: Safety Meeting Report Week of 01-05-2026 Safety Topic 005-26
```

Both patterns are detected and parsed correctly.

## Troubleshooting

### If Dialog Shows "No safety emails found"
1. **Check Gmail folder:** Make sure emails are in the inbox or visible to search
2. **Check date range:** Your oldest email might be outside the selected range
3. **Check subject lines:** Must contain "Job Hazard Report", "Safety Meeting Report", or "Weekly Safety Repairs"

### If You Want to Restart from Beginning
**Menu → Glove Manager → Utilities → (add this manually if needed)**

Or run in Apps Script:
```javascript
function resetSafetyEmailBatchProgress() {
  var props = PropertiesService.getScriptProperties();
  props.deleteProperty('SAFETY_BATCH_START');
  Browser.msgBox("✅ Batch progress reset.");
}
```

### If Processing Stops Mid-Batch
The system saves progress automatically. Just reopen the dialog and click "Continue Processing" - it will pick up where it left off.

### If You See Duplicates
The system checks Source Email ID to prevent duplicates. If you run the process twice on the same date range, it will skip already-processed emails.

## Performance Estimates

| Emails | Batches | Clicks | Time |
|--------|---------|--------|------|
| 50     | 1       | 1      | ~30 sec |
| 100    | 2       | 2      | ~1 min |
| 195    | 4       | 4      | ~2-3 min |
| 500    | 10      | 10     | ~5-8 min |

## Next Steps After First Run

### 1. Review Extracted Data
Check Safety Reports sheet:
- Are job numbers correct?
- Are foreman names matched?
- Are equipment types categorized correctly?
- Are dates extracted properly?

### 2. Update Status
For each issue, update Status column:
- **Needs Attention** (red) - Requires action
- **Ordered** (yellow) - Replacement ordered
- **Replaced** (blue) - New equipment delivered
- **Resolved** (green) - Issue fixed

### 3. Create Tasks
Run **Create Tasks from Issues** to add "Needs Attention" items to your schedule.

### 4. Set Up Weekly Processing
Going forward, run **Process Safety Emails** once per week:
- Select **7 days** date range
- Should only find 5-10 new emails per week
- Will complete in 1 batch (no continue button needed)

## Tips for Best Results

### 1. Forward Emails Consistently
Set up Gmail filter to auto-forward from `codyb@mountainpower.com` to `codybechdol@gmail.com`:
- **From:** mptablets@mountainpower.com OR fleet@mountainpower.com
- **Subject:** Contains "Report" OR "Checklist"
- **Action:** Forward to codybechdol@gmail.com, Skip Inbox, Apply label "Safety Reports"

### 2. Use 30-Day Batches for Backfill
When processing old emails:
- **First run:** 30 days (last month)
- **Second run:** 60 days (2 months ago)
- **Third run:** 90 days (3 months ago)

This prevents overwhelming the system and lets you review data quality between runs.

### 3. Clean Up Old Emails
After successful extraction, you can:
- Archive processed emails in Gmail
- Keep Source Email ID in Safety Reports for reference
- If you need to re-check details, search Gmail by email ID

## FAQ

**Q: What happens if I close the dialog mid-processing?**
A: Progress is saved. Reopen and click "Continue Processing" to resume.

**Q: Can I process the same date range twice?**
A: Yes, but duplicates are automatically skipped using Source Email ID.

**Q: What if job number extraction fails?**
A: Job Number column will be blank. You can manually fill it in the Safety Reports sheet.

**Q: What if foreman lookup fails?**
A: Foreman column will be blank. The system matches by job number + classification "F". You can manually add foreman name.

**Q: Can I process more than 90 days?**
A: Not directly in the UI. Run this in Apps Script editor:
```javascript
processSafetyEmails(180, 50); // 180 days, 50 per batch
```

**Q: How do I know which emails were skipped?**
A: Check the Logger:
- Apps Script Editor → View → Logs
- Shows "Skipped: X duplicates" count per batch

## Contact for Issues

If you encounter errors:
1. Check Apps Script Logs (View → Logs)
2. Check Safety Reports sheet for partial data
3. Run `resetSafetyEmailBatchProgress()` to restart
4. Try smaller date range (7 days) to isolate issues

---

**Ready to process?** Go to **Glove Manager → 🛡️ Safety Reports → 📥 Process Safety Emails**
