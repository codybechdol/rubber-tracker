# Fix: MEC Cert Schedule Button & Manage Certs Relocation

## Changes Made

### 1. MEC Expiration Certs - Remove "Send Class Schedule" Button

**Problem**: MEC (Medical Examiner's Certificate) expiration tasks were showing a "Send Class Schedule" action button, but MEC certs are renewed through DOT physical appointments, not class attendance.

**Solution**: Modified the action button logic in `ToDoSchedule.html` to exclude MEC certs from showing the Stage 2 SMS "Send class schedule" button.

**What Changed**:
- File: `src/ToDoSchedule.html` (lines 1522-1538)
- Added check for cert category: `var certCategory = getCertCategory(task);`
- Added MEC detection: `var isMECCert = certCategory === 'mec';`
- Modified condition: Stage 2 button only shows if `isTaskNotified(task) && !isMECCert`

**Behavior**:
- **Before**: MEC certs showed 2 buttons after notification
  - Stage 1: Send notification text ✅
  - Stage 2: Send class schedule text ❌ (not needed)
  
- **After**: MEC certs only show 1 button
  - Stage 1: Send notification text ✅
  - Stage 2: (hidden for MEC certs)

**Affected Cert Types Still Show Both Buttons**:
- 1st Aid / CPR ✅
- Driver's License ✅
- Crane Cert ✅
- Harassment Training ✅
- Other certs ✅

**Only MEC Excluded**: Medical Examiner's Certificate (MEC Expiration)

---

### 2. Manage Certs Button - Relocated in Quick Actions

**Problem**: The "Manage Certs" button was in the "As Needed" section, separate from the main workflow steps.

**Solution**: Moved "Manage Certs" button to be a sub-action under Step 1 "Generate All Reports", alongside "Import Crew Makeup".

**What Changed**:
- File: `src/QuickActions.html`
- **Added** to Step 1 sub-actions (line ~68):
  ```html
  <button class="quick-btn sub-btn" onclick="...">📜 Manage Certs</button>
  ```
- **Removed** from "As Needed" section (previously line ~106)

**New Layout**:
```
🧤 Workflow Steps
┌─────────────────────────────────────┐
│ 1️⃣ Generate All Reports             │
│    └─ 👷 Import Crew Makeup          │
│    └─ 📜 Manage Certs                │ ← Moved here
├─────────────────────────────────────┤
│ 2️⃣ Create Smart Schedule            │
│    └─ 📅 Schedule                    │
├─────────────────────────────────────┤
│ 3️⃣ Save to History                  │
├─────────────────────────────────────┤
│ 4️⃣ Create Backup                    │
└─────────────────────────────────────┘

As Needed
  👷 Crew Visit Config
  📚 Training Config
  📋 Training Tracking
  (📜 Manage Certs removed from here)
```

**Rationale**: Cert management is part of the data review/update process that happens with report generation, so it makes more sense to group it with Step 1.

---

## Deployment

✅ **Deployed**: January 27, 2026 via `.\push.bat`

**Files Modified**:
1. `src/ToDoSchedule.html` - MEC cert button logic
2. `src/QuickActions.html` - Manage Certs relocation

---

## Testing Steps

### Test 1: MEC Cert Button Visibility
1. Open Schedule dialog with MEC Expiration tasks
2. Verify MEC certs show chat icon (Stage 1: Send notification)
3. Click to send notification
4. **Verify**: Stage 2 button (Send class schedule) does NOT appear for MEC certs
5. **Compare**: Other cert types (CPR, 1st Aid) should still show both buttons

### Test 2: Manage Certs Button Location
1. Open Quick Actions sidebar
2. **Verify**: "📜 Manage Certs" button appears under Step 1 "Generate All Reports"
3. **Verify**: Button is styled as a sub-action (smaller, indented)
4. **Verify**: Button is alongside "👷 Import Crew Makeup"
5. **Verify**: "As Needed" section no longer contains Manage Certs
6. Click button to confirm it opens cert management dialog

---

## Code References

### MEC Cert Category Detection
Function: `getCertCategory(task)` in `ToDoSchedule.html` (lines 2507-2537)

```javascript
function getCertCategory(task) {
  var itemType = (task.itemType || task.certType || '').toLowerCase();
  
  // MEC (Medical Examiner's Certificate)
  if (itemType.indexOf('mec') !== -1 || 
      itemType.indexOf('medical exam') !== -1 || 
      itemType.indexOf('dot physical') !== -1) {
    return 'mec';
  }
  
  // ... other cert types ...
}
```

### Modified Action Button Logic
Location: `ToDoSchedule.html` lines 1522-1538

```javascript
// Check if this is a cert task with a phone number
var isCertWithPhone = isCertTask(task) && hasPhoneNumber(task);
var certCategory = getCertCategory(task);
var isMECCert = certCategory === 'mec';

if (isCertWithPhone) {
  // Stage 1: Send notification (all certs)
  html += '<button class="btn ... openNotifyModal(...) ...>';
  
  // Stage 2: Send class schedule (NOT for MEC certs)
  if (isTaskNotified(task) && !isMECCert) {
    html += '<button class="btn ... openScheduledModal(...) ...>';
  }
}
```

---

## Related Documentation
- See `FIX_CRANE_CERT_VISIBILITY.md` for related cert visibility fixes
- See `.github/copilot-instructions.md` for feature completion log
