# 🚀 QUICK DEPLOYMENT - 3 EASY METHODS

## THE PROBLEM
Employee Certification Status showing "Loading..." forever due to wrong column indices in `getExpiringCertsForConfig()` function.

## THE FIX
✅ Already applied to local `src/Code.gs` file  
✅ .clasp.json configuration corrected  
❌ Just needs to be pushed to Google Apps Script

---

## 🎯 METHOD 1: PowerShell Script (EASIEST - 10 SECONDS)

1. **Open Windows Explorer**
2. **Navigate to**: `C:\Users\codyb\WebstormProjects\Rubber Tracker`
3. **Right-click** on `Deploy-ClaspPush.ps1`
4. **Select**: "Run with PowerShell"
5. **Wait** for "DEPLOYMENT SUCCESSFUL" message
6. **Done!**

---

## 🎯 METHOD 2: Fresh Terminal (30 SECONDS)

1. **Press**: Windows Key + X
2. **Select**: "Terminal" or "PowerShell"
3. **Copy & paste this**:
```powershell
cd "C:\Users\codyb\WebstormProjects\Rubber Tracker"
clasp push
```
4. **Press Enter**
5. **Wait** for "Pushed X files" message
6. **Done!**

---

## 🎯 METHOD 3: Manual Copy-Paste (2 MINUTES - ALWAYS WORKS)

1. **Open**: https://script.google.com/home/projects/12U9JReRFpWfYVAx7jLuK7n-RyIT2Gb28I_hBKzm-vsh1bgbxRZFN0Doq/edit

2. **Find** (Ctrl+F): `getExpiringCertsForConfig`

3. **Locate this code** (around line 1660):
```javascript
    var empName = row[0];
    var certType = row[1];
    var expiration = row[2];
    var daysUntil = row[5];
    var status = row[6];
```

4. **Replace with**:
```javascript
    var empName = row[2];      // Column C - Employee
    var certType = row[4];      // Column E - Item Type
    var expiration = row[1];    // Column B - Expiration Date
    var daysUntil = row[6];     // Column G - Days Until Expiration
    var status = row[7];        // Column H - Status
```

5. **Save**: Ctrl+S
6. **Done!**

---

## ✅ VERIFY IT WORKED

1. Open Google Sheet
2. Refresh page (F5)
3. **Quick Actions** → **To Do Config**
4. Click **Expiring Certs** tab
5. Should see employee names, cert types, and statistics!

---

## 🐛 WHY WEBSTORM TERMINAL HANGS

The WebStorm terminal session has stale environment issues. Using a fresh PowerShell window or the script file bypasses this completely.

---

## 📞 WHAT'S NEXT

Once deployed and verified:
1. ✅ Test certification import
2. ✅ Test To Do task generation
3. ✅ Complete remaining phases
4. ✅ Full system testing

**Choose Method 1 (PowerShell script) - it's the fastest!**
