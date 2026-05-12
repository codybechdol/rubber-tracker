# Global fix for garbled emoji in 88-SafetyReports.gs.
# Replaces Mojibake sequences with \uXXXX escape strings in JS string literals.

GARBLED_CHECK   = '\u00e2\u0153\u2026'   # âœ…  -> ✅
GARBLED_CROSS   = '\u00e2\u009d\u0152'   # âŒ  -> ❌
GARBLED_HOURGLASS = '\u00e2\u008f\u00b3' # â³  -> ⏳

# Replacement: use \uXXXX in the JS source so GAS interprets correctly
REPLACE_CHECK     = r'\u2705'   # ✅
REPLACE_CROSS     = r'\u274C'   # ❌
REPLACE_HOURGLASS = r'\u23F3'   # ⏳

with open('src/88-SafetyReports.gs', 'r', encoding='utf-8') as f:
    content = f.read()

original_len = len(content)

# Count before
check_count   = content.count(GARBLED_CHECK)
cross_count   = content.count(GARBLED_CROSS)
hour_count    = content.count(GARBLED_HOURGLASS)
print(f"Found before replacement:")
print(f"  ✅ garbled checkmark:  {check_count} occurrences")
print(f"  ❌ garbled cross:       {cross_count} occurrences")
print(f"  ⏳ garbled hourglass:   {hour_count} occurrences")

# Do replacements
# Order matters: do longer sequences first to avoid partial matches
# Check+L must be replaced before check alone
content = content.replace(GARBLED_CHECK + 'L', REPLACE_CHECK + 'L')
content = content.replace(GARBLED_CHECK, REPLACE_CHECK)
content = content.replace(GARBLED_CROSS, REPLACE_CROSS)
content = content.replace(GARBLED_HOURGLASS, REPLACE_HOURGLASS)

# Verify counts after
check_after   = content.count(GARBLED_CHECK)
cross_after   = content.count(GARBLED_CROSS)
hour_after    = content.count(GARBLED_HOURGLASS)

print(f"\nAfter replacement:")
print(f"  ✅ remaining garbled checkmarks:  {check_after}")
print(f"  ❌ remaining garbled crosses:      {cross_after}")
print(f"  ⏳ remaining garbled hourglasses:  {hour_after}")

# Spot check some key lines
from_lines = content.split('\n')
print(f"\nSpot check (lines 1884-1912):")
for i, line in enumerate(from_lines):
    if i+1 in range(1884, 1912):
        if any(kw in line for kw in ['days[d', 'MeetingStatus', 'crew.days[']):
            print(f"  Line {i+1}: {repr(line[:120])}")

print(f"\nSpot check status comparison lines (1934-1938):")
for i, line in enumerate(from_lines):
    if i+1 in range(1934, 1939):
        print(f"  Line {i+1}: {repr(line[:120])}")

if check_after == 0 and cross_after == 0 and hour_after == 0:
    print("\n✅ All garbled sequences replaced!")
    with open('src/88-SafetyReports.gs', 'w', encoding='utf-8') as f:
        f.write(content)
    print(f"File written. Length: {original_len} -> {len(content)} chars")
else:
    print("\n⚠️  Some sequences remain - check the output above")
    # Write anyway
    with open('src/88-SafetyReports.gs', 'w', encoding='utf-8') as f:
        f.write(content)
    print("File written anyway.")


