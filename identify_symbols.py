"""
Identify exact garbled sequences for each compliance emoji and replace them globally.
"""

with open('src/88-SafetyReports.gs', 'r', encoding='utf-8') as f:
    content = f.read()

# Find the lines we know have garbled emoji (around 1885-1911)
# Let's extract the exact characters used
lines = content.split('\n')

# Look at the key compliance lines
target_lines = {}
for i, line in enumerate(lines):
    if i+1 in range(1883, 1912):
        if any(kw in line for kw in ['days[', 'Meeting', 'Checklist', 'crew.']):
            target_lines[i+1] = line

print("=== Target compliance symbol lines ===")
for lineno, line in sorted(target_lines.items()):
    print(f"\nLine {lineno}: {repr(line)}")
    # Show each non-ASCII char with its codepoint
    for j, ch in enumerate(line):
        if ord(ch) > 127:
            print(f"  pos {j}: U+{ord(ch):04X} ({ch!r})")

print("\n=== Build replacement map ===")
# We want to map the garbled sequences to correct Unicode:
# Find the EXACT sequences by looking at what appears before 'L' vs alone, and before ')' etc.

# Extract the actual garbled strings from the lines
import re

# Find all quoted strings in the relevant compliance code
# Look for: crew.days[...] = 'GARBLED';
pattern = re.compile(r"= '([^']+)';")
found_values = {}
for lineno, line in sorted(target_lines.items()):
    m = pattern.search(line)
    if m:
        val = m.group(1)
        bytes_repr = val.encode('utf-8').hex()
        print(f"Line {lineno}: value={repr(val)} bytes={bytes_repr}")
        found_values[val] = bytes_repr

print("\n=== All unique compliance symbol values found ===")
for val, hexbytes in found_values.items():
    print(f"  {repr(val)} -> bytes: {hexbytes}")

# Also check comparison lines (1935-1937)
print("\n=== Status comparison lines ===")
for i, line in enumerate(lines):
    if i+1 in range(1934, 1940):
        print(f"\nLine {i+1}: {repr(line)}")

