"""Servidor HTTP do Number Ops (API JSON + arquivos estáticos do frontend)."""
from __future__ import annotations

import json
import re
import sys
import traceback
from datetime import datetime
from http import HTTPStatus
from http.cookies import SimpleCookie
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any, Callable
from urllib.parse import unquote, urlsplit

from . import accounts, config, database, state
from .errors import ApiError, Forbidden, NotFound, Unauthorized, ValidationError

SECURITY_HEADERS = {
    "Content-Security-Policy": (
        "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; "
        "connect-src 'self'; font-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'"
    ),
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "no-referrer",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=()",
    "Cross-Origin-Opener-Policy": "same-origin",
}

# Rotas que podem ser chamadas sem sessão (mas continuam exigindo o cabeçalho anti-CSRF).
PUBLIC_POSTS = {"/api/auth/login", "/api/auth/setup", "/api/signup-requests"}

Route = tuple[str, re.Pattern[str], Callable[..., Any], bool]
ROUTES: list[Route] = []


def route(method: str, pattern: str, *, auth: bool = True):
    def register(handler: Callable[..., Any]) -> Callable[..., Any]:
        ROUTES.append((method, re.compile(f"^{pattern}$"), handler, auth))
        return handler
    return register


class Request:
    def __init__(self, handler: "Handler", conn, session: dict | None, body: Any):
        self.handler = handler
        self.conn = conn
        self.session = session
        self.body = body

    @property
    def profile(self) -> dict:
        if not self.session:
            raise Unauthorized("Sessão expirada. Faça login novamente.")
        return self.session["profile"]

    @property
    def ip(self) -> str:
        return self.handler.client_address[0]


# --------------------------------------------------------------------------
# Autenticação
# --------------------------------------------------------------------------

def _session_payload(req: Request) -> dict:
    if not req.session:
        return {"authenticated": False, "needsSetup": not accounts.has_any_profile(req.conn)}
    profile = req.session["profile"]
    payload = {"authenticated": True, "needsSetup": False, "csrfToken": req.session["csrf_token"], "profile": accounts.public_profile(profile)}
    if profile["access_level"] == "MASTER":
        payload["pendingSignupRequests"] = accounts.pending_signup_count(req.conn)
    return payload


@route("GET", "/api/auth/session", auth=False)
def get_session(req: Request):
    return _session_payload(req)


def _start_session(req: Request, profile: dict) -> dict:
    token, _csrf = accounts.create_session(req.conn, profile["id"], req.ip, req.handler.headers.get("User-Agent", ""))
    req.handler.set_session_cookie(token, config.SESSION_ABSOLUTE_SECONDS)
    req.session = accounts.get_session(req.conn, token)
    return _session_payload(req)


@route("POST", "/api/auth/setup", auth=False)
def setup(req: Request):
    return _start_session(req, accounts.setup_master(req.conn, req.body))


@route("POST", "/api/auth/login", auth=False)
def login(req: Request):
    if req.session:
        accounts.destroy_session(req.conn, req.handler.session_token())
    return _start_session(req, accounts.login(req.conn, req.body, req.ip))


@route("POST", "/api/auth/logout", auth=False)
def logout(req: Request):
    accounts.destroy_session(req.conn, req.handler.session_token())
    req.handler.set_session_cookie("", 0)
    return {"ok": True}


@route("POST", "/api/auth/change-password")
def change_password(req: Request):
    accounts.change_password(req.conn, req.profile, req.body, req.session["token_hash"])
    return {"ok": True}


# --------------------------------------------------------------------------
# Solicitações de acesso
# --------------------------------------------------------------------------

@route("POST", "/api/signup-requests", auth=False)
def create_signup_request(req: Request):
    accounts.create_signup_request(req.conn, req.body, req.ip)
    return {"ok": True}


@route("GET", "/api/signup-requests")
def list_signup_requests(req: Request):
    return {"requests": accounts.list_signup_requests(req.conn, req.profile)}


@route("GET", "/api/signup-requests/pending-count")
def pending_signup_count(req: Request):
    if req.profile["access_level"] != "MASTER":
        raise Forbidden("Somente MASTER pode ver solicitações de acesso.")
    return {"pending": accounts.pending_signup_count(req.conn)}


@route("POST", r"/api/signup-requests/(?P<request_id>[A-Za-z0-9_]+)/approve")
def approve_signup_request(req: Request, request_id: str):
    return {"profile": accounts.approve_signup_request(req.conn, req.profile, request_id, req.body)}


