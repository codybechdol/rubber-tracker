#!/usr/bin/env python3
"""
Scan all .gs/.html files in src/ for CP1252 mojibake (garbled emoji).
Mojibake: UTF-8 multi-byte sequences were saved but re-read as CP1252,
producing garbage characters like: ðŸ" â€¢ âœ… ðŸ—'ï¸ â±ï¸

Detection approach: read file as latin-1 (byte-for-byte), then try to
decode each 2-4 byte window as UTF-8.
Simpler approach: look for the literal mojibake byte sequences.
"""

import os, sys, glob

SRC_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'src')

# Build mojibake->correct mapping by encoding emoji as UTF-8 then decoding as CP1252
def build_replacements():
    chars = [
        '\U0001F4CB',   # 📋
        '\U0001F50D',   # 🔍
        '\U0001F5D1\uFE0F',  # 🗑️
        '\U000023F1\uFE0F',  # ⏱️
        '\u2705',       # ✅
        '\u26A0\uFE0F', # ⚠️
        '\U0001F4CA',   # 📊
        '\U0001F4C5',   # 📅
        '\U0001F3AF',   # 🎯
        '\U0001F6D2',   # 🛒
        '\U0001F6E1\uFE0F',  # 🛡️
        '\U0001F4E5',   # 📥
        '\U0001F527',   # 🔧
        '\U0001F9F9',   # 🧹
        '\U0001F4DD',   # 📝
        '\U0001F680',   # 🚀
        '\U0001F4BE',   # 💾
        '\U0001F4C2',   # 📂
        '\U0001F4C8',   # 📈
        '\U0001F5FA\uFE0F',  # 🗺️
        '\U0001F477',   # 👷
        '\U0001F4DE',   # 📞
        '\u2709\uFE0F', # ✉️
        '\U0001F4A1',   # 💡
        '\U0001F514',   # 🔔
        '\U0001F3E5',   # 🏥
        '\U0001F9BD',   # 🧽
        '\U0001F389',   # 🎉
        '\U0001F44D',   # 👍
        '\u274C',       # ❌
        '\U0001F504',   # 🔄
        '\U0001F534',   # 🔴
        '\U0001F7E0',   # 🟠
        '\U0001F7E1',   # 🟡
        '\U0001F7E2',   # 🟢
        '\U0001F512',   # 🔒
        '\U0001F195',   # 🆕
        '\U0001F6A8',   # 🚨
        '\U0001F4CC',   # 📌
        '\U0001F4AC',   # 💬
        '\U0001F511',   # 🔑
        '\U0001F3E8',   # 🏨
        '\U0001F3E2',   # 🏢
        '\U0001F513',   # 🔓
        '\U0001F4CD',   # 📍
        '\U0001F5D3\uFE0F',  # 🗓️
        '\U0001F393',   # 🎓
        '\u2022',       # • (bullet)
        '\u2013',       # – (en dash)
        '\u2014',       # — (em dash)
        '\u2018',       # '
        '\u2019',       # '
        '\u201C',       # "
        '\u201D',       # "
        '\u2192',       # →
        '\u2190',       # ←
        '\u2713',       # ✓
        '\u2714',       # ✔
        '\u2714\uFE0F', # ✔️
        '\U0001F4E7',   # 📧
        '\U0001F4E4',   # 📤
        '\U0001F4E3',   # 📣
        '\u2139\uFE0F', # ℹ️
        '\U0001F4AF',   # 💯
        '\U0001F6AB',   # 🚫
        '\U0001F3D7\uFE0F',  # 🏗️
        '\U0001F4E6',   # 📦
        '\U0001F465',   # 👥
        '\U0001F4BB',   # 💻
        '\u2728',       # ✨
        '\U0001F440',   # 👀
        '\u2764\uFE0F', # ❤️
        '\U0001F6A7',   # 🚧
        '\U0001F4F1',   # 📱
        '\U0001F4B0',   # 💰
        '\u23F0',       # ⏰
        '\u23F3',       # ⏳
        '\u2615',       # ☕
        '\u274E',       # ❎
        '\U0001F553',   # 🕓
        '\U0001F4C6',   # 📆
        '\U0001F4C9',   # 📉
        '\U0001F4DA',   # 📚
        '\u26A1',       # ⚡
        '\u2B50',       # ⭐
        '\U0001F4AA',   # 💪
        '\U0001F3A4',   # 🎤
        '\U0001F6E0\uFE0F',  # 🛠️
        '\U0001F4FC',   # 📼
        '\U0001F4F0',   # 📰
        '\U0001F4F8',   # 📸
        '\U0001F9FE',   # 🧾
        '\U0001F9F2',   # 🧲
        '\U0001F9EA',   # 🧪
        '\U0001F6D1',   # 🛑
        '\u2757',       # ❗
        '\u2753',       # ❓
        '\U0001F4A5',   # 💥
        '\U0001F525',   # 🔥
        '\U0001F4A7',   # 💧
        '\U0001F3C6',   # 🏆
        '\U0001F947',   # 🥇
        '\U0001F4F5',   # 📵
        '\U0001F510',   # 🔐
        '\U0001F50F',   # 🔏
        '\U0001F5C2\uFE0F',  # 🗂️
        '\U0001F4C3',   # 📃
        '\U0001F4C4',   # 📄
        '\U0001F4CE',   # 📎
        '\U0001F4CF',   # 📏
        '\U0001F4D0',   # 📐
        '\u2702\uFE0F', # ✂️
        '\U0001F5D2\uFE0F',  # 🗒️
        '\U0001F47B',   # 👻
        '\U0001F52C',   # 🔬
        '\U0001F9EC',   # 🧬
        '\U0001F9F0',   # 🧰
        '\U0001F9F1',   # 🧱
        '\U0001F528',   # 🔨
        '\U0001F529',   # 🔩
        '\U0001F526',   # 🔦
        '\U0001F4A9',   # 💩
        '\U0001F6BC',   # 🚼
    ]
    pairs = []
    seen = set()
    for c in chars:
        if c in seen:
            continue
        seen.add(c)
        try:
            mojibake = c.encode('utf-8').decode('cp1252')
            if mojibake != c:
                pairs.append((mojibake, c))
        except (UnicodeDecodeError, UnicodeEncodeError):
            pass
    pairs.sort(key=lambda x: -len(x[0]))
    return pairs


