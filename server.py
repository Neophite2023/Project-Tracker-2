import http.server
import socketserver
import socket
import json
import os
import threading
import time
import logging
import errno
import sqlite3
import argparse
import ssl

PORT = 8005
SERVER_SCHEME = 'http'
BIND_HOST = '0.0.0.0'
DB_FILE = 'shared/data.db'

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


class DataStore:
    """Primary relational SQLite storage."""

    def __init__(self, db_path):
        self.db_path = db_path
        self.lock = threading.Lock()
        self._ensure_shared_dir()
        self._init_db()
        self._bootstrap_migrate()

    def _ensure_shared_dir(self):
        shared_dir = os.path.dirname(self.db_path) or 'shared'
        if not os.path.exists(shared_dir):
            os.makedirs(shared_dir)

    def _connect(self):
        conn = sqlite3.connect(self.db_path, timeout=5)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys=ON;")
        conn.execute("PRAGMA journal_mode=WAL;")
        conn.execute("PRAGMA synchronous=NORMAL;")
        return conn

    def _init_db(self):
        with self._connect() as conn:
            conn.executescript(
                """
                CREATE TABLE IF NOT EXISTS projects (
                    id TEXT PRIMARY KEY,
                    order_idx INTEGER NOT NULL,
                    data_json TEXT NOT NULL,
                    updated_at REAL NOT NULL DEFAULT 0,
                    deleted INTEGER NOT NULL DEFAULT 0
                );

                CREATE TABLE IF NOT EXISTS phases (
                    id TEXT PRIMARY KEY,
                    project_id TEXT NOT NULL,
                    order_idx INTEGER NOT NULL,
                    data_json TEXT NOT NULL,
                    updated_at REAL NOT NULL DEFAULT 0,
                    deleted INTEGER NOT NULL DEFAULT 0,
                    FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
                );

                CREATE TABLE IF NOT EXISTS tasks (
                    id TEXT PRIMARY KEY,
                    project_id TEXT NOT NULL,
                    phase_id TEXT NOT NULL,
                    order_idx INTEGER NOT NULL,
                    data_json TEXT NOT NULL,
                    updated_at REAL NOT NULL DEFAULT 0,
                    deleted INTEGER NOT NULL DEFAULT 0,
                    completed INTEGER NOT NULL DEFAULT 0,
                    FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE,
                    FOREIGN KEY(phase_id) REFERENCES phases(id) ON DELETE CASCADE
                );

                CREATE TABLE IF NOT EXISTS transactions (
                    id TEXT PRIMARY KEY,
                    project_id TEXT NOT NULL,
                    phase_id TEXT NULL,
                    order_idx INTEGER NOT NULL,
                    data_json TEXT NOT NULL,
                    updated_at REAL NOT NULL DEFAULT 0,
                    deleted INTEGER NOT NULL DEFAULT 0,
                    amount REAL NOT NULL DEFAULT 0,
                    category TEXT NULL,
                    tx_date TEXT NULL,
                    FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
                );

                CREATE TABLE IF NOT EXISTS settings (
                    id INTEGER PRIMARY KEY CHECK (id = 1),
                    data_json TEXT NOT NULL,
                    updated_at REAL NOT NULL DEFAULT 0
                );

                CREATE TABLE IF NOT EXISTS meta (
                    key TEXT PRIMARY KEY,
                    value TEXT NOT NULL
                );

                -- Legacy snapshot table kept for safe transition/rollback.
                CREATE TABLE IF NOT EXISTS app_state (
                    id INTEGER PRIMARY KEY CHECK (id = 1),
                    payload_json TEXT NOT NULL,
                    timestamp REAL NOT NULL,
                    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
                );

                CREATE INDEX IF NOT EXISTS idx_phases_project_order ON phases(project_id, order_idx);
                CREATE INDEX IF NOT EXISTS idx_tasks_phase_order ON tasks(phase_id, order_idx);
                CREATE INDEX IF NOT EXISTS idx_tx_project_order ON transactions(project_id, order_idx);
                """
            )

    def _extract_timestamp(self, payload):
        try:
            return float((payload or {}).get("timestamp", 0) or 0)
        except (TypeError, ValueError):
            return 0.0

    def _extract_updated_at(self, obj):
        try:
            return float((obj or {}).get("updatedAt", 0) or 0)
        except (TypeError, ValueError):
            return 0.0

    def _normalize_payload(self, payload):
        if not isinstance(payload, dict):
            raise ValueError("Payload must be a JSON object")

        projects = payload.get("projects", [])
        if not isinstance(projects, list):
            projects = []

        normalized = {
            "projects": projects,
            "timestamp": self._extract_timestamp(payload) or time.time()
        }
        if "settings" in payload:
            normalized["settings"] = payload.get("settings")
        return normalized

    def _safe_id(self, value, prefix, index):
        text = str(value or "").strip()
        if text:
            return text
        return f"{prefix}_{int(time.time() * 1000)}_{index}"

    def _safe_float(self, value, default=0.0):
        try:
            return float(value)
        except (TypeError, ValueError):
            return float(default)

    def _read_legacy_snapshot(self):
        with self._connect() as conn:
            row = conn.execute(
                "SELECT payload_json FROM app_state WHERE id = 1"
            ).fetchone()
        if not row:
            return None
        return self._normalize_payload(json.loads(row["payload_json"]))

    def _read_relational_payload(self):
        with self._connect() as conn:
            project_rows = conn.execute(
                "SELECT id, data_json FROM projects ORDER BY order_idx, id"
            ).fetchall()
            if not project_rows:
                return None

            phase_rows = conn.execute(
                "SELECT id, project_id, data_json FROM phases ORDER BY project_id, order_idx, id"
            ).fetchall()
            task_rows = conn.execute(
                "SELECT id, phase_id, data_json FROM tasks ORDER BY phase_id, order_idx, id"
            ).fetchall()
            tx_rows = conn.execute(
                "SELECT id, project_id, data_json FROM transactions ORDER BY project_id, order_idx, id"
            ).fetchall()
            settings_row = conn.execute(
                "SELECT data_json FROM settings WHERE id = 1"
            ).fetchone()
            ts_row = conn.execute(
                "SELECT value FROM meta WHERE key = 'timestamp'"
            ).fetchone()

        phases_by_project = {}
        phase_map = {}
        for row in phase_rows:
            try:
                phase = json.loads(row["data_json"])
            except Exception:
                logger.warning("Skipping invalid phase JSON for id=%s", row["id"])
                continue

            phase.setdefault("id", row["id"])
            phase["tasks"] = []
            phases_by_project.setdefault(row["project_id"], []).append(phase)
            phase_map[row["id"]] = phase

        for row in task_rows:
            phase = phase_map.get(row["phase_id"])
            if not phase:
                continue
            try:
                task = json.loads(row["data_json"])
            except Exception:
                logger.warning("Skipping invalid task JSON for id=%s", row["id"])
                continue
            task.setdefault("id", row["id"])
            phase["tasks"].append(task)

        tx_by_project = {}
        for row in tx_rows:
            try:
                tx = json.loads(row["data_json"])
            except Exception:
                logger.warning("Skipping invalid transaction JSON for id=%s", row["id"])
                continue
            tx.setdefault("id", row["id"])
            tx_by_project.setdefault(row["project_id"], []).append(tx)

        projects = []
        for row in project_rows:
            try:
                project = json.loads(row["data_json"])
            except Exception:
                logger.warning("Skipping invalid project JSON for id=%s", row["id"])
                continue
            project.setdefault("id", row["id"])
            project["phases"] = phases_by_project.get(row["id"], [])
            project["transactions"] = tx_by_project.get(row["id"], [])
            projects.append(project)

        payload = {
            "projects": projects,
            "timestamp": self._safe_float(ts_row["value"] if ts_row else 0, 0)
        }
        if settings_row:
            try:
                payload["settings"] = json.loads(settings_row["data_json"])
            except Exception:
                logger.warning("Invalid settings JSON in DB, ignoring.")
        return self._normalize_payload(payload)

    def _write_relational_payload(self, payload):
        normalized = self._normalize_payload(payload)
        now_ts = time.time()
        normalized["timestamp"] = now_ts

        with self._connect() as conn:
            conn.execute("BEGIN")
            try:
                conn.execute("DELETE FROM tasks")
                conn.execute("DELETE FROM transactions")
                conn.execute("DELETE FROM phases")
                conn.execute("DELETE FROM projects")

                for project_idx, raw_project in enumerate(normalized.get("projects", [])):
                    if not isinstance(raw_project, dict):
                        continue

                    project = dict(raw_project)
                    project_id = self._safe_id(project.get("id"), "project", project_idx)
                    project["id"] = project_id

                    project_phases = project.get("phases", [])
                    if not isinstance(project_phases, list):
                        project_phases = []

                    project_transactions = project.get("transactions", [])
                    if not isinstance(project_transactions, list):
                        project_transactions = []

                    project.pop("phases", None)
                    project.pop("transactions", None)

                    conn.execute(
                        """
                        INSERT INTO projects (id, order_idx, data_json, updated_at, deleted)
                        VALUES (?, ?, ?, ?, ?)
                        """,
                        (
                            project_id,
                            project_idx,
                            json.dumps(project, ensure_ascii=False),
                            self._extract_updated_at(project),
                            1 if project.get("deleted") else 0,
                        ),
                    )

                    phase_ids = set()
                    for phase_idx, raw_phase in enumerate(project_phases):
                        if not isinstance(raw_phase, dict):
                            continue

                        phase = dict(raw_phase)
                        phase_id = self._safe_id(phase.get("id"), f"phase_{project_id}", phase_idx)
                        phase["id"] = phase_id
                        phase_ids.add(phase_id)

                        phase_tasks = phase.get("tasks", [])
                        if not isinstance(phase_tasks, list):
                            phase_tasks = []
                        phase.pop("tasks", None)

                        conn.execute(
                            """
                            INSERT INTO phases (id, project_id, order_idx, data_json, updated_at, deleted)
                            VALUES (?, ?, ?, ?, ?, ?)
                            """,
                            (
                                phase_id,
                                project_id,
                                phase_idx,
                                json.dumps(phase, ensure_ascii=False),
                                self._extract_updated_at(phase),
                                1 if phase.get("deleted") else 0,
                            ),
                        )

                        for task_idx, raw_task in enumerate(phase_tasks):
                            if not isinstance(raw_task, dict):
                                continue

                            task = dict(raw_task)
                            task_id = self._safe_id(task.get("id"), f"task_{phase_id}", task_idx)
                            task["id"] = task_id

                            conn.execute(
                                """
                                INSERT INTO tasks (
                                    id, project_id, phase_id, order_idx, data_json, updated_at, deleted, completed
                                )
                                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                                """,
                                (
                                    task_id,
                                    project_id,
                                    phase_id,
                                    task_idx,
                                    json.dumps(task, ensure_ascii=False),
                                    self._extract_updated_at(task),
                                    1 if task.get("deleted") else 0,
                                    1 if task.get("completed") else 0,
                                ),
                            )

                    for tx_idx, raw_tx in enumerate(project_transactions):
                        if not isinstance(raw_tx, dict):
                            continue

                        tx = dict(raw_tx)
                        tx_id = self._safe_id(tx.get("id"), f"tx_{project_id}", tx_idx)
                        tx["id"] = tx_id

                        tx_phase_ref = str(tx.get("phaseId", "") or "")
                        tx_phase_fk = tx_phase_ref if tx_phase_ref in phase_ids else None

                        conn.execute(
                            """
                            INSERT INTO transactions (
                                id, project_id, phase_id, order_idx, data_json,
                                updated_at, deleted, amount, category, tx_date
                            )
                            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                            """,
                            (
                                tx_id,
                                project_id,
                                tx_phase_fk,
                                tx_idx,
                                json.dumps(tx, ensure_ascii=False),
                                self._extract_updated_at(tx),
                                1 if tx.get("deleted") else 0,
                                self._safe_float(tx.get("amount"), 0),
                                tx.get("category"),
                                tx.get("date"),
                            ),
                        )

                if "settings" in normalized:
                    settings_obj = normalized.get("settings")
                    if not isinstance(settings_obj, dict):
                        settings_obj = {}
                    settings_updated_at = self._extract_updated_at(settings_obj) or now_ts
                    conn.execute(
                        """
                        INSERT INTO settings (id, data_json, updated_at)
                        VALUES (1, ?, ?)
                        ON CONFLICT(id) DO UPDATE SET
                            data_json = excluded.data_json,
                            updated_at = excluded.updated_at
                        """,
                        (json.dumps(settings_obj, ensure_ascii=False), settings_updated_at),
                    )

                conn.execute(
                    """
                    INSERT INTO meta (key, value)
                    VALUES ('timestamp', ?)
                    ON CONFLICT(key) DO UPDATE SET value = excluded.value
                    """,
                    (str(now_ts),),
                )

                conn.commit()
            except Exception:
                conn.rollback()
                raise

        return normalized

    def _bootstrap_migrate(self):
        with self.lock:
            candidates = []

            try:
                relational_payload = self._read_relational_payload()
                if relational_payload:
                    candidates.append(("relational", relational_payload))
            except Exception as e:
                logger.warning("Relational read failed during bootstrap: %s", e)

            try:
                legacy_payload = self._read_legacy_snapshot()
                if legacy_payload:
                    candidates.append(("legacy_db", legacy_payload))
            except Exception as e:
                logger.warning("Legacy DB snapshot read failed during bootstrap: %s", e)

            if candidates:
                source, chosen = max(candidates, key=lambda item: self._extract_timestamp(item[1]))
                logger.info("Storage bootstrap source selected: %s", source)
            else:
                chosen = {"projects": [], "timestamp": 0}
                logger.info("Storage bootstrap source selected: empty")

            self._write_relational_payload(chosen)

    def read(self):
        with self.lock:
            payload = self._read_relational_payload()
            if payload:
                return payload
            return {"projects": [], "timestamp": 0}

    def write(self, payload):
        result = {
            "db_written": False,
            "timestamp": time.time()
        }

        with self.lock:
            db_error = None

            try:
                persisted = self._write_relational_payload(payload)
                result["db_written"] = True
                result["timestamp"] = persisted["timestamp"]
            except Exception as e:
                db_error = str(e)
                logger.error("DB write failed: %s", e)

            result["success"] = result["db_written"]
            if db_error:
                result["db_error"] = db_error

        return result


