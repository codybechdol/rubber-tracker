# Crew Lead Restriction & Automatic Exclusions

## ✅ Updated January 5, 2026

---

## 🎯 What Changed

### **1. Crew Lead Detection (Only F and GTO F)**
The crew lead detection for training tracking has been **restricted to only recognize:**
- **F** (Foreman)
- **GTO F** (General Trade Operator - Foreman)

### **2. Automatic Crew Exclusion** ⭐ NEW
Crews are now **automatically excluded** from training tracking if their foreman (F or GTO F) has:
- **Job Number = "N/A"**
- **Location = "weeds"** (case-insensitive)

This means you don't need to manually add crew numbers to an exclusion list anymore!

---

## 📋 All Classifications Still Available

The dropdown menu still includes all 17 classifications:
- AP 1-7 (Apprentice levels)
- JRY, JRY OP, OP (Journeyman/Operators)
- **F** ⭐, GF, SUP, **GTO F** ⭐, GTO (Leadership)
- EO 1-2 (Equipment Operators)

**But only F and GTO F trigger crew lead identification in training tracking.**

---

## 🚫 Automatic Crew Exclusion Criteria

Crews are **automatically excluded** from training tracking when:

### **Exclusion Triggers:**
1. **Job Number = "N/A"**
   - Foreman (F or GTO F) has job number set to "N/A"
   - Indicates management, office staff, or non-field personnel

2. **Location = "weeds"**
   - Foreman (F or GTO F) has location set to "weeds" (case-insensitive)
   - Indicates crew is not actively working/requiring training

### **How It Works:**
- System checks each crew's foreman during training setup
- If foreman matches exclusion criteria → crew is auto-excluded
- No manual configuration needed
- Works alongside manual exclusion list (crew 002-26)

---

## 🚫 Manual Exclusions

In addition to automatic exclusions, these crews are manually excluded:
- **002-26** - Cody Bechdol (Management - hardcoded in system)

These classifications are available for assignment but will **NOT** be identified as crew leads:
- **GF** (General Foreman) - Available but not a training crew lead
- **SUP** (Supervisor) - Available but not a training crew lead
- **GTO** (General Trade Operator) - Available but not a training crew lead

---

## 💡 Why This Matters

### **Before This Change:**
- System would identify GF, SUP, GTO as crew leads
- Training Tracking would show them in "Crew Lead" column
- Could cause confusion about who is responsible for crew training

### **After This Change:**
- Only F and GTO F are identified as crew leads
- Training Tracking accurately reflects field crew structure
- Clear responsibility for training compliance

---

## 📊 Impact on Training Tracking

When you run **Setup Training Tracking**:

### **Will Be Crew Lead:**
- Employee with **F** classification → Shows as crew lead
- Employee with **GTO F** classification → Shows as crew lead

### **Will NOT Be Crew Lead:**
- Employee with **GF** classification → Crew lead column will be empty or show first employee
- Employee with **SUP** classification → Crew lead column will be empty or show first employee
- Employee with **GTO** classification → Crew lead column will be empty or show first employee

---

## 🔧 Technical Details

### **Files Updated:**

#### `75-Scheduling.gs` - `getCrewLead()` function:
```javascript
// Only F and GTO F are crew leads for training tracking
if (classification === 'F' || classification === 'GTO F') {
  return { name, jobNumber, classification };
}
```

#### `76-EmployeeClassifications.gs` - `isCrewLead()` function:
```javascript
// Only F and GTO F are crew leads for training tracking
if (classStr === 'F') return true;
if (classStr === 'GTO F') return true;
return false;
```

### **Documentation Updated:**
- ✅ `GF_SUP_ADDED.md`
- ✅ `CLASSIFICATION_QUICK_START.md`
- ✅ `76-EmployeeClassifications.gs` (inline help text)

---

## 🎓 Usage Example

### **Scenario:**
You have 3 crews with different classifications:

| Crew   | Employee        | Classification | Crew Lead? |
|--------|-----------------|----------------|------------|
| 009-26 | John Smith      | **F**          | ✅ YES     |
| 012-25 | Jane Doe        | **GTO F**      | ✅ YES     |
| 015-26 | Bob Johnson     | **GF**         | ❌ NO      |
| 018-26 | Alice Wilson    | **SUP**        | ❌ NO      |

### **Training Tracking Result:**
```
Crew   | Crew Lead     | Status
-------|---------------|--------
009-26 | John Smith    | Pending
012-25 | Jane Doe      | Pending
015-26 |               | Pending  (no crew lead identified)
018-26 |               | Pending  (no crew lead identified)
```

---

## ✅ What You Need to Do

### **If You Haven't Run Setup Training Tracking Yet:**
- Nothing! Just run it as normal
- Only F and GTO F will be identified as crew leads

### **If You Already Ran Setup Training Tracking:**
- The existing data won't change (it's historical)
- If you need to regenerate, delete the Training Tracking sheet
- Run **Setup Training Tracking** again
- New data will use the updated crew lead detection

### **When Assigning Classifications:**
- Use **F** for field crew foremen who manage training
- Use **GTO F** for specialized operator foremen
- Use **GF, SUP, GTO** for other leadership roles that don't manage crew training

---

## 📖 Reference

### **Crew Lead Classifications (Training Tracking):**
- ⭐ **F** - Foreman
- ⭐ **GTO F** - General Trade Operator - Foreman

### **Leadership Classifications (Not Crew Leads):**
- **GF** - General Foreman
- **SUP** - Supervisor
- **GTO** - General Trade Operator

---

**Implementation complete!** Only F and GTO F will now be recognized as crew leads for training tracking purposes. 🎉

