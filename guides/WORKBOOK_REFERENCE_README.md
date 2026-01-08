# Workbook Reference - How to Share Your Google Sheet

This folder is set up to receive exported versions of your Google Sheets workbook for analysis.

## 📋 How to Export Your Workbook

### Option 1: Export Entire Workbook (Recommended)
1. Open your Google Sheet: **Rubber Tracker**
2. Go to **File → Download → Microsoft Excel (.xlsx)**
3. Save the file to this directory with the name: `Rubber-Tracker-Workbook.xlsx`

### Option 2: Export Individual Sheets as CSV
If the workbook is too large, export key sheets individually:
1. Go to **File → Download → Comma Separated Values (.csv)**
2. Save each sheet with descriptive names:
   - `Employees.csv`
   - `Gloves.csv`
   - `Sleeves.csv`
   - `Glove-Swaps.csv`
   - `Sleeve-Swaps.csv`
   - `Training-Tracking.csv`
   - etc.

## 🔍 What I Can Analyze

Once you place the .xlsx or .csv files here, I can:

### ✅ **Sheet Structure Analysis**
- Column names and order
- Data types and formats
- Existing data patterns
- Validation rules (from data)

### ✅ **Data Content Review**
- Current employee roster and job numbers
- Active crews and their composition
- Inventory item assignments
- Training tracking status
- Historical data patterns

### ✅ **Cross-Reference with Code**
- Verify column mappings in `00-Constants.gs` match actual sheet structure
- Identify any mismatches between code expectations and actual data
- Validate that formulas and references are correct

### ✅ **Troubleshooting**
- Identify why certain functions might not be working
- Find data inconsistencies
- Spot missing required columns
- Detect formatting issues

## 📸 Screenshots Are Also Helpful!

If you prefer, you can also paste screenshots showing:
- **Employees sheet** - First 5-10 rows with all columns visible
- **Glove/Sleeve Swaps sheets** - Show the swap tracking structure
- **Training Tracking** (if created) - Show crew-based training records
- **Any error messages** - From Apps Script execution logs

## 🚀 Quick Export Steps

```
1. Open: https://docs.google.com/spreadsheets/d/YOUR_SHEET_ID
2. File → Download → Microsoft Excel (.xlsx)
3. Save as: C:\Users\codyb\WebstormProjects\Rubber Tracker\Rubber-Tracker-Workbook.xlsx
4. Let me know it's ready!
```

## 📁 File Naming Convention

Suggested file names:
- `Rubber-Tracker-Workbook.xlsx` - Full workbook export
- `Rubber-Tracker-[Date].xlsx` - Dated snapshot (e.g., `Rubber-Tracker-2026-01-05.xlsx`)
- `[SheetName].csv` - Individual sheet exports

## ⚠️ Privacy Note

If your workbook contains sensitive employee data (phone numbers, emails, etc.), you can:
- Redact sensitive data before exporting
- Share only the structure (column headers and 2-3 sample rows)
- Or share screenshots with sensitive info blurred

---

**Once you've exported the file, just let me know and I'll analyze it!** 🎉

