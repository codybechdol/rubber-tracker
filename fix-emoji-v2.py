#!/usr/bin/env python3
"""
Comprehensive fix for ALL corrupted emoji in Code.gs.
Replaces at byte level for precision, then verifies at text level.
"""

filepath = r'C:\Users\codyb\WebstormProjects\Rubber Tracker\src\Code.gs'

with open(filepath, 'rb') as f:
    raw = f.read()

print(f"File size: {len(raw)} bytes")

# Count FFFD occurrences before
fffd_before = raw.count(b'\xef\xbf\xbd')
print(f"FFFD sequences before: {fffd_before}")

# ========================================================
# BYTE-LEVEL REPLACEMENTS
# Pattern: corrupted bytes → correct bytes
# ========================================================
byte_replacements = []

# --- VS16 (Variation Selector 16) ---
# EF B8 8F got corrupted to EF BF BD C2 8F
# These always appear AFTER a base emoji character
# Fix: after known base emoji, replace corrupted VS16
vs16_bases = [
    b'\xe2\x9a\xa0',  # ⚠ U+26A0
    b'\xe2\x84\xb9',  # ℹ U+2139
    b'\xe2\x99\xbb',  # ♻ U+267B (not seen but just in case)
]
for base in vs16_bases:
    byte_replacements.append((
        base + b'\xef\xbf\xbd\xc2\x8f',
        base + b'\xef\xb8\x8f'
    ))

# --- Individual 4-byte emoji corrupted to FFFD + C2 xx ---
# Pattern: F0 9F xx yy → EF BF BD C2 yy (middle bytes lost)
# But some have FFFD + C2xx + FFFD patterns

# 📝 U+1F4DD = F0 9F 93 9D → EF BF BD C2 9D
# Used in: Add Job Name, Backfill Job Names, Daily Accomplishments, Create PO, etc.
# Context: always at start of menu label like ('📝 Add Job Name...
byte_replacements.append((b'\xef\xbf\xbd\xc2\x9d ', b'\xf0\x9f\x93\x9d '))  # 📝 + space

# 🔍 U+1F50D = F0 9F 94 8D → EF BF BD C2 8D
byte_replacements.append((b'\xef\xbf\xbd\xc2\x8d ', b'\xf0\x9f\x94\x8d '))  # 🔍 + space

# 🕐 U+1F550 = F0 9F 95 90 → EF BF BD C2 90
byte_replacements.append((b'\xef\xbf\xbd\xc2\x90 ', b'\xf0\x9f\x95\x90 '))  # 🕐 + space

# 📍 U+1F4CD = F0 9F 93 8D → same as 🔍 pattern (C2 8D)
# These are differentiated by context - 📍 used for locations, 🔍 for diagnose/debug
# Since the byte pattern is identical (both end in 8D), we handle by FULL string context below

# ❌ U+274C = E2 9D 8C → EF BF BD C2 9D EF BF BD
byte_replacements.append((b'\xef\xbf\xbd\xc2\x9d\xef\xbf\xbd', b'\xe2\x9d\x8c'))  # ❌

# 🏥 U+1F3E5 = F0 9F 8F A5 → EF BF BD C2 8F EF BF BD
# But wait, C2 8F could also be VS16 remnant. Need full context.
# "🏥 Generate AED": 27 ef bf bd c2 8f ef bf bd 20 47 65 6e
byte_replacements.append((
    b"'\xef\xbf\xbd\xc2\x8f\xef\xbf\xbd Generate AED",
    b"'\xf0\x9f\x8f\xa5 Generate AED"
))
byte_replacements.append((
    b"'\xef\xbf\xbd\xc2\x8f\xef\xbf\xbd Task Metadata Health",
    b"'\xf0\x9f\x8f\xa5 Task Metadata Health"
))
byte_replacements.append((
    b"'\xef\xbf\xbd\xc2\x8f\xef\xbf\xbd View AED",
    b"'\xf0\x9f\x8f\xa5 View AED"
))
byte_replacements.append((
    b"'\xef\xbf\xbd\xc2\x8f\xef\xbf\xbd Setup AED",
    b"'\xf0\x9f\x8f\xa5 Setup AED"
))
byte_replacements.append((
    b"'\xef\xbf\xbd\xc2\x8f\xef\xbf\xbd AED Pad",
    b"'\xf0\x9f\x8f\xa5 AED Pad"
))
byte_replacements.append((
    b"'\xef\xbf\xbd\xc2\x8f\xef\xbf\xbd AED:",
    b"'\xf0\x9f\x8f\xa5 AED:"
))

