"""JSON over HTTP on the standard library (no extra dependencies). All game calls are POST with a JSON body.

Player API (CORS open: the client is not browser-cookie based, every call carries its own session token):
  GET  /api/health
  POST /api/register    {nickname, password, profile?}  -> session, balance (cents), meta ...
  POST /api/login       {nickname, password, profile?}
  POST /api/profile     {session, profile}
  POST /api/logout      {session}
  POST /api/state       {session, bet, lines?}
  POST /api/spin        {session, bet, lines?, free?}  bet = TOTAL bet = bet per line x lines (1..20, default 20); free = use a free spin (fixed bet, all 20 lines)
  POST /api/mode        {session, mode}               "demo" | "real" (TON wallet)
  POST /api/wallet      {session}                     deposit address + comment code, limits, own withdrawals
  POST /api/wallet/own_info {session}               balance and seqno of the player's own wallet (read from the chain)
  POST /api/wallet/send_boc {session, boc}          relays a deposit signed on the device (checked: own wallet, game address, own code)
  POST /api/wallet/register_own {session, address}  saves the address of the player's own wallet (made on his device; the words never leave it)
  POST /api/wallet/create {session}                 only with --server-created-wallets: the server makes the wallet (words cross the network)
  POST /api/wallet/accept|withdraw|cancel|history       age confirmation / withdrawal request / cancel / own wallet events
  POST /api/order       {session, order}
  POST /api/gamble      {session, pick}   pick 0 = left van, 1 = right van: double the last win or lose it (50/50)
  POST /api/collect     {session}         keep the last win (closes the double-up offer)
  POST /api/history     {session, limit?, before?}      -> own rounds (newest first)
  GET|POST /api/leaderboard  [{session?}]               -> top single wins (+ "me" with a session)
Admin API (header X-Admin-Token; NO CORS headers, so a foreign web page can not call it from a browser):
  POST /api/admin/login {password}; /accounts /account /status /adjust /reset_password /journal /round
  wallet cabinet: /wallet /withdrawals /withdraw_paid /withdraw_reject /deposits /assign_deposit /simulate_deposit /fund_own /scan /reconcile
  rewards: /grant_token /revoke_token /settings
Browser game: GET /play/ (the Godot web export from server/web/, also on phones; gzip, ETag); GET / redirects there
Admin panel page: GET /admin   (static files from server/admin/, strict Content-Security-Policy)
Errors: {"error": "..."} with 400 (refused), 401 (bad credentials), 403, 404, 409, 413, 429 (throttled).
"""
import gzip
import json
import urllib.parse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from .accounts import AccountError
from .game import GameError, GameService

MAX_BODY = 16 * 1024
WEB_DIR = Path(__file__).resolve().parents[1] / "web"       # the Godot web export (index.html, .js, .wasm, .pck ...)
WEB_TYPES = {".html": "text/html; charset=utf-8", ".js": "application/javascript; charset=utf-8", ".wasm": "application/wasm",
             ".pck": "application/octet-stream", ".png": "image/png", ".json": "application/json; charset=utf-8", ".ico": "image/x-icon"}
WEB_GZIP = {".html", ".js", ".wasm", ".pck", ".json"}
ADMIN_DIR = Path(__file__).resolve().parents[1] / "admin"
STATIC = {"/admin": ("index.html", "text/html; charset=utf-8"), "/admin/": ("index.html", "text/html; charset=utf-8"),
          "/admin/app.js": ("app.js", "application/javascript; charset=utf-8"),
          "/admin/admin.css": ("admin.css", "text/css; charset=utf-8")}
CSP = ("default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; "
       "base-uri 'none'; form-action 'none'; frame-ancestors 'none'")


def _int(v, what="value") -> int:
    if isinstance(v, bool) or not isinstance(v, int):
        raise GameError(f"{what} must be an integer")
    return v


def _opt_int(v, what):
    return None if v is None else _int(v, what)


