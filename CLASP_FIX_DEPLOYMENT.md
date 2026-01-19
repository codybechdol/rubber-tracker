# 🔧 CLASP FIX & DEPLOYMENT GUIDE

## Issue Diagnosed
The terminal is hanging on all Node.js/clasp commands. This is a terminal session issue, not a clasp configuration problem.

## ✅ Fixes Applied
1. Updated `.clasp.json` - changed `"rootDir": "src"` to `"rootDir": "./src"`
2. Your Script ID is correct: `12U9JReRFpWfYVAx7jLuK7n-RyIT2Gb28I_hBKzm-vsh1bgbxRZFN0Doq`
3. The code fix for column indices is already in `src/Code.gs`

## 🚀 DEPLOYMENT OPTIONS (Choose One)

### Option 1: Fresh Terminal Window (RECOMMENDED)
**Close WebStorm entirely and open a fresh instance:**

1. **Close WebStorm** completely (File → Exit)
2. **Open Windows Terminal** or **PowerShell** (not through WebStorm)
3. Run these commands:
```powershell
cd "C:\Users\codyb\WebstormProjects\Rubber Tracker"
clasp push
```

This should work because the terminal session won't have the hanging node processes.

---

### Option 2: Use the Batch File
I created `push.bat` in your project folder. 

**Double-click** `push.bat` in Windows Explorer to run clasp push.

---

### Option 3: Direct CMD
1. Press **Windows Key + R**
2. Type: `cmd`
3. In the Command Prompt window:
```cmd
cd /d "C:\Users\codyb\WebstormProjects\Rubber Tracker"
clasp push
```

---

### Option 4: Manual Copy-Paste (2 minutes - Always Works!)
Since clasp is having issues, you can manually apply the fix:

1. **Open Google Apps Script**
   - Open your Google Sheet: https://docs.google.com/spreadsheets/d/1MqqJdQ5rFW8VN-ZlCebJ7dbzEfc0NoX32RXtBdkEJKg
   - Go to **Extensions → Apps Script**
   - Or go directly to: https://script.google.com/home/projects/12U9JReRFpWfYVAx7jLuK7n-RyIT2Gb28I_hBKzm-vsh1bgbxRZFN0Doq/edit

2. **Find the function**
   - Press **Ctrl+F** (Find)
   - Search for: `getExpiringCertsForConfig`
   - You'll see it around line 1635

3. **Find this code** (around line 1660):
```javascript
  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    var empName = row[0];
    var certType = row[1];
    var expiration = row[2];
    var daysUntil = row[5];
    var status = row[6];
```

4. **Replace with this**:
```javascript
  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    var empName = row[2];      // Column C - Employee
    var certType = row[4];      // Column E - Item Type
    var expiration = row[1];    // Column B - Expiration Date
    var daysUntil = row[6];     // Column G - Days Until Expiration
    var status = row[7];        // Column H - Status
```

5. **Save**: Press **Ctrl+S** or click the Save icon (💾)

6. **Test**: 
   - Refresh your Google Sheet (F5)
   - Open **Quick Actions → To Do Config**
   - Click **Expiring Certs** tab
   - Should now load properly!

---

## 🐛 Why Clasp Hangs in WebStorm Terminal

The WebStorm terminal session has orphaned Node.js processes or environment issues. This happens when:
- Node commands were interrupted previously
- Terminal session has stale environment variables
- Background Node processes are blocking

**Solution**: Use a fresh terminal window outside WebStorm.

---

## ✅ Verify the Fix Worked

After deploying (any method above), test:

1. **Open Google Sheet**
2. **Quick Actions → To Do Config**
3. **Click Expiring Certs tab**
4. Should see:
   - ✅ Employee names grouped properly
   - ✅ Certification types per employee
   - ✅ Expiration dates
   - ✅ Status badges (Expired, Critical, etc.)
   - ✅ Summary statistics

If still showing "Loading...", try:
- Hard refresh: **Ctrl+Shift+R**
- Close and reopen the sheet
- Wait 30 seconds for Apps Script cache to clear

---

## 📝 What Was Fixed

**The Bug**: `getExpiringCertsForConfig()` was reading wrong columns
- Was reading `row[0]` for employee (but that's "Item #")
- Was reading `row[1]` for cert type (but that's "Expiration Date")

**The Fix**: Corrected column indices to match actual sheet structure:
- Employee: `row[2]` (Column C)
- Item Type: `row[4]` (Column E)
- Expiration: `row[1]` (Column B)
- Days Until: `row[6]` (Column G)
- Status: `row[7]` (Column H)

---

## 🎯 Next Steps After Fix is Deployed

1. Test the Expiring Certs display works
2. Complete any remaining certification import
3. Test the To Do task generation from certs
4. Verify emails are sent for expiring certs (if enabled)

Let me know once you've deployed using any of the methods above and we'll continue with testing!
