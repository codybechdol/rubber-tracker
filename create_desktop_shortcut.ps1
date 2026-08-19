$WshShell = New-Object -ComObject WScript.Shell
$Desktop = [Environment]::GetFolderPath("Desktop")
$ShortcutPath = Join-Path $Desktop "Safety Assistant.lnk"

$Shortcut = $WshShell.CreateShortcut($ShortcutPath)
$Shortcut.TargetPath = "$env:SystemRoot\System32\wscript.exe"
$Shortcut.Arguments = """c:\Users\codyb\WebstormProjects\Safety Assistant\desktop\launch-silent.vbs"""
$Shortcut.WorkingDirectory = "c:\Users\codyb\WebstormProjects\Safety Assistant\desktop"
$Shortcut.IconLocation = "$env:SystemRoot\System32\imageres.dll,109"
$Shortcut.Description = "Safety Assistant (Offline Field Edition)"
$Shortcut.Save()

Write-Host "SUCCESS: Created shortcut at $ShortcutPath"
