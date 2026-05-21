with open(r'C:\Users\codyb\WebstormProjects\Rubber Tracker\src\TripPlanner.html', 'r', encoding='utf-8') as f:
    content = f.read()

# Find "Missing Safety Report" handler in the popup task title builder
# It should look like: } else if (task.taskType === 'Missing Safety Report') {
anchor = "} else if (task.taskType === 'Missing Safety Report') {"
idx = content.find(anchor)
if idx < 0:
    print("ERROR: Could not find Missing Safety Report handler!")
else:
    # Find the end of this elif block (next line after the taskTitle assignment)
    # Find the closing } of the else-if block
    block_end = content.find('\n          }', idx)  # closing } of Missing Safety Report block
    if block_end < 0:
        block_end = content.find('\n          }', idx + len(anchor))
    print('Found anchor at:', idx)
    print('Block end at:', block_end)
    print('Context after block:', repr(content[block_end:block_end+200]))

    # Insert after the closing } of Missing Safety Report block
    new_handler = """ else if (task.taskType === 'Manual Task' || !task.taskType) {
            // Manual/generic task - use notes as title if available
            if (task.notes) {
              taskTitle = '\U0001f4cb ' + task.notes;
            } else if (task.employee && task.employee !== 'N/A') {
              taskTitle = '\U0001f4cb Visit: ' + task.employee;
            } else {
              taskTitle = '\U0001f4cb Manual Task';
            }"""

    # Find the exact closing } and insert after it
    # The Missing Safety Report block looks like:
    # } else if (task.taskType === 'Missing Safety Report') {
    #   taskTitle = '...'
    # }
    # We need to find the "}" that closes the if block

    # Find it by looking for the line with just "          }" after Missing Safety Report
    import re
    # Find the block: from anchor to the next "          }" line
    match = re.search(r"\} else if \(task\.taskType === 'Missing Safety Report'\) \{[^\}]*\}", content[idx:])
    if match:
        end_pos = idx + match.end()
        print('Match end:', repr(content[end_pos-20:end_pos+100]))
        content = content[:end_pos] + new_handler + '\n          }' + content[end_pos:]
        with open(r'C:\Users\codyb\WebstormProjects\Rubber Tracker\src\TripPlanner.html', 'w', encoding='utf-8') as f:
            f.write(content)
        print('Manual Task handler added!')
    else:
        print('Could not find regex match')

