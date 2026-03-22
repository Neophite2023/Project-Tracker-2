Set WshShell = CreateObject("WScript.Shell")
Set Fso = CreateObject("Scripting.FileSystemObject")

currentDir = Fso.GetParentFolderName(WScript.ScriptFullName)
WshShell.CurrentDirectory = currentDir

apiUrl = "http://127.0.0.1:8005/api/info"

' Ak server neodpoveda, ale port je obsadeny, ukoncime "zaseknuty" proces.
If Not IsServerRunning(apiUrl) Then
    stalePid = GetListeningPid("8005")
    If stalePid <> "" Then
        WshShell.Run "cmd /c taskkill /F /PID " & stalePid, 0, True
        WScript.Sleep 500
    End If

    WshShell.Run "cmd /c cd /d """ & currentDir & """ && python server.py", 1, False
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
