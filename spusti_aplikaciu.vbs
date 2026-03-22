Set WshShell = CreateObject("WScript.Shell")
Set Fso = CreateObject("Scripting.FileSystemObject")

currentDir = Fso.GetParentFolderName(WScript.ScriptFullName)
WshShell.CurrentDirectory = currentDir

url = "http://127.0.0.1:8005/desktop/"
apiUrl = "http://127.0.0.1:8005/api/info"

' 1) Ak server este nebezi, spusti ho v samostatnom cmd okne.
If Not IsServerRunning(apiUrl) Then
    stalePid = GetListeningPid("8005")
    If stalePid <> "" Then
        WshShell.Run "cmd /c taskkill /F /PID " & stalePid, 0, True
        WScript.Sleep 500
    End If

    WshShell.Run "cmd /c cd /d """ & currentDir & """ && python server.py", 1, False
End If

' 2) Pockaj max 20 sekund, kym server zacne odpovedat.
serverReady = False
For i = 1 To 40
    If IsServerRunning(apiUrl) Then
        serverReady = True
        Exit For
    End If
    WScript.Sleep 500
Next

If Not serverReady Then
    MsgBox "Server sa nepodarilo spustit do 20 sekund." & vbCrLf & _
           "Skontrolujte prosim okno servera.", vbCritical, "ProjectTracker"
    WScript.Quit 1
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

Function IsServerRunning(checkUrl)
    On Error Resume Next
    Dim http
    Set http = CreateObject("MSXML2.ServerXMLHTTP.6.0")
    http.setTimeouts 500, 500, 500, 500
    http.Open "GET", checkUrl, False
    http.Send

    IsServerRunning = (Err.Number = 0 And http.Status = 200)

    Set http = Nothing
    On Error GoTo 0
End Function

Function GetListeningPid(port)
    Dim execObj, output, lines, line, i
    GetListeningPid = ""

    Set execObj = WshShell.Exec("cmd /c netstat -ano -p tcp | findstr LISTENING | findstr :" & port)
    output = execObj.StdOut.ReadAll
    lines = Split(output, vbCrLf)

    For i = 0 To UBound(lines)
        line = Trim(lines(i))
        If line <> "" Then
            GetListeningPid = LastTokenFromLine(line)
            Exit Function
        End If
    Next
End Function

Function LastTokenFromLine(line)
    Dim normalized, parts
    normalized = Trim(line)
    Do While InStr(normalized, "  ") > 0
        normalized = Replace(normalized, "  ", " ")
    Loop

    parts = Split(normalized, " ")
    If UBound(parts) >= 0 Then
        LastTokenFromLine = parts(UBound(parts))
    Else
        LastTokenFromLine = ""
    End If
End Function
