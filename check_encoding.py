import os

filepath = os.path.join('src', 'Code.gs')
data = open(filepath, 'rb').read()
lines = data.split(b'\n')
print(f"Total lines: {len(lines)}")

# Check line 6026 (index 6025)
line = lines[6025]
print(f"Line 6026 repr: {repr(line[:120])}")
print(f"Line 6026 hex:  {line[:120].hex()}")

# Search for 'Quick Actions' near the menu
for i in range(6020, 6035):
    if i < len(lines) and b'Quick Actions' in lines[i]:
        print(f"\nFound 'Quick Actions' at line {i+1}")
        print(f"  repr: {repr(lines[i][:120])}")
        print(f"  hex:  {lines[i][:120].hex()}")

# Check if emojis are proper UTF-8 or garbled
# Proper emoji 📱 = f0 9f 93 b1
# Garbled ðŸ"± in UTF-8 = c3 b0 c5 b8 e2 80 9c c2 b1
garbled_pattern = b'\xc3\xb0\xc5\xb8'  # ðŸ in UTF-8
proper_pattern = b'\xf0\x9f'  # start of proper 4-byte UTF-8 emoji

garbled_count = data.count(garbled_pattern)
proper_count = data.count(proper_pattern)
print(f"\nGarbled emoji sequences (c3 b0 c5 b8): {garbled_count}")
print(f"Proper emoji sequences (f0 9f): {proper_count}")

# Also check for other garbled indicators
# â = c3 a2 (start of garbled 3-byte emoji like ✅ = e2 9c 85)
garbled3 = data.count(b'\xc3\xa2')
print(f"Garbled 3-byte emoji starts (c3 a2): {garbled3}")

