#!/usr/bin/env python3
"""
Scan all .gs and .html files for garbled emoji (mojibake from UTF-8/Latin-1 double-encoding).
Finds, reports, then auto-fixes all occurrences.
"""
import os, re

ROOT = r'C:\Users\codyb\WebstormProjects\Rubber Tracker\src'

# ── Known mojibake → JS escape mappings ──────────────────────────────────────
# Each tuple: (garbled_unicode_string, js_escape_replacement, emoji_name)
# Derived by encoding emoji as UTF-8, then reading bytes as Windows-1252.
REPLACEMENTS = [
    # 4-byte emoji (U+1F000 range) — F0 byte → ð (U+00F0) prefix
    ('\u00f0\u0178\u201c\u009d', r'\uD83D\uDD0D', '🔍'),   # U+1F50D magnifying glass
    ('\u00f0\u0178\u2018\u009d', r'\uD83D\uDD0D', '🔍'),   # variant
    ('\u00f0\u0178\u201c\u009c', r'\uD83D\uDCCC', '📌'),   # U+1F4CC pushpin
    ('\u00f0\u0178\u201c\u009e', r'\uD83D\uDCCE', '📎'),   # U+1F4CE paperclip
    ('\u00f0\u0178\u201c\u00a3', r'\uD83D\uDCA3', '💣'),   # U+1F4A3 bomb
    ('\u00f0\u0178\u201c\u008a', r'\uD83D\uDCCA', '📊'),   # U+1F4CA bar chart alt
    ('\u00f0\u0178\u201c\u008b', r'\uD83D\uDCCB', '📋'),   # U+1F4CB clipboard
    ('\u00f0\u0178\u201c\u00b7', r'\uD83D\uDCB7', '💷'),   # U+1F4B7
    ('\u00f0\u0178\u201c\u00a5', r'\uD83D\uDCE5', '📥'),   # U+1F4E5 inbox tray
    ('\u00f0\u0178\u201c\u00a4', r'\uD83D\uDCE4', '📤'),   # U+1F4E4
    ('\u00f0\u0178\u2014\u2018\u00ef\u00b8\x8f', r'\uD83D\uDDD1\uFE0F', '🗑️'),  # U+1F5D1 wastebasket
    ('\u00f0\u0178\u2014\u201c\u00ef\u00b8\x8f', r'\uD83D\uDDBC\uFE0F', '🖼️'),  # U+1F5BC
    ('\u00f0\u0178\u201d\u2122', r'\uD83D\uDEA9', '🚩'),   # U+1F6A9 flag
    ('\u00f0\u0178\u201d\u2014', r'\uD83D\uDE94', '🚔'),   # U+1F6D4 various
    ('\u00f0\u0178\u2018\u0081', r'\uD83D\uDC41', '👁'),   # U+1F441 eye
    ('\u00f0\u0178\u2018\u0082', r'\uD83D\uDC42', '👂'),   # U+1F442 ear
    ('\u00f0\u0178\u2018\u00a4', r'\uD83D\uDC64', '👤'),   # U+1F464 bust
    ('\u00f0\u0178\u2018\u00a5', r'\uD83D\uDC65', '👥'),   # U+1F465 busts
    ('\u00f0\u0178\u2018\u00b7', r'\uD83D\uDC77', '👷'),   # U+1F477 worker
    ('\u00f0\u0178\u2018\u00bb', r'\uD83D\uDC7B', '👻'),   # U+1F47B ghost
    ('\u00f0\u0178\u2018\u00bc', r'\uD83D\uDC7C', '👼'),   # U+1F47C angel
    ('\u00f0\u0178\u2019\u0081', r'\uD83D\uDD01', '🔁'),   # U+1F501 repeat
    ('\u00f0\u0178\u2019\u0082', r'\uD83D\uDD02', '🔂'),   # U+1F502 repeat one
    ('\u00f0\u0178\u2019\u0084', r'\uD83D\uDD04', '🔄'),   # U+1F504 counterclockwise
    ('\u00f0\u0178\u2019\u0085', r'\uD83D\uDD05', '🔅'),   # U+1F505
    ('\u00f0\u0178\u2019\u008c', r'\uD83D\uDD0C', '🔌'),   # U+1F50C plug
    ('\u00f0\u0178\u2019\u008d', r'\uD83D\uDD0D', '🔍'),   # U+1F50D magnifier alt
    ('\u00f0\u0178\u2019\u009b', r'\uD83D\uDD1B', '🔛'),   # U+1F51B on arrow
    ('\u00f0\u0178\u2019\u00a6', r'\uD83D\uDD26', '🔦'),   # U+1F526 flashlight
    ('\u00f0\u0178\u2019\u00a7', r'\uD83D\uDD27', '🔧'),   # U+1F527 wrench
    ('\u00f0\u0178\u2019\u00a8', r'\uD83D\uDD28', '🔨'),   # U+1F528 hammer
    ('\u00f0\u0178\u2019\u00b0', r'\uD83D\uDD30', '🔰'),   # U+1F530 beginner
    ('\u00f0\u0178\u2019\u00b4', r'\uD83D\uDD34', '🔴'),   # U+1F534 red circle
    ('\u00f0\u0178\u2019\u00b5', r'\uD83D\uDD35', '🔵'),   # U+1F535 blue circle
    ('\u00f0\u0178\u2019\u00b6', r'\uD83D\uDD36', '🔶'),   # U+1F536 orange diamond
    ('\u00f0\u0178\u2019\u00b7', r'\uD83D\uDD37', '🔷'),   # U+1F537 blue diamond
    ('\u00f0\u0178\u2019\u00b8', r'\uD83D\uDD38', '🔸'),   # U+1F538 small orange diamond
    ('\u00f0\u0178\u2019\u00b9', r'\uD83D\uDD39', '🔹'),   # U+1F539 small blue diamond
    ('\u00f0\u0178\u2019\u00ba', r'\uD83D\uDD3A', '🔺'),   # U+1F53A red triangle up
    ('\u00f0\u0178\u2019\u00bb', r'\uD83D\uDD3B', '🔻'),   # U+1F53B red triangle down
    # Common 3/4-byte sequences
    ('\u00e2\u20ac\u00a2',  r'\u2022', '•'),    # U+2022 bullet
    ('\u00e2\u20ac\u0153',  r'\u201C', '"'),    # U+201C left double quote
    ('\u00e2\u20ac\u009d',  r'\u201D', '"'),    # U+201D right double quote
    ('\u00e2\u20ac\u2122',  r'\u2019', "'"),    # U+2019 right single quote
    ('\u00e2\u20ac\u201c',  r'\u2013', '–'),    # U+2013 en dash
    ('\u00e2\u20ac\u201d',  r'\u2014', '—'),    # U+2014 em dash
    ('\u00e2\x8f\u00b1\u00ef\u00b8\x8f', r'\u23F1\uFE0F', '⏱️'),   # U+23F1 stopwatch
    ('\u00e2\x8f\u00b0\u00ef\u00b8\x8f', r'\u23F0\uFE0F', '⏰'),   # U+23F0 alarm clock
    ('\u00e2\x8f\u00b3\u00ef\u00b8\x8f', r'\u23F3\uFE0F', '⏳'),   # U+23F3 hourglass
    ('\u00e2\x8f\u00b2\u00ef\u00b8\x8f', r'\u23F2\uFE0F', '⏲'),   # U+23F2 timer
    ('\u00e2\u009c\u0085',  r'\u2705', '✅'),   # U+2705 check mark (green)
    ('\u00e2\u009c\u0088',  r'\u2708', '✈'),    # U+2708 airplane
    ('\u00e2\u009c\u0089',  r'\u2709', '✉'),    # U+2709 envelope
    ('\u00e2\u009a\u00a0',  r'\u26A0', '⚠'),    # U+26A0 warning
    ('\u00e2\u009a\u00a1',  r'\u26A1', '⚡'),   # U+26A1 lightning
    ('\u00e2\u009b\u0094',  r'\u26D4', '⛔'),   # U+26D4 no entry
    ('\u00e2\u009b\u00b3',  r'\u26F3', '⛳'),   # U+26F3 golf
    ('\u00e2\u0098\u0085',  r'\u2605', '★'),    # U+2605 star
    ('\u00e2\u0098\u0086',  r'\u2606', '☆'),    # U+2606 white star
    ('\u00e2\u0098\u0090',  r'\u2610', '☐'),    # U+2610 checkbox
    ('\u00e2\u0098\u0091',  r'\u2611', '☑'),    # U+2611 checked box
    ('\u00e2\u0098\u0092',  r'\u2612', '☒'),    # U+2612 x box
    ('\u00c3\u00a9', r'\u00E9', 'é'),           # U+00E9  (common)
    # Variation selector (U+FE0F) corruption
    ('\u00ef\u00b8\x8f', r'\uFE0F', '️'),       # U+FE0F variation selector-16
]

