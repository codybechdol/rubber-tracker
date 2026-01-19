# 🔧 Fix: Certification Status Not Loading

## The Problem
The "Employee Certification Status" section shows "Loading employee certifications..." forever because the `getExpiringCertsForConfig()` function is reading the wrong columns from the Expiring Certs sheet.

## The Issue
The sheet has these columns:
- Column A (0) = Item #
- Column B (1) = Expiration Date
- Column C (2) = Employee
- Column D (3) = Location
- Column E (4) = Item Type
- Column F (5) = Class
- Column G (6) = Days Until Expiration
- Column H (7) = Status

But the code was reading:
```javascript
var empName = row[0];      // Was reading Item # instead of Employee!
var certType = row[1];      // Was reading Expiration Date instead of Item Type!
var expiration = row[2];    // Was reading Employee instead of Expiration Date!
```

## The Fix

### Option 1: Use Clasp (Automated)
```powershell
cd "C:\Users\codyb\WebstormProjects\Rubber Tracker"
clasp push
```

If clasp is hanging, press Ctrl+C and try manual fix below.

### Option 2: Manual Fix (2 minutes)

1. **Open Google Apps Script**
   - Open your Google Sheet
   - Go to **Extensions → Apps Script**

2. **Find the function** (around line 1660)
   - Press **Ctrl+F** and search for: `getExpiringCertsForConfig`
   - You'll find a function starting around line 1635

3. **Find this code block** (around line 1660):
```javascript
  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    var empName = row[0];
    var certType = row[1];
    var expiration = row[2];
    var daysUntil = row[5];
    var status = row[6];
```

4. **Replace it with this**:
```javascript
  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    var empName = row[2];      // Column C - Employee
    var certType = row[4];      // Column E - Item Type
    var expiration = row[1];    // Column B - Expiration Date
    var daysUntil = row[6];     // Column G - Days Until Expiration
    var status = row[7];        // Column H - Status
```

5. **Save**
   - Click the **Save** icon (💾) or press **Ctrl+S**
   - Wait for "Saved" confirmation

6. **Test**
   - Refresh your Google Sheet (F5)
   - Click **To Do Config** in Quick Actions
   - Click the **Expiring Certs** tab
   - The employee certifications should now load!

## After the Fix

The certification status will show:
- ✅ Employee names properly grouped
- ✅ Cert types for each employee
- ✅ Expiration dates
- ✅ Status badges (Expired, Critical, etc.)
- ✅ Summary statistics (Total cert holders, Priority count, Expired count)

## If Still Not Working

Make sure you have data in the **Expiring Certs** sheet first:
1. Click **Quick Actions**
2. Click **Manage Certs** (or **Expiring Certs**)
3. Choose **Import from Excel**
4. Complete the import process
5. Then try opening **To Do Config → Expiring Certs** tab

---

**The fix is already in your local Code.gs file!** Just need to push it to Google Apps Script using one of the methods above.
