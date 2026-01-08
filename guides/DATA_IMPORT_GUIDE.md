# 📥 DATA IMPORT GUIDE

**Date**: January 5, 2026  
**Purpose**: Import external inventory data into Rubber Tracker  
**Your Data**: Order #1084 ready for import

---

## 🎯 WHAT YOU HAVE

You've provided inventory/order data:

```
1084	9.5	2	07/22/2025	12/17/2025	Arnett / JM Test	In Testing	In Testing	03/17/2026
```

**Parsed Data:**
- **Item Number**: 1084
- **Size**: 9.5
- **Class**: 2
- **Test Date**: 07/22/2025
- **Date Assigned**: 12/17/2025
- **Location**: Arnett / JM Test
- **Status**: In Testing
- **Change-Out Date**: 03/17/2026

---

## ✅ SOLUTION CREATED

I've created a **data import system** that will:
1. ✅ Parse your tab-separated data
2. ✅ Import into Gloves or Sleeves sheet
3. ✅ Maintain proper column structure
4. ✅ Support bulk imports
5. ✅ Provide one-click import for your specific data

---

## 🚀 QUICK IMPORT (Item 1084)

### **Option 1: One-Click Import**

1. **Deploy the Code**
   ```powershell
   npx @google/clasp push --force
   ```

2. **Open Your Spreadsheet**
   - Refresh the page (Ctrl+R)
   - Look for "Glove Manager" menu

3. **Click Import**
   - Go to: **Glove Manager** → **🔧 Utilities** → **📥 Quick Import (1084)**
   - Click once
   - Done! Item 1084 is imported

**That's it!** Your data will be added to the Gloves sheet automatically.

---

## 📋 BULK IMPORT (Multiple Items)

If you have more data rows to import:

### **Option 2: Import Dialog**

1. **Open Import Dialog**
   - Menu: **Glove Manager** → **🔧 Utilities** → **📥 Import Data**

2. **Paste Your Data**
   - Copy tab-separated data (from Excel, CSV, etc.)
   - Paste into the dialog
   - Select target sheet: Gloves or Sleeves

3. **Click Import**
   - All rows processed at once
   - Success/failure count shown

### **Data Format:**
Each row should be tab-separated with 8 columns:
```
ItemNum	Size	Class	TestDate	DateAssigned	Location	Status	ChangeOutDate
1084	9.5	2	07/22/2025	12/17/2025	Arnett / JM Test	In Testing	03/17/2026
1085	10	2	08/15/2025	01/10/2026	Helena	Assigned	07/10/2026
```

---

## 📊 WHAT HAPPENS DURING IMPORT

The import function will:

1. **Find Next Row**
   - Finds the last row in your target sheet
   - Adds data to the next available row

2. **Map Columns Correctly**
   - Column A: Item Number
   - Column B: Size
   - Column C: Class
   - Column D: Test Date
   - Column E: Date Assigned
   - Column F: Location
   - Column G: Status
   - Column I: Change-Out Date

3. **Parse Dates**
   - Converts date strings to proper Date objects
   - Google Sheets recognizes them for sorting/filtering

4. **Log Results**
   - Success/failure logged
   - Check logs if issues occur

---

## 🔧 TECHNICAL DETAILS

### **Files Created:**
- `src/85-DataImport.gs` - Import functions

### **Functions Available:**
- `importProvidedData()` - One-click import for item 1084
- `showImportDialog()` - Show bulk import dialog
- `bulkImportTSV(data, sheetName)` - Import tab-separated data
- `importInventoryItem(...)` - Import single item

### **Menu Items Added:**
- 🔧 Utilities → 📥 Import Data (bulk)
- 🔧 Utilities → 📥 Quick Import (1084) (your specific data)

---

## 📝 USAGE EXAMPLES

### **Example 1: Import Your Item 1084**
```javascript
// Runs automatically when you click menu item
// "Quick Import (1084)"
importProvidedData();
```

### **Example 2: Manual Code Execution**
```javascript
// If you want to customize the import
importInventoryItem(
  '1084',           // Item number
  9.5,              // Size
  2,                // Class
  '07/22/2025',     // Test date
  '12/17/2025',     // Date assigned
  'Arnett / JM Test', // Location
  'In Testing',     // Status
  '03/17/2026',     // Change-out date
  SHEET_GLOVES      // Target sheet
);
```

### **Example 3: Import Multiple Items**
```javascript
var data = 
  '1084\t9.5\t2\t07/22/2025\t12/17/2025\tArnett / JM Test\tIn Testing\t03/17/2026\n' +
  '1085\t10\t2\t08/15/2025\t01/10/2026\tHelena\tAssigned\t07/10/2026';

bulkImportTSV(data, SHEET_GLOVES);
```

---

## ⚠️ IMPORTANT NOTES

### **Sheet Selection**
The quick import defaults to **Gloves** sheet. If item 1084 is a sleeve:
1. Open: `src/85-DataImport.gs`
2. Find: `importProvidedData()` function
3. Change: `var sheetName = SHEET_GLOVES;`
4. To: `var sheetName = SHEET_SLEEVES;`

### **Duplicate Detection**
The import does NOT check for duplicates. If you run it twice:
- Item 1084 will be added twice
- Manually delete duplicates if needed

### **Data Validation**
The import assumes:
- Dates are in MM/DD/YYYY format
- Size is a number
- Class is a number
- All fields are provided

---

## 🎯 IMMEDIATE NEXT STEPS

**To import item 1084 RIGHT NOW:**

1. **Terminal Command:**
   ```powershell
   cd "C:\Users\codyb\WebstormProjects\Rubber Tracker"
   npx @google/clasp push --force
   ```

2. **Wait 10 Seconds**
   (Let the code deploy)

3. **Open Spreadsheet**
   - Refresh page (Ctrl+R)

4. **Click Menu**
   - Glove Manager → 🔧 Utilities → 📥 Quick Import (1084)

5. **Done!**
   - Check your Gloves sheet
   - Item 1084 will be at the bottom

---

## 🔍 TROUBLESHOOTING

### **Menu Not Appearing**
See: `IMMEDIATE_FIX.md` for menu troubleshooting

### **Import Failed**
1. Check Apps Script logs:
   - Menu: Extensions → Apps Script
   - View → Executions
2. Look for error messages
3. Common issues:
   - Date format wrong
   - Sheet name misspelled
   - Missing required columns

### **Wrong Sheet**
- Edit `importProvidedData()` function
- Change `SHEET_GLOVES` to `SHEET_SLEEVES`

---

## ✅ SUCCESS CRITERIA

After import, you should see:
- ✅ New row in Gloves sheet (or Sleeves)
- ✅ Item number: 1084
- ✅ All fields populated correctly
- ✅ Dates formatted properly
- ✅ Status shows "In Testing"
- ✅ Location shows "Arnett / JM Test"

---

## 📞 QUICK REFERENCE

**Quick Import Command:**
```
Glove Manager → 🔧 Utilities → 📥 Quick Import (1084)
```

**Bulk Import Command:**
```
Glove Manager → 🔧 Utilities → 📥 Import Data
```

**Deploy Command:**
```powershell
npx @google/clasp push --force
```

---

**Ready to import!** 🚀  
**Your data is ready - just deploy and click!** 💪

