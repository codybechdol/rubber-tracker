# Employee History Tracking - Complete Guide

## Overview

The Employee History system now tracks **all changes** to employee data, not just terminations and location changes.

## What Gets Tracked

### Automatically Tracked Changes:
- ✅ **Location changes** - When an employee moves to a different work location
- ✅ **Job Number changes** - When an employee's job number is updated
- ✅ **Phone Number changes** - When phone number is added or updated
- ✅ **Email Address changes** - When email is added or updated
- ✅ **Glove Size changes** - When glove size preference changes
- ✅ **Sleeve Size changes** - When sleeve size preference changes
- ✅ **New Employees** - When a new employee is added to the system
- ✅ **Terminations** - When Last Day is entered (via trigger)
- ✅ **Rehires** - When Rehire Date is added to a terminated employee

## Employee History Columns (A-N)

| Column | Header | Description |
|--------|--------|-------------|
| A | Date | Date of the event/change |
| B | Employee Name | Employee's name |
| C | Event Type | Type of change (see below) |
| D | Location | Current location at time of event |
| E | Job Number | Current job number at time of event |
| F | Hire Date | Original hire date |
| G | Last Day | Employee's last day (terminations only) |
| H | Last Day Reason | Quit/Fired/Laid Off |
| I | Rehire Date | Date employee was rehired |
| J | Notes | Details about the change |
| K | Phone Number | Employee's phone number |
| L | Email Address | Employee's email address |
| M | Glove Size | Employee's glove size |
| N | Sleeve Size | Employee's sleeve size |

## Event Types

| Event Type | When It's Recorded |
|------------|-------------------|
| **New Employee** | Employee added to system for the first time |
| **Terminated** | Last Day entered on Employees sheet |
| **Rehired** | Rehire Date entered on Employee History |
| **Location Change** | Location field changed |
| **Job # Change** | Job Number field changed |
| **Phone Change** | Phone Number field changed |
| **Email Change** | Email Address field changed |
| **Glove Size Change** | Glove Size field changed |
| **Sleeve Size Change** | Sleeve Size field changed |
| **Multiple Changes** | 3+ fields changed at once |
| **Location & Job # Change** | Both location and job number changed |

## How to Refresh Employee History

Run **Save Current State to History** to capture all current employee data:

1. Click **Glove Manager** (in the menu bar)
2. Select **📋 History**
3. Click **Save Current State to History**

This will:
- Add new employees that aren't in history yet
- Record any changes since the last save
- Capture current phone, email, glove size, and sleeve size for all changes

## Update Employee History Headers

If your Employee History sheet is missing the new columns (K-N), run:

1. Click **Glove Manager** (in the menu bar)
2. Select **🔧 Utilities**
3. Click **🔄 Update Employee History Headers**

This adds:
- Phone Number (Column K)
- Email Address (Column L)
- Glove Size (Column M)
- Sleeve Size (Column N)

**Note:** This only updates headers (row 2), not existing data rows.

## Automatic vs Manual Updates

### Automatic (via triggers):
- **Last Day** changes trigger immediate termination recording
- **Rehire Date** changes trigger immediate rehire recording

### Manual (via menu):
- All other changes are captured when you run **Save Current State to History**
- Run this regularly (or use **Generate All Reports** which includes it)

## Tips

1. **Before terminating an employee**, make sure their contact info is filled in
2. **Run Save History regularly** to capture all changes
3. **The Notes column** shows exactly what changed (old value → new value)
4. **Each history entry** preserves a snapshot of all employee data at that time

---

**Last Updated:** January 9, 2026

