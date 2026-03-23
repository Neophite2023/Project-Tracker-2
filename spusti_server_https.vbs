Set WshShell = CreateObject("WScript.Shell")
' Spustenie servera s HTTPS certifikátmi na pozadí (okno skryté = 0)
WshShell.Run "python server.py --https --certfile certs/server.crt --keyfile certs/server.key", 0, False
