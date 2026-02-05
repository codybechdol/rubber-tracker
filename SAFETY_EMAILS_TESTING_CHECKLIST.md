# Safety Emails Testing Checklist

## Pre-Testing Setup ✅
- [x] Safety Reports sheet created
- [x] Batch processing implemented (50 emails per batch)
- [x] Code deployed to Apps Script
- [x] Gmail forwarding configured (codyb → codybechdol)
- [x] 195 emails in Gmail Safety Reports folder

## Testing Workflow (Do This Now)

### Step 1: Test with Small Batch (7 days)
**Goal:** Verify everything works before processing all 195 emails

1. **Open dialog:** Glove Manager → 🛡️ Safety Reports → 📥 Process Safety Emails
2. **Select:** 7 days
3. **Click:** Start Processing
4. **Expected result:** 
   - "Batch 1 of X Complete"
   - Shows progress: "X / Y emails"
   - Button says "Continue Processing (X left)" OR "Close" if complete

**✅ Success criteria:**
- [ ] No errors displayed
- [ ] Progress shows in dialog
- [ ] Safety Reports sheet has new rows
- [ ] Report Date, Job Number, Equipment Type filled in
- [ ] Status = "Needs Attention" (red background)

**❌ If you see errors:**
- Take screenshot
- Copy error message
- Check Apps Script Logs (Extensions → Apps Script → View → Logs)

---

### Step 2: Review Extracted Data
**Open:** Safety Reports sheet

**Check these columns:**

| Column | What to Check | Expected |
|--------|---------------|----------|
| **Report Date** | Is it a valid date? | 01/15/2026, 02/01/2026, etc. |
| **Report Type** | Is it correct? | "JHA", "Safety Meeting", or "Fleet Checklist" |
| **Job Number** | Extracted from subject? | "009-26", "015-26", etc. (or blank if not found) |
| **Foreman** | Matched from Employees? | Foreman name (or blank if no match) |
| **Vehicle Number** | Only for fleet checklists | "1234" or blank |
| **Equipment Type** | Categorized correctly? | "Fire Extinguisher", "Hot Stick", "Rubber Goods", etc. |
| **Issue Description** | Full text of issue | "Fire extinguisher last tested 01.01.24" |
| **Status** | Default value | "Needs Attention" (red) |
| **Test/Expiration Date** | Extracted from description | 01/01/2024 or blank |
| **Source Email ID** | Gmail message ID | Long alphanumeric string |

**✅ Data quality check:**
- [ ] At least 1 issue extracted
- [ ] Equipment Type dropdown works (try changing)
- [ ] Status dropdown works (try changing to "Resolved")
- [ ] Dates are formatted correctly
- [ ] No completely blank rows

---

### Step 3: Test Create Tasks Function
**Goal:** Verify tasks can be created from safety issues

1. **Update Status:** In Safety Reports, change 1-2 issues to "Resolved" (leave others as "Needs Attention")
2. **Run:** Glove Manager → 🛡️ Safety Reports → 📋 Create Tasks from Issues
3. **Expected result:** "✅ Created X safety equipment tasks in Manual Tasks sheet."

**Check Manual Tasks sheet:**
- [ ] New rows added at bottom
- [ ] Employee = Foreman name
- [ ] Location = Job Number
- [ ] Description = "🔧 [Equipment Type] - [Job Number]: [Issue]"
- [ ] Type = "Safety Equipment"
- [ ] Status = "Pending"

**Run again (duplicate test):**
4. **Run:** Create Tasks from Issues again
5. **Expected result:** "No new tasks to create. All 'Needs Attention' items already have tasks."

---

### Step 4: Test Continue Processing (30 days)
**Goal:** Process more emails in batches

1. **Open dialog:** Glove Manager → 🛡️ Safety Reports → 📥 Process Safety Emails
2. **Select:** 30 days
3. **Click:** Start Processing
4. **Wait for Batch 1 Complete**
5. **Click:** Continue Processing (X left)
6. **Repeat** until you see "✅ All Complete!"

**Track your progress:**
| Batch | Emails Processed | Issues Found | Skipped |
|-------|------------------|--------------|---------|
| 1     | ___              | ___          | ___     |
| 2     | ___              | ___          | ___     |
| 3     | ___              | ___          | ___     |
| 4     | ___              | ___          | ___     |

**✅ Success criteria:**
- [ ] All batches complete without errors
- [ ] "All Complete!" message shows
- [ ] Safety Reports sheet has many new rows
- [ ] No timeout errors

---

### Step 5: Data Quality Review
**After processing 30 days, review:**

