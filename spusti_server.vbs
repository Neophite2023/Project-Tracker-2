Set WshShell = CreateObject("WScript.Shell")

currentDir = CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName)
WshShell.CurrentDirectory = currentDir

WshShell.Run "cmd /k cd /d " & currentDir & " && python server.py", 1, False
