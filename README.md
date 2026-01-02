# Glove Manager – Rubber Glove & Sleeve Inventory System

## Project Purpose
The Glove Manager is a Google Sheets-based inventory management and tracking system for rubber gloves and sleeves used by electrical workers. It is designed to centralize, automate, and streamline PPE inventory, assignment workflows, compliance, and reporting.

- **Platform:** Google Sheets (with custom scripts and automation)
- **User/Admin:** Sole user and administrator
- **Deadlines:** None (work at your own pace)
- **Cost Tracking/Ordering:** Deferred to final phase

---

## 📚 Documentation

### Key Reference Documents

| Document | Description |
|----------|-------------|
| [Workflow & Sheet Expectations](docs/Workflow_and_Sheet_Expectations.md) | **Primary reference** - Complete specification of all sheet structures, cell interactions, swap stages, and change out date rules |
| [Old Versions/Last_Good.gs](Old%20Versions/Last_Good.gs) | **Reference file** - Always compare against this before approving code changes |

### Function Documentation

Detailed documentation for individual functions is available in the `docs/functions/` folder.

---

## Core Google Sheet Tabs & Functions

### 1. To-Do List
- **Purpose:** Consolidated task list generated from Glove Swaps, Sleeve Swaps, and Reclaims for weekly planning.
- **Columns:** Done (checkbox), Priority, Task Type, Employee, Location, Current Item #, Pick List #, Item Type, Class, Due Date, Days Left, Status, Notes
- **Features:** Grouped by location, color-coded priorities, preserves checkmarks between regenerations

### 2. Employees
- **Purpose:** Stores all employee information, including names, locations, and glove/sleeve size preferences. Source for assignment and swap logic.
- **Columns:** Name, Class, Location, Job Number, Phone Number, Notification Emails, MP Email, Email Address, Glove Size, Sleeve Size, Hire Date, Last Day, Last Day Reason
- **Last Day Reason:** Dropdown with Quit, Fired, Laid Off options

### 3. Employee History
- **Purpose:** Tracks the complete lifecycle of employees - hire dates, location/job changes, and terminations.
- **Columns:** Date, Employee Name, Event Type, Location, Job Number, Hire Date, Last Day, Last Day Reason, Notes
- **Event Types:** Current State, Location Change, Job Number Change, Location & Job # Change, Terminated

### 4. Gloves
- **Purpose:** Tracks the entire glove inventory, including item numbers, sizes, classes, current status, assignment, and change-out dates.
- **Columns:** Item Number, Size, Class, Test Date, Date Assigned, Location, Status, Assigned To, Change Out Date, Picked For, Notes

### 5. Glove Swaps
- **Purpose:** Auto-generated report showing gloves due for swap soon, grouped by location and class.
- **Columns:** Employee, Item Number, Size, Date Assigned, Change Out Date, Days Left, Pick List, Status, Picked (checkbox), Date Changed, (hidden workflow columns)

### 6. Sleeves
- **Purpose:** Tracks the entire sleeve inventory, similar to the Gloves tab, but for sleeves.
- **Columns:** Item Number, Size, Class, Test Date, Date Assigned, Location, Status, Assigned To, Change Out Date, Picked For, Notes

### 7. Sleeve Swaps
- **Purpose:** Auto-generated report for sleeve swaps, similar to Glove Swaps.
- **Columns:** Employee, Item Number, Size, Date Assigned, Change Out Date, Days Left, Pick List, Status, Picked (checkbox), Date Changed, (hidden workflow columns)

### 8. Reclaims
- **Purpose:** Manages and tracks items needing reclaim or replacement based on location approval rules.
- **Tables:** Previous Employee Reclaims, Approved Class 3 Locations, Class 3 Reclaims (Need Downgrade), Class 2 Reclaims (Need Upgrade), Lost Items - Need to Locate
- **Features:** Auto Pick List for replacement items, integrated with Purchase Needs