@route("POST", r"/api/signup-requests/(?P<request_id>[A-Za-z0-9_]+)/reject")
def reject_signup_request(req: Request, request_id: str):
    accounts.reject_signup_request(req.conn, req.profile, request_id, req.body)
    return {"ok": True}


# --------------------------------------------------------------------------
# Usuários, squads e auditoria
# --------------------------------------------------------------------------

@route("GET", "/api/profiles")
def list_profiles(req: Request):
    return {"profiles": accounts.list_profiles(req.conn, req.profile)}


@route("PATCH", r"/api/profiles/(?P<profile_id>[A-Za-z0-9_]+)")
def update_profile(req: Request, profile_id: str):
    return {"profile": accounts.update_profile(req.conn, req.profile, profile_id, req.body)}


@route("DELETE", r"/api/profiles/(?P<profile_id>[A-Za-z0-9_]+)")
def delete_profile(req: Request, profile_id: str):
    accounts.delete_profile(req.conn, req.profile, profile_id)
    return {"ok": True}


@route("POST", r"/api/profiles/(?P<profile_id>[A-Za-z0-9_]+)/reset-password")
def reset_password(req: Request, profile_id: str):
    return {"temporaryPassword": accounts.reset_password(req.conn, req.profile, profile_id)}


@route("GET", "/api/squads")
def list_squads(req: Request):
    req.profile  # exige sessão
    return {"squads": accounts.list_squads(req.conn)}


@route("GET", "/api/audit-logs")
def list_audit_logs(req: Request):
    return {"logs": accounts.list_audit_logs(req.conn, req.profile)}


# --------------------------------------------------------------------------
# Estado operacional
# --------------------------------------------------------------------------

@route("GET", "/api/state")
def get_state(req: Request):
    req.profile
    return {"state": state.load_state(req.conn)}


@route("POST", "/api/state/sync")
def sync_state(req: Request):
    changes = (req.body or {}).get("changes") if isinstance(req.body, dict) else None
    return {"applied": state.sync(req.conn, req.profile, changes)}


@route("POST", "/api/state/restore")
def restore_state(req: Request):
    if req.profile["access_level"] != "MASTER":
        raise Forbidden("Somente MASTER pode restaurar um backup.")
    snapshot = config.BACKUP_DIR / f"antes-da-restauracao-{datetime.now():%Y%m%d-%H%M%S}.db"
    database.backup_to(snapshot)
    body = req.body if isinstance(req.body, dict) else {}
    return {"summary": state.replace_all(req.conn, req.profile, body.get("state")), "safetyCopy": snapshot.name}


@route("DELETE", r"/api/records/(?P<collection>[A-Za-z]+)/(?P<record_id>[A-Za-z0-9_.:-]+)")
def hard_delete(req: Request, collection: str, record_id: str):
    state.hard_delete(req.conn, req.profile, collection, record_id)
    return {"ok": True}


# --------------------------------------------------------------------------
# Handler
# --------------------------------------------------------------------------