STORE = DataStore(DB_FILE)

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


def get_sync_host():
    """Returns host that clients should use for sync URL."""
    if BIND_HOST in ('', '0.0.0.0', '::'):
        return get_ip()
    if BIND_HOST in ('localhost', '127.0.0.1'):
        return '127.0.0.1'
    return BIND_HOST


def build_sync_base_url():
    return f"{SERVER_SCHEME}://{get_sync_host()}:{PORT}"


def parse_cli_args():
    parser = argparse.ArgumentParser(description="ProjectTracker HTTP/HTTPS server")
    parser.add_argument('--host', default='0.0.0.0', help='Bind host (default: 0.0.0.0)')
    parser.add_argument('--port', type=int, default=PORT, help='Bind port (default: 8005)')
    parser.add_argument(
        '--https',
        action='store_true',
        help='Enable HTTPS mode (required for reliable iPhone PWA sync).'
    )
    parser.add_argument(
        '--certfile',
        default='certs/server.crt',
        help='Path to TLS certificate file (PEM).'
    )
    parser.add_argument(
        '--keyfile',
        default='certs/server.key',
        help='Path to TLS private key file (PEM).'
    )
    return parser.parse_args()

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
                "status": "running",
                "scheme": SERVER_SCHEME,
                "sync_base_url": build_sync_base_url()
            })
            return

        # 2. API: Ziskanie dat
        if path == '/api/data':
            try:
                data = STORE.read()
                self.send_json(data)
            except Exception as e:
                self.send_json({ "error": f"Error reading data: {str(e)}", "projects": [], "timestamp": 0 })
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
                result = STORE.write(data)
                self.send_json(result)
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

    args = parse_cli_args()
    
    # Automatické generovanie certifikátov pre HTTPS
    if args.https:
        cert_path = os.path.abspath(args.certfile)
        key_path = os.path.abspath(args.keyfile)
        cert_dir = os.path.dirname(cert_path)
        
        if not os.path.exists(cert_dir):
            os.makedirs(cert_dir)
            
        if not os.path.exists(cert_path) or not os.path.exists(key_path):
            print("SSL certifikáty chýbajú. Pokúšam sa o automatické vygenerovanie...")
            try:
                import subprocess
                subprocess.run([
                    'openssl', 'req', '-x509', '-newkey', 'rsa:2048', 
                    '-keyout', key_path, '-out', cert_path, 
                    '-days', '365', '-nodes', '-subj', '/CN=localhost'
                ], check=True)
                print("Certifikáty úspešne vygenerované.")
            except Exception as e:
                print("!" * 50)
                print("CHYBA: Nepodarilo sa automaticky vygenerovať certifikáty.")
                print("Uistite sa, že máte nainštalovaný OpenSSL, alebo certifikáty vytvorte ručne.")
                print("!" * 50)
                # Pokračujeme bez HTTPS ak generovanie zlyhalo a súbory neexistujú
                args.https = False

    PORT = int(args.port)
    BIND_HOST = args.host
    SERVER_SCHEME = 'https' if args.https else 'http'

    try:
        server = create_server_with_retry(BIND_HOST, PORT, AppHandler)
    except OSError as exc:
        logger.error("Server sa nepodarilo spustit na porte %s: %s", PORT, exc)
        raise SystemExit(1)

    if args.https:
        cert_path = os.path.abspath(args.certfile)
        key_path = os.path.abspath(args.keyfile)

        if not os.path.exists(cert_path):
            logger.error("TLS certifikát neexistuje: %s", cert_path)
            raise SystemExit(1)
        if not os.path.exists(key_path):
            logger.error("TLS privátny kľúč neexistuje: %s", key_path)
            raise SystemExit(1)

        try:
            tls_context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
            tls_context.load_cert_chain(certfile=cert_path, keyfile=key_path)
            server.socket = tls_context.wrap_socket(server.socket, server_side=True)
        except Exception as exc:
            logger.error("Nepodarilo sa zapnúť HTTPS: %s", exc)
            raise SystemExit(1)

    print("=" * 50)
    print("  ProjectTracker Server")
    print("=" * 50)
    print(f"  Desktop: {SERVER_SCHEME}://localhost:{PORT}/desktop/")
    print(f"  Mobile:  {SERVER_SCHEME}://localhost:{PORT}/mobile/")
    print(f"  LAN:     {build_sync_base_url()}/")
    if args.https:
        print(f"  TLS cert: {os.path.abspath(args.certfile)}")
        print(f"  TLS key:  {os.path.abspath(args.keyfile)}")
    else:
        print("  Poznamka: iPhone PWA sync vyzaduje HTTPS (--https).")
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
