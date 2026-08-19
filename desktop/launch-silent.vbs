Set WshShell = CreateObject("WScript.Shell")
WshShell.CurrentDirectory = "c:\Users\codyb\WebstormProjects\Safety Assistant\desktop"
WshShell.Run "cmd /c npm start", 0, False