### 9. Purchase Needs
- **Purpose:** Lists items that need to be purchased, based on inventory and upcoming needs.
- **Sources:** Glove Swaps, Sleeve Swaps, Reclaims (items with "Need to Purchase" status)
- **Tables:** Need to Order, Ready For Delivery, In Testing, Size Up Assignments

### 10. Inventory Reports
- **Purpose:** Provides a summary and breakdown of inventory status, including charts and statistics.
- **Structure:** Tables and charts showing counts by status, class, location, and trends over time.

### 11. Gloves History & Sleeves History
- **Purpose:** Maintains a complete audit trail of all inventory changes, assignments, swaps, and edits for gloves and sleeves separately.
- **Columns:** Date Assigned, Item #, Size, Class, Location, Assigned To

### 12. Item History Lookup
- **Purpose:** Search and view the complete history of any individual item.
- **Features:** Enter an item number to see all assignment changes over time

---

## 📱 Mobile Dashboard (HTML)

A mobile-friendly HTML dashboard is being developed to provide real-time, interactive views of your inventory and reports. This dashboard will be accessible from any device and can be customized to show the most relevant metrics for your workflow.

### Features
- Real-time summary of inventory status (Gloves, Sleeves, Assignments, Lost, Failed, etc.)
- Interactive charts and tables (bar, pie, etc.)
- Mobile-first responsive design
- Easy sharing and future multi-user support

### How to Use
1. **Via Apps Script Sidebar:** In Google Sheets, go to Glove Manager > 📱 Open Dashboard
2. **Via Web App:** Deploy as Web App (see deployment instructions below)
3. The dashboard auto-refreshes every 5 minutes

### Deployment Instructions (Apps Script Web App)
1. Open Apps Script Editor (Extensions > Apps Script)
2. Click Deploy > New deployment
3. Select "Web app" as type
4. Execute as: "Me"
5. Who has access: "Anyone" (or "Anyone with Google Account" for auth)
6. Click Deploy and copy the URL
7. Open the URL in any browser or mobile device

### Customization
- You can add or remove metrics as needed.
- The dashboard can be extended with additional charts, filters, or export options.

### Dashboard Roadmap
- [x] ✅ Create `Dashboard.html` with responsive template
- [x] ✅ Add 5-minute auto-refresh timer
- [x] ✅ Integrate with Google Sheets data (Apps Script `getDashboardData()`)
- [x] ✅ Add summary cards, charts, and tables
- [x] ✅ Add Swaps, Inventory, and Reclaims tabs
- [x] ✅ Host via Apps Script HtmlService
- [ ] ⬜ Deploy as Web App
- [ ] ⬜ Add Google OAuth authentication (Phase 4)
- [ ] ⬜ Document customization options

### Hosting Options Comparison

| Feature | GitHub Pages | Firebase Hosting | Apps Script HtmlService |
|---------|-------------|------------------|------------------------|
| **Cost** | Free | Free (limits) | Free |
| **Setup** | Easy (git) | Moderate (CLI) | Easy (built-in) |
| **Custom Domain** | ✅ Yes | ✅ Yes | ❌ No |
| **HTTPS** | ✅ Auto | ✅ Auto | ✅ Auto |
| **Google Auth** | Manual | ✅ Firebase Auth | ✅ Built-in |
| **Speed** | Fast CDN | Fast CDN | Slower |
| **Offline/PWA** | ✅ Yes | ✅ Yes | ❌ No |
| **Sheets Access** | Via API | Via API | ✅ Native |
| **Best For** | Static sites | Full apps | Sheets integration |

**Current Choice:** Apps Script HtmlService (simplest Google Sheets integration)

---

## Roadmap & Phases

