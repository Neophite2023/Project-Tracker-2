Set WshShell = CreateObject("WScript.Shell")

' Ziskaj aktualny adresar
currentDir = CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName)
WshShell.CurrentDirectory = currentDir

' 1. Spusti server skryto (pythonw.exe nespusta konzolu)
' Ak nemate pythonw v PATH, skuste plnu cestu alebo len python.exe (ale to ukaze okno)
WshShell.Run "pythonw server.py", 0, False

' 2. Pockaj 3 sekundy kym server nabehne
WScript.Sleep 3000

' 3. Otvor aplikaciu v predvolenom prehliadaci
WshShell.Run "http://localhost:8005/desktop/", 1, False
