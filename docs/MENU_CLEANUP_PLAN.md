# Menu Cleanup Plan - February 16, 2026

## Status: ✅ COMPLETE

## Current State Analysis

The Glove Manager menu has grown organically and now contains:
- 6 top-level items
- 10 submenus with 60+ individual items
- Several legacy/duplicate items
- Items that belong in Quick Actions only

## Principles

1. **Quick Actions is the primary interface** - Most daily tasks should be done there
2. **Menu is for admin/setup/one-time tasks** - Not daily workflow
3. **Remove legacy items** - They redirect anyway
4. **Consolidate related items** - Reduce submenu count

## NEW Menu Structure (IMPLEMENTED)

```
Glove Manager
├── 📱 Quick Actions (PRIMARY ENTRY POINT)
├── ───────────────
├── 📊 Reports
│   ├── 📋 Generate All Reports
│   ├── 🧤 Generate Glove Swaps
│   ├── 💪 Generate Sleeve Swaps
│   ├── 🛒 Update Purchase Needs
│   ├── ♻️ Update Reclaims Sheet
│   └── 📝 Daily Accomplishments
├── 📅 Scheduling
│   ├── 📋 Tasks & Calendar
│   ├── 🗺️ Trip Planner
│   ├── ⚙️ Schedule Config
│   ├── 📊 Task Dashboard
│   └── 🎯 Generate Task Metadata
├── 🛡️ Safety
│   ├── 📥 Process Safety Emails
│   ├── 📊 Compliance Dashboard
│   ├── 📋 View Safety Reports
│   ├── ⚙️ Configure Crew Exclusions
│   ├── 📋 Create Tasks from Issues
│   └── 🔄 Refresh Safety Sheets
├── 🛒 Purchase Orders
│   ├── 📝 Create Purchase Order
│   ├── 📋 Order History
│   └── ⚙️ Manage Vendors
├── 📧 Email Reports
│   ├── 📤 Send Report Now
│   ├── 👁️ Preview My Report
│   ├── ⚙️ Configure Email Reports
│   └── 🕐 Set Up Weekly Email
├── 📋 History
│   ├── 💾 Save Current State
│   ├── 🔍 Item History Lookup
│   └── 📂 View Full History
├── ───────────────
├── ⚙️ Setup & Admin
│   ├── 📋 Setup All Schedule Sheets
│   ├── 📋 Setup Task Metadata Sheet
│   ├── 👥 Setup Crew Visit Config
│   ├── 📚 Setup Training Config
│   ├── 📊 Setup Training Tracking
│   ├── 👥 Import Crew Makeup
│   ├── 📥 Import Data
│   ├── 💾 Create Backup Snapshot
│   └── 📂 View Backup Folder
├── 🧹 Maintenance
│   ├── 🗄️ Archive Completed Tasks
│   ├── 🏥 Task Metadata Health Check
│   ├── 🧽 Cleanup Orphaned Metadata
│   ├── 📤 Archive Previous Employees
│   ├── 🔄 Refresh Crew Visit Config
│   ├── 🔄 Refresh Training Crew Leads
│   ├── ⚡ Setup Auto Change Out Dates
│   └── 🔧 Fix All Change Out Dates
├── 🔧 Advanced (cleanup/debug functions)
└── 💾 Close & Save History
```

## Items REMOVED (Legacy/Duplicate)

| Item | Reason |
|------|--------|
| `Generate To-Do List` | Now redirects to generateTaskMetadata |
| `Clear Completed Tasks` | Now redirects to archiveOldCompletedTasks |
| `Archive Old To Do List (Legacy)` | One-time migration, already done |
| `📅 Generate Monthly Schedule` | Replaced by Task Metadata |
| `🔄 Refresh Calendar` | Handled by UI |
| `✅ Mark Visit Complete` | Done in Task List UI |
| `📝 To-Do List` submenu | Legacy, removed entirely |
| Debug menu | Moved to Advanced |

## Files Updated

1. **src/Code.gs** - Main `onOpen()` menu streamlined ✅
2. **src/10-Menu.gs** - Archived (comments only, no code) ✅
3. **src/99-MenuFix.gs** - Updated to match new structure ✅
4. **src/70-ToDoList.gs** - Archived with stub redirects ✅

## Implementation Steps

- [x] Step 1: Archive 70-ToDoList.gs (DONE)
- [x] Step 2: Update onOpen() in Code.gs with streamlined menu (DONE)
- [x] Step 3: Remove code from 10-Menu.gs (DONE)
- [x] Step 4: Update 99-MenuFix.gs backup menu (DONE)
- [x] Step 5: Deploy and test (DONE)

## Benefits

1. **Cleaner menu** - 8 main categories instead of 10+ submenus
2. **Quick Actions is prominent** - First item, clear entry point
3. **Logical grouping** - Reports, Scheduling, Safety, etc.
4. **Advanced functions hidden** - Cleanup/debug in "Advanced" submenu
5. **Legacy code archived** - Not deleted, just redirects to new functions

