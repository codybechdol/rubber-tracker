# Automatic Crew Exclusion Feature - Implementation Summary

## ✅ Implemented January 5, 2026

---

## 🎯 New Feature: Automatic Crew Exclusion

The training tracking system now **automatically excludes crews** based on their foreman's attributes. No more manual exclusion lists needed!

---

## 🚫 Automatic Exclusion Criteria

Crews are automatically excluded when their foreman (F or GTO F) has:

### **1. Job Number = "N/A"**
- **Use Case:** Management, office staff, non-field personnel
- **Example:** Cody Bechdol has job number "N/A" → crew 002-26 auto-excluded

### **2. Location = "weeds"** (case-insensitive)
- **Use Case:** Inactive crews, crews not currently working, crews in transition
- **Example:** Foreman's location is "weeds" → entire crew auto-excluded

---

## 💡 How It Works

### **During Setup Training Tracking:**

1. **System scans all active crews** from Employees sheet
2. **For each crew**, finds the foreman (F or GTO F classification)
3. **Checks foreman's attributes:**
   - Job Number == "N/A"? → Exclude crew
   - Location == "weeds"? → Exclude crew
4. **Generates training records** only for non-excluded crews
5. **Shows exclusion summary** in success message

### **No Manual Intervention Needed:**
- ✅ Set foreman's job number to "N/A" → crew auto-excluded
- ✅ Set foreman's location to "weeds" → crew auto-excluded
- ✅ Change back to normal values → crew auto-included next time

---

## 📊 Real-World Examples

### **Example 1: Office Manager**
```
Name: Cody Bechdol
Classification: F (Foreman)
Job Number: N/A
Location: Helena Office

Result: ✅ Crew 002-26 auto-excluded (job number is N/A)
Reason: Office/management personnel don't need field crew training
```

### **Example 2: Inactive Crew**
```
Name: Bob Johnson
Classification: F (Foreman)  
Job Number: 015-26.1
Location: weeds

Result: ✅ Crew 015-26 auto-excluded (location is "weeds")
Reason: Crew is not actively working, doesn't need training tracking
```

### **Example 3: Active Field Crew**
```
Name: John Smith
Classification: F (Foreman)
Job Number: 009-26.1
Location: Big Sky

Result: ✅ Crew 009-26 INCLUDED (no exclusion criteria)
Reason: Active field crew requires training tracking
```

### **Example 4: Leadership Without Crew Lead Role**
```
Name: Jane Doe
Classification: GF (General Foreman)
Job Number: 012-25.1
Location: Missoula

Result: ⚠️ Crew 012-25 INCLUDED but no crew lead shown
Reason: GF is not recognized as crew lead (only F and GTO F)
```

---

## 🔧 Technical Implementation

### **New Function: `shouldExcludeCrew()`**

Located in: `src/75-Scheduling.gs`

```javascript
/**
 * Checks if a crew should be excluded from training tracking.
 * Excludes crews where the foreman (F or GTO F) has:
 * - Job Number = "N/A"
 * - Location = "weeds" (case-insensitive)
 */
function shouldExcludeCrew(crewNumber) {
  // Finds foreman for the crew
  // Checks job number and location
  // Returns true if exclusion criteria met
}
```

### **Updated Function: `setupTrainingTracking()`**

Now includes:
- Automatic exclusion checking for each crew
- Separate tracking of manual vs automatic exclusions
- Enhanced success message showing exclusion details

---

## 📝 Success Message Format

When you run **Setup Training Tracking**, you'll see:

```
✅ Training Tracking sheet created!

Generated 132 training records for:
• 11 active crews (tracked)
• 2 crew(s) excluded:
  - Manual: 002-26
  - Auto (N/A or weeds): 015-26
• 12 months of 2026 training topics

Update completion dates and status as training is completed.

💡 TIP: Crews with foreman (F/GTO F) having job# N/A or location "weeds" are auto-excluded.
```

---

## 🎯 Benefits

### **Before (Manual Exclusion):**
- ❌ Had to edit code to add exclusions
- ❌ Required code deployment for changes
- ❌ Easy to forget to update exclusion list
- ❌ No visibility into why crews were excluded

### **After (Automatic Exclusion):**
- ✅ Just update foreman's job number or location in Employees sheet
- ✅ No code changes needed
- ✅ Immediate effect on next training setup
- ✅ Clear indication in success message
- ✅ Self-documenting (job number "N/A" explains why)

---

## 🔄 Workflow Examples

### **Scenario 1: New Office Manager**
1. Hire new office manager
2. Add to Employees sheet with classification "F"
3. Set Job Number to "N/A"
4. Run Setup Training Tracking
5. ✅ Crew automatically excluded

### **Scenario 2: Crew Goes Inactive**
1. Crew finishes project, awaiting new assignment
2. Change foreman's Location to "weeds"
3. Run Setup Training Tracking (if regenerating)
4. ✅ Crew automatically excluded

### **Scenario 3: Crew Becomes Active**
1. Crew assigned to new project
2. Change foreman's Location from "weeds" to project location
3. Change foreman's Job Number from "N/A" to actual job number
4. Run Setup Training Tracking
5. ✅ Crew automatically included

---

## 📋 Exclusion Priority

The system checks exclusions in this order:

1. **Manual Exclusions** (hardcoded list: 002-26)
   - Always excluded, regardless of attributes
   
2. **Automatic Exclusions** (based on foreman)
   - Job Number = "N/A" → Exclude
   - Location = "weeds" → Exclude
   
3. **Classification Check**
   - Only F and GTO F recognized as foremen
   - Other classifications don't trigger auto-exclusion

---

## ⚙️ Configuration

### **To Exclude a Crew:**

**Option 1: Set Job Number to N/A**
- Best for: Management, office staff, permanent exclusions
- Edit Employees sheet → Foreman row → Job Number column → "N/A"

**Option 2: Set Location to "weeds"**
- Best for: Temporary exclusions, inactive crews
- Edit Employees sheet → Foreman row → Location column → "weeds"

**Option 3: Manual Exclusion** (developers only)
- Edit `src/75-Scheduling.gs`
- Add to `manualExclusions` array: `['002-26', '003-26']`
- Deploy code changes

### **To Include a Crew:**
- Change Job Number from "N/A" to actual job number
- Change Location from "weeds" to actual location
- Run Setup Training Tracking

---

## 🔍 Troubleshooting

### **Crew Not Excluded When Expected:**
- ✅ Verify foreman has classification "F" or "GTO F"
- ✅ Check spelling: "N/A" (exact match, case-sensitive)
- ✅ Check location: "weeds" (case-insensitive)
- ✅ Confirm you're editing the foreman's row, not another crew member

### **Crew Excluded When It Shouldn't Be:**
- ✅ Check if foreman's job number is "N/A"
- ✅ Check if foreman's location contains "weeds"
- ✅ Verify not in manual exclusion list
- ✅ Change values back to normal to re-include

---

## 📖 Quick Reference

| Foreman Job Number | Foreman Location | Result           |
|--------------------|------------------|------------------|
| 009-26.1          | Big Sky          | ✅ Included      |
| N/A               | Helena Office    | ❌ Excluded      |
| 015-26.1          | weeds            | ❌ Excluded      |
| N/A               | weeds            | ❌ Excluded      |
| 012-25.1          | Missoula         | ✅ Included      |

---

**Implementation complete!** Crews are now automatically excluded based on foreman attributes. 🎉

**Pro Tip:** Use "weeds" for temporary exclusions and "N/A" for permanent exclusions like office staff!

