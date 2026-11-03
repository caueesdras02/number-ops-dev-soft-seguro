"""Primitivas de segurança: senhas, CPF, e-mail, tokens e limitação de tentativas."""
from __future__ import annotations

import base64
import hashlib
import hmac
import re
import secrets
import sqlite3
import string
import unicodedata
from datetime import datetime, timedelta, timezone

from . import config

# --------------------------------------------------------------------------
# Senhas
# --------------------------------------------------------------------------

PASSWORD_MIN_LENGTH = 8
PASSWORD_MAX_LENGTH = 128
SPECIAL_CHARACTERS = set(string.punctuation)

# Senhas muito usadas que passariam nas regras de composição.
COMMON_PASSWORDS = {
    "senha@123", "senha#123", "senha123!", "senha@1234", "admin@123", "admin@1234",
    "password1!", "password@1", "password@123", "p@ssw0rd", "p@ssword1", "qwerty@123",
    "mudar@123", "trocar@123", "brasil@123", "abc@1234", "abcd@1234", "teste@123",
    "teste@1234", "welcome1!", "number@123", "numberops@1", "numberops@123",
}


def password_policy_errors(password: str, *, name: str = "", email: str = "") -> list[str]:
    """Lista de regras que a senha não cumpre (vazia = senha aceita).

    As mesmas regras são exibidas e checadas no navegador
    (src/js/models/password-policy.js); aqui é a validação que vale.
    """
    errors: list[str] = []
    if not isinstance(password, str):
        return ["Informe uma senha."]
    if len(password) < PASSWORD_MIN_LENGTH:
        errors.append(f"A senha deve ter pelo menos {PASSWORD_MIN_LENGTH} caracteres.")
    if len(password) > PASSWORD_MAX_LENGTH:
        errors.append(f"A senha deve ter no máximo {PASSWORD_MAX_LENGTH} caracteres.")
    if not re.search(r"[A-Z]", password):
        errors.append("A senha deve ter pelo menos uma letra maiúscula.")
    if not re.search(r"[a-z]", password):
        errors.append("A senha deve ter pelo menos uma letra minúscula.")
    if not re.search(r"[0-9]", password):
        errors.append("A senha deve ter pelo menos um número.")
    if not any(char in SPECIAL_CHARACTERS for char in password):
        errors.append("A senha deve ter pelo menos um caractere especial (ex.: ! @ # $ %).")
    if any(char.isspace() for char in password):
        errors.append("A senha não pode conter espaços.")
    if re.search(r"(.)\1\1", password):
        errors.append("A senha não pode repetir o mesmo caractere 3 vezes seguidas.")
    lowered = _fold(password)
    if lowered in COMMON_PASSWORDS:
        errors.append("Esta senha é muito comum. Escolha outra.")
    for fragment in _personal_fragments(name, email):
        if fragment in lowered:
            errors.append("A senha não pode conter seu nome ou e-mail.")
            break
    return errors


def _fold(value: str) -> str:
    normalized = unicodedata.normalize("NFD", value or "")
    return "".join(char for char in normalized if not unicodedata.combining(char)).lower()


def _personal_fragments(name: str, email: str) -> list[str]:
    fragments = [part for part in re.split(r"\s+", _fold(name)) if len(part) >= 4]
    local_part = _fold(email).split("@", 1)[0]
    if len(local_part) >= 4:
        fragments.append(local_part)
    return fragments


def pbkdf2_sha256(password: bytes, salt: bytes, iterations: int) -> bytes:
    """PBKDF2-HMAC-SHA256: usa a versão nativa (OpenSSL) quando existe.

    O Python do navegador (Pyodide, modo GitHub Pages) não traz OpenSSL, então lá
    entra a implementação do RFC 8018 abaixo, que gera exatamente o mesmo resultado.
    """
    if hasattr(hashlib, "pbkdf2_hmac"):
        return hashlib.pbkdf2_hmac("sha256", password, salt, iterations)
    return _pbkdf2_sha256_pure(password, salt, iterations)


def _pbkdf2_sha256_pure(password: bytes, salt: bytes, iterations: int) -> bytes:
    inner, outer = hashlib.sha256(), hashlib.sha256()
    key = password if len(password) <= inner.block_size else hashlib.sha256(password).digest()
    key = key.ljust(inner.block_size, b"\x00")
    inner.update(bytes(byte ^ 0x36 for byte in key))
    outer.update(bytes(byte ^ 0x5C for byte in key))

    def prf(message: bytes) -> bytes:
        inner_copy, outer_copy = inner.copy(), outer.copy()
        inner_copy.update(message)
        outer_copy.update(inner_copy.digest())
        return outer_copy.digest()

    block = prf(salt + (1).to_bytes(4, "big"))
    result = int.from_bytes(block, "big")
    for _ in range(iterations - 1):
        block = prf(block)
        result ^= int.from_bytes(block, "big")
    return result.to_bytes(len(block), "big")


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = pbkdf2_sha256(password.encode("utf-8"), salt, config.PASSWORD_ITERATIONS)
    return "pbkdf2_sha256${}${}${}".format(
        config.PASSWORD_ITERATIONS,
        base64.b64encode(salt).decode("ascii"),
        base64.b64encode(digest).decode("ascii"),
    )


