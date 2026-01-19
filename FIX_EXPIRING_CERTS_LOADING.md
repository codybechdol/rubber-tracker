# 🔧 FIX: Expiring Certs Not Loading in To Do Config

## The Problem
When you click the "Expiring Certs" tab in To Do Config, it shows "Loading employee certifications..." but never loads.

## The Cause
The **Expiring Certs sheet hasn't been populated yet**. The To Do Config is trying to read data from a sheet that's either empty or doesn't exist.

## The Solution (Easy Way!)

### Use the "Manage Certs" Button

1. In your Google Sheet, open **Quick Actions** (it should auto-open on the right side)
2. Scroll to the **"As Needed"** section
3. Click **"📜 Manage Certs"**
4. In the dialog that opens, click **"🔍 Scan for Expiring Certs"**
5. Wait 10-30 seconds - you'll see a popup saying "✅ Expiring Certs Updated"
6. Done!

Now when you open To Do Config → Expiring Certs tab, the data will load!

---

## Alternative Method (Console)

If you prefer using the browser console:

1. In your Google Sheet, press **F12** (or right-click → Inspect) to open Developer Tools
2. Go to the **Console** tab
3. Paste this command and press Enter:
```javascript
google.script.run.setupExpiringCertsSheet()
```
4. Wait 10-30 seconds for it to complete
5. You should see a popup saying "✅ Expiring Certs Updated"

---

## What to Do After Running Scan

1. Close and reopen the To Do Config dialog
2. Click the "Expiring Certs" tab
3. Now it should load the data!


## About "Non-Expiring" Items

You mentioned seeing "Non-Expiring" in the Item Type column. This is normal! The system shows:
- **Glove** - for glove certifications
- **Sleeve** - for sleeve certifications  
- **(Non-Expiring)** label next to cert types that don't expire

The Item Type is the actual certification type (like "DL", "MEC Expiration", "1st Aid", etc.)

## What Happens After Running Setup

The function will:
1. Scan your **Gloves** sheet for items with expiring certs
2. Scan your **Sleeves** sheet for items with expiring certs
3. Create/update the **Expiring Certs** sheet with all items expiring within 60 days
4. Color-code them by urgency:
   - 🔴 **EXPIRED** - Already expired
   - 🟠 **CRITICAL** - Expiring within 7 days
   - 🟡 **WARNING** - Expiring within 30 days
   - 🔵 **UPCOMING** - Expiring within 60 days

## Next Steps

After setting up Expiring Certs, you can:
- ✅ Configure which cert types create To Do tasks
- ✅ View certification status by employee
- ✅ See summary statistics
- ✅ Auto-generate To Do tasks for expiring items

---

**STATUS**: Fix deployed. Just need to run the setup function once!
