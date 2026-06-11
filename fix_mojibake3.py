"""
Fix emoji/special character mojibake in all .gs and .html source files.

The encoding issue: special characters (emoji, arrows, dashes) were stored as
Windows-1252 (CP-1252) bytes but then misread as UTF-8, producing garbled sequences.

Fix: for each mojibake sequence, treat its Unicode code-points as raw bytes
(latin-1 for U+0000-U+00FF, CP-1252 extension table for others),
then decode those bytes as UTF-8 to recover the original character.
"""
import os, re, sys

src_dir = os.path.join(os.path.dirname(__file__), 'src')

# CP-1252 extension chars that are NOT in latin-1 (byte 0x80-0x9F special mappings)
# These are chars that CP-1252 maps to the 0x80-0x9F byte range
CP1252_EXTRA = {
    '\u20ac': 0x80,  # €
    '\u201a': 0x82,  # ‚
    '\u0192': 0x83,  # ƒ
    '\u201e': 0x84,  # „
    '\u2026': 0x85,  # …
    '\u2020': 0x86,  # †
    '\u2021': 0x87,  # ‡
    '\u02c6': 0x88,  # ˆ
    '\u2030': 0x89,  # ‰
    '\u0160': 0x8a,  # Š
    '\u2039': 0x8b,  # ‹
    '\u0152': 0x8c,  # Œ
    '\u017d': 0x8e,  # Ž
    '\u2018': 0x91,  # '
    '\u2019': 0x92,  # '
    '\u201c': 0x93,  # "
    '\u201d': 0x94,  # "
    '\u2022': 0x95,  # •
    '\u2013': 0x96,  # –
    '\u2014': 0x97,  # —
    '\u02dc': 0x98,  # ˜
    '\u2122': 0x99,  # ™
    '\u0161': 0x9a,  # š
    '\u203a': 0x9b,  # ›
    '\u0153': 0x9c,  # œ
    '\u017e': 0x9e,  # ž
    '\u0178': 0x9f,  # Ÿ
}

def mojibake_to_bytes(seq):
    """Convert a mojibake string to its original bytes.
    Each character's code point is treated as a raw byte value:
    - U+0000-U+00FF: ordinal directly = byte (covers latin-1 + undefined CP-1252 positions)
    - CP-1252 extension chars (U+0100+): use CP-1252 byte value
    """
    result = bytearray()
    for ch in seq:
        o = ord(ch)
        if o <= 0xFF:
            result.append(o)
        elif ch in CP1252_EXTRA:
            result.append(CP1252_EXTRA[ch])
        else:
            return None  # can't encode — not mojibake
    return bytes(result)

def decode_mojibake(seq):
    raw = mojibake_to_bytes(seq)
    if raw is None:
        return None
    try:
        result = raw.decode('utf-8')
        if result == seq:
            return None
        return result
    except UnicodeDecodeError:
        return None

def safe_print(s):
    sys.stdout.buffer.write((s + '\n').encode('utf-8', errors='replace'))

def find_mojibake_runs(text):
    # Match sequences starting with typical mojibake lead chars
    # â (U+00E2), ð (U+00F0), ã (U+00E3), Ã (U+00C3), Â (U+00C2), Å (U+00C5)
    pattern = re.compile(r'[âðãÃÂÅ][^\x00-\x7f\r\n<>"\'=;,{}()\[\]]*')
    return [(m.start(), m.group()) for m in pattern.finditer(text)]

def fix_file(fpath, dry_run=False):
    with open(fpath, encoding='utf-8') as f:
        original = f.read()
    
    text = original
    replacements = {}
    
    for pos, seq in find_mojibake_runs(text):
        if seq in replacements:
            continue
        fixed = decode_mojibake(seq)
        if fixed:
            replacements[seq] = fixed
    
    if not replacements:
        return 0, {}
    
    total_fixes = 0
    for bad, good in sorted(replacements.items(), key=lambda x: -len(x[0])):
        count = text.count(bad)
        if count > 0:
            text = text.replace(bad, good)
            total_fixes += count
    
    if total_fixes > 0 and not dry_run:
        with open(fpath, 'w', encoding='utf-8') as f:
            f.write(text)
    
    rep_counts = {bad: original.count(bad) for bad in replacements}
    return total_fixes, {k: (v, rep_counts[k]) for k, v in replacements.items() if rep_counts[k] > 0}

def main():
    dry_run = '--dry-run' in sys.argv
    verbose = '--verbose' in sys.argv or '-v' in sys.argv
    
    total_files = 0
    total_fixes = 0
    
    files = sorted(f for f in os.listdir(src_dir) if f.endswith('.gs') or f.endswith('.html'))
    
    for fname in files:
        fpath = os.path.join(src_dir, fname)
        fixes, reps = fix_file(fpath, dry_run=dry_run)
        if fixes > 0:
            total_files += 1
            total_fixes += fixes
            mode = "DRY RUN" if dry_run else "FIXED"
            safe_print(f"[{mode}] {fname}: {fixes} replacements")
            if verbose:
                for bad, (good, count) in sorted(reps.items(), key=lambda x: -x[1][1]):
                    safe_print(f"  {count:3d}x  {bad!r:35s} -> {good}")
    
    safe_print(f"\n{'DRY RUN: ' if dry_run else ''}Fixed {total_fixes} sequences in {total_files} files")

if __name__ == '__main__':
    main()