# ── Also do a broad scan for any remaining high-codepoint suspicious chars ──
SUSPICIOUS_RANGES = [
    (0x0080, 0x009F),  # C1 control characters (almost never valid in JS source)
    (0x00C2, 0x00FF),  # likely mojibake prefix bytes
    (0x0100, 0x02FF),  # extended Latin (Ÿ=U+0178 is the key one)
    (0x2000, 0x206F),  # general punctuation used in mojibake (€=U+20AC, "=U+201C etc.)
]

def is_suspicious(ch):
    cp = ord(ch)
    # Allow known-OK ones already escaped
    if cp < 0x80:
        return False
    if 0x00A0 <= cp <= 0x00BF:  # non-breaking space, misc Latin-1 supplement
        return True
    if 0x00C0 <= cp <= 0x00FF:  # Latin-1 supplement (â ï ¸ etc.)
        return True
    if 0x0100 <= cp <= 0x02FF:  # Ÿ (U+0178) etc.
        return True
    if 0x2000 <= cp <= 0x20FF:  # general punctuation (€ " " ' ' — etc.)
        return True
    return False

def scan_file(filepath):
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            content = f.read()
    except Exception as e:
        return None, str(e)
    
    findings = []
    lines = content.split('\n')
    for lineno, line in enumerate(lines, 1):
        suspicious_chars = [(i, ch) for i, ch in enumerate(line) if is_suspicious(ch)]
        if suspicious_chars:
            # Show context: up to 80 chars around first suspicious char
            first_pos = suspicious_chars[0][0]
            start = max(0, first_pos - 20)
            snippet = line[start:start+80]
            codepoints = ' '.join(f'U+{ord(c):04X}({c})' for _, c in suspicious_chars[:8])
            findings.append((lineno, snippet.strip(), codepoints))
    return content, findings

