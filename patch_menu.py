#!/usr/bin/env python3
# Adds fixBadJHACreditRow277 to Code.gs menu and 99-MenuFix.gs

code_path = r'C:\Users\codyb\WebstormProjects\Rubber Tracker\src\Code.gs'
menu_path = r'C:\Users\codyb\WebstormProjects\Rubber Tracker\src\99-MenuFix.gs'

search = "clearAndReprocessSafetyEmails')))"

with open(code_path, 'r', encoding='utf-8') as f:
    code_content = f.read()

idx = code_content.find(search)
print('Code.gs idx:', idx)
if idx >= 0:
    print('Before:', repr(code_content[idx-60:idx+len(search)]))

with open(menu_path, 'r', encoding='utf-8') as f:
    menu_content = f.read()

idx2 = menu_content.find(search)
print('99-MenuFix.gs idx:', idx2)
if idx2 >= 0:
    print('Before:', repr(menu_content[idx2-60:idx2+len(search)]))

# Patch Code.gs
if idx >= 0:
    fix_item = (
        "\n        .addSeparator()"
        "\n        .addItem('\U0001f527 Fix Bad JHA Credit \u2014 Row 277 (045-16/Abilene)', 'fixBadJHACreditRow277')"
    )
    new_code = code_content[:idx + len(search) - 1] + fix_item + '))' + code_content[idx + len(search):]
    with open(code_path, 'w', encoding='utf-8') as f:
        f.write(new_code)
    print('Code.gs patched OK')

# Patch 99-MenuFix.gs
if idx2 >= 0:
    fix_item2 = (
        "\n          .addSeparator()"
        "\n          .addItem('\U0001f527 Fix Bad JHA Credit \u2014 Row 277 (045-16/Abilene)', 'fixBadJHACreditRow277')"
    )
    new_menu = menu_content[:idx2 + len(search) - 1] + fix_item2 + '))' + menu_content[idx2 + len(search):]
    with open(menu_path, 'w', encoding='utf-8') as f:
        f.write(new_menu)
    print('99-MenuFix.gs patched OK')

# Fix extra closing paren in 99-MenuFix.gs
menu_path = r'C:\Users\codyb\WebstormProjects\Rubber Tracker\src\99-MenuFix.gs'

with open(menu_path, 'r', encoding='utf-8') as f:
    content = f.read()

# The Python patch earlier added an extra ) after clearAndReprocessSafetyEmails
# It should be ')  not '))  before .addSeparator()
bad  = "clearAndReprocessSafetyEmails'))\n          .addSeparator()"
good = "clearAndReprocessSafetyEmails')\n          .addSeparator()"

if bad in content:
    content = content.replace(bad, good, 1)
    with open(menu_path, 'w', encoding='utf-8') as f:
        f.write(content)
    print('Fixed!')
else:
    print('Pattern not found. Current context:')
    idx = content.find('clearAndReprocessSafetyEmails')
    if idx >= 0:
        print(repr(content[idx-5:idx+120]))
