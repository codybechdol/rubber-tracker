# Safety Email Processing Timeout Fix

**Date:** February 24, 2026  
**Issue:** "Exceeded maximum execution time" error when processing safety emails

---

## Problem

The `processSafetyEmails()` function was exceeding the 6-minute Google Apps Script execution limit because:

1. **PDF extraction is SLOW** (~5-10 seconds per PDF) using Drive API's OCR
2. **Each JHA email processes ALL PDF attachments** (not just the first one)
3. **Batch size was 50** - way too many for PDF-heavy processing
4. **No timeout protection** - function would run until Google killed it

---

## Solution

Implemented multiple performance optimizations:

### 1. Reduced Batch Size
- Changed from **50** to **5** threads per batch
- Smaller batches = less chance of timeout

### 2. Execution Time Tracking
- Added `startTime` tracking at function start
- Check elapsed time before processing each message
- Stop gracefully at **5.5 minutes** (30 seconds before the 6-minute limit)

### 3. Fast Mode Option
- **New checkbox in dialog:** "⚡ Fast Mode: Skip PDF extraction"
- When enabled, uses email subject date instead of extracting PDF
- Dramatically faster (~0.5 sec vs 5-10 sec per email)
- Trade-off: May miss batched JHAs where subject date differs from PDF date

### 4. Graceful Timeout Handling
- When timeout is about to occur, saves progress
- Shows yellow progress bar with message
- **New "Continue Processing" button** to resume from where it stopped
- Progress is saved in ScriptProperties

### 5. Progress Visualization
- Progress bar shows actual thread count
- Shows elapsed time when timeout occurs
- Clear messaging about what happened

---

## UI Changes

### Process Safety Emails Dialog

**New elements:**
- ⚡ Fast Mode checkbox (orange warning color)
- Green "▶ Continue Processing" button (appears after timeout)
- Improved warning text explaining batch size and PDF speed

**Updated behavior:**
- Shows elapsed time when timeout occurs
- Progress bar turns yellow/orange on timeout
- Continue button lets you resume without losing progress

---

## Code Changes

### `88-SafetyReports.gs`

1. **`processSafetyEmails()`** - Added parameters:
   - `skipPdfExtraction` (4th parameter) - Controls PDF extraction
   - Time tracking with `startTime` and `MAX_EXECUTION_MS` (5.5 minutes)
   - Changed batch loops from `forEach` to `for` loops (allows `break`)
   - Added `timedOut` flag and graceful exit handling
   - Returns `timedOut: true` result object when stopping early

2. **`parseSafetyEmail()`** - Added parameter:
   - `skipPdfExtraction` (2nd parameter)
   - Reads from ScriptProperties if not passed directly
   - Skips Safety Checklist and JHA PDF extraction when in fast mode
   - Logs "⚡ FAST MODE" messages when skipping

### `ProcessSafetyEmailsDialog.html`

1. Added Fast Mode checkbox
2. Added Continue Processing button
3. Updated `processEmails()` to pass batch size 5 and fastMode
4. Updated `handleBatchComplete()` to handle `timedOut` state
5. Added `continueProcessing()` function
6. Updated `continueBatch()` to pass fastMode

---

## Testing

### Test Normal Processing
1. Open: Glove Manager → 🛡️ Safety → 📥 Process Safety Emails
2. Select "Only process new emails since last run"
3. Leave Fast Mode unchecked
4. Click "Start Processing"
5. **Expected:** Processes in batches of 5, shows progress, may pause for Continue

### Test Fast Mode
1. Same as above but CHECK the Fast Mode checkbox
2. **Expected:** Much faster processing, uses email dates only

### Test Timeout Recovery
1. Uncheck "Only process new" and select 30 days
2. Leave Fast Mode unchecked
3. Click "Start Processing"
4. **Expected:** After ~5.5 minutes, shows yellow bar and Continue button
5. Click "Continue Processing"
6. **Expected:** Resumes from saved position

### Test Reprocess All
1. Click "🔄 Reprocess All (Clear & Restart)"
2. Confirm the warning
3. **Expected:** Clears data, starts processing 90 days

---

## Performance Comparison

| Mode | Batch Size | PDF Extraction | ~Time per Thread |
|------|------------|----------------|------------------|
| Old  | 50         | Yes            | 5-15 seconds     |
| New (Normal) | 5  | Yes            | 5-15 seconds     |
| New (Fast)   | 5  | No             | 0.5-1 second     |

**Timeout risk:**
- Old: Very high (50 × 10s = 500s > 360s limit)
- New Normal: Low (5 × 10s = 50s per batch, well under limit)
- New Fast: Very low (5 × 1s = 5s per batch)

---

## When to Use Fast Mode

**Use Fast Mode when:**
- You need quick compliance tracking
- Most JHAs are submitted same-day (subject date is accurate)
- You're re-processing a large date range

**Don't use Fast Mode when:**
- You need to detect batched JHAs (multiple days in one email)
- You need accurate late submission detection from PDF Date Completed
- Processing Safety Checklists (equipment issues won't be extracted)

---

## Deployment

```powershell
cd "C:\Users\codyb\WebstormProjects\Rubber Tracker"
.\push.bat
```

Successfully pushed 52 files on February 24, 2026.