**Job Number Extraction:**
- [ ] Most rows have job numbers (e.g., "009-26")
- [ ] Blank job numbers are acceptable (some emails don't have them)

**Foreman Matching:**
- [ ] Crews with foremen show foreman names
- [ ] Blank foreman = no foreman on that crew (acceptable)

**Equipment Type Categorization:**
- [ ] Fire extinguishers tagged correctly
- [ ] Hot sticks tagged correctly
- [ ] Rubber goods (gloves/sleeves) tagged correctly
- [ ] Signs, wheel chocks, inspection tags tagged correctly

**Mechanical Issues (Should be ABSENT):**
- [ ] No rows about brakes, tires, engine oil
- [ ] No rows about batteries, transmission
- [ ] Only safety equipment issues present

**Date Extraction:**
- [ ] Dates in "Test/Expiration Date" column look reasonable
- [ ] Format is MM/DD/YYYY
- [ ] Blank dates are acceptable (not all issues mention dates)

---

### Step 6: Test Fwd: Format
**Goal:** Verify forwarded emails work

1. **Look at Safety Reports sheet**
2. **Find rows** where Report Type = JHA or Safety Meeting
3. **Check** if any were processed (they all have "Fwd:" in subject)

**✅ Success criteria:**
- [ ] Forwarded emails were processed
- [ ] Job numbers extracted correctly
- [ ] No errors related to "Fwd:" prefix

---

### Step 7: Test Reset Progress
**Goal:** Verify you can restart if needed

1. **Run in Apps Script:**
   ```javascript
   resetSafetyEmailBatchProgress()
   ```
2. **Expected result:** "✅ Batch progress reset. Next run will start from the beginning."
3. **Verify:** Run Process Safety Emails again with 7 days
4. **Expected result:** Starts from Batch 1 again (skips duplicates)

---

## Common Issues and Solutions

### Issue 1: "No safety emails found"
**Possible causes:**
- Date range too narrow
- Emails not in Gmail inbox/search results
- Subject line format doesn't match

**Solution:**
- Increase date range to 30 days
- Check Gmail search manually: `subject:"Safety Meeting Report"`
- Verify forwarding is working

### Issue 2: "Permission denied" or "Ui.showModalDialog"
**Cause:** Script needs authorization

**Solution:**
1. Apps Script Editor → Run → Run function → setupSafetyReportsSheet
2. Click "Review Permissions"
3. Choose your Google account
4. Click "Advanced" → "Go to Rubber Tracker (unsafe)"
5. Click "Allow"

### Issue 3: Job numbers not extracting
**Cause:** Subject line format changed

**Solution:**
- Check email subject in Gmail
- If format is different, note the new pattern
- May need to update regex in `parseSafetyEmail()` function

### Issue 4: Foreman names blank
**Cause:** Job number doesn't match Employees sheet

**Solution:**
- Check Employees sheet column G (Job Number)
- Check column H (Classification = "F" for foreman)
- Foreman must have job number + "F" classification to match

### Issue 5: Timeout error
**Cause:** Batch size too large or network issues

**Solution:**
- Run again (progress is saved)
- If persists, reduce batch size:
  ```javascript
  processSafetyEmails(30, 25) // 25 per batch instead of 50
  ```

---

## Success Metrics

After processing all 195 emails, you should see:

**Safety Reports Sheet:**
- [ ] 50-150 rows of equipment issues (depending on email content)
- [ ] Multiple report types: JHA, Safety Meeting, Fleet Checklist
- [ ] Multiple equipment types represented
- [ ] Dates span January-February 2026

**Manual Tasks Sheet:**
- [ ] 10-50 new safety equipment tasks created
- [ ] Tasks linked to specific crews/foremen
- [ ] Tasks ready to schedule in Trip Planner

**Process Time:**
- [ ] Total time: 3-5 minutes (including your clicks)
- [ ] No timeout errors
- [ ] All batches completed successfully

---

## Next Steps After Successful Testing

1. **Weekly Processing:** Process last 7 days every Monday
2. **Status Updates:** Review and update Status column weekly
3. **Task Creation:** Run "Create Tasks from Issues" weekly
4. **Trip Planning:** Schedule safety equipment tasks in Trip Planner
5. **Completion Tracking:** Mark tasks complete in Daily Accomplishments

---

## Ready to Test?

**Start here:** Glove Manager → 🛡️ Safety Reports → 📥 Process Safety Emails

**Select:** 7 days (for first test)

**Expected time:** 30 seconds

**Questions?** Check SAFETY_EMAILS_BATCH_PROCESSING_GUIDE.md for detailed help.
