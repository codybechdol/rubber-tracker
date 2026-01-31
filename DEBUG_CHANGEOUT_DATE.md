# 🔍 Debug Change Out Date Issue - CHECK THE LOG

**Issue:** Cody Lund and Benjamin Lapka missing due dates  
**Deployed:** Enhanced logging (Jan 31, 17:30)

---

## Quick Steps to Find the Problem

### Step 1: Regenerate with Fresh Data
1. Delete rows 2+ from Task Metadata sheet
2. Refresh: `Ctrl + Shift + R`
3. Run: Glove Manager → Schedule & To-Do → Generate Task Metadata

### Step 2: Check the Execution Log
1. **Extensions** → **Apps Script**
2. Click **Executions** (clock icon, left sidebar)
3. Click the most recent "generateTaskMetadata" execution
4. **Look for these debug lines:**

```
=== DEBUG: Employee Cody Lund ===
  Row: 20
  changeOutCol index: [NUMBER]
  changeOutDate raw value: [WHAT IS THIS?]
  changeOutDate type: [WHAT TYPE?]
  changeOutDate instanceof Date: [TRUE/FALSE?]
  
=== DEBUG: Employee Benjamin Lapka ===
  Row: 19
  changeOutCol index: [NUMBER]
  changeOutDate raw value: [WHAT IS THIS?]
```

---

## What to Send Me

**Copy and paste the ENTIRE debug output for:**
- Cody Lund
- Benjamin Lapka

Include all lines starting with `===` DEBUG through `CREATED TASK`.

---

## What I'm Looking For

1. **Is changeOutCol found?** Should be 4 or 5
2. **Is changeOutDate empty?** Should have a date
3. **Is date parsing working?** Should show "PARSED dueDate"
4. **Is task created with dueDate?** Should show dueDate in task object

---

## Can't Access Log? Tell Me:

From your Glove Swaps sheet:
1. Cody Lund row number: ?
2. Change Out Date column letter: ?
3. Value in that cell: ?
4. Picked checkbox: checked?
5. Date Changed column: empty?

---

**Run it and send me the log output!** 🚀
