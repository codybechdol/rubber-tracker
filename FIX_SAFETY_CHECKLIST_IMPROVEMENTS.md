# Safety Checklist Report Improvements

**Date:** February 4, 2026

## Issues Fixed

### 1. Report Date Off by One Day (Column A)
**Problem:** Sheet showed `01/28/2026` but the PDF report said `Jan 29, 2026`

**Root Cause:** Date parsing from subject line was using midnight time which caused timezone issues

**Solution:** 
- Parse dates using noon (12:00 PM) to avoid timezone rollover issues
- Also extract date from PDF content if subject parsing fails or returns email date
- Format: Parse "Date:Jan 29, 2026" from PDF header

### 2. Equipment Type (Column F) - More Specific Names
**Problem:** Some items were showing as "Other Safety Equipment" instead of their actual equipment type

**Solution:** Now only tracks actual SAFETY equipment (not vehicle mechanical items):

**General Equipment:**
- First Aid Kit
- Cones
- Triangles
- Signs
- Hot Sticks
- Insulated Jumpers
- Fire Extinguisher
- AED
- Fall Protection
- Harnesses/Lanyards
- Crane Log Books
- Mileage Books

**Tools:**
- Hot Hoist
- Chains/Chokers/Slings
- Barriers

**REMOVED (Truck Mechanical Items):**
The following items are now EXCLUDED because they are vehicle maintenance issues, not safety equipment:
- ~~Wipers~~
- ~~Horn~~
- ~~Reflectors~~
- ~~Warning Lights~~
- ~~Brakes~~
- ~~Lights~~
- ~~Mirrors~~
- ~~Windshield~~
- ~~Defrost~~
- ~~Windows~~
- ~~Heater~~
- ~~Seat Belts~~
- ~~Misc Comment~~ (OCR text was too messy to parse reliably)

### 3. Issue Description (Column G) - Cleaner Text
**Problem:** Descriptions were showing raw pattern matches with extra text

**Solution:** 
- Cleaner descriptions like "Fire Extinguisher - not properly charged" instead of raw OCR text
- Each equipment type now has specific issue text (e.g., "Wipers - No", "Hot Sticks not in good condition")

### 4. FE Test Date (Column I) - Renamed & Fixed
**Problem:** Column was named "Test/Expiration Date" and wasn't being populated for fire extinguisher issues

**Solution:**
- Renamed column to "FE Test Date" (Fire Extinguisher Test Date)
- Now correctly extracts test date from PDF patterns like "Test date: Oct 29, 2025"
- **FE Test Date now shows for ALL fire extinguisher issues, not just expired ones**
- This lets you see when the fire extinguisher was last tested even if it's not expired yet

### 5. Missing Job Numbers and Foreman Names (Columns C & D)
**Problem:** Some rows had empty Job Number and Foreman columns

**Solution:**
- If job number not found in subject, extract from PDF content (pattern: "Job #: XXX-XX")
- After extracting job number, lookup foreman by job number from Employees sheet
- Uses crew leader priority: SUP > GF > F > GTO F > GTO > JRY OP > AP7-1

### 6. Skip Reports for Crews Not on Employee Sheet (NEW)
**Problem:** Reports for old/inactive job numbers were being processed even though the job is no longer on the Employees sheet

**Solution:**
- Now checks if the job number exists on the Employees sheet
- If the job number is NOT found, the report is skipped entirely
- This prevents clutter from old crews you no longer manage
- Log message: "Skipping report - Job XXX-XX not found on Employees sheet"

### 7. Fire Extinguisher Expiration Color Coding (NEW)
**Problem:** Hard to quickly identify which fire extinguishers need attention

**Solution:** Column I (FE Test Date) now has conditional formatting based on expiration:
- 🔴 **RED** - Fire extinguisher is EXPIRED (test date + 1 year < today)
- 🟠 **ORANGE** - Expiring within 3 months (test date + 1 year ≤ today + 90 days)
- 🟡 **YELLOW** - Expiring within 6 months (test date + 1 year ≤ today + 180 days)
- ⬜ **No color** - More than 6 months until expiration

This uses the `EDATE()` formula to add 12 months to the test date, then compares to TODAY().

### 8. Monthly Safety Checklist Tracking (NEW)
**Problem:** Need to track monthly Safety Checklist submissions from each crew

**Solution:** Added Monthly Checklist tracking to the Safety Compliance system:

**Safety Compliance Sheet (new column):**
- Added "Monthly Checklist" column between Weekly Meeting and Status
- Shows ✅ if crew submitted a Safety Checklist Report for the current month
- Shows ⏳ if still pending (before end of month)
- Shows ❌ if past end of month and no checklist received
- Shows N/A if crew is excluded from this requirement

**Safety Compliance Config Sheet (new column):**
- Added "Skip Monthly Checklist" checkbox column
- Check this box to exclude a crew from monthly checklist requirements

**How it works:**
- Searches Gmail for "Safety Checklist Report" emails from the past 35 days
- Matches the job number from the subject line (e.g., "Safety Checklist Report 578-033-26 01-15-2026")
- Marks crew as compliant if ANY checklist was submitted during the current month
- Missing checklists are only marked as ❌ in the last week of the month

**Compliance Grid:**
- Process Safety Emails dialog now shows a "Monthly" column
- Full compliance dashboard includes Monthly Checklist status

## Files Modified
- `src/88-SafetyReports.gs`
  - `setupSafetyReportsSheet()` - Updated headers, added new equipment types to dropdown
  - `parseSafetyEmail()` - Fixed date parsing with noon time
  - `extractSafetyChecklistIssues()` - Complete rewrite with:
    - Job number/date extraction from PDF if missing from subject
    - All equipment types from PDF form
    - Cleaner issue descriptions
    - Proper FE Test Date extraction

## Documentation Updated
- `SAFETY_COMPLIANCE_TRACKING.md` - Updated equipment list
- `PHASE4_SAFETY_REPORTS_GUIDE.md` - Renamed column references
- `PHASE4_SAFETY_REPORTS_SETUP_GUIDE.md` - Renamed column references

## Testing
To re-process emails with the new parsing:
1. Go to Glove Manager → 🛡️ Safety Reports → ⚙️ Setup Safety Reports Sheet
2. Click "Yes" to recreate the sheet (this will delete existing data)
3. Go to Glove Manager → 🛡️ Safety Reports → 📥 Process Safety Emails
4. Select date range and click "Start Processing"

The new parsing will:
- Show correct report dates from the PDF
- Populate job numbers and foreman names
- Show specific equipment types instead of "Other"
- Include the FE Test Date for expired fire extinguishers
- Show cleaner issue descriptions