def verify_password(password: str, stored: str) -> bool:
    try:
        algorithm, iterations, salt_b64, digest_b64 = stored.split("$")
        if algorithm != "pbkdf2_sha256":
            return False
        salt = base64.b64decode(salt_b64)
        expected = base64.b64decode(digest_b64)
        digest = pbkdf2_sha256(password.encode("utf-8"), salt, int(iterations))
    except (ValueError, TypeError):
        return False
    return hmac.compare_digest(digest, expected)


# Hash "falso" para gastar o mesmo tempo quando o e-mail não existe: evita
# descobrir quais e-mails estão cadastrados medindo o tempo de resposta.
_DUMMY_HASH = None


def burn_password_check(password: str) -> None:
    global _DUMMY_HASH
    if _DUMMY_HASH is None:
        _DUMMY_HASH = hash_password(secrets.token_urlsafe(16))
    verify_password(password, _DUMMY_HASH)


def generate_temporary_password() -> str:
    """Senha temporária forte (usada quando o MASTER redefine o acesso de alguém)."""
    alphabet = string.ascii_letters + string.digits + "!@#$%&*?"
    while True:
        candidate = "".join(secrets.choice(alphabet) for _ in range(14))
        if not password_policy_errors(candidate):
            return candidate


# --------------------------------------------------------------------------
# CPF
# --------------------------------------------------------------------------

def normalize_cpf(value: str) -> str:
    return re.sub(r"\D", "", str(value or ""))


def is_valid_cpf(value: str) -> bool:
    cpf = normalize_cpf(value)
    if len(cpf) != 11 or cpf == cpf[0] * 11:
        return False
    for size in (9, 10):
        total = sum(int(cpf[i]) * (size + 1 - i) for i in range(size))
        digit = (total * 10) % 11
        if digit == 10:
            digit = 0
        if digit != int(cpf[size]):
            return False
    return True


def cpf_hash(value: str) -> str:
    """HMAC do CPF: permite detectar duplicidade sem guardar o número em texto puro."""
    return hmac.new(config.load_secret(), normalize_cpf(value).encode("ascii"), hashlib.sha256).hexdigest()


def mask_cpf(value: str) -> str:
    cpf = normalize_cpf(value)
    return f"***.{cpf[3:6]}.{cpf[6:9]}-**"


# --------------------------------------------------------------------------
# Campos de cadastro
# --------------------------------------------------------------------------

EMAIL_RE = re.compile(r"^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$")
JOB_TITLES = {"ANALYST", "ACCOUNT_MANAGER", "OTHER"}
ACCESS_LEVELS = ("MASTER", "ADMIN", "USER", "VIEWER")


def normalize_email(value: str) -> str:
    return str(value or "").strip().lower()


def is_valid_email(value: str) -> bool:
    return len(value) <= 254 and bool(EMAIL_RE.match(value))


def clean_name(value: str) -> str:
    return re.sub(r"\s+", " ", str(value or "")).strip()


# --------------------------------------------------------------------------
# Tokens
# --------------------------------------------------------------------------

def new_token() -> str:
    return secrets.token_urlsafe(32)


def token_digest(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def new_id(prefix: str) -> str:
    return f"{prefix}_{secrets.token_hex(16)}"


# --------------------------------------------------------------------------
# Limitação de tentativas (força bruta / spam)
# --------------------------------------------------------------------------

def _iso(moment: datetime) -> str:
    return moment.isoformat(timespec="milliseconds").replace("+00:00", "Z")


def throttle_count(conn: sqlite3.Connection, key: str, window_seconds: int) -> int:
    since = _iso(datetime.now(timezone.utc) - timedelta(seconds=window_seconds))
    return conn.execute("SELECT count(*) FROM throttle_events WHERE key = ? AND at >= ?", (key, since)).fetchone()[0]


def throttle_hit(conn: sqlite3.Connection, key: str) -> None:
    conn.execute("INSERT INTO throttle_events(key, at) VALUES (?, ?)", (key, _iso(datetime.now(timezone.utc))))


def throttle_clear(conn: sqlite3.Connection, key: str) -> None:
    conn.execute("DELETE FROM throttle_events WHERE key = ?", (key,))


def throttle_prune(conn: sqlite3.Connection, older_than_seconds: int = 24 * 60 * 60) -> None:
    since = _iso(datetime.now(timezone.utc) - timedelta(seconds=older_than_seconds))
    conn.execute("DELETE FROM throttle_events WHERE at < ?", (since,))
