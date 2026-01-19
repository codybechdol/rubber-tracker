# 🚀 Expiring Certs - Quick Deploy & Test Guide

## READY TO DEPLOY! All 4 Phases Complete ✅✅✅✅

---

## 5-Minute Deployment

### Step 1: Update Code.gs (2 minutes)
1. Open your Google Sheet
2. Extensions → Apps Script
3. Open `Code.gs`
4. **Copy entire file from:** `C:\Users\codyb\WebstormProjects\Rubber Tracker\src\Code.gs`
5. Paste and replace all content
6. Save (Ctrl+S)

### Step 2: Update ExpiringCertsImport.html (1 minute)
1. In Apps Script, open `ExpiringCertsImport`
2. **Copy entire file from:** `C:\Users\codyb\WebstormProjects\Rubber Tracker\src\ExpiringCertsImport.html`
3. Paste and replace all content
4. Save (Ctrl+S)

### Step 3: Update ToDoSchedule.html (1 minute)
1. In Apps Script, open `ToDoSchedule`
2. **Copy entire file from:** `C:\Users\codyb\WebstormProjects\Rubber Tracker\src\ToDoSchedule.html`
3. Paste and replace all content
4. Save (Ctrl+S)

### Step 4: Test (1 minute)
1. Close Apps Script editor
2. Refresh Google Sheet (F5)
3. Click Quick Actions → "Manage Certs"
4. Should see choice dialog (Import or Refresh)

---

## What's New

### You Now Have:
1. ✅ Task completion popup with expiration date entry
2. ✅ Automatic To Do task generation during import
3. ✅ Email certification reports
4. ✅ Refresh from completed tasks

### No More Placeholder Alerts!
- "Add new employee" → Full form modal ✅
- "Task completion" → Date picker popup ✅
- "Refresh" → Real functionality ✅

---

## Quick Test Scenarios

### Test 1: Import with New Employees (3 min)
1. Click "Manage Certs" → "Import New Excel Data"
2. Paste your Excel data
3. Click "Parse & Preview"
4. For unmatched employees, click "Add New Employee"
5. Fill form, save
6. Once all resolved, click "Confirm Import"
7. **NEW:** Should see "To Do Tasks Created: X" in message
8. **NEW:** Asks "Email report?" → Choose Yes or No
9. Check Expiring Certs sheet created
10. **NEW:** Check Manual Tasks sheet for auto-generated tasks

### Test 2: Complete Cert Renewal Task (2 min)
1. Open To Do Schedule
2. Find a cert renewal task (Task Type: "Renew DL" etc.)
3. Click "Mark Complete" checkbox
4. **NEW:** Popup appears asking for new expiration date
5. Date picker defaults to smart date (+2 years for DL)
6. Enter date, click "Save & Complete Task"
7. Check Expiring Certs sheet - expiration updated!
8. Days Until and Status should recalculate

### Test 3: Email Report (1 min)
1. After import, when asked "Email report?"
2. Click Yes
3. Check configured email addresses receive HTML report
4. Should show categories: Priority, Expired, Critical, Warning

### Test 4: Refresh from Completed Tasks (1 min)
1. Click "Manage Certs" → "Refresh from Completed Tasks"
2. Should scan completed cert renewal tasks
3. Shows summary of matches found
4. Verifies expiration dates updated

---

## Troubleshooting

### "Add new employee functionality - to be implemented"
- ❌ Code not deployed yet
- ✅ Deploy Step 2 (ExpiringCertsImport.html)

### Task completion shows no popup
- ❌ ToDoSchedule.html not updated
- ✅ Deploy Step 3 (ToDoSchedule.html)

### No tasks auto-created during import
- ❌ Code.gs not updated
- ✅ Deploy Step 1 (Code.gs)
- ✅ Make sure cert types are checked before import

### Email fails
- ❌ No notification emails in Employees sheet
- ✅ Add emails to "Notification Emails" column