# 🏗️ U+1F3D7 U+FE0F = F0 9F 8F 97 EF B8 8F
# Corrupted: EF BF BD C2 8F EF BF BD EF BF BD C2 8F
byte_replacements.append((
    b'\xef\xbf\xbd\xc2\x8f\xef\xbf\xbd\xef\xbf\xbd\xc2\x8f Sheets Setup',
    b'\xf0\x9f\x8f\x97\xef\xb8\x8f Sheets Setup'
))
byte_replacements.append((
    b'\xef\xbf\xbd\xc2\x8f\xef\xbf\xbd\xef\xbf\xbd\xc2\x8f Build Sheets',
    b'\xf0\x9f\x8f\x97\xef\xb8\x8f Build Sheets'
))
byte_replacements.append((
    b'\xef\xbf\xbd\xc2\x8f\xef\xbf\xbd\xef\xbf\xbd\xc2\x8f Already',
    b'\xf0\x9f\x8f\x97\xef\xb8\x8f Already'
))
byte_replacements.append((
    b'\xef\xbf\xbd\xc2\x8f\xef\xbf\xbd\xef\xbf\xbd\xc2\x8f Completed',
    b'\xf0\x9f\x8f\x97\xef\xb8\x8f Completed'
))

# 👁️ U+1F441 U+FE0F = F0 9F 91 81 EF B8 8F
# Corrupted: EF BF BD C2 81 EF BF BD C2 8F (from analysis: \x81\ufffd\x8f)
byte_replacements.append((
    b"'\xef\xbf\xbd\xc2\x81\xef\xbf\xbd\xc2\x8f Preview My Report",
    b"'\xf0\x9f\x91\x81\xef\xb8\x8f Preview My Report"
))

# --- Specific full-string context fixes for ambiguous patterns ---

# 📍 for location-related items (same byte pattern as 🔍 but different emoji)
for loc_text in [b' Setup Locations Sheet', b' View Locations']:
    byte_replacements.append((
        b'\xef\xbf\xbd\xc2\x8d' + loc_text,
        b'\xf0\x9f\x93\x8d' + loc_text  # 📍
    ))

# 🔍 for diagnose/debug items
for diag_text in [b" Debug')", b' Diagnose', b' Scan for Bad', b' ITEM HISTORY',
                   b' Auto-Updated', b' Lookup', b' Sources', b' Lost',
                   b' Class Location']:
    byte_replacements.append((
        b'\xef\xbf\xbd\xc2\x8d' + diag_text,
        b'\xf0\x9f\x94\x8d' + diag_text  # 🔍
    ))

# 📝 for memo/note items
for memo_text in [b' Add Job Name', b' Backfill Job', b' Daily Accomp',
                   b' Create Purchase', b' Update Location', b' Archived to',
                   b' Set Up Weekly', b' To-Do List']:
    byte_replacements.append((
        b'\xef\xbf\xbd\xc2\x9d' + memo_text,
        b'\xf0\x9f\x93\x9d' + memo_text  # 📝
    ))

