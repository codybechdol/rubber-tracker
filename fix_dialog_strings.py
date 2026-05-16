#!/usr/bin/env python3
"""
Fix partially-converted mojibake in 88-SafetyReports.gs dialog strings.

Problems found:
1. 'â•¢'  = â (U+00E2) + • (U+2022) + ¢ (U+00A2)  → should be just • (U+2022)
   This was mojibake for bullet •, partially fixed (only mid-byte converted).
   Pattern in file: '\u00e2\u2022\u00a2'

2. 'ð🔍' = ð (U+00F0) + 🔍 emoji → should be just 🔍
   This was mojibake for a 4-byte emoji, partially fixed (leading byte left over).
   Pattern: '\u00f0' immediately before a 4-byte emoji (U+1F...)

3. Similar stray leading bytes before other emoji.
"""

import re, sys, os

SRC = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'src', '88-SafetyReports.gs')

def fix_file(path, dry_run=False):
    with open(path, 'r', encoding='utf-8') as f:
        original = f.read()

    fixed = original
    changes = []

    # Fix 1: â\u2022¢  →  \u2022
    # The file has literal â (U+00E2) + literal text "\u2022" (6 chars) + literal ¢ (U+00A2)
    # This renders in JS as â•¢ but should be just •
    bad1 = '\u00e2\\u2022\u00a2'   # â + backslash-u-2022 text + ¢
    good1 = '\\u2022'
    c = fixed.count(bad1)
    if c:
        fixed = fixed.replace(bad1, good1)
        changes.append('  â\\u2022¢ → \\u2022: %d replacements' % c)

    # Fix 2: ð before \uD83D JS escape sequences
    # File has literal ð (U+00F0) + literal "\uD83D..." text
    bad2 = '\u00f0\\uD83D'
    good2 = '\\uD83D'
    c = fixed.count(bad2)
    if c:
        fixed = fixed.replace(bad2, good2)
        changes.append('  ð\\uD83D → \\uD83D: %d replacements' % c)

    # Fix 3: â\u2022¢ where bullet is actual codepoint (not JS escape)
    # Some places may have the actual bullet character surrounded by stray bytes
    bad3 = '\u00e2\u2022\u00a2'
    good3 = '\u2022'
    c = fixed.count(bad3)
    if c:
        fixed = fixed.replace(bad3, good3)
        changes.append('  â•¢ → •: %d replacements' % c)

    # Fix 4: ð before actual emoji codepoints
    stray_d_pattern = re.compile(r'\u00f0([\U00010000-\U0010FFFF])')
    m = stray_d_pattern.findall(fixed)
    if m:
        fixed = stray_d_pattern.sub(r'\1', fixed)
        changes.append('  ð + emoji → emoji: %d replacements' % len(m))

    return original, fixed, changes


def main():
    dry_run = '--dry-run' in sys.argv or '-n' in sys.argv
    if dry_run:
        print('=== DRY RUN ===\n')

    # Fix 88-SafetyReports.gs only (where the dialog strings are)
    files = [SRC]
    # Also scan all other gs/html files for the same patterns
    src_dir = os.path.dirname(SRC)
    import glob
    for f in sorted(glob.glob(os.path.join(src_dir, '*.gs')) + glob.glob(os.path.join(src_dir, '*.html'))):
        if f not in files:
            files.append(f)

    total_changes = 0
    for path in files:
        original, fixed, changes = fix_file(path)
        if changes:
            total_changes += len(changes)
            basename = os.path.basename(path)
            print('FIXED %s:' % basename)
            for ch in changes:
                print(ch)
            if not dry_run:
                with open(path, 'w', encoding='utf-8') as f:
                    f.write(fixed)
            else:
                # Show changed lines
                orig_lines = original.split('\n')
                fixed_lines = fixed.split('\n')
                for i, (o, fx) in enumerate(zip(orig_lines, fixed_lines), 1):
                    if o != fx:
                        print('    Line %d WAS: %s' % (i, repr(o[:120])))
                        print('    Line %d NOW: %s' % (i, repr(fx[:120])))
            print()

    if total_changes == 0:
        print('No fixable patterns found.')
    else:
        print('Total: %d pattern group(s) fixed across %d file(s)' % (total_changes, sum(1 for f in files if fix_file(f)[2])))

    if total == 0:
        print('Nothing to fix.')
        return

    if not dry_run:
        with open(SRC, 'w', encoding='utf-8') as f:
            f.write(fixed)
        print('Saved %s' % SRC)
    else:
        # Show sample of what changed
        orig_lines = original.split('\n')
        fixed_lines = fixed.split('\n')
        print('\nChanged lines:')
        for i, (o, fx) in enumerate(zip(orig_lines, fixed_lines), 1):
            if o != fx:
                print('  Line %d:' % i)
                print('    WAS:  %s' % repr(o[:120]))
                print('    NOW:  %s' % repr(fx[:120]))

if __name__ == '__main__':
    main()