### Import fails
- ❌ Excel data format wrong
- ✅ Must be tab-separated
- ✅ No headers in pasted data
- ✅ Name format: "LastName, FirstName"

---

## Key Features to Test

### Phase 1 & 2 (Should already work):
- [x] Import Excel data
- [x] Fuzzy name matching
- [x] Previous employee detection
- [x] Add new employee modal
- [x] Expiring Certs sheet creation

### Phase 3 (Test after deployment):
- [ ] Task completion popup
- [ ] Expiration date update
- [ ] Refresh from completed tasks

### Phase 4 (Test after deployment):
- [ ] Auto-generate To Do tasks
- [ ] Email certification report
- [ ] Task count in import message

---

## Expected Results

### After Import:
```
✅ Import Complete!

Imported 150 certifications for 45 employees.

Priority Items: 12
Non-Expiring: 30
To Do Tasks Created: 18    ← NEW!

[Email report option]       ← NEW!
```

### After Task Completion:
```
[Popup appears]
📅 Update Certification Expiration

Employee: John Smith
Certification: DL

New Expiration Date: [Date Picker]  ← NEW!

[Cancel] [Save & Complete Task]
```

### After Refresh:
```
✅ Refresh Complete!

Found 25 completed certification tasks.
12 matched to Expiring Certs sheet.

Matched:
John Smith - DL
Jane Doe - CPR
...
```

---

## Files to Deploy

| File | Location | Status |
|------|----------|--------|
| Code.gs | Apps Script Editor | ⚠️ Must deploy |
| ExpiringCertsImport.html | Apps Script Editor | ⚠️ Must deploy |
| ToDoSchedule.html | Apps Script Editor | ⚠️ Must deploy |
| ExpiringCertsChoice.html | Apps Script Editor | ✅ Already deployed |
| ToDoConfig.html | Apps Script Editor | ✅ Already deployed |
| QuickActions.html | Apps Script Editor | ✅ Already deployed |

---

## Post-Deployment Checklist

- [ ] Code.gs deployed and saved
- [ ] ExpiringCertsImport.html deployed and saved
- [ ] ToDoSchedule.html deployed and saved
- [ ] Google Sheet refreshed (F5)
- [ ] Quick Actions opens
- [ ] "Manage Certs" button shows
- [ ] Choice dialog appears when clicked
- [ ] Import dialog loads
- [ ] Add new employee shows modal (not alert)
- [ ] Import completes successfully
- [ ] Expiring Certs sheet created
- [ ] To Do tasks auto-generated
- [ ] Email report option appears
- [ ] Task completion shows popup
- [ ] Expiration date updates
- [ ] Refresh from completed tasks works

---

## Success Indicators

✅ No more placeholder alerts  
✅ Full form modals appear  
✅ Date pickers work  
✅ Tasks auto-generate  
✅ Emails send  
✅ Expiration dates update  
✅ Refresh finds completed tasks  

---

## Support Files

- `IMPLEMENTATION_COMPLETE.md` - Full details of all phases
- `COMPLETION_STATUS.md` - Phase breakdown
- `DEPLOYMENT_GUIDE.md` - Original deployment guide
- `EXPIRING_CERTS_IMPLEMENTATION_PHASE1.md` - Phase 1 details
- `PREVIOUS_EMPLOYEE_SUPPORT.md` - Phase 2 details
- `ADD_NEW_EMPLOYEE_COMPLETE.md` - Employee resolution details

---

## You're Done When...

1. ✅ Import works end-to-end without errors
2. ✅ New employees can be added via form
3. ✅ Tasks auto-generate during import
4. ✅ Task completion shows date popup
5. ✅ Expiration dates update correctly
6. ✅ Email reports send successfully
7. ✅ Refresh detects completed tasks

**Total Implementation Time:** ~2 hours (Phase 3 + Phase 4)  
**Deployment Time:** ~5 minutes  
**Testing Time:** ~10 minutes  

**READY TO GO! Deploy and test! 🚀**
