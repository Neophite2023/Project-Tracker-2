Set WshShell = CreateObject("WScript.Shell")
Set Fso = CreateObject("Scripting.FileSystemObject")

currentDir = Fso.GetParentFolderName(WScript.ScriptFullName)
WshShell.CurrentDirectory = currentDir

url = "https://doma-pc.tail85a624.ts.net:8005/desktop/"
serverScript = currentDir & "\spusti_server_https.vbs"
serverExitCode = WshShell.Run("wscript.exe """ & serverScript & """", 0, True)

If serverExitCode <> 0 Then
    WScript.Quit serverExitCode
End If

' 3) Otvor desktop appku vo Firefoxe (fallback na default browser).
firefoxPath = ""
If Fso.FileExists("C:\Program Files\Mozilla Firefox\firefox.exe") Then
    firefoxPath = "C:\Program Files\Mozilla Firefox\firefox.exe"
ElseIf Fso.FileExists("C:\Program Files (x86)\Mozilla Firefox\firefox.exe") Then
    firefoxPath = "C:\Program Files (x86)\Mozilla Firefox\firefox.exe"
ElseIf Fso.FileExists(WshShell.ExpandEnvironmentStrings("%LOCALAPPDATA%") & "\Mozilla Firefox\firefox.exe") Then
    firefoxPath = WshShell.ExpandEnvironmentStrings("%LOCALAPPDATA%") & "\Mozilla Firefox\firefox.exe"
End If

If firefoxPath <> "" Then
    WshShell.Run """" & firefoxPath & """ " & url, 1, False
Else
    WshShell.Run "explorer.exe " & url, 1, False
End If
