with open(r'C:\Users\codyb\WebstormProjects\Rubber Tracker\src\TripPlanner.html', 'r', encoding='utf-8') as f:
    content = f.read()

print('Last 80 chars:', repr(content[-80:]))
print('Total lines:', content.count('\n'))

# Check if Manual Task handler already there
has_manual = ("task.taskType === 'Manual Task'" in content and "Manual/generic task" in content)
print('Manual Task handler present:', 'YES' if has_manual else 'NO')

# Check Missing Safety Report handler
has_missing = "Missing Safety Report" in content
print('Missing Safety Report handler:', 'YES' if has_missing else 'NO')