def _bool(v, what="value") -> bool:
    if not isinstance(v, bool):
        raise GameError(f"{what} must be true or false")
    return v


def make_handler(service: GameService, trust_proxy: bool = False, web_dir: Path = None):
    web_dir = Path(web_dir) if web_dir is not None else WEB_DIR
    gz_cache = {}                                               # (name, mtime, size) -> compressed bytes (the big files are packed once)

    class Handler(BaseHTTPRequestHandler):
        protocol_version = "HTTP/1.1"

        def log_message(self, *args):        # keep the console quiet
            pass

        def _send(self, code: int, payload: dict, cors=True, admin=False) -> None:
            body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
            self.send_response(code)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.send_header("X-Content-Type-Options", "nosniff")
            self.send_header("Cache-Control", "no-store")         # nothing is cacheable (a new wallet's recovery words travel in one answer)
            if cors:
                self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(body)

        def _send_file(self, name: str, ctype: str) -> None:
            path = ADMIN_DIR / name
            if not path.is_file():
                self._send(404, {"error": "not found"}, cors=False)
                return
            body = path.read_bytes()
            self.send_response(200)
            self.send_header("Content-Type", ctype)
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Content-Security-Policy", CSP)
            self.send_header("X-Content-Type-Options", "nosniff")
            self.send_header("X-Frame-Options", "DENY")
            self.send_header("Referrer-Policy", "no-referrer")
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(body)

        def _send_web(self, name: str) -> None:
            """One file of the browser build. Only a plain file name directly inside web_dir is served (no folders, no '..')."""
            ext = Path(name).suffix.lower()
            path = web_dir / name
            if not name or "/" in name or "\\" in name or name.startswith(".") or ext not in WEB_TYPES or not path.is_file():
                self._send(404, {"error": "not found"}, cors=False)
                return
            st = path.stat()
            etag = '"%x-%x"' % (int(st.st_mtime), st.st_size)
            if self.headers.get("If-None-Match") == etag:
                self.send_response(304)
                self.send_header("ETag", etag)
                self.send_header("Content-Length", "0")
                self.end_headers()
                return
            body = path.read_bytes()
            packed = False
            if ext in WEB_GZIP and "gzip" in (self.headers.get("Accept-Encoding") or "") and len(body) > 1024:
                key = (name, st.st_mtime, st.st_size)
                if key not in gz_cache:
                    if len(gz_cache) > 16:
                        gz_cache.clear()
                    gz_cache[key] = gzip.compress(body, 6)
                body = gz_cache[key]
                packed = True
            self.send_response(200)
            self.send_header("Content-Type", WEB_TYPES[ext])
            self.send_header("Content-Length", str(len(body)))
            if packed:
                self.send_header("Content-Encoding", "gzip")
            self.send_header("Vary", "Accept-Encoding")
            self.send_header("ETag", etag)
            self.send_header("Cache-Control", "no-cache")           # revalidate: a new build is picked up at once, an unchanged one costs a 304
            self.send_header("X-Content-Type-Options", "nosniff")
            self.end_headers()
            self.wfile.write(body)

        def _client(self) -> str:
            """The address the throttles count. Behind a reverse proxy (the host's HTTPS front) the socket peer is always the proxy, so with
            trust_proxy the LAST entry of X-Forwarded-For is used: it is the one the nearest proxy appended itself (earlier ones can be forged)."""
            if trust_proxy:
                fwd = (self.headers.get("X-Forwarded-For") or "").split(",")[-1].strip()
                if 0 < len(fwd) <= 45 and all(c in "0123456789abcdefABCDEF:." for c in fwd):
                    return fwd
            return self.client_address[0]

        def do_OPTIONS(self):
            if self.path.startswith("/api/admin") or self.path.startswith("/admin"):
                self._send(403, {"error": "forbidden"}, cors=False)
                return
            self.send_response(204)
            self.send_header("Access-Control-Allow-Origin", "*")
            self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
            self.send_header("Access-Control-Allow-Headers", "Content-Type")
            self.send_header("Content-Length", "0")
            self.end_headers()

        def do_GET(self):
            path = self.path.split("?", 1)[0]
            if path == "/api/health":
                self._send(200, {"ok": True})
            elif path == "/api/leaderboard":
                q = urllib.parse.parse_qs(self.path.split("?", 1)[1]) if "?" in self.path else {}
                self._send(200, service.leaderboard(mode=(q.get("mode") or [None])[0]))
            elif path in STATIC:
                self._send_file(*STATIC[path])
            elif path == "/":
                self.send_response(302)
                self.send_header("Location", "/play/")
                self.send_header("Content-Length", "0")
                self.end_headers()
            elif path in ("/play", "/play/"):
                self._send_web("index.html")
            elif path.startswith("/play/"):
                self._send_web(urllib.parse.unquote(path[6:]))
            else:
                self._send(404, {"error": "not found"})

        def do_POST(self):
            try:
                length = int(self.headers.get("Content-Length") or 0)
            except ValueError:
                length = -1
            if length < 0 or length > MAX_BODY:
                self._send(413 if length > 0 else 400, {"error": "bad body size"})
                return
            try:
                body = json.loads(self.rfile.read(length) or b"{}")
                if not isinstance(body, dict):
                    raise ValueError
            except ValueError:
                self._send(400, {"error": "body must be a JSON object"})
                return
            path = self.path.split("?", 1)[0]
            is_admin = path.startswith("/api/admin/")
            try:
                out = self._route_admin(path, body) if is_admin else self._route_player(path, body)
            except AccountError as e:
                self._send(e.code, {"error": str(e)}, cors=not is_admin, admin=is_admin)
                return
            except GameError as e:
                self._send(400, {"error": str(e)}, cors=not is_admin, admin=is_admin)
                return
            if out is None:
                self._send(404, {"error": "not found"}, cors=not is_admin)
                return
            self._send(200, out, cors=not is_admin, admin=is_admin)

        def _route_player(self, path, b):
            if path == "/api/register":
                return service.register(b.get("nickname"), b.get("password"), b.get("profile"), self._client())
            if path == "/api/login":
                return service.login(b.get("nickname"), b.get("password"), b.get("profile"), self._client())
            if path == "/api/profile":
                return service.set_profile(b.get("session"), b.get("profile"))
            if path == "/api/logout":
                return service.logout(b.get("session"))
            if path == "/api/state":
                return service.state(b.get("session"), _int(b.get("bet"), "bet"), _int(b.get("lines", 20), "lines"))
            if path == "/api/spin":
                return service.spin(b.get("session"), _int(b.get("bet"), "bet"), _bool(b.get("free", False), "free"), _int(b.get("lines", 20), "lines"))
            if path == "/api/mode":
                return service.set_mode(b.get("session"), b.get("mode"))
            if path == "/api/wallet":
                return service.wallet_info(b.get("session"))
            if path == "/api/wallet/accept":
                return service.wallet_accept(b.get("session"), b.get("accept"))
            if path == "/api/wallet/own_info":
                return service.wallet_own_info(b.get("session"))
            if path == "/api/wallet/send_boc":
                return service.wallet_send_boc(b.get("session"), b.get("boc"))
            if path == "/api/wallet/register_own":
                return service.wallet_register_own(b.get("session"), b.get("address"))
            if path == "/api/wallet/create":
                return service.wallet_create(b.get("session"))
            if path == "/api/wallet/withdraw":
                return service.wallet_withdraw(b.get("session"), b.get("amount_cents"), b.get("address"))
            if path == "/api/wallet/cancel":
                return service.wallet_cancel(b.get("session"), b.get("id"))
            if path == "/api/wallet/history":
                return service.wallet_history(b.get("session"), _int(b.get("limit", 30), "limit"))
            if path == "/api/order":
                return service.choose_order(b.get("session"), b.get("order"))
            if path == "/api/gamble":
                return service.gamble(b.get("session"), b.get("pick"))
            if path == "/api/collect":
                return service.collect(b.get("session"))
            if path == "/api/history":
                return service.history(b.get("session"), _int(b.get("limit", 20), "limit"), _opt_int(b.get("before"), "before"))
            if path == "/api/leaderboard":
                return service.leaderboard(b.get("session"), mode=b.get("mode"))
            return None

        def _route_admin(self, path, b):
            if path == "/api/admin/login":
                return service.admin_login(b.get("password"), self._client())
            token = self.headers.get("X-Admin-Token", "")
            if path == "/api/admin/accounts":
                return service.admin_accounts(token, b.get("query", ""), _int(b.get("limit", 200), "limit"))
            if path == "/api/admin/account":
                return service.admin_account(token, b.get("key"))
            if path == "/api/admin/status":
                return service.admin_set_status(token, b.get("key"), b.get("status"), b.get("reason"))
            if path == "/api/admin/adjust":
                return service.admin_adjust(token, b.get("key"), b.get("delta_cents"), b.get("reason"), b.get("wallet", "demo"))
            if path == "/api/admin/wallet":
                return service.admin_wallet(token)
            if path == "/api/admin/withdrawals":
                return service.admin_withdrawals(token, b.get("status"), _int(b.get("limit", 100), "limit"))
            if path == "/api/admin/withdraw_paid":
                return service.admin_withdraw_paid(token, b.get("id"), b.get("tx_hash"), b.get("note", ""))
            if path == "/api/admin/withdraw_reject":
                return service.admin_withdraw_reject(token, b.get("id"), b.get("reason"))
            if path == "/api/admin/deposits":
                return service.admin_deposits(token, _int(b.get("limit", 100), "limit"))
            if path == "/api/admin/assign_deposit":
                return service.admin_assign_deposit(token, b.get("tx"), b.get("key"), b.get("reason"))
            if path == "/api/admin/fund_own":
                return service.admin_fund_own(token, b.get("key"), b.get("amount_cents"))
            if path == "/api/admin/simulate_deposit":
                return service.admin_simulate_deposit(token, b.get("key"), b.get("amount_cents"))
            if path == "/api/admin/scan":
                return service.admin_scan(token)
            if path == "/api/admin/reconcile":
                return service.admin_reconcile(token)
            if path == "/api/admin/grant_token":
                return service.admin_grant_token(token, b.get("key"), b.get("wallet"), b.get("bet_cents"), b.get("reason"))
            if path == "/api/admin/revoke_token":
                return service.admin_revoke_token(token, b.get("key"), b.get("wallet"), b.get("index"), b.get("reason"))
            if path == "/api/admin/settings":
                rw, gm = b.get("rewards"), b.get("gamble")
                return service.admin_settings(token, rw, gm)
            if path == "/api/admin/reset_password":
                return service.admin_reset_password(token, b.get("key"), b.get("reason"))
            if path == "/api/admin/journal":
                kinds = b.get("kinds")
                if kinds is not None and not (isinstance(kinds, list) and all(isinstance(k, str) for k in kinds)):
                    raise GameError("kinds must be a list of strings")
                return service.admin_journal(token, b.get("player"), kinds, _opt_int(b.get("min_win"), "min_win"),
                                             _opt_int(b.get("before"), "before"), _int(b.get("limit", 50), "limit"))
            if path == "/api/admin/round":
                return service.admin_round(token, b.get("id"))
            return None

    return Handler


def make_server(service: GameService, host: str = "127.0.0.1", port: int = 8765, trust_proxy: bool = False,
                web_dir: Path = None) -> ThreadingHTTPServer:
    return ThreadingHTTPServer((host, port), make_handler(service, trust_proxy, web_dir))