# 🕐 for time-related
byte_replacements.append((
    b'\xef\xbf\xbd\xc2\x8f\xef\xbf\xbd Step',
    b'\xf0\x9f\x8f\xa5 Step'   # Hmm, these are toast messages
))
# Actually looking at context: '💾 Step 1/2' and '💾 Step 2/2' - these should be 💾
byte_replacements.append((
    b"'\xef\xbf\xbd\xc2\x8f\xef\xbf\xbd Step 1/2",
    b"'\xf0\x9f\x92\xbe Step 1/2"   # 💾
))
byte_replacements.append((
    b"'\xef\xbf\xbd\xc2\x8f\xef\xbf\xbd Step 2/2",
    b"'\xf0\x9f\x92\xbe Step 2/2"   # 💾
))
byte_replacements.append((
    b"'\xef\xbf\xbd\xc2\x8f\xef\xbf\xbd Backup in",
    b"'\xf0\x9f\x92\xbe Backup in"   # 💾
))
byte_replacements.append((
    b"'\xef\xbf\xbd\xc2\x8f\xef\xbf\xbd Please wait",
    b"'\xf0\x9f\x92\xbe Please wait"   # 💾
))
byte_replacements.append((
    b"'\xef\xbf\xbd\xc2\x8f\xef\xbf\xbd Generating T",
    b"'\xf0\x9f\x8f\xa5 Generating T"   # 🏥... no. Context: 'Generating Task Metadata'
))
# Actually this is the hourglass or similar. Let me check what 📊 or 🎯 looks like
# 🎯 = F0 9F 8E AF. The corrupted C2 8F part suggests byte 8F which is from 🏥(F0 9F 8F A5) or others
# But context is "Generating Task Metadata" → probably was 🔄 or 📊
# 📊 = F0 9F 93 8A → EF BF BD C2 8A... no
# Let's just use 🎯 which is the menu label: '🎯 Generating Task Metadata'
# 🎯 = F0 9F 8E AF → corrupted would be EF BF BD C2 8F EF BF BD? No, AF→C2 AF
# Actually this one is tricky. Looking at hex: ef bf bd c2 8f ef bf bd
# Could be any emoji with UTF-8 bytes where 3rd byte is 8F. Like:
# F0 9F 8F xx → U+1F3Fx (🏥=A5, 🏗=97, etc)
# Since context is "Generating Task", probably was a loading/gear emoji
# Let me just set it to ⏳
byte_replacements.pop()  # Remove the wrong one
byte_replacements.append((
    b"'\xef\xbf\xbd\xc2\x8f\xef\xbf\xbd Generating Task",
    b"'\xe2\x8f\xb3 Generating Task"   # ⏳
))

# ❌ Error patterns
byte_replacements.append((
    b"'\xe2\x9d\x8c\xe2\x9d\x8c Error'",
    b"'\xe2\x9d\x8c\xe2\x9d\x8c Error'"  # Already correct if ❌ survived
))

# Need to Purchase 🛒❌ or ❌🛒
# Context: 'Need to Purchase ❌🛒'
# Hex: Need to Purchase EF BF BD C2 9D EF BF BD
# = Need to Purchase + ❌ (corrupted)
# Let's look at what was originally there for swap statuses

# Status emoji patterns for swap sheets:
# 'Need to Purchase 🛒❌' → the screenshot shows diamond-question marks here too
# Actually from the screenshot: "Need to Purchase ◆❌◆"
# The original statuses use: 'Need to Purchase 🛒❌' or similar

# Let me handle the status strings specifically:
byte_replacements.append((
    b"'Need to Purchase \xe2\x9d\x8c\xf0\x9f\x9b\x92'",  # If it was already correct
    b"'Need to Purchase \xe2\x9d\x8c\xf0\x9f\x9b\x92'"
))

# 'In Testing 🔬' → 🔬 = F0 9F 94 AC
# From hex: 'In Testing EF BF BD C2 8F EF BF BD'
byte_replacements.append((
    b"In Testing \xef\xbf\xbd\xc2\x8f\xef\xbf\xbd'",
    b"In Testing \xf0\x9f\x94\xac'"  # 🔬
))
byte_replacements.append((
    b"In Testing \xef\xbf\xbd\xc2\x8f\xef\xbf\xbd (Manual)",
    b"In Testing \xf0\x9f\x94\xac (Manual)"  # 🔬
))

