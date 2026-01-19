# Quick Deployment Guide - Deploy New Expiring Certs Feature

## The Problem
The code changes have been made in your local files, but they haven't been deployed to Google Apps Script yet. That's why you're still seeing "Expiring Certs" instead of "Manage Certs" in the sidebar.

## Option 1: Manual Deployment (RECOMMENDED - Do this now)

Since clasp may not be set up, here's how to manually deploy the new files:

### Step 1: Upload New Files to Google Apps Script

1. **Open your Google Sheet**: https://docs.google.com/spreadsheets/d/1MqqJdQ5rFW8VN-ZlCebJ7dbzEfc0NoX32RXtBdkEJKg/edit

2. **Go to Extensions → Apps Script**

3. **Upload the 2 new HTML files:**
   - Click the **+** next to "Files" in the left sidebar
   - Select "HTML"
   - Name it: `ExpiringCertsChoice`
   - Copy the content from: `C:\Users\codyb\WebstormProjects\Rubber Tracker\src\ExpiringCertsChoice.html`
   - Paste it and save

   - Click the **+** again
   - Select "HTML"  
   - Name it: `ExpiringCertsImport`
   - Copy the content from: `C:\Users\codyb\WebstormProjects\Rubber Tracker\src\ExpiringCertsImport.html`
   - Paste it and save

### Step 2: Update Existing Files

1. **Update Code.gs:**
   - Open `Code.gs` in Apps Script editor
   - Find the `setupExpiringCertsSheet` function (around line 830)
   - After that function's closing brace, add all the new functions from lines 833-1420 in your local Code.gs file
   - The new functions start with the comment: `// EXPIRING CERTS IMPORT WORKFLOW FUNCTIONS`
   - **Key functions to add:**
     - `showExpiringCertsChoiceDialog()`
     - `showExpiringCertsImportDialog()`
     - `getCertTypeDefaults()`
     - `getEmployeeNamesForMatching()`
     - `parseExcelCertDataMultiRow()`
     - `fuzzyMatchEmployeeName()`
     - `levenshteinDistance()`
     - `processExpiringCertsImportMultiRow()`
     - `applyExpiringCertsFormatting()`
     - `createEmployeeGroups()`
     - `refreshCertsFromCompletedTasks()`
     - `getExpiringCertsConfig()`
     - `saveExpiringCertsConfig()`
     - `getExpiringCertsForConfig()`

2. **Update QuickActions.html:**
   - Open `QuickActions` in Apps Script editor
   - Find line with `📜 Expiring Certs` button (around line 97)
   - Change:
     ```html
     <button class="quick-btn" onclick="runQuick('setupExpiringCertsSheet', 'Setup Expiring Certs', 'Setting up Expiring Certs sheet...')">📜 Expiring Certs</button>
     ```
   - To:
     ```html
     <button class="quick-btn" onclick="runQuick('showExpiringCertsChoiceDialog', 'Manage Certs', 'Opening certification management...')">📜 Manage Certs</button>
     ```

3. **Update ToDoConfig.html:**
   - Open `ToDoConfig` in Apps Script editor
   - Add the new "Expiring Certs" tab after the Notifications tab
   - This is a larger update - see the modified ToDoConfig.html file

### Step 3: Save and Test

1. Click **Save project** (disk icon) in Apps Script
2. Close the Apps Script tab
3. **Refresh your Google Sheet** (F5 or reload button)
4. Open the Quick Actions sidebar again
5. You should now see "Manage Certs" button
6. Click it to test!

## Option 2: Use Clasp (If you want to set it up for future)

If you want to use clasp for easier future deployments:

1. **Install clasp globally:**
   ```powershell
   npm install -g @google/clasp
   ```

2. **Login to Google:**
   ```powershell
   clasp login
   ```

3. **Push changes:**
   ```powershell
   cd "C:\Users\codyb\WebstormProjects\Rubber Tracker"
   clasp push
   ```

## What You Should See After Deployment

1. **Quick Actions Sidebar:**
   - Button should say "📜 Manage Certs" (not "Expiring Certs")
   
2. **When you click "Manage Certs":**
   - Choice dialog appears with two large cards:
     - 📤 Import New Excel Data
     - 🔄 Refresh from Completed Tasks

3. **When you click "Import New Excel Data":**
   - Full import dialog opens
   - Cert type checkboxes at top
   - Paste area for Excel data
   - Preview and confirm buttons

4. **To Do Config:**
   - New "Expiring Certs" tab appears
   - Shows cert configuration and employee status

## Testing Quick Checklist

After deployment:
- [ ] "Manage Certs" button shows in Quick Actions
- [ ] Clicking it opens choice dialog (not an error)
- [ ] Choice dialog has two options
- [ ] "Import New Excel Data" opens import dialog
- [ ] Import dialog shows cert checkboxes
- [ ] To Do Config has Expiring Certs tab

## Troubleshooting

**If "Manage Certs" still shows as "Expiring Certs":**
- Hard refresh the Google Sheet (Ctrl+Shift+R)
- Clear browser cache
- Close and reopen the sheet

**If you get "function not found" error:**
- Make sure you added all the new functions to Code.gs
- Check function names match exactly (case-sensitive)
- Save the Apps Script project

**If dialogs don't open:**
- Check browser console for errors (F12)
- Verify HTML files were created with correct names
- Make sure no typos in function calls

## Files Modified Summary

### New Files:
1. `ExpiringCertsChoice.html` - Choice dialog
2. `ExpiringCertsImport.html` - Import dialog

### Modified Files:
1. `Code.gs` - Added 14 new functions (~590 lines)
2. `QuickActions.html` - Changed one button
3. `ToDoConfig.html` - Added new tab

## Next Steps After Deployment

Once deployed and working:
1. Test the import workflow with sample Excel data
2. Verify employee matching works
3. Check To Do Config displays cert data
4. Then proceed to Phase 2 (employee resolution)