def apply_replacements(content):
    new_content = content
    applied = []
    for old, new, name in REPLACEMENTS:
        count = new_content.count(old)
        if count > 0:
            new_content = new_content.replace(old, new)
            applied.append((name, count, new))
    return new_content, applied

# ── Main ─────────────────────────────────────────────────────────────────────
extensions = ('.gs', '.html')
all_findings = {}
total_fixed = 0

for fname in sorted(os.listdir(ROOT)):
    if not any(fname.endswith(ext) for ext in extensions):
        continue
    filepath = os.path.join(ROOT, fname)
    content, findings = scan_file(filepath)
    if content is None:
        print(f"ERROR reading {fname}: {findings}")
        continue
    
    new_content, applied = apply_replacements(content)
    
    if applied or findings:
        all_findings[fname] = {'applied': applied, 'remaining': findings}
        if applied:
            with open(filepath, 'w', encoding='utf-8') as f:
                f.write(new_content)
            total_fixed += sum(c for _, c, _ in applied)

# ── Report ────────────────────────────────────────────────────────────────────
print(f"\n{'='*70}")
print(f"SCAN COMPLETE — {total_fixed} total replacements applied")
print(f"{'='*70}\n")

for fname, data in all_findings.items():
    if data['applied']:
        print(f"✅ {fname} — FIXED:")
        for name, count, new in data['applied']:
            print(f"   {name} x{count} → {new}")
    
    # Re-scan to find what's still suspicious after fix
    filepath = os.path.join(ROOT, fname)
    with open(filepath, 'r', encoding='utf-8') as f:
        new_content = f.read()
    lines = new_content.split('\n')
    remaining = []
    for lineno, line in enumerate(lines, 1):
        suspicious = [ch for ch in line if is_suspicious(ch)]
        if suspicious:
            snippet = line.strip()[:100]
            remaining.append((lineno, snippet, suspicious[:5]))
    
    if remaining:
        print(f"⚠️  {fname} — STILL HAS SUSPICIOUS CHARS ({len(remaining)} lines):")
        for lineno, snippet, chars in remaining[:5]:
            cps = ' '.join(f'U+{ord(c):04X}' for c in chars)
            print(f"   Line {lineno}: {snippet[:70]}")
            print(f"            Chars: {cps}")
        if len(remaining) > 5:
            print(f"   ... and {len(remaining)-5} more lines")
        print()

if not all_findings:
    print("✅ No garbled emoji or suspicious characters found in any file!")
