"""Ponte do backend para o navegador (modo GitHub Pages).

No GitHub Pages não existe servidor: este backend Python roda no próprio navegador
(Pyodide, dentro de um Web Worker — src/js/infra/python-worker.js). O worker entrega
cada chamada da API a handle(), que passa pelas MESMAS rotas e checagens do
http_app.py (sessão, CSRF, troca de senha obrigatória, permissões). Só a troca de
bytes pela rede é substituída; o banco SQLite fica em /data, salvo no IndexedDB.
"""
from __future__ import annotations

import io
import json
from typing import Any

from . import accounts, config, database, demo, security
from .http_app import Handler


class BrowserHandler(Handler):
    """Handler sem socket: recebe a requisição já montada e guarda a resposta."""

    def __init__(self, method: str, path: str, headers: dict[str, str], body: str):
        data = (body or "").encode("utf-8")
        self.command = method
        self.path = path
        self.headers = {**headers, "Content-Length": str(len(data))}
        self.client_address = ("navegador", 0)
        self.rfile = io.BytesIO(data)
        self.response: dict[str, Any] | None = None

    def _send_json(self, status: int, payload: Any) -> None:
        self.response = {"status": int(status), "body": payload, "setCookie": getattr(self, "_pending_cookie", None)}


def boot() -> bool:
    """Prepara o banco. Na primeira abertura insere os dados fictícios de demonstração."""
    first_run = not config.DB_PATH.exists()
    database.initialize()
    config.load_secret()
    conn = database.connect()
    try:
        accounts.prune_sessions(conn)
        security.throttle_prune(conn)
        return demo.seed(conn) if first_run else False
    finally:
        conn.close()


def handle(method: str, path: str, headers_json: str, body: str) -> str:
    handler = BrowserHandler(method, path, json.loads(headers_json), body)
    handler._dispatch(method)
    return json.dumps(handler.response, ensure_ascii=False)
