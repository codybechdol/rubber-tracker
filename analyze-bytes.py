#!/usr/bin/env python3
"""Analyze corruption patterns in Code.gs"""

with open(r'C:\Users\codyb\WebstormProjects\Rubber Tracker\src\Code.gs', 'rb') as f:
    raw = f.read()

patterns = [
    (b'Need to Purchase ', 10),
    (b'In Testing ', 10),
    (b'OVERDUE ', 10),
    (b'Error saving', 15),
    (b'Add Job Name', 10),
    (b'AED Pad Repl', 10),
    (b'Step 1/2', 15),
    (b'Immediate:', 10),
    (b' Error\',', 15),
    (b'Diagnose Compliance', 10),
    (b'Generate AED', 10),
    (b'Build Sheets', 10),
    (b'Archived to H', 10),
    (b'Already in h', 15),
]
for pat, lookback in patterns:
    idx = raw.find(pat)
    if idx > 0:
        snippet = raw[idx-lookback:idx+len(pat)+2]
        hexstr = ' '.join(f'{b:02x}' for b in snippet)
        print(f'Near {pat.decode()[:25]}:')
        print(f'  {hexstr}')
        print()