def main():
    dry_run = '--dry-run' in sys.argv or '-n' in sys.argv
    if dry_run:
        print('=== DRY RUN - no files will be modified ===\n')

    replacements = build_replacements()
    print('Built %d mojibake->correct mappings' % len(replacements))

    # Also try raw byte detection: read as bytes, look for UTF-8 sequences stored as CP1252
    # This catches cases where the file is saved with literal mojibake chars
    total_files = 0
    total_changes = 0

    # Also scan files as raw bytes looking for multi-byte CP1252 sequences
    # that are UTF-8 emoji mistakenly decoded
    for fn in sorted(glob.glob(os.path.join(SRC_DIR, '*.gs')) + glob.glob(os.path.join(SRC_DIR, '*.html'))):
        basename = os.path.basename(fn)

        # Read as bytes first to detect encoding issues
        with open(fn, 'rb') as f:
            raw = f.read()

        # Try reading as UTF-8
        try:
            original = raw.decode('utf-8')
        except UnicodeDecodeError:
            print('  WARNING: %s is not valid UTF-8!' % basename)
            # Try latin-1 as fallback
            original = raw.decode('latin-1')

        fixed = original
        file_changes = 0
        matches = []
        for bad, good in replacements:
            count = fixed.count(bad)
            if count > 0:
                matches.append((bad, good, count))
                fixed = fixed.replace(bad, good)
                file_changes += count

        if file_changes > 0:
            total_files += 1
            total_changes += file_changes
            action = '[DRY] Would fix' if dry_run else 'FIXED'
            print('%s %s: %d replacements' % (action, basename, file_changes))
            for bad, good, count in matches:
                # show snippet
                idx = original.index(bad)
                snippet = original[max(0,idx-20):idx+len(bad)+20].replace('\n', ' ')
                print('   %dx: %r -> %r  (near: ...%s...)' % (count, bad[:6], good[:6], snippet[:60]))
            if not dry_run:
                with open(fn, 'w', encoding='utf-8') as f:
                    f.write(fixed)

    print()
    if total_files == 0:
        print('No mojibake found in any .gs or .html file.')
        # Additional check: look for suspicious byte patterns
        print('\nChecking for non-ASCII bytes that might indicate encoding issues...')
        for fn in sorted(glob.glob(os.path.join(SRC_DIR, '*.gs')) + glob.glob(os.path.join(SRC_DIR, '*.html'))):
            basename = os.path.basename(fn)
            with open(fn, 'rb') as f:
                raw = f.read()
            # Look for CP1252 sequences (bytes 0x80-0x9F are CP1252 private area, unusual in UTF-8)
            suspicious = [(i, b) for i, b in enumerate(raw) if b in range(0x80, 0xA0)]
            if suspicious:
                # Decode surrounding context
                for pos, byte in suspicious[:3]:
                    ctx = raw[max(0,pos-10):pos+10]
                    try:
                        ctx_str = ctx.decode('utf-8', errors='replace')
                    except:
                        ctx_str = repr(ctx)
                    print('  %s byte 0x%02X at pos %d: %r' % (basename, byte, pos, ctx_str))
    else:
        action = 'Would fix' if dry_run else 'Fixed'
        print('%s %d instances across %d files.' % (action, total_changes, total_files))


if __name__ == '__main__':
    main()