class Handler(BaseHTTPRequestHandler):
    server_version = "NumberOps"
    sys_version = ""

    def do_GET(self):  # noqa: N802
        self._dispatch("GET")

    def do_POST(self):  # noqa: N802
        self._dispatch("POST")

    def do_PATCH(self):  # noqa: N802
        self._dispatch("PATCH")

    def do_DELETE(self):  # noqa: N802
        self._dispatch("DELETE")

    def do_HEAD(self):  # noqa: N802
        self._send_json(HTTPStatus.METHOD_NOT_ALLOWED, {"error": "Método não suportado."})

    def do_OPTIONS(self):  # noqa: N802
        # Sem CORS: nenhuma outra origem pode chamar a API.
        self._send_json(HTTPStatus.METHOD_NOT_ALLOWED, {"error": "Método não suportado."})

    # -- helpers -----------------------------------------------------------

    def session_token(self) -> str | None:
        cookie = SimpleCookie()
        try:
            cookie.load(self.headers.get("Cookie", ""))
        except Exception:  # cookie malformado = sem sessão
            return None
        morsel = cookie.get(config.SESSION_COOKIE)
        return morsel.value if morsel else None

    def set_session_cookie(self, token: str, max_age: int) -> None:
        self._pending_cookie = f"{config.SESSION_COOKIE}={token}; Path=/; HttpOnly; SameSite=Strict; Max-Age={max_age}"

    def _dispatch(self, method: str) -> None:
        self._pending_cookie = None
        path = urlsplit(self.path).path
        if not path.startswith("/api/"):
            if method == "GET":
                self._serve_static(path)
            else:
                self._send_json(HTTPStatus.METHOD_NOT_ALLOWED, {"error": "Método não suportado."})
            return
        conn = None
        try:
            for route_method, pattern, handler, needs_auth in ROUTES:
                match = pattern.match(path)
                if match and route_method == method:
                    break
            else:
                raise NotFound("Rota não encontrada.")
            if method != "GET":
                self._check_request_origin()
            body = self._read_body(path) if method in ("POST", "PATCH") else None
            conn = database.connect()
            session = accounts.get_session(conn, self.session_token())
            if needs_auth and not session:
                raise Unauthorized("Sessão expirada. Faça login novamente.")
            if method != "GET" and session and path not in PUBLIC_POSTS and path != "/api/auth/logout":
                if self.headers.get("X-CSRF-Token") != session["csrf_token"]:
                    raise Forbidden("Token de segurança inválido. Recarregue a página.")
            if session and session["profile"]["must_change_password"] and path not in ("/api/auth/session", "/api/auth/change-password", "/api/auth/logout"):
                raise Forbidden("Defina uma nova senha para continuar.")
            result = handler(Request(self, conn, session, body), **match.groupdict())
            self._send_json(HTTPStatus.OK, result)
        except ApiError as error:
            self._send_json(error.status, {"error": str(error)})
        except Exception:  # erro inesperado: detalhe só no terminal, nunca para o navegador
            traceback.print_exc(file=sys.stderr)
            self._send_json(HTTPStatus.INTERNAL_SERVER_ERROR, {"error": "Erro interno no servidor."})
        finally:
            if conn is not None:
                conn.close()

    def _check_request_origin(self) -> None:
        """Defesa contra CSRF: cabeçalho próprio (força preflight entre origens) + Origin igual ao Host."""
        if self.headers.get("X-Requested-With") != "number-ops":
            raise Forbidden("Requisição recusada.")
        origin = self.headers.get("Origin")
        if origin and urlsplit(origin).netloc != self.headers.get("Host"):
            raise Forbidden("Origem da requisição não permitida.")

    def _read_body(self, path: str) -> Any:
        limit = config.MAX_RESTORE_BODY_BYTES if path == "/api/state/restore" else config.MAX_BODY_BYTES
        try:
            length = int(self.headers.get("Content-Length") or 0)
        except ValueError as exc:
            raise ValidationError("Tamanho de requisição inválido.") from exc
        if length > limit:
            raise ApiError("Requisição grande demais.", 413)
        if length == 0:
            return None
        if not (self.headers.get("Content-Type") or "").startswith("application/json"):
            raise ApiError("Envie os dados como JSON.", 415)
        try:
            return json.loads(self.rfile.read(length).decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError) as exc:
            raise ValidationError("JSON inválido.") from exc

    def _common_headers(self) -> None:
        for name, value in SECURITY_HEADERS.items():
            self.send_header(name, value)

    def _send_json(self, status: int, payload: Any) -> None:
        data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self._common_headers()
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(data)))
        if getattr(self, "_pending_cookie", None):
            self.send_header("Set-Cookie", self._pending_cookie)
        self.end_headers()
        self.wfile.write(data)

    def _serve_static(self, path: str) -> None:
        path = unquote(path)
        if path == "/":
            path = "/index.html"
        if path in config.STATIC_ROOT_FILES:
            file_path = config.ROOT_DIR / path.lstrip("/")
        elif path.startswith("/src/"):
            file_path = (config.ROOT_DIR / path.lstrip("/")).resolve()
            if not file_path.is_relative_to(config.STATIC_DIR.resolve()):
                file_path = None
        else:
            file_path = None
        content_type = config.STATIC_CONTENT_TYPES.get(Path(path).suffix.lower()) if file_path else None
        if not file_path or not content_type or not file_path.is_file():
            self._send_json(HTTPStatus.NOT_FOUND, {"error": "Arquivo não encontrado."})
            return
        data = file_path.read_bytes()
        self.send_response(HTTPStatus.OK)
        self._common_headers()
        self.send_header("Content-Type", content_type)
        self.send_header("Cache-Control", "no-cache")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def log_message(self, format: str, *args: Any) -> None:  # noqa: A002
        sys.stderr.write(f"[{datetime.now():%H:%M:%S}] {self.address_string()} {format % args}\n")


def create_server(host: str, port: int) -> ThreadingHTTPServer:
    server = ThreadingHTTPServer((host, port), Handler)
    server.daemon_threads = True
    return server
