import os, re

src_dir = os.path.join(os.path.dirname(__file__), 'src')

# Read Code.gs as binary and find the bytes around 'âœ'
with open(os.path.join(src_dir, 'Code.gs'), 'rb') as f:
    raw = f.read()

# Find a few specific mojibake patterns and show their hex bytes
# Search for the bytes of 'â' (0xC3 0xA2 in UTF-8 for U+00E2)
pattern_bytes = b'\xc3\xa2'  # 'â' as UTF-8

positions = []
start = 0
while True:
    pos = raw.find(pattern_bytes, start)
    if pos == -1 or len(positions) >= 3:
        break
    positions.append(pos)
    start = pos + 1

for pos in positions:
    chunk = raw[max(0, pos-5):pos+20]
    print(f"Pos {pos}: hex = {chunk.hex(' ')}")
    print(f"  as UTF-8: {chunk.decode('utf-8', errors='replace')!r}")
    print(f"  as latin-1: {chunk.decode('latin-1')!r}")
    print()

# Also check: is the file UTF-8 but contains double-encoded sequences?
# Find first occurrence of emoji checkmark (U+2705 = F0 9F 98 85? No...)
# Green checkmark: U+2705 = E2 9C 85 in UTF-8? No, U+2705 = F0 9F 98 85? 
# Actually U+2705 ✅ = UTF-8: E2 9C 85? Let me check: 0x2705 = 0010 0111 0000 0101
# In UTF-8 3-byte: 1110xxxx 10xxxxxx 10xxxxxx
# 0x2705: binary = 0010 0111 0000 0101
# 3-byte form: 1110 0010 | 10 011100 | 10 000101 = E2 9C 85
print("Looking for correct UTF-8 green checkmark E2 9C 85:")
pos = raw.find(b'\xe2\x9c\x85')
if pos >= 0:
    print(f"Found at pos {pos}")
else:
    print("Not found")

print()
print("Looking for double-encoded: C3 A2 (UTF-8 for 0xE2) followed by more:")
# If a file was double-encoded: original E2 9C 85 -> encode each byte as UTF-8
# 0xE2 -> C3 A2 (UTF-8 for U+00E2)
# 0x9C -> C2 9C (UTF-8 for U+009C)  
# 0x85 -> C2 85 (UTF-8 for U+0085)
# So double-encoded checkmark would be: C3 A2 C2 9C C2 85
pos = raw.find(b'\xc3\xa2\xc2\x9c\xc2\x85')
print(f"Double-encoded checkmark: {'found at ' + str(pos) if pos >= 0 else 'NOT FOUND'}")

# Try: C3 A2 E2 80 9C (Unicode replacement approach)
pos = raw.find(b'\xc3\xa2\xc5\x93\xc2\x85')
print(f"Alt double-encoded: {'found at ' + str(pos) if pos >= 0 else 'NOT FOUND'}")

# Let me just decode what the actual bytes of the first 'â' occurrence produce
# when interpreted as latin-1 recoded to utf-8
print()
print("Testing decode approach on first occurrence:")
if positions:
    chunk = raw[positions[0]:positions[0]+9]
    print(f"Raw bytes: {chunk.hex(' ')}")
    latin1_str = chunk.decode('latin-1')
    print(f"As latin-1 string: {latin1_str!r}")
    try:
        utf8_result = latin1_str.encode('latin-1').decode('utf-8')
        print(f"Treated as UTF-8 bytes: {utf8_result!r}")
    except Exception as e:
        print(f"Decode error: {e}")
