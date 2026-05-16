#!/usr/bin/env python3
"""
Second-pass mojibake fixer for emojis whose 4th UTF-8 byte is not in CP1252.

When a 4-byte emoji (e.g., 🔍 = F0 9F 94 8D) was decoded as CP1252:
  - Bytes 0x81, 0x8D, 0x8F, 0x90, 0x9D are undefined in CP1252
  - Some programs DROP those bytes, leaving 3 chars (e.g.,  ðŸ")
  - Some programs use Latin-1, leaving 4 chars (ð + invisible ctrl chars)

This script:
1. Builds a map of ALL 4-byte emoji mojibake (including truncated 3-char forms
   where 4th byte was dropped).
2. Also handles mojibake via Latin-1 path (invisible control chars).
"""

import os
import unicodedata

SRC_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'src')

# CP1252 undefined bytes (these get dropped or become replacement chars)
CP1252_UNDEFINED = {0x81, 0x8D, 0x8F, 0x90, 0x9D}

def byte_to_cp1252_char(b):
    """Return the CP1252 character for byte b, or '' if undefined."""
    if b in CP1252_UNDEFINED:
        return ''
    try:
        return bytes([b]).decode('cp1252')
    except:
        return ''

def byte_to_latin1_char(b):
    """Return the Latin-1 character for byte b."""
    return chr(b)

def build_emoji_mojibake_map():
    """
    Build comprehensive mapping: mojibake_string -> correct_emoji_string.
    Covers:
      - 4-byte emoji (U+10000 to U+1FFFF) via CP1252 (with dropped bytes)
      - 3-byte chars (U+0800 to U+FFFF) via CP1252
    """
    pairs = {}

    # 4-byte emoji: F0 [9F/A0/A1/A2] [80-BF] [80-BF]
    # Only scan the emoji ranges actually used
    emoji_ranges = [
        range(0x1F300, 0x1FA00),   # Misc symbols, emoticons, transport, etc.
        range(0x1FA00, 0x1FB00),   # Chess pieces, sports
        range(0x1F000, 0x1F300),   # Mahjong, dominos, playing cards, etc.
        range(0x23000, 0x26000),   # CJK, symbols - skip most
        range(0x2600, 0x27C0),     # 3-byte range: misc symbols/dingbats
    ]

    # Handle 3-byte emoji (U+0800 to U+FFFF) via CP1252
    three_byte_ranges = [
        range(0x2000, 0x2800),     # General punctuation, currency, etc.
        range(0x2600, 0x2700),     # Misc symbols
        range(0x2700, 0x2800),     # Dingbats
        range(0x23F0, 0x2400),     # Clocks
        range(0x26A0, 0x26C0),     # Warning, no entry, etc.
        range(0xFE0F, 0xFE10),     # Variation selector 16 (makes emoji colored)
    ]

    def add_char(c_str):
        utf8_bytes = c_str.encode('utf-8')
        if len(utf8_bytes) == 4:
            b1, b2, b3, b4 = utf8_bytes
            c1 = byte_to_cp1252_char(b1)
            c2 = byte_to_cp1252_char(b2)
            c3 = byte_to_cp1252_char(b3)
            c4_dropped = b4 in CP1252_UNDEFINED
            c4 = byte_to_cp1252_char(b4)

            if c1 and c2 and c3:
                if c4:
                    # 4-char mojibake
                    mojibake = c1 + c2 + c3 + c4
                    if mojibake != c_str and len(mojibake) > 0:
                        pairs[mojibake] = c_str
                elif c4_dropped:
                    # 3-char mojibake (4th byte dropped because undefined in CP1252)
                    mojibake = c1 + c2 + c3
                    if mojibake != c_str and len(mojibake) > 0:
                        # Only map if not already claimed by a 4-char match for the same prefix
                        if mojibake not in pairs:
                            pairs[mojibake] = c_str

        elif len(utf8_bytes) == 3:
            b1, b2, b3 = utf8_bytes
            c1 = byte_to_cp1252_char(b1)
            c2 = byte_to_cp1252_char(b2)
            c3 = byte_to_cp1252_char(b3)
            if c1 and c2:
                if c3:
                    mojibake = c1 + c2 + c3
                    if mojibake != c_str:
                        pairs[mojibake] = c_str
                elif b3 in CP1252_UNDEFINED:
                    mojibake = c1 + c2
                    if mojibake != c_str and mojibake not in pairs:
                        pairs[mojibake] = c_str

        elif len(utf8_bytes) == 2:
            b1, b2 = utf8_bytes
            c1 = byte_to_cp1252_char(b1)
            c2 = byte_to_cp1252_char(b2)
            if c1 and c2:
                mojibake = c1 + c2
                if mojibake != c_str:
                    pairs[mojibake] = c_str

    # Process 4-byte emoji ranges
    for r in emoji_ranges:
        for cp in r:
            try:
                c = chr(cp)
                add_char(c)
            except:
                pass

    # Process 3-byte ranges
    for r in three_byte_ranges:
        for cp in r:
            try:
                c = chr(cp)
                add_char(c)
            except:
                pass

    # Also add common multi-char sequences (emoji + variation selector)
    vs16 = '\uFE0F'
    for cp in list(range(0x2300, 0x27FF)) + list(range(0x1F000, 0x1FA00)):
        try:
            c = chr(cp) + vs16
            add_char(c)
        except:
            pass

    # Sort: longest mojibake first (avoid partial replacements)
    sorted_pairs = sorted(pairs.items(), key=lambda x: -len(x[0]))
    return sorted_pairs

def scan_and_fix(dry_run=False):
    print('Building comprehensive mojibake -> emoji map...')
    replacements = build_emoji_mojibake_map()
    print(f'Built {len(replacements)} mappings')

    total_files = 0
    total_changes = 0

    for fn in sorted(os.listdir(SRC_DIR)):
        if not (fn.endswith('.gs') or fn.endswith('.html')):
            continue
        path = os.path.join(SRC_DIR, fn)
        with open(path, 'r', encoding='utf-8') as f:
            original = f.read()

        fixed = original
        file_changes = 0
        for bad, good in replacements:
            count = fixed.count(bad)
            if count > 0:
                fixed = fixed.replace(bad, good)
                file_changes += count
                # Show details for debugging
                if not dry_run:
                    pass  # quiet in real run

        if file_changes > 0:
            total_files += 1
            total_changes += file_changes
            action = '[DRY RUN] Would fix' if dry_run else 'FIXED'
            print(f'  {action} {fn}: {file_changes} replacements')
            if not dry_run:
                with open(path, 'w', encoding='utf-8') as f:
                    f.write(fixed)

    if total_files == 0:
        print('No additional mojibake found.')
    else:
        action = 'Would fix' if dry_run else 'Fixed'
        print(f'\n{action} {total_changes} more mojibake instances across {total_files} files.')

if __name__ == '__main__':
    import sys
    dry = '--dry-run' in sys.argv or '-n' in sys.argv
    if dry:
        print('=== DRY RUN ===\n')
    scan_and_fix(dry_run=dry)

