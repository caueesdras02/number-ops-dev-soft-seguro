"""Configuração central (caminhos, tempos de sessão e limites de segurança)."""
from __future__ import annotations

import os
import secrets
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = Path(os.environ.get("NUMBER_OPS_DATA_DIR", ROOT_DIR / "data"))
DB_PATH = DATA_DIR / "number_ops.db"
BACKUP_DIR = DATA_DIR / "backups"
SECRET_PATH = DATA_DIR / "secret.key"

# Modo navegador (GitHub Pages): este mesmo backend roda no Pyodide, dentro de um
# Web Worker, sem servidor (ver backend/browser_app.py).
BROWSER_MODE = os.environ.get("NUMBER_OPS_BROWSER") == "1"

# Arquivos estáticos que o servidor pode entregar. Qualquer coisa fora disso
# (backend/, data/, tests/...) nunca é servida, mesmo que o caminho exista.
STATIC_ROOT_FILES = {"/index.html", "/manifest.json"}
STATIC_DIR = ROOT_DIR / "src"
STATIC_CONTENT_TYPES = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".json": "application/json; charset=utf-8",
    ".ico": "image/x-icon",
}

SESSION_COOKIE = "nops_session"
SESSION_IDLE_SECONDS = 4 * 60 * 60        # expira após 4h sem uso
SESSION_ABSOLUTE_SECONDS = 12 * 60 * 60   # e nunca dura mais que 12h

PASSWORD_ITERATIONS = 600_000             # PBKDF2-SHA256 (recomendação OWASP)

LOGIN_MAX_FAILURES = 5                    # por e-mail, dentro da janela
LOGIN_IP_MAX_FAILURES = 20                # por IP, dentro da janela
LOGIN_WINDOW_SECONDS = 15 * 60
SIGNUP_MAX_PER_IP = 5                     # solicitações de acesso por IP por hora
SIGNUP_WINDOW_SECONDS = 60 * 60

MAX_BODY_BYTES = 2 * 1024 * 1024
MAX_RESTORE_BODY_BYTES = 25 * 1024 * 1024


def ensure_data_dir() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    BACKUP_DIR.mkdir(parents=True, exist_ok=True)


def load_secret() -> bytes:
    """Chave usada para o HMAC do CPF. Gerada uma única vez e guardada em data/secret.key.

    Se este arquivo for perdido, os CPFs já cadastrados deixam de ser reconhecidos
    (não dá para checar duplicidade), por isso ele deve acompanhar os backups do banco.
    """
    ensure_data_dir()
    if not SECRET_PATH.exists():
        SECRET_PATH.write_text(secrets.token_hex(32), encoding="utf-8")
        try:
            os.chmod(SECRET_PATH, 0o600)
        except OSError:
            pass
    return bytes.fromhex(SECRET_PATH.read_text(encoding="utf-8").strip())