### Setup & Tooling
- [x] ✅ npm init -y
- [x] ✅ npm install eslint --save-dev
- [x] ✅ npx eslint --init
- [x] ✅ npm install -g @google/clasp
- [x] ✅ clasp login
- [x] ✅ clasp create --type sheets --title "Rubber Tracker" --rootDir ./src
- [x] ✅ Move .gs files to /src
- [x] ✅ npx eslint src/Code.gs
- [x] ✅ clasp push
- [x] ✅ (Optional) npm install --save-dev gas-tester
- [x] ✅ Set up WebStorm to run ESLint automatically on save
- [x] ✅ Set up manual testing workflow using Apps Script online editor
- [x] ✅ Set up test runner for Apps Script (manual, via TestRunner.gs)
- [x] ✅ Organize code into src/ and Old Versions folders
- [x] ✅ Add checkboxes and green checkmarks to roadmap
- [x] ✅ Add HTML dashboard to replace Looker Studio/Data Studio

### Phase 1: Foundation & Core Reports
- [x] ✅ Build a custom menu system in Google Sheets
- [x] ✅ Implement Glove Swaps and Sleeve Swaps reports (upcoming swaps by location)
- [x] ✅ Add Purchase Needs report (shows what to buy, with summary)
- [x] ✅ Add Inventory Reports (status breakdown with charts)
- [x] ✅ Support for Classes 0, 2, 3 for gloves and 2, 3 for sleeves
- [x] ✅ Track upsizing when employees need different sizes
- [x] ✅ Skip unused sizes (11, 12, X-Large) if not needed
- [x] ✅ Set up ESLint and code linting for Apps Script
- [x] ✅ Set up clasp for Apps Script version control
- [x] ✅ Set up test runner for Apps Script (manual, via TestRunner.gs)
- [x] ✅ Organize code into src/ and Old Versions folders

### Phase 2: Two-Stage Swaps & Audit Trail
- [x] ✅ Implement auto-updates with a two-stage swap workflow:
  - [x] ✅ Stage 1: Checkbox triggers "Ready For Delivery" status
  - [x] ✅ Stage 2: Checkbox + Date completes the full swap
- [x] ✅ Add a History Tab for a complete audit trail:
  - [x] ✅ Track all changes to gloves and sleeves
  - [x] ✅ Two tables: Gloves and Sleeves
  - [x] ✅ Columns: Item #, Date Assigned, Date Changed, Action, Source
- [x] ✅ Split History into separate Gloves and Sleeves History tabs
- [x] ✅ Add Reclaims sheet and logic for Previous Employee/Class 2/Class 3 reclaims
- [x] ✅ Ready for HTML Mobile Dashboard (replaces Data Studio/Looker Studio)
- [ ] ⬜️ Per-item drilldown and filtering

### Phase 3: Core Enhancements
- [ ] ⬜️ Add automated email reminders
- [x] ✅ Create a mobile-friendly view (HTML dashboard via Apps Script)
- [ ] ⬜️ Improve Purchase Needs UI
- [x] ✅ Add upsized notes fix
- [x] ✅ Implement manual override functionality
- [x] ✅ Deploy dashboard via Apps Script HtmlService

### Phase 4: Enhanced Features & Mobile Improvements
- [ ] ⬜️ Push notifications for the mobile app
- [ ] ⬜️ Role-based access/user permissions (granular admin/user controls)
- [ ] ⬜️ Google OAuth authentication for dashboard
- [x] ✅ Data visualization dashboards (real-time, interactive, HTML-based)
- [ ] ⬜️ Inventory aging reports (identify oldest items needing replacement/test)
- [ ] ⬜️ Global search/filter bar (web/mobile)
- [ ] ⬜️ Offline editing and sync with Google Sheets
- [ ] ⬜️ Update the mobile app
- [ ] ⬜️ Additional features:
  - [ ] ⬜️ SMS notifications for critical items
  - [ ] ⬜️ Customizable alert thresholds

---

## Next Steps
- Deploy dashboard as Apps Script Web App
- Test dashboard on mobile devices
- Tweak dashboard features and layout as needed
- Add Google OAuth authentication (Phase 4)

---

*This README serves as a living document for your evolving project vision and roadmap.*
