"""
Fix garbled emoji symbols in 88-SafetyReports.gs compliance tracking.

The compliance sheet writes emoji like checkmark (U+2705), cross (U+274C), hourglass (U+23F3).
These are stored as garbled Mojibake bytes in the .gs source file.
We replace them with Unicode escape sequences that GAS handles correctly.
"""

with open('src/88-SafetyReports.gs', 'r', encoding='utf-8') as f:
    content = f.read()

# The garbled sequences and their correct Unicode code points
# Mojibake arises from UTF-8 bytes read as Latin-1:
#   U+2705 (checkmark) UTF-8: E2 9C 85  -> Mojibake: â œ … -> combined: âœ…
#   U+274C (cross)     UTF-8: E2 9D 8C  -> Mojibake: â \x9d Œ -> combined: âŒ (or â\x9dŒ)
#   U+23F3 (hourglass) UTF-8: E2 8F B3  -> Mojibake: â \x8f ³ -> combined: â³ (or â\x8fB3)
#   L suffix is appended as plain text

# Find the garbled bytes by scanning raw UTF-8
# U+2705 = bytes E2 9C 85 -> when read as latin-1 and re-encoded as utf-8...
# Actually when UTF-8 file is opened correctly but the source had double-encoding:
# The file was saved with characters that are already Mojibake.
# Let's find what bytes represent these garbled sequences.

print("=== Scanning for garbled emoji sequences ===")
garbled_found = {}

lines = content.split('\n')
for i, line in enumerate(lines):
    # Check for any non-ASCII chars
    for j, ch in enumerate(line):
        if ord(ch) > 127:
            ctx = line[max(0,j-10):j+20]
            key = repr(ch)
            if key not in garbled_found:
                garbled_found[key] = (i+1, j, repr(ctx))

print("Unique non-ASCII chars in file (first occurrence):")
for char_repr, (lineno, col, ctx) in list(garbled_found.items())[:40]:
    print(f"  Line {lineno} col {col}: {char_repr} in {ctx}")

# Now look specifically for the compliance symbol definitions
print("\n=== Looking for compliance constants ===")
for i, line in enumerate(lines):
    if any(kw in line for kw in ['CREDITED', 'PENDING_SYMBOL', 'CHECK_SYM', 'CROSS_SYM',
                                   'hourglass', 'checkmark', 'cross_mark',
                                   'var credited', 'var pending', 'var check', 'var cross',
                                   'COMPLIANCE_SYMBOLS', 'complianceSymbol']):
        print(f"  Line {i+1}: {repr(line[:120])}")

# Look for where these go into sheet cells
print("\n=== Lines writing emoji to compliance cells ===")
for i, line in enumerate(lines):
    if any(ord(ch) > 127 for ch in line):
        if any(kw in line for kw in ['setValue', 'setValues', 'cell', 'row[', 'compliance', 'credited', 'pending', 'symbol']):
            print(f"  Line {i+1}: {repr(line[:140])}")

