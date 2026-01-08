# Training Tracking - Crew Exclusion Feature

## ✅ Crew 002-26 Excluded from Training Tracking

**Effective Date:** January 5, 2026

---

## 🎯 What Was Changed

The training tracking system now **automatically excludes crew 002-26** (Cody Bechdol) from being generated in the Training Tracking sheet.

### **Why:**
- Management/office staff don't need the same field crew training tracking
- Reduces clutter in training compliance reports
- Focuses tracking on field crews only

---

## 📋 How It Works

### **Excluded Crews List:**
When you run **Setup Training Tracking**, the system checks an exclusion list:

```javascript
var excludedCrews = ['002-26']; // Add crew numbers here to exclude them
```

**Result:**
- Crew 002-26 will NOT appear in the Training Tracking sheet
- All other active crews will be included
- You'll see a message showing how many crews were excluded

---

## ➕ Adding More Exclusions

If you need to exclude additional crews (e.g., office staff, management):

### **Option 1: Edit the Code (Permanent)**
1. Open `src/75-Scheduling.gs` in your editor
2. Find the line: `var excludedCrews = ['002-26'];`
3. Add more crew numbers: `var excludedCrews = ['002-26', '003-26', '004-26'];`
4. Run `npx @google/clasp push` to deploy
5. Run **Setup Training Tracking** again

### **Option 2: Manually Set to N/A (After Generation)**
1. Run **Setup Training Tracking** (includes all crews)
2. Find the rows for crews you want to exclude
3. Change their **Status** from "Pending" to **"N/A"**
4. These will be ignored in compliance reports

---

## 📊 Success Message

When you run **Setup Training Tracking**, you'll see:

```
✅ Training Tracking sheet created!

Generated 132 training records for:
• 11 active crews (tracked)
• 1 crew(s) excluded: 002-26
• 12 months of 2026 training topics

Update completion dates and status as training is completed.

💡 TIP: To exclude more crews, edit the excludedCrews array in setupTrainingTracking().
```

---

## 🔍 Current Exclusions

### **Excluded Crews:**
- **002-26** - Cody Bechdol (Management/Office)

### **Reason for Exclusion:**
Management and office staff don't participate in field crew safety training, so tracking them would skew compliance reports.

---

## ✅ Compliance Reporting

The **Generate Compliance Report** will:
- ✅ Only show crews that were generated in Training Tracking
- ✅ Not include 002-26 in calculations
- ✅ Provide accurate field crew compliance percentages

---

## 💡 Tips

### **When to Use Exclusions:**
- Management personnel
- Office staff
- Part-time employees who don't do field work
- Crews that handle their own training separately

### **When NOT to Use Exclusions:**
- Active field crews (even small ones)
- Temporary crews
- Crews that occasionally need training

### **Alternative to Exclusion:**
Instead of excluding, you can mark specific training entries as "N/A" for crews that don't need certain topics. This gives you more granular control.

---

## 🚀 Next Steps

1. **Refresh your Google Sheet** (if open)
2. **Run:** Glove Manager → Schedule → **Setup Training Tracking**
3. **Verify:** Crew 002-26 is not in the generated list
4. **Check message:** Should show "1 crew(s) excluded: 002-26"

---

**Implementation complete!** Crew 002-26 (Cody Bechdol) will now be automatically excluded from training tracking. 🎉

