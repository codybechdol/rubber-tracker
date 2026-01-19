# 🚨 IMPORTANT: Excel Import vs Scan - Don't Mix Them!

## The Problem You're Experiencing

When you import certification data from Excel, it populates the "Expiring Certs" sheet correctly. BUT when you then click "Scan for Expiring Certs", it **ERASES** your imported data and tries to scan the Gloves/Sleeves sheets instead (which finds nothing).

## The Solution: Choose ONE Method

You have **TWO different ways** to populate the Expiring Certs sheet. **Pick ONE and stick with it:**

---

### Method 1: Import from Excel (RECOMMENDED FOR YOU) ✅

**Use this if you have an Excel spreadsheet with certification data**

#### Steps:
1. Open Quick Actions → **Manage Certs**
2. Click **"📤 Import New Excel Data"**
3. Paste your Excel data (tab-separated)
4. Click "Parse & Preview"
5. Click "Confirm Import"
6. **DONE!** Your Expiring Certs sheet is now populated

#### ⚠️ IMPORTANT:
- **Do NOT click "Scan for Expiring Certs" after importing!**
- The import already populated the sheet
- Scanning will erase your imported data!

#### When to Re-import:
- When you receive new certification data from your Excel report
- Monthly or quarterly (whenever your cert data updates)

---

### Method 2: Scan Gloves/Sleeves Sheets ❌ (Not for you!)

**Only use this if you DON'T have Excel data**

This method scans your Gloves and Sleeves sheets looking for expiration date columns. Since your cert data is in Excel (not in Gloves/Sleeves), this won't work for you and will just erase your imported data.

---

## Your Correct Workflow

### Initial Setup (Do Once):
1. Quick Actions → **Manage Certs** → **Import New Excel Data**
2. Paste your Excel certification data
3. Confirm import

### After That:
- **To update with new Excel data**: Repeat the import process above
- **To update after employees renew certs**: Use "Refresh from Completed Tasks"
- **To configure To Do tasks**: Quick Actions → To Do Config → Expiring Certs tab

### ⛔ NEVER Do This:
- Don't click "Scan for Expiring Certs" if you use Excel imports
- It will erase all your imported certification data!

---

## About Those "Plus Signs" You Mentioned

The little "+" signs to the left of Column A are **row groupings**. They're normal and help organize the data by employee. You can:
- Click **"−"** to collapse a group
- Click **"+"** to expand a group

They don't affect the data - they're just for viewing convenience.

---

## Quick Reference

| What You Want to Do | What to Click |
|---------------------|---------------|
| First time setup with Excel data | Manage Certs → Import New Excel Data |
| Update with new Excel report | Manage Certs → Import New Excel Data |
| Update after renewals completed | Manage Certs → Refresh from Completed Tasks |
| Configure which certs create tasks | To Do Config → Expiring Certs tab |
| **NEVER** | ❌ Scan for Expiring Certs (erases Excel data!) |

---

## Next Step for You RIGHT NOW

Since your data just got erased by the scan, you need to:

1. **Re-import your Excel data**:
   - Quick Actions → Manage Certs → Import New Excel Data
   - Paste your data again
   - Confirm import

2. **Then use To Do Config**:
   - Quick Actions → To Do Config
   - Click "Expiring Certs" tab
   - Now your employee certifications will show up!

3. **Remember**: NEVER click "Scan for Expiring Certs" again!

---

**TL;DR**: You use Excel imports, so ONLY use "Import New Excel Data". The "Scan" option is for people who DON'T have Excel data. They don't mix!
