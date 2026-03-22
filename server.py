import http.server
import socketserver
import socket
import json
import os
import threading
import time
import logging
import errno

PORT = 8005
DATA_FILE = 'shared/data.json'

# Setup logging
logging.basicConfig(
    level=logging.DEBUG,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('server.log'),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)

# --- UTILS ---
def get_ip():
    """Ziska IP adresu (preferuje Tailscale 100.x)"""
    # Najprv skusime zistit vsetky IP
    try:
        hostname = socket.gethostname()
        ips = socket.gethostbyname_ex(hostname)[2]
        
        # Hladame Tailscale IP (zacina na 100.)
        for ip in ips:
            if ip.startswith('100.'):
                return ip
        
        # Ak nie je Tailscale, vratime primarnu
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(('8.8.8.8', 1))
        IP = s.getsockname()[0]
        s.close()
        return IP
    except Exception:
        return '127.0.0.1'

# --- HANDLER ---
class AppHandler(http.server.SimpleHTTPRequestHandler):
    def do_GET(self):
        # Normalizujeme cestu (odstranime trailing slash pre jednoduchsie porovnanie)
        path = self.path.split('?')[0].rstrip('/')
        logger.info(f"GET request: {self.path}")
        
        # 1. API: Info o serveri
        if path == '/api/info':
            self.send_json({ 
                "ip": get_ip(), 
                "port": PORT, 
                "status": "running" 
            })
            return

        # 2. API: Ziskanie dat
        if path == '/api/data':
            if os.path.exists(DATA_FILE):
                try:
                    with open(DATA_FILE, 'r', encoding='utf-8') as f:
                        data = json.load(f)
                    self.send_json(data)
                except Exception as e:
                    self.send_json({ "error": f"Error reading data: {str(e)}", "projects": [], "timestamp": 0 })
            else:
                self.send_json({ "projects": [], "timestamp": 0 })
            return
        
        # 3. Presmerovania
        if self.path == '/':
            self.send_response(301)
            self.send_header('Location', '/desktop/')
            self.end_headers()
            return
        
        if self.path == '/mobile':
            self.send_response(301)
            self.send_header('Location', '/mobile/')
            self.end_headers()
            return

        # 4. Staticke subory (standardny handler)
        return super().do_GET()

    def do_POST(self):
        # 1. API: Ulozenie dat
        if self.path == '/api/data':
            try:
                content_length = int(self.headers.get('Content-Length', 0))
                if content_length == 0:
                    self.send_json({ "error": "No data", "success": False })
                    return
                    
                post_data = self.rfile.read(content_length)
                
                data = json.loads(post_data)
                # Pridame server timestamp ak chyba alebo je starsi
                data['timestamp'] = time.time()
                
                if not os.path.exists('shared'):
                    os.makedirs('shared')
                
                with open(DATA_FILE, 'w', encoding='utf-8') as f:
                    json.dump(data, f, ensure_ascii=False, indent=2)
                
                self.send_json({ "success": True, "timestamp": data['timestamp'] })
            except Exception as e:
                self.send_json({ "error": str(e), "success": False })
            return
        
        # 2. API: Shutdown (vypnutie servera)
        if self.path == '/api/shutdown':
            self.send_json({ "success": True, "message": "Server shutting down..." })
            
            def kill_me():
                time.sleep(1)
                os._exit(0)
            
            threading.Thread(target=kill_me).start()
            return

        self.send_error(404)

    def do_HEAD(self):
        if self.path in ['/api/info', '/api/data']:
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
        else:
            super().do_HEAD()

    def send_json(self, data):
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Cache-Control', 'no-store')
        self.end_headers()
        self.wfile.write(json.dumps(data).encode('utf-8'))

    # Aby sme nemali CORS problemy pri vyvoji
    def end_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(200)
        self.end_headers()

# --- SERVER ---
class ThreadedTCPServer(socketserver.ThreadingMixIn, socketserver.TCPServer):
    allow_reuse_address = True
    daemon_threads = True


def create_server_with_retry(host, port, handler_cls, max_attempts=20, delay_seconds=0.5):
    last_error = None

    for attempt in range(1, max_attempts + 1):
        try:
            return ThreadedTCPServer((host, port), handler_cls)
        except OSError as exc:
            last_error = exc
            err_no = getattr(exc, "errno", None)

            # Windows bind error for "address already in use" is commonly 10048.
            if err_no in (errno.EADDRINUSE, 10048):
                logger.warning(
                    "Port %s je obsadeny (pokus %s/%s), opakujem o %.1f s...",
                    port,
                    attempt,
                    max_attempts,
                    delay_seconds,
                )
                time.sleep(delay_seconds)
                continue

            raise

    raise last_error

if __name__ == "__main__":
    # Uistime sa ze mame pracovny adresar
    os.chdir(os.path.dirname(os.path.abspath(__file__)))

    try:
        server = create_server_with_retry("0.0.0.0", PORT, AppHandler)
    except OSError as exc:
        logger.error("Server sa nepodarilo spustit na porte %s: %s", PORT, exc)
        raise SystemExit(1)

    print("=" * 50)
    print("  ProjectTracker Server")
    print("=" * 50)
    print(f"  Desktop: http://localhost:{PORT}/desktop/")
    print(f"  Mobile:  http://localhost:{PORT}/mobile/")
    print(f"  Tailscale: http://{get_ip()}:{PORT}/")
    print("=" * 50)
    print("  Stlac Ctrl+C pre zastavenie")
    print("=" * 50)
    
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nServer zastaveny.")
    finally:
        server.server_close()
        input("\nStlac Enter pre zatvorenie okna...")
