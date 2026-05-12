with open('src/88-SafetyReports.gs', 'r', encoding='utf-8') as f:
    lines = f.readlines()

# Find the exact lines to fix by searching for the garbled content
fix_start = None
for i, line in enumerate(lines):
    if '// Build preview text' in line:
        # Check if the next few lines have the garbled emoji pattern
        for j in range(i, min(i+5, len(lines))):
            if 'Subject:' in lines[j] and ('previewText' in lines[j]):
                fix_start = j
                break
        if fix_start:
            break

if fix_start is None:
    print('ERROR: Could not find target lines')
    exit(1)

print('Found previewText block starting at line %d (1-based)' % (fix_start + 1))

# Print 20 lines from fix_start to verify
for i in range(fix_start, min(fix_start + 20, len(lines))):
    print('%d: %r' % (i + 1, lines[i][:100]))

# Build the replacement block
new_block = [
    "    var previewText = '';\n",
    "    previewText += 'Subject: ' + subject + '\\n';\n",
    "    previewText += 'From: ' + sender + '\\n';\n",
    "    previewText += 'Received: ' + Utilities.formatDate(receivedDate, Session.getScriptTimeZone(), 'MM/dd/yyyy h:mm a') + '\\n';\n",
    "    previewText += '\\n';\n",
    "\n",
    "    if (pdfFound) {\n",
    "      previewText += 'PDF: ' + pdfName + '\\n';\n",
    "      previewText += '----------------------------------------\\n';\n",
    "      if (pdfText && pdfText.indexOf('[Could not extract') === -1 && pdfText.indexOf('[Error') === -1) {\n",
    "        previewText += pdfText;\n",
    "      } else {\n",
    "        previewText += pdfText + '\\n\\n';\n",
    "        previewText += 'NOTE: PDF text could not be read (may be image-only or encrypted).\\n';\n",
    "        previewText += 'Showing email body as fallback:\\n';\n",
    "        previewText += '----------------------------------------\\n';\n",
    "        var bodyFallback = body || '(no email body)';\n",
    "        previewText += bodyFallback.length > 3000 ? bodyFallback.substring(0, 3000) + '\\n\\n[... truncated ...]' : bodyFallback;\n",
    "      }\n",
    "    } else {\n",
    "      previewText += 'Email Body:\\n';\n",
    "      previewText += '----------------------------------------\\n';\n",
    "      // Limit body text preview\n",
    "      previewText += body.length > 3000 ? body.substring(0, 3000) + '\\n\\n[... truncated ...]' : body;\n",
    "    }\n",
]

# Find where this block ends (look for 'return {' after the if/else)
block_end = fix_start - 1  # back up one since fix_start is at "var previewText"
# The block should be: var previewText = ''; then the 4 previewText += lines, then blank, then if/else (about 10 lines)
# We need to find the closing } of the if (pdfFound) block
depth = 0
scan_start = fix_start
found_if = False
end_idx = None
for i in range(scan_start, min(scan_start + 30, len(lines))):
    line = lines[i]
    if 'if (pdfFound)' in line:
        found_if = True
        depth = 1
    elif found_if:
        depth += line.count('{') - line.count('}')
        if depth <= 0:
            end_idx = i
            break

if end_idx is None:
    print('ERROR: Could not find end of if(pdfFound) block')
    # Just show what we have
    for i in range(scan_start, min(scan_start + 30, len(lines))):
        print('%d: %r' % (i + 1, lines[i][:80]))
    exit(1)

print('\nBlock ends at line %d (1-based), replacing lines %d-%d' % (end_idx + 1, fix_start + 1, end_idx + 1))

# Replace the block
lines = lines[:fix_start] + new_block + lines[end_idx + 1:]

print('\nResult preview:')
for i in range(fix_start, fix_start + len(new_block) + 2):
    if i < len(lines):
        print('%d: %r' % (i + 1, lines[i][:100]))

with open('src/88-SafetyReports.gs', 'w', encoding='utf-8') as f:
    f.writelines(lines)
print('\nFile written successfully. Total lines: %d' % len(lines))

