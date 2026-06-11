import os, re
from collections import Counter

src_dir = os.path.join(os.path.dirname(__file__), 'src')

# Collect all mojibake sequences
all_matches = Counter()
for fname in os.listdir(src_dir):
    if not (fname.endswith('.gs') or fname.endswith('.html')):
        continue
    fpath = os.path.join(src_dir, fname)
    with open(fpath, 'rb') as f:
        raw = f.read()
    text = raw.decode('utf-8', errors='replace')
    # Find sequences starting with common mojibake lead chars
    matches = re.findall(r'[\xf0\xc3\xc2\xe2][^\x00-\x7f\s<>"\'=]+', text)
    for m in matches:
        all_matches[m] += 1

print(f"Found {len(all_matches)} unique mojibake sequences\n")
print(f"{'Count':>5}  {'Mojibake':35s}  Correct")
print("-" * 80)
for seq, count in all_matches.most_common(60):
    try:
        fixed = seq.encode('latin-1').decode('utf-8')
    except Exception:
        fixed = '???'
    print(f"{count:5d}  {repr(seq):35s}  {fixed}")