# 'OVERDUE ❌🔴' - OVERDUE + ❌ + 🔴
# Hex: OVERDUE EF BF BD C2 9D EF BF BD
byte_replacements.append((
    b"OVERDUE \xef\xbf\xbd\xc2\x9d\xef\xbf\xbd'",
    b"OVERDUE \xe2\x9d\x8c\xf0\x9f\x94\xb4'"  # ❌🔴
))

# Keycap numbers: 1️⃣ 2️⃣ 3️⃣ 4️⃣
# 1️⃣ = 31 EF B8 8F E2 83 A3
# Corrupted: 31 EF BF BD C2 8F E2 83 A3
for digit in [b'1', b'2', b'3', b'4']:
    byte_replacements.append((
        digit + b'\xef\xbf\xbd\xc2\x8f\xe2\x83\xa3',
        digit + b'\xef\xb8\x8f\xe2\x83\xa3'  # digit + VS16 + combining enclosing keycap
    ))

# 'Item Not Found 🔍❌ (Manual)'
byte_replacements.append((
    b"Item Not Found \xef\xbf\xbd\xc2\x9d\xef\xbf\xbd (Manual)",
    b"Item Not Found \xf0\x9f\x94\x8d\xe2\x9d\x8c (Manual)"  # 🔍❌
))

# From swap statuses: '.indexOf' checks
# These are pattern-matching strings, need to preserve exact original
# The '.indexOf('🔍')' checks - corrupted 🔍
byte_replacements.append((
    b".indexOf('\xef\xbf\xbd\xc2\x8d')",
    b".indexOf('\xf0\x9f\x94\x8d')"  # 🔍
))

# 'In Stock (Size Up) ⚠️' - already has ⚠ fixed by VS16 fix above

# The IN TESTING section header emoji
byte_replacements.append((
    b"'\xef\xbf\xbd\xc2\x8f\xef\xbf\xbd\xe2\x9a\xa0",
    b"'\xf0\x9f\x94\xac\xe2\x9a\xa0"  # 🔬⚠
))

# Archive Failed ❌
byte_replacements.append((
    b"'\xe2\x9d\x8c Archive Failed",
    b"'\xe2\x9d\x8c Archive Failed"  # Already OK if ❌ survived
))

# 📦⚠️ READY FOR DELIVERY
byte_replacements.append((
    b"\xf0\x9f\x93\xa6\xe2\x9a\xa0\xef\xbf\xbd\xc2\x8f READY",
    b"\xf0\x9f\x93\xa6\xe2\x9a\xa0\xef\xb8\x8f READY"  # 📦⚠️
))

# ========================================================
# Apply all byte-level replacements
# ========================================================
count = 0
for old, new in byte_replacements:
    if old in raw:
        occurrences = raw.count(old)
        raw = raw.replace(old, new)
        count += occurrences
        # Show what was fixed
        try:
            label = new.decode('utf-8')[:35]
        except:
            label = repr(new)[:35]
        print(f"Fixed ({occurrences}x): {label}")

with open(filepath, 'wb') as f:
    f.write(raw)

fffd_after = raw.count(b'\xef\xbf\xbd')
print(f"\nTotal pattern fixes: {count}")
print(f"FFFD before: {fffd_before} → after: {fffd_after}")
print(f"Remaining FFFD: {fffd_after}")

# Show remaining corruptions
if fffd_after > 0:
    text = raw.decode('utf-8', errors='replace')
    lines = text.split('\n')
    print(f"\nRemaining corrupted lines:")
    for i, line in enumerate(lines):
        if '\ufffd' in line:
            print(f"  L{i+1}: {line.strip()[:80]}")

