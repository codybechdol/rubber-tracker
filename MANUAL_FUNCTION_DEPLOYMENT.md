rting# 🚨 URGENT: Manual Function Deployment

## The Problem
The `generateToDoTasksFromCerts` function exists in your local Code.gs (line 1380) but isn't in the Google Apps Script version that's running. Clasp push isn't showing errors but the function isn't deploying.

## SOLUTION: Manual Copy-Paste (5 minutes)

### Step 1: Copy the Function
Copy this ENTIRE function (lines 1374-1466 from local Code.gs):

```javascript
/**
 * Generates To Do tasks from certification data.
 * @param {Array} certRows - Array of certification rows
 * @param {Array} selectedCertTypes - Cert types to create tasks for
 * @param {Object} empMap - Employee map for location lookup
 * @return {number} Number of tasks created
 */
function generateToDoTasksFromCerts(certRows, selectedCertTypes, empMap) {
  if (!selectedCertTypes || selectedCertTypes.length === 0) {
    Logger.log('No cert types selected for task generation');
    return 0;
  }

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var manualTasksSheet = ss.getSheetByName('Manual Tasks');

  if (!manualTasksSheet) {
    Logger.log('Manual Tasks sheet not found, skipping task generation');
    return 0;
  }

  var today = new Date();
  var tasksCreated = 0;

  for (var i = 0; i < certRows.length; i++) {
    var cert = certRows[i];

    // Skip if not in selected cert types
    if (selectedCertTypes.indexOf(cert.certType) === -1) {
      continue;
    }

    // Skip non-expiring certs
    if (cert.isNonExpiring) {
      continue;
    }

    // Create task if priority OR expiring soon
    var shouldCreateTask = false;
    var priority = 'Medium';

    if (cert.isPriority) {
      shouldCreateTask = true;
      priority = 'High';
    } else if (cert.expirationDate) {
      try {
        var expDate = new Date(cert.expirationDate);
        var daysUntil = Math.floor((expDate - today) / (1000 * 60 * 60 * 24));

        if (daysUntil <= 30) {
          shouldCreateTask = true;
          priority = daysUntil <= 7 ? 'High' : 'Medium';
        }
      } catch (e) {
        Logger.log('Error parsing date for cert: ' + cert.certType + ', date: ' + cert.expirationDate);
      }
    }

    if (shouldCreateTask) {
      var emp = empMap[cert.convertedName];
      var location = emp ? emp.location : cert.excelLocation;

      var taskRow = [
        location || '',
        priority,
        'Renew ' + cert.certType,
        cert.expirationDate || '',
        '', // Start Time
        '', // End Time
        1, // Estimated Time
        location || 'Helena', // Start Location
        location || '', // End Location
        'Employee: ' + cert.convertedName + ' | Current Expiration: ' + (cert.expirationDate || 'Unknown'),
        new Date(), // Date Added
        'Pending' // Status
      ];

      try {
        manualTasksSheet.appendRow(taskRow);
        tasksCreated++;
      } catch (e) {
        Logger.log('Error appending task row: ' + e);
      }
    }
  }

  Logger.log('Created ' + tasksCreated + ' To Do tasks from certifications');
  return tasksCreated;
}
```

### Step 2: Paste into Google Apps Script

1. **Open your Google Sheet**
2. **Go to Extensions → Apps Script**
3. **Open Code.gs file**
4. **Find the function `processExpiringCertsImportMultiRow`**
5. **Scroll down to line ~1370** (right after it ends with `}`)
6. **Look for the function `applyExpiringCertsFormatting`**
7. **PASTE the copied function BEFORE `applyExpiringCertsFormatting`**

### Step 3: Verify the Location

The function should be placed between:
```javascript
  return {
    success: true,
    message: '✅ Import Complete!...'
  };
}

// PASTE THE NEW FUNCTION HERE

/**
 * Applies conditional formatting to Expiring Certs sheet.
 */
function applyExpiringCertsFormatting(sheet, dataRows) {
```

### Step 4: Save

1. Click the **Save** icon (💾) or press **Ctrl+S**
2. Wait for "Saved" confirmation
3. Close Apps Script editor

### Step 5: Test

1. Refresh your Google Sheet (F5)
2. Try the import again
3. Should work now!

---

## Alternative: Just Remove Task Generation

If you want to skip the task generation feature for now, you can comment out the call:

### In Google Apps Script Code.gs, find line ~1362:

Change this:
```javascript
    // Generate To Do tasks for selected cert types
    var tasksCreated = generateToDoTasksFromCerts(certRows, selectedCertTypes, empMap);
```

To this:
```javascript
    // Generate To Do tasks for selected cert types
    // TEMPORARILY DISABLED - Function not working
    // var tasksCreated = generateToDoTasksFromCerts(certRows, selectedCertTypes, empMap);
    var tasksCreated = 0;
```

This will let the import complete without creating tasks.

---

## Why Clasp Isn't Working

Possible reasons:
1. Clasp might not be authenticated properly
2. Script ID might be mismatched
3. rootDir setting might be wrong
4. Apps Script might be caching old version

## Quick Clasp Check

Run these commands:
```powershell
cd "C:\Users\codyb\WebstormProjects\Rubber Tracker"
clasp status
clasp open
```

If `clasp open` opens the wrong project, clasp isn't configured correctly.

---

## Fastest Solution

**Just copy-paste the function manually** (Step 1-5 above). Takes 2 minutes.

Once it's in there, the import will work!

---

## After It Works

Once you get the import working, you can:
1. Test task generation
2. Fix clasp configuration
3. Use clasp for future updates

But for now, **manual paste is fastest!** ⚡
po