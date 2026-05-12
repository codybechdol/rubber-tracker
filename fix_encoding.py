with open('src/88-SafetyReports.gs', 'r', encoding='utf-8') as f:
    lines = f.readlines()

# Fix garbled encoding on specific lines (0-indexed)
# Line 6643 (idx 6642): garbled emoji before 'Backfill Notes'
lines[6642] = "    'Backfill Notes', 60);\n"

# Line 6855 (idx 6854): garbled em-dash in log message
lines[6854] = lines[6854].replace('\u00e2\u20ac\u201d', '-')

# Line 6864 (idx 6863): garbled checkmark before 'Notes Backfill Complete'
lines[6863] = lines[6863].replace('\u00e2\u0153\u2026', '')

# Fix leading space in 'Notes Backfill Complete' (line 6864, idx 6863)
# Fix leading space in 'Notes Backfill Complete' (line 6864, idx 6863)
old_msg = "' Notes Backfill"
new_msg = "'Notes Backfill"
lines[6863] = lines[6863].replace(old_msg, new_msg)

# Line 6866 (idx 6865): garbled em-dash in 'Skipped' message
lines[6865] = lines[6865].replace('\u00e2\u20ac\u201d', ' -')

# Fix double space in 'Skipped  -' (line 6866, idx 6865)
old_skipped = "'Skipped  -"
new_skipped = "'Skipped -"
lines[6865] = lines[6865].replace(old_skipped, new_skipped)

# Line 6868 (idx 6867): garbled arrow in Errors message
lines[6867] = lines[6867].replace('\u00e2\u2020\u2019', '>')

# Line 6870 (idx 6869): garbled arrows in Check Extensions message
lines[6869] = lines[6869].replace('\u00e2\u2020\u2019', '>')

print('Fixed lines:')
for i in [6642, 6854, 6863, 6865, 6867, 6869]:
    print('  %d: %r' % (i+1, lines[i][:100]))

with open('src/88-SafetyReports.gs', 'w', encoding='utf-8') as f:
    f.writelines(lines)
print('File written successfully.')
