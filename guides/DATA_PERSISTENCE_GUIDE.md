# Data Persistence - What Stays and What Gets Regenerated

## ✅ Your Data is Safe!

When you run **Build Sheets** or **Generate All Reports**, your employee data (including Job Classifications) is **completely preserved**.

---

## 🛡️ What NEVER Gets Deleted

### **Employees Sheet - ALL DATA PRESERVED:**
- ✅ Employee names
- ✅ Classes
- ✅ Locations
- ✅ **Job Numbers**
- ✅ Phone numbers
- ✅ Email addresses
- ✅ Glove & Sleeve sizes
- ✅ Hire dates
- ✅ Last Day (if set)
- ✅ **Job Classifications** ⭐

### **Inventory Sheets (Gloves & Sleeves):**
- ✅ Item numbers
- ✅ Sizes & Classes
- ✅ Test dates
- ✅ Assignments
- ✅ Locations
- ✅ All inventory data

---

## 🔄 What Gets Regenerated

These sheets are **reports** that get rebuilt from your source data:

### **Build Sheets:**
- Creates missing sheets if they don't exist
- Adds missing column headers
- **DOES NOT** clear any existing data in Employees, Gloves, or Sleeves

### **Generate All Reports:**
- 🔄 **Glove Swaps** - Rebuilt from Gloves inventory
- 🔄 **Sleeve Swaps** - Rebuilt from Sleeves inventory
- 🔄 **Purchase Needs** - Recalculated based on inventory
- 🔄 **Inventory Reports** - Regenerated summaries
- 🔄 **Reclaims** - Rebuilt based on current status
- 🔄 **To-Do List** - Regenerated action items

**These are REPORTS, not source data.** They're designed to be regenerated frequently.

---

## 📋 How It Works

### **Build Sheets Logic:**
```
IF Employee sheet exists AND has data:
    ✅ Keep all existing data
    ✅ Only add missing column headers
ELSE:
    Create new sheet with headers
```

### **Generate All Reports Logic:**
```
Reads FROM: Employees, Gloves, Sleeves (source data)
Writes TO: Swap reports, Purchase Needs, etc. (reports)
Does NOT modify: Employees sheet at all
```

---

## 💡 Best Practices

### **Source Data (Edit Freely):**
- **Employees sheet** - Your master employee list
- **Gloves sheet** - Your inventory of gloves
- **Sleeves sheet** - Your inventory of sleeves

**These are your "database" - edit them directly, assign Job Classifications, etc.**

### **Report Sheets (Don't Edit Manually):**
- **Glove Swaps / Sleeve Swaps** - Generated reports
- **Purchase Needs** - Generated recommendations
- **Inventory Reports** - Generated summaries
- **Reclaims** - Generated list

**These get rebuilt - any manual edits will be lost when you regenerate.**

---

## 🔍 Real-World Example

### Scenario:
1. You assign **Job Classifications** to all 50 employees
2. Next day, you run **Generate All Reports** to update swap recommendations
3. Next week, you run **Build Sheets** to ensure structure is correct

### Result:
- ✅ All 50 Job Classifications **still there**
- ✅ Employee data **unchanged**
- ✅ Swap reports **updated with latest data**
- ✅ Everything works as expected

---

## ⚠️ What WOULD Delete Data

**Only manual actions can delete employee data:**
- Manually deleting rows in Employees sheet
- Manually clearing cells
- Using Google Sheets "Clear all" on the Employees sheet
- Deleting the entire sheet

**Automated functions (Build Sheets, Generate All Reports) DO NOT delete employee data.**

---

## 🎓 Training Tracking Persistence

### **Setup Training Tracking:**
When you run **Setup Training Tracking**, it:
- ✅ Creates a **historical snapshot** of current crews
- ✅ Populates crew leads based on current Job Classifications
- ✅ Does NOT re-read from Employees sheet on subsequent "Generate All Reports"

**Important:** Training Tracking is **historical by design**. Once created, it represents training compliance for that point in time. If crew composition changes, you would create a new tracking period, not regenerate the existing one.

---

## ✅ Summary

**You can safely:**
- Run Build Sheets anytime
- Run Generate All Reports daily or multiple times per day
- Assign and change Job Classifications
- Edit employee data

**Your Job Classifications and all employee data will persist!** 🎉

