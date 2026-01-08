# 🔍 DEBUG INSTRUCTIONS - Find Out Why It's Not Working

## Current Status
Code is deployed but still showing "Need to Purchase ❌" for Waco Worts.

I've added extensive debug logging to figure out exactly what's happening.

---

## How to See Debug Output

### Step 1: Deploy Updated Code (Again)
The file `30-SwapGeneration.gs` has been updated with more debug logging.

1. Open Apps Script Editor (Extensions → Apps Script)
2. Select `30-SwapGeneration.gs`
3. Delete all content (Ctrl+A, Delete)
4. Copy from: `C:\Users\codyb\WebstormProjects\Rubber Tracker\src\30-SwapGeneration.gs`
5. Paste (Ctrl+V)
6. Save (Ctrl+S)

### Step 2: Run Generate Reports

1. Go back to your spreadsheet
2. Click: **Glove Manager** → **Generate All Reports**
3. Wait for it to complete

### Step 3: View Debug Logs

1. Go back to Apps Script Editor
2. Click: **View** → **Logs** (or press Ctrl+Enter)
3. Look for lines starting with `=== DEBUG for Waco Worts ===`

### Step 4: Share The Output

Copy the ENTIRE debug section that looks like this:

```
=== DEBUG for Waco Worts ===
Item type: Sleeves
meta.empPreferredSize (raw from employee): "..."
meta.itemSize (from current item): "..."
useSize (what we will search for): "..."
useSize normalized: "..."
Looking for Class 2
Checking item 104: Size="..." Status="..."
  Item normalized: "..." vs useSize normalized: "..."
  statusMatch=... classMatch=... sizeMatch=...
  notAssigned=... pickedFor="..."
  isReservedForOther=... notLost=...
  ALL CONDITIONS: ...
✗✗✗ No On Shelf exact size match found
```

---

## What The Debug Will Tell Us

The debug output will reveal:

1. **What size is stored in employee record** (`empPreferredSize`)
2. **What size we're actually searching for** (`useSize`)
3. **What the normalized versions are** (should both be "x-large")
4. **Which condition is failing** for each item (104 and 2050)
5. **Why the match isn't working**

---

## Quick Checks Before Running

### Check 1: Employee Record
Open Employees sheet and verify:
- **Row for Waco Worts**
- **Column J (Sleeve Size)**: Should say "XL"

### Check 2: Inventory Items
Open Sleeves sheet and verify:
- **Item 104**: Size="X-Large", Status="On Shelf", Class=2
- **Item 2050**: Size="X-Large", Status="On Shelf", Class=2

### Check 3: Code Deployment
In Apps Script, check line 15-37 has:
```javascript
function normalizeSleeveSize(size) {
  if (!size) return '';
  var normalized = size.toString().trim().toLowerCase();
  // ...etc
}
```

---

## Possible Issues We're Looking For

1. **empPreferredSize is undefined/null** → Falls back to itemSize
2. **useSize is not "XL"** → Something wrong with employee lookup
3. **Normalization not being called** → Logic error
4. **Items already assigned** → assignedItemNums has 104/2050
5. **Items reserved** → pickedFor has another employee's name
6. **Items marked LOST-LOCATE** → notLost is false

---

## After You Share The Debug Output

Once I see the actual debug logs, I'll know EXACTLY what's wrong and can fix it immediately.

**Please copy the debug output from the logs and share it!**

