#!/usr/bin/env python3
"""Fix corrupted emoji in Code.gs onOpen() menu"""
import sys

filepath = r'C:\Users\codyb\WebstormProjects\Rubber Tracker\src\Code.gs'

with open(filepath, 'r', encoding='utf-8') as f:
    content = f.read()

R = '\ufffd'  # replacement character

replacements = [
    # Two-char: emoji base + corrupted variation selector
    ('\U0001f6e1' + R, '\U0001f6e1\ufe0f'),   # 🛡️ Shield
    ('\u2699' + R, '\u2699\ufe0f'),             # ⚙️ Gear
    ('\U0001f5d3' + R, '\U0001f5d3\ufe0f'),     # 🗓️ Calendar
    ('\U0001f6e0' + R, '\U0001f6e0\ufe0f'),     # 🛠️ Wrench
    ('\U0001f5d1' + R, '\U0001f5d1\ufe0f'),     # 🗑️ Wastebasket
    ('\U0001f5c4' + R, '\U0001f5c4\ufe0f'),     # 🗄️ File cabinet
    ('\U0001f5fa' + R, '\U0001f5fa\ufe0f'),     # 🗺️ World map
    ('\u21a9' + R, '\u21a9\ufe0f'),             # ↩️ Return arrow

    # Triple replacement char (3-byte emoji completely lost)
    (R+R+R+' Sheets Setup', '\U0001f3d7\ufe0f Sheets Setup'),  # 🏗️
    (R+R+R+' Build Sheets', '\U0001f3d7\ufe0f Build Sheets'),  # 🏗️

    # Double replacement char (2-byte emoji lost)
    (R+R+' Generate AED', '\U0001f3e5 Generate AED'),           # 🏥
    (R+R+' Task Metadata Health', '\U0001f3e5 Task Metadata Health'),  # 🏥
    (R+R+' Setup Auto December', '\U0001f559 Setup Auto December'),    # 🕐
    (R+R+' Debug Training Config', '\U0001f50d Debug Training Config'), # 🔍
    (R+R+' Preview My Report', '\U0001f441\ufe0f Preview My Report'),  # 👁️
    (R+R+' View AED', '\U0001f3e5 View AED'),                   # 🏥
    (R+R+' Setup AED Sheet', '\U0001f3e5 Setup AED Sheet'),     # 🏥

    # Single replacement char (1 byte of multi-byte emoji survived elsewhere)
    (R+' Add Job Name', '\U0001f4dd Add Job Name'),              # 📝
    (R+' Backfill Job Names', '\U0001f4dd Backfill Job Names'),  # 📝
    (R+' Diagnose Compliance', '\U0001f50d Diagnose Compliance'),# 🔍
    (R+' Diagnose Gmail Search', '\U0001f50d Diagnose Gmail Search'), # 🔍
    (R+' Diagnose Missing Crews', '\U0001f50d Diagnose Missing Crews'), # 🔍
    (R+' Daily Accomplishments', '\U0001f4dd Daily Accomplishments'), # 📝
    (R+' Set Up Weekly Email', '\U0001f559 Set Up Weekly Email'), # 🕐
    (R+' Create Purchase Order', '\U0001f4dd Create Purchase Order'), # 📝
    (R+' Update Location Validation', '\U0001f4dd Update Location Validation'), # 📝
    (R+' Scan for Bad Dates', '\U0001f50d Scan for Bad Dates'),  # 🔍
    (R+' Setup Locations Sheet', '\U0001f4cd Setup Locations Sheet'), # 📍
    (R+' View Locations', '\U0001f4cd View Locations'),           # 📍
    (R+' Diagnose Auth Issues', '\U0001f50d Diagnose Auth Issues'), # 🔍
    (R+' Diagnose Employee Pick', '\U0001f50d Diagnose Employee Pick'), # 🔍
    (R+' Diagnose Crew 005', '\U0001f50d Diagnose Crew 005'),    # 🔍
    (R+' Diagnose Crew 045', '\U0001f50d Diagnose Crew 045'),    # 🔍

    # Debug submenu name: createMenu('🔍 Debug')
    ("createMenu('" + R + " Debug')", "createMenu('\U0001f50d Debug')"),
]

count = 0
for old, new in replacements:
    if old in content:
        occurrences = content.count(old)
        content = content.replace(old, new)
        count += occurrences
        print(f'Fixed ({occurrences}x): ...{new[:35]}...')

with open(filepath, 'w', encoding='utf-8') as f:
    f.write(content)

remaining = content.count(R)
print(f'\nTotal fixes: {count}')
print(f'Remaining {R} chars: {remaining}')

if remaining > 0:
    lines = content.split('\n')
    for i, line in enumerate(lines):
        if R in line:
            print(f'  Line {i+1}: {line.strip()[:80]}')

