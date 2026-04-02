#!/usr/bin/env python3
"""Fix remaining 7 FFFD in Code.gs"""

filepath = r'C:\Users\codyb\WebstormProjects\Rubber Tracker\src\Code.gs'

with open(filepath, 'rb') as f:
    raw = f.read()

count = 0

# L6138: 'FFFD C2_8F FFFD Setup Auto December' → '🕐 Setup Auto December'
# 🕐 = U+1F550 = F0 9F 95 90 (hmm but C2 8F = byte 8F not 90...)
# Using the emoji from original fix-emoji.py: 🕐 U+1F559 = F0 9F 95 99
# Actually the corrupt bytes show C2 8F so original 3rd byte was 8F → F0 9F 8F xx range
# But user's fix says 🕐. Let me just use that.
old = b'\xef\xbf\xbd\xc2\x8f\xef\xbf\xbd Setup Auto'
new = b'\xf0\x9f\x95\x90 Setup Auto'  # 🕐 U+1F550
if old in raw:
    raw = raw.replace(old, new)
    count += 1
    print("Fixed: 🕐 Setup Auto December")

# L6142: 'FFFD C2_90 FFFD Debug Training Config' → '🔍 Debug Training Config'
# C2 90 = byte 90. Original fix says 🔍 U+1F50D = F0 9F 94 8D
old2 = b'\xef\xbf\xbd\xc2\x90\xef\xbf\xbd Debug Training'
new2 = b'\xf0\x9f\x94\x8d Debug Training'  # 🔍
if old2 in raw:
    raw = raw.replace(old2, new2)
    count += 1
    print("Fixed: 🔍 Debug Training Config")

# L13484: '→ FFFD C2_8F FFFD Task Metadata Health' (in a comment)
# Should be 🏥 Task Metadata Health Check
old3 = b'\xe2\x86\x92 \xef\xbf\xbd\xc2\x8f\xef\xbf\xbd Task Metadata'
new3 = b'\xe2\x86\x92 \xf0\x9f\x8f\xa5 Task Metadata'  # → 🏥
if old3 in raw:
    raw = raw.replace(old3, new3)
    count += 1
    print("Fixed: → 🏥 Task Metadata (comment)")

# L18359: replace('FFFD C2_8D', '') - this is replace('📍', '')
# 📍 = U+1F4CD = F0 9F 93 8D
old4 = b"replace('\xef\xbf\xbd\xc2\x8d'"
new4 = b"replace('\xf0\x9f\x93\x8d'"  # replace('📍'
if old4 in raw:
    raw = raw.replace(old4, new4)
    count += 1
    print("Fixed: replace('📍', ...)")

with open(filepath, 'wb') as f:
    f.write(raw)

fffd_after = raw.count(b'\xef\xbf\xbd')
print(f"\nFixes applied: {count}")
print(f"Remaining FFFD: {fffd_after}")

if fffd_after > 0:
    text = raw.decode('utf-8', errors='replace')
    lines = text.split('\n')
    for i, line in enumerate(lines):
        if '\ufffd' in line:
            print(f"  L{i+1}: {line.strip()[:100]}")

